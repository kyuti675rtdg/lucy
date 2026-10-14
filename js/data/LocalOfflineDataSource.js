/* Project Lucy — IndexedDB-backed offline data source.
 * Implements LucyDataSource. Database `lucy-db`, version 1, with one object
 * store per domain (keyPath 'id', autoIncrement false):
 *   users, videos, comments, follows, likes, bookmarks, commentLikes,
 *   notifications, threads, messages, mediaBlobs, meta
 * All methods are promise-based. Seeded videos carry `file` (mp4 path) and
 * `poster` (image path); user-posted videos carry `blobId`/`posterId` that
 * resolve through the in-memory blob-URL map.
 */
import LucyDataSource from './LucyDataSource.js';

const DB_NAME = 'lucy-db';
const DB_VERSION = 1;
const STORES = [
  'users', 'videos', 'comments', 'follows', 'likes', 'bookmarks',
  'commentLikes', 'notifications', 'threads', 'messages', 'mediaBlobs', 'meta',
];

function promisify(request){
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
  });
}

const nowIso = () => new Date().toISOString();
const uid = (prefix) => prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const descByCreated = (a, b) => (a.createdAt < b.createdAt ? 1 : -1);

export default class LocalOfflineDataSource extends LucyDataSource {
  constructor(meId = 'u01'){
    super();
    this.meId = meId;
    this._db = null;
    this._blobUrls = new Map();
    this._replier = null;
    this._listeners = new Set();
  }

  /* ---------------- lifecycle ---------------- */

  async init(){
    if(this._db) return;
    this._db = await this._open();
    await this.seedIfNeeded();
    await this._buildBlobUrls();
  }

  _open(){
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        for(const name of STORES){
          if(!db.objectStoreNames.contains(name)){
            db.createObjectStore(name, {keyPath: 'id', autoIncrement: false});
          }
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('IndexedDB open failed'));
    });
  }

  /* ---------------- low-level store access ---------------- */

  _store(name, mode){
    return this._db.transaction(name, mode).objectStore(name);
  }
  _get(store, id){ return promisify(this._store(store, 'readonly').get(id)); }
  _put(store, value){ return promisify(this._store(store, 'readwrite').put(value)); }
  _del(store, id){ return promisify(this._store(store, 'readwrite').delete(id)); }
  _all(store){ return promisify(this._store(store, 'readonly').getAll()); }

  /** Internal: bulk snapshot of every store, used by the repository layer. */
  async _dump(){
    const out = {};
    for(const name of STORES) out[name] = await this._all(name);
    return out;
  }

  /** Internal: clear a thread's unread counter. */
  async _markThreadRead(threadId){
    const t = await this._get('threads', threadId);
    if(t && t.unread){
      t.unread = 0;
      await this._put('threads', t);
    }
  }

  /* ---------------- blob URLs ---------------- */

  async _buildBlobUrls(){
    const blobs = await this._all('mediaBlobs');
    for(const b of blobs){
      try{ this._blobUrls.set(b.id, URL.createObjectURL(b.blob)); }
      catch(e){ /* corrupt entry: skip */ }
    }
  }

  /** Register a Blob under an id and return its stable object URL. */
  cacheBlob(id, blob){
    let url = this._blobUrls.get(id);
    if(!url){
      url = URL.createObjectURL(blob);
      this._blobUrls.set(id, url);
    }
    return url;
  }

  mediaUrl(video){
    if(!video) return '';
    if(video.blobId && this._blobUrls.has(video.blobId)) return this._blobUrls.get(video.blobId);
    return video.file || '';
  }

  posterUrl(video){
    if(!video) return '';
    if(video.posterId && this._blobUrls.has(video.posterId)) return this._blobUrls.get(video.posterId);
    return video.poster || '';
  }

  /* ---------------- seed ---------------- */

  async seedIfNeeded(){
    if(await this._get('meta', 'seeded')) return;
    const [users, videos, comments, inbox, graph] = await Promise.all([
      fetch('data/seed_users.json').then((r) => { if(!r.ok) throw new Error('seed_users.json unavailable'); return r.json(); }),
      fetch('data/seed_videos.json').then((r) => { if(!r.ok) throw new Error('seed_videos.json unavailable'); return r.json(); }),
      fetch('data/seed_comments.json').then((r) => { if(!r.ok) throw new Error('seed_comments.json unavailable'); return r.json(); }),
      fetch('data/seed_inbox.json').then((r) => { if(!r.ok) throw new Error('seed_inbox.json unavailable'); return r.json(); }),
      fetch('data/seed_graph.json').then((r) => { if(!r.ok) throw new Error('seed_graph.json unavailable'); return r.json(); }),
    ]);
    const seededAt = nowIso();
    const tx = this._db.transaction(STORES, 'readwrite');
    const put = (store, value) => new Promise((resolve, reject) => {
      const rq = tx.objectStore(store).put(value);
      rq.onsuccess = () => resolve();
      rq.onerror = () => reject(rq.error || new Error('seed put failed'));
    });
    const done = new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('seed transaction failed'));
      tx.onabort = () => reject(tx.error || new Error('seed transaction aborted'));
    });
    try{
      for(const u of users) await put('users', u);
      videos.forEach((v, i) => { if(v.seedIndex == null) v.seedIndex = i; });
      for(const v of videos) await put('videos', v);
      for(const c of comments) await put('comments', c);
      for(const n of (inbox.notifications || [])) await put('notifications', n);
      for(const t of (inbox.threads || [])){
        const msgs = t.messages || [];
        // unread = trailing run of incoming messages
        let unread = 0;
        for(let i = msgs.length - 1; i >= 0; i--){ if(msgs[i].fromMe) break; unread++; }
        await put('threads', {
          id: t.id,
          userId: t.userId,
          updatedAt: msgs.length ? msgs[msgs.length - 1].createdAt : seededAt,
          unread,
        });
        for(let i = 0; i < msgs.length; i++){
          const m = msgs[i];
          await put('messages', {...m, id: m.id || ('m-' + t.id + '-' + i), threadId: t.id});
        }
      }
      // seed_graph.json stores pairs: follows [[a,b]], likes [[u,v]], bookmarks [[u,v]]
      for(const [a, b] of (graph.follows || [])){
        await put('follows', {id: 'f-' + a + '-' + b, followerId: a, followingId: b, createdAt: seededAt});
      }
      for(const [u, v] of (graph.likes || [])){
        await put('likes', {id: 'like-' + u + '-' + v, userId: u, videoId: v, createdAt: seededAt});
      }
      for(const [u, v] of (graph.bookmarks || [])){
        await put('bookmarks', {id: 'bm-' + u + '-' + v, userId: u, videoId: v, createdAt: seededAt});
      }
      await put('meta', {id: 'seeded', at: seededAt});
      await done;
    }catch(err){
      throw err instanceof Error ? err : new Error('seed failed');
    }
  }

  /* ---------------- enrichment ---------------- */

  async _ctx(){
    const [users, likes, bookmarks, follows] = await Promise.all([
      this._all('users'), this._all('likes'), this._all('bookmarks'), this._all('follows'),
    ]);
    return {
      users: new Map(users.map((u) => [u.id, u])),
      likeSet: new Set(likes.filter((l) => l.userId === this.meId).map((l) => l.videoId)),
      bookmarkSet: new Set(bookmarks.filter((b) => b.userId === this.meId).map((b) => b.videoId)),
      followSet: new Set(follows.filter((f) => f.followerId === this.meId).map((f) => f.followingId)),
    };
  }

  _enrichVideo(v, ctx){
    return {
      ...v,
      user: ctx.users.get(v.userId) || null,
      liked: ctx.likeSet.has(v.id),
      bookmarked: ctx.bookmarkSet.has(v.id),
      following: ctx.followSet.has(v.userId),
    };
  }

  /* ---------------- feed & videos ---------------- */

  async getFeed(tab){
    const [videos, ctx] = await Promise.all([this._all('videos'), this._ctx()]);
    const list = videos.map((v) => this._enrichVideo(v, ctx));
    if(tab === 'following'){
      return list.filter((v) => ctx.followSet.has(v.userId)).sort(descByCreated);
    }
    // 'foryou': user-posted videos first (newest), then seeded in deterministic JSON order.
    // Posted videos carry an explicit `local` flag (seed timestamps are fixed and
    // must never be mistaken for user posts).
    const posted = list.filter((v) => v.local === true).sort(descByCreated);
    const seeded = list.filter((v) => v.local !== true)
      .sort((a, b) => (a.seedIndex ?? 0) - (b.seedIndex ?? 0));
    return [...posted, ...seeded];
  }

  async getVideo(id){
    const [v, ctx] = await Promise.all([this._get('videos', id), this._ctx()]);
    return v ? this._enrichVideo(v, ctx) : null;
  }

  async getUser(idOrHandle){
    const key = String(idOrHandle || '').replace(/^@/, '').toLowerCase();
    const users = await this._all('users');
    const u = users.find((x) => x.id === idOrHandle || String(x.handle || '').toLowerCase() === key);
    if(!u) return null;
    const f = await this._get('follows', 'f-' + this.meId + '-' + u.id);
    // note: `following` stays the numeric count; the boolean is `followedByMe`
    return {...u, followedByMe: !!f};
  }

  async getVideosByUser(userId){
    const [videos, ctx] = await Promise.all([this._all('videos'), this._ctx()]);
    return videos.filter((v) => v.userId === userId).sort(descByCreated)
      .map((v) => this._enrichVideo(v, ctx));
  }

  async _videosByIds(ids){
    const [videos, ctx] = await Promise.all([this._all('videos'), this._ctx()]);
    const map = new Map(videos.map((v) => [v.id, v]));
    return ids.map((id) => map.get(id)).filter(Boolean).map((v) => this._enrichVideo(v, ctx));
  }

  async getLikedVideos(){
    const likes = (await this._all('likes'))
      .filter((l) => l.userId === this.meId).sort(descByCreated);
    return this._videosByIds(likes.map((l) => l.videoId));
  }

  async getBookmarkedVideos(){
    const bms = (await this._all('bookmarks'))
      .filter((b) => b.userId === this.meId).sort(descByCreated);
    return this._videosByIds(bms.map((b) => b.videoId));
  }

  async toggleLike(videoId){
    const video = await this._get('videos', videoId);
    if(!video) throw new Error('unknown video: ' + videoId);
    const id = 'like-' + this.meId + '-' + videoId;
    const existing = await this._get('likes', id);
    if(existing){
      await this._del('likes', id);
      video.likes = Math.max(0, (video.likes || 0) - 1);
      await this._put('videos', video);
      return false;
    }
    await this._put('likes', {id, userId: this.meId, videoId, createdAt: nowIso()});
    video.likes = (video.likes || 0) + 1;
    await this._put('videos', video);
    return true;
  }

  async toggleBookmark(videoId){
    const video = await this._get('videos', videoId);
    if(!video) throw new Error('unknown video: ' + videoId);
    const id = 'bm-' + this.meId + '-' + videoId;
    const existing = await this._get('bookmarks', id);
    if(existing){
      await this._del('bookmarks', id);
      video.bookmarks = Math.max(0, (video.bookmarks || 0) - 1);
      await this._put('videos', video);
      return false;
    }
    await this._put('bookmarks', {id, userId: this.meId, videoId, createdAt: nowIso()});
    video.bookmarks = (video.bookmarks || 0) + 1;
    await this._put('videos', video);
    return true;
  }

  async toggleFollow(userId){
    if(userId === this.meId) return false;
    const user = await this._get('users', userId);
    if(!user) throw new Error('unknown user: ' + userId);
    const me = await this._get('users', this.meId);
    const id = 'f-' + this.meId + '-' + userId;
    const existing = await this._get('follows', id);
    if(existing){
      await this._del('follows', id);
      user.followers = Math.max(0, (user.followers || 0) - 1);
      if(me) me.following = Math.max(0, (me.following || 0) - 1);
      await this._put('users', user);
      if(me) await this._put('users', me);
      return false;
    }
    await this._put('follows', {id, followerId: this.meId, followingId: userId, createdAt: nowIso()});
    user.followers = (user.followers || 0) + 1;
    if(me) me.following = (me.following || 0) + 1;
    await this._put('users', user);
    if(me) await this._put('users', me);
    return true;
  }

  async isFollowing(userId){
    return !!(await this._get('follows', 'f-' + this.meId + '-' + userId));
  }

  /* ---------------- comments ---------------- */

  async addComment(videoId, text, parentId = null){
    const clean = String(text || '').trim();
    if(!clean) throw new Error('comment text is empty');
    const video = await this._get('videos', videoId);
    if(!video) throw new Error('unknown video: ' + videoId);
    const comment = {
      id: uid('c'), videoId, userId: this.meId, text: clean,
      parentId: parentId || null, likes: 0, createdAt: nowIso(),
    };
    await this._put('comments', comment);
    video.comments = (video.comments || 0) + 1;
    await this._put('videos', video);
    const me = await this._get('users', this.meId);
    return {...comment, user: me || null, liked: false, replies: []};
  }

  async likeComment(commentId){
    const comment = await this._get('comments', commentId);
    if(!comment) throw new Error('unknown comment: ' + commentId);
    const id = 'cl-' + this.meId + '-' + commentId;
    const existing = await this._get('commentLikes', id);
    if(existing){
      await this._del('commentLikes', id);
      comment.likes = Math.max(0, (comment.likes || 0) - 1);
      await this._put('comments', comment);
      return false;
    }
    await this._put('commentLikes', {id, userId: this.meId, commentId, createdAt: nowIso()});
    comment.likes = (comment.likes || 0) + 1;
    await this._put('comments', comment);
    return true;
  }

  async getComments(videoId){
    const [all, users, myLikes] = await Promise.all([
      this._all('comments'), this._all('users'), this._all('commentLikes'),
    ]);
    const userMap = new Map(users.map((u) => [u.id, u]));
    const likedSet = new Set(myLikes.filter((l) => l.userId === this.meId).map((l) => l.commentId));
    const wrap = (c) => ({...c, user: userMap.get(c.userId) || null, liked: likedSet.has(c.id), replies: []});
    const byId = new Map(all.filter((c) => c.videoId === videoId).map((c) => [c.id, wrap(c)]));
    const top = [];
    for(const c of byId.values()){
      const parent = c.parentId && byId.get(c.parentId);
      if(parent) parent.replies.push(c);
      else top.push(c);
    }
    const byTime = (a, b) => (a.createdAt < b.createdAt ? -1 : 1);
    top.sort(byTime);
    for(const t of top) t.replies.sort(byTime);
    return top;
  }

  async getCommentCount(videoId){
    const all = await this._all('comments');
    return all.filter((c) => c.videoId === videoId).length;
  }

  /* ---------------- publishing & profile ---------------- */

  async postVideo({blob, caption, audioTitle, audioArtist, durationSec, posterBlob}){
    if(!(blob instanceof Blob)) throw new Error('postVideo requires a video Blob');
    const ts = Date.now();
    const blobId = 'b' + ts;
    const posterId = posterBlob ? 'p' + ts : null;
    await this._put('mediaBlobs', {id: blobId, blob, kind: 'video', createdAt: nowIso()});
    this.cacheBlob(blobId, blob);
    if(posterBlob){
      await this._put('mediaBlobs', {id: posterId, blob: posterBlob, kind: 'poster', createdAt: nowIso()});
      this.cacheBlob(posterId, posterBlob);
    }
    const me = await this._get('users', this.meId);
    const hashtags = [...String(caption || '').matchAll(/#([\p{L}\p{N}_]+)/gu)].map((m) => m[1].toLowerCase());
    const video = {
      id: 'v' + ts, userId: this.meId, caption: String(caption || ''), hashtags,
      audioTitle: audioTitle || 'Original sound',
      audioArtist: audioArtist || (me && me.displayName) || 'me',
      durationSec: durationSec || 0, blobId, posterId, file: null, poster: null,
      views: 0, likes: 0, comments: 0, shares: 0, bookmarks: 0,
      local: true, createdAt: nowIso(),
    };
    await this._put('videos', video);
    const ctx = await this._ctx();
    return this._enrichVideo(video, ctx);
  }

  async updateProfile(patch){
    const me = await this._get('users', this.meId);
    if(!me) throw new Error('current user not found');
    const updated = {...me, ...patch, id: this.meId};
    await this._put('users', updated);
    return {...updated, followedByMe: false};
  }

  /* ---------------- notifications ---------------- */

  async getNotifications(){
    const [all, users] = await Promise.all([this._all('notifications'), this._all('users')]);
    const userMap = new Map(users.map((u) => [u.id, u]));
    return all.sort(descByCreated)
      .map((n) => ({...n, actor: (n.actorId && userMap.get(n.actorId)) || null}));
  }

  async getUnreadNotificationCount(){
    const all = await this._all('notifications');
    return all.filter((n) => n.read !== true).length;
  }

  async markNotificationRead(id){
    const n = await this._get('notifications', id);
    if(n && !n.read){
      n.read = true;
      await this._put('notifications', n);
    }
  }

  async markAllNotificationsRead(){
    const all = await this._all('notifications');
    for(const n of all){
      if(!n.read){
        n.read = true;
        await this._put('notifications', n);
      }
    }
  }

  /* ---------------- threads & messages ---------------- */

  async getThreads(){
    const [threads, users, messages] = await Promise.all([
      this._all('threads'), this._all('users'), this._all('messages'),
    ]);
    const userMap = new Map(users.map((u) => [u.id, u]));
    const lastBy = new Map();
    for(const m of messages){
      const cur = lastBy.get(m.threadId);
      if(!cur || cur.createdAt < m.createdAt) lastBy.set(m.threadId, m);
    }
    return threads.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
      .map((t) => ({...t, user: userMap.get(t.userId) || null, lastMessage: lastBy.get(t.id) || null}));
  }

  async getMessages(threadId){
    const all = await this._all('messages');
    const list = all.filter((m) => m.threadId === threadId)
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
    await this._markThreadRead(threadId);
    return list;
  }

  setReplier(fn){
    this._replier = typeof fn === 'function' ? fn : null;
  }

  onMessage(cb){
    if(typeof cb === 'function') this._listeners.add(cb);
    return () => this._listeners.delete(cb);
  }

  _emit(msg){
    for(const cb of this._listeners){
      try{ cb(msg); }catch(e){ console.error(e); }
    }
  }

  async sendMessage(threadId, text){
    const clean = String(text || '').trim();
    if(!clean) throw new Error('message text is empty');
    const thread = await this._get('threads', threadId);
    if(!thread) throw new Error('unknown thread: ' + threadId);
    const msg = {id: uid('m'), threadId, fromMe: true, text: clean, createdAt: nowIso()};
    await this._put('messages', msg);
    thread.updatedAt = msg.createdAt;
    thread.unread = 0;
    await this._put('threads', thread);
    if(this._replier){
      const replier = this._replier;
      setTimeout(async () => {
        try{
          const users = await this._all('users');
          const user = users.find((u) => u.id === thread.userId) || null;
          const replyText = await replier(user, clean);
          if(!replyText || !String(replyText).trim()) return;
          const reply = {id: uid('m'), threadId, fromMe: false, text: String(replyText), createdAt: nowIso()};
          await this._put('messages', reply);
          const t2 = await this._get('threads', threadId);
          if(t2){
            t2.updatedAt = reply.createdAt;
            t2.unread = (t2.unread || 0) + 1;
            await this._put('threads', t2);
          }
          this._emit(reply);
        }catch(e){ console.error('[lucy] auto-reply failed', e); }
      }, 1800);
    }
    return msg;
  }

  /* ---------------- search & discovery ---------------- */

  _tagList(v){
    return (v.hashtags || []).map((t) => String(t).toLowerCase());
  }

  _catOf(v, userMap){
    const u = userMap.get(v.userId);
    return (u && u.category) || 'General';
  }

  async search(q){
    const s = String(q || '').trim().toLowerCase();
    if(!s) return {videos: [], users: [], hashtags: []};
    const [videos, users, ctx] = await Promise.all([
      this._all('videos'), this._all('users'), this._ctx(),
    ]);
    const vids = videos.filter((v) =>
      String(v.caption || '').toLowerCase().includes(s) ||
      this._tagList(v).some((t) => t.includes(s))
    ).map((v) => this._enrichVideo(v, ctx));
    const us = users.filter((u) =>
      [u.displayName, u.handle, u.bio].some((x) => String(x || '').toLowerCase().includes(s))
    ).map((u) => ({...u, followedByMe: ctx.followSet.has(u.id)}));
    const counts = new Map();
    for(const v of videos){
      for(const t of this._tagList(v)){
        if(t.includes(s)) counts.set(t, (counts.get(t) || 0) + 1);
      }
    }
    const hashtags = [...counts.entries()]
      .map(([tag, count]) => ({tag, count}))
      .sort((a, b) => b.count - a.count);
    return {videos: vids, users: us, hashtags};
  }

  async getTrendingHashtags(limit = 10){
    const videos = await this._all('videos');
    const counts = new Map();
    for(const v of videos){
      for(const t of this._tagList(v)) counts.set(t, (counts.get(t) || 0) + 1);
    }
    return [...counts.entries()]
      .map(([tag, count]) => ({tag, count}))
      .sort((a, b) => b.count - a.count || (a.tag < b.tag ? -1 : 1))
      .slice(0, Math.max(0, limit));
  }

  async getVideosByHashtag(tag){
    const t = String(tag || '').replace(/^#/, '').toLowerCase();
    if(!t) return [];
    const [videos, ctx] = await Promise.all([this._all('videos'), this._ctx()]);
    return videos.filter((v) => this._tagList(v).includes(t)).sort(descByCreated)
      .map((v) => this._enrichVideo(v, ctx));
  }

  async getVideosByCategory(cat){
    const [videos, users, ctx] = await Promise.all([
      this._all('videos'), this._all('users'), this._ctx(),
    ]);
    const userMap = new Map(users.map((u) => [u.id, u]));
    return videos.filter((v) => this._catOf(v, userMap) === cat).sort(descByCreated)
      .map((v) => this._enrichVideo(v, ctx));
  }

  async getCategories(){
    const [videos, users] = await Promise.all([this._all('videos'), this._all('users')]);
    const userMap = new Map(users.map((u) => [u.id, u]));
    const counts = new Map();
    for(const v of videos){
      const c = this._catOf(v, userMap);
      counts.set(c, (counts.get(c) || 0) + 1);
    }
    return [...counts.entries()]
      .map(([name, count]) => ({name, count}))
      .sort((a, b) => b.count - a.count || (a.name < b.name ? -1 : 1));
  }

  async getAudioTracks(){
    const videos = await this._all('videos');
    const map = new Map();
    for(const v of videos){
      const title = v.audioTitle || 'Original sound';
      const artist = v.audioArtist || 'Unknown artist';
      const k = title + ' — ' + artist;
      const e = map.get(k) || {title, artist, count: 0};
      e.count++;
      map.set(k, e);
    }
    return [...map.values()].sort((a, b) => b.count - a.count);
  }
}

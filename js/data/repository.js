/* Project Lucy — repository.
 * Synchronous in-memory facade over the async IndexedDB data source.
 *
 * Why synchronous: the screen modules call the repository directly in event
 * handlers and render paths (e.g. `const videos = repo.getFeed(tab)`,
 * `const r = repo.toggleLike(id)`), so reads resolve instantly from a
 * preloaded snapshot instead of returning promises.
 *
 * Model:
 * - `ready` initializes the data source (open + seed + blob-URL map), wires
 *   the DM auto-replier, subscribes to incoming messages, then loads a full
 *   snapshot of every store into memory.
 * - Reads serve the snapshot synchronously and return live references, so
 *   in-place mutation updates are immediately visible to screens.
 * - Mutations apply the optimistic change to the snapshot first, then persist
 *   through the data source in the background. If persistence fails, the
 *   snapshot change is rolled back, the error is logged, and `onError`
 *   listeners are notified.
 *
 * Enriched shapes:
 * - video: {...record, user, liked, bookmarked, following}
 *   (`following` = do I follow the author; the user object keeps its numeric
 *   `following` count untouched)
 * - user (from getUser/search): {...record, followedByMe}
 * - thread: {...record, user, lastMessage, unread}
 * - comment: {...record, user, liked, replies[]}
 * - notification: {...record, actor}
 *
 * Mutation results:
 * - toggleLike -> {liked, likes}        toggleBookmark -> {bookmarked, bookmarks}
 * - toggleFollow -> {following}         likeComment -> {liked, likes}
 */
import LocalOfflineDataSource from './LocalOfflineDataSource.js';

export const me = 'u01';
const ds = new LocalOfflineDataSource(me);

/* ---------------- in-memory snapshot ---------------- */
const users = new Map();          // id -> user (+followedByMe)
const videos = new Map();         // id -> enriched video
const comments = new Map();       // id -> comment (+user, liked)
const threads = new Map();        // id -> thread (+user)
const threadMessages = new Map(); // threadId -> [message] (createdAt asc)
const notifications = new Map();  // id -> notification
const likeSet = new Set();        // videoIds liked by me
const bookmarkSet = new Set();    // videoIds bookmarked by me
const followSet = new Set();      // userIds followed by me
const commentLikeSet = new Set(); // commentIds liked by me
const likeTimes = new Map();      // videoId -> ISO (for recency ordering)
const bookmarkTimes = new Map();  // videoId -> ISO

const listeners = new Set();      // onMessage
const errorListeners = new Set(); // onError
let snapshotted = false;

const nowIso = () => new Date().toISOString();
const uid = (prefix) => prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const descByCreated = (a, b) => (a.createdAt < b.createdAt ? 1 : -1);

function requireReady(){
  if(!snapshotted) throw new Error('lucy repository not ready — await repo.ready first');
}

function notifyError(err){
  console.error('[lucy] persistence failed', err);
  for(const cb of errorListeners){
    try{ cb(err); }catch(e){ /* ignore */ }
  }
}

/** Persist in the background; roll the snapshot change back on failure. */
function persist(task, rollback){
  task().catch((err) => {
    try{ if(rollback) rollback(); }catch(e){ /* ignore */ }
    notifyError(err);
  });
}

function loadSnapshot(dump){
  users.clear(); videos.clear(); comments.clear(); threads.clear();
  threadMessages.clear(); notifications.clear();
  likeSet.clear(); bookmarkSet.clear(); followSet.clear(); commentLikeSet.clear();
  likeTimes.clear(); bookmarkTimes.clear();

  for(const u of (dump.users || [])) users.set(u.id, {...u});
  for(const f of (dump.follows || [])){
    if(f.followerId === me) followSet.add(f.followingId);
  }
  for(const l of (dump.likes || [])){
    if(l.userId === me){ likeSet.add(l.videoId); likeTimes.set(l.videoId, l.createdAt); }
  }
  for(const b of (dump.bookmarks || [])){
    if(b.userId === me){ bookmarkSet.add(b.videoId); bookmarkTimes.set(b.videoId, b.createdAt); }
  }
  for(const cl of (dump.commentLikes || [])){
    if(cl.userId === me) commentLikeSet.add(cl.commentId);
  }
  for(const u of users.values()) u.followedByMe = followSet.has(u.id);

  const userOf = (id) => users.get(id) || null;
  for(const v of (dump.videos || [])){
    videos.set(v.id, {
      ...v,
      user: userOf(v.userId),
      liked: likeSet.has(v.id),
      bookmarked: bookmarkSet.has(v.id),
      following: followSet.has(v.userId),
    });
  }

  const commentCount = new Map();
  for(const c of (dump.comments || [])){
    comments.set(c.id, {...c, user: userOf(c.userId), liked: commentLikeSet.has(c.id)});
    commentCount.set(c.videoId, (commentCount.get(c.videoId) || 0) + 1);
  }
  // keep per-video comment counts honest against the actual comment store
  for(const v of videos.values()){
    if(commentCount.has(v.id)) v.comments = commentCount.get(v.id);
  }

  for(const n of (dump.notifications || [])) notifications.set(n.id, {...n});
  for(const t of (dump.threads || [])) threads.set(t.id, {...t, user: userOf(t.userId)});
  for(const m of (dump.messages || [])){
    if(!threadMessages.has(m.threadId)) threadMessages.set(m.threadId, []);
    threadMessages.get(m.threadId).push(m);
  }
  for(const arr of threadMessages.values()){
    arr.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  }
  snapshotted = true;
}

const videoList = () => [...videos.values()];
const tagList = (v) => (v.hashtags || []).map((t) => String(t).toLowerCase());
const catOf = (v) => ((users.get(v.userId) || {}).category || 'General');

/* ---------------- reads ---------------- */

function getFeed(tab){
  requireReady();
  const list = videoList();
  if(tab === 'following'){
    return list.filter((v) => followSet.has(v.userId)).sort(descByCreated);
  }
  // 'foryou': user-posted videos first (newest; explicit `local` flag), then seeded
  const posted = list.filter((v) => v.local === true).sort(descByCreated);
  const seeded = list.filter((v) => v.local !== true)
    .sort((a, b) => (a.seedIndex ?? 0) - (b.seedIndex ?? 0));
  return [...posted, ...seeded];
}

function getVideo(id){
  requireReady();
  return videos.get(id) || null;
}

function getUser(idOrHandle){
  requireReady();
  const key = String(idOrHandle || '').replace(/^@/, '').toLowerCase();
  for(const u of users.values()){
    if(u.id === idOrHandle || String(u.handle || '').toLowerCase() === key) return u;
  }
  return null;
}

function getVideosByUser(userId){
  requireReady();
  return videoList().filter((v) => v.userId === userId).sort(descByCreated);
}

function getLikedVideos(){
  requireReady();
  return [...likeSet].map((id) => videos.get(id)).filter(Boolean)
    .sort((a, b) => {
      const ta = likeTimes.get(a.id) || '', tb = likeTimes.get(b.id) || '';
      return ta < tb ? 1 : -1;
    });
}

function getBookmarkedVideos(){
  requireReady();
  return [...bookmarkSet].map((id) => videos.get(id)).filter(Boolean)
    .sort((a, b) => {
      const ta = bookmarkTimes.get(a.id) || '', tb = bookmarkTimes.get(b.id) || '';
      return ta < tb ? 1 : -1;
    });
}

function isFollowing(userId){
  requireReady();
  return followSet.has(userId);
}

/* ---------------- mutations (optimistic) ---------------- */

function toggleLike(videoId){
  requireReady();
  const v = videos.get(videoId);
  if(!v) throw new Error('unknown video: ' + videoId);
  const prev = {liked: v.liked, likes: v.likes};
  v.liked = !v.liked;
  v.likes = Math.max(0, (v.likes || 0) + (v.liked ? 1 : -1));
  if(v.liked){ likeSet.add(videoId); likeTimes.set(videoId, nowIso()); }
  else { likeSet.delete(videoId); likeTimes.delete(videoId); }
  persist(() => ds.toggleLike(videoId), () => {
    v.liked = prev.liked; v.likes = prev.likes;
    if(prev.liked){ likeSet.add(videoId); } else { likeSet.delete(videoId); }
  });
  return {liked: v.liked, likes: v.likes};
}

function toggleBookmark(videoId){
  requireReady();
  const v = videos.get(videoId);
  if(!v) throw new Error('unknown video: ' + videoId);
  const prev = {bookmarked: v.bookmarked, bookmarks: v.bookmarks};
  v.bookmarked = !v.bookmarked;
  v.bookmarks = Math.max(0, (v.bookmarks || 0) + (v.bookmarked ? 1 : -1));
  if(v.bookmarked){ bookmarkSet.add(videoId); bookmarkTimes.set(videoId, nowIso()); }
  else { bookmarkSet.delete(videoId); bookmarkTimes.delete(videoId); }
  persist(() => ds.toggleBookmark(videoId), () => {
    v.bookmarked = prev.bookmarked; v.bookmarks = prev.bookmarks;
    if(prev.bookmarked){ bookmarkSet.add(videoId); } else { bookmarkSet.delete(videoId); }
  });
  return {bookmarked: v.bookmarked, bookmarks: v.bookmarks};
}

function toggleFollow(userId){
  requireReady();
  if(userId === me) return {following: false};
  const u = users.get(userId);
  if(!u) throw new Error('unknown user: ' + userId);
  const willFollow = !followSet.has(userId);
  const prevFollowers = u.followers;
  const meUser = users.get(me);
  const prevMeFollowing = meUser ? meUser.following : 0;
  if(willFollow){ followSet.add(userId); u.followers = (u.followers || 0) + 1; }
  else { followSet.delete(userId); u.followers = Math.max(0, (u.followers || 0) - 1); }
  u.followedByMe = willFollow;
  if(meUser) meUser.following = Math.max(0, (meUser.following || 0) + (willFollow ? 1 : -1));
  for(const v of videos.values()){
    if(v.userId === userId) v.following = willFollow;
  }
  persist(() => ds.toggleFollow(userId), () => {
    if(willFollow) followSet.delete(userId); else followSet.add(userId);
    u.followers = prevFollowers;
    u.followedByMe = !willFollow;
    if(meUser) meUser.following = prevMeFollowing;
    for(const v of videos.values()){
      if(v.userId === userId) v.following = !willFollow;
    }
  });
  return {following: willFollow};
}

/* ---------------- comments ---------------- */

function getComments(videoId){
  requireReady();
  const all = [...comments.values()].filter((c) => c.videoId === videoId);
  const wrap = (c) => ({...c, replies: []});
  const byId = new Map(all.map((c) => [c.id, wrap(c)]));
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

function getCommentCount(videoId){
  requireReady();
  let n = 0;
  for(const c of comments.values()){
    if(c.videoId === videoId) n++;
  }
  return n;
}

function addComment(videoId, text, parentId = null){
  requireReady();
  const clean = String(text || '').trim();
  if(!clean) throw new Error('comment text is empty');
  const v = videos.get(videoId);
  if(!v) throw new Error('unknown video: ' + videoId);
  const c = {
    id: uid('c'), videoId, userId: me, text: clean,
    parentId: parentId || null, likes: 0, createdAt: nowIso(),
    user: users.get(me) || null, liked: false,
  };
  comments.set(c.id, c);
  v.comments = (v.comments || 0) + 1;
  persist(async () => {
    // persist the exact snapshot record (same id) so later mutations
    // (e.g. likeComment) address the same comment in IndexedDB
    const record = {...c};
    delete record.user;
    delete record.liked;
    await ds._put('comments', record);
    const sv = await ds._get('videos', videoId);
    if(sv){
      sv.comments = (sv.comments || 0) + 1;
      await ds._put('videos', sv);
    }
  }, () => {
    comments.delete(c.id);
    v.comments = Math.max(0, (v.comments || 0) - 1);
  });
  return {...c, replies: []};
}

function likeComment(commentId){
  requireReady();
  const c = comments.get(commentId);
  if(!c) throw new Error('unknown comment: ' + commentId);
  const prev = {liked: c.liked, likes: c.likes};
  c.liked = !c.liked;
  c.likes = Math.max(0, (c.likes || 0) + (c.liked ? 1 : -1));
  if(c.liked) commentLikeSet.add(commentId); else commentLikeSet.delete(commentId);
  persist(() => ds.likeComment(commentId), () => {
    c.liked = prev.liked; c.likes = prev.likes;
    if(prev.liked) commentLikeSet.add(commentId); else commentLikeSet.delete(commentId);
  });
  return {liked: c.liked, likes: c.likes};
}

/* ---------------- publishing & profile ---------------- */

function postVideo({blob, caption, audioTitle, audioArtist, durationSec, posterBlob}){
  requireReady();
  if(!(blob instanceof Blob)) throw new Error('postVideo requires a video Blob');
  const ts = Date.now();
  const blobId = 'b' + ts;
  const posterId = posterBlob ? 'p' + ts : null;
  ds.cacheBlob(blobId, blob);
  if(posterBlob) ds.cacheBlob(posterId, posterBlob);
  const meUser = users.get(me);
  const hashtags = [...String(caption || '').matchAll(/#([\p{L}\p{N}_]+)/gu)]
    .map((m) => m[1].toLowerCase());
  const record = {
    id: 'v' + ts, userId: me, caption: String(caption || ''), hashtags,
    audioTitle: audioTitle || 'Original sound',
    audioArtist: audioArtist || (meUser && meUser.displayName) || 'me',
    durationSec: durationSec || 0, blobId, posterId, file: null, poster: null,
    views: 0, likes: 0, comments: 0, shares: 0, bookmarks: 0,
    local: true, createdAt: nowIso(), seedIndex: -1,
  };
  const v = {
    ...record,
    user: meUser || null, liked: false, bookmarked: false, following: false,
  };
  videos.set(v.id, v);
  persist(async () => {
    await ds._put('mediaBlobs', {id: blobId, blob, kind: 'video', createdAt: record.createdAt});
    if(posterBlob){
      await ds._put('mediaBlobs', {id: posterId, blob: posterBlob, kind: 'poster', createdAt: record.createdAt});
    }
    await ds._put('videos', record);
  }, () => { videos.delete(v.id); });
  return v;
}

function updateProfile(patch){
  requireReady();
  const u = users.get(me);
  if(!u) throw new Error('current user not found');
  const prev = {...u};
  Object.assign(u, patch, {id: me});
  for(const v of videos.values()){
    if(v.userId === me) v.user = u;
  }
  persist(() => ds.updateProfile(patch), () => {
    users.set(me, prev);
    for(const v of videos.values()){
      if(v.userId === me) v.user = prev;
    }
  });
  return u;
}

/* ---------------- notifications ---------------- */

function getNotifications(){
  requireReady();
  return [...notifications.values()].sort(descByCreated)
    .map((n) => ({...n, actor: (n.actorId && users.get(n.actorId)) || null}));
}

function getUnreadNotificationCount(){
  requireReady();
  let n = 0;
  for(const x of notifications.values()){
    if(x.read !== true) n++;
  }
  return n;
}

function markNotificationRead(id){
  requireReady();
  const n = notifications.get(id);
  if(n && !n.read){
    n.read = true;
    persist(() => ds.markNotificationRead(id), () => { n.read = false; });
  }
}

function markAllNotificationsRead(){
  requireReady();
  const changed = [...notifications.values()].filter((n) => !n.read);
  for(const n of changed) n.read = true;
  persist(() => ds.markAllNotificationsRead(), () => {
    for(const n of changed) n.read = false;
  });
}

/* ---------------- threads & messages ---------------- */

function lastMessageOf(threadId){
  const arr = threadMessages.get(threadId);
  return arr && arr.length ? arr[arr.length - 1] : null;
}

function getThreads(){
  requireReady();
  return [...threads.values()]
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
    .map((t) => ({...t, lastMessage: lastMessageOf(t.id)}));
}

function getMessages(threadId){
  requireReady();
  const t = threads.get(threadId);
  if(!t) throw new Error('unknown thread: ' + threadId);
  const arr = threadMessages.get(threadId) || [];
  if(t.unread){
    t.unread = 0;
    persist(() => ds._markThreadRead(threadId), () => {});
  }
  return arr.slice();
}

function sendMessage(threadId, text){
  requireReady();
  const clean = String(text || '').trim();
  if(!clean) throw new Error('message text is empty');
  const t = threads.get(threadId);
  if(!t) throw new Error('unknown thread: ' + threadId);
  const msg = {id: uid('m'), threadId, fromMe: true, text: clean, createdAt: nowIso()};
  let arr = threadMessages.get(threadId);
  if(!arr){ arr = []; threadMessages.set(threadId, arr); }
  arr.push(msg);
  const prevUpdated = t.updatedAt, prevUnread = t.unread;
  t.updatedAt = msg.createdAt;
  t.unread = 0;
  // The data source persists its own copy, schedules the scripted reply
  // (~1.8s via the wired replier), and emits it through onMessage, which we
  // mirror into the snapshot below.
  persist(() => ds.sendMessage(threadId, clean), () => {
    const i = arr.indexOf(msg);
    if(i >= 0) arr.splice(i, 1);
    t.updatedAt = prevUpdated;
    t.unread = prevUnread;
  });
  return {...msg};
}

function handleIncomingMessage(msg){
  if(!msg || !msg.threadId) return;
  let arr = threadMessages.get(msg.threadId);
  if(!arr){ arr = []; threadMessages.set(msg.threadId, arr); }
  if(arr.some((m) => m.id === msg.id)) return;
  arr.push(msg);
  arr.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  const t = threads.get(msg.threadId);
  if(t){
    t.updatedAt = msg.createdAt;
    t.unread = (t.unread || 0) + 1;
  }
  for(const cb of listeners){
    try{ cb({...msg}); }catch(e){ /* ignore */ }
  }
}

function onMessage(cb){
  if(typeof cb === 'function') listeners.add(cb);
  return () => listeners.delete(cb);
}

function onError(cb){
  if(typeof cb === 'function') errorListeners.add(cb);
  return () => errorListeners.delete(cb);
}

/* ---------------- search & discovery ---------------- */

function search(q){
  requireReady();
  const s = String(q || '').trim().toLowerCase();
  if(!s) return {videos: [], users: [], hashtags: []};
  const vids = videoList().filter((v) =>
    String(v.caption || '').toLowerCase().includes(s) ||
    tagList(v).some((t) => t.includes(s))
  );
  const us = [...users.values()].filter((u) =>
    [u.displayName, u.handle, u.bio].some((x) => String(x || '').toLowerCase().includes(s))
  );
  const counts = new Map();
  for(const v of videoList()){
    for(const t of tagList(v)){
      if(t.includes(s)) counts.set(t, (counts.get(t) || 0) + 1);
    }
  }
  const hashtags = [...counts.entries()]
    .map(([tag, count]) => ({tag, count}))
    .sort((a, b) => b.count - a.count);
  return {videos: vids, users: us, hashtags};
}

function getTrendingHashtags(limit = 10){
  requireReady();
  const counts = new Map();
  for(const v of videoList()){
    for(const t of tagList(v)) counts.set(t, (counts.get(t) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({tag, count}))
    .sort((a, b) => b.count - a.count || (a.tag < b.tag ? -1 : 1))
    .slice(0, Math.max(0, limit));
}

function getVideosByHashtag(tag){
  requireReady();
  const t = String(tag || '').replace(/^#/, '').toLowerCase();
  if(!t) return [];
  return videoList().filter((v) => tagList(v).includes(t)).sort(descByCreated);
}

function getVideosByCategory(cat){
  requireReady();
  return videoList().filter((v) => catOf(v) === cat).sort(descByCreated);
}

function getCategories(){
  requireReady();
  const counts = new Map();
  for(const v of videoList()){
    const c = catOf(v);
    counts.set(c, (counts.get(c) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({name, count}))
    .sort((a, b) => b.count - a.count || (a.name < b.name ? -1 : 1));
}

function getAudioTracks(){
  requireReady();
  const map = new Map();
  for(const v of videoList()){
    const title = v.audioTitle || 'Original sound';
    const artist = v.audioArtist || 'Unknown artist';
    const k = title + ' — ' + artist;
    const e = map.get(k) || {title, artist, count: 0};
    e.count++;
    map.set(k, e);
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

/* ---------------- boot ---------------- */

const ready = (async () => {
  let pickReply = null;
  try{
    const mod = await import('../dm-replies.js');
    if(mod && typeof mod.pickReply === 'function') pickReply = mod.pickReply;
  }catch(e){
    console.warn('[lucy] dm-replies unavailable — auto-replies disabled');
  }
  if(pickReply) ds.setReplier((user, text) => pickReply(user, text));
  await ds.init();
  ds.onMessage(handleIncomingMessage);
  loadSnapshot(await ds._dump());
})();

export const repo = {
  ready,
  me,
  seedIfNeeded: () => ds.seedIfNeeded(),
  getFeed,
  getVideo,
  getUser,
  getVideosByUser,
  getLikedVideos,
  getBookmarkedVideos,
  toggleLike,
  toggleBookmark,
  toggleFollow,
  isFollowing,
  addComment,
  likeComment,
  getComments,
  getCommentCount,
  postVideo,
  updateProfile,
  getNotifications,
  getUnreadNotificationCount,
  markNotificationRead,
  markAllNotificationsRead,
  getThreads,
  getMessages,
  sendMessage,
  search,
  getTrendingHashtags,
  getVideosByHashtag,
  getVideosByCategory,
  getCategories,
  getAudioTracks,
  mediaUrl: (v) => ds.mediaUrl(v),
  posterUrl: (v) => ds.posterUrl(v),
  onMessage,
  onError,
};

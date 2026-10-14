/* Project Lucy — Home feed screen (vertical snap video feed).
 * Original design. Uses Lucy design tokens only.
 * Contract: export const HomeScreen = { mount(el, params={}), unmount() } */

import { repo } from './data/repository.js';
import { el, icon, toast, fmt, esc } from './ui.js';
import { applyPlaybackPolicy, pauseAll, bindVisibility } from './player.js';
import { openComments } from './comments.js';

const TAB_KEY = 'lucy-feed-tab';
const MUTE_KEY = 'lucy-muted';

let current = null;

/* icon() helper: tolerates ui.js returning either an SVG string or an element */
function ic(name, cls) {
  const r = icon(name, cls);
  if (typeof r === 'string') return r;
  if (r && r.outerHTML) return r.outerHTML;
  const wrap = el('span', cls || '');
  if (r) wrap.appendChild(r);
  return wrap.outerHTML;
}

function on(elx, evt, fn, signal) {
  elx.addEventListener(evt, fn, { signal });
}

function headerBar(S) {
  const bar = el('div', 'feed-topbar');
  bar.innerHTML =
    '<div class="seg" role="tablist">' +
      '<button class="seg-btn" data-tab="following">Following</button>' +
      '<button class="seg-btn" data-tab="foryou">For You</button>' +
      '<span class="seg-pill"></span>' +
    '</div>' +
    '<div class="feed-top-actions">' +
      '<button class="icon-btn search-btn" aria-label="Search">' + ic('i-search', 'ic') + '</button>' +
      '<button class="icon-btn mute-btn" aria-label="Toggle sound">' + ic(S.muted ? 'i-spk-x' : 'i-spk', 'ic') + '</button>' +
    '</div>';
  const signal = S.ac.signal;
  const btns = bar.querySelectorAll('.seg-btn');
  const paint = () => {
    btns.forEach((b) => b.classList.toggle('on', b.dataset.tab === S.tab));
    const active = bar.querySelector('.seg-btn.on');
    const seg = bar.querySelector('.seg');
    if (active && seg) {
      seg.style.setProperty('--pill-l', active.offsetLeft + 'px');
      seg.style.setProperty('--pill-w', active.offsetWidth + 'px');
    }
  };
  paint();
  requestAnimationFrame(paint);
  window.addEventListener('resize', paint, { signal });
  btns.forEach((b) => on(b, 'click', () => {
    if (S.tab === b.dataset.tab) return;
    S.tab = b.dataset.tab;
    try { localStorage.setItem(TAB_KEY, S.tab); } catch (e) {}
    paint();
    loadFeed(S);
  }, signal));
  on(bar.querySelector('.search-btn'), 'click', () => { location.hash = '#/discover'; }, signal);
  const muteBtn = bar.querySelector('.mute-btn');
  on(muteBtn, 'click', () => {
    S.muted = !S.muted;
    try { localStorage.setItem(MUTE_KEY, S.muted ? '1' : '0'); } catch (e) {}
    muteBtn.innerHTML = ic(S.muted ? 'i-spk-x' : 'i-spk', 'ic');
    S.videoEls.forEach((v) => { if (v) v.muted = S.muted; });
    toast(S.muted ? 'Sound off' : 'Sound on');
  }, signal);
  return bar;
}

function loadFeed(S) {
  pauseAll(S.videoEls);
  if (S.io) S.io.disconnect();
  S.feed.innerHTML = '';
  S.slides = [];
  S.videoEls = [];
  S.activeIndex = -1;
  let videos = [];
  try { videos = repo.getFeed(S.tab) || []; } catch (e) { videos = []; }
  S.videos = videos;
  videos.forEach((v, i) => S.feed.appendChild(buildSlide(S, v, i)));
  if (S.io) {
    S.slides.forEach((s) => S.io.observe(s));
  }
  S.feed.scrollTop = 0;
}

function buildSlide(S, v, i) {
  const user = v.user || {};
  const slide = el('section', 'feed-slide');
  slide.dataset.index = String(i);
  S.slides.push(slide);

  const vid = document.createElement('video');
  vid.className = 'feed-video';
  vid.src = repo.mediaUrl(v);
  vid.poster = repo.posterUrl(v);
  vid.loop = true;
  vid.playsInline = true;
  vid.muted = S.muted;
  vid.preload = i === 0 ? 'auto' : 'metadata';
  slide.appendChild(vid);
  S.videoEls.push(vid);

  const tapLayer = el('div', 'tap-layer');
  slide.appendChild(tapLayer);

  const flash = el('div', 'tap-flash');
  slide.appendChild(flash);

  const burstLayer = el('div', 'burst-layer');
  slide.appendChild(burstLayer);

  /* right rail */
  const rail = el('div', 'rail');
  const meId = repo.me;
  let followBtn = null;
  if (v.userId !== meId) {
    const avWrap = el('button', 'rail-avatar');
    avWrap.innerHTML = '<img src="' + esc(user.avatar || '') + '" alt="' + esc(user.displayName || '') + '">';
    followBtn = el('span', 'follow-badge' + (repo.isFollowing(v.userId) ? ' is-on' : ''));
    followBtn.innerHTML = ic(repo.isFollowing(v.userId) ? 'i-check' : 'i-plus', 'ic ic-xs');
    avWrap.appendChild(followBtn);
    on(avWrap, 'click', (e) => { e.stopPropagation(); location.hash = '#/user/' + encodeURIComponent(user.handle || v.userId); }, S.ac.signal);
    on(followBtn, 'click', (e) => {
      e.stopPropagation();
      const r = repo.toggleFollow(v.userId);
      followBtn.classList.toggle('is-on', !!r.following);
      followBtn.innerHTML = ic(r.following ? 'i-check' : 'i-plus', 'ic ic-xs');
      toast(r.following ? 'Following @' + (user.handle || '') : 'Unfollowed @' + (user.handle || ''));
    }, S.ac.signal);
    rail.appendChild(avWrap);
  }

  const liked0 = !!v.liked;
  const likeBtn = el('button', 'rail-btn like-btn' + (liked0 ? ' is-on' : ''));
  likeBtn.innerHTML = ic('i-heart', 'ic') + '<span class="rail-count">' + fmt(v.likes || 0) + '</span>';
  on(likeBtn, 'click', (e) => {
    e.stopPropagation();
    const r = repo.toggleLike(v.id);
    v.liked = r.liked; v.likes = r.likes;
    likeBtn.classList.toggle('is-on', !!r.liked);
    likeBtn.querySelector('.rail-count').textContent = fmt(r.likes || 0);
    if (r.liked) { likeBtn.classList.remove('pop'); void likeBtn.offsetWidth; likeBtn.classList.add('pop'); }
  }, S.ac.signal);
  rail.appendChild(likeBtn);

  const cmtBtn = el('button', 'rail-btn');
  cmtBtn.innerHTML = ic('i-comment', 'ic') + '<span class="rail-count">' + fmt(v.comments || 0) + '</span>';
  on(cmtBtn, 'click', (e) => {
    e.stopPropagation();
    openComments(v.id, { onCountChange: (c) => { v.comments = c; cmtBtn.querySelector('.rail-count').textContent = fmt(c); } });
  }, S.ac.signal);
  rail.appendChild(cmtBtn);

  const bmBtn = el('button', 'rail-btn' + (v.bookmarked ? ' is-amber' : ''));
  bmBtn.innerHTML = ic('i-bookmark', 'ic') + '<span class="rail-count">' + fmt(v.bookmarks || 0) + '</span>';
  on(bmBtn, 'click', (e) => {
    e.stopPropagation();
    const r = repo.toggleBookmark(v.id);
    v.bookmarked = r.bookmarked; v.bookmarks = r.bookmarks;
    bmBtn.classList.toggle('is-amber', !!r.bookmarked);
    bmBtn.querySelector('.rail-count').textContent = fmt(r.bookmarks || 0);
    toast(r.bookmarked ? 'Saved' : 'Removed from saved');
  }, S.ac.signal);
  rail.appendChild(bmBtn);

  const shareBtn = el('button', 'rail-btn');
  shareBtn.innerHTML = ic('i-share', 'ic') + '<span class="rail-count">' + fmt(v.shares || 0) + '</span>';
  on(shareBtn, 'click', (e) => { e.stopPropagation(); openShareSheet(v); }, S.ac.signal);
  rail.appendChild(shareBtn);

  const vinyl = el('div', 'vinyl');
  vinyl.innerHTML = '<img src="' + esc(repo.posterUrl(v)) + '" alt="">' + '<span class="vinyl-note">' + ic('i-music', 'ic ic-xs') + '</span>';
  rail.appendChild(vinyl);

  slide.appendChild(rail);

  /* bottom-left meta */
  const meta = el('div', 'feed-meta');
  const tags = (v.hashtags || []).map((t) =>
    '<a class="htag" data-tag="' + esc(t) + '">#' + esc(t) + '</a>').join(' ');
  meta.innerHTML =
    '<div class="feed-user"><b>@' + esc(user.handle || '') + '</b>' +
      (user.verified ? '<span class="vcheck">' + ic('i-check', 'ic ic-xs') + '</span>' : '') + '</div>' +
    '<div class="feed-caption"><span class="cap-text">' + esc(v.caption || '') + '</span>' +
      '<button class="cap-more">more</button></div>' +
    (tags ? '<div class="feed-tags">' + tags + '</div>' : '') +
    '<div class="audio-ticker"><span class="tick-note">♪</span>' +
      '<div class="tick-mask"><div class="tick-track"><span>' + esc(v.audioTitle || 'Original audio') + ' — ' + esc(v.audioArtist || (user.displayName || '')) + '</span><span aria-hidden="true">' + esc(v.audioTitle || 'Original audio') + ' — ' + esc(v.audioArtist || (user.displayName || '')) + '</span></div></div></div>';
  slide.appendChild(meta);

  const moreBtn = meta.querySelector('.cap-more');
  const capText = meta.querySelector('.cap-text');
  on(moreBtn, 'click', (e) => {
    e.stopPropagation();
    const open = meta.classList.toggle('cap-open');
    moreBtn.textContent = open ? 'less' : 'more';
    void capText;
  }, S.ac.signal);
  meta.querySelectorAll('.htag').forEach((a) => on(a, 'click', (e) => {
    e.stopPropagation();
    location.hash = '#/discover?q=' + encodeURIComponent(a.dataset.tag);
  }, S.ac.signal));

  /* seekbar */
  const seek = el('div', 'seekbar');
  seek.innerHTML = '<div class="seek-fill"></div>';
  const fill = seek.querySelector('.seek-fill');
  vid.addEventListener('timeupdate', () => {
    if (vid.duration) fill.style.width = ((vid.currentTime / vid.duration) * 100).toFixed(2) + '%';
  }, { signal: S.ac.signal });
  slide.appendChild(seek);

  /* tap: single = play/pause, double = like burst */
  let lastTap = 0, tapTimer = null;
  on(tapLayer, 'pointerup', (e) => {
    const now = Date.now();
    if (now - lastTap < 300) {
      clearTimeout(tapTimer); lastTap = 0;
      doubleTap(S, slide, burstLayer, v, likeBtn, e);
    } else {
      lastTap = now;
      tapTimer = setTimeout(() => { singleTap(vid, flash); }, 280);
    }
  }, S.ac.signal);

  return slide;
}

function singleTap(vid, flash) {
  try {
    if (vid.paused) { vid.play().catch(() => {}); showFlash(flash, 'i-play'); }
    else { vid.pause(); showFlash(flash, 'i-pause'); }
  } catch (e) {}
}

function showFlash(flash, name) {
  flash.innerHTML = ic(name, 'ic ic-lg');
  flash.classList.remove('show'); void flash.offsetWidth; flash.classList.add('show');
  setTimeout(() => flash.classList.remove('show'), 450);
}

function doubleTap(S, slide, burstLayer, v, likeBtn, e) {
  const rect = slide.getBoundingClientRect();
  const x = (e.clientX || rect.width / 2) - rect.left;
  const y = (e.clientY || rect.height / 2) - rect.top;
  const heart = el('span', 'burst-heart');
  heart.innerHTML = ic('i-heart', 'ic');
  heart.style.left = x + 'px';
  heart.style.top = y + 'px';
  burstLayer.appendChild(heart);
  setTimeout(() => heart.remove(), 900);
  if (!v.liked) {
    const r = repo.toggleLike(v.id);
    v.liked = r.liked; v.likes = r.likes;
    likeBtn.classList.toggle('is-on', !!r.liked);
    likeBtn.querySelector('.rail-count').textContent = fmt(r.likes || 0);
    likeBtn.classList.remove('pop'); void likeBtn.offsetWidth; likeBtn.classList.add('pop');
  }
}

function openShareSheet(v) {
  const root = document.getElementById('sheet-root');
  if (!root) { toast('Share unavailable'); return; }
  const url = location.origin + location.pathname + '#/video/' + v.id;
  const back = el('div', 'sheet-backdrop');
  const sheet = el('div', 'share-sheet');
  const items = [
    { id: 'copy', name: 'i-link', label: 'Copy link' },
    { id: 'download', name: 'i-download', label: 'Download' }
  ];
  if (navigator.share) items.push({ id: 'share', name: 'i-share', label: 'Share…' });
  sheet.innerHTML = '<div class="drag-handle"></div><div class="share-title">Share video</div><div class="share-row"></div><button class="share-cancel">Cancel</button>';
  const row = sheet.querySelector('.share-row');
  items.forEach((it) => {
    const b = el('button', 'share-item');
    b.innerHTML = '<span class="share-ic">' + ic(it.name, 'ic') + '</span><span>' + it.label + '</span>';
    b.addEventListener('click', async () => {
      if (it.id === 'copy') {
        try {
          await navigator.clipboard.writeText(url);
          toast('Link copied');
        } catch (e) {
          const ta = document.createElement('textarea');
          ta.value = url; document.body.appendChild(ta); ta.select();
          try { document.execCommand('copy'); toast('Link copied'); }
          catch (e2) { toast('Copy failed'); }
          ta.remove();
        }
      } else if (it.id === 'download') {
        const a = document.createElement('a');
        a.href = repo.mediaUrl(v);
        a.download = (v.id || 'lucy-video') + '.mp4';
        document.body.appendChild(a); a.click(); a.remove();
        toast('Download started');
      } else if (it.id === 'share') {
        try { await navigator.share({ title: 'Lucy video', url }); } catch (e) {}
      }
      close();
    });
    row.appendChild(b);
  });
  function close() { back.remove(); sheet.remove(); }
  back.addEventListener('click', close);
  sheet.querySelector('.share-cancel').addEventListener('click', close);
  root.appendChild(back); root.appendChild(sheet);
}

export const HomeScreen = {
  mount(viewEl, params = {}) {
    if (current) { try { current.unmountFn(); } catch (e) {} }
    const ac = new AbortController();
    const S = {
      ac, root: viewEl, slides: [], videoEls: [], videos: [],
      io: null, activeIndex: -1,
      tab: 'foryou', muted: false,
      unbindVis: null,
      unmountFn: null
    };
    try { S.tab = localStorage.getItem(TAB_KEY) || 'foryou'; } catch (e) {}
    try { S.muted = localStorage.getItem(MUTE_KEY) === '1'; } catch (e) {}
    current = S;

    viewEl.innerHTML = '';
    viewEl.appendChild(headerBar(S));
    const feed = el('div', 'feed');
    viewEl.appendChild(feed);
    S.feed = feed;

    const singleId = params && (params.videoId || params.id);
    if (singleId) {
      let one = null;
      try { one = repo.getVideo(singleId); } catch (e) {}
      S.videos = one ? [one] : [];
      S.videos.forEach((v, i) => feed.appendChild(buildSlide(S, v, i)));
    } else {
      loadFeed(S);
    }

    S.io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting && en.intersectionRatio >= 0.6) {
          const idx = parseInt(en.target.dataset.index, 10);
          if (idx !== S.activeIndex) {
            S.activeIndex = idx;
            applyPlaybackPolicy(S.videoEls, idx);
          }
        }
      });
    }, { root: feed, threshold: 0.6 });
    S.slides.forEach((s) => S.io.observe(s));

    S.unbindVis = bindVisibility(() => pauseAll(S.videoEls));

    S.unmountFn = () => {
      try { pauseAll(S.videoEls); } catch (e) {}
      try { if (S.io) S.io.disconnect(); } catch (e) {}
      try { if (S.unbindVis) S.unbindVis(); } catch (e) {}
      try { ac.abort(); } catch (e) {}
      if (current === S) current = null;
      viewEl.innerHTML = '';
    };
  },
  unmount() {
    if (current && current.unmountFn) {
      try { current.unmountFn(); } catch (e) {}
    }
  }
};

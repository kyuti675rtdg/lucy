/* Project Lucy — Discover screen (search, trending, categories, creators).
 * Original design. Uses Lucy design tokens only.
 * Contract: export const DiscoverScreen = { mount(el, params={}), unmount() } */

import { repo } from './data/repository.js';
import { el, icon, fmt, esc, debounce, toast } from './ui.js';

let current = null;

function ic(name, cls) {
  const r = icon(name, cls);
  if (typeof r === 'string') return r;
  if (r && r.outerHTML) return r.outerHTML;
  const wrap = el('span', cls || '');
  if (r) wrap.appendChild(r);
  return wrap.outerHTML;
}

function hashQuery() {
  try {
    const h = location.hash || '';
    const qi = h.indexOf('?');
    if (qi < 0) return {};
    return Object.fromEntries(new URLSearchParams(h.slice(qi + 1)));
  } catch (e) { return {}; }
}

function videoCard(v, signal) {
  const b = el('button', 'grid-card');
  b.innerHTML =
    '<img loading="lazy" src="' + esc(repo.posterUrl(v)) + '" alt="">' +
    '<span class="grid-play">' + ic('i-play', 'ic ic-xs') + '</span>' +
    '<span class="grid-views">' + ic('i-play', 'ic ic-xs') + ' ' + fmt(v.views || 0) + '</span>';
  b.addEventListener('click', () => { location.hash = '#/video/' + v.id; }, { signal });
  return b;
}

function creatorCard(u, signal) {
  const card = el('div', 'creator-card');
  const following = repo.isFollowing(u.id);
  card.innerHTML =
    '<button class="creator-ava"><img loading="lazy" src="' + esc(u.avatar || '') + '" alt="' + esc(u.displayName || '') + '"></button>' +
    '<b class="creator-name">' + esc(u.displayName || u.handle) + '</b>' +
    '<span class="creator-handle">@' + esc(u.handle || '') + '</span>' +
    '<button class="follow-btn' + (following ? ' is-on' : '') + '">' + (following ? 'Following' : 'Follow') + '</button>';
  card.querySelector('.creator-ava').addEventListener('click', () => {
    location.hash = '#/user/' + encodeURIComponent(u.handle || u.id);
  }, { signal });
  const fb = card.querySelector('.follow-btn');
  fb.addEventListener('click', () => {
    const r = repo.toggleFollow(u.id);
    fb.classList.toggle('is-on', !!r.following);
    fb.textContent = r.following ? 'Following' : 'Follow';
  }, { signal });
  return card;
}

function userRow(u, signal) {
  const row = el('div', 'user-row');
  const following = repo.isFollowing(u.id);
  row.innerHTML =
    '<button class="user-row-main"><img loading="lazy" src="' + esc(u.avatar || '') + '" alt="">' +
    '<span class="user-row-txt"><b>' + esc(u.displayName || u.handle) + '</b>' +
    '<small>@' + esc(u.handle || '') + ' · ' + fmt(u.followers || 0) + ' followers</small></span></button>' +
    '<button class="follow-btn sm' + (following ? ' is-on' : '') + '">' + (following ? 'Following' : 'Follow') + '</button>';
  row.querySelector('.user-row-main').addEventListener('click', () => {
    location.hash = '#/user/' + encodeURIComponent(u.handle || u.id);
  }, { signal });
  const fb = row.querySelector('.follow-btn');
  fb.addEventListener('click', () => {
    const r = repo.toggleFollow(u.id);
    fb.classList.toggle('is-on', !!r.following);
    fb.textContent = r.following ? 'Following' : 'Follow';
  }, { signal });
  return row;
}

export const DiscoverScreen = {
  mount(viewEl, params = {}) {
    if (current) { try { current(); } catch (e) {} }
    const ac = new AbortController();
    const signal = ac.signal;
    const cleanup = () => {
      try { ac.abort(); } catch (e) {}
      if (current === cleanup) current = null;
    };
    current = cleanup;

    const initialQ = (params && params.q) || hashQuery().q || '';
    viewEl.innerHTML = '';
    const wrap = el('div', 'discover');
    wrap.innerHTML =
      '<div class="discover-searchbar">' +
        '<span class="ds-ic">' + ic('i-search', 'ic') + '</span>' +
        '<input class="ds-input" placeholder="Search videos, creators, hashtags" value="' + esc(initialQ) + '">' +
        '<button class="ds-clear hidden" aria-label="Clear">' + ic('i-x', 'ic ic-xs') + '</button>' +
      '</div>' +
      '<div class="discover-body"></div>';
    viewEl.appendChild(wrap);
    const input = wrap.querySelector('.ds-input');
    const clearBtn = wrap.querySelector('.ds-clear');
    const body = wrap.querySelector('.discover-body');

    function renderBrowse() {
      body.innerHTML = '';
      /* trending hashtags */
      let tags = [];
      try { tags = repo.getTrendingHashtags(12) || []; } catch (e) {}
      if (tags.length) {
        const sec = el('section', 'dsec');
        sec.innerHTML = '<h3 class="dsec-title">Trending</h3><div class="chip-row"></div>';
        const row = sec.querySelector('.chip-row');
        tags.forEach((t) => {
          const tag = typeof t === 'string' ? t : (t.tag || t.name || '');
          const count = typeof t === 'object' ? (t.count || t.videos) : null;
          const chip = el('button', 'chip');
          chip.innerHTML = '<span class="chip-fire">' + ic('i-fire', 'ic ic-xs') + '</span>#' + esc(tag) +
            (count != null ? '<small>' + fmt(count) + '</small>' : '');
          chip.addEventListener('click', () => { input.value = '#' + tag; doSearch('#' + tag); syncClear(); }, { signal });
          row.appendChild(chip);
        });
        body.appendChild(sec);
      }
      /* categories */
      let cats = [];
      try { cats = repo.getCategories() || []; } catch (e) {}
      cats.forEach((cat) => {
        let vids = [];
        try { vids = repo.getVideosByCategory(cat) || []; } catch (e) {}
        if (!vids.length) return;
        const sec = el('section', 'dsec');
        sec.innerHTML = '<h3 class="dsec-title">' + esc(cat) + '</h3><div class="hscroll"></div>';
        const sc = sec.querySelector('.hscroll');
        vids.slice(0, 12).forEach((v) => sc.appendChild(videoCard(v, signal)));
        body.appendChild(sec);
      });
      /* creators */
      let feedUsers = [];
      try {
        const seen = new Set();
        (repo.getFeed('foryou') || []).forEach((v) => {
          const u = v.user;
          if (u && u.id !== repo.me && !seen.has(u.id)) { seen.add(u.id); feedUsers.push(u); }
        });
      } catch (e) {}
      if (feedUsers.length) {
        const sec = el('section', 'dsec');
        sec.innerHTML = '<h3 class="dsec-title">Creators to follow</h3><div class="hscroll"></div>';
        const sc = sec.querySelector('.hscroll');
        feedUsers.slice(0, 12).forEach((u) => sc.appendChild(creatorCard(u, signal)));
        body.appendChild(sec);
      }
      if (!body.children.length) {
        body.innerHTML = '<div class="d-empty">Nothing to explore yet.</div>';
      }
    }

    function renderResults(q) {
      body.innerHTML = '';
      let res = { videos: [], users: [], hashtags: [] };
      try { res = repo.search(q) || res; } catch (e) {}
      const hasAny = (res.videos && res.videos.length) || (res.users && res.users.length) || (res.hashtags && res.hashtags.length);
      if (res.hashtags && res.hashtags.length) {
        const sec = el('section', 'dsec');
        sec.innerHTML = '<h3 class="dsec-title">Hashtags</h3><div class="chip-row"></div>';
        const row = sec.querySelector('.chip-row');
        res.hashtags.forEach((t) => {
          const tag = typeof t === 'string' ? t : (t.tag || t.name || '');
          const chip = el('button', 'chip');
          chip.textContent = '#' + tag;
          chip.addEventListener('click', () => { input.value = '#' + tag; doSearch('#' + tag); syncClear(); }, { signal });
          row.appendChild(chip);
        });
        body.appendChild(sec);
      }
      if (res.users && res.users.length) {
        const sec = el('section', 'dsec');
        sec.innerHTML = '<h3 class="dsec-title">Creators</h3><div class="user-list"></div>';
        const list = sec.querySelector('.user-list');
        res.users.forEach((u) => list.appendChild(userRow(u, signal)));
        body.appendChild(sec);
      }
      if (res.videos && res.videos.length) {
        const sec = el('section', 'dsec');
        sec.innerHTML = '<h3 class="dsec-title">Videos</h3><div class="grid-3"></div>';
        const grid = sec.querySelector('.grid-3');
        res.videos.forEach((v) => grid.appendChild(videoCard(v, signal)));
        body.appendChild(sec);
      }
      if (!hasAny) {
        body.innerHTML = '<div class="d-empty">No results for "' + esc(q) + '".<br>Try another search.</div>';
      }
    }

    const doSearch = debounce((q) => {
      const query = (q || '').trim();
      if (!query) renderBrowse();
      else renderResults(query);
    }, 300);

    function syncClear() {
      clearBtn.classList.toggle('hidden', !input.value);
    }
    input.addEventListener('input', () => { syncClear(); doSearch(input.value); }, { signal });
    clearBtn.addEventListener('click', () => {
      input.value = ''; syncClear(); renderBrowse(); input.focus();
    }, { signal });

    if (initialQ.trim()) { syncClear(); renderResults(initialQ.trim()); }
    else renderBrowse();
  },
  unmount() {
    if (current) { try { current(); } catch (e) {} current = null; }
  }
};

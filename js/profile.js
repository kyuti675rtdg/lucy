/* Project Lucy — Profile screen.
 * mount(el, { handle }) — no handle means the signed-in user (u01).
 * Original design. Uses Lucy design tokens only. */

import { repo } from './data/repository.js';
import { el, icon, fmt, esc, toast } from './ui.js';

let current = null;

function ic(name, cls) {
  const r = icon(name, cls);
  if (typeof r === 'string') return r;
  if (r && r.outerHTML) return r.outerHTML;
  const wrap = el('span', cls || '');
  if (r) wrap.appendChild(r);
  return wrap.outerHTML;
}

export const ProfileScreen = {
  mount(viewEl, params = {}) {
    if (current) { try { current(); } catch (e) {} }
    const ac = new AbortController();
    const signal = ac.signal;
    const cleanup = () => {
      try { ac.abort(); } catch (e) {}
      if (current === cleanup) current = null;
    };
    current = cleanup;
    const on = (t, e, f) => t.addEventListener(e, f, { signal });

    const handle = params && params.handle;
    let user = null;
    try {
      user = handle ? repo.getUser(handle) : repo.getUser(repo.me);
    } catch (e) {}
    if (!user) {
      viewEl.innerHTML = '<div class="d-empty">Profile not found.</div>';
      return;
    }
    const isMe = user.id === repo.me;
    const state = { tab: 'videos', user };

    viewEl.innerHTML = '';
    const root = el('div', 'profile');
    const hue = Number.isFinite(+user.hue) ? +user.hue : 265;
    root.innerHTML =
      '<div class="profile-scroll">' +
        '<div class="profile-cover" style="background:linear-gradient(135deg,hsl(' + hue + ',65%,42%),hsl(' + ((hue + 50) % 360) + ',70%,24%))">' +
          '<div class="cover-ava-wrap"><img class="cover-ava" src="' + esc(user.avatar || '') + '" alt="" style="filter:hue-rotate(' + hue + 'deg) saturate(1.15)"></div>' +
        '</div>' +
        '<div class="profile-id">' +
          '<div class="p-name-row"><b class="p-name">' + esc(user.displayName || '') + '</b>' +
            (user.verified ? '<span class="vcheck">' + ic('i-check', 'ic ic-xs') + '</span>' : '') + '</div>' +
          (user.altName ? '<div class="p-alt">' + esc(user.altName) + '</div>' : '') +
          '<div class="p-handle">@' + esc(user.handle || '') + '</div>' +
          (user.bio ? '<p class="p-bio">' + esc(user.bio) + '</p>' : '') +
          '<div class="p-stats">' +
            '<button class="p-stat"><b class="st-following">' + fmt(user.following || 0) + '</b><span>Following</span></button>' +
            '<button class="p-stat"><b class="st-followers">' + fmt(user.followers || 0) + '</b><span>Followers</span></button>' +
            '<button class="p-stat"><b class="st-likes">' + fmt(user.likes || 0) + '</b><span>Likes</span></button>' +
          '</div>' +
          '<div class="p-actions"></div>' +
        '</div>' +
        '<div class="p-tabs" role="tablist">' +
          '<button class="p-tab on" data-tab="videos">Videos</button>' +
          '<button class="p-tab" data-tab="liked">Liked</button>' +
          (isMe ? '<button class="p-tab" data-tab="saved">Saved</button>' : '') +
        '</div>' +
        '<div class="p-grid grid-3"></div>' +
      '</div>';
    viewEl.appendChild(root);

    const scroll = root.querySelector('.profile-scroll');
    const cover = root.querySelector('.profile-cover');
    const actions = root.querySelector('.p-actions');
    const grid = root.querySelector('.p-grid');

    /* collapsing cover */
    on(scroll, 'scroll', () => {
      const h = Math.max(76, 208 - scroll.scrollTop * 0.55);
      cover.style.height = h + 'px';
      cover.classList.toggle('is-collapsed', h <= 90);
    }, { passive: true });

    /* actions */
    if (isMe) {
      const editBtn = el('button', 'btn-primary edit-btn');
      editBtn.innerHTML = ic('i-edit', 'ic ic-xs') + ' Edit profile';
      on(editBtn, 'click', openEditModal);
      actions.appendChild(editBtn);
    } else {
      const following = repo.isFollowing(user.id);
      const fb = el('button', 'btn-primary follow-big' + (following ? ' is-on' : ''));
      fb.textContent = following ? 'Following' : 'Follow';
      on(fb, 'click', () => {
        const r = repo.toggleFollow(user.id);
        fb.classList.toggle('is-on', !!r.following);
        fb.textContent = r.following ? 'Following' : 'Follow';
        try { state.user = repo.getUser(user.id) || state.user; } catch (e) {}
        root.querySelector('.st-followers').textContent = fmt(state.user.followers || 0);
      });
      actions.appendChild(fb);
      const msgBtn = el('button', 'btn-ghost msg-btn');
      msgBtn.textContent = 'Message';
      on(msgBtn, 'click', () => { location.hash = '#/inbox'; });
      actions.appendChild(msgBtn);
    }

    function refreshIdentity() {
      try { state.user = repo.getUser(user.id) || state.user; } catch (e) {}
      const u = state.user;
      root.querySelector('.p-name').textContent = u.displayName || '';
      const alt = root.querySelector('.p-alt');
      if (alt) alt.textContent = u.altName || '';
      root.querySelector('.p-handle').textContent = '@' + (u.handle || '');
      const bio = root.querySelector('.p-bio');
      if (bio) bio.textContent = u.bio || '';
      root.querySelector('.st-following').textContent = fmt(u.following || 0);
      root.querySelector('.st-followers').textContent = fmt(u.followers || 0);
      root.querySelector('.st-likes').textContent = fmt(u.likes || 0);
      const h = Number.isFinite(+u.hue) ? +u.hue : hue;
      cover.style.background = 'linear-gradient(135deg,hsl(' + h + ',65%,42%),hsl(' + ((h + 50) % 360) + ',70%,24%))';
      root.querySelector('.cover-ava').style.filter = 'hue-rotate(' + h + 'deg) saturate(1.15)';
    }

    /* edit profile modal */
    function openEditModal() {
      const host = document.getElementById('sheet-root');
      if (!host) { toast('Edit unavailable'); return; }
      const u = state.user;
      const back = el('div', 'sheet-backdrop');
      const modal = el('div', 'modal');
      modal.innerHTML =
        '<div class="modal-head"><b>Edit profile</b>' +
          '<button class="icon-btn modal-close" aria-label="Close">' + ic('i-x', 'ic') + '</button></div>' +
        '<label class="field"><span>Display name</span><input class="f-name" maxlength="40" value="' + esc(u.displayName || '') + '"></label>' +
        '<label class="field"><span>Bio</span><textarea class="f-bio" maxlength="160" rows="3">' + esc(u.bio || '') + '</textarea></label>' +
        '<label class="field"><span>Theme hue <b class="hue-val">' + (u.hue || 0) + '°</b></span>' +
          '<input type="range" class="f-hue" min="0" max="360" value="' + (Number.isFinite(+u.hue) ? +u.hue : 265) + '">' +
          '<span class="hue-preview"></span></label>' +
        '<button class="btn-primary modal-save">Save</button>';
      const hueInput = modal.querySelector('.f-hue');
      const hueVal = modal.querySelector('.hue-val');
      const huePrev = modal.querySelector('.hue-preview');
      const paintHue = () => {
        hueVal.textContent = hueInput.value + '°';
        huePrev.style.background = 'hsl(' + hueInput.value + ',65%,50%)';
      };
      hueInput.addEventListener('input', paintHue);
      paintHue();
      const close = () => { back.remove(); modal.remove(); };
      back.addEventListener('click', close);
      modal.querySelector('.modal-close').addEventListener('click', close);
      modal.querySelector('.modal-save').addEventListener('click', () => {
        const patch = {
          displayName: modal.querySelector('.f-name').value.trim() || u.displayName,
          bio: modal.querySelector('.f-bio').value.trim(),
          hue: parseInt(hueInput.value, 10)
        };
        try {
          repo.updateProfile(patch);
          refreshIdentity();
          toast('Profile updated');
        } catch (e) {
          toast('Could not save changes');
        }
        close();
      });
      host.appendChild(back);
      host.appendChild(modal);
    }

    /* tabs + grids */
    const tabs = root.querySelectorAll('.p-tab');
    tabs.forEach((t) => on(t, 'click', () => {
      state.tab = t.dataset.tab;
      tabs.forEach((x) => x.classList.toggle('on', x === t));
      renderGrid();
    }));

    function videosFor(tab) {
      try {
        if (tab === 'videos') return repo.getVideosByUser(user.id) || [];
        if (tab === 'liked') return repo.getLikedVideos() || [];
        if (tab === 'saved') return isMe ? (repo.getBookmarkedVideos() || []) : [];
      } catch (e) {}
      return [];
    }

    function renderGrid() {
      grid.innerHTML = '';
      const vids = videosFor(state.tab);
      if (!vids.length) {
        grid.innerHTML = '<div class="d-empty grid-empty">' +
          (state.tab === 'videos' ? 'No videos yet.' : state.tab === 'liked' ? 'No liked videos yet.' : 'No saved videos yet.') +
          '</div>';
        return;
      }
      vids.forEach((v) => {
        const b = el('button', 'grid-card');
        b.innerHTML =
          '<img loading="lazy" src="' + esc(repo.posterUrl(v)) + '" alt="">' +
          '<span class="grid-play">' + ic('i-play', 'ic ic-xs') + '</span>' +
          '<span class="grid-views">' + ic('i-play', 'ic ic-xs') + ' ' + fmt(v.views || 0) + '</span>';
        on(b, 'click', () => { location.hash = '#/video/' + v.id; });
        grid.appendChild(b);
      });
    }
    renderGrid();
  },
  unmount() {
    if (current) { try { current(); } catch (e) {} current = null; }
  }
};

/* Project Lucy — Inbox screen (notifications + direct messages).
 * Original design. Uses Lucy design tokens only.
 * Contract: export const InboxScreen = { mount(el, params={}), unmount() } */

import { repo } from './data/repository.js';
import { el, icon, timeAgo, fmt, esc, toast } from './ui.js';

let current = null;

function ic(name, cls) {
  const r = icon(name, cls);
  if (typeof r === 'string') return r;
  if (r && r.outerHTML) return r.outerHTML;
  const wrap = el('span', cls || '');
  if (r) wrap.appendChild(r);
  return wrap.outerHTML;
}

function notifIcon(type) {
  switch (type) {
    case 'like': return 'i-heart';
    case 'comment': return 'i-comment';
    case 'follow': return 'i-user';
    default: return 'i-bell';
  }
}

function updateBadge() {
  const badge = document.getElementById('inbox-badge');
  if (!badge) return;
  let n = 0;
  try { n += repo.getUnreadNotificationCount() || 0; } catch (e) {}
  try {
    (repo.getThreads() || []).forEach((t) => { n += t.unread || 0; });
  } catch (e) {}
  badge.textContent = n > 99 ? '99+' : String(n);
  badge.classList.toggle('hidden', n <= 0);
}

export const InboxScreen = {
  mount(viewEl, params = {}) {
    if (current) { try { current(); } catch (e) {} }
    const ac = new AbortController();
    const signal = ac.signal;
    const S = { tab: 'notifications', threadId: null, offMsg: null, typingTimer: null };
    const cleanup = () => {
      try { ac.abort(); } catch (e) {}
      try { if (typeof S.offMsg === 'function') S.offMsg(); } catch (e) {}
      try { if (S.typingTimer) clearTimeout(S.typingTimer); } catch (e) {}
      if (current === cleanup) current = null;
    };
    current = cleanup;
    const on = (t, e, f) => t.addEventListener(e, f, { signal });

    viewEl.innerHTML = '';
    const root = el('div', 'inbox');
    root.innerHTML =
      '<div class="inbox-head"><b>Inbox</b></div>' +
      '<div class="seg seg-wide" role="tablist">' +
        '<button class="seg-btn" data-tab="notifications">Notifications</button>' +
        '<button class="seg-btn" data-tab="messages">Messages</button>' +
        '<span class="seg-pill"></span>' +
      '</div>' +
      '<div class="inbox-body"></div>';
    viewEl.appendChild(root);
    const body = root.querySelector('.inbox-body');
    const segBtns = root.querySelectorAll('.seg-btn');
    const seg = root.querySelector('.seg');
    const paintSeg = () => {
      segBtns.forEach((b) => b.classList.toggle('on', b.dataset.tab === S.tab));
      const active = root.querySelector('.seg-btn.on');
      if (active && seg) {
        seg.style.setProperty('--pill-l', active.offsetLeft + 'px');
        seg.style.setProperty('--pill-w', active.offsetWidth + 'px');
      }
    };
    segBtns.forEach((b) => on(b, 'click', () => {
      if (S.tab === b.dataset.tab) return;
      S.tab = b.dataset.tab;
      S.threadId = null;
      paintSeg();
      render();
    }));
    paintSeg();
    requestAnimationFrame(paintSeg);
    window.addEventListener('resize', paintSeg, { signal });

    function render() {
      if (S.tab === 'notifications') renderNotifications();
      else if (S.threadId) renderChat(S.threadId);
      else renderThreads();
    }

    /* ---------- notifications ---------- */
    function renderNotifications() {
      body.innerHTML = '';
      let notes = [];
      try { notes = repo.getNotifications() || []; } catch (e) {}
      const bar = el('div', 'notif-bar');
      bar.innerHTML = '<span>' + notes.filter((n) => !n.read).length + ' unread</span>' +
        '<button class="link-btn">Mark all read</button>';
      on(bar.querySelector('.link-btn'), 'click', () => {
        try { repo.markAllNotificationsRead(); } catch (e) {}
        updateBadge();
        renderNotifications();
        toast('All caught up');
      });
      body.appendChild(bar);
      const list = el('div', 'notif-list');
      if (!notes.length) {
        list.innerHTML = '<div class="d-empty">No notifications yet.<br>Likes, comments and follows will appear here.</div>';
      }
      notes.forEach((n) => {
        const actor = n.actor || n.user || {};
        const row = el('button', 'notif-row' + (n.read ? '' : ' is-unread'));
        row.innerHTML =
          '<span class="notif-ic">' + ic(notifIcon(n.type), 'ic ic-xs') + '</span>' +
          '<img class="notif-ava" src="' + esc(actor.avatar || '') + '" alt="">' +
          '<span class="notif-txt"><b>' + esc(actor.displayName || actor.handle || 'Someone') + '</b> ' +
            esc(n.text || n.message || '') +
            '<small>' + esc(timeAgo(n.createdAt)) + '</small></span>' +
          (n.read ? '' : '<span class="unread-dot"></span>');
        on(row, 'click', () => {
          try { repo.markNotificationRead(n.id); } catch (e) {}
          updateBadge();
          if (n.videoId) location.hash = '#/video/' + n.videoId;
          else renderNotifications();
        });
        list.appendChild(row);
      });
      body.appendChild(list);
    }

    /* ---------- threads ---------- */
    function renderThreads() {
      body.innerHTML = '';
      let threads = [];
      try { threads = repo.getThreads() || []; } catch (e) {}
      const list = el('div', 'thread-list');
      if (!threads.length) {
        list.innerHTML = '<div class="d-empty">No messages yet.<br>Say hello to a creator you follow.</div>';
      }
      threads.forEach((t) => {
        const u = t.user || t.participant || {};
        const lastTxt = (t.lastMessage && (t.lastMessage.text || t.lastMessage.body)) || t.snippet || '';
        const row = el('button', 'thread-row');
        row.innerHTML =
          '<img class="thread-ava" src="' + esc(u.avatar || '') + '" alt="">' +
          '<span class="thread-txt"><b>' + esc(u.displayName || u.handle || 'Chat') + '</b>' +
            '<small>' + esc(lastTxt) + '</small></span>' +
          '<span class="thread-meta"><small>' + esc(timeAgo(t.updatedAt)) + '</small>' +
            ((t.unread || 0) > 0 ? '<span class="count-badge">' + ((t.unread > 99) ? '99+' : t.unread) + '</span>' : '') + '</span>';
        on(row, 'click', () => { S.threadId = t.id; render(); });
        list.appendChild(row);
      });
      body.appendChild(list);
    }

    /* ---------- chat ---------- */
    function bubble(m) {
      const mine = m.mine || m.senderId === repo.me || m.fromMe;
      const b = el('div', 'bubble' + (mine ? ' mine' : ''));
      b.innerHTML = '<span>' + esc(m.text || m.body || '') + '</span>' +
        '<small>' + esc(timeAgo(m.createdAt)) + '</small>';
      return b;
    }

    function renderChat(threadId) {
      body.innerHTML = '';
      let thread = null;
      try { thread = (repo.getThreads() || []).find((t) => String(t.id) === String(threadId)); } catch (e) {}
      const u = (thread && (thread.user || thread.participant)) || {};
      const chat = el('div', 'chat');
      chat.innerHTML =
        '<div class="chat-head">' +
          '<button class="icon-btn chat-back" aria-label="Back">' + ic('i-chev-left', 'ic') + '</button>' +
          '<img class="chat-ava" src="' + esc(u.avatar || '') + '" alt="">' +
          '<b class="chat-name">' + esc(u.displayName || u.handle || 'Chat') + '</b>' +
        '</div>' +
        '<div class="chat-msgs"></div>' +
        '<div class="typing hidden"><span></span><span></span><span></span></div>' +
        '<div class="chat-input-row">' +
          '<input class="chat-input" maxlength="500" placeholder="Message…">' +
          '<button class="chat-send" aria-label="Send">' + ic('i-send', 'ic') + '</button>' +
        '</div>';
      body.appendChild(chat);
      const msgs = chat.querySelector('.chat-msgs');
      const typingEl = chat.querySelector('.typing');
      const input = chat.querySelector('.chat-input');

      let initial = [];
      try { initial = repo.getMessages(threadId) || []; } catch (e) {}
      initial.forEach((m) => msgs.appendChild(bubble(m)));
      msgs.scrollTop = msgs.scrollHeight;

      function showTyping() {
        typingEl.classList.remove('hidden');
        msgs.scrollTop = msgs.scrollHeight;
        try { if (S.typingTimer) clearTimeout(S.typingTimer); } catch (e) {}
        S.typingTimer = setTimeout(hideTyping, 6000);
      }
      function hideTyping() {
        typingEl.classList.add('hidden');
        try { if (S.typingTimer) clearTimeout(S.typingTimer); } catch (e) {}
        S.typingTimer = null;
      }

      try { if (typeof S.offMsg === 'function') S.offMsg(); } catch (e) {}
      S.offMsg = null;
      try {
        const off = repo.onMessage((evt) => {
          if (!evt || S.threadId !== threadId) {
            if (evt) { renderThreadsBadgeOnly(); }
            return;
          }
          const tid = evt.threadId != null ? String(evt.threadId) : null;
          if (tid && tid !== String(threadId)) { updateBadge(); return; }
          if (evt.type === 'typing' || evt.typing === true) { showTyping(); return; }
          const m = evt.message || evt;
          if (m && (m.text || m.body)) {
            hideTyping();
            msgs.appendChild(bubble(m));
            msgs.scrollTop = msgs.scrollHeight;
            updateBadge();
          }
        });
        if (typeof off === 'function') S.offMsg = off;
      } catch (e) {}

      function renderThreadsBadgeOnly() { updateBadge(); }

      const send = () => {
        const text = input.value.trim();
        if (!text) return;
        input.value = '';
        let m = null;
        try { m = repo.sendMessage(threadId, text); } catch (e) {}
        msgs.appendChild(bubble(m || { text, mine: true, createdAt: Date.now() }));
        msgs.scrollTop = msgs.scrollHeight;
      };
      on(chat.querySelector('.chat-send'), 'click', send);
      on(input, 'keydown', (e) => { if (e.key === 'Enter') send(); });
      on(chat.querySelector('.chat-back'), 'click', () => {
        S.threadId = null;
        try { if (typeof S.offMsg === 'function') S.offMsg(); } catch (e) {}
        S.offMsg = null;
        renderThreads();
      });
    }

    render();
    updateBadge();
  },
  unmount() {
    if (current) { try { current(); } catch (e) {} current = null; }
  }
};

export { updateBadge as refreshInboxBadge };

/* Project Lucy — comments bottom sheet.
 * openComments(videoId, { onCountChange }) -> close()
 * Original design. Uses Lucy design tokens only. */

import { repo } from './data/repository.js';
import { el, icon, timeAgo, fmt, esc, toast } from './ui.js';

const EMOJIS = ['😂', '❤️', '🔥', '👏', '😮', '😍', '🙏', '💯', '✨', '🎉', '😢', '👍'];

function ic(name, cls) {
  const r = icon(name, cls);
  if (typeof r === 'string') return r;
  if (r && r.outerHTML) return r.outerHTML;
  const wrap = el('span', cls || '');
  if (r) wrap.appendChild(r);
  return wrap.outerHTML;
}

function avatarUrl(u) {
  return (u && u.avatar) || '';
}

function nameOf(u) {
  if (!u) return 'lucy user';
  return u.displayName || (u.handle ? '@' + u.handle : 'lucy user');
}

function commentRow(c, S, depth) {
  const row = el('div', 'comment' + (depth > 0 ? ' is-reply' : ''));
  const u = c.user || {};
  row.innerHTML =
    '<img class="c-avatar" src="' + esc(avatarUrl(u)) + '" alt="">' +
    '<div class="c-body">' +
      '<div class="c-head"><b>' + esc(nameOf(u)) + '</b><span class="c-time">' + esc(timeAgo(c.createdAt)) + '</span></div>' +
      '<div class="c-text">' + esc(c.text || '') + '</div>' +
      '<div class="c-actions">' +
        '<button class="c-like' + (c.liked ? ' is-on' : '') + '">' + ic('i-heart', 'ic ic-xs') + '<span>' + fmt(c.likes || 0) + '</span></button>' +
        '<button class="c-reply-btn">Reply</button>' +
      '</div>' +
      '<div class="c-replies"></div>' +
      '<div class="c-replybox hidden">' +
        '<input class="c-reply-input" maxlength="300" placeholder="Reply to ' + esc(nameOf(u)) + '…">' +
        '<button class="c-reply-send">' + ic('i-send', 'ic ic-xs') + '</button>' +
      '</div>' +
    '</div>';

  const likeBtn = row.querySelector('.c-like');
  likeBtn.addEventListener('click', () => {
    const r = repo.likeComment(c.id);
    c.liked = r.liked; c.likes = r.likes;
    likeBtn.classList.toggle('is-on', !!r.liked);
    likeBtn.querySelector('span').textContent = fmt(r.likes || 0);
  }, { signal: S.signal });

  const replyBtn = row.querySelector('.c-reply-btn');
  const replyBox = row.querySelector('.c-replybox');
  const replyInput = row.querySelector('.c-reply-input');
  replyBtn.addEventListener('click', () => {
    replyBox.classList.toggle('hidden');
    if (!replyBox.classList.contains('hidden')) replyInput.focus();
  }, { signal: S.signal });
  const sendReply = () => {
    const text = replyInput.value.trim();
    if (!text) return;
    const nc = repo.addComment(S.videoId, text, c.id);
    const repliesBox = row.querySelector('.c-replies');
    repliesBox.appendChild(commentRow(nc, S, depth + 1));
    replyInput.value = '';
    replyBox.classList.add('hidden');
    S.refreshCount();
  };
  row.querySelector('.c-reply-send').addEventListener('click', sendReply, { signal: S.signal });
  replyInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendReply();
  }, { signal: S.signal });

  const repliesBox = row.querySelector('.c-replies');
  (c.replies || []).forEach((rc) => repliesBox.appendChild(commentRow(rc, S, depth + 1)));
  return row;
}

export function openComments(videoId, opts = {}) {
  const root = document.getElementById('sheet-root');
  if (!root) { toast('Comments unavailable'); return () => {}; }
  const ac = new AbortController();
  const signal = ac.signal;
  const S = { videoId, signal, refreshCount: null };

  const back = el('div', 'sheet-backdrop');
  const sheet = el('div', 'comments-sheet');
  sheet.innerHTML =
    '<div class="drag-handle" id="cs-grip"><span></span></div>' +
    '<div class="cs-head"><b class="cs-title">Comments</b>' +
      '<button class="icon-btn cs-close" aria-label="Close">' + ic('i-x', 'ic') + '</button></div>' +
    '<div class="cs-list"></div>' +
    '<div class="cs-emoji"></div>' +
    '<div class="cs-input-row">' +
      '<input class="cs-input" maxlength="300" placeholder="Add a comment…">' +
      '<button class="cs-send" aria-label="Send">' + ic('i-send', 'ic') + '</button>' +
    '</div>';

  const list = sheet.querySelector('.cs-list');
  const title = sheet.querySelector('.cs-title');
  const input = sheet.querySelector('.cs-input');

  function renderAll() {
    list.innerHTML = '';
    let comments = [];
    try { comments = repo.getComments(videoId) || []; } catch (e) {}
    if (!comments.length) {
      list.innerHTML = '<div class="cs-empty">Be the first to comment.</div>';
    } else {
      comments.forEach((c) => list.appendChild(commentRow(c, S, 0)));
    }
    refreshCount();
  }

  function refreshCount() {
    let n = 0;
    try { n = repo.getCommentCount(videoId); } catch (e) {}
    title.textContent = n + (n === 1 ? ' comment' : ' comments');
    if (typeof opts.onCountChange === 'function') {
      try { opts.onCountChange(n); } catch (e) {}
    }
  }
  S.refreshCount = refreshCount;

  /* emoji quick bar */
  const emojiBar = sheet.querySelector('.cs-emoji');
  EMOJIS.forEach((emo) => {
    const b = el('button', 'cs-emoji-btn');
    b.textContent = emo;
    b.setAttribute('aria-label', 'Insert emoji');
    b.addEventListener('click', () => {
      const s = input.selectionStart == null ? input.value.length : input.selectionStart;
      const epos = input.selectionEnd == null ? s : input.selectionEnd;
      input.value = input.value.slice(0, s) + emo + input.value.slice(epos);
      input.focus();
      try { input.setSelectionRange(s + emo.length, s + emo.length); } catch (e) {}
    }, { signal });
    emojiBar.appendChild(b);
  });

  const send = () => {
    const text = input.value.trim();
    if (!text) return;
    const nc = repo.addComment(videoId, text, null);
    const empty = list.querySelector('.cs-empty');
    if (empty) empty.remove();
    list.prepend(commentRow(nc, S, 0));
    list.scrollTop = 0;
    input.value = '';
    refreshCount();
  };
  sheet.querySelector('.cs-send').addEventListener('click', send, { signal });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); }, { signal });

  sheet.querySelector('.cs-close').addEventListener('click', () => close(), { signal });
  back.addEventListener('click', () => close(), { signal });

  /* drag to dismiss */
  const grip = sheet.querySelector('#cs-grip');
  let dragging = false, startY = 0, curY = 0;
  grip.addEventListener('pointerdown', (e) => {
    dragging = true; startY = e.clientY; curY = 0;
    sheet.style.transition = 'none';
    try { grip.setPointerCapture(e.pointerId); } catch (e2) {}
  }, { signal });
  grip.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    curY = Math.max(0, e.clientY - startY);
    sheet.style.transform = 'translateY(' + curY + 'px)';
  }, { signal });
  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    sheet.style.transition = 'transform 0.38s cubic-bezier(0.32, 0.72, 0.35, 1.15)';
    if (curY > 140) { close(); }
    else { sheet.style.transform = 'translateY(0)'; curY = 0; }
  };
  grip.addEventListener('pointerup', endDrag, { signal });
  grip.addEventListener('pointercancel', endDrag, { signal });

  function close() {
    try { ac.abort(); } catch (e) {}
    back.remove();
    sheet.remove();
  }

  root.appendChild(back);
  root.appendChild(sheet);
  renderAll();
  return close;
}

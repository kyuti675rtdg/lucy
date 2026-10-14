/* Project Lucy — shared UI helpers. */

/** Create a DOM element.
 * `el(tag, attrs, ...children)` where attrs is either a class-name string
 * (e.g. el('div', 'feed-slide')) or an attribute object. Event handlers can
 * be passed as `onClick` etc. in the object form.
 */
export function el(tag, attrs, ...children){
  const node = document.createElement(tag);
  if(typeof attrs === 'string'){
    if(attrs) node.className = attrs;
  }else{
    for(const [k, v] of Object.entries(attrs || {})){
      if(v == null || v === false) continue;
      if(k === 'class' || k === 'className') node.className = v;
      else if(k === 'html') node.innerHTML = v;
      else if(k === 'text') node.textContent = v;
      else if(k.startsWith('on') && typeof v === 'function'){
        node.addEventListener(k.slice(2).toLowerCase(), v);
      }
      else if(v === true) node.setAttribute(k, '');
      else node.setAttribute(k, v);
    }
  }
  const append = (c) => {
    if(c == null || c === false) return;
    if(Array.isArray(c)){ c.forEach(append); return; }
    node.append(c && c.nodeType ? c : document.createTextNode(String(c)));
  };
  children.forEach(append);
  return node;
}

/** Original Lucy icon as an inline SVG element:
 * `<svg class="ic ${cls}"><use href="assets/icons.svg#i-${name}"/></svg>`
 */
export function icon(name, cls){
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', ('ic ' + (cls || '')).trim());
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', 'assets/icons.svg#i-' + name);
  svg.appendChild(use);
  return svg;
}

/** Toast notification into #toast-root, auto-dismissed after 2.2s. */
export function toast(msg){
  const root = document.getElementById('toast-root');
  if(!root) return;
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = String(msg == null ? '' : msg);
  root.appendChild(t);
  setTimeout(() => {
    t.classList.add('out');
    setTimeout(() => t.remove(), 300);
  }, 2200);
}

/** Relative time: "just now", "5m", "2h", "3d", "2w", else "Oct 12". */
export function timeAgo(iso){
  const ms = Date.parse(iso);
  if(Number.isNaN(ms)) return '';
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if(s < 10) return 'just now';
  if(s < 60) return s + 's';
  const m = Math.floor(s / 60);
  if(m < 60) return m + 'm';
  const h = Math.floor(m / 60);
  if(h < 24) return h + 'h';
  const d = Math.floor(h / 24);
  if(d < 7) return d + 'd';
  const w = Math.floor(d / 7);
  if(w < 5) return w + 'w';
  return new Date(ms).toLocaleDateString('en-US', {month: 'short', day: 'numeric'});
}

/** Compact number: 999 -> "999", 1500 -> "1.5K", 2.3M -> "2.3M". */
export function fmt(n){
  const x = Number(n);
  if(!Number.isFinite(x)) return '0';
  const trim = (v) => String(Math.round(v * 10) / 10);
  const a = Math.abs(x);
  if(a < 1000) return String(Math.round(x));
  if(a < 1000000) return trim(x / 1000) + 'K';
  return trim(x / 1000000) + 'M';
}

/** HTML-escape a string. */
export function esc(s){
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}

/** Debounce: invoke fn only after ms quiet. */
export function debounce(fn, ms){
  let t = null;
  return (...args) => {
    if(t) clearTimeout(t);
    t = setTimeout(() => { t = null; fn(...args); }, ms);
  };
}

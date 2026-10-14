/* Project Lucy — Create studio screen (record / upload / publish).
 * Original design. Uses Lucy design tokens only.
 * Contract: export const CreateScreen = { mount(el, params={}), unmount() }
 * Honest labeling: device mic audio is what gets recorded; the picked
 * track is stored as a credit only. */

import { repo } from './data/repository.js';
import { el, icon, esc, toast } from './ui.js';

const DURATIONS = [
  { sec: 15, label: '15s' },
  { sec: 60, label: '60s' },
  { sec: 180, label: '3m' }
];

const FILTERS = [
  { name: 'Normal', css: 'none' },
  { name: 'Warm', css: 'saturate(1.4) sepia(0.25)' },
  { name: 'Cool', css: 'saturate(1.1) hue-rotate(-15deg)' },
  { name: 'Mono', css: 'grayscale(1)' },
  { name: 'Vivid', css: 'saturate(1.8) contrast(1.15)' }
];

const MIME_CHAIN = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
  'video/mp4'
];

let current = null;

function ic(name, cls) {
  const r = icon(name, cls);
  if (typeof r === 'string') return r;
  if (r && r.outerHTML) return r.outerHTML;
  const wrap = el('span', cls || '');
  if (r) wrap.appendChild(r);
  return wrap.outerHTML;
}

function fmtClock(sec) {
  const s = Math.max(0, Math.ceil(sec));
  const m = Math.floor(s / 60);
  return m + ':' + String(s % 60).padStart(2, '0');
}

async function captureThumbnail(blob) {
  try {
    const url = URL.createObjectURL(blob);
    try {
      const v = document.createElement('video');
      v.muted = true;
      v.playsInline = true;
      v.preload = 'auto';
      v.src = url;
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('thumb timeout')), 5000);
        v.onloadedmetadata = () => {
          try { v.currentTime = Math.min(0.6, (v.duration || 1.2) / 3); } catch (e) {}
        };
        v.onseeked = () => { clearTimeout(timer); resolve(); };
        v.onerror = () => { clearTimeout(timer); reject(new Error('thumb error')); };
      });
      const c = document.createElement('canvas');
      c.width = 360; c.height = 640;
      const ctx = c.getContext('2d');
      const vw = v.videoWidth || 360, vh = v.videoHeight || 640;
      const scale = Math.max(c.width / vw, c.height / vh);
      const dw = vw * scale, dh = vh * scale;
      ctx.drawImage(v, (c.width - dw) / 2, (c.height - dh) / 2, dw, dh);
      const pb = await new Promise((resolve) => c.toBlob(resolve, 'image/jpeg', 0.7));
      return pb;
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch (e) {
    return null;
  }
}

export const CreateScreen = {
  mount(viewEl, params = {}) {
    if (current) { try { current(); } catch (e) {} }
    const ac = new AbortController();
    const signal = ac.signal;
    const S = {
      stream: null,
      recorder: null,
      chunks: [],
      mime: null,
      recording: false,
      recTimer: null,
      recStart: 0,
      durationSec: 15,
      filter: FILTERS[0],
      audioTitle: '',
      audioArtist: '',
      clipBlob: null,
      clipUrl: null,
      clipDuration: 0,
      actualDuration: 0,
      dead: false
    };
    const cleanup = () => {
      S.dead = true;
      try { ac.abort(); } catch (e) {}
      try { if (S.recTimer) clearInterval(S.recTimer); } catch (e) {}
      try {
        if (S.recorder && S.recorder.state !== 'inactive') S.recorder.stop();
      } catch (e) {}
      try {
        if (S.stream) S.stream.getTracks().forEach((t) => t.stop());
      } catch (e) {}
      try { if (S.clipUrl) URL.revokeObjectURL(S.clipUrl); } catch (e) {}
      if (current === cleanup) current = null;
    };
    current = cleanup;
    const on = (t, e, f) => t.addEventListener(e, f, { signal });

    viewEl.innerHTML = '';
    const root = el('div', 'studio');
    root.innerHTML =
      '<div class="studio-head"><b>New video</b></div>' +
      '<div class="studio-stage">' +
        '<video class="studio-video hidden" muted playsinline autoplay></video>' +
        '<div class="studio-fallback hidden">' +
          '<span class="sf-ic">' + ic('i-camera', 'ic ic-lg') + '</span>' +
          '<p>Camera is not available.<br>You can upload a video instead.</p>' +
          '<button class="btn-primary sf-upload">Choose video</button>' +
        '</div>' +
        '<div class="rec-badge hidden"><span class="rec-dot"></span>REC <span class="rec-time">0:15</span></div>' +
        '<div class="count-ring hidden"><svg viewBox="0 0 72 72"><circle class="cr-bg" cx="36" cy="36" r="30"></circle><circle class="cr-fg" cx="36" cy="36" r="30"></circle></svg><span class="cr-num">15</span></div>' +
      '</div>' +
      '<div class="studio-panel">' +
        '<div class="dur-seg" role="tablist"></div>' +
        '<div class="filter-row"></div>' +
        '<button class="sound-pick"><span class="sp-ic">' + ic('i-music', 'ic') + '</span><span class="sp-label">Add sound</span><span class="sp-chev">' + ic('i-chev-down', 'ic ic-xs') + '</span></button>' +
        '<div class="sound-list hidden"></div>' +
        '<p class="sound-note hidden">Track is saved as a credit — your video records device microphone audio.</p>' +
        '<div class="studio-actions">' +
          '<button class="btn-ghost upload-instead">Upload instead</button>' +
          '<button class="rec-btn" aria-label="Record"><span class="rec-btn-core"></span></button>' +
          '<span class="rec-btn-spacer"></span>' +
        '</div>' +
      '</div>' +
      '<input type="file" class="hidden-file" accept="video/*" hidden>';
    viewEl.appendChild(root);

    const videoEl = root.querySelector('.studio-video');
    const fallback = root.querySelector('.studio-fallback');
    const recBadge = root.querySelector('.rec-badge');
    const recTime = root.querySelector('.rec-time');
    const countRing = root.querySelector('.count-ring');
    const crNum = root.querySelector('.cr-num');
    const crFg = root.querySelector('.cr-fg');
    const panel = root.querySelector('.studio-panel');
    const fileInput = root.querySelector('.hidden-file');
    const RING_C = 2 * Math.PI * 30;
    crFg.style.strokeDasharray = String(RING_C);

    /* duration selector */
    const durSeg = root.querySelector('.dur-seg');
    DURATIONS.forEach((d, idx) => {
      const b = el('button', 'dur-btn' + (idx === 0 ? ' on' : ''));
      b.textContent = d.label;
      on(b, 'click', () => {
        if (S.recording) return;
        S.durationSec = d.sec;
        durSeg.querySelectorAll('.dur-btn').forEach((x) => x.classList.remove('on'));
        b.classList.add('on');
      });
      durSeg.appendChild(b);
    });

    /* filters */
    const filterRow = root.querySelector('.filter-row');
    FILTERS.forEach((f, idx) => {
      const b = el('button', 'filter-btn' + (idx === 0 ? ' on' : ''));
      b.innerHTML = '<span class="filter-dot" style="filter:' + (f.css === 'none' ? 'none' : f.css) + '"></span>' + esc(f.name);
      on(b, 'click', () => {
        S.filter = f;
        videoEl.style.filter = f.css;
        filterRow.querySelectorAll('.filter-btn').forEach((x) => x.classList.remove('on'));
        b.classList.add('on');
      });
      filterRow.appendChild(b);
    });

    /* sound picker */
    const soundPick = root.querySelector('.sound-pick');
    const soundList = root.querySelector('.sound-list');
    const soundNote = root.querySelector('.sound-note');
    const spLabel = root.querySelector('.sp-label');
    let tracks = [];
    try { tracks = repo.getAudioTracks() || []; } catch (e) {}
    if (tracks.length) {
      tracks.forEach((t, idx) => {
        const lab = el('label', 'track-row');
        lab.innerHTML =
          '<input type="radio" name="lucy-track" value="' + idx + '">' +
          '<span class="track-note-ic">' + ic('i-music', 'ic ic-xs') + '</span>' +
          '<span class="track-txt"><b>' + esc(t.title || 'Untitled') + '</b><small>' + esc(t.artist || '') + '</small></span>' +
          '<span class="track-check">' + ic('i-check', 'ic ic-xs') + '</span>';
        soundList.appendChild(lab);
      });
      on(soundPick, 'click', () => {
        soundList.classList.toggle('hidden');
        soundNote.classList.toggle('hidden', soundList.classList.contains('hidden'));
      });
      soundList.addEventListener('change', (e) => {
        const t = tracks[parseInt(e.target.value, 10)];
        if (t) {
          S.audioTitle = t.title || '';
          S.audioArtist = t.artist || '';
          spLabel.textContent = S.audioTitle + (S.audioArtist ? ' — ' + S.audioArtist : '');
          soundList.querySelectorAll('.track-row').forEach((r) => r.classList.remove('on'));
          e.target.closest('.track-row').classList.add('on');
        }
      }, { signal });
    } else {
      soundPick.style.display = 'none';
    }

    /* camera */
    async function startCamera() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showFallback();
        return;
      }
      try {
        S.stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: true
        });
        if (S.dead) { S.stream.getTracks().forEach((t) => t.stop()); return; }
        videoEl.srcObject = S.stream;
        videoEl.classList.remove('hidden');
        videoEl.style.filter = S.filter.css;
      } catch (e) {
        showFallback();
      }
    }
    function showFallback() {
      fallback.classList.remove('hidden');
      toast('Camera unavailable — upload a video instead');
    }

    on(root.querySelector('.sf-upload'), 'click', () => fileInput.click());
    on(root.querySelector('.upload-instead'), 'click', () => fileInput.click());
    on(fileInput, 'change', () => {
      const f = fileInput.files && fileInput.files[0];
      if (!f) return;
      const blob = f.slice(0, f.size, f.type || 'video/mp4');
      openReview(blob, 0);
      fileInput.value = '';
    });

    /* recording */
    const recBtn = root.querySelector('.rec-btn');
    function pickMime() {
      if (!window.MediaRecorder) return null;
      return MIME_CHAIN.find((t) => {
        try { return MediaRecorder.isTypeSupported(t); } catch (e) { return false; }
      }) || null;
    }
    function tick() {
      const elapsed = (Date.now() - S.recStart) / 1000;
      const remain = Math.max(0, S.durationSec - elapsed);
      recTime.textContent = fmtClock(remain);
      crNum.textContent = String(Math.ceil(remain));
      crFg.style.strokeDashoffset = String(RING_C * (1 - remain / S.durationSec));
      if (remain <= 0) stopRecording();
    }
    function startRecording() {
      if (S.recording || !S.stream) return;
      const mime = pickMime();
      if (!mime) { toast('Recording is not supported on this device'); return; }
      S.mime = mime;
      S.chunks = [];
      try {
        S.recorder = new MediaRecorder(S.stream, { mimeType: mime, videoBitsPerSecond: 2500000 });
      } catch (e) {
        try { S.recorder = new MediaRecorder(S.stream); } catch (e2) {
          toast('Could not start recording'); return;
        }
      }
      S.recorder.ondataavailable = (e) => { if (e.data && e.data.size) S.chunks.push(e.data); };
      S.recorder.onstop = () => {
        if (S.dead) return;
        const type = S.mime || 'video/webm';
        const blob = new Blob(S.chunks, { type });
        const dur = Math.min(S.durationSec, (Date.now() - S.recStart) / 1000);
        openReview(blob, dur);
      };
      S.recording = true;
      S.recStart = Date.now();
      recBadge.classList.remove('hidden');
      countRing.classList.remove('hidden');
      recBtn.classList.add('is-rec');
      tick();
      S.recTimer = setInterval(tick, 250);
      try { S.recorder.start(250); } catch (e) { stopRecording(); }
    }
    function stopRecording() {
      if (!S.recording) return;
      S.recording = false;
      try { if (S.recTimer) clearInterval(S.recTimer); } catch (e) {}
      S.recTimer = null;
      recBadge.classList.add('hidden');
      countRing.classList.add('hidden');
      recBtn.classList.remove('is-rec');
      try {
        if (S.recorder && S.recorder.state !== 'inactive') S.recorder.stop();
      } catch (e) {}
    }
    on(recBtn, 'click', () => {
      if (S.recording) stopRecording();
      else startRecording();
    });

    /* review + caption are rendered into the same root */
    function openReview(blob, dur) {
      stopRecording();
      S.clipBlob = blob;
      S.clipDuration = dur || 0;
      try { if (S.clipUrl) URL.revokeObjectURL(S.clipUrl); } catch (e) {}
      S.clipUrl = URL.createObjectURL(blob);
      root.innerHTML =
        '<div class="studio-head"><button class="icon-btn back-btn" aria-label="Back">' + ic('i-chev-left', 'ic') + '</button><b>Review</b><span class="head-spacer"></span></div>' +
        '<div class="studio-stage"><video class="studio-video review-video" src="' + S.clipUrl + '" controls playsinline loop></video></div>' +
        '<div class="studio-panel review-panel">' +
          '<div class="review-chips">' +
            '<span class="meta-chip">Filter: ' + esc(S.filter.name) + '</span>' +
            (S.audioTitle ? '<span class="meta-chip">♪ ' + esc(S.audioTitle) + '</span>' : '') +
          '</div>' +
          '<div class="review-actions">' +
            '<button class="btn-ghost retake-btn">Retake</button>' +
            '<button class="btn-primary continue-btn">Continue</button>' +
          '</div>' +
        '</div>';
      const rv = root.querySelector('.review-video');
      try { rv.play().catch(() => {}); } catch (e) {}
      on(root.querySelector('.back-btn'), 'click', () => { cleanup(); CreateScreen.mount(viewEl, params); });
      on(root.querySelector('.retake-btn'), 'click', () => { cleanup(); CreateScreen.mount(viewEl, params); });
      on(root.querySelector('.continue-btn'), 'click', openComposer);
    }

    function openComposer() {
      root.innerHTML =
        '<div class="studio-head"><button class="icon-btn back-btn" aria-label="Back">' + ic('i-chev-left', 'ic') + '</button><b>New post</b><span class="head-spacer"></span></div>' +
        '<div class="composer">' +
          '<div class="composer-top">' +
            '<video class="composer-thumb" src="' + S.clipUrl + '" muted playsinline preload="metadata"></video>' +
            '<textarea class="composer-text" maxlength="500" placeholder="Write a caption…"></textarea>' +
          '</div>' +
          '<p class="composer-hint">Add #hashtags to reach more people. Example: #buna #addisababa #dance</p>' +
          '<div class="review-chips">' +
            '<span class="meta-chip">Filter: ' + esc(S.filter.name) + '</span>' +
            (S.audioTitle ? '<span class="meta-chip">♪ ' + esc(S.audioTitle) + (S.audioArtist ? ' — ' + esc(S.audioArtist) : '') + '</span>' : '<span class="meta-chip">Original audio</span>') +
          '</div>' +
          '<button class="btn-primary publish-btn">Publish</button>' +
        '</div>';
      on(root.querySelector('.back-btn'), 'click', () => openReview(S.clipBlob, S.clipDuration));
      const ta = root.querySelector('.composer-text');
      try { ta.focus(); } catch (e) {}
      on(root.querySelector('.publish-btn'), 'click', async () => {
        const btn = root.querySelector('.publish-btn');
        btn.disabled = true;
        btn.textContent = 'Publishing…';
        const caption = ta.value.trim() || 'New video on Lucy';
        let posterBlob = null;
        try { posterBlob = await captureThumbnail(S.clipBlob); } catch (e) {}
        const payload = {
          blob: S.clipBlob,
          caption,
          audioTitle: S.audioTitle || 'Original audio',
          audioArtist: S.audioArtist || '',
          durationSec: Math.max(1, Math.round(S.clipDuration || S.durationSec)),
          posterBlob
        };
        try {
          repo.postVideo(payload);
          toast('Published');
          cleanup();
          location.hash = '#/home';
        } catch (e) {
          toast('Publish failed — please try again');
          btn.disabled = false;
          btn.textContent = 'Publish';
        }
      });
    }

    startCamera();
  },
  unmount() {
    if (current) { try { current(); } catch (e) {} current = null; }
  }
};

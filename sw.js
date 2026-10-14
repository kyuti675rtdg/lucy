/* Lucy service worker — offline-first app shell + media cache. */
const CACHE = 'lucy-v1';

const APP_SHELL = [
  '/', 'index.html', 'manifest.json', 'offline.html',
  'css/tokens.css', 'css/base.css', 'css/feed.css', 'css/screens.css',
  'assets/icons.svg', 'assets/logo.svg',
  'assets/icons/icon-192.png', 'assets/icons/icon-512.png', 'assets/icons/icon-maskable-512.png',
  'data/seed_users.json', 'data/seed_videos.json', 'data/seed_comments.json',
  'data/seed_inbox.json', 'data/seed_graph.json',
  // avatars generated programmatically (u01..u30)
  ...Array.from({length: 30}, (_, i) => 'assets/avatars/u' + String(i + 1).padStart(2, '0') + '.svg'),
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      // cache each file independently so one missing asset can't fail the install
      .then((cache) => Promise.all(APP_SHELL.map((url) => cache.add(url).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isMedia(url){
  return url.includes('/assets/videos/') || url.includes('/assets/posters/');
}

function putInCache(request, response){
  if(!response || !response.ok) return response;
  const copy = response.clone();
  caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
  return response;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if(req.method !== 'GET') return;

  // (a) Range requests (video seeking): straight to network, never cached.
  if(req.headers.has('range')){
    event.respondWith(fetch(req));
    return;
  }

  const url = req.url;

  // (b) video/poster media: cache-first, populate cache on miss.
  if(isMedia(url)){
    event.respondWith(
      caches.match(req).then((hit) => {
        if(hit) return hit;
        return fetch(req).then((res) => putInCache(req, res))
          .catch(() => caches.match(req));
      })
    );
    return;
  }

  // (c) navigations: network-first, then cache, then the offline page.
  if(req.mode === 'navigate'){
    event.respondWith(
      fetch(req)
        .then((res) => putInCache(req, res))
        .catch(() => caches.match(req).then((hit) => hit || caches.match('offline.html')))
    );
    return;
  }

  // (d) default: cache-first, then network (cached when same-origin + ok).
  event.respondWith(
    caches.match(req).then((hit) => {
      if(hit) return hit;
      return fetch(req).then((res) => {
        if(res && res.ok && new URL(url).origin === self.location.origin) return putInCache(req, res);
        return res;
      }).catch(() => {
        if(req.destination === 'document') return caches.match('offline.html');
        throw new Error('offline and not cached: ' + url);
      });
    })
  );
});

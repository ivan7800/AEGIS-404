/* AEGIS 404 — service worker · offline-first, cache-versioned */
const CACHE = 'aegis404-v2.1.1';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

/* Network-first para el documento HTML: al publicar una versión nueva el usuario
   la ve en la primera carga, no en la siguiente. Si la red falla o tarda, se sirve
   la copia cacheada, así la app sigue siendo offline-first.
   Cache-first para el resto de assets (iconos, manifest): no cambian entre versiones. */
const NAV_TIMEOUT = 3000;

function networkFirst(req) {
  return new Promise(resolve => {
    let settled = false;
    const fallback = () => {
      if (settled) return;
      settled = true;
      caches.match(req).then(hit => resolve(hit || caches.match('./index.html')));
    };
    const timer = setTimeout(fallback, NAV_TIMEOUT);

    fetch(req).then(res => {
      clearTimeout(timer);
      if (settled) return;
      if (!res || !res.ok) return fallback();
      settled = true;
      caches.open(CACHE).then(c => c.put(req, res.clone()));
      resolve(res);
    }).catch(() => { clearTimeout(timer); fallback(); });
  });
}

function cacheFirst(req) {
  return caches.match(req).then(hit => hit || fetch(req).then(res => {
    if (res.ok) {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy));
    }
    return res;
  }).catch(() => caches.match('./index.html')));
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  // Only handle same-origin requests. Cross-origin ones (CORS relays, Observatory
  // API) pass straight to the network, so live-scan responses are never served
  // from — or corrupted by — the cache.
  if (new URL(req.url).origin !== self.location.origin) return;

  const isDoc = req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html');

  e.respondWith(isDoc ? networkFirst(req) : cacheFirst(req));
});

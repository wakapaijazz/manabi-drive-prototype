const CACHE = 'manabi-drive-v19-cockpit';
const RESOURCES = [
  './', './index.html', './style.css?v=cockpit', './questions.js?v=stages5', './app.js?v=cockpit',
  './vendor/three.min.js', './road-geometry.js?v=stages5', './drive-3d.js?v=stages5',
  './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'
];
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(RESOURCES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then(names => Promise.all(names.filter(n => n!==CACHE).map(n => caches.delete(n)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  const appShell = event.request.mode === 'navigate'
    || ['script', 'style'].includes(event.request.destination);
  if (appShell) {
    event.respondWith(
      fetch(event.request).then((response) => {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(event.request, copy)).catch(() => {});
        return response;
      }).catch(() => caches.match(event.request).then(cached => cached || caches.match(event.request, {ignoreSearch: true})).then(cached => {
        if (cached) return cached;
        return event.request.mode === 'navigate' ? caches.match('./index.html') : Response.error();
      }))
    );
    return;
  }
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
});

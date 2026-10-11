/*
 * AKAD TRACKER — service worker (cangkang aplikasi / PWA).
 * Hanya berkas tampilan (HTML, CSS, JS, ikon) yang disimpan agar aplikasi terbuka cepat dan bisa dipasang.
 * Data jadwal TIDAK disimpan di sini — selalu diambil dari Google Apps Script.
 * Strategi: jaringan dulu (selalu versi terbaru setelah git push), salinan cache hanya saat offline.
 */
const CACHE = 'akad-tracker-v2';
const SHELL = ['./', './index.html', './form.html', './css/style.css', './css/form.css',
  './js/config.js', './js/api.js', './js/app.js', './js/form.js', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './icons/apple-touch-icon.png', './icons/favicon-48.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;   // panggilan ke Apps Script tidak disentuh
  e.respondWith(
    fetch(e.request).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {}); }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('./index.html')))
  );
});

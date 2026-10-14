/*
 * AKAD TRACKER v2.2 — PWA DIHAPUS.
 * Berkas ini hanya "pemutus": perangkat yang dulu memasang service worker AKAD TRACKER
 * akan memuat versi ini, menghapus cache lamanya, lalu mencabut dirinya sendiri.
 * Jangan dihapus dari repository selama masih ada perangkat lama.
 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.indexOf('akad-tracker') === 0).map((k) => caches.delete(k))))
      .then(() => self.registration.unregister())
  );
});

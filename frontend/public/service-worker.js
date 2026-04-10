/* No-op service worker — satisfies PWA install requirement.
   skipWaiting + clients.claim ensures updates apply immediately. */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Never cache schedules: every request still goes to the network.
// A fetch handler also supports installation in older Android browsers.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => event.respondWith(fetch(event.request)));

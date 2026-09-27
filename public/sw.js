// Global Klinik service worker — offline app shell, fast assets, never caches private API data.
const VERSION = 'gk-v1.0.0';
const SHELL = [
  '/app/', '/app/theme.js', '/app/app.css', '/app/app.js', '/app/lib.js', '/app/views.js', '/app/admin.js', '/app/clinic.js', '/app/portal.js',
  '/assets/css/site.css', '/assets/js/site.js', '/assets/js/icons.js', '/assets/js/markdown.js', '/assets/vendor/qrcode.mjs',
  '/assets/img/logo.svg', '/assets/img/logo-mark.svg', '/assets/img/favicon.svg', '/assets/img/icon-192.png', '/offline.html', '/manifest.webmanifest',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => Promise.allSettled(SHELL.map((u) => c.add(new Request(u, { cache: 'reload' }))))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k.startsWith('gk-')).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Fonts: cache-first
  if (url.hostname.endsWith('gstatic.com') || url.hostname === 'fonts.googleapis.com') {
    e.respondWith(caches.open(VERSION + '-fonts').then(async (c) => (await c.match(req)) || fetch(req).then((r) => { c.put(req, r.clone()); return r; })));
    return;
  }
  if (url.origin !== location.origin) return;
  // Never cache API or private files/documents
  if (url.pathname.startsWith('/api/') && url.pathname !== '/api/public/booking-data') return;
  if (url.pathname.startsWith('/media/') || url.pathname.startsWith('/assets/')) {
    // stale-while-revalidate
    e.respondWith(caches.open(VERSION).then(async (c) => {
      const cached = await c.match(req, { ignoreSearch: url.pathname.startsWith('/assets/') });
      const net = fetch(req).then((r) => { if (r.ok) c.put(req, r.clone()); return r; }).catch(() => cached);
      return cached || net;
    }));
    return;
  }
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((r) => {
          if (r.ok && (url.pathname === '/' || url.pathname.startsWith('/app'))) caches.open(VERSION).then((c) => c.put(req, r.clone()));
          return r;
        })
        .catch(async () => (await caches.match(req)) || (url.pathname.startsWith('/app') ? caches.match('/app/') : null) || caches.match('/offline.html'))
    );
  }
});

self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('push', (e) => {
  const d = e.data ? e.data.json() : { title: 'Global Klinik', body: 'Notifikasi baru' };
  e.waitUntil(self.registration.showNotification(d.title || 'Global Klinik', { body: d.body, icon: '/assets/img/icon-192.png', badge: '/assets/img/icon-96.png', data: d.url || '/app/' }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.openWindow(e.notification.data || '/app/'));
});

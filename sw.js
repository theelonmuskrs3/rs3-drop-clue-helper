// Network-first service worker: always fresh when online (dev preview stays live), full offline fallback from cache.
// build: 20261022-2150 (bump so phones pick up the new version)
const PREFIX = 'dch-';
self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const r = await fetch('precache.json', {cache: 'no-store'});
    const {version, files} = await r.json();
    const c = await caches.open(PREFIX + version);
    // add in chunks so one missing file does not abort the whole install
    for (let i = 0; i < files.length; i += 40)
      await Promise.all(files.slice(i, i + 40).map(f => c.add(new Request(f, {cache: 'reload'})).catch(() => {})));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    const newest = (await (await fetch('precache.json', {cache: 'no-store'}).catch(() => null))?.json().catch(() => null))?.version;
    if (newest) await Promise.all(keys.filter(k => k.startsWith(PREFIX) && k !== PREFIX + newest).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  if (new URL(req.url).pathname.startsWith('/__update/')) return; // Windows launcher updater: never cache
  e.respondWith((async () => {
    try {
      const net = await fetch(req, {cache: 'no-store'});
      if (net.ok) {
        const keys = (await caches.keys()).filter(k => k.startsWith(PREFIX));
        if (keys.length) (await caches.open(keys[keys.length - 1])).put(req, net.clone()).catch(() => {});
      }
      return net;
    } catch (err) {
      const hit = await caches.match(req, {ignoreSearch: true});
      if (hit) return hit;
      if (req.mode === 'navigate') { const idx = await caches.match('./'); if (idx) return idx; }
      throw err;
    }
  })());
});

/* 已停用 Service Worker —— 之前用「缓存优先」导致用户一直看到旧版本，改为自毁 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch (_) {}
    try { await self.registration.unregister(); } catch (_) {}
    const cs = await self.clients.matchAll({ type: 'window' });
    cs.forEach((c) => { try { c.navigate(c.url); } catch (_) {} });
  })());
});

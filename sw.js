/* 百合小说分享站 · Service Worker
 * 策略: 静态资源 stale-while-revalidate(先出缓存, 后台更新) → 二次访问秒开
 * 小说文件(library/)不走缓存, 交给浏览器 HTTP 缓存
 * 外部请求(busuanzi/abacus)不拦截
 */
const CACHE = 'yuri-site-v1';
const PRECACHE = ['./', './manifest.json', './avatar.jpg'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.all(PRECACHE.map((u) => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (_) { return; }
  if (url.origin !== self.location.origin) return;        // 外部资源不拦
  if (url.pathname.includes('/library/')) return;         // 小说文件不缓存

  e.respondWith(
    caches.match(req).then((hit) => {
      const network = fetch(req).then((res) => {
        if (res && res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => hit);
      return hit || network;      // 有缓存先给缓存, 同时后台更新
    })
  );
});

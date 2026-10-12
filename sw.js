// 发布新版本时：改这里的 VERSION、index.html 里的 ?v=、js/store.js 的 MC.VERSION 和 version.json
const VERSION = '0.5.2';
const CACHE = 'mcal-' + VERSION;
const V = '?v=' + VERSION;
const ASSETS = [
  './index.html', './manifest.webmanifest',
  './styles.css' + V,
  './js/store.js' + V, './js/ui.js' + V, './js/calendar.js' + V, './js/editor.js' + V, './js/push.js' + V, './js/app.js' + V,
  './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png', './icons/apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(ASSETS.map(u =>
    fetch(new Request(u, { cache: 'reload' })).then(r => (r.ok ? c.put(u, r) : null)).catch(() => null)
  ))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const timeout = ms => new Promise(r => setTimeout(r, ms));
// 绕过 GitHub Pages 的 CDN 缓存，直接拿最新文件
function freshFetch(req) {
  const u = new URL(req.url);
  u.searchParams.set('_sw', Date.now());
  return fetch(u.href, { cache: 'no-store', credentials: 'same-origin' });
}

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return; // GitHub API 直接走网络
  if (url.pathname.endsWith('/version.json')) return;                      // 版本检查永远走网络

  // 带版本号的 css / js 和图标：版本不变内容就不变，直接用本机缓存，秒开
  if (url.searchParams.has('v') || url.pathname.includes('/icons/')) {
    e.respondWith(caches.open(CACHE).then(async c => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) c.put(req, res.clone());
      return res;
    }));
    return;
  }

  // 页面和其他文件：先取最新的（最多等 1.5 秒），网络慢或断网时用缓存
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    const key = req.mode === 'navigate' && !url.pathname.endsWith('widget.html') ? './index.html' : req;
    const net = freshFetch(req).then(res => { if (res && res.ok) c.put(key, res.clone()); return res; });
    try {
      const res = await Promise.race([net, timeout(1500)]);
      if (res && res.ok) return res;
    } catch (err) {}
    const cached = await c.match(key, { ignoreSearch: true });
    if (cached) return cached;
    return net;
  })());
});

// ---------- 推送提醒 ----------
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { title: '月历', body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || '月历', {
    body: d.body || '',
    tag: d.tag || undefined,
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    data: { url: d.url || './' },
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const target = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if (c.url.startsWith(self.registration.scope)) { c.postMessage({ type: 'open' }); return c.focus(); }
    }
    return self.clients.openWindow(target);
  })());
});

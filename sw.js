/* Service Worker —— 个人工作台 PWA 离线支持
 * 策略：
 *  - 安装时预缓存应用外壳（index.html / manifest / 图标）；逐个缓存，单个失败不影响整体
 *  - 导航请求：网络优先，失败回退缓存首页（保证断网仍可打开）
 *  - 其他静态资源：缓存优先，缺失则网络拉取并回填
 *  - 跨域请求（如资料库 API）一律放行，不拦截
 *
 * ⚠️ 改了 index.html 或站点其它文件后，请把下面的 CACHE 版本号 +1（v2 → v3 …），
 *    这样访问者下次打开才会拉到新文件，否则会一直吃旧缓存。
 */
const CACHE = 'pd-workbench-v2';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon.svg'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => Promise.all(
        ASSETS.map(url => cache.add(url).catch(err => console.warn('[SW] 预缓存跳过：', url, err)))
      ))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // 只处理同源请求，跨域请求（如云端 API）直接走网络
  if (url.origin !== self.location.origin) return;

  // 导航（打开页面）：网络优先，离线回退到缓存的首页
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html').then(r => r || Response.error()))
    );
    return;
  }

  // 其余静态资源：缓存优先，未命中再联网并回填
  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(res => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      }).catch(() => cached || Response.error());
    })
  );
});

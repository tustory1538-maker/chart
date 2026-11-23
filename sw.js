// 앱 화면 파일을 저장해 두고, 새 버전이 있으면 자동으로 받아옴 (시세 데이터는 저장 안 함)
const CACHE = 'my-chart-v5';
const SHELL = ['./', 'index.html', 'app.js', 'tools.js', 'klinecharts.min.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // 바이낸스 요청은 그대로 통과
  // 네트워크 우선 → 실패하면(오프라인) 저장본
  e.respondWith(fetch(e.request).then(r => {
    const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r;
  }).catch(() => caches.match(e.request).then(r => r || caches.match('index.html'))));
});

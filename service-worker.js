// Fresh build cache (bump this to invalidate old assets) 
const CACHE = 'taxcalc-fresh-v1';
const ASSETS = [
  './','./index.html','./styles.css','./app.js','./manifest.webmanifest',
  './icons/icon-192.png','./icons/icon-512.png','./icons/icon-512-maskable.png'
];
self.addEventListener('install', e=>{ e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS))); });
self.addEventListener('activate', e=>{
  e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))))
});
self.addEventListener('fetch', e=>{
  const req=e.request; if (req.method!=='GET') return;
  e.respondWith(caches.match(req).then(c=>c||fetch(req).then(res=>{
    if(res && res.ok){ const copy=res.clone(); caches.open(CACHE).then(cache=>cache.put(req,copy)); }
    return res;
  }).catch(()=> req.mode==='navigate' ? caches.match('./index.html') : caches.match(req))));
});

/* Asset Studio: cache same-origin app shell and static resources after first online visit. */
const CACHE = "sprite-asset-studio-v1";
const SHELL = ["/studio", "/studio-sw.js"];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => {
  event.waitUntil(Promise.all([
    caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith("sprite-asset-studio-")&&k!==CACHE).map(k=>caches.delete(k)))),
    self.clients.claim()
  ]));
});
self.addEventListener("fetch", event => {
  const req=event.request;
  if(req.method!=="GET"||new URL(req.url).origin!==self.location.origin) return;
  // Never cache paid API endpoints, generated content, or uploaded user files.
  if(new URL(req.url).pathname.startsWith("/api/")) return;
  event.respondWith(caches.match(req).then(hit=>{
    if(hit) return hit;
    return fetch(req).then(response=>{
      if(response.ok && (req.destination==="script"||req.destination==="style"||req.destination==="font"||req.mode==="navigate")){
        const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(req,copy));
      }
      return response;
    });
  }));
});

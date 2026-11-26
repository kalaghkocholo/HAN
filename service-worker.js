"use strict";
const CACHE_NAME="farnaz-shell-v313";
const APP_BASE=new URL("./",self.location.href);
const SHELL=["./","./index.html","./styles.css?v=20261109-call-reject-round1","./chat-viewport.css?v=20261107-viewport1","./call-ui.css?v=20261109-facetime-controls2","./spaces.css?v=20261107-profile-avatar1","./js/local-store.js?v=20261107-contact-photo1","./js/chat-viewport-controller.js?v=20261107-viewport1","./js/supabase-sdk.js","./js/core.js?v=20261107-viewport1","./js/private-chat-model.js?v=20261107-private-chat1","./js/private-chat-hub.js?v=20261107-contact-photo1","./js/chat-menu-v5.js?v=20261107-viewport1","./js/spaces.js?v=20261107-account-delete1","./js/calls.js?v=20261109-call-ui-hidden-fix1","./js/livekit-sdk-loader.js?v=20261105-pilot1","./js/livekit-calls.js?v=20261107-call-ui4","./js/livekit-call-sessions.js?v=20261109-rpcstart1","./js/livekit-call-controller.js?v=20261109-endcall1","./js/livekit-call-ui.js?v=20261109-facetime-controls2","./manifest.webmanifest","./farnaz-icon.svg?v=20261024-4"];
self.addEventListener("install",event=>{
  event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(SHELL.map(path=>new Request(new URL(path,APP_BASE).href,{cache:"reload"})))).then(()=>self.skipWaiting()));
});
self.addEventListener("activate",event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(key=>key.startsWith("farnaz-shell-")&&key!==CACHE_NAME).map(key=>caches.delete(key)));
    try{if(self.registration.navigationPreload)await self.registration.navigationPreload.enable();}catch(_){}
    await self.clients.claim();
  })());
});
// A short navigation timeout prevents a blank screen on weak mobile connections.
const NAVIGATION_TIMEOUT_MS=4000;
function fetchWithTimeout(request,ms){
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error("Network timeout")),ms);
    fetch(request).then(response=>{clearTimeout(timer);resolve(response);},error=>{clearTimeout(timer);reject(error);});
  });
}
self.addEventListener("fetch",event=>{
  const req=event.request;
  if(req.method!=="GET")return;
  const url=new URL(req.url);
  if(url.origin!==self.location.origin||!url.pathname.startsWith(APP_BASE.pathname))return;
  if(req.mode==="navigate"){
    // Network-first: stale cached HTML must not hide a published build.
    const pageKey=new URL("./index.html",APP_BASE).href;
    event.respondWith((async()=>{
      try{
        const preloaded=await event.preloadResponse;
        const response=preloaded||await fetchWithTimeout(req,NAVIGATION_TIMEOUT_MS);
        if(response&&response.ok){
          const copy=response.clone();
          event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.put(pageKey,copy)).catch(()=>{}));
        }
        return response;
      }catch(_){
        return await caches.match(pageKey)||await caches.match(req,{ignoreSearch:true})||Response.error();
      }
    })());
    return;
  }
  const isCodeAsset=/\.(?:html|css|js)$/i.test(url.pathname)||url.search.length>0;
  if(isCodeAsset){
    // Stale-while-revalidate: cached code starts instantly while the fresh copy updates in background.
    event.respondWith((async()=>{
      const cache=await caches.open(CACHE_NAME);
      const cached=await cache.match(req);
      const refresh=fetch(req).then(async response=>{
        if(response.ok&&response.type==="basic")await cache.put(req,response.clone());
        return response;
      }).catch(()=>null);
      if(cached){event.waitUntil(refresh);return cached;}
      return await refresh||Response.error();
    })());
    return;
  }
  event.respondWith((async()=>{
    const cached=await caches.match(req);
    if(cached)return cached;
    const response=await fetch(req);
    if(response.ok&&response.type==="basic")caches.open(CACHE_NAME).then(cache=>cache.put(req,response.clone()));
    return response;
  })());
});
self.addEventListener("push",event=>{
  let payload={};
  try{payload=event.data?event.data.json():{};}catch(_){payload={body:event.data?.text()||""};}
  const title=String(payload.title||"فرناز | Farnaz");
  const options={
    body:String(payload.body||"پیام جدیدی دریافت کردی."),
    icon:"./farnaz-icon.svg?v=20261024-4",
    badge:"./farnaz-icon.svg?v=20261024-4",
    tag:String(payload.tag||"farnaz-push"),
    renotify:false,
    data:{url:payload.url||"./"}
  };
  event.waitUntil(self.registration.showNotification(title,options));
});
self.addEventListener("notificationclick",event=>{
  event.notification.close();
  let target=APP_BASE.href;
  try{
    // Notification payloads are untrusted: only navigate inside this app.
    const requested=new URL(event.notification.data?.url||"./",APP_BASE);
    if(requested.origin===APP_BASE.origin&&requested.pathname.startsWith(APP_BASE.pathname))target=requested.href;
  }catch(_){}
  event.waitUntil(self.clients.matchAll({type:"window",includeUncontrolled:true}).then(clients=>{
    for(const client of clients){if(client.url.startsWith(APP_BASE.origin+APP_BASE.pathname)){client.focus();client.navigate?.(target);return;}}
    return self.clients.openWindow(target);
  }));
});
/* Keviata service worker. Only ever touches caches named keviata-*. */
const VERSION='redesign-contrib-1'
const CACHE='keviata-shell-'+VERSION
const RUNTIME='keviata-runtime'
const SHELL=['./','index.html','offline.html','privacy.html','manifest.webmanifest','favicon.svg',
  'css/tokens.css','css/app.css','css/content.css',
  'js/app.js','js/config.js','js/util.js','js/theme.js','js/streak.js','js/store.js','js/auth.js','js/data.js','js/reader.js','js/share.js','js/dialog.js',
  'vendor/purify-3.4.17.es.mjs','contribute/','contribute/index.html','contribute/contribute.js','contribute/contribute.css',
  'fonts/assistant-hebrew-wght-normal.woff2','fonts/assistant-latin-wght-normal.woff2',
  'fonts/frank-ruhl-libre-hebrew-400-normal.woff2','fonts/frank-ruhl-libre-hebrew-700-normal.woff2','fonts/heebo-hebrew-wght-normal.woff2',
  'images/vilna-shas-page-mono.webp','icons/icon-192.png','icons/icon-512.png']
const IMMUTABLE=/\/(vendor|fonts)\/|\.(woff2|webp|png|svg)$/

self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL.map(u=>new Request(u,{cache:'reload'})))).then(()=>self.skipWaiting())))
self.addEventListener('activate',e=>e.waitUntil((async()=>{
  const keys=await caches.keys()
  await Promise.all(keys.filter(k=>k.startsWith('keviata-')&&k!==CACHE&&k!==RUNTIME).map(k=>caches.delete(k)))
  await self.clients.claim()
})()))

function withTimeout(p,ms){return new Promise((res,rej)=>{const t=setTimeout(()=>rej(new Error('timeout')),ms);p.then(v=>{clearTimeout(t);res(v)},e=>{clearTimeout(t);rej(e)})})}
async function put(req,res){if(res&&res.ok&&res.type==='basic'){const c=await caches.open(RUNTIME);await c.put(req,res.clone())}return res}
async function fromCache(req,opts){return (await caches.match(req,opts))||null}

self.addEventListener('fetch',e=>{
  const req=e.request
  if(req.method!=='GET')return
  const url=new URL(req.url)
  if(url.origin!==location.origin)return
  if(!url.pathname.startsWith(new URL(self.registration.scope).pathname))return
  if(req.mode==='navigate'){
    e.respondWith((async()=>{
      try{return await put(req,await withTimeout(fetch(req),5000))}
      catch{
        const hit=await fromCache(req,{ignoreSearch:true})
        if(hit)return hit
        const isApp=/\/(index\.html)?$/.test(url.pathname)
        return (isApp&&await fromCache('index.html'))||await fromCache('offline.html')||Response.error()
      }})())
    return
  }
  if(IMMUTABLE.test(url.pathname)){
    e.respondWith((async()=>(await fromCache(req))||put(req,await fetch(req)))())
    return
  }
  // app code and content: network first, cache fallback
  e.respondWith((async()=>{
    try{return await put(req,await withTimeout(fetch(req,{cache:'no-cache'}),6000))}
    catch{const hit=await fromCache(req);if(hit)return hit;throw new Error('offline')}
  })())
})

self.addEventListener('push',e=>{
  let d={};try{d=e.data?e.data.json():{}}catch{}
  e.waitUntil(self.registration.showNotification(d.title||'קביעותא',{body:d.body||'שאלה אחת מהעתיד, תשובה מהמקורות. המהדורה של היום מחכה.',icon:'icons/icon-192.png',badge:'icons/icon-192.png',dir:'rtl',lang:'he',tag:d.tag||'keviata-daily',data:{url:d.url||'./'}}))
})
self.addEventListener('notificationclick',e=>{
  e.notification.close()
  const scope=self.registration.scope
  let target=new URL((e.notification.data&&e.notification.data.url)||'./',scope)
  if(!target.href.startsWith(scope))target=new URL('./',scope)
  e.waitUntil((async()=>{
    const cs=await clients.matchAll({type:'window',includeUncontrolled:true})
    const c=cs.find(c=>c.url.startsWith(scope))
    if(c){try{await c.navigate(target.href)}catch{}return c.focus()}
    return clients.openWindow(target.href)
  })())
})

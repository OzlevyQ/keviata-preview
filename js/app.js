/* Keviata app: public reading for everyone, sign-in for sync. */
import {BUILD,FLAGS,VAPID_PUBLIC,TZ,DELETE_URL,FUNCTIONS_BASE} from './config.js'
import {$,qsa,esc,DAY_RE,ilToday,addDays,weekday,fmtDay,fmtDayShort,fmtMonth,toast,sha256Hex,readJSON,writeJSON} from './util.js'
import {getEdition,getLatestOnOrBefore,getArchive,cachedArchive} from './data.js'
import {restoreSession,hasSessionHint,getSB,getSBToken,logout,clearLocalSession} from './auth.js'
import {state,loadLocal,cloudLoad,onChange,setSync,flush,scheduleFlush,stats,pctOf,isBookmarked,toggleBookmark,updateSettings,markOnboarded,clearLocal,studiedDays} from './store.js'
import {isRestDay,restLabel,todayState} from './streak.js'
import * as reader from './reader.js'
import {openModal,closeModal} from './dialog.js'
import {shareEdition} from './share.js'

window.__KEVIATA_BUILD=BUILD
let today=ilToday()
let edition=null        // featured edition on the home screen
let archive=cachedArchive()
let route='today'
let contributorGeneration=0  // declared early: renderContributor can run during boot(), before its definition below

/* ---------------- theme ---------------- */
function applyLook(){
  const s=state.extras.settings,root=document.documentElement
  if(s.theme==='system')root.removeAttribute('data-theme');else root.setAttribute('data-theme',s.theme)
  if(s.textSize==='md')root.removeAttribute('data-text');else root.setAttribute('data-text',s.textSize)
  const dark=s.theme==='dark'||(s.theme==='system'&&matchMedia('(prefers-color-scheme: dark)').matches)
  qsa('meta[name=theme-color]').forEach(m=>m.setAttribute('content',dark?'#0b1310':'#f7f3ea'))
}

/* ---------------- router ---------------- */
const ROUTES=['today','archive','progress','profile','settings','support']
function parseHash(){const h=location.hash.replace(/^#\/?/,'');const [r,arg]=h.split('/');return {r:r||'today',arg}}
function onRoute(){
  const {r,arg}=parseHash()
  if(r==='read'&&DAY_RE.test(arg||'')){openEdition(arg);return}
  readerToken++ // cancel any pending edition load
  if(reader.isOpen())reader.close()
  let next=ROUTES.includes(r)?r:'today'
  if(next==='support'&&!FLAGS.dedications)next='today'
  const changed=next!==route;route=next
  qsa('.screen').forEach(s=>s.hidden=s.dataset.screen!==route)
  qsa('#tabs a').forEach(a=>a.dataset.route===route?a.setAttribute('aria-current','page'):a.removeAttribute('aria-current'))
  document.title=(route==='today'?'':({archive:'ארכיון',progress:'התקדמות',profile:'פרופיל',settings:'הגדרות',support:'הקדשה'}[route]+' · '))+'קביעותא · שאלה אחת מהעתיד, תשובה מהמקורות, כל יום'
  renderRoute()
  if(changed){scrollTo({top:0});if(route!=='today')$('main').focus({preventScroll:true})}
  onScroll()
}
function renderRoute(){({today:renderToday,archive:renderArchive,progress:renderProgress,profile:renderProfile,settings:renderSettings,support:renderSupport}[route]||renderToday)()}

/* ---------------- top bar ---------------- */
const SYNC_TEXT={local:'שמור במכשיר',syncing:'מסנכרן…',synced:'מסונכרן',offline:'לא מחובר לרשת',error:'הסנכרון נכשל'}
function renderTop(){
  const signed=!!state.user
  $('loginTop').hidden=signed;$('avatarTop').hidden=!signed
  if(signed)paintAvatar($('avatarTopImg'),state.user)
  const st=signed?state.sync:(navigator.onLine?'local':'offline')
  $('syncChip').dataset.state=st;$('syncText').textContent=SYNC_TEXT[st]
  $('syncChip').setAttribute('aria-label','מצב שמירה: '+SYNC_TEXT[st])
}
function paintAvatar(el,u){el.textContent='';el.style.backgroundImage=''
  if(u&&u.pictureUrl&&/^https:\/\//.test(u.pictureUrl)){el.style.backgroundImage=`url("${u.pictureUrl.replace(/["\\\n]/g,'')}")`}
  else el.textContent=((u&&u.name)||'?').trim().charAt(0)}
function onScroll(){const tb=$('topbar');const y=scrollY;tb.classList.toggle('scrolled',y>8);tb.classList.toggle('on-hero',route==='today'&&y<280)}

/* ---------------- shared bits ---------------- */
function edRow(a){
  const d=state.progress.days[a.id],p=pctOf(d)
  const stateHtml=d&&d.completed?`<span class="ed-state done" title="הושלם"><svg aria-hidden="true"><use href="#i-check"/></svg></span>`:d?`<span class="ed-state part" style="--p:${p}" title="${p}%"></span>`:`<span class="ed-state new"></span>`
  const status=d&&d.completed?'הושלם':d?`נקרא ${p}%`:'טרם נקרא'
  const [y,m,dd]=a.id.split('-')
  return `<li><button type="button" class="ed-row" data-open="${esc(a.id)}"><span class="ed-date" aria-hidden="true"><b>${Number(dd)}</b><small>${esc(fmtDayShort(a.id).replace(/^\d+\s*/,''))}</small></span><span class="ed-body"><span class="ed-title">${esc(a.title||'מהדורה')}</span><span class="ed-sub">${esc(a.hebrewDate||fmtDay(a.id))} · ${status}</span></span>${stateHtml}</button></li>`
}
document.addEventListener('click',e=>{const l=e.target.closest('a[href="login/"]');if(l){try{sessionStorage.setItem('keviata-return',location.search+location.hash)}catch{}}
  const b=e.target.closest('[data-open]');if(b){e.preventDefault();location.hash='#/read/'+b.dataset.open}})

/* ---------------- TODAY ---------------- */
async function loadFeatured(){
  let r=await getEdition(today)
  if(!r.edition){const p=await getLatestOnOrBefore(today);if(p)r={edition:p,source:'network'}}
  edition=r.edition
  return r
}
function renderToday(){
  const signed=!!state.user,s=stats(today)
  // hero card
  const card=$('todayCard')
  if(edition){
    card.setAttribute('aria-busy','false')
    const isToday=edition.id===today
    $('todayEyebrow').textContent=isToday?'המהדורה של היום':(edition.id>today?'מהדורה':'המהדורה האחרונה')
    $('todayDate').textContent=edition.hebrewDate?edition.hebrewDate+' · '+fmtDay(edition.id):fmtDay(edition.id)
    $('todayTitle').textContent=edition.title||'המהדורה היומית'
    $('todayDesc').textContent=edition.description||''
    const n=edition.slides.length
    $('todayMeta').innerHTML=`<span class="pill">${n} כרטיסים</span><span class="pill">כ־${Math.max(3,Math.round(n*0.4))} דקות</span>${(edition.sources||[]).length?`<span class="pill">${edition.sources.length} מקורות</span>`:''}`
    const d=state.progress.days[edition.id],p=pctOf(d)
    $('todayProgress').hidden=!d;$('todayBar').style.width=p+'%';$('todayPct').textContent=d&&d.completed?'הושלם':p+'%'
    $('openTodayLabel').textContent=d&&d.completed?'לקרוא שוב':d?'להמשיך מאיפה שעצרת':'להתחיל לקרוא'
    $('openToday').disabled=false
    const saved=isBookmarked(edition.id);$('saveToday').setAttribute('aria-pressed',String(saved));$('saveToday').setAttribute('aria-label',saved?'הסרה מהשמורים':'שמירה לשמורים');$('saveToday').querySelector('use').setAttribute('href',saved?'#i-bookmark-on':'#i-bookmark')
    $('todayError').hidden=true
    renderDedication(edition)
  }
  // streak strip
  const ts=todayState(s.studied,today)
  $('ssNum').textContent=String(s.current)
  $('ssLabel').textContent=s.current===1?'יום ברצף':'ימים ברצף'
  const week=$('ssWeek');week.textContent=''
  const start=addDays(today,-weekday(today))
  const dn=['א','ב','ג','ד','ה','ו','ש']
  for(let i=0;i<7;i++){const day=addDays(start,i),done=s.studied.has(day),rest=isRestDay(day)
    const li=document.createElement('li');li.className=(done?'done ':'')+(rest&&!done?'rest ':'')+(day===today?'today':'')
    li.innerHTML=`<span class="d">${done?'<svg aria-hidden="true"><use href="#i-check"/></svg>':rest?'<svg aria-hidden="true"><use href="#i-moon"/></svg>':''}</span><span>${dn[i]}</span>`
    li.setAttribute('aria-label',`${fmtDay(day)}: ${done?'למדתי':rest?restLabel(day):day>today?'עוד לא הגיע':'לא נלמד'}`);week.append(li)}
  $('ssNote').textContent=ts==='done'?'למדת היום. נתראה מחר.':ts==='rest'?`${restLabel(today)} היום: הרצף שמור גם בלי לימוד.`:s.current?'עוד לא למדת היום. כמה דקות שומרות על הרצף.':'מתחילים רצף? מספיקה מהדורה אחת.'
  $('howItWorks').hidden=signed&&s.completed>0
  $('signinNudge').hidden=signed
  // recent
  const list=$('recentList')
  const rec=archive.filter(a=>!edition||a.id!==edition.id).slice(0,5)
  list.setAttribute('aria-busy',archive.length?'false':'true')
  list.innerHTML=rec.length?rec.map(edRow).join(''):(archive.length?'':'<li class="empty"><span class="skeleton w80"></span><span class="skeleton w60"></span></li>')
}
function renderDedication(ed){
  const el=$('dedicationBanner'),d=ed&&ed.dedication
  if(!FLAGS.dedications||!d||!d.text){el.hidden=true;return}
  el.hidden=false;el.innerHTML=`<small>${esc(d.label||'הלימוד היום מוקדש')}</small>${esc(d.text)}`
}
$('openToday').onclick=()=>{if(edition)location.hash='#/read/'+edition.id}
$('saveToday').onclick=()=>{if(!edition)return;const on=toggleBookmark(edition);toast(on?'נשמר לשמורים':'הוסר מהשמורים');renderToday()}
$('shareToday').onclick=()=>edition&&shareEdition(edition,{withImage:true,streak:stats(today).current})

/* ---------------- READER ---------------- */
let readerToken=0
async function openEdition(id){
  const tok=++readerToken
  let ed=edition&&edition.id===id?edition:null
  if(!ed){toast('טוען…');const r=await getEdition(id);ed=r.edition}
  if(tok!==readerToken||parseHash().arg!==id)return
  if(!ed){toast(navigator.onLine?'המהדורה לא נמצאה':'המהדורה לא זמינה בלי רשת');history.replaceState(null,'','#/'+route);onRoute();return}
  if(reader.isOpen())reader.close()
  reader.open(ed,{onClose:()=>{if(parseHash().r==='read'){if(history.state&&history.state.kvReader)history.back();else{history.replaceState(null,'','#/'+route);onRoute()}}else renderRoute()}})
}
// opening from inside the app pushes a history entry so Back closes the reader
addEventListener('hashchange',e=>{const {r}=parseHash();if(r==='read'&&!history.state)history.replaceState({kvReader:1},'',location.hash);onRoute()})
reader.initReader({onShare:(ed,img)=>shareEdition(ed,{withImage:img,streak:stats(today).current}),onAction:(k,on)=>toast(on?'נשמר לשמורים':'הוסר מהשמורים')})

/* ---------------- ARCHIVE ---------------- */
let filter='all',q=''
function renderArchive(){
  const list=$('archiveList')
  const norm=s=>String(s||'').replace(/[\u0591-\u05C7]/g,'').toLowerCase()
  const nq=norm(q.trim())
  const items=archive.filter(a=>{
    const d=state.progress.days[a.id]
    if(filter==='open'&&d&&d.completed)return false
    if(filter==='done'&&!(d&&d.completed))return false
    if(filter==='saved'&&!isBookmarked(a.id))return false
    if(nq&&!norm(a.title+' '+a.hebrewDate+' '+fmtDay(a.id)+' '+a.id).includes(nq))return false
    return true})
  list.setAttribute('aria-busy','false')
  $('archiveCount').textContent=archive.length?(items.length===1?"מהדורה אחת":items.length===0?"לא נמצאו מהדורות":`${items.length} מהדורות`):''
  if(!archive.length){list.innerHTML=`<div class="empty"><b>${navigator.onLine?'טוענים את הארכיון…':'הארכיון לא זמין בלי רשת'}</b></div>`;return}
  if(!items.length){list.innerHTML=`<div class="empty"><b>לא נמצאו מהדורות</b>${q?'נסו מילה אחרת.':filter==='saved'?'אפשר לשמור מהדורה בכפתור הסימנייה.':''}</div>`;return}
  let html='',month=''
  for(const a of items){const m=a.id.slice(0,7);if(m!==month){if(month)html+='</ul>';month=m;html+=`<h2 class="month-h">${esc(fmtMonth(a.id))}</h2><ul class="ed-list">`}html+=edRow(a)}
  list.innerHTML=html+'</ul>'
}
let searchT
$('archiveSearch').addEventListener('input',e=>{clearTimeout(searchT);searchT=setTimeout(()=>{q=e.target.value;renderArchive()},120)})
qsa('.filters button').forEach(b=>b.onclick=()=>{filter=b.dataset.f;qsa('.filters button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));renderArchive()})

/* ---------------- PROGRESS ---------------- */
let calMonth=today.slice(0,7)
function renderProgress(){
  const s=stats(today),ts=todayState(s.studied,today)
  $('pStreak').textContent=String(s.current);$('pBest').textContent=String(s.best);$('pDays').textContent=String(s.daysLearned);$('pDone').textContent=String(s.completed);$('pSaved').textContent=String(s.saved)
  $('pStreakState').textContent=ts==='done'?'למדת היום':ts==='rest'?restLabel(today)+' היום, הרצף שמור':s.current?'עוד לא למדת היום':'הרצף מתחיל במהדורה הבאה'
  $('progressSub').textContent=state.user?'מסונכרן לחשבון שלך':'נשמר במכשיר הזה בלבד'
  // calendar
  const first=calMonth+'-01',startDow=weekday(first)
  let dim=28;while(dim<31&&addDays(first,dim).slice(0,7)===calMonth)dim++
  $('calTitle').textContent=fmtMonth(first)
  let h=['א','ב','ג','ד','ה','ו','ש'].map(d=>`<div class="dow" role="columnheader">${d}</div>`).join('')
  for(let i=0;i<startDow;i++)h+='<div class="c out" aria-hidden="true"></div>'
  for(let i=0;i<dim;i++){const day=addDays(first,i),done=s.studied.has(day),rest=isRestDay(day)
    const cls=['c',done?'done':'',rest&&!done?'rest':'',day===today?'today':'',day>today?'future':''].join(' ')
    h+=`<div class="${cls}" role="gridcell" aria-label="${esc(fmtDay(day))}${done?', למדתי':rest?', '+esc(restLabel(day)):''}">${i+1}</div>`}
  $('cal').innerHTML=h
  $('calNext').disabled=calMonth>=today.slice(0,7)
  // activity
  const days=Object.values(state.progress.days).sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0,8)
  const meta=Object.fromEntries(archive.map(a=>[a.id,a]))
  $('activityList').innerHTML=days.length?days.map(d=>edRow(meta[d.dayId]||{id:d.dayId,title:'מהדורה '+fmtDay(d.dayId)})).join(''):'<li class="empty"><b>עוד אין פעילות</b>המהדורה הראשונה מחכה בעמוד הבית.</li>'
}
$('calPrev').onclick=()=>{const [y,m]=calMonth.split('-').map(Number);const d=new Date(Date.UTC(y,m-2,1));calMonth=d.toISOString().slice(0,7);renderProgress()}
$('calNext').onclick=()=>{const [y,m]=calMonth.split('-').map(Number);const d=new Date(Date.UTC(y,m,1));calMonth=d.toISOString().slice(0,7);renderProgress()}

/* ---------------- PROFILE ---------------- */
const ACH=[
  {id:'first',t:'צעד ראשון',d:'סיימת מהדורה ראשונה',ic:'i-book',v:s=>s.completed,goal:1},
  {id:'s3',t:'שלושה ברצף',d:'רצף של 3 ימים',ic:'i-flame',v:s=>s.best,goal:3},
  {id:'s7',t:'שבוע שלם',d:'רצף של 7 ימים',ic:'i-flame',v:s=>s.best,goal:7},
  {id:'d18',t:'ח״י',d:'18 ימי לימוד',ic:'i-scroll',v:s=>s.daysLearned,goal:18},
  {id:'s30',t:'קביעות',d:'רצף של 30 ימים',ic:'i-spark',v:s=>s.best,goal:30},
  {id:'d50',t:'חמישים',d:'50 מהדורות',ic:'i-book',v:s=>s.completed,goal:50},
  {id:'saved',t:'אוסף',d:'5 מהדורות שמורות',ic:'i-bookmark',v:s=>s.saved,goal:5},
  {id:'d100',t:'מאה',d:'100 ימי לימוד',ic:'i-spark',v:s=>s.daysLearned,goal:100}]
async function renderProfile(){
  const u=state.user,s=stats(today)
  paintAvatar($('profileAvatar'),u||{name:'א'})
  $('profileName').textContent=u?u.name:'אורח/ת'
  $('profileEmail').textContent=u?(u.email||''):'קוראים בלי חשבון. ההתקדמות נשמרת במכשיר.'
  $('profileLogin').hidden=!!u
  $('prStreak').textContent=String(s.current);$('prDays').textContent=String(s.daysLearned);$('prDone').textContent=String(s.completed)
  $('achGrid').innerHTML=ACH.map(a=>{const v=Math.min(a.v(s),a.goal),ok=v>=a.goal
    return `<li class="ach card${ok?'':' locked'}"><span class="ai-ic"><svg aria-hidden="true"><use href="#${a.ic}"/></svg></span><b>${a.t}</b><span>${a.d}</span>${ok?'<span class="pill ok">הושג</span>':`<div class="pbar" role="img" aria-label="${v} מתוך ${a.goal}"><i style="width:${Math.round(v/a.goal*100)}%"></i></div>`}</li>`}).join('')
  const saved=state.extras.bookmarks
  $('savedList').innerHTML=saved.length?saved.map(edRow).join(''):'<li class="empty"><b>אין עדיין שמורים</b>אפשר לשמור מהדורה מתוך הקורא או מעמוד הבית.</li>'
  $('supportCard').hidden=!FLAGS.dedications
  // Admin link uses the is_admin flag already loaded from profiles (cloudLoad). Avoids a
  // separate admin-function call that would log a 401/403 for every non-admin reader.
  $('adminLink').hidden=!(u&&u.is_admin)
  renderContributor(u)

}

/* ---------------- SETTINGS ---------------- */
const pushSupported=()=>('Notification' in window)&&('PushManager' in window)&&('serviceWorker' in navigator)
function b64ToUint8(b){const p='='.repeat((4-b.length%4)%4);const s=atob((b+p).replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from(s,c=>c.charCodeAt(0))}
let emailSub=null,pushBusy=false
function renderSettings(){
  const s=state.extras.settings,signed=!!state.user
  qsa('#themeSeg button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.v===s.theme)))
  qsa('#textSeg button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.v===s.textSize)))
  $('notifLocked').hidden=signed
  for(const id of ['setPub','setReminder','setEmail','studyTime']){$(id).disabled=!signed;$(id).closest('.set-row').classList.toggle('disabled-row',!signed)}
  $('setPub').checked=signed&&!!s.pubAlert;$('setReminder').checked=signed&&!!s.reminder
  $('studyTime').value=s.studyTime||'20:00';if($('studyTime').value!==s.studyTime){const o=document.createElement('option');o.textContent=s.studyTime;$('studyTime').append(o);$('studyTime').value=s.studyTime}
  $('studyTime').disabled=!signed||!s.reminder
  const perm=('Notification' in window)?Notification.permission:'unsupported'
  const pushNote=!pushSupported()?'לא נתמך בדפדפן הזה. באייפון: הוסיפו למסך הבית.':perm==='denied'?'ההתראות חסומות בהגדרות הדפדפן':''
  $('pubStatus').textContent=pushNote;$('reminderStatus').textContent=pushNote||(s.reminder?`כל יום ב־${s.studyTime}`:'')
  $('setEmail').checked=!!emailSub;$('emailStatus').textContent=signed?(emailSub===null?'':emailSub?`נשלח אל ${state.user.email}`:'כבוי'):''
  $('syncDetail').textContent=signed?`${SYNC_TEXT[state.sync]}${state.user.email?' · '+state.user.email:''}`:'לא מחובר: ההתקדמות נשמרת במכשיר הזה'
  $('syncNow').hidden=!signed
  $('logoutRow').hidden=!signed;$('loginRow').hidden=signed
  $('buildId').textContent=BUILD
}
qsa('#themeSeg button').forEach(b=>b.onclick=()=>{updateSettings({theme:b.dataset.v});applyLook();renderSettings()})
qsa('#textSeg button').forEach(b=>b.onclick=()=>{updateSettings({textSize:b.dataset.v});applyLook();renderSettings()})
async function savePushRow(sub){
  const s=state.extras.settings,sb=await getSB(),j=sub.toJSON()
  const r=await sb.from('push_subscriptions').upsert({user_id:state.user.id,endpoint:j.endpoint,keys:j.keys,opted_in:!!(s.pubAlert||s.reminder),notify_publication:!!s.pubAlert,notify_reminder:!!s.reminder,reminder_time:s.studyTime||'20:00',timezone:TZ,updated_at:new Date().toISOString()})
  if(r.error)throw r.error
}
async function setPush(kind,on){
  if(!state.user||pushBusy)return false
  pushBusy=true
  const prev={...state.extras.settings}
  try{
    if(on){
      if(!pushSupported()){toast('הדפדפן הזה לא תומך בהתראות');return false}
      const perm=Notification.permission==='granted'?'granted':await Notification.requestPermission()
      if(perm!=='granted'){toast('צריך לאשר התראות בדפדפן');return false}
      const reg=await navigator.serviceWorker.ready
      const sub=(await reg.pushManager.getSubscription())||await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64ToUint8(VAPID_PUBLIC)})
      updateSettings({[kind]:true});await savePushRow(sub)
    }else{
      updateSettings({[kind]:false})
      const s=state.extras.settings
      if(pushSupported()){const reg=await navigator.serviceWorker.ready;const sub=await reg.pushManager.getSubscription()
        if(sub){if(!s.pubAlert&&!s.reminder){const sb=await getSB();const r=await sb.from('push_subscriptions').delete().eq('endpoint',sub.endpoint);if(r.error)throw r.error;await sub.unsubscribe()}else await savePushRow(sub)}}
    }
    return true
  }catch(e){console.warn('push update failed',e);updateSettings({pubAlert:prev.pubAlert,reminder:prev.reminder});toast('לא הצלחנו לעדכן את ההתראות. נסו שוב.');return false}
  finally{pushBusy=false;renderSettings()}
}
$('setPub').onchange=e=>setPush('pubAlert',e.target.checked)
$('setReminder').onchange=e=>setPush('reminder',e.target.checked)
$('studyTime').onchange=async e=>{updateSettings({studyTime:e.target.value});renderSettings()
  if(state.user&&state.extras.settings.reminder&&pushSupported()){try{const reg=await navigator.serviceWorker.ready;const sub=await reg.pushManager.getSubscription();if(sub)await savePushRow(sub);toast('התזכורת עודכנה ל־'+e.target.value)}catch(err){console.warn(err);toast('לא הצלחנו לעדכן את שעת התזכורת')}}}
async function loadEmailSub(){
  if(!state.user)return
  try{const sb=await getSB();const r=await sb.from('email_subscriptions').select('subscribed').eq('user_id',state.user.id).maybeSingle();if(r.error)throw r.error;emailSub=!!(r.data&&r.data.subscribed)}catch(e){console.warn('email sub read failed',e)}
  if(route==='settings')renderSettings()
}
async function setEmailSub(on){
  if(!state.user||!state.user.email){toast('אין כתובת מייל בחשבון');return false}
  try{
    if(on){const r=await fetch(FUNCTIONS_BASE+'/email-subscribe',{method:'POST',headers:{authorization:'Bearer '+await getSBToken()}});if(!r.ok)throw new Error('subscribe_failed');emailSub=false;toast('שלחנו מייל לאישור ההרשמה');return true}
    const sb=await getSB();const r=await sb.from('email_subscriptions').update({subscribed:false}).eq('user_id',state.user.id);if(r.error)throw r.error;emailSub=false;toast('הדיוור במייל בוטל');return true}
  catch(e){console.warn('email sub failed',e);toast('לא הצלחנו לעדכן. נסו שוב.');return false}
  finally{renderSettings()}
}
$('setEmail').onchange=e=>setEmailSub(e.target.checked)
$('syncNow').onclick=async()=>{const ok=await (state.user?cloudLoad(state.user):flush());toast(ok?'מסונכרן':'הסנכרון נכשל. ננסה שוב בהמשך.')}
$('syncChip').onclick=()=>{location.hash='#/settings';requestAnimationFrame(()=>$('sgAccount').scrollIntoView({block:'center'}))}
$('logoutBtn').onclick=async()=>{await flush().catch(()=>{});await logout();clearLocal();state.user=null;setSync('local');toast('התנתקת');location.hash='#/today';renderAll()}
$('privacyBtn').onclick=()=>privacyDialog()
let deferredInstall=null
addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstall=e;$('installRow').hidden=false})
$('installBtn').onclick=async()=>{if(!deferredInstall)return;deferredInstall.prompt();await deferredInstall.userChoice.catch(()=>{});deferredInstall=null;$('installRow').hidden=true}

function privacyDialog(){
  const signed=!!state.user
  const m=openModal({title:'פרטיות וחשבון',html:`
    <p>אנחנו שומרים רק מה שצריך כדי שהלימוד יעבוד: ${signed?'שם, מייל ותמונת פרופיל מהתחברות, ':''}התקדמות בקריאה, שמורים והעדפות${signed?', והרשמות להתראות או למייל אם הפעלת אותן':''}.</p>
    <ul><li>אורחים: הכל נשמר במכשיר בלבד.</li><li>מחוברים: הנתונים נשמרים בחשבון כדי לסנכרן בין מכשירים.</li><li>אין פרסומות ואין מכירת מידע.</li></ul>
    <p><a href="privacy.html">למדיניות הפרטיות המלאה</a></p>
    <div class="actions">
      ${signed?'<button type="button" class="btn danger block" id="delAcct">מחיקת החשבון וכל הנתונים</button>':'<button type="button" class="btn ghost block" id="delLocal">מחיקת הנתונים מהמכשיר</button>'}
      <p class="form-status" id="delStatus" role="status"></p>
    </div>`})
  const st=m.el.querySelector('#delStatus')
  m.el.querySelector('#delLocal')?.addEventListener('click',()=>{clearLocal();st.textContent='הנתונים נמחקו מהמכשיר.';renderAll()})
  m.el.querySelector('#delAcct')?.addEventListener('click',async e=>{
    const b=e.currentTarget
    if(b.dataset.confirm!=='1'){b.dataset.confirm='1';b.textContent='לחיצה נוספת תמחק לצמיתות';st.textContent='המחיקה כוללת התקדמות, שמורים, הגדרות והרשמות. אי אפשר לשחזר.';return}
    b.disabled=true;st.textContent='מוחקים…'
    const res=await deleteAccount()
    if(res.ok){st.textContent='הנתונים נמחקו והתנתקת.';setTimeout(()=>{m.close();location.hash='#/today'},1500)}
    else{b.disabled=false;b.dataset.confirm='';b.textContent='לנסות שוב';st.textContent=`חלק מהנתונים לא נמחקו (${res.failed.join(', ')}). אפשר לנסות שוב או לפנות אלינו מעמוד הפרטיות.`}
  })
}
async function deleteAccount(){
  const failed=[]
  try{
    const r=await fetch(DELETE_URL,{method:'POST',headers:{authorization:'Bearer '+await getSBToken()}});if(!r.ok)failed.push('server')
  }catch(e){console.warn(e);failed.push('network')}
  if(failed.length)return {ok:false,failed}
  // The delete-account function already revoked the session server-side, so tear the session
  // down locally without any /logout request (even scope:'local' would POST and 403 on the
  // now-deleted user, logging a console error and previously throwing past the success UI).
  await clearLocalSession()
  clearLocal();state.user=null;setSync('local');renderAll()
  return {ok:true,failed}
}

/* ---------------- SUPPORT (flag) ---------------- */
const PURPOSE={ilui:'לעילוי נשמת',refua:'לרפואת',zchut:'לזכות',free:''}
function renderSupport(){
  const f=$('dedForm');if(!f.dataset.init){f.dataset.init='1'
    const upd=()=>{const p=f.querySelector('input[name=purpose]:checked').value,n=$('dedName').value.trim();$('dedPreview').textContent=p==='free'?(n||'נוסח ההקדשה שלכם'):`הלימוד היום מוקדש ${PURPOSE[p]} ${n||'...'}`}
    f.addEventListener('input',upd);upd()
    $('dedDate').min=addDays(today,2)
    f.onsubmit=e=>{e.preventDefault();const ok=$('dedName').value.trim()&&$('dedDate').value&&$('dedConsent').checked
      $('dedStatus').textContent=ok?'התשלום עדיין לא פעיל. נעדכן כשהקדשות ייפתחו.':'נא למלא שם, תאריך ולאשר את הפרסום.'}
  }
}

/* ---------------- onboarding after first sign-in ---------------- */
function maybeOnboard(){
  if(!state.user||state.extras.onboarded)return
  const m=openModal({title:'ברוך הבא לקביעותא',html:`<p>ההתקדמות, הרצף והשמורים שלך יישמרו עכשיו בכל המכשירים.</p>
    <div class="set-row"><label class="set-label" for="obEmail">המהדורה היומית במייל<small class="status">${esc(state.user.email||'')}</small></label><span class="switch"><input type="checkbox" role="switch" id="obEmail"><span class="track"></span></span></div>
    <div class="set-row"><label class="set-label" for="obPub">התראה כשיוצאת מהדורה</label><span class="switch"><input type="checkbox" role="switch" id="obPub"><span class="track"></span></span></div>
    <div class="actions"><button type="button" class="btn primary block" id="obSave">שמירה</button><button type="button" class="btn ghost block" data-close>אולי אחר כך</button><p class="form-status" id="obStatus" role="status"></p></div>`,
    onClose:()=>markOnboarded()})
  m.el.querySelector('#obSave').onclick=async()=>{const st=m.el.querySelector('#obStatus');st.textContent='שומרים…'
    let ok=true
    if(m.el.querySelector('#obEmail').checked)ok=(await setEmailSub(true))&&ok
    if(m.el.querySelector('#obPub').checked)ok=(await setPush('pubAlert',true))&&ok
    markOnboarded();if(ok)m.close();else st.textContent='חלק מההגדרות לא נשמרו. אפשר לעדכן בהגדרות.'}
}

/* ---------------- boot ---------------- */
function renderAll(){applyLook();renderTop();renderRoute()}
onChange(what=>{if(what==='sync'){renderTop();if(route==='settings')renderSettings();return}if(!reader.isOpen())renderRoute();renderTop()})
addEventListener('scroll',onScroll,{passive:true})
function netState(){$('offlineBanner').hidden=navigator.onLine;if(state.user){if(navigator.onLine)scheduleFlush(200);else setSync('offline')}renderTop()}
addEventListener('online',netState);addEventListener('offline',netState)
document.addEventListener('visibilitychange',()=>{if(document.hidden)return
  if(state.user)scheduleFlush(300)
  const t=ilToday();if(t!==today){today=t;loadFeatured().then(()=>{if(!reader.isOpen())renderRoute()}).catch(()=>{})}})
// skip link: focus main without changing the hash route
document.querySelector('.skip-link')?.addEventListener('click',e=>{e.preventDefault();const m=$('main');m.focus();m.scrollIntoView({block:'start'})})
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change',applyLook)

async function boot(){
  loadLocal();applyLook()
  // canonicalize ?date into the reader route, keep ?date for deep links
  const qd=new URLSearchParams(location.search).get('date')
  if(qd&&DAY_RE.test(qd)){const sp=new URLSearchParams(location.search);sp.delete('date');const rest=sp.toString();history.replaceState(null,'',location.pathname+(rest?'?'+rest:'')+'#/read/'+qd)}
  netState();onRoute()
  // public content first: nothing here waits for auth
  const featured=loadFeatured().then(r=>{if(!r.edition){$('todayCard').setAttribute('aria-busy','false');$('todayTitle').textContent=navigator.onLine?'המהדורה של היום עוד בדרך':'אין חיבור לרשת';$('todayDesc').textContent=navigator.onLine?'נסו שוב בעוד כמה דקות.':'כשהחיבור יחזור, המהדורה תופיע כאן.';$('todayError').hidden=true}if(route==='today')renderToday()})
  getArchive().then(a=>{archive=a;if(!reader.isOpen())renderRoute()})
  // Restore the native Supabase session only after a previous login.
  if(hasSessionHint()){
    setSync('syncing');renderTop()
    const s=await restoreSession()
    if(s.status==='user'){state.user=s.user;renderTop();await cloudLoad(s.user);renderAll();loadEmailSub();await featured;if(!reader.isOpen())maybeOnboard()}
    else if(s.status==='offline'){setSync('offline');renderTop()}
    else{setSync('local');renderTop()}
  }
}
boot()

/* service worker */
if('serviceWorker' in navigator)addEventListener('load',()=>{navigator.serviceWorker.register('sw.js',{updateViaCache:'none'}).catch(e=>console.warn('sw register failed',e))})

async function renderContributor(user,force){
 let section=document.getElementById('contributorSection');if(!section){section=document.createElement('section');section.id='contributorSection';section.className='card contrib-card';section.setAttribute('aria-labelledby','contribTitle');const head=document.querySelector('#scr-profile .profile-head');(head||document.getElementById('profileEmail').parentElement).after(section)}
 /* Profile re-renders on every sync; keep the section (and any typed request) unless the user changed. */
 const key=user?.id||'';if(!force&&section.dataset.uid===key&&section.dataset.ready==='1')return
 const generation=++contributorGeneration
 section.dataset.uid=key;section.dataset.ready='';section.replaceChildren();if(!user)return
 const title=document.createElement('h2');title.id='contribTitle';title.textContent='כותבים בקביעותא';section.append(title)
 try{const sb=await getSB();const {data:p,error}=await sb.from('profiles').select('role,is_admin').eq('id',user.id).maybeSingle();if(error)throw error;if(generation!==contributorGeneration)return
 if(p&&(p.is_admin||p.role==='contributor')){const link=document.createElement('a');link.href='contribute/';link.className='btn primary';link.textContent='לכתיבת מהדורה';const hint=document.createElement('p');hint.className='muted';hint.textContent='יש לכם הרשאת כתיבה. מהדורות שתשלחו יפורסמו אחרי אישור העורכים.';section.append(hint,link);section.dataset.ready='1';return}
 const {data:requests,error:requestError}=await sb.from('contributor_requests').select('*').order('created_at',{ascending:false});if(requestError)throw requestError;if(generation!==contributorGeneration)return
 const latest=requests?.[0];if(latest){const status=document.createElement('p');status.className='contrib-status';status.textContent=latest.status==='pending'?'הבקשה ממתינה לאישור':(latest.review_note||'הבקשה נדחתה. אפשר לשלוח בקשה חדשה.');section.append(status);if(latest.status==='pending')return}
 const form=document.createElement('form'),message=document.createElement('textarea'),button=document.createElement('button'),feedback=document.createElement('p');const intro=document.createElement('p');intro.className='muted';intro.textContent='רוצים לכתוב מהדורות? ספרו לנו בקצרה מי אתם ומה תרצו לכתוב, ונחזור אליכם.';message.maxLength=1000;message.required=true;message.rows=3;message.placeholder='למה תרצו לכתוב בקביעותא?';message.setAttribute('aria-label','למה תרצו לכתוב בקביעותא?');button.type='submit';button.className='btn primary';button.textContent='שליחת בקשת כתיבה';feedback.setAttribute('role','status');form.className='contrib-form';form.append(message,button,feedback);section.append(intro);section.append(form);section.dataset.ready='1';form.onsubmit=async e=>{e.preventDefault();button.disabled=true;feedback.textContent='שולחים…';let error;try{({error}=await sb.from('contributor_requests').insert({message:message.value.trim()}))}catch(err){error=err}if(error){feedback.textContent='שליחת הבקשה נכשלה. נסו שוב.';button.disabled=false}else renderContributor(user,true)}
 }catch{const message=document.createElement('p');message.textContent='לא הצלחנו לטעון את בקשות הכתיבה';section.append(message)}
}

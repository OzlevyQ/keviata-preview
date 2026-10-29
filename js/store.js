/* Local-first state with cloud sync for signed-in learners.
   Tables and row shapes are unchanged: profiles, user_settings, user_progress,
   push_subscriptions, email_subscriptions. */
import {readJSON,writeJSON,ilDate,DAY_RE} from './util.js'
import {getSB,tokenState} from './auth.js'
import {currentStreak,bestStreak} from './streak.js'

const PKEY='keviata-progress',XKEY='keviata-extras',QKEY='keviata-pending'
export const DEFAULT_SETTINGS={pubAlert:false,reminder:false,studyTime:'20:00',theme:'system',textSize:'md'}
export const state={
  user:null,                       // {id,name,email,pictureUrl}
  progress:{version:2,days:{}},    // days[editionId]={dayId,slide,totalSlides,scroll,completed,completedAt,updatedAt}
  extras:{version:2,bookmarks:[],settings:{...DEFAULT_SETTINGS},onboarded:false},
  sync:'local'                     // local | syncing | synced | offline | error
}
const listeners=new Set()
export const onChange=fn=>{listeners.add(fn);return()=>listeners.delete(fn)}
const emit=what=>listeners.forEach(fn=>{try{fn(what)}catch(e){console.warn(e)}})
export function setSync(s){if(state.sync!==s){state.sync=s;emit('sync')}}

/* ---------- local ---------- */
const TEXT_MAP={'קטן':'sm','בינוני':'md','גדול':'lg'}
function normSettings(s){s={...DEFAULT_SETTINGS,...(s||{})};if(TEXT_MAP[s.textSize])s.textSize=TEXT_MAP[s.textSize];if(!['sm','md','lg','xl'].includes(s.textSize))s.textSize='md';if(!s.theme||!['system','light','dark'].includes(s.theme))s.theme=s.dark===true?'dark':'system';delete s.dark;delete s.sounds;return s}
export function loadLocal(){
  let p=readJSON(PKEY),x=readJSON(XKEY)
  if(!p){const old=readJSON('keviata-demo-progress');if(old&&old.progress)p={version:2,days:old.progress.days||{}}}
  if(!x){const old=readJSON('keviata-demo-extras');if(old&&old.extras)x=old.extras}
  if(p&&p.days)state.progress={version:2,days:sanitizeDays(p.days)}
  if(x)state.extras={version:2,bookmarks:Array.isArray(x.bookmarks)?x.bookmarks.slice(0,200):[],settings:normSettings(x.settings),onboarded:!!x.onboarded}
  persist()
}
function sanitizeDays(days){const out={};for(const [k,d] of Object.entries(days||{})){if(!DAY_RE.test(k)||!d)continue;out[k]={dayId:k,slide:Math.max(0,Number(d.slide)||0),totalSlides:Math.max(1,Number(d.totalSlides)||20),scroll:Number(d.scroll)||0,completed:!!d.completed,completedAt:d.completedAt||null,updatedAt:d.updatedAt||''}}return out}
function persist(){writeJSON(PKEY,state.progress);writeJSON(XKEY,state.extras)}
export function clearLocal(){for(const k of [PKEY,XKEY,QKEY,'keviata-demo-progress','keviata-demo-extras'])try{localStorage.removeItem(k)}catch{}
  state.progress={version:2,days:{}};state.extras={version:2,bookmarks:[],settings:{...DEFAULT_SETTINGS},onboarded:false};pending=[];clearTimeout(flushTimer);emit('all')}

/* ---------- derived ---------- */
export function studiedDays(){
  const s=new Set()
  for(const d of Object.values(state.progress.days)){if(!d.completed)continue
    const day=d.completedAt?ilDate(new Date(d.completedAt)):d.dayId
    if(DAY_RE.test(day))s.add(day)}
  return s
}
export function stats(today){
  const studied=studiedDays(),days=Object.values(state.progress.days)
  return {studied,current:currentStreak(studied,today),best:bestStreak(studied),daysLearned:studied.size,
    completed:days.filter(d=>d.completed).length,started:days.length,saved:state.extras.bookmarks.length}
}
export const pctOf=d=>d?(d.completed?100:Math.min(99,Math.round(((Number(d.slide)+1)/Math.max(1,Number(d.totalSlides)))*100))):0
export const isBookmarked=id=>state.extras.bookmarks.some(b=>b.id===id)

/* ---------- mutations ---------- */
export function recordProgress(ed,slide,total,scroll,complete){
  const prev=state.progress.days[ed.id]||{}
  const now=new Date().toISOString()
  const completed=!!(prev.completed||complete)
  state.progress.days[ed.id]={dayId:ed.id,slide:Math.max(Number(prev.slide)||0,slide),totalSlides:total,scroll:Number(scroll)||0,completed,completedAt:prev.completedAt||(completed?now:null),updatedAt:now}
  persist();emit('progress')
  enqueue({t:'progress',id:ed.id})
}
export function toggleBookmark(ed){
  if(isBookmarked(ed.id))state.extras.bookmarks=state.extras.bookmarks.filter(b=>b.id!==ed.id)
  else state.extras.bookmarks=[{id:ed.id,title:ed.title||'',hebrewDate:ed.hebrewDate||'',displayDate:ed.displayDate||''},...state.extras.bookmarks].slice(0,200)
  persist();emit('bookmarks');enqueue({t:'settings'})
  return isBookmarked(ed.id)
}
export function updateSettings(patch){state.extras.settings={...state.extras.settings,...patch};persist();emit('settings');enqueue({t:'settings'})}
export function markOnboarded(){state.extras.onboarded=true;persist();enqueue({t:'settings'})}

/* ---------- cloud ---------- */
let pending=readJSON(QKEY,[])||[]
function enqueue(job){
  if(!state.user)return
  job={...job,uid:state.user.id}
  if(!pending.slice(inflight).some(j=>j.t===job.t&&j.id===job.id&&j.uid===job.uid))pending.push(job)
  writeJSON(QKEY,pending);scheduleFlush()
}
let flushTimer=null,flushing=null,inflight=0
export function scheduleFlush(ms=700){clearTimeout(flushTimer);flushTimer=setTimeout(()=>flush(),ms)}
const check=r=>{if(r&&r.error)throw r.error;return r}
const progressRow=(uid,id,d)=>({user_id:uid,item_key:id,completed:!!d.completed,completed_at:d.completed?(d.completedAt||new Date().toISOString()):null,data:{slide:d.slide,totalSlides:d.totalSlides,scroll:d.scroll,updatedAt:d.updatedAt,completedAt:d.completedAt||null}})
/* one upsert for all queued progress rows (same columns as before), one for settings */
async function writeBatch(sb,jobs){
  const uid=state.user.id
  jobs=jobs.filter(j=>!j.uid||j.uid===uid) // never write another account's queued work
  if(jobs.some(j=>j.t==='settings')){
    const {bookmarks,settings,onboarded}=state.extras
    check(await sb.from('user_settings').upsert({user_id:uid,settings:{bookmarks,settings,onboarded},updated_at:new Date().toISOString()}))
  }
  const ids=[...new Set(jobs.filter(j=>j.t==='progress'&&state.progress.days[j.id]).map(j=>j.id))] // one row per item_key
  const rows=ids.map(id=>progressRow(uid,id,state.progress.days[id]))
  if(rows.length)check(await sb.from('user_progress').upsert(rows))
}
export function flush(){
  if(!state.user)return Promise.resolve(true)
  if(flushing)return flushing
  flushing=(async()=>{
    if(!pending.length){if(state.sync!=='error')setSync(navigator.onLine?'synced':'offline');return true}
    if(!navigator.onLine){setSync('offline');return false}
    setSync('syncing')
    try{
      const sb=await getSB()
      while(pending.length){
        const batch=pending.slice(0,100);inflight=batch.length
        try{await writeBatch(sb,batch)}finally{inflight=0}
        pending.splice(0,batch.length);writeJSON(QKEY,pending)
      }
      setSync('synced');return true
    }catch(e){console.warn('sync failed',e);setSync(navigator.onLine?'error':'offline');scheduleFlush(30000);return false}
  })().finally(()=>{flushing=null})
  return flushing
}
/* Merge cloud and local by updatedAt so neither side's newer progress is lost. */
export async function cloudLoad(user){
  state.user=user;setSync('syncing')
  try{
    const sb=await getSB()
    const [pf,st,pr]=await Promise.all([
      sb.from('profiles').select('display_name,email,picture_url,role,is_admin').eq('id',user.id).maybeSingle(),
      sb.from('user_settings').select('settings').eq('user_id',user.id).maybeSingle(),
      sb.from('user_progress').select('item_key,completed,completed_at,data').eq('user_id',user.id)])
    if(pf.error||st.error||pr.error)throw pf.error||st.error||pr.error
    if(!tokenState.ok)throw new Error('token_unavailable')
    if(pf.data&&pf.data.display_name&&pf.data.display_name!=='אורח')state.user={...user,name:pf.data.display_name,email:pf.data.email||user.email,pictureUrl:pf.data.picture_url||user.pictureUrl}
    if(pf.data)state.user={...state.user,role:pf.data.role,is_admin:pf.data.is_admin}
    const s=st.data&&st.data.settings
    let pushSettings=!s
    if(s){
      const local=state.extras
      const localSettingsPending=pending.some(j=>j.t==='settings'&&(!j.uid||j.uid===user.id))
      const ids=new Set(),merged=[]
      for(const b of [...(s.bookmarks||[]),...local.bookmarks])if(b&&b.id&&!ids.has(b.id)){ids.add(b.id);merged.push(b)}
      if(merged.length!==(s.bookmarks||[]).length||localSettingsPending)pushSettings=true
      state.extras={version:2,bookmarks:merged.slice(0,200),settings:normSettings(localSettingsPending?{...(s.settings||{}),...local.settings}:{...local.settings,...(s.settings||{})}),onboarded:!!(s.onboarded||local.onboarded)}
    }
    const days=state.progress.days
    for(const row of pr.data||[]){
      if(!DAY_RE.test(row.item_key))continue
      const d=row.data||{},cloud={dayId:row.item_key,slide:Number(d.slide)||0,totalSlides:Number(d.totalSlides)||20,scroll:Number(d.scroll)||0,completed:!!row.completed,completedAt:d.completedAt||row.completed_at||null,updatedAt:d.updatedAt||''}
      const l=days[row.item_key]
      if(!l||String(cloud.updatedAt)>=String(l.updatedAt)){days[row.item_key]={...cloud,completed:cloud.completed||!!(l&&l.completed),completedAt:(l&&l.completedAt&&(!cloud.completedAt||l.completedAt<cloud.completedAt))?l.completedAt:cloud.completedAt}}
      else{days[row.item_key]={...l,completed:l.completed||cloud.completed,completedAt:l.completedAt||cloud.completedAt};enqueue({t:'progress',id:row.item_key})}
    }
    const cloudKeys=new Set((pr.data||[]).map(r=>r.item_key))
    for(const k of Object.keys(days))if(!cloudKeys.has(k))enqueue({t:'progress',id:k})
    if(pushSettings)enqueue({t:'settings'})
    persist();emit('all')
    await flush()
    return true
  }catch(e){console.warn('cloud load failed',e);setSync(navigator.onLine?'error':'offline');return false}
}
export function pendingCount(){return pending.length}

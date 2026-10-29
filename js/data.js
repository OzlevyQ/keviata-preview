/* Public content reads: PostgREST GETs with the publishable key (same table and filters
   as before, no supabase-js needed). Editions are immutable, so we cache aggressively. */
import {SB_URL,SB_KEY} from './config.js'
import {DAY_RE,readJSON,writeJSON,timeout} from './util.js'
const H={apikey:SB_KEY,authorization:'Bearer '+SB_KEY,accept:'application/json'}
const REST=SB_URL+'/rest/v1/daily_content'
async function rest(q,ms=8000){
  const ctl=new AbortController();const t=setTimeout(()=>ctl.abort(),ms)
  try{const r=await fetch(REST+'?'+q,{headers:H,signal:ctl.signal,cache:'no-store'});if(!r.ok)throw new Error('rest_'+r.status);return await r.json()}
  finally{clearTimeout(t)}
}
export function validEdition(p,day){
  return !!(p&&typeof p==='object'&&DAY_RE.test(String(p.id||day||''))&&Array.isArray(p.slides)&&p.slides.length>=1&&p.slides.length<=60&&p.slides.every(s=>s&&typeof s.html==='string'))
}
const ckey=day=>'keviata-content-'+day
/* single edition: Supabase row -> legacy static file -> local cache */
export async function getEdition(day){
  try{
    const rows=await rest('select=payload&content_date=eq.'+encodeURIComponent(day)+'&limit=1')
    const p=rows&&rows[0]&&rows[0].payload
    if(validEdition(p,day)){const e={...p,id:p.id||day};writeJSON(ckey(day),e);return {edition:e,source:'network'}}
    if(Array.isArray(rows)&&rows.length===0){/* not published (yet) */}
  }catch(e){console.warn('daily_content read failed',e)}
  try{const r=await fetch('content/'+encodeURIComponent(day)+'.json');if(r.ok){const p=await r.json();if(validEdition(p,day)){writeJSON(ckey(day),p);return {edition:p,source:'static'}}}}catch{}
  const c=readJSON(ckey(day));if(validEdition(c,day))return {edition:c,source:'cache'}
  return {edition:null,source:'none'}
}
/* latest published edition on or before a day (for "today" before publication time) */
export async function getLatestOnOrBefore(day){
  try{
    const rows=await rest('select=payload&content_date=lte.'+encodeURIComponent(day)+'&order=content_date.desc&limit=1')
    const p=rows&&rows[0]&&rows[0].payload
    if(validEdition(p)){writeJSON(ckey(p.id),p);return p}
  }catch(e){console.warn('latest read failed',e)}
  return null
}
/* archive: metadata only (titles), never the slide HTML */
const AKEY='keviata-archive-v2'
export function cachedArchive(){const a=readJSON(AKEY);return Array.isArray(a)?a:[]}
export async function getArchive(limit=400){
  try{
    const rows=await rest('select=content_date,title:payload->>title,hebrewDate:payload->>hebrewDate,displayDate:payload->>displayDate&order=content_date.desc&limit='+limit)
    if(Array.isArray(rows)){
      const a=rows.filter(r=>DAY_RE.test(r.content_date)).map(r=>({id:r.content_date,title:r.title||'',hebrewDate:r.hebrewDate||'',displayDate:r.displayDate||''}))
      writeJSON(AKEY,a);return a
    }
  }catch(e){console.warn('archive read failed',e)}
  return cachedArchive()
}
export {timeout}

/* Streak rules (Israel calendar days):
   - a day counts when the learner completed an edition that day (Asia/Jerusalem);
   - Shabbat and Yom Tov (Israel) never break a streak: they are skipped when not studied,
     and count like any day when studied;
   - today not yet studied does not break the streak (it is still "alive" until midnight). */
import {addDays,weekday} from './util.js'
const heb=(()=>{try{return new Intl.DateTimeFormat('en-u-ca-hebrew',{month:'long',day:'numeric',timeZone:'UTC'})}catch{return null}})()
/* Israel Yom Tov days: 1-2 Tishri, 10 Tishri, 15 Tishri, 22 Tishri, 15 Nisan, 21 Nisan, 6 Sivan */
const YOM_TOV={Tishri:[1,2,10,15,22],Nisan:[15,21],Sivan:[6]}
const cache=new Map()
export function hebrewParts(day){
  if(!heb)return null
  if(cache.has(day))return cache.get(day)
  const [y,m,d]=day.split('-').map(Number)
  let out=null
  try{const parts=heb.formatToParts(new Date(Date.UTC(y,m-1,d,12)));out={month:parts.find(p=>p.type==='month')?.value,day:Number(parts.find(p=>p.type==='day')?.value)}}catch{}
  cache.set(day,out);return out
}
export function isYomTov(day){const h=hebrewParts(day);return !!(h&&YOM_TOV[h.month]&&YOM_TOV[h.month].includes(h.day))}
export const isShabbat=day=>weekday(day)===6
export const isRestDay=day=>isShabbat(day)||isYomTov(day)
export function restLabel(day){return isShabbat(day)?'שבת':isYomTov(day)?'חג':''}

/* studied: Set of YYYY-MM-DD (Israel days with a completion) */
export function currentStreak(studied,today){
  let n=0,d=today,guard=0
  if(!studied.has(d))d=addDays(d,-1) // today still open
  while(guard++<4000){
    if(studied.has(d)){n++;d=addDays(d,-1);continue}
    if(isRestDay(d)){d=addDays(d,-1);continue}
    break
  }
  return n
}
export function bestStreak(studied){
  const days=[...studied].sort()
  if(!days.length)return 0
  let best=1,run=1
  for(let i=1;i<days.length;i++){
    let gapOk=true,d=addDays(days[i-1],1)
    while(d<days[i]){if(!isRestDay(d)){gapOk=false;break}d=addDays(d,1)}
    run=gapOk?run+1:1;if(run>best)best=run
  }
  return best
}
/* status of today for UI: 'done' | 'rest' | 'open' */
export function todayState(studied,today){return studied.has(today)?'done':isRestDay(today)?'rest':'open'}

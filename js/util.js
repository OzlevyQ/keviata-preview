import {TZ} from './config.js'
export const $=id=>document.getElementById(id)
export const qsa=(sel,root=document)=>Array.from(root.querySelectorAll(sel))
export const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
export const DAY_RE=/^\d{4}-\d{2}-\d{2}$/
const ymd=new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'})
/* Israel calendar date (YYYY-MM-DD) of an instant */
export function ilDate(d=new Date()){try{return ymd.format(d)}catch{return new Date(d).toISOString().slice(0,10)}}
export const ilToday=()=>ilDate(new Date())
/* pure calendar arithmetic on YYYY-MM-DD strings (no timezone involved) */
export function addDays(day,n){const [y,m,d]=day.split('-').map(Number);const t=new Date(Date.UTC(y,m-1,d+n));return t.toISOString().slice(0,10)}
export function weekday(day){const [y,m,d]=day.split('-').map(Number);return new Date(Date.UTC(y,m-1,d)).getUTCDay()} // 0=Sunday..6=Saturday
export function daysBetween(a,b){const p=s=>{const [y,m,d]=s.split('-').map(Number);return Date.UTC(y,m-1,d)};return Math.round((p(b)-p(a))/864e5)}
const heFmt=new Intl.DateTimeFormat('he-IL',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'})
const heShort=new Intl.DateTimeFormat('he-IL',{day:'numeric',month:'short',timeZone:'UTC'})
const heMonth=new Intl.DateTimeFormat('he-IL',{month:'long',year:'numeric',timeZone:'UTC'})
const utc=day=>{const [y,m,d]=day.split('-').map(Number);return new Date(Date.UTC(y,m-1,d,12))}
export const fmtDay=day=>{try{return heFmt.format(utc(day))}catch{return day}}
export const fmtDayShort=day=>{try{return heShort.format(utc(day))}catch{return day}}
export const fmtMonth=day=>{try{return heMonth.format(utc(day))}catch{return day.slice(0,7)}}
export function toast(msg){const t=$('toast');if(!t)return;t.textContent=msg;t.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>t.classList.remove('show'),2800)}
export const readJSON=(k,fb=null)=>{try{const v=localStorage.getItem(k);return v?JSON.parse(v):fb}catch{return fb}}
export const writeJSON=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));return true}catch{return false}}
export async function sha256Hex(s){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));return Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,'0')).join('')}
export const sleep=ms=>new Promise(r=>setTimeout(r,ms))
export function timeout(p,ms,val){return Promise.race([p,new Promise(r=>setTimeout(()=>r(val),ms))])}

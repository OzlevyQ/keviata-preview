/* Reader: accessible full-screen dialog with cards, swipe, keyboard and a segmented progress bar. */
import DOMPurify from '../vendor/purify-3.4.17.es.mjs'
import {$,esc,fmtDay,ilToday} from './util.js'
import {trapFocus} from './dialog.js'
import {state,recordProgress,toggleBookmark,isBookmarked,stats} from './store.js'

DOMPurify.addHook('afterSanitizeAttributes',n=>{
  if(n.tagName==='A'){const h=n.getAttribute('href')||'';if(/^https?:/i.test(h)){n.setAttribute('target','_blank');n.setAttribute('rel','noopener noreferrer')}else if(!h.startsWith('#'))n.removeAttribute('href')}
  if(n.tagName==='IMG'){n.setAttribute('loading','lazy');n.setAttribute('decoding','async');if(!n.hasAttribute('alt'))n.setAttribute('alt','')}
})
const PURIFY={USE_PROFILES:{html:true,svg:true,svgFilters:true},ADD_ATTR:['target','rel'],FORBID_TAGS:['style','form','input','textarea','select','iframe','object','embed','script','link','meta','base'],FORBID_ATTR:['srcset','action','formaction'],ALLOW_DATA_ATTR:false}
export const sanitize=html=>DOMPurify.sanitize(String(html||''),PURIFY)

let ed=null,slides=[],N=0,idx=0,contentN=0,hasOwnFinish=false,opener=null,onCloseCb=null,saveT=null,restoring=false
const R=()=>$('reader')
export const isOpen=()=>!R().hidden
export const currentEdition=()=>ed

function buildDone(){
  const s=stats(ilToday())
  const el=document.createElement('div');el.className='slide-inner center-vert'
  el.innerHTML=`<div class="done-card">
    <div class="done-seal" aria-hidden="true"><svg><use href="#i-check"/></svg></div>
    <p class="kicker">סיימת את המהדורה</p>
    <h2 id="doneTitle">יישר כוח!</h2>
    <p>${esc(ed.title||'')}</p>
    <div class="done-stats"><div><b>${contentN}</b>כרטיסים</div><div><b data-done-streak>${s.current}</b>ימים ברצף</div><div><b data-done-days>${s.daysLearned}</b>ימי לימוד</div></div>
    <div class="done-actions">
      <button type="button" class="btn primary block" data-act="share-card"><svg aria-hidden="true" width="20" height="20"><use href="#i-share"/></svg>לשתף את הלימוד</button>
      <div class="row"><button type="button" class="btn ghost" data-act="save" aria-pressed="${isBookmarked(ed.id)}">${isBookmarked(ed.id)?'נשמר':'לשמור'}</button><button type="button" class="btn ghost" data-act="close">חזרה לבית</button></div>
    </div>
    <p class="done-sync" data-done-sync>${state.user?'ההתקדמות נשמרת בחשבון שלך':'ההתקדמות נשמרה במכשיר. <a href="login/">להתחבר</a> כדי לשמור את הרצף בכל מכשיר.'}</p>
  </div>`
  return el
}
export function open(edition,{start=null,onClose}={}){
  ed=edition;onCloseCb=onClose;opener=document.activeElement
  const track=$('track');track.textContent=''
  const raw=ed.slides.slice(0,60)
  contentN=raw.length
  hasOwnFinish=raw.some(s=>/finish-?btn|id=["']?finishBtn/i.test(s.html||''))
  slides=raw.map((s,i)=>{const el=document.createElement('section');el.className='slide';el.setAttribute('aria-roledescription','כרטיס');el.setAttribute('aria-label',`כרטיס ${i+1} מתוך ${contentN}`)
    const inner=document.createElement('div');inner.className=String(s.className||'slide-inner').replace(/[^\w\- ]/g,'')||'slide-inner';if(!/slide-inner/.test(inner.className))inner.className+=' slide-inner'
    inner.innerHTML=sanitize(s.html);el.append(inner);el.hidden=true;el.tabIndex=-1;track.append(el);return el})
  if(!hasOwnFinish){const el=document.createElement('section');el.className='slide';el.setAttribute('aria-label','סיום');el.hidden=true;el.tabIndex=-1;el.append(buildDone());track.append(el);slides.push(el)}
  N=slides.length
  // finish button inside content: fill legacy placeholders
  const fs=track.querySelector('#finishStreak');if(fs)fs.textContent=String(stats(ilToday()).current)
  const fc=track.querySelector('#finishCards');if(fc)fc.textContent=String(contentN)
  const d=state.progress.days[ed.id]
  idx=start!=null?start:(d&&!d.completed?Math.min(N-1,Number(d.slide)||0):0)
  $('readerTitle').textContent=ed.title||''
  $('readerDate').textContent=ed.hebrewDate||fmtDay(ed.id)
  const sb=$('segbar');sb.textContent='';sb.setAttribute('aria-valuemax',String(N))
  for(let i=0;i<N;i++)sb.append(document.createElement('i'))
  syncSave()
  R().hidden=false;document.body.classList.add('reader-open');$('app').setAttribute('inert','')
  restoring=!!(d&&d.scroll&&start==null)
  render(0)
  if(restoring)requestAnimationFrame(()=>{const el=slides[idx];if(el)el.scrollTop=Number(d.scroll)*Math.max(0,el.scrollHeight-el.clientHeight);restoring=false})
  requestAnimationFrame(()=>$('nextBtn').focus())
  if(idx===N-1)complete()
}
function syncSave(){const on=ed&&isBookmarked(ed.id);const b=$('readerSave');b.setAttribute('aria-pressed',String(!!on));b.setAttribute('aria-label',on?'הסרה מהשמורים':'שמירה');b.querySelector('use').setAttribute('href',on?'#i-bookmark-on':'#i-bookmark')}
function render(dir){
  slides.forEach((s,i)=>{s.hidden=i!==idx;s.classList.remove('anim-next','anim-prev')})
  const cur=slides[idx];if(dir)cur.classList.add(dir>0?'anim-next':'anim-prev')
  cur.style.transform=''
  $('counter').textContent=(idx+1)+' / '+N
  $('prevBtn').disabled=idx===0
  const last=idx===N-1;const nb=$('nextBtn');const hadFocus=document.activeElement===nb;nb.disabled=last
  if(last&&hadFocus){const t=slides[idx].querySelector('button,a[href]')||$('prevBtn');try{t.focus({preventScroll:true})}catch{}}
  ;[...$('segbar').children].forEach((b,i)=>{b.className=i<idx?'on':i===idx?'cur':''})
  $('segbar').setAttribute('aria-valuenow',String(idx+1));$('segbar').setAttribute('aria-valuetext',`כרטיס ${idx+1} מתוך ${N}`)
  $('readerLive').textContent=`כרטיס ${idx+1} מתוך ${N}`
}
export function go(d){
  if(!ed)return
  const n=Math.max(0,Math.min(N-1,idx+d));if(n===idx)return
  idx=n;render(d);slides[idx].scrollTop=0
  if(idx===N-1)complete();else queueSave()
}
function goto(i){if(i===idx)return;const d=i>idx?1:-1;idx=i;render(d);if(idx===N-1)complete();else queueSave()}
function curScroll(){const el=slides[idx];return el&&el.scrollHeight>el.clientHeight?el.scrollTop/(el.scrollHeight-el.clientHeight):0}
function queueSave(){clearTimeout(saveT);saveT=setTimeout(saveNow,400)}
function saveNow(complete=false){clearTimeout(saveT);if(!ed||restoring)return
  recordProgress(ed,Math.min(idx,contentN-1),contentN,curScroll(),complete)}
function complete(){
  saveNow(true)
  const s=stats(ilToday())
  const st=slides[N-1].querySelector('[data-done-streak]');if(st)st.textContent=String(s.current)
  const dd=slides[N-1].querySelector('[data-done-days]');if(dd)dd.textContent=String(s.daysLearned)
  const fs=$('track').querySelector('#finishStreak');if(fs)fs.textContent=String(s.current)
}
export function close(){
  if(!ed||R().hidden)return
  saveNow(false)
  R().hidden=true;document.body.classList.remove('reader-open');$('app').removeAttribute('inert')
  const cb=onCloseCb;ed=null;onCloseCb=null;$('track').textContent=''
  if(opener&&document.contains(opener))try{opener.focus()}catch{}
  cb&&cb()
}
export function initReader({onShare,onAction}){
  $('prevBtn').onclick=()=>go(-1)
  $('nextBtn').onclick=()=>go(1)
  $('readerClose').onclick=()=>close()
  $('readerSave').onclick=()=>{if(!ed)return;const on=toggleBookmark(ed);syncSave();onAction&&onAction('bookmark',on)}
  $('readerShare').onclick=()=>ed&&onShare(ed,false)
  document.addEventListener('keydown',e=>{
    if(R().hidden)return
    if(e.target!==document.body&&!R().contains(e.target))return
    if(e.key==='Escape'){e.preventDefault();close();return}
    trapFocus(R(),e)
    if(e.target.closest('input,textarea,select'))return
    if(e.key==='ArrowLeft'||e.key==='PageDown'){e.preventDefault();go(1)}
    else if(e.key==='ArrowRight'||e.key==='PageUp'){e.preventDefault();go(-1)}
    else if(e.key==='Home'){e.preventDefault();goto(0)}
    else if(e.key==='End'){e.preventDefault();goto(N-1)}
  })
  $('track').addEventListener('click',e=>{
    const b=e.target.closest('[data-act],#finishBtn,.finish-btn');if(!b||!ed)return
    const act=b.dataset.act
    if(act==='share-card')onShare(ed,true)
    else if(act==='save'){const on=toggleBookmark(ed);b.setAttribute('aria-pressed',String(on));b.textContent=on?'נשמר':'לשמור';syncSave()}
    else if(act==='close'||b.id==='finishBtn'||b.classList.contains('finish-btn')){complete();const st=$('track').querySelector('#finishStatus');if(st)st.textContent='נשמר';close()}
  })
  $('track').addEventListener('scroll',()=>{if(!restoring)queueSave()},{capture:true,passive:true})
  // swipe: finger moving right = next (RTL)
  const stage=$('stage');let x0=0,y0=0,dx=0,mode=null
  stage.addEventListener('touchstart',e=>{const t=e.touches[0];x0=t.clientX;y0=t.clientY;dx=0;mode=e.target.closest('a,button,input,select,textarea')?'tap':null},{passive:true})
  stage.addEventListener('touchmove',e=>{if(mode==='tap'||mode==='v')return;const t=e.touches[0],ddx=t.clientX-x0,ddy=t.clientY-y0
    if(!mode){if(Math.abs(ddx)<10&&Math.abs(ddy)<10)return;mode=Math.abs(ddx)>Math.abs(ddy)*1.2?'h':'v'}
    if(mode==='h'){e.preventDefault();dx=ddx;const edge=(dx>0&&idx===N-1)||(dx<0&&idx===0);const cur=slides[idx];cur.style.transition='none';cur.style.transform=`translateX(${edge?dx*.3:dx}px)`;cur.style.opacity=String(1-Math.min(.5,Math.abs(dx)/600))}},{passive:false})
  stage.addEventListener('touchend',()=>{const cur=slides[idx];if(mode==='h'&&cur){cur.style.transition='';cur.style.opacity='';const W=stage.clientWidth
    if(Math.abs(dx)>Math.max(50,W*.18)){go(dx>0?1:-1);cur.style.transform=''}else{cur.style.transition='transform .2s var(--ease)';cur.style.transform='';setTimeout(()=>{cur.style.transition=''},220)}}
    mode=null;dx=0},{passive:true})
  addEventListener('pagehide',()=>{if(ed)saveNow(false)})
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&ed)saveNow(false)})
}

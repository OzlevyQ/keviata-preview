/* Accessible modal: role=dialog, aria-modal, labelled, focus trapped, Esc closes,
   focus restored to the opener. Content is built with DOM APIs or escaped strings. */
const FOCUSABLE='a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
export function trapFocus(root,e){
  if(e.key!=='Tab')return
  const f=[...root.querySelectorAll(FOCUSABLE)].filter(el=>el.offsetParent!==null||el===document.activeElement)
  if(!f.length){e.preventDefault();return}
  const first=f[0],last=f[f.length-1]
  if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}
  else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
}
let open=null
export function openModal({title,html,onClose,labelId='mTitle'}){
  closeModal()
  const opener=document.activeElement
  const back=document.createElement('div');back.className='modal-back'
  back.innerHTML=`<div class="modal" role="dialog" aria-modal="true" aria-labelledby="${labelId}"><button type="button" class="icon-btn modal-x" data-close aria-label="סגירה"><svg aria-hidden="true"><use href="#i-close"/></svg></button><h2 id="${labelId}"></h2><div class="m-body"></div></div>`
  back.querySelector('h2').textContent=title
  back.querySelector('.m-body').innerHTML=html
  const m=back.querySelector('.modal')
  const close=()=>{if(open!==api)return;open=null;back.remove();document.removeEventListener('keydown',key,true);document.getElementById('app')?.removeAttribute('inert');onClose&&onClose();if(opener&&opener.focus)try{opener.focus()}catch{}}
  const key=e=>{if(e.key==='Escape'){e.stopPropagation();e.preventDefault();close()}else trapFocus(m,e)}
  back.addEventListener('click',e=>{if(e.target===back||e.target.closest('[data-close]'))close()})
  document.addEventListener('keydown',key,true)
  document.body.append(back)
  if(!document.getElementById('reader')||document.getElementById('reader').hidden)document.getElementById('app')?.setAttribute('inert','')
  const api={el:m,close}
  open=api
  requestAnimationFrame(()=>{(m.querySelector('[autofocus]')||m.querySelector('.m-body '+FOCUSABLE.split(',')[1])||m.querySelector('[data-close]')).focus()})
  return api
}
export function closeModal(){if(open)open.close()}

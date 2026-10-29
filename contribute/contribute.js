import {getSB,restoreSession} from '../js/auth.js'
const $=id=>document.getElementById(id)
let sb,user,id,cards=[],busy=false
const check=r=>{if(r.error)throw r.error;return r.data}
function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n}
function icon(path,label){const b=el('button','ic');b.type='button';if(label){b.setAttribute('aria-label',label);b.title=label}b.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true" width="20" height="20">'+path+'</svg>';return b}
const I_UP='<path d="M12 19V6M6 12l6-6 6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
const I_DOWN='<path d="M12 5v13M6 12l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
const I_TRASH='<path d="M4 7h16M9 7V5h6v2M7 7l1 13h8l1-13" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>'

/* status banner (toast-like, ok/bad variants) */
let sayTimer
function say(t,kind){const n=$('status');n.textContent=t||'';n.className=t?('banner show'+(kind?' '+kind:'')):'banner';clearTimeout(sayTimer);if(t&&kind!=='bad')sayTimer=setTimeout(()=>{n.textContent='';n.className='banner'},4000)}

const fmtDay=d=>{if(!d)return 'ללא תאריך';try{return new Intl.DateTimeFormat('he-IL',{day:'numeric',month:'long',year:'numeric'}).format(new Date(d+'T00:00:00'))}catch{return d}}
const fmtWhen=iso=>{if(!iso)return '';try{return new Intl.DateTimeFormat('he-IL',{day:'numeric',month:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(iso))}catch{return ''}}
const nCards=n=>n===0?'אין כרטיסים':n===1?'כרטיס אחד':n+' כרטיסים'
const STATUS={draft:{label:'טיוטה',cls:'pill'},submitted:{label:'ממתינה לאישור',cls:'pill warn'},published:{label:'פורסמה',cls:'pill ok'},rejected:{label:'הוחזרה לתיקון',cls:'pill bad'}}

async function list(){
 const rows=check(await sb.from('submissions').select('*').eq('author_id',user.id).order('updated_at',{ascending:false}))
 const root=$('list');root.replaceChildren()
 if(!rows.length){
  const empty=el('div','empty card')
  empty.append(el('h2','empty-title','עוד לא כתבתם מהדורה'))
  empty.append(el('p','empty-sub','כל מהדורה היא כמה כרטיסים קצרים: כותרת, תוכן ומקור. פתחו מהדורה חדשה כדי להתחיל.'))
  const cta=el('button','btn primary','מהדורה חדשה');cta.type='button';cta.onclick=()=>open();empty.append(cta)
  root.append(empty);return
 }
 for(const row of rows){
  const s=STATUS[row.status]||STATUS.draft
  const art=el('article','sub-card card')
  const head=el('div','sub-head')
  head.append(el('h2','sub-title'+(row.title?'':' muted'),row.title||'טיוטה ללא כותרת'))
  head.append(el('span',s.cls,s.label))
  art.append(head)
  const meta=el('p','sub-meta')
  meta.append(el('span',null,fmtDay(row.content_date)))
  meta.append(el('span','dot','·'))
  meta.append(el('span',null,nCards(row.cards?.length||0)))
  if(row.updated_at){meta.append(el('span','dot','·'));meta.append(el('span',null,'עודכן '+fmtWhen(row.updated_at)))}
  art.append(meta)
  if(row.review_note){const box=el('div','note-box');box.append(el('span','note-label','הערת העורכים'),el('p',null,row.review_note));art.append(box)}
  const actions=el('div','sub-actions')
  if(row.status==='published'){
   if(row.content_date){const v=el('a','btn sm','צפייה');v.href='../#/read/'+row.content_date;actions.append(v)}
  }else{
   const edit=el('button','btn sm','עריכה');edit.type='button';edit.onclick=()=>open(row);actions.append(edit)
   const del=el('button','btn sm danger-ghost','מחיקה');del.type='button';del.onclick=()=>remove(row);actions.append(del)
  }
  if(actions.childElementCount)art.append(actions)
  root.append(art)
 }
}

async function remove(row){
 if(!confirm('למחוק את המהדורה? לא ניתן לשחזר.'))return
 try{check(await sb.from('submissions').delete().eq('id',row.id));say('המהדורה נמחקה');if(id===row.id)closeEditor();await list()}
 catch{say('מחיקת המהדורה נכשלה. נסו שוב.','bad')}
}

function open(row={}){
 id=row.id||crypto.randomUUID()
 cards=structuredClone(row.cards?.length?row.cards:[{title:'',body:'',source:''}])
 $('title').value=row.title||'';$('description').value=row.description||'';$('date').value=row.content_date||''
 updateCounts()
 $('list').hidden=true;$('new').hidden=true;$('editor').hidden=false
 renderCards()
 $('editor').scrollIntoView({block:'start'})
 $('title').focus()
}
function closeEditor(){$('editor').hidden=true;$('list').hidden=false;$('new').hidden=false;say('')}
function updateCounts(){$('titleCount').textContent=$('title').value.length+' / 200';$('descCount').textContent=$('description').value.length+' / 1000'}

async function renderCards(){
 const root=$('cards');root.replaceChildren()
 for(let i=0;i<cards.length;i++){
  const card=cards[i]
  const field=el('fieldset','card-ed')
  const head=el('div','card-ed-head')
  head.append(el('span','card-num','כרטיס '+(i+1)))
  const tools=el('div','card-ed-tools')
  const up=icon(I_UP,'העברה למעלה');up.disabled=i===0;up.onclick=()=>{[cards[i-1],cards[i]]=[cards[i],cards[i-1]];renderCards()}
  const down=icon(I_DOWN,'העברה למטה');down.disabled=i===cards.length-1;down.onclick=()=>{[cards[i+1],cards[i]]=[cards[i],cards[i+1]];renderCards()}
  const rm=icon(I_TRASH,'הסרת כרטיס');rm.classList.add('danger');rm.onclick=()=>{cards=cards.filter(c=>c!==card);if(!cards.length)cards=[{title:'',body:'',source:''}];renderCards()}
  tools.append(up,down,rm);head.append(tools);field.append(head)
  for(const [key,label,max,help] of [['title','כותרת',120,''],['body','תוכן',4000,''],['source','מקור',200,'למשל: בבלי, ברכות ב ע״א']]){
   const wrap=el('div','field')
   const lab=el('label',null,label);const fid='c'+i+'-'+key;lab.setAttribute('for',fid);wrap.append(lab)
   const input=el(key==='body'?'textarea':'input','input'+(key==='body'?' ta':''));input.id=fid;input.maxLength=max;input.value=card[key]||'';if(key!=='source')input.required=true;input.oninput=()=>card[key]=input.value
   wrap.append(input)
   if(help)wrap.append(el('p','helper',help))
   field.append(wrap)
  }
  /* image upload */
  const up2=el('div','upload')
  const inp=el('input','sr-only');inp.type='file';inp.id='file'+i;inp.accept='image/jpeg,image/png,image/webp'
  const lab=el('label','upload-btn');lab.setAttribute('for','file'+i);lab.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true" width="20" height="20"><path d="M12 16V4M7 9l5-5 5 5M4 17v2a1 1 0 001 1h14a1 1 0 001-1v-2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';lab.append(document.createTextNode(card.image?'החלפת תמונה':'הוספת תמונה'))
  const imageStatus=el('p','upload-status')
  up2.append(inp,lab,imageStatus)
  if(card.image){const {data,error}=await sb.storage.from('contributions').createSignedUrl(card.image,3600);if(!error){const thumb=el('div','thumb');const img=el('img');img.src=data.signedUrl;img.alt=card.title||'';const del=el('button','thumb-rm','הסרת תמונה');del.type='button';del.onclick=()=>{delete card.image;renderCards()};thumb.append(img,del);up2.append(thumb)}}
  inp.onchange=async()=>{const file=inp.files?.[0];if(!file)return;if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024){imageStatus.textContent='יש לבחור תמונת JPEG, PNG או WebP עד 5MB';imageStatus.className='upload-status bad';return}inp.disabled=true;busy=true;imageStatus.textContent='מעלים תמונה…';imageStatus.className='upload-status';try{const ext={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[file.type];const path=user.id+'/'+id+'/'+crypto.randomUUID()+'.'+ext;check(await sb.storage.from('contributions').upload(path,file,{contentType:file.type}));card.image=path;renderCards()}catch{imageStatus.textContent='העלאת התמונה נכשלה';imageStatus.className='upload-status bad'}finally{busy=false;inp.disabled=false}}
  field.append(up2)
  root.append(field)
 }
}

async function save(status){
 if(busy){say('נא להמתין לסיום העלאת התמונה','bad');return}
 if(status==='submitted'&&(!$('editor').reportValidity()||!cards.length)){say('יש למלא כותרת, תאריך, ולפחות כרטיס אחד עם כותרת ותוכן','bad');return}
 if(status==='draft'&&!$('title').value.trim()){say('אפשר לשמור טיוטה אחרי שמוסיפים כותרת','bad');return}
 busy=true;$('submit').disabled=true;$('saveDraft').disabled=true
 try{const base={title:$('title').value,description:$('description').value,content_date:$('date').value||null,cards,status}
 const existing=check(await sb.from('submissions').select('id').eq('id',id).maybeSingle())
 if(existing)check(await sb.from('submissions').update(base).eq('id',id).select('id').single())
 else check(await sb.from('submissions').insert({...base,id}).select('id').single())
 await list()
 if(status==='submitted'){closeEditor();say('המהדורה נשלחה לאישור')}else say('הטיוטה נשמרה')
 }catch{say('השמירה נכשלה. נסו שוב.','bad')}finally{busy=false;$('submit').disabled=false;$('saveDraft').disabled=false}
}

$('new').onclick=()=>open()
$('add').onclick=()=>{if(cards.length>=30){say('אפשר להוסיף עד 30 כרטיסים','bad');return}cards.push({title:'',body:'',source:''});renderCards()}
$('close').onclick=closeEditor
$('editor').onsubmit=e=>{e.preventDefault();save('draft')}
$('submit').onclick=()=>save('submitted')
$('title').addEventListener('input',updateCounts);$('description').addEventListener('input',updateCounts)

async function boot(){
 try{
  const session=await restoreSession()
  if(session.status==='guest'){location.replace('../login/?return=contribute');return}
  if(session.status!=='user'){say('לא הצלחנו להתחבר. רעננו ונסו שוב.','bad');return}
  user=session.user;sb=await getSB()
  const profile=check(await sb.from('profiles').select('role,is_admin').eq('id',user.id).single())
  if(!profile.is_admin&&profile.role!=='contributor'){$('gate').hidden=false;return}
  $('workspace').hidden=false;await list()
 }catch{say('לא הצלחנו לטעון את המהדורות. נסו שוב.','bad')}
}
boot()

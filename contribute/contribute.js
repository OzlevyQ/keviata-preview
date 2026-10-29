import {getSB,restoreSession} from '../js/auth.js'
const $=id=>document.getElementById(id)
let sb,user,id,cards=[],busy=false
const say=t=>{$('status').textContent=t}
const check=r=>{if(r.error)throw r.error;return r.data}
function element(tag,text){const node=document.createElement(tag);if(text)node.textContent=text;return node}
async function list(){
 const rows=check(await sb.from('submissions').select('*').eq('author_id',user.id).order('updated_at',{ascending:false}));$('list').replaceChildren()
 const labels={draft:'טיוטה',submitted:'ממתינה לאישור',published:'פורסמה',rejected:'נדחתה'}
 for(const row of rows){const article=element('article');article.append(element('h2',row.title||'ללא כותרת'),element('p',labels[row.status]),element('p',row.review_note||''));if(row.status!=='published'){const edit=element('button','עריכה');edit.type='button';edit.onclick=()=>open(row);article.append(edit)}$('list').append(article)}
}
function open(row={}){id=row.id||crypto.randomUUID();cards=structuredClone(row.cards?.length?row.cards:[{title:'',body:'',source:''}]);$('title').value=row.title||'';$('description').value=row.description||'';$('date').value=row.content_date||'';$('editor').hidden=false;renderCards()}
async function renderCards(){
 $('cards').replaceChildren()
 for(const card of cards){const field=element('fieldset');field.append(element('legend','כרטיס'))
 for(const [key,label,max] of [['title','כותרת',120],['body','תוכן',4000],['source','מקור',200]]){const wrap=element('label',label),input=element(key==='body'?'textarea':'input');input.maxLength=max;input.value=card[key]||'';input.required=key!=='source';input.oninput=()=>card[key]=input.value;wrap.append(input);field.append(wrap)}
 const upload=element('input');upload.type='file';upload.accept='image/jpeg,image/png,image/webp';upload.setAttribute('aria-label','תמונה לכרטיס');const imageStatus=element('p');field.append(upload,imageStatus)
 if(card.image){const {data,error}=await sb.storage.from('contributions').createSignedUrl(card.image,3600);if(!error){const img=element('img');img.src=data.signedUrl;img.alt=card.title;field.append(img)}}
 upload.onchange=async()=>{const file=upload.files?.[0];if(!file)return;if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024){imageStatus.textContent='יש לבחור תמונת JPEG, PNG או WebP עד 5MB';return}upload.disabled=true;busy=true;try{const ext={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[file.type];const path=user.id+'/'+id+'/'+crypto.randomUUID()+'.'+ext;check(await sb.storage.from('contributions').upload(path,file,{contentType:file.type}));card.image=path;imageStatus.textContent='התמונה הועלתה'}catch{imageStatus.textContent='העלאת התמונה נכשלה'}finally{busy=false;upload.disabled=false}}
 const removeImage=element('button','הסרת תמונה');removeImage.type='button';removeImage.onclick=()=>{delete card.image;renderCards()};field.append(removeImage)
 const remove=element('button','הסרת כרטיס');remove.type='button';remove.onclick=()=>{cards=cards.filter(c=>c!==card);renderCards()};field.append(remove);$('cards').append(field)
 }
}
async function save(status){
 if(busy){say('נא להמתין לסיום העלאת התמונה');return}
 if(status==='submitted'&&(!$('editor').reportValidity()||!cards.length)){say('יש למלא כותרת, תאריך ולפחות כרטיס אחד');return}
 busy=true;$('submit').disabled=true
 try{const row={title:$('title').value,description:$('description').value,content_date:$('date').value||null,cards,status};const existing=check(await sb.from('submissions').select('id').eq('id',id).maybeSingle());
 if(existing)check(await sb.from('submissions').update(row).eq('id',id).select('id').single());else {const inserted=check(await sb.from('submissions').insert(row).select('id').single());id=inserted.id}
 say(status==='submitted'?'המהדורה נשלחה לאישור':'הטיוטה נשמרה');await list()
 }catch{say('השמירה נכשלה. נסו שוב.')}finally{busy=false;$('submit').disabled=false}
}
$('new').onclick=async()=>{try{const row=check(await sb.from('submissions').insert({title:'',description:'',cards:[],status:'draft'}).select('*').single());open(row);await list()}catch{say('יצירת הטיוטה נכשלה')}};$('add').onclick=()=>{if(cards.length>=30){say('אפשר להוסיף עד 30 כרטיסים');return}cards.push({title:'',body:'',source:''});renderCards()};$('editor').onsubmit=e=>{e.preventDefault();save('draft')};$('submit').onclick=()=>save('submitted')
async function boot(){try{const session=await restoreSession();if(session.status==='guest'){location.replace('../login/?return=contribute');return}if(session.status!=='user'){say('לא הצלחנו להתחבר. רעננו ונסו שוב.');return}user=session.user;sb=await getSB();const profile=check(await sb.from('profiles').select('role,is_admin').eq('id',user.id).single());if(!profile.is_admin&&profile.role!=='contributor'){say('נדרש אישור כתיבה. אפשר לבקש אישור במסך הפרופיל.');return}$('workspace').hidden=false;await list()}catch{say('לא הצלחנו לטעון את המהדורות. נסו שוב.')}}
boot()

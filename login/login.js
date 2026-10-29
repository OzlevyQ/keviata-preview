import {FLAGS} from '../js/config.js'
import {otpRequest,otpVerify} from '../js/auth.js'
const $=id=>document.getElementById(id)
const RKEY='keviata-return'
const say=(t,bad)=>{const s=$('status');s.textContent=t;s.classList.toggle('bad',!!bad)}
/* return target: only same-app destinations (query/hash of the app, or the admin page) */
function returnTarget(){
  const p=new URLSearchParams(location.search).get('return')
  let r=p||sessionStorage.getItem(RKEY)||''
  if(r==='admin')return '../admin/'
  if(r==='contribute')return '../contribute/'
  if(r&&!/^[?#][\w\-=&/%.#]*$/.test(r))r=''
  return '../'+r
}
function remember(){const p=new URLSearchParams(location.search).get('return');if(p)sessionStorage.setItem(RKEY,p)}
function done(){try{localStorage.setItem('keviata-signed-in','1')}catch{};const t=returnTarget();sessionStorage.removeItem(RKEY);location.replace(t)}
remember()
{const t=returnTarget();if(t!=='../')$('backLink').href=t}

/* Server email OTP, independent of the Google SDK. */
let email='',resendAt=0
if(FLAGS.emailLogin)$('emailBlock').hidden=false
function otpError(e){
 if(e.error==='invalid_code')return 'הקוד שגוי או שפג תוקפו. נסו שוב או בקשו קוד חדש.'
 if(e.error==='expired')return 'תוקף הקוד פג. בקשו קוד חדש.'
 if(e.error==='rate_limited'){resendAt=Date.now()+(e.retryAfter||60)*1000;return `יותר מדי בקשות. נסו שוב בעוד ${e.retryAfter||60} שניות.`}
 if(e.error==='mail_unavailable')return 'שירות המייל אינו זמין כעת. נסו שוב מאוחר יותר.'
 return 'לא הצלחנו להתחבר. בדקו את החיבור ונסו שוב.'
}
async function sendCode(v){
 await otpRequest(v);email=v;resendAt=Date.now()+60000
 $('sentTo').textContent=v;$('stepMain').hidden=true;$('stepCode').hidden=false;$('code').value='';say('');$('code').focus()
}
$('emailForm').onsubmit=async e=>{
 e.preventDefault();const v=$('email').value.trim().toLowerCase()
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)){say('נא להזין כתובת מייל תקינה',true);$('email').focus();return}
 $('emailBtn').disabled=true;say('שולחים קוד…')
 try{await sendCode(v)}catch(err){say(otpError(err),true)}finally{$('emailBtn').disabled=false}
}
$('code').oninput=()=>{$('code').value=$('code').value.replace(/\D/g,'').slice(0,6)}
$('stepCode').onsubmit=async e=>{
 e.preventDefault();const code=$('code').value.replace(/\D/g,'')
 if(code.length!==6){say('הקוד כולל 6 ספרות',true);return}
 $('codeBtn').disabled=true;say('בודקים…')
 try{await otpVerify(email,code);done()}catch(err){say(otpError(err),true);$('code').select()}finally{$('codeBtn').disabled=false}
}
$('resendCode').onclick=async()=>{if(Date.now()<resendAt)return;$('resendCode').disabled=true;try{await sendCode(email)}catch(err){say(otpError(err),true)}}
setInterval(()=>{const n=Math.max(0,Math.ceil((resendAt-Date.now())/1000));$('resendCode').disabled=n>0;$('resendCode').textContent=n?`שליחה חוזרת בעוד ${n} שניות`:'שלחו קוד חדש'},1000)
$('changeEmail').onclick=()=>{$('stepCode').hidden=true;$('stepMain').hidden=false;$('code').value='';say('');$('email').focus()}

import {SUPABASE_URL_JS,SB_URL,SB_KEY,OTP_URL} from './config.js'
const SIGNED_HINT='keviata-signed-in'
let sbP=null
export let uid=null
export const tokenState={ok:true}
export function hasSessionHint(){try{return !!localStorage.getItem(SIGNED_HINT)}catch{return false}}
export function setSessionHint(on){try{on?localStorage.setItem(SIGNED_HINT,'1'):localStorage.removeItem(SIGNED_HINT)}catch{}}
export function getSB(){
 if(!sbP)sbP=import(SUPABASE_URL_JS).then(m=>{const sb=m.createClient(SB_URL,SB_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});sb.auth.onAuthStateChange((_event,session)=>{uid=session?.user?.id||null;setSessionHint(!!session)});return sb}).catch(e=>{sbP=null;throw e})
 return sbP
}
export async function getSBToken(){const {data,error}=await (await getSB()).auth.getSession();tokenState.ok=!error;if(error)throw error;return data.session?.access_token||SB_KEY}
export async function restoreSession(){
 try{const sb=await getSB();const {data,error}=await sb.auth.getSession();if(error)throw error;const u=data.session?.user;if(!u){uid=null;setSessionHint(false);return {status:'guest'}}uid=u.id;setSessionHint(true);return {status:'user',user:{id:u.id,email:u.email||'',name:u.user_metadata?.display_name||(u.email||'').split('@')[0],pictureUrl:u.user_metadata?.picture_url||''}}}catch{return {status:'offline'}}
}
export async function logout(){const {error}=await (await getSB()).auth.signOut();if(error)throw error;uid=null;setSessionHint(false)}
/* Tear down the local session without calling /logout. Used after delete-account, where the
   user is already gone server-side so any /logout request (even scope:'local') 403s. */
export async function clearLocalSession(){
 uid=null;setSessionHint(false)
 try{const sb=await getSB();await sb.auth.stopAutoRefresh()}catch{}
 try{localStorage.removeItem('sb-'+new URL(SB_URL).host.split('.')[0]+'-auth-token')}catch{}
}
async function otpCall(action,body){const r=await fetch(OTP_URL,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,...body}),signal:AbortSignal.timeout(15000)});const j=await r.json();if(!r.ok)throw Object.assign(new Error(j.error||'request_failed'),j,{status:r.status});return j}
export function otpRequest(email){return otpCall('send',{email})}
export async function otpVerify(email,code){const result=await otpCall('verify',{email,code});const {error}=await (await getSB()).auth.setSession({access_token:result.access_token,refresh_token:result.refresh_token});if(error)throw error;uid=result.user.id;setSessionHint(true);return result}

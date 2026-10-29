/* Keviata runtime configuration. Public values only (publishable key, project ids). */
export const BUILD='native-auth-2'
export const SB_URL='https://tbapyjqcsyoordncilte.supabase.co'
export const SB_KEY='sb_publishable_pX7cHDQWh1ShcwNZMqH1ng_IYGxK1xe'
export const FUNCTIONS_BASE=SB_URL+'/functions/v1'
export const OTP_URL=FUNCTIONS_BASE+'/email-otp'
export const ADMIN_ME_URL=FUNCTIONS_BASE+'/admin'
export const DELETE_URL=FUNCTIONS_BASE+'/delete-account'
export const ADMIN_OVERVIEW_URL=FUNCTIONS_BASE+'/admin'
export const ADMIN_USERS_URL=FUNCTIONS_BASE+'/admin'
export const VAPID_PUBLIC='BFERPntN4swt6boOnhiOy1nQ02qKTWB2R2aCQKeWNiZBtRNKtu3JHBjNRzmek4lAYZYWgGZiO75BOAmIJ2NOPoc'
export const SUPABASE_URL_JS=new URL('../vendor/supabase-js-2.109.0.mjs',import.meta.url).href
export const TZ='Asia/Jerusalem'
export const FLAGS={serverAdmin:true,emailDoubleOptIn:true,emailLogin:true,serverAccountDelete:true,contributors:true,dedications:false}

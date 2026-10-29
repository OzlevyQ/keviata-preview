/* Share an edition: native share with a rendered 1080x1350 card when supported,
   otherwise copy the link. The card is drawn locally on a canvas (no network). */
import {toast,fmtDay} from './util.js'
export const editionUrl=id=>{const u=new URL(location.href);u.search='';u.hash='';u.searchParams.set('date',id);return u.href}
function wrap(ctx,text,maxW){const words=String(text).split(/\s+/);const lines=[];let cur=''
  for(const w of words){const t=cur?cur+' '+w:w;if(ctx.measureText(t).width>maxW&&cur){lines.push(cur);cur=w}else cur=t}
  if(cur)lines.push(cur);return lines}
function rrect(x,l,t,w,h,r){x.beginPath();x.moveTo(l+r,t);x.arcTo(l+w,t,l+w,t+h,r);x.arcTo(l+w,t+h,l,t+h,r);x.arcTo(l,t+h,l,t,r);x.arcTo(l,t,l+w,t,r);x.closePath()}
// Share card: bold, high-contrast, readable at a WhatsApp thumbnail. Logo mark + name + title + slogan.
export async function renderCard(ed,{streak=0}={}){
  try{await Promise.all([
    document.fonts.load('800 92px "Frank Ruhl Libre"'),
    document.fonts.load('700 48px "Assistant"'),
    document.fonts.load('600 40px "Assistant"')]);await document.fonts.ready}catch{}
  const W=1080,H=1350,M=112,c=document.createElement('canvas');c.width=W;c.height=H
  const x=c.getContext('2d');x.direction='rtl';x.textAlign='right';x.textBaseline='alphabetic'
  // deep-green brand backdrop
  const g=x.createLinearGradient(W,0,W*.1,H);g.addColorStop(0,'#17432d');g.addColorStop(.5,'#0f2219');g.addColorStop(1,'#07110d')
  x.fillStyle=g;x.fillRect(0,0,W,H)
  const glow=x.createRadialGradient(W*.8,H*.1,30,W*.8,H*.1,W*.8);glow.addColorStop(0,'rgba(201,162,74,.26)');glow.addColorStop(1,'rgba(201,162,74,0)')
  x.fillStyle=glow;x.fillRect(0,0,W,H)
  // faint dotted grid, top band
  x.fillStyle='rgba(158,168,255,.18)';for(let i=0;i<W;i+=34)for(let j=0;j<H*.4;j+=34){const a=1-Math.hypot(i-W*.78,j-H*.12)/(W*.7);if(a>0){x.globalAlpha=a*.9;x.beginPath();x.arc(i,j,1.8,0,7);x.fill()}}
  x.globalAlpha=1
  // gold frame
  x.strokeStyle='rgba(201,162,74,.6)';x.lineWidth=3;rrect(x,48,48,W-96,H-96,38);x.stroke()
  // header: gold mark badge + wordmark
  const bs=104,bx=W-M-bs,by=116
  x.fillStyle='#c9a24a';rrect(x,bx,by,bs,bs,26);x.fill()
  x.fillStyle='#0f2219';x.textAlign='center';x.font='800 64px "Frank Ruhl Libre", serif';x.fillText('ק',bx+bs/2,by+bs/2+24)
  x.textAlign='right';x.fillStyle='#f3e3b5';x.font='700 76px "Frank Ruhl Libre", serif';x.fillText('קביעותא',bx-30,by+bs/2+26)
  // eyebrow: edition date
  x.fillStyle='#e7c876';x.font='700 36px "Assistant", sans-serif';x.fillText('המהדורה של היום · '+(ed.hebrewDate||fmtDay(ed.id)),W-M,by+bs+78)
  // title (large serif, high contrast)
  x.fillStyle='#f8f4e8';x.font='800 92px "Frank Ruhl Libre", serif'
  let y=by+bs+200;const titleLines=wrap(x,ed.title||'מהדורת קביעותא',W-2*M).slice(0,5)
  for(const l of titleLines){x.fillText(l,W-M,y);y+=106}
  // description
  if(ed.description){x.fillStyle='#d4d9cd';x.font='400 42px "Assistant", sans-serif';y+=26;for(const l of wrap(x,ed.description,W-2*M).slice(0,3)){x.fillText(l,W-M,y);y+=58}}
  // streak chip
  if(streak>1){x.fillStyle='#e7c876';x.font='700 42px "Assistant", sans-serif';x.fillText('רצף של '+streak+' ימי לימוד',W-M,Math.min(y+40,H-320))}
  // gold divider above the slogan
  x.strokeStyle='rgba(201,162,74,.5)';x.lineWidth=2;x.beginPath();x.moveTo(W-M,H-248);x.lineTo(M,H-248);x.stroke()
  // slogan + host
  x.fillStyle='#f3e3b5';x.font='700 52px "Frank Ruhl Libre", serif';x.fillText('שאלה אחת מהעתיד, תשובה מהמקורות, כל יום.',W-M,H-170,W-2*M)
  x.fillStyle='#aeb6a9';x.font='600 34px "Assistant", sans-serif';x.direction='ltr'
  const u=new URL(editionUrl(ed.id));x.fillText(u.host+u.pathname,W-M,H-110)
  return new Promise(r=>c.toBlob(b=>r(b),'image/png'))
}
export async function shareEdition(ed,opts={}){
  const url=editionUrl(ed.id),title=ed.title||'קביעותא',text=title+'\nשאלה אחת מהעתיד, תשובה מהמקורות, כל יום.'
  try{
    if(navigator.share){
      if(opts.withImage&&navigator.canShare){const b=await renderCard(ed,opts);const f=b&&new File([b],'keviata-'+ed.id+'.png',{type:'image/png'})
        if(f&&navigator.canShare({files:[f]})){await navigator.share({files:[f],title,text:text+'\n'+url});return}}
      await navigator.share({title,text,url});return
    }
  }catch(e){if(e&&e.name==='AbortError')return;console.warn('share failed',e)}
  try{await navigator.clipboard.writeText(url);toast('הקישור הועתק')}catch{toast(url)}
}
export async function downloadCard(ed,opts={}){
  const b=await renderCard(ed,opts);if(!b)return
  const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='keviata-'+ed.id+'.png';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),5000)
}

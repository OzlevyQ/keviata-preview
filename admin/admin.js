/* Keviata admin dashboard. Authorization is enforced by the admin function. */
import { ADMIN_OVERVIEW_URL, ADMIN_USERS_URL, BUILD, FLAGS } from '../js/config.js';

import {restoreSession,getSBToken,logout as authLogout} from '../js/auth.js';

const $ = (id) => document.getElementById(id);

/* ---------- formatting helpers ---------- */
const nf = new Intl.NumberFormat('he-IL');
function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? nf.format(n) : '0';
}
function pct(part, whole) {
  const p = Number(part), w = Number(whole);
  if (!Number.isFinite(p) || !Number.isFinite(w) || w <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((p / w) * 100)));
}
function fmtTime(iso) {
  if (!iso) return 'אין';
  try {
    return new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
  } catch (e) { return String(iso); }
}
function fmtDate(iso) {
  if (!iso) return 'אין';
  try {
    return new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', day: 'numeric', month: 'numeric', year: '2-digit' }).format(new Date(iso));
  } catch (e) { return String(iso); }
}

/* ---------- DOM builder ---------- */
function node(tag, props, kids) {
  const n = document.createElement(tag);
  if (props) for (const k in props) {
    if (props[k] == null) continue;
    if (k === 'class') n.className = props[k];
    else if (k === 'text') n.textContent = props[k];
    else n.setAttribute(k, props[k]);
  }
  if (kids) for (const c of kids) {
    if (c == null) continue;
    n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return n;
}
function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }
function pill(text, variant) { return node('span', { class: 'pill' + (variant ? ' ' + variant : ''), text }); }
function bar(percent, variant) {
  const fill = node('i');
  fill.style.setProperty('--w', percent + '%');
  return node('div', { class: 'bar' + (variant ? ' ' + variant : '') }, [fill]);
}

/* ---------- gate screen ---------- */
function gate(title, msg, btns, err) {
  $('dashRoot').hidden = true;
  $('gateRoot').hidden = false;
  $('gateTitle').textContent = title;
  $('gateMsg').textContent = msg;
  $('gateErr').textContent = err || '';
  const wrap = $('gateBtns');
  clear(wrap);
  (btns || []).forEach((b) => {
    let el;
    if (b.href) {
      el = node('a', { class: 'btn ' + (b.variant || 'primary'), href: b.href, text: b.t });
    } else {
      el = node('button', { type: 'button', class: 'btn ' + (b.variant || 'primary'), text: b.t });
      el.addEventListener('click', b.fn);
    }
    wrap.appendChild(el);
  });
}
function gate403() {
  gate(
    'אין גישה לדף הזה',
    'דף הניהול פתוח רק לחשבון מנהל. אם התחברת עם חשבון אחר, אפשר להתנתק ולהתחבר שוב.',
    [
      { t: 'חזרה לאפליקציה', href: '../', variant: 'ghost' },
      { t: 'התנתקות', fn: logout, variant: 'primary' }
    ]
  );
}
function gateError() {
  gate(
    'לא הצלחנו לטעון את הנתונים',
    'ייתכן שיש בעיית חיבור זמנית. אפשר לנסות שוב.',
    [{ t: 'נסו שוב', fn: loadAll, variant: 'primary' }]
  );
}

/* ---------- loading status ---------- */
const SECTIONS = ['overview', 'system', 'editions', 'users', 'subscribers'];
function setBusy(busy) {
  SECTIONS.forEach((id) => { const s = $(id); if (s) s.setAttribute('aria-busy', busy ? 'true' : 'false'); });
}
function status(msg) { $('loadStatus').textContent = msg; }

/* ---------- overview render ---------- */
function render(d) {
  $('dashRoot').hidden = false;
  $('gateRoot').hidden = true;

  const st = d.status || {}, subs = d.subscribers || {}, lr = d.learners || {};
  const pub = st.publicationPush || {}, mail = st.dailyEmail || {};

  $('lastUpdated').textContent = d.generatedAt ? 'עודכן: ' + fmtTime(d.generatedAt) : '';

  /* KPIs */
  $('kpiUsers').textContent = num(lr.totalUsers);
  $('kpiActive').textContent = num(lr.activeLast7Days);
  $('kpiCompleted').textContent = num(lr.editionsCompletedTotal);
  $('kpiEmail').textContent = num(subs.emailOptIns);
  const activePill = $('kpiActivePill');
  activePill.textContent = pct(lr.activeLast7Days, lr.totalUsers) + '%';
  activePill.hidden = false;

  /* system status */
  const pubOk = (Number(pub.deliveredForLatest) || 0) >= (Number(pub.publicationOptIns) || 0);
  const mailOk = (Number(mail.deliveredForLatest) || 0) >= (Number(mail.emailOptIns) || 0);
  const edOk = !!st.todayEditionPublished;
  const allOk = edOk && pubOk && mailOk;

  const badge = $('healthBadge');
  badge.hidden = false;
  badge.textContent = allOk ? 'הכל תקין' : 'דורש תשומת לב';
  badge.className = 'pill health ' + (allOk ? 'ok' : 'warn');

  const rows = $('systemRows');
  clear(rows);
  rows.appendChild(sysRow(
    'מהדורת היום',
    edOk ? pill('פורסמה', 'ok') : pill('טרם פורסמה', 'warn'),
    'מהדורה אחרונה: ' + (st.latestEditionDate ? fmtDate(st.latestEditionDate) : 'אין'),
    null
  ));
  rows.appendChild(sysRow(
    'פוש פרסום',
    pill(pubOk ? 'תקין' : 'חוסר', pubOk ? 'ok' : 'bad'),
    'נמסר ' + num(pub.deliveredForLatest) + ' מתוך ' + num(pub.publicationOptIns) + ' מנויים',
    { percent: pct(pub.deliveredForLatest, pub.publicationOptIns), ok: pubOk }
  ));
  rows.appendChild(sysRow(
    'מייל יומי',
    pill(mailOk ? 'תקין' : 'חוסר', mailOk ? 'ok' : 'bad'),
    'נמסר ' + num(mail.deliveredForLatest) + ' מתוך ' + num(mail.emailOptIns) + ' מנויים',
    { percent: pct(mail.deliveredForLatest, mail.emailOptIns), ok: mailOk }
  ));

  renderEditions(d.editions || []);
  renderSubscribers(subs);
}

function sysRow(label, pillEl, detail, barInfo) {
  const head = node('div', { class: 'sysrow-head' }, [node('span', { class: 'sysrow-label', text: label }), pillEl]);
  const kids = [head, node('div', { class: 'sysrow-detail', text: detail })];
  if (barInfo) kids.push(bar(barInfo.percent, barInfo.ok ? 'ok' : 'bad'));
  return node('div', { class: 'sysrow' }, kids);
}

/* ---------- editions ---------- */
function td(label, kids, opts) {
  opts = opts || {};
  let cls = opts.class || '';
  if (opts.stacked) cls = (cls ? cls + ' ' : '') + 'stacked';
  return node('td', { 'data-label': label, class: cls || null }, kids);
}
function renderEditions(eds) {
  const body = $('edRows');
  clear(body);
  if (!eds.length) {
    body.appendChild(node('tr', { class: 'empty-row' }, [node('td', { colspan: '7', text: 'אין מהדורות עדיין' })]));
    return;
  }
  eds.forEach((e) => {
    const rate = pct(e.learnersCompleted, e.learnersStarted);
    const title = e.date
      ? node('a', { class: 'ed-title', href: '../?date=' + encodeURIComponent(e.date), target: '_blank', rel: 'noopener', text: e.title || 'אין כותרת' })
      : node('span', { class: 'uname', text: e.title || 'אין כותרת' });

    const rateCell = td('שיעור השלמה', [
      node('span', { class: 'rate-val', text: rate + '%' }),
      bar(rate, rate >= 100 ? 'ok' : null)
    ], { class: 'rate', stacked: true });

    body.appendChild(node('tr', null, [
      td('תאריך', [node('span', { class: 'nowrap', text: e.date ? fmtDate(e.date) : 'אין' })]),
      td('כותרת', [title], { stacked: true }),
      td('תאריך עברי', [document.createTextNode(e.hebrewDate || 'אין')]),
      td('כרטיסים', [node('span', { class: 'num', text: e.slides == null ? 'אין' : num(e.slides) })]),
      td('התחילו', [node('span', { class: 'num', text: num(e.learnersStarted) })]),
      td('השלימו', [node('span', { class: 'num', text: num(e.learnersCompleted) })]),
      rateCell
    ]));
  });
}

/* ---------- subscribers ---------- */
function renderSubscribers(subs) {
  const tiles = [
    { label: 'פוש פרסום', value: Number(subs.pushPublicationOptIns) || 0 },
    { label: 'תזכורת לימוד', value: Number(subs.pushReminderOptIns) || 0 },
    { label: 'מכשירים פעילים', value: Number(subs.pushOptedIn) || 0 },
    { label: 'מייל יומי', value: Number(subs.emailOptIns) || 0 }
  ];
  const grid = $('subTiles');
  clear(grid);
  tiles.forEach((t) => {
    grid.appendChild(node('article', { class: 'card tile' }, [
      node('span', { class: 'kpi-num', text: num(t.value) }),
      node('span', { class: 'kpi-label', text: t.label })
    ]));
  });

  const max = Math.max(1, ...tiles.map((t) => t.value));
  const chart = $('subChart');
  clear(chart);
  tiles.forEach((t) => {
    const head = node('div', { class: 'barrow-head' }, [
      node('span', { class: 'barrow-label', text: t.label }),
      node('span', { class: 'barrow-val', text: num(t.value) })
    ]);
    chart.appendChild(node('div', { class: 'barrow' }, [head, bar(Math.round((t.value / max) * 100))]));
  });
}

/* ---------- users ---------- */
const usersState = { page: 0, pageSize: 20, search: '', pages: 1, total: 0 };
let usersReq = 0;

function consentPills(u) {
  const wrap = node('div', { class: 'consents' });
  if (u.pushPublication) wrap.appendChild(pill('פוש פרסום', 'ok'));
  if (u.pushReminder) wrap.appendChild(pill('תזכורת', 'ok'));
  if (u.emailOptIn) wrap.appendChild(pill('מייל', 'ok'));
  if (!wrap.childNodes.length) wrap.appendChild(node('span', { class: 'muted', text: 'אין' }));
  return wrap;
}
function renderUsers(d) {
  usersState.page = Number(d.page) || 0;
  usersState.pages = Number(d.pages) || 1;
  usersState.total = Number(d.total) || 0;
  $('usersTotal').textContent = usersState.total ? num(usersState.total) + ' משתמשים' : '';

  const body = $('userRows');
  clear(body);
  const users = d.users || [];
  if (!users.length) {
    body.appendChild(node('tr', { class: 'empty-row' }, [
      node('td', { colspan: '5', text: usersState.search ? 'לא נמצאו תוצאות לחיפוש' : 'אין משתמשים רשומים עדיין' })
    ]));
  } else {
    users.forEach((u) => {
      const userCell = td('משתמש', [
        node('div', { class: 'uname', text: u.display_name || u.name || 'אין שם' }),
        node('div', { class: 'uemail', text: u.email || '' }),
        pill(u.is_admin?'מנהל':u.role==='contributor'?'כותב':'קורא')
      ], { stacked: true });
      const edCell = td('מהדורות', [
        node('span', { class: 'ratio num' }, [node('b', { text: num(u.editionsCompleted) }), document.createTextNode(' / ' + num(u.editionsStarted))])
      ]);
      body.appendChild(node('tr', null, [
        userCell,
        td('הצטרפות', [node('span', { class: 'nowrap', text: u.signedUpAt ? fmtDate(u.signedUpAt) : 'אין' })]),
        td('פעילות אחרונה', [node('span', { class: 'nowrap', text: u.lastActivityAt ? fmtTime(u.lastActivityAt) : 'אין' })]),
        edCell,
        td('הסכמות', [consentPills(u)], { stacked: true })
      ]));
    });
  }

  $('pageInfo').textContent = usersState.pages > 1 ? ('עמוד ' + (usersState.page + 1) + ' מתוך ' + usersState.pages) : '';
  $('prevPage').disabled = usersState.page <= 0;
  $('nextPage').disabled = usersState.page >= usersState.pages - 1;
}

async function loadUsers() {
  const myReq = ++usersReq;
  return fetch(ADMIN_USERS_URL, {
    method: 'POST',
    headers: { authorization: 'Bearer ' + await getSBToken(), 'content-type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify({ action:'users', page: usersState.page, pageSize: usersState.pageSize, search: usersState.search })
  }).then((r) => {
    if (r.status === 401) { location.replace('../login/?return=admin'); throw { silent: true }; }
    if (r.status === 403) { gate403(); throw { silent: true }; }
    if (!r.ok) throw new Error('server_' + r.status);
    return r.json();
  }).then((d) => {
    if (myReq === usersReq) renderUsers(d);
  }).catch((e) => {
    if (e && e.silent) return;
    if (myReq !== usersReq) return;
    const body = $('userRows');
    clear(body);
    body.appendChild(node('tr', { class: 'empty-row' }, [
      node('td', { colspan: '5', text: 'לא הצלחנו לטעון את רשימת המשתמשים. נסו רענון.' })
    ]));
  });
}

/* ---------- overview fetch ---------- */
async function loadData() {
  return fetch(ADMIN_OVERVIEW_URL, {
    method: 'POST',
    headers: { authorization: 'Bearer ' + await getSBToken(), 'content-type':'application/json' },
    cache: 'no-store',
    body:JSON.stringify({action:'overview'})
  }).then((r) => {
    if (r.status === 401) { location.replace('../login/?return=admin'); throw { silent: true }; }
    if (r.status === 403) { gate403(); throw { silent: true }; }
    if (!r.ok) throw new Error('server_' + r.status);
    return r.json();
  }).then((d) => { render(d); });
}

function loadAll() {
  setBusy(true);
  status('טוען נתונים');
  return Promise.all([loadData(), loadUsers(),loadReviews()])
    .then(() => { setBusy(false); status('הנתונים עודכנו'); })
    .catch((e) => {
      setBusy(false);
      if (e && e.silent) return;
      status('טעינת הנתונים נכשלה');
      gateError();
    });
}

/* ---------- auth / boot ---------- */
let sessionJwt = null;

function logout(){authLogout().then(()=>location.replace('../')).catch(()=>gateError())}

function wireControls() {
  $('refreshBtn').addEventListener('click', () => { if (sessionJwt) loadAll(); });
  $('logoutBtn').addEventListener('click', logout);

  let searchTimer = null;
  $('userSearch').addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      usersState.search = $('userSearch').value.trim();
      usersState.page = 0;
      loadUsers();
    }, 300);
  });
  $('prevPage').addEventListener('click', () => {
    if (usersState.page > 0) { usersState.page--; loadUsers(); }
  });
  $('nextPage').addEventListener('click', () => {
    if (usersState.page < usersState.pages - 1) { usersState.page++; loadUsers(); }
  });

  /* nav chips: highlight the section in view */
  const chips = Array.from(document.querySelectorAll('.sectionnav .chip'));
  if ('IntersectionObserver' in window) {
    const byId = {};
    chips.forEach((c) => { byId[c.getAttribute('href').slice(1)] = c; });
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) {
          chips.forEach((c) => c.classList.remove('active'));
          const c = byId[en.target.id];
          if (c) c.classList.add('active');
        }
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    SECTIONS.forEach((id) => { const s = $(id); if (s) io.observe(s); });
  }
}

function boot() {
  $('buildId').textContent = 'גרסה: ' + BUILD;
  wireControls();
  restoreSession().then(async r=>{if(r.status!=='user'){location.replace('../login/?return=admin');return}sessionJwt=await getSBToken();loadAll()}).catch(()=>gateError())
}
boot();

async function adminCall(action,body={}){
 const response=await fetch(ADMIN_OVERVIEW_URL,{method:'POST',headers:{authorization:'Bearer '+await getSBToken(),'content-type':'application/json'},body:JSON.stringify({action,...body})});const data=await response.json();if(!response.ok)throw Object.assign(new Error(data.error),{status:response.status});return data
}
async function loadReviews(){
 for(const [kind,title] of [['requests','בקשות כותבים'],['submissions','תכנים לאישור']]){
 let section=document.getElementById(kind);if(!section){section=node('section',{id:kind,class:'card rv-queue'});$('dashRoot').append(section)}
 clear(section)
 const data=await adminCall(kind,{status:kind==='requests'?'pending':'submitted'})
 const rows=data[kind]||[]
 section.append(node('div',{class:'rv-head'},[node('h2',{text:title}),node('span',{class:'rv-count',text:String(rows.length)})]))
 if(!rows.length){section.append(node('p',{class:'muted rv-empty',text:kind==='requests'?'אין בקשות כתיבה ממתינות.':'אין תכנים שממתינים לאישור.'}));continue}
 for(const row of rows){
 const art=node('article',{class:'rv-card'})
 if(kind==='requests'){
 const init=((row.email||'?').trim()[0]||'?').toUpperCase()
 art.append(node('div',{class:'rv-who'},[node('span',{class:'rv-avatar','aria-hidden':'true',text:init}),node('div',{class:'rv-who-txt'},[node('span',{class:'rv-email',text:row.email||''}),node('span',{class:'rv-date',text:'נשלחה '+fmtDate(row.created_at)})])]))
 if(row.message)art.append(node('blockquote',{class:'rv-quote',text:row.message}))
 }else{
 const top=node('div',{class:'rv-sub-top'},[node('h3',{class:'rv-title',text:row.title||'ללא כותרת'})])
 if(row.content_date)top.append(pill('לפרסום '+fmtDate(row.content_date),'warn'))
 art.append(top)
 if(row.email)art.append(node('p',{class:'rv-email',text:row.email}))
 if(row.description)art.append(node('p',{class:'rv-desc',text:row.description}))
 const wrap=node('div',{class:'rv-cards'})
 ;(row.cards||[]).forEach((card,i)=>{const c=node('div',{class:'rv-mini'});c.append(node('div',{class:'rv-mini-head'},[node('span',{class:'rv-badge',text:String(i+1)}),node('h4',{text:card.title||''})]));if(card.body)c.append(node('p',{class:'rv-body',text:card.body}));if(card.image_url)c.append(node('img',{class:'rv-img',src:card.image_url,alt:card.title||''}));if(card.source)c.append(node('span',{class:'rv-source',text:card.source}));wrap.append(c)})
 if(wrap.childElementCount)art.append(wrap)
 }
 const noteId='note-'+kind+'-'+row.id
 const note=node('textarea',{id:noteId,class:'rv-note',maxlength:'1000'})
 art.append(node('div',{class:'rv-field'},[node('label',{for:noteId,class:'rv-note-label',text:kind==='requests'?'הערה למבקש (לא חובה)':'הערה לכותב (לא חובה)'}),note]))
 const feedback=node('p',{class:'rv-feedback','role':'status'})
 const actions=node('div',{class:'rv-actions'})
 const defs=kind==='requests'?[['approve','אישור','primary'],['reject','דחייה','reject']]:[['publish','אישור ופרסום','primary'],['reject','החזרה לכותב','reject']]
 for(const [decision,label,variant] of defs){
 const button=node('button',{type:'button',class:'btn'+(variant==='primary'?' primary':' rv-reject'),text:label})
 button.onclick=async()=>{button.disabled=true;feedback.textContent='';const action=kind==='requests'?'review_request':'review_submission';try{try{await adminCall(action,{id:row.id,decision,note:note.value})}catch(e){if(e.status===409&&e.message==='date_taken'&&confirm('כבר קיימת מהדורה בתאריך הזה. להחליף אותה?'))await adminCall(action,{id:row.id,decision,note:note.value,overwrite:true});else throw e}await loadAll()}catch{feedback.textContent='הפעולה נכשלה. נסו שוב.';button.disabled=false}}
 actions.append(button)
 }
 art.append(actions,feedback)
 section.append(art)
 }
 }
}

const API='',TOKEN_KEY='srwb_token',USER_KEY='srwb_user';
function saveSession(t,u,p){const s=p?localStorage:sessionStorage;s.setItem(TOKEN_KEY,t);s.setItem(USER_KEY,JSON.stringify(u))}
function getToken(){return localStorage.getItem(TOKEN_KEY)||sessionStorage.getItem(TOKEN_KEY)}
function getUser(){const r=localStorage.getItem(USER_KEY)||sessionStorage.getItem(USER_KEY);try{return r?JSON.parse(r):null}catch{return null}}
function clearSession(){[localStorage,sessionStorage].forEach(s=>{s.removeItem(TOKEN_KEY);s.removeItem(USER_KEY)})}
function decodeJwt(t){try{return JSON.parse(atob(t.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')))}catch{return null}}
function isExpired(t){const p=decodeJwt(t);return!p||!p.exp||Date.now()>=p.exp*1000}
(function(){const t=getToken();if(t&&!isExpired(t))showApp(getUser(),{restoreLastPage:true})})();
async function handleLogin(e){
  e.preventDefault();const username=document.getElementById('username').value.trim();const password=document.getElementById('password').value;const remember=document.getElementById('remember-me').checked;
  if(!username||!password)return showError('Please enter your username and password.');setLoading(true);clearError();
  try{let token=await tryLogin(username,password,'json');if(token===null)token=await tryLogin(username,password,'form');if(!token)throw new Error('Invalid username or password.');const d=decodeJwt(token);const user={username:d?.sub||username,role:d?.role||'user',full_name:d?.full_name||null};saveSession(token,user,remember);showApp(user,{});}
  catch(err){showError(err.message||'Unable to sign in.')}finally{setLoading(false)}
}
async function tryLogin(u,p,fmt){const isJ=fmt==='json';let res;try{res=await fetch(`${API}/api/auth/login`,{method:'POST',headers:{'Content-Type':isJ?'application/json':'application/x-www-form-urlencoded'},body:isJ?JSON.stringify({username:u,password:p}):new URLSearchParams({username:u,password:p})});}catch{throw new Error('Cannot reach the server.')}
if(res.status===422&&isJ)return null;if(res.status===401||res.status===403)throw new Error('Invalid username or password.');if(!res.ok)throw new Error(`Server error (${res.status}).`);const d=await res.json();return d.access_token||d.token||null;}
function showApp(user,opts={}){document.getElementById('login-view').style.display='none';document.getElementById('app-view').style.display='block';initDashboard(opts);setTimeout(updatePageMeta,0);}
function logout(){clearSession();location.reload()}
function setLoading(on){document.getElementById('login-btn').disabled=on;document.getElementById('spinner').style.display=on?'block':'none';document.getElementById('btn-label').textContent=on?'Signing in…':'Sign in';const arr=document.getElementById('btn-arrow');if(arr)arr.style.display=on?'none':'';}
function showError(msg){document.getElementById('err-text').textContent=msg;const b=document.getElementById('err-box');b.classList.remove('shake');void b.offsetWidth;b.classList.add('show','shake');['username','password'].forEach(id=>document.getElementById(id).classList.add('err'));}
function clearError(){document.getElementById('err-box').classList.remove('show');['username','password'].forEach(id=>document.getElementById(id).classList.remove('err'));}
['username','password'].forEach(id=>document.getElementById(id).addEventListener('input',clearError));
function togglePwd(){const inp=document.getElementById('password');const vis=inp.type==='text';inp.type=vis?'password':'text';document.getElementById('eye-show').style.display=vis?'':'none';document.getElementById('eye-hide').style.display=vis?'none':'';}

/* ══════════════════════ FILTER STATE ══════════════════════════════════ */
const filterState={zones:[],schemes:[],months:[]};
let allZoneSchemes={};  // {zone:[scheme,...]}
let governanceBundleCache=null;
let governanceBundlePromise=null;
let exportGovernanceBundleCache=null;
let exportGovernanceBundlePromise=null;

const LAST_PAGE_KEY='srwb_last_page';
const ROLE_HOME_PAGE={viewer:'overview',user:'operations',admin:'admin'};
const REPORT_DENSITY_STORAGE_KEY='srwb_report_density_mode';
const REPORT_DENSITY_PAGES=new Set(['production','wt-ei','customers','connections','stuck','connectivity','breakdowns','pipelines','billed','collections','charges','expenses','debtors','segment-revenue','workforce','class-connections','stuck-classes','pipe-materials']);
const REPORT_DENSITY_META={
  summary:{label:'Summary mode',description:'Show the KPI row and the primary chart first. Keep detailed tables hidden until requested.'},
  analysis:{label:'Analysis mode',description:'Add the supporting comparison charts while still keeping the detailed table on demand.'},
  detail:{label:'Detail mode',description:'Show the full report structure, including all supporting charts and the detailed table.'},
};
let reportDensityMode=(localStorage.getItem(REPORT_DENSITY_STORAGE_KEY)||'summary').toLowerCase();
if(!REPORT_DENSITY_META[reportDensityMode])reportDensityMode='summary';
const reportTableDisclosure={};
let overviewFocus='operations';
let topbarClockTimer=null;

function normalizeRole(role){
  const value=String(role||'user').toLowerCase();
  return ROLE_HOME_PAGE[value]?value:'user';
}
function getRoleHomePage(role){
  return ROLE_HOME_PAGE[normalizeRole(role)]||'overview';
}
function saveLastPage(page){
  if(!page)return;
  try{localStorage.setItem(LAST_PAGE_KEY,page);}catch{}
}
function getLastPage(){
  try{return localStorage.getItem(LAST_PAGE_KEY)||'';}catch{return '';}
}
function getInitialPageForUser(user,opts={}){
  const role=normalizeRole(user?.role);
  const roleHome=getRoleHomePage(role);
  if(opts.forceRoleHome)return roleHome;
  const lastPage=getLastPage();
  if(!lastPage)return roleHome;
  if(['admin','reports','compliance'].includes(lastPage) && role!=='admin')return roleHome;
  return lastPage;
}
function goToRoleHome(){
  navigate(getRoleHomePage((getUser()||{}).role));
}
function syncRoleLandingNotes(){
  document.querySelectorAll('[data-role-home-note]').forEach(el=>{
    el.hidden=true;
  });
}
function getLibraryExportPageTarget(){
  const page=String(currentPage||'').trim();
  if(page && !['reports','admin','operations','commercial'].includes(page)) return page;
  return 'overview';
}
function printLibraryCurrentWorking(){
  printReport(getLibraryExportPageTarget());
}
function exportLibraryCurrentWorking(){
  exportExcel(getLibraryExportPageTarget());
}
function exportLibraryDataExtract(){
  const page=REPORT_DENSITY_PAGES.has(currentPage)?currentPage:'production';
  if(REPORT_DENSITY_PAGES.has(page) && reportDensityMode!=='detail'){
    reportDensityMode='detail';
    try{localStorage.setItem(REPORT_DENSITY_STORAGE_KEY,reportDensityMode);}catch{}
    syncReportDensityToolbar(page);
    applyReportDensityMode(page);
  }
  exportExcel(page);
}
/* Toolbar "Export" menu for report pages — routes to current-page export. */
function exportFromToolbar(mode){
  const dd=document.getElementById('tb-export');
  if(dd) dd.removeAttribute('open');
  if(mode==='print') printLibraryCurrentWorking();
  else if(mode==='extract') exportLibraryDataExtract();
  else exportLibraryCurrentWorking();
}
/* Close the toolbar Export menu when clicking outside it or pressing Escape. */
document.addEventListener('click',e=>{
  const dd=document.getElementById('tb-export');
  if(dd && dd.hasAttribute('open') && !dd.contains(e.target)) dd.removeAttribute('open');
});
document.addEventListener('keydown',e=>{
  if(e.key!=='Escape') return;
  const dd=document.getElementById('tb-export');
  if(dd && dd.hasAttribute('open')) dd.removeAttribute('open');
  const bp=document.getElementById('bp-modal');
  if(bp && bp.classList.contains('open')) closeBoardPackBuilder();
});
function openAdminDataManagement(){
  navigate('admin');
  setTimeout(()=>admTab('data'),0);
}
function openAdminUploadHistory(){
  navigate('admin');
  setTimeout(()=>admTab('uploads'),0);
}

/* Quarter → month mapping (SRWB financial year: Apr–Mar) */
const QUARTER_MAP={
  Q1:['April','May','June'],
  Q2:['July','August','September'],
  Q3:['October','November','December'],
  Q4:['January','February','March'],
};
const ALL_FY_MONTHS=['April','May','June','July','August','September','October','November','December','January','February','March'];
const QUICK_PERIOD_OPTIONS=[
  {value:'',label:'All Periods'},
  {value:'YTD',label:'YTD'},
  {value:'Q1',label:'Q1 · Apr–Jun'},
  {value:'Q2',label:'Q2 · Jul–Sep'},
  {value:'Q3',label:'Q3 · Oct–Dec'},
  {value:'Q4',label:'Q4 · Jan–Mar'},
  {value:'M:April',label:'Apr'},
  {value:'M:May',label:'May'},
  {value:'M:June',label:'Jun'},
  {value:'M:July',label:'Jul'},
  {value:'M:August',label:'Aug'},
  {value:'M:September',label:'Sep'},
  {value:'M:October',label:'Oct'},
  {value:'M:November',label:'Nov'},
  {value:'M:December',label:'Dec'},
  {value:'M:January',label:'Jan'},
  {value:'M:February',label:'Feb'},
  {value:'M:March',label:'Mar'},
];

function formatTopbarDateTime(now=new Date()){
  const dateText=now.toLocaleDateString('en-GB',{weekday:'short',day:'2-digit',month:'short',year:'numeric'});
  const timeText=now.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  return {dateText,timeText};
}
function renderTopbarDateTime(){
  const dateEl=document.getElementById('tb-live-date');
  const timeEl=document.getElementById('tb-live-time');
  if(!dateEl||!timeEl)return;
  const {dateText,timeText}=formatTopbarDateTime();
  dateEl.textContent=dateText;
  timeEl.textContent=timeText;
}
function startTopbarClock(){
  renderTopbarDateTime();
  if(topbarClockTimer)return;
  topbarClockTimer=window.setInterval(renderTopbarDateTime,1000);
}

function openFilter(){
  document.getElementById('filter-panel').classList.add('open');
  updateFilterBadges();
  document.getElementById('filter-overlay').classList.add('show');
  // Quick filters live in the top bar; open schemes first for advanced refinement.
  ['zones','quarters','schemes','months'].forEach(s=>{
    document.getElementById('fps-'+s)?.classList.remove('open');
    const ch=document.getElementById('fpc-'+s);if(ch)ch.classList.add('rotated');
  });
  const preferred = filterState.schemes.length ? 'schemes' : (hasCustomPeriodSelection() ? 'months' : 'schemes');
  document.getElementById('fps-'+preferred)?.classList.add('open');
  const pch=document.getElementById('fpc-'+preferred);if(pch)pch.classList.remove('rotated');
}
function closeFilter(){document.getElementById('filter-panel').classList.remove('open');document.getElementById('filter-overlay').classList.remove('show');}

/* ── Accordion ───────────────────────────────────────────────────────── */
function toggleSection(id){
  const content=document.getElementById('fps-'+id);
  const chevron=document.getElementById('fpc-'+id);
  if(!content)return;
  const isOpen=content.classList.contains('open');
  // Accordion: close all sections first
  ['zones','quarters','schemes','months'].forEach(s=>{
    document.getElementById('fps-'+s)?.classList.remove('open');
    const ch=document.getElementById('fpc-'+s);if(ch)ch.classList.add('rotated');
  });
  // Open this one if it was closed
  if(!isOpen){content.classList.add('open');if(chevron)chevron.classList.remove('rotated');}
}

/* ── Quarter logic ───────────────────────────────────────────────────── */
function toggleQuarter(btn){
  const q=btn.dataset.quarter;
  const months=q==='YTD'?[...ALL_FY_MONTHS]:(QUARTER_MAP[q]||[]);
  const allSelected=months.length&&months.every(m=>filterState.months.includes(m));
  if(allSelected){filterState.months=filterState.months.filter(m=>!months.includes(m));}
  else{months.forEach(m=>{if(!filterState.months.includes(m))filterState.months.push(m);});}
  syncMonthButtons();syncQuarterButtons();updateFilterBadges();onFilterChange();
}
function syncMonthButtons(){
  document.querySelectorAll('#fp-months .fbtn').forEach(b=>{
    b.classList.toggle('active-month',filterState.months.includes(b.dataset.month));
  });
}
function syncQuarterButtons(){
  document.querySelectorAll('#fp-quarters .fbtn').forEach(b=>{
    const q=b.dataset.quarter;
    const months=q==='YTD'?[...ALL_FY_MONTHS]:(QUARTER_MAP[q]||[]);
    const allSel=months.length&&months.every(m=>filterState.months.includes(m));
    const someSel=months.some(m=>filterState.months.includes(m));
    b.classList.toggle('active-quarter',allSel);
    b.classList.toggle('partial-quarter',someSel&&!allSel);
  });
}

/* ── Badges ──────────────────────────────────────────────────────────── */
function updateFilterBadges(){
  let qCount=0;
  Object.keys(QUARTER_MAP).forEach(q=>{if(QUARTER_MAP[q].every(m=>filterState.months.includes(m)))qCount++;});
  const counts={zones:filterState.zones.length,quarters:qCount,schemes:filterState.schemes.length,months:filterState.months.length};
  Object.entries(counts).forEach(([k,v])=>{const el=document.getElementById('fpb-'+k);if(el){el.textContent=v||'';el.classList.toggle('show',v>0);}});

  const sectionMap={zones:'zones',schemes:'schemes',quarters:'months',months:'months'};
  Object.entries(sectionMap).forEach(([section,key])=>{
    const hdr=document.querySelector(`.fp-section[data-filter-section="${section}"] .fp-sec-hdr`)||document.querySelector(`#fps-${section}`)?.closest('.fp-section')?.querySelector('.fp-sec-hdr');
    const hasSel=!!filterState[key]?.length;
    if(hdr)hdr.classList.toggle('has-selection',hasSel);
  });

  updateFilterPanelSummary(qCount);
}

function monthsMatch(target){
  return filterState.months.length===target.length && target.every(m=>filterState.months.includes(m));
}

function deriveQuickZoneValue(){
  if(filterState.schemes.length)return '__custom__';
  if(!filterState.zones.length)return '';
  if(filterState.zones.length===1)return filterState.zones[0];
  return '__custom__';
}

function deriveQuickPeriodValue(){
  if(!filterState.months.length)return '';
  if(monthsMatch(ALL_FY_MONTHS))return 'YTD';
  for(const [q,months] of Object.entries(QUARTER_MAP)){
    if(monthsMatch(months))return q;
  }
  if(filterState.months.length===1)return `M:${filterState.months[0]}`;
  return '__custom__';
}

function hasCustomPeriodSelection(){
  return deriveQuickPeriodValue()==='__custom__';
}

function hasAdvancedFilters(){
  return !!filterState.schemes.length || deriveQuickZoneValue()==='__custom__' || deriveQuickPeriodValue()==='__custom__';
}

function renderQuickFilterControls(){
  const zoneSel=document.getElementById('tb-zone-select');
  const periodSel=document.getElementById('tb-period-select');
  if(zoneSel){
    const prev=zoneSel.value;
    zoneSel.innerHTML= DOMPurify.sanitize('<option value="">All Zones</option>' + Object.keys(allZoneSchemes).sort().map(z=>`<option value="${z}">${z}</option>`).join(''));
    const zoneValue=deriveQuickZoneValue();
    if(zoneValue==='__custom__'){
      zoneSel.insertAdjacentHTML('beforeend','<option value="__custom__">Custom selection</option>');
    }
    zoneSel.value = zoneValue || '';
    if(prev && zoneSel.value!==zoneValue && zoneSel.querySelector(`option[value="${prev.replace(/"/g,'&quot;')}"]`))zoneSel.value=prev;
  }
  if(periodSel){
    periodSel.innerHTML = DOMPurify.sanitize(QUICK_PERIOD_OPTIONS.map(opt=>`<option value="${opt.value}">${opt.label}</option>`).join(''));
    const periodValue=deriveQuickPeriodValue();
    if(periodValue==='__custom__'){
      periodSel.insertAdjacentHTML('beforeend','<option value="__custom__">Custom period</option>');
    }
    periodSel.value = periodValue || '';
  }
}

function onQuickZoneChange(value){
  if(value==='__custom__'){ openFilter(); return; }
  filterState.zones = value ? [value] : [];
  filterState.schemes = [];
  renderZoneButtons();
  renderSchemeButtons();
  updateFilterBadges();
  onFilterChange();
}

function onQuickPeriodChange(value){
  if(value==='__custom__'){ openFilter(); return; }
  if(!value){
    filterState.months=[];
  }else if(value==='YTD'){
    filterState.months=[...ALL_FY_MONTHS];
  }else if(QUARTER_MAP[value]){
    filterState.months=[...QUARTER_MAP[value]];
  }else if(value.startsWith('M:')){
    filterState.months=[value.slice(2)];
  }
  syncMonthButtons();
  syncQuarterButtons();
  updateFilterBadges();
  onFilterChange();
}

function clearAdvancedFilters(){
  const hadMultiZone=filterState.zones.length>1;
  filterState.schemes=[];
  if(hadMultiZone)filterState.zones=[];
  if(hasCustomPeriodSelection())filterState.months=[];
  const qi=document.getElementById('fp-scheme-q');if(qi)qi.value='';
  renderZoneButtons();
  renderSchemeButtons();
  syncMonthButtons();
  syncQuarterButtons();
  updateFilterBadges();
  onFilterChange();
}

function buildFilterSummaryParts(qCount=0){
  const MSHORT={January:'Jan',February:'Feb',March:'Mar',April:'Apr',May:'May',June:'Jun',July:'Jul',August:'Aug',September:'Sep',October:'Oct',November:'Nov',December:'Dec'};
  const zonePart=filterState.zones.length?`${filterState.zones.length} Zone${filterState.zones.length===1?'':'s'}`:'All Zones';
  const schemePart=filterState.schemes.length?`${filterState.schemes.length} Scheme${filterState.schemes.length===1?'':'s'}`:'All Schemes';
  let periodPart='All Months';
  if(filterState.months.length){
    const allTwelve=ALL_FY_MONTHS.every(m=>filterState.months.includes(m));
    const fullQuarterLabels=Object.keys(QUARTER_MAP).filter(q=>QUARTER_MAP[q].every(m=>filterState.months.includes(m)));
    if(allTwelve) periodPart='YTD';
    else if(qCount && fullQuarterLabels.length && fullQuarterLabels.length*3===filterState.months.length){
      periodPart=fullQuarterLabels.join(' · ');
    } else if(filterState.months.length===1) {
      periodPart=MSHORT[filterState.months[0]]||filterState.months[0];
    } else {
      periodPart=filterState.months.map(m=>MSHORT[m]||m).join(' · ');
    }
  }
  return {zonePart,schemePart,periodPart};
}

function updateFilterPanelSummary(qCount=0){
  const stateEl=document.getElementById('fp-summary-state');
  const mainEl=document.getElementById('fp-summary-main');
  const subEl=document.getElementById('fp-summary-sub');
  const wrap=document.getElementById('fp-summary');
  if(!stateEl||!mainEl||!subEl||!wrap)return;
  const activeCount=(filterState.zones.length?1:0)+(filterState.schemes.length?1:0)+(filterState.months.length?1:0);
  const {zonePart,schemePart,periodPart}=buildFilterSummaryParts(qCount);
  const hasActive=hasActiveFilters();
  stateEl.textContent=hasActive?`${activeCount} active ${activeCount===1?'group':'groups'}`:'All data';
  mainEl.textContent=`${zonePart} · ${schemePart} · ${periodPart}`;
  if(!hasActive){
    subEl.textContent='Use Zone and Period in the top bar for quick scope. Use this drawer for schemes and custom combinations.';
    wrap.classList.remove('is-active');
    return;
  }
  const details=[];
  if(filterState.zones.length===1)details.push(filterState.zones[0]);
  else if(filterState.zones.length>1)details.push('Multiple zones selected');
  if(filterState.schemes.length===1)details.push(filterState.schemes[0]);
  else if(filterState.schemes.length>1)details.push(`${filterState.schemes.length} schemes selected`);
  if(qCount)details.push(`${qCount} quarter${qCount===1?'':'s'} covered`);
  else if(filterState.months.length)details.push(`${filterState.months.length} month${filterState.months.length===1?'':'s'} selected`);
  subEl.textContent=details.join(' · ');
  wrap.classList.add('is-active');
}

/* ── Scheme helpers ──────────────────────────────────────────────────── */
function selectAllSchemes(){
  const activeZones=filterState.zones.length?filterState.zones:Object.keys(allZoneSchemes);
  filterState.schemes=[...new Set(activeZones.flatMap(z=>allZoneSchemes[z]||[]))].sort();
  renderSchemeButtons();updateFilterBadges();onFilterChange();
}
function filterSchemeSearch(query){
  const c=document.getElementById('fp-schemes');if(!c)return;
  const q=query.toLowerCase().trim();
  c.querySelectorAll('.fbtn').forEach(b=>{b.style.display=(!q||b.textContent.toLowerCase().includes(q))?'':'none';});
  c.querySelectorAll('.fp-zone-grp-hdr').forEach(hdr=>{
    let el=hdr.nextElementSibling,any=false;
    while(el&&!el.classList.contains('fp-zone-grp-hdr')){if(el.style.display!=='none')any=true;el=el.nextElementSibling;}
    hdr.style.display=any?'':'none';
  });
}
function hasActiveFilters(){return filterState.zones.length||filterState.schemes.length||filterState.months.length;}
function renderFilterContext(){
  const el=document.getElementById('filter-context');
  const tx=document.getElementById('filter-context-text');
  if(!el||!tx)return;
  if(!hasAdvancedFilters()){el.classList.remove('visible');return;}
  const MSHORT={January:'Jan',February:'Feb',March:'Mar',April:'Apr',May:'May',June:'Jun',July:'Jul',August:'Aug',September:'Sep',October:'Oct',November:'Nov',December:'Dec'};
  const parts=[];
  if(filterState.schemes.length)parts.push(filterState.schemes.length===1?filterState.schemes[0]:filterState.schemes.length+' schemes');
  if(deriveQuickZoneValue()==='__custom__')parts.push(filterState.zones.length>1 ? filterState.zones.length+' zones' : 'Custom zone scope');
  const periodValue=deriveQuickPeriodValue();
  if(periodValue==='__custom__')parts.push('Custom period: '+filterState.months.map(m=>MSHORT[m]||m).join('·'));
  tx.textContent='Advanced · '+parts.join(' | ');
  el.classList.add('visible');
}
function updateFilterDots(){
  const tbBtn=document.getElementById('tb-filter-btn');
  const clearBtn=document.getElementById('tb-clear-filters-btn');
  const active=hasAdvancedFilters();
  if(tbBtn){tbBtn.classList.toggle('has-filters',!!active);const dot=tbBtn.querySelector('.tb-filter-dot');if(dot)dot.style.display=active?'inline-block':'none';}
  if(clearBtn)clearBtn.hidden=!hasActiveFilters();
  renderQuickFilterControls();
  renderFilterContext();
}

async function loadZoneSchemes(){
  try{const d=await fetchJsonSafe(`${API}/api/catalogue/zone-schemes`,{fallback:{},label:'/api/catalogue/zone-schemes'});allZoneSchemes=d||{};renderZoneButtons();renderSchemeButtons();}
  catch{}
}
function renderZoneButtons(){
  const c=document.getElementById('fp-zones');if(!c)return;
  c.innerHTML= DOMPurify.sanitize(Object.keys(allZoneSchemes).sort().map(z=>`<button class="fbtn${filterState.zones.includes(z)?' active-zone':''}" data-zone="${z}">${z}</button>`).join(''));
  c.querySelectorAll('.fbtn[data-zone]').forEach(btn=>btn.addEventListener('click',function(){toggleZone(this,this.dataset.zone);}));
  renderQuickFilterControls();
}
function renderSchemeButtons(){
  const c=document.getElementById('fp-schemes');if(!c)return;
  const activeZones=filterState.zones.length?filterState.zones:Object.keys(allZoneSchemes);
  const multiZone=activeZones.length>1;
  const query=(document.getElementById('fp-scheme-q')?.value||'').toLowerCase().trim();
  let html='';
  activeZones.forEach(zone=>{
    const schemes=(allZoneSchemes[zone]||[]).sort();
    const filtered=query?schemes.filter(s=>s.toLowerCase().includes(query)):schemes;
    if(!filtered.length)return;
    if(multiZone)html+=`<span class="fp-zone-grp-hdr" data-zone="${zone}"><span class="fp-zone-dot"></span>${zone}</span>`;
    filtered.forEach(s=>{html+=`<button class="fbtn${filterState.schemes.includes(s)?' active-scheme':''}" onclick="toggleScheme(this,'${s}')">${s}</button>`;});
  });
  c.innerHTML= DOMPurify.sanitize(html);
}
function toggleZone(btn,zone){
  const idx=filterState.zones.indexOf(zone);
  if(idx>=0)filterState.zones.splice(idx,1);else filterState.zones.push(zone);
  btn.classList.toggle('active-zone');
  renderSchemeButtons();updateFilterBadges();onFilterChange();
}
function toggleScheme(btn,scheme){
  const idx=filterState.schemes.indexOf(scheme);
  if(idx>=0)filterState.schemes.splice(idx,1);else filterState.schemes.push(scheme);
  btn.classList.toggle('active-scheme');
  updateFilterBadges();onFilterChange();
}
function toggleMonth(btn){
  const m=btn.dataset.month;
  const idx=filterState.months.indexOf(m);
  if(idx>=0)filterState.months.splice(idx,1);else filterState.months.push(m);
  btn.classList.toggle('active-month');
  syncQuarterButtons();updateFilterBadges();onFilterChange();
}
function clearFilter(type){
  if(type==='quarters'){
    filterState.months=[];syncMonthButtons();syncQuarterButtons();
  } else {
    filterState[type]=[];
    if(type==='zones'){renderZoneButtons();renderSchemeButtons();}
    else if(type==='schemes')renderSchemeButtons();
    else if(type==='months'){syncMonthButtons();syncQuarterButtons();}
  }
  updateFilterBadges();onFilterChange();
}
function resetAllFilters(){
  filterState.zones=[];filterState.schemes=[];filterState.months=[];
  renderZoneButtons();renderSchemeButtons();
  syncMonthButtons();syncQuarterButtons();
  updateFilterBadges();
  const qi=document.getElementById('fp-scheme-q');if(qi)qi.value='';
  onFilterChange();
}

/* ══════════════════════ EXPORT ENGINE ════════════════════════════════ */

// Registry: page → {tableId, title, landscape}
const EXPORT_CFG = {
  overview:     {tableId:'ov-zone-summary-export', title:'Executive Dashboard Summary', orientation:'landscape', landscape:true},
  production:   {tableId:'tbl-production',  title:'Production & Non-Revenue Water',   orientation:'landscape', landscape:true},
  'wt-ei':      {tableId:'tbl-wt-ei',       title:'Water Treatment & Energy',          orientation:'landscape', landscape:true},
  customers:    {tableId:'tbl-customers',   title:'Customer Accounts',                 orientation:'landscape', landscape:true},
  connections:  {tableId:'tbl-connections', title:'New Water Connections',             orientation:'portrait',  landscape:false},
  stuck:        {tableId:'tbl-stuck',       title:'Stuck Meters',                      orientation:'portrait',  landscape:false},
  connectivity: {tableId:'tbl-connectivity',title:'Service Connectivity',              orientation:'portrait',  landscape:false},
  breakdowns:   {tableId:'tbl-breakdowns',  title:'Infrastructure Breakdowns',         orientation:'landscape', landscape:true},
  pipelines:    {tableId:'tbl-pipelines',   title:'Pipeline Extensions',               orientation:'landscape', landscape:true},
  billed:       {tableId:'tbl-billed',      title:'Billed Amounts',                    orientation:'landscape', landscape:true},
  collections:  {tableId:'tbl-collections', title:'Billing & Collections',             orientation:'landscape', landscape:true},
  charges:      {tableId:'tbl-charges',     title:'Service Charges & Meter Rental',    orientation:'portrait',  landscape:false},
  expenses:     {tableId:'tbl-expenses',    title:'Operating Expenses',                orientation:'portrait',  landscape:false},
  debtors:      {tableId:'tbl-debtors',     title:'Outstanding Debtors',               orientation:'portrait',  landscape:false},
  'segment-revenue': {tableId:'tbl-segment-revenue', title:'Customer Segment Revenue', orientation:'landscape', landscape:true},
  workforce:    {tableId:'tbl-workforce',   title:'Workforce & Fleet Efficiency',      orientation:'landscape', landscape:true},
  'class-connections': {tableId:'tbl-class-connections', title:'Connection Pipeline by Customer Class', orientation:'landscape', landscape:true},
  'stuck-classes': {tableId:'tbl-stuck-classes', title:'Meter Exceptions by Customer Class', orientation:'landscape', landscape:true},
  'pipe-materials': {tableId:'tbl-pipe-materials', title:'Pipe Failure by Material and Size', orientation:'landscape', landscape:true},
};

function expOverlay(show, msg='Preparing export…'){
  const el=document.getElementById('exp-overlay');
  const tx=document.getElementById('exp-overlay-msg');
  if(tx)tx.textContent=msg;
  if(el)el.classList.toggle('show',show);
}

function buildCompactFilterSummary(){
  const MSHORT={January:'Jan',February:'Feb',March:'Mar',April:'Apr',May:'May',June:'Jun',July:'Jul',August:'Aug',September:'Sep',October:'Oct',November:'Nov',December:'Dec'};
  const fy=document.getElementById('fy-select')?.options[document.getElementById('fy-select').selectedIndex]?.text||dbState.year||'—';
  const zone=filterState.zones.length?filterState.zones.length===1?filterState.zones[0]:`${filterState.zones.length} Zones`:'All Zones';
  const months=filterState.months.length?filterState.months.length===12?'YTD':filterState.months.map(m=>MSHORT[m]||m).join(', '):'All Months';
  return `FY ${fy} · ${zone} · ${months}`;
}

function updatePageMeta(){
  const stamp=new Date().toLocaleString('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
  ['overview','operations','commercial','production','wt-ei','customers','connections','stuck','connectivity','breakdowns','pipelines','billed','collections','charges','expenses','debtors','segment-revenue','workforce','class-connections','stuck-classes','pipe-materials','budget','compliance','benchmarking','report-centre'].forEach(page=>{
    const el=document.getElementById(`pg-meta-${page}`);
    if(el)el.innerHTML= DOMPurify.sanitize(`${buildCompactFilterSummary()} <span class="meta-sep">·</span> Updated ${stamp}`);
  });
  const sc=document.getElementById('rc-scope-val');
  if(sc) sc.innerHTML= DOMPurify.sanitize(buildCompactFilterSummary());
}

function buildFilterSummary(){
  const MSHORT={January:'Jan',February:'Feb',March:'Mar',April:'Apr',May:'May',June:'Jun',July:'Jul',August:'Aug',September:'Sep',October:'Oct',November:'Nov',December:'Dec'};
  const fy=document.getElementById('fy-select')?.options[document.getElementById('fy-select').selectedIndex]?.text||dbState.year||'—';
  const parts=[`FY ${fy}`];
  if(filterState.zones.length)parts.push('Zone: '+filterState.zones.join(', '));
  else parts.push('All Zones');
  if(filterState.schemes.length)parts.push('Scheme: '+filterState.schemes.join(', '));
  else parts.push('All Schemes');
  if(filterState.months.length)parts.push('Period: '+filterState.months.map(m=>MSHORT[m]||m).join(', '));
  else parts.push('All Months');
  return parts.join(' | ');
}


function exportMetaLines(page,cfg){
  const generated=new Date().toLocaleString('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
  const governance=exportGovernancePage(page)||{};
  return {
    scope: buildFilterSummary(),
    generated,
    orientation: (cfg?.orientation||'landscape').replace(/^./,c=>c.toUpperCase()),
    fileStem: buildExportFileStem(page,cfg),
    source: footerState.src||'RawData.xlsx',
    dataStatus: footerState.dataOk?'Validated operational extract':'Check data quality state',
    dataQualityLabel: governance.data_quality_label || (footerState.dataOk ? 'Data quality strong' : 'Data quality watch'),
    dataQualityDetail: governance.data_quality_detail || '',
    evidenceLabel: governance.evidence_label || 'Context-led evidence',
    evidenceDetail: governance.evidence_detail || '',
    exportNote: governance.export_note || '',
    printRule: governance.print_rule || '',
    benchmarkRule: governance.benchmark_rule || '',
    legendRule: governance.legend_rule || '',
    governanceChips: governance.chips || [
      {label:(footerState.dataOk?'Data quality strong':'Data quality watch'), tone:(footerState.dataOk?'good':'amber'), detail:'Export governance cache not yet loaded.'},
      {label:'Context-led evidence', tone:'neutral', detail:'Fallback evidence classification used because governance export status was unavailable.'},
      {label:'Board-pack governed', tone:'neutral', detail:'Keep governance cues visible in report exports and print output.'},
    ],
  };
}

function buildExportFileStem(page,cfg){
  const fy=(document.getElementById('fy-select')?.options[document.getElementById('fy-select').selectedIndex]?.text||dbState.year||'All').toString().replace(/[^a-zA-Z0-9]+/g,'_');
  const zonePart=filterState.zones.length?`${filterState.zones.length}Zones`:'AllZones';
  const schemePart=filterState.schemes.length?`${filterState.schemes.length}Schemes`:'AllSchemes';
  const datePart=new Date().toISOString().slice(0,10);
  const title=(cfg?.title||page).replace(/[^a-zA-Z0-9]+/g,'_').replace(/^_+|_+$/g,'');
  return `SRWB_${title}_${fy}_${zonePart}_${schemePart}_${datePart}`;
}


function pageKpiRows(page){
  const pageMap={
    overview:['#ov-essentials .kc'],
    production:['#pr-kpis .kc'],
    'wt-ei':['#wt-kpis .kc'],
    customers:['#cu-kpis .kc'],
    connections:['#cn-kpis .kc'],
    stuck:['#st-kpis .kc'],
    connectivity:['#co-kpis .kc'],
    breakdowns:['#bd-kpis .kc','#bd-pvc-kpis .kc'],
    pipelines:['#pl-kpis .kc'],
    billed:['#bi-kpis .kc'],
    collections:['#cl-kpis .kc'],
    charges:['#ch-kpis .kc'],
    expenses:['#ex-kpis .kc'],
    debtors:['#de-kpis .kc'],
  };
  const selectors=pageMap[page]||[];
  const rows=[['Metric','Value','Status / Context','Benchmark']];
  selectors.forEach(sel=>{
    document.querySelectorAll(sel).forEach(card=>{
      rows.push([
        card.querySelector('.kc-lbl')?.innerText||'',
        card.querySelector('.kc-val')?.innerText||'',
        card.querySelector('.kc-sub')?.innerText||'',
        card.querySelector('.kc-bm-txt')?.innerText||card.querySelector('.kc-badge')?.innerText||''
      ]);
    });
  });
  return rows;
}

function appendReportDataSheet(wb,cfg){
  const tableEl=document.querySelector(`#${cfg.tableId} table.rpt`);
  if(!tableEl){throw new Error('No data table found for this report. Load the report first.');}
  const ws=XLSX.utils.table_to_sheet(tableEl,{raw:false});
  XLSX.utils.book_append_sheet(wb,ws,'Report Data');
}

// ── Mount export bar into a page's pg-hdr ──────────────────────────────
function mountExportBar(page){
  const cfg=EXPORT_CFG[page];if(!cfg)return;
  const hdr=document.querySelector(`#page-${page} .pg-hdr`);if(!hdr)return;
  if(hdr.querySelector('.exp-bar'))return; // already mounted
  const bar=document.createElement('div');
  bar.className='pg-hdr-right exp-bar';
  bar.innerHTML= DOMPurify.sanitize(`
    <button class="exp-btn exp-print" title="Print summary / Save as PDF">
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><rect x="3" y="5" width="10" height="7" rx="1" stroke="currentColor" stroke-width="1.4"/><path d="M5 5V3h6v2" stroke="currentColor" stroke-width="1.4"/><rect x="5" y="9" width="6" height="3" rx=".5" fill="currentColor" opacity=".2" stroke="currentColor" stroke-width="1.2"/></svg>
      Print Summary
    </button>
    <button class="exp-btn exp-xl" title="Export summary to Excel">
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><rect x="1" y="2" width="14" height="12" rx="2" stroke="currentColor" stroke-width="1.4"/><path d="M5 6l2.5 4L10 6" stroke="#16a34a" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 2v12M1 8h14" stroke="currentColor" stroke-width="1.2" opacity=".25"/></svg>
      Excel Summary
    </button>`);
  bar.querySelector('.exp-print').addEventListener('click', ()=>printReport(page));
  bar.querySelector('.exp-xl').addEventListener('click', ()=>exportExcel(page));
  hdr.appendChild(bar);

  // Inject print header block (hidden on screen, shown in @media print)
  if(!document.querySelector(`#page-${page} .print-report-header`)){
    const ph=document.createElement('div');
    ph.className='print-report-header';
    ph.innerHTML= DOMPurify.sanitize(`
      <div class="prh-org">Southern Region Water Board · Operations &amp; Performance Dashboard</div>
      <div class="prh-title">${cfg.title}</div>
      <div class="prh-meta" id="prh-meta-${page}"></div>
      <div class="prh-meta prh-meta-secondary" id="prh-meta-secondary-${page}"></div>
      <div class="prh-gov" id="prh-gov-${page}"></div>`);
    hdr.closest('.db-page').prepend(ph);
  }
  if(!document.querySelector(`#page-${page} .print-report-footer`)){
    const pf=document.createElement('div');
    pf.className='print-report-footer';
    pf.innerHTML= DOMPurify.sanitize(`<div class="prf-left" id="prf-left-${page}"></div><div class="prf-right" id="prf-right-${page}"></div>`);
    hdr.closest('.db-page').appendChild(pf);
  }
}

// ── Excel export ────────────────────────────────────────────────────────
function exportExcel(page){
  const cfg=EXPORT_CFG[page];if(!cfg)return;
  expOverlay(true,'Building Excel file…');
  setTimeout(()=>{
    try{
      const wb=XLSX.utils.book_new();
      let note='';
      if(page==='overview'){
        const zoneRows=[['Zone','NRW %','Collection Rate %','DSO (Days)','Operating Ratio','Revenue / Connection']];
        document.querySelectorAll('#ov-zone-tbl tbody tr').forEach(tr=>{
          const tds=[...tr.querySelectorAll('td')].map(td=>td.innerText.replace(/\s+/g,' ').trim());
          if(tds.length>=6)zoneRows.push(tds.slice(0,6));
        });
        const scRows=[['Indicator','Value','Benchmark']];
        document.querySelectorAll('#ov-scorecard .iwa-tile').forEach(tile=>{
          scRows.push([tile.querySelector('.iwa-tile-lbl')?.innerText||'',tile.querySelector('.iwa-tile-val')?.innerText||'',tile.querySelector('.iwa-tile-bm')?.innerText||'']);
        });
        const kpiRows=[['Section','Metric','Value','Status / Context']];
        [['Executive Summary','#ov-essentials .kc']].forEach(([sec,sel])=>{
          document.querySelectorAll(sel).forEach(card=>{
            kpiRows.push([sec,card.querySelector('.kc-lbl')?.innerText||'',card.querySelector('.kc-val')?.innerText||'',card.querySelector('.kc-sub')?.innerText||'']);
          });
        });
        XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(scRows),'Benchmark Scorecard');
        XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(kpiRows),'Executive KPIs');
        XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(zoneRows),'Zone Snapshot');
        note='Executive summary exported as structured sheets.';
      } else {
        const kpiRows=pageKpiRows(page);
        if(kpiRows.length>1)XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(kpiRows),'KPI Summary');
        appendReportDataSheet(wb,cfg);
        note='Report exported with KPI summary and full tabular data.';
      }
      const meta=exportMetaLines(page,cfg);
      const summary=[
        ['SRWB Operations & Performance Dashboard'],
        ['Report:',cfg.title],
        ['Filters:',meta.scope],
        ['Generated:',meta.generated],
        ['Page Orientation:',meta.orientation],
        ['Source File:',meta.source],
        ['Data Status:',meta.dataStatus],
        ['Data Quality:',meta.dataQualityLabel],
        ['Evidence Status:',meta.evidenceLabel],
        ['File Stem:',meta.fileStem],
        [],
        ['Note:',note],
        ['Governance Note:',meta.exportNote||'Governance export note not available.']
      ];
      const ws2=XLSX.utils.aoa_to_sheet(summary);
      XLSX.utils.book_append_sheet(wb,ws2,'Summary');
      const govSheet=[
        ['SRWB Governance Export Status'],
        ['Report',cfg.title],
        ['Data Quality',meta.dataQualityLabel],
        ['Data Quality Detail',meta.dataQualityDetail||''],
        ['Evidence Status',meta.evidenceLabel],
        ['Evidence Detail',meta.evidenceDetail||''],
        ['Benchmark Rule',meta.benchmarkRule||''],
        ['Legend Rule',meta.legendRule||''],
        ['Print Rule',meta.printRule||''],
        ['Governance Note',meta.exportNote||''],
      ];
      XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(govSheet),'Governance');
      XLSX.writeFile(wb,buildExportFileStem(page,cfg)+'.xlsx');
    }catch(e){alert('Export failed: '+e.message);}
    finally{expOverlay(false);}
  },80);
}

// ── Print / PDF ─────────────────────────────────────────────────────────
function printReport(page){
  const cfg=EXPORT_CFG[page];if(!cfg)return;

  const pageEl=document.getElementById('page-'+page);
  if(!document.querySelector(`#page-${page} .print-report-header`) && pageEl){
      const ph=document.createElement('div');
      ph.className='print-report-header';
      ph.innerHTML= DOMPurify.sanitize(`<div class="prh-org">Southern Region Water Board · Operations &amp; Performance Dashboard</div><div class="prh-title">${cfg.title}</div><div class="prh-meta" id="prh-meta-${page}"></div><div class="prh-meta prh-meta-secondary" id="prh-meta-secondary-${page}"></div><div class="prh-gov" id="prh-gov-${page}"></div>`);
      pageEl.prepend(ph);
  }
  if(!document.querySelector(`#page-${page} .print-report-footer`) && pageEl){
      const pf=document.createElement('div');
      pf.className='print-report-footer';
      pf.innerHTML= DOMPurify.sanitize(`<div class="prf-left" id="prf-left-${page}"></div><div class="prf-right" id="prf-right-${page}"></div>`);
      pageEl.appendChild(pf);
  }

  // Update the print header / footer metadata with live filter context
  const metaPack=exportMetaLines(page,cfg);
  const meta=document.getElementById(`prh-meta-${page}`);
  if(meta)meta.textContent=metaPack.scope;
  const meta2=document.getElementById(`prh-meta-secondary-${page}`);
  if(meta2)meta2.textContent=`Generated ${metaPack.generated} · ${metaPack.orientation} layout · Source: ${metaPack.source}`;
  const prhGov=document.getElementById(`prh-gov-${page}`);
  if(prhGov){
    prhGov.innerHTML= DOMPurify.sanitize(governanceChipHtml(metaPack.governanceChips||[], 'prh-chip'));
    prhGov.title=[metaPack.dataQualityDetail, metaPack.evidenceDetail, metaPack.printRule].filter(Boolean).join(' | ');
  }
  const prfLeft=document.getElementById(`prf-left-${page}`);
  if(prfLeft)prfLeft.textContent=`${cfg.title} · ${metaPack.dataStatus} · ${metaPack.evidenceLabel}`;
  const prfRight=document.getElementById(`prf-right-${page}`);
  if(prfRight)prfRight.textContent=`Export ref: ${metaPack.fileStem}`;

  // Inject @page size dynamically using explicit mm — more reliable than keywords
  // Landscape A4: 297×210mm  |  Portrait A4: 210×297mm
  let styleTag=document.getElementById('print-page-size');
  if(!styleTag){styleTag=document.createElement('style');styleTag.id='print-page-size';document.head.appendChild(styleTag);}
  if(cfg.landscape){
    styleTag.textContent=`@page{size:297mm 210mm;margin:5mm 6mm}`;
  }else{
    styleTag.textContent=`@page{size:210mm 297mm;margin:8mm 10mm}`;
  }

  // Mark the target page — CSS hides everything else in @media print
  document.querySelectorAll('.db-page').forEach(p=>p.classList.remove('print-target','portrait-pack','landscape-pack'));
  const targetPage=document.getElementById('page-'+page);
  if(targetPage){
    targetPage.classList.add('print-target', cfg.landscape?'landscape-pack':'portrait-pack');
  }
  document.body.classList.add('printing-report');

  window.print();

  // Cleanup after dialog closes
  setTimeout(()=>{
    document.body.classList.remove('printing-report');
    document.querySelectorAll('.db-page').forEach(p=>p.classList.remove('print-target','portrait-pack','landscape-pack'));
    // Leave style tag in place — it will be overwritten on next print
  },800);
}

/* ══════════════════════ STATUS FOOTER ════════════════════════════════ */
const footerState={collRate:null,records:null,src:'RawData.xlsx',dataOk:true};

function updateFooter(){
  const MSHORT={January:'Jan',February:'Feb',March:'Mar',April:'Apr',May:'May',June:'Jun',July:'Jul',August:'Aug',September:'Sep',October:'Oct',November:'Nov',December:'Dec'};
  // FY
  const fyEl=document.getElementById('fy-select');
  const fyTxt=fyEl?fyEl.options[fyEl.selectedIndex]?.text||dbState.year:dbState.year;
  const ftFy=document.getElementById('ft-fy');if(ftFy)ftFy.textContent=fyTxt||'—';
  // Scope
  const zPart=filterState.zones.length?(filterState.zones.length===1?filterState.zones[0]:filterState.zones.length+' Zones'):'All Zones';
  const mPart=filterState.months.length?(filterState.months.length===1?(MSHORT[filterState.months[0]]||filterState.months[0]):filterState.months.length+' Months'):'All Months';
  const ftSc=document.getElementById('ft-scope');if(ftSc)ftSc.textContent=zPart+' · '+mPart;
  // Collection rate
  const ftCo=document.getElementById('ft-coll');
  if(ftCo)ftCo.textContent=footerState.collRate!=null?footerState.collRate.toFixed(1)+'%':'—';
  // Records
  const ftRe=document.getElementById('ft-recs');
  if(ftRe)ftRe.textContent=footerState.records!=null?footerState.records.toLocaleString():'—';
  // Source
  const ftSr=document.getElementById('ft-src');
  if(ftSr)ftSr.textContent=footerState.src||'RawData.xlsx';
  // Status
  const ftSt=document.getElementById('ft-status');
  if(ftSt)ftSt.innerHTML= DOMPurify.sanitize(footerState.dataOk?'<span class="ft-ok">✓ Data OK</span>':'<span class="ft-warn">⚠ Check Data</span>');
}

function onFilterChange(){
  updateFilterDots();
  updateFooter();
  updatePageMeta();
  Object.keys(pageCache).forEach(k=>delete pageCache[k]);
  loadPage(currentPage);
}

/* ══════════════════════ API ════════════════════════════════════════════ */
function buildParams(extra={}){
  const p=new URLSearchParams({year:dbState.year,...extra});
  if(filterState.zones.length)p.set('zones',filterState.zones.join(','));
  if(filterState.schemes.length)p.set('schemes',filterState.schemes.join(','));
  if(filterState.months.length)p.set('months',filterState.months.join(','));
  return p.toString();
}
async function api(path){
  const token=getToken();const base=path.includes('?')?path+'&':path+'?';
  const url=API+base+buildParams();
  const res=await fetch(url,{headers:{Authorization:'Bearer '+token}});
  const text=await res.text();
  let data=null;
  try{data=text?JSON.parse(text):null;}catch{}
  if(!res.ok){
    const detail=(data&&data.detail)||text||('API '+res.status);
    throw new Error(`API ${res.status} on ${path}: ${String(detail).slice(0,180)}`);
  }
  if(text&&!data)throw new Error(`Invalid JSON from ${path}: ${text.slice(0,180)}`);
  return data;
}
async function fetchJsonSafe(url,{token=getToken(),fallback=null,label=url,method='GET',headers={},body}={}){
  const hdrs={...headers};
  if(token)hdrs.Authorization='Bearer '+token;
  const res=await fetch(url,{method,headers:hdrs,body});
  const text=await res.text();
  let data=null;
  try{data=text?JSON.parse(text):null;}catch{}
  if(!res.ok){
    const detail=(data&&data.detail)||text||(`Server error (${res.status})`);
    throw new Error(`${label}: ${String(detail).slice(0,180)}`);
  }
  if(text&&!data){
    if(fallback!==null)return fallback;
    throw new Error(`Invalid JSON from ${label}: ${text.slice(0,180)}`);
  }
  return data ?? fallback;
}
async function apiPanel(panel){
  const token=getToken();
  const path=`/api/panels/${panel}`;
  const url=`${API}${path}?${buildParams()}`;
  const res=await fetch(url,{headers:{Authorization:'Bearer '+token}});
  const text=await res.text();
  let data=null;
  try{data=text?JSON.parse(text):null;}catch{}
  if(!res.ok){
    const detail=(data&&data.detail)||text||('API '+res.status);
    throw new Error(`API ${res.status} on ${path}: ${String(detail).slice(0,180)}`);
  }
  if(text&&!data)throw new Error(`Invalid JSON from ${path}: ${text.slice(0,180)}`);
  return data;
}

/* ══════════════════════ REPORT TABLE ENGINE ═══════════════════════════ */
const FY_MO=['April','May','June','July','August','September','October','November','December','January','February','March'];
const MS={April:'APR',May:'MAY',June:'JUN',July:'JUL',August:'AUG',September:'SEP',October:'OCT',November:'NOV',December:'DEC',January:'JAN',February:'FEB',March:'MAR'};
const Q_END_MAP={June:'1ST',September:'2ND',December:'3RD',March:'4TH'};

function fv(v,fmt,dec,zeroOk){
  if(v==null||v===undefined)return'<span class="rpt-dash">—</span>';
  const n=Number(v);if(isNaN(n))return'<span class="rpt-dash">—</span>';
  if(n===0&&!zeroOk)return'<span class="rpt-dash">—</span>';
  if(n===0)return'0';
  switch(fmt){
    case'num':return Math.round(n).toLocaleString();
    case'mwk':return Math.round(n).toLocaleString();
    case'dec1':return n.toFixed(1);
    case'dec2':return n.toFixed(2);
    case'dec3':return n.toFixed(3);
    case'pct': return n.toFixed(1)+'%';
    case'raw': return n.toFixed(dec||0);
    default:   return Math.round(n).toLocaleString();
  }
}

function renderTable(containerId,title,rows,moData,reportKey=null){
  const el=document.getElementById(containerId);if(!el)return;
  const bm={};for(const m of moData)if(m.has_data)bm[m.month]=m;

  // Column layout: [Apr May Jun | 1st Qtr] [Jul Aug Sep | 2nd Qtr] [Oct Nov Dec | 3rd Qtr] [Jan Feb Mar | 4th Qtr] | Annual
  // Total cols: 1 metric + 12 months + 4 quarters + 1 annual = 18
  const QGROUPS=[[0,1,2],[3,4,5],[6,7,8],[9,10,11]];
  const QLABELS=['1ST QTR','2ND QTR','3RD QTR','4TH QTR'];
  const QTIPS=['Sum of Apr–Jun','Sum of Jul–Sep','Sum of Oct–Dec','Sum of Jan–Mar'];
  const NCOLS=18;

  // Helper: aggregate month indices for a row definition
  function aggQ(row,idxs,vals,mnums,mdens){
    const present=idxs.filter(i=>vals[i]!=null);
    if(!present.length)return null;
    if(row.annType==='last'){return vals[present[present.length-1]];}
    if(row.annType==='avg'){
      const ns=present.map(i=>Number(vals[i])).filter(n=>!isNaN(n));
      return ns.length?ns.reduce((a,b)=>a+b,0)/ns.length:null;}
    if(row.annType==='ratio'){
      const qn=idxs.reduce((a,i)=>a+(mnums[i]||0),0);
      const qd=idxs.reduce((a,i)=>a+(mdens[i]||0),0);
      return qd?qn/qd*(row.ratioMul||1):null;}
    // default: sum (skip zeros to match existing fv zero-handling)
    const ns=present.map(i=>Number(vals[i])).filter(n=>!isNaN(n)&&n!==0);
    return ns.length?ns.reduce((a,b)=>a+b,0):null;
  }

  // Build header
  const rptMeta=REPORT_META[reportKey]||{title,note:'Quarter totals and annual columns are auto-calculated from validated monthly utility returns.'};
  let h=`<div class="rpt-pack"><div class="rpt-head"><div><div class="rpt-eyebrow">Institutional Utility Reporting Pack</div><div class="rpt-title">${rptMeta.title}</div>${reportStandardChips(reportKey||'')}</div><div class="rpt-note">${rptMeta.note}</div></div><div class="rpt-wrap"><table class="rpt"><caption>${rptMeta.title}</caption><thead><tr>`;
  h+=`<th style="min-width:210px;text-align:left">Metric</th>`;
  for(let qi=0;qi<4;qi++){
    for(const mi of QGROUPS[qi])h+=`<th>${MS[FY_MO[mi]]}</th>`;
    h+=`<th class="qtr-th" title="${QTIPS[qi]}">${QLABELS[qi]}</th>`;
  }
  h+=`<th class="ann-th">ANNUAL</th></tr></thead><tbody>`;

  for(const row of rows){
    if(row.type==='spacer'){h+=`<tr><td colspan="${NCOLS}" style="height:5px;border:none;background:transparent"></td></tr>`;continue;}
    if(row.type==='section'){h+=`<tr class="row-section"><td colspan="${NCOLS}">${row.label}</td></tr>`;continue;}
    const rc=[row.bold?'row-total':'',row.color?'row-'+row.color:''].filter(Boolean).join(' ');
    h+=`<tr class="${rc}"><td class="rpt-lbl">${row.label}</td>`;

    // Collect all 12 monthly values upfront
    const vals=FY_MO.map(m=>{const md=bm[m];if(!md)return null;return row.computed?row.computed(md):md[row.field];});
    const mnums=row.annType==='ratio'?FY_MO.map(m=>bm[m]?Number(bm[m][row.numF]||0):0):null;
    const mdens=row.annType==='ratio'?FY_MO.map(m=>bm[m]?Number(bm[m][row.denF]||0):0):null;

    // Render month + quarter cells per group
    for(let qi=0;qi<4;qi++){
      for(const mi of QGROUPS[qi]){
        const v=vals[mi];
        h+=`<td>${v!=null?fv(v,row.fmt,row.dec,row.zeroOk):'<span class="rpt-dash">—</span>'}</td>`;
      }
      const qv=aggQ(row,QGROUPS[qi],vals,mnums,mdens);
      h+=`<td class="qtr-cell">${qv!=null?fv(qv,row.fmt,row.dec,row.zeroOk):'<span class="rpt-dash">—</span>'}</td>`;
    }

    // Annual: aggregate all 12 months
    const annV=aggQ(row,[0,1,2,3,4,5,6,7,8,9,10,11],vals,mnums,mdens);
    h+=`<td class="ann-cell">${annV!=null?fv(annV,row.fmt,row.dec,row.zeroOk):'<span class="rpt-dash">—</span>'}</td></tr>`;
  }
  h+=`</tbody></table></div></div>`;
  el.innerHTML= DOMPurify.sanitize(h);
}

// Pipelines variant: shows separate QTR columns
function renderPipelinesTable(containerId,moData){
  const el=document.getElementById(containerId);if(!el)return;
  const bm={};for(const m of moData)if(m.has_data)bm[m.month]=m;
  const Q=['April','May','June','July','August','September','October','November','December','January','February','March'];
  const QG=[[0,1,2],[3,4,5],[6,7,8],[9,10,11]];
  const QL=['1ST QTR','2ND QTR','3RD QTR','4TH QTR'];
  const rows=[
    {label:'32mm',  field:'dev_lines_32mm'},
    {label:'50mm',  field:'dev_lines_50mm'},
    {label:'63mm',  field:'dev_lines_63mm'},
    {label:'90mm',  field:'dev_lines_90mm'},
    {label:'110mm', field:'dev_lines_110mm'},
    {label:'Total dev. lines done',field:'dev_lines_total',bold:true},
  ];
  const rptMeta=REPORT_META.pipelines||{title:'Utility Pipeline Extension and Network Growth Report',note:'Quarter totals and annual columns are auto-calculated from validated monthly utility returns.'};
  let h=`<div class="rpt-pack"><div class="rpt-head"><div><div class="rpt-eyebrow">Institutional Utility Reporting Pack</div><div class="rpt-title">${rptMeta.title}</div>${reportStandardChips('pipelines')}</div><div class="rpt-note">${rptMeta.note}</div></div><div class="rpt-wrap"><table class="rpt"><caption>${rptMeta.title}</caption><thead><tr>`;
  h+=`<th style="min-width:160px;text-align:left">Size</th>`;
  for(let qi=0;qi<4;qi++){for(const mi of QG[qi]){const m=FY_MO[mi];h+=`<th>${MS[m]}</th>`;}h+=`<th class="qtr-th">${QL[qi]}</th>`;}
  h+=`<th class="ann-th">ANNUAL</th></tr></thead><tbody>`;
  for(const row of rows){
    const rc=row.bold?'row-total':'';
    h+=`<tr class="${rc}"><td class="rpt-lbl">${row.label}</td>`;
    let annSum=0;
    for(let qi=0;qi<4;qi++){
      let qSum=0;
      for(const mi of QG[qi]){const m=FY_MO[mi],md=bm[m];const v=md?Number(md[row.field]||0):0;qSum+=v;annSum+=v;h+=`<td>${v?Math.round(v).toLocaleString():'<span class="rpt-dash">—</span>'}</td>`;}
      h+=`<td class="qtr-cell">${qSum?Math.round(qSum).toLocaleString():'<span class="rpt-dash">—</span>'}</td>`;
    }
    h+=`<td class="ann-cell">${annSum?Math.round(annSum).toLocaleString():'<span class="rpt-dash">—</span>'}</td></tr>`;
  }
  h+=`</tbody></table></div></div>`;
  el.innerHTML= DOMPurify.sanitize(h);
}

/* Row definitions for each report */
const ROWS={
  production:[
    {label:'Vol. Produced (m³)',             field:'vol_produced',             fmt:'num', annType:'sum'},
    {label:'Total Revenue Water (m³)',        field:'revenue_water',            fmt:'num', annType:'sum', color:'green'},
    {label:'Total NRW (m³)',                  field:'nrw',                      fmt:'num', annType:'sum', color:'orange'},
    {label:'Vol. Billed — Postpaid (m³)',     field:'total_vol_billed_pp',      fmt:'num', annType:'sum'},
    {label:'Vol. Billed — Prepaid (m³)',      field:'total_vol_billed_prepaid', fmt:'num', annType:'sum'},
    {label:'% NRW',                           field:'pct_nrw',                  fmt:'pct', annType:'avg', color:'orange'},
  ],
  wt_ei:[
    {label:'Chlorine (kg)',                   field:'chlorine_kg',          fmt:'num', annType:'sum', color:'blue'},
    {label:'Aluminium Sulphate (kg)',          field:'alum_kg',              fmt:'num', annType:'sum', color:'blue'},
    {label:'Soda Ash (kg)',                   field:'soda_ash_kg',          fmt:'num', annType:'sum', color:'blue'},
    {label:'Algae Floc (litres)',             field:'algae_floc_litres',    fmt:'num', annType:'sum', color:'blue'},
    {label:'Sud Floc (litres)',               field:'sud_floc_litres',      fmt:'num', annType:'sum', color:'blue'},
    {label:'Potassium Permanganate (kg)',      field:'kmno4_kg',             fmt:'num', annType:'sum', color:'blue'},
    {label:'Cost of Chemicals (MWK)',          field:'chem_cost',            fmt:'mwk', annType:'sum', bold:true},
    {label:'Vol. Produced (m³)',              field:'vol_produced',         fmt:'num', annType:'sum', color:'green'},
    // Ratio = vol_produced / chem_cost (production per MWK of chemical spend)
    {label:'Ratio (Prd. v Chem. Cost)',
     computed:m=>m.chem_cost?m.vol_produced/m.chem_cost:null,
     fmt:'dec3', annType:'ratio', numF:'vol_produced', denF:'chem_cost', ratioMul:1},
    // Cost per m³ produced
    {label:'Cost/Vol. Produced — Chemicals (MWK/m³)',
     field:'chem_cost_per_m3', fmt:'dec2',
     annType:'ratio', numF:'chem_cost', denF:'vol_produced', ratioMul:1},
    {type:'spacer'},
    {type:'section',label:'Chemical and Energy Intensity'},
    {label:'Chlorine Intensity (kg/m3)',      field:'chlorine_kg_per_m3', fmt:'dec3', annType:'avg'},
    {label:'Alum Intensity (kg/m3)',          field:'alum_kg_per_m3', fmt:'dec3', annType:'avg'},
    {label:'Soda Ash Intensity (kg/m3)',      field:'soda_ash_kg_per_m3', fmt:'dec3', annType:'avg'},
    {label:'Algae Floc Intensity (L/m3)',     field:'algae_floc_per_m3', fmt:'dec3', annType:'avg'},
    {label:'Sud Floc Intensity (L/m3)',       field:'sud_floc_per_m3', fmt:'dec3', annType:'avg'},
    {label:'KMnO4 Intensity (kg/m3)',         field:'kmno4_per_m3', fmt:'dec3', annType:'avg'},
    {label:'Power Intensity (kWh/m3)',        field:'power_kwh_per_m3', fmt:'dec3', annType:'avg'},
    {label:'Power Cost (MWK/m3)',             field:'power_cost_per_m3', fmt:'dec2', annType:'avg'},
  ],
  customers:[
    {label:'Metered Customers',               field:'total_metered',         fmt:'num', annType:'last'},
    {label:'Disconnected Customers',          field:'total_disconnected',    fmt:'num', annType:'last'},
    {label:'Disconnected Individual',         field:'disconnected_individual',fmt:'num', annType:'last'},
    {label:'Disconnected Institutional',      field:'disconnected_inst',      fmt:'num', annType:'last'},
    {label:'Disconnected Commercial',         field:'disconnected_commercial',fmt:'num', annType:'last'},
    {label:'Disconnected CWP',                field:'disconnected_cwp',       fmt:'num', annType:'last'},
    {label:'Active Customers',                field:'active_customers',      fmt:'num', annType:'last', bold:true, color:'red'},
    {label:'Active Postpaid Customers',       field:'active_postpaid',       fmt:'num', annType:'last'},
    {label:'Active Prepaid Customers',        field:'active_prepaid',        fmt:'num', annType:'last'},
    {type:'spacer'},
    {label:'Active Post. Ind. Consumers',     field:'active_post_individual',fmt:'num', annType:'last'},
    {label:'Active Prep. Ind. Consumers',     field:'active_prep_individual',fmt:'num', annType:'last'},
    {label:'Active Post. Inst. Consumers',    field:'active_post_inst',      fmt:'num', annType:'last'},
    {label:'Active Prep. Inst. Consumers',    field:'active_prep_inst',      fmt:'num', annType:'last'},
    {label:'Active Post. Com. Consumers',     field:'active_post_commercial',fmt:'num', annType:'last'},
    {label:'Active Prep. Com. Consumers',     field:'active_prep_commercial',fmt:'num', annType:'last'},
    {label:'Active Post. CWP',               field:'active_post_cwp',       fmt:'num', annType:'last'},
    {label:'Active Prep. CWP',               field:'active_prep_cwp',       fmt:'num', annType:'last'},
    {type:'spacer'},
    {label:'Population in Supply Area',      field:'pop_supply_area',       fmt:'num', annType:'last'},
    {label:'Population Served',              field:'pop_supplied',          fmt:'num', annType:'last'},
    {label:'Coverage Rate (%)',              field:'pct_pop_supplied',      fmt:'pct', annType:'last'},
    {type:'spacer'},
    {type:'section',label:'Billed Water Volume by Customer Segment'},
    {label:'Indiv. Postpaid Volume (m³)',    field:'vol_billed_indiv_pp', fmt:'num', annType:'sum'},
    {label:'Inst. Postpaid Volume (m³)',     field:'vol_billed_inst_pp', fmt:'num', annType:'sum'},
    {label:'Comm. Postpaid Volume (m³)',     field:'vol_billed_comm_pp', fmt:'num', annType:'sum'},
    {label:'CWP Postpaid Volume (m³)',       field:'vol_billed_cwp_pp', fmt:'num', annType:'sum'},
    {label:'Indiv. Prepaid Volume (m³)',     field:'vol_billed_indiv_prepaid', fmt:'num', annType:'sum'},
    {label:'Inst. Prepaid Volume (m³)',      field:'vol_billed_inst_prepaid', fmt:'num', annType:'sum'},
    {label:'Comm. Prepaid Volume (m³)',      field:'vol_billed_comm_prepaid', fmt:'num', annType:'sum'},
    {label:'CWP Prepaid Volume (m³)',        field:'vol_billed_cwp_prepaid', fmt:'num', annType:'sum'},
  ],
  connections:[
    {label:'NWCs B/F',                        field:'all_conn_bfwd',              fmt:'num', annType:'last', color:'blue'},
    {label:'All Applications Logged',         field:'all_conn_applied',           fmt:'num', annType:'sum', zeroOk:true},
    {label:'NWCs Applied (Postpaid)',          field:'conn_applied',               fmt:'num', annType:'sum',  zeroOk:true},
    {label:'NWCs Done (Postpaid)',
     computed:m=>Math.max(0,(m.new_connections||0)-(m.prepaid_meters_installed||0)),
     fmt:'num', annType:'sum', zeroOk:true},
    {label:'Prepaid Meters Installed',        field:'prepaid_meters_installed',   fmt:'num', annType:'sum',  zeroOk:true},
    {label:'NWCs Done',                       field:'new_connections',            fmt:'num', annType:'sum',  bold:true, zeroOk:true},
    {label:'NWCs C/F',                        field:'all_conn_cfwd',              fmt:'num', annType:'last', color:'green'},
  ],
  stuck:[
    // B/F computed in patchStuckBF() — row[0] gets replaced at runtime
    {label:'Stuck Meters B/F',               computed:m=>null, fmt:'num', annType:'none'},
    {label:'Stuck Meters New',               field:'stuck_new',     fmt:'num', annType:'sum', color:'red',    zeroOk:true},
    {label:'Stuck Meters Repaired',          field:'stuck_repaired',fmt:'num', annType:'sum', color:'green',  zeroOk:true},
    {label:'Stuck Meters Replaced',          field:'stuck_replaced',fmt:'num', annType:'sum', color:'green',  zeroOk:true},
    {label:'Stuck Meters C/F',              field:'stuck_meters',  fmt:'num', annType:'last', bold:true},
  ],
  connectivity:[
    {label:'Customers Applied for New Connection', field:'conn_applied',       fmt:'num',  annType:'sum'},
    {label:'Days Taken to Give a Quotation',       field:'days_to_quotation',  fmt:'dec1', annType:'avg'},
    {label:'Customers Fully Paid',                 field:'conn_fully_paid',    fmt:'num',  annType:'sum'},
    {label:'Paid-up Applicants',                  field:'paid_up_applicants', fmt:'num', annType:'sum'},
    {label:'Days Taken to Connect Paid-up Custs',  field:'days_to_connect',    fmt:'dec1', annType:'avg'},
    {label:'Connection Lead Time (days)',         field:'connection_days',    fmt:'dec1', annType:'avg'},
    {label:'Connectivity Rate (%)',                field:'connectivity_rate',  fmt:'dec1', annType:'avg'},
    {label:'Queries Received',                     field:'queries_received',   fmt:'num',  annType:'sum', zeroOk:true},
    {label:'Time Taken to Resolve Queries (days)', field:'time_to_resolve',    fmt:'dec1', annType:'avg'},
    {label:'Average Response Time (days)',         field:'response_time_avg',  fmt:'dec1', annType:'avg'},
  ],
  breakdowns:[
    {label:'Total Pipe + Pump Breakdowns',
     computed:m=>(m.pipe_breakdowns||0)+(m.pump_breakdowns||0),
     fmt:'num', annType:'sum', bold:true, zeroOk:true},
    {type:'spacer'},
    {type:'section',label:'Pipe Breakdowns by Material'},
    {label:'PVC Pipes',      field:'pipe_pvc',     fmt:'num', annType:'sum', color:'blue',   zeroOk:true},
    {label:'GI Pipes',       field:'pipe_gi',      fmt:'num', annType:'sum', color:'green',  zeroOk:true},
    {label:'DI Pipes',       field:'pipe_di',      fmt:'num', annType:'sum', color:'orange', zeroOk:true},
    {label:'HDPE & AC Pipes',field:'pipe_hdpe_ac', fmt:'num', annType:'sum',                 zeroOk:true},
    {label:'Total Pipe Breakdowns',field:'pipe_breakdowns',fmt:'num',annType:'sum',bold:true,zeroOk:true},
    {type:'spacer'},
    {type:'section',label:'Pump & Supply'},
    {label:'Pump Breakdowns', field:'pump_breakdowns', fmt:'num', annType:'sum', color:'red',   zeroOk:true},
    {label:'Pump Hours Lost',  field:'pump_hours_lost', fmt:'num', annType:'sum',               zeroOk:true},
    {label:'Supply Hrs/Day (Avg)',field:'supply_hours', fmt:'dec1',annType:'avg'},
  ],
  billed:[
    {label:'Billed (Prepaid)',    field:'amt_billed_prepaid', fmt:'mwk', annType:'sum', color:'blue'},
    {label:'Collected (Prepaid)', field:'cash_coll_prepaid',  fmt:'mwk', annType:'sum', color:'blue'},
    {label:'Billed (Postpaid)',   field:'amt_billed_pp',      fmt:'mwk', annType:'sum', color:'orange'},
    {label:'Collected (Postpaid)',field:'cash_coll_pp',       fmt:'mwk', annType:'sum', color:'orange'},
    {label:'Total Billed',        field:'amt_billed',         fmt:'mwk', annType:'sum', bold:true},
    {label:'Total Collections',   field:'cash_collected',     fmt:'mwk', annType:'sum', bold:true, color:'green'},
  ],
  collections:[
    {label:'Billed (Prepaid)',    field:'amt_billed_prepaid', fmt:'mwk', annType:'sum'},
    {label:'Collected (Prepaid)', field:'cash_coll_prepaid',  fmt:'mwk', annType:'sum'},
    {label:'Billed (Postpaid)',   field:'amt_billed_pp',      fmt:'mwk', annType:'sum'},
    {label:'Collected (Postpaid)',field:'cash_coll_pp',       fmt:'mwk', annType:'sum'},
    {label:'Total Billed',        field:'amt_billed',         fmt:'mwk', annType:'sum', bold:true},
    {label:'Total Collections',   field:'cash_collected',     fmt:'mwk', annType:'sum', bold:true, color:'green'},
    {label:'Collection Rate (%)', field:'collection_rate',    fmt:'pct', annType:'ratio', numF:'cash_collected', denF:'amt_billed', ratioMul:100},
    {label:'Collection per Sales',field:'collection_per_sales',fmt:'dec3',annType:'avg'},
  ],
  charges:[
    {label:'Service Charge',     field:'service_charge', fmt:'mwk', annType:'sum', color:'green'},
    {label:'Meter Rental',       field:'meter_rental',   fmt:'mwk', annType:'sum', color:'blue'},
    {label:'Ratio (SC/MR)',      field:'sc_mr_ratio',    fmt:'dec2', annType:'avg'},
    {label:'Total Sales',        field:'total_sales',    fmt:'mwk', annType:'sum', bold:true},
  ],
  expenses:[
    {label:'Chemicals',          field:'chem_cost',    fmt:'mwk', annType:'sum', color:'blue'},
    {label:'Electricity',        field:'power_cost',   fmt:'mwk', annType:'sum', color:'orange'},
    {label:'Fuel',               field:'fuel_cost',    fmt:'mwk', annType:'sum'},
    {label:'Maintenance',        field:'maintenance',  fmt:'mwk', annType:'sum'},
    {label:'Staff',              field:'staff_costs',  fmt:'mwk', annType:'sum', color:'green'},
    {label:'Wages',              field:'wages',        fmt:'mwk', annType:'sum', color:'green'},
    {label:'Other Overhead',     field:'other_overhead',fmt:'mwk',annType:'sum'},
    {label:'Total Operating Costs',field:'op_cost',   fmt:'mwk', annType:'sum', bold:true},
    {type:'spacer'},
    {type:'section',label:'Efficiency and Utilisation'},
    {label:'Fuel Used (litres)', field:'fuel_used_litres', fmt:'num', annType:'sum'},
    {label:'Distance Covered (km)', field:'distances_km', fmt:'num', annType:'sum'},
    {label:'Staff / 1000m³ (12h)', field:'staff_per_1000m3_12h', fmt:'dec3', annType:'avg'},
    {label:'OpEx / m³ Produced', field:'op_cost_per_m3_produced', fmt:'dec2', annType:'avg'},
    {label:'OpEx / m³ Billed', field:'op_cost_per_m3_billed', fmt:'dec2', annType:'avg'},
    {label:'OpEx / Sales', field:'op_cost_per_sales', fmt:'dec3', annType:'avg'},
  ],
  pvc_breakdowns:[
    {type:'section',label:'PVC Pipe Breakdowns by Size (Breakages)'},
    {label:'20mm',  field:'pvc_20mm',  fmt:'num', annType:'sum', color:'blue',   zeroOk:true},
    {label:'25mm',  field:'pvc_25mm',  fmt:'num', annType:'sum', color:'blue',   zeroOk:true},
    {label:'32mm',  field:'pvc_32mm',  fmt:'num', annType:'sum', color:'blue',   zeroOk:true},
    {label:'40mm',  field:'pvc_40mm',  fmt:'num', annType:'sum', color:'green',  zeroOk:true},
    {label:'50mm',  field:'pvc_50mm',  fmt:'num', annType:'sum', color:'green',  zeroOk:true},
    {label:'63mm',  field:'pvc_63mm',  fmt:'num', annType:'sum', color:'green',  zeroOk:true},
    {label:'75mm',  field:'pvc_75mm',  fmt:'num', annType:'sum', color:'orange', zeroOk:true},
    {label:'90mm',  field:'pvc_90mm',  fmt:'num', annType:'sum', color:'orange', zeroOk:true},
    {label:'110mm', field:'pvc_110mm', fmt:'num', annType:'sum', color:'orange', zeroOk:true},
    {label:'160mm', field:'pvc_160mm', fmt:'num', annType:'sum', color:'red',    zeroOk:true},
    {label:'200mm', field:'pvc_200mm', fmt:'num', annType:'sum', color:'red',    zeroOk:true},
    {label:'250mm', field:'pvc_250mm', fmt:'num', annType:'sum', color:'red',    zeroOk:true},
    {label:'315mm', field:'pvc_315mm', fmt:'num', annType:'sum', color:'red',    zeroOk:true},
    {type:'spacer'},
    {label:'Total PVC Breakdowns',field:'pipe_pvc',fmt:'num',annType:'sum',bold:true,zeroOk:true},
  ],
  debtors:[
    {type:'section',label:'Debtor Balances (Latest per Scheme)'},
    {label:'Private Debtors',    field:'private_debtors', fmt:'mwk', annType:'last', color:'orange'},
    {label:'Public Debtors',     field:'public_debtors',  fmt:'mwk', annType:'last', color:'blue'},
    {label:'Total Debtors',      field:'total_debtors',   fmt:'mwk', annType:'last', bold:true, color:'red'},
  ],
  segment_revenue:[
    {type:'section',label:'Amounts Billed by Customer Segment'},
    {label:'Individual Postpaid', field:'amt_billed_indiv_pp', fmt:'mwk', annType:'sum'},
    {label:'Institutional Postpaid', field:'amt_billed_inst_pp', fmt:'mwk', annType:'sum'},
    {label:'Commercial Postpaid', field:'amt_billed_comm_pp', fmt:'mwk', annType:'sum'},
    {label:'CWP Postpaid', field:'amt_billed_cwp_pp', fmt:'mwk', annType:'sum'},
    {label:'Individual Prepaid', field:'amt_billed_indiv_prepaid', fmt:'mwk', annType:'sum'},
    {label:'Institutional Prepaid', field:'amt_billed_inst_prepaid', fmt:'mwk', annType:'sum'},
    {label:'Commercial Prepaid', field:'amt_billed_comm_prepaid', fmt:'mwk', annType:'sum'},
    {label:'CWP Prepaid', field:'amt_billed_cwp_prepaid', fmt:'mwk', annType:'sum'},
    {type:'spacer'},
    {type:'section',label:'Cash Collected by Customer Segment'},
    {label:'Individual Postpaid', field:'cash_coll_indiv_pp', fmt:'mwk', annType:'sum'},
    {label:'Institutional Postpaid', field:'cash_coll_inst_pp', fmt:'mwk', annType:'sum'},
    {label:'Commercial Postpaid', field:'cash_coll_comm_pp', fmt:'mwk', annType:'sum'},
    {label:'CWP Postpaid', field:'cash_coll_cwp_pp', fmt:'mwk', annType:'sum'},
    {label:'Individual Prepaid', field:'cash_coll_indiv_prepaid', fmt:'mwk', annType:'sum'},
    {label:'Institutional Prepaid', field:'cash_coll_inst_prepaid', fmt:'mwk', annType:'sum'},
    {label:'Commercial Prepaid', field:'cash_coll_comm_prepaid', fmt:'mwk', annType:'sum'},
    {label:'CWP Prepaid', field:'cash_coll_cwp_prepaid', fmt:'mwk', annType:'sum'},
    {type:'spacer'},
    {type:'section',label:'Service Charge and Meter Rental'},
    {label:'Service Charge — Individual', field:'service_charge_individual', fmt:'mwk', annType:'sum'},
    {label:'Service Charge — Institutions', field:'service_charge_institutions', fmt:'mwk', annType:'sum'},
    {label:'Service Charge — Commercial', field:'service_charge_commercial', fmt:'mwk', annType:'sum'},
    {label:'Service Charge — CWP', field:'service_charge_cwp', fmt:'mwk', annType:'sum'},
    {label:'Meter Rental — Individual', field:'meter_rental_individual', fmt:'mwk', annType:'sum'},
    {label:'Meter Rental — Institutions', field:'meter_rental_institutions', fmt:'mwk', annType:'sum'},
    {label:'Meter Rental — Commercial', field:'meter_rental_commercial', fmt:'mwk', annType:'sum'},
    {label:'Meter Rental — CWP', field:'meter_rental_cwp', fmt:'mwk', annType:'sum'},
  ],
  workforce:[
    {label:'Permanent Staff', field:'perm_staff', fmt:'num', annType:'last'},
    {label:'Temporary Staff', field:'temp_staff', fmt:'num', annType:'last'},
    {label:'Fuel Used (litres)', field:'fuel_used_litres', fmt:'num', annType:'sum'},
    {label:'Fuel Cost (MWK)', field:'fuel_cost', fmt:'mwk', annType:'sum'},
    {label:'Distance Covered (km)', field:'distances_km', fmt:'num', annType:'sum'},
    {label:'Maintenance (MWK)', field:'maintenance', fmt:'mwk', annType:'sum'},
    {label:'Staff / 1000m³ (12h)', field:'staff_per_1000m3_12h', fmt:'dec3', annType:'avg'},
    {label:'OpEx / m³ Produced', field:'op_cost_per_m3_produced', fmt:'dec2', annType:'avg'},
    {label:'OpEx / m³ Billed', field:'op_cost_per_m3_billed', fmt:'dec2', annType:'avg'},
    {label:'OpEx / Sales', field:'op_cost_per_sales', fmt:'dec3', annType:'avg'},
  ],
  class_connections:[
    {type:'section',label:'Individual'},
    {label:'B/F', field:'conn_indiv_bfwd', fmt:'num', annType:'last'},
    {label:'Applied', field:'conn_indiv_applied_pp', fmt:'num', annType:'sum'},
    {label:'Done Postpaid', field:'conn_indiv_done_pp', fmt:'num', annType:'sum'},
    {label:'Done Prepaid', field:'conn_indiv_done_prepaid', fmt:'num', annType:'sum'},
    {label:'Total Done', field:'conn_indiv_total_done', fmt:'num', annType:'sum'},
    {label:'C/F', field:'conn_indiv_cfwd', fmt:'num', annType:'last'},
    {type:'section',label:'Institutional'},
    {label:'B/F', field:'conn_inst_bfwd', fmt:'num', annType:'last'},
    {label:'Applied', field:'conn_inst_applied_pp', fmt:'num', annType:'sum'},
    {label:'Done Postpaid', field:'conn_inst_done_pp', fmt:'num', annType:'sum'},
    {label:'Done Prepaid', field:'conn_inst_done_prepaid', fmt:'num', annType:'sum'},
    {label:'Total Done', field:'conn_inst_total_done', fmt:'num', annType:'sum'},
    {label:'C/F', field:'conn_inst_cfwd', fmt:'num', annType:'last'},
    {type:'section',label:'Commercial'},
    {label:'B/F', field:'conn_comm_bfwd', fmt:'num', annType:'last'},
    {label:'Applied', field:'conn_comm_applied_pp', fmt:'num', annType:'sum'},
    {label:'Done Postpaid', field:'conn_comm_done_pp', fmt:'num', annType:'sum'},
    {label:'Done Prepaid', field:'conn_comm_done_prepaid', fmt:'num', annType:'sum'},
    {label:'Total Done', field:'conn_comm_total_done', fmt:'num', annType:'sum'},
    {label:'C/F', field:'conn_comm_cfwd', fmt:'num', annType:'last'},
    {type:'section',label:'CWP'},
    {label:'B/F', field:'conn_cwp_bfwd', fmt:'num', annType:'last'},
    {label:'Applied', field:'conn_cwp_applied_pp', fmt:'num', annType:'sum'},
    {label:'Done Postpaid', field:'conn_cwp_done_pp', fmt:'num', annType:'sum'},
    {label:'Done Prepaid', field:'conn_cwp_done_prepaid', fmt:'num', annType:'sum'},
    {label:'Total Done', field:'conn_cwp_total_done', fmt:'num', annType:'sum'},
    {label:'C/F', field:'conn_cwp_cfwd', fmt:'num', annType:'last'},
  ],
  stuck_classes:[
    {type:'section',label:'Individual'},
    {label:'B/F', field:'stuck_indiv_bfwd', fmt:'num', annType:'last'},
    {label:'New', field:'stuck_indiv_new', fmt:'num', annType:'sum'},
    {label:'Repaired', field:'stuck_indiv_repaired', fmt:'num', annType:'sum'},
    {label:'Replaced', field:'stuck_indiv_replaced', fmt:'num', annType:'sum'},
    {label:'C/F', field:'stuck_indiv_cfwd', fmt:'num', annType:'last'},
    {type:'section',label:'Institutional'},
    {label:'B/F', field:'stuck_inst_bfwd', fmt:'num', annType:'last'},
    {label:'New', field:'stuck_inst_new', fmt:'num', annType:'sum'},
    {label:'Repaired', field:'stuck_inst_repaired', fmt:'num', annType:'sum'},
    {label:'Replaced', field:'stuck_inst_replaced', fmt:'num', annType:'sum'},
    {label:'C/F', field:'stuck_inst_cfwd', fmt:'num', annType:'last'},
    {type:'section',label:'Commercial'},
    {label:'B/F', field:'stuck_comm_bfwd', fmt:'num', annType:'last'},
    {label:'New', field:'stuck_comm_new', fmt:'num', annType:'sum'},
    {label:'Repaired', field:'stuck_comm_repaired', fmt:'num', annType:'sum'},
    {label:'Replaced', field:'stuck_comm_replaced', fmt:'num', annType:'sum'},
    {label:'C/F', field:'stuck_comm_cfwd', fmt:'num', annType:'last'},
    {type:'section',label:'CWP'},
    {label:'B/F', field:'stuck_cwp_bfwd', fmt:'num', annType:'last'},
    {label:'New', field:'stuck_cwp_new', fmt:'num', annType:'sum'},
    {label:'Repaired', field:'stuck_cwp_repaired', fmt:'num', annType:'sum'},
    {label:'Replaced', field:'stuck_cwp_replaced', fmt:'num', annType:'sum'},
    {label:'C/F', field:'stuck_cwp_cfwd', fmt:'num', annType:'last'},
  ],
  pipe_materials:[
    {type:'section',label:'GI Pipe Failures'},
    {label:'15mm', field:'gi_15mm', fmt:'num', annType:'sum'},
    {label:'20mm', field:'gi_20mm', fmt:'num', annType:'sum'},
    {label:'25mm', field:'gi_25mm', fmt:'num', annType:'sum'},
    {label:'40mm', field:'gi_40mm', fmt:'num', annType:'sum'},
    {label:'50mm', field:'gi_50mm', fmt:'num', annType:'sum'},
    {label:'75mm', field:'gi_75mm', fmt:'num', annType:'sum'},
    {label:'100mm', field:'gi_100mm', fmt:'num', annType:'sum'},
    {label:'150mm', field:'gi_150mm', fmt:'num', annType:'sum'},
    {label:'200mm', field:'gi_200mm', fmt:'num', annType:'sum'},
    {type:'section',label:'DI Pipe Failures'},
    {label:'150mm', field:'di_150mm', fmt:'num', annType:'sum'},
    {label:'200mm', field:'di_200mm', fmt:'num', annType:'sum'},
    {label:'250mm', field:'di_250mm', fmt:'num', annType:'sum'},
    {label:'300mm', field:'di_300mm', fmt:'num', annType:'sum'},
    {label:'350mm', field:'di_350mm', fmt:'num', annType:'sum'},
    {label:'525mm', field:'di_525mm', fmt:'num', annType:'sum'},
    {type:'section',label:'HDPE and AC Pipe Failures'},
    {label:'HDPE 20mm', field:'hdpe_20mm', fmt:'num', annType:'sum'},
    {label:'HDPE 25mm', field:'hdpe_25mm', fmt:'num', annType:'sum'},
    {label:'HDPE 32mm', field:'hdpe_32mm', fmt:'num', annType:'sum'},
    {label:'HDPE 50mm', field:'hdpe_50mm', fmt:'num', annType:'sum'},
    {label:'AC 50mm', field:'ac_50mm', fmt:'num', annType:'sum'},
    {label:'AC 75mm', field:'ac_75mm', fmt:'num', annType:'sum'},
    {label:'AC 100mm', field:'ac_100mm', fmt:'num', annType:'sum'},
    {label:'AC 150mm', field:'ac_150mm', fmt:'num', annType:'sum'},
  ],
};

/* Patch stuck B/F: use previous month's stuck_meters as B/F */
function patchStuckBF(moData){
  const bm={};for(const m of moData)bm[m.month]=m;
  const prev={};
  for(let i=0;i<FY_MO.length;i++){
    const m=FY_MO[i];const prevM=i>0?FY_MO[i-1]:null;
    if(prevM&&bm[prevM])prev[m]=bm[prevM].stuck_meters;
  }
  // Override B/F computed field
  ROWS.stuck[0]={label:'Stuck Meters B/F',computed:m=>prev[m.month]??null,fmt:'num',annType:'none'};
}



function isReportDensityPage(page=currentPage){
  return REPORT_DENSITY_PAGES.has(page);
}

function syncReportDensityToolbar(page=currentPage){
  const active=isReportDensityPage(page);
  // Toolbar "Export" control — available on report pages, independent of the density toolbar.
  const exp=document.getElementById('tb-export');
  if(exp){exp.classList.toggle('is-hidden',!active);if(!active)exp.removeAttribute('open');}
  const wrap=document.getElementById('tb-viewmode');
  if(!wrap)return;
  wrap.classList.toggle('is-hidden',!active);
  wrap.setAttribute('aria-hidden',active?'false':'true');
  ['summary','analysis','detail'].forEach(mode=>{
    const btn=document.getElementById('tb-mode-'+mode);
    if(!btn)return;
    const selected=reportDensityMode===mode;
    btn.classList.toggle('active',selected);
    btn.setAttribute('aria-pressed',selected?'true':'false');
    btn.disabled=!active;
  });
}

function setReportDensity(mode){
  if(!REPORT_DENSITY_META[mode])return;
  reportDensityMode=mode;
  try{localStorage.setItem(REPORT_DENSITY_STORAGE_KEY,mode);}catch{}
  syncReportDensityToolbar(currentPage);
  applyReportDensityState(currentPage);
}

function toggleDetailTable(page=currentPage){
const explicit=reportTableDisclosure[page];
const expanded=!!explicit;
reportTableDisclosure[page]=!expanded;
applyReportDensityState(page);
}

function ensureReportDensityBanner(pageEl,page){
  if(!pageEl||!isReportDensityPage(page))return;
  const hdrLeft=pageEl.querySelector('.pg-hdr-left');
  if(!hdrLeft)return;
  let note=pageEl.querySelector('.pg-density-note');
  if(!note){
    note=document.createElement('div');
    note.className='pg-density-note';
    hdrLeft.appendChild(note);
  }
  const meta=REPORT_DENSITY_META[reportDensityMode]||REPORT_DENSITY_META.summary;
  note.innerHTML= DOMPurify.sanitize(`<span class="pg-density-chip">${meta.label}</span><span class="pg-density-copy">${meta.description}</span>`);
}

function ensureReportTableDisclosure(pageEl,page){
  if(!pageEl||!isReportDensityPage(page))return;
  const sections=[...pageEl.children].filter(el=>el.classList?.contains('ex-section'));
  sections.forEach(section=>{
    const tbl=section.querySelector('.tbl-section');
    if(!tbl)return;
    let bar=section.querySelector('.tbl-disclosure-bar');
    if(!bar){
      bar=document.createElement('div');
      bar.className='tbl-disclosure-bar';
      tbl.parentNode.insertBefore(bar,tbl);
    }
    const explicit=reportTableDisclosure[page];
    const expanded=!!explicit;
    const modeLabel=(REPORT_DENSITY_META[reportDensityMode]||REPORT_DENSITY_META.summary).label;
    const stateNote=expanded
      ? 'Detailed scheme-level rows are currently visible for this page.'
      : `Hidden by default in ${modeLabel.toLowerCase()} to reduce information overload. Enable it when you need scheme-level detail.`;
    bar.innerHTML= DOMPurify.sanitize(`<div class="tbl-disclosure-copy"><span class="tbl-disclosure-title">Detailed table</span><span class="tbl-disclosure-note">${stateNote}</span></div><button type="button" class="tbl-disclosure-btn">${expanded?'Hide detailed table':'Enable detailed table'}</button>`);
    const disclosureBtn=bar.querySelector('.tbl-disclosure-btn');
    if(disclosureBtn) disclosureBtn.addEventListener('click',()=>toggleDetailTable(page));
    section.classList.toggle('table-section-collapsed',!expanded);
    tbl.classList.toggle('is-collapsed',!expanded);
  });
}

function applyReportDensityState(page=currentPage){
  syncReportDensityToolbar(page);
  if(!isReportDensityPage(page))return;
  const pageEl=document.getElementById('page-'+page);
  if(!pageEl)return;
  ensureReportDensityBanner(pageEl,page);
  ensureReportTableDisclosure(pageEl,page);
  const sections=[...pageEl.children].filter(el=>el.classList?.contains('ex-section'));
  const analyticalSections=sections.filter(section=>!section.querySelector('.tbl-section'));
  analyticalSections.forEach((section,idx)=>{
    const visible=reportDensityMode==='detail' || (reportDensityMode==='analysis' ? idx<=2 : idx<=1);
    section.classList.toggle('density-hidden',!visible);
    section.hidden=!visible;
  });
  sections.filter(section=>section.querySelector('.tbl-section')).forEach(section=>{
    section.hidden=false;
  });
  requestAnimationFrame(()=>{
    Object.values(chartReg||{}).forEach(ch=>{try{ch?.resize?.();}catch{}});
  });
}

/* ══════════════════════ CHARTS & STATE ════════════════════════════════ */
const MONTHS_SHORT={April:'Apr',May:'May',June:'Jun',July:'Jul',August:'Aug',September:'Sep',October:'Oct',November:'Nov',December:'Dec',January:'Jan',February:'Feb',March:'Mar'};
let dbState={year:2026};
const pageCache={},chartReg={};
const F={
  num:n=>n==null?'—':Math.round(n).toLocaleString(),
  M:n=>{if(n==null)return'—';const a=Math.abs(n);return a>=1e9?(n/1e9).toFixed(2)+'B':a>=1e6?(n/1e6).toFixed(1)+'M':Math.round(n).toLocaleString()},
  pct:n=>n==null?'—':n.toFixed(1)+'%',m3:n=>{if(n==null)return'—';return n>=1e6?(n/1e6).toFixed(2)+'M m³':Math.round(n).toLocaleString()+' m³'},
  mwk:n=>'MWK '+F.M(n),dec:n=>n==null?'—':n.toFixed(1),
};
const GC='rgba(0,0,0,0.035)',LC='#6B7280';

/* ── SVG icon snippets (15×15) for KPI cards ── */
const ICON={
  drop:`<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6 9 4 12.5 4 15.5a8 8 0 0016 0C20 12.5 18 9 12 2z"/></svg>`,
  nrw:`<svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="currentColor" stroke-width="2" fill="currentColor" opacity=".15"/><path d="M12 9v4M12 17h.01" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>`,
  cash:`<svg width="15" height="15" viewBox="0 0 24 24" fill="none"><rect x="2" y="7" width="20" height="14" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="14" r="2" stroke="currentColor" stroke-width="1.8"/></svg>`,
  people:`<svg width="15" height="15" viewBox="0 0 24 24" fill="none"><circle cx="9" cy="7" r="4" stroke="currentColor" stroke-width="1.8"/><path d="M3 21v-2a4 4 0 014-4h4a4 4 0 014 4v2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M16 3.13a4 4 0 010 7.75M21 21v-2a4 4 0 00-3-3.85" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  bolt:`<svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" fill="currentColor" opacity=".2"/></svg>`,
  gauge:`<svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M3 12a9 9 0 1018 0" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M12 12l4.5-4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/></svg>`,
  meter:`<svg width="15" height="15" viewBox="0 0 24 24" fill="none"><rect x="3" y="6" width="18" height="13" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M8 6V4M16 6V4M8 12h4M8 15h8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  pipe:`<svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M3 9h18M3 15h18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>`,
  wrench:`<svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  clock:`<svg width="15" height="15" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/><path d="M12 7v5l3 3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  chart:`<svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M18 20V10M12 20V4M6 20v-6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  debt:`<svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M12 8v4l3 3M3 12a9 9 0 1018 0 9 9 0 00-18 0z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  conn:`<svg width="15" height="15" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/><path d="M12 8v8M8 12h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
  chem:`<svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M9 3h6M12 3v5l5 9H7L3 8V3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  staff:`<svg width="15" height="15" viewBox="0 0 24 24" fill="none"><rect x="2" y="7" width="20" height="14" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M16 7V5a2 2 0 00-4 0v2M8 7V5a2 2 0 00-4 0v2" stroke="currentColor" stroke-width="1.8"/></svg>`,
  revenue:`<svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
};

/* ── IWA / IBNET / World Bank benchmark constants ── */
const IWA={
  nrw:27,           // SRWB corporate NRW target <27%
  nrw_iwa:20,        // IWA international benchmark <20%
  nrw_warn:35,      // Warning threshold (action zone 27–35%)
  coll_rate:90,     // IBNET collection rate >90%
  op_ratio:0.80,    // World Bank operating ratio <0.80
  dso:60,           // IBNET DSO <60 days
  energy:0.5,       // IWA energy intensity <0.5 kWh/m³
  meter_read:95,    // Meter read rate >95%
  days_quote:7,     // WB quotation <7 working days
  days_connect:30,  // WB connection <30 days
  query_res:5,      // Query resolution <5 days
  bd_per_1k:5,      // Breakdown rate <5/1000 connections/yr
  repair_rate:80,   // Repair rate >80%
};
/* Helper: benchmark progress % (hi-good: higher=better; lo-good: lower=better) */
function bmPct(actual,target,hiGood){
  if(actual==null||!target)return null;
  return hiGood?Math.min(100,actual/target*100):Math.min(100,target/Math.max(actual,0.001)*100);
}
const baseScales=(yFmt)=>({
  x:{ticks:{color:LC,font:{size:10,family:'Inter,system-ui,sans-serif'},maxRotation:0,autoSkip:false},grid:{color:GC,drawBorder:false}},
  y:{ticks:{color:LC,font:{size:10,family:'Inter,system-ui,sans-serif'},callback:yFmt||undefined},grid:{color:GC},border:{display:false}}
});
const tooltipPlugin={
  plugins:{
    tooltip:{
      backgroundColor:'rgba(17,24,39,.93)',
      titleFont:{size:11,weight:'700',family:'Inter,system-ui,sans-serif'},
      bodyFont:{size:11,family:'Inter,system-ui,sans-serif'},
      padding:10,cornerRadius:8,
      callbacks:{
        label:ctx=>{
          const v=ctx.raw;if(v==null)return '';
          const a=Math.abs(v);
          if(a>=1e9)return ` ${(v/1e9).toFixed(2)}B`;
          if(a>=1e6)return ` ${(v/1e6).toFixed(2)}M`;
          if(a>=1e3)return ` ${Math.round(v).toLocaleString()}`;
          return ` ${v}`;
        }
      }
    },
    legend:{display:false}
  }
};
const chartAnim = window.innerWidth <= 768 ? false : { duration: 250 };
const chartDpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
const baseOpts=(yFmt)=>({responsive:true,maintainAspectRatio:false,animation:chartAnim,scales:baseScales(yFmt),...tooltipPlugin});
// Horizontal bar helper: value format on x-axis; y shows category labels (zone names) correctly
const baseOptsH=(xFmt)=>({responsive:true,maintainAspectRatio:false,animation:chartAnim,indexAxis:'y',scales:{x:{min:0,ticks:{color:LC,font:{size:10,family:'Inter,system-ui,sans-serif'},callback:xFmt||(v=>Number.isInteger(v)?v.toLocaleString():null)},grid:{color:GC},border:{display:false}},y:{ticks:{color:LC,font:{size:10,family:'Inter,system-ui,sans-serif'}},grid:{color:GC,drawBorder:false}}},...tooltipPlugin});
/* Chart legend preset (shared) */
const legendOpts=(pos='top')=>({...tooltipPlugin.plugins,legend:{display:true,position:pos,labels:{boxWidth:10,boxHeight:10,font:{size:11,family:'Inter,system-ui,sans-serif'},color:LC,usePointStyle:true,pointStyle:'circle',padding:14}}});
const legendOptsCompact=(pos='top')=>({...tooltipPlugin.plugins,legend:{display:true,position:pos,labels:{boxWidth:16,boxHeight:8,font:{size:10,family:'Inter,system-ui,sans-serif'},color:LC,usePointStyle:false,padding:12}}});
const legendOptsSharp=(pos='top')=>({...tooltipPlugin.plugins,legend:{display:true,position:pos,labels:{boxWidth:14,boxHeight:10,font:{size:11,family:'Inter,system-ui,sans-serif',weight:'600'},color:'#334155',usePointStyle:true,pointStyle:'rectRounded',padding:16}}});
function mkChart(id,cfg){
  try{
    if(chartReg[id])chartReg[id].destroy();
    const el=document.getElementById(id);if(!el)return;
    const governedCfg=applyChartGovernance(id,cfg);
    chartReg[id]=new Chart(el,{...governedCfg,devicePixelRatio:chartDpr});
  }catch(e){
    console.warn('Chart error ['+id+']:',e.message);
    const el=document.getElementById(id);
    if(el)el.parentElement.innerHTML= DOMPurify.sanitize('<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#94A3B8;font-size:11px">Chart unavailable</div>');
  }
}
/* ── Badge map: status string → CSS class ── */
const BADGE_CLS={
  GOOD:'kc-badge-good',WATCH:'kc-badge-watch',HIGH:'kc-badge-high',
  COMPLIANT:'kc-badge-good',MONITOR:'kc-badge-watch',LOW:'kc-badge-watch',
  CRITICAL:'kc-badge-high',KPI:'kc-badge-info',RATE:'kc-badge-info',
  NEW:'kc-badge-teal',INFO:'kc-badge-neutral',
};
const BADGE_LABEL_MAP={
  GOOD:'GOOD',COMPLIANT:'COMPLIANT',WATCH:'WATCH',MONITOR:'MONITOR',LOW:'MONITOR',
  HIGH:'CRITICAL',CRITICAL:'CRITICAL',KPI:'INFO',RATE:'INFO',NEW:'NEW',INFO:'INFO'
};
function normalizeBadgeLabel(label){
  const key=String(label||'').trim().toUpperCase();
  return BADGE_LABEL_MAP[key]||key||'';
}
function kpiTone(card={}){
  const badge=normalizeBadgeLabel(card.badgeLabel||(card.bmOk===true?'GOOD':card.bmOk===false?'WATCH':''));
  if(['GOOD','COMPLIANT'].includes(badge) || card.cls==='kc-up') return 'good';
  if(['WATCH','MONITOR'].includes(badge) || card.cls==='kc-nt') return 'watch';
  if(['CRITICAL','HIGH'].includes(badge) || card.cls==='kc-dn') return 'high';
  if(['INFO','NEW'].includes(badge)) return 'info';
  return 'neutral';
}
async function ensureGovernanceBundle(force=false){
  if(governanceBundleCache && !force) return governanceBundleCache;
  if(governanceBundlePromise && !force) return governanceBundlePromise;
  governanceBundlePromise = api('/api/compliance/governance-bundle')
    .then(d=>{
      governanceBundleCache=d||{pages:{by_page:{}},charts:{by_title:{}},kpis:{by_label:{}},evidence_ladder:{items:[]}};
      return governanceBundleCache;
    })
    .catch(()=>{
      governanceBundleCache=governanceBundleCache||{pages:{by_page:{}},charts:{by_title:{}},kpis:{by_label:{}},evidence_ladder:{items:[]}};
      return governanceBundleCache;
    })
    .finally(()=>{governanceBundlePromise=null;});
  return governanceBundlePromise;
}
function governanceChart(title=''){
  const key=String(title||'').trim();
  return governanceBundleCache?.charts?.by_title?.[key] || null;
}
function governancePage(pageKey=''){
  const key=String(pageKey||'').trim();
  return governanceBundleCache?.pages?.by_page?.[key] || null;
}
function normalizeKpiLookup(value=''){
  return String(value||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
}
function governanceKpi(label=''){
  const key=normalizeKpiLookup(label);
  return governanceBundleCache?.kpis?.by_label?.[key] || null;
}
function governanceEvidenceLadder(){
  return governanceBundleCache?.evidence_ladder?.items || [];
}
async function ensureExportGovernanceBundle(force=false){
  if(exportGovernanceBundleCache && !force) return exportGovernanceBundleCache;
  if(exportGovernanceBundlePromise && !force) return exportGovernanceBundlePromise;
  exportGovernanceBundlePromise = api('/api/compliance/page-export-governance')
    .then(d=>{
      exportGovernanceBundleCache=d||{by_page:{},items:[],summary:{}};
      return exportGovernanceBundleCache;
    })
    .catch(()=>{
      exportGovernanceBundleCache=exportGovernanceBundleCache||{by_page:{},items:[],summary:{}};
      return exportGovernanceBundleCache;
    })
    .finally(()=>{exportGovernanceBundlePromise=null;});
  return exportGovernanceBundlePromise;
}
function exportGovernancePage(page=''){
  const key=String(page||'').trim();
  return exportGovernanceBundleCache?.by_page?.[key] || null;
}
function governanceChipToneClass(base='pg-governance-chip', tone='neutral'){
  return `${base} ${base}-${tone||'neutral'}`;
}
function governanceChipHtml(chips=[], base='pg-governance-chip'){
  return (chips||[]).map(ch=>`<span class="${governanceChipToneClass(base, ch.tone||'neutral')}" title="${String(ch.detail||ch.label||'').replace(/"/g,'&quot;')}">${ch.label||''}</span>`).join('');
}
function inferBenchmarkMode(title=''){
  const t=String(title||'').trim();
  if(!t) return 'none';
  if(t==='Billed vs Collected — Monthly (MWK)') return 'line';
  const lineTitles=new Set([
    'NRW Rate — Monthly Trend','NRW Rate by Zone — Current Period (%)','NRW Rate by Zone (%)',
    'Collection Rate by Zone (%)','Volume Produced (m³) & NRW Rate — Monthly',
    'Monthly Revenue: Actual vs Budget (MWK)','Volume Produced: Actual vs Budget (m³)',
    'New Connections — Cumulative YTD vs Budget','NRW % by Zone vs 27% Target',
    'Corporate NRW % — Shewhart Control Chart (ISO 7870-2)'
  ]);
  const bandTitles=new Set([
    'Days to Quotation & Days to Connect','Supply Hours vs Power Failure Hours'
  ]);
  if(lineTitles.has(t)) return 'line';
  if(bandTitles.has(t)) return 'band';
  return 'context';
}
function benchmarkMode(title=''){
  return governanceChart(title)?.benchmark_mode || inferBenchmarkMode(title);
}
function benchmarkLabel(mode='context', title=''){
  return governanceChart(title)?.benchmark_label || (mode==='line' ? 'Target line' : mode==='band' ? 'Threshold band' : mode==='none' ? '' : 'Read note');
}

function referenceDatasetKind(label=''){
  const txt=String(label||'').toLowerCase();
  if(!txt) return '';
  if(/control|limit|ucl|lcl|warning|action|band|threshold/.test(txt)) return 'band';
  if(/target|benchmark|budget line|budget target|plan line|service standard|standard/.test(txt)) return 'line';
  return '';
}
function isReferenceDataset(dataset={}){
  const labelKind=referenceDatasetKind(dataset?.label||'');
  if(labelKind) return true;
  const isLineLike=(dataset?.type==='line') || Object.prototype.hasOwnProperty.call(dataset||{},'borderDash');
  const pointless=(dataset?.pointRadius===0 || dataset?.pointRadius===undefined);
  return !!(isLineLike && pointless && /target|benchmark|budget|limit|threshold|control|warning|action|standard/i.test(String(dataset?.label||'')));
}
function shouldKeepReferenceDataset(mode='context', dataset={}){
  const kind=referenceDatasetKind(dataset?.label||'');
  if(mode==='line') return true;
  if(mode==='band') return kind==='band';
  return false;
}
function applyChartGovernance(id,cfg){
  const el=document.getElementById(id);
  if(!el || !cfg?.data?.datasets?.length) return cfg;
  const card=el.closest('.chart-card');
  const title=card?.querySelector('.chart-title')?.textContent?.trim?.() || '';
  if(!title) return cfg;
  const mode=benchmarkMode(title);
  let removed=0;
  const nextDatasets=(cfg.data.datasets||[]).filter(ds=>{
    if(!isReferenceDataset(ds)) return true;
    const keep=shouldKeepReferenceDataset(mode, ds);
    if(!keep) removed += 1;
    return keep;
  });
  if(card){
    card.dataset.benchmarkMode=mode;
    if(removed>0) card.dataset.benchmarkSuppressed='true';
    else delete card.dataset.benchmarkSuppressed;
  }
  if(removed===0) return cfg;
  return {
    ...cfg,
    data:{
      ...(cfg.data||{}),
      datasets:nextDatasets,
    },
  };
}
function injectPageGovernanceStandards(root=document){
  const pageEl=root?.classList?.contains?.('db-page') ? root : root?.querySelector?.('.db-page.active') || document.querySelector('.db-page.active');
  if(!pageEl) return;
  const pageKey=pageKeyFromRoot(pageEl);
  const pageStd=governancePage(pageKey);
  if(!pageStd) return;
  const hdrLeft=pageEl.querySelector('.pg-hdr-left');
  const meta=hdrLeft?.querySelector('.pg-meta');
  if(!hdrLeft || !meta) return;
  let strip=hdrLeft.querySelector('.pg-governance-strip');
  if(!strip){
    strip=document.createElement('div');
    strip.className='pg-governance-strip';
    meta.insertAdjacentElement('afterend', strip);
  }
  const evidenceChip=pageKey==='compliance' ? '<span class="pg-governance-chip pg-governance-chip-danger">Evidence caveats visible</span>' : '';
  strip.innerHTML= DOMPurify.sanitize(`<span class="pg-governance-chip pg-governance-chip-amber">Benchmark rules governed</span><span class="pg-governance-chip pg-governance-chip-neutral">Legends standardized</span><span class="pg-governance-chip pg-governance-chip-neutral">Board-pack print rule active</span>${evidenceChip}`);
  strip.title=`${pageStd.benchmark_rule} | ${pageStd.legend_rule} | ${pageStd.print_rule}`;
}
async function injectPageGovernanceStatus(root=document){
  const pageEl=root?.classList?.contains?.('db-page') ? root : root?.querySelector?.('.db-page.active') || document.querySelector('.db-page.active');
  if(!pageEl) return;
  const pageKey=pageKeyFromRoot(pageEl);
  await ensureExportGovernanceBundle();
  const summary=exportGovernancePage(pageKey);
  if(!summary) return;
  const hdrLeft=pageEl.querySelector('.pg-hdr-left');
  if(!hdrLeft) return;
  const anchor=hdrLeft.querySelector('.pg-governance-strip') || hdrLeft.querySelector('.pg-meta');
  if(!anchor) return;
  let strip=hdrLeft.querySelector('.pg-quality-strip');
  if(!strip){
    strip=document.createElement('div');
    strip.className='pg-quality-strip';
    anchor.insertAdjacentElement('afterend', strip);
  }
  strip.innerHTML= DOMPurify.sanitize(governanceChipHtml(summary.chips||[], 'pg-quality-chip'));
  strip.title=[summary.data_quality_detail, summary.evidence_detail, summary.print_rule].filter(Boolean).join(' | ');
}

function reportStandardChips(reportKey=''){
  const chips=[
    '<span class="rpt-chip">Quarter columns auto-calculated</span>',
    '<span class="rpt-chip rpt-chip-neutral">Annual / YTD standardized</span>'
  ];
  const pageStd=governancePage(reportKey);
  if(pageStd){
    chips.push('<span class="rpt-chip rpt-chip-amber">Benchmark interpretation governed</span>');
    chips.push('<span class="rpt-chip rpt-chip-neutral">Legends standardized</span>');
  }else if(['production','collections','customers','connectivity','debtors','billed','breakdowns'].includes(reportKey)){
    chips.push('<span class="rpt-chip rpt-chip-amber">Benchmark interpretation governed</span>');
  }
  return `<div class="rpt-std-meta">${chips.join('')}</div>`;
}
/* ── Icon map: semantic emoji used in reference screenshots ── */
const EMOJI={
  drop:'💧',nrw:'⚠️',cash:'💰',people:'👥',bolt:'⚡',gauge:'📊',
  meter:'📋',pipe:'🔧',wrench:'🔩',clock:'🕐',chart:'📈',debt:'⏱️',
  conn:'➕',chem:'🧪',staff:'👔',revenue:'💵',
};
const KPI_DEF_HINTS={
  'operating ratio':'Operating ratio = total operating expenditure ÷ operating revenue. Lower than 1.0 indicates operating cost recovery.',
  'days sales outstanding':'Days sales outstanding = trade debtors ÷ annual billed revenue × 365.',
  'net margin':'Net margin = (operating revenue − operating expenditure) ÷ operating revenue.',
  'energy intensity':'Energy intensity = power consumed in kWh ÷ water produced in m³.',
  'meter read rate':'Meter read rate = metered accounts successfully read ÷ metered accounts scheduled for reading.',
  'nrw rate':'Non-revenue water rate = (water produced − billed consumption) ÷ water produced × 100.',
  'collection rate':'Collection rate = cash collected ÷ billed revenue × 100.',
  'repair rate':'Repair rate = repaired stuck meters ÷ total stuck meters handled × 100.',
  'days to quotation':'Average days from application receipt to quotation issue.',
  'days to connect':'Average days from application or payment milestone to service connection.',
  'query resolution':'Average days to resolve customer queries or complaints.',
  'breakdowns / 1k customers':'Breakdowns per 1,000 customers = breakdown events ÷ active customers × 1,000.',
  'power per m³':'Power per m³ = electricity consumed ÷ water produced.',
  'collection gap':'Collection gap = billed revenue − cash collected.',
  'debtor ratio':'Debtor ratio = total debtors ÷ annual billed revenue.',
  'connections completed':'Completed connections during the selected reporting period.',
  'active customers':'Accounts actively receiving service in the selected reporting period.'
};
const REPORT_META={
  production:{title:'IWA / IBNET Water Balance and Non-Revenue Water Report',note:'Monthly and quarterly water-balance indicators presented in a utility benchmarking format aligned to IWA water-loss language and IBNET reporting practice.'},
  'wt-ei':{title:'IWA Treatment and Energy Efficiency Report',note:'Operational treatment and energy indicators presented for utility efficiency review, including chemical-input and continuity context used in sector performance assessment.'},
  customers:{title:'IBNET Customer Accounts and Service Base Report',note:'Commercial customer-account indicators presented in a benchmarking style for service-base, meter, and account management oversight.'},
  connections:{title:'World Bank / IBNET New Connections Delivery Report',note:'Connection-demand and completion indicators presented for service expansion oversight, process efficiency review, and access-improvement monitoring.'},
  stuck:{title:'Utility Meter Exception and Stuck Meter Report',note:'Meter exception indicators presented for operational control, backlog reduction, and customer-billing integrity review.'},
  connectivity:{title:'World Bank Service Connectivity and Response-Time Report',note:'Customer service lead-time indicators presented against widely used utility turnaround expectations for quotation, connection, and query resolution.'},
  breakdowns:{title:'IWA Infrastructure Reliability and Breakdown Report',note:'Breakdown and reliability indicators presented to support asset-condition review, maintenance planning, and service-risk oversight.'},
  pvc_breakdowns:{title:'PVC Pipe Reliability by Size Report',note:'PVC-specific failure indicators presented by size class to support targeted renewal, maintenance prioritisation, and infrastructure risk review.'},
  pipelines:{title:'Utility Pipeline Extension and Network Growth Report',note:'Network-extension outputs presented in a capital-delivery and service-expansion format suitable for institutional reporting.'},
  billed:{title:'IBNET Billed Revenue Report',note:'Billing indicators presented in a commercial benchmarking format to support revenue analysis, tariff performance review, and board oversight.'},
  collections:{title:'IBNET Billing and Collections Performance Report',note:'Cash-conversion indicators presented against collection-efficiency expectations used in utility benchmarking and financial sustainability review.'},
  charges:{title:'Utility Service Charges and Meter Rental Report',note:'Secondary commercial income streams presented in a formal reporting format for revenue-mix and billing-quality review.'},
  expenses:{title:'World Bank Utility Operating Expenditure Report',note:'Operating expenditure indicators presented for cost-control, financing readiness, and utility efficiency review.'},
  debtors:{title:'IBNET Outstanding Debtors and Receivables Report',note:'Receivables indicators presented for debtor-ageing awareness, collection discipline, and financial sustainability oversight.'},
  'segment-revenue':{title:'Customer Segment Revenue and Cash Conversion Report',note:'Revenue, cash collection, service charge, and meter-rental streams presented by customer class and payment mode for commercial oversight.'},
  workforce:{title:'Workforce and Fleet Efficiency Report',note:'Staffing, fuel, fleet movement, and operating-efficiency indicators presented for operational productivity and cost-control review.'},
  'class-connections':{title:'Connection Pipeline by Customer Class Report',note:'Backlog, applications, completions, and carried-forward pipeline indicators presented by customer class for service-expansion management.'},
  'stuck-classes':{title:'Meter Exceptions by Customer Class Report',note:'Stuck-meter backlog and resolution indicators presented by customer class to support billing-integrity and exception-management control.'},
  'pipe-materials':{title:'Pipe Failure by Material and Size Report',note:'Pipe-failure counts presented by material and size class to support engineering diagnostics, renewal prioritisation, and network-risk review.'}
};
const CHART_BENCHMARK_NOTES={
  'NRW Rate — Monthly Trend':'Benchmark context: SRWB target 27%; IWA good-practice benchmark 20%. Dashed benchmark lines should remain visible in trend interpretation.',
  'Billing vs Collections — Monthly (MWK)':'Benchmark context: chart supports collection-efficiency review; read together with the IBNET collection-rate benchmark of 95% shown in KPI cards.',
  'NRW Rate by Zone — Current Period (%)':'Benchmark context: compare every zone against the 27% corporate NRW target and the 20% good-practice benchmark.',
  'Volume Produced (m³) & NRW Rate — Monthly':'Benchmark context: track NRW against the 27% SRWB target and 20% IWA benchmark while reading production in parallel.',
  'NRW Rate by Zone (%)':'Benchmark context: compare each zone against the 27% target and 20% international good-practice benchmark.',
  'Collection Rate by Zone (%)':'Benchmark context: benchmark line set at 95% collection efficiency in line with common IBNET-style performance review.',
  'Days to Quotation & Days to Connect':'Benchmark context: quotation turnaround should trend toward 7 days and connection completion toward 30 days or better.',
  'Supply Hours vs Power Failure Hours':'Benchmark context: continuity charts are strongest when supply hours trend upward and outage hours approach zero.',
  'Revenue Decomposition — Volume Effect Waterfall (MWK)':'Interpretation note: with tariff held constant, the waterfall isolates how much of the revenue gap is attributable to water-volume underperformance and cash conversion effects.',
  'Monthly Revenue: Actual vs Budget (MWK)':'Benchmark context: review actual water sales against the prorated annual budget and read collections as cash-conversion support rather than budget basis.',
  'Budget Performance Index — Revenue by Zone':'Benchmark context: a BPI above 1.0 means the zone is ahead of its proportional revenue budget; below 1.0 signals under-delivery.',
  'Volume Produced: Actual vs Budget (m³)':'Benchmark context: production should track or exceed prorated budget where service demand and capacity assumptions hold.',
  'New Connections — Cumulative YTD vs Budget':'Benchmark context: the cumulative line should stay close to or above the prorated target to protect future revenue growth.',
  'Corporate NRW % — Shewhart Control Chart (ISO 7870-2)':'Control note: points outside warning and action limits indicate special-cause variation requiring management attention beyond routine target monitoring.',
  'NRW % by Zone vs 27% Target':'Benchmark context: 27% is the internal management target; the most material operational priority is the largest-producing zone with persistent excess NRW.',
  'NRW % Monthly Trend by Zone':'Benchmark context: sustained movement toward or below 27% matters more than isolated monthly swings.',
  'Revenue Water vs NRW Volume — Monthly (m³)':'Interpretation note: growth in NRW volume without matching revenue-water growth indicates treatment effort that is not translating into billable output.',
  'Chemical Costs — Actual vs Budget (MWK/month)':'Benchmark context: recurring monthly overruns indicate a structural cost issue, not just a timing issue, especially late in the financial year.',
  'Power / Electricity — Actual vs Budget (MWK/month)':'Benchmark context: read this as field electricity only; under-budget results do not capture uncoded head-office or zonal electricity spend.',
  'Chemical & Power Cost per m³ by Zone (MWK)':'Benchmark context: highest-cost zones warrant joint review of treatment efficiency, pump efficiency, and NRW performance.',
  'Zone Performance Radar — 5 Dimensions (normalised 0–100)':'Interpretation note: use the radar as a synthesis view only; confirm any weak axis against the detailed tables below before actioning.',
  'Revenue Variance by Zone (MWK)':'Benchmark context: compare actual sales with proportional budget by zone and use variance/BPI details to isolate the weakest commercial segment.',
  'Revenue vs Budget by Zone (MWK)':'Benchmark context: compare actual sales with proportional budget by zone and use variance/BPI details to isolate the weakest commercial segment.',
  'Zone Performance by Dimension (score 0–100)':'Interpretation note: use the score view as a synthesis summary only; confirm any weak dimension against the zone tables before management action.'
};
function getKpiHint(label=''){
  const governed=governanceKpi(label);
  if(governed?.tooltip) return governed.tooltip;
  const key=String(label||'').trim().toLowerCase();
  return Object.entries(KPI_DEF_HINTS).find(([k])=>key.includes(k))?.[1]||'Definition note: this KPI is calculated from validated operational returns for the selected filter scope.';
}
function sanitizeRows(rowsHtml){
  const d=document.createElement('div');
  d.innerHTML=DOMPurify.sanitize(`<table><tbody>${rowsHtml}</tbody></table>`);
  return d.querySelector('tbody')?.innerHTML||'';
}
function chartBenchmarkNote(title=''){
  return governanceChart(title)?.note || CHART_BENCHMARK_NOTES[title]||'Benchmark context: descriptive operational chart for the selected scope; interpret alongside the page KPI targets and notes.';
}
function kpis(cid,cards){
  document.getElementById(cid).innerHTML= DOMPurify.sanitize(cards.map(c=>{
    /* Resolve emoji icon from ICON key or direct emoji */
    const emojiChar=c.icon?EMOJI[Object.entries(EMOJI).find(([k,v])=>ICON[k]===c.icon)?.[0]]||'📌':'';

    /* Badge */
    const badgeLabel=normalizeBadgeLabel(c.badgeLabel||(c.bmOk===true?'GOOD':c.bmOk===false?'WATCH':null));
    const badgeCls=badgeLabel?BADGE_CLS[badgeLabel]||'kc-badge-neutral':'';
    const badgeHtml=badgeLabel?`<span class="kc-badge ${badgeCls}">${badgeLabel}</span>`:'';
    const tone=kpiTone({...c,badgeLabel});

    /* Value colour: governed by tone first, then trend */
    const valColor=tone==='good'?'var(--ds-green)':tone==='high'?'var(--ds-red)':tone==='watch'?'var(--ds-amber)':tone==='info'?'var(--ds-blue)':(c.cls==='kc-up'?'var(--ds-green)':c.cls==='kc-dn'?'var(--ds-red)':c.cls==='kc-nt'?'var(--ds-amber)':'var(--ds-text-primary)');

    /* Trend arrow */
    const trendHtml=c.trend==='up'?`<span class="kc-trend" style="color:var(--ds-green)">↑</span>`:
                    c.trend==='dn'?`<span class="kc-trend" style="color:var(--ds-red)">↓</span>`:
                    c.trend==='nt'?`<span class="kc-trend" style="color:var(--ds-amber)">→</span>`:'';

    /* Benchmark strip */
    const bmHtml=c.bm?`<div class="kc-bm">
      <span class="kc-bm-txt">${c.bm}</span>
      ${c.bmPct!=null?`<div class="kc-bm-bar"><div class="kc-bm-fill" style="width:${Math.min(100,Math.max(0,c.bmPct))}%;background:${c.bmOk?'var(--ds-green)':'var(--ds-red)'}"></div></div>`:''}
    </div>`:'';

    const governedKpi=governanceKpi(c.l);
    const helpText=(c.help||getKpiHint(c.l)).replace(/"/g,'&quot;');
    const evidenceShort=governedKpi?.evidence_short||'';
    const evidenceClass=governedKpi?.evidence_class||'';
    const evidenceHtml=governedKpi?`<span class="kc-help-badge kc-help-badge-${evidenceClass}" title="${helpText}">${evidenceShort}</span>`:'';
    return `<div class="kc" data-tone="${tone}" title="${helpText}">
      <div class="kc-top">
        <span class="kc-icon">${emojiChar}</span>
        ${badgeHtml}
      </div>
      <div class="kc-mid">
        <div class="kc-val" style="color:${valColor}">${c.v}</div>
        ${trendHtml}
      </div>
      <div class="kc-lbl-wrap"><div class="kc-lbl">${c.l}</div><div class="kc-lbl-meta">${evidenceHtml}<span class="kc-help" aria-label="KPI definition" title="${helpText}">i</span></div></div>
      ${c.s?`<div class="kc-sub ${c.cls&&!['kc-up','kc-dn','kc-nt'].includes(c.cls)?c.cls:''}">${c.s}</div>`:''}
      ${bmHtml}
    </div>`;
  }).join(''));
}
function errMsg(pid,msg){
  document.getElementById(pid).innerHTML= DOMPurify.sanitize(`
    <div class="err-shell">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/><path d="M12 8v5M12 15.5v.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
      <div><strong>Unable to load data</strong></div>
      <div style="font-size:11px;opacity:.7">${msg||'Check the server is running.'}</div>
    </div>`);
}
function renderFilterChips(containerId){
  const el=document.getElementById(containerId);if(!el)return;
  const chips=[];
  filterState.zones.forEach(z=>chips.push(`<span class="chip chip-zone">${z}</span>`));
  filterState.schemes.forEach(s=>chips.push(`<span class="chip chip-scheme">${s}</span>`));
  filterState.months.forEach(m=>chips.push(`<span class="chip chip-month">${m.slice(0,3)}</span>`));
  el.innerHTML= DOMPurify.sanitize(chips.length?`<div class="filter-chips">${chips.join('')}</div>`:'');
}
const PAGE_META={
  overview:{section:'Executive Dashboard',title:'Executive Dashboard'},
  operations:{section:'Operations',title:'Operations Hub'},
  commercial:{section:'Commercial',title:'Commercial Hub'},
  production:{section:'Operations',title:'Water Production'},
  'wt-ei':{section:'Operations',title:'Treatment & Energy'},
  pipelines:{section:'Operations',title:'Network Extensions'},
  breakdowns:{section:'Operations',title:'Infrastructure Breakdowns'},
  customers:{section:'Commercial',title:'Customer Accounts'},
  connections:{section:'Commercial',title:'New Water Connections'},
  connectivity:{section:'Commercial',title:'Service Connectivity'},
  stuck:{section:'Commercial',title:'Meter Exceptions'},
  billed:{section:'Commercial',title:'Revenue Billing Overview'},
  collections:{section:'Commercial',title:'Billing & Collections'},
  charges:{section:'Commercial',title:'Service Charges & Meter Rental'},
  expenses:{section:'Commercial',title:'Operating Cost Performance'},
  debtors:{section:'Commercial',title:'Outstanding Debtors'},
  'segment-revenue':{section:'Commercial',title:'Customer Segment Revenue'},
  workforce:{section:'Operations',title:'Workforce & Fleet Efficiency'},
  'class-connections':{section:'Commercial',title:'Connection Pipeline by Class'},
  'stuck-classes':{section:'Commercial',title:'Meter Exceptions by Class'},
  'pipe-materials':{section:'Operations',title:'Pipe Failure by Material and Size'},
  budget:{section:'Planning',title:'Budget & Forecast'},
  compliance:{section:'Governance',title:'Compliance & Data Quality'},
  benchmarking:{section:'Reports',title:'Benchmarking Tool'},
  admin:{section:'Administration',title:'Administration'},
};
const NAV_PARENT_MAP={
  overview:'overview',
  operations:'operations',
  commercial:'commercial',
  reports:'reports',
  production:'operations',
  'wt-ei':'operations',
  pipelines:'operations',
  breakdowns:'operations',
  customers:'commercial',
  connections:'commercial',
  connectivity:'commercial',
  stuck:'commercial',
  billed:'commercial',
  collections:'commercial',
  charges:'commercial',
  expenses:'commercial',
  debtors:'commercial',
  'segment-revenue':'commercial',
  workforce:'operations',
  'class-connections':'commercial',
  'stuck-classes':'commercial',
  'pipe-materials':'operations',
  budget:'budget',
  compliance:'compliance',
  reports:'reporting',
  benchmarking:'reporting',
  'report-centre':'reporting',
  admin:'admin',
};
const HUB_DEFAULT_PAGE={
  operations:'production',
  commercial:'customers',
  reporting:'report-centre',
};
let currentPage='overview';
function updateBreadcrumb(page){
  const item=document.querySelector(`[data-page="${page}"]`);
  const meta=PAGE_META[page]||{};
  const sec=item?.dataset?.section||meta.section||'';
  const title=item?.dataset?.title||meta.title||page;
  const s=document.getElementById('tb-section');const t=document.getElementById('tb-title');
  if(s)s.textContent=sec;if(t)t.innerHTML= DOMPurify.sanitize(title);
}
function pageKeyFromRoot(root=document){
  const pageEl = root?.classList?.contains?.('db-page') ? root : root?.closest?.('.db-page') || root?.querySelector?.('.db-page.active') || document.querySelector('.db-page.active');
  return pageEl?.id ? String(pageEl.id).replace('page-','') : '';
}
async function injectChartCredibilityNotes(root=document){
  await ensureGovernanceBundle();
  const budgetPage=root.querySelector ? root.querySelector('#page-budget') : document.getElementById('page-budget');
  const pageKey=pageKeyFromRoot(root);
  root.querySelectorAll('.chart-card').forEach(card=>{
    const titleEl=card.querySelector('.chart-title');
    const title=titleEl?.textContent?.trim();
    if(!title || !titleEl)return;
    const governed=governanceChart(title);
    const mode=governed?.benchmark_mode || benchmarkMode(title);
    card.dataset.benchmarkMode=mode;
    card.dataset.governanceSource=governed ? 'registry' : 'fallback';
    card.dataset.pageStandard=governed?.page_key || pageKey || '';

    let head=titleEl.parentElement;
    if(!head || !head.classList.contains('chart-head')){
      head=document.createElement('div');
      head.className='chart-head';
      titleEl.parentNode.insertBefore(head,titleEl);
      head.appendChild(titleEl);
    }
    let pill=head.querySelector('.chart-bm-pill');
    if(!pill){
      pill=document.createElement('span');
      pill.className='chart-bm-pill';
      head.appendChild(pill);
    }
    pill.textContent=benchmarkLabel(mode, title);
    if(governed?.rationale){
      pill.title=governed.rationale;
    }

    let note=card.querySelector('.chart-benchmark-note');
    if(!note){
      note=document.createElement('div');
      note.className='chart-benchmark-note';
      const anchor=card.querySelector('.ch-wrap')||card.lastElementChild;
      if(anchor) anchor.insertAdjacentElement('afterend',note); else card.appendChild(note);
    }
    note.textContent=chartBenchmarkNote(title);
    if(card.dataset.benchmarkSuppressed==='true'){
      note.textContent += ' Decorative reference lines have been suppressed under the governance rule for this chart.';
    }
    if(governed?.rationale){
      note.title=governed.rationale;
    }

    const subtitle=card.querySelector('.chart-subtitle')?.textContent?.trim()||'';
    const canvas=card.querySelector('canvas');
    if(canvas){
      canvas.setAttribute('role','img');
      canvas.setAttribute('aria-label', `${title}${subtitle ? ' — ' + subtitle : ''}`);
      if(!canvas.getAttribute('tabindex')) canvas.setAttribute('tabindex','0');
    }
  });

  injectPageGovernanceStandards(root);
  (budgetPage||document).querySelectorAll?.('table').forEach(tbl=>{
    if(!tbl.querySelector('caption')){
      const cap=document.createElement('caption');
      cap.className='sr-only';
      const hdr=tbl.closest('.ex-section')?.querySelector('.ex-title')?.textContent?.trim()||'Data table';
      cap.textContent=hdr;
      tbl.insertAdjacentElement('afterbegin',cap);
    }
  });
}
function overviewRiskScore(zone={}){
  const nrw = Number(zone.nrw_pct || 0) / Math.max(IWA.nrw, 1);
  const dso = Number(zone.dso || 0) / Math.max(IWA.dso, 1);
  const opRatio = Number(zone.op_ratio || 0) / Math.max(IWA.op_ratio, 0.01);
  const collGap = Math.max(0, IWA.coll_rate - Number(zone.collection_rate || 0)) / 15;
  return nrw + dso + opRatio + collGap;
}
function overviewStateTone(value, thresholds={good:0, watch:0}, reverse=false){
  if(value == null || Number.isNaN(Number(value))) return 'neutral';
  const v = Number(value);
  if(reverse){
    if(v <= thresholds.good) return 'good';
    if(v <= thresholds.watch) return 'watch';
    return 'high';
  }
  if(v >= thresholds.good) return 'good';
  if(v >= thresholds.watch) return 'watch';
  return 'high';
}
function overviewToneLabel(tone='neutral'){
  return tone === 'good' ? 'On track' : tone === 'watch' ? 'Watch' : tone === 'high' ? 'Priority' : 'Review';
}
function renderOverviewExceptionStrip(items=[]){
  const host=document.getElementById('ov-exceptions'); if(!host) return;
  host.innerHTML = DOMPurify.sanitize(items.map(item=>`<div class="ov-ex-item" data-tone="${item.tone||'neutral'}"><div class="ov-ex-kicker">${item.kicker||'Exception'}</div><div class="ov-ex-main">${item.main||'—'}</div><div class="ov-ex-sub">${item.sub||''}</div></div>`).join(''));
}
function renderOverviewZoneRanking(zones=[]){
  const host=document.getElementById('ov-zone-rank'); if(!host) return;
  if(!zones.length){ host.innerHTML='<div class="ov-empty">No ranked zones available.</div>'; return; }
  const ranked=[...zones].sort((a,b)=>overviewRiskScore(b)-overviewRiskScore(a)).slice(0,5);
  host.innerHTML = DOMPurify.sanitize(ranked.map((z,idx)=>{
    const tone = overviewStateTone(overviewRiskScore(z), {good:2.2, watch:3.2}, true);
    return `<div class="ov-rank-row" data-tone="${tone}">
      <div class="ov-rank-pos">${idx+1}</div>
      <div class="ov-rank-main">
        <div class="ov-rank-zone">${z.zone}</div>
        <div class="ov-rank-metrics">NRW ${Number(z.nrw_pct||0).toFixed(1)}% · Collections ${Number(z.collection_rate||0).toFixed(1)}% · DSO ${Math.round(Number(z.dso||0))}d</div>
      </div>
      <div class="ov-rank-badge">${overviewToneLabel(tone)}</div>
    </div>`;
  }).join(''));
}
function renderOverviewDataSummary(summary={}){
  const host=document.getElementById('ov-data-summary'); if(!host) return;
  const items=[
    ['Records loaded', F.num(summary.record_count||0)],
    ['Months with data', F.num(summary.months_with_data||0)],
    ['Zones covered', F.num(summary.zones_covered||0)],
    ['Schemes covered', F.num(summary.schemes_covered||0)]
  ];
  host.innerHTML = DOMPurify.sanitize(`<div class="ov-data-grid">${items.map(([l,v])=>`<div class="ov-data-item"><div class="ov-data-val">${v}</div><div class="ov-data-lbl">${l}</div></div>`).join('')}</div>`);
}
function renderOverviewActions(actions=[]){
  const host=document.getElementById('ov-action-list'); if(!host) return;
  if(!actions.length){ host.innerHTML='<div class="ov-empty">No immediate prompts for the current scope.</div>'; return; }
  host.innerHTML = DOMPurify.sanitize(`<div class="ov-action-stack">${actions.map(a=>`<div class="ov-action-item"><span class="ov-action-dot"></span><div><strong>${a.title}</strong><div>${a.text}</div></div></div>`).join('')}</div>`);
}
function applyOverviewFocus(){
  const opsBtn=document.getElementById('ov-focus-operations');
  const comBtn=document.getElementById('ov-focus-commercial');
  const opsCanvas=document.getElementById('ch-ov-focus-ops');
  const comCanvas=document.getElementById('ch-ov-focus-com');
  const isOperations=overviewFocus !== 'commercial';
  if(opsBtn) opsBtn.classList.toggle('active', isOperations);
  if(comBtn) comBtn.classList.toggle('active', !isOperations);
  if(opsCanvas) opsCanvas.style.display = isOperations ? '' : 'none';
  if(comCanvas) comCanvas.style.display = isOperations ? 'none' : '';
}
function setOverviewFocus(mode='operations'){
  overviewFocus = mode === 'commercial' ? 'commercial' : 'operations';
  applyOverviewFocus();
  const focusTitle=document.getElementById('ov-focus-title');
  const focusSub=document.getElementById('ov-focus-subtitle');
  const focusNote=document.getElementById('ov-focus-note');
  const isCommercial=overviewFocus==='commercial';
  if(focusTitle) focusTitle.textContent=isCommercial?'Commercial focus — Billing vs collections':'Operational focus — Production vs NRW';
  if(focusSub) focusSub.textContent=isCommercial?'Revenue billed and cash collected over the selected period.':'Production volume and NRW rate over the selected period.';
  if(focusNote) focusNote.textContent=isCommercial?'Use this view to compare revenue raised against cash realized.':'Use this view to compare system output against physical loss pressure.';
}

function navigate(page,options={}){
  const user=getUser()||{};
  const isAdmin=String(user.role||'').toLowerCase()==='admin';
  if((page==='admin' || page==='reports' || page==='compliance') && !isAdmin){
    const label = page==='reports' ? 'Report Library' : page==='compliance' ? 'Compliance & Data Quality' : 'Administration';
    alert(`${label} is restricted to admin users.`);
    return;
  }

  const hubRedirect=HUB_DEFAULT_PAGE[page];
  if(hubRedirect && !options.allowHubPage){
    handleSidebarHubClick(page);
    return;
  }

  document.querySelectorAll('.db-page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active','current','group-current'));
  document.getElementById('page-'+page)?.classList.add('active');

  const parentGroup=groupForPage(page);
  if(parentGroup){
    collapseAllNavGroups(parentGroup);
    const groupHead=document.getElementById('grp-'+parentGroup);
    const childItem=document.querySelector(`.nav-section .nav-item[data-page="${page}"]`);
    groupHead?.classList.add('group-current');
    childItem?.classList.add('active');
  }else{
    collapseAllNavGroups();
    const navItem=document.querySelector(`.nav-item[data-page="${page}"]`);
    navItem?.classList.add('active');
  }

  currentPage=page;
  saveLastPage(page);
  updateBreadcrumb(page);
  syncReportDensityToolbar(page);
  syncRoleLandingNotes();
  // Upload Data button is only relevant on the Administration tab
  const _uploadBtn=document.getElementById('tb-upload-btn');
  if(_uploadBtn) _uploadBtn.style.display=(page==='admin')?'':'none';
  if(!pageCache[page])loadPage(page);else applyReportDensityState(page);
}

function reloadPage(page){delete pageCache[page];loadPage(page);}
function onFyChange(val){
  dbState.year=parseInt(val);
  Object.keys(pageCache).forEach(k=>delete pageCache[k]);
  updatePageMeta();
  loadPage(currentPage);
  // Reset alert drawer and narrative so they reload for the new FY
  if(typeof updateFooter==='function') updateFooter();
  if(typeof alertsLoaded!=='undefined') alertsLoaded=false;
  if(typeof narrativeLoaded!=='undefined') narrativeLoaded=false;
  const narBody=document.getElementById('ov-nar-body');
  if(narBody){
    narBody.className='ai-nar-body loading';
    narBody.innerHTML= DOMPurify.sanitize('<div class="spin-sm" style="border-top-color:#7c3aed"></div>Generating AI summary…');
    setTimeout(()=>{if(typeof loadNarrative==='function')loadNarrative();},600);
  }
  const badge=document.getElementById('alert-badge');
  const alertBtn=document.getElementById('tb-alert-btn');
  if(badge) badge.className='alert-badge';
  if(alertBtn) alertBtn.className='';
  if(typeof alertDrawerOpen!=='undefined' && alertDrawerOpen && typeof loadAlerts==='function') loadAlerts();
}
async function loadPage(page){
  try{
    await ensureGovernanceBundle();
    await ensureExportGovernanceBundle();
const map={overview:loadOverview,operations:loadOperationsHub,commercial:loadCommercialHub,admin:loadAdmin,production:loadProduction,'wt-ei':loadWtEi,customers:loadCustomersUnified,connections:loadConnections,stuck:loadStuck,connectivity:loadConnectivity,breakdowns:loadBreakdowns,pipelines:loadPipelines,billed:loadBilled,collections:loadCollections,charges:loadCharges,expenses:loadExpenses,debtors:loadDebtors,'segment-revenue':loadSegmentRevenue,workforce:loadWorkforce,'class-connections':loadClassConnections,'stuck-classes':loadStuckClasses,'pipe-materials':loadPipeMaterials,compliance:loadCompliance,budget:loadBudget,benchmarking:loadBenchmarking,'report-centre':loadReportCentre};
    if(map[page])await map[page]();
    await injectChartCredibilityNotes(document.getElementById('page-'+page)||document);
    await injectPageGovernanceStatus(document.getElementById('page-'+page)||document);
    applyReportDensityState(page);
    pageCache[page]=true;
  }catch(e){console.error(page,e);}
}



function titleCaseComplianceStatus(value, fallback='—'){
  if(!value)return fallback;
  const map={partial:'Partially Assessable',good:'Good',watch:'Needs Attention',poor:'Poor',no_data:'No Data'};
  return map[String(value).toLowerCase()]||String(value).replace(/_/g,' ').replace(/\w/g,m=>m.toUpperCase());
}

function complianceCardTone(status){
  const s=String(status||'').toLowerCase();
  if(['good','active'].includes(s))return 'kc-up';
  if(['watch','partial','partially assessable','proxy only'].includes(s))return 'kc-nt';
  if(['poor','critical'].includes(s))return 'kc-dn';
  return '';
}

function governancePillClass(mode='context'){
  return mode==='line' ? 'gov-pill gov-pill-line' : mode==='band' ? 'gov-pill gov-pill-band' : mode==='none' ? 'gov-pill gov-pill-none' : 'gov-pill gov-pill-context';
}
function renderComplianceGovernanceViews(bundle){
  const pages=bundle?.pages?.items||[];
  const charts=bundle?.charts?.items||[];
  const pageHost=document.getElementById('co-page-standards');
  if(pageHost){
    const focusPages=['overview','production','wt-ei','connectivity','collections','budget','compliance'];
    pageHost.innerHTML= DOMPurify.sanitize(pages
      .filter(item=>focusPages.includes(item.page_key))
      .map(item=>`<div class="gov-card"><div class="gov-card-title">${item.title}</div><div class="gov-card-rule">${item.benchmark_rule}</div><div class="gov-card-meta"><strong>Legend:</strong> ${item.legend_rule}<br><strong>Print:</strong> ${item.print_rule}</div></div>`)
      .join(''));
  }
  const summaryHost=document.getElementById('co-chart-governance-summary');
  if(summaryHost){
    const s=bundle?.charts?.summary||{};
    summaryHost.innerHTML= DOMPurify.sanitize(`<strong>Registry summary:</strong><div class="gov-summary-metrics"><span class="gov-summary-chip">${s.total||0} governed charts</span><span class="gov-summary-chip">${s.line||0} literal target-line charts</span><span class="gov-summary-chip">${s.band||0} threshold/control-band charts</span><span class="gov-summary-chip">${s.context||0} context-note charts</span><span class="gov-summary-chip">${s.none||0} evidence-only charts</span></div>`);
  }
  const tableHost=document.getElementById('co-chart-standards');
  if(tableHost){
    const rows=charts
      .filter(item=>['overview','production','wt-ei','connectivity','collections','budget','compliance'].includes(item.page_key))
      .sort((a,b)=>`${a.page_key}|${a.title}`.localeCompare(`${b.page_key}|${b.title}`));
    tableHost.innerHTML= DOMPurify.sanitize(`<table class="gov-table"><thead><tr><th>Page</th><th>Chart</th><th>Allowed treatment</th><th>Governance rule</th><th>Legend / print standard</th></tr></thead><tbody>${rows.map(item=>`<tr><td class="gov-title-cell">${(governancePage(item.page_key)?.title)||item.page_key}</td><td class="gov-title-cell">${item.title}<span class="gov-subcell">${item.note}</span></td><td><span class="${governancePillClass(item.benchmark_mode)}">${item.benchmark_label||'No literal line'}</span></td><td>${item.rationale}</td><td>${item.legend_style.replace(/-/g,' ')}<span class="gov-subcell">Print priority: ${item.print_priority}</span></td></tr>`).join('')}</tbody></table>`);
  }
  const kpiHost=document.getElementById('co-kpi-definitions');
  if(kpiHost){
    const kpiRows=(bundle?.kpis?.items||[])
      .slice()
      .sort((a,b)=>String(a.title||'').localeCompare(String(b.title||'')));
    kpiHost.innerHTML= DOMPurify.sanitize(`<table class="gov-table gov-kpi-table"><thead><tr><th>KPI</th><th>Formula</th><th>Evidence status</th><th>Allowed visual treatment</th><th>Support</th></tr></thead><tbody>${kpiRows.map(item=>`<tr><td class="gov-title-cell">${item.title}<span class="gov-subcell">Owner: ${item.owner}</span></td><td>${item.formula}<span class="gov-subcell">Fields: ${(item.required_fields||[]).join(', ')}</span></td><td><span class="gov-status-chip gov-status-chip-${item.evidence_class||'context'}">${item.evidence_status||'Context only'}</span><span class="gov-subcell">${item.benchmark_type||''}</span></td><td>${item.visual_treatment||item.chart_guidance||''}<span class="gov-subcell">${item.chart_guidance||''}</span></td><td><span class="gov-status-chip ${item.currently_supported?'gov-status-chip-live':'gov-status-chip-gap'}">${item.support_status||''}</span><span class="gov-subcell">${item.benchmark_value||'No comparator registered'}</span></td></tr>`).join('')}</tbody></table>`);
  }
  const ladderHost=document.getElementById('co-evidence-ladder');
  if(ladderHost){
    ladderHost.innerHTML= DOMPurify.sanitize((governanceEvidenceLadder()||[]).map((item,idx)=>`<div class="gov-step-card"><div class="gov-step-index">${idx+1}</div><div class="gov-step-body"><div class="gov-step-title">${item.title}</div><div class="gov-step-desc">${item.description}</div><div class="gov-step-meta"><strong>Treatment:</strong> ${item.allowed_visual_treatment}<br><strong>Governance position:</strong> ${item.governance_position}</div></div></div>`).join(''));
  }
  const helpHost=document.getElementById('co-kpi-help-standard');
  if(helpHost){
    const ks=bundle?.kpis?.summary||{};
    helpHost.innerHTML= DOMPurify.sanitize(`<strong>KPI help standard:</strong> Executive KPI cards now read governed definitions from the compliance registry where a matching indicator exists. This means the help cue on each card can distinguish target-line KPIs from context-only or proxy indicators without adding visual clutter. Coverage: ${ks.approved||0} target-line KPIs, ${ks.context||0} context-led KPIs, ${ks.proxy||0} proxy KPIs, and ${ks.missing||0} governed data gaps.`);
  }
}

async function loadCompliance(){
  const host=document.getElementById('co-kpis');
  if(host)host.innerHTML= DOMPurify.sanitize('<div class="kc"><div class="kc-lbl">Loading…</div><div class="kc-val">—</div></div>');
  try{
    const [overview, water, quality, governance, governanceBundle]=await Promise.all([
      api('/api/compliance/overview'),
      api('/api/compliance/water-quality'),
      api('/api/compliance/data-quality-status'),
      api('/api/compliance/kpi-governance'),
      ensureGovernanceBundle()
    ]);

    const cp=overview.compliance_position||{};
    const op=overview.operational_proxies||{};
    const cov=overview.coverage||{};
    const gs=governance.summary||{};
    const qstatus=quality.status||'no_data';

    const qualityLine=`${(quality.records||0).toLocaleString()} records assessed`;
    const evidenceLine=(water.available_now||[]).length?`${(water.available_now||[]).length} proxy indicators live`:'Proxy indicators pending';
    const kpiLine=`${gs.supported_now||0} supported now · ${gs.requires_new_data||0} require new data`;

    kpis('co-kpis',[
      {l:'Compliance Position',v:titleCaseComplianceStatus(cp.status,'—'),s:cp.message||'Compliance position unavailable.',cls:complianceCardTone(cp.status),badgeLabel:cp.status==='partial'?'WATCH':cp.status==='good'?'GOOD':'INFO',bm:'Current status: partially assessable'},
      {l:'Evidence Coverage',v:'Operational Proxy Data Live',s:'Treatment and service-condition indicators are present; formal lab-result datasets are not yet onboarded.',cls:'kc-nt',badgeLabel:'INFO',bm:evidenceLine},
      {l:'Data Quality Status',v:titleCaseComplianceStatus(qstatus,'—'),s:qualityLine,cls:complianceCardTone(qstatus),badgeLabel:qstatus==='good'?'GOOD':qstatus==='watch'?'WATCH':'INFO',bm:`Coverage: ${(cov.records||0).toLocaleString()} records · ${(cov.zones||0).toLocaleString()} zones`},
      {l:'Governed KPIs',v:gs.supported_now?`${gs.supported_now}`:'—',s:'Definitions and benchmark interpretation rules are applied to the current compliance summary.',cls:'kc-up',badgeLabel:'GOOD',bm:kpiLine}
    ]);

    const missing=(cp.missing_regulated_datasets||water.not_yet_available||[]);
    const missingText=missing.length?missing.join(', '):'No missing regulated datasets registered.';
    const currentEl=document.getElementById('co-stat-current');
    if(currentEl)currentEl.innerHTML= DOMPurify.sanitize(`<strong>Current position:</strong> Formal statutory compliance reporting remains incomplete because the current upload schema does not contain laboratory compliance result fields required for full regulatory assessment.`);
    const evidenceEl=document.getElementById('co-stat-evidence');
    if(evidenceEl)evidenceEl.innerHTML= DOMPurify.sanitize(`<strong>Available evidence:</strong> Operational proxy indicators are available from the current dataset, including chlorine usage, NRW, supply hours, power failure context, and treatment-cost proxies.`);
    const missingEl=document.getElementById('co-stat-missing');
    if(missingEl)missingEl.innerHTML= DOMPurify.sanitize(`<strong>Missing regulated datasets:</strong> ${missingText}.`);

    const proxyItems=[
      `Supply continuity context: average supply hours ${op.avg_supply_hours!=null?Number(op.avg_supply_hours).toFixed(2):'—'}; average power-failure hours ${op.avg_power_failure_hours!=null?Number(op.avg_power_failure_hours).toFixed(2):'—'}.`,
      `Treatment proxy context: chlorine-dose proxy ${op.avg_chlorine_dose_proxy_kg_per_1000m3!=null?Number(op.avg_chlorine_dose_proxy_kg_per_1000m3).toFixed(3):'—'} kg per 1,000 m³ where production data is present.`,
      `Operational efficiency context: average NRW ${op.avg_nrw_pct!=null?Number(op.avg_nrw_pct).toFixed(2):'—'}%; contextual for monitoring, not statutory sign-off.`
    ];
    const proxyList=document.getElementById('co-proxy-list');
    if(proxyList)proxyList.innerHTML= DOMPurify.sanitize(proxyItems.map(item=>`<li>${item}</li>`).join(''));

    const govNote=document.getElementById('co-gov-note');
    if(govNote)govNote.textContent=(water.governance_note||'Target lines should only appear where they represent a legitimate benchmark rule. Where a literal line would mislead interpretation, the system should use a threshold note or contextual narrative instead.');

    const qSummary=quality.summary||{};
    const dq=document.getElementById('co-data-quality');
    if(dq)dq.innerHTML= DOMPurify.sanitize(`<strong>Data quality note:</strong> Latest assessed compliance-supporting dataset contains ${(quality.records||0).toLocaleString()} records. Completeness scan: ${qSummary.good||0} fields good, ${qSummary.watch||0} watch, ${qSummary.poor||0} poor.`);

    renderComplianceGovernanceViews(governanceBundle);

    const action=document.getElementById('co-action');
    if(action)action.innerHTML= DOMPurify.sanitize('<strong>Management action:</strong> Prioritize onboarding of regulated laboratory result fields into the governed upload schema so this module can move from operational proxy monitoring to full statutory compliance reporting.');
  }catch(e){
    console.error('compliance',e);
    errMsg('co-kpis',e.message||'Unable to load compliance data.');
  }
}
async function loadOverview(){
  const host=document.getElementById('ov-essentials');
  if(host) host.innerHTML='<div class="kc"><div class="kc-lbl">Loading…</div><div class="kc-val">—</div></div>';
  try{
    const d=await apiPanel('executive');
    const f=d.financial||{}, n=d.nrw||{}, s=d.service||{}, p=d.portfolio||{}, z=d.zones||[], t=d.trends||{};
    const lb=(t.labels||[]).map(m=>MONTHS_SHORT[m]||m);
    const hasData=lb.length>0;

    footerState.collRate = f.collection_rate ?? null;
    footerState.records  = d.record_count ?? null;
    footerState.dataOk   = hasData;
    updateFooter();

    const sc_nrw=n.nrw_pct||0, sc_cr=(f.collection_rate||0), sc_or=(f.op_ratio||0), sc_dso=(f.dso||0), sc_ei=(s.energy_intensity||0);
    const tileCls=(value,{good,watch,reverse=false}={})=>{
      if(value==null||value===0&&value!==0)return 'iwa-na';
      if(reverse){ if(value<=good) return 'iwa-good'; if(watch!=null&&value<=watch) return 'iwa-warn'; return 'iwa-bad'; }
      if(value>=good) return 'iwa-good'; if(watch!=null&&value>=watch) return 'iwa-warn'; return 'iwa-bad';
    };
    document.getElementById('ov-scorecard').innerHTML= DOMPurify.sanitize(`
      <div class="iwa-tile ${tileCls(sc_nrw,{good:IWA.nrw,watch:IWA.nrw_warn,reverse:true})}">
        <div class="iwa-tile-icon">💧</div>
        <div class="iwa-tile-lbl">NRW Rate</div>
        <div class="iwa-tile-val">${sc_nrw.toFixed(1)}%</div>
        <div class="iwa-tile-bm">SRWB &lt;${IWA.nrw}% · IWA &lt;${IWA.nrw_iwa}%</div>
      </div>
      <div class="iwa-tile ${tileCls(sc_cr,{good:IWA.coll_rate,watch:80})}">
        <div class="iwa-tile-icon">💰</div>
        <div class="iwa-tile-lbl">Collection Rate</div>
        <div class="iwa-tile-val">${sc_cr>0?sc_cr.toFixed(1)+'%':'—'}</div>
        <div class="iwa-tile-bm">IBNET &gt;${IWA.coll_rate}%</div>
      </div>
      <div class="iwa-tile ${tileCls(sc_or,{good:IWA.op_ratio,watch:1,reverse:true})}">
        <div class="iwa-tile-icon">📊</div>
        <div class="iwa-tile-lbl">Operating Ratio</div>
        <div class="iwa-tile-val">${sc_or?sc_or.toFixed(2):'—'}</div>
        <div class="iwa-tile-bm">World Bank &lt;${IWA.op_ratio}</div>
      </div>
      <div class="iwa-tile ${tileCls(sc_dso,{good:IWA.dso,watch:90,reverse:true})}">
        <div class="iwa-tile-icon">🕐</div>
        <div class="iwa-tile-lbl">Days Sales Outst.</div>
        <div class="iwa-tile-val">${sc_dso?Math.round(sc_dso):'—'}</div>
        <div class="iwa-tile-bm">IBNET &lt;${IWA.dso} days</div>
      </div>
      <div class="iwa-tile ${tileCls(sc_ei,{good:IWA.energy,watch:.7,reverse:true})}">
        <div class="iwa-tile-icon">⚡</div>
        <div class="iwa-tile-lbl">Energy Intensity</div>
        <div class="iwa-tile-val">${sc_ei?sc_ei.toFixed(2):'—'}</div>
        <div class="iwa-tile-bm">IWA &lt;${IWA.energy} kWh/m³</div>
      </div>`);

    kpis('ov-essentials',[
      {l:'Production (m³)', v:F.m3(n.vol_produced||0), s:'Selected-scope production volume', icon:ICON.drop, badgeLabel:'INFO'},
      {l:'NRW Rate', v:n.nrw_pct!=null?`${Number(n.nrw_pct).toFixed(1)}%`:'—', s:(n.nrw_pct||0)<=IWA.nrw?'Within corporate threshold':'Above corporate threshold', cls:(n.nrw_pct||0)<=IWA.nrw?'kc-up':(n.nrw_pct||0)<=IWA.nrw_warn?'kc-nt':'kc-dn', icon:ICON.nrw, badgeLabel:(n.nrw_pct||0)<=IWA.nrw?'GOOD':(n.nrw_pct||0)<=IWA.nrw_warn?'WATCH':'HIGH', bm:`SRWB <${IWA.nrw}% · IWA <${IWA.nrw_iwa}%`, bmPct:bmPct(n.nrw_pct,IWA.nrw,false), bmOk:n.nrw_pct!=null&&(n.nrw_pct<=IWA.nrw)},
      {l:'Collection Rate', v:f.collection_rate!=null?`${Number(f.collection_rate).toFixed(1)}%`:'—', s:(f.collection_rate||0)>=IWA.coll_rate?'Collections are at benchmark':'Collections are below benchmark', cls:(f.collection_rate||0)>=IWA.coll_rate?'kc-up':(f.collection_rate||0)>=80?'kc-nt':'kc-dn', icon:ICON.cash, badgeLabel:(f.collection_rate||0)>=IWA.coll_rate?'GOOD':(f.collection_rate||0)>=80?'WATCH':'HIGH', bm:`IBNET >${IWA.coll_rate}%`, bmPct:bmPct(f.collection_rate,IWA.coll_rate,true), bmOk:f.collection_rate!=null&&(f.collection_rate>=IWA.coll_rate)},
      {l:'Active Customers', v:F.num(p.active_customers||0), s:'Latest active customer base in scope', icon:ICON.people, badgeLabel:'INFO'},
      {l:'Supply Hours / Day', v:p.supply_hours_avg!=null?Number(p.supply_hours_avg).toFixed(1):'—', s:(p.supply_hours_avg||0)>=20?'Continuity is relatively strong':'Continuity needs closer monitoring', cls:(p.supply_hours_avg||0)>=20?'kc-up':(p.supply_hours_avg||0)>=16?'kc-nt':'kc-dn', icon:ICON.clock, badgeLabel:(p.supply_hours_avg||0)>=20?'GOOD':(p.supply_hours_avg||0)>=16?'WATCH':'HIGH'},
      {l:'Breakdowns', v:F.num(p.total_breakdowns||0), s:(p.total_breakdowns||0)<=10?'Lower current failure load':'Inspect network reliability hot spots', cls:(p.total_breakdowns||0)<=10?'kc-up':(p.total_breakdowns||0)<=25?'kc-nt':'kc-dn', icon:ICON.wrench, badgeLabel:(p.total_breakdowns||0)<=10?'GOOD':(p.total_breakdowns||0)<=25?'WATCH':'HIGH'},
    ]);

    const highestNrw=[...z].sort((a,b)=>(b.nrw_pct||0)-(a.nrw_pct||0))[0];
    const lowestCollections=[...z].sort((a,b)=>(a.collection_rate||0)-(b.collection_rate||0))[0];
    const highestDso=[...z].sort((a,b)=>(b.dso||0)-(a.dso||0))[0];
    const highestOp=[...z].sort((a,b)=>(b.op_ratio||0)-(a.op_ratio||0))[0];
    renderOverviewExceptionStrip([
      {kicker:'Top NRW risk', main:highestNrw?`${highestNrw.zone} · ${Number(highestNrw.nrw_pct||0).toFixed(1)}%`:'No zone data', sub:'Highest current NRW level in scope.', tone:highestNrw&&(highestNrw.nrw_pct||0)>IWA.nrw_warn?'high':highestNrw&&(highestNrw.nrw_pct||0)>IWA.nrw?'watch':'good'},
      {kicker:'Collections pressure', main:lowestCollections?`${lowestCollections.zone} · ${Number(lowestCollections.collection_rate||0).toFixed(1)}%`:'No zone data', sub:'Lowest collection rate among visible zones.', tone:lowestCollections&&(lowestCollections.collection_rate||0)<80?'high':lowestCollections&&(lowestCollections.collection_rate||0)<IWA.coll_rate?'watch':'good'},
      {kicker:'Debtor pressure', main:highestDso?`${highestDso.zone} · ${Math.round(Number(highestDso.dso||0))} days`:'No zone data', sub:'Largest debtor cycle in the current cut.', tone:highestDso&&(highestDso.dso||0)>90?'high':highestDso&&(highestDso.dso||0)>IWA.dso?'watch':'good'},
      {kicker:'Cost efficiency', main:highestOp?`${highestOp.zone} · ${Number(highestOp.op_ratio||0).toFixed(2)}`:'No zone data', sub:'Highest operating ratio in the current cut.', tone:highestOp&&(highestOp.op_ratio||0)>1?'high':highestOp&&(highestOp.op_ratio||0)>IWA.op_ratio?'watch':'good'},
    ]);

    renderOverviewZoneRanking(z);
    renderOverviewDataSummary({
      record_count:d.record_count||0,
      months_with_data:p.months_with_data||lb.length,
      zones_covered:p.zones_covered||z.length,
      schemes_covered:p.schemes_covered||0,
    });

    const actions=[];
    if((n.nrw_pct||0) > IWA.nrw) actions.push({title:'Tighten NRW follow-up', text:`NRW is ${Number(n.nrw_pct||0).toFixed(1)}%, above the SRWB threshold of ${IWA.nrw}%. Review high-loss zones first.`});
    if((f.collection_rate||0) < IWA.coll_rate) actions.push({title:'Escalate collections focus', text:`Collection rate is ${Number(f.collection_rate||0).toFixed(1)}%, below the ${IWA.coll_rate}% benchmark.`});
    if((f.dso||0) > IWA.dso) actions.push({title:'Review debtor ageing', text:`Days sales outstanding are ${Math.round(Number(f.dso||0))} days, above the ${IWA.dso}-day reference.`});
    if((s.meter_read_rate||0) < IWA.meter_read) actions.push({title:'Inspect meter-read discipline', text:`Meter read rate is ${Number(s.meter_read_rate||0).toFixed(1)}%, below the ${IWA.meter_read}% expectation.`});
    if(!(actions.length)) actions.push({title:'Maintain current cadence', text:'The main executive indicators are within or near their target bands for the current scope.'});
    renderOverviewActions(actions.slice(0,4));

    if(hasData){
      mkChart('ch-ov-focus-ops',{
        type:'line',
        data:{labels:lb,datasets:[
          {label:'Production (Mm³)',data:(t.production||[]).map(v=>+(v/1e6).toFixed(2)),yAxisID:'yVol',borderColor:'#1A8FD1',backgroundColor:'rgba(26,143,209,.08)',tension:.3,pointRadius:3,fill:true,borderWidth:2},
          {label:'NRW %',data:t.nrw_pct||[],yAxisID:'yPct',borderColor:'#dc2626',backgroundColor:'rgba(220,38,38,.05)',tension:.3,pointRadius:3,fill:false,borderWidth:2},
        ]},
        options:{responsive:true,maintainAspectRatio:false,animation:chartAnim,plugins:legendOpts('top'),scales:{
          x:{ticks:{color:LC,font:{size:10,family:'Inter,system-ui,sans-serif'},maxRotation:0,autoSkip:false},grid:{color:GC,drawBorder:false}},
          yVol:{position:'left',ticks:{color:LC,font:{size:10,family:'Inter,system-ui,sans-serif'},callback:v=>v+'M'},grid:{color:GC},border:{display:false}},
          yPct:{position:'right',ticks:{color:LC,font:{size:10,family:'Inter,system-ui,sans-serif'},callback:v=>v+'%'},grid:{drawOnChartArea:false},border:{display:false},min:0}
        }}
      });
      mkChart('ch-ov-focus-com',{
        type:'line',
        data:{labels:lb,datasets:[
          {label:'Billed',data:(t.billed||[]).map(v=>+(v/1e9).toFixed(2)),borderColor:'#1A8FD1',backgroundColor:'rgba(26,143,209,.08)',tension:.3,pointRadius:3,fill:true,borderWidth:2},
          {label:'Collected',data:(t.collected||[]).map(v=>+(v/1e9).toFixed(2)),borderColor:'#16a34a',backgroundColor:'rgba(22,163,74,.08)',tension:.3,pointRadius:3,fill:true,borderWidth:2},
        ]},
        options:{...baseOpts(v=>v+'B'),plugins:legendOpts('top')}
      });
    }
    setOverviewFocus(overviewFocus);

    if(z.length){
      let th='<tr><th style="text-align:left">Zone</th><th>NRW %</th><th>Coll. Rate</th><th>DSO (Days)</th><th>Op. Ratio</th><th>Rev / Conn</th><th>NRW Trend</th></tr>';
      let tb=z.map(zz=>{
        const nrwCls=(zz.nrw_pct||0)>IWA.nrw_warn?'zs-bad':(zz.nrw_pct||0)>IWA.nrw?'zs-warn':'zs-good';
        const crCls=(zz.collection_rate||0)>=100?'zs-good':(zz.collection_rate||0)>=90?'zs-warn':'zs-bad';
        const dsoCls=(zz.dso||0)<60?'zs-good':(zz.dso||0)<90?'zs-warn':'zs-bad';
        const orCls=(zz.op_ratio||0)<0.8?'zs-good':(zz.op_ratio||0)<1?'zs-warn':'zs-bad';
        const sid='spark-'+zz.zone.toLowerCase().replace(/\s/g,'');
        return `<tr>
          <td><strong>${zz.zone}</strong><span class="zs-sch">${zz.schemes||0} sch.</span></td>
          <td><span class="zs-badge ${nrwCls}">${(zz.nrw_pct||0).toFixed(1)}%</span></td>
          <td><span class="zs-badge ${crCls}">${(zz.collection_rate||0).toFixed(1)}%</span></td>
          <td><span class="zs-badge ${dsoCls}">${Math.round(zz.dso||0)}</span></td>
          <td><span class="zs-badge ${orCls}">${(zz.op_ratio||0).toFixed(2)}</span></td>
          <td class="zs-mono">${F.num(zz.rev_per_conn||0)}</td>
          <td><canvas class="spark" id="${sid}" width="80" height="24"></canvas></td>
        </tr>`;
      }).join('');
      document.getElementById('ov-zone-tbl').innerHTML= DOMPurify.sanitize(`<div class="zs-wrap"><table class="zs"><thead>${th}</thead><tbody>${tb}</tbody></table></div>`);
      z.forEach(zz=>{
        const sid='spark-'+zz.zone.toLowerCase().replace(/\s/g,'');
        const el=document.getElementById(sid);if(!el||!(zz.nrw_trend||[]).length)return;
        const ctx=el.getContext('2d');
        const pts=zz.nrw_trend,w=80,h=24;
        const mn=Math.min(...pts)-2,mx=Math.max(...pts)+2,rng=mx-mn||1;
        ctx.strokeStyle=pts[pts.length-1]>30?'#dc2626':pts[pts.length-1]>20?'#d97706':'#16a34a';
        ctx.lineWidth=1.5;ctx.lineJoin='round';ctx.beginPath();
        pts.forEach((v,i)=>{const x=i/(pts.length-1)*w,y=h-(v-mn)/rng*h;i===0?ctx.moveTo(x,y):ctx.lineTo(x,y)});
        ctx.stroke();
      });
    }
  }catch(e){errMsg('ov-essentials','Executive dashboard failed — '+e.message);}
}

async function loadProduction(){
  kpis('pr-kpis',[{l:'Loading…',v:'—'}]);
  try{
    const d=await apiPanel('production'),k=d.kpi;
    const nOk=k.nrw_pct<=IWA.nrw, nWarn=k.nrw_pct<=IWA.nrw_warn;
    kpis('pr-kpis',[
      {l:'Vol. Produced',v:F.m3(k.vol_produced),s:'Gross output — all sources',icon:ICON.drop},
      {l:'Revenue Water',v:F.m3(k.revenue_water),s:'Billed consumption (m³)',icon:ICON.drop},
      {l:'NRW Volume',v:F.m3(k.nrw),s:'Physical + commercial losses',icon:ICON.nrw,cls:'kc-dn'},
      {l:'NRW Rate',v:F.pct(k.nrw_pct),
       s:nOk?'Within SRWB 27% target':nWarn?'Above target — action needed':'Critical — exceeds 35%',
       cls:nOk?'kc-up':nWarn?'kc-nt':'kc-dn',icon:ICON.gauge,
       badgeLabel:nOk?'GOOD':nWarn?'WATCH':'HIGH',
       bm:'SRWB <'+IWA.nrw+'%  ·  IWA <'+IWA.nrw_iwa+'%  ·  Action >'+IWA.nrw_warn+'%',
       bmPct:bmPct(k.nrw_pct,IWA.nrw,false),bmOk:nOk},
    ]);
    document.getElementById('pr-kpis').className='kpi-row kpi-g4';
    const dm=d.monthly.filter(m=>m.has_data),lb=dm.map(m=>MONTHS_SHORT[m.month]||m.month);
    document.getElementById('pr-leg').innerHTML= DOMPurify.sanitize('<span class="legend-item"><span class="legend-sq" style="background:#1A8FD1"></span>Vol. Produced (M m³)</span><span class="legend-item"><span class="legend-sq" style="background:#d97706"></span>NRW %</span><span class="legend-item"><span class="legend-sq" style="background:#d97706;height:2px;border-top:2px dashed #d97706"></span>SRWB Target (27%)</span><span class="legend-item"><span class="legend-sq" style="background:#1A8FD1;height:2px;border-top:2px dotted #1A8FD1"></span>IWA Benchmark (20%)</span>');
    mkChart('ch-pr-main',{type:'bar',data:{labels:lb,datasets:[
      {label:'Vol. Produced',data:dm.map(m=>+(m.vol_produced/1e6).toFixed(2)),backgroundColor:'rgba(26,143,209,.65)',borderRadius:3,yAxisID:'y'},
      {type:'line',label:'NRW %',data:dm.map(m=>m.pct_nrw||0),borderColor:'#d97706',tension:.3,pointRadius:3,yAxisID:'y1',borderWidth:2},
      {type:'line',label:'SRWB Target (27%)',data:dm.map(()=>IWA.nrw),borderColor:'#d97706',borderDash:[6,4],borderWidth:2,pointRadius:0,yAxisID:'y1',fill:false},
      {type:'line',label:'IWA Benchmark (20%)',data:dm.map(()=>IWA.nrw_iwa),borderColor:'#1A8FD1',borderDash:[3,3],borderWidth:1.5,pointRadius:0,yAxisID:'y1',fill:false},
    ]},options:{responsive:true,maintainAspectRatio:false,animation:{duration:400},
      scales:{x:{ticks:{color:LC,font:{size:10},maxRotation:0},grid:{color:GC,drawBorder:false}},
        y:{ticks:{color:LC,font:{size:10},callback:v=>v+'M'},grid:{color:GC},border:{display:false}},
        y1:{position:'right',ticks:{color:'#d97706',font:{size:10},callback:v=>v+'%'},grid:{display:false},border:{display:false}}},
      ...tooltipPlugin,plugins:{...legendOpts()}}});
    const bz=d.by_zone;
    mkChart('ch-pr-zone',{type:'bar',data:{labels:bz.map(z=>z.zone),datasets:[
      {label:'NRW %',data:bz.map(z=>z.nrw_pct),backgroundColor:bz.map(z=>z.nrw_pct>IWA.nrw_warn?'rgba(220,38,38,.7)':z.nrw_pct>IWA.nrw?'rgba(217,119,6,.7)':'rgba(22,163,74,.7)'),borderRadius:4},
      {type:'line',label:'SRWB Target (27%)',data:bz.map(()=>IWA.nrw),borderColor:'#d97706',borderDash:[5,3],borderWidth:2,pointRadius:0},
      {type:'line',label:'IWA Benchmark (20%)',data:bz.map(()=>IWA.nrw_iwa),borderColor:'#1A8FD1',borderDash:[3,3],borderWidth:1.5,pointRadius:0},
    ]},options:{...baseOpts(v=>v+'%'),plugins:{...legendOpts()}}});
    mkChart('ch-pr-vol',{type:'bar',data:{labels:bz.map(z=>z.zone),datasets:[{label:'Vol. Produced (M m³)',data:bz.map(z=>+(z.vol_produced/1e6).toFixed(2)),backgroundColor:bz.map(z=>z.color||'#64748b'),borderRadius:4}]},options:{...baseOptsH(v=>v+'M'),plugins:{...legendOpts()}}});
    renderTable('tbl-production','PRODUCTION & NON-REVENUE WATER REPORT',ROWS.production,d.monthly,'production');
mountExportBar('production');
  }catch(e){errMsg('pr-kpis','Production failed');}
}

async function loadWtEi(){
  kpis('wt-kpis',[{l:'Loading...',v:'-'}]);
  try{
    const d=await apiPanel('wt-ei'),k=d.kpi;
    const eiValue=k.power_kwh_per_m3||k.power_per_m3||0;
    const eiOk=eiValue>0 ? eiValue<IWA.energy : null;
    kpis('wt-kpis',[
      {l:'Chemical Cost',v:F.mwk(k.chem_cost),s:'Total treatment chemicals',icon:ICON.chem},
      {l:'Chemical Cost / m3',v:'MWK '+F.dec(k.chem_per_m3),s:'Unit chemical cost',icon:ICON.chem},
      {l:'Power Consumed',v:F.num(k.power_kwh)+' kWh',s:'Total electricity consumed',icon:ICON.bolt},
      {l:'Energy Intensity',v:F.dec(eiValue)+' kWh/m3',s:eiOk===true?'Within target':'Above target',cls:eiOk===true?'kc-up':eiOk===false?'kc-nt':'',icon:ICON.gauge,badgeLabel:eiOk===true?'GOOD':eiOk===false?'WATCH':null,bm:'IWA target <'+IWA.energy+' kWh/m3',bmPct:eiValue?bmPct(eiValue,IWA.energy,false):null,bmOk:eiOk},
      {l:'Chlorine Intensity',v:F.dec(k.chlorine_kg_per_m3)+' kg/m3',s:'Dose per cubic metre produced',icon:ICON.chem},
      {l:'Alum Intensity',v:F.dec(k.alum_kg_per_m3)+' kg/m3',s:'Coagulant dose per cubic metre',icon:ICON.chem},
      {l:'KMnO4 Intensity',v:F.dec(k.kmno4_per_m3)+' kg/m3',s:'Permanganate dose per cubic metre',icon:ICON.chem},
      {l:'Power Cost / m3',v:'MWK '+F.dec(k.power_per_m3||k.power_cost_per_m3),s:'Unit electricity cost',icon:ICON.bolt},
      {l:'Supply Hours / Day',v:F.dec(k.supply_hours_avg)+' h',s:'Average daily supply across schemes',icon:ICON.clock},
      {l:'Power Failure Hours',v:F.num(k.power_fail_hours)+' h',s:'Outage impact YTD',icon:ICON.clock,cls:k.power_fail_hours>100?'kc-dn':''},
    ]);
    document.getElementById('wt-kpis').className='kpi-row kpi-g4';
    const dm=d.monthly.filter(m=>m.has_data),lb=dm.map(m=>MONTHS_SHORT[m.month]||m.month);
    mkChart('ch-wt-chem',{type:'bar',data:{labels:lb,datasets:[{label:'Chemical Cost (MWK M)',data:dm.map(m=>+(m.chem_cost/1e6).toFixed(2)),backgroundColor:'rgba(124,58,237,.65)',borderRadius:3}]},options:{...baseOpts(v=>v+'M'),plugins:{...legendOpts()}}});
    mkChart('ch-wt-power',{type:'bar',data:{labels:lb,datasets:[
      {label:'Power (K kWh)',data:dm.map(m=>+(m.power_kwh/1000).toFixed(1)),backgroundColor:'rgba(217,119,6,.65)',borderRadius:3,yAxisID:'y'},
      {type:'line',label:'kWh / m3',data:dm.map(m=>+(m.power_kwh_per_m3||0).toFixed(3)),borderColor:'#0f766e',tension:.3,pointRadius:3,borderWidth:2,yAxisID:'y1'}
    ]},options:{responsive:true,maintainAspectRatio:false,animation:chartAnim,scales:{x:{ticks:{color:LC,font:{size:10},maxRotation:0},grid:{color:GC,drawBorder:false}},y:{ticks:{color:LC,font:{size:10},callback:v=>v+'K'},grid:{color:GC},border:{display:false}},y1:{position:'right',ticks:{color:'#0f766e',font:{size:10}},grid:{display:false},border:{display:false}}},...tooltipPlugin,plugins:{...legendOpts()}}});
    const chemAll=[{l:'Chlorine',v:k.chlorine_kg,c:'#0077b6'},{l:'Alum Sulphate',v:k.alum_kg,c:'#0d9488'},{l:'Soda Ash',v:k.soda_ash_kg,c:'#16a34a'},{l:'Algae Floc (L)',v:k.algae_floc_litres,c:'#d97706'},{l:'Sud Floc (L)',v:k.sud_floc_litres,c:'#7c3aed'},{l:'KMnO4',v:k.kmno4_kg,c:'#dc2626'}].filter(x=>x.v>0);
    mkChart('ch-wt-split',{type:'doughnut',data:{labels:chemAll.map(x=>x.l),datasets:[{data:chemAll.map(x=>x.v),backgroundColor:chemAll.map(x=>x.c),borderWidth:2}]},options:{responsive:true,maintainAspectRatio:false,cutout:'55%',...tooltipPlugin,plugins:{...tooltipPlugin.plugins,legend:{display:true,position:'right',labels:{font:{size:11},color:LC,padding:10}}}}});
    mkChart('ch-wt-hours',{type:'bar',data:{labels:lb,datasets:[{label:'Supply Hrs/Day',data:dm.map(m=>m.supply_hours||0),backgroundColor:'rgba(22,163,74,.6)',borderRadius:3,stack:'s'},{label:'Failure Hours',data:dm.map(m=>m.power_fail_hours||0),backgroundColor:'rgba(220,38,38,.6)',borderRadius:3,stack:'s'}]},options:{...baseOpts(v=>v+' h'),plugins:{...legendOpts()}}});
    renderTable('tbl-wt-ei','WATER TREATMENT & ENERGY REPORT',ROWS.wt_ei,d.monthly,'wt-ei');
    mountExportBar('wt-ei');
  }catch(e){errMsg('wt-kpis','WT & EI failed');}
}

async function loadCustomers(){
  kpis('cu-kpis',[{l:'Loading…',v:'—'}]);
  try{
    const d=await apiPanel('customers'),k=d.kpi;
    const totalCustomers=k.total_metered||0;
    const activeCustomers=k.active_customers||0;
    const disconnectedCustomers=k.total_disconnected||0;
    const ppPct=activeCustomers?+(k.active_postpaid/activeCustomers*100).toFixed(1):0;
    const prePct=activeCustomers?+(k.active_prepaid/activeCustomers*100).toFixed(1):0;
    const disconnectedPct=totalCustomers?+(disconnectedCustomers/totalCustomers*100).toFixed(1):0;
    const page=document.getElementById('page-customers');
    if(page){
      const sub=page.querySelector('.pg-sub');
      if(sub) sub.textContent='Total customers, disconnected accounts, and active customer mix by zone';
      const exHdrs=page.querySelectorAll('.ex-hdr .ex-sub');
      if(exHdrs[0]) exHdrs[0].textContent='Customer totals, service status, and active account mix across the reporting scope';
      if(exHdrs[1]) exHdrs[1].textContent='Monthly customer movement and zone-level service status';
      const chartTitles=page.querySelectorAll('.chart-card .chart-title');
      const chartSubtitles=page.querySelectorAll('.chart-card .chart-subtitle');
      if(chartTitles[0]) chartTitles[0].textContent='Customer Base — Monthly Trend';
      if(chartSubtitles[0]) chartSubtitles[0].textContent='Monthly movement in total, active, and disconnected customer accounts across the selected scope.';
      if(chartTitles[1]) chartTitles[1].textContent='Customer Status by Zone';
      if(chartSubtitles[1]) chartSubtitles[1].textContent='Zone comparison of total customers, active accounts, and disconnected accounts.';
    }
    kpis('cu-kpis',[
      {l:'Total Customers',v:F.num(totalCustomers),s:'Latest metered customer base in scope',icon:ICON.people,badgeLabel:'KPI'},
      {l:'Disconnected Customers',v:F.num(disconnectedCustomers),s:disconnectedPct+'% of total customer base',icon:ICON.nrw,cls:disconnectedCustomers>0?'kc-nt':''},
      {l:'Active Customers',v:F.num(activeCustomers),s:totalCustomers?((activeCustomers/totalCustomers*100).toFixed(1)+'% of total base'):'Accounts actively receiving service',icon:ICON.people},
      {l:'Postpaid Customers',v:F.num(k.active_postpaid),s:ppPct+'% of active base',icon:ICON.people},
      {l:'Prepaid Customers',v:F.num(k.active_prepaid),s:prePct+'% of active base',icon:ICON.meter},
      {l:'Population Served',v:F.num(k.pop_supplied),s:'IBNET coverage indicator',icon:ICON.conn,badgeLabel:'INFO'},
    ]);
    document.getElementById('cu-kpis').className='kpi-row kpi-g3';
    const dm=d.monthly.filter(m=>m.has_data),lb=dm.map(m=>MONTHS_SHORT[m.month]||m.month);
    mkChart('ch-cu-main',{type:'line',data:{labels:lb,datasets:[
      {label:'Total Customers',data:dm.map(m=>m.total_metered||0),borderColor:'#1A8FD1',backgroundColor:'rgba(26,143,209,.06)',tension:.3,pointRadius:3,fill:true,borderWidth:2},
      {label:'Active Customers',data:dm.map(m=>m.active_customers||0),borderColor:'#0d9488',tension:.3,borderDash:[4,2],pointRadius:3,borderWidth:2},
      {label:'Disconnected Customers',data:dm.map(m=>m.total_disconnected||0),borderColor:'#d97706',tension:.3,borderDash:[6,3],pointRadius:3,borderWidth:2},
    ]},options:{...baseOpts(v=>(v/1000).toFixed(0)+'K'),plugins:{...legendOpts()}}});
    mkChart('ch-cu-zone',{type:'bar',data:{labels:d.by_zone.map(z=>z.zone),datasets:[
      {label:'Total Customers',data:d.by_zone.map(z=>z.total_metered||0),backgroundColor:'#1A8FD1',borderRadius:3},
      {label:'Active Customers',data:d.by_zone.map(z=>z.active_customers||0),backgroundColor:'#0d9488',borderRadius:3},
      {label:'Disconnected Customers',data:d.by_zone.map(z=>z.total_disconnected||0),backgroundColor:'#d97706',borderRadius:3},
    ]},options:{...baseOptsH(),plugins:{...legendOpts()}}});
    renderTable('tbl-customers','CUSTOMER ACCOUNTS REPORT',ROWS.customers,d.monthly,'customers');
mountExportBar('customers');
  }catch(e){errMsg('cu-kpis','Customers failed');}
}

async function loadCustomersUnified(){
  kpis('cu-kpis',[{l:'Loading...',v:'-'}]);
  try{
    const d=await apiPanel('customers'),k=d.kpi;
    const totalCustomers=k.total_metered||0;
    const activeCustomers=k.active_customers||0;
    const disconnectedCustomers=k.total_disconnected||0;
    const populationSupplyArea=k.pop_supply_area||0;
    const coveragePct=k.pct_pop_supplied||0;
    const disconnectedPct=totalCustomers?+(disconnectedCustomers/totalCustomers*100).toFixed(1):0;
    const cwpPct=activeCustomers?+((k.active_post_cwp||0)/activeCustomers*100).toFixed(1):0;
    const postpaidVol=(k.vol_billed_indiv_pp||0)+(k.vol_billed_inst_pp||0)+(k.vol_billed_comm_pp||0)+(k.vol_billed_cwp_pp||0);
    const prepaidVol=(k.vol_billed_indiv_prepaid||0)+(k.vol_billed_inst_prepaid||0)+(k.vol_billed_comm_prepaid||0)+(k.vol_billed_cwp_prepaid||0);
    kpis('cu-kpis',[
      {l:'Total Customers',v:F.num(totalCustomers),s:'Latest metered customer base in scope',icon:ICON.people,badgeLabel:'KPI'},
      {l:'Disconnected Customers',v:F.num(disconnectedCustomers),s:disconnectedPct+'% of total customer base',icon:ICON.nrw,cls:disconnectedCustomers>0?'kc-nt':''},
      {l:'Active Customers',v:F.num(activeCustomers),s:totalCustomers?((activeCustomers/totalCustomers*100).toFixed(1)+'% of total base'):'Accounts actively receiving service',icon:ICON.people},
      {l:'Active Postpaid CWP',v:F.num(k.active_post_cwp),s:cwpPct+'% of active base',icon:ICON.conn},
      {l:'Postpaid Billed Volume',v:F.num(postpaidVol)+' m3',s:'All postpaid billed water volume',icon:ICON.chart},
      {l:'Prepaid Billed Volume',v:F.num(prepaidVol)+' m3',s:'All prepaid billed water volume',icon:ICON.chart},
      {l:'Population in Supply Area',v:F.num(populationSupplyArea),s:'Resident population within the service footprint',icon:ICON.people},
      {l:'Coverage Rate',v:F.pct(coveragePct),s:F.num(k.pop_supplied)+' people currently served',icon:ICON.conn,badgeLabel:'INFO'},
    ]);
    document.getElementById('cu-kpis').className='kpi-row kpi-g4';
    const dm=d.monthly.filter(m=>m.has_data),lb=dm.map(m=>MONTHS_SHORT[m.month]||m.month);
    mkChart('ch-cu-main',{type:'line',data:{labels:lb,datasets:[
      {label:'Total Customers',data:dm.map(m=>m.total_metered||0),borderColor:'#1A8FD1',backgroundColor:'rgba(26,143,209,.06)',tension:.3,pointRadius:3,fill:true,borderWidth:2},
      {label:'Active Customers',data:dm.map(m=>m.active_customers||0),borderColor:'#0d9488',tension:.3,borderDash:[4,2],pointRadius:3,borderWidth:2},
      {label:'Disconnected Customers',data:dm.map(m=>m.total_disconnected||0),borderColor:'#d97706',tension:.3,borderDash:[6,3],pointRadius:3,borderWidth:2},
    ]},options:{...baseOpts(v=>(v/1000).toFixed(0)+'K'),plugins:{...legendOpts()}}});
    mkChart('ch-cu-zone',{type:'bar',data:{labels:d.by_zone.map(z=>z.zone),datasets:[
      {label:'Individual',data:d.by_zone.map(z=>z.disconnected_individual||0),backgroundColor:'#1A8FD1',borderRadius:3,stack:'s'},
      {label:'Institutional',data:d.by_zone.map(z=>z.disconnected_inst||0),backgroundColor:'#0d9488',borderRadius:3,stack:'s'},
      {label:'Commercial',data:d.by_zone.map(z=>z.disconnected_commercial||0),backgroundColor:'#7c3aed',borderRadius:3,stack:'s'},
      {label:'CWP',data:d.by_zone.map(z=>z.disconnected_cwp||0),backgroundColor:'#d97706',borderRadius:3,stack:'s'},
    ]},options:{...baseOptsH(),plugins:{...legendOpts()}}});
    renderTable('tbl-customers','CUSTOMER ACCOUNTS REPORT',ROWS.customers,d.monthly,'customers');
    mountExportBar('customers');
  }catch(e){errMsg('cu-kpis','Customers failed');}
}

async function loadConnections(){
  kpis('cn-kpis',[{l:'Loading...',v:'-'}]);
  try{
    const d=await apiPanel('connections'),k=d.kpi;
    kpis('cn-kpis',[
      {l:'New Connections (YTD)',v:F.num(k.new_connections),s:'Completed and commissioned',icon:ICON.conn,cls:'kc-up'},
      {l:'All Applications Logged',v:F.num(k.all_conn_applied),s:'Total applications captured in the source return',icon:ICON.conn},
      {l:'Postpaid Applications',v:F.num(k.conn_applied),s:'Demand pipeline for quoted connections',icon:ICON.conn},
      {l:'Backlog (C/Fwd)',v:F.num(k.all_conn_cfwd),s:'Paid and awaiting connection',icon:ICON.clock,cls:k.all_conn_cfwd>200?'kc-dn':k.all_conn_cfwd>100?'kc-nt':''},
      {l:'Prepaid Installed',v:F.num(k.prepaid_installed ?? k.prepaid_meters_installed),s:'Smart meter roll-out',icon:ICON.meter},
    ]);
    document.getElementById('cn-kpis').className='kpi-row kpi-g3';
    const dm=d.monthly.filter(m=>m.has_data),lb=dm.map(m=>MONTHS_SHORT[m.month]||m.month);
    mkChart('ch-cn-main',{type:'bar',data:{labels:lb,datasets:[
      {label:'All Applications',data:dm.map(m=>m.all_conn_applied||0),backgroundColor:'rgba(26,143,209,.25)',borderRadius:3},
      {label:'Postpaid Applications',data:dm.map(m=>m.conn_applied||0),backgroundColor:'rgba(26,143,209,.55)',borderRadius:3},
      {label:'Completed',data:dm.map(m=>m.new_connections||0),backgroundColor:'rgba(22,163,74,.7)',borderRadius:3},
    ]},options:{...baseOpts(),plugins:{...legendOpts()}}});
    mkChart('ch-cn-zone',{type:'bar',data:{labels:d.by_zone.map(z=>z.zone),datasets:[{label:'New Connections',data:d.by_zone.map(z=>z.new_connections),backgroundColor:d.by_zone.map(z=>z.color||'#64748b'),borderRadius:4}]},options:{...baseOptsH(),plugins:{...legendOpts()}}});
    renderTable('tbl-connections','NEW WATER CONNECTIONS REPORT',ROWS.connections,d.monthly,'connections');
    mountExportBar('connections');
  }catch(e){errMsg('cn-kpis','NWCs failed');}
}

async function loadStuck(){
  kpis('st-kpis',[{l:'Loading…',v:'—'}]);
  try{
    const d=await apiPanel('stuck'),k=d.kpi;
    const rrOk=(k.repair_rate||0)>=IWA.repair_rate;
    kpis('st-kpis',[
      {l:'Stuck Meters C/Fwd',v:F.num(k.stuck_meters),s:'Active unread meters',icon:ICON.wrench,cls:k.stuck_meters>500?'kc-dn':k.stuck_meters>200?'kc-nt':''},
      {l:'New Stuck (Period)',v:F.num(k.stuck_new),s:'Failures logged this period',icon:ICON.nrw,cls:'kc-dn'},
      {l:'Repaired',v:F.num(k.stuck_repaired),s:'Restored to service',icon:ICON.gauge,cls:'kc-up'},
      {l:'Replaced',v:F.num(k.stuck_replaced),s:'New meter installed',icon:ICON.meter,cls:'kc-up'},
      {l:'Per 1,000 Customers',v:F.dec(k.per_1k_customers),s:'IBNET meter reliability index',icon:ICON.chart},
      {l:'Repair Rate',v:F.pct(k.repair_rate),s:rrOk?'Strong resolution rate':'Below 80% target',
       cls:rrOk?'kc-up':'kc-dn',icon:ICON.gauge,
       badgeLabel:rrOk?'GOOD':'WATCH',
       bm:'Target >'+IWA.repair_rate+'%',bmPct:bmPct(k.repair_rate,IWA.repair_rate,true),bmOk:rrOk},
    ]);
    document.getElementById('st-kpis').className='kpi-row kpi-g3';
    const dm=d.monthly.filter(m=>m.has_data),lb=dm.map(m=>MONTHS_SHORT[m.month]||m.month);
    mkChart('ch-st-main',{type:'bar',data:{labels:lb,datasets:[
      {label:'New Stuck',data:dm.map(m=>m.stuck_new||0),backgroundColor:'rgba(220,38,38,.65)',borderRadius:3,stack:'s'},
      {label:'Repaired',data:dm.map(m=>-(m.stuck_repaired||0)),backgroundColor:'rgba(22,163,74,.65)',borderRadius:3,stack:'s'},
      {label:'Replaced',data:dm.map(m=>-(m.stuck_replaced||0)),backgroundColor:'rgba(13,148,136,.65)',borderRadius:3,stack:'s'},
    ]},options:{...baseOpts(),plugins:{...legendOpts()}}});
    mkChart('ch-st-zone',{type:'bar',data:{labels:d.by_zone.map(z=>z.zone),datasets:[{label:'Stuck Meters C/F',data:d.by_zone.map(z=>z.stuck_meters),backgroundColor:d.by_zone.map(z=>z.color||'#64748b'),borderRadius:4}]},options:{...baseOptsH(),plugins:{...legendOpts()}}});
    patchStuckBF(d.monthly);
    renderTable('tbl-stuck','STUCK METERS REPORT',ROWS.stuck,d.monthly,'stuck');
mountExportBar('stuck');
  }catch(e){errMsg('st-kpis','Stuck Meters failed');}
}

async function loadConnectivity(){
  kpis('co-kpis',[{l:'Loading...',v:'-'}]);
  try{
    const d=await apiPanel('connectivity'),k=d.kpi;
    const dqOk=(k.days_to_quotation||0)>0&&(k.days_to_quotation||0)<=IWA.days_quote;
    const dcOk=(k.days_to_connect||0)>0&&(k.days_to_connect||0)<=IWA.days_connect;
    const qrOk=(k.time_to_resolve||0)>0&&(k.time_to_resolve||0)<=IWA.query_res;
    kpis('co-kpis',[
      {l:'Applications Received',v:F.num(k.conn_applied),s:'Connection demand',icon:ICON.conn},
      {l:'Customers Fully Paid',v:F.num(k.conn_fully_paid),s:'Ready to connect',icon:ICON.cash,cls:'kc-up'},
      {l:'Paid-up Applicants',v:F.num(k.paid_up_applicants),s:'Applicants cleared for connection processing',icon:ICON.cash},
      {l:'Days to Quotation',v:F.dec(k.days_to_quotation)+' d',s:dqOk?'Within 7-day standard':'Exceeds 7-day target',cls:dqOk?'kc-up':'kc-dn',icon:ICON.clock,badgeLabel:dqOk?'GOOD':'WATCH',bm:'Standard <'+IWA.days_quote+' days',bmPct:bmPct(k.days_to_quotation,IWA.days_quote,false),bmOk:dqOk},
      {l:'Days to Connect',v:F.dec(k.days_to_connect)+' d',s:dcOk?'Within 30-day standard':'Exceeds 30-day benchmark',cls:dcOk?'kc-up':'kc-dn',icon:ICON.clock,badgeLabel:dcOk?'GOOD':'WATCH',bm:'Standard <'+IWA.days_connect+' days',bmPct:bmPct(k.days_to_connect,IWA.days_connect,false),bmOk:dcOk},
      {l:'Connection Lead Time',v:F.dec(k.connection_days)+' d',s:'Average from paid-up to completed service connection',icon:ICON.clock},
      {l:'Queries Received',v:F.num(k.queries_received),s:'Customer queries logged',icon:ICON.people},
      {l:'Query Resolution',v:F.dec(k.time_to_resolve)+' d',s:qrOk?'Within resolution expectation':'Slow query handling',cls:qrOk?'kc-up':'kc-nt',icon:ICON.gauge},
      {l:'Average Response Time',v:F.dec(k.response_time_avg)+' d',s:'Average elapsed response to logged customer queries',icon:ICON.clock},
    ]);
    document.getElementById('co-kpis').className='kpi-row kpi-g4';
    const dm=d.monthly.filter(m=>m.has_data),lb=dm.map(m=>MONTHS_SHORT[m.month]||m.month);
    mkChart('ch-co-days',{type:'line',data:{labels:lb,datasets:[
      {label:'Days to Quote',data:dm.map(m=>m.days_to_quotation||0),borderColor:'#1A8FD1',tension:.3,pointRadius:3,borderWidth:2},
      {label:'Days to Connect',data:dm.map(m=>m.days_to_connect||0),borderColor:'#d97706',tension:.3,pointRadius:3,borderWidth:2},
      {label:'Connection Lead Time',data:dm.map(m=>m.connection_days||0),borderColor:'#7c3aed',tension:.3,pointRadius:3,borderWidth:2},
      {label:'Response Time',data:dm.map(m=>m.response_time_avg||0),borderColor:'#0f766e',tension:.3,pointRadius:3,borderWidth:2},
      {type:'line',label:'Quotation Target (7d)',data:dm.map(()=>IWA.days_quote),borderColor:'#1A8FD1',borderDash:[5,3],borderWidth:1.5,pointRadius:0},
      {type:'line',label:'Connection Target (30d)',data:dm.map(()=>IWA.days_connect),borderColor:'#d97706',borderDash:[5,3],borderWidth:1.5,pointRadius:0},
    ]},options:{...baseOpts(v=>v+'d'),plugins:{...legendOpts()}}});
    mkChart('ch-co-conn',{type:'bar',data:{labels:lb,datasets:[
      {label:'Applications',data:dm.map(m=>m.conn_applied||0),backgroundColor:'rgba(26,143,209,.55)',borderRadius:3},
      {label:'Fully Paid',data:dm.map(m=>m.conn_fully_paid||0),backgroundColor:'rgba(13,148,136,.65)',borderRadius:3},
      {label:'Paid-up Applicants',data:dm.map(m=>m.paid_up_applicants||0),backgroundColor:'rgba(124,58,237,.65)',borderRadius:3},
    ]},options:{...baseOpts(),plugins:{...legendOpts()}}});
    renderTable('tbl-connectivity','SERVICE CONNECTIVITY REPORT',ROWS.connectivity,d.monthly,'connectivity');
    mountExportBar('connectivity');
  }catch(e){errMsg('co-kpis','Connectivity failed');}
}

async function loadBreakdowns(){
  kpis('bd-kpis',[{l:'Loading…',v:'—'}]);
  try{
    const d=await apiPanel('breakdowns'),k=d.kpi;
    const bdOk=(k.per_1k_customers||0)>0&&(k.per_1k_customers||0)<=IWA.bd_per_1k;
    const PVC_SIZE_FIELDS=['pvc_20mm','pvc_25mm','pvc_32mm','pvc_40mm','pvc_50mm','pvc_63mm','pvc_75mm','pvc_90mm','pvc_110mm','pvc_160mm','pvc_200mm','pvc_250mm','pvc_315mm'];
    const hasMaterialSplit=d.monthly.some(m=>((m.pipe_pvc||0)+(m.pipe_gi||0)+(m.pipe_di||0)+(m.pipe_hdpe_ac||0))>0)
      || d.by_zone.some(z=>((z.pipe_pvc||0)+(z.pipe_gi||0)+(z.pipe_di||0)+(z.pipe_hdpe_ac||0))>0);
    const hasPvcSizeSplit=d.monthly.some(m=>PVC_SIZE_FIELDS.some(f=>(m[f]||0)>0))
      || d.by_zone.some(z=>PVC_SIZE_FIELDS.some(f=>(z[f]||0)>0));
    const hasAnyBreakdowns=d.monthly.some(m=>((m.pipe_breakdowns||0)+(m.pump_breakdowns||0))>0)
      || d.by_zone.some(z=>((z.pipe_breakdowns||0)+(z.pump_breakdowns||0))>0);

    kpis('bd-kpis',[
      {l:'Pipe Breakdowns',v:F.num(k.pipe_breakdowns),s:'Mains & reticulation failures',icon:ICON.pipe,cls:'kc-dn'},
      {l:'Pump Breakdowns',v:F.num(k.pump_breakdowns),s:'Mechanical failures',icon:ICON.wrench,cls:k.pump_breakdowns>0?'kc-nt':''},
      {l:'Total Breakdowns',v:F.num(k.total),s:'Combined infrastructure events',icon:ICON.nrw,cls:'kc-dn'},
      {l:'Per 1,000 Connections',v:F.dec(k.per_1k_customers),
       s:bdOk?'Within IBNET threshold':'Above 5/1K benchmark',
       cls:bdOk?'kc-up':'kc-dn',icon:ICON.gauge,
       badgeLabel:bdOk?'GOOD':'WATCH',
       bm:'IBNET benchmark <'+IWA.bd_per_1k+'/1K connections',bmPct:bmPct(k.per_1k_customers,IWA.bd_per_1k,false),bmOk:bdOk},
      {l:'Pump Hours Lost',v:F.num(k.pump_hours_lost)+' h',s:'Productive capacity lost',icon:ICON.clock,cls:'kc-dn'},
    ]);
    document.getElementById('bd-kpis').className='kpi-row kpi-g3';
    const dm=d.monthly.filter(m=>m.has_data),lb=dm.map(m=>MONTHS_SHORT[m.month]||m.month);
    mkChart('ch-bd-main',{type:'bar',data:{labels:lb,datasets:[
      {label:'Pipe Breakdowns',data:dm.map(m=>m.pipe_breakdowns||0),backgroundColor:'rgba(220,38,38,.65)',borderRadius:3,stack:'s'},
      {label:'Pump Breakdowns',data:dm.map(m=>m.pump_breakdowns||0),backgroundColor:'rgba(217,119,6,.65)',borderRadius:3,stack:'s'},
    ]},options:{...baseOpts(),plugins:{...legendOpts()}}});
    mkChart('ch-bd-zone',{type:'bar',data:{labels:d.by_zone.map(z=>z.zone),datasets:[
      {label:'Pipe',data:d.by_zone.map(z=>z.pipe_breakdowns),backgroundColor:'rgba(220,38,38,.65)',borderRadius:3,stack:'s'},
      {label:'Pump',data:d.by_zone.map(z=>z.pump_breakdowns),backgroundColor:'rgba(217,119,6,.65)',borderRadius:3,stack:'s'},
    ]},options:{...baseOptsH(),plugins:{...legendOpts()}}});

    if(!hasPvcSizeSplit){
      kpis('bd-pvc-kpis',[
        {l:'PVC Size Split',v:'Not loaded',s:'Size-class fields are blank in the current dataset',icon:ICON.pipe,cls:'kc-nt',badgeLabel:'INFO',bm:'Material-level breakdowns will display once PVC size data is imported.',bmOk:true},
        {l:'Pipe Breakdowns',v:F.num(k.pipe_breakdowns),s:'Fallback total while PVC size split is unavailable',icon:ICON.chart,cls:'kc-dn'},
      ]);
      document.getElementById('bd-pvc-kpis').className='kpi-row kpi-g3';
      mkChart('ch-bd-pvc-main',{type:'bar',data:{labels:lb,datasets:[
        {label:'Total Pipe Breakdowns',data:dm.map(m=>m.pipe_breakdowns||0),backgroundColor:'rgba(0,119,182,.65)',borderRadius:3},
      ]},options:{...baseOpts(),plugins:{...legendOpts()}}});
      mkChart('ch-bd-pvc-zone',{type:'bar',data:{labels:d.by_zone.map(z=>z.zone),datasets:[
        {label:'Total Pipe Breakdowns',data:d.by_zone.map(z=>z.pipe_breakdowns||0),backgroundColor:d.by_zone.map(z=>z.color||'#64748b'),borderRadius:3},
      ]},options:{...baseOptsH(),plugins:{...legendOpts()}}});
      const pvcSizeCanvas=document.getElementById('ch-bd-pvc-size');
      if(pvcSizeCanvas && pvcSizeCanvas.parentElement){
        pvcSizeCanvas.parentElement.innerHTML= DOMPurify.sanitize('<div class="chart-empty-state"><div class="chart-empty-title">PVC size-class breakdown data not available</div><div class="chart-empty-note">The current database contains total pipe breakdowns, but not the detailed PVC size split needed for this chart. Import or backfill the PVC size columns to enable the full view.</div></div>');
      }
      renderTable('tbl-bd-pvc','PVC PIPE BREAKDOWNS BY SIZE REPORT',[
        {label:'Total Pipe Breakdowns (size split unavailable)',field:'pipe_breakdowns',fmt:'num',annType:'sum',bold:true,zeroOk:true},
      ],d.monthly,'pvc_breakdowns');
    } else {
      const PVC_SIZES=[
        {s:'pvc_20mm',label:'20mm PVC',note:'Domestic connections — most common'},
        {s:'pvc_25mm',label:'25mm PVC',note:'Domestic / yard connections'},
        {s:'pvc_32mm',label:'32mm PVC',note:'Small branch mains'},
        {s:'pvc_40mm',label:'40mm PVC',note:'Branch distribution'},
        {s:'pvc_50mm',label:'50mm PVC',note:'Secondary distribution'},
        {s:'pvc_63mm',label:'63mm PVC',note:'Secondary mains'},
        {s:'pvc_75mm',label:'75mm PVC',note:'Distribution mains'},
        {s:'pvc_90mm',label:'90mm PVC',note:'Sub-mains'},
        {s:'pvc_110mm',label:'110mm PVC',note:'Primary distribution'},
        {s:'pvc_160mm',label:'160mm PVC',note:'Transmission mains'},
        {s:'pvc_200mm',label:'200mm PVC',note:'Large mains'},
        {s:'pvc_250mm',label:'250mm PVC',note:'Trunk mains'},
        {s:'pvc_315mm',label:'315mm PVC',note:'Major trunk mains'},
      ];
      const PVC_COLORS=['#0077b6','#0096c7','#00b4d8','#48cae4','#90e0ef','#0d9488','#16a34a','#65a30d','#d97706','#c2410c','#dc2626','#7c3aed','#5b21b6'];
      const pvcSorted=PVC_SIZES.map((p,i)=>({...p,total:k[p.s]||0,color:PVC_COLORS[i]})).filter(p=>p.total>0).sort((a,b)=>b.total-a.total);
      const pvcAllTotal=k.pvc_total||pvcSorted.reduce((s,p)=>s+p.total,0)||1;
      kpis('bd-pvc-kpis', pvcSorted.slice(0,5).map(p=>({
        l: p.label,
        v: F.num(p.total),
        s: p.note,
        icon: ICON.pipe,
        bm: F.pct(p.total/pvcAllTotal*100)+' of all PVC breakdowns',
        bmPct: p.total/pvcAllTotal*100,
        bmOk: true,
      })));
      document.getElementById('bd-pvc-kpis').className='kpi-row kpi-g4';
      const topSizes=pvcSorted.slice(0,4);
      const LINE_COLORS=['#0077b6','#e63946','#2dc653','#f4a261','#7209b7','#3a86ff','#06d6a0','#ffb703'];
      mkChart('ch-bd-pvc-main',{type:'line',data:{labels:lb,datasets:topSizes.map((p,i)=>({
          label:p.label,data:dm.map(m=>m[p.s]||0),borderColor:LINE_COLORS[i],backgroundColor:'transparent',tension:.3,pointRadius:4,pointHoverRadius:6,pointBackgroundColor:LINE_COLORS[i],borderWidth:2.5,fill:false,
        }))},options:{...baseOpts(),plugins:{...legendOpts()}}});
      mkChart('ch-bd-pvc-zone',{type:'bar',data:{labels:d.by_zone.map(z=>z.zone),datasets:pvcSorted.map(p=>({
          label:p.label,data:d.by_zone.map(z=>z[p.s]||0),backgroundColor:p.color,borderRadius:2,stack:'s',
        }))},options:{...baseOptsH(),plugins:{...legendOpts('right')}}});
      mkChart('ch-bd-pvc-size',{type:'bar',data:{labels:pvcSorted.map(p=>p.label),datasets:[{label:'Breakdowns (YTD)',data:pvcSorted.map(p=>p.total),backgroundColor:pvcSorted.map(p=>p.color),borderRadius:4}]},options:{...baseOptsH(),plugins:{...legendOpts()},scales:{x:{min:0,ticks:{color:LC,font:{size:10},callback:v=>Number.isInteger(v)?v.toLocaleString():null},grid:{color:GC},border:{display:false}},y:{ticks:{color:LC,font:{size:11,weight:'600',family:'Inter,system-ui,sans-serif'}},grid:{color:GC,drawBorder:false}}}}});
      renderTable('tbl-bd-pvc','PVC PIPE BREAKDOWNS BY SIZE REPORT',ROWS.pvc_breakdowns,d.monthly,'pvc_breakdowns');
    }

    const breakdownRows=hasMaterialSplit ? ROWS.breakdowns : [
      {label:'Total Pipe + Pump Breakdowns',computed:m=>(m.pipe_breakdowns||0)+(m.pump_breakdowns||0),fmt:'num',annType:'sum',bold:true,zeroOk:true},
      {type:'spacer'},
      {type:'section',label:'Pipe Material Split Not Yet Loaded'},
      {label:'Total Pipe Breakdowns',field:'pipe_breakdowns',fmt:'num',annType:'sum',bold:true,zeroOk:true},
      {type:'spacer'},
      {type:'section',label:'Pump & Supply'},
      {label:'Pump Breakdowns',field:'pump_breakdowns',fmt:'num',annType:'sum',color:'red',zeroOk:true},
      {label:'Pump Hours Lost',field:'pump_hours_lost',fmt:'num',annType:'sum',zeroOk:true},
      {label:'Supply Hrs/Day (Avg)',field:'supply_hours',fmt:'dec1',annType:'avg'},
    ];
    renderTable('tbl-breakdowns','INFRASTRUCTURE BREAKDOWNS REPORT',breakdownRows,d.monthly,'breakdowns');
    mountExportBar('breakdowns');
  }catch(e){errMsg('bd-kpis','Breakdowns failed');}
}

async function loadPipelines(){
  kpis('pl-kpis',[{l:'Loading…',v:'—'}]);
  try{
    const d=await apiPanel('pipelines'),k=d.kpi;
    kpis('pl-kpis',[
      {l:'Total Dev Lines (YTD)',v:F.num(k.dev_lines_total)+' m',s:'Network extension — all sizes',icon:ICON.pipe,cls:'kc-up'},
      {l:'32mm Lines',v:F.num(k.dev_lines_32mm)+' m',s:'Domestic service connections',icon:ICON.pipe},
      {l:'50mm Lines',v:F.num(k.dev_lines_50mm)+' m',s:'Small distribution',icon:ICON.pipe},
      {l:'63mm Lines',v:F.num(k.dev_lines_63mm)+' m',s:'Medium distribution',icon:ICON.pipe},
      {l:'90mm Lines',v:F.num(k.dev_lines_90mm)+' m',s:'Sub-main distribution',icon:ICON.pipe},
      {l:'110mm+ Lines',v:F.num(k.dev_lines_110mm)+' m',s:'Main trunk extensions',icon:ICON.pipe},
    ]);
    document.getElementById('pl-kpis').className='kpi-row kpi-g3';
    const sp=d.size_split.filter(s=>s.value>0);
    mkChart('ch-pl-split',{type:'doughnut',data:{labels:sp.map(s=>s.label),datasets:[{data:sp.map(s=>s.value),backgroundColor:sp.map(s=>s.color),borderWidth:2}]},options:{responsive:true,maintainAspectRatio:false,cutout:'55%',...tooltipPlugin,plugins:{...tooltipPlugin.plugins,legend:{display:true,position:'right',labels:{font:{size:11},color:LC,padding:10}}}}});
    const dm=d.monthly.filter(m=>m.has_data),lb=dm.map(m=>MONTHS_SHORT[m.month]||m.month);
    mkChart('ch-pl-main',{type:'bar',data:{labels:lb,datasets:[{label:'Dev Lines Installed (m)',data:dm.map(m=>m.dev_lines_total||0),backgroundColor:'rgba(22,163,74,.65)',borderRadius:3}]},options:{...baseOpts(),plugins:{...legendOpts()}}});
    renderPipelinesTable('tbl-pipelines',d.monthly);
mountExportBar('pipelines');
  }catch(e){errMsg('pl-kpis','Pipelines failed');}
}

async function loadBilled(){
  kpis('bi-kpis',[{l:'Loading…',v:'—'}]);
  try{
    const d=await apiPanel('billed'),k=d.kpi;
    kpis('bi-kpis',[
      {l:'Total Billed (YTD)',v:F.mwk(k.amt_billed),s:'Gross revenue billed',icon:ICON.revenue,badgeLabel:'KPI'},
      {l:'Postpaid Billed',v:F.mwk(k.amt_billed_pp),s:F.pct(k.pp_pct)+' of total billed',icon:ICON.cash},
      {l:'Prepaid Billed',v:F.mwk(k.amt_billed_prepaid),s:F.pct(k.prepaid_pct)+' of total billed',icon:ICON.meter},
      {l:'Total Sales Revenue',v:F.mwk(k.total_sales),s:'Including service charges',icon:ICON.chart,cls:'kc-up'},
    ]);
    document.getElementById('bi-kpis').className='kpi-row kpi-g4';
    const dm=d.monthly.filter(m=>m.has_data),lb=dm.map(m=>MONTHS_SHORT[m.month]||m.month);
    mkChart('ch-bi-main',{type:'bar',data:{labels:lb,datasets:[
      {label:'Postpaid (MWK M)',data:dm.map(m=>+(m.amt_billed_pp/1e6).toFixed(1)),backgroundColor:'rgba(26,143,209,.7)',borderRadius:3,stack:'s'},
      {label:'Prepaid (MWK M)',data:dm.map(m=>+(m.amt_billed_prepaid/1e6).toFixed(1)),backgroundColor:'rgba(124,58,237,.7)',borderRadius:3,stack:'s'},
    ]},options:{...baseOpts(v=>v+'M'),plugins:{...legendOpts()}}});
    mkChart('ch-bi-zone',{type:'bar',data:{labels:d.by_zone.map(z=>z.zone),datasets:[{label:'Total Billed (MWK M)',data:d.by_zone.map(z=>+(z.amt_billed/1e6).toFixed(1)),backgroundColor:d.by_zone.map(z=>z.color||'#64748b'),borderRadius:4}]},options:{...baseOptsH(v=>v+'M'),plugins:{...legendOpts()}}});
    mkChart('ch-bi-split',{type:'doughnut',data:{labels:['Postpaid','Prepaid'],datasets:[{data:[k.amt_billed_pp,k.amt_billed_prepaid],backgroundColor:['#1A8FD1','#7c3aed'],borderWidth:2}]},options:{responsive:true,maintainAspectRatio:false,cutout:'55%',...tooltipPlugin,plugins:{...tooltipPlugin.plugins,legend:{display:true,position:'right',labels:{font:{size:11},color:LC,padding:10}}}}});
    renderTable('tbl-billed','BILLED AMOUNTS REPORT',ROWS.billed,d.monthly,'billed');
mountExportBar('billed');
  }catch(e){errMsg('bi-kpis','Billed Amount failed');}
}

async function loadCollections(){
  kpis('cl-kpis',[{l:'Loading…',v:'—'}]);
  try{
    const d=await apiPanel('collections'),k=d.kpi;
    const crOk=(k.collection_rate||0)>=IWA.coll_rate;
    kpis('cl-kpis',[
      {l:'Total Billed (YTD)',v:F.mwk(k.amt_billed),s:'Gross revenue demand',icon:ICON.revenue},
      {l:'Cash Collected (YTD)',v:F.mwk(k.cash_collected),s:'Actual receipts',icon:ICON.cash,cls:'kc-up',badgeLabel:'GOOD'},
      {l:'Collection Rate',v:F.pct(k.collection_rate),
       s:crOk?'Above IBNET '+IWA.coll_rate+'% benchmark':'Below IBNET '+IWA.coll_rate+'% target',
       cls:crOk?'kc-up':'kc-dn',icon:ICON.gauge,
       badgeLabel:crOk?'GOOD':'HIGH',
       bm:'IBNET benchmark >'+IWA.coll_rate+'%',bmPct:bmPct(k.collection_rate,IWA.coll_rate,true),bmOk:crOk},
      {l:'Billing Gap',v:F.mwk(k.billing_gap),s:'Billed minus collected',icon:ICON.nrw,cls:'kc-dn',badgeLabel:crOk?'WATCH':'HIGH'},
      {l:'Collection per Sales',v:F.dec(k.collection_per_sales||0),s:'Cash collected for each unit of sales billed',icon:ICON.gauge},
      {l:'Postpaid Collected',v:F.mwk(k.cash_coll_pp),s:'Postpaid receipts',icon:ICON.cash},
      {l:'Prepaid Collected',v:F.mwk(k.cash_coll_prepaid),s:'Smart meter revenue',icon:ICON.meter},
    ]);
    document.getElementById('cl-kpis').className='kpi-row kpi-g3';
    const dm=d.monthly.filter(m=>m.has_data),lb=dm.map(m=>MONTHS_SHORT[m.month]||m.month);
    const collectionRates=dm.map(m=>m.amt_billed>0?+((m.cash_collected/m.amt_billed)*100).toFixed(1):0);
    const collectionAxisMax=Math.max(110, Math.ceil((Math.max(...collectionRates, IWA.coll_rate)+5)/5)*5);
    mkChart('ch-cl-main',{type:'bar',data:{labels:lb,datasets:[
      {label:'Billed (MWK B)',data:dm.map(m=>+(m.amt_billed/1e9).toFixed(2)),backgroundColor:'rgba(26,143,209,.62)',borderRadius:3,yAxisID:'y'},
      {label:'Collected (MWK B)',data:dm.map(m=>+(m.cash_collected/1e9).toFixed(2)),backgroundColor:'rgba(22,163,74,.72)',borderRadius:3,yAxisID:'y'},
      {type:'line',label:'Collection Rate %',data:collectionRates,borderColor:'#0f766e',backgroundColor:'transparent',tension:.3,pointRadius:3,pointHoverRadius:5,borderWidth:2,yAxisID:'y1',fill:false,clip:false},
      {type:'line',label:'IBNET '+IWA.coll_rate+'% benchmark',data:dm.map(()=>IWA.coll_rate),borderColor:'#dc2626',borderDash:[5,3],borderWidth:1.5,pointRadius:0,yAxisID:'y1',fill:false},
    ]},options:{responsive:true,maintainAspectRatio:false,animation:chartAnim,
      scales:{
        x:{ticks:{color:LC,font:{size:10,family:'Inter,system-ui,sans-serif'},maxRotation:0,autoSkip:false},grid:{color:GC,drawBorder:false}},
        y:{ticks:{color:LC,font:{size:10,family:'Inter,system-ui,sans-serif'},callback:v=>'MK '+Number(v).toFixed(1)+'B'},grid:{color:GC},border:{display:false},grace:'12%'},
        y1:{position:'right',min:0,max:collectionAxisMax,ticks:{color:'#0f766e',font:{size:10,family:'Inter,system-ui,sans-serif'},callback:v=>v+'%'},grid:{display:false},border:{display:false}},
      },
      ...tooltipPlugin,plugins:{...legendOptsCompact()}}});
    mkChart('ch-cl-rate',{type:'bar',data:{labels:d.by_zone.map(z=>z.zone),datasets:[
      {label:'Collection Rate %',data:d.by_zone.map(z=>z.amt_billed>0?+(z.cash_collected/z.amt_billed*100).toFixed(1):0),backgroundColor:d.by_zone.map(z=>{const cr=z.amt_billed>0?z.cash_collected/z.amt_billed*100:0;return cr>=IWA.coll_rate?'rgba(22,163,74,.7)':'rgba(220,38,38,.65)';}),borderRadius:4},
      {type:'line',label:'IBNET '+IWA.coll_rate+'% benchmark',data:d.by_zone.map(()=>IWA.coll_rate),borderColor:'#1A8FD1',borderDash:[5,3],borderWidth:1.5,pointRadius:0},
    ]},options:{...baseOptsH(v=>v+'%'),plugins:{...legendOpts()}}});
    mkChart('ch-cl-split',{type:'bar',data:{labels:lb,datasets:[
      {label:'Postpaid',data:dm.map(m=>+(m.cash_coll_pp/1e6).toFixed(1)),backgroundColor:'rgba(26,143,209,.7)',borderRadius:3,stack:'s'},
      {label:'Prepaid',data:dm.map(m=>+(m.cash_coll_prepaid/1e6).toFixed(1)),backgroundColor:'rgba(124,58,237,.7)',borderRadius:3,stack:'s'},
    ]},options:{...baseOpts(v=>v+'M'),plugins:{...legendOpts()}}});
    renderTable('tbl-collections','BILLING & COLLECTIONS REPORT',ROWS.collections,d.monthly,'collections');
mountExportBar('collections');
  }catch(e){errMsg('cl-kpis','Collections failed');}
}

async function loadCharges(){
  kpis('ch-kpis',[{l:'Loading…',v:'—'}]);
  try{
    const d=await apiPanel('charges'),k=d.kpi;
    kpis('ch-kpis',[
      {l:'Service Charge (YTD)',v:F.mwk(k.service_charge),s:F.pct(k.sc_pct)+' of total sales',icon:ICON.revenue,cls:'kc-up'},
      {l:'Meter Rental (YTD)',v:F.mwk(k.meter_rental),s:F.pct(k.mr_pct)+' of total sales',icon:ICON.meter},
      {l:'Total Sales Revenue',v:F.mwk(k.total_sales),s:'Service charge + meter rental',icon:ICON.chart,badgeLabel:'KPI'},
    ]);
    document.getElementById('ch-kpis').className='kpi-row kpi-g3';
    const dm=d.monthly.filter(m=>m.has_data),lb=dm.map(m=>MONTHS_SHORT[m.month]||m.month);
    mkChart('ch-ch-main',{type:'bar',data:{labels:lb,datasets:[
      {label:'Service Charge (MWK M)',data:dm.map(m=>+(m.service_charge/1e6).toFixed(2)),backgroundColor:'rgba(22,163,74,.7)',borderRadius:3,stack:'s'},
      {label:'Meter Rental (MWK M)',data:dm.map(m=>+(m.meter_rental/1e6).toFixed(2)),backgroundColor:'rgba(26,143,209,.7)',borderRadius:3,stack:'s'},
    ]},options:{...baseOpts(v=>v+'M'),plugins:{...legendOpts()}}});
    mkChart('ch-ch-zone',{type:'bar',data:{labels:d.by_zone.map(z=>z.zone),datasets:[{label:'Total Sales (MWK M)',data:d.by_zone.map(z=>+(z.total_sales/1e6).toFixed(1)),backgroundColor:d.by_zone.map(z=>z.color||'#64748b'),borderRadius:4}]},options:{...baseOptsH(v=>v+'M'),plugins:{...legendOpts()}}});
    mkChart('ch-ch-split',{type:'doughnut',data:{labels:['Service Charge','Meter Rental'],datasets:[{data:[k.service_charge,k.meter_rental],backgroundColor:['#16a34a','#1A8FD1'],borderWidth:2}]},options:{responsive:true,maintainAspectRatio:false,cutout:'55%',...tooltipPlugin,plugins:{...tooltipPlugin.plugins,legend:{display:true,position:'right',labels:{font:{size:11},color:LC,padding:10}}}}});
    renderTable('tbl-charges','SERVICE CHARGES & METER RENTAL REPORT',ROWS.charges,d.monthly,'charges');
mountExportBar('charges');
  }catch(e){errMsg('ch-kpis','Charges failed');}
}

async function loadExpenses(){
  kpis('ex-kpis',[{l:'Loading...',v:'-'}]);
  try{
    const d=await apiPanel('expenses'),k=d.kpi;
    kpis('ex-kpis',[
      {l:'Total Operating Costs',v:F.mwk(k.op_cost),s:'IBNET: total OPEX',icon:ICON.chart,badgeLabel:'INFO'},
      {l:'Staff Costs',v:F.mwk(k.staff_costs),s:'Salaries and allowances',icon:ICON.staff,badgeLabel:'INFO'},
      {l:'Wages',v:F.mwk(k.wages),s:'Casual or wage bill',icon:ICON.staff,badgeLabel:'INFO'},
      {l:'Power Costs',v:F.mwk(k.power_cost),s:'Electricity expenditure',icon:ICON.bolt,badgeLabel:((k.power_cost||0) > (k.chem_cost||0)+(k.fuel_cost||0))?'WATCH':'INFO'},
      {l:'Chemical Costs',v:F.mwk(k.chem_cost),s:'Treatment chemicals',icon:ICON.chem,badgeLabel:'INFO'},
      {l:'Fuel Costs',v:F.mwk(k.fuel_cost),s:'Vehicle and generator fuel',icon:ICON.bolt,badgeLabel:'INFO'},
      {l:'Fuel Used',v:F.num(k.fuel_used_litres)+' litres',s:'Physical fuel consumption captured in the source return',icon:ICON.bolt},
      {l:'Distance Covered',v:F.num(k.distances_km)+' km',s:'Vehicle kilometres driven (YTD)',icon:ICON.pipe},
      {l:'Maintenance',v:k.maintenance>0?F.mwk(k.maintenance):'Not recorded',s:'Repairs and upkeep',icon:ICON.wrench,cls:k.maintenance>0?'':'kc-nt'},
      {l:'Power Consumed',v:F.num(k.power_kwh)+' kWh',s:'Total electricity units',icon:ICON.bolt},
      {l:'OpEx / m3 Produced',v:F.dec(k.op_cost_per_m3_produced),s:'Average operating cost per cubic metre produced',icon:ICON.gauge},
      {l:'OpEx / Sales',v:F.dec(k.op_cost_per_sales),s:'Operating cost relative to sales revenue',icon:ICON.chart},
    ]);
    document.getElementById('ex-kpis').className='kpi-row kpi-g4';
    const sp=d.cost_split.filter(s=>s.value>0);
    mkChart('ch-ex-split',{type:'doughnut',data:{labels:sp.map(s=>s.label),datasets:[{data:sp.map(s=>+(s.value/1e6).toFixed(1)),backgroundColor:sp.map(s=>s.color),borderWidth:2}]},options:{responsive:true,maintainAspectRatio:false,cutout:'60%',...tooltipPlugin,plugins:{...tooltipPlugin.plugins,legend:{display:true,position:'right',labels:{font:{size:11},color:LC,padding:8}}}}});
    mkChart('ch-ex-zone',{type:'bar',data:{labels:d.by_zone.map(z=>z.zone),datasets:[{label:'Total OPEX (MWK M)',data:d.by_zone.map(z=>+(z.op_cost/1e6).toFixed(1)),backgroundColor:d.by_zone.map(z=>z.color||'#64748b'),borderRadius:4}]},options:{...baseOptsH(v=>v+'M'),plugins:{...legendOpts()}}});
    renderTable('tbl-expenses','OPERATING EXPENSES REPORT',ROWS.expenses,d.monthly,'expenses');
    mountExportBar('expenses');
  }catch(e){errMsg('ex-kpis','Expenses failed');}
}

async function loadDebtors(){
  kpis('de-kpis',[{l:'Loading…',v:'—'}]);
  try{
    const d=await apiPanel('debtors'),k=d.kpi;
    const dsoOk=(k.debtors_to_billed||0)<50;
    kpis('de-kpis',[
      {l:'Total Debtors',v:F.mwk(k.total_debtors),s:'IBNET: outstanding receivables',icon:ICON.debt,cls:'kc-dn',badgeLabel:'HIGH',bm:'Monitor against debtor days and cash collection trend'},
      {l:'Private Debtors',v:F.mwk(k.private_debtors),s:F.pct(k.private_pct)+' of total debtors',icon:ICON.people,cls:'kc-nt',badgeLabel:'WATCH'},
      {l:'Public Debtors',v:F.mwk(k.public_debtors),s:'Government & institutions',icon:ICON.staff,cls:'kc-nt',badgeLabel:'WATCH'},
      {l:'Private Share',v:F.pct(k.private_pct),s:'Household debt concentration',icon:ICON.gauge},
      {l:'Debtors / Billed Ratio',v:F.pct(k.debtors_to_billed),s:'Receivables vs annual billing',icon:ICON.chart,
       cls:dsoOk?'kc-nt':'kc-dn',badgeLabel:dsoOk?'WATCH':'HIGH',bm:'Good practice: keep receivables low relative to billed revenue',bmPct:Math.max(0,100-((k.debtors_to_billed||0))),bmOk:dsoOk},
    ]);
    document.getElementById('de-kpis').className='kpi-row kpi-g3';
    const dm=d.monthly.filter(m=>m.has_data),lb=dm.map(m=>MONTHS_SHORT[m.month]||m.month);
    // Multi-series trend: Private, Public, Total
    // Linear regression helper — returns [{x:idx, y:projected}] array
    function linReg(vals){
      const n=vals.length; if(n<2)return vals.map(v=>v);
      const xs=[...Array(n).keys()];
      const mx=xs.reduce((a,b)=>a+b,0)/n, my=vals.reduce((a,b)=>a+b,0)/n;
      const num=xs.reduce((s,x,i)=>s+(x-mx)*(vals[i]-my),0);
      const den=xs.reduce((s,x)=>s+(x-mx)**2,0);
      const m2=den?num/den:0, b2=my-m2*mx;
      return xs.map(x=>+((m2*x+b2).toFixed(2)));
    }
    const totV=dm.map(m=>+(m.total_debtors/1e6).toFixed(2));
    const privV=dm.map(m=>+(m.private_debtors/1e6).toFixed(2));
    const pubV=dm.map(m=>+(m.public_debtors/1e6).toFixed(2));
    const trendLabel=(vals)=>{
      const slope=(vals[vals.length-1]-vals[0])/(vals.length-1||1);
      return slope>0?' ↑':slope<0?' ↓':' →';
    };
    mkChart('ch-de-main',{type:'line',data:{labels:lb,datasets:[
      // Actual data series
      {label:'Total Debtors',data:totV,borderColor:'#dc2626',backgroundColor:'rgba(220,38,38,.07)',tension:.3,pointRadius:4,fill:true,borderWidth:2.5,order:1},
      {label:'Private Debtors',data:privV,borderColor:'#7c3aed',tension:.3,pointRadius:3,borderWidth:2,order:2},
      {label:'Public Debtors',data:pubV,borderColor:'#d97706',tension:.3,pointRadius:3,borderWidth:2,order:3},
      // Trend lines (OLS linear regression)
      {label:'Total trend'+trendLabel(linReg(totV)),data:linReg(totV),borderColor:'rgba(220,38,38,.7)',borderWidth:3,borderDash:[4,3],pointRadius:0,tension:0,fill:false,order:4},
      {label:'Private trend'+trendLabel(linReg(privV)),data:linReg(privV),borderColor:'rgba(124,58,237,.7)',borderWidth:3,borderDash:[4,3],pointRadius:0,tension:0,fill:false,order:5},
      {label:'Public trend'+trendLabel(linReg(pubV)),data:linReg(pubV),borderColor:'rgba(217,119,6,.7)',borderWidth:3,borderDash:[4,3],pointRadius:0,tension:0,fill:false,order:6},
    ]},options:{...baseOpts(v=>v+'M'),plugins:{...tooltipPlugin.plugins,legend:{display:true,position:'top',labels:{font:{size:11},color:LC,usePointStyle:true,pointStyle:'line',
      filter:(item)=>item.datasetIndex<3  // hide trend lines from legend; they appear in label text
    }}}}});
    mkChart('ch-de-zone',{type:'bar',data:{labels:d.by_zone.map(z=>z.zone),datasets:[
      {label:'Private Debtors',data:d.by_zone.map(z=>+(z.private_debtors/1e6).toFixed(2)),backgroundColor:'#7c3aed',borderRadius:3,stack:'s'},
      {label:'Public Debtors',data:d.by_zone.map(z=>+(z.public_debtors/1e6).toFixed(2)),backgroundColor:'#d97706',borderRadius:3,stack:'s'},
    ]},options:{...baseOptsH(v=>v+'M'),plugins:{...legendOpts()}}});
    // Debtor composition % doughnut by zone
    const dz=d.by_zone.filter(z=>z.total_debtors>0);
    mkChart('ch-de-split',{type:'doughnut',data:{labels:dz.map(z=>z.zone),datasets:[{data:dz.map(z=>+(z.total_debtors/1e6).toFixed(2)),backgroundColor:dz.map(z=>z.color||'#64748b'),borderWidth:2}]},
      options:{responsive:true,maintainAspectRatio:false,cutout:'55%',...tooltipPlugin,plugins:{...tooltipPlugin.plugins,legend:{display:true,position:'right',labels:{font:{size:11},color:LC,padding:10}}}}});
    renderTable('tbl-debtors','OUTSTANDING DEBTORS REPORT',ROWS.debtors,d.monthly,'debtors');
mountExportBar('debtors');
  }catch(e){errMsg('de-kpis','Debtors failed');}
}


async function loadSegmentRevenue(){
  kpis('sr-kpis',[{l:'Loading...',v:'-'}]);
  try{
    const d=await apiPanel('segment-revenue'),k=d.kpi;
    const dm=d.monthly.filter(m=>m.has_data),lb=dm.map(m=>MONTHS_SHORT[m.month]||m.month);
    const billedByClass=(m,cls)=>Number(m['amt_billed_'+cls+'_pp']||0)+Number(m['amt_billed_'+cls+'_prepaid']||0);
    const cashByClass=(m,cls)=>Number(m['cash_coll_'+cls+'_pp']||0)+Number(m['cash_coll_'+cls+'_prepaid']||0);
    const classes=[['indiv','Individual','#1A8FD1'],['inst','Institutional','#0d9488'],['comm','Commercial','#7c3aed'],['cwp','CWP','#d97706']];
    kpis('sr-kpis',[
      {l:'Total Billed',v:F.mwk(k.amt_billed),s:'All customer segments and payment modes',icon:ICON.revenue,badgeLabel:'KPI'},
      {l:'Cash Collected',v:F.mwk(k.cash_collected),s:'Cash conversion from billed revenue',icon:ICON.cash,cls:'kc-up'},
      {l:'Collection Rate',v:F.pct(k.collection_rate),s:'Cash collected divided by billed revenue',icon:ICON.gauge},
      {l:'Service Charge',v:F.mwk(k.service_charge),s:'Secondary charge revenue',icon:ICON.revenue},
      {l:'Meter Rental',v:F.mwk(k.meter_rental),s:'Meter rental income',icon:ICON.meter},
      {l:'Commercial Billed',v:F.mwk((k.amt_billed_comm_pp||0)+(k.amt_billed_comm_prepaid||0)),s:'Commercial customer segment',icon:ICON.chart},
    ]);
    document.getElementById('sr-kpis').className='kpi-row kpi-g3';
    mkChart('ch-sr-main',{type:'bar',data:{labels:lb,datasets:classes.map(([key,label,color])=>({label,data:dm.map(m=>+(billedByClass(m,key)/1e6).toFixed(2)),backgroundColor:color,borderRadius:3,stack:'s'}))},options:{...baseOpts(v=>v+'M'),plugins:{...legendOpts()}}});
    mkChart('ch-sr-cash',{type:'line',data:{labels:lb,datasets:classes.map(([key,label,color])=>({label,data:dm.map(m=>+(cashByClass(m,key)/1e6).toFixed(2)),borderColor:color,backgroundColor:'transparent',tension:.3,pointRadius:3,borderWidth:2}))},options:{...baseOpts(v=>v+'M'),plugins:{...legendOpts()}}});
    mkChart('ch-sr-zone',{type:'bar',data:{labels:d.by_zone.map(z=>z.zone),datasets:[{label:'Billed (MWK M)',data:d.by_zone.map(z=>+(z.amt_billed/1e6).toFixed(1)),backgroundColor:d.by_zone.map(z=>z.color||'#64748b'),borderRadius:4},{label:'Collected (MWK M)',data:d.by_zone.map(z=>+(z.cash_collected/1e6).toFixed(1)),backgroundColor:'rgba(22,163,74,.7)',borderRadius:4}]},options:{...baseOptsH(v=>v+'M'),plugins:{...legendOpts()}}});
    renderTable('tbl-segment-revenue','CUSTOMER SEGMENT REVENUE REPORT',ROWS.segment_revenue,d.monthly,'segment-revenue');
    mountExportBar('segment-revenue');
  }catch(e){errMsg('sr-kpis','Customer Segment Revenue failed');}
}

async function loadWorkforce(){
  kpis('wf-kpis',[{l:'Loading...',v:'-'}]);
  try{
    const d=await apiPanel('workforce'),k=d.kpi;
    const dm=d.monthly.filter(m=>m.has_data),lb=dm.map(m=>MONTHS_SHORT[m.month]||m.month);
    kpis('wf-kpis',[
      {l:'Permanent Staff',v:F.num(k.perm_staff),s:'Latest staff establishment in scope',icon:ICON.staff},
      {l:'Temporary Staff',v:F.num(k.temp_staff),s:'Temporary and casual personnel',icon:ICON.staff},
      {l:'Fuel Used',v:F.num(k.fuel_used_litres)+' litres',s:'Physical fuel consumption',icon:ICON.bolt},
      {l:'Fuel Cost',v:F.mwk(k.fuel_cost),s:'Transport and generator fuel spend',icon:ICON.bolt},
      {l:'Distance Covered',v:F.num(k.distances_km)+' km',s:'Fleet movement captured in the source return',icon:ICON.pipe},
      {l:'Staff / 1000m3',v:F.dec(k.staff_per_1000m3_12h),s:'Workforce intensity indicator',icon:ICON.gauge},
      {l:'OpEx / m3 Produced',v:F.dec(k.op_cost_per_m3_produced),s:'Operating cost efficiency',icon:ICON.chart},
      {l:'OpEx / Sales',v:F.dec(k.op_cost_per_sales),s:'Operating cost relative to sales revenue',icon:ICON.chart},
    ]);
    document.getElementById('wf-kpis').className='kpi-row kpi-g4';
    mkChart('ch-wf-main',{type:'line',data:{labels:lb,datasets:[{label:'Fuel Used (000 litres)',data:dm.map(m=>+((m.fuel_used_litres||0)/1000).toFixed(2)),borderColor:'#dc2626',tension:.3,pointRadius:3,borderWidth:2,yAxisID:'y'},{label:'Fuel Cost (MWK M)',data:dm.map(m=>+((m.fuel_cost||0)/1e6).toFixed(2)),borderColor:'#1A8FD1',tension:.3,pointRadius:3,borderWidth:2,yAxisID:'y1'}]},options:{responsive:true,maintainAspectRatio:false,animation:chartAnim,scales:{x:{ticks:{color:LC,font:{size:10}},grid:{color:GC,drawBorder:false}},y:{ticks:{color:'#dc2626',font:{size:10},callback:v=>v+'k'},grid:{color:GC},border:{display:false}},y1:{position:'right',ticks:{color:'#1A8FD1',font:{size:10},callback:v=>v+'M'},grid:{display:false},border:{display:false}}},...tooltipPlugin,plugins:{...legendOpts()}}});
    mkChart('ch-wf-zone',{type:'bar',data:{labels:d.by_zone.map(z=>z.zone),datasets:[{label:'Distance (km)',data:d.by_zone.map(z=>+(z.distances_km||0).toFixed(0)),backgroundColor:d.by_zone.map(z=>z.color||'#64748b'),borderRadius:4},{label:'Fuel Used (litres)',data:d.by_zone.map(z=>+(z.fuel_used_litres||0).toFixed(0)),backgroundColor:'rgba(220,38,38,.55)',borderRadius:4}]},options:{...baseOptsH(),plugins:{...legendOpts()}}});
    renderTable('tbl-workforce','WORKFORCE & FLEET EFFICIENCY REPORT',ROWS.workforce,d.monthly,'workforce');
    mountExportBar('workforce');
  }catch(e){errMsg('wf-kpis','Workforce report failed');}
}

async function loadClassConnections(){
  kpis('cc-kpis',[{l:'Loading...',v:'-'}]);
  try{
    const d=await apiPanel('class-connections'),k=d.kpi;
    const dm=d.monthly.filter(m=>m.has_data),lb=dm.map(m=>MONTHS_SHORT[m.month]||m.month);
    kpis('cc-kpis',[
      {l:'Individual Done',v:F.num(k.conn_indiv_total_done),s:'Completed individual connections',icon:ICON.conn},
      {l:'Institutional Done',v:F.num(k.conn_inst_total_done),s:'Completed institutional connections',icon:ICON.conn},
      {l:'Commercial Done',v:F.num(k.conn_comm_total_done),s:'Completed commercial connections',icon:ICON.conn},
      {l:'CWP Done',v:F.num(k.conn_cwp_total_done),s:'Completed community water point connections',icon:ICON.conn},
      {l:'All Applications',v:F.num(k.all_conn_applied),s:'All applications logged in the source return',icon:ICON.chart},
      {l:'Total Completed',v:F.num(k.new_connections),s:'All customer classes combined',icon:ICON.chart,badgeLabel:'KPI'},
    ]);
    document.getElementById('cc-kpis').className='kpi-row kpi-g3';
    mkChart('ch-cc-main',{type:'line',data:{labels:lb,datasets:[
      {label:'Individual',data:dm.map(m=>m.conn_indiv_total_done||0),borderColor:'#1A8FD1',tension:.3,pointRadius:3,borderWidth:2},
      {label:'Institutional',data:dm.map(m=>m.conn_inst_total_done||0),borderColor:'#0d9488',tension:.3,pointRadius:3,borderWidth:2},
      {label:'Commercial',data:dm.map(m=>m.conn_comm_total_done||0),borderColor:'#7c3aed',tension:.3,pointRadius:3,borderWidth:2},
      {label:'CWP',data:dm.map(m=>m.conn_cwp_total_done||0),borderColor:'#d97706',tension:.3,pointRadius:3,borderWidth:2},
    ]},options:{...baseOpts(),plugins:{...legendOpts()}}});
    mkChart('ch-cc-zone',{type:'bar',data:{labels:d.by_zone.map(z=>z.zone),datasets:[
      {label:'Individual',data:d.by_zone.map(z=>z.conn_indiv_total_done||0),backgroundColor:'#1A8FD1',borderRadius:3,stack:'s'},
      {label:'Institutional',data:d.by_zone.map(z=>z.conn_inst_total_done||0),backgroundColor:'#0d9488',borderRadius:3,stack:'s'},
      {label:'Commercial',data:d.by_zone.map(z=>z.conn_comm_total_done||0),backgroundColor:'#7c3aed',borderRadius:3,stack:'s'},
      {label:'CWP',data:d.by_zone.map(z=>z.conn_cwp_total_done||0),backgroundColor:'#d97706',borderRadius:3,stack:'s'},
    ]},options:{...baseOptsH(),plugins:{...legendOpts()}}});
    renderTable('tbl-class-connections','CONNECTION PIPELINE BY CUSTOMER CLASS REPORT',ROWS.class_connections,d.monthly,'class-connections');
    mountExportBar('class-connections');
  }catch(e){errMsg('cc-kpis','Class connections failed');}
}

async function loadStuckClasses(){
  kpis('sc-kpis',[{l:'Loading...',v:'-'}]);
  try{
    const d=await apiPanel('stuck-classes'),k=d.kpi;
    const dm=d.monthly.filter(m=>m.has_data),lb=dm.map(m=>MONTHS_SHORT[m.month]||m.month);
    kpis('sc-kpis',[
      {l:'Individual C/F',v:F.num(k.stuck_indiv_cfwd),s:'Current individual stuck-meter backlog',icon:ICON.meter},
      {l:'Institutional C/F',v:F.num(k.stuck_inst_cfwd),s:'Current institutional backlog',icon:ICON.meter},
      {l:'Commercial C/F',v:F.num(k.stuck_comm_cfwd),s:'Current commercial backlog',icon:ICON.meter},
      {l:'CWP C/F',v:F.num(k.stuck_cwp_cfwd),s:'Current CWP backlog',icon:ICON.meter},
      {l:'Total C/F',v:F.num(k.all_stuck_cfwd),s:'All customer classes combined',icon:ICON.chart,badgeLabel:'KPI'},
    ]);
    document.getElementById('sc-kpis').className='kpi-row kpi-g3';
    mkChart('ch-sc-main',{type:'line',data:{labels:lb,datasets:[
      {label:'Individual',data:dm.map(m=>m.stuck_indiv_cfwd||0),borderColor:'#1A8FD1',tension:.3,pointRadius:3,borderWidth:2},
      {label:'Institutional',data:dm.map(m=>m.stuck_inst_cfwd||0),borderColor:'#0d9488',tension:.3,pointRadius:3,borderWidth:2},
      {label:'Commercial',data:dm.map(m=>m.stuck_comm_cfwd||0),borderColor:'#7c3aed',tension:.3,pointRadius:3,borderWidth:2},
      {label:'CWP',data:dm.map(m=>m.stuck_cwp_cfwd||0),borderColor:'#d97706',tension:.3,pointRadius:3,borderWidth:2},
    ]},options:{...baseOpts(),plugins:{...legendOpts()}}});
    mkChart('ch-sc-zone',{type:'bar',data:{labels:d.by_zone.map(z=>z.zone),datasets:[
      {label:'Individual',data:d.by_zone.map(z=>z.stuck_indiv_cfwd||0),backgroundColor:'#1A8FD1',borderRadius:3,stack:'s'},
      {label:'Institutional',data:d.by_zone.map(z=>z.stuck_inst_cfwd||0),backgroundColor:'#0d9488',borderRadius:3,stack:'s'},
      {label:'Commercial',data:d.by_zone.map(z=>z.stuck_comm_cfwd||0),backgroundColor:'#7c3aed',borderRadius:3,stack:'s'},
      {label:'CWP',data:d.by_zone.map(z=>z.stuck_cwp_cfwd||0),backgroundColor:'#d97706',borderRadius:3,stack:'s'},
    ]},options:{...baseOptsH(),plugins:{...legendOpts()}}});
    renderTable('tbl-stuck-classes','METER EXCEPTIONS BY CUSTOMER CLASS REPORT',ROWS.stuck_classes,d.monthly,'stuck-classes');
    mountExportBar('stuck-classes');
  }catch(e){errMsg('sc-kpis','Class-based meter exceptions failed');}
}

async function loadPipeMaterials(){
  kpis('pm-kpis',[{l:'Loading...',v:'-'}]);
  try{
    const d=await apiPanel('pipe-materials'),k=d.kpi;
    const dm=d.monthly.filter(m=>m.has_data),lb=dm.map(m=>MONTHS_SHORT[m.month]||m.month);
    const sizes=[['gi_15mm','GI 15mm'],['gi_20mm','GI 20mm'],['gi_25mm','GI 25mm'],['gi_40mm','GI 40mm'],['gi_50mm','GI 50mm'],['gi_75mm','GI 75mm'],['gi_100mm','GI 100mm'],['gi_150mm','GI 150mm'],['gi_200mm','GI 200mm'],['di_150mm','DI 150mm'],['di_200mm','DI 200mm'],['di_250mm','DI 250mm'],['di_300mm','DI 300mm'],['di_350mm','DI 350mm'],['di_525mm','DI 525mm'],['hdpe_20mm','HDPE 20mm'],['hdpe_25mm','HDPE 25mm'],['hdpe_32mm','HDPE 32mm'],['hdpe_50mm','HDPE 50mm'],['ac_50mm','AC 50mm'],['ac_75mm','AC 75mm'],['ac_100mm','AC 100mm'],['ac_150mm','AC 150mm']];
    const topSizes=sizes.map(([field,label])=>({field,label,total:Number(k[field]||0)})).filter(x=>x.total>0).sort((a,b)=>b.total-a.total).slice(0,8);
    kpis('pm-kpis',[
      {l:'PVC Failures',v:F.num(k.pipe_pvc),s:'PVC breakdowns already tracked separately',icon:ICON.pipe},
      {l:'GI Failures',v:F.num(k.pipe_gi),s:'Galvanized iron failures',icon:ICON.pipe},
      {l:'DI Failures',v:F.num(k.pipe_di),s:'Ductile iron failures',icon:ICON.pipe},
      {l:'HDPE and AC Failures',v:F.num(k.pipe_hdpe_ac),s:'HDPE and asbestos cement failures',icon:ICON.pipe},
      {l:'Total Pipe Failures',v:F.num(k.pipe_breakdowns),s:'All pipe-failure events in scope',icon:ICON.chart,badgeLabel:'KPI'},
    ]);
    document.getElementById('pm-kpis').className='kpi-row kpi-g3';
    mkChart('ch-pm-main',{type:'bar',data:{labels:lb,datasets:[
      {label:'GI',data:dm.map(m=>m.pipe_gi||0),backgroundColor:'#1A8FD1',borderRadius:3,stack:'s'},
      {label:'DI',data:dm.map(m=>m.pipe_di||0),backgroundColor:'#0d9488',borderRadius:3,stack:'s'},
      {label:'HDPE + AC',data:dm.map(m=>m.pipe_hdpe_ac||0),backgroundColor:'#7c3aed',borderRadius:3,stack:'s'},
      {label:'PVC',data:dm.map(m=>m.pipe_pvc||0),backgroundColor:'#d97706',borderRadius:3,stack:'s'},
    ]},options:{...baseOpts(),plugins:{...legendOpts()}}});
    mkChart('ch-pm-size',{type:'bar',data:{labels:topSizes.map(x=>x.label),datasets:[{label:'Failures',data:topSizes.map(x=>x.total),backgroundColor:topSizes.map((_,i)=>['#1A8FD1','#0d9488','#7c3aed','#d97706','#dc2626','#0891b2','#65a30d','#9333ea'][i%8]),borderRadius:4}]},options:{...baseOptsH(),plugins:{...legendOpts()}}});
    renderTable('tbl-pipe-materials','PIPE FAILURE BY MATERIAL AND SIZE REPORT',ROWS.pipe_materials,d.monthly,'pipe-materials');
    mountExportBar('pipe-materials');
  }catch(e){errMsg('pm-kpis','Pipe materials report failed');}
}

function hydrateHubWorkspace(page){
  const pageEl=document.getElementById('page-'+page);
  if(!pageEl) return;
  const fy=document.getElementById('fy-select')?.options?.[document.getElementById('fy-select')?.selectedIndex]?.text || dbState.year || '—';
  pageEl.querySelectorAll('[data-current-fy]').forEach(el=>{el.textContent=`FY ${fy}`;});
}
function loadOperationsHub(){ hydrateHubWorkspace('operations'); }
function loadCommercialHub(){ hydrateHubWorkspace('commercial'); }


/* ══════════════════════ COLLAPSIBLE NAV GROUPS ═══════════════════════ */
const NAV_GROUPS=['operations','commercial','reporting'];
const NAV_STORAGE_KEY='srwb_nav_open_group';

function _saveNavState(openGroupId=''){
  try{localStorage.setItem(NAV_STORAGE_KEY, openGroupId||'');}catch{}
}

function _setSectionHeight(secEl){
  if(!secEl)return;
  if(secEl.classList.contains('collapsed')){
    secEl.style.maxHeight='0';
  }else{
    secEl.style.maxHeight=secEl.scrollHeight+'px';
  }
}

function setNavGroupExpanded(id, expanded){
  const grp=document.getElementById('grp-'+id);
  const sec=document.getElementById('sec-'+id);
  if(!grp||!sec)return;
  grp.classList.toggle('collapsed', !expanded);
  sec.classList.toggle('collapsed', !expanded);
  _setSectionHeight(sec);
  const trigger=grp.querySelector('.nav-grp-toggle');
  if(trigger)trigger.setAttribute('aria-expanded', expanded ? 'true' : 'false');
}

function collapseAllNavGroups(exceptId=null){
  NAV_GROUPS.forEach(id=>setNavGroupExpanded(id, id===exceptId));
  _saveNavState(exceptId||'');
}

function groupForPage(page){
  const parent=NAV_PARENT_MAP[page]||page;
  return NAV_GROUPS.includes(parent) ? parent : null;
}

function handleSidebarHubClick(id,evt){
  evt?.stopPropagation?.();
  evt?.preventDefault?.();
  const grp=document.getElementById('grp-'+id);
  const isExpanded=!!grp && !grp.classList.contains('collapsed');
  const currentGroup=groupForPage(currentPage);
  if(isExpanded && currentGroup===id){
    setNavGroupExpanded(id,false);
    _saveNavState('');
    return;
  }
  const targetPage=HUB_DEFAULT_PAGE[id]||id;
  collapseAllNavGroups(id);
  if(currentGroup!==id || currentPage===id){
    navigate(targetPage,{fromHub:id});
  }
}

function toggleNavGroup(id,evt){
  handleSidebarHubClick(id,evt);
}

function initNavGroups(){
  NAV_GROUPS.forEach(id=>{
    const sec=document.getElementById('sec-'+id);
    if(sec){
      sec.classList.add('collapsed');
      sec.style.maxHeight='0';
    }
    const grp=document.getElementById('grp-'+id);
    grp?.classList.add('collapsed');
    const trigger=grp?.querySelector('.nav-grp-toggle');
    if(trigger)trigger.setAttribute('aria-expanded','false');
  });
}

async function initDashboard(opts={}){
  const user=getUser();
  if(user){
    const displayName=user.full_name||user.username;
    const av=displayName?.[0]?.toUpperCase()||'U';
    document.getElementById('user-av').textContent=av;
    document.getElementById('user-nm').textContent=displayName;
    document.getElementById('user-rl').textContent=user.role;
    // Top bar user chip
    const tbAv=document.getElementById('tb-user-av');
    const tbNm=document.getElementById('tb-user-nm');
    const tbRl=document.getElementById('tb-user-rl');
    if(tbAv)tbAv.textContent=av;
    if(tbNm)tbNm.textContent=displayName;
    if(tbRl)tbRl.textContent=user.role;
    // Show upload button and admin link for admin users only
    umInitAdminButton(user.role);
    enforceRoleUI(user.role);
    admShowNavLink(user.role);
    syncRoleLandingNotes();
  }
  const now=new Date();const calYear=now.getMonth()>=3?now.getFullYear()+1:now.getFullYear();
  try{
    const token=getToken();
    // Use enriched fiscal-years endpoint which includes status, has_data, has_budget
    const fyMeta=await fetchJsonSafe(`${API}/api/catalogue/fiscal-years`,{token,fallback:[],label:'/api/catalogue/fiscal-years'});
    dbState.fyMeta = fyMeta; // store for use by budget page and other callers

    // Determine best default year: prefer the "current" status FY, or latest with data
    const currentFy = fyMeta.find(f=>f.status==='current');
    const latestDataFy = [...fyMeta].filter(f=>f.has_data).sort((a,b)=>b.year-a.year)[0];
    const defaultYear = (currentFy||latestDataFy||fyMeta[0])?.year || calYear;
    dbState.year = defaultYear;

    const sel=document.getElementById('fy-select');sel.innerHTML='';

    // Group & sort: future (desc) → current → historical (desc)
    const ordered = [...fyMeta].sort((a,b)=>b.year-a.year);
    for(const fy of ordered){
      const opt=document.createElement('option');
      opt.value=fy.year;
      let label=fy.label||`FY ${fy.year-1}/${String(fy.year).slice(-2)}`;
      if(fy.status==='future') label+=' ▸ Future';
      if(fy.status==='current') label+=' ★ Current';
      if(!fy.has_data && fy.status!=='historical') label+=' (no data)';
      opt.textContent=label;
      if(fy.year===defaultYear)opt.selected=true;
      sel.appendChild(opt);
    }

    // Fallback: if no FYs came from registry, add a sensible local range
    if(ordered.length===0){
      for(const y of [calYear-2,calYear-1,calYear,calYear+1,calYear+2,calYear+3,calYear+4]){
        const opt=document.createElement('option');opt.value=y;
        opt.textContent=`FY ${y-1}/${String(y).slice(-2)}`;
        if(y===calYear)opt.selected=true;sel.appendChild(opt);
      }
    }
  }catch{
    dbState.year=calYear;dbState.fyMeta=[];
    const sel=document.getElementById('fy-select');sel.innerHTML='';
    for(const y of [calYear-2,calYear-1,calYear,calYear+1,calYear+2,calYear+3,calYear+4]){
      const opt=document.createElement('option');opt.value=y;opt.textContent=`FY ${y-1}/${String(y).slice(-2)}`;
      if(y===calYear)opt.selected=true;sel.appendChild(opt);
    }
  }
  await loadZoneSchemes();
  renderQuickFilterControls();
  initNavGroups();
  startTopbarClock();
  updateFooter();
  const landingPage=getInitialPageForUser(user,opts);
  currentPage=landingPage;
  syncReportDensityToolbar(landingPage);
  navigate(landingPage);
  scheduleAlertLoad();
  if(landingPage==='overview')setTimeout(()=>loadNarrative(), 1500);
}

async function loadLoginKpis(){
  try{const token=getToken();if(!token)return;const kpi=await fetchJsonSafe(`${API}/api/analytics/kpi`,{token,fallback:null,label:'/api/analytics/kpi'});if(!kpi||!kpi.active_customers)return;document.getElementById('lkpi-cust').textContent=F.num(kpi.active_customers);document.getElementById('lkpi-prod').textContent=F.m3(kpi.vol_produced);document.getElementById('lkpi-nrw').textContent=F.pct(kpi.nrw_pct);document.getElementById('lkpi-cash').textContent=F.mwk(kpi.cash_collected);document.getElementById('login-kpi-grid').style.visibility='visible';}catch{}}

/* ════════════════════════════════════════════════════════════════════════
   UPLOAD MODAL  —  state machine
   States: idle → picking → validating → previewing → committing → done / err
   ════════════════════════════════════════════════════════════════════════ */

const UM = {
  step:         1,       // 1 = Build RawData, 2 = Import to database
  file:         null,    // File object chosen by user (manual Step 2 override)
  previewToken: null,    // returned by /api/upload/preview
  mode:         'replace', // global_conflict_mode
  buildMode:    'fill',  // 'fill' (smart-diff) | 'force' (full refresh)
  built:        false,   // Step 1 completed successfully this session
  monthNames:   ['January','February','March','April','May','June',
                 'July','August','September','October','November','December'],
};

// Footer button visibility — pass the IDs that should be shown; the rest hide.
function umFooter(...show){
  ['um-btn-cancel','um-btn-back','um-btn-build','um-btn-continue',
   'um-btn-upload','um-btn-commit','um-btn-done'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.style.display='none';
  });
  show.forEach(id=>{ const el=document.getElementById(id); if(el) el.style.display=''; });
}

// Switch between Step 1 (build) and Step 2 (import) and update the indicator.
function umShowStep(n){
  UM.step = n;
  document.getElementById('um-stage-build').style.display = n===1 ? '' : 'none';
  document.getElementById('um-stage-pick').style.display  = n===2 ? '' : 'none';
  if(n===1){ umHidePreview(); document.getElementById('um-result').style.display='none'; }

  const s1 = document.getElementById('um-step-1'), s2 = document.getElementById('um-step-2');
  const line = document.getElementById('um-step-line');
  const ACTIVE='#1A8FD1', MUTE='var(--ds-text-muted,#94a3b8)', BG='var(--ds-border,#e2e8f0)';
  if(s1){ s1.style.color = ACTIVE; s1.querySelector('.um-step-num').style.background = ACTIVE; s1.querySelector('.um-step-num').style.color='#fff'; }
  if(s2){
    const on = n===2;
    s2.style.color = on ? ACTIVE : MUTE;
    const num = s2.querySelector('.um-step-num');
    num.style.background = on ? ACTIVE : BG;
    num.style.color = on ? '#fff' : 'var(--ds-text-muted,#64748b)';
    if(line) line.style.background = on ? ACTIVE : BG;
  }
}

// ── Public entry points ────────────────────────────────────────────────

function openUploadModal(){
  umReset();
  document.getElementById('upload-overlay').classList.add('open');
  document.body.style.overflow='hidden';
}

function closeUploadModal(){
  document.getElementById('upload-overlay').classList.remove('open');
  document.body.style.overflow='';
  // If we just committed successfully, refresh the current page data
  if(UM.justCommitted){ UM.justCommitted=false; reloadPage(currentPage); }
}

// ── File handling ──────────────────────────────────────────────────────

function umFileChosen(evt){
  const f = evt.target.files?.[0];
  if(f) umSetFile(f);
}

function umDragOver(evt){
  evt.preventDefault();
  document.getElementById('um-drop-zone').classList.add('drag-over');
}

function umDragLeave(){
  document.getElementById('um-drop-zone').classList.remove('drag-over');
}

function umDrop(evt){
  evt.preventDefault();
  umDragLeave();
  const f = evt.dataTransfer?.files?.[0];
  if(f) umSetFile(f);
}

function umSetFile(f){
  const ok = /\.(xlsx|xlsm)$/i.test(f.name);
  const drop = document.getElementById('um-drop-zone');
  drop.classList.remove('drag-over','error-state');
  if(!ok){
    drop.classList.add('error-state');
    umShowIssue('err','File type not supported — please upload a .xlsx or .xlsm file.');
    return;
  }
  UM.file = f;
  document.getElementById('um-file-name-text').textContent = f.name;
  document.getElementById('um-file-label').style.display='flex';
  drop.classList.add('has-file');
  // Reset preview if user swaps file
  umHidePreview();
  UM.previewToken = null;
  document.getElementById('um-btn-upload').disabled = false;
  document.getElementById('um-btn-label').textContent = 'Upload & Validate';
  umFooter('um-btn-back','um-btn-upload');
}

function umClearFile(evt){
  evt.stopPropagation();
  UM.file = null;
  UM.previewToken = null;
  const drop = document.getElementById('um-drop-zone');
  drop.classList.remove('has-file','error-state','drag-over');
  document.getElementById('um-file-input').value = '';
  document.getElementById('um-file-label').style.display='none';
  umHidePreview();
  document.getElementById('um-btn-upload').disabled = true;
  // Back to the generated-file preview if we have one, else just the drop zone.
  if(UM.previewToken){ umFooter('um-btn-back','um-btn-cancel','um-btn-commit'); }
  else { umFooter('um-btn-back','um-btn-upload'); }
}

function umModeChange(radio){
  UM.mode = radio.value;
  // Update selected styling on labels
  ['um-mode-overwrite','um-mode-skip','um-mode-clear'].forEach(id=>{
    const el = document.getElementById(id);
    if(el) el.classList.toggle('selected', el.querySelector('input').value === UM.mode);
  });
}

// ── Reset modal to initial state ───────────────────────────────────────

function umReset(){
  UM.file = null;
  UM.previewToken = null;
  UM.mode = 'replace';
  UM.buildMode = 'fill';
  UM.built = false;
  UM.justCommitted = false;
  document.getElementById('um-file-input').value = '';
  const drop = document.getElementById('um-drop-zone');
  drop.classList.remove('has-file','error-state','drag-over');
  umHidePreview();
  document.getElementById('um-result').style.display = 'none';
  document.getElementById('um-progress').style.display = 'none';
  document.getElementById('um-btn-cancel').textContent = 'Cancel';
  document.getElementById('um-btn-upload').disabled = true;

  // Step 1 build UI
  document.getElementById('um-build-result').style.display = 'none';
  document.getElementById('um-build-issues').innerHTML = '';
  document.getElementById('um-build-label').textContent = 'Build RawData';
  document.querySelectorAll('input[name="um-bmode"]').forEach(r=>{ r.checked = r.value === 'fill'; });
  document.getElementById('um-bmode-fill').classList.add('selected');
  document.getElementById('um-bmode-force').classList.remove('selected');

  // Reset import mode radio to "replace"
  document.querySelectorAll('input[name="um-mode"]').forEach(r=>{
    r.checked = r.value === 'replace';
  });
  document.getElementById('um-mode-overwrite').classList.add('selected');
  document.getElementById('um-mode-skip').classList.remove('selected');
  document.getElementById('um-mode-clear').classList.remove('selected');
  umSetSpinner(false);

  document.getElementById('um-steps').style.display = 'flex';
  umShowStep(1);
  umFooter('um-btn-cancel','um-btn-build');
  umLoadZoneStatus();
}

// ── Step 1: Build RawData via the dataupdater tool ─────────────────────────

function umBuildModeChange(radio){
  UM.buildMode = radio.value;
  ['um-bmode-fill','um-bmode-force'].forEach(id=>{
    const el = document.getElementById(id);
    if(el) el.classList.toggle('selected', el.querySelector('input').value === UM.buildMode);
  });
}

async function umLoadZoneStatus(){
  const wrap = document.getElementById('um-zone-status');
  wrap.innerHTML = '';
  try{
    const data = await fetchJsonSafe(`${API}/api/upload/zone-files`,{label:'/api/upload/zone-files'});
    (data.files||[]).forEach(f=>{
      const ok = f.exists;
      const pill = document.createElement('div');
      pill.style.cssText = `display:inline-flex;align-items:center;gap:5px;padding:4px 9px;border-radius:6px;font-size:11px;font-weight:600;`
        + (ok ? 'background:#ecfdf5;color:#047857;' : 'background:#fef2f2;color:#b91c1c;');
      const dot = ok
        ? '<svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M3 8l3.5 3.5L13 5" stroke="#047857" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'
        : '<svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M3 3l10 10M13 3L3 13" stroke="#b91c1c" stroke-width="1.8" stroke-linecap="round"/></svg>';
      pill.innerHTML = DOMPurify.sanitize(`${dot}<span>${f.zone}</span>`);
      wrap.appendChild(pill);
    });
    const buildBtn = document.getElementById('um-btn-build');
    if(buildBtn) buildBtn.disabled = !data.all_present;
    if(!data.all_present){
      const warn = document.createElement('div');
      warn.style.cssText = 'flex-basis:100%;font-size:11px;color:#b91c1c;font-weight:600;margin-top:4px';
      warn.textContent = `Missing zone file(s): ${(data.missing||[]).join(', ')} — place them in the dataupdater folder.`;
      wrap.appendChild(warn);
    }
  }catch(err){
    wrap.innerHTML = DOMPurify.sanitize('<span style="font-size:11px;color:var(--ds-text-muted)">Could not check zone files.</span>');
  }
}

async function umBuildRawData(){
  umBuildSpinner(true);
  document.getElementById('um-build-label').textContent = 'Building…';
  umShowProgress('Reading zone workbooks…', 30);
  try{
    umShowProgress('Running smart-diff update…', 65);
    const data = await fetchJsonSafe(`${API}/api/upload/build-rawdata`,{
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ force: UM.buildMode==='force', test: false }),
      label:'/api/upload/build-rawdata',
    });
    umShowProgress('Build complete', 100);
    await new Promise(r=>setTimeout(r,350));
    umHideProgress();
    umBuildSpinner(false);
    umRenderBuildResult(data);
  }catch(err){
    umHideProgress();
    umBuildSpinner(false);
    document.getElementById('um-build-label').textContent = 'Build RawData';
    const list = document.getElementById('um-build-issues');
    document.getElementById('um-build-result').style.display = 'block';
    list.innerHTML = '';
    umAddIssuePill(list,'err', err.message || 'Build failed — check the zone files and try again.');
  }
}

function umRenderBuildResult(data){
  UM.built = !!data.ok;
  const s = data.summary || {};
  document.getElementById('um-build-result').style.display = 'block';
  document.getElementById('um-bstat-files').textContent   = s.source_files_read ?? '—';
  document.getElementById('um-bstat-filled').textContent  = s.rows_updated ?? 0;
  document.getElementById('um-bstat-added').textContent   = s.rows_added ?? 0;
  document.getElementById('um-bstat-skipped').textContent = s.skipped_already_complete ?? 0;
  document.getElementById('um-bstat-err').textContent     = s.errors ?? 0;

  const list = document.getElementById('um-build-issues');
  list.innerHTML = '';
  const changed = data.records_changed ?? 0;
  if(!data.ok){
    umAddIssuePill(list,'err',`Build finished with errors (exit code ${data.exit_code}). Review and retry before importing.`);
  } else if(changed > 0){
    umAddIssuePill(list,'ok',`${changed} record(s) updated in ${data.output_file}. Ready to import.`);
  } else {
    umAddIssuePill(list,'ok',`RawData is already up to date — no new records to fill. You can still continue to import.`);
  }
  if((s.skipped_empty_source ?? 0) > 0){
    umAddIssuePill(list,'warn',`${s.skipped_empty_source} source month-record(s) had no data and were skipped.`);
  }

  document.getElementById('um-build-label').textContent = 'Rebuild';
  umFooter('um-btn-cancel','um-btn-build', ...(data.ok ? ['um-btn-continue'] : []));
}

function umBuildSpinner(on){
  document.getElementById('um-spinner-build').style.display = on ? 'block' : 'none';
  const b = document.getElementById('um-btn-build'); if(b) b.disabled = on;
}

// ── Step 1 → Step 2 hand-off ───────────────────────────────────────────────

async function umContinueToImport(){
  document.getElementById('um-spinner-continue').style.display = 'block';
  document.getElementById('um-btn-continue').disabled = true;
  document.getElementById('um-continue-label').textContent = 'Validating…';
  umShowProgress('Validating generated RawData…', 60);
  try{
    const data = await fetchJsonSafe(`${API}/api/upload/preview-generated`,{
      method:'POST', label:'/api/upload/preview-generated',
    });
    UM.previewToken = data.preview_token;
    umShowProgress('Validation complete', 100);
    await new Promise(r=>setTimeout(r,300));
    umHideProgress();
    document.getElementById('um-spinner-continue').style.display = 'none';
    document.getElementById('um-btn-continue').disabled = false;
    document.getElementById('um-continue-label').textContent = 'Continue to Import →';
    umShowStep(2);
    umRenderPreview(data);
  }catch(err){
    umHideProgress();
    document.getElementById('um-spinner-continue').style.display = 'none';
    document.getElementById('um-btn-continue').disabled = false;
    document.getElementById('um-continue-label').textContent = 'Continue to Import →';
    const list = document.getElementById('um-build-issues');
    list.innerHTML = '';
    umAddIssuePill(list,'err', err.message || 'Could not validate the generated file.');
  }
}

function umBackToBuild(){
  UM.file = null; UM.previewToken = null;
  document.getElementById('um-file-input').value = '';
  document.getElementById('um-drop-zone').classList.remove('has-file','error-state','drag-over');
  umShowStep(1);
  umFooter('um-btn-cancel','um-btn-build', ...(UM.built ? ['um-btn-continue'] : []));
}

// ── Phase 1: Upload & validate ─────────────────────────────────────────

async function umUploadAndPreview(){
  if(!UM.file) return;
  umSetSpinner(true, 'upload');
  umShowProgress('Uploading & validating…', 25);

  const fd = new FormData();
  fd.append('file', UM.file);

  try{
    umShowProgress('Processing results…', 70);
    const data = await fetchJsonSafe(`${API}/api/upload/preview`,{method:'POST',body:fd,label:'/api/upload/preview'});

    UM.previewToken = data.preview_token;
    umShowProgress('Validation complete', 100);
    await new Promise(r=>setTimeout(r,400));
    umHideProgress();
    umRenderPreview(data);
    umSetSpinner(false);

  }catch(err){
    umHideProgress();
    umSetSpinner(false);
    umShowIssue('err', err.message || 'Upload failed — check your connection and try again.');
    document.getElementById('um-drop-zone').classList.add('error-state');
  }
}

// ── Phase 2: Commit ────────────────────────────────────────────────────

async function umCommit(){
  if(!UM.previewToken) return;
  umSetSpinner(true,'commit');
  document.getElementById('um-commit-label').textContent = 'Importing…';
  umShowProgress('Writing records to database…', 40);

  // For "clear" mode, send "replace" with a flag — backend handles delete+insert
  const effectiveMode = UM.mode === 'clear' ? 'replace' : UM.mode;

  try{
    umShowProgress('Finalising…', 90);
    const data = await fetchJsonSafe(`${API}/api/upload/commit`,{method:'POST',headers:{ 'Content-Type': 'application/json' },body:JSON.stringify({
        preview_token: UM.previewToken,
        global_conflict_mode: effectiveMode,
        conflict_resolutions: {},
      }),label:'/api/upload/commit'});

    umShowProgress('Done!', 100);
    await new Promise(r=>setTimeout(r,350));
    umHideProgress();
    umRenderResult(data);
    UM.justCommitted = true;
    umSetSpinner(false);

  }catch(err){
    umHideProgress();
    umSetSpinner(false);
    umRenderResultError(err.message);
  }
}

// ── Preview rendering ──────────────────────────────────────────────────

function umRenderPreview(data){
  document.getElementById('um-preview').style.display = 'block';
  document.getElementById('um-btn-upload').disabled = false;
  document.getElementById('um-spinner').style.display = 'none';
  document.getElementById('um-btn-commit').disabled = false;
  document.getElementById('um-spinner-commit').style.display = 'none';
  document.getElementById('um-commit-label').textContent = 'Confirm Import';

  // Stats
  document.getElementById('um-stat-total').textContent    = data.total_rows ?? '—';
  document.getElementById('um-stat-ok').textContent       = data.importable_count ?? '—';
  document.getElementById('um-stat-warn').textContent     = data.warning_count ?? '—';
  document.getElementById('um-stat-conflict').textContent = data.conflict_count ?? '—';
  document.getElementById('um-stat-err').textContent      = data.error_count ?? '—';

  // Period label
  const pm = data.period_month, py = data.period_year;
  const periodTxt = pm && py
    ? `${UM.monthNames[(pm-1)%12]} ${py}`
    : '';
  document.getElementById('um-preview-period').textContent = periodTxt;

  // Issues summary
  const list = document.getElementById('um-issues-list');
  list.innerHTML = '';

  if((data.error_count ?? 0) > 0){
    umAddIssuePill(list,'err',`${data.error_count} row(s) have errors and will be excluded from the import.`);
  }
  if((data.conflict_count ?? 0) > 0){
    const modeLabel = UM.mode==='skip' ? 'skipped (keeping existing)' : UM.mode==='clear' ? 'replaced (full re-import)' : 'overwritten';
    umAddIssuePill(list,'warn',`${data.conflict_count} existing record(s) conflict — will be ${modeLabel}.`);
  }
  if((data.warning_count ?? 0) > 0){
    umAddIssuePill(list,'warn',`${data.warning_count} row(s) have anomaly warnings — review data before confirming.`);
  }
  if((data.unrecognised_columns?.length ?? 0) > 0){
    umAddIssuePill(list,'warn',`${data.unrecognised_columns.length} columns in the file are not mapped to the database (computed or sub-totals — this is expected).`);
  }
  if((data.importable_count ?? 0) > 0 && (data.error_count ?? 0) === 0){
    umAddIssuePill(list,'ok',`${data.importable_count} row(s) passed validation and are ready to import.`);
  }

  // Show commit / abort buttons
  if((data.importable_count ?? 0) > 0){
    document.getElementById('um-commit-label').textContent = 'Confirm Import';
    document.getElementById('um-btn-cancel').textContent = 'Discard';
    umFooter('um-btn-back','um-btn-cancel','um-btn-commit');
  } else {
    document.getElementById('um-btn-cancel').textContent = 'Close';
    umFooter('um-btn-back','um-btn-cancel');
  }
}

function umAddIssuePill(container, type, msg){
  const icon = type==='ok'
    ? '<svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M3 8l3.5 3.5L13 5" stroke="#16a34a" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>'
    : type==='err'
    ? '<svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M8 5v4m0 2v1" stroke="#DC2626" stroke-width="1.6" stroke-linecap="round"/><circle cx="8" cy="8" r="6.5" stroke="#DC2626" stroke-width="1.3"/></svg>'
    : '<svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M8 6v3m0 2v.5" stroke="#D97706" stroke-width="1.6" stroke-linecap="round"/><path d="M7.1 2.5L1.5 12a1 1 0 00.9 1.5h11.2a1 1 0 00.9-1.5L9 2.5a1 1 0 00-1.8 0z" stroke="#D97706" stroke-width="1.3"/></svg>';
  const div = document.createElement('div');
  div.className = `um-issue-pill ${type}`;
  div.innerHTML = DOMPurify.sanitize(`<span style="flex-shrink:0;margin-top:1px">${icon}</span><span>${msg}</span>`);
  container.appendChild(div);
}

// ── Result rendering ───────────────────────────────────────────────────

function umRenderResult(data){
  document.getElementById('um-steps').style.display       = 'none';
  document.getElementById('um-stage-build').style.display = 'none';
  document.getElementById('um-stage-pick').style.display  = 'none';
  document.getElementById('um-preview').style.display     = 'none';
  document.getElementById('um-result').style.display      = 'block';
  umFooter('um-btn-done');

  const icon = document.getElementById('um-result-icon');
  icon.className = 'um-result-icon success';
  document.getElementById('um-result-svg').innerHTML = DOMPurify.sanitize('<path d="M8 16l5 5 10-10" stroke="#16a34a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>');

  document.getElementById('um-result-title').textContent = 'Import complete';

  const pm = data.period_month, py = data.period_year;
  document.getElementById('um-result-period').textContent =
    pm && py ? `${UM.monthNames[(pm-1)%12]} ${py} · ${data.filename||''}` : (data.filename||'');

  const counts = document.getElementById('um-result-counts');
  counts.innerHTML = '';
  const chips = [
    [data.rows_inserted, 'ins', 'Inserted'],
    [data.rows_replaced, 'rep', 'Updated'],
    [data.rows_skipped,  'skip','Skipped'],
    [data.rows_errored,  'err', 'Errors'],
  ];
  chips.forEach(([n,cls,lbl])=>{
    if(n > 0){
      const c = document.createElement('div');
      c.className = `um-result-chip ${cls}`;
      c.textContent = `${n} ${lbl}`;
      counts.appendChild(c);
    }
  });
}

function umRenderResultError(msg){
  document.getElementById('um-steps').style.display       = 'none';
  document.getElementById('um-stage-build').style.display = 'none';
  document.getElementById('um-stage-pick').style.display  = 'none';
  document.getElementById('um-preview').style.display     = 'none';
  document.getElementById('um-result').style.display      = 'block';
  umFooter('um-btn-done');

  const icon = document.getElementById('um-result-icon');
  icon.className = 'um-result-icon error';
  document.getElementById('um-result-svg').innerHTML = DOMPurify.sanitize('<path d="M8 6v5m0 2.5v.5" stroke="#DC2626" stroke-width="2" stroke-linecap="round"/><circle cx="16" cy="16" r="14" stroke="#DC2626" stroke-width="2"/>');

  document.getElementById('um-result-title').textContent = 'Import failed — fully rolled back';
  document.getElementById('um-result-period').textContent = msg;
  document.getElementById('um-result-counts').innerHTML = '';
}

// ── Helpers ────────────────────────────────────────────────────────────

function umHidePreview(){
  document.getElementById('um-preview').style.display='none';
  document.getElementById('um-issues-list').innerHTML='';
}

function umShowIssue(type, msg){
  const list = document.getElementById('um-issues-list');
  list.innerHTML = '';
  document.getElementById('um-preview').style.display='block';
  document.getElementById('um-stat-total').textContent='—';
  document.getElementById('um-stat-ok').textContent='—';
  document.getElementById('um-stat-warn').textContent='—';
  document.getElementById('um-stat-conflict').textContent='—';
  document.getElementById('um-stat-err').textContent='—';
  document.getElementById('um-preview-period').textContent='';
  umAddIssuePill(list,type,msg);
}

function umSetSpinner(on, which='upload'){
  const spinnerId = which==='commit' ? 'um-spinner-commit' : 'um-spinner';
  const btn = which==='commit'
    ? document.getElementById('um-btn-commit')
    : document.getElementById('um-btn-upload');
  document.getElementById(spinnerId).style.display = on ? 'block' : 'none';
  if(btn) btn.disabled = on;
}

function umShowProgress(label, pct){
  const wrap = document.getElementById('um-progress');
  wrap.style.display = 'flex';
  document.getElementById('um-progress-label').textContent = label;
  document.getElementById('um-progress-fill').style.width = pct + '%';
}

function umHideProgress(){
  document.getElementById('um-progress').style.display='none';
  document.getElementById('um-progress-fill').style.width='0';
}

// Show upload button only for admin users — called from initDashboard()
function umInitAdminButton(role){
  const btn = document.getElementById('tb-upload-btn');
  if(btn) btn.classList.toggle('visible', role==='admin');
}

// Close modal on Escape key
document.addEventListener('keydown', e=>{
  if(e.key==='Escape' && document.getElementById('upload-overlay').classList.contains('open')){
    closeUploadModal();
  }
});
// Close on overlay click (outside modal)
document.getElementById('upload-overlay')?.addEventListener('click', e=>{
  if(e.target===document.getElementById('upload-overlay')) closeUploadModal();
});



/* ════════════════════════════════════════════════════════════════════════
   ADMIN PANEL — JavaScript
   ════════════════════════════════════════════════════════════════════════ */

// ── State ──────────────────────────────────────────────────────────────────
const ADM = {
  users:       [],
  editingId:   null,   // null = create mode, number = edit mode
  resetUserId: null,
};

// ── Nav & tabs ────────────────────────────────────────────────────────────

function admShowNavLink(role){
  const el = document.getElementById('nav-admin-group');
  if(!el) return;
  const isAdmin = String(role||'').toLowerCase()==='admin';
  el.style.display = isAdmin ? '' : 'none';
}

function admTab(tabName){
  document.querySelectorAll('.adm-tab').forEach(t =>
    t.classList.toggle('active', t.dataset.tab === tabName));
  ['users','profile','roles','data','uploads','activity','fy-budget','system'].forEach(t => {
    const el = document.getElementById('adm-tab-'+t);
    if(el) el.style.display = t === tabName ? '' : 'none';
  });
  if(tabName === 'users')     admLoadUsers();
  if(tabName === 'uploads')   admLoadUploads();
  if(tabName === 'activity')  admLoadActivity();
  if(tabName === 'profile')   admLoadProfile();
  if(tabName === 'system')    admLoadSystem();
  // fy-budget loaded on demand via admLoadFyBudget() called from onclick
}

/* ══════════════════════════════════════════════════════════════════════════
   FY BUDGET SETUP ADMIN  —  /api/fiscal-years
   ══════════════════════════════════════════════════════════════════════════ */

let _fyBudgetLoaded = false;

async function admLoadFyBudget(){
  if(_fyBudgetLoaded) return;
  _fyBudgetLoaded = false; // always refresh on explicit call
  await admFyRefresh();
}

async function admFyRefresh(){
  const token = getToken();
  if(!token) return;
  const grid = document.getElementById('adm-fy-grid');
  if(!grid) return;
  grid.innerHTML = DOMPurify.sanitize('<div style="color:var(--text-muted);font-size:.85rem;padding:.5rem 0">Loading…</div>');

  try{
    const fys = await fetchJsonSafe(`${API}/api/fiscal-years`,{token,fallback:[],label:'/api/fiscal-years'});
    _fyBudgetLoaded = true;

    if(!fys.length){
      grid.innerHTML= DOMPurify.sanitize('<div style="color:var(--text-muted);font-size:.85rem">No fiscal years configured. Run the seed script to initialise.</div>');
      return;
    }

    // Populate copy-from/to dropdowns
    const src = document.getElementById('adm-copy-src');
    const dst = document.getElementById('adm-copy-dst');
    if(src && dst){
      src.innerHTML= DOMPurify.sanitize('<option value="">— select source —</option>');
      dst.innerHTML= DOMPurify.sanitize('<option value="">— select target —</option>');
      fys.forEach(fy=>{
        const label=`${fy.label}${fy.has_budget?' ✓':''}`;
        src.innerHTML+= DOMPurify.sanitize(`<option value="${fy.year}">${label}</option>`);
        dst.innerHTML+= DOMPurify.sanitize(`<option value="${fy.year}">${label}</option>`);
      });
    }

    // Status badge colours
    const badge = s => {
      const map = {current:'background:#d1fae5;color:#065f46',future:'background:#dbeafe;color:#1e40af',historical:'background:#f3f4f6;color:#6b7280'};
      return `<span style="display:inline-block;padding:.15rem .5rem;border-radius:4px;font-size:.7rem;font-weight:600;${map[s]||''}">${s.toUpperCase()}</span>`;
    };

    let html = `<table style="width:100%;border-collapse:collapse;font-size:.85rem">
      <thead><tr style="border-bottom:2px solid var(--border)">
        <th style="text-align:left;padding:.5rem .75rem">FY</th>
        <th style="text-align:left;padding:.5rem .75rem">Status</th>
        <th style="text-align:left;padding:.5rem .75rem">Tariff (MK/m³)</th>
        <th style="text-align:center;padding:.5rem .75rem">Has Data</th>
        <th style="text-align:center;padding:.5rem .75rem">Budget Lines</th>
        <th style="text-align:center;padding:.5rem .75rem">Zone Shares</th>
        <th style="text-align:center;padding:.5rem .75rem">SPC Limits</th>
        <th style="text-align:left;padding:.5rem .75rem">Notes</th>
      </tr></thead><tbody>`;

    const tick = ok => ok
      ? '<span style="color:#059669;font-size:1rem">✓</span>'
      : '<span style="color:#d1d5db;font-size:1rem">—</span>';

    fys.forEach(fy=>{
      const rowBg = fy.status==='current'?'background:rgba(16,185,129,.04)':
                    fy.status==='future' ?'background:rgba(59,130,246,.04)':'';
      html+=`<tr style="border-bottom:1px solid var(--border);${rowBg}">
        <td style="padding:.5rem .75rem;font-weight:600">${fy.label}</td>
        <td style="padding:.5rem .75rem">${badge(fy.status)}</td>
        <td style="padding:.5rem .75rem">${fy.tariff_per_m3!=null?'MK '+fy.tariff_per_m3.toLocaleString():'<span style="color:var(--text-muted)">TBD</span>'}</td>
        <td style="text-align:center;padding:.5rem .75rem">${tick(fy.has_data)}</td>
        <td style="text-align:center;padding:.5rem .75rem">${fy.has_budget?`<span style="color:#059669">${fy.budget_line_count}</span>`:tick(false)}</td>
        <td style="text-align:center;padding:.5rem .75rem">${tick(fy.has_zone_shares)}</td>
        <td style="text-align:center;padding:.5rem .75rem">${tick(fy.has_spc_limits)}</td>
        <td style="padding:.5rem .75rem;color:var(--text-muted);font-size:.8rem">${fy.notes||''}</td>
      </tr>`;
    });
    html += '</tbody></table>';
    grid.innerHTML = DOMPurify.sanitize(html);

  }catch(e){
    grid.innerHTML= DOMPurify.sanitize(`<div style="color:var(--error)">Failed to load fiscal years: ${e.message}</div>`);
  }
}

async function admDoCopyBudget(){
  const token=getToken();if(!token)return;
  const src   = parseInt(document.getElementById('adm-copy-src')?.value||'0');
  const dst   = parseInt(document.getElementById('adm-copy-dst')?.value||'0');
  const pct   = parseFloat(document.getElementById('adm-copy-inflation')?.value||'0');
  const overw = document.getElementById('adm-copy-overwrite')?.checked||false;
  const res   = document.getElementById('adm-copy-result');

  if(!src||!dst){ if(res)res.innerHTML='<span style="color:var(--error)">Please select both source and target FY.</span>'; return; }
  if(src===dst){  if(res)res.innerHTML='<span style="color:var(--error)">Source and target must differ.</span>'; return; }

  if(res)res.innerHTML= DOMPurify.sanitize('<span style="color:var(--text-muted)">Copying…</span>');
  try{
    const rate = pct/100;
    const resp = await fetch(
      `${API}/api/fiscal-years/${dst}/copy-from/${src}?inflation_rate=${rate}&overwrite=${overw}`,
      {method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'}}
    );
    const data = await resp.json();
    if(!resp.ok) throw new Error(data.detail||resp.statusText);
    const infl = pct>0?` (+${pct}% inflation on MWK values)`:'';
    res.innerHTML= DOMPurify.sanitize(`<span style="color:#059669">✓ Copied from FY${src-1}/${String(src).slice(-2)} → FY${dst-1}/${String(dst).slice(-2)}${infl}: `+
      `${data.copied.budget_lines} budget lines, ${data.copied.zone_shares} zone shares, ${data.copied.spc_limits} SPC limits`+
      `${data.skipped_budget_lines?' ('+data.skipped_budget_lines+' skipped — already existed)':''}</span>`);
    _fyBudgetLoaded=false;
    await admFyRefresh();
    // Refresh the global FY selector so the new data shows
    dbState.fyMeta=[];
    const fyList=await fetchJsonSafe(`${API}/api/catalogue/fiscal-years`,{token,fallback:[],label:'/api/catalogue/fiscal-years'});
    dbState.fyMeta=fyList;
  }catch(e){
    if(res)res.innerHTML= DOMPurify.sanitize(`<span style="color:var(--error)">Copy failed: ${e.message}</span>`);
  }
}

// ── Load admin page ────────────────────────────────────────────────────────

async function loadAdmin(){
  // Ensure first tab is shown and data loaded
  admTab('users');
}

// ── User Management ────────────────────────────────────────────────────────

async function admLoadUsers(){
  const token = getToken();
  if(!token) return;
  try{
    const users = await fetchJsonSafe(`${API}/api/admin/users`,{token,fallback:[],label:'/api/admin/users'});
    ADM.users = users;
    admRenderUsers(users);
    admUpdateStats(users);
  }catch(e){
    document.getElementById('adm-user-tbody').innerHTML = DOMPurify.sanitize(
      `<tr><td colspan="6" class="adm-err">Failed to load users: ${e.message}</td></tr>`);
  }
}

function admUpdateStats(users){
  const active   = users.filter(u=>u.is_active).length;
  const admins   = users.filter(u=>u.role==='admin').length;
  const inactive = users.filter(u=>!u.is_active).length;
  document.getElementById('adm-stat-total').textContent    = users.length;
  document.getElementById('adm-stat-active').textContent   = active;
  document.getElementById('adm-stat-admins').textContent   = admins;
  document.getElementById('adm-stat-inactive').textContent = inactive;
}

function admRenderUsers(users){
  const me = getUser();
  const tbody = document.getElementById('adm-user-tbody');
  if(!users.length){
    tbody.innerHTML = DOMPurify.sanitize('<tr><td colspan="6" class="adm-empty">No users found</td></tr>');
    return;
  }
  tbody.innerHTML = sanitizeRows(users.map(u => {
    const roleCls = {'admin':'admin','user':'user','viewer':'viewer'}[u.role]||'viewer';
    const isSelf  = me && u.username === me.username;
    const created = u.created_at ? new Date(u.created_at).toLocaleDateString('en-GB',
      {day:'numeric',month:'short',year:'numeric'}) : '—';
    const lastLogin = u.last_login
      ? new Date(u.last_login+'Z').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})
      : '<em style="color:var(--ds-text-muted)">Never</em>';
    const initials = (u.full_name||u.username)[0].toUpperCase();

    return `<tr>
      <td>
        <div class="adm-user-cell">
          <div class="adm-user-av">${initials}</div>
          <div class="adm-user-info">
            <div class="adm-user-name">${u.username}${isSelf?' <span class="adm-you-tag">you</span>':''}</div>
            <div class="adm-user-fullname">${u.full_name||'<em>—</em>'}</div>
          </div>
        </div>
      </td>
      <td><span class="role-badge ${roleCls}">${u.role}</span></td>
      <td>
        <span class="status-dot ${u.is_active?'active':'inactive'}"></span>
        <span style="font-size:12px">${u.is_active?'Active':'Inactive'}</span>
      </td>
      <td class="adm-td-meta">${lastLogin}</td>
      <td class="adm-td-meta">${created}</td>
      <td>
        <div class="adm-act-row">
          <button class="adm-act-btn edit" onclick="admOpenEditUser(${u.id})" title="Edit user">Edit</button>
          <button class="adm-act-btn reset" onclick="admOpenReset(${u.id},'${u.username}')" title="Reset password">Reset PW</button>
          <button class="adm-act-btn ${u.is_active?'warn':'edit'}"
            onclick="admToggleActive(${u.id},${u.is_active})"
            ${isSelf?'disabled title="Cannot deactivate yourself"':'title="'+(u.is_active?'Deactivate':'Activate')+' user"'}>
            ${u.is_active?'Deactivate':'Activate'}
          </button>
          <button class="adm-act-btn danger"
            onclick="admDeleteUser(${u.id},'${u.username}')"
            ${isSelf?'disabled title="Cannot delete yourself"':'title="Delete user"'}>
            Delete
          </button>
        </div>
      </td>
    </tr>`;
  }).join(''));
}

// ── Create user modal ──────────────────────────────────────────────────────

function admOpenCreateUser(){
  ADM.editingId = null;
  document.getElementById('adm-modal-title').textContent = 'Add User';
  document.getElementById('adm-modal-save-lbl').textContent = 'Create User';
  document.getElementById('adm-f-username').value = '';
  document.getElementById('adm-f-full-name').value = '';
  document.getElementById('adm-f-password').value = '';
  document.getElementById('adm-f-role').value = 'user';
  document.getElementById('adm-f-username').disabled = false;
  document.getElementById('adm-pw-field').style.display = '';
  document.getElementById('adm-modal-err').style.display = 'none';
  document.getElementById('adm-user-modal').classList.add('open');
}

function admOpenEditUser(userId){
  const user = ADM.users.find(u=>u.id===userId);
  if(!user) return;
  ADM.editingId = userId;
  document.getElementById('adm-modal-title').textContent = `Edit User — ${user.username}`;
  document.getElementById('adm-modal-save-lbl').textContent = 'Save Changes';
  document.getElementById('adm-f-username').value = user.username;
  document.getElementById('adm-f-full-name').value = user.full_name || '';
  document.getElementById('adm-f-username').disabled = true;
  document.getElementById('adm-f-role').value = user.role;
  document.getElementById('adm-pw-field').style.display = 'none';
  document.getElementById('adm-modal-err').style.display = 'none';
  document.getElementById('adm-user-modal').classList.add('open');
}

function admCloseUserModal(){
  document.getElementById('adm-user-modal').classList.remove('open');
}

async function admSaveUser(){
  const token = getToken();
  const errEl = document.getElementById('adm-modal-err');
  errEl.style.display = 'none';

  if(ADM.editingId === null){
    // Create
    const username  = document.getElementById('adm-f-username').value.trim();
    const full_name = document.getElementById('adm-f-full-name').value.trim() || null;
    const password  = document.getElementById('adm-f-password').value;
    const role      = document.getElementById('adm-f-role').value;
    if(!username||!password){ errEl.textContent='Username and password are required.'; errEl.style.display=''; return; }
    if(password.length < 8){ errEl.textContent='Password must be at least 8 characters.'; errEl.style.display=''; return; }
    try{
      await fetchJsonSafe(`${API}/api/admin/users`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,full_name,password,role}),label:'/api/admin/users'});
      admCloseUserModal(); admLoadUsers();
    }catch(e){ errEl.textContent=e.message; errEl.style.display=''; }
  } else {
    // Update role + full_name
    const role      = document.getElementById('adm-f-role').value;
    const full_name = document.getElementById('adm-f-full-name').value.trim() || null;
    try{
      await fetchJsonSafe(`${API}/api/admin/users/${ADM.editingId}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({role,full_name}),label:`/api/admin/users/${ADM.editingId}`});
      admCloseUserModal(); admLoadUsers();
    }catch(e){ errEl.textContent=e.message; errEl.style.display=''; }
  }
}

// ── Toggle active status ──────────────────────────────────────────────────

async function admToggleActive(userId, currentlyActive){
  const token = getToken();
  const action = currentlyActive ? 'Deactivate' : 'Activate';
  if(!confirm(`${action} this user account?`)) return;
  try{
    await fetch(`${API}/api/admin/users/${userId}`,{
      method:'PUT', headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
      body:JSON.stringify({is_active:!currentlyActive})
    });
    admLoadUsers();
  }catch(e){ alert('Error: '+e.message); }
}

// ── Delete user ───────────────────────────────────────────────────────────

async function admDeleteUser(userId, username){
  if(!confirm(`Permanently delete user "${username}"? This cannot be undone.`)) return;
  const token = getToken();
  try{
    const resp = await fetch(`${API}/api/admin/users/${userId}`,{
      method:'DELETE', headers:{Authorization:'Bearer '+token}
    });
    if(!resp.ok){ const d=await fetchJsonSafe(`${API}/api/admin/users/${userId}`,{method:'DELETE',label:`/api/admin/users/${userId}`}).catch(e=>({detail:e.message})); alert(d.detail||'Delete failed.'); return; }
    admLoadUsers();
  }catch(e){ alert('Error: '+e.message); }
}

// ── Reset password ────────────────────────────────────────────────────────

function admOpenReset(userId, username){
  ADM.resetUserId = userId;
  document.getElementById('adm-reset-username').textContent = username;
  document.getElementById('adm-reset-pw').value = '';
  document.getElementById('adm-reset-err').style.display = 'none';
  document.getElementById('adm-reset-modal').classList.add('open');
}

function admCloseResetModal(){
  document.getElementById('adm-reset-modal').classList.remove('open');
}

async function admDoReset(){
  const token    = getToken();
  const password = document.getElementById('adm-reset-pw').value;
  const errEl    = document.getElementById('adm-reset-err');
  errEl.style.display = 'none';
  if(password.length < 8){ errEl.textContent='Password must be at least 8 characters.'; errEl.style.display=''; return; }
  try{
    const resp = await fetch(`${API}/api/admin/users/${ADM.resetUserId}/reset-password`,{
      method:'POST', headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
      body:JSON.stringify({new_password:password})
    });
    if(!resp.ok){ const d=await fetchJsonSafe(`${API}/api/admin/users/${ADM.resetUserId}/reset-password`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({new_password:password}),label:`/api/admin/users/${ADM.resetUserId}/reset-password`}).catch(e=>({detail:e.message})); errEl.textContent=d.detail||'Reset failed.'; errEl.style.display=''; return; }
    admCloseResetModal();
    alert('Password reset successfully. The user will need their new password on next login.');
  }catch(e){ errEl.textContent=e.message; errEl.style.display=''; }
}

// ── Upload History ────────────────────────────────────────────────────────

async function admLoadUploads(){
  const token = getToken();
  try{
    const data = await fetchJsonSafe(`${API}/api/upload/history`,{token,fallback:{uploads:[]},label:'/api/upload/history'});
    const tbody = document.getElementById('adm-upload-tbody');
    const uploads = data.uploads||[];
    if(!uploads.length){
      tbody.innerHTML= DOMPurify.sanitize('<tr><td colspan="9" class="adm-empty">No upload history yet</td></tr>'); return;
    }
    const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    tbody.innerHTML = sanitizeRows(uploads.map(u=>{
      const dt = new Date(u.uploaded_at+'Z');
      const period = u.period_month && u.period_year
        ? MONTHS[(u.period_month-1)%12]+' '+u.period_year : '—';
      return `<tr>
        <td style="color:var(--ds-text-muted);font-size:11px">#${u.id}</td>
        <td style="font-size:11px">${dt.toLocaleString('en-GB',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}</td>
        <td><strong>${u.uploaded_by}</strong></td>
        <td style="font-size:11px;color:var(--ds-text-muted)">${u.filename||'—'}</td>
        <td><span class="role-badge user">${period}</span></td>
        <td style="text-align:right;color:var(--ds-green);font-weight:700">${u.rows_inserted}</td>
        <td style="text-align:right;color:var(--ds-blue);font-weight:700">${u.rows_replaced}</td>
        <td style="text-align:right;color:var(--ds-amber);font-weight:700">${u.rows_skipped}</td>
        <td style="text-align:right;color:${u.rows_errored>0?'var(--ds-red)':'var(--ds-text-muted)'};font-weight:700">${u.rows_errored}</td>
      </tr>`;
    }).join(''));
  }catch(e){
    document.getElementById('adm-upload-tbody').innerHTML= DOMPurify.sanitize(
      `<tr><td colspan="9" class="adm-err">Failed to load history: ${e.message}</td></tr>`);
  }
}

// ── System Info ───────────────────────────────────────────────────────────

async function admLoadSystem(){
  const token = getToken();
  const me = getUser();
  if(me){
    const eu = document.getElementById('sys-user');
    const er = document.getElementById('sys-role');
    if(eu) eu.textContent = me.username;
    if(er) er.textContent = me.role;
  }
  try{
    const d = await fetchJsonSafe(`${API}/api/admin/system`,{token,fallback:null,label:'/api/admin/system'});
    if(!d) return;
    const g = id=>document.getElementById(id);
    if(g('sys-db-size'))    g('sys-db-size').textContent    = (d.database.size_mb||0)+' MB';
    if(g('sys-records'))    g('sys-records').textContent    = (d.database.records||0).toLocaleString();
    if(g('sys-zones'))      g('sys-zones').textContent      = d.database.zones||'—';
    if(g('sys-schemes'))    g('sys-schemes').textContent    = d.database.schemes||'—';
    if(g('sys-uploads'))    g('sys-uploads').textContent    = d.uploads?.total_uploads||0;
    if(g('sys-last-upload')){
      const lu = d.uploads?.last_upload;
      g('sys-last-upload').textContent = lu
        ? lu.by+' ('+new Date(lu.at+'Z').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})+')'
        : 'No uploads yet';
    }
  }catch(e){ console.warn('admLoadSystem:',e.message); }
}

// ── Activity Log ──────────────────────────────────────────────────────────

const ACTION_LABELS = {
  login:           {icon:'🔐',cls:'green', label:'Login'},
  login_failed:    {icon:'⚠️',cls:'amber', label:'Failed Login'},
  user_created:    {icon:'➕',cls:'blue',  label:'User Created'},
  role_changed:    {icon:'🔄',cls:'blue',  label:'Role Changed'},
  user_deactivated:{icon:'🔒',cls:'amber', label:'Deactivated'},
  user_activated:  {icon:'✅',cls:'green', label:'Activated'},
  user_deleted:    {icon:'🗑️',cls:'red',  label:'Deleted'},
  password_reset:  {icon:'🔑',cls:'amber', label:'Password Reset'},
};

async function admLoadActivity(){
  const token = getToken(); if(!token) return;
  const tbody = document.getElementById('adm-activity-tbody'); if(!tbody) return;
  tbody.innerHTML= DOMPurify.sanitize('<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--ds-text-muted)">Loading…</td></tr>');
  try{
    const rows = await fetchJsonSafe(`${API}/api/admin/activity?limit=100`,{token,fallback:[],label:'/api/admin/activity?limit=100'});
    if(!rows.length){
      tbody.innerHTML= DOMPurify.sanitize('<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--ds-text-muted)">No activity recorded yet</td></tr>');
      return;
    }
    const clrMap={green:'color:var(--ds-green)',amber:'color:var(--ds-amber)',red:'color:var(--ds-red)',blue:'color:var(--ds-blue)'};
    tbody.innerHTML= sanitizeRows(rows.map(r=>{
      const meta=ACTION_LABELS[r.action]||{icon:'•',cls:'',label:r.action};
      const dt=r.logged_at?new Date(r.logged_at+'Z').toLocaleString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'—';
      return `<tr>
        <td style="color:var(--ds-text-muted);font-size:12px;white-space:nowrap">${dt}</td>
        <td><div style="display:flex;align-items:center;gap:6px">
          <div style="width:26px;height:26px;border-radius:50%;background:linear-gradient(135deg,var(--ds-blue),var(--ds-teal));display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff;flex-shrink:0">${(r.username||'?')[0].toUpperCase()}</div>
          <span style="font-size:13px;font-weight:600">${r.username||'—'}</span>
        </div></td>
        <td><span style="${clrMap[meta.cls]||''};font-weight:600;font-size:12px">${meta.icon} ${meta.label}</span></td>
        <td style="font-size:12px;color:var(--ds-text-secondary)">${r.detail||'—'}</td>
        <td style="font-size:11px;color:var(--ds-text-muted);font-family:var(--ds-mono)">${r.ip_address||'—'}</td>
      </tr>`;
    }).join(''));
  }catch(e){
    tbody.innerHTML= DOMPurify.sanitize(`<tr><td colspan="5" style="color:var(--ds-red);padding:20px;text-align:center">Error: ${e.message}</td></tr>`);
  }
}

// ── Role-based UI enforcement ─────────────────────────────────────────────
function enforceRoleUI(role){
  const normalizedRole = normalizeRole(role);
  const isAdmin  = normalizedRole==='admin';
  const isViewer = normalizedRole==='viewer';
  // Admin panel nav
  const adminGroup=document.getElementById('nav-admin-group');
  if(adminGroup) adminGroup.style.display = isAdmin ? '' : 'none';
  document.querySelectorAll('.nav-item[data-page="reports"]').forEach(el=>{
    el.style.display = isAdmin ? '' : 'none';
  });
  document.querySelectorAll('.nav-item[data-page="compliance"]').forEach(el=>{
    el.style.display = isAdmin ? '' : 'none';
  });
  document.querySelectorAll('[data-admin-only="reports"]').forEach(el=>{
    el.style.display = isAdmin ? '' : 'none';
  });
  document.querySelectorAll('[data-admin-only="compliance"]').forEach(el=>{
    el.style.display = isAdmin ? '' : 'none';
  });
  document.querySelectorAll('[onclick*="navigate(\'reports\')"]').forEach(el=>{
    el.style.display = isAdmin ? '' : 'none';
  });
  document.querySelectorAll('[onclick*="navigate(\'compliance\')"]').forEach(el=>{
    el.style.display = isAdmin ? '' : 'none';
  });
  // Upload button
  const uploadBtn=document.getElementById('tb-upload-btn');
  if(uploadBtn) uploadBtn.classList.toggle('visible',isAdmin);
  // Admin-only utility blocks
  document.querySelectorAll('[data-admin-only]').forEach(el=>{
    el.style.display = isAdmin ? '' : 'none';
  });
  // Export buttons — hide for viewers
  if(isViewer){
    document.querySelectorAll('[data-role="export"],[data-export]').forEach(el=>{
      el.style.display='none';
    });
  }
  if(!isAdmin && ['reports','compliance'].includes(currentPage)){
    navigate(getRoleHomePage(normalizedRole),{forceRoleHome:true});
  }
}


// ── My Profile tab ───────────────────────────────────────────────────────

function admLoadProfile(){
  const u = getUser();
  if(!u) return;
  const av = document.getElementById('profile-avatar');
  const nm = document.getElementById('profile-username');
  const rb = document.getElementById('profile-role-badge');
  if(av) av.textContent = u.username[0].toUpperCase();
  if(nm) nm.textContent = u.username;
  if(rb){
    const roleCls = {'admin':'admin','user':'user','viewer':'viewer'}[u.role]||'viewer';
    rb.innerHTML = DOMPurify.sanitize('<span class="role-badge '+roleCls+'">'+u.role+'</span>');
  }
  ['profile-cur-pw','profile-new-pw','profile-conf-pw'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.value='';
  });
  const msg=document.getElementById('profile-msg');
  if(msg) msg.style.display='none';
}

async function admChangeOwnPassword(){
  const token = getToken();
  const g = id=>document.getElementById(id)?.value||'';
  const curPw=g('profile-cur-pw'), newPw=g('profile-new-pw'), confPw=g('profile-conf-pw');
  const msg = document.getElementById('profile-msg');
  const showMsg=(text,ok)=>{
    if(!msg) return;
    msg.textContent=text; msg.style.display='';
    msg.style.background=ok?'var(--ds-green-bg)':'var(--ds-red-bg)';
    msg.style.border=ok?'1px solid var(--ds-green-border)':'1px solid var(--ds-red-border)';
    msg.style.color=ok?'var(--ds-green)':'var(--ds-red)';
  };
  if(!curPw||!newPw||!confPw){showMsg('All three fields are required.',false);return;}
  if(newPw.length<8){showMsg('New password must be at least 8 characters.',false);return;}
  if(newPw!==confPw){showMsg('New passwords do not match.',false);return;}
  try{
    const resp=await fetch(API+'/api/auth/change-password',{
      method:'POST',
      headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
      body:JSON.stringify({current_password:curPw,new_password:newPw}),
    });
    if(resp.ok||resp.status===204){
      showMsg('Password updated successfully.',true);
      ['profile-cur-pw','profile-new-pw','profile-conf-pw'].forEach(id=>{
        const el=document.getElementById(id);if(el)el.value='';
      });
    } else {
      const d=await (async()=>{const t=await resp.text();try{return t?JSON.parse(t):{};}catch{return {detail:t};}})();
      showMsg(d.detail||'Failed to update password.',false);
    }
  }catch(e){showMsg('Network error: '+e.message,false);}
}

// Close modals on overlay click
document.getElementById('adm-user-modal')?.addEventListener('click',e=>{
  if(e.target===document.getElementById('adm-user-modal')) admCloseUserModal();
});
document.getElementById('adm-reset-modal')?.addEventListener('click',e=>{
  if(e.target===document.getElementById('adm-reset-modal')) admCloseResetModal();
});

/* ════════════════════════════════════════════════════════════════════════
   AI NARRATIVE ENGINE — client-side
   ════════════════════════════════════════════════════════════════════════ */

let narrativeLoaded = false;

async function loadNarrative(force=false){
  if(!force && narrativeLoaded) return;
  const token = getToken();
  if(!token) return;

  const body  = document.getElementById('ov-nar-body');
  const meta  = document.getElementById('ov-nar-meta');
  const model = document.getElementById('ov-nar-model');
  if(!body) return;

  body.className = 'ai-nar-body loading';
  body.innerHTML = DOMPurify.sanitize('<div class="spin-sm" style="border-top-color:#7c3aed"></div>Generating AI summary…');
  if(meta) meta.textContent = '';

  try{
    const year = dbState.year || new Date().getFullYear();
    const resp = await fetch(`${API}/api/insights/narrative?year=${year}`, {
      headers:{Authorization:'Bearer '+token}
    });
    const data = resp.ok ? await fetchJsonSafe(`${API}/api/insights/narrative?year=${year}`,{token,label:`/api/insights/narrative?year=${year}`}) : null;

    if(!data || data.error){
      const errMsg = data?.error || `Server error ${resp.status}`;
      body.className = 'ai-nar-body error';
      if(errMsg.includes('groq') || errMsg.includes('key') || errMsg.includes('installed')){
        body.innerHTML = DOMPurify.sanitize('⚠ Groq not configured — create <code>data/groq.key</code> and run <code>pip install groq</code>');
      } else if(errMsg.includes('Connection')){
        body.innerHTML = DOMPurify.sanitize('⚠ Could not reach Groq API — check your internet connection and that <code>pip install groq</code> has been run.');
      } else {
        body.innerHTML = DOMPurify.sanitize('⚠ ' + errMsg);
      }
      return;
    }

    narrativeLoaded = true;
    body.className = 'ai-nar-body';
    body.textContent = data.narrative;

    const now = new Date();
    if(meta) meta.textContent = (data.fiscal_year||'') + ' · ' +
      now.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});
    // model attribution hidden by user preference

  }catch(e){
    body.className = 'ai-nar-body error';
    body.innerHTML = DOMPurify.sanitize('⚠ Connection error: ' + e.message);
  }
}

/* ════════════════════════════════════════════════════════════════════════
   ANOMALY ALERT ENGINE — client-side
   ════════════════════════════════════════════════════════════════════════ */

let alertDrawerOpen = false;
let alertsLoaded    = false;

const CAT_LABELS = {nrw:'NRW', financial:'Financial', operations:'Operations', service:'Service'};
const SEV_ICONS  = {
  critical:'<svg width="13" height="13" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6.5" stroke="#DC2626" stroke-width="1.3"/><path d="M8 5v3.5M8 10.5v.5" stroke="#DC2626" stroke-width="1.5" stroke-linecap="round"/></svg>',
  warning: '<svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M7 2.5L1.3 12.5a1 1 0 00.9 1.5h11.6a1 1 0 00.9-1.5L9 2.5a1.1 1.1 0 00-2 0z" stroke="#D97706" stroke-width="1.3"/><path d="M8 6v3.5M8 11v.5" stroke="#D97706" stroke-width="1.5" stroke-linecap="round"/></svg>',
  info:    '<svg width="13" height="13" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6.5" stroke="#16a34a" stroke-width="1.3"/><path d="M8 7v4M8 5.5v.5" stroke="#16a34a" stroke-width="1.5" stroke-linecap="round"/></svg>',
};

function toggleAlertDrawer(){
  alertDrawerOpen = !alertDrawerOpen;
  document.getElementById('alert-drawer').classList.toggle('open', alertDrawerOpen);
  if(alertDrawerOpen && !alertsLoaded) loadAlerts();
}

async function loadAlerts(force=false){
  if(!force && alertsLoaded) return;
  const token = getToken();
  if(!token) return;

  const list = document.getElementById('ad-list');
  list.innerHTML = DOMPurify.sanitize('<div class="ad-loading"><div class="spin-sm"></div>Analysing data…</div>');

  try{
    const year = dbState.year || new Date().getFullYear();
    const data = await fetchJsonSafe(`${API}/api/insights/summary?year=${year}`,{token,fallback:null,label:`/api/insights/summary?year=${year}`});

    if(!data){ list.innerHTML='<div class="ad-loading">Failed to load alerts.</div>'; return; }

    alertsLoaded = true;
    renderAlerts(data);

    // Update topbar bell badge
    const badge = document.getElementById('alert-badge');
    const btn   = document.getElementById('tb-alert-btn');
    const {critical, warning, total} = data.summary;
    if(critical > 0){
      badge.textContent = critical; badge.className='alert-badge show';
      btn.className='has-critical';
    } else if(warning > 0){
      badge.textContent = warning; badge.className='alert-badge show amber';
      btn.className='has-warning';
    } else {
      badge.className='alert-badge'; btn.className='';
    }

    // Timestamp
    const now = new Date();
    document.getElementById('ad-last-refresh').textContent =
      'Updated ' + now.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
    document.getElementById('ad-refreshed').textContent =
      now.toLocaleDateString('en-GB',{day:'numeric',month:'short'});

  }catch(e){
    list.innerHTML= DOMPurify.sanitize('<div class="ad-loading">Error: '+e.message+'</div>');
  }
}

function renderAlerts(data){
  const {alerts, summary} = data;

  // Summary counts
  document.getElementById('ad-crit').textContent = summary.critical || '0';
  document.getElementById('ad-warn').textContent = summary.warning  || '0';
  document.getElementById('ad-info').textContent = summary.info     || '0';

  const list = document.getElementById('ad-list');
  if(!alerts.length){
    list.innerHTML = DOMPurify.sanitize('<div class="ad-loading" style="color:var(--ds-green)">'+
      '<svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M9 12l2 2 4-4" stroke="#16a34a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="12" r="9" stroke="#16a34a" stroke-width="1.5"/></svg>'+
      '<span>No alerts — all KPIs within target ranges</span></div>');
    return;
  }

  list.innerHTML = DOMPurify.sanitize(alerts.map(a => {
    const catLabel = CAT_LABELS[a.category] || a.category;
    const zoneTag  = a.zone ? `<span style="font-size:9px;font-weight:600;color:var(--ds-text-muted);background:rgba(0,0,0,.06);padding:1px 6px;border-radius:8px;margin-left:4px">${a.zone}</span>` : '';
    return `<div class="ad-item ${a.severity}">
      <div class="ad-item-hdr">
        <span class="ad-item-sev ${a.severity}">${a.severity}</span>
        <span class="ad-item-title">${a.title}${zoneTag}</span>
        <span class="ad-cat-tag">${catLabel}</span>
      </div>
      <div class="ad-item-detail">${a.detail}</div>
    </div>`;
  }).join(''));
}

// Auto-load alerts 3 seconds after login (non-blocking)
function scheduleAlertLoad(){
  setTimeout(()=>loadAlerts(), 3000);
}

// Alert/narrative reset on FY change is handled inside onFyChange (defined earlier).

// Close drawer when clicking outside
document.addEventListener('click', e=>{
  if(!alertDrawerOpen) return;
  const drawer = document.getElementById('alert-drawer');
  const btn    = document.getElementById('tb-alert-btn');
  if(!drawer.contains(e.target) && !btn.contains(e.target)){
    alertDrawerOpen = false;
    drawer.classList.remove('open');
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// BUDGET vs ACTUALS — FY2025/26
// ═══════════════════════════════════════════════════════════════════════════

const ZONE_CLR = {
  Zomba:'#7c3aed', Mangochi:'#0d9488',
  Liwonde:'#1A8FD1', Mulanje:'#16a34a', Ngabu:'#d97706',
};
const fmt1 = v => Number.isFinite(Number(v)) ? Number(v).toFixed(1) : '—';
const fmtPct1 = v => `${fmt1(v)}%`;
const fmtCompactMwk = v => {
  const n = Number(v) || 0;
  const a = Math.abs(n);
  if (a >= 1e9) return `MK ${(n/1e9).toFixed(1)}B`;
  if (a >= 1e6) return `MK ${(n/1e6).toFixed(1)}M`;
  if (a >= 1e3) return `MK ${(n/1e3).toFixed(1)}K`;
  return `MK ${n.toFixed(1)}`;
};

async function loadBudget() {
  try {
    const yr = dbState.year||2026;
    const d = await api(`/api/budget/variance?year=${yr}`);

    // Future / no-data FY notice banner
    const budgetPage = document.getElementById('page-budget');
    let noticeBanner = document.getElementById('bgt-fy-notice');
    if(!noticeBanner && budgetPage){
      noticeBanner = document.createElement('div');
      noticeBanner.id='bgt-fy-notice';
      noticeBanner.style.cssText='margin:.75rem 1.5rem;padding:.75rem 1rem;border-radius:6px;font-size:.85rem;display:none';
      budgetPage.insertBefore(noticeBanner, budgetPage.firstChild);
    }
    if(noticeBanner){
      const fyInfo = (dbState.fyMeta||[]).find(f=>f.year===yr);
      if(fyInfo?.status==='future' && !fyInfo?.has_data){
        noticeBanner.style.display='block';
        noticeBanner.style.background='rgba(59,130,246,.08)';
        noticeBanner.style.border='1px solid rgba(59,130,246,.25)';
        noticeBanner.style.color='#1e40af';
        noticeBanner.innerHTML= DOMPurify.sanitize(`<strong>Future FY — ${fyInfo.label}</strong>: No operational data yet for this year. `+
          `${fyInfo.has_budget?'Budget figures are loaded and shown as targets.':'No budget entered yet — use <em>Admin → FY Budget Setup</em> to seed this FY from a prior year.'} `+
          `Upload data for ${fyInfo.label} via the Data Upload module to enable actuals tracking.`);
      } else if(d.error){
        noticeBanner.style.display='block';
        noticeBanner.style.background='rgba(217,119,6,.08)';
        noticeBanner.style.border='1px solid rgba(217,119,6,.25)';
        noticeBanner.style.color='#92400e';
        noticeBanner.innerHTML= DOMPurify.sanitize(`<strong>No data available</strong> for FY ${yr-1}/${String(yr).slice(-2)}. Upload data to enable this view.`);
      } else {
        noticeBanner.style.display='none';
        if(!d.meta?.has_budget){
          noticeBanner.style.display='block';
          noticeBanner.style.background='rgba(217,119,6,.08)';
          noticeBanner.style.border='1px solid rgba(217,119,6,.25)';
          noticeBanner.style.color='#92400e';
          noticeBanner.innerHTML= DOMPurify.sanitize(`<strong>No approved budget loaded</strong> for FY ${yr-1}/${String(yr).slice(-2)}. `+
            `Variance comparators are not available. Use <em>Admin → FY Budget Setup → Copy Budget</em> to seed this year's budget.`);
        }
      }
    }

    if(d.error) return;

    const m = d.meta;
    const el = document.getElementById('pg-meta-budget');
    if (el) el.textContent =
      `${m.period} · ${m.data_months} months complete · Budget prorated ${Math.round(m.budget_factor*100)}%`;

    if (el) {
      const scopeBits = [];
      if (m?.scope?.zones?.length) scopeBits.push(m.scope.zones.length === 1 ? m.scope.zones[0] : `${m.scope.zones.length} Zones`);
      if (m?.scope?.schemes?.length) scopeBits.push(m.scope.schemes.length === 1 ? m.scope.schemes[0] : `${m.scope.schemes.length} Schemes`);
      if (m?.scope?.months?.length) scopeBits.push(`${m.scope.months.length} Months`);
      const scopeText = scopeBits.length ? ` | ${scopeBits.join(' | ')}` : '';
      const basisText = m?.budget_scope_label ? ` | ${m.budget_scope_label}` : '';
      el.textContent = `${m.period} | ${m.data_months} months complete | Budget prorated ${Math.round(m.budget_factor*100)}%${basisText}${scopeText}`;
    }

    _bgtApplyPlainLanguage(d);
    _bgtHeadline(d);
    _bgtExecSummary(d);
    _bgtVarTable('bgt-rev-table',  d.revenue);
    _bgtVarTable('bgt-ops-table',  d.operational);
    _bgtVarTable('bgt-cost-table', d.costs);
    _bgtDecomp(d);
    _bgtRevTrend(d.monthly);
    _bgtBpiZone(d.zones);
    _bgtVolTrend(d.monthly);
    _bgtConnTrend(d.monthly);
    _bgtNrwSpc(d);
    _bgtNrwZone(d.zones);
    _bgtNrwZoneTrend(d.zone_monthly);
    _bgtRwNrw(d.monthly);
    _bgtNrwCards(d);
    _bgtChemTrend(d.monthly);
    _bgtPwrTrend(d.monthly);
    _bgtCostZone(d.zones);
    _bgtZoneTable(d.zones);
    _bgtZoneLeague(d.zones);
    _bgtRadar(d.zones);
    _bgtZoneVar(d.zones);
    _bgtSchemeTable(d.schemes);
    _bgtEffKpis(d.efficiency_kpis, d.budget_ref);
  } catch(e) {
    console.error('loadBudget', e);
    errMsg('bgt-headline', e.message || 'Unable to load variance data.');
  }
}

// ── Headline ────────────────────────────────────────────────────────────────
function _bgtApplyPlainLanguage(d) {
  const meta = d?.meta || {};
  const scope = meta.scope || {};
  const scopeLabel = meta.budget_scope_label || 'Approved board budget comparator';
  const scopeNote = meta.budget_scope_note || 'This page compares actuals with the approved board budget.';
  const hasSchemeScope = Array.isArray(scope.schemes) && scope.schemes.length > 0;
  const hasZoneScope = Array.isArray(scope.zones) && scope.zones.length > 0;
  const setText = (selector, text, index = 0) => {
    const nodes = document.querySelectorAll(selector);
    if (nodes[index]) nodes[index].textContent = text;
  };

  setText('.pg-sub', 'A plain-language view of budget progress, the main gaps, and how each zone is performing.');
  setText('.bgt-framework-title', 'How to read this page');
  setText('.bgt-framework-copy', `This page compares results with the approved board budget dated 22 Feb 2025. ${scopeNote} Costs cover operating-site data in the database, not head-office overheads, depreciation, or finance costs. Revenue uses a fixed tariff of MK 1,450 per m3. The budget score is Actual / Budget; above 1.0 means ahead of budget.`);

  const chips = document.querySelectorAll('.bgt-chip-row .bgt-chip');
  if (chips[0]) chips[0].textContent = 'Approved budget reference | 22 Feb 2025';
  if (chips[1]) chips[1].textContent = scopeLabel;
  if (chips[2]) chips[2].textContent = 'Costs shown | field operations only';
  if (chips[3]) chips[3].textContent = 'Water-loss trend checked against recent pattern';

  const exTitles = document.querySelectorAll('.ex-hdr .ex-title');
  if (exTitles[1]) exTitles[1].textContent = 'Operational performance against budget';
  if (exTitles[2]) exTitles[2].textContent = 'Water loss trend and warning view';
  if (exTitles[3]) exTitles[3].textContent = 'Operating cost performance - field operations';
  if (exTitles[4]) exTitles[4].textContent = 'Zone comparison';
  if (exTitles[7]) exTitles[7].textContent = 'Reference performance indicators';

  const exSubs = document.querySelectorAll('.ex-hdr .ex-sub');
  if (exSubs[0]) exSubs[0].textContent = 'Revenue compared with budget using a fixed tariff of MK 1,450 per m3.';
  if (exSubs[1]) exSubs[1].textContent = 'Key operating measures: water produced, water loss, new connections, and hours of supply.';
  if (exSubs[2]) exSubs[2].textContent = 'Shows whether water-loss levels are staying within the recent normal range or moving into warning levels.';
  if (exSubs[3]) exSubs[3].textContent = 'Chemical and electricity costs compared with budget for the operating sites captured in the database.';
  if (exSubs[4]) exSubs[4].textContent = hasSchemeScope
    ? 'Filtered selection compared with an indicative scheme budget slice within the chosen parent scope.'
    : hasZoneScope
      ? 'Selected zones compared using the allocated board budget for those zones.'
      : 'Five zones compared using the same shared budget basis.';
  if (exSubs[5]) exSubs[5].textContent = 'Five zones ranked by an overall score built from the main service and financial results.';
  if (exSubs[6]) exSubs[6].textContent = hasSchemeScope
    ? 'Selected schemes ranked by service, collections, revenue efficiency, and connection activity. Budget interpretation is indicative at scheme level.'
    : '33 schemes ranked by an overall score based on service, collections, revenue efficiency, and connection activity.';
  if (exSubs[7]) exSubs[7].textContent = 'Calculated from 11 months of results and compared with common water-utility reference points.';

  const boxes = document.querySelectorAll('.bgt-framework-box');
  if (boxes[1]) boxes[1].innerHTML = `<strong>Overall score (0-100):</strong>
          Water loss 35% | Collection rate 35% | Revenue against budget 20% | New connections against budget 10%.
          &nbsp;&nbsp;
          <span style="display:inline-flex;align-items:center;gap:4px">
            <span style="width:8px;height:8px;border-radius:50%;background:#16a34a;display:inline-block"></span><span style="font-size:10.5px">Green >=70</span>
          </span>&nbsp;
          <span style="display:inline-flex;align-items:center;gap:4px">
            <span style="width:8px;height:8px;border-radius:50%;background:#d97706;display:inline-block"></span><span style="font-size:10.5px">Amber 50-69</span>
          </span>&nbsp;
          <span style="display:inline-flex;align-items:center;gap:4px">
            <span style="width:8px;height:8px;border-radius:50%;background:#dc2626;display:inline-block"></span><span style="font-size:10.5px">Red &lt;50</span>
          </span>`;
  if (boxes[2]) boxes[2].innerHTML = `<strong>Overall score (0-100):</strong>
          Water loss 35% | Collection rate 35% | Revenue per m3 efficiency 20% | Connection activity 10%.
          ${hasSchemeScope ? '<span style="display:block;margin-top:6px;color:var(--ds-text-secondary)">Budget comparisons shown with scheme filters are indicative slices, not approved scheme budgets.</span>' : ''}
          &nbsp;&nbsp;
          <span style="display:inline-flex;align-items:center;gap:4px">
            <span style="width:8px;height:8px;border-radius:50%;background:#16a34a;display:inline-block"></span><span style="font-size:10.5px">Green >=70</span>
          </span>&nbsp;
          <span style="display:inline-flex;align-items:center;gap:4px">
            <span style="width:8px;height:8px;border-radius:50%;background:#d97706;display:inline-block"></span><span style="font-size:10.5px">Amber 50-69</span>
          </span>&nbsp;
          <span style="display:inline-flex;align-items:center;gap:4px">
            <span style="width:8px;height:8px;border-radius:50%;background:#dc2626;display:inline-block"></span><span style="font-size:10.5px">Red &lt;50</span>
          </span>`;

  setText('.bgt-scope-warn', 'Scope note: This section covers operating-site costs recorded in the database only. Wider corporate costs, including bottled water operations not yet in service, are excluded here. Chemical and power budgets are estimated from recent cost patterns and the approved budget lines.');

  const source = document.querySelector('.bgt-source');
  if (source) {
    const schemeText = hasSchemeScope ? `${scope.schemes.length} selected scheme${scope.schemes.length !== 1 ? 's' : ''}` : '33 schemes';
    source.innerHTML = DOMPurify.sanitize(`<strong style="color:var(--ds-text-primary)">Data and reference points:</strong>
        Budget - <em>SRWB Draft Revenue &amp; Capital Expenditure Budget FY2025/26</em>, MoF, 22 Feb 2025.
        Actuals - operational DB (${schemeText}, ${meta.period || 'April 2025 - February 2026'}).
        External reference points from recognised water-sector and financial reporting guidance were used where relevant.
        &nbsp;&nbsp);
        <span style="color:var(--ds-green)">Favourable</span> &nbsp;
        <span style="color:var(--ds-red)">Below budget</span> &nbsp;
        <span style="color:var(--ds-text-muted)">Close to budget (+/-2%)</span>`);
  }
}
function _bgtHeadline(d) {
  const h = d.headline, ek = d.efficiency_kpis;
  const mkB  = v => (v >= 0 ? '+' : '') + 'MK ' + (Math.abs(v)/1e9).toFixed(2) + 'B';
  const mkM  = v => (v >= 0 ? '+' : '') + 'MK ' + (Math.abs(v)/1e6).toFixed(0) + 'M';
  const row=document.getElementById('bgt-headline'); if(row) row.className='kpi-row kpi-g4';
  kpis('bgt-headline', [
    { l:'Revenue gap vs budget (YTD)',
      v: mkB(h.revenue_variance_mk),
      s:`Budget score ${ek.bpi_revenue} — actual divided by budget`,
      cls: h.revenue_variance_mk >= 0 ? 'kc-up' : 'kc-dn', icon: ICON.revenue,
      badgeLabel: h.revenue_variance_mk >= 0 ? 'FAV' : 'ADV',
      bm: `${Math.round(ek.bpi_revenue*100)}% of the water revenue budget achieved` },
    { l:'Water loss vs target',
      v: (h.nrw_pp_variance >= 0 ? '+' : '') + h.nrw_pp_variance.toFixed(1) + ' pp',
      s: `Actual ${(27 + h.nrw_pp_variance).toFixed(1)}% vs 27% target`,
      cls: h.nrw_pp_variance > 0 ? 'kc-dn' : 'kc-up', icon: ICON.gauge,
      badgeLabel: h.nrw_pp_variance > 0 ? 'ADV' : 'FAV',
      bm: `Estimated cost of water loss: MK ${(h.nrw_financial_cost/1e9).toFixed(2)}B` },
    { l:'Connection gap (YTD)',
      v: Math.round(h.conn_variance).toLocaleString(),
      s: h.conn_variance < 0 ? `${Math.abs(Math.round(h.conn_variance))} below YTD target` : 'Ahead of target',
      cls: h.conn_variance < -100 ? 'kc-dn' : h.conn_variance >= 0 ? 'kc-up' : 'kc-nt',
      icon: ICON.clock,
      badgeLabel: h.conn_variance < -100 ? 'ADV' : h.conn_variance >= 0 ? 'FAV' : 'WATCH',
      bm: `Annual target: 8,588 · budget score ${ek.bpi_connections}` },
    { l:'Chemical cost overrun',
      v: mkM(h.chem_overrun_mk),
      s: h.chem_overrun_mk > 0 ? 'Above full-year budget with 1 month remaining' : 'Under budget',
      cls: h.chem_overrun_mk > 0 ? 'kc-dn' : 'kc-up', icon: ICON.chart,
      badgeLabel: h.chem_overrun_mk > 0 ? 'OVERRUN' : 'OK',
      bm: 'IWA Op34 · Annual budget: MK 1.057B' },
  ]);
}


function _bgtExecSummary(d){
  const host = document.getElementById('bgt-summary-strip');
  if(!host) return;
  const h = d.headline || {};
  const ek = d.efficiency_kpis || {};
  const zones = Array.isArray(d.zones) ? d.zones : [];
  const worstRevenueZone = zones.reduce((acc,z)=>{
    const ratio = z && z.budget_sales_ytd>0 ? (z.actual_sales/z.budget_sales_ytd) : Infinity;
    return ratio < acc.ratio ? {zone:z.zone||'—', ratio} : acc;
  }, {zone:'—', ratio:Infinity});
  const highestNrwZone = zones.reduce((acc,z)=> Number(z.actual_nrw_pct||0) > acc.val ? {zone:z.zone||'—', val:Number(z.actual_nrw_pct||0)} : acc, {zone:'—', val:-Infinity});
  const spc = d.spc_limits || {};
  const statusTone = Number(spc.months_above_2sigma||0) > 0 ? 'watch' : Number(h.nrw_pp_variance||0) > 0 ? 'high' : 'good';
  const items = [
    {k:'Revenue gap', v:fmtCompactMwk(h.revenue_variance_mk||0), tone:(h.revenue_variance_mk||0)>=0?'good':'high', n:`Revenue is currently at ${ek.bpi_revenue||'—'} times budget.`},
    {k:'Water loss level', v:`${fmt1(27 + Number(h.nrw_pp_variance||0))}%`, tone:Number(h.nrw_pp_variance||0)<=0?'good':'high', n:`This is ${(Number(h.nrw_pp_variance||0)>=0?'+':'') + fmt1(h.nrw_pp_variance||0)} percentage points against the 27% target.`},
    {k:'Chemical overspend', v:fmtCompactMwk(h.chem_overrun_mk||0), tone:(h.chem_overrun_mk||0)>0?'high':'good', n:`Field chemical spending ${Number(h.chem_overrun_mk||0)>0?'is above':'is within'} the annual budget path.`},
    {k:'Weakest revenue zone', v:worstRevenueZone.zone, tone:worstRevenueZone.ratio>=1?'good':worstRevenueZone.ratio>=0.9?'watch':'high', n:`Current budget score: ${Number.isFinite(worstRevenueZone.ratio)?fmt1(worstRevenueZone.ratio):'—'}.`},
    {k:'Priority zone', v:highestNrwZone.zone, tone:statusTone, n:`Highest water loss is in ${highestNrwZone.zone} at ${fmtPct1(highestNrwZone.val)}.`},
  ];
  host.innerHTML = DOMPurify.sanitize(items.map(it => `
    <div class="bgt-summary-card">
      <div class="bgt-summary-kicker">${it.k}</div>
      <div class="bgt-summary-value" data-tone="${it.tone}">${it.v}</div>
      <div class="bgt-summary-note">${it.n}</div>
    </div>`).join(''));
}

// ── Variance table ──────────────────────────────────────────────────────────
function _bgtVarTable(hostId, rows) {
  const host = document.getElementById(hostId);
  if (!host || !rows || !rows.length) return;

  const fa = (v, u) => {
    if (u === 'MWK') {
      const a = Math.abs(v);
      return a >= 1e9 ? (v/1e9).toFixed(2)+'B' : a >= 1e6 ? (v/1e6).toFixed(1)+'M' : (v/1e3).toFixed(0)+'K';
    }
    if (u === 'm³')  return (v/1e6).toFixed(3)+'M m³';
    if (u === '%')   return v.toFixed(2)+'%';
    if (u === 'hrs/day') return v.toFixed(1)+' h';
    return v.toLocaleString()+' '+u;
  };
  const fv = (v, u) => {
    const sign = v >= 0 ? '+' : '';
    if (u === 'MWK') {
      const a = Math.abs(v);
      return sign + (a >= 1e9 ? 'MK '+(v/1e9).toFixed(2)+'B' : a >= 1e6 ? 'MK '+(v/1e6).toFixed(1)+'M' : 'MK '+(v/1e3).toFixed(0)+'K');
    }
    if (u === 'm³')  return sign+(v/1e6).toFixed(3)+'M m³';
    if (u === '%')   return sign+v.toFixed(2)+'pp';
    if (u === 'hrs/day') return sign+v.toFixed(1)+' h';
    return sign+v.toFixed(0)+' '+u;
  };

  const dirCls = d => d==='favourable' ? 'num-fav' : d==='on_budget' ? 'num-on' : 'num-adv';
  const badgeCls = d => d==='favourable' ? 'bgt-badge bgt-fav' : d==='on_budget' ? 'bgt-badge bgt-on' : 'bgt-badge bgt-adv';
  const badgeTxt = d => d==='favourable' ? '▲ Better than budget' : d==='on_budget' ? '● Close to budget' : '▼ Below budget';
  const scopeTag = s => s==='target' ? '<span class="bgt-scope-target">target</span>' : '';
  const piTag = _ => '';

  let html = `<div class="bgt-var-wrap"><table class="bgt-var-table">
    <thead><tr>
      <th>Metric</th>
      <th>Actual (YTD)</th>
      <th>Budget (YTD)</th>
      <th>Variance</th>
      <th>% gap</th>
      <th style="text-align:center;min-width:110px">Status</th>
    </tr></thead><tbody>`;

  rows.forEach(r => {
    const dc = dirCls(r.direction);
    const vpct = r.variance_pct != null ? (r.variance_pct >= 0 ? '+' : '') + r.variance_pct + '%' : '—';
    html += `<tr>
      <td class="metric-name">${r.metric}${scopeTag(r.scope)}${piTag(r.iwa_pi)}
        ${r.note ? `<span class="metric-note">${r.note}</span>` : ''}
      </td>
      <td class="num-actual">${fa(r.actual, r.unit)}</td>
      <td class="num-budget">${fa(r.budget_ytd, r.unit)}</td>
      <td class="num-var ${dc}">${fv(r.variance, r.unit)}</td>
      <td class="num-varpct ${dc}">${vpct}</td>
      <td style="text-align:center"><span class="${badgeCls(r.direction)}">${badgeTxt(r.direction)}</span></td>
    </tr>`;
  });

  html += `</tbody></table></div>`;
  host.innerHTML = DOMPurify.sanitize(html);
}

// ── Revenue decomposition waterfall ─────────────────────────────────────────
function _bgtDecomp(d) {
  const dec = d.decomposition, ek = d.efficiency_kpis;
  const sub = document.getElementById('bgt-decomp-subtitle');
  if (sub) sub.textContent = 'This chart compares budget with actual revenue and highlights the biggest reasons for the gap. Longer bars mean a bigger effect.';
  const title = document.getElementById('bgt-decomp-title');
  if (title) title.textContent = 'Budget Pressure Snapshot (MWK, YTD)';

  const bud = d.budget_ref.water_sales * d.meta.budget_factor;
  const act = d.revenue.find(r => r.metric.includes('Water Sales'))?.actual || 0;

  const items = [
    { label:'Budget revenue (YTD)', value:bud, kind:'budget' },
    { label:'Actual revenue', value:act, kind:'actual' },
    { label:'Lost revenue from lower volume', value:Math.abs(dec.revenue_volume_effect_mk), kind:'pressure' },
    { label:'Extra water loss not billed', value:Math.abs(dec.nrw_revenue_impact_mk), kind:'pressure' },
    { label:'Estimated cost of water loss', value:Math.abs(ek.nrw_financial_cost_mk), kind:'cost' },
  ];

  const palette = {
    budget:'rgba(37,99,235,0.88)',
    actual:'rgba(22,163,74,0.82)',
    pressure:'rgba(217,119,6,0.84)',
    cost:'rgba(220,38,38,0.76)',
  };

  mkChart('ch-bgt-decomp', {
    type:'bar',
    data:{
      labels: items.map(i => i.label),
      datasets:[{
        data: items.map(i => i.value),
        backgroundColor: items.map(i => palette[i.kind]),
        borderRadius: 8,
        barThickness: 20,
      }]
    },
    options:{
      indexAxis:'y',
      maintainAspectRatio:false,
      plugins:{
        legend:{display:false},
        ...tooltipPlugin.plugins,
        tooltip:{
          callbacks:{
            title:(ctx)=>ctx?.[0]?.label || '',
            label:(ctx)=>'MK ' + (ctx.raw/1e9).toFixed(2) + 'B',
          }
        }
      },
      scales:{
        x:{
          beginAtZero:true,
          ticks:{color:LC,font:{size:9},callback:v=>'MK '+(v/1e9).toFixed(1)+'B'},
          grid:{color:'rgba(148,163,184,0.18)',drawBorder:false}
        },
        y:{
          ticks:{color:LC,font:{size:10}},
          grid:{display:false}
        }
      }
    }
  });
}

// ── Revenue monthly trend ────────────────────────────────────────────────────
function _bgtRevTrend(m) {
  mkChart('ch-bgt-rev-trend', {
    type:'line', data:{labels:m.months, datasets:[
      {label:'Actual Sales',   data:m.actual_sales,    borderColor:'#1A8FD1', backgroundColor:'rgba(26,143,209,0.07)', tension:0.3, pointRadius:4, borderWidth:2, fill:true},
      {label:'Monthly Budget', data:m.budget_sales,    borderColor:'#D97706', borderDash:[6,3], borderWidth:1.5, pointRadius:0, fill:false},
      {label:'Cash Collected', data:m.actual_collected,borderColor:'#16a34a', borderDash:[3,2], borderWidth:1.5, pointRadius:3, fill:false, tension:0.3},
    ]},
    options:{
      ...baseOpts(v=>'MK '+(v/1e9).toFixed(1)+'B'),
      plugins:{...legendOptsCompact()},
      scales:{...baseScales(v=>'MK '+(v/1e9).toFixed(1)+'B'),y:{...baseScales().y,ticks:{color:LC,font:{size:9},callback:v=>'MK '+(v/1e9).toFixed(1)+'B'},grace:'12%'}},
    },
  });
}

// ── BPI by zone ──────────────────────────────────────────────────────────────
function _bgtBpiZone(zones) {
  const lbls = zones.map(z => z.zone);
  const bpis = zones.map(z => z.budget_sales_ytd > 0 ? +(z.actual_sales/z.budget_sales_ytd).toFixed(3) : null);
  mkChart('ch-bgt-bpi-zone', {
    type:'bar', data:{labels:lbls, datasets:[
      {label:'Budget score', data:bpis,
       backgroundColor:bpis.map(v => v==null?'#9ca3af':v>=1?'rgba(22,163,74,0.78)':'rgba(220,38,38,0.75)'),
       borderWidth:0, borderRadius:5},
      {label:'On-budget line (1.0)', data:lbls.map(()=>1), type:'line', borderColor:'#D97706', borderDash:[6,3], borderWidth:1.5, pointRadius:0, fill:false},
    ]},
    options:{
      plugins:{legend:{display:false},...tooltipPlugin.plugins},
      scales:{
        x:{ticks:{color:LC,font:{size:10}},grid:{display:false}},
        y:{ticks:{color:LC,font:{size:9},callback:v=>v.toFixed(2)},grid:{color:'rgba(0,0,0,0.05)'},min:0.5,max:1.5},
      },
    },
  });
}

// ── Volume trend ─────────────────────────────────────────────────────────────
function _bgtVolTrend(m) {
  const maxVol=Math.max(...m.actual_vol_prod.filter(v=>v!=null), ...m.budget_vol_prod.filter(v=>v!=null), 0);
  mkChart('ch-bgt-vol-trend', {
    type:'bar', data:{labels:m.months, datasets:[
      {label:'Actual Produced',data:m.actual_vol_prod,
       backgroundColor:m.actual_vol_prod.map((v,i)=>v==null?'transparent':v>=(m.budget_vol_prod[i]||0)?'rgba(22,163,74,0.75)':'rgba(220,38,38,0.72)'),
       borderWidth:0, borderRadius:3, maxBarThickness:30},
      {label:'Monthly Budget',data:m.budget_vol_prod,type:'line',borderColor:'#D97706',borderDash:[6,3],borderWidth:1.5,pointRadius:0,fill:false},
    ]},
    options:{
      plugins:{...legendOptsSharp()},
      scales:{
        x:{ticks:{color:LC,font:{size:9}},grid:{display:false}},
        y:{ticks:{color:LC,font:{size:9},callback:v=>(v/1e6).toFixed(1)+'M'},grid:{color:'rgba(0,0,0,0.05)'},suggestedMax:maxVol*1.12},
      },
    },
  });
}

// ── Cumulative connections ───────────────────────────────────────────────────
function _bgtConnTrend(m) {
  let ca=0, cb=0, cumA=[], cumB=[];
  m.months.forEach((_,i)=>{
    const a=m.actual_connections[i]; const b=m.budget_connections[i]||0;
    if(a!=null) ca+=a; cb+=b;
    cumA.push(a!=null?ca:null); cumB.push(cb);
  });
  const maxConn=Math.max(...cumA.filter(v=>v!=null), ...cumB.filter(v=>v!=null), 0);
  mkChart('ch-bgt-conn-trend', {
    type:'line', data:{labels:m.months, datasets:[
      {label:'Actual (cumulative)',data:cumA,borderColor:'#16a34a',backgroundColor:'rgba(22,163,74,0.08)',tension:0.2,pointRadius:4,pointHoverRadius:5,borderWidth:2.5,fill:true},
      {label:'Budget (cumulative)',data:cumB,borderColor:'#D97706',borderDash:[6,3],borderWidth:1.75,pointRadius:0,fill:false},
    ]},
    options:{
      plugins:{...legendOptsSharp()},
      scales:{
        x:{ticks:{color:LC,font:{size:9}},grid:{display:false}},
        y:{ticks:{color:LC,font:{size:9},callback:v=>v.toLocaleString()},grid:{color:'rgba(0,0,0,0.05)'},suggestedMax:maxConn*1.12},
      },
    },
  });
}

// ── NRW SPC Chart ────────────────────────────────────────────────────────────
function _bgtNrwSpc(d) {
  const m=d.monthly, s=d.spc_limits.nrw_pct;
  const sub = document.getElementById('bgt-spc-subtitle');
  if (sub) sub.textContent =
    `Average for the period = ${s.mean}%. Amber line = early warning at ${s.ucl2}%. Red line = action level at ${s.ucl3}%. `+
    `${m.actual_nrw_pct.filter(v=>v!=null&&v>s.ucl2).length} month(s) are above the warning line.`;

  mkChart('ch-bgt-nrw-spc', {
    type:'line', data:{labels:m.months, datasets:[
      {label:'Actual water loss %', data:m.actual_nrw_pct,
       borderColor:'#dc2626', backgroundColor:'rgba(220,38,38,0.06)',
       tension:0.25, pointRadius:5, borderWidth:2.5, fill:true,
       pointBackgroundColor:m.actual_nrw_pct.map(v=>v==null?'transparent':v>s.ucl3?'#dc2626':v>s.ucl2?'#d97706':'#16a34a'),
       pointBorderColor:'#fff', pointBorderWidth:1.5},
      {label:`3σ UCL (${s.ucl3}%)`, data:m.months.map(()=>s.ucl3),
       borderColor:'rgba(220,38,38,0.65)',borderDash:[4,2],borderWidth:1,pointRadius:0,fill:false},
      {label:`2σ UCL (${s.ucl2}%)`, data:m.months.map(()=>s.ucl2),
       borderColor:'rgba(217,119,6,0.75)',borderDash:[6,3],borderWidth:1.5,pointRadius:0,fill:false},
      {label:`Mean (${s.mean}%)`, data:m.spc_nrw_mean,
       borderColor:'rgba(100,116,139,0.6)',borderDash:[3,3],borderWidth:1,pointRadius:0,fill:false},
      {label:`2σ LCL (${s.lcl2}%)`, data:m.spc_nrw_lcl2,
       borderColor:'rgba(22,163,74,0.45)',borderDash:[6,3],borderWidth:1,pointRadius:0,fill:false},
      {label:'Board target (27%)', data:m.budget_nrw_pct,
       borderColor:'#1A8FD1',borderDash:[8,4],borderWidth:2,pointRadius:0,fill:false},
    ]},
    options:{
      ...baseOpts(v=>v+'%'),
      plugins:{...tooltipPlugin.plugins,legend:{display:true,position:'top',labels:{font:{size:9.5},color:LC,usePointStyle:true}}},
      scales:{...baseScales(v=>v+'%'),y:{...baseScales().y,min:22,max:38,ticks:{color:LC,font:{size:9},callback:v=>v+'%'}}},
    },
  });
}

// ── NRW by zone bar ──────────────────────────────────────────────────────────
function _bgtNrwZone(zones) {
  const nrws = zones.map(z=>z.actual_nrw_pct);
  mkChart('ch-bgt-nrw-zone', {
    type:'bar', data:{labels:zones.map(z=>z.zone), datasets:[
      {label:'Actual water loss %', data:nrws,
       backgroundColor:nrws.map(v=>v>30?'rgba(220,38,38,0.78)':v>27?'rgba(217,119,6,0.78)':'rgba(22,163,74,0.75)'),
       borderWidth:0, borderRadius:5},
      {label:'Target 27%', data:zones.map(()=>27),type:'line',borderColor:'#1A8FD1',borderDash:[6,3],borderWidth:1.5,pointRadius:0,fill:false},
      {label:'IWA 20%', data:zones.map(()=>20),type:'line',borderColor:'rgba(22,163,74,0.45)',borderDash:[3,3],borderWidth:1,pointRadius:0,fill:false},
    ]},
    options:{
      plugins:{...tooltipPlugin.plugins,legend:{display:true,position:'top',labels:{font:{size:10},color:LC,usePointStyle:true}}},
      scales:{
        x:{ticks:{color:LC,font:{size:10}},grid:{display:false}},
        y:{ticks:{color:LC,callback:v=>v+'%'},grid:{color:'rgba(0,0,0,0.05)'},min:0},
      },
    },
  });
}

// ── NRW zone trend ───────────────────────────────────────────────────────────
function _bgtNrwZoneTrend(zm) {
  const datasets = Object.entries(zm).map(([zone,dat])=>({
    label:zone, data:dat.nrw_pct,
    borderColor:ZONE_CLR[zone]||'#64748b',
    backgroundColor:'transparent', tension:0.3, pointRadius:3, borderWidth:2, fill:false,
  }));
  datasets.push({label:'Target 27%',data:Array(12).fill(27),borderColor:'#64748b',borderDash:[6,3],borderWidth:1.5,pointRadius:0,fill:false});
  mkChart('ch-bgt-nrw-zone-trend', {
    type:'line', data:{labels:['Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar'],datasets},
    options:{
      ...baseOpts(v=>v+'%'),
      plugins:{...tooltipPlugin.plugins,legend:{display:true,position:'top',labels:{font:{size:9.5},color:LC,usePointStyle:true,boxWidth:16}}},
      scales:{...baseScales(v=>v+'%'),y:{...baseScales().y,min:18,ticks:{color:LC,callback:v=>v+'%'}}},
    },
  });
}

// ── Revenue water vs NRW stacked ─────────────────────────────────────────────
function _bgtRwNrw(m) {
  mkChart('ch-bgt-rw-nrw', {
    type:'bar', data:{labels:m.months, datasets:[
      {label:'Revenue Water (m³)',data:m.actual_rev_water,backgroundColor:'rgba(22,163,74,0.75)',stack:'v',borderRadius:2},
      {label:'NRW Volume (m³)',   data:m.actual_nrw_vol,  backgroundColor:'rgba(220,38,38,0.68)',stack:'v',borderRadius:2},
    ]},
    options:{
      plugins:{...tooltipPlugin.plugins,legend:{display:true,position:'top',labels:{font:{size:10},color:LC,usePointStyle:true}}},
      scales:{
        x:{stacked:true,ticks:{color:LC,font:{size:9}},grid:{display:false}},
        y:{stacked:true,ticks:{color:LC,font:{size:9},callback:v=>(v/1e6).toFixed(1)+'M'},grid:{color:'rgba(0,0,0,0.05)'}},
      },
    },
  });
}

// ── NRW impact cards ─────────────────────────────────────────────────────────
function _bgtNrwCards(d) {
  const host = document.getElementById('bgt-nrw-impact');
  if (!host) return;
  const ek = d.efficiency_kpis;
  const excess = ek.nrw_financial_cost_mk - ek.budget_nrw_cost_mk;
  const items = [
    {label:'Actual NRW Cost (FY)',    value:'MK '+(ek.nrw_financial_cost_mk/1e9).toFixed(3)+'B', sub:'Total NRW volume × MK 1,450/m³', color:'#dc2626'},
    {label:'Budgeted NRW Cost (YTD)', value:'MK '+(ek.budget_nrw_cost_mk/1e9).toFixed(3)+'B',   sub:'Budget NRW volume × MK 1,450/m³', color:'#d97706'},
    {label:'Excess NRW Cost',         value:'MK '+(excess/1e6).toFixed(0)+'M',                   sub:'Cost above what was budgeted for water loss', color:'#dc2626'},
    {label:'Revenue Recovery Potential',value:'MK '+((d.spc_limits.nrw_pct.mean-27)/100*d.budget_ref.vol_produced_target*d.meta.budget_factor*d.meta.tariff_mk_m3/1e6).toFixed(0)+'M',
     sub:'If NRW reduced to 27% target (annualised estimate)', color:'#16a34a'},
  ];
  host.innerHTML = DOMPurify.sanitize(items.map(it =>
    `<div class="bgt-impact-card" style="border-left-color:${it.color}">
      <div class="ic-label">${it.label}</div>
      <div class="ic-value" style="color:${it.color}">${it.value}</div>
      <div class="ic-sub">${it.sub}</div>
    </div>`
  ).join(''));
}

// ── Chemical trend ───────────────────────────────────────────────────────────
function _bgtChemTrend(m) {
  mkChart('ch-bgt-chem-trend', {
    type:'bar', data:{labels:m.months, datasets:[
      {label:'Actual Chemicals', data:m.actual_chems,
       backgroundColor:m.actual_chems.map((v,i)=>v==null?'transparent':v>(m.budget_chems[i]||0)?'rgba(220,38,38,0.72)':'rgba(22,163,74,0.72)'),
       borderWidth:0, borderRadius:3},
      {label:'Monthly Budget', data:m.budget_chems, type:'line',
       borderColor:'#D97706',borderDash:[6,3],borderWidth:1.5,pointRadius:0,fill:false},
    ]},
    options:{
      plugins:{...tooltipPlugin.plugins,legend:{display:true,position:'top',labels:{font:{size:10},color:LC,usePointStyle:true}}},
      scales:{
        x:{ticks:{color:LC,font:{size:9}},grid:{display:false}},
        y:{ticks:{color:LC,font:{size:9},callback:v=>'MK '+(v/1e6).toFixed(0)+'M'},grid:{color:'rgba(0,0,0,0.05)'}},
      },
    },
  });
}

// ── Power trend ──────────────────────────────────────────────────────────────
function _bgtPwrTrend(m) {
  mkChart('ch-bgt-pwr-trend', {
    type:'bar', data:{labels:m.months, datasets:[
      {label:'Actual Power', data:m.actual_power,
       backgroundColor:m.actual_power.map((v,i)=>v==null?'transparent':v>(m.budget_power[i]||0)?'rgba(220,38,38,0.72)':'rgba(22,163,74,0.72)'),
       borderWidth:0, borderRadius:3},
      {label:'Monthly Budget', data:m.budget_power, type:'line',
       borderColor:'#D97706',borderDash:[6,3],borderWidth:1.5,pointRadius:0,fill:false},
    ]},
    options:{
      plugins:{...tooltipPlugin.plugins,legend:{display:true,position:'top',labels:{font:{size:10},color:LC,usePointStyle:true}}},
      scales:{
        x:{ticks:{color:LC,font:{size:9}},grid:{display:false}},
        y:{ticks:{color:LC,font:{size:9},callback:v=>'MK '+(v/1e6).toFixed(0)+'M'},grid:{color:'rgba(0,0,0,0.05)'}},
      },
    },
  });
}

// ── Cost per m³ by zone ──────────────────────────────────────────────────────
function _bgtCostZone(zones) {
  const chem = zones.map(z => z.actual_vol_produced > 0 ? +(z.actual_chems / z.actual_vol_produced).toFixed(1) : 0);
  const pwr  = zones.map(z => z.actual_vol_produced > 0 ? +(z.actual_power / z.actual_vol_produced).toFixed(1) : 0);
  mkChart('ch-bgt-cost-zone', {
    type:'bar',
    data:{labels:zones.map(z=>z.zone), datasets:[
      {label:'Chemical/m³ (MWK)', data:chem,
       backgroundColor:'rgba(214,106,120,0.72)', borderRadius:5, categoryPercentage:0.7, barPercentage:0.78},
      {label:'Power/m³ (MWK)', data:pwr,
       backgroundColor:'rgba(102,163,219,0.72)', borderRadius:5, categoryPercentage:0.7, barPercentage:0.78},
    ]},
    options:{
      indexAxis:'y',
      plugins:{
        ...tooltipPlugin.plugins,
        legend:{display:true,position:'top',labels:{font:{size:10},color:LC,usePointStyle:true,padding:14}},
        tooltip:{
          callbacks:{
            label:(ctx)=>`${ctx.dataset.label}: MK ${Number(ctx.raw||0).toFixed(1)}/m³`
          }
        }
      },
      scales:{
        y:{ticks:{color:LC,font:{size:10}},grid:{display:false}},
        x:{beginAtZero:true,ticks:{color:LC,font:{size:9},callback:v=>'MK '+Number(v).toFixed(0)},grid:{color:'rgba(0,0,0,0.05)'}},
      },
    },
  });
}

// ── Zone table ───────────────────────────────────────────────────────────────
function _bgtZoneTable(zones) {
  const host = document.getElementById('bgt-zone-table');
  if (!host) return;
  const fmt1 = v => Number.isFinite(Number(v)) ? Number(v).toFixed(1) : '—';
  const fB = v => { const a=Math.abs(v); return a>=1e9?(v/1e9).toFixed(2)+'B':a>=1e6?(v/1e6).toFixed(0)+'M':(v/1e3).toFixed(0)+'K'; };
  const fV = v => (v>=0?'+':'')+fB(v);
  const nrwCls = n => n>30?'zs-bad':n>27?'zs-warn':'zs-good';
  const varCls = v => v>=0?'zs-good':'zs-bad';
  const bpi = z => z.budget_sales_ytd>0 ? (z.actual_sales/z.budget_sales_ytd).toFixed(2) : '—';
  const bpiCls = z => { const b = z.budget_sales_ytd>0?(z.actual_sales/z.budget_sales_ytd):1; return b>=1?'zs-good':b>=0.9?'zs-warn':'zs-bad'; };
  const crCls = r => r>=90?'zs-good':r>=80?'zs-warn':'zs-bad';

  let h = `<table class="zs" style="width:100%" aria-label="Zone comparative analysis"><caption class="sr-only">Zone comparative analysis</caption>
    <thead><tr>
      <th style="text-align:left">Zone</th>
      <th>Schemes</th>
      <th>Actual Sales</th>
      <th>Budget YTD</th>
      <th>Sales Variance</th>
      <th>Budget score</th>
      <th>Water loss %</th>
      <th>Gap to target</th>
      <th>Vol Prod (m³)</th>
      <th>New connections</th>
      <th>Collection rate</th>
      <th>Share of budget</th>
    </tr></thead><tbody>`;

  zones.forEach(z => {
    const dot = ZONE_CLR[z.zone] || '#64748b';
    h += `<tr>
      <td style="font-weight:600"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${dot};margin-right:7px;vertical-align:middle"></span>${z.zone}</td>
      <td style="text-align:center">${z.schemes}</td>
      <td class="zs-mono">MK ${fB(z.actual_sales)}</td>
      <td class="zs-mono" style="color:var(--ds-text-secondary)">MK ${fB(z.budget_sales_ytd)}</td>
      <td class="${varCls(z.sales_variance)} zs-mono">MK ${fV(z.sales_variance)}</td>
      <td class="${bpiCls(z)}" style="font-weight:700">${bpi(z)}</td>
      <td class="${nrwCls(z.actual_nrw_pct)}" style="font-weight:700">${fmt1(z.actual_nrw_pct)}%</td>
      <td class="${z.nrw_variance_pp>0?'zs-bad':z.nrw_variance_pp<-2?'zs-good':'zs-warn'}">${Number(z.nrw_variance_pp)>0?'+':''}${fmt1(z.nrw_variance_pp)}pp</td>
      <td class="zs-mono">${(z.actual_vol_produced/1e6).toFixed(2)}M</td>
      <td>${z.actual_connections.toLocaleString()}</td>
      <td class="${crCls(z.collection_rate)}">${fmt1(z.collection_rate)}%</td>
      <td style="color:var(--ds-text-secondary)">${fmt1(z.budget_share_pct)}%</td>
    </tr>`;
  });
  h += `</tbody></table>`;
  host.innerHTML = DOMPurify.sanitize(h);
}

// ── Radar chart ──────────────────────────────────────────────────────────────
function _bgtRadar(zones) {
  const norm = (v,mn,mx,inv=false) => {
    const n = (mx===mn) ? 0 : Math.max(0,Math.min(100,((v-mn)/(mx-mn))*100));
    return inv ? 100-n : n;
  };
  const metrics = [
    { key:'nrw', label:'Water loss control', color:'#4C8DAE', score:z => norm(z.actual_nrw_pct, 45, 10, true) },
    { key:'collection', label:'Collection Rate', color:'#5B7CFA', score:z => Math.min(100, Math.max(0, z.collection_rate || 0)) },
    { key:'revenue', label:'Revenue against budget', color:'#8B6FCF', score:z => Math.min(100, Math.max(0, (z.budget_sales_ytd>0?(z.actual_sales/z.budget_sales_ytd):0)*100)) },
    { key:'volume', label:'Production against budget', color:'#C98A3D', score:z => Math.min(100, Math.max(0, (z.budget_vol_ytd>0?(z.actual_vol_produced/z.budget_vol_ytd):0)*100)) },
    { key:'connections', label:'Connections against budget', color:'#C96B7A', score:z => Math.min(100, Math.max(0, (z.budget_connections_ytd>0?(z.actual_connections/z.budget_connections_ytd):0)*100)) },
  ];

  const zoneLabels = zones.map(z => z.zone);
  const datasets = metrics.map(m => ({
    label: m.label,
    data: zones.map(z => Number(m.score(z).toFixed(1))),
    backgroundColor: m.color,
    borderRadius: 8,
    barThickness: 6,
    categoryPercentage: 0.38,
    barPercentage: 0.56,
    maxBarThickness: 7,
  }));

  const ctx = document.getElementById('ch-bgt-radar');
  if (!ctx) return;
  if (ctx._chart) ctx._chart.destroy();
  ctx._chart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: zoneLabels,
      datasets,
    },
    options: {
      indexAxis:'y',
      maintainAspectRatio:false,
      layout:{padding:{top:4,right:8,bottom:0,left:0}},
      plugins:{
        legend:{
          display:true,
          position:'bottom',
          align:'start',
          labels:{font:{size:10},color:LC,usePointStyle:true,boxWidth:8,boxHeight:8,padding:12}
        },
        tooltip:{
          callbacks:{
            title:(items)=>items?.[0]?.label || '',
            label:(c)=>`${c.dataset.label}: ${fmt1(c.raw)}`
          }
        }
      },
      scales:{
        x:{
          min:0,max:100,
          ticks:{color:LC,font:{size:9},stepSize:20,callback:v=>v},
          grid:{color:'rgba(148,163,184,0.18)',drawBorder:false}
        },
        y:{
          ticks:{color:LC,font:{size:11},padding:10},
          grid:{display:false}
        }
      }
    },
  });
}

// ── Revenue actual vs budget by zone ───────────────────────────────────────
function _bgtZoneVar(zones) {
  const labels = zones.map(z => z.zone);
  const budget = zones.map(z => z.budget_sales_ytd || 0);
  const actual = zones.map(z => z.actual_sales || 0);
  const fmtB = v => {
    const a = Math.abs(Number(v) || 0);
    if (a >= 1e9) return (v / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return (v / 1e6).toFixed(0) + 'M';
    return (v / 1e3).toFixed(0) + 'K';
  };

  mkChart('ch-bgt-zone-var', {
    type:'bar',
    data:{
      labels,
      datasets:[
        {
          label:'Budget YTD',
          data:budget,
          backgroundColor:'rgba(148,163,184,0.30)',
          borderColor:'rgba(100,116,139,0.70)',
          borderWidth:1,
          borderRadius:5,
          barThickness:10,
        },
        {
          label:'Actual Sales',
          data:actual,
          backgroundColor:labels.map(l => ZONE_CLR[l] || '#1A8FD1'),
          borderWidth:0,
          borderRadius:5,
          barThickness:10,
        },
      ]
    },
    options:{
      indexAxis:'y',
      maintainAspectRatio:false,
      plugins:{
        legend:{
          display:true,
          position:'bottom',
          align:'start',
          labels:{font:{size:10},color:LC,usePointStyle:true,boxWidth:8,boxHeight:8,padding:12}
        },
        tooltip:{
          callbacks:{
            label:(c) => `${c.dataset.label}: ${fmtCompactMwk(Number(c.raw) || 0)}`,
            afterBody:(items) => {
              if (!items?.length) return '';
              const idx = items[0].dataIndex;
              const variance = actual[idx] - budget[idx];
              const bpi = budget[idx] > 0 ? actual[idx] / budget[idx] : 0;
              return [
                `Variance: ${variance >= 0 ? '+' : '-'}${fmtCompactMwk(Math.abs(variance))}`,
                `Budget score: ${budget[idx] > 0 ? bpi.toFixed(2) : '—'}`,
              ];
            }
          }
        }
      },
      scales:{
        x:{
          ticks:{color:LC,font:{size:9},callback:v=>'MK '+(v/1e9).toFixed(1)+'B'},
          grid:{color:'rgba(148,163,184,0.18)',drawBorder:false}
        },
        y:{ticks:{color:LC,font:{size:10}},grid:{display:false}},
      },
    },
  });
}

// ── Scheme league table ───────────────────────────────────────────────────────
function _bgtSchemeTable(schemes) {
  const host = document.getElementById('bgt-scheme-table');
  if (!host) return;
  const ragDot = r => `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${r==='green'?'#16a34a':r==='amber'?'#d97706':'#dc2626'};margin-right:5px;vertical-align:middle;flex-shrink:0"></span>`;
  const nrwCls = n => n>35?'zs-bad':n>27?'zs-warn':'zs-good';
  const crCls  = r => r>=90?'zs-good':r>=75?'zs-warn':'zs-bad';
  const rvCls  = r => r>=1450?'zs-good':r>=1100?'zs-warn':'zs-bad';
  const dot    = z => ZONE_CLR[z]||'#64748b';

  let h = `<table class="bgt-scheme-table" aria-label="Scheme performance league table"><caption class="sr-only">Scheme performance league table</caption>
    <thead><tr>
      <th style="text-align:center;width:36px">#</th>
      <th>Zone</th>
      <th>Scheme</th>
      <th style="text-align:center;min-width:72px">Score</th>
      <th>Water loss %</th>
      <th>Gap to target</th>
      <th>Collection %</th>
      <th>Revenue</th>
      <th>MK/m³</th>
      <th>Vol (m³)</th>
      <th>Connections</th>
      <th>Chem/m³</th>
      <th>Pwr/m³</th>
    </tr></thead><tbody>`;

  const fmt1 = v => Number.isFinite(Number(v)) ? Number(v).toFixed(1) : '—';
  const fmtRevenue = v => {
    const n = Number(v);
    if (!Number.isFinite(n)) return '—';
    const a = Math.abs(n);
    if (a >= 1e9) return (n / 1e9).toFixed(1) + 'B';
    if (a >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (a >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return n.toFixed(1);
  };

  schemes.forEach((s, i) => {
    const scoreColor = s.rag==='green'?'#16a34a':s.rag==='amber'?'#d97706':'#dc2626';
    const nvarCls = s.nrw_variance_pp > 0 ? 'zs-bad' : s.nrw_variance_pp < -2 ? 'zs-good' : 'zs-warn';
    h += `<tr>
      <td style="text-align:center;color:var(--ds-text-muted);font-family:var(--ds-mono);font-size:11px">${i+1}</td>
      <td><span style="display:inline-flex;align-items:center;gap:6px"><span style="width:7px;height:7px;border-radius:50%;background:${dot(s.zone)};flex-shrink:0;display:inline-block"></span>${s.zone}</span></td>
      <td style="font-weight:600">${s.scheme}</td>
      <td style="text-align:center">${ragDot(s.rag)}<span style="font-weight:800;color:${scoreColor}">${fmt1(s.performance_score)}</span></td>
      <td class="${nrwCls(s.nrw_pct)}">${fmt1(s.nrw_pct)}%</td>
      <td class="${nvarCls}">${s.nrw_variance_pp>0?'+':''}${fmt1(s.nrw_variance_pp)}pp</td>
      <td class="${crCls(s.collection_rate)}">${fmt1(s.collection_rate)}%</td>
      <td>${fmtRevenue(s.revenue_mk)}</td>
      <td class="${rvCls(s.revenue_per_m3)}">${fmt1(s.revenue_per_m3)}</td>
      <td>${(Number(s.vol_produced_m3 || 0)/1e3).toFixed(0)}K</td>
      <td>${Number(s.new_connections || 0).toLocaleString()}</td>
      <td style="color:var(--ds-text-secondary)">${fmt1(s.chem_per_m3)}</td>
      <td style="color:var(--ds-text-secondary)">${fmt1(s.power_per_m3)}</td>
    </tr>`;
  });
  h += `</tbody></table>`;
  host.innerHTML = DOMPurify.sanitize(h);
}

// ── IWA/IBNET efficiency KPI cards ───────────────────────────────────────────
function _bgtEffKpis(ek, br) {
  kpis('bgt-eff-kpis', [
    {l:'Operating Ratio [Fn25]', v:ek.operating_ratio!=null?ek.operating_ratio.toFixed(3):'—',
     s:'Field OpEx ÷ Water Revenue',
     cls:ek.operating_ratio<1?'kc-up':'kc-dn', icon:ICON.gauge,
     badgeLabel:ek.operating_ratio<0.9?'GOOD':ek.operating_ratio<1?'WATCH':'ADV',
     bm:'World Bank target <1.0'},
    {l:'Operating cost per m³ produced', v:'MK '+ek.opex_per_m3_produced,
     s:'Field total cost per m³ produced',
     cls:'kc-nt', icon:ICON.chart, badgeLabel:'RATE',
     bm:'Lower = more efficient field operations'},
    {l:'Revenue per connection', v:'MK '+F.num(ek.revenue_per_connection),
     s:'YTD water sales ÷ active customers',
     cls:'kc-up', icon:ICON.revenue, badgeLabel:'RATE',
     bm:`~MK ${F.num(ek.revenue_per_connection*12/1e3)}K annualised per customer`},
    {l:'Chemical cost per m³', v:'MK '+ek.chemical_cost_per_m3,
     s:'Field chemical spend per m³ produced',
     cls:ek.chemical_cost_per_m3>100?'kc-dn':'kc-nt', icon:ICON.gauge,
     badgeLabel:ek.chemical_cost_per_m3>100?'HIGH':'OK',
     bm:`Budget estimate: ~MK ${Math.round(br.chemicals_budget/br.vol_produced_target)}/m³`},
    {l:'Power Cost per m³ [Ee1]', v:'MK '+ek.power_cost_per_m3,
     s:'Field electricity per m³ produced',
     cls:'kc-nt', icon:ICON.chart, badgeLabel:'RATE',
     bm:`Budget estimate: ~MK ${Math.round(br.electricity_budget/br.vol_produced_target)}/m³`},
    {l:'Collection rate', v:ek.collection_rate_pct+'%',
     s:'Cash collected ÷ amount billed × 100',
     cls:ek.collection_rate_pct>=90?'kc-up':ek.collection_rate_pct>=80?'kc-nt':'kc-dn',
     icon:ICON.revenue,
     badgeLabel:ek.collection_rate_pct>=90?'GOOD':ek.collection_rate_pct>=80?'WATCH':'ADV',
     bm:'IBNET benchmark >90%'},
    {l:'Estimated cost of water loss', v:'MK '+(ek.nrw_financial_cost_mk/1e9).toFixed(3)+'B',
     s:'Total NRW volume × MK 1,450/m³ tariff',
     cls:'kc-dn', icon:ICON.gauge, badgeLabel:'COST',
     bm:`Budget NRW cost: MK ${(ek.budget_nrw_cost_mk/1e9).toFixed(3)}B`},
    {l:'Production budget score', v:ek.bpi_volume!=null?ek.bpi_volume.toFixed(3):'—',
     s:'Actual volume ÷ budget volume',
     cls:ek.bpi_volume>=1?'kc-up':ek.bpi_volume>=0.9?'kc-nt':'kc-dn',
     icon:ICON.chart,
     badgeLabel:ek.bpi_volume>=1?'FAV':ek.bpi_volume>=0.9?'WATCH':'ADV',
     bm:'EVM-adapted production performance index'},
  ]);
}

// ── Zone Performance League Table ─────────────────────────────────────────────
function _bgtZoneLeague(zones) {
  const host = document.getElementById('bgt-zone-league');
  if (!host || !zones || !zones.length) return;

  // ── Composite score (mirrors scheme scoring logic) ──────────────────
  const score = z => {
    const nrwScore  = Math.max(0, Math.min(100, (45 - z.actual_nrw_pct) / (45 - 10) * 100));
    const collScore = Math.min(100, z.collection_rate || 0);
    const revBPI    = z.budget_sales_ytd > 0 ? z.actual_sales / z.budget_sales_ytd : 0;
    const revScore  = Math.min(100, Math.max(0, revBPI * 100));
    const connBPI   = z.budget_connections_ytd > 0 ? z.actual_connections / z.budget_connections_ytd : 0;
    const connScore = Math.min(100, Math.max(0, connBPI * 100));
    return {
      total:    Math.round(nrwScore*0.35 + collScore*0.35 + revScore*0.20 + connScore*0.10),
      nrw:      Math.round(nrwScore),
      coll:     Math.round(collScore),
      rev:      Math.round(revScore),
      conn:     Math.round(connScore),
    };
  };

  // Compute scores and sort descending
  const ranked = zones
    .map(z => ({ ...z, _score: score(z) }))
    .sort((a, b) => b._score.total - a._score.total);

  // ── Helpers ─────────────────────────────────────────────────────────
  const ragColor = s => s >= 70 ? '#16a34a' : s >= 50 ? '#d97706' : '#dc2626';
  const ragBg    = s => s >= 70 ? 'rgba(22,163,74,0.08)' : s >= 50 ? 'rgba(217,119,6,0.08)' : 'rgba(220,38,38,0.08)';
  const ragCls   = s => s >= 70 ? 'zs-good' : s >= 50 ? 'zs-warn' : 'zs-bad';
  const nrwCls   = n => n > 30 ? 'zs-bad' : n > 27 ? 'zs-warn' : 'zs-good';
  const crCls    = r => r >= 90 ? 'zs-good' : r >= 80 ? 'zs-warn' : 'zs-bad';
  const fB       = v => { const a = Math.abs(v); return a >= 1e9 ? (v/1e9).toFixed(2)+'B' : a >= 1e6 ? (v/1e6).toFixed(0)+'M' : (v/1e3).toFixed(0)+'K'; };
  const bpiVal   = z => z.budget_sales_ytd > 0 ? (z.actual_sales/z.budget_sales_ytd).toFixed(2) : '—';
  const volBpi   = z => z.budget_vol_ytd    > 0 ? (z.actual_vol_produced/z.budget_vol_ytd).toFixed(2) : '—';

  // ── Score dimension mini-bar renderer ───────────────────────────────
  const miniBar = (label, val, color) =>
    `<div style="margin-bottom:3px">
       <div style="display:flex;justify-content:space-between;margin-bottom:2px">
         <span style="font-size:8.5px;color:var(--ds-text-muted);text-transform:uppercase;letter-spacing:.04em">${label}</span>
         <span style="font-size:8.5px;font-weight:700;color:${color}">${val}</span>
       </div>
       <div style="height:4px;background:var(--ds-border);border-radius:2px;overflow:hidden">
         <div style="height:100%;width:${Math.min(100,val)}%;background:${color};border-radius:2px;transition:width .5s ease"></div>
       </div>
     </div>`;

  // ── Table ────────────────────────────────────────────────────────────
  let h = `<table class="zs" style="width:100%" aria-label="Zone performance scorecard"><caption class="sr-only">Zone performance scorecard</caption>
    <thead><tr>
      <th style="text-align:center;width:40px">#</th>
      <th style="text-align:left;min-width:90px">Zone</th>
      <th style="text-align:center;min-width:66px">Score</th>
      <th style="text-align:left;min-width:200px">Score Breakdown</th>
      <th>NRW %</th>
      <th>NRW Var</th>
      <th>Coll Rate</th>
      <th>Revenue budget score</th>
      <th>Production budget score</th>
      <th>Conn Var</th>
      <th>Chem/m³</th>
      <th>Pwr/m³</th>
      <th>Revenue</th>
      <th>Budget Share</th>
    </tr></thead><tbody>`;

  ranked.forEach((z, i) => {
    const sc   = z._score;
    const rc   = ragColor(sc.total);
    const rb   = ragBg(sc.total);
    const dot  = ZONE_CLR[z.zone] || '#64748b';
    const fmt1 = v => Number.isFinite(Number(v)) ? Number(v).toFixed(1) : '—';
    const nvar = Number(z.nrw_variance_pp) > 0 ? '+' + fmt1(z.nrw_variance_pp) + 'pp' : fmt1(z.nrw_variance_pp) + 'pp';
    const nvarCls = z.nrw_variance_pp > 0 ? 'zs-bad' : z.nrw_variance_pp < -2 ? 'zs-good' : 'zs-warn';
    const connVar  = z.conn_variance >= 0 ? '+' + Math.round(z.conn_variance) : Math.round(z.conn_variance);
    const connVarCls = z.conn_variance >= 0 ? 'zs-good' : 'zs-bad';
    const chemM3 = z.actual_vol_produced > 0 ? (z.actual_chems / z.actual_vol_produced).toFixed(1) : '—';
    const pwrM3  = z.actual_vol_produced > 0 ? (z.actual_power  / z.actual_vol_produced).toFixed(1) : '—';

    h += `<tr style="background:${i===0?rb:'transparent'}">
      <td style="text-align:center;font-size:11px;color:var(--ds-text-muted);font-family:var(--ds-mono)">${i+1}</td>
      <td style="font-weight:700">
        <span style="display:inline-flex;align-items:center;gap:7px">
          <span style="width:10px;height:10px;border-radius:50%;background:${dot};flex-shrink:0;display:inline-block"></span>
          ${z.zone}
        </span>
        <div style="font-size:9.5px;color:var(--ds-text-muted);margin-top:2px">${z.schemes} scheme${z.schemes !== 1 ? 's' : ''}</div>
      </td>
      <td style="text-align:center;vertical-align:middle">
        <div style="display:inline-flex;flex-direction:column;align-items:center;gap:3px">
          <span style="font-size:26px;font-weight:800;line-height:1;color:${rc};letter-spacing:-.03em;font-variant-numeric:tabular-nums">${sc.total}</span>
          <span style="font-size:9px;font-weight:700;padding:2px 8px;border-radius:12px;background:${rc}18;color:${rc};text-transform:uppercase;letter-spacing:.06em">${sc.total>=70?'Top Performer':sc.total>=50?'Watch':'Needs Attention'}</span>
        </div>
      </td>
      <td style="vertical-align:middle;padding:10px 8px;min-width:200px">
        ${miniBar('NRW', sc.nrw, sc.nrw>=70?'#16a34a':sc.nrw>=50?'#d97706':'#dc2626')}
        ${miniBar('Collection', sc.coll, sc.coll>=70?'#16a34a':sc.coll>=50?'#d97706':'#dc2626')}
        ${miniBar('Revenue vs Budget', sc.rev, sc.rev>=70?'#16a34a':sc.rev>=50?'#d97706':'#dc2626')}
        ${miniBar('Connections vs Budget', sc.conn, sc.conn>=70?'#16a34a':sc.conn>=50?'#d97706':'#dc2626')}
      </td>
      <td class="${nrwCls(z.actual_nrw_pct)}" style="font-weight:700">${fmt1(z.actual_nrw_pct)}%</td>
      <td class="${nvarCls}">${nvar}</td>
      <td class="${crCls(z.collection_rate)}">${fmt1(z.collection_rate)}%</td>
      <td class="${z.budget_sales_ytd>0&&z.actual_sales/z.budget_sales_ytd>=1?'zs-good':z.budget_sales_ytd>0&&z.actual_sales/z.budget_sales_ytd>=0.9?'zs-warn':'zs-bad'}" style="font-weight:700">${bpiVal(z)}</td>
      <td class="${z.budget_vol_ytd>0&&z.actual_vol_produced/z.budget_vol_ytd>=1?'zs-good':z.budget_vol_ytd>0&&z.actual_vol_produced/z.budget_vol_ytd>=0.9?'zs-warn':'zs-bad'}">${volBpi(z)}</td>
      <td class="${connVarCls}">${connVar}</td>
      <td style="color:var(--ds-text-secondary)">${chemM3}</td>
      <td style="color:var(--ds-text-secondary)">${pwrM3}</td>
      <td class="zs-mono">MK ${fB(z.actual_sales)}</td>
      <td style="color:var(--ds-text-muted)">${fmt1(z.budget_share_pct)}%</td>
    </tr>`;
  });

  h += `</tbody></table>`;
  host.innerHTML = DOMPurify.sanitize(h);
}

/* ═══════════════════════════════════════════════════════════════════════════
   REPORT CENTRE
   ═══════════════════════════════════════════════════════════════════════════ */

const REPORT_TEMPLATES = {
  'board-pack':            { title:'Board Pack',              endpoint:'/api/reports/board-pack',        landscape:true,  ai:true  },
  'management-dashboard':  { title:'Management Dashboard',    endpoint:'/api/reports/operations',        landscape:true,  ai:true  },
  'annual-performance':    { title:'Annual Performance',      endpoint:'/api/reports/zone-comparison',   landscape:true,  ai:false },
  'water-production':      { title:'Water Production & NRW',  endpoint:'/api/reports/operations',        landscape:true,  ai:false },
  'infrastructure-status': { title:'Infrastructure Status',   endpoint:'/api/reports/infrastructure',    landscape:true,  ai:false },
  'service-delivery':      { title:'Service Delivery',        endpoint:'/api/reports/operations',        landscape:false, ai:false },
  'revenue-collections':   { title:'Revenue & Collections',   endpoint:'/api/reports/financial',         landscape:true,  ai:false },
  'budget-performance':    { title:'Budget Performance',      endpoint:'/api/reports/financial',         landscape:true,  ai:false },
  'cost-analysis':         { title:'Operating Cost Analysis', endpoint:'/api/reports/financial',         landscape:false, ai:false },
  'workforce-fleet':       { title:'Workforce & Fleet',       endpoint:'/api/reports/hra',               landscape:false, ai:false },
  'staff-productivity':    { title:'Staff Productivity',      endpoint:'/api/reports/hra',               landscape:false, ai:false },
  'network-infrastructure':{ title:'Network Infrastructure',  endpoint:'/api/reports/infrastructure',    landscape:true,  ai:false },
  'nrw-deep-dive':         { title:'NRW Deep Dive',           endpoint:'/api/reports/nrw-analysis',      landscape:true,  ai:false },
  'zone-comparison':       { title:'Zone Comparison',         endpoint:'/api/reports/zone-comparison',   landscape:true,  ai:false },
  'scheme-performance':    { title:'Scheme Performance',      endpoint:'/api/reports/scheme-performance',landscape:true,  ai:false },
  'monthly-digest':        { title:'Monthly Digest',          endpoint:'/api/reports/board-pack',        landscape:false, ai:false },
};

let _rcCurrentTemplate = null;
let _rcCurrentData = null;

/* ── Benchmarking Tool (WUP001–WUP107) ─────────────────────── */
let _bmIndicators=null;   // cached indicator metadata (static)

async function bmGetIndicators(){
  if(_bmIndicators)return _bmIndicators;
  _bmIndicators=await fetchJsonSafe(`${API}/api/benchmarking/indicators`,{label:'benchmarking/indicators',fallback:[]});
  return _bmIndicators;
}

/* Turn indicator metadata into renderTable row definitions. Section markers
   become group headings; manual (non-derivable) rows are kept but render blank
   and tagged with a muted ' · manual' note so coverage stays transparent. */
function bmBuildRows(meta){
  return meta.map(m=>{
    if(m.type==='section')return{type:'section',label:m.label};
    const label=m.derivable?m.label:`${m.label}  ·  manual`;
    return{label,field:m.field,fmt:m.fmt||'num',annType:m.ann_type||'sum'};
  });
}

async function loadBenchmarking(){
  kpis('bm-kpis',[{l:'Loading…',v:'—'}]);
  try{
    const meta=await bmGetIndicators();
    const d=await fetchJsonSafe(`${API}/api/benchmarking/monthly?${buildParams()}`,{label:'benchmarking/monthly'});
    const cov=d.coverage||{derivable:0,manual:0,total:0};
    const dataMonths=(d.monthly||[]).filter(m=>m.has_data).length;
    kpis('bm-kpis',[
      {l:'Total Indicators',v:F.num(cov.total),s:'WUP001–WUP107',icon:ICON.gauge},
      {l:'Measured from DB',v:F.num(cov.derivable),s:'Auto-derived from monthly returns',cls:'kc-up'},
      {l:'Manual / No Source',v:F.num(cov.manual),s:'Need a separate data source',cls:'kc-nt'},
      {l:'Months with Data',v:F.num(dataMonths)+' / 12',s:d.fiscal_year||'Selected fiscal year',icon:ICON.drop},
    ]);
    document.getElementById('bm-kpis').className='kpi-row kpi-g4';
    renderTable('tbl-benchmarking','SRWB BENCHMARKING TOOL — WUP PERFORMANCE INDICATORS',bmBuildRows(meta),d.monthly,'benchmarking');
    updatePageMeta();
  }catch(e){console.error('benchmarking',e);errMsg('bm-kpis','Benchmarking failed to load');}
}

function loadReportCentre() { updatePageMeta(); _rcInitCentre(); }

/* ── Report Centre: favourites + recent reports ──────────────────────────── */
const RC_FAV_KEY='rc_favourites', RC_RECENT_KEY='rc_recent', RC_RECENT_MAX=6;
const _rcCardMeta={};
let _rcCentreReady=false;

function _rcGetFav(){ try{return JSON.parse(localStorage.getItem(RC_FAV_KEY))||[];}catch{return [];} }
function _rcSetFav(a){ try{localStorage.setItem(RC_FAV_KEY,JSON.stringify(a));}catch{} }
function _rcGetRecent(){ try{return JSON.parse(localStorage.getItem(RC_RECENT_KEY))||[];}catch{return [];} }
function _rcSetRecent(a){ try{localStorage.setItem(RC_RECENT_KEY,JSON.stringify(a));}catch{} }

/* Build id→{icon,title,category} from the static cards and tag each card. */
function _rcIndexCards(){
  document.querySelectorAll('#page-report-centre .rc-card').forEach(card=>{
    const btn=card.querySelector('.rc-generate-btn');
    const m=btn && btn.getAttribute('onclick')?.match(/generateReport\('([^']+)'\)/);
    if(!m) return;
    const id=m[1];
    card.dataset.tpl=id;
    _rcCardMeta[id]={
      icon: card.querySelector('.rc-card-icon')?.textContent || '📄',
      title: card.querySelector('.rc-card-title')?.textContent || REPORT_TEMPLATES[id]?.title || id,
      category: card.closest('.rc-cards')?.id.replace('rc-cards-','') || ''
    };
  });
}

/* Add a pin (star) toggle to each card, once. */
function _rcInjectPins(){
  const star='<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M12 3.6l2.47 5.01 5.53.8-4 3.9.94 5.5L12 16.2l-4.94 2.6.94-5.5-4-3.9 5.53-.8L12 3.6z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  document.querySelectorAll('#page-report-centre .rc-card').forEach(card=>{
    const id=card.dataset.tpl;
    if(!id || card.querySelector('.rc-pin')) return;
    const pin=document.createElement('button');
    pin.type='button';
    pin.className='rc-pin';
    pin.innerHTML=star;
    pin.addEventListener('click',e=>toggleReportFavourite(id,e));
    card.appendChild(pin);
  });
}

function toggleReportFavourite(id,ev){
  if(ev) ev.stopPropagation();
  const fav=_rcGetFav();
  const i=fav.indexOf(id);
  if(i>=0) fav.splice(i,1); else fav.push(id);
  _rcSetFav(fav);
  applyReportFavourites();
}

/* Reflect favourite state on stars and float pinned cards to the top of each tab. */
function applyReportFavourites(){
  const fav=_rcGetFav();
  document.querySelectorAll('#page-report-centre .rc-card').forEach(card=>{
    const isFav=fav.includes(card.dataset.tpl);
    card.classList.toggle('rc-card-fav',isFav);
    const pin=card.querySelector('.rc-pin');
    if(pin){ pin.classList.toggle('active',isFav); pin.title=isFav?'Unpin from top':'Pin to top'; pin.setAttribute('aria-pressed',isFav?'true':'false'); }
  });
  document.querySelectorAll('#page-report-centre .rc-cards').forEach(cont=>{
    [...cont.querySelectorAll('.rc-card')]
      .sort((a,b)=>(fav.includes(a.dataset.tpl)?0:1)-(fav.includes(b.dataset.tpl)?0:1))
      .forEach(c=>cont.appendChild(c));
  });
}

function _rcScopeLabel(s){
  if(!s) return 'Current scope';
  const fy=s.year?`FY ${s.year-1}/${String(s.year).slice(-2)}`:'FY —';
  const z=(''+(s.zones||'')).split(',').filter(Boolean);
  const m=(''+(s.months||'')).split(',').filter(Boolean);
  const zTxt=z.length?(z.length===1?z[0]:`${z.length} zones`):'All zones';
  const mTxt=m.length?`${m.length} mo`:'All months';
  return `${fy} · ${zTxt} · ${mTxt}`;
}

function _rcPushRecent(id,scope){
  const same=r=>r.id===id && r.scope.year===scope.year && r.scope.zones===scope.zones && r.scope.months===scope.months;
  let rec=_rcGetRecent().filter(r=>!same(r));
  rec.unshift({id,scope,ts:Date.now()});
  _rcSetRecent(rec.slice(0,RC_RECENT_MAX));
  renderRecentReports();
}

function rerunRecentReport(r){ if(r&&r.id) generateReport(r.id,r.scope); }

function clearRecentReports(){ _rcSetRecent([]); renderRecentReports(); }

/* Render the Recent strip (DOM-built — no inline handlers to survive sanitising). */
function renderRecentReports(){
  const wrap=document.getElementById('rc-recent');
  if(!wrap) return;
  const rec=_rcGetRecent().filter(r=>REPORT_TEMPLATES[r.id]);
  wrap.innerHTML='';
  if(!rec.length){ wrap.hidden=true; return; }
  wrap.hidden=false;

  const head=document.createElement('div'); head.className='rc-recent-head';
  const lbl=document.createElement('span'); lbl.className='rc-recent-label'; lbl.textContent='Recent reports';
  const clr=document.createElement('button'); clr.type='button'; clr.className='rc-recent-clear'; clr.textContent='Clear'; clr.addEventListener('click',clearRecentReports);
  head.append(lbl,clr);

  const row=document.createElement('div'); row.className='rc-recent-row';
  rec.forEach(r=>{
    const meta=_rcCardMeta[r.id]||{icon:'📄',title:REPORT_TEMPLATES[r.id]?.title||r.id};
    const scopeTxt=_rcScopeLabel(r.scope);
    const chip=document.createElement('button'); chip.type='button'; chip.className='rc-recent-chip';
    chip.title=`Re-run ${meta.title} — ${scopeTxt}`;
    const ico=document.createElement('span'); ico.className='rc-recent-ico'; ico.textContent=meta.icon;
    const box=document.createElement('span'); box.className='rc-recent-meta';
    const t=document.createElement('span'); t.className='rc-recent-title'; t.textContent=meta.title;
    const sc=document.createElement('span'); sc.className='rc-recent-scope'; sc.textContent=scopeTxt;
    box.append(t,sc); chip.append(ico,box);
    chip.addEventListener('click',()=>rerunRecentReport(r));
    row.appendChild(chip);
  });
  wrap.append(head,row);
}

function _rcInitCentre(){
  if(!_rcCentreReady){
    _rcIndexCards();
    _rcInjectPins();
    _rcCentreReady=true;
  }
  applyReportFavourites();
  renderRecentReports();
}

/* ── Board pack assembly (combine several reports into one document) ─────── */
const BOARD_PACK_PRESET = ['board-pack','water-production','revenue-collections','zone-comparison'];
const RC_CATEGORY_LABELS = {executive:'Executive',operations:'Operations',financial:'Financial',hra:'HRA',infrastructure:'Infrastructure',custom:'Custom'};
let _rcCombined = false;

function openBoardPackBuilder(){
  if(!_rcCentreReady) _rcInitCentre();
  const sc=document.getElementById('bp-scope'); if(sc) sc.innerHTML=DOMPurify.sanitize(buildCompactFilterSummary());
  renderBoardPackList(BOARD_PACK_PRESET);
  document.getElementById('bp-modal')?.classList.add('open');
  document.body.classList.add('bp-open');
}
function closeBoardPackBuilder(){
  document.getElementById('bp-modal')?.classList.remove('open');
  document.body.classList.remove('bp-open');
}
function renderBoardPackList(checkedIds){
  const list=document.getElementById('bp-list'); if(!list) return;
  const checked=new Set(checkedIds||[]);
  list.innerHTML='';
  const byCat={};
  Object.keys(REPORT_TEMPLATES).forEach(id=>{
    const cat=_rcCardMeta[id]?.category||'custom';
    (byCat[cat]=byCat[cat]||[]).push(id);
  });
  ['executive','operations','financial','hra','infrastructure','custom'].forEach(cat=>{
    const ids=byCat[cat]; if(!ids||!ids.length) return;
    const grp=document.createElement('div'); grp.className='bp-group';
    const gh=document.createElement('div'); gh.className='bp-group-head'; gh.textContent=RC_CATEGORY_LABELS[cat]||cat;
    grp.appendChild(gh);
    ids.forEach(id=>{
      const meta=_rcCardMeta[id]||{icon:'📄',title:REPORT_TEMPLATES[id]?.title||id};
      const row=document.createElement('label'); row.className='bp-row';
      const cb=document.createElement('input'); cb.type='checkbox'; cb.value=id; cb.checked=checked.has(id); cb.className='bp-check';
      cb.addEventListener('change',updateBoardPackCount);
      const ico=document.createElement('span'); ico.className='bp-row-ico'; ico.textContent=meta.icon;
      const t=document.createElement('span'); t.className='bp-row-title'; t.textContent=meta.title;
      row.append(cb,ico,t);
      grp.appendChild(row);
    });
    list.appendChild(grp);
  });
  updateBoardPackCount();
}
function _bpChecks(){ return [...document.querySelectorAll('#bp-list .bp-check')]; }
function _bpSelected(){ return _bpChecks().filter(c=>c.checked).map(c=>c.value); }
function updateBoardPackCount(){
  const n=_bpSelected().length;
  const el=document.getElementById('bp-count'); if(el) el.textContent=`${n} selected`;
  const btn=document.getElementById('bp-build-btn'); if(btn) btn.disabled=n===0;
}
function selectBoardPackPreset(){ const s=new Set(BOARD_PACK_PRESET); _bpChecks().forEach(c=>c.checked=s.has(c.value)); updateBoardPackCount(); }
function setBoardPackAll(v){ _bpChecks().forEach(c=>c.checked=v); updateBoardPackCount(); }

async function buildBoardPack(){
  const ids=_bpSelected(); if(!ids.length) return;
  closeBoardPackBuilder();
  _rcCombined=true; _rcCurrentTemplate=null;
  const overlay=document.getElementById('report-output-overlay');
  const content=document.getElementById('report-output-content');
  const roTitle=document.getElementById('ro-title');
  const printBtn=document.getElementById('ro-print-btn');
  const exportBtn=document.getElementById('ro-export-btn');
  roTitle.textContent='Board Pack — Combined';
  printBtn.style.display='none'; exportBtn.style.display='none';
  content.innerHTML=DOMPurify.sanitize(`<div class="ro-spinner"><div class="ro-spinner-ring"></div><div class="ro-spinner-label">Assembling ${ids.length} report${ids.length>1?'s':''}…</div></div>`);
  overlay.classList.add('open'); document.body.classList.add('ro-open');

  try{
    const token=getToken();
    const year=dbState.year || new Date().getFullYear();
    const zones=filterState.zones.join(',');
    const months=filterState.months.join(',');
    const scope=[`FY ${year-1}/${String(year).slice(-2)}`, zones||'All Zones', months ? months.split(',').length+' months' : 'All Months'].join(' · ');
    const generated=new Date().toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});

    let narrative=null;
    if(ids.some(id=>REPORT_TEMPLATES[id]?.ai)){
      try{ narrative=await fetchJsonSafe(`${API}/api/insights/summary?year=${year}`,{token,fallback:null,label:'insights/summary'}); }catch{}
    }

    const sections=[];
    for(const id of ids){
      const tpl=REPORT_TEMPLATES[id]; if(!tpl) continue;
      let url=`${API}${tpl.endpoint}?year=${year}`;
      if(zones) url+=`&zones=${encodeURIComponent(zones)}`;
      if(months) url+=`&months=${encodeURIComponent(months)}`;
      let body;
      try{
        const data=await fetchJsonSafe(url,{token,label:tpl.endpoint});
        body=_rcIsEmpty(data)
          ? `${_rcHeader(tpl.title,scope,generated)}<div class="ro-empty"><div class="ro-empty-icon">📭</div><div class="ro-empty-title">No data for this section</div><div class="ro-empty-msg">No ${tpl.title} data for the selected scope.</div></div>`
          : _rcRender(id,data,tpl.ai?narrative:null,{year,zones,months,scope,generated});
      }catch(e){
        body=`${_rcHeader(tpl.title,scope,generated)}<div class="ro-error"><strong>Failed to load ${tpl.title}</strong></div>`;
      }
      sections.push({title:(_rcCardMeta[id]?.title||tpl.title),body});
    }

    const cover=`<section class="bp-cover">
      <div class="bp-cover-org">Southern Region Water Board · Malawi</div>
      <div class="bp-cover-title">Board Pack</div>
      <div class="bp-cover-scope">${scope}</div>
      <div class="bp-cover-gen">Generated ${generated}</div>
      <div class="bp-toc"><div class="bp-toc-title">Contents</div><ol>${sections.map(s=>`<li>${s.title}</li>`).join('')}</ol></div>
    </section>`;
    const bodyHtml=sections.map((s,i)=>`<section class="bp-section${i>0?' bp-pagebreak':''}">${s.body}</section>`).join('');
    content.innerHTML=DOMPurify.sanitize(cover+bodyHtml);
    printBtn.style.display=''; exportBtn.style.display='';
  }catch(e){
    content.innerHTML=DOMPurify.sanitize(`<div class="ro-error"><strong>Failed to assemble board pack</strong><br><span style="font-size:12px">${e.message}</span></div>`);
  }
}

function switchReportCategory(cat) {
  // Picking a category always exits search mode.
  const si = document.getElementById('rc-search');
  if (si) si.value = '';
  document.querySelectorAll('.rc-card').forEach(c => { c.style.display = ''; });
  const nr = document.getElementById('rc-no-results'); if (nr) nr.hidden = true;
  document.querySelectorAll('.rc-tab').forEach(t => t.classList.toggle('active', t.dataset.cat === cat));
  document.querySelectorAll('.rc-cards').forEach(c => c.classList.toggle('rc-cards-hidden', c.id !== 'rc-cards-' + cat));
}

/* Search across every template (title, description, tags) regardless of tab. */
function filterReportTemplates(q) {
  const query = (q || '').trim().toLowerCase();
  const nr = document.getElementById('rc-no-results');
  if (!query) {
    // Restore the active category view.
    const active = document.querySelector('.rc-tab.active')?.dataset.cat || 'executive';
    document.querySelectorAll('.rc-card').forEach(c => { c.style.display = ''; });
    document.querySelectorAll('.rc-cards').forEach(c => c.classList.toggle('rc-cards-hidden', c.id !== 'rc-cards-' + active));
    if (nr) nr.hidden = true;
    return;
  }
  let matches = 0;
  document.querySelectorAll('.rc-cards').forEach(cont => {
    let any = false;
    cont.querySelectorAll('.rc-card').forEach(card => {
      const hit = card.textContent.toLowerCase().includes(query);
      card.style.display = hit ? '' : 'none';
      if (hit) { any = true; matches++; }
    });
    cont.classList.toggle('rc-cards-hidden', !any);
  });
  if (nr) {
    nr.hidden = matches > 0;
    const qEl = document.getElementById('rc-no-results-q');
    if (qEl) qEl.textContent = `"${q.trim()}"`;
  }
}

async function generateReport(templateId, scopeOverride) {
  const tpl = REPORT_TEMPLATES[templateId]; if(!tpl) return;
  _rcCurrentTemplate = templateId;
  _rcCombined = false;
  const overlay = document.getElementById('report-output-overlay');
  const content = document.getElementById('report-output-content');
  const roTitle = document.getElementById('ro-title');
  const printBtn = document.getElementById('ro-print-btn');
  const exportBtn = document.getElementById('ro-export-btn');
  roTitle.textContent = tpl.title;
  printBtn.style.display = 'none'; exportBtn.style.display = 'none';
  content.innerHTML = DOMPurify.sanitize(`<div class="ro-spinner"><div class="ro-spinner-ring"></div><div class="ro-spinner-label">Generating ${tpl.title}…</div></div>`);
  overlay.classList.add('open');
  document.body.classList.add('ro-open');
  try {
    const token = getToken();
    // A scope override (from the Recent strip) reproduces a past run without
    // touching the global filters; otherwise use the current dashboard scope.
    const year = scopeOverride?.year || dbState.year || new Date().getFullYear();
    const zones = scopeOverride ? (scopeOverride.zones || '') : filterState.zones.join(',');
    const months = scopeOverride ? (scopeOverride.months || '') : filterState.months.join(',');
    let url = `${API}${tpl.endpoint}?year=${year}`;
    if(zones) url += `&zones=${encodeURIComponent(zones)}`;
    if(months) url += `&months=${encodeURIComponent(months)}`;
    const data = await fetchJsonSafe(url, {token, label:tpl.endpoint});
    if(_rcIsEmpty(data)){
      const scopeTxt = [`FY ${year-1}/${String(year).slice(-2)}`, zones||'All Zones', months ? months.split(',').length+' months' : 'All Months'].join(' · ');
      content.innerHTML = DOMPurify.sanitize(`<div class="ro-empty"><div class="ro-empty-icon">📭</div><div class="ro-empty-title">No data for this report</div><div class="ro-empty-msg">There is no data for <strong>${tpl.title}</strong> in the selected scope (${scopeTxt}). Try a different fiscal year, zone, or period — or upload the monthly returns for this period.</div></div>`);
      return;
    }
    let narrative = null;
    if(tpl.ai){
      try{ narrative = await fetchJsonSafe(`${API}/api/insights/summary?year=${year}`,{token,fallback:null,label:'insights/summary'}); }catch{}
    }
    const scope = [`FY ${year-1}/${String(year).slice(-2)}`, zones||'All Zones', months ? months.split(',').length+' months' : 'All Months'].join(' · ');
    const generated = new Date().toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
    content.innerHTML = _rcRender(templateId, data, narrative, {year, zones, months, scope, generated});
    printBtn.style.display = ''; exportBtn.style.display = '';
    _rcPushRecent(templateId, {year, zones, months});
  } catch(e) {
    content.innerHTML = DOMPurify.sanitize(`<div class="ro-error"><strong>Failed to generate report</strong><br><span style="font-size:12px;color:var(--ds-text-muted)">${e.message}</span></div>`);
  }
}

function closeReportOutput() {
  document.getElementById('report-output-overlay').classList.remove('open');
  document.body.classList.remove('ro-open');
}

function printGeneratedReport() {
  const tpl = REPORT_TEMPLATES[_rcCurrentTemplate]||{};
  let s = document.getElementById('print-page-size');
  if(!s){s=document.createElement('style');s.id='print-page-size';document.head.appendChild(s);}
  // Combined board packs mix orientations; default to landscape for them.
  const landscape = _rcCombined || tpl.landscape;
  s.textContent = landscape ? `@page{size:297mm 210mm;margin:5mm 6mm}` : `@page{size:210mm 297mm;margin:8mm 10mm}`;
  document.body.classList.add('printing-report','printing-report-overlay');
  window.print();
  setTimeout(()=>document.body.classList.remove('printing-report','printing-report-overlay'),800);
}

function exportReportExcel() {
  const content = document.getElementById('report-output-content'); if(!content) return;
  const tables = content.querySelectorAll('table');
  if(!tables.length){alert('No table data in this report.');return;}
  const wb = XLSX.utils.book_new();
  tables.forEach((tbl,i)=>{
    const ws = XLSX.utils.table_to_sheet(tbl,{raw:false});
    XLSX.utils.book_append_sheet(wb, ws, (tbl.dataset.sheet||`Sheet${i+1}`).slice(0,31));
  });
  const tpl = REPORT_TEMPLATES[_rcCurrentTemplate];
  const name = _rcCombined ? 'Board_Pack' : (tpl?.title || 'Report');
  XLSX.writeFile(wb, `${name}_FY${dbState.year}.xlsx`);
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */
function _rcFmt(n,d=0){if(n==null||isNaN(n))return'—';return Number(n).toLocaleString('en-GB',{minimumFractionDigits:d,maximumFractionDigits:d});}
function _rcMK(n){if(n==null||isNaN(n))return'—';const a=Math.abs(n);if(a>=1e9)return'MK '+(n/1e9).toFixed(2)+'B';if(a>=1e6)return'MK '+(n/1e6).toFixed(1)+'M';if(a>=1e3)return'MK '+(n/1e3).toFixed(0)+'K';return'MK '+_rcFmt(n);}
function _rcPct(n,d=1){return n==null?'—':Number(n).toFixed(d)+'%';}
function _rcTone(v,good,warn,rev=false){if(v==null)return'';if(rev){if(v<=good)return'rc-good';if(v<=warn)return'rc-warn';return'rc-bad';}if(v>=good)return'rc-good';if(v>=warn)return'rc-warn';return'rc-bad';}
function _rcHeader(title,scope,generated){
  return `<div class="rc-rpt-header">
    <div class="rc-rpt-org">Southern Region Water Board · Malawi</div>
    <div class="rc-rpt-title">${title}</div>
    <div class="rc-rpt-meta">${scope} &nbsp;·&nbsp; Generated ${generated}</div>
    <div class="rc-rpt-rule"></div>
  </div>`;
}
function _rcSectionHdr(title){return `<div class="rc-section-hdr">${title}</div>`;}
function _rcKpiRow(cards){return `<div class="rc-kpi-row">${cards.map(c=>`<div class="rc-kpi-card ${c.tone||''}"><div class="rc-kpi-val">${c.val}</div><div class="rc-kpi-lbl">${c.lbl}</div>${c.sub?`<div class="rc-kpi-sub">${c.sub}</div>`:''}</div>`).join('')}</div>`;}
function _rcTable(headers,rows,sheet){
  return `<div class="rc-tbl-wrap"><table class="rc-tbl"${sheet?` data-sheet="${sheet}"`:''}><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map((c,i)=>`<td${i===0?' class="rc-row-label"':''}>${c??'—'}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function _rcNarrative(n){
  if(!n)return'';
  const items=[n.financial_performance,n.operational_efficiency,n.customer_service,n.infrastructure_reliability].filter(Boolean);
  if(!items.length)return'';
  return `<div class="rc-narrative"><div class="rc-narrative-title">AI Performance Narrative</div><div class="rc-narrative-body">${items.map(s=>`<p>${s}</p>`).join('')}</div></div>`;
}

/* True when a report payload carries no usable data for the chosen scope. */
function _rcIsEmpty(d){
  if(d==null) return true;
  if(Array.isArray(d)) return d.length===0;
  if(typeof d==='object'){
    const keys=Object.keys(d);
    if(!keys.length) return true;
    // Empty when every value is null/undefined or an empty array.
    return keys.every(k=>{const v=d[k];return v==null||(Array.isArray(v)&&v.length===0);});
  }
  return false;
}

/* ── Master renderer ─────────────────────────────────────────────────────── */
function _rcRender(templateId, data, narrative, {scope,generated}={}){
  const hdr = _rcHeader(REPORT_TEMPLATES[templateId]?.title||'Report', scope, generated);
  switch(templateId){
    case 'board-pack': case 'management-dashboard': case 'monthly-digest':
      return hdr+_rcBoardPack(data,narrative);
    case 'annual-performance': case 'zone-comparison':
      return hdr+_rcZoneComparison(data);
    case 'water-production': case 'service-delivery':
      return hdr+_rcOperations(data);
    case 'infrastructure-status': case 'network-infrastructure':
      return hdr+_rcInfrastructure(data);
    case 'revenue-collections': case 'budget-performance': case 'cost-analysis':
      return hdr+_rcFinancial(data);
    case 'workforce-fleet': case 'staff-productivity':
      return hdr+_rcHRA(data);
    case 'nrw-deep-dive':
      return hdr+_rcNRWAnalysis(data);
    case 'scheme-performance':
      return hdr+_rcSchemePerf(data);
    default:
      return hdr+`<p style="padding:12px;color:var(--ds-text-muted)">Report data loaded successfully.</p>`;
  }
}

/* ── Board Pack ─────────────────────────────────────────────────────────── */
function _rcBoardPack(d,narrative){
  const f=d.financial||{},op=d.operational||{},z=d.zone_risks||[];
  let h='';
  h+=_rcSectionHdr('Key Performance Indicators');
  h+=_rcKpiRow([
    {val:_rcMK(f.total_revenue),      lbl:'Total Revenue',   sub:'YTD'},
    {val:_rcPct(f.collection_rate),   lbl:'Collection Rate', sub:'IBNET >90%', tone:_rcTone(f.collection_rate,90,75)},
    {val:_rcPct(op.avg_nrw_pct),      lbl:'NRW Rate',        sub:'SRWB <27%',  tone:_rcTone(op.avg_nrw_pct,27,35,true)},
    {val:_rcFmt(f.op_ratio,2),        lbl:'Operating Ratio', sub:'W.Bank <1.0',tone:_rcTone(f.op_ratio,1.0,1.2,true)},
    {val:_rcFmt(f.dso),               lbl:'DSO (days)',       sub:'IBNET <90d', tone:_rcTone(f.dso,90,120,true)},
    {val:_rcFmt((op.total_production||0)/1e6,2)+'M m³',lbl:'Vol Produced',sub:'YTD'},
  ]);
  h+=_rcSectionHdr('Financial Snapshot');
  h+=_rcTable(['Indicator','Value','Benchmark'],[
    ['Total Revenue (YTD)',       _rcMK(f.total_revenue),    '—'],
    ['Total Cash Collected',      _rcMK(f.total_collected),  '—'],
    ['Collection Rate',           _rcPct(f.collection_rate), '>90% (IBNET)'],
    ['Total Operating Costs',     _rcMK(f.total_op_cost),    '—'],
    ['Operating Ratio',           _rcFmt(f.op_ratio,2),      '<1.0 (World Bank)'],
    ['Total Debtors Outstanding', _rcMK(f.total_debtors),    '—'],
    ['Days Sales Outstanding',    _rcFmt(f.dso)+' days',     '<90d (IBNET)'],
  ],'Financial Snapshot');
  if(z.length){
    h+=_rcSectionHdr('Zone Risk Ranking');
    h+=_rcTable(['Zone','NRW %','Collection Rate','DSO (days)','Risk Score'],
      z.map(r=>[r.zone,_rcPct(r.nrw_pct),_rcPct(r.collection_rate),_rcFmt(r.dso),_rcFmt(r.risk_score,1)]),'Zone Risks');
  }
  const yoy=d.yoy_comparison||{};
  if(Object.keys(yoy).length){
    h+=_rcSectionHdr('Year-on-Year Comparison');
    h+=_rcTable(['Metric','Prior Year','Current Year','Change'],
      Object.entries(yoy).map(([k,v])=>[
        k.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase()),
        v.prior!=null?(k.includes('revenue')||k.includes('cost')||k.includes('collected')?_rcMK(v.prior):(k.includes('pct')||k.includes('rate')?_rcPct(v.prior):_rcFmt(v.prior,1))):'—',
        v.current!=null?(k.includes('revenue')||k.includes('cost')||k.includes('collected')?_rcMK(v.current):(k.includes('pct')||k.includes('rate')?_rcPct(v.current):_rcFmt(v.current,1))):'—',
        v.change_pct!=null?(v.change_pct>=0?`▲ +${v.change_pct.toFixed(1)}%`:`▼ ${v.change_pct.toFixed(1)}%`):'—',
      ]),'YoY Comparison');
  }
  const trend=d.nrw_trend||[];
  if(trend.length){
    h+=_rcSectionHdr('NRW Rate — 12-Month Trend');
    h+=_rcTable(['Month','NRW %'],trend.map(t=>[t.month,_rcPct(t.value)]),'NRW Trend');
  }
  h+=_rcNarrative(narrative);
  return h;
}

/* ── Zone Comparison ─────────────────────────────────────────────────────── */
function _rcZoneComparison(d){
  const zones=d.zones||[];
  let h=_rcSectionHdr('Cross-Zone KPI Comparison');
  h+=_rcTable(['Zone','Vol Produced (m³)','NRW %','Collection Rate','Active Customers','Breakdowns','DSO (days)','Op Cost/m³'],
    zones.map(z=>[z.zone,_rcFmt(z.vol_produced),_rcPct(z.nrw_pct),_rcPct(z.collection_rate),_rcFmt(z.active_customers),_rcFmt(z.breakdowns),_rcFmt(z.dso),_rcFmt(z.op_cost_per_m3,2)]),'Zone Comparison');
  return h;
}

/* ── Operations ──────────────────────────────────────────────────────────── */
function _rcOperations(d){
  const prod=d.production_summary||{};
  let h=_rcSectionHdr('Production Overview');
  h+=_rcKpiRow([
    {val:_rcFmt((prod.total_vol_produced||0)/1e6,2)+'M m³',lbl:'Total Produced'},
    {val:_rcFmt((prod.total_revenue_water||0)/1e6,2)+'M m³',lbl:'Revenue Water'},
    {val:_rcPct(prod.avg_nrw_pct),lbl:'Avg NRW Rate',tone:_rcTone(prod.avg_nrw_pct,27,35,true)},
    {val:_rcFmt(prod.avg_energy_intensity,2)+' kWh/m³',lbl:'Energy Intensity',tone:_rcTone(prod.avg_energy_intensity,0.5,0.7,true)},
  ]);
  const bz=d.nrw_by_zone||[];
  if(bz.length){
    h+=_rcSectionHdr('NRW by Zone');
    h+=_rcTable(['Zone','Vol Produced (m³)','NRW Volume (m³)','NRW %','vs Target'],
      bz.map(z=>[z.zone,_rcFmt(z.vol_produced),_rcFmt(z.nrw_vol),_rcPct(z.nrw_pct),z.nrw_pct>27?`▲ +${(z.nrw_pct-27).toFixed(1)}pp`:'✓ On target']),'NRW by Zone');
  }
  const trend=d.monthly_production_trend||[];
  if(trend.length){
    h+=_rcSectionHdr('Monthly Production Trend');
    h+=_rcTable(['Month','Vol Produced (m³)'],trend.map(t=>[t.month,_rcFmt(t.value)]),'Production Trend');
  }
  const bd=d.breakdowns_by_zone||[];
  if(bd.length){
    h+=_rcSectionHdr('Breakdown Incidents by Zone');
    h+=_rcTable(['Zone','Pipe Breaks','Pump Breaks','Pump Hours Lost','Supply Hours/Day'],
      bd.map(z=>[z.zone,_rcFmt(z.pipe_breakdowns),_rcFmt(z.pump_breakdowns),_rcFmt(z.pump_hours_lost),_rcFmt(z.supply_hours,1)]),'Breakdowns');
  }
  return h;
}

/* ── Financial ───────────────────────────────────────────────────────────── */
function _rcFinancial(d){
  const s=d.summary||{};
  let h=_rcSectionHdr('Financial Performance Summary');
  h+=_rcKpiRow([
    {val:_rcMK(s.total_revenue),    lbl:'Total Revenue'},
    {val:_rcMK(s.total_collected),  lbl:'Cash Collected'},
    {val:_rcPct(s.collection_rate), lbl:'Collection Rate',tone:_rcTone(s.collection_rate,90,75)},
    {val:_rcMK(s.total_op_cost),    lbl:'Operating Costs'},
    {val:_rcFmt(s.op_ratio,2),      lbl:'Operating Ratio',tone:_rcTone(s.op_ratio,1.0,1.2,true)},
    {val:_rcFmt(s.dso)+'d',         lbl:'DSO',tone:_rcTone(s.dso,90,120,true)},
  ]);
  const dz=d.debtors_by_zone||[];
  if(dz.length){
    h+=_rcSectionHdr('Debtors by Zone');
    h+=_rcTable(['Zone','Total Debtors','Private','Public','DSO (days)'],
      dz.map(z=>[z.zone,_rcMK(z.total_debtors),_rcMK(z.private_debtors),_rcMK(z.public_debtors),_rcFmt(z.dso)]),'Debtors by Zone');
  }
  const trend=d.billed_vs_collected_trend||[];
  if(trend.length){
    h+=_rcSectionHdr('Billed vs Collected — Monthly');
    h+=_rcTable(['Month','Total Billed','Cash Collected','Collection Rate'],
      trend.map(t=>[t.month,_rcMK(t.billed),_rcMK(t.collected),_rcPct(t.collection_rate)]),'Billed vs Collected');
  }
  const bv=d.budget_variance||[];
  if(bv.length){
    h+=_rcSectionHdr('Budget Variance');
    h+=_rcTable(['Category','Budget','Actual','Variance','%'],
      bv.map(r=>[r.category,_rcMK(r.budget),_rcMK(r.actual),_rcMK(r.variance),_rcPct(r.variance_pct)]),'Budget Variance');
  }
  return h;
}

/* ── HRA ─────────────────────────────────────────────────────────────────── */
function _rcHRA(d){
  const s=d.summary||{};
  let h=_rcSectionHdr('Workforce Overview');
  h+=_rcKpiRow([
    {val:_rcFmt(s.total_perm_staff),   lbl:'Permanent Staff'},
    {val:_rcFmt(s.total_temp_staff),   lbl:'Temporary Staff'},
    {val:_rcFmt(s.total_staff),        lbl:'Total Staff'},
    {val:_rcFmt(s.avg_m3_per_staff,0), lbl:'m³ per Staff'},
    {val:_rcMK(s.total_wages),         lbl:'Total Wages'},
    {val:_rcFmt(s.total_fuel_litres,0)+' L',lbl:'Fuel Used'},
  ]);
  const bz=d.staff_by_zone||[];
  if(bz.length){
    h+=_rcSectionHdr('Staff & Productivity by Zone');
    h+=_rcTable(['Zone','Perm','Temp','Total','m³/Staff','Wages','Fuel (L)','Distances (km)'],
      bz.map(z=>[z.zone,_rcFmt(z.perm_staff),_rcFmt(z.temp_staff),_rcFmt(z.total_staff),_rcFmt(z.m3_per_staff,0),_rcMK(z.wages),_rcFmt(z.fuel_litres,0),_rcFmt(z.distances_km,0)]),'Staff by Zone');
  }
  return h;
}

/* ── Infrastructure ──────────────────────────────────────────────────────── */
function _rcInfrastructure(d){
  const s=d.summary||{};
  let h=_rcSectionHdr('Infrastructure Summary');
  h+=_rcKpiRow([
    {val:_rcFmt(s.total_pipe_breakdowns),lbl:'Pipe Breakdowns',tone:_rcTone(s.total_pipe_breakdowns,50,100,true)},
    {val:_rcFmt(s.total_pump_breakdowns),lbl:'Pump Breakdowns'},
    {val:_rcFmt(s.total_pump_hours_lost),lbl:'Pump Hours Lost'},
    {val:_rcFmt(s.total_stuck_meters),   lbl:'Stuck Meters'},
    {val:_rcFmt(s.total_dev_lines),      lbl:'Pipe Extensions'},
    {val:_rcFmt(s.avg_supply_hours,1)+'h',lbl:'Avg Supply Hrs/Day',tone:_rcTone(s.avg_supply_hours,20,16)},
  ]);
  const bz=d.breakdowns_by_zone||[];
  if(bz.length){
    h+=_rcSectionHdr('Breakdown Analysis by Zone');
    h+=_rcTable(['Zone','Pipe Breaks','Pump Breaks','Hours Lost','Supply Hrs/Day','Power Fail Hrs'],
      bz.map(z=>[z.zone,_rcFmt(z.pipe_breakdowns),_rcFmt(z.pump_breakdowns),_rcFmt(z.pump_hours_lost),_rcFmt(z.supply_hours,1),_rcFmt(z.power_fail_hours)]),'Breakdowns by Zone');
  }
  const ext=d.extensions_by_size||[];
  if(ext.length){
    h+=_rcSectionHdr('Pipeline Extensions by Size');
    h+=_rcTable(['Pipe Size','Total Length (m)'],ext.map(r=>[r.size,_rcFmt(r.total_length)]),'Extensions');
  }
  return h;
}

/* ── NRW Analysis ────────────────────────────────────────────────────────── */
function _rcNRWAnalysis(d){
  const s=d.summary||{};
  let h=_rcSectionHdr('NRW Summary');
  h+=_rcKpiRow([
    {val:_rcFmt((s.total_vol_produced||0)/1e6,2)+'M m³',lbl:'Total Produced'},
    {val:_rcFmt((s.total_nrw_vol||0)/1e6,2)+'M m³',     lbl:'Total NRW'},
    {val:_rcPct(s.avg_nrw_pct),lbl:'Avg NRW Rate',tone:_rcTone(s.avg_nrw_pct,27,35,true)},
    {val:(d.zones_above_target||[]).length+' zones',lbl:'Above 27% Target'},
  ]);
  const bz=d.nrw_by_zone||[];
  if(bz.length){
    h+=_rcSectionHdr('NRW by Zone vs 27% Target');
    h+=_rcTable(['Zone','Vol Produced (m³)','NRW Volume (m³)','NRW %','Gap to Target','Status'],
      bz.map(z=>[z.zone,_rcFmt(z.vol_produced),_rcFmt(z.nrw_vol),_rcPct(z.nrw_pct),Math.abs(z.nrw_pct-27).toFixed(1)+'pp',z.nrw_pct>27?'⚠ Above':'✓ On target']),'NRW by Zone');
  }
  const trend=d.nrw_trend||[];
  if(trend.length){
    h+=_rcSectionHdr('NRW Rate Monthly Trend');
    h+=_rcTable(['Month','NRW %'],trend.map(t=>[t.month,_rcPct(t.value)]),'NRW Trend');
  }
  return h;
}

/* ── Scheme Performance ──────────────────────────────────────────────────── */
function _rcSchemePerf(d){
  const schemes=d.schemes||[];
  let h=_rcSectionHdr(`Scheme Performance (${schemes.length} schemes)`);
  if(!schemes.length) return h+'<p style="padding:12px;color:var(--ds-text-muted)">No scheme data for selected filter.</p>';
  return h+_rcTable(['Scheme','Zone','Vol Produced (m³)','NRW %','Active Customers','Cash Collected','Debtors','Breakdowns'],
    schemes.map(s=>[s.scheme,s.zone,_rcFmt(s.vol_produced),_rcPct(s.nrw_pct),_rcFmt(s.active_customers),_rcMK(s.cash_collected),_rcMK(s.total_debtors),_rcFmt(s.breakdowns)]),'Scheme Performance');
}

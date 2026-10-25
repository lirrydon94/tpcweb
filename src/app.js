import * as model from './model.js';
import * as store from './store.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...(root.querySelectorAll(selector) || [])];
const esc = (value = '') => String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const icons = {
  calendar:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M16 3v4M8 3v4M3 11h18m-13 4h2m4 0h2"/>',
  team:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87"/><circle cx="9" cy="7" r="4"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  settings:'<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="10" cy="18" r="2"/>',
  gear:'<path d="M10 2h4l.6 3 2 .9 2.9-1 2 3.5-2.2 2v2.2l2.2 2-2 3.5-2.9-1-2 .9-.6 3h-4l-.6-3-2-.9-2.9 1-2-3.5 2.2-2v-2.2l-2.2-2 2-3.5 2.9 1 2-.9.6-3Z"/><circle cx="12" cy="11.5" r="3.5"/>',
  left:'<path d="m14 7-5 5 5 5"/>', right:'<path d="m10 7 5 5-5 5"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  plus:'<path d="M12 5v14M5 12h14"/>', check:'<path d="m5 12 4 4L19 6"/>',
  arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>', leaf:'<path d="M20 4c-9-2-16 2-16 9a6 6 0 0 0 6 6c7 0 10-6 10-15ZM5 19l9-9"/>',
  download:'<path d="M12 3v12m-4-4 4 4 4-4M4 17v4h16v-4"/>',
  edit:'<path d="m16 3 5 5L9 20l-6 1 1-6L16 3ZM13 6l5 5"/>',
  close:'<path d="m6 6 12 12M18 6 6 18"/>', moon:'<path d="M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11Z"/>',
  refresh:'<path d="M20 7v5h-5M4 17v-5h5M6 6a8 8 0 0 1 13 2M18 18a8 8 0 0 1-13-2"/>',
  logout:'<path d="M9 5H4v14h5m5-14 7 7-7 7m-6-7h13"/>', info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>',
  down:'<path d="m6 9 6 6 6-6"/>'
};
const icon = (name, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.calendar}</svg>`;
const today = () => new Intl.DateTimeFormat('en-CA', {timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const fmt = (date, options) => new Intl.DateTimeFormat('sv-SE', {...options,timeZone:'UTC'}).format(new Date(date + 'T12:00:00Z'));
const weekdayLabels = ['Mån','Tis','Ons','Tor','Fre','Lör','Sön'];
const weekdayNames = ['måndag','tisdag','onsdag','torsdag','fredag','lördag','söndag'];
const daysOffLabel = count => `${count} ${count===1?'ledig dag':'lediga dagar'}`;
const weeksLabel = count => `${count} ${count===1?'vecka':'veckor'}`;
const colorLabel = color => ({amber:'Bärnsten',mint:'Mintgrön',blue:'Blå',lavender:'Lavendel',purple:'Lila',teal:'Turkos',rose:'Rosa',peach:'Persika',sage:'Salviagrön',red:'Röd',orange:'Orange',yellow:'Gul',cyan:'Cyan',indigo:'Indigo',pink:'Rosa',slate:'Gråblå'}[color] || color);
const urlParams = new URLSearchParams(location.search);
const deployedAssetVersion = '__APP_BUILD_VERSION__';
const ui = {view:'schedule',date:urlParams.get('date') && /^\d{4}-\d{2}-\d{2}$/.test(urlParams.get('date')) && !isNaN(Date.parse(urlParams.get('date'))) ? urlParams.get('date') : today(), teamId:localStorage.getItem('skift-team') || urlParams.get('team'),memberId:localStorage.getItem('skift-person'),adminTab:'people',editingSchedule:false,busy:false};
const navigationKey = `skift-navigation:${location.pathname || '/'}${location.search || ''}`;
// File synchronization triggers Live Server reloads. Keep navigation in this
// tab, independently of schedule data and without restoring admin permissions.
try {
  const saved = JSON.parse(sessionStorage.getItem(navigationKey) || 'null');
  if (saved && ['schedule','admin'].includes(saved.view)) {
    ui.view = saved.view;
    if (['people','rotation','changes'].includes(saved.adminTab)) ui.adminTab = saved.adminTab;
    for (const key of ['teamId','departmentId','workTeamId']) {
      if (typeof saved[key] === 'string') ui[key] = saved[key];
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(saved.date) && !isNaN(Date.parse(saved.date))) ui.date = saved.date;
    for(const key of ['changeQuery','changeYear','changeMonth','changeType'])if(typeof saved[key]==='string')ui[key]=saved[key];
    if(typeof saved.changeAllTeams==='boolean')ui.changeAllTeams=saved.changeAllTeams;
    if(Number.isSafeInteger(saved.changePage)&&saved.changePage>=0)ui.changePage=saved.changePage;
    for(const key of ['changeOpenPeople','changeOpenPeriods'])if(Array.isArray(saved[key]))ui[key]=saved[key].filter(value=>typeof value==='string');
  }
} catch { /* Navigation still works if session storage is unavailable. */ }
// Preserve filters saved by the previous combined year/month picker.
if(/^\d{4}-\d{2}$/.test(ui.changeMonth||'')){
  ui.changeYear=ui.changeMonth.slice(0,4);ui.changeMonth=ui.changeMonth.slice(5,7);
}
function rememberNavigation() {
  const { view, adminTab, teamId, departmentId, workTeamId, date, changeQuery, changeYear, changeMonth, changeType, changeAllTeams, changePage, changeOpenPeople, changeOpenPeriods } = ui;
  try { sessionStorage.setItem(navigationKey, JSON.stringify({ view, adminTab, teamId, departmentId, workTeamId, date, changeQuery, changeYear, changeMonth, changeType, changeAllTeams, changePage, changeOpenPeople, changeOpenPeriods })); } catch {}
}
let workspace;
const adminRememberKey = 'skift-admin-remembered';
try { localStorage.removeItem?.(adminRememberKey); } catch {}
const rememberedAdmin = () => { try { return sessionStorage.getItem(adminRememberKey) === 'true'; } catch { return false; } };
let adminUnlocked = rememberedAdmin();
const mobileViewport = window.matchMedia?.('(max-width: 800px)');
// Touch phones can be wider than the mobile layout breakpoint in landscape.
const rosterTouchViewport = window.matchMedia?.('(max-width: 800px), (pointer: coarse)');
const hasAdminRole = () => workspace?.role === 'admin' && !mobileViewport?.matches;
mobileViewport?.addEventListener('change', () => {
  cancelRosterHold();
  if (!rosterTouchViewport?.matches) ui.rosterMemberId = undefined;
  if (mobileViewport.matches) {
    adminUnlocked = false;
    ui.editingSchedule = false;
    ui.view = 'schedule';
    $('#modal').close();
  }
  if (workspace) shell();
});
rosterTouchViewport?.addEventListener('change', () => {
  cancelRosterHold();
  if (!rosterTouchViewport.matches) ui.rosterMemberId = undefined;
  if (workspace) shell();
});
const admin = () => hasAdminRole() && adminUnlocked;
const data = () => admin() && ui.editingSchedule ? workspace.working : workspace.published;
const currentTeam = (state = ui.view === 'admin' ? workspace?.working : data()) => state?.teams.find(t => t.id === ui.teamId) || state?.teams[0];
const currentMember = (team = currentTeam()) => team?.members.find(m => m.id === ui.memberId) || team?.members.find(m => !m.activeUntil || m.activeUntil > ui.date) || team?.members[0];
const label = (value) => ({vacation:'Semester',sick:'Sjuk',leave:'Tjänstledig',pension:'Pensionsdag',overtime:'Övertid',custom:'Anpassat pass',off:'Ledig',cover:'Ersättningspass',shift:'Arbetar'}[value] || value);

function visibleScheduleGroup(state,g){return g?.showScheduleName!==false&&state.workTeams?.find(t=>t.id===g?.workTeamId)?.scheduleActive!==false;}
function normalizeSelection() {
  const state=data();
  if(ui.view!=='admin' && ui.teamId?.startsWith('dept:') && state?.departments?.some(d=>d.id===ui.teamId.slice(5))){ui.memberId=undefined;return;}
  if(ui.view!=='admin' && state?.teams){
    const selectedId=ui.teamId?.startsWith('group:')?ui.teamId.slice(6):ui.teamId;
    const selected=state.teams.find(g=>g.id===selectedId);
    const active=g=>state.workTeams?.find(t=>t.id===g.workTeamId)?.scheduleActive!==false;
    const group=selected&&active(selected)?selected:state.teams.find(active);
    ui.teamId=group?.id;
    ui.memberId=group?currentMember(group)?.id:undefined;
    return;
  }
  const team=currentTeam();
  ui.teamId=team?.id;
  ui.memberId=team?currentMember(team)?.id:undefined;
}
function toast(message, error = false) {
  const el = $('#toast'); el.textContent = message; el.className = `toast visible ${error ? 'error' : ''}`;
  clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove('visible'), 4500);
}
let staffBoardObserver;
function layoutStaffBoard() {
  staffBoardObserver?.disconnect();
  const board = $('.staff-board');
  if (!board || typeof ResizeObserver === 'undefined') return;
  const fit = column => {
    // Reserve the card's natural height plus the gap, independently of its neighbours.
    column.style.gridRowEnd = `span ${Math.ceil(column.getBoundingClientRect().height) + 18}`;
  };
  board.classList.add('staff-board-compact');
  staffBoardObserver = new ResizeObserver(entries => entries.forEach(({target}) => fit(target)));
  for (const column of board.children) {
    fit(column);
    staffBoardObserver.observe(column);
  }
}
function shell() {
  cancelStaffDrag?.();
  staffBoardObserver?.disconnect();
  for (const state of [workspace.working,workspace.published]) if(state)model.useLoopingSchedules(state);
  if (!hasAdminRole()) adminUnlocked = false;
  if (!admin()) { ui.editingSchedule = false; if (ui.view === 'admin') ui.view = 'schedule'; }
  normalizeSelection();
  if (workspace.role === 'signed-out') { renderLogin(workspace.error || ''); return; }
  const team = currentTeam(), member = currentMember(team);
  const nav = (mobile = false) => [['schedule','calendar','Schema'],...(hasAdminRole() ? [['admin','settings','Hantera']] : [])].map(([view,ico,text]) => `<button class="nav-item ${ui.view === view ? 'active' : ''}" data-action="view" data-view="${view}">${icon(ico)}<span>${text}</span>${!mobile && ui.view === view ? '<span class="nav-dot"></span>' : ''}</button>`).join('');
  $('#app').innerHTML = `<div class="app-shell">
    <aside class="sidebar"><a class="brand" href="./" aria-label="RSSB startsida"><img class="brand-mark" src="./assets/favicon.svg?v=2" width="38" height="38" alt="">RSSB</a><div class="workspace-label">DIN ARBETSPLATS</div><nav aria-label="Huvudnavigation">${nav()}</nav>${workspace.mode === 'cloud' ? `<div class="sidebar-bottom"><button class="icon-btn" data-action="logout" aria-label="Logga ut">${icon('logout')}</button></div>` : ''}</aside>
    <div class="main-shell">
    <main id="content" tabindex="-1">${ui.view==='admin' ? adminView() : team ? scheduleView() : emptyWorkspace()}</main>
    <footer class="page-footer"><span></span><span></span></footer>
    </div><nav class="mobile-nav" aria-label="Mobilnavigation">${nav(true)}</nav>
  </div>`;
  if (ui.view === 'admin' && ui.adminTab === 'rotation' && ui.teamId) { setupRotationAdmin(); bindRotationDrag(); }
  if (ui.view === 'admin' && ui.adminTab === 'people') bindStaffColumnDrag();
  layoutStaffBoard();
  applyRosterFocus();
  rememberNavigation();
}

// Hide rows in place so a held name and the horizontal scroll position stay put.
function applyRosterFocus() {
  if (!rosterTouchViewport?.matches) return;
  const names = [...document.querySelectorAll('[data-roster-member]')];
  if (!names.some(name => name.dataset.rosterMember === ui.rosterMemberId)) ui.rosterMemberId = undefined;
  for (const name of names) {
    name.closest('tbody').hidden = Boolean(ui.rosterMemberId && name.dataset.rosterMember !== ui.rosterMemberId);
    name.setAttribute('aria-pressed', String(name.dataset.rosterMember === ui.rosterMemberId));
  }
}

let rosterHold;
let suppressRosterClick = false;
function cancelRosterHold() {
  if (rosterHold) clearTimeout(rosterHold.timer);
  rosterHold = undefined;
}
document.addEventListener('pointerdown', event => {
  cancelRosterHold();
  suppressRosterClick = false;
  const name = event.target.closest('[data-roster-member]');
  if (!rosterTouchViewport?.matches || !name || event.isPrimary === false || !['touch','pen'].includes(event.pointerType)) return;
  const hold = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
  rosterHold = hold;
  hold.timer = setTimeout(() => {
    if (rosterHold !== hold || !name.isConnected) return;
    suppressRosterClick = true;
    ui.rosterMemberId = name.dataset.rosterMember;
    applyRosterFocus();
  }, 500);
});
document.addEventListener('pointermove', event => {
  if (rosterHold?.pointerId === event.pointerId && Math.hypot(event.clientX - rosterHold.x, event.clientY - rosterHold.y) > 10) {
    suppressRosterClick = true;
    cancelRosterHold();
  }
});
document.addEventListener('pointerup', event => {
  if (rosterHold?.pointerId === event.pointerId) cancelRosterHold();
});
document.addEventListener('pointercancel', cancelRosterHold);
document.addEventListener('scroll', cancelRosterHold, true);
window.addEventListener('blur', cancelRosterHold);
document.addEventListener('contextmenu', event => {
  if (rosterTouchViewport?.matches && event.target.closest('.roster-panel')) event.preventDefault();
});
document.addEventListener('keydown', event => {
  const name = event.target.closest('[data-roster-member]');
  if (!rosterTouchViewport?.matches || !name || !['Enter',' '].includes(event.key) || event.repeat) return;
  event.preventDefault();
  ui.rosterMemberId = ui.rosterMemberId === name.dataset.rosterMember ? undefined : name.dataset.rosterMember;
  applyRosterFocus();
});

function dateRange() {
  const days = model.weekDates(ui.date);
  return `${fmt(days[0],{day:'numeric',month:'short'})} – ${fmt(days[6],{day:'numeric',month:'short',year:'numeric'})}`;
}
function heading(team, teams, departmentScope=null) {
  const state=data();
  const parent=departmentScope ? null : state.workTeams?.find(t=>t.id===team?.workTeamId);
  const opts=state.departments.map(department=>{
    const choices=state.workTeams.filter(t=>t.departmentId===department.id&&t.scheduleActive!==false).map(t=>{
      const first=teams.find(g=>g.workTeamId===t.id&&visibleScheduleGroup(state,g))||teams.find(g=>g.workTeamId===t.id);
      if(!first)return '';
      return `<option value="${esc(first.id)}" ${(!departmentScope && !ui.teamId?.startsWith('group:') && t.id===parent?.id)?'selected':''}> ${esc(t.name)}</option>`;
    }).join('');
    return `<option class="department-option" value="dept:${esc(department.id)}" ${departmentScope?.id===department.id?'selected':''}>${esc(department.name)}</option>${choices}`;
  }).join('');
  const labelText = ui.teamId?.startsWith('group:') ? team?.name : departmentScope ? departmentScope.name : (parent?.name || team?.name || '');
  const teamTitle = `<div class="heading-team"><span class="heading-team-icon">${icon('team')}</span><span class="heading-team-label">${esc(labelText)}</span>${icon('down','heading-team-chevron')}<select id="team-select" aria-label="Välj avdelning eller team">${opts}</select></div>`;
  const days = model.weekDates(ui.date);
  const compactRange = `${fmt(days[0],{day:"numeric",...(days[0].slice(0,7)!==days[6].slice(0,7)?{month:"short"}:{})})}–${fmt(days[6],{day:"numeric",month:"short"})}`.replaceAll('.', '');
  return `<div class="schedule-header"><div class="page-heading"><div>${teamTitle}</div></div>
  <div class="schedule-toolbar"><div class="date-navigation"><button class="icon-btn" data-action="navigate" data-step="-1" aria-label="Föregående vecka">${icon('left')}</button><strong><span class="date-range-full">${dateRange()}</span><span class="date-range-compact" aria-label="${dateRange()}">${compactRange}</span></strong><button class="icon-btn" data-action="navigate" data-step="1" aria-label="Nästa vecka">${icon('right')}</button><button class="today-btn" data-action="today">Idag</button></div><div class="view-controls"><label class="date-picker" title="Gå till ett datum">${icon('calendar')}<span>Välj datum</span><input id="jump-date" type="date" value="${ui.date}" aria-label="Gå till ett datum"></label></div></div></div>
  ${admin() && ui.editingSchedule ? `<div class="published-label"><span class="draft-dot"></span>Redigerar schema</div>` : ''}`;
}

let highlightTimer;
function highlightDate(targetDate) {
  if (highlightTimer) clearTimeout(highlightTimer);
  $$('.roster-highlight').forEach(el => el.classList?.remove?.('roster-highlight'));
  const dates = model.weekDates(ui.date);
  const dayIndex = dates.indexOf(targetDate);
  if (dayIndex < 0) return;
  const elements = $$(`.roster-table thead th:nth-child(${dayIndex + 2}), .roster-table tbody td:nth-child(${dayIndex + 2})`);
  elements.forEach(el => el.classList?.add?.('roster-highlight'));
  highlightTimer = setTimeout(() => {
    elements.forEach(el => el.classList?.remove?.('roster-highlight'));
    highlightTimer = null;
  }, 1600);
}

function scrollToDate(targetDate = ui.date, highlight = false) {
  const scroller = $('.roster-scroll');
  const corner = $('.roster-corner');
  const dates = model.weekDates(ui.date);
  const dayIndex = dates.indexOf(targetDate);
  const column = dayIndex >= 0
    ? $$(`.roster-table thead th:nth-child(${dayIndex + 2})`)[0]
    : ($(`.roster-table thead th[data-date="${targetDate}"]`) || $('.roster-table thead .roster-today'));
  if (scroller && column?.getBoundingClientRect && corner?.getBoundingClientRect) {
    const columnRect = column.getBoundingClientRect();
    const nameWidth = corner.getBoundingClientRect().width;
    const visibleCenter = nameWidth + (scroller.clientWidth - nameWidth) / 2;
    const left = scroller.scrollLeft + columnRect.left + columnRect.width / 2
      - scroller.getBoundingClientRect().left - scroller.clientLeft - visibleCenter;
    scroller.scrollTo({
      left: Math.max(0, Math.min(left, scroller.scrollWidth - scroller.clientWidth)),
      behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    });
  }
  if (highlight) highlightDate(targetDate);
}

function scrollToToday(highlight = false) {
  scrollToDate(today(), highlight);
}

function scheduleView() {
  const state=data();
  const teams=state?.teams || [];
  if(!state.workTeams?.some(t=>t.scheduleActive!==false)&&!ui.teamId?.startsWith('dept:')){const department=state.departments?.[0];return heading(teams[0],teams,department)+empty('Inga aktiva team','Aktivera ett team under Team och scheman för att visa schemat.');}
  if(ui.teamId?.startsWith('group:')){const group=teams.find(g=>g.id===ui.teamId.slice(6));if(group)return heading(group,teams)+rosterView(group,[group]);}
  if (ui.teamId?.startsWith('dept:')) {
    const deptId = ui.teamId.slice(5);
    const department = state.departments?.find(d => d.id === deptId) || state.departments?.[0];
    const deptWorkTeams = state.workTeams?.filter(t => t.departmentId === department?.id) || [];
    const groups = teams.filter(g => visibleScheduleGroup(state,g)&&deptWorkTeams.some(t => t.id === g.workTeamId));
    return heading(groups[0] || teams[0], teams, department) + rosterView(groups[0] || teams[0], groups, department);
  }
  const team=currentTeam();
  const groups=teams.filter(g=>g.workTeamId===team.workTeamId&&visibleScheduleGroup(state,g));
  return heading(team, teams) + (groups.length?rosterView(team,groups):empty('Inga aktiva grupper','Aktivera en grupp under Team och scheman för att visa personalens schema.'));
}
function hours(minutes) { return new Intl.NumberFormat('sv-SE',{maximumFractionDigits:1}).format(minutes / 60); }
function colorFor(team,date,code) { return model.activeVersion(team,date)?.shifts[code]?.color || 'mint'; }
function rosterView(team, groups=[team], departmentScope=null) {
  const state=data(), dates=model.weekDates(ui.date), editable=admin()&&ui.editingSchedule;
  const assignments=Object.fromEntries(dates.map(d=>[d,groups.flatMap(g=>model.getDayAssignments(state,g.id,d))]));
  const home=[...new Map(groups.flatMap(g=>g.members.filter(m=>dates.some(d=>model.isActive(m,d)&&model.belongsToGroup(state,m.id,g.id,d)))).map(m=>[m.id,m])).values()];
  const visitors=[...new Set(Object.values(assignments).flat().map(s=>s.memberId))].filter(id=>!home.some(m=>m.id===id)).map(findMember).filter(Boolean).filter(m=>!state.teams.some(g=>!visibleScheduleGroup(state,g)&&g.members.some(person=>person.id===m.id)&&dates.some(d=>model.belongsToGroup(state,m.id,g.id,d))));
  const members=[...home,...visitors].filter(m=>(findMember(m.id)?.role||m.role)!=='part-time');
  const groupFor=(id,date)=>groups.find(g=>g.members.some(m=>m.id===id)&&model.belongsToGroup(state,id,g.id,date));
  const todayAssignments = assignments[dates.includes(today())?today():ui.date] || [];
  if (todayAssignments) {
    const firstStarts = new Map();
    for (const shift of todayAssignments) {
      if (shift.start && (!firstStarts.has(shift.memberId) || shift.start < firstStarts.get(shift.memberId))) {
        firstStarts.set(shift.memberId, shift.start);
      }
    }
    members.sort((a, b) => (firstStarts.get(a.id) || '99:99').localeCompare(firstStarts.get(b.id) || '99:99')||a.name.localeCompare(b.name,'sv'));
  }
  const rows=members.map((m,i)=>{
    const isHome=home.some(p=>p.id===m.id), ownGroup=groupFor(m.id,ui.date), version=model.activeVersion(ownGroup,ui.date), position=isHome&&version?model.rotationPosition(version,m.id,ui.date):0;
    const cells=dates.map(d=>{
      const group=groupFor(m.id,d),active=Boolean(group&&model.isActive(m,d));
      return {date:d,group,shifts:assignments[d].filter(a=>a.memberId===m.id),exception:group?state.exceptions.find(e=>e.teamId===group.id&&e.memberId===m.id&&e.date===d):null,main:group?model.getShift(state,group.id,m.id,d):null,active};
    });
    const shiftCells=cells.map(c=>{
      const isToday=c.date===today();
      const editAttr=(editable&&c.active&&c.group)?' data-action="roster-edit" data-group="'+esc(c.group.id)+'" data-member="'+esc(m.id)+'" data-date="'+c.date+'" role="button" tabindex="0" title="Ändra pass för '+esc(m.name)+', '+fmt(c.date,{day:'numeric',month:'short'})+'"':'';
      const offText=c.exception?label(c.exception.type):(c.active?label(c.main?.type||'off'):isHome?'Ej aktiv':'Inget pass');
      const content=c.shifts.length?c.shifts.map(a=>'<div class="roster-shift '+esc(a.color||colorFor(state.teams.find(g=>g.id===a.teamId),c.date,a.code))+'"><b>'+esc(a.code||'↗')+(a.type==='cover'?' ↗':'')+'</b><span>'+a.start+'–'+a.end+'</span>'+(a.type==='cover'?'<small class="roster-shift-status">Ersättningspass</small>':c.exception?'<small class="roster-shift-status">'+label(c.exception.type)+'</small>':'')+'</div>').join(''):'<div class="roster-off'+(offText==='Ledig'?' roster-day-off':'')+'">'+(offText==='Ledig'?'':(c.exception||c.main?.personalSchedule)&&c.main?.code?'<b class="roster-absence-code">'+esc(c.main.code)+'</b>':'—')+'<span>'+offText+'</span></div>';
      const replacement=c.exception?.replacementId?findMember(c.exception.replacementId):null;
      const replacementTime=c.exception?.replacementStart&&c.exception?.replacementEnd?'<small class="roster-cover-time">'+esc(c.exception.replacementStart)+'–'+esc(c.exception.replacementEnd)+'</small>':'';
      const replacementInfo=replacement?'<div class="roster-replacement"><span>Ersättare: <strong>'+esc(replacement.name)+'</strong></span>'+replacementTime+'</div>':editable&&c.main?.needsCoverage?'<div class="roster-replacement roster-needs-cover">Ersättare behövs</div>':'';
      const absenceCard=!c.shifts.length&&offText!=='Ledig'&&(replacementInfo||((c.exception||c.main?.personalSchedule)&&c.main?.code));
      const cellContent=absenceCard?'<div class="roster-shift roster-absence-card '+esc(colorFor(c.group,c.date,c.main?.code))+'">'+content+replacementInfo+'</div>':content+replacementInfo;
      return '<td class="'+(isToday?'roster-today':'')+(editable&&c.active&&c.group?' roster-editable':'')+'"'+editAttr+'>'+cellContent+'</td>';
    }).join('');

    const workTeam=state.workTeams?.find(t=>t.id===ownGroup?.workTeamId);
    const visibility=state.departments?.find(d=>d.id===workTeam?.departmentId)?.scheduleLabels;
    const visibleLabels=[departmentScope&&workTeam?.scheduleActive!==false?workTeam?.name:'',visibility?.group&&ownGroup?.showScheduleName!==false?ownGroup?.name:''].filter(Boolean).join(' · ');
    const subLabel=visibleLabels!==null?visibleLabels:departmentScope?(workTeam?.name||ownGroup?.name||(isHome?'':'Gästande')):(position?'':(isHome?'Timvikarie':'Gästande ersättare'));
    const focusAttrs=rosterTouchViewport?.matches?' data-roster-member="'+esc(m.id)+'" role="button" tabindex="0" aria-pressed="false"':'';
    return '<tbody class="roster-person"><tr class="roster-shifts roster-last"><th scope="row" class="roster-name"><div class="roster-person-label"'+focusAttrs+'><span>'+esc(m.name)+(subLabel?'<small>'+esc(subLabel)+'</small>':'')+'</span></div></th>'+shiftCells+'</tr></tbody>';
  }).join('');
  const body=rows;
  const captionTitle=departmentScope?departmentScope.name:(team?.name||'');
  return '<section class="roster-panel"><div class="roster-scroll" tabindex="0" role="region" aria-label="Teamets veckoschema, rulla i sidled för fler dagar"><table class="roster-table"><caption class="sr-only">'+esc(captionTitle)+', kalendervecka '+model.isoWeek(ui.date).week+'</caption><colgroup><col class="roster-name-col">'+dates.map(()=>'<col>').join('')+'</colgroup><thead><tr><th scope="col" class="roster-corner">V. '+model.isoWeek(ui.date).week+'</th>'+dates.map((d,i)=>'<th scope="col" data-date="'+d+'" class="'+(d===today()?'roster-today':'')+' '+(i>4?'roster-weekend':'')+'"><span>'+weekdayNames[i]+'</span><strong>'+fmt(d,{day:'numeric',month:'short'})+'</strong>'+(d===today()?'<small>Idag</small>':'')+'</th>').join('')+'</tr></thead>'+body+'</table></div></section>';
}
const findMember = id => {const state=ui.view==='admin'?workspace.working:data();return state?.employees?.find(e=>e.id===id)||state?.teams.flatMap(t=>t.members).find(m=>m.id===id);};

function empty(title,description,action,button) { return `<div class="empty-state">${icon('calendar')}<h2>${title}</h2><p>${description}</p>${action?`<button class="primary-btn" data-action="${action}">${button}</button>`:''}</div>`; }
function emptyWorkspace() {return empty('Inget gruppschema ännu','Skapa avdelning, team och grupp under Hantera.',hasAdminRole()?'admin':null,'Öppna Hantera');}
function organizationSelection() {
  const state = workspace.working;
  const department = state.departments.find(d => d.id === ui.departmentId) || state.departments[0];
  ui.departmentId = department?.id;
  const teams = state.workTeams.filter(t => t.departmentId === department?.id);
  const team = teams.find(t => t.id === ui.workTeamId) || teams[0];
  ui.workTeamId = team?.id;
  const allTeams=ui.view==='admin'&&ui.adminTab==='changes'&&ui.changeAllTeams;
  const teamIds=new Set(teams.map(item=>item.id));
  const groups = state.teams.filter(g => allTeams?teamIds.has(g.workTeamId):g.workTeamId === team?.id);
  const group = groups.find(g => g.id === ui.teamId) || groups[0];
  ui.teamId = group?.id;
  return { state, department, teams, team, groups, group };
}
const orgOptions = (items, selected) => items.map(x => `<option value="${esc(x.id)}" ${x.id===selected?'selected':''}>${esc(x.name)}</option>`).join('');
function adminView() {
  const {state, department, teams, team, groups, group} = organizationSelection();
  const employees = state.employees.filter(e => e.departmentId === department?.id);
  return `<div class="page-heading admin-heading"><div><h1>Hantera avdelningen</h1></div></div>
  <div class="organization-select"><label>Avdelning<select id="department-select">${orgOptions(state.departments, department?.id)}</select></label>${ui.adminTab==='people'?'<button class="secondary-btn" data-action="add-department">Ny avdelning</button><button class="text-button" data-action="rename-department">Byt namn</button>':''}</div>
  <div class="admin-tabs" role="tablist">${[['people',`Medarbetare (${employees.length})`],['rotation','Team och scheman'],['changes','Frånvaro och ersättare']].map(([id,name])=>`<button role="tab" aria-selected="${ui.adminTab===id}" class="${ui.adminTab===id?'active':''}" data-action="admin-tab" data-tab="${id}">${name}</button>`).join('')}</div>
  ${ui.adminTab==='people'?departmentPeople(employees,state):ui.adminTab==='changes'?individualChangesView(teams,team,groups,department):`<div class="team-group-selectors"><div class="organization-select"><label>Team<select id="work-team-select">${orgOptions(teams,team?.id)}</select></label><button class="secondary-btn" data-action="add-work-team">Nytt team</button>${team?`<button type="button" class="icon-btn organization-settings" data-action="work-team-settings" aria-label="Teaminställningar" title="Teaminställningar" aria-haspopup="dialog">${icon('gear')}</button>`:''}</div>${team?`<div class="organization-select"><label>Grupp · eget schema<select id="admin-team-select">${orgOptions(groups,group?.id)}</select></label><button class="secondary-btn" data-action="add-team">Ny grupp</button>${group?`<button type="button" class="icon-btn organization-settings" data-action="settings" aria-label="Gruppinställningar" title="Gruppinställningar" aria-haspopup="dialog">${icon('gear')}</button>`:''}</div>`:''}</div>${group?rotationAdmin(group):empty(team?'Skapa teamets första grupp':'Skapa avdelningens första team',team?'Varje grupp har ett eget schema, till exempel dag, kväll eller natt.':'Ett team samlar personal som arbetar med samma sak.',team?'add-team':'add-work-team',team?'Skapa grupp':'Skapa team')}`}
  ${ui.adminTab==='rotation'&&team?`<section class="admin-panel"><div class="panel-heading"><div><h2>Inställningar för schemat</h2><p>Inaktiverade team och grupper döljs i hela schemat.</p></div></div><div class="schedule-label-settings">${[['team','Visa teamet '+(team?.name||'')]].map(([key,label])=>`<label><input type="checkbox" data-team-active="${esc(team?.id||'')}" ${(team?.scheduleActive!==false)?'checked':''}> ${label}<span class="schedule-setting-state">${(team?.scheduleActive!==false)?'Aktiv':'Inaktiverad'}</span></label>`).join('')}</div><div class="schedule-label-settings">${groups.map(g=>`<label><input type="checkbox" data-group-label="${esc(g.id)}" ${g.showScheduleName!==false?'checked':''}> Visa gruppen ${esc(g.name)}<span class="schedule-setting-state">${g.showScheduleName!==false?'Aktiv':'Inaktiverad'}</span></label>`).join('')}</div></section>`:''}
  <div class="backup-bar"><span aria-hidden="true"></span>${workspace.mode !== 'cloud' && ['localhost','127.0.0.1'].includes(location.hostname) ? '<button class="text-button" data-action="sync-project">Spara till projektet</button>' : ''}<button class="text-button" data-action="export">Exportera säkerhetskopia</button><label class="text-button import-label">Importera säkerhetskopia<input id="import-file" type="file" accept="application/json,.json"></label></div>`;
}
function individualChangesView(teams,team,groups,department) {
  return `<div class="organization-select"><label>Team<select id="work-team-select">${department?`<option value="dept:${esc(department.id)}" ${ui.changeAllTeams?'selected':''}>${esc(department.name)}</option>`:''}${orgOptions(teams,ui.changeAllTeams?null:team?.id)}</select></label></div>${groups.length?changesAdmin(groups):empty('Ingen grupp att visa','Välj ett team med grupper. Team och grupper hanteras på fliken Team och scheman.')}`;
}
function staffColumnsOrderKey() {
  return 'skift-staff-columns-' + (ui.departmentId || 'default');
}
function getStaffColumnsOrder() {
  try {
    const saved = localStorage.getItem(staffColumnsOrderKey());
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
}
function saveStaffColumnsOrder(order) {
  try {
    localStorage.setItem(staffColumnsOrderKey(), JSON.stringify(order));
  } catch {}
}
function staffColumnsCollapsedKey() {
  return 'skift-staff-collapsed-' + (ui.departmentId || 'default');
}
function getStaffColumnsCollapsed() {
  try {
    const saved = localStorage.getItem(staffColumnsCollapsedKey());
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}
function saveStaffColumnsCollapsed(collapsedIds) {
  try {
    localStorage.setItem(staffColumnsCollapsedKey(), JSON.stringify(collapsedIds));
  } catch {}
}
function toggleStaffColumnCollapse(column) {
  const isCollapsed = column.classList.toggle('staff-column-collapsed');
  const heading = column.querySelector('.staff-column-heading');
  if (heading) heading.setAttribute('aria-expanded', String(!isCollapsed));
  layoutStaffBoard();

  const board = column.closest('.staff-board');
  if (board) {
    const collapsedIds = [...board.querySelectorAll('.staff-column.staff-column-collapsed')]
      .map(col => col.dataset.columnId)
      .filter(Boolean);
    saveStaffColumnsCollapsed(collapsedIds);
  }
}
function organizeColumnsIntoLanes(columns, savedOrder) {
  const columnMap = new Map(columns.map(c => [c.id, c]));
  const lanes = [];

  if (Array.isArray(savedOrder) && savedOrder.length) {
    for (const entry of savedOrder) {
      if (Array.isArray(entry)) {
        const laneCols = [];
        for (const id of entry) {
          if (columnMap.has(id)) {
            laneCols.push(columnMap.get(id));
            columnMap.delete(id);
          }
        }
        if (laneCols.length) lanes.push(laneCols);
      } else if (typeof entry === 'string') {
        if (columnMap.has(entry)) {
          lanes.push([columnMap.get(entry)]);
          columnMap.delete(entry);
        }
      }
    }
  }

  for (const remaining of columnMap.values()) {
    lanes.push([remaining]);
  }

  return lanes;
}
function departmentPeople(employees,state) {
  const compare=(a,b)=>a.name.localeCompare(b.name,'sv',{sensitivity:'base',numeric:true});
  const teams=state.workTeams.filter(t=>t.departmentId===ui.departmentId).sort(compare);
  const columns=teams.map(team=>({...team,people:[]}));
  const unassigned={id:'unassigned',name:'Ej placerade',people:[]}, hourly={id:'hourly',name:'Timmisar',people:[]};
  for(const employee of [...employees].sort(compare)){
    const placement=model.placementOn(employee,today());
    const column=employee.role==='part-time'?hourly:columns.find(t=>t.id===placement?.teamId)||unassigned;
    column.people.push({employee});
  }
  if(unassigned.people.length)columns.push(unassigned);
  columns.push(hourly);
  const lanes = organizeColumnsIntoLanes(columns, getStaffColumnsOrder());
  const collapsedSet = new Set(getStaffColumnsCollapsed());
  return `<section class="admin-panel"><div class="panel-heading"><div><h2>Dina medarbetare</h2></div><div class="staff-add-actions"><button class="primary-btn" data-action="add-person">${icon('plus')} Lägg till personal</button><button class="primary-btn" data-action="add-hourly">${icon('plus')} Lägg till timmis</button></div></div>${lanes.length?`<div class="staff-board">${lanes.map(lane=>`<div class="staff-lane">${lane.map(column=>`<section class="staff-column ${collapsedSet.has(column.id)?'staff-column-collapsed':''}" data-column-id="${esc(column.id)}" aria-label="${esc(column.name)}"><header class="staff-column-heading" draggable="false" tabindex="0" role="button" aria-expanded="${!collapsedSet.has(column.id)}" title="Klicka för att fälla ihop eller dra för att flytta"><h3><span class="staff-drag-handle" aria-hidden="true">⠿</span> ${esc(column.name)}</h3><div class="staff-heading-meta"><span aria-label="${column.people.length} medarbetare">${column.people.length}</span><span class="staff-collapse-icon" aria-hidden="true">${icon('down')}</span></div></header><div class="staff-column-people">${column.people.length?column.people.map(({employee:e})=>{
    const skills=e.role==='part-time'?teams.filter(t=>e.skilledTeamIds?.includes(t.id)).map(t=>t.name).join(' · '):'';
    return `<button class="staff-person-card" data-action="edit-person" data-member="${esc(e.id)}" aria-label="Redigera person eller schema för ${esc(e.name)}"><span class="staff-person-details"><strong>${esc(e.name)}</strong>${skills?`<small>${esc(skills)}</small>`:''}</span>${icon('edit')}</button>`;
  }).join(''):'<p class="staff-column-empty">Ingen personal placerad ännu.</p>'}</div></section>`).join('')}</div>`).join('')}</div>`:empty('Ingen personal ännu','Lägg till avdelningens medarbetare. Du kan placera dem i grupper senare.')}</section>`;
}

function organizationModal(kind, rename=false) {
  const {department,team}=organizationSelection(),isDepartment=kind==='department';
  const current=isDepartment?department:team;
  modal(`${rename?'Byt namn på':'Ny'} ${isDepartment?'avdelning':'team'}`,isDepartment?'Avdelningen samlar all personal.':'Teamet samlar personal som arbetar med samma sak.',`<label>Namn<input name="name" required maxlength="60" value="${esc(rename?current?.name:'')}" placeholder="${isDepartment?'Till exempel Medicin':'Till exempel Städ'}"></label>`,async f=>{
    const next=copy(),name=f.get('name').trim();if(!name)throw new Error('Ange ett namn.');
    const list=isDepartment?next.departments:next.workTeams;
    if(rename)list.find(x=>x.id===current.id).name=name;
    else {const id=model.uid();list.push({id,name,...(isDepartment?{}:{departmentId:department.id})});if(isDepartment)ui.departmentId=id;else ui.workTeamId=id;ui.teamId=undefined;}
    await save(next);
  });
}
function personModal(memberId, hourly=false) {
  const {state,department}=organizationSelection(),employee=state.employees.find(e=>e.id===memberId),placement=model.placementOn(employee,today());
  const teams=state.workTeams.filter(t=>t.departmentId===department.id);
  const options=()=>`<option value="">Placera senare</option>${teams.filter(t=>state.teams.some(g=>g.workTeamId===t.id)).map(t=>`<optgroup label="${esc(t.name)}">${state.teams.filter(g=>g.workTeamId===t.id).map(g=>`<option value="group:${esc(g.id)}" ${placement?.groupId===g.id?'selected':''}>${esc(t.name)} / ${esc(g.name)}</option>`).join('')}</optgroup>`).join('')}`;
  const skills=`<fieldset id="person-skills" class="person-skills" ${hourly||employee?.role==='part-time'?'':'hidden'}><legend>Kunskaper</legend><p class="field-note">Markera de arbetsområden timmisen kan arbeta inom.</p><div class="person-skill-options">${teams.map(t=>`<label><input type="checkbox" name="skilledTeamIds" value="${esc(t.id)}" ${employee?.skilledTeamIds?.includes(t.id)?'checked':''}> <span>${esc(t.name)}</span></label>`).join('')||'<p class="field-note">Lägg till team under Team och scheman för att kunna välja kunskaper.</p>'}</div></fieldset>`;
  modal(employee?'Redigera medarbetare':hourly?'Lägg till timmis':'Lägg till personal','', `<label>Namn<input name="name" required maxlength="60" value="${esc(employee?.name||'')}"></label><label>Anställningstyp<select id="person-role" name="role"><option value="member">Ordinarie</option><option value="part-time" ${(employee?.role==='part-time'||hourly)?'selected':''}>Timvikarie</option></select></label>${hourly||employee?.role==='part-time'?'<p class="field-note">Timmisen tillhör avdelningen och bokas som ersättare utan fast team eller grupp.</p>':`<label>Team och grupp<select name="placement">${options()}</select></label>`}${skills}${personalScheduleLink(employee,state)}`,async f=>{
    const next=copy(),name=f.get('name').trim();if(!name)throw new Error('Ange ett namn.');
    const from=today();
    let target=next.employees.find(e=>e.id===memberId);
    if(!target){target={id:model.uid(),name,role:f.get('role'),activeFrom:from,activeUntil:null,departmentId:department.id,placements:[]};next.employees.push(target);}
    target.name=name;target.role=f.get('role');
    if(target.role==='part-time')target.skilledTeamIds=[...new Set(f.getAll('skilledTeamIds'))];
    for(const g of next.teams)for(const m of g.members)if(m.id===target.id){m.name=name;m.role=target.role;if(target.skilledTeamIds)m.skilledTeamIds=[...target.skilledTeamIds];}
    const value=target.role==='part-time'?'':f.get('placement')||'',group=value.startsWith('group:')?next.teams.find(g=>g.id===value.slice(6)):null,teamId=group?.workTeamId||(value.startsWith('team:')?value.slice(5):null);
    const previous=model.placementOn(target,from);
    if(!employee||previous?.teamId!==teamId||previous?.groupId!==(group?.id||null))model.placeEmployee(next,target.id,teamId,group?.id||null,from);
    await save(next,'Medarbetaren har sparats');
  },{extra:employee?`<button type="button" class="danger-text" data-action="delete-person" data-member="${esc(employee.id)}">Ta bort medarbetare</button>`:''});
}

function deletePersonModal(memberId) {
  const employee=workspace.working.employees.find(person=>person.id===memberId);
  if(!employee){toast('Medarbetaren kunde inte hittas.',true);return;}
  modal('Ta bort medarbetare?','',
    `<p>Vill du ta bort <strong>${esc(employee.name)}</strong>?</p><p class="confirmation-description">Personen, personliga scheman och registrerade ändringar tas bort. Pass där personen är ersättare lämnas utan ersättare. Det går inte att ångra borttagningen.</p>`,
    async()=>{await save(model.deleteEmployee(workspace.working,employee.id),'Medarbetaren har tagits bort');},
    {submit:'Ta bort medarbetare',danger:true});
}

function personalScheduleLink(employee, state, date=today()) {
  if (!employee || employee.role === 'part-time') return '';
  const group = state.teams.find(g => g.id === model.placementOn(employee, date)?.groupId);
  const version = model.activeVersion(group, date);
  if (!version) return '<p class="field-note">Spara en gruppplacering för att kunna anpassa personens schema.</p>';
  return `<div class="personal-schedule-link"><button type="button" class="secondary-btn" data-action="person-schedule" data-member="${esc(employee.id)}">${icon('calendar')} Redigera personligt schema</button></div>`;
}

function personScheduleModal(memberId, date=today()) {
  const state=workspace.working, employee=state.employees.find(e=>e.id===memberId);
  const group=state.teams.find(g=>g.id===model.placementOn(employee,date)?.groupId);
  const version=model.activeVersion(group,date);
  if (!employee || employee.role==='part-time' || !version) { toast('Personen behöver tillhöra en grupp med ett schema på det valda datumet.',true); return; }
  const personal=model.personalScheduleOn(version,memberId,date);
  const position=model.rotationPosition(version,memberId,date);
  const weekStart=[model.mondayOf(date),!employee.loopSchedule&&employee.activeFrom||'1900-01-01'].sort().at(-1);
  const effectiveFrom=personal?.effectiveFrom||weekStart;
  const rows=version.rotation.map((row,week)=>`<tr data-personal-week="${week}" class="${week===position-1?'personal-current-week':''}"><th scope="row"><strong>Vecka ${week+1}</strong><span class="personal-week-marker" ${week===position-1?'':'hidden'}>${model.mondayOf(date)===model.mondayOf(today())?'Här är personen nu':'Personens vecka'}</span><small class="personal-week-count"></small></th>${row.map((code,day)=>{
    const cell=personal?.rotation[week]?.[day], shift=version.shifts[code], key=`${week}-${day}`;
    const selectedShift=cell?.type==='shift'?version.shifts[cell.code]:shift;
    const selected=cell?.type==='shift'?`shift:${cell.code}`:cell?.type||'inherit';
    return `<td data-personal-day="${key}" class="${cell?'personal-changed-day':''}"><select class="personal-rotation-cell ${esc(selectedShift?.color||'')}" name="mode-${key}" aria-label="Schemavecka ${week+1}, ${weekdayNames[day]}"><option value="inherit" ${selected==='inherit'?'selected':''}>${esc(code||'—')}</option><optgroup label="Frånvaro">${model.PERSONAL_ABSENCE_TYPES.map(type=>`<option value="${type}" ${selected===type?'selected':''}>${label(type)}</option>`).join('')}</optgroup><optgroup label="Byt arbetspass">${Object.entries(version.shifts).map(([c,s])=>`<option value="shift:${esc(c)}" ${selected===`shift:${c}`?'selected':''}>${esc(c)} · ${s.start}–${s.end}</option>`).join('')}</optgroup><option value="custom" ${selected==='custom'?'selected':''}>Egna tider</option></select><span class="personal-cell-time">${selectedShift?selectedShift.start+'–'+selectedShift.end:'Ledig'}</span><small class="personal-cell-date" hidden></small><small class="personal-cell-base" ${cell?'':'hidden'}>Grundpass: ${esc(code||'Ledig')}</small><div class="personal-times" ${cell?.type==='custom'?'':'hidden'}><label>Från<input type="time" name="start-${key}" aria-label="Från, schemavecka ${week+1}, ${weekdayNames[day]}" value="${esc(cell?.start||shift?.start||'')}" ${cell?.type==='custom'?'required':'disabled'}></label><label>Till<input type="time" name="end-${key}" aria-label="Till, schemavecka ${week+1}, ${weekdayNames[day]}" value="${esc(cell?.end||shift?.end||'')}" ${cell?.type==='custom'?'required':'disabled'}></label></div></td>`;
  }).join('')}</tr>`).join('');
  modal(`Personligt schema · ${esc(employee.name)}`,'',
    `<div class="personal-schedule-editor"><input type="hidden" name="effectiveFrom" value="${effectiveFrom}"><p id="personal-position" class="personal-position" aria-live="polite">Kalendervecka ${model.isoWeek(date).week} · ${esc(employee.name)} är på schemavecka ${position}.</p><div class="rotation-scroll personal-rotation-scroll" tabindex="0" role="region" aria-label="Personens återkommande grundschema"><table class="rotation-table personal-rotation-table"><caption class="sr-only">${esc(employee.name)} · gruppens grundschema med personliga ändringar</caption><thead><tr><th scope="col">Schemavecka</th>${weekdayLabels.map(day=>`<th scope="col">${day}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div><p class="field-note">Markerad rad visar personens plats i rotationen. Ändrade rutor upprepas varje varv utan startdatum. Välj det första alternativet i listan för att följa grundschemat igen. Anställningsgraden beräknas automatiskt från arbetstiden i hela rotationen.</p></div>`,async f=>{
      const next=copy(), target=next.teams.find(g=>g.id===group.id)?.versions.find(v=>v.id===version.id);
      if(JSON.stringify(target)!==JSON.stringify(version))throw new Error('Gruppschemat har ändrats. Stäng och öppna personens schema igen.');
      const rotation=personalRotationFromFields(version,name=>f.get(name));
      model.savePersonalSchedule(next,group.id,version.id,{memberId,effectiveFrom:f.get('effectiveFrom'),rotation},{previousEffectiveFrom:personal?.effectiveFrom});
      await save(next,'Personligt schema sparat. Det gemensamma schemat har uppdaterats.');
    },{submit:'Spara personligt schema',actionsAtTop:true,extra:`<div id="personal-hours" class="personal-hours" aria-live="polite">${personalHoursSummary(model.personalScheduleStats(version,personal?.rotation))}</div><label class="personal-date-label">Visa vecka för<input type="date" id="personal-position-date" value="${date}"></label><button type="button" class="text-button" id="personal-reset" title="Återställ alla dagar till gruppschemat">Återställ till gruppschemat</button>`});
  setupPersonalScheduleFields(version, employee, group);
}

function personalHoursSummary({groupMinutes,personalMinutes,employmentPercent}) {
  const percent=employmentPercent===null?'—':new Intl.NumberFormat('sv-SE',{maximumFractionDigits:1}).format(employmentPercent)+' %';
  return `<div class="personal-ratio"><strong>${percent}</strong><span>av gruppens timmar</span></div><div class="personal-hours-stat"><span>Personligt schema</span><strong>${hours(personalMinutes)} <small>timmar</small></strong></div><div class="personal-hours-stat"><span>Gruppschema</span><strong>${hours(groupMinutes)} <small>timmar</small></strong></div><p class="personal-hours-note"><span>Hela rotationen</span><span>Utan rastavdrag</span>${groupMinutes?'':'<span>Grundschemat saknar timmar</span>'}</p>`;
}

function personalRotationFromFields(version, value) {
  return version.rotation.map((row,w)=>row.map((_,d)=>{
    const key=`${w}-${d}`,mode=value(`mode-${key}`);
    return model.PERSONAL_ABSENCE_TYPES.includes(mode)?{type:mode}:mode==='custom'?{type:'custom',start:value(`start-${key}`),end:value(`end-${key}`)}:mode?.startsWith('shift:')?{type:'shift',code:mode.slice(6)}:null;
  }));
}

function setupPersonalScheduleFields(version, employee, group) {
  const form=$('#modal-form'); if(!form?.querySelectorAll)return;
  const field=name=>form.querySelector(`[name="${name}"]`);
  const update=()=>{
    const {groupMinutes,personalMinutes,employmentPercent}=model.personalScheduleStats(version,personalRotationFromFields(version,name=>field(name).value));
    form.querySelectorAll('[data-personal-week]').forEach((weekRow,w)=>{
      let changed=0;
      version.rotation[w].forEach((code,d)=>{
        const key=`${w}-${d}`, mode=field(`mode-${key}`).value, shift=version.shifts[code];
        const row=form.querySelector(`[data-personal-day="${key}"]`), custom=mode==='custom';
        row.querySelector('.personal-times').hidden=!custom;
        row.classList.toggle('personal-changed-day',mode!=='inherit');
        row.querySelector('.personal-cell-base').hidden=mode==='inherit';
        for(const name of ['start','end']){field(`${name}-${key}`).disabled=!custom;field(`${name}-${key}`).required=custom;}
        const selectedShift=mode.startsWith('shift:')?version.shifts[mode.slice(6)]:mode==='inherit'?shift:null;
        field(`mode-${key}`).className=`personal-rotation-cell ${selectedShift?.color||''}`;
        row.querySelector('.personal-cell-time').textContent=custom?'Egna tider':selectedShift?`${selectedShift.start}–${selectedShift.end}`:label(mode==='inherit'?'off':mode);
        if(mode!=='inherit')changed++;
      });
      weekRow.querySelector('.personal-week-count').textContent=changed?`${changed} ${changed===1?'ändring':'ändringar'}`:'';
    });
    form.querySelector('#personal-hours').innerHTML=personalHoursSummary({groupMinutes,personalMinutes,employmentPercent});
  };
  const updatePosition=()=>{
    const date=form.querySelector('#personal-position-date').value;
    if(!date)return;
    const valid=model.activeVersion(group,date)?.id===version.id&&model.belongsToGroup(workspace.working,employee.id,group.id,date)&&model.isActive(employee,date);
    const position=valid?model.rotationPosition(version,employee.id,date):0;
    form.querySelectorAll('[data-personal-week]').forEach(row=>{
      const current=Number(row.dataset.personalWeek)===position-1;
      row.querySelectorAll('[data-personal-day]').forEach((cell,day)=>{
        const note=cell.querySelector('.personal-cell-date');
        note.hidden=!current;
        const cellDate=model.addDays(model.mondayOf(date),day);
        const beforeStart=Boolean(!employee.loopSchedule&&employee.activeFrom&&cellDate<employee.activeFrom);
        note.textContent=fmt(cellDate,{day:'numeric',month:'short'})+(beforeStart?' · före anställningen':'');
        cell.classList.toggle('personal-before-start',current&&beforeStart);
      });
      row.classList.toggle('personal-current-week',current);
      const marker=row.querySelector('.personal-week-marker');marker.hidden=!current;
      marker.textContent=model.mondayOf(date)===model.mondayOf(today())?'Här är personen nu':'Personens vecka';
    });
    form.querySelector('#personal-position').textContent=position?`Kalendervecka ${model.isoWeek(date).week} (${fmt(model.mondayOf(date),{day:'numeric',month:'short'})}) · ${employee.name} är på schemavecka ${position}.`:'Personen är inte aktiv i gruppen på det valda datumet.';
    const selectedRow=form.querySelector('.personal-current-week');
    if(selectedRow){
      const scroll=form.querySelector('.personal-rotation-scroll');
      scroll.scrollTop+=selectedRow.getBoundingClientRect().top-scroll.getBoundingClientRect().top-form.querySelector('thead').getBoundingClientRect().height-2;
    }
  };
  form.querySelector('#personal-position-date').addEventListener('input',updatePosition);
  form.addEventListener('input',update); form.addEventListener('change',update);
  form.querySelector('#personal-reset').onclick=()=>{
    if(!window.confirm('Är du säker på att du vill återställa personens schema till gruppschemat?\n\nAlla personliga ändringar i den här rotationen återställs.'))return;
    form.querySelectorAll('select[name^="mode-"]').forEach(select=>select.value='inherit');
    update();
  };
  update();updatePosition();
}

let editingVersionId;
let rotationMatch;
function rotationAdmin(team) {
  const version=model.activeVersion(team,ui.date);
  if(!version)return empty('Inget grundschema ännu','Skapa ett grundschema för teamet.','new-rotation','Skapa grundschema');
  editingVersionId=version.id;
  const currentMon=model.mondayOf(today());
  const refMon=version.referenceMonday;
  const isCurrentWeek=refMon===currentMon;
  const weeksPassed=Math.round((Date.parse(currentMon)-Date.parse(refMon))/604800000);
  return `<section class="admin-panel rotation-panel"><div class="panel-heading"><div><h2>Det återkommande grundschemat</h2><p>${version.rotation.length===1?'En vecka som upprepas varje vecka.':'Schemat upprepas efter '+version.rotation.length+' veckor.'} Välj ett pass i varje ruta. En tom ruta betyder ledig. Schemat loopar utan start- eller slutdatum.</p></div><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><button class="secondary-btn" data-action="new-rotation">${icon('plus')} Lägg till vecka</button></div></div><div class="rotation-scroll"><table class="rotation-table"><thead><tr><th>Vecka</th>${weekdayLabels.map(d=>`<th>${d}</th>`).join('')}<th></th></tr></thead><tbody>${version.rotation.map((row,i)=>`<tr draggable="true" data-row="${i}"><th><span class="drag-handle" title="Dra för att ändra ordning">⠿</span> ${i+1}</th>${row.map((code,j)=>`<td><select class="rotation-cell ${version.shifts[code]?.color || ''}" data-row="${i}" data-day="${j}" aria-label="Vecka ${i+1}, ${weekdayNames[j]}"><option value="">—</option>${Object.keys(version.shifts).map(c=>`<option value="${esc(c)}" ${c===code?'selected':''}>${esc(c)}</option>`).join('')}</select></td>`).join('')}<td><button class="icon-btn row-move" data-action="move-row" data-row="${i}" data-dir="-1" aria-label="Flytta vecka ${i+1} uppåt" ${i===0?'disabled':''}>↑</button><button class="icon-btn row-move" data-action="move-row" data-row="${i}" data-dir="1" aria-label="Flytta vecka ${i+1} nedåt" ${i===version.rotation.length-1?'disabled':''}>↓</button><button type="button" class="icon-btn danger-text" data-action="delete-row" data-row="${i}" aria-label="Ta bort vecka ${i+1}" title="${version.rotation.length===1?'Minst en vecka måste finnas kvar':'Ta bort veckan'}" ${version.rotation.length===1?'disabled':''}>${icon('close')}</button></td></tr>`).join('')}</tbody></table></div><div class="rotation-footnote">${icon('info')} På mobilen kan du svepa tabellen i sidled. Använd pilarna för att ändra veckornas ordning.</div></section><section class="admin-panel"><div class="panel-heading"><div><h2>Stäm av mot jobbets schema</h2><p>Jämför schemaveckorna för gruppens medarbetare.</p></div><button class="primary-btn" data-action="match-rotation">Stäm av medarbetarnas veckor</button></div></section><section class="admin-panel"><div class="panel-heading"><div><h2>Passtider</h2><p>Gemensamma pass för alla grupper i teamet.</p></div><button class="secondary-btn" data-action="add-shift">${icon('plus')} Lägg till pass</button></div><div class="shift-definitions">${Object.entries(version.shifts).map(([code,s])=>`<button data-action="edit-shift" data-code="${esc(code)}"><span class="code-badge ${esc(s.color)}">${esc(code)}</span><strong>${s.start}–${s.end}</strong>${icon('edit')}</button>`).join('')}</div></section>`;
}
function changePeriods(entries) {
  const buckets = new Map();
  for (const entry of entries) {
    const key=JSON.stringify([entry.teamId,entry.type,entry.start||'',entry.end||'']);
    if(!buckets.has(key))buckets.set(key,[]);
    buckets.get(key).push(entry);
  }
  const periods=[];
  for(const bucket of buckets.values()){
    let period;
    for(const entry of [...bucket].sort((a,b)=>a.date.localeCompare(b.date))){
      if(!period||model.addDays(period.end,1)!==entry.date){
        period={id:entry.id,start:entry.date,end:entry.date,type:entry.type,entries:[]};
        periods.push(period);
      }
      period.end=entry.date;period.entries.push(entry);
    }
  }
  return periods.sort((a,b)=>a.start.localeCompare(b.start)||a.id.localeCompare(b.id));
}
function changeRange(start,end){
  const date=value=>fmt(value,{day:'numeric',month:'short',year:'numeric'});
  return start===end?date(start):date(start)+' – '+date(end);
}
function changeOverview(groups){
  const groupIds=new Set(groups.map(group=>group.id)),people=new Map();
  const query=(ui.changeQuery||'').trim().toLocaleLowerCase('sv');
  for(const entry of workspace.working.exceptions){
    if(!groupIds.has(entry.teamId)||(ui.changeYear&&entry.date.slice(0,4)!==ui.changeYear)||(ui.changeMonth&&entry.date.slice(5,7)!==ui.changeMonth)||(ui.changeType&&entry.type!==ui.changeType))continue;
    const name=findMember(entry.memberId)?.name||'Tidigare medarbetare';
    if(query&&!name.toLocaleLowerCase('sv').includes(query))continue;
    if(!people.has(entry.memberId))people.set(entry.memberId,{id:entry.memberId,name,entries:[]});
    people.get(entry.memberId).entries.push(entry);
  }
  return [...people.values()].map(person=>({...person,periods:changePeriods(person.entries),days:new Set(person.entries.map(e=>e.date)).size}))
    .sort((a,b)=>a.name.localeCompare(b.name,'sv'));
}
function changeResults(groups){
  const people=changeOverview(groups),size=10,pages=Math.max(1,Math.ceil(people.length/size));
  ui.changePage=Math.min(ui.changePage||0,pages-1);
  const first=ui.changePage*size,visible=people.slice(first,first+size);
  const days=people.reduce((sum,p)=>sum+p.days,0),periods=people.reduce((sum,p)=>sum+p.periods.length,0);
  const count=(n,one,many)=>n+' '+(n===1?one:many);
  return '<div class="change-totals" role="status"><span><strong>'+people.length+'</strong> medarbetare</span><span><strong>'+periods+'</strong> '+(periods===1?'period':'perioder')+'</span><span><strong>'+days+'</strong> '+(days===1?'registrerad dag':'registrerade dagar')+'</span></div>'
    +(people.length?'<div class="change-column-head"><span>Medarbetare</span><span>Omfattning</span><span>Bemanning</span><span></span></div><div class="change-people">'+visible.map(person=>{
      const shifts=new Map(person.entries.map(entry=>[entry.id,model.getShift(workspace.working,entry.teamId,entry.memberId,entry.date)]));
      const uncovered=person.entries.filter(e=>shifts.get(e.id).needsCoverage).length;
      const types=[...new Set(person.entries.map(e=>label(e.type)))].join(' · ');
      const initials=person.name.split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]).join('');
      return '<details class="change-person" data-change-person="'+esc(person.id)+'" '+((ui.changeOpenPeople||[]).includes(person.id)?'open':'')+'><summary>'
        +'<span class="change-person-name"><span class="avatar">'+esc(initials)+'</span><span><strong>'+esc(person.name)+'</strong><small>'+esc(types)+'</small></span></span>'
        +'<span class="change-person-count"><strong>'+count(person.days,'dag','dagar')+'</strong><small>'+count(person.periods.length,'period','perioder')+'</small></span>'
        +'<span class="change-person-coverage">'+(uncovered?'<span class="change-coverage-badge">'+count(uncovered,'dag','dagar')+' behöver ersättare</span>':'<span class="change-covered">Inget behov av ersättare</span>')+'</span>'+icon('down')+'</summary>'
        +'<div class="change-periods">'+person.periods.map(period=>{
          const needs=period.entries.filter(e=>shifts.get(e.id).needsCoverage).length;
          return '<details class="change-period" data-change-period="'+esc(period.id)+'" '+((ui.changeOpenPeriods||[]).includes(period.id)?'open':'')+'><summary>'
            +'<span class="change-type change-type-'+esc(period.type)+'">'+esc(label(period.type))+'</span>'
            +'<span class="change-period-date">'+changeRange(period.start,period.end)+'</span>'
            +'<span class="change-period-count">'+count(period.entries.length,'dag','dagar')+'</span>'
            +'<span class="change-period-hint">Visa dagar '+icon('down')+'</span></summary>'
            +'<div class="change-day-list"><p>'+ (needs?count(needs,'dag behöver','dagar behöver')+' ersättare. ':'')+'Välj en dag för att redigera eller ta bort ändringen.</p>'
            +period.entries.map(entry=>{
              const shift=shifts.get(entry.id);
              const detail=entry.replacementId?'Ersättare: '+(findMember(entry.replacementId)?.name||'Medarbetare'):'Ingen ersättare';
              return '<button class="change-day" data-action="edit-exception" data-id="'+esc(entry.id)+'" aria-label="'+esc('Redigera '+person.name+', '+changeRange(entry.date,entry.date))+'"><span><strong>'+fmt(entry.date,{weekday:'short',day:'numeric',month:'short'})+'</strong>'
                +'<small>'+esc(entry.start&&entry.end?entry.start+'–'+entry.end:label(entry.type))+'</small></span><span class="change-day-cover">'+esc(detail)+(shift.needsCoverage?'<small class="coverage-warning">'+hours(shift.uncoveredMinutes||0)+' timmar behöver ersättare</small>':'')+'</span>'+icon('edit')+'</button>';
            }).join('')+'</div></details>';
        }).join('')+'</div></details>';
    }).join('')+'</div><div class="change-pagination"><span>Visar '+(first+1)+'–'+Math.min(first+size,people.length)+' av '+people.length+' medarbetare</span><div><button class="icon-btn" data-action="changes-page" data-step="-1" aria-label="Föregående medarbetare" '+(ui.changePage===0?'disabled':'')+'>'+icon('left')+'</button><span>'+(ui.changePage+1)+' / '+pages+'</span><button class="icon-btn" data-action="changes-page" data-step="1" aria-label="Nästa medarbetare" '+(ui.changePage===pages-1?'disabled':'')+'>'+icon('right')+'</button></div></div>'
    :empty('Inga individuella ändringar',ui.changeQuery||ui.changeYear||ui.changeMonth||ui.changeType?'Inga ändringar matchar dina filter. Prova en annan sökning eller visa alla datum.':'Lägg till en ändring när någon är frånvarande eller behöver andra arbetstider.'));
}
function refreshChangeResults(){
  const target=$('#change-results');
  if(target){target.innerHTML=changeResults(organizationSelection().groups);rememberNavigation();}
}
function changesAdmin(groups) {
  const groupIds=new Set(groups.map(group=>group.id));
  const years=[...new Set(workspace.working.exceptions.filter(entry=>groupIds.has(entry.teamId))
    .map(entry=>entry.date.slice(0,4)))].sort();
  if(ui.changeYear&&!years.includes(ui.changeYear)){ui.changeYear='';ui.changePage=0;}
  return '<section class="admin-panel change-overview"><div class="panel-heading"><div><h2>Frånvaro och ersättare</h2></div><button class="primary-btn" data-action="exception">'+icon('plus')+' Lägg till ändring</button></div>'
    +'<div class="change-filters"><label class="change-search">Sök medarbetare<input id="changes-search" type="search" placeholder="Skriv ett namn…" value="'+esc(ui.changeQuery||'')+'"></label>'
    +'<label>År<select id="changes-year"><option value="">Alla år</option>'+years.map(value=>'<option value="'+esc(value)+'" '+(ui.changeYear===value?'selected':'')+'>'+esc(value)+'</option>').join('')+'</select></label>'
    +'<label>Månad<select id="changes-month"><option value="">'+(ui.changeYear?'Hela året':'Alla månader')+'</option>'+Array.from({length:12},(_,i)=>{const value=String(i+1).padStart(2,'0');return '<option value="'+value+'" '+(ui.changeMonth===value?'selected':'')+'>'+fmt('2026-'+value+'-01',{month:'long'})+'</option>';}).join('')+'</select></label>'
    +'<label>Typ av ändring<select id="changes-type"><option value="">Alla typer</option>'+['vacation','sick','leave','overtime',...(workspace.working.exceptions.some(entry=>entry.type==='pension')?['pension']:[]),'custom','off'].map(type=>'<option value="'+type+'" '+(ui.changeType===type?'selected':'')+'>'+label(type)+'</option>').join('')+'</select></label>'
    +'<button class="text-button" data-action="changes-reset">Rensa filter</button></div><div id="change-results">'+changeResults(groups)+'</div>'
    +'</section>';
}
function modal(title,description,body,onSubmit,options={}) {
  const dialog=$('#modal');
  const actions=`<div class="modal-actions${options.actionsAtTop?' modal-actions-top':''}">${options.extra||''}<button class="secondary-btn" type="button" data-action="close-modal">Avbryt</button><button class="primary-btn${options.danger?' danger-btn':''}" type="submit">${options.submit || 'Spara'}</button></div>`;
  const error='<p class="form-error" role="alert"></p>';
  dialog.innerHTML=`<div class="modal-header"><div${options.hideTitle?' class="sr-only"':''}><h2>${title}</h2></div><button class="icon-btn" data-action="close-modal" aria-label="Stäng dialogrutan">${icon('close')}</button></div>${description?`<p class="modal-description">${description}</p>`:''}<form id="modal-form">${options.actionsAtTop?actions+error+body:body+error+actions}</form>`;
  $('#modal-form').onsubmit=async e=>{e.preventDefault();const button=e.submitter;button.disabled=true;try {$('.form-error',dialog).textContent='';await onSubmit(new FormData(e.target));if(!options.keepOpen)dialog.close();}catch(err){$('.form-error',dialog).textContent=err.message;}finally{button.disabled=false;}};
  dialog.showModal();
  if(options.danger)dialog.querySelector('.secondary-btn[data-action="close-modal"]')?.focus();
}
async function save(next, message='Ändringarna har sparats') {
  if(!admin())throw new Error('Lås upp Hantera innan du gör ändringar.');
  model.useLoopingSchedules(next);
  const errors=model.validateState(next); if(errors.length)throw new Error(errors[0]);
  if(ui.busy)throw new Error('En ändring sparas. Försök igen om en stund.');
  ui.busy=true;
  try{const result=await store.publish(next);workspace={...workspace,...result};ui.busy=false;shell();toast(result.fileSync?.message || message,result.fileSync?.state==='browser');}finally{ui.busy=false;}
}
const workingTeam = () => workspace.working.teams.find(t=>t.id===ui.teamId)||workspace.working.teams[0];
const editingVersion = team => model.activeVersion(team,ui.date);
const copy = () => structuredClone(workspace.working);
function setupRotationAdmin() {}
function addTeam() {
  const parent=organizationSelection().team;if(!parent){organizationModal('team');return;}
  modal('En ny grupp, ett eget schema.','Gruppen får teamets gemensamma passlista. Fyll i grundschemat och lägg till medarbetare.',`<label>Gruppnamn<input name="name" placeholder="t.ex. Daggruppen" required maxlength="60"></label><div class="form-grid"><label>Antal schemaveckor<input name="length" type="number" min="1" max="52" value="1" required></label></div><label class="checkbox-label"><input type="checkbox" name="copy"> Kopiera den valda gruppens grundschema</label>`,async f=>{
    const date=model.mondayOf(ui.date);
    const next=copy(), old=next.teams.find(g=>g.id===ui.teamId&&g.workTeamId===parent.id), length=Number(f.get('length')), template=old?.versions.at(-1) || model.seedState().teams[0].versions[0];
    const version={id:model.uid(),effectiveFrom:date,referenceMonday:date,rotation:Array.from({length},(_,i)=>f.has('copy')&&old?[...(template.rotation[i%template.rotation.length])]:Array(7).fill('')),positions:{},shifts:structuredClone(next.workTeams.find(t=>t.id===parent.id).shifts||{})};
    const team={id:model.uid(),workTeamId:parent.id,name:f.get('name').trim(),color:'mint',members:[],versions:[version]};
    if(!team.name)throw new Error('Ange ett teamnamn.');next.teams.push(team);ui.teamId=team.id;ui.view='admin';ui.adminTab='rotation';editingVersionId=version.id;await save(next,'Gruppen har lagts till. Fyll i grundschemat.');
  },{submit:'Skapa grupp'});
}

async function newRotation() {
  const next=copy(), team=next.teams.find(t=>t.id===workingTeam().id), version=editingVersion(team);
  if(version.rotation.length>=104)throw new Error('Grundschemat kan innehålla högst 104 veckor.');
  version.rotation.push(Array(7).fill(''));
  model.remapPersonalSchedules(version,version.rotation.map((_,i)=>i));
  await save(next,'En tom vecka har lagts till längst ner');
}
function shiftModal(code) {
  const team=workingTeam(), version=editingVersion(team), shift=version.shifts[code];
  modal(code?`Redigera pass ${esc(code)}`:'Lägg till ett pass','Passkod, tider och färg gäller för alla grupper i teamet.',`<label>Passkod<input name="code" value="${esc(code||'')}" required maxlength="6" pattern="[A-Za-z0-9]+"></label><div class="form-grid"><label>Börjar<input name="start" type="time" value="${shift?.start||'07:00'}" required></label><label>Slutar<input name="end" type="time" value="${shift?.end||'16:00'}" required></label></div><fieldset class="shift-color-picker"><legend>Färg</legend><div class="shift-color-options">${['amber','yellow','orange','peach','red','rose','pink','lavender','purple','indigo','blue','cyan','teal','mint','sage','slate'].map(c=>`<label class="shift-color-option" title="${colorLabel(c)}"><input type="radio" name="color" value="${c}" aria-label="${colorLabel(c)}" ${(shift?.color||'amber')===c?'checked':''} required><span class="shift-color-swatch ${c}" aria-hidden="true">${icon('check')}</span></label>`).join('')}</div></fieldset><p class="field-note">Om sluttiden är tidigare än starttiden fortsätter passet nästa dag.</p>`,async f=>{
    const newCode=f.get('code').trim().toUpperCase();
    const next=copy();
    model.saveTeamShift(next,team.id,code,newCode,{start:f.get('start'),end:f.get('end'),color:f.get('color')});
    await save(next,'Passet har sparats');
  });
}
function exceptionModal(options={}) {
  const existing=workspace.working.exceptions.find(e=>e.id===options.id);
  const groupId=existing?.teamId||options.groupId;
  const team=(groupId?workspace.working.teams.find(t=>t.id===groupId):null)||workingTeam();
  const teamWide=!existing&&!options.groupId&&ui.view==='admin'&&ui.adminTab==='changes';
  const groups=teamWide?organizationSelection().groups:team?[team]:[];
  const members=[...new Map(groups.flatMap(group=>group.members).map(member=>[member.id,member])).values()];
  const memberId=existing?.memberId||options.memberId||'';
  const groupFor=(id,date)=>groups.find(group=>model.belongsToGroup(workspace.working,id,group.id,date));
  if(!members.length){toast('Lägg till en medarbetare först.',true);return;}
  const date=existing?.date||options.date||ui.date;
  const people=[...new Map([...workspace.working.teams.flatMap(t=>t.members.map(m=>({...m,teamName:t.name}))),...(workspace.working.employees||[]).filter(e=>e.role==='part-time').map(e=>({...e,teamName:'Timmis'}))].map(m=>[m.id,m])).values()];
  let selectedMember=memberId,month=date.slice(0,7)+'-01',navigationDate=date,anchor=null,batchNumber=0,deleting=false,saving=false;
  const selected=new Set(memberId&&(existing||options.date)?[date]:[]),drafts=new Map();
  const colors=['#176c58','#6a65a3','#ae7042','#387b9b','#9b5978'];
  const personName=id=>people.find(person=>person.id===id)?.name||'Ingen ersättare';
  const dayCount=count=>`${count} ${count===1?'dag':'dagar'}`;
  const monthDates=()=>{const end=model.addDays(month,32).slice(0,7)+'-01';const dates=[];for(let d=month;d<end;d=model.addDays(d,1))dates.push(d);return dates;};
  const savedEntry=d=>workspace.working.exceptions.findLast(entry=>entry.memberId===selectedMember&&entry.date===d&&groups.some(group=>group.id===entry.teamId));
  const removableDates=()=>[...selected].filter(d=>drafts.has(d)||savedEntry(d));
  const available=d=>{const group=groupFor(selectedMember,d);return Boolean(group&&model.isActive(group.members.find(person=>person.id===selectedMember),d));};
  const scheduled=d=>{const group=groupFor(selectedMember,d);return Boolean(group&&model.getReplacementShift(workspace.working,group.id,selectedMember,d).working);};
  function monthMarkup(){
    const dates=monthDates(),offset=(new Date(month+'T12:00:00Z').getUTCDay()+6)%7;
    return `<div class="exception-month-nav"><div class="exception-month-controls"><button type="button" class="icon-btn" data-exception-action="month" data-step="-1" aria-label="Föregående månad">${icon('left')}</button><strong aria-live="polite">${fmt(month,{month:'long',year:'numeric'})}</strong><button type="button" class="icon-btn" data-exception-action="month" data-step="1" aria-label="Nästa månad">${icon('right')}</button><button type="button" class="exception-today" data-exception-action="today" title="Gå till dagens månad">Idag</button></div><label class="date-picker exception-date-picker" title="Gå till ett datum">${icon('calendar')}<span>Välj datum</span><input name="calendarDate" type="date" value="${navigationDate}" aria-label="Gå till datum i kalendern"></label></div><div class="exception-weekdays">${weekdayLabels.map(day=>`<span>${day}</span>`).join('')}</div><div class="exception-month-grid">${Array.from({length:offset},()=>'<span class="exception-day-empty" aria-hidden="true"></span>').join('')}${dates.map(d=>{
      const group=groupFor(selectedMember,d),shift=group?model.getShift(workspace.working,group.id,selectedMember,d):{},staged=drafts.get(d),entry=staged?.entry||savedEntry(d);
      const planned=group?model.getReplacementShift(workspace.working,group.id,selectedMember,d):null;
      const start=shift.working?shift.start:shift.originalStart||planned?.start,end=shift.working?shift.end:shift.originalEnd||planned?.end,isAvailable=available(d);
      const status=!selectedMember?'':entry?label(entry.type):shift.working?'':label(shift.type||'off');
      const replacement=entry?.replacementId?personName(entry.replacementId):'';
      const description=[fmt(d,{weekday:'long',day:'numeric',month:'long',year:'numeric'}),start&&end?start+'–'+end:selectedMember?'Ledig':'',status,replacement?'Ersättare: '+replacement:'',staged?'Tilldelad, ej sparad':''].filter(Boolean).join(', ');
      return `<button type="button" class="exception-day${selected.has(d)?' is-selected':''}${staged?' is-staged':''}${d===today()?' is-today':''}${new Date(d+'T12:00:00Z').getUTCDay()%6===0?' is-weekend':''}${!isAvailable?' is-unavailable':''}" data-exception-action="day" data-date="${d}" aria-pressed="${selected.has(d)}" aria-label="${esc(description)}" title="${esc(description)}" data-change-type="${esc(entry?.type||'')}" ${!isAvailable?'disabled':''} ${staged?`style="--batch-color:${colors[staged.batch%colors.length]}"`:''}><span class="exception-day-heading"><span class="exception-day-number">${Number(d.slice(8))}</span>${start&&end?`<b class="exception-day-code">${esc(shift.code||'Pass')}</b>`:''}</span>${start&&end?`<span class="exception-day-pass"><span>${esc(start)}–${esc(end)}</span></span>`:''}<span class="exception-day-details"><small class="exception-day-status">${!selectedMember?'':isAvailable?esc(status):'Ej aktiv i gruppen'}</small>${replacement?`<small class="exception-day-replacement" title="Ersättare: ${esc(replacement)}">${icon('team')}<span>${esc(replacement)}</span></small>`:staged?'<small class="exception-day-replacement"><span>Ingen ersättare</span></small>':''}</span></button>`;
    }).join('')}${Array.from({length:42-offset-dates.length},()=>'<span class="exception-day-empty" aria-hidden="true"></span>').join('')}</div>`;
  }
  function assignSelection(f){
    if(!selectedMember)throw new Error('Välj en medarbetare först.');
    if(!selected.size)throw new Error('Markera minst en dag i kalendern.');
    const type=f.get('type')||'',replacementId=f.get('replacement')||'',partial=replacementId&&f.get('coverMode')==='partial';
    if(!type)throw new Error('Välj typ av ändring först.');
    const replacementStart=partial?f.get('coverStart'):'',replacementEnd=partial?f.get('coverEnd'):'';
    const workTimes=type==='overtime'?{start:f.get('workStart')||'',end:f.get('workEnd')||''}:{};
    if(type==='overtime'&&(!workTimes.start||!workTimes.end))throw new Error('Ange när passet börjar och slutar för övertid.');
    if(partial&&(!replacementStart||!replacementEnd))throw new Error('Välj både från- och tilltid för del av passet.');
    const dates=[...selected].sort(),eligible=dates.filter(d=>!(['vacation','sick'].includes(type)||replacementId)||scheduled(d));
    if(!eligible.length)throw new Error('Det finns inga schemalagda arbetsdagar bland de valda datumen.');
    const entries=eligible.map(d=>({memberId:selectedMember,teamId:groupFor(selectedMember,d)?.id,date:d,type,...workTimes,replacementId,...(partial?{replacementStart,replacementEnd}:{}),note:String(f.get('note')||'').trim()}));
    const combined=new Map([...drafts].map(([d,item])=>[d,item.entry]));for(const entry of entries)combined.set(entry.date,entry);
    // Validate the whole draft before replacing any previous assignment.
    const result=model.applyExceptionDrafts(workspace.working,[...combined.values()],{groupIds:groups.map(group=>group.id)});
    const applied=new Map(result.entries.map(entry=>[entry.date,entry])),batch=batchNumber++;
    for(const entry of entries)if(applied.has(entry.date)){
      const appliedEntry={...applied.get(entry.date)};
      if(!workspace.working.exceptions.some(saved=>saved.id===appliedEntry.id))delete appliedEntry.id;
      drafts.set(entry.date,{entry:appliedEntry,batch});
    }
    selected.clear();anchor=null;
    render();
  }
  const editingSavedSelection=()=>selected.size>0&&[...selected].every(d=>Boolean(savedEntry(d)));
  async function saveChanges(f){
    if(saving)return;
    if(deleting)throw new Error('Vänta tills ändringarna har tagits bort.');
    if(!selected.size&&!drafts.size){toast('Alla ändringar är redan sparade.');return;}
    if(!selectedMember)throw new Error('Välj en medarbetare först.');
    const previousSelected=[...selected],previousAnchor=anchor;
    saving=true;render();
    try{
      if(selected.size)assignSelection(f);
      const result=model.applyExceptionDrafts(workspace.working,[...drafts.values()].map(item=>item.entry),{groupIds:groups.map(group=>group.id)});
      await save(result.state,`Ändringar för ${dayCount(result.entries.length)} har sparats`);
      drafts.clear();selected.clear();anchor=null;
    }catch(error){
      selected.clear();for(const d of previousSelected)selected.add(d);anchor=previousAnchor;
      throw error;
    }finally{saving=false;render();}
  }
  modal(existing?'Redigera frånvaro och ersättare':'Planera frånvaro och ersättare','',`<div class="exception-editor"><section class="exception-calendar-pane" aria-label="Personens månadskalender"><div id="exception-month">${monthMarkup()}</div><div class="exception-calendar-tools"><button type="button" class="text-button" id="exception-select-days" data-exception-action="${selected.size?'clear':'workdays'}">${selected.size?'Rensa markering':'Markera månadens arbetsdagar'}</button><button type="button" class="text-button danger-text" id="exception-delete" data-exception-action="delete" ${removableDates().length?'':'hidden'}>Ta bort ändring</button></div></section><section class="exception-settings" aria-label="Ändring för markerade dagar"><div class="exception-step"><h3>Ändring för valda dagar</h3></div><label for="exception-member-search">Medarbetare</label><div class="exception-member-picker" data-person-picker="member"><input id="exception-member-search" name="memberSearch" type="text" role="combobox" autocomplete="off" aria-autocomplete="list" aria-expanded="false" aria-controls="exception-member-options" placeholder="Skriv ett namn" value="${esc(members.find(member=>member.id===selectedMember)?.name||'')}" ${existing?'disabled':''}><button type="button" id="exception-member-toggle" class="exception-member-toggle" data-exception-action="member-toggle" aria-label="Visa medarbetare">${icon('down')}</button><div id="exception-member-options" class="exception-member-options" role="listbox" aria-label="Medarbetare" hidden></div></div><select name="member" hidden tabindex="-1" aria-hidden="true" ${existing?'disabled':''}><option value="" ${!selectedMember?'selected':''}>Välj medarbetare</option>${members.map(m=>`<option value="${esc(m.id)}" ${m.id===selectedMember?'selected':''}>${esc(m.name)}</option>`).join('')}</select><label>Typ av ändring<select name="type"><option value="" disabled hidden ${!existing?'selected':''}>Välj typ av ändring</option>${['vacation','sick','leave','overtime',...(existing?.type==='pension'?['pension']:[]),...(existing?.type==='custom'?['custom']:[]),'off'].map(type=>`<option value="${type}" ${existing?.type===type?'selected':''}>${label(type)}</option>`).join('')}</select></label><div class="form-grid" id="exception-work-times" ${existing?.type==='overtime'?'':'hidden'}><label>Passet börjar<input name="workStart" type="time" value="${esc(existing?.type==='overtime'?existing.start||'':'')}" ${existing?.type==='overtime'?'':'disabled'}></label><label>Passet slutar<input name="workEnd" type="time" value="${esc(existing?.type==='overtime'?existing.end||'':'')}" ${existing?.type==='overtime'?'':'disabled'}></label></div><div class="exception-replacement-heading" data-person-picker="replacement"><label for="exception-replacement-search">Ersättare</label><fieldset class="exception-replacement-filters" aria-label="Visa ersättare"><label><input type="checkbox" name="replacementPartTime" checked> Timmis</label><label><input type="checkbox" name="replacementRegular"> Ordinarie</label></fieldset></div><div class="exception-member-picker" data-person-picker="replacement"><input id="exception-replacement-search" name="replacementSearch" type="text" role="combobox" autocomplete="off" aria-autocomplete="list" aria-expanded="false" aria-controls="exception-replacement-options" placeholder="Välj ersättare" value="${existing?esc(personName(existing.replacementId)):''}"><button type="button" id="exception-replacement-toggle" class="exception-member-toggle" data-exception-action="replacement-toggle" aria-label="Visa ersättare">${icon('down')}</button><div id="exception-replacement-options" class="exception-member-options" role="listbox" aria-label="Ersättare" hidden></div></div><select name="replacement" hidden tabindex="-1" aria-hidden="true"><option value="" disabled hidden ${!existing?'selected':''}>Välj ersättare</option><option value="" ${existing&&!existing.replacementId?'selected':''}>Ingen ersättare</option>${people.map(person=>`<option value="${esc(person.id)}" ${person.id===existing?.replacementId?'selected':''} ${person.id===selectedMember?'disabled':''}>${esc(person.name)} · ${esc(personContext(person.id))}</option>`).join('')}</select><div id="exception-cover-options" ${!existing?.replacementId?'hidden':''}><label>Omfattning<select name="coverMode"><option value="full">Hela passet</option><option value="partial" ${existing?.replacementStart?'selected':''}>Del av passet</option></select></label><div class="form-grid" id="exception-cover-times" ${!existing?.replacementStart?'hidden':''}><label>Ersätter från<input name="coverStart" type="time" value="${existing?.replacementStart||''}"></label><label>Ersätter till<input name="coverEnd" type="time" value="${existing?.replacementEnd||''}"></label></div></div><label>Privat administratörsanteckning<textarea name="note" rows="2" maxlength="500" placeholder="Valfritt">${esc(existing?.note||'')}</textarea></label><button type="button" class="primary-btn" id="exception-assign" data-exception-action="assign">Tilldela valda dagar</button></section></div>`,saveChanges,{extra:`<span id="exception-footer-summary" class="exception-footer-summary" aria-live="polite">Inga ändringar sparade ännu</span>`,submit:'Spara ändringar',hideTitle:true});
  const form=$('#modal-form'),node=selector=>form.querySelector(selector),field=name=>node('[name="'+name+'"]');
  let previousSelection='';
  const personPickers={member:{suggestions:[],activeIndex:-1,query:''},replacement:{suggestions:[],activeIndex:-1,query:''}};
  let replacementAvailability=null;
  let pointerPicker=null;
  let noReplacementSelected=Boolean(existing&&!existing.replacementId);
  const normalizedName=value=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('sv').trim();
  const pickerKind=target=>({memberSearch:'member',replacementSearch:'replacement'})[target.name];
  const pickerName=kind=>kind==='member'?members.find(member=>member.id===selectedMember)?.name||'':field('replacement').value?personName(field('replacement').value):noReplacementSelected?'Ingen ersättare':'';
  function personContext(id){
    if(!id)return '';
    const state=workspace.working,employee=state.employees?.find(person=>person.id===id);
    const placement=model.placementOn(employee,[...selected].sort()[0]||date);
    const group=state.teams.find(item=>item.id===placement?.groupId)||(!employee?state.teams.find(item=>item.members.some(person=>person.id===id)):null);
    const workTeam=state.workTeams?.find(item=>item.id===(placement?.teamId||group?.workTeamId));
    return [workTeam?.name,group?.name].filter(Boolean).join(' ㆍ ')||(employee?.role==='part-time'?'Timmis':'Utan placering');
  }
  function closePersonSuggestions(kind){
    node('#exception-'+kind+'-options').hidden=true;
    const input=field(kind+'Search');
    input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');
    input.value=pickerName(kind);personPickers[kind].activeIndex=-1;
  }
  function replacementVisible(person){
    const role=workspace.working.employees?.find(employee=>employee.id===person.id)?.role||person.role;
    return person.id!==selectedMember&&(role==='part-time'?field('replacementPartTime').checked:field('replacementRegular').checked);
  }
  function replacementDateRanges(dates,showYear=false){
    const ranges=[];
    for(const d of dates){
      const previous=ranges.at(-1);
      if(previous&&model.addDays(previous.end,1)===d)previous.end=d;
      else ranges.push({start:d,end:d});
    }
    const shortDate=d=>`${Number(d.slice(8))}/${Number(d.slice(5,7))}${showYear?'/'+d.slice(0,4):''}`;
    return ranges.map(({start,end})=>start===end?shortDate(start):`${start.slice(0,7)===end.slice(0,7)?Number(start.slice(8)):shortDate(start)}–${shortDate(end)}`).join(', ');
  }
  function replacementAvailabilityMarkup(id){
    if(!selected.size)return '';
    if(!replacementAvailability){
      const state={...workspace.working,exceptions:[...workspace.working.exceptions]};
      for(const {entry} of drafts.values()){
        state.exceptions=state.exceptions.filter(saved=>!(saved.teamId===entry.teamId&&saved.memberId===entry.memberId&&saved.date===entry.date));
        state.exceptions.push(entry);
      }
      const partial=field('coverMode').value==='partial';
      const times=partial?{start:field('coverStart').value,end:field('coverEnd').value}:{};
      replacementAvailability=[...selected].sort().filter(scheduled).map(d=>({date:d,statuses:model.getReplacementAvailability(state,groupFor(selectedMember,d)?.id,selectedMember,d,times)}));
    }
    if(!replacementAvailability.length)return '';
    const showYear=new Set(replacementAvailability.map(item=>item.date.slice(0,4))).size>1;
    const unavailable=replacementAvailability.map(({date:d,statuses})=>({date:d,type:statuses.get(id)||'inactive'})).filter(item=>item.type!=='available');
    if(!unavailable.length){
      const dates=replacementAvailability.map(item=>item.date);
      return `<span class="exception-replacement-availability"><span class="exception-availability-status" data-availability="available">Tillgänglig${dates.length>1?' alla dagar':''} ${replacementDateRanges(dates,showYear)}</span></span>`;
    }
    const groups=[];
    for(const {date:d,type} of unavailable){
      const previous=groups.at(-1);
      if(previous?.type===type&&model.addDays(previous.dates.at(-1),1)===d)previous.dates.push(d);
      else groups.push({type,dates:[d]});
    }
    const statusLabel=type=>({busy:'Jobbar',inactive:'Ej aktiv',off:'Registrerad ledighet'}[type]||label(type));
    return `<span class="exception-replacement-availability"><span class="exception-availability-label">Ej tillgänglig:</span>${groups.map(({type,dates})=>`<span class="exception-availability-status" data-availability="${esc(type)}">${replacementDateRanges(dates,showYear)} ${esc(statusLabel(type))}</span>`).join('')}</span>`;
  }
  function showPersonSuggestions(kind,query='',activeIndex=0){
    const input=field(kind+'Search');if(input.disabled)return;
    closePersonSuggestions(kind==='member'?'replacement':'member');
    const picker=personPickers[kind],search=normalizedName(query),words=search.split(/\s+/).filter(Boolean);
    picker.query=query;
    const rank=person=>{
      const name=normalizedName(person.name);
      if(!search||name===search)return 0;
      if(name.startsWith(search))return 1;
      if(words.every(word=>name.split(/\s+/).some(part=>part.startsWith(word))))return 2;
      if(words.every(word=>name.includes(word)))return 3;
      return Infinity;
    };
    const candidates=kind==='member'?members:people.filter(replacementVisible);
    picker.suggestions=candidates.map(person=>({person,rank:rank(person)})).filter(item=>Number.isFinite(item.rank)).sort((a,b)=>a.rank-b.rank||a.person.name.localeCompare(b.person.name,'sv')).map(item=>item.person);
    if(kind==='replacement'&&(!search||normalizedName('Ingen ersättare').includes(search)))picker.suggestions.unshift({id:'',name:'Ingen ersättare'});
    picker.activeIndex=picker.suggestions.length?Math.max(0,Math.min(activeIndex,picker.suggestions.length-1)):-1;
    const list=node('#exception-'+kind+'-options');
    list.innerHTML=picker.suggestions.length?picker.suggestions.map((person,index)=>`<button type="button" role="option" id="exception-${kind}-option-${index}" data-exception-action="${kind}-option" data-member-id="${esc(person.id)}" aria-selected="${index===picker.activeIndex}" tabindex="-1">${kind==='replacement'&&person.id?`<span class="exception-replacement-person"><span>${esc(person.name)}</span> ㆍ <small>${esc(personContext(person.id))}</small></span>${replacementAvailabilityMarkup(person.id)}`:`<span>${esc(person.name)}</span>${person.id?`<small>${esc(personContext(person.id))}</small>`:''}`}</button>`).join(''):`<p role="status">Inga ${kind==='member'?'medarbetare':'ersättare'} hittades</p>`;
    list.hidden=false;input.setAttribute('aria-expanded','true');
    if(picker.activeIndex>=0){
      input.setAttribute('aria-activedescendant','exception-'+kind+'-option-'+picker.activeIndex);
      node('#exception-'+kind+'-option-'+picker.activeIndex)?.scrollIntoView?.({block:'nearest'});
    }else input.removeAttribute('aria-activedescendant');
  }
  function chooseMember(id){
    if(deleting||saving||drafts.size||existing||!members.some(member=>member.id===id)){field('member').value=selectedMember;closePersonSuggestions('member');return;}
    selectedMember=id;field('member').value=id;selected.clear();anchor=null;field('replacement').value='';noReplacementSelected=false;
    closePersonSuggestions('member');render();
  }
  function chooseReplacement(id){
    if(deleting||saving||(id&&(id===selectedMember||!people.some(person=>person.id===id&&replacementVisible(person)))))return;
    field('replacement').value=id;noReplacementSelected=!id;closePersonSuggestions('replacement');updateCover();
  }
  function render(){
    if(!form?.querySelector)return;
    const activeElement=document.activeElement,focusedDate=activeElement?.dataset?.date;
    node('#exception-month').innerHTML=monthMarkup();
    const selectionButton=node('#exception-select-days');
    selectionButton.textContent=selected.size?'Rensa markering':'Markera månadens arbetsdagar';
    selectionButton.setAttribute('data-exception-action',selected.size?'clear':'workdays');
    field('member').value=selectedMember;
    field('member').disabled=Boolean(existing||drafts.size||saving);
    field('memberSearch').disabled=field('member').disabled;
    node('#exception-member-toggle').disabled=field('member').disabled;
    closePersonSuggestions('member');
    for(const option of field('replacement').options||[])option.disabled=option.hidden||Boolean(selectedMember&&option.value===selectedMember);
    node('#exception-assign').disabled=saving||!selectedMember||!selected.size;
    node('#exception-assign').textContent=saving?'Sparar…':editingSavedSelection()?(new Set([...drafts.keys(),...selected]).size===1?'Spara ändring':'Spara ändringar'):selected.size?'Tilldela '+dayCount(selected.size):'Tilldela valda dagar';
    const removable=removableDates().length,deleteButton=node('#exception-delete');
    deleteButton.hidden=!removable;deleteButton.disabled=deleting||saving||!removable;
    deleteButton.textContent=removable>1?`Ta bort ${removable} ändringar`:'Ta bort ändring';
    const total=new Set([...drafts.keys(),...selected]).size;
    node('#exception-footer-summary').innerHTML=total?`<strong>${dayCount(total)}</strong> i utkastet · ${dayCount(selected.size)} markerade`:'Alla ändringar sparas tillsammans';
    updateCover();
    if(focusedDate)node(`[data-date="${focusedDate}"]`)?.focus();
  }
  function updateCover(){
    if(!form?.querySelector)return;
    replacementAvailability=null;
    closePersonSuggestions('replacement');
    const replacement=field('replacement').value,partial=field('coverMode').value==='partial',overtime=field('type').value==='overtime';
    node('#exception-work-times').hidden=!overtime;
    for(const name of ['workStart','workEnd'])field(name).disabled=!overtime;
    node('#exception-cover-options').hidden=!replacement;node('#exception-cover-times').hidden=!partial;
    for(const name of ['coverStart','coverEnd'])field(name).disabled=!replacement||!partial;
    const first=[...selected].sort()[0],group=first&&groupFor(selectedMember,first),pass=group?model.getShift(workspace.working,group.id,selectedMember,first):{},planned=group?model.getReplacementShift(workspace.working,group.id,selectedMember,first):{};
    const selectionKey=selectedMember+':'+(first||'');
    if(selectionKey!==previousSelection){
      if(previousSelection){field('coverStart').value=pass.originalStart||pass.start||planned.start||'';field('coverEnd').value=pass.originalEnd||pass.end||planned.end||'';}
      else{if(!field('coverStart').value)field('coverStart').value=pass.originalStart||pass.start||planned.start||'';if(!field('coverEnd').value)field('coverEnd').value=pass.originalEnd||pass.end||planned.end||'';}
      if(overtime){field('workStart').value=pass.start||pass.originalStart||planned.start||'';field('workEnd').value=pass.end||pass.originalEnd||planned.end||'';}
      previousSelection=selectionKey;
    }
  }
  if(!form?.addEventListener)return;
  form.addEventListener('focusin',event=>{
    const kind=pickerKind(event.target);
    if(kind){event.target.select?.();if(node('#exception-'+kind+'-options').hidden)showPersonSuggestions(kind);}
  });
  form.addEventListener('focusout',event=>{
    const kind=pickerKind(event.target)||event.target.closest?.('[data-person-picker]')?.dataset?.personPicker;
    // Scrollbar clicks may move focus to the dialog while remaining inside the picker.
    if(kind&&pointerPicker===kind){pointerPicker=null;return;}
    if(kind&&event.relatedTarget&&event.relatedTarget.closest?.('[data-person-picker]')?.dataset?.personPicker!==kind)closePersonSuggestions(kind);
  });
  form.addEventListener('pointerdown',event=>{
    const kind=event.target.closest('[data-person-picker]')?.dataset?.personPicker;
    pointerPicker=kind||null;
    for(const other of ['member','replacement'])if(other!==kind)closePersonSuggestions(other);
    if(event.target.closest('[data-exception-action="member-option"],[data-exception-action="replacement-option"]'))event.preventDefault();
  });
  form.addEventListener('pointerup',()=>{pointerPicker=null;});
  form.addEventListener('pointercancel',()=>{pointerPicker=null;});
  form.addEventListener('input',event=>{
    const kind=pickerKind(event.target);if(kind)showPersonSuggestions(kind,event.target.value);
  });
  form.addEventListener('keydown',event=>{
    const kind=pickerKind(event.target);if(!kind)return;
    const picker=personPickers[kind],open=!node('#exception-'+kind+'-options').hidden;
    if(event.key==='ArrowDown'||event.key==='ArrowUp'){
      event.preventDefault();
      showPersonSuggestions(kind,open?event.target.value:'',open?picker.activeIndex+(event.key==='ArrowDown'?1:-1):0);
    }else if(event.key==='Enter'){
      event.preventDefault();
      if(open&&picker.activeIndex>=0)(kind==='member'?chooseMember:chooseReplacement)(picker.suggestions[picker.activeIndex].id);
    }else if(event.key==='Escape'&&open){event.preventDefault();event.stopPropagation();closePersonSuggestions(kind);}
  });
  form.addEventListener('click',async event=>{
    const button=event.target.closest('[data-exception-action]');if(!button)return;
    event.preventDefault();const action=button.dataset.exceptionAction;
    if(deleting||saving)return;
    const error=$('.form-error',$('#modal'));error.textContent='';
    try{
      if(action==='member-toggle'||action==='replacement-toggle'){
        const kind=action==='member-toggle'?'member':'replacement',input=field(kind+'Search');if(input.disabled)return;
        const open=!node('#exception-'+kind+'-options').hidden;
        if(open)closePersonSuggestions(kind);else{input.focus();showPersonSuggestions(kind);}
        return;
      }else if(action==='member-option'){chooseMember(button.dataset.memberId);return;}
      else if(action==='replacement-option'){chooseReplacement(button.dataset.memberId);return;}
      else if(action==='day'){
        const d=button.dataset.date;if(!available(d))return;
        if(event.shiftKey&&anchor){let start=anchor<d?anchor:d,end=anchor>d?anchor:d;const span=Math.round((new Date(end)-new Date(start))/86400000);if(span>365)throw new Error('Markera högst ett år åt gången.');for(;start<=end;start=model.addDays(start,1))if(available(start))selected.add(start);}
        else{
          if(selected.has(d))selected.delete(d);
          else{
            selected.add(d);
            const entry=drafts.get(d)?.entry||savedEntry(d);
            if(selected.size===1&&entry){
              const typeField=field('type');
              if(typeField.options&&![...typeField.options].some(option=>option.value===entry.type))typeField.insertAdjacentHTML('beforeend',`<option value="${esc(entry.type)}">${esc(label(entry.type))}</option>`);
              field('type').value=entry.type;field('replacement').value=entry.replacementId||'';field('coverMode').value=entry.replacementStart?'partial':'full';field('note').value=entry.note||'';
              noReplacementSelected=!entry.replacementId;
              field('workStart').value=entry.type==='overtime'?entry.start||'':'';field('workEnd').value=entry.type==='overtime'?entry.end||'':'';
              previousSelection=selectedMember+':'+d;field('coverStart').value=entry.replacementStart||'';field('coverEnd').value=entry.replacementEnd||'';
            }
          }
          anchor=d;
        }
      }else if(action==='month'){
        const next=new Date(month+'T12:00:00Z');next.setUTCMonth(next.getUTCMonth()+Number(button.dataset.step));month=next.toISOString().slice(0,7)+'-01';navigationDate=month;
      }else if(action==='today'){navigationDate=today();month=navigationDate.slice(0,7)+'-01';}
      else if(action==='clear'){selected.clear();anchor=null;}
      else if(action==='workdays'){for(const d of monthDates())if(available(d)&&scheduled(d))selected.add(d);}
      else if(action==='assign'){
        if(editingSavedSelection())await saveChanges(new FormData(form));
        else assignSelection(new FormData(form));
        return;
      }
      else if(action==='delete'){
        const dates=new Set(removableDates());if(!dates.size)return;
        const matches=entry=>entry.memberId===selectedMember&&dates.has(entry.date)&&groups.some(group=>group.id===entry.teamId);
        const next=copy(),count=next.exceptions.filter(matches).length;
        if(count){
          deleting=true;node('#exception-delete').disabled=true;
          try{next.exceptions=next.exceptions.filter(entry=>!matches(entry));await save(next,`${count===1?'Ändringen har':'De '+count+' ändringarna har'} tagits bort`);}
          finally{deleting=false;node('#exception-delete').disabled=false;}
        }
        for(const d of dates){drafts.delete(d);selected.delete(d);}anchor=null;
      }
      render();
    }catch(err){error.textContent=err.message;}
  });
  form.addEventListener('change',event=>{
    if(event.target.name==='calendarDate'){
      try{navigationDate=model.addDays(event.target.value,0);}catch{return;}
      month=navigationDate.slice(0,7)+'-01';render();
      node('[data-date="'+navigationDate+'"]')?.focus();
    }else if(['replacementPartTime','replacementRegular'].includes(event.target.name)){
      if(!node('#exception-replacement-options').hidden)showPersonSuggestions('replacement',personPickers.replacement.query);
    }else if(event.target.name==='member'){
      chooseMember(event.target.value);
    }else if(event.target.name==='type'){
      if(event.target.value==='overtime'){
        const first=[...selected].sort()[0],group=first&&groupFor(selectedMember,first),pass=group?model.getShift(workspace.working,group.id,selectedMember,first):{},planned=group?model.getReplacementShift(workspace.working,group.id,selectedMember,first):{};
        field('workStart').value=pass.start||pass.originalStart||planned.start||'';field('workEnd').value=pass.end||pass.originalEnd||planned.end||'';
      }
      updateCover();
    }else if(['replacement','coverMode','coverStart','coverEnd'].includes(event.target.name)){
      if(event.target.name==='replacement')noReplacementSelected=!event.target.value;
      updateCover();
    }
  });
  render();
}
function teamSettings() {
  const team=workingTeam();if(!team)return;
  modal('Gruppinställningar','Ändra gruppens namn eller ta bort gruppen.',`<label>Gruppnamn<input name="name" value="${esc(team.name)}" required maxlength="60"></label>`,async f=>{const name=f.get('name').trim();if(!name)throw new Error('Ange ett gruppnamn.');const next=copy();next.teams.find(t=>t.id===team.id).name=name;await save(next);},{extra:'<button type="button" class="danger-text" data-action="delete-team">Ta bort grupp</button>'});
}
function workTeamSettings() {
  const {team}=organizationSelection();if(!team)return;
  modal('Teaminställningar','Ändra teamets namn eller ta bort teamet.',
    `<label>Teamnamn<input name="name" value="${esc(team.name)}" required maxlength="60"></label>`,async f=>{
      const name=String(f.get('name')||'').trim();if(!name)throw new Error('Ange ett teamnamn.');
      const next=copy(),target=next.workTeams.find(item=>item.id===team.id);
      if(!target)throw new Error('Teamet kunde inte hittas.');
      target.name=name;await save(next,'Teamets namn har sparats');
    },{extra:`<button type="button" class="danger-text" data-action="delete-work-team" data-team="${esc(team.id)}">Ta bort team</button>`});
}
function deleteWorkTeamModal(teamId=organizationSelection().team?.id) {
  const team=workspace.working.workTeams.find(item=>item.id===teamId);if(!team)return;
  const count=workspace.working.teams.filter(group=>group.workTeamId===team.id).length;
  modal('Ta bort team?','',
    `<p><strong>${esc(team.name)}</strong> tas bort tillsammans med ${count?(count===1?'1 grupp och dess schema':count+' grupper och deras scheman'):'teamets passlista'} och registrerade ändringar.</p><p class="confirmation-description">Personalen finns kvar i avdelningen och kan placeras i ett annat team. Pass där ersättaren blir utan grupp lämnas utan ersättare. Borttagningen går inte att ångra.</p>`,
    async()=>{
      await save(model.deleteWorkTeam(workspace.working,team.id),'Teamet har tagits bort');
      editingVersionId=undefined;
    },{submit:'Ta bort team',danger:true});
}
function deleteTeamModal() {
  const team=workingTeam();if(!team)return;
  modal('Ta bort grupp?', 'Gruppens schema och historik tas bort när du bekräftar.',
    `<p><strong>${esc(team.name)}</strong> tas bort tillsammans med gruppens grundscheman och individuella ändringar. Personalen finns kvar i avdelningen och kan placeras i en annan grupp.</p>`,
    async()=>{
      const next=model.deleteTeam(workspace.working,team.id);
      await save(next,'Gruppen har tagits bort');
      editingVersionId=undefined;
    },{submit:'Ta bort grupp',danger:true});
}

function download(content,type,name) {const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function renderLogin(error='') {
  $('#app').innerHTML=`<main class="login-page"><a class="brand" href="./"><img class="brand-mark" src="./assets/favicon.svg?v=2" width="38" height="38" alt="">RSSB</a><section class="login-card"><h1>Ditt nästa pass<br>börjar här.</h1><p>Logga in för att se ditt schema och vilka du ska arbeta med.</p><form id="login-form"><label>E-post<input name="email" type="email" autocomplete="username" required placeholder="du@exempel.se"></label><label>Lösenord<input name="password" type="password" autocomplete="current-password" required minlength="6"></label><p class="form-error" role="alert">${esc(error)}</p><button class="primary-btn" type="submit">Logga in ${icon('arrow')}</button></form><small>Din administratör skapar ditt konto. Kontakta administratören om du behöver åtkomst eller ett nytt lösenord.</small></section><p class="login-caption">Ett tydligt schema. En lugnare vecka.</p></main>`;
  $('#login-form').onsubmit=async e=>{e.preventDefault();e.submitter.disabled=true;const f=new FormData(e.target);try{workspace=await store.login(f.get('email'),f.get('password'));shell();}catch(err){renderLogin(err.message);}};
}

let staffDragSource = null;
let justDraggedStaff = false;
let cancelStaffDrag = null;
function extractStaffBoardLayout() {
  const board = document.querySelector?.('.staff-board');
  if (!board?.querySelectorAll) return [];
  const lanes = [...board.querySelectorAll('.staff-lane')];
  return lanes.map(lane => {
    return [...lane.querySelectorAll('.staff-column')]
      .map(col => col.dataset.columnId)
      .filter(Boolean);
  }).filter(lane => lane.length > 0);
}
function pruneEmptyLanes(board) {
  if (!board?.querySelectorAll) return;
  board.querySelectorAll('.staff-lane').forEach(lane => {
    if (!lane.querySelector('.staff-column')) {
      lane.remove();
    }
  });
}
// Keep the board still while dragging; commit only the highlighted destination on release.
function staffDropTarget(board, source, x, y) {
  const bounds = board.getBoundingClientRect();
  if (x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom) return null;
  const lanes = [...board.querySelectorAll('.staff-lane')];
  const lane = lanes.find(item => {
    const r = item.getBoundingClientRect();
    return x >= r.left - 9 && x <= r.right + 9 && y >= r.top - 9 && y <= r.bottom + 36;
  });
  if (!lane) return null;
  const rect = lane.getBoundingClientRect();
  const edge = Math.min(28, rect.width * 0.12);
  if (x < rect.left + edge || x > rect.right - edge) {
    const after = x > rect.right - edge;
    if (lane === source.parentElement && lane.children.length === 1) return null;
    return { lane, edge: true, after, left: (after ? rect.right : rect.left) - 2, top: rect.top, width: 4, height: rect.height };
  }
  const columns = [...lane.children].filter(column => column !== source);
  const before = columns.find(column => {
    const r = column.getBoundingClientRect();
    return y < r.top + r.height / 2;
  }) || null;
  if (lane === source.parentElement && (before === source.nextElementSibling || (!before && source === lane.lastElementChild))) return null;
  const top = before ? before.getBoundingClientRect().top - 9 : (columns.at(-1)?.getBoundingClientRect().bottom ?? rect.top) + 9;
  return { lane, before, left: rect.left, top: top - 2, width: rect.width, height: 4 };
}
function bindStaffColumnDrag() {
  const board = document.querySelector?.('.staff-board');
  if (!board?.querySelectorAll) return;
  board.querySelectorAll('.staff-column').forEach(column => {
    const heading = column.querySelector('.staff-column-heading');
    if (!heading) return;
    heading.ondragstart = e => e.preventDefault();
    heading.onclick = e => {
      if (e.target?.closest?.('button, a, input, select') || justDraggedStaff) return;
      toggleStaffColumnCollapse(column);
    };
    heading.onkeydown = e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (!staffDragSource) toggleStaffColumnCollapse(column);
      }
    };
    heading.onpointerdown = e => {
      if (!e.isPrimary || e.button !== 0 || e.target?.closest?.('button, a, input, select')) return;
      cancelStaffDrag?.();
      justDraggedStaff = false;
      const startX = e.clientX, startY = e.clientY;
      let x = startX, y = startY, ghost, marker, frame, target;
      let offsetX = 0, offsetY = 0, lastTime;
      const paint = time => {
        if (!column.isConnected) { finish(false); return; }
        // Time-based edge scrolling works the same on high-refresh displays.
        const elapsed = Math.min(time - (lastTime ?? time), 32);
        lastTime = time;
        const edge = 64;
        const speed = y < edge ? -Math.min(1, (edge - y) / edge) : y > window.innerHeight - edge ? Math.min(1, (y - window.innerHeight + edge) / edge) : 0;
        if (speed) window.scrollBy(0, speed * elapsed * 0.65);
        ghost.style.transform = 'translate3d(' + (x - offsetX) + 'px,' + (y - offsetY) + 'px,0)';
        target = staffDropTarget(board, column, x, y);
        marker.hidden = !target;
        if (target) Object.assign(marker.style, { left: target.left + 'px', top: target.top + 'px', width: target.width + 'px', height: target.height + 'px' });
        frame = requestAnimationFrame(paint);
      };
      const move = event => {
        if (event.pointerId !== e.pointerId) return;
        x = event.clientX; y = event.clientY;
        if (!ghost) {
          if (Math.hypot(x - startX, y - startY) < 8) return;
          const rect = column.getBoundingClientRect();
          offsetX = startX - rect.left; offsetY = startY - rect.top;
          ghost = column.cloneNode(true);
          ghost.classList.add('staff-drag-preview');
          ghost.setAttribute('aria-hidden', 'true');
          ghost.inert = true;
          ghost.removeAttribute('id');
          ghost.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
          Object.assign(ghost.style, { width: rect.width + 'px', height: rect.height + 'px' });
          marker = document.createElement('div');
          marker.className = 'staff-drop-marker';
          marker.hidden = true;
          document.body.append(ghost, marker);
          staffDragSource = column;
          column.classList.add('staff-column-dragging');
          document.body.classList.add('staff-is-dragging');
          frame = requestAnimationFrame(paint);
        }
        event.preventDefault();
      };
      const finish = commit => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', cancel);
        window.removeEventListener('blur', cancel);
        window.removeEventListener('keydown', key);
        heading.removeEventListener('lostpointercapture', cancel);
        if (heading.hasPointerCapture?.(e.pointerId)) heading.releasePointerCapture(e.pointerId);
        cancelStaffDrag = null;
        if (!ghost) return;
        cancelAnimationFrame(frame);
        target = commit ? staffDropTarget(board, column, x, y) : null;
        ghost.remove(); marker.remove();
        column.classList.remove('staff-column-dragging');
        document.body.classList.remove('staff-is-dragging');
        staffDragSource = null;
        justDraggedStaff = true;
        setTimeout(() => { justDraggedStaff = false; }, 0);
        if (target) {
          if (target.edge) {
            const lane = document.createElement('div');
            lane.className = 'staff-lane';
            board.insertBefore(lane, target.after ? target.lane.nextElementSibling : target.lane);
            lane.appendChild(column);
          } else target.lane.insertBefore(column, target.before);
          pruneEmptyLanes(board);
          saveStaffColumnsOrder(extractStaffBoardLayout());
          layoutStaffBoard();
        }
      };
      const up = event => {
        if (event.pointerId !== e.pointerId) return;
        x = event.clientX; y = event.clientY;
        finish(true);
      };
      const cancel = () => finish(false);
      const key = event => { if (event.key === 'Escape') { event.preventDefault(); cancel(); } };
      cancelStaffDrag = cancel;
      heading.setPointerCapture?.(e.pointerId);
      heading.addEventListener('lostpointercapture', cancel);
      window.addEventListener('pointermove', move, { passive: false });
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', cancel);
      window.addEventListener('blur', cancel);
      window.addEventListener('keydown', key);
    };
  });
}
function bindRotationDrag() {
  let source;
  document.querySelectorAll('.rotation-table tbody tr').forEach(row=>{row.ondragstart=e=>{if(e.target.closest('select,button')){e.preventDefault();return;}source=Number(row.dataset.row);e.dataTransfer.effectAllowed='move';};row.ondragover=e=>{e.preventDefault();};row.ondrop=async e=>{e.preventDefault();const target=Number(row.dataset.row);if(source===undefined||source===target)return;await reorderRow(source,target);};});
}
async function reorderRow(from,to) {const next=copy(),team=next.teams.find(t=>t.id===workingTeam().id),v=editingVersion(team);const indices=v.rotation.map((_,i)=>i);const [moved]=indices.splice(from,1);indices.splice(to,0,moved);model.remapPersonalSchedules(v,indices);const [row]=v.rotation.splice(from,1);v.rotation.splice(to,0,row);await save(next,'Veckornas ordning har ändrats');}
function deleteRotationRow(index) {
  const team=workingTeam(),version=editingVersion(team);
  if(version.rotation.length<=1||!Number.isInteger(index)||index<0||index>=version.rotation.length)return;
  modal(`Ta bort vecka ${index+1}?`,'Veckan tas bort och rotationen blir kortare. Medarbetare på den borttagna veckan flyttas till nästa vecka i rotationen.',`<p>Övriga veckor behåller sin ordning. Ändringen sparas direkt när du bekräftar.</p>`,async()=>{
    const next=copy(),target=next.teams.find(t=>t.id===team.id).versions.find(v=>v.id===version.id);
    if(JSON.stringify(target)!==JSON.stringify(version))throw new Error('Grundschemat har ändrats. Stäng och försök igen.');
    model.remapPersonalSchedules(target,target.rotation.map((_,i)=>i).filter(i=>i!==index));
    target.rotation.splice(index,1);
    for(const [id,value] of Object.entries(target.positions)){
      const position=Number(value);
      if(position>index+1)target.positions[id]=position-1;
      else if(position===index+1)target.positions[id]=index<target.rotation.length?index+1:1;
    }
    await save(next,`Vecka ${index+1} har tagits bort`);
  },{submit:'Ta bort veckan'});
}
function openAdmin() {
  if (!hasAdminRole()) return;
  const enter = () => { ui.view='admin'; shell(); window.scrollTo({top:0,behavior:'smooth'}); };
  if (adminUnlocked || rememberedAdmin()) { adminUnlocked = true; enter(); return; }
  // A local UI lock. Cloud authorization is still enforced by the server role.
  modal('Öppna Hantera','Ange lösenordet för att hantera schemat.',
    '<label>Lösenord<input name="password" type="password" autocomplete="current-password" required autofocus></label>',
    async form => {
      if (form.get('password') !== 'lirrydoz') throw new Error('Fel lösenord. Försök igen.');
      if (!hasAdminRole()) throw new Error('Du saknar behörighet att hantera schemat.');
      adminUnlocked = true;
      try { sessionStorage.setItem(adminRememberKey, 'true'); } catch { /* Continue even when browser storage is unavailable. */ }
      try { localStorage.removeItem?.(adminRememberKey); } catch {}
      enter();
    }, {submit:'Öppna Hantera'});
}
async function handleAction(button) {
  const action=button.dataset.action;
  switch(action) {
    case 'roster-edit':if(admin()&&ui.editingSchedule){const groupId=button.dataset.group||currentTeam().id;const existing=workspace.working.exceptions.find(e=>e.teamId===groupId&&e.memberId===button.dataset.member&&e.date===button.dataset.date);exceptionModal({id:existing?.id,memberId:button.dataset.member,date:button.dataset.date,groupId});}break;
    case 'view': if(button.dataset.view==='admin'){openAdmin();break;}ui.view='schedule';ui.editingSchedule=false;adminUnlocked=false;shell();window.scrollTo({top:0,behavior:'smooth'});break;
    case 'admin':openAdmin();break;
    case 'navigate': ui.date=model.addDays(ui.date,Number(button.dataset.step)*7);shell();break;
    case 'today':ui.date=today();shell();scrollToToday(true);break;
    case 'match-rotation':if(admin())openRotationMatch();break;
    case 'match-week-step':if(admin()&&rotationMatch){setRotationMatchMonday(model.addDays(rotationMatch.monday,Number(button.dataset.step)*7));}break;
    case 'match-week-today':if(admin()&&rotationMatch){setRotationMatchMonday(model.mondayOf(today()));}break;
    case 'admin-tab':if(admin()){ui.adminTab=button.dataset.tab;shell();}break;
    case 'changes-page':if(admin()){ui.changePage=Math.max(0,(ui.changePage||0)+Number(button.dataset.step));shell();}break;
    case 'changes-reset':if(admin()){ui.changeQuery='';ui.changeYear='';ui.changeMonth='';ui.changeType='';ui.changePage=0;shell();}break;
    case 'close-modal':$('#modal').close();break;
    case 'add-department':if(admin())organizationModal('department');break;
    case 'rename-department':if(admin())organizationModal('department',true);break;
    case 'add-work-team':if(admin())organizationModal('team');break;
    case 'rename-work-team':if(admin())organizationModal('team',true);break;
    case 'work-team-settings':if(admin())workTeamSettings();break;
    case 'delete-work-team':if(admin())deleteWorkTeamModal(button.dataset.team);break;
    case 'add-team':if(admin())addTeam();break;
    case 'add-hourly':if(admin())personModal(undefined,true);break;
    case 'add-person':if(admin())personModal();break;
    case 'edit-person':if(admin())personModal(button.dataset.member);break;
    case 'delete-person':if(admin())deletePersonModal(button.dataset.member);break;
    case 'person-schedule':if(admin())personScheduleModal(button.dataset.member);break;
    case 'new-rotation':if(admin())await newRotation();break;
    case 'sync-reference-today':if(admin()){
      const currentMonday=model.mondayOf(today());
      const next=copy(),team=next.teams.find(t=>t.id===workingTeam().id),v=editingVersion(team);
      for(const m of team.members){
        const curPos=model.rotationPosition(v,m.id,currentMonday);
        if(curPos)v.positions[m.id]=curPos;
      }
      v.referenceMonday=currentMonday;
      await save(next,'Rotationens veckor har stämts av');
    }break;
    case 'shift-team-rotation':if(admin()){
      const step=Number(button.dataset.step);
      const next=copy(),team=next.teams.find(t=>t.id===workingTeam().id),v=editingVersion(team);
      const len=v.rotation.length;
      if(!len)return;
      for(const m of team.members){
        const cur=Number(v.positions[m.id]);
        if(cur)v.positions[m.id]=((cur-1+step)%len+len)%len+1;
      }
      await save(next,step>0?'Teamets rotation flyttades 1 vecka framåt':'Teamets rotation flyttades 1 vecka bakåt');
    }break;
    case 'add-shift':if(admin())shiftModal();break;
    case 'edit-shift':if(admin())shiftModal(button.dataset.code);break;
    case 'exception':if(admin())exceptionModal({date:button.dataset.date,memberId:button.dataset.member});break;
    case 'edit-exception':if(admin())exceptionModal({id:button.dataset.id});break;
    case 'delete-exception':if(admin()){const next=copy();next.exceptions=next.exceptions.filter(e=>e.id!==button.dataset.id);await save(next,'Ändringen har tagits bort');$('#modal').close();}break;
    case 'settings':if(admin())teamSettings();break;
    case 'delete-team':if(admin())deleteTeamModal();break;
    case 'edit-schedule':if(admin()){ui.editingSchedule=true;ui.view='schedule';shell();}break;
    case 'export':if(admin())download(JSON.stringify(workspace.working,null,2),'application/json',`rssb-backup-${today()}.json`);break;
    case 'sync-project':
      if(admin()&&!ui.busy){ui.busy=true;try{workspace=await store.syncProject();shell();toast(workspace.fileSync.message,workspace.fileSync.state==='browser');}finally{ui.busy=false;}}
      break;
    case 'delete-row':if(admin())deleteRotationRow(Number(button.dataset.row));break;
    case 'move-row':if(admin())await reorderRow(Number(button.dataset.row),Number(button.dataset.row)+Number(button.dataset.dir));break;
    case 'logout':try{sessionStorage.removeItem?.(adminRememberKey);}catch{}try{localStorage.removeItem?.(adminRememberKey);}catch{}adminUnlocked=false;ui.editingSchedule=false;ui.view='schedule';await store.logout();workspace=await store.init();shell();break;
    case 'refresh':if(!ui.busy){workspace=await store.refresh();shell();if(workspace.error)toast(workspace.error,true);else toast('Schemat har uppdaterats');}break;
  }
}
document.addEventListener('click',async e=>{
  const name=e.target.closest('[data-roster-member]');
  if(rosterTouchViewport?.matches&&name){
    if(suppressRosterClick){suppressRosterClick=false;e.preventDefault();return;}
    if(ui.rosterMemberId===name.dataset.rosterMember){ui.rosterMemberId=undefined;applyRosterFocus();}
    return;
  }
  const button=e.target.closest('[data-action]');if(!button||button.disabled)return;try{await handleAction(button);}catch(error){toast(error.message,true);}
});
document.addEventListener('input',event=>{
  if(event.target.id==='changes-search'&&admin()){
    ui.changeQuery=event.target.value;ui.changePage=0;refreshChangeResults();
  }
});
document.addEventListener('toggle',event=>{
  for(const [attribute,key] of [['changePerson','changeOpenPeople'],['changePeriod','changeOpenPeriods']]){
    const id=event.target.dataset?.[attribute];if(!id)continue;
    ui[key]=(ui[key]||[]).filter(value=>value!==id);
    if(event.target.open)ui[key].push(id);
    rememberNavigation();
  }
},true);
document.addEventListener('change',async e=>{
  const target=e.target;
  try {
    if(target.id==='person-role'&&admin()){
      const skills=$('#person-skills');if(skills)skills.hidden=target.value!=='part-time';
    }
    else if(['changes-year','changes-month','changes-type','changes-search'].includes(target.id)&&admin()){
      ui[{'changes-year':'changeYear','changes-month':'changeMonth','changes-type':'changeType','changes-search':'changeQuery'}[target.id]]=target.value;ui.changePage=0;if(target.id==='changes-year')shell();else refreshChangeResults();
    }
    else if(target.dataset?.teamActive&&admin()){const next=copy(),team=next.workTeams.find(t=>t.id===target.dataset.teamActive);if(team){team.scheduleActive=target.checked;await save(next);}}
    else if(target.dataset?.groupLabel&&admin()){
      const next=copy(),group=next.teams.find(g=>g.id===target.dataset.groupLabel);
      if(group){group.showScheduleName=target.checked;await save(next);}
    }
    else if(target.dataset?.scheduleLabel&&admin()){
      const next=copy(),department=next.departments.find(d=>d.id===target.dataset.department);
      if(department){department.scheduleLabels={team:true,group:false,...department.scheduleLabels,[target.dataset.scheduleLabel]:target.checked};await save(next);}
    }
    else if(target.id==='department-select'&&admin()){ui.departmentId=target.value;ui.workTeamId=undefined;ui.teamId=undefined;editingVersionId=undefined;shell();}
    else if(target.id==='work-team-select'&&admin()){
      if(ui.adminTab==='changes'){
        ui.changeAllTeams=target.value==='dept:'+ui.departmentId;
        ui.changePage=0;
      }
      if(!ui.changeAllTeams||ui.adminTab!=='changes')ui.workTeamId=target.value;
      ui.teamId=undefined;editingVersionId=undefined;shell();
    }
    else if(['team-select','admin-team-select'].includes(target.id)){cancelRosterHold();ui.rosterMemberId=undefined;ui.teamId=target.value;editingVersionId=undefined;localStorage.setItem('skift-team',ui.teamId);shell();}
    else if(target.id==='match-week-select'&&admin()&&rotationMatch){setRotationMatchMonday(target.value);}
    else if(target.id==='match-calendar-week'&&admin()&&rotationMatch){
      const match=/^(\d{4})-W(\d{2})$/.exec(target.value);
      if(!match){renderRotationMatch();return;}
      const monday=model.addDays(model.mondayOf(match[1]+'-01-04'),(Number(match[2])-1)*7);
      setRotationMatchMonday(monday);
    }
    else if(target.classList?.contains?.('match-position')&&admin()&&rotationMatch){rotationMatch.positions[target.dataset.member]=Number(target.value);renderRotationMatch();}
    else if(target.id==='jump-date'){if(target.value){ui.date=target.value;shell();scrollToDate(ui.date,true);}}
    else if(target.classList.contains('rotation-cell')&&admin()){const next=copy(),team=next.teams.find(t=>t.id===workingTeam().id);editingVersion(team).rotation[Number(target.dataset.row)][Number(target.dataset.day)]=target.value;await save(next,'Passet har uppdaterats');}
    else if(target.classList.contains('position-select')&&admin()){const next=copy(),team=next.teams.find(t=>t.id===workingTeam().id);if(Number(target.value))editingVersion(team).positions[target.dataset.member]=Number(target.value);else delete editingVersion(team).positions[target.dataset.member];await save(next,'Startpositionen har uppdaterats');}
    else if(target.id==='import-file'&&admin()&&target.files[0]){let state;try{state=JSON.parse(await target.files[0].text());}catch{throw new Error('Filen kunde inte läsas. Välj en giltig säkerhetskopia från RSSB.');}const errors=model.validateState(state);if(errors.length)throw new Error(errors[0]);modal('Ersätta schemat?','Säkerhetskopian ersätter det aktuella schemat och publiceras direkt när du bekräftar.',`<p>${state.teams.length} team i säkerhetskopian.</p>`,async()=>{await save(state,'Säkerhetskopian har importerats');ui.teamId=undefined;editingVersionId=undefined;shell();},{submit:'Importera schema'});}
  }catch(error){toast(error.message,true);shell();}
});
$('#modal').addEventListener('click',e=>{if(e.target===$('#modal')){const rect=e.target.getBoundingClientRect();if(e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom)e.target.close();}});
let refreshingSchedule = false;
let checkingDeployment = false;
async function reloadForNewDeployment() {
  if (!deployedAssetVersion || deployedAssetVersion.includes('APP_BUILD_VERSION') || checkingDeployment) return;
  checkingDeployment = true;
  try {
    const url = new URL('build-version.json', location.href);
    url.searchParams.set('check', Date.now());
    const response = await fetch(url, {cache:'no-store'});
    if (!response.ok) return;
    const {version} = await response.json();
    if (!version || version === deployedAssetVersion) {
      sessionStorage.removeItem('skift-reload-version');
      return;
    }
    let previousReload;
    try { previousReload = JSON.parse(sessionStorage.getItem('skift-reload-version') || 'null'); } catch {}
    if (previousReload?.version === version && Date.now() - previousReload.at < 5 * 60 * 1000) return;
    sessionStorage.setItem('skift-reload-version', JSON.stringify({version, at:Date.now()}));
    const page = new URL(location.href);
    page.searchParams.set('_asset_version', version);
    page.searchParams.set('_asset_retry', Date.now());
    location.replace(page.href);
  } catch {
    // A temporary network error should not interrupt the current schedule.
  } finally {
    checkingDeployment = false;
  }
}
async function refreshSharedSchedule() {
  const canApply=()=>Boolean(workspace)&&workspace.role!=='signed-out'&&!$('#modal').open&&!ui.busy;
  if(refreshingSchedule||!canApply())return;
  refreshingSchedule=true;
  try {const fresh=await store.refresh({canApply});if(!canApply())return;if(fresh.role==='signed-out'){workspace=fresh;shell();return;}if(fresh.error){toast(fresh.error,true);return;}for(const state of [fresh.working,fresh.published])if(state)model.useLoopingSchedules(state);if(fresh.revision!==workspace.revision||fresh.role!==workspace.role||JSON.stringify(fresh.published)!==JSON.stringify(workspace.published)||JSON.stringify(fresh.working)!==JSON.stringify(workspace.working)){workspace=fresh;shell();toast('Ditt schema är uppdaterat');}}catch(error){toast(error.message,true);}finally{refreshingSchedule=false;}
}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refreshSharedSchedule();});
window.addEventListener('focus',refreshSharedSchedule);
window.addEventListener('pageshow',refreshSharedSchedule);
window.addEventListener('focus',reloadForNewDeployment);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')reloadForNewDeployment();});
window.addEventListener('storage',event=>{if(event.key==='skift-workspace-v1'||event.key===null)refreshSharedSchedule();});
$('#modal').addEventListener('close',refreshSharedSchedule);
setInterval(()=>{if(document.visibilityState==='visible'){refreshSharedSchedule();reloadForNewDeployment();}},60000);
try {workspace=await store.init();shell();if(workspace.error&&workspace.role!=='signed-out')toast(workspace.error,true);}catch(error){$('#app').innerHTML=`<main class="error-page">${icon('info')}<h1>Vi kunde inte öppna din arbetsyta.</h1><p>${esc(error.message)}</p><button class="primary-btn" onclick="location.reload()">Försök igen</button></main>`;}

function setRotationMatchMonday(newMonday) {
  const team=workspace.working.teams.find(t=>t.id===rotationMatch.teamId);
  const active=model.activeVersion(team,newMonday);
  if(active&&active.id!==rotationMatch.versionId){
    rotationMatch=createRotationMatch(team,active,newMonday);
    renderRotationMatch();
    return;
  }
  const previous={...rotationMatch.version,referenceMonday:rotationMatch.monday,positions:rotationMatch.positions};
  rotationMatch.positions=Object.fromEntries(team.members.map(m=>[m.id,model.rotationPosition(previous,m.id,newMonday)]));
  rotationMatch.monday=newMonday;
  renderRotationMatch();
}
function matchWeekOptions(team, version, currentMonday) {
  const thisMon=model.mondayOf(today());
  const year=model.isoWeek(currentMonday).year;
  const firstMonday=model.mondayOf(year+'-01-04');
  const mondays=[];
  let w=1;
  while(true){
    const m=model.addDays(firstMonday,(w-1)*7);
    const info=model.isoWeek(m);
    if(info.year!==year)break;
    mondays.push(m);
    w++;
  }
  return mondays.map(m=>{
    const info=model.isoWeek(m);
    const end=model.addDays(m,6);
    const label=`Vecka ${info.week} (${fmt(m,{day:'numeric',month:'short'})}–${fmt(end,{day:'numeric',month:'short'})})${m===thisMon?' · Denna vecka':''}`;
    return `<option value="${m}" ${m===currentMonday?'selected':''}>${esc(label)}</option>`;
  }).join('');
}
function createRotationMatch(team,version,monday) {
  // Keep all saved rotation positions aligned when changing the comparison week.
  return {teamId:team.id,versionId:version.id,version:structuredClone(version),monday,positions:Object.fromEntries(team.members.map(m=>[m.id,model.rotationPosition(version,m.id,monday)]))};
}
function rotationMatchMembers(team) {
  const state=workspace.working,date=today();
  return team.members.filter(member=>{
    const employee=state.employees?.find(item=>item.id===member.id)||member;
    return model.isActive(employee,date)
      &&model.belongsToGroup(state,member.id,team.id,date);
  });
}
function openRotationMatch() {
  const team=workingTeam(),monday=model.mondayOf(ui.date);
  const version=model.activeVersion(team,monday)||editingVersion(team);
  rotationMatch=createRotationMatch(team,version,monday);
  renderRotationMatch();
}
function renderRotationMatch() {
  const draft=rotationMatch,team=workspace.working.teams.find(t=>t.id===draft.teamId),version=draft.version,week=model.isoWeek(draft.monday);
  const members=rotationMatchMembers(team);
  const options=matchWeekOptions(team,version,draft.monday);
  const preview=copy(),previewVersion=preview.teams.find(t=>t.id===team.id).versions.find(v=>v.id===version.id);
  previewVersion.referenceMonday=draft.monday;previewVersion.positions={...draft.positions};
  const previewDays=member=>model.weekDates(draft.monday).map((date,i)=>{
    const shift=model.getShift(preview,team.id,member.id,date);
    const own=shift.working?`${esc(shift.code)} ${esc(shift.start)}–${esc(shift.end)}${shift.type==='cover'?' (ersättningspass)':''}`:label(shift.type);
    const covers=(shift.covers||[]).filter(cover=>shift.type!=='cover'||cover.exceptionId!==shift.exceptionId).map(cover=>`Ersättningspass ${esc(cover.start)}–${esc(cover.end)}`);
    return `${weekdayLabels[i]}: ${[own,...covers].join(' + ')}`;
  }).join(' · ');
  modal('Stäm av medarbetarnas veckor','Här visas personer som tillhör gruppen idag. Välj den schemavecka som stämmer med varje person. Förhandsvisningen inkluderar personligt schema och registrerad frånvaro. Inget sparas förrän du trycker Spara.',`<label>Kalendervecka att jämföra<div class="match-week-bar" style="display:flex;gap:6px;align-items:center;margin-top:6px;flex-wrap:wrap"><button type="button" class="icon-btn" data-action="match-week-step" data-step="-1" title="Föregående vecka" aria-label="Föregående vecka">${icon('left')}</button><select id="match-week-select" style="flex:1;min-width:180px">${options}</select><button type="button" class="icon-btn" data-action="match-week-step" data-step="1" title="Nästa vecka" aria-label="Nästa vecka">${icon('right')}</button><button type="button" class="secondary-btn" data-action="match-week-today" style="min-height:42px;padding:0 12px;font-size:12px;white-space:nowrap">Denna vecka</button></div><input id="match-calendar-week" type="week" value="${week.year}-W${String(week.week).padStart(2,'0')}" style="margin-top:6px"></label><p class="field-note">Grundschemat loopar utan start- eller slutdatum. Kalenderveckan används bara för att stämma av personernas plats i rotationen.</p>${members.map(m=>`<label>${esc(m.name)}<select class="match-position" data-member="${esc(m.id)}">${m.role==='part-time'?'<option value="0">Endast ersättningspass</option>':''}${version.rotation.map((_,i)=>`<option value="${i+1}" ${draft.positions[m.id]===i+1?'selected':''}>Vecka ${i+1}</option>`).join('')}</select></label><p class="field-note">${previewDays(m)}</p>`).join('')}`,async()=>{
    const next=copy(),target=next.teams.find(t=>t.id===draft.teamId).versions.find(v=>v.id===draft.versionId);
    if(JSON.stringify(target)!==JSON.stringify(draft.version))throw new Error('Grundschemat har ändrats. Stäng och öppna avstämningen igen.');
    target.referenceMonday=draft.monday;target.positions={...draft.positions};
    for(const [id,value] of Object.entries(target.positions))if(!value)delete target.positions[id];
    await save(next,'Schemaveckorna har sparats');
  });
}

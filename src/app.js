import * as model from './model.js';
import * as store from './store.js';

const $ = (selector, root = document) => root.querySelector(selector);
const esc = (value = '') => String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const icons = {
  calendar:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M16 3v4M8 3v4M3 11h18m-13 4h2m4 0h2"/>',
  team:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87"/><circle cx="9" cy="7" r="4"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  settings:'<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="10" cy="18" r="2"/>',
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
let workspace;
const adminRememberKey = 'skift-admin-remembered';
const rememberedAdmin = () => { try { return localStorage.getItem(adminRememberKey) === 'true'; } catch { return false; } };
let adminUnlocked = rememberedAdmin();
const mobileViewport = window.matchMedia?.('(max-width: 800px)');
const hasAdminRole = () => workspace?.role === 'admin' && !mobileViewport?.matches;
mobileViewport?.addEventListener('change', () => {
  if (mobileViewport.matches) {
    adminUnlocked = false;
    ui.editingSchedule = false;
    ui.view = 'schedule';
    $('#modal').close();
  }
  if (workspace) shell();
});
const admin = () => hasAdminRole() && adminUnlocked;
const data = () => admin() && ui.editingSchedule ? workspace.working : workspace.published;
const currentTeam = (state = ui.view === 'admin' ? workspace?.working : data()) => state?.teams.find(t => t.id === ui.teamId) || state?.teams[0];
const currentMember = (team = currentTeam()) => team?.members.find(m => m.id === ui.memberId) || team?.members.find(m => !m.activeUntil || m.activeUntil > ui.date) || team?.members[0];
const label = (value) => ({vacation:'Semester',sick:'Sjuk',leave:'Tjänstledig',pension:'Pensionsdag',custom:'Anpassat pass',off:'Ledig',cover:'Ersättningspass',shift:'Arbetar'}[value] || value);

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
function shell() {
  for (const state of [workspace.working,workspace.published]) if(state)model.organizeState(state);
  if (!hasAdminRole()) adminUnlocked = false;
  if (!admin()) { ui.editingSchedule = false; if (ui.view === 'admin') ui.view = 'schedule'; }
  normalizeSelection();
  if (workspace.role === 'signed-out') { renderLogin(workspace.error || ''); return; }
  const team = currentTeam(), member = currentMember(team);
  const nav = (mobile = false) => [['schedule','calendar','Schema'],...(hasAdminRole() ? [['admin','settings','Hantera']] : [])].map(([view,ico,text]) => `<button class="nav-item ${ui.view === view ? 'active' : ''}" data-action="view" data-view="${view}">${icon(ico)}<span>${text}</span>${!mobile && ui.view === view ? '<span class="nav-dot"></span>' : ''}</button>`).join('');
  $('#app').innerHTML = `<div class="app-shell">
    <aside class="sidebar"><a class="brand" href="./" aria-label="RSSB startsida"><span class="brand-mark">${icon('calendar')}</span>RSSB<span class="brand-period">.</span></a><div class="workspace-label">DIN ARBETSPLATS</div><nav aria-label="Huvudnavigation">${nav()}</nav>${workspace.mode === 'cloud' ? `<div class="sidebar-bottom"><button class="icon-btn" data-action="logout" aria-label="Logga ut">${icon('logout')}</button></div>` : ''}</aside>
    <div class="main-shell">
    <main id="content" tabindex="-1">${ui.view==='admin' ? adminView() : team ? scheduleView() : emptyWorkspace()}</main>
    <footer class="page-footer"><span></span><span></span></footer>
    </div><nav class="mobile-nav" aria-label="Mobilnavigation">${nav(true)}</nav>
  </div>`;
  if (ui.view === 'admin' && ui.adminTab === 'rotation' && ui.teamId) { setupRotationAdmin(); bindRotationDrag(); }
}

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

function scrollToToday() {
  const scroller = $('.roster-scroll');
  const column = $('.roster-table thead .roster-today');
  const corner = $('.roster-corner');
  if (!scroller || !column || !corner) return;
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

function scheduleView() {
  const state=data();
  const teams=state?.teams || [];
  if(!state.workTeams?.some(t=>t.scheduleActive!==false)&&!ui.teamId?.startsWith('dept:')){const department=state.departments?.[0];return heading(teams[0],teams,department)+empty('Inga aktiva team','Aktivera ett team under Team och grupper för att visa schemat.');}
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
  return heading(team, teams) + (groups.length?rosterView(team,groups):empty('Inga aktiva grupper','Aktivera en grupp under Team och grupper för att visa personalens schema.'));
}
function hours(minutes) { return new Intl.NumberFormat('sv-SE',{maximumFractionDigits:1}).format(minutes / 60); }
function colorFor(team,date,code) { return model.activeVersion(team,date)?.shifts[code]?.color || 'mint'; }
function rosterView(team, groups=[team], departmentScope=null) {
  const state=data(), dates=model.weekDates(ui.date), editable=admin()&&ui.editingSchedule;
  const assignments=Object.fromEntries(dates.map(d=>[d,groups.flatMap(g=>model.getDayAssignments(state,g.id,d))]));
  const home=[...new Map(groups.flatMap(g=>g.members.filter(m=>(!m.activeUntil||m.activeUntil>dates[0])&&m.activeFrom<=dates[6]&&dates.some(d=>model.belongsToGroup(state,m.id,g.id,d)))).map(m=>[m.id,m])).values()];
  const visitors=[...new Set(Object.values(assignments).flat().map(s=>s.memberId))].filter(id=>!home.some(m=>m.id===id)).map(findMember).filter(Boolean).filter(m=>!state.teams.some(g=>!visibleScheduleGroup(state,g)&&g.members.some(person=>person.id===m.id)&&dates.some(d=>model.belongsToGroup(state,m.id,g.id,d))));
  const members=[...home,...visitors];
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
      const group=groupFor(m.id,d),active=Boolean(group&&m.activeFrom<=d&&(!m.activeUntil||m.activeUntil>d));
      return {date:d,group,shifts:assignments[d].filter(a=>a.memberId===m.id),exception:group?state.exceptions.find(e=>e.teamId===group.id&&e.memberId===m.id&&e.date===d):null,main:group?model.getShift(state,group.id,m.id,d):null,active};
    });
    const shiftCells=cells.map(c=>{
      const isToday=c.date===today();
      const editAttr=(editable&&c.active&&c.group)?' data-action="roster-edit" data-group="'+esc(c.group.id)+'" data-member="'+esc(m.id)+'" data-date="'+c.date+'" role="button" tabindex="0" title="Ändra pass för '+esc(m.name)+', '+fmt(c.date,{day:'numeric',month:'short'})+'"':'';
      const offText=c.exception?label(c.exception.type):(c.active?label(c.main?.type||'off'):isHome?'Ej aktiv':'Inget pass');
      const content=c.shifts.length?c.shifts.map(a=>'<div class="roster-shift '+esc(a.color||colorFor(state.teams.find(g=>g.id===a.teamId),c.date,a.code))+'"><b>'+esc(a.code||'↗')+(a.type==='cover'?' ↗':'')+'</b><span>'+a.start+'–'+a.end+'</span>'+(a.type==='cover'?'<small class="roster-shift-status">Ersättningspass</small>':c.exception?'<small class="roster-shift-status">'+label(c.exception.type)+'</small>':'')+'</div>').join(''):'<div class="roster-off'+(offText==='Ledig'?' roster-day-off':'')+'">'+(offText==='Ledig'?'':(c.exception||c.main?.personalSchedule)&&c.main?.code?'<b class="roster-absence-code">'+esc(c.main.code)+'</b>':'—')+'<span>'+offText+'</span></div>';
      const replacement=c.exception?.replacementId?findMember(c.exception.replacementId):null;
      const replacementInfo=replacement?'<div class="roster-replacement"><span title="Ersättare: '+esc(replacement.name)+'">Ersättare: '+esc(replacement.name)+'</span></div>':editable&&c.main?.needsCoverage?'<div class="roster-replacement roster-needs-cover">Ersättare behövs</div>':'';
      const absenceCard=!c.shifts.length&&offText!=='Ledig'&&(replacementInfo||((c.exception||c.main?.personalSchedule)&&c.main?.code));
      const cellContent=absenceCard?'<div class="roster-shift roster-absence-card '+esc(colorFor(c.group,c.date,c.main?.code))+'">'+content+replacementInfo+'</div>':content+replacementInfo;
      return '<td class="'+(isToday?'roster-today':'')+(editable&&c.active&&c.group?' roster-editable':'')+'"'+editAttr+'>'+cellContent+'</td>';
    }).join('');

    const workTeam=state.workTeams?.find(t=>t.id===ownGroup?.workTeamId);
    const visibility=state.departments?.find(d=>d.id===workTeam?.departmentId)?.scheduleLabels;
    const visibleLabels=[workTeam?.scheduleActive!==false?workTeam?.name:'',visibility?.group&&ownGroup?.showScheduleName!==false?ownGroup?.name:''].filter(Boolean).join(' · ');
    const subLabel=visibleLabels!==null?visibleLabels:departmentScope?(workTeam?.name||ownGroup?.name||(isHome?'':'Gästande')):(position?'':(isHome?'Timvikarie':'Gästande ersättare'));
    return '<tbody class="roster-person"><tr class="roster-shifts roster-last"><th scope="row" class="roster-name"><div class="roster-person-label"><span>'+esc(m.name)+(subLabel?'<small>'+esc(subLabel)+'</small>':'')+'</span></div></th>'+shiftCells+'</tr></tbody>';
  }).join('');
  const body=rows;
  const captionTitle=departmentScope?departmentScope.name:(team?.name||'');
  return '<section class="roster-panel"><div class="roster-scroll" tabindex="0" role="region" aria-label="Teamets veckoschema, rulla i sidled för fler dagar"><table class="roster-table"><caption class="sr-only">'+esc(captionTitle)+', kalendervecka '+model.isoWeek(ui.date).week+'</caption><colgroup><col class="roster-name-col">'+dates.map(()=>'<col>').join('')+'</colgroup><thead><tr><th scope="col" class="roster-corner">V. '+model.isoWeek(ui.date).week+'</th>'+dates.map((d,i)=>'<th scope="col" class="'+(d===today()?'roster-today':'')+' '+(i>4?'roster-weekend':'')+'"><span>'+weekdayNames[i]+'</span><strong>'+fmt(d,{day:'numeric',month:'short'})+'</strong>'+(d===today()?'<small>Idag</small>':'')+'</th>').join('')+'</tr></thead>'+body+'</table></div></section>';
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
  const groups = state.teams.filter(g => g.workTeamId === team?.id);
  const group = groups.find(g => g.id === ui.teamId) || groups[0];
  ui.teamId = group?.id;
  return { state, department, teams, team, groups, group };
}
const orgOptions = (items, selected) => items.map(x => `<option value="${esc(x.id)}" ${x.id===selected?'selected':''}>${esc(x.name)}</option>`).join('');
function adminView() {
  const {state, department, teams, team, groups, group} = organizationSelection();
  const employees = state.employees.filter(e => e.departmentId === department?.id);
  return `<div class="page-heading admin-heading"><div><h1>Hantera avdelningen</h1><p>Samla personalen, placera i grupper och anpassa gruppernas scheman.</p></div></div>
  <div class="organization-select"><label>Avdelning<select id="department-select">${orgOptions(state.departments, department?.id)}</select></label>${ui.adminTab!=='changes'?'<button class="secondary-btn" data-action="add-department">Ny avdelning</button><button class="text-button" data-action="rename-department">Byt namn</button>':''}</div>
  <div class="admin-tabs" role="tablist">${[['people',`Personal (${employees.length})`],['rotation','Team och grupper'],['changes','Individuella ändringar']].map(([id,name])=>`<button role="tab" aria-selected="${ui.adminTab===id}" class="${ui.adminTab===id?'active':''}" data-action="admin-tab" data-tab="${id}">${name}</button>`).join('')}</div>
  ${ui.adminTab==='people'?departmentPeople(employees,state):ui.adminTab==='changes'?individualChangesView(teams,team,groups,group):`<div class="team-group-selectors"><div class="organization-select"><label>Team<select id="work-team-select">${orgOptions(teams,team?.id)}</select></label><button class="secondary-btn" data-action="add-work-team">Nytt team</button>${team?'<button class="text-button" data-action="rename-work-team">Byt namn</button>':''}</div>${team?`<div class="organization-select"><label>Grupp · eget schema<select id="admin-team-select">${orgOptions(groups,group?.id)}</select></label><button class="secondary-btn" data-action="add-team">Ny grupp</button>${group?'<button class="text-button" data-action="settings">Byt namn på grupp</button>':''}</div>`:''}</div>${group?`${ui.adminTab==='changes'?changesAdmin(group):rotationAdmin(group)}`:empty(team?'Skapa teamets första grupp':'Skapa avdelningens första team',team?'Varje grupp har ett eget schema, till exempel dag, kväll eller natt.':'Ett team samlar personal som arbetar med samma sak.',team?'add-team':'add-work-team',team?'Skapa grupp':'Skapa team')}`}
  ${ui.adminTab==='rotation'?`<section class="admin-panel"><div class="panel-heading"><div><h2>Inställningar för schemat</h2><p>Inaktiverade team och grupper döljs i hela schemat.</p></div></div><div class="schedule-label-settings">${[['team','Visa teamet '+(team?.name||'')]].map(([key,label])=>`<label><input type="checkbox" data-team-active="${esc(team?.id||'')}" ${(team?.scheduleActive!==false)?'checked':''}> ${label}<span class="schedule-setting-state">${(team?.scheduleActive!==false)?'Aktiv':'Inaktiverad'}</span></label>`).join('')}</div><div class="schedule-label-settings">${groups.map(g=>`<label><input type="checkbox" data-group-label="${esc(g.id)}" ${g.showScheduleName!==false?'checked':''}> Visa gruppen ${esc(g.name)}<span class="schedule-setting-state">${g.showScheduleName!==false?'Aktiv':'Inaktiverad'}</span></label>`).join('')}</div></section>`:''}
  <div class="backup-bar"><span>Sparade ändringar visas direkt.</span><button class="text-button" data-action="export">Exportera säkerhetskopia</button><label class="text-button import-label">Importera säkerhetskopia<input id="import-file" type="file" accept="application/json,.json"></label></div>`;
}
function individualChangesView(teams,team,groups,group) {
  return `<div class="organization-select"><label>Team<select id="work-team-select">${orgOptions(teams,team?.id)}</select></label><label>Grupp<select id="admin-team-select">${orgOptions(groups,group?.id)}</select></label></div>${group?changesAdmin(group):empty('Ingen grupp att visa','Välj ett team med grupper. Team och grupper hanteras på fliken Team och grupper.')}`;
}
function departmentPeople(employees,state) {
  const compare=(a,b)=>a.name.localeCompare(b.name,'sv',{sensitivity:'base',numeric:true});
  const teams=state.workTeams.filter(t=>t.departmentId===ui.departmentId).sort(compare);
  const columns=teams.map(team=>({...team,people:[]}));
  const unassigned={id:'unassigned',name:'Ej placerade',people:[]}, hourly={id:'hourly',name:'Timmisar',people:[]};
  for(const employee of [...employees].sort(compare)){
    const placement=model.placementOn(employee,today());
    const column=employee.role==='part-time'?hourly:columns.find(t=>t.id===placement?.teamId)||unassigned;
    column.people.push({employee,group:state.teams.find(g=>g.id===placement?.groupId)});
  }
  if(unassigned.people.length)columns.push(unassigned);
  columns.push(hourly);
  return `<section class="admin-panel"><div class="panel-heading"><div><h2>Dina medarbetare</h2><p>Ett team per kolumn. Klicka på en person för att redigera personens schema eller byta grupp.</p></div><div class="staff-add-actions"><button class="primary-btn" data-action="add-person">${icon('plus')} Lägg till personal</button><button class="primary-btn" data-action="add-hourly">${icon('plus')} Lägg till timmis</button></div></div>${columns.length?`<div class="staff-board">${columns.map(column=>`<section class="staff-column" aria-label="${esc(column.name)}"><header class="staff-column-heading"><h3>${esc(column.name)}</h3><span aria-label="${column.people.length} medarbetare">${column.people.length}</span></header><div class="staff-column-people">${column.people.length?column.people.map(({employee:e,group},i)=>{
    const future=e.placements.filter(p=>p.from>today()).sort((a,b)=>a.from.localeCompare(b.from))[0];
    return `<button class="staff-person-card" data-action="edit-person" data-member="${esc(e.id)}" aria-label="Redigera person eller schema för ${esc(e.name)}"><span class="staff-person-details"><strong>${esc(e.name)}</strong><span>${esc(e.role==='part-time'?'Timvikarie · utan fast grupp':group?.name||'Välj grupp')}</span>${group&&model.personalScheduleOn(model.activeVersion(group,today()),e.id,today())?`<small>Personligt schema · ${model.personalScheduleOn(model.activeVersion(group,today()),e.id,today()).employmentPercent} %</small>`:''}${future?`<small>Ny placering ${esc(future.from)}</small>`:''}</span>${icon('edit')}</button>`;
  }).join(''):'<p class="staff-column-empty">Ingen personal placerad ännu.</p>'}</div></section>`).join('')}</div>`:empty('Ingen personal ännu','Lägg till avdelningens medarbetare. Du kan placera dem i grupper senare.')}</section>`;
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
  modal(employee?'Redigera medarbetare':hourly?'Lägg till timmis':'Lägg till personal',`Personalen tillhör ${esc(department.name)}. Timmisar behöver inget team eller någon grupp och kan väljas som ersättare.`, `${personalScheduleLink(employee,state)}<label>Namn<input name="name" required maxlength="60" value="${esc(employee?.name||'')}"></label><label>Anställningstyp<select name="role"><option value="member">Ordinarie</option><option value="part-time" ${(employee?.role==='part-time'||hourly)?'selected':''}>Timvikarie</option></select></label>${hourly||employee?.role==='part-time'?'<p class="field-note">Timmisen tillhör avdelningen och bokas som ersättare utan fast team eller grupp.</p>':`<label>Team och grupp<select name="placement">${options()}</select></label>`}<p class="field-note">Spara ändringar av namn och grupp innan du öppnar personens schema. Tidigare placeringar och scheman behålls.</p>`,async f=>{
    const next=copy(),name=f.get('name').trim();if(!name)throw new Error('Ange ett namn.');
    const from=today();
    let target=next.employees.find(e=>e.id===memberId);
    if(!target){target={id:model.uid(),name,role:f.get('role'),activeFrom:from,activeUntil:null,departmentId:department.id,placements:[]};next.employees.push(target);}
    target.name=name;target.role=f.get('role');
    for(const g of next.teams)for(const m of g.members)if(m.id===target.id){m.name=name;m.role=target.role;}
    const value=target.role==='part-time'?'':f.get('placement')||'',group=value.startsWith('group:')?next.teams.find(g=>g.id===value.slice(6)):null,teamId=group?.workTeamId||(value.startsWith('team:')?value.slice(5):null);
    const previous=model.placementOn(target,from);
    if(!employee||previous?.teamId!==teamId||previous?.groupId!==(group?.id||null))model.placeEmployee(next,target.id,teamId,group?.id||null,from);
    await save(next,'Medarbetaren har sparats');
  });
}

function personalScheduleLink(employee, state, date=today()) {
  if (!employee || employee.role === 'part-time') return '';
  const group = state.teams.find(g => g.id === model.placementOn(employee, date)?.groupId);
  const version = model.activeVersion(group, date);
  if (!version) return '<p class="field-note">Spara en gruppplacering för att kunna anpassa personens schema.</p>';
  const personal = model.personalScheduleOn(version, employee.id, date);
  return `<section class="personal-schedule-link"><strong>Personligt schema${personal ? ' · '+personal.employmentPercent+' %' : ''}</strong><p>Följer ${esc(group.name)}. Anpassa lediga dagar och passtider utan att ändra gruppens rotation.</p><button type="button" class="secondary-btn" data-action="person-schedule" data-member="${esc(employee.id)}">${icon('calendar')} Redigera personligt schema</button></section>`;
}

function personScheduleModal(memberId, date=today()) {
  const state=workspace.working, employee=state.employees.find(e=>e.id===memberId);
  const group=state.teams.find(g=>g.id===model.placementOn(employee,date)?.groupId);
  const version=model.activeVersion(group,date);
  if (!employee || employee.role==='part-time' || !version) { toast('Personen behöver tillhöra en grupp med ett schema på det valda datumet.',true); return; }
  const personal=model.personalScheduleOn(version,memberId,date);
  const position=model.rotationPosition(version,memberId,date);
  const weekStart=[model.mondayOf(date),version.effectiveFrom,employee.activeFrom||'1900-01-01',model.placementOn(employee,date)?.from||'1900-01-01'].sort().at(-1);
  const effectiveFrom=personal?.effectiveFrom||weekStart;
  const savedDates=[...new Set([today(),date,...(version.personalSchedules||[]).filter(s=>s.memberId===memberId).map(s=>s.effectiveFrom)])].sort();
  const rows=version.rotation.map((row,week)=>`<tr data-personal-week="${week}" class="${week===position-1?'personal-current-week':''}"><th scope="row"><strong>Vecka ${week+1}</strong><span class="personal-week-marker" ${week===position-1?'':'hidden'}>${model.mondayOf(date)===model.mondayOf(today())?'Här är personen nu':'Personens vecka'}</span><small class="personal-week-count"></small></th>${row.map((code,day)=>{
    const cell=personal?.rotation[week]?.[day], shift=version.shifts[code], key=`${week}-${day}`;
    const selectedShift=cell?.type==='shift'?version.shifts[cell.code]:shift;
    const selected=cell?.type==='shift'?`shift:${cell.code}`:cell?.type||'inherit';
    return `<td data-personal-day="${key}" class="${cell?'personal-changed-day':''}"><select class="personal-rotation-cell ${esc(selectedShift?.color||'')}" name="mode-${key}" aria-label="Schemavecka ${week+1}, ${weekdayNames[day]}"><option value="inherit" ${selected==='inherit'?'selected':''}>${code?esc(code)+' · grupp':'— · grupp'}</option><optgroup label="Frånvaro">${model.PERSONAL_ABSENCE_TYPES.map(type=>`<option value="${type}" ${selected===type?'selected':''}>${label(type)}</option>`).join('')}</optgroup><optgroup label="Byt arbetspass">${Object.entries(version.shifts).map(([c,s])=>`<option value="shift:${esc(c)}" ${selected===`shift:${c}`?'selected':''}>${esc(c)} · ${s.start}–${s.end}</option>`).join('')}</optgroup><option value="custom" ${selected==='custom'?'selected':''}>Egna tider</option></select><span class="personal-cell-time">${selectedShift?selectedShift.start+'–'+selectedShift.end:'Ledig'}</span><small class="personal-cell-date" hidden></small><small class="personal-cell-base" ${cell?'':'hidden'}>Grundpass: ${esc(code||'Ledig')}</small><div class="personal-times" ${cell?.type==='custom'?'':'hidden'}><label>Från<input type="time" name="start-${key}" aria-label="Från, schemavecka ${week+1}, ${weekdayNames[day]}" value="${esc(cell?.start||shift?.start||'')}" ${cell?.type==='custom'?'required':'disabled'}></label><label>Till<input type="time" name="end-${key}" aria-label="Till, schemavecka ${week+1}, ${weekdayNames[day]}" value="${esc(cell?.end||shift?.end||'')}" ${cell?.type==='custom'?'required':'disabled'}></label></div></td>`;
  }).join('')}</tr>`).join('');
  modal(`Personligt schema · ${esc(employee.name)}`,`Personen fortsätter på sin plats i gruppens rotation (${esc(group.name)}). Ändringarna upprepas varje varv och gäller bara den här personen. När du sparar uppdateras även det gemensamma schemat.`,
    `<div class="personal-schedule-editor"><div class="personal-settings"><label>Gäller från<input type="date" name="effectiveFrom" required value="${effectiveFrom}"></label><label>Anställningsgrad (%)<input type="number" name="employmentPercent" min="0.1" max="100" step="0.1" required value="${personal?.employmentPercent??100}"></label><label>Visa sparat schema från<select id="personal-saved-date" data-member="${esc(memberId)}">${savedDates.map(d=>`<option value="${d}" ${d===date?'selected':''}>${d}${d===today()?' · idag':''}</option>`).join('')}</select></label></div><div class="personal-table-heading"><div><h3>Det återkommande grundschemat</h3><p>Gruppens vanliga pass är ifyllda. Byt en ruta till exempelvis Tjänstledig, Semester eller ett annat pass.</p></div><label>Visa personens vecka för<input type="date" id="personal-position-date" value="${date}"></label></div><p id="personal-position" class="personal-position" aria-live="polite">Kalendervecka ${model.isoWeek(date).week} · ${esc(employee.name)} är på schemavecka ${position}.</p><p id="personal-effective-note" class="field-note" aria-live="polite"></p><button type="button" class="text-button" id="personal-start-week" hidden>Låt ändringarna gälla från den visade veckans början</button><div class="rotation-scroll personal-rotation-scroll" tabindex="0" role="region" aria-label="Personens återkommande grundschema"><table class="rotation-table personal-rotation-table"><caption class="sr-only">${esc(employee.name)} · gruppens grundschema med personliga ändringar</caption><thead><tr><th scope="col">Schemavecka</th>${weekdayLabels.map(day=>`<th scope="col">${day}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div><p class="field-note">Markerad rad visar personens plats i rotationen. Ändrade rutor upprepas varje varv från startdatumet. Välj passet märkt ”grupp” för att följa grundschemat igen. Anställningsgraden ändrar inte passen automatiskt.</p><p id="personal-hours" class="personal-hours" aria-live="polite"></p><button type="button" class="text-button" id="personal-reset">Återställ alla dagar till gruppschemat</button></div>`,async f=>{
      const next=copy(), target=next.teams.find(g=>g.id===group.id)?.versions.find(v=>v.id===version.id);
      if(JSON.stringify(target)!==JSON.stringify(version))throw new Error('Gruppschemat har ändrats. Stäng och öppna personens schema igen.');
      const rotation=version.rotation.map((row,w)=>row.map((_,d)=>{
        const key=`${w}-${d}`,mode=f.get(`mode-${key}`);
        return model.PERSONAL_ABSENCE_TYPES.includes(mode)?{type:mode}:mode==='custom'?{type:'custom',start:f.get(`start-${key}`),end:f.get(`end-${key}`)}:mode?.startsWith('shift:')?{type:'shift',code:mode.slice(6)}:null;
      }));
      model.savePersonalSchedule(next,group.id,version.id,{memberId,effectiveFrom:f.get('effectiveFrom'),employmentPercent:Number(f.get('employmentPercent')),rotation},{previousEffectiveFrom:personal?.effectiveFrom});
      await save(next,'Personligt schema sparat. Det gemensamma schemat har uppdaterats.');
    },{submit:'Spara personligt schema'});
  setupPersonalScheduleFields(version, employee, group);
}

function setupPersonalScheduleFields(version, employee, group) {
  const form=$('#modal-form'); if(!form?.querySelectorAll)return;
  const field=name=>form.querySelector(`[name="${name}"]`);
  const update=()=>{
    let groupMinutes=0, personalMinutes=0;
    form.querySelectorAll('[data-personal-week]').forEach((weekRow,w)=>{
      let changed=0;
      version.rotation[w].forEach((code,d)=>{
        const key=`${w}-${d}`, mode=field(`mode-${key}`).value, shift=version.shifts[code];
        const row=form.querySelector(`[data-personal-day="${key}"]`), custom=mode==='custom';
        row.querySelector('.personal-times').hidden=!custom;
        row.classList.toggle('personal-changed-day',mode!=='inherit');
        row.querySelector('.personal-cell-base').hidden=mode==='inherit';
        for(const name of ['start','end']){field(`${name}-${key}`).disabled=!custom;field(`${name}-${key}`).required=custom;}
        const base=shift?coverMinutes(shift.start,shift.end):0;
        const selectedShift=mode.startsWith('shift:')?version.shifts[mode.slice(6)]:mode==='inherit'?shift:null;
        field(`mode-${key}`).className=`personal-rotation-cell ${selectedShift?.color||''}`;
        row.querySelector('.personal-cell-time').textContent=custom?'Egna tider':selectedShift?`${selectedShift.start}–${selectedShift.end}`:label(mode==='inherit'?'off':mode);
        groupMinutes+=base;
        if(mode==='inherit')personalMinutes+=base;
        else { changed++; if(selectedShift)personalMinutes+=coverMinutes(selectedShift.start,selectedShift.end); if(custom&&field(`start-${key}`).value&&field(`end-${key}`).value)personalMinutes+=coverMinutes(field(`start-${key}`).value,field(`end-${key}`).value); }
      });
      weekRow.querySelector('.personal-week-count').textContent=changed?`${changed} ${changed===1?'ändring':'ändringar'}`:'';
    });
    form.querySelector('#personal-hours').textContent=`Hela rotationen: ${hours(personalMinutes)} timmar för personen / ${hours(groupMinutes)} timmar i gruppschemat${groupMinutes?' · '+new Intl.NumberFormat('sv-SE',{maximumFractionDigits:1}).format(personalMinutes/groupMinutes*100)+' % av gruppens timmar':''}. Tiderna räknas utan rastavdrag.`;
  };
  const updatePosition=()=>{
    const date=form.querySelector('#personal-position-date').value;
    if(!date)return;
    const valid=model.activeVersion(group,date)?.id===version.id&&model.belongsToGroup(workspace.working,employee.id,group.id,date)&&(!employee.activeFrom||employee.activeFrom<=date)&&(!employee.activeUntil||date<employee.activeUntil);
    const position=valid?model.rotationPosition(version,employee.id,date):0;
    form.querySelectorAll('[data-personal-week]').forEach(row=>{
      const current=Number(row.dataset.personalWeek)===position-1;
      row.querySelectorAll('[data-personal-day]').forEach((cell,day)=>{
        const note=cell.querySelector('.personal-cell-date');
        note.hidden=!current;
        const cellDate=model.addDays(model.mondayOf(date),day);
        const beforeStart=cellDate<field('effectiveFrom').value;
        note.textContent=fmt(cellDate,{day:'numeric',month:'short'})+(beforeStart?' · före startdatum':'');
        cell.classList.toggle('personal-before-start',current&&beforeStart);
      });
      row.classList.toggle('personal-current-week',current);
      const marker=row.querySelector('.personal-week-marker');marker.hidden=!current;
      marker.textContent=model.mondayOf(date)===model.mondayOf(today())?'Här är personen nu':'Personens vecka';
    });
    form.querySelector('#personal-position').textContent=position?`Kalendervecka ${model.isoWeek(date).week} (${fmt(model.mondayOf(date),{day:'numeric',month:'short'})}) · ${employee.name} är på schemavecka ${position}.`:'Personen följer inte den här gruppens schemaversion på det valda datumet.';
    const start=field('effectiveFrom').value;
    const weekStart=[model.mondayOf(date),version.effectiveFrom,employee.activeFrom||'1900-01-01',model.placementOn(employee,date)?.from||'1900-01-01'].sort().at(-1);
    form.querySelector('#personal-effective-note').textContent=start?'Ändringarna gäller från '+fmt(start,{day:'numeric',month:'short',year:'numeric'})+'.'+(position&&start>model.mondayOf(date)?' Dagar före startdatumet behåller sitt tidigare schema.':''):'';
    const startWeekButton=form.querySelector('#personal-start-week');
    startWeekButton.hidden=!position||!start||start<=weekStart;
    startWeekButton.onclick=()=>{field('effectiveFrom').value=weekStart;updatePosition();};
    const selectedRow=form.querySelector('.personal-current-week');
    if(selectedRow){
      const scroll=form.querySelector('.personal-rotation-scroll');
      scroll.scrollTop+=selectedRow.getBoundingClientRect().top-scroll.getBoundingClientRect().top-form.querySelector('thead').getBoundingClientRect().height-2;
    }
  };
  form.querySelector('#personal-position-date').addEventListener('input',updatePosition);
  field('effectiveFrom').addEventListener('input',updatePosition);
  form.addEventListener('input',update); form.addEventListener('change',update);
  form.querySelector('#personal-reset').onclick=()=>{form.querySelectorAll('select[name^="mode-"]').forEach(select=>select.value='inherit');field('employmentPercent').value=100;update();};
  update();updatePosition();
}

let editingVersionId;
let rotationMatch;
function rotationAdmin(team) {
  const version=team.versions.find(v=>v.id===editingVersionId)||model.activeVersion(team,ui.date)||team.versions.at(-1);
  if(!version)return empty('Inget grundschema ännu','Skapa ett grundschema för teamet.','new-rotation','Skapa grundschema');
  editingVersionId=version.id;
  const currentMon=model.mondayOf(today());
  const refMon=version.referenceMonday;
  const isCurrentWeek=refMon===currentMon;
  const weeksPassed=Math.round((Date.parse(currentMon)-Date.parse(refMon))/604800000);
  return `<section class="admin-panel rotation-panel"><div class="panel-heading"><div><h2>Det återkommande grundschemat</h2><p>${version.rotation.length===1?'En vecka som upprepas varje vecka.':'Schemat upprepas efter '+version.rotation.length+' veckor.'} Välj ett pass i varje ruta. En tom ruta betyder ledig. Gäller från måndag ${fmt(version.effectiveFrom,{day:'numeric',month:'short',year:'numeric'})}.</p></div><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><button class="secondary-btn" data-action="version-dates">${icon('edit')} Ändra startdatum</button><button class="secondary-btn" data-action="new-rotation">${icon('plus')} Lägg till vecka</button></div></div><div class="rotation-scroll"><table class="rotation-table"><thead><tr><th>Vecka</th>${weekdayLabels.map(d=>`<th>${d}</th>`).join('')}<th></th></tr></thead><tbody>${version.rotation.map((row,i)=>`<tr draggable="true" data-row="${i}"><th><span class="drag-handle" title="Dra för att ändra ordning">⠿</span> ${i+1}</th>${row.map((code,j)=>`<td><select class="rotation-cell ${version.shifts[code]?.color || ''}" data-row="${i}" data-day="${j}" aria-label="Vecka ${i+1}, ${weekdayNames[j]}"><option value="">—</option>${Object.keys(version.shifts).map(c=>`<option value="${esc(c)}" ${c===code?'selected':''}>${esc(c)}</option>`).join('')}</select></td>`).join('')}<td><button class="icon-btn row-move" data-action="move-row" data-row="${i}" data-dir="-1" aria-label="Flytta vecka ${i+1} uppåt" ${i===0?'disabled':''}>↑</button><button class="icon-btn row-move" data-action="move-row" data-row="${i}" data-dir="1" aria-label="Flytta vecka ${i+1} nedåt" ${i===version.rotation.length-1?'disabled':''}>↓</button><button type="button" class="icon-btn danger-text" data-action="delete-row" data-row="${i}" aria-label="Ta bort vecka ${i+1}" title="${version.rotation.length===1?'Minst en vecka måste finnas kvar':'Ta bort veckan'}" ${version.rotation.length===1?'disabled':''}>${icon('close')}</button></td></tr>`).join('')}</tbody></table></div><div class="rotation-footnote">${icon('info')} På mobilen kan du svepa tabellen i sidled. Använd pilarna för att ändra veckornas ordning.</div></section><section class="admin-panel"><div class="panel-heading"><div><h2>Stäm av mot jobbets schema</h2><p>Jämför schemaveckorna för gruppens medarbetare.</p></div><button class="primary-btn" data-action="match-rotation">Stäm av medarbetarnas veckor</button></div></section><section class="admin-panel"><div class="panel-heading"><div><h2>Passtider</h2><p>Tiderna gäller för den här schemaversionen.</p></div><button class="secondary-btn" data-action="add-shift">${icon('plus')} Lägg till pass</button></div><div class="shift-definitions">${Object.entries(version.shifts).map(([code,s])=>`<button data-action="edit-shift" data-code="${esc(code)}"><span class="code-badge ${esc(s.color)}">${esc(code)}</span><strong>${s.start}–${s.end}</strong>${icon('edit')}</button>`).join('')}</div></section>`;
}
function changesAdmin(team) {
  const changes=workspace.working.exceptions.filter(e=>e.teamId===team.id).sort((a,b)=>b.date.localeCompare(a.date));
  return `<section class="admin-panel"><div class="panel-heading"><div><h2>Individuella ändringar</h2><p>Frånvaro, kortare arbetstid och ersättningspass.</p></div><button class="secondary-btn" data-action="exception">${icon('plus')} Lägg till ändring</button></div>${changes.length?`<div class="changes-list">${changes.map(e=>{const shift=model.getShift(workspace.working,team.id,e.memberId,e.date);return `<button class="change-row" data-action="edit-exception" data-id="${esc(e.id)}"><span class="change-date">${fmt(e.date,{day:'numeric',month:'short'})}<small>${e.date.slice(0,4)}</small></span><div><strong>${esc(findMember(e.memberId)?.name || 'Tidigare medarbetare')}</strong><span>${label(e.type)}${e.start&&e.end?' · '+e.start+'–'+e.end:''}${e.replacementId?' · Ersätts av '+esc(findMember(e.replacementId)?.name||'Medarbetare'):''}</span>${shift.needsCoverage?`<small class="coverage-warning">${hours(shift.uncoveredMinutes||0)} timmar behöver ersättare</small>`:''}</div>${icon('edit')}</button>`;}).join('')}</div>`:empty('Inga individuella ändringar','Lägg till en ändring när någon är frånvarande eller behöver andra arbetstider.')}</section><div class="info-card">${icon('info')}<p><strong>Frånvarostatus visas i schemat.</strong> Publicerade scheman visar arbetstider och frånvarostatus. Dina privata anteckningar visas bara i administrationsvyn.</p></div>`;
}

function modal(title,description,body,onSubmit,options={}) {
  const dialog=$('#modal');
  dialog.innerHTML=`<div class="modal-header"><div><h2>${title}</h2></div><button class="icon-btn" data-action="close-modal" aria-label="Stäng dialogrutan">${icon('close')}</button></div>${description?`<p class="modal-description">${description}</p>`:''}<form id="modal-form">${body}<p class="form-error" role="alert"></p><div class="modal-actions">${options.extra||''}<button class="secondary-btn" type="button" data-action="close-modal">Avbryt</button><button class="primary-btn" type="submit">${options.submit || 'Spara'}</button></div></form>`;
  $('#modal-form').onsubmit=async e=>{e.preventDefault();const button=e.submitter;button.disabled=true;try {await onSubmit(new FormData(e.target));dialog.close();}catch(err){$('.form-error',dialog).textContent=err.message;}finally{button.disabled=false;}};
  dialog.showModal();
}
async function save(next, message='Ändringarna har sparats') {
  if(!admin())throw new Error('Lås upp Hantera innan du gör ändringar.');
  model.organizeState(next);
  const errors=model.validateState(next); if(errors.length)throw new Error(errors[0]);
  if(ui.busy)throw new Error('En ändring sparas. Försök igen om en stund.');
  ui.busy=true;
  try{const result=await store.publish(next);workspace={...workspace,...result};ui.busy=false;shell();toast(message);}finally{ui.busy=false;}
}
const workingTeam = () => workspace.working.teams.find(t=>t.id===ui.teamId)||workspace.working.teams[0];
const editingVersion = team => team.versions.find(v=>v.id===editingVersionId)||team.versions.at(-1);
const copy = () => structuredClone(workspace.working);
function setupRotationAdmin() {}
function versionDates() {
  const team=workingTeam(),version=editingVersion(team);
  modal('Välj grundschemats startdatum.','Startpositionerna gäller på referensmåndagen. Kontrollera dem när du ändrar datumen.',`<label>Gäller från måndag<input name="effective" type="date" value="${version.effectiveFrom}" required></label><label>Referensmåndag<input name="reference" type="date" value="${version.referenceMonday}" required></label>`,async f=>{const effective=model.mondayOf(f.get('effective')),reference=model.mondayOf(f.get('reference'));if(team.versions.some(v=>v.id!==version.id&&v.effectiveFrom===effective))throw new Error('En annan version börjar redan det datumet.');const next=copy(),target=next.teams.find(t=>t.id===team.id).versions.find(v=>v.id===version.id);target.effectiveFrom=effective;target.referenceMonday=reference;await save(next,'Schemats datum har uppdaterats');});
}

function addTeam() {
  const parent=organizationSelection().team;if(!parent){organizationModal('team');return;}
  modal('En ny grupp, ett eget schema.','Fyll sedan i passen och lägg till medarbetare.',`<label>Gruppnamn<input name="name" placeholder="t.ex. Daggruppen" required maxlength="60"></label><div class="form-grid"><label>Antal schemaveckor<input name="length" type="number" min="1" max="52" value="1" required></label><label>Börjar på måndag<input name="date" type="date" value="${model.mondayOf(ui.date)}" required></label></div><label class="checkbox-label"><input type="checkbox" name="copy"> Kopiera den valda gruppens grundschema</label>`,async f=>{
    const date=f.get('date');if(model.mondayOf(date)!==date)throw new Error('Välj en måndag som grundschemats startdatum.');
    const next=copy(), old=workingTeam(), length=Number(f.get('length')), template=old?.versions.at(-1) || model.seedState().teams[0].versions[0];
    const version={id:model.uid(),effectiveFrom:date,referenceMonday:date,rotation:Array.from({length},(_,i)=>f.has('copy')?[...(template.rotation[i%template.rotation.length])]:Array(7).fill('')),positions:{},shifts:structuredClone(template.shifts)};
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
  modal(code?`Redigera pass ${esc(code)}`:'Lägg till ett pass','Välj passkod, tider och färg för den här schemaversionen.',`<label>Passkod<input name="code" value="${esc(code||'')}" required maxlength="6" ${code?'readonly':''} pattern="[A-Za-z0-9]+"></label><div class="form-grid"><label>Börjar<input name="start" type="time" value="${shift?.start||'07:00'}" required></label><label>Slutar<input name="end" type="time" value="${shift?.end||'16:00'}" required></label></div><fieldset class="shift-color-picker"><legend>Färg</legend><div class="shift-color-options">${['amber','yellow','orange','peach','red','rose','pink','lavender','purple','indigo','blue','cyan','teal','mint','sage','slate'].map(c=>`<label class="shift-color-option" title="${colorLabel(c)}"><input type="radio" name="color" value="${c}" aria-label="${colorLabel(c)}" ${(shift?.color||'amber')===c?'checked':''} required><span class="shift-color-swatch ${c}" aria-hidden="true">${icon('check')}</span></label>`).join('')}</div></fieldset><p class="field-note">Om sluttiden är tidigare än starttiden fortsätter passet nästa dag.</p>`,async f=>{
    const newCode=f.get('code').toUpperCase();if(!code&&version.shifts[newCode])throw new Error('Den här passkoden finns redan.');if(f.get('start')===f.get('end'))throw new Error('Start- och sluttid måste vara olika.');const next=copy(), target=next.teams.find(t=>t.id===team.id).versions.find(v=>v.id===version.id);target.shifts[newCode]={start:f.get('start'),end:f.get('end'),color:f.get('color')};await save(next,'Passet har sparats');
  });
}
function coverMinutes(start,end){const minute=t=>Number(t.slice(0,2))*60+Number(t.slice(3));return (minute(end)-minute(start)+1440)%1440;}
function setupCoverFields(teamId){
  const form=$('#modal-form');if(!form?.querySelector)return;
  const field=name=>form.querySelector('[name="'+name+'"]');
  let previousPass=null;
  const update=()=>{
    const replacement=field('replacement').value,partial=field('coverMode').value==='partial';
    form.querySelector('#cover-options').hidden=!replacement;
    form.querySelector('#cover-times').hidden=!partial;
    for(const name of ['coverStart','coverEnd']){field(name).disabled=!replacement||!partial;field(name).required=Boolean(replacement&&partial);}
    const date=field('date').value,member=field('member').value;if(!date||!member)return;
    const shift=model.getShift(workspace.working,teamId,member,date),from=shift.originalStart||shift.start,to=shift.originalEnd||shift.end;
    const passKey=member+':'+date;
    if(previousPass!==passKey){
      const changedPass=previousPass!==null;
      if(changedPass||!field('coverStart').value)field('coverStart').value=from||'';
      if(changedPass||!field('coverEnd').value)field('coverEnd').value=to||'';
      previousPass=passKey;
    }
    const start=partial?field('coverStart').value:from,end=partial?field('coverEnd').value:to;
    let text=from&&to?'Ordinarie pass: '+from+'–'+to+'. ':'Inget ordinarie pass detta datum. ';
    if(start&&end)text+='Ersätter '+start+'–'+end+' ('+hours(coverMinutes(start,end))+' timmar).';
    else if(partial)text+='Välj från- och tilltid.';
    form.querySelector('#cover-summary').textContent=text;
  };
  form.addEventListener('input',update);form.addEventListener('change',update);update();
}
function exceptionModal(options={}) {
  const team=(options.groupId?workspace.working.teams.find(t=>t.id===options.groupId):null)||workingTeam(), existing=workspace.working.exceptions.find(e=>e.id===options.id), memberId=existing?.memberId||options.memberId||currentMember(team)?.id;
  if(!team.members.length){toast('Lägg till en medarbetare först.',true);return;}
  const date=existing?.date||options.date||ui.date;
  const people=[...new Map([...workspace.working.teams.flatMap(t=>t.members.map(m=>({...m,teamName:t.name}))),...(workspace.working.employees||[]).filter(e=>e.role==='part-time').map(e=>({...e,teamName:'Timmis'}))].filter(m=>(!m.activeFrom||m.activeFrom<=date)&&(!m.activeUntil||m.activeUntil>date)).map(m=>[m.id,m])).values()];
  modal(existing?'Redigera individuell ändring':'En ändring för en medarbetare.','Grundschemat fortsätter som vanligt. Ändringen gäller bara de valda datumen.',`<label>Medarbetare<select name="member">${team.members.map(m=>`<option value="${esc(m.id)}" ${m.id===memberId?'selected':''}>${esc(m.name)}</option>`).join('')}</select></label><div class="form-grid"><label>${existing?'Datum':'Från datum'}<input name="date" type="date" value="${date}" required></label>${!existing?`<label>Till och med<input name="through" type="date" value="${date}" required></label>`:''}</div><label>Typ av ändring<select name="type" id="exception-type">${['vacation','sick','leave','pension',...(existing?.type==='custom'?['custom']:[]),'off'].map(t=>`<option value="${t}" ${existing?.type===t?'selected':''}>${label(t)}</option>`).join('')}</select></label><label>Ersättare<select name="replacement"><option value="">Ingen ersättare</option>${people.map(m=>`<option value="${esc(m.id)}" ${m.id===existing?.replacementId?'selected':''}>${esc(m.name)} · ${esc(m.teamName)}</option>`).join('')}</select></label><div id="cover-options"><label>Omfattning<select name="coverMode"><option value="full">Hela passet</option><option value="partial" ${existing?.replacementStart?'selected':''}>Del av passet</option></select></label><div class="form-grid" id="cover-times"><label>Ersätter från<input name="coverStart" type="time" value="${existing?.replacementStart||''}"></label><label>Ersätter till<input name="coverEnd" type="time" value="${existing?.replacementEnd||''}"></label></div><p class="field-note" id="cover-summary" aria-live="polite"></p><p class="field-note">Vid del av passet väljer du från- och tilltid. Vid flera datum gäller samma tider varje valt datum. Överlappande pass tillåts inte.</p></div><label>Privat administratörsanteckning<textarea name="note" rows="2" maxlength="500" placeholder="Valfritt">${esc(existing?.note||'')}</textarea></label>`,async f=>{
    const next=copy(), from=f.get('date'), through=f.get('through')||from;
    if(through<from)throw new Error('Slutdatumet måste vara samma som eller efter startdatumet.');const span=Math.round((new Date(through)-new Date(from))/86400000);if(span>365)throw new Error('Välj ett datumintervall på högst ett år.');
    const type=f.get('type'), start=type===existing?.type?existing?.start||'':'', end=type===existing?.type?existing?.end||'':'', replacementId=f.get('replacement'), cs=replacementId&&f.get('coverMode')==='partial'?f.get('coverStart'):'', ce=replacementId&&f.get('coverMode')==='partial'?f.get('coverEnd'):'';
    if(replacementId&&f.get('coverMode')==='partial'&&(!cs||!ce))throw new Error('Välj både från- och tilltid för del av passet.');
    if((start&&!end)||(!start&&end))throw new Error('Ange båda arbetstiderna eller lämna båda tomma.');if(type==='custom'&&(!start||!end))throw new Error('Anpassade pass behöver en start- och sluttid.');if(start===end&&start)throw new Error('Arbetets start- och sluttid måste vara olika.');if(start&&['sick','vacation','off'].includes(type))throw new Error('Välj Anpassat pass eller Pensionsdag när personen ska arbeta kortare tid.');
    if(replacementId===f.get('member'))throw new Error('Välj en annan person som ersättare.');if((cs&&!ce)||(!cs&&ce))throw new Error('Ange båda ersättningstiderna eller lämna båda tomma.');if(cs&&cs===ce)throw new Error('Ersättningspassets start- och sluttid måste vara olika.');
    const selectedDays=new Set(f.getAll('days').map(Number));if(!existing&&!selectedDays.size)throw new Error('Välj minst en veckodag för ändringen.');
    let count=0;
    for(let i=0;i<=span;i++){const d=model.addDays(from,i);if(!existing&&!selectedDays.has((new Date(d+'T12:00:00Z').getUTCDay()+6)%7))continue;const entry={id:existing?.id||model.uid(),teamId:team.id,memberId:f.get('member'),date:d,type,...(start&&end?{start,end}:{}),...(replacementId?{replacementId,...(cs&&ce?{replacementStart:cs,replacementEnd:ce}:{})}:{}),note:f.get('note').trim()};next.exceptions=next.exceptions.filter(e=>e.id!==entry.id&&!(e.teamId===team.id&&e.memberId===entry.memberId&&e.date===d));next.exceptions.push(entry);count++;}
    if(!count)throw new Error('Det finns inga valda veckodagar i datumintervallet.');
    // Cover records carry conflicts detected by the scheduling engine.
    for(let i=0;i<=span;i++){const d=model.addDays(from,i);for(const t of next.teams){const conflicts=model.getDayAssignments(next,t.id,d).filter(s=>s.conflict);if(conflicts.length)throw new Error(`Ersättaren har överlappande pass den ${d}. Välj en annan person eller andra ersättningstider.`);}}
    await save(next,'Den individuella ändringen har sparats');
  },{extra:existing?`<button type="button" class="danger-text" data-action="delete-exception" data-id="${esc(existing.id)}">Ta bort ändring</button>`:'',submit:existing?'Spara ändring':'Lägg till ändring'});
  setupCoverFields(team.id);
  if(!existing){const fieldset=document.createElement('fieldset');fieldset.className='repeat-days';fieldset.innerHTML=`<legend>Gäller dessa veckodagar i datumintervallet</legend><div>${weekdayLabels.map((day,i)=>`<label><input name="days" type="checkbox" value="${i}" checked><span>${day}</span></label>`).join('')}</div><small>För återkommande pensionsdagar väljer du ett längre datumintervall och de aktuella veckodagarna.</small>`;$('#exception-type').closest('label').before(fieldset);}
}
function teamSettings() {
  const team=workingTeam();if(!team)return;
  modal('Gruppinställningar','Ändra gruppens namn.',`<label>Gruppnamn<input name="name" value="${esc(team.name)}" required maxlength="60"></label>`,async f=>{const name=f.get('name').trim();if(!name)throw new Error('Ange ett teamnamn.');const next=copy();next.teams.find(t=>t.id===team.id).name=name;await save(next);},{extra:'<button type="button" class="danger-text" data-action="delete-team">Ta bort grupp</button>'});
}
function deleteTeamModal() {
  const team=workingTeam();if(!team)return;
  modal('Ta bort grupp?', 'Gruppens schema och historik tas bort när du bekräftar.',
    `<p><strong>${esc(team.name)}</strong> tas bort tillsammans med gruppens grundscheman och individuella ändringar. Personalen finns kvar i avdelningen och kan placeras i en annan grupp.</p>`,
    async()=>{
      const next=model.deleteTeam(workspace.working,team.id);
      await save(next,'Gruppen har tagits bort');
      editingVersionId=undefined;
    },{submit:'Ta bort grupp'});
}

function download(content,type,name) {const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function renderLogin(error='') {
  $('#app').innerHTML=`<main class="login-page"><a class="brand" href="./"><span class="brand-mark">${icon('calendar')}</span>RSSB<span class="brand-period">.</span></a><section class="login-card"><h1>Ditt nästa pass<br>börjar här.</h1><p>Logga in för att se ditt schema och vilka du ska arbeta med.</p><form id="login-form"><label>E-post<input name="email" type="email" autocomplete="username" required placeholder="du@exempel.se"></label><label>Lösenord<input name="password" type="password" autocomplete="current-password" required minlength="6"></label><p class="form-error" role="alert">${esc(error)}</p><button class="primary-btn" type="submit">Logga in ${icon('arrow')}</button></form><small>Din administratör skapar ditt konto. Kontakta administratören om du behöver åtkomst eller ett nytt lösenord.</small></section><p class="login-caption">Ett tydligt schema. En lugnare vecka.</p></main>`;
  $('#login-form').onsubmit=async e=>{e.preventDefault();e.submitter.disabled=true;const f=new FormData(e.target);try{workspace=await store.login(f.get('email'),f.get('password'));shell();}catch(err){renderLogin(err.message);}};
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
  modal('Öppna Hantera','Ange lösenordet för att hantera schemat. Den här webbläsaren kommer ihåg dig på den här datorn.',
    '<label>Lösenord<input name="password" type="password" autocomplete="current-password" required autofocus></label>',
    async form => {
      if (form.get('password') !== 'lirrydoz') throw new Error('Fel lösenord. Försök igen.');
      if (!hasAdminRole()) throw new Error('Du saknar behörighet att hantera schemat.');
      adminUnlocked = true;
      try { localStorage.setItem(adminRememberKey, 'true'); } catch { /* Continue even when browser storage is unavailable. */ }
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
    case 'today':ui.date=today();shell();scrollToToday();break;
    case 'match-rotation':if(admin())openRotationMatch();break;
    case 'match-week-step':if(admin()&&rotationMatch){setRotationMatchMonday(model.addDays(rotationMatch.monday,Number(button.dataset.step)*7));}break;
    case 'match-week-today':if(admin()&&rotationMatch){setRotationMatchMonday(model.mondayOf(today()));}break;
    case 'admin-tab':if(admin()){ui.adminTab=button.dataset.tab;shell();}break;
    case 'close-modal':$('#modal').close();break;
    case 'add-department':if(admin())organizationModal('department');break;
    case 'rename-department':if(admin())organizationModal('department',true);break;
    case 'add-work-team':if(admin())organizationModal('team');break;
    case 'rename-work-team':if(admin())organizationModal('team',true);break;
    case 'add-team':if(admin())addTeam();break;
    case 'add-hourly':if(admin())personModal(undefined,true);break;
    case 'add-person':if(admin())personModal();break;
    case 'edit-person':if(admin())personModal(button.dataset.member);break;
    case 'person-schedule':if(admin())personScheduleModal(button.dataset.member);break;
    case 'new-rotation':if(admin())await newRotation();break;
    case 'version-dates':if(admin())versionDates();break;
    case 'sync-reference-today':if(admin()){
      const currentMonday=model.mondayOf(today());
      const next=copy(),team=next.teams.find(t=>t.id===workingTeam().id),v=editingVersion(team);
      for(const m of team.members){
        const curPos=model.rotationPosition(v,m.id,currentMonday);
        if(curPos)v.positions[m.id]=curPos;
      }
      v.referenceMonday=currentMonday;
      await save(next,`Startmåndag har synkats till denna vecka (v. ${model.isoWeek(currentMonday).week})`);
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
    case 'delete-row':if(admin())deleteRotationRow(Number(button.dataset.row));break;
    case 'move-row':if(admin())await reorderRow(Number(button.dataset.row),Number(button.dataset.row)+Number(button.dataset.dir));break;
    case 'logout':localStorage.setItem(adminRememberKey,'false');adminUnlocked=false;ui.editingSchedule=false;ui.view='schedule';await store.logout();workspace=await store.init();shell();break;
    case 'refresh':if(!ui.busy){workspace=await store.refresh();shell();if(workspace.error)toast(workspace.error,true);else toast('Schemat har uppdaterats');}break;
  }
}
document.addEventListener('click',async e=>{const button=e.target.closest('[data-action]');if(!button||button.disabled)return;try{await handleAction(button);}catch(error){toast(error.message,true);}});
document.addEventListener('change',async e=>{
  const target=e.target;
  try {
    if(target.dataset?.teamActive&&admin()){const next=copy(),team=next.workTeams.find(t=>t.id===target.dataset.teamActive);if(team){team.scheduleActive=target.checked;await save(next);}}
    else if(target.dataset?.groupLabel&&admin()){
      const next=copy(),group=next.teams.find(g=>g.id===target.dataset.groupLabel);
      if(group){group.showScheduleName=target.checked;await save(next);}
    }
    else if(target.dataset?.scheduleLabel&&admin()){
      const next=copy(),department=next.departments.find(d=>d.id===target.dataset.department);
      if(department){department.scheduleLabels={team:true,group:false,...department.scheduleLabels,[target.dataset.scheduleLabel]:target.checked};await save(next);}
    }
    else if(target.id==='department-select'&&admin()){ui.departmentId=target.value;ui.workTeamId=undefined;ui.teamId=undefined;editingVersionId=undefined;shell();}
    else if(target.id==='work-team-select'&&admin()){ui.workTeamId=target.value;ui.teamId=undefined;editingVersionId=undefined;shell();}
    else if(['team-select','admin-team-select'].includes(target.id)){ui.teamId=target.value;editingVersionId=undefined;localStorage.setItem('skift-team',ui.teamId);shell();}
    else if(target.id==='personal-saved-date'&&admin()){personScheduleModal(target.dataset.member,target.value);}
    else if(target.id==='match-week-select'&&admin()&&rotationMatch){setRotationMatchMonday(target.value);}
    else if(target.id==='match-calendar-week'&&admin()&&rotationMatch){
      const match=/^(\d{4})-W(\d{2})$/.exec(target.value);
      if(!match){renderRotationMatch();return;}
      const monday=model.addDays(model.mondayOf(match[1]+'-01-04'),(Number(match[2])-1)*7);
      setRotationMatchMonday(monday);
    }
    else if(target.classList.contains('match-position')&&admin()&&rotationMatch){rotationMatch.positions[target.dataset.member]=Number(target.value);renderRotationMatch();}
    else if(target.id==='jump-date'){if(target.value){ui.date=target.value;shell();}}
    else if(target.id==='version-select'){editingVersionId=target.value;shell();}
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
  try {const fresh=await store.refresh({canApply});if(!canApply())return;if(fresh.role==='signed-out'){workspace=fresh;shell();return;}if(fresh.error){toast(fresh.error,true);return;}for(const state of [fresh.working,fresh.published])if(state)model.organizeState(state);if(fresh.revision!==workspace.revision||fresh.role!==workspace.role||JSON.stringify(fresh.published)!==JSON.stringify(workspace.published)||JSON.stringify(fresh.working)!==JSON.stringify(workspace.working)){workspace=fresh;shell();toast('Ditt schema är uppdaterat');}}catch(error){toast(error.message,true);}finally{refreshingSchedule=false;}
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
  const previous={...rotationMatch.version,referenceMonday:rotationMatch.monday,positions:rotationMatch.positions};
  rotationMatch.positions=Object.fromEntries(workingTeam().members.map(m=>[m.id,model.rotationPosition(previous,m.id,newMonday)]));
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
function openRotationMatch() {
  const team=workingTeam(),version=editingVersion(team),monday=model.mondayOf(ui.date);
  rotationMatch={teamId:team.id,versionId:version.id,version:structuredClone(version),monday,positions:Object.fromEntries(team.members.map(m=>[m.id,model.rotationPosition(version,m.id,monday)]))};
  renderRotationMatch();
}
function renderRotationMatch() {
  const draft=rotationMatch,team=workingTeam(),version=draft.version,week=model.isoWeek(draft.monday);
  const options=matchWeekOptions(team,version,draft.monday);
  modal('Stäm av medarbetarnas veckor','Välj den schemavecka som stämmer med varje persons arbetstider. Inget sparas förrän du trycker Spara.',`<label>Kalendervecka att jämföra<div class="match-week-bar" style="display:flex;gap:6px;align-items:center;margin-top:6px;flex-wrap:wrap"><button type="button" class="icon-btn" data-action="match-week-step" data-step="-1" title="Föregående vecka" aria-label="Föregående vecka">${icon('left')}</button><select id="match-week-select" style="flex:1;min-width:180px">${options}</select><button type="button" class="icon-btn" data-action="match-week-step" data-step="1" title="Nästa vecka" aria-label="Nästa vecka">${icon('right')}</button><button type="button" class="secondary-btn" data-action="match-week-today" style="min-height:42px;padding:0 12px;font-size:12px;white-space:nowrap">Denna vecka</button></div><input id="match-calendar-week" type="week" value="${week.year}-W${String(week.week).padStart(2,'0')}" style="margin-top:6px"></label>${team.members.map(m=>`<label>${esc(m.name)}<select class="match-position" data-member="${esc(m.id)}">${m.role==='part-time'?'<option value="0">Endast ersättningspass</option>':''}${version.rotation.map((_,i)=>`<option value="${i+1}" ${draft.positions[m.id]===i+1?'selected':''}>Vecka ${i+1}</option>`).join('')}</select></label><p class="field-note">${(version.rotation[(draft.positions[m.id]||1)-1]||[]).map((code,i)=>`${weekdayLabels[i]}: ${code?esc(code)+' '+esc(version.shifts[code]?.start)+'–'+esc(version.shifts[code]?.end):'Ledig'}`).join(' · ')}</p>`).join('')}`,async()=>{
    const next=copy(),target=next.teams.find(t=>t.id===draft.teamId).versions.find(v=>v.id===draft.versionId);
    target.referenceMonday=draft.monday;target.positions={...draft.positions};
    if(target.effectiveFrom>draft.monday&&!next.teams.find(t=>t.id===draft.teamId).versions.some(v=>v.id!==target.id&&v.effectiveFrom===draft.monday)){
      target.effectiveFrom=draft.monday;
    }
    for(const [id,value] of Object.entries(target.positions))if(!value)delete target.positions[id];
    await save(next,'Schemaveckorna har sparats');
  });
}

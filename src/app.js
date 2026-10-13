import * as model from './model.js';
import * as store from './store.js';
import qrcode from '../assets/qrcode.js';

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
  share:'<rect x="3" y="3" width="6" height="6" rx="1"/><rect x="15" y="3" width="6" height="6" rx="1"/><rect x="3" y="15" width="6" height="6" rx="1"/><path d="M15 15h3v3h3v3h-6v-3m6-3v-3M3 12h3m6-9v3m0 6h3"/>',
  download:'<path d="M12 3v12m-4-4 4 4 4-4M4 17v4h16v-4"/>',
  edit:'<path d="m16 3 5 5L9 20l-6 1 1-6L16 3ZM13 6l5 5"/>',
  close:'<path d="m6 6 12 12M18 6 6 18"/>', moon:'<path d="M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11Z"/>',
  refresh:'<path d="M20 7v5h-5M4 17v-5h5M6 6a8 8 0 0 1 13 2M18 18a8 8 0 0 1-13-2"/>',
  logout:'<path d="M9 5H4v14h5m5-14 7 7-7 7m-6-7h13"/>', info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>'
};
const icon = (name, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.calendar}</svg>`;
const today = () => new Intl.DateTimeFormat('en-CA', {timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const fmt = (date, options) => new Intl.DateTimeFormat('en-GB', {...options,timeZone:'UTC'}).format(new Date(date + 'T12:00:00Z'));
const initials = name => name.split(/\s+/).map(w => w[0]).slice(0,2).join('').toUpperCase();
const avatar = (member, i = 0, small = false) => `<span class="avatar tone-${i % 5} ${small ? 'small' : ''}" title="${esc(member.name)}">${esc(initials(member.name))}</span>`;
const urlParams = new URLSearchParams(location.search);
const ui = {view:'schedule',period:'week',date:urlParams.get('date') && /^\d{4}-\d{2}-\d{2}$/.test(urlParams.get('date')) && !isNaN(Date.parse(urlParams.get('date'))) ? urlParams.get('date') : today(), teamId:urlParams.get('team') || localStorage.getItem('skift-team'),memberId:localStorage.getItem('skift-person'),adminTab:'people',previewDraft:false,busy:false};
let workspace;
const admin = () => workspace?.role === 'admin';
const data = () => admin() && ui.previewDraft ? workspace.working : workspace.published;
const currentTeam = (state = ui.view === 'admin' ? workspace?.working : data()) => state?.teams.find(t => t.id === ui.teamId) || state?.teams[0];
const currentMember = (team = currentTeam()) => team?.members.find(m => m.id === ui.memberId) || team?.members.find(m => !m.activeUntil || m.activeUntil > ui.date) || team?.members[0];
const label = (value) => ({vacation:'Vacation',sick:'Sick day',pension:'Pension day',custom:'Adjusted shift',off:'Day off',cover:'Cover shift',shift:'Working'}[value] || value);

function normalizeSelection() {
  const team = currentTeam();
  if (team) { ui.teamId = team.id; const member = currentMember(team); ui.memberId = member?.id; }
}
function toast(message, error = false) {
  const el = $('#toast'); el.textContent = message; el.className = `toast visible ${error ? 'error' : ''}`;
  clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove('visible'), 4500);
}
function shell() {
  normalizeSelection();
  if (workspace.role === 'signed-out') { renderLogin(workspace.error || ''); return; }
  const team = currentTeam(), member = currentMember(team);
  const nav = (mobile = false) => [['schedule','calendar','Schedule'],['team','team','Team'],...(admin() ? [['admin','settings','Manage']] : [])].map(([view,ico,text]) => `<button class="nav-item ${ui.view === view ? 'active' : ''}" data-action="view" data-view="${view}">${icon(ico)}<span>${text}</span>${!mobile && ui.view === view ? '<span class="nav-dot"></span>' : ''}</button>`).join('');
  $('#app').innerHTML = `<div class="app-shell">
    <aside class="sidebar"><a class="brand" href="./" aria-label="Skift home"><span class="brand-mark">${icon('calendar')}</span>skift<span class="brand-period">.</span></a><div class="workspace-label">YOUR WORKSPACE</div><nav aria-label="Main navigation">${nav()}</nav><div class="sidebar-bottom"><div class="help-card">${icon('leaf')}<strong>A little less planning.<br>A little more living.</strong><p>Your next shift, always close.</p></div><div class="profile">${avatar({name:admin()?'Schedule admin':'Team member'},0)}<div><strong>${admin()?'Schedule admin':'Team member'}</strong><span>${workspace.mode === 'demo' ? 'Demo workspace' : esc(workspace.user?.email || 'Signed in')}</span></div>${workspace.mode === 'cloud' ? `<button class="icon-btn" data-action="logout" aria-label="Sign out">${icon('logout')}</button>` : ''}</div></div></aside>
    <div class="main-shell"><header class="topbar"><a class="brand mobile-brand" href="./"><span class="brand-mark">${icon('calendar')}</span>skift<span class="brand-period">.</span></a><div class="top-context"><span class="live-dot"></span> Team workspace</div><div class="top-actions">${team ? `<label class="team-select">${icon('team')}<select id="team-select" aria-label="Select team">${(ui.view==='admin'?workspace.working.teams:data()?.teams || []).map(t => `<option value="${esc(t.id)}" ${t.id===team.id?'selected':''}>${esc(t.name)}</option>`).join('')}</select></label>` : ''}${admin() ? `<button class="icon-btn" data-action="share" aria-label="Share team schedule">${icon('share')}</button>` : ''}${avatar(member || {name:'Skift'},2,true)}</div></header>
    ${workspace.mode === 'demo' ? `<div class="demo-notice"><span>${icon('info')}<strong>Demo workspace</strong> <span class="demo-detail">Changes are saved on this device.</span></span><button data-action="setup">Connect your team ${icon('arrow')}</button></div>` : ''}
    <main id="content" tabindex="-1">${ui.view==='admin' ? adminView() : team ? (ui.view==='team' ? teamView() : scheduleView()) : emptyWorkspace()}</main>
    <footer class="page-footer"><span>Made for your everyday.</span><span>${workspace.published?.publishedAt ? `Published ${new Date(workspace.published.publishedAt).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}` : 'No schedule published yet'}</span></footer>
    </div><nav class="mobile-nav" aria-label="Mobile navigation">${nav(true)}</nav>
  </div>`;
  if(workspace.mode==='cloud'){const refresh=document.createElement('button');refresh.className='icon-btn';refresh.dataset.action='refresh';refresh.setAttribute('aria-label','Refresh schedule');refresh.innerHTML=icon('refresh');$('.top-actions').prepend(refresh);}
  if (ui.view === 'admin' && ui.adminTab === 'rotation') { lockPublishedVersion(); bindRotationDrag(); }
}

function dateRange() {
  const days = model.weekDates(ui.date);
  if (ui.period==='year') return ui.date.slice(0,4);
  if (ui.period==='month') return fmt(ui.date,{month:'long',year:'numeric'});
  return `${fmt(days[0],{day:'numeric',month:'short'})} – ${fmt(days[6],{day:'numeric',month:'short',year:'numeric'})}`;
}
function heading(teamView = false) {
  const member = currentMember(), week = model.isoWeek(ui.date);
  return `<div class="page-heading"><div><div class="eyebrow">${ui.period==='week' ? `CALENDAR WEEK ${week.week}` : 'YOUR SCHEDULE'}</div><h1>${teamView ? 'Better together.' : 'Your week, at a glance.'}</h1><p>${teamView ? 'See who’s on shift and when your hours overlap.' : 'A clear plan for your work. More room for everything else.'}</p></div>${!teamView && member ? `<label class="person-select"><span>Viewing schedule for</span><select id="person-select" aria-label="Select coworker">${currentTeam().members.filter(m=>!m.activeUntil || m.activeUntil>ui.date).map(m=>`<option value="${esc(m.id)}" ${m.id===member.id?'selected':''}>${esc(m.name)}</option>`).join('')}</select></label>` : ''}</div>
  <div class="schedule-toolbar"><div class="date-navigation"><button class="icon-btn" data-action="navigate" data-step="-1" aria-label="Previous ${ui.period}">${icon('left')}</button><strong>${dateRange()}</strong><button class="icon-btn" data-action="navigate" data-step="1" aria-label="Next ${ui.period}">${icon('right')}</button><button class="today-btn" data-action="today">Today</button></div><div class="view-controls"><label class="date-picker" title="Jump to a date">${icon('calendar')}<span>Jump to date</span><input id="jump-date" type="date" value="${ui.date}" aria-label="Jump to a date"></label><div class="segmented" aria-label="Schedule period">${['week','month','year'].map(p=>`<button data-action="period" data-period="${p}" class="${ui.period===p?'selected':''}" aria-pressed="${ui.period===p}">${p[0].toUpperCase()+p.slice(1)}</button>`).join('')}</div></div></div>
  ${admin() ? `<div class="published-label"><span class="${ui.previewDraft?'draft-dot':'live-dot'}"></span>${ui.previewDraft ? 'Previewing your draft' : 'Published schedule'}<label class="preview-toggle"><input id="preview-draft" type="checkbox" ${ui.previewDraft?'checked':''}> Preview draft</label></div>` : ''}`;
}

function scheduleView() {
  const team = currentTeam(), member = currentMember(team);
  if (!member) return `${heading()}${empty('No coworkers yet','Add a coworker in Manage to start scheduling.','admin','Manage team')}`;
  return heading() + (ui.period==='week' ? weekView(team,member) : ui.period==='month' ? monthView(team,member) : yearView(team,member));
}
function hours(minutes) { return `${Number((minutes / 60).toFixed(1))}`; }
function personDay(state,team,member,date) {
  const main=model.getShift(state,team.id,member.id,date);
  const assignments=state.teams.flatMap(t=>model.getDayAssignments(state,t.id,date)).filter(s=>s.memberId===member.id&&(s.teamId===team.id||s.type==='cover'));
  return {...main, assignments, working:assignments.length>0, minutes:assignments.reduce((n,s)=>n+s.minutes,0), rotationWeek:model.activeVersion(team,date)?model.rotationPosition(model.activeVersion(team,date),member.id,date):0};
}
function weekView(team, member) {
  const days = model.weekDates(ui.date), shifts = days.map(d=>personDay(data(),team,member,d));
  const working = shifts.filter(s=>s.working), total = working.reduce((n,s)=>n+s.minutes,0), shiftCount=shifts.reduce((n,s)=>n+s.assignments.length,0);
  const version = model.activeVersion(team,ui.date), position = version ? model.rotationPosition(version,member.id,ui.date) : 0;
  return `<div class="week-strip">${days.map((d,i)=>`<button class="week-day ${d===today()?'is-today':''} ${d===ui.date?'selected':''}" data-action="select-day" data-date="${d}"><span>${fmt(d,{weekday:'short'})}</span><strong>${fmt(d,{day:'numeric'})}</strong><span class="shift-dot ${shifts[i].working ? colorFor(team,d,shifts[i].code) : 'off-dot'}"></span>${d===today()?'<span class="sr-only">Today</span>':''}</button>`).join('')}</div>
  <div class="schedule-layout"><section class="schedule-panel"><div class="panel-heading"><h2>This week</h2><span>${shiftCount} shifts · ${7-working.length} days off</span></div><div class="days-list">${days.map((d,i)=>dayCard(team,member,d,shifts[i])).join('')}</div></section>
  <aside class="schedule-aside"><section class="summary-card"><div class="eyebrow">A LITTLE OVERVIEW</div><h2>Your week in numbers</h2><div class="big-stat">${hours(total)}<span>scheduled hours</span></div><div class="mini-stats"><div><strong>${working.length}</strong><span>Work days</span></div><div><strong>${7-working.length}</strong><span>Days off</span></div><div><strong>${position || '—'}<small> / ${version?.rotation.length || '—'}</small></strong><span>Rotation week</span></div></div><p>${icon('info')}Hours shown before breaks.</p></section>
  <section class="aside-card"><h3>${icon('team')}Your team this week</h3><div class="team-mini">${team.members.filter(m=>!m.activeUntil || m.activeUntil>days[0]).map((m,i)=>{const pos=version?model.rotationPosition(version,m.id,ui.date):0;return `<button class="team-mini-row" data-action="person" data-member="${esc(m.id)}">${avatar(m,i,true)}<span>${esc(m.name)}${m.id===member.id?'<small>Selected</small>':''}</span><span class="rotation-tag">Week ${pos || '—'}</span></button>`;}).join('')}</div><button class="text-button" data-action="view" data-view="team">View team schedule ${icon('arrow')}</button></section>
  <section class="aside-card legend-card"><h3>Shift guide</h3><div class="legend">${Object.entries(version?.shifts || {}).map(([code,s])=>`<div><span class="code-badge ${esc(s.color)}">${esc(code)}</span><span>${s.start}–${s.end}</span></div>`).join('')}</div></section></aside></div>`;
}
function colorFor(team,date,code) { return model.activeVersion(team,date)?.shifts[code]?.color || 'mint'; }
function dayCard(team,member,date,shift) {
  const coworkers = shift.working ? model.getCoworkers(data(),team.id,member.id,date) : [];
  const isToday = date===today(), inactive = !shift.rotationWeek && member.role !== 'part-time';
  const assignments=shift.assignments||[];
  const title=s=>`<strong>${s.start}<span class="time-dash">–</span>${s.end}</strong><span class="code-badge ${esc(s.color||colorFor(team,date,s.code))}">${esc(s.code || '↗')}</span>${s.type==='cover'?`<span class="tiny-tag">Cover · ${esc(data().teams.find(t=>t.id===s.teamId)?.name||'Team')}</span>`:''}`;
  return `<article class="day-card ${shift.working?'':'off-day'} ${isToday?'today-card':''}" id="day-${date}"><div class="day-date"><span>${fmt(date,{weekday:'short'})}</span><strong>${fmt(date,{day:'numeric'})}</strong></div><div class="day-content"><div class="shift-title">${shift.working ? title(assignments[0]) : `<strong>${inactive?'Not scheduled yet':label(shift.type)}</strong>${icon('leaf','off-leaf')}`}${isToday?'<span class="today-tag">Today</span>':''}</div>${assignments.slice(1).map(s=>`<div class="shift-title extra-shift">${title(s)}</div>`).join('')}${shift.working ? `<div class="coworker-line">${coworkers.length?`<div class="avatar-stack">${coworkers.slice(0,3).map((c,i)=>avatar(c,i,true)).join('')}</div><span>With ${[...new Set(coworkers.map(c=>esc(c.name)))].join(', ')}</span>`:'<span class="muted">No overlapping team shifts</span>'}</div>${coworkers.length?`<details class="overlap-details"><summary>See shared hours</summary><div>${coworkers.map(c=>`<span>${esc(c.name)} <strong>${c.overlapStart}–${c.overlapEnd}</strong></span>`).join('')}</div></details>`:''}` : `<p class="off-caption">${inactive ? 'A published rotation will appear here.' : 'A little time for you.'}</p>`}${shift.conflict ? '<span class="coverage-warning">Overlapping assignments — review needed</span>':''}${admin() && ui.previewDraft && shift.needsCoverage ? `<span class="coverage-warning">${hours(shift.uncoveredMinutes || 0)} hours need coverage</span>`:''}</div>${shift.working?`<span class="duration">${hours(shift.minutes)}h</span>`:''}${admin()&&ui.previewDraft?`<button class="icon-btn edit-day" data-action="exception" data-date="${date}" data-member="${esc(member.id)}" aria-label="Edit ${fmt(date,{weekday:'long',day:'numeric',month:'long'})}">${icon('edit')}</button>`:''}</article>`;
}

function monthDays(date) {
  const first = date.slice(0,7)+'-01', start = model.mondayOf(first);
  const last = new Date(Date.UTC(Number(date.slice(0,4)),Number(date.slice(5,7)),0)).getUTCDate();
  const count = Math.ceil((Math.round((new Date(first)-new Date(start))/86400000)+last)/7)*7;
  return Array.from({length:count},(_,i)=>model.addDays(start,i));
}
function monthView(team,member) {
  const days = monthDays(ui.date), assignments = days.filter(d=>d.slice(0,7)===ui.date.slice(0,7)).map(d=>personDay(data(),team,member,d));
  return `<div class="month-summary"><span>${assignments.reduce((n,s)=>n+s.assignments.length,0)} shifts this month</span><span>${hours(assignments.reduce((n,s)=>n+s.minutes,0))} scheduled hours</span><span>Tap a day to open its week</span></div><section class="month-calendar"><div class="calendar-weekdays">${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d=>`<span>${d}</span>`).join('')}</div><div class="calendar-grid">${days.map(d=>{const s=personDay(data(),team,member,d);return `<button class="calendar-cell ${d.slice(0,7)!==ui.date.slice(0,7)?'other-month':''} ${d===today()?'cell-today':''}" data-action="open-week" data-date="${d}" aria-label="${fmt(d,{weekday:'long',day:'numeric',month:'long'})}, ${s.working?s.assignments.map(a=>a.start+' to '+a.end).join(', '):label(s.type)}"><span class="cell-number">${fmt(d,{day:'numeric'})}</span>${s.working?`<span class="calendar-shift ${colorFor(team,d,s.code)}"><b>${esc(s.code||'↗')}</b><span>${s.start}<span class="cell-end">–${s.end}</span></span>${s.assignments.length>1?`<small class="extra-count">+${s.assignments.length-1} shift</small>`:''}</span>`:'<span class="calendar-off">Off</span>'}</button>`;}).join('')}</div></section>`;
}
function yearView(team,member) {
  const year = ui.date.slice(0,4);
  return `<div class="year-grid">${Array.from({length:12},(_,i)=>{const date=`${year}-${String(i+1).padStart(2,'0')}-01`; const days=monthDays(date);return `<button class="mini-month" data-action="open-month" data-date="${date}"><div><h2>${fmt(date,{month:'long'})}</h2>${icon('right')}</div><div class="mini-weekdays">${['M','T','W','T','F','S','S'].map(d=>`<span>${d}</span>`).join('')}</div><div class="mini-grid">${days.map(d=>{const s=personDay(data(),team,member,d);return `<span class="${d.slice(0,7)!==date.slice(0,7)?'dim':''} ${s.working?'mini-work':''} ${d===today()?'mini-today':''}">${fmt(d,{day:'numeric'})}</span>`;}).join('')}</div></button>`;}).join('')}</div>`;
}
function teamView() {
  const team=currentTeam(), dates=model.weekDates(ui.date), homeMembers=team.members.filter(m=>!m.activeUntil||m.activeUntil>dates[0]);
  const assignments=Object.fromEntries(dates.map(d=>[d,model.getDayAssignments(data(),team.id,d)]));
  const visitors=[...new Set(Object.values(assignments).flat().map(s=>s.memberId))].filter(id=>!homeMembers.some(m=>m.id===id)).map(id=>findMember(id)).filter(Boolean),members=[...homeMembers,...visitors];
  if(ui.period!=='week') ui.period='week';
  return heading(true) + `<section class="team-panel"><div class="panel-heading"><h2>${esc(team.name)}</h2><span>${members.length} coworkers</span></div><div class="team-table-wrap"><table class="team-table"><thead><tr><th>Coworker</th>${dates.map(d=>`<th class="${d===today()?'today-column':''}">${fmt(d,{weekday:'short'})}<strong>${fmt(d,{day:'numeric'})}</strong></th>`).join('')}</tr></thead><tbody>${members.map((m,i)=>`<tr><th><button data-action="person" data-member="${esc(m.id)}">${avatar(m,i,true)}<span>${esc(m.name)}<small>${homeMembers.some(p=>p.id===m.id)?`Rotation ${model.activeVersion(team,ui.date)?model.rotationPosition(model.activeVersion(team,ui.date),m.id,ui.date)||'—':'—'}`:'Visiting cover'}</small></span></button></th>${dates.map(d=>{const shifts=assignments[d].filter(s=>s.memberId===m.id);return `<td class="${d===today()?'today-column':''}">${shifts.length?shifts.map(s=>`<div class="table-shift ${esc(s.color||colorFor(team,d,s.code))}"><strong>${esc(s.code||'↗')}${s.type==='cover'?' ↗':''}</strong><span>${s.start}<br>${s.end}</span></div>`).join(''):'<span class="table-off">—</span>'}</td>`;}).join('')}</tr>`).join('')}</tbody></table></div><div class="mobile-team-days">${dates.map(d=>{const shifts=assignments[d];return `<div class="team-day"><h3>${fmt(d,{weekday:'long',day:'numeric',month:'short'})}${d===today()?'<span class="today-tag">Today</span>':''}</h3>${shifts.length?shifts.map((s,i)=>{const person=findMember(s.memberId);return `<div class="team-day-row">${avatar(person||{name:'Coworker'},i,true)}<span>${esc(person?.name||'Coworker')}${s.type==='cover'?'<small>Cover shift</small>':''}</span><strong>${s.start}–${s.end}</strong><span class="code-badge ${esc(s.color||colorFor(team,d,s.code))}">${esc(s.code||'↗')}</span></div>`;}).join(''):'<p class="muted">No shifts scheduled</p>'}</div>`;}).join('')}</div></section><p class="table-hint">${icon('info')}Select a coworker to see their personal schedule and overlapping hours.</p>`;
}
const findMember = id => (ui.view==='admin'?workspace.working?.teams:data()?.teams || []).flatMap(t=>t.members).find(m=>m.id===id);

function empty(title,description,action,button) { return `<div class="empty-state">${icon('calendar')}<h2>${title}</h2><p>${description}</p>${action?`<button class="primary-btn" data-action="${action}">${button}</button>`:''}</div>`; }
function emptyWorkspace() {return empty('Your workspace is ready','Add your first team, then publish a rotation for your coworkers.',admin()?'add-team':null,'Add a team');}
function adminView() {
  const teams=workspace.working.teams, team=teams.find(t=>t.id===ui.teamId)||teams[0];
  const tabs=[['people','Coworkers'],['rotation','Rotation'],['changes','Changes']];
  return `<div class="page-heading admin-heading"><div><div class="eyebrow">YOUR CONTROL ROOM</div><h1>A schedule that fits.</h1><p>Manage your team’s rhythm, one change at a time.</p></div><button class="primary-btn" data-action="publish" ${ui.busy?'disabled':''}>${icon('check')} Publish changes</button></div><div class="admin-status">${icon('edit')}<span>Working draft · edits appear for coworkers after publishing.</span><button class="text-button" data-action="preview">Preview ${icon('arrow')}</button></div><div class="admin-toolbar"><label>Team<select id="admin-team-select">${teams.map(t=>`<option value="${esc(t.id)}" ${t.id===team?.id?'selected':''}>${esc(t.name)}</option>`).join('')}</select></label><button class="secondary-btn" data-action="add-team">${icon('plus')} Add team</button><button class="icon-btn" data-action="settings" aria-label="Team settings" ${!team?'disabled':''}>${icon('settings')}</button><button class="icon-btn" data-action="share" aria-label="Share team" ${!team?'disabled':''}>${icon('share')}</button></div>${team?`<div class="admin-tabs" role="tablist">${tabs.map(([id,name])=>`<button role="tab" aria-selected="${ui.adminTab===id}" class="${ui.adminTab===id?'active':''}" data-action="admin-tab" data-tab="${id}">${name}${id==='changes'?`<span>${workspace.working.exceptions.filter(e=>e.teamId===team.id).length}</span>`:''}</button>`).join('')}</div>${ui.adminTab==='people'?peopleAdmin(team):ui.adminTab==='rotation'?rotationAdmin(team):changesAdmin(team)}`:emptyWorkspace()}<div class="backup-bar"><span>${icon('download')} Keep a copy of your schedule.</span><button class="text-button" data-action="export">Export backup</button><label class="text-button import-label">Import backup<input id="import-file" type="file" accept="application/json,.json"></label></div>`;
}
function peopleAdmin(team) {
  const version=model.activeVersion(team,ui.date)||team.versions.at(-1), members=team.members;
  return `<section class="admin-panel"><div class="panel-heading"><div><h2>Your coworkers</h2><p>Starting positions can be changed in the rotation editor.</p></div><button class="secondary-btn" data-action="add-person">${icon('plus')} Add coworker</button></div><div class="people-list">${members.map((m,i)=>{const pos=version?model.rotationPosition(version,m.id,ui.date):0;return `<div class="person-row ${m.activeUntil&&m.activeUntil<=today()?'archived':''}">${avatar(m,i)}<div class="person-info"><strong>${esc(m.name)}</strong><span>${m.role==='part-time'?'Part-time cover':'Team member'}${m.activeUntil?` · Leaving ${fmt(m.activeUntil,{day:'numeric',month:'short',year:'numeric'})}`:''}</span></div><span class="rotation-tag">${pos?`Week ${pos}`:m.role==='part-time'?'Cover only':'Unassigned'}</span><button class="icon-btn" data-action="edit-person" data-member="${esc(m.id)}" aria-label="Edit ${esc(m.name)}">${icon('edit')}</button></div>`;}).join('')}</div></section><div class="info-card">${icon('info')}<p><strong>People and rotation weeks are independent.</strong> Add or remove coworkers whenever needed. Change the rotation length separately when your pattern changes.</p></div>`;
}
let editingVersionId;
function rotationAdmin(team) {
  const version=team.versions.find(v=>v.id===editingVersionId)||model.activeVersion(team,ui.date)||team.versions.at(-1);
  if(!version)return empty('No rotation yet','Create a rotation for this team.','new-rotation','Create rotation');
  editingVersionId=version.id;
  return `<section class="admin-panel rotation-panel"><div class="panel-heading"><div><h2>The repeating pattern</h2><p>Choose a shift in each cell. Blank means a day off.</p></div><button class="secondary-btn" data-action="new-rotation">${icon('plus')} New rotation</button></div><div class="rotation-settings"><label>Schedule version<select id="version-select">${[...team.versions].sort((a,b)=>a.effectiveFrom.localeCompare(b.effectiveFrom)).map(v=>`<option value="${esc(v.id)}" ${v.id===version.id?'selected':''}>From ${v.effectiveFrom} · ${v.rotation.length} weeks</option>`).join('')}</select></label><div><span>Reference Monday</span><strong>${fmt(version.referenceMonday,{day:'numeric',month:'short',year:'numeric'})}</strong></div><div><span>Rotation length</span><strong>${version.rotation.length} weeks</strong></div></div><div class="rotation-scroll"><table class="rotation-table"><thead><tr><th>Week</th>${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d=>`<th>${d}</th>`).join('')}<th></th></tr></thead><tbody>${version.rotation.map((row,i)=>`<tr draggable="true" data-row="${i}"><th><span class="drag-handle" title="Drag to reorder">⠿</span> ${i+1}</th>${row.map((code,j)=>`<td><select class="rotation-cell ${version.shifts[code]?.color || ''}" data-row="${i}" data-day="${j}" aria-label="Week ${i+1}, ${['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'][j]}"><option value="">—</option>${Object.keys(version.shifts).map(c=>`<option value="${esc(c)}" ${c===code?'selected':''}>${esc(c)}</option>`).join('')}</select></td>`).join('')}<td><button class="icon-btn row-move" data-action="move-row" data-row="${i}" data-dir="-1" aria-label="Move week ${i+1} up" ${i===0?'disabled':''}>↑</button><button class="icon-btn row-move" data-action="move-row" data-row="${i}" data-dir="1" aria-label="Move week ${i+1} down" ${i===version.rotation.length-1?'disabled':''}>↓</button></td></tr>`).join('')}</tbody></table></div><div class="rotation-footnote">${icon('info')} On a phone, swipe the table sideways. Use the arrows to reorder weeks.</div></section><section class="admin-panel"><div class="panel-heading"><div><h2>Starting positions</h2><p>Each person’s rotation week on ${fmt(version.referenceMonday,{day:'numeric',month:'short',year:'numeric'})}.</p></div></div><div class="positions-list">${team.members.map((m,i)=>`<label>${avatar(m,i,true)}<span>${esc(m.name)}</span><select class="position-select" data-member="${esc(m.id)}" aria-label="Starting week for ${esc(m.name)}">${version.rotation.map((_,j)=>`<option value="${j+1}" ${Number(version.positions[m.id])===j+1?'selected':''}>Week ${j+1}</option>`).join('')}</select></label>`).join('')}</div></section><section class="admin-panel"><div class="panel-heading"><div><h2>Shift times</h2><p>Hours belong to this schedule version.</p></div><button class="secondary-btn" data-action="add-shift">${icon('plus')} Add shift</button></div><div class="shift-definitions">${Object.entries(version.shifts).map(([code,s])=>`<button data-action="edit-shift" data-code="${esc(code)}"><span class="code-badge ${esc(s.color)}">${esc(code)}</span><strong>${s.start}–${s.end}</strong>${icon('edit')}</button>`).join('')}</div></section>`;
}
function changesAdmin(team) {
  const changes=workspace.working.exceptions.filter(e=>e.teamId===team.id).sort((a,b)=>b.date.localeCompare(a.date));
  return `<section class="admin-panel"><div class="panel-heading"><div><h2>Individual changes</h2><p>Absences, reduced hours, and replacement coverage.</p></div><button class="secondary-btn" data-action="exception">${icon('plus')} Add change</button></div>${changes.length?`<div class="changes-list">${changes.map(e=>{const shift=model.getShift(workspace.working,team.id,e.memberId,e.date);return `<button class="change-row" data-action="edit-exception" data-id="${esc(e.id)}"><span class="change-date">${fmt(e.date,{day:'numeric',month:'short'})}<small>${e.date.slice(0,4)}</small></span><div><strong>${esc(findMember(e.memberId)?.name || 'Former coworker')}</strong><span>${label(e.type)}${e.start&&e.end?' · '+e.start+'–'+e.end:''}${e.replacementId?' · Covered by '+esc(findMember(e.replacementId)?.name||'Coworker'):''}</span>${shift.needsCoverage?`<small class="coverage-warning">${hours(shift.uncoveredMinutes||0)} hours need coverage</small>`:''}</div>${icon('edit')}</button>`;}).join('')}</div>`:empty('Everyday rhythm, uninterrupted','Add a change when someone is away or needs different hours.')}</section><div class="info-card">${icon('info')}<p><strong>Absence reasons are private.</strong> Published schedules show working hours and days off. Your notes and absence categories stay in the admin draft.</p></div>`;
}

function modal(title,description,body,onSubmit,options={}) {
  const dialog=$('#modal');
  dialog.innerHTML=`<div class="modal-header"><div><div class="eyebrow">${options.eyebrow || 'MANAGE YOUR SCHEDULE'}</div><h2>${title}</h2></div><button class="icon-btn" data-action="close-modal" aria-label="Close dialog">${icon('close')}</button></div>${description?`<p class="modal-description">${description}</p>`:''}<form id="modal-form">${body}<p class="form-error" role="alert"></p><div class="modal-actions">${options.extra||''}<button class="secondary-btn" type="button" data-action="close-modal">Cancel</button><button class="primary-btn" type="submit">${options.submit || 'Save to draft'}</button></div></form>`;
  $('#modal-form').onsubmit=async e=>{e.preventDefault();const button=e.submitter;button.disabled=true;try {await onSubmit(new FormData(e.target));dialog.close();}catch(err){$('.form-error',dialog).textContent=err.message;}finally{button.disabled=false;}};
  dialog.showModal();
}
async function save(next, message='Saved to your draft') {
  const errors=model.validateState(next); if(errors.length)throw new Error(errors[0]);
  if(ui.busy)throw new Error('A change is being saved. Please try again in a moment.');
  ui.busy=true;
  try{const result=await store.saveDraft(next);workspace={...workspace,...result};ui.busy=false;shell();toast(message);}finally{ui.busy=false;}
}
const workingTeam = () => workspace.working.teams.find(t=>t.id===ui.teamId)||workspace.working.teams[0];
const editingVersion = team => team.versions.find(v=>v.id===editingVersionId)||team.versions.at(-1);
const copy = () => structuredClone(workspace.working);
const versionPublished = version => workspace.published?.teams.some(t=>t.versions.some(v=>v.id===version?.id));
function lockPublishedVersion() {
  const team=workingTeam(), version=editingVersion(team), published=versionPublished(version);
  if(published){
    document.querySelectorAll('.rotation-cell,.position-select,.row-move,.shift-definitions button,[data-action="add-shift"]').forEach(el=>el.disabled=true);
    document.querySelectorAll('.rotation-table tbody tr').forEach(el=>el.draggable=false);
    const notice=document.createElement('div');notice.className='info-card rotation-lock';notice.innerHTML=`${icon('check')}<p><strong>This version is published.</strong> Create a new rotation to change future shifts and keep earlier schedules intact.</p><button class="text-button" data-action="new-rotation">New rotation ${icon('arrow')}</button>`;$('.rotation-panel').before(notice);
  }else {
    const button=document.createElement('button');button.className='text-button';button.dataset.action='version-dates';button.textContent='Edit start date';$('.rotation-settings').append(button);
  }
  document.querySelectorAll('.position-select').forEach(select=>{
    const member=team.members.find(m=>m.id===select.dataset.member);
    if(member?.role==='part-time'){const option=document.createElement('option');option.value='0';option.textContent='Cover only';select.prepend(option);if(!version.positions[member.id])select.value='0';}
  });
}
function versionDates() {
  const team=workingTeam(),version=editingVersion(team);if(versionPublished(version))throw new Error('Create a new rotation to change a published version.');
  modal('Set the rotation’s starting date.','Starting positions are measured on the reference Monday. Adjust them after changing these dates.',`<label>Effective from Monday<input name="effective" type="date" value="${version.effectiveFrom}" required></label><label>Reference Monday<input name="reference" type="date" value="${version.referenceMonday}" required></label>`,async f=>{const effective=f.get('effective'),reference=f.get('reference');if(model.mondayOf(effective)!==effective||model.mondayOf(reference)!==reference)throw new Error('Both dates must be Mondays.');if(team.versions.some(v=>v.id!==version.id&&v.effectiveFrom===effective))throw new Error('Another version already starts on that date.');const next=copy(),target=next.teams.find(t=>t.id===team.id).versions.find(v=>v.id===version.id);target.effectiveFrom=effective;target.referenceMonday=reference;await save(next,'Rotation dates updated');});
}

function addTeam() {
  modal('A new team, its own rhythm.','You can fill in the shifts and add coworkers next.',`<label>Team name<input name="name" placeholder="e.g. Morning team" required maxlength="60"></label><div class="form-grid"><label>Rotation length<input name="length" type="number" min="1" max="52" value="11" required></label><label>Starts on Monday<input name="date" type="date" value="${model.mondayOf(ui.date)}" required></label></div><label class="checkbox-label"><input type="checkbox" name="copy"> Copy the current team’s shift pattern</label>`,async f=>{
    const date=f.get('date');if(model.mondayOf(date)!==date)throw new Error('Choose a Monday for the start of a rotation.');
    const next=copy(), old=workingTeam(), length=Number(f.get('length')), template=old?.versions.at(-1) || model.seedState().teams[0].versions[0];
    const version={id:model.uid(),effectiveFrom:date,referenceMonday:date,rotation:Array.from({length},(_,i)=>f.has('copy')?[...(template.rotation[i%template.rotation.length])]:Array(7).fill('')),positions:{},shifts:structuredClone(template.shifts)};
    const team={id:model.uid(),name:f.get('name').trim(),color:'mint',members:[],versions:[version]};
    if(!team.name)throw new Error('Enter a team name.');next.teams.push(team);ui.teamId=team.id;ui.view='admin';ui.adminTab='rotation';editingVersionId=version.id;await save(next,'Team added. Fill in your rotation.');
  },{submit:'Create team'});
}
function personModal(memberId) {
  const team=workingTeam(), member=team.members.find(m=>m.id===memberId), version=editingVersion(team);
  modal(member?'Edit coworker':'Welcome someone new.',member?'Changes are saved to your draft.':'Add their name and starting position in the rotation.',`<label>Name<input name="name" value="${esc(member?.name||'')}" required maxlength="60" autocomplete="off"></label><div class="form-grid"><label>Role<select name="role"><option value="member">Team member</option><option value="part-time" ${member?.role==='part-time'?'selected':''}>Part-time cover</option></select></label><label>Active from<input name="from" type="date" value="${member?.activeFrom||ui.date}" required></label></div>${!member?`<label>Starting position on ${fmt(version.referenceMonday,{day:'numeric',month:'short',year:'numeric'})}<select name="position"><option value="0">Cover only (part-time)</option>${version.rotation.map((_,i)=>`<option value="${i+1}" ${i===0?'selected':''}>Week ${i+1}</option>`).join('')}</select></label>`:''}${member?`<label>Remove from team starting<input name="until" type="date" value="${member.activeUntil||''}"><small>Leave empty to keep them active. Past schedules are kept.</small></label>`:''}`,async f=>{
    const next=copy(), target=next.teams.find(t=>t.id===team.id), name=f.get('name').trim(), from=f.get('from'), until=f.get('until')||null;
    if(!name)throw new Error('Enter a name.');if(until&&until<=from)throw new Error('The removal date must be later than the start date.');
    if(member)Object.assign(target.members.find(m=>m.id===member.id),{name,role:f.get('role'),activeFrom:from,activeUntil:until});
    else {const position=Number(f.get('position'));if(!position&&f.get('role')!=='part-time')throw new Error('Cover-only coworkers must have the Part-time cover role.');const id=model.uid();target.members.push({id,name,role:f.get('role'),activeFrom:from,activeUntil:null});if(position)target.versions.forEach(v=>{const weeks=Math.round((Date.parse(v.referenceMonday)-Date.parse(version.referenceMonday))/604800000);v.positions[id]=((position-1+weeks)%v.rotation.length+v.rotation.length)%v.rotation.length+1;});}
    await save(next,member?'Coworker updated':'Coworker added');
  });
}
function newRotation() {
  const team=workingTeam(), old=editingVersion(team), date=model.mondayOf(ui.date);
  modal('Let your schedule evolve.','Create a new version from a Monday. Earlier dates keep their previous rotation.',`<div class="form-grid"><label>Effective from Monday<input name="date" type="date" value="${date}" required></label><label>Number of weeks<input name="length" type="number" min="1" max="52" value="${old.rotation.length}" required></label></div><p class="field-note">Existing weeks are copied. Extra weeks start blank. Review every person’s starting position before publishing.</p>`,async f=>{
    const from=f.get('date');if(model.mondayOf(from)!==from)throw new Error('The new rotation must start on a Monday.');if(team.versions.some(v=>v.effectiveFrom===from))throw new Error('A version already starts on this date. Choose another Monday, or edit that version.');
    const next=copy(), target=next.teams.find(t=>t.id===team.id), version=model.createVersion(target,from,Number(f.get('length')));target.versions.push(version);target.versions.sort((a,b)=>a.effectiveFrom.localeCompare(b.effectiveFrom));editingVersionId=version.id;await save(next,'New rotation drafted. Review the starting positions.');
  },{submit:'Create draft rotation'});
}
function shiftModal(code) {
  const team=workingTeam(), version=editingVersion(team), shift=version.shifts[code];
  if(versionPublished(version))throw new Error('Create a new rotation to change published shift times.');
  modal(code?`Edit shift ${esc(code)}`:'Add a shift','Set its code, hours, and colour for this rotation.',`<label>Shift code<input name="code" value="${esc(code||'')}" required maxlength="6" ${code?'readonly':''} pattern="[A-Za-z0-9]+"></label><div class="form-grid"><label>Starts<input name="start" type="time" value="${shift?.start||'07:00'}" required></label><label>Ends<input name="end" type="time" value="${shift?.end||'16:00'}" required></label></div><label>Colour<select name="color">${['amber','mint','blue','lavender','purple','teal','rose','peach','sage'].map(c=>`<option value="${c}" ${shift?.color===c?'selected':''}>${c[0].toUpperCase()+c.slice(1)}</option>`).join('')}</select></label><p class="field-note">An end time earlier than the start means an overnight shift.</p>`,async f=>{
    const newCode=f.get('code').toUpperCase();if(!code&&version.shifts[newCode])throw new Error('This shift code already exists.');if(f.get('start')===f.get('end'))throw new Error('Start and end cannot be the same time.');const next=copy(), target=next.teams.find(t=>t.id===team.id).versions.find(v=>v.id===version.id);target.shifts[newCode]={start:f.get('start'),end:f.get('end'),color:f.get('color')};await save(next,'Shift saved');
  });
}
function exceptionModal(options={}) {
  const team=workingTeam(), existing=workspace.working.exceptions.find(e=>e.id===options.id), memberId=existing?.memberId||options.memberId||currentMember(team)?.id;
  if(!team.members.length){toast('Add a coworker first.',true);return;}
  const date=existing?.date||options.date||ui.date;
  const people=workspace.working.teams.flatMap(t=>t.members.filter(m=>!m.activeUntil||m.activeUntil>date).map(m=>({...m,teamName:t.name})));
  modal(existing?'Edit individual change':'A change for one person.','The rotation keeps moving. This change applies only to the selected dates.',`<label>Coworker<select name="member">${team.members.map(m=>`<option value="${esc(m.id)}" ${m.id===memberId?'selected':''}>${esc(m.name)}</option>`).join('')}</select></label><div class="form-grid"><label>${existing?'Date':'From date'}<input name="date" type="date" value="${date}" required></label>${!existing?`<label>Through date<input name="through" type="date" value="${date}" required></label>`:''}</div><label>Change type<select name="type" id="exception-type">${['vacation','sick','pension','custom','off'].map(t=>`<option value="${t}" ${existing?.type===t?'selected':''}>${label(t)}</option>`).join('')}</select></label><div class="form-grid adjusted-fields"><label>Working from<input name="start" type="time" value="${existing?.start||''}"></label><label>Working until<input name="end" type="time" value="${existing?.end||''}"></label></div><p class="field-note">For a shorter pension day, enter the hours they will work. Leave both empty for a full day off.</p><label>Replacement coworker<select name="replacement"><option value="">No replacement</option>${people.map(m=>`<option value="${esc(m.id)}" ${m.id===existing?.replacementId?'selected':''}>${esc(m.name)} · ${esc(m.teamName)}</option>`).join('')}</select></label><div class="form-grid"><label>Cover from<input name="coverStart" type="time" value="${existing?.replacementStart||''}"></label><label>Cover until<input name="coverEnd" type="time" value="${existing?.replacementEnd||''}"></label></div><p class="field-note">Enter both cover times for partial coverage. Leave both empty to cover the original shift. Overlapping assignments are rejected.</p><label>Private admin note<textarea name="note" rows="2" maxlength="500" placeholder="Optional">${esc(existing?.note||'')}</textarea></label>`,async f=>{
    const next=copy(), from=f.get('date'), through=f.get('through')||from;
    if(through<from)throw new Error('The end date must be on or after the start date.');const span=Math.round((new Date(through)-new Date(from))/86400000);if(span>365)throw new Error('Choose a date range of one year or less.');
    const type=f.get('type'), start=f.get('start'), end=f.get('end'), replacementId=f.get('replacement'), cs=f.get('coverStart'), ce=f.get('coverEnd');
    if((start&&!end)||(!start&&end))throw new Error('Enter both working times, or leave both blank.');if(type==='custom'&&(!start||!end))throw new Error('Adjusted shifts need a start and end time.');if(start===end&&start)throw new Error('Working start and end must differ.');if(start&&['sick','vacation','off'].includes(type))throw new Error('Use Adjusted shift or Pension day when the person will work reduced hours.');
    if(replacementId===f.get('member'))throw new Error('Choose a different person to cover the shift.');if((cs&&!ce)||(!cs&&ce))throw new Error('Enter both cover times, or leave both blank.');if(cs&&cs===ce)throw new Error('Cover start and end must differ.');
    const selectedDays=new Set(f.getAll('days').map(Number));if(!existing&&!selectedDays.size)throw new Error('Choose at least one weekday to apply the change.');
    let count=0;
    for(let i=0;i<=span;i++){const d=model.addDays(from,i);if(!existing&&!selectedDays.has((new Date(d+'T12:00:00Z').getUTCDay()+6)%7))continue;const entry={id:existing?.id||model.uid(),teamId:team.id,memberId:f.get('member'),date:d,type,...(start&&end?{start,end}:{}),...(replacementId?{replacementId,...(cs&&ce?{replacementStart:cs,replacementEnd:ce}:{})}:{}),note:f.get('note').trim()};next.exceptions=next.exceptions.filter(e=>e.id!==entry.id&&!(e.teamId===team.id&&e.memberId===entry.memberId&&e.date===d));next.exceptions.push(entry);count++;}
    if(!count)throw new Error('There are no selected weekdays within this date range.');
    // Cover records carry conflicts detected by the scheduling engine.
    for(let i=0;i<=span;i++){const d=model.addDays(from,i);for(const t of next.teams){const conflicts=model.getDayAssignments(next,t.id,d).filter(s=>s.conflict);if(conflicts.length)throw new Error(`The replacement has overlapping shifts on ${d}. Choose another person or different cover hours.`);}}
    await save(next,'Individual change saved');
  },{extra:existing?`<button type="button" class="danger-text" data-action="delete-exception" data-id="${esc(existing.id)}">Remove change</button>`:'',submit:existing?'Save change':'Add change'});
  if(!existing){const fieldset=document.createElement('fieldset');fieldset.className='repeat-days';fieldset.innerHTML=`<legend>Apply on these days within the date range</legend><div>${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((day,i)=>`<label><input name="days" type="checkbox" value="${i}" checked><span>${day}</span></label>`).join('')}</div><small>For repeating pension days, select a longer date range and only the relevant weekdays.</small>`;$('#exception-type').closest('label').before(fieldset);}
}
function teamSettings() {
  const team=workingTeam();if(!team)return;
  modal('Team settings','Give your team a name that coworkers recognise.',`<label>Team name<input name="name" value="${esc(team.name)}" required maxlength="60"></label>`,async f=>{const name=f.get('name').trim();if(!name)throw new Error('Enter a team name.');const next=copy();next.teams.find(t=>t.id===team.id).name=name;await save(next);});
}

function shareModal() {
  const team=workingTeam()||currentTeam();if(!team)return;
  const local=/^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  const base=local?(localStorage.getItem('skift-published-url')||''):location.origin+location.pathname;
  modal('One scan. Their whole week.',local?'Enter your published website address to create a QR code coworkers can scan.':'Print this code for your team. It always opens the current week.',`<label>Published website address<input name="url" type="url" id="share-url" value="${esc(base)}" placeholder="https://yourname.github.io/your-repository/" required></label><div id="qr-output" class="qr-output"><span>Your team QR code will appear here.</span></div><p class="field-note">Team: ${esc(team.name)}. The QR code contains only the website link. Coworkers still sign in when connected.</p>`,async f=>{
    const url=new URL(f.get('url'));if(!['https:','http:'].includes(url.protocol))throw new Error('Use a website address starting with https://.');if(['localhost','127.0.0.1'].includes(url.hostname))throw new Error('Use the published address so phones can reach it.');url.search='';url.searchParams.set('team',team.id);localStorage.setItem('skift-published-url',f.get('url'));drawQR(url.toString());
    try {await navigator.clipboard.writeText(url.toString());toast('Team link copied');}catch{toast('Your team link is shown below the code.');}
  },{submit:'Copy team link',eyebrow:'SHARE YOUR TEAM'});
  const field=$('#share-url');field.addEventListener('input',()=>{try{const url=new URL(field.value);if(!['https:','http:'].includes(url.protocol))return;url.search='';url.searchParams.set('team',team.id);drawQR(url.toString());}catch{$('#qr-output').textContent='Enter a complete website address.';}});
  if(base)field.dispatchEvent(new Event('input'));
  // Copying is a repeatable action; keep the dialog open for downloading or printing.
  $('#modal-form').onsubmit=async e=>{e.preventDefault();try{const url=new URL(field.value);if(!['https:','http:'].includes(url.protocol)||['localhost','127.0.0.1'].includes(url.hostname))throw new Error('Enter your published website address first.');url.search='';url.searchParams.set('team',team.id);localStorage.setItem('skift-published-url',field.value);drawQR(url.toString());await navigator.clipboard.writeText(url.toString());toast('Team link copied');}catch(error){$('.form-error',$('#modal')).textContent=error.message;}};
}
function drawQR(url) {
  const qr=qrcode(0,'M');qr.addData(url);qr.make();$('#qr-output').innerHTML=`${qr.createSvgTag({cellSize:5,margin:20,scalable:true})}<a href="${esc(url)}" target="_blank" rel="noopener">${esc(url)}</a><button class="secondary-btn" type="button" data-action="download-qr">${icon('download')} Download QR code</button>`;
  $('#qr-output svg').setAttribute('role','img');$('#qr-output svg').setAttribute('aria-label','QR code for the team schedule');
}
function download(content,type,name) {const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function setupModal() {
  modal('Ready to share it with your team?','This demo works on your device. Connect a database to share schedules securely across phones.',`<ol class="setup-steps"><li>Put this project in a GitHub repository and enable GitHub Pages.</li><li>Create a Supabase project and run the included database setup.</li><li>Add your project URL and publishable key to <strong>config.js</strong>.</li><li>Create your admin account, then invite coworkers using the setup guide.</li></ol><p class="field-note">The full instructions are in README.md. Export a backup here, then import it as a draft into the connected workspace.</p>`,async()=>{}, {submit:'Got it'});
}
function renderLogin(error='') {
  $('#app').innerHTML=`<main class="login-page"><a class="brand" href="./"><span class="brand-mark">${icon('calendar')}</span>skift<span class="brand-period">.</span></a><section class="login-card"><div class="eyebrow">YOUR TEAM, IN SYNC</div><h1>Your next shift<br>starts here.</h1><p>Sign in to see your schedule and who you’ll be working with.</p><form id="login-form"><label>Email<input name="email" type="email" autocomplete="username" required placeholder="you@example.com"></label><label>Password<input name="password" type="password" autocomplete="current-password" required minlength="6"></label><p class="form-error" role="alert">${esc(error)}</p><button class="primary-btn" type="submit">Sign in ${icon('arrow')}</button></form><small>Your admin creates your account. Contact them if you need access or a password reset.</small></section><p class="login-caption">A clear plan. A calmer week.</p></main>`;
  $('#login-form').onsubmit=async e=>{e.preventDefault();e.submitter.disabled=true;const f=new FormData(e.target);try{workspace=await store.login(f.get('email'),f.get('password'));shell();}catch(err){renderLogin(err.message);}};
}
function bindRotationDrag() {
  let source;
  document.querySelectorAll('.rotation-table tbody tr').forEach(row=>{row.ondragstart=e=>{if(e.target.closest('select,button')){e.preventDefault();return;}source=Number(row.dataset.row);e.dataTransfer.effectAllowed='move';};row.ondragover=e=>{e.preventDefault();};row.ondrop=async e=>{e.preventDefault();const target=Number(row.dataset.row);if(source===undefined||source===target)return;await reorderRow(source,target);};});
}
async function reorderRow(from,to) {const next=copy(),team=next.teams.find(t=>t.id===workingTeam().id),v=editingVersion(team);if(versionPublished(v))throw new Error('Create a new rotation to reorder published weeks.');const [row]=v.rotation.splice(from,1);v.rotation.splice(to,0,row);await save(next,'Weeks reordered in draft');}
async function handleAction(button) {
  const action=button.dataset.action;
  switch(action) {
    case 'view': ui.view=button.dataset.view;if(ui.view==='team')ui.period='week';shell();window.scrollTo({top:0,behavior:'smooth'});break;
    case 'admin':ui.view='admin';shell();break;
    case 'navigate': {const step=Number(button.dataset.step);if(ui.period==='week')ui.date=model.addDays(ui.date,step*7);else{const d=new Date(ui.date+'T12:00:00Z');if(ui.period==='month'){d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+step);}else{d.setUTCMonth(0,1);d.setUTCFullYear(d.getUTCFullYear()+step);}ui.date=d.toISOString().slice(0,10);}shell();break;}
    case 'today':ui.date=today();shell();break;
    case 'period':ui.period=button.dataset.period;if(ui.view==='team'&&ui.period!=='week')ui.view='schedule';shell();break;
    case 'select-day':ui.date=button.dataset.date;shell();$(`#day-${ui.date}`)?.scrollIntoView({block:'center',behavior:'smooth'});break;
    case 'open-week':ui.date=button.dataset.date;ui.period='week';shell();break;
    case 'open-month':ui.date=button.dataset.date;ui.period='month';shell();break;
    case 'person':ui.memberId=button.dataset.member;if(!currentTeam().members.some(m=>m.id===ui.memberId))ui.teamId=data().teams.find(t=>t.members.some(m=>m.id===ui.memberId))?.id;localStorage.setItem('skift-person',ui.memberId);ui.view='schedule';shell();break;
    case 'admin-tab':ui.adminTab=button.dataset.tab;shell();break;
    case 'close-modal':$('#modal').close();break;
    case 'add-team':if(admin())addTeam();break;
    case 'add-person':if(admin())personModal();break;
    case 'edit-person':if(admin())personModal(button.dataset.member);break;
    case 'new-rotation':if(admin())newRotation();break;
    case 'version-dates':if(admin())versionDates();break;
    case 'add-shift':if(admin())shiftModal();break;
    case 'edit-shift':if(admin())shiftModal(button.dataset.code);break;
    case 'exception':if(admin())exceptionModal({date:button.dataset.date,memberId:button.dataset.member});break;
    case 'edit-exception':if(admin())exceptionModal({id:button.dataset.id});break;
    case 'delete-exception':if(admin()){const next=copy();next.exceptions=next.exceptions.filter(e=>e.id!==button.dataset.id);await save(next,'Change removed');$('#modal').close();}break;
    case 'settings':if(admin())teamSettings();break;
    case 'share':shareModal();break;
    case 'setup':setupModal();break;
    case 'download-qr':{const svg=$('#qr-output svg');if(svg)download(new XMLSerializer().serializeToString(svg),'image/svg+xml',`skift-${workingTeam()?.name||'team'}-qr.svg`);break;}
    case 'preview':ui.previewDraft=true;ui.view='schedule';shell();break;
    case 'publish':if(admin()){
      const errors=model.validateState(workspace.working);if(errors.length)throw new Error(errors[0]);
      modal('Ready for the team?','Publishing updates the schedule coworkers see. Private notes and absence reasons stay in your admin workspace.',`<div class="publish-overview">${workspace.working.teams.length} teams · ${workspace.working.teams.reduce((n,t)=>n+t.members.filter(m=>!m.activeUntil||m.activeUntil>today()).length,0)} active coworkers</div>`,async()=>{workspace={...workspace,...await store.publish(workspace.working)};ui.previewDraft=false;shell();toast('Schedule published');},{submit:'Publish schedule'});
    }break;
    case 'export':if(admin())download(JSON.stringify(workspace.working,null,2),'application/json',`skift-backup-${today()}.json`);break;
    case 'move-row':if(admin())await reorderRow(Number(button.dataset.row),Number(button.dataset.row)+Number(button.dataset.dir));break;
    case 'logout':await store.logout();workspace=await store.init();shell();break;
    case 'refresh':if(!ui.busy){workspace=await store.init();shell();if(workspace.error)toast(workspace.error,true);else toast('Schedule refreshed');}break;
  }
}
document.addEventListener('click',async e=>{const button=e.target.closest('[data-action]');if(!button||button.disabled)return;try{await handleAction(button);}catch(error){toast(error.message,true);}});
document.addEventListener('change',async e=>{
  const target=e.target;
  try {
    if(['team-select','admin-team-select'].includes(target.id)){ui.teamId=target.value;editingVersionId=undefined;localStorage.setItem('skift-team',ui.teamId);shell();}
    else if(target.id==='person-select'){ui.memberId=target.value;localStorage.setItem('skift-person',ui.memberId);shell();}
    else if(target.id==='jump-date'){if(target.value){ui.date=target.value;shell();}}
    else if(target.id==='preview-draft'){ui.previewDraft=target.checked;shell();}
    else if(target.id==='version-select'){editingVersionId=target.value;shell();}
    else if(target.classList.contains('rotation-cell')&&admin()){const next=copy(),team=next.teams.find(t=>t.id===workingTeam().id);editingVersion(team).rotation[Number(target.dataset.row)][Number(target.dataset.day)]=target.value;await save(next,'Shift updated in draft');}
    else if(target.classList.contains('position-select')&&admin()){const next=copy(),team=next.teams.find(t=>t.id===workingTeam().id);if(versionPublished(editingVersion(team)))throw new Error('Create a new rotation to change published starting positions.');if(Number(target.value))editingVersion(team).positions[target.dataset.member]=Number(target.value);else delete editingVersion(team).positions[target.dataset.member];await save(next,'Starting position updated');}
    else if(target.id==='import-file'&&admin()&&target.files[0]){const state=JSON.parse(await target.files[0].text());const errors=model.validateState(state);if(errors.length)throw new Error(errors[0]);modal('Replace your working draft?','Your published schedule stays available until you publish this imported draft.',`<p>${state.teams.length} teams in this backup.</p>`,async()=>{workspace={...workspace,...await store.importData(state)};ui.teamId=undefined;editingVersionId=undefined;shell();toast('Backup imported as a draft');},{submit:'Import draft'});}
  }catch(error){toast(error.message,true);shell();}
});
$('#modal').addEventListener('click',e=>{if(e.target===$('#modal')){const rect=e.target.getBoundingClientRect();if(e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom)e.target.close();}});
async function refreshSharedSchedule() {
  if(workspace?.mode!=='cloud'||workspace.role==='signed-out'||$('#modal').open||ui.busy)return;
  try {const fresh=await store.init();if(fresh.role==='signed-out'){workspace=fresh;shell();return;}if(fresh.error){toast(fresh.error,true);return;}if(fresh.revision!==workspace.revision||fresh.role!==workspace.role){workspace=fresh;shell();toast('Your schedule is up to date');}}catch(error){toast(error.message,true);}
}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refreshSharedSchedule();});
setInterval(()=>{if(document.visibilityState==='visible')refreshSharedSchedule();},60000);
try {workspace=await store.init();shell();if(workspace.error&&workspace.role!=='signed-out')toast(workspace.error,true);}catch(error){$('#app').innerHTML=`<main class="error-page">${icon('info')}<h1>We couldn’t open your workspace.</h1><p>${esc(error.message)}</p><button class="primary-btn" onclick="location.reload()">Try again</button></main>`;}

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
const fmt = (date, options) => new Intl.DateTimeFormat('sv-SE', {...options,timeZone:'UTC'}).format(new Date(date + 'T12:00:00Z'));
const periodLabel = period => ({week:'Vecka',month:'Månad',year:'År'}[period] || period);
const weekdayLabels = ['Mån','Tis','Ons','Tor','Fre','Lör','Sön'];
const weekdayNames = ['måndag','tisdag','onsdag','torsdag','fredag','lördag','söndag'];
const daysOffLabel = count => `${count} ${count===1?'ledig dag':'lediga dagar'}`;
const weeksLabel = count => `${count} ${count===1?'vecka':'veckor'}`;
const colorLabel = color => ({amber:'Bärnsten',mint:'Mintgrön',blue:'Blå',lavender:'Lavendel',purple:'Lila',teal:'Turkos',rose:'Rosa',peach:'Persika',sage:'Salviagrön'}[color] || color);
const initials = name => name.split(/\s+/).map(w => w[0]).slice(0,2).join('').toUpperCase();
const avatar = (member, i = 0, small = false) => `<span class="avatar tone-${i % 5} ${small ? 'small' : ''}" title="${esc(member.name)}">${esc(initials(member.name))}</span>`;
const urlParams = new URLSearchParams(location.search);
const ui = {view:'schedule',period:'week',date:urlParams.get('date') && /^\d{4}-\d{2}-\d{2}$/.test(urlParams.get('date')) && !isNaN(Date.parse(urlParams.get('date'))) ? urlParams.get('date') : today(), teamId:urlParams.get('team') || localStorage.getItem('skift-team'),memberId:localStorage.getItem('skift-person'),adminTab:'people',previewDraft:false,busy:false};
let workspace;
const admin = () => workspace?.role === 'admin';
const data = () => admin() && ui.previewDraft ? workspace.working : workspace.published;
const currentTeam = (state = ui.view === 'admin' ? workspace?.working : data()) => state?.teams.find(t => t.id === ui.teamId) || state?.teams[0];
const currentMember = (team = currentTeam()) => team?.members.find(m => m.id === ui.memberId) || team?.members.find(m => !m.activeUntil || m.activeUntil > ui.date) || team?.members[0];
const label = (value) => ({vacation:'Semester',sick:'Sjukfrånvaro',pension:'Pensionsdag',custom:'Anpassat pass',off:'Ledig',cover:'Ersättningspass',shift:'Arbetar'}[value] || value);

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
  const nav = (mobile = false) => [['schedule','calendar','Schema'],['team','team','Team'],...(admin() ? [['admin','settings','Hantera']] : [])].map(([view,ico,text]) => `<button class="nav-item ${ui.view === view ? 'active' : ''}" data-action="view" data-view="${view}">${icon(ico)}<span>${text}</span>${!mobile && ui.view === view ? '<span class="nav-dot"></span>' : ''}</button>`).join('');
  $('#app').innerHTML = `<div class="app-shell">
    <aside class="sidebar"><a class="brand" href="./" aria-label="Skift startsida"><span class="brand-mark">${icon('calendar')}</span>skift<span class="brand-period">.</span></a><div class="workspace-label">DIN ARBETSPLATS</div><nav aria-label="Huvudnavigation">${nav()}</nav><div class="sidebar-bottom"><div class="help-card">${icon('leaf')}<strong>Mindre planering.<br>Mer tid för livet.</strong><p>Ditt nästa pass, alltid nära.</p></div><div class="profile">${avatar({name:admin()?'Schemaadministratör':'Medarbetare'},0)}<div><strong>${admin()?'Schemaadministratör':'Medarbetare'}</strong><span>${workspace.mode === 'demo' ? 'Demoläge' : esc(workspace.user?.email || 'Inloggad')}</span></div>${workspace.mode === 'cloud' ? `<button class="icon-btn" data-action="logout" aria-label="Logga ut">${icon('logout')}</button>` : ''}</div></div></aside>
    <div class="main-shell"><header class="topbar"><a class="brand mobile-brand" href="./"><span class="brand-mark">${icon('calendar')}</span>skift<span class="brand-period">.</span></a><div class="top-context"><span class="live-dot"></span> Teamets arbetsyta</div><div class="top-actions">${team ? `<label class="team-select">${icon('team')}<select id="team-select" aria-label="Välj team">${(ui.view==='admin'?workspace.working.teams:data()?.teams || []).map(t => `<option value="${esc(t.id)}" ${t.id===team.id?'selected':''}>${esc(t.name)}</option>`).join('')}</select></label>` : ''}${admin() ? `<button class="icon-btn" data-action="share" aria-label="Dela teamets schema">${icon('share')}</button>` : ''}${avatar(member || {name:'Skift'},2,true)}</div></header>
    ${workspace.mode === 'demo' ? `<div class="demo-notice"><span>${icon('info')}<strong>Demoläge</strong> <span class="demo-detail">Ändringar sparas på den här enheten.</span></span><button data-action="setup">Anslut ditt team ${icon('arrow')}</button></div>` : ''}
    <main id="content" tabindex="-1">${ui.view==='admin' ? adminView() : team ? (ui.view==='team' ? teamView() : scheduleView()) : emptyWorkspace()}</main>
    <footer class="page-footer"><span>För en enklare arbetsdag.</span><span>${workspace.published?.publishedAt ? `Publicerat ${new Date(workspace.published.publishedAt).toLocaleDateString('sv-SE',{day:'numeric',month:'short'})}` : 'Inget schema publicerat ännu'}</span></footer>
    </div><nav class="mobile-nav" aria-label="Mobilnavigation">${nav(true)}</nav>
  </div>`;
  if(workspace.mode==='cloud'){const refresh=document.createElement('button');refresh.className='icon-btn';refresh.dataset.action='refresh';refresh.setAttribute('aria-label','Uppdatera schemat');refresh.innerHTML=icon('refresh');$('.top-actions').prepend(refresh);}
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
  return `<div class="page-heading"><div><div class="eyebrow">${ui.period==='week' ? `KALENDERVECKA ${week.week}` : 'DITT SCHEMA'}</div><h1>${teamView ? 'Teamets schema.' : 'Din vecka i korthet.'}</h1><p>${teamView ? 'Se vilka som jobbar och när ni arbetar tillsammans.' : 'Koll på dina arbetstider. Mer plats för allt annat.'}</p></div>${!teamView && member ? `<label class="person-select"><span>Visa schema för</span><select id="person-select" aria-label="Välj medarbetare">${currentTeam().members.filter(m=>!m.activeUntil || m.activeUntil>ui.date).map(m=>`<option value="${esc(m.id)}" ${m.id===member.id?'selected':''}>${esc(m.name)}</option>`).join('')}</select></label>` : ''}</div>
  <div class="schedule-toolbar"><div class="date-navigation"><button class="icon-btn" data-action="navigate" data-step="-1" aria-label="Föregående ${periodLabel(ui.period).toLowerCase()}">${icon('left')}</button><strong>${dateRange()}</strong><button class="icon-btn" data-action="navigate" data-step="1" aria-label="Nästa ${periodLabel(ui.period).toLowerCase()}">${icon('right')}</button><button class="today-btn" data-action="today">Idag</button></div><div class="view-controls"><label class="date-picker" title="Gå till ett datum">${icon('calendar')}<span>Välj datum</span><input id="jump-date" type="date" value="${ui.date}" aria-label="Gå till ett datum"></label><div class="segmented" aria-label="Schemaperiod">${['week','month','year'].map(p=>`<button data-action="period" data-period="${p}" class="${ui.period===p?'selected':''}" aria-pressed="${ui.period===p}">${periodLabel(p)}</button>`).join('')}</div></div></div>
  ${admin() ? `<div class="published-label"><span class="${ui.previewDraft?'draft-dot':'live-dot'}"></span>${ui.previewDraft ? 'Förhandsvisning av utkast' : 'Publicerat schema'}<label class="preview-toggle"><input id="preview-draft" type="checkbox" ${ui.previewDraft?'checked':''}> Visa utkast</label></div>` : ''}`;
}

function scheduleView() {
  const team = currentTeam(), member = currentMember(team);
  if (!member) return `${heading()}${empty('Inga medarbetare ännu','Lägg till en medarbetare under Hantera för att börja schemalägga.','admin','Hantera team')}`;
  return heading() + (ui.period==='week' ? weekView(team,member) : ui.period==='month' ? monthView(team,member) : yearView(team,member));
}
function hours(minutes) { return new Intl.NumberFormat('sv-SE',{maximumFractionDigits:1}).format(minutes / 60); }
function personDay(state,team,member,date) {
  const main=model.getShift(state,team.id,member.id,date);
  const assignments=state.teams.flatMap(t=>model.getDayAssignments(state,t.id,date)).filter(s=>s.memberId===member.id&&(s.teamId===team.id||s.type==='cover'));
  return {...main, assignments, working:assignments.length>0, minutes:assignments.reduce((n,s)=>n+s.minutes,0), rotationWeek:model.activeVersion(team,date)?model.rotationPosition(model.activeVersion(team,date),member.id,date):0};
}
function weekView(team, member) {
  const days = model.weekDates(ui.date), shifts = days.map(d=>personDay(data(),team,member,d));
  const working = shifts.filter(s=>s.working), total = working.reduce((n,s)=>n+s.minutes,0), shiftCount=shifts.reduce((n,s)=>n+s.assignments.length,0);
  const version = model.activeVersion(team,ui.date), position = version ? model.rotationPosition(version,member.id,ui.date) : 0;
  return `<div class="week-strip">${days.map((d,i)=>`<button class="week-day ${d===today()?'is-today':''} ${d===ui.date?'selected':''}" data-action="select-day" data-date="${d}"><span>${fmt(d,{weekday:'short'})}</span><strong>${fmt(d,{day:'numeric'})}</strong><span class="shift-dot ${shifts[i].working ? colorFor(team,d,shifts[i].code) : 'off-dot'}"></span>${d===today()?'<span class="sr-only">Idag</span>':''}</button>`).join('')}</div>
  <div class="schedule-layout"><section class="schedule-panel"><div class="panel-heading"><h2>Den här veckan</h2><span>${shiftCount} pass · ${daysOffLabel(7-working.length)}</span></div><div class="days-list">${days.map((d,i)=>dayCard(team,member,d,shifts[i])).join('')}</div></section>
  <aside class="schedule-aside"><section class="summary-card"><div class="eyebrow">VECKANS ÖVERBLICK</div><h2>Din vecka i siffror</h2><div class="big-stat">${hours(total)}<span>schemalagda timmar</span></div><div class="mini-stats"><div><strong>${working.length}</strong><span>Arbetsdagar</span></div><div><strong>${7-working.length}</strong><span>Lediga dagar</span></div><div><strong>${position || '—'}<small> / ${version?.rotation.length || '—'}</small></strong><span>Schemavecka</span></div></div><p>${icon('info')}Timmar visas före rastavdrag.</p></section>
  <section class="aside-card"><h3>${icon('team')}Ditt team den här veckan</h3><div class="team-mini">${team.members.filter(m=>!m.activeUntil || m.activeUntil>days[0]).map((m,i)=>{const pos=version?model.rotationPosition(version,m.id,ui.date):0;return `<button class="team-mini-row" data-action="person" data-member="${esc(m.id)}">${avatar(m,i,true)}<span>${esc(m.name)}${m.id===member.id?'<small>Vald</small>':''}</span><span class="rotation-tag">Vecka ${pos || '—'}</span></button>`;}).join('')}</div><button class="text-button" data-action="view" data-view="team">Visa teamets schema ${icon('arrow')}</button></section>
  <section class="aside-card legend-card"><h3>Passöversikt</h3><div class="legend">${Object.entries(version?.shifts || {}).map(([code,s])=>`<div><span class="code-badge ${esc(s.color)}">${esc(code)}</span><span>${s.start}–${s.end}</span></div>`).join('')}</div></section></aside></div>`;
}
function colorFor(team,date,code) { return model.activeVersion(team,date)?.shifts[code]?.color || 'mint'; }
function dayCard(team,member,date,shift) {
  const coworkers = shift.working ? model.getCoworkers(data(),team.id,member.id,date) : [];
  const isToday = date===today(), inactive = !shift.rotationWeek && member.role !== 'part-time';
  const assignments=shift.assignments||[];
  const title=s=>`<strong>${s.start}<span class="time-dash">–</span>${s.end}</strong><span class="code-badge ${esc(s.color||colorFor(team,date,s.code))}">${esc(s.code || '↗')}</span>${s.type==='cover'?`<span class="tiny-tag">Ersätter · ${esc(data().teams.find(t=>t.id===s.teamId)?.name||'Team')}</span>`:''}`;
  return `<article class="day-card ${shift.working?'':'off-day'} ${isToday?'today-card':''}" id="day-${date}"><div class="day-date"><span>${fmt(date,{weekday:'short'})}</span><strong>${fmt(date,{day:'numeric'})}</strong></div><div class="day-content"><div class="shift-title">${shift.working ? title(assignments[0]) : `<strong>${inactive?'Inget schema ännu':label(shift.type)}</strong>${icon('leaf','off-leaf')}`}${isToday?'<span class="today-tag">Idag</span>':''}</div>${assignments.slice(1).map(s=>`<div class="shift-title extra-shift">${title(s)}</div>`).join('')}${shift.working ? `<div class="coworker-line">${coworkers.length?`<div class="avatar-stack">${coworkers.slice(0,3).map((c,i)=>avatar(c,i,true)).join('')}</div><span>Med ${[...new Set(coworkers.map(c=>esc(c.name)))].join(', ')}</span>`:'<span class="muted">Inga kollegor med överlappande pass</span>'}</div>${coworkers.length?`<details class="overlap-details"><summary>Visa gemensamma arbetstider</summary><div>${coworkers.map(c=>`<span>${esc(c.name)} <strong>${c.overlapStart}–${c.overlapEnd}</strong></span>`).join('')}</div></details>`:''}` : `<p class="off-caption">${inactive ? 'Ett publicerat schema visas här.' : 'Tid för dig.'}</p>`}${shift.conflict ? '<span class="coverage-warning">Överlappande pass – behöver granskas</span>':''}${admin() && ui.previewDraft && shift.needsCoverage ? `<span class="coverage-warning">${hours(shift.uncoveredMinutes || 0)} timmar behöver ersättare</span>`:''}</div>${shift.working?`<span class="duration">${hours(shift.minutes)}h</span>`:''}${admin()&&ui.previewDraft?`<button class="icon-btn edit-day" data-action="exception" data-date="${date}" data-member="${esc(member.id)}" aria-label="Redigera ${fmt(date,{weekday:'long',day:'numeric',month:'long'})}">${icon('edit')}</button>`:''}</article>`;
}

function monthDays(date) {
  const first = date.slice(0,7)+'-01', start = model.mondayOf(first);
  const last = new Date(Date.UTC(Number(date.slice(0,4)),Number(date.slice(5,7)),0)).getUTCDate();
  const count = Math.ceil((Math.round((new Date(first)-new Date(start))/86400000)+last)/7)*7;
  return Array.from({length:count},(_,i)=>model.addDays(start,i));
}
function monthView(team,member) {
  const days = monthDays(ui.date), assignments = days.filter(d=>d.slice(0,7)===ui.date.slice(0,7)).map(d=>personDay(data(),team,member,d));
  return `<div class="month-summary"><span>${assignments.reduce((n,s)=>n+s.assignments.length,0)} pass den här månaden</span><span>${hours(assignments.reduce((n,s)=>n+s.minutes,0))} schemalagda timmar</span><span>Tryck på en dag för att öppna veckan</span></div><section class="month-calendar"><div class="calendar-weekdays">${weekdayLabels.map(d=>`<span>${d}</span>`).join('')}</div><div class="calendar-grid">${days.map(d=>{const s=personDay(data(),team,member,d);return `<button class="calendar-cell ${d.slice(0,7)!==ui.date.slice(0,7)?'other-month':''} ${d===today()?'cell-today':''}" data-action="open-week" data-date="${d}" aria-label="${fmt(d,{weekday:'long',day:'numeric',month:'long'})}, ${s.working?s.assignments.map(a=>a.start+' till '+a.end).join(', '):label(s.type)}"><span class="cell-number">${fmt(d,{day:'numeric'})}</span>${s.working?`<span class="calendar-shift ${colorFor(team,d,s.code)}"><b>${esc(s.code||'↗')}</b><span>${s.start}<span class="cell-end">–${s.end}</span></span>${s.assignments.length>1?`<small class="extra-count">+${s.assignments.length-1} pass</small>`:''}</span>`:'<span class="calendar-off">Ledig</span>'}</button>`;}).join('')}</div></section>`;
}
function yearView(team,member) {
  const year = ui.date.slice(0,4);
  return `<div class="year-grid">${Array.from({length:12},(_,i)=>{const date=`${year}-${String(i+1).padStart(2,'0')}-01`; const days=monthDays(date);return `<button class="mini-month" data-action="open-month" data-date="${date}"><div><h2>${fmt(date,{month:'long'})}</h2>${icon('right')}</div><div class="mini-weekdays">${['M','T','O','T','F','L','S'].map(d=>`<span>${d}</span>`).join('')}</div><div class="mini-grid">${days.map(d=>{const s=personDay(data(),team,member,d);return `<span class="${d.slice(0,7)!==date.slice(0,7)?'dim':''} ${s.working?'mini-work':''} ${d===today()?'mini-today':''}">${fmt(d,{day:'numeric'})}</span>`;}).join('')}</div></button>`;}).join('')}</div>`;
}
function teamView() {
  const team=currentTeam(), dates=model.weekDates(ui.date), homeMembers=team.members.filter(m=>!m.activeUntil||m.activeUntil>dates[0]);
  const assignments=Object.fromEntries(dates.map(d=>[d,model.getDayAssignments(data(),team.id,d)]));
  const visitors=[...new Set(Object.values(assignments).flat().map(s=>s.memberId))].filter(id=>!homeMembers.some(m=>m.id===id)).map(id=>findMember(id)).filter(Boolean),members=[...homeMembers,...visitors];
  if(ui.period!=='week') ui.period='week';
  return heading(true) + `<section class="team-panel"><div class="panel-heading"><h2>${esc(team.name)}</h2><span>${members.length} medarbetare</span></div><div class="team-table-wrap"><table class="team-table"><thead><tr><th>Medarbetare</th>${dates.map(d=>`<th class="${d===today()?'today-column':''}">${fmt(d,{weekday:'short'})}<strong>${fmt(d,{day:'numeric'})}</strong></th>`).join('')}</tr></thead><tbody>${members.map((m,i)=>`<tr><th><button data-action="person" data-member="${esc(m.id)}">${avatar(m,i,true)}<span>${esc(m.name)}<small>${homeMembers.some(p=>p.id===m.id)?`Schemavecka ${model.activeVersion(team,ui.date)?model.rotationPosition(model.activeVersion(team,ui.date),m.id,ui.date)||'—':'—'}`:'Ersättare från annat team'}</small></span></button></th>${dates.map(d=>{const shifts=assignments[d].filter(s=>s.memberId===m.id);return `<td class="${d===today()?'today-column':''}">${shifts.length?shifts.map(s=>`<div class="table-shift ${esc(s.color||colorFor(team,d,s.code))}"><strong>${esc(s.code||'↗')}${s.type==='cover'?' ↗':''}</strong><span>${s.start}<br>${s.end}</span></div>`).join(''):'<span class="table-off">—</span>'}</td>`;}).join('')}</tr>`).join('')}</tbody></table></div><div class="mobile-team-days">${dates.map(d=>{const shifts=assignments[d];return `<div class="team-day"><h3>${fmt(d,{weekday:'long',day:'numeric',month:'short'})}${d===today()?'<span class="today-tag">Idag</span>':''}</h3>${shifts.length?shifts.map((s,i)=>{const person=findMember(s.memberId);return `<div class="team-day-row">${avatar(person||{name:'Medarbetare'},i,true)}<span>${esc(person?.name||'Medarbetare')}${s.type==='cover'?'<small>Ersättningspass</small>':''}</span><strong>${s.start}–${s.end}</strong><span class="code-badge ${esc(s.color||colorFor(team,d,s.code))}">${esc(s.code||'↗')}</span></div>`;}).join(''):'<p class="muted">Inga pass schemalagda</p>'}</div>`;}).join('')}</div></section><p class="table-hint">${icon('info')}Välj en medarbetare för att se personens schema och gemensamma arbetstider.</p>`;
}
const findMember = id => (ui.view==='admin'?workspace.working?.teams:data()?.teams || []).flatMap(t=>t.members).find(m=>m.id===id);

function empty(title,description,action,button) { return `<div class="empty-state">${icon('calendar')}<h2>${title}</h2><p>${description}</p>${action?`<button class="primary-btn" data-action="${action}">${button}</button>`:''}</div>`; }
function emptyWorkspace() {return empty('Din arbetsyta är redo','Lägg till ditt första team och publicera sedan ett schema för medarbetarna.',admin()?'add-team':null,'Lägg till ett team');}
function adminView() {
  const teams=workspace.working.teams, team=teams.find(t=>t.id===ui.teamId)||teams[0];
  const tabs=[['people','Medarbetare'],['rotation','Grundschema'],['changes','Ändringar']];
  return `<div class="page-heading admin-heading"><div><div class="eyebrow">SCHEMAADMINISTRATION</div><h1>Ett schema som passar.</h1><p>Hantera teamets grundschema och individuella ändringar.</p></div><button class="primary-btn" data-action="publish" ${ui.busy?'disabled':''}>${icon('check')} Publicera ändringar</button></div><div class="admin-status">${icon('edit')}<span>Arbetsutkast · ändringar visas för medarbetarna efter publicering.</span><button class="text-button" data-action="preview">Förhandsvisa ${icon('arrow')}</button></div><div class="admin-toolbar"><label>Team<select id="admin-team-select">${teams.map(t=>`<option value="${esc(t.id)}" ${t.id===team?.id?'selected':''}>${esc(t.name)}</option>`).join('')}</select></label><button class="secondary-btn" data-action="add-team">${icon('plus')} Lägg till team</button><button class="icon-btn" data-action="settings" aria-label="Teaminställningar" ${!team?'disabled':''}>${icon('settings')}</button><button class="icon-btn" data-action="share" aria-label="Dela team" ${!team?'disabled':''}>${icon('share')}</button></div>${team?`<div class="admin-tabs" role="tablist">${tabs.map(([id,name])=>`<button role="tab" aria-selected="${ui.adminTab===id}" class="${ui.adminTab===id?'active':''}" data-action="admin-tab" data-tab="${id}">${name}${id==='changes'?`<span>${workspace.working.exceptions.filter(e=>e.teamId===team.id).length}</span>`:''}</button>`).join('')}</div>${ui.adminTab==='people'?peopleAdmin(team):ui.adminTab==='rotation'?rotationAdmin(team):changesAdmin(team)}`:emptyWorkspace()}<div class="backup-bar"><span>${icon('download')} Spara en kopia av ditt schema.</span><button class="text-button" data-action="export">Exportera säkerhetskopia</button><label class="text-button import-label">Importera säkerhetskopia<input id="import-file" type="file" accept="application/json,.json"></label></div>`;
}
function peopleAdmin(team) {
  const version=model.activeVersion(team,ui.date)||team.versions.at(-1), members=team.members;
  return `<section class="admin-panel"><div class="panel-heading"><div><h2>Dina medarbetare</h2><p>Startpositioner ändras under Grundschema.</p></div><button class="secondary-btn" data-action="add-person">${icon('plus')} Lägg till medarbetare</button></div><div class="people-list">${members.map((m,i)=>{const pos=version?model.rotationPosition(version,m.id,ui.date):0;return `<div class="person-row ${m.activeUntil&&m.activeUntil<=today()?'archived':''}">${avatar(m,i)}<div class="person-info"><strong>${esc(m.name)}</strong><span>${m.role==='part-time'?'Timvikarie':'Medarbetare'}${m.activeUntil?` · Slutar ${fmt(m.activeUntil,{day:'numeric',month:'short',year:'numeric'})}`:''}</span></div><span class="rotation-tag">${pos?`Vecka ${pos}`:m.role==='part-time'?'Endast ersättningspass':'Ingen position'}</span><button class="icon-btn" data-action="edit-person" data-member="${esc(m.id)}" aria-label="Redigera ${esc(m.name)}">${icon('edit')}</button></div>`;}).join('')}</div></section><div class="info-card">${icon('info')}<p><strong>Antal medarbetare och schemaveckor är oberoende av varandra.</strong> Lägg till eller ta bort medarbetare vid behov. Ändra antalet schemaveckor separat när grundschemat ändras.</p></div>`;
}
let editingVersionId;
function rotationAdmin(team) {
  const version=team.versions.find(v=>v.id===editingVersionId)||model.activeVersion(team,ui.date)||team.versions.at(-1);
  if(!version)return empty('Inget grundschema ännu','Skapa ett grundschema för teamet.','new-rotation','Skapa grundschema');
  editingVersionId=version.id;
  return `<section class="admin-panel rotation-panel"><div class="panel-heading"><div><h2>Det återkommande grundschemat</h2><p>Välj ett pass i varje ruta. En tom ruta betyder ledig.</p></div><button class="secondary-btn" data-action="new-rotation">${icon('plus')} Ny rotation</button></div><div class="rotation-settings"><label>Schemaversion<select id="version-select">${[...team.versions].sort((a,b)=>a.effectiveFrom.localeCompare(b.effectiveFrom)).map(v=>`<option value="${esc(v.id)}" ${v.id===version.id?'selected':''}>Från ${v.effectiveFrom} · ${weeksLabel(v.rotation.length)}</option>`).join('')}</select></label><div><span>Referensmåndag</span><strong>${fmt(version.referenceMonday,{day:'numeric',month:'short',year:'numeric'})}</strong></div><div><span>Antal schemaveckor</span><strong>${weeksLabel(version.rotation.length)}</strong></div></div><div class="rotation-scroll"><table class="rotation-table"><thead><tr><th>Vecka</th>${weekdayLabels.map(d=>`<th>${d}</th>`).join('')}<th></th></tr></thead><tbody>${version.rotation.map((row,i)=>`<tr draggable="true" data-row="${i}"><th><span class="drag-handle" title="Dra för att ändra ordning">⠿</span> ${i+1}</th>${row.map((code,j)=>`<td><select class="rotation-cell ${version.shifts[code]?.color || ''}" data-row="${i}" data-day="${j}" aria-label="Vecka ${i+1}, ${weekdayNames[j]}"><option value="">—</option>${Object.keys(version.shifts).map(c=>`<option value="${esc(c)}" ${c===code?'selected':''}>${esc(c)}</option>`).join('')}</select></td>`).join('')}<td><button class="icon-btn row-move" data-action="move-row" data-row="${i}" data-dir="-1" aria-label="Flytta vecka ${i+1} uppåt" ${i===0?'disabled':''}>↑</button><button class="icon-btn row-move" data-action="move-row" data-row="${i}" data-dir="1" aria-label="Flytta vecka ${i+1} nedåt" ${i===version.rotation.length-1?'disabled':''}>↓</button></td></tr>`).join('')}</tbody></table></div><div class="rotation-footnote">${icon('info')} På mobilen kan du svepa tabellen i sidled. Använd pilarna för att ändra veckornas ordning.</div></section><section class="admin-panel"><div class="panel-heading"><div><h2>Startpositioner</h2><p>Varje medarbetares schemavecka den ${fmt(version.referenceMonday,{day:'numeric',month:'short',year:'numeric'})}.</p></div></div><div class="positions-list">${team.members.map((m,i)=>`<label>${avatar(m,i,true)}<span>${esc(m.name)}</span><select class="position-select" data-member="${esc(m.id)}" aria-label="Startvecka för ${esc(m.name)}">${version.rotation.map((_,j)=>`<option value="${j+1}" ${Number(version.positions[m.id])===j+1?'selected':''}>Vecka ${j+1}</option>`).join('')}</select></label>`).join('')}</div></section><section class="admin-panel"><div class="panel-heading"><div><h2>Passtider</h2><p>Tiderna gäller för den här schemaversionen.</p></div><button class="secondary-btn" data-action="add-shift">${icon('plus')} Lägg till pass</button></div><div class="shift-definitions">${Object.entries(version.shifts).map(([code,s])=>`<button data-action="edit-shift" data-code="${esc(code)}"><span class="code-badge ${esc(s.color)}">${esc(code)}</span><strong>${s.start}–${s.end}</strong>${icon('edit')}</button>`).join('')}</div></section>`;
}
function changesAdmin(team) {
  const changes=workspace.working.exceptions.filter(e=>e.teamId===team.id).sort((a,b)=>b.date.localeCompare(a.date));
  return `<section class="admin-panel"><div class="panel-heading"><div><h2>Individuella ändringar</h2><p>Frånvaro, kortare arbetstid och ersättningspass.</p></div><button class="secondary-btn" data-action="exception">${icon('plus')} Lägg till ändring</button></div>${changes.length?`<div class="changes-list">${changes.map(e=>{const shift=model.getShift(workspace.working,team.id,e.memberId,e.date);return `<button class="change-row" data-action="edit-exception" data-id="${esc(e.id)}"><span class="change-date">${fmt(e.date,{day:'numeric',month:'short'})}<small>${e.date.slice(0,4)}</small></span><div><strong>${esc(findMember(e.memberId)?.name || 'Tidigare medarbetare')}</strong><span>${label(e.type)}${e.start&&e.end?' · '+e.start+'–'+e.end:''}${e.replacementId?' · Ersätts av '+esc(findMember(e.replacementId)?.name||'Medarbetare'):''}</span>${shift.needsCoverage?`<small class="coverage-warning">${hours(shift.uncoveredMinutes||0)} timmar behöver ersättare</small>`:''}</div>${icon('edit')}</button>`;}).join('')}</div>`:empty('Inga individuella ändringar','Lägg till en ändring när någon är frånvarande eller behöver andra arbetstider.')}</section><div class="info-card">${icon('info')}<p><strong>Frånvaroorsaker är privata.</strong> Publicerade scheman visar arbetstider och lediga dagar. Dina anteckningar och frånvaroorsaker visas bara i administrationsvyn.</p></div>`;
}

function modal(title,description,body,onSubmit,options={}) {
  const dialog=$('#modal');
  dialog.innerHTML=`<div class="modal-header"><div><div class="eyebrow">${options.eyebrow || 'HANTERA DITT SCHEMA'}</div><h2>${title}</h2></div><button class="icon-btn" data-action="close-modal" aria-label="Stäng dialogrutan">${icon('close')}</button></div>${description?`<p class="modal-description">${description}</p>`:''}<form id="modal-form">${body}<p class="form-error" role="alert"></p><div class="modal-actions">${options.extra||''}<button class="secondary-btn" type="button" data-action="close-modal">Avbryt</button><button class="primary-btn" type="submit">${options.submit || 'Spara i utkast'}</button></div></form>`;
  $('#modal-form').onsubmit=async e=>{e.preventDefault();const button=e.submitter;button.disabled=true;try {await onSubmit(new FormData(e.target));dialog.close();}catch(err){$('.form-error',dialog).textContent=err.message;}finally{button.disabled=false;}};
  dialog.showModal();
}
async function save(next, message='Sparat i ditt utkast') {
  const errors=model.validateState(next); if(errors.length)throw new Error(errors[0]);
  if(ui.busy)throw new Error('En ändring sparas. Försök igen om en stund.');
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
    const notice=document.createElement('div');notice.className='info-card rotation-lock';notice.innerHTML=`${icon('check')}<p><strong>Den här versionen är publicerad.</strong> Skapa ett nytt grundschema för framtida ändringar. Tidigare scheman bevaras.</p><button class="text-button" data-action="new-rotation">Ny rotation ${icon('arrow')}</button>`;$('.rotation-panel').before(notice);
  }else {
    const button=document.createElement('button');button.className='text-button';button.dataset.action='version-dates';button.textContent='Ändra startdatum';$('.rotation-settings').append(button);
  }
  document.querySelectorAll('.position-select').forEach(select=>{
    const member=team.members.find(m=>m.id===select.dataset.member);
    if(member?.role==='part-time'){const option=document.createElement('option');option.value='0';option.textContent='Endast ersättningspass';select.prepend(option);if(!version.positions[member.id])select.value='0';}
  });
}
function versionDates() {
  const team=workingTeam(),version=editingVersion(team);if(versionPublished(version))throw new Error('Skapa ett nytt grundschema för att ändra en publicerad version.');
  modal('Välj grundschemats startdatum.','Startpositionerna gäller på referensmåndagen. Kontrollera dem när du ändrar datumen.',`<label>Gäller från måndag<input name="effective" type="date" value="${version.effectiveFrom}" required></label><label>Referensmåndag<input name="reference" type="date" value="${version.referenceMonday}" required></label>`,async f=>{const effective=f.get('effective'),reference=f.get('reference');if(model.mondayOf(effective)!==effective||model.mondayOf(reference)!==reference)throw new Error('Båda datumen måste vara måndagar.');if(team.versions.some(v=>v.id!==version.id&&v.effectiveFrom===effective))throw new Error('En annan version börjar redan det datumet.');const next=copy(),target=next.teams.find(t=>t.id===team.id).versions.find(v=>v.id===version.id);target.effectiveFrom=effective;target.referenceMonday=reference;await save(next,'Schemats datum har uppdaterats');});
}

function addTeam() {
  modal('Ett nytt team, ett eget schema.','Fyll sedan i passen och lägg till medarbetare.',`<label>Teamnamn<input name="name" placeholder="t.ex. Morgonteamet" required maxlength="60"></label><div class="form-grid"><label>Antal schemaveckor<input name="length" type="number" min="1" max="52" value="11" required></label><label>Börjar på måndag<input name="date" type="date" value="${model.mondayOf(ui.date)}" required></label></div><label class="checkbox-label"><input type="checkbox" name="copy"> Kopiera det nuvarande teamets grundschema</label>`,async f=>{
    const date=f.get('date');if(model.mondayOf(date)!==date)throw new Error('Välj en måndag som grundschemats startdatum.');
    const next=copy(), old=workingTeam(), length=Number(f.get('length')), template=old?.versions.at(-1) || model.seedState().teams[0].versions[0];
    const version={id:model.uid(),effectiveFrom:date,referenceMonday:date,rotation:Array.from({length},(_,i)=>f.has('copy')?[...(template.rotation[i%template.rotation.length])]:Array(7).fill('')),positions:{},shifts:structuredClone(template.shifts)};
    const team={id:model.uid(),name:f.get('name').trim(),color:'mint',members:[],versions:[version]};
    if(!team.name)throw new Error('Ange ett teamnamn.');next.teams.push(team);ui.teamId=team.id;ui.view='admin';ui.adminTab='rotation';editingVersionId=version.id;await save(next,'Teamet har lagts till. Fyll i grundschemat.');
  },{submit:'Skapa team'});
}
function personModal(memberId) {
  const team=workingTeam(), member=team.members.find(m=>m.id===memberId), version=editingVersion(team);
  modal(member?'Redigera medarbetare':'Lägg till en medarbetare.',member?'Ändringarna sparas i ditt utkast.':'Ange namn och startposition i grundschemat.',`<label>Namn<input name="name" value="${esc(member?.name||'')}" required maxlength="60" autocomplete="off"></label><div class="form-grid"><label>Roll<select name="role"><option value="member">Medarbetare</option><option value="part-time" ${member?.role==='part-time'?'selected':''}>Timvikarie</option></select></label><label>Börjar den<input name="from" type="date" value="${member?.activeFrom||ui.date}" required></label></div>${!member?`<label>Startposition den ${fmt(version.referenceMonday,{day:'numeric',month:'short',year:'numeric'})}<select name="position"><option value="0">Endast ersättningspass (timvikarie)</option>${version.rotation.map((_,i)=>`<option value="${i+1}" ${i===0?'selected':''}>Vecka ${i+1}</option>`).join('')}</select></label>`:''}${member?`<label>Tas bort från teamet från och med<input name="until" type="date" value="${member.activeUntil||''}"><small>Lämna tomt för att behålla medarbetaren. Tidigare scheman bevaras.</small></label>`:''}`,async f=>{
    const next=copy(), target=next.teams.find(t=>t.id===team.id), name=f.get('name').trim(), from=f.get('from'), until=f.get('until')||null;
    if(!name)throw new Error('Ange ett namn.');if(until&&until<=from)throw new Error('Slutdatumet måste vara efter startdatumet.');
    if(member)Object.assign(target.members.find(m=>m.id===member.id),{name,role:f.get('role'),activeFrom:from,activeUntil:until});
    else {const position=Number(f.get('position'));if(!position&&f.get('role')!=='part-time')throw new Error('Medarbetare med endast ersättningspass måste ha rollen Timvikarie.');const id=model.uid();target.members.push({id,name,role:f.get('role'),activeFrom:from,activeUntil:null});if(position)target.versions.forEach(v=>{const weeks=Math.round((Date.parse(v.referenceMonday)-Date.parse(version.referenceMonday))/604800000);v.positions[id]=((position-1+weeks)%v.rotation.length+v.rotation.length)%v.rotation.length+1;});}
    await save(next,member?'Medarbetaren har uppdaterats':'Medarbetaren har lagts till');
  });
}
function newRotation() {
  const team=workingTeam(), old=editingVersion(team), date=model.mondayOf(ui.date);
  modal('Anpassa ditt grundschema.','Skapa en ny version från en måndag. Tidigare datum behåller det gamla grundschemat.',`<div class="form-grid"><label>Gäller från måndag<input name="date" type="date" value="${date}" required></label><label>Antal veckor<input name="length" type="number" min="1" max="52" value="${old.rotation.length}" required></label></div><p class="field-note">Befintliga veckor kopieras. Nya veckor är tomma. Kontrollera varje medarbetares startposition före publicering.</p>`,async f=>{
    const from=f.get('date');if(model.mondayOf(from)!==from)throw new Error('Det nya grundschemat måste börja på en måndag.');if(team.versions.some(v=>v.effectiveFrom===from))throw new Error('En version börjar redan det här datumet. Välj en annan måndag eller redigera den versionen.');
    const next=copy(), target=next.teams.find(t=>t.id===team.id), version=model.createVersion(target,from,Number(f.get('length')));target.versions.push(version);target.versions.sort((a,b)=>a.effectiveFrom.localeCompare(b.effectiveFrom));editingVersionId=version.id;await save(next,'En ny rotation har skapats som utkast. Kontrollera startpositionerna.');
  },{submit:'Skapa schemautkast'});
}
function shiftModal(code) {
  const team=workingTeam(), version=editingVersion(team), shift=version.shifts[code];
  if(versionPublished(version))throw new Error('Skapa ett nytt grundschema för att ändra publicerade passtider.');
  modal(code?`Redigera pass ${esc(code)}`:'Lägg till ett pass','Välj passkod, tider och färg för den här schemaversionen.',`<label>Passkod<input name="code" value="${esc(code||'')}" required maxlength="6" ${code?'readonly':''} pattern="[A-Za-z0-9]+"></label><div class="form-grid"><label>Börjar<input name="start" type="time" value="${shift?.start||'07:00'}" required></label><label>Slutar<input name="end" type="time" value="${shift?.end||'16:00'}" required></label></div><label>Färg<select name="color">${['amber','mint','blue','lavender','purple','teal','rose','peach','sage'].map(c=>`<option value="${c}" ${shift?.color===c?'selected':''}>${colorLabel(c)}</option>`).join('')}</select></label><p class="field-note">Om sluttiden är tidigare än starttiden fortsätter passet nästa dag.</p>`,async f=>{
    const newCode=f.get('code').toUpperCase();if(!code&&version.shifts[newCode])throw new Error('Den här passkoden finns redan.');if(f.get('start')===f.get('end'))throw new Error('Start- och sluttid måste vara olika.');const next=copy(), target=next.teams.find(t=>t.id===team.id).versions.find(v=>v.id===version.id);target.shifts[newCode]={start:f.get('start'),end:f.get('end'),color:f.get('color')};await save(next,'Passet har sparats');
  });
}
function exceptionModal(options={}) {
  const team=workingTeam(), existing=workspace.working.exceptions.find(e=>e.id===options.id), memberId=existing?.memberId||options.memberId||currentMember(team)?.id;
  if(!team.members.length){toast('Lägg till en medarbetare först.',true);return;}
  const date=existing?.date||options.date||ui.date;
  const people=workspace.working.teams.flatMap(t=>t.members.filter(m=>!m.activeUntil||m.activeUntil>date).map(m=>({...m,teamName:t.name})));
  modal(existing?'Redigera individuell ändring':'En ändring för en medarbetare.','Grundschemat fortsätter som vanligt. Ändringen gäller bara de valda datumen.',`<label>Medarbetare<select name="member">${team.members.map(m=>`<option value="${esc(m.id)}" ${m.id===memberId?'selected':''}>${esc(m.name)}</option>`).join('')}</select></label><div class="form-grid"><label>${existing?'Datum':'Från datum'}<input name="date" type="date" value="${date}" required></label>${!existing?`<label>Till och med<input name="through" type="date" value="${date}" required></label>`:''}</div><label>Typ av ändring<select name="type" id="exception-type">${['vacation','sick','pension','custom','off'].map(t=>`<option value="${t}" ${existing?.type===t?'selected':''}>${label(t)}</option>`).join('')}</select></label><div class="form-grid adjusted-fields"><label>Arbetar från<input name="start" type="time" value="${existing?.start||''}"></label><label>Arbetar till<input name="end" type="time" value="${existing?.end||''}"></label></div><p class="field-note">Vid en kortare pensionsdag anger du de timmar personen ska arbeta. Lämna båda fälten tomma för en helt ledig dag.</p><label>Ersättare<select name="replacement"><option value="">Ingen ersättare</option>${people.map(m=>`<option value="${esc(m.id)}" ${m.id===existing?.replacementId?'selected':''}>${esc(m.name)} · ${esc(m.teamName)}</option>`).join('')}</select></label><div class="form-grid"><label>Ersätter från<input name="coverStart" type="time" value="${existing?.replacementStart||''}"></label><label>Ersätter till<input name="coverEnd" type="time" value="${existing?.replacementEnd||''}"></label></div><p class="field-note">Ange båda tiderna för att ersätta en del av passet. Lämna dem tomma för att ersätta hela det ordinarie passet. Överlappande pass tillåts inte.</p><label>Privat administratörsanteckning<textarea name="note" rows="2" maxlength="500" placeholder="Valfritt">${esc(existing?.note||'')}</textarea></label>`,async f=>{
    const next=copy(), from=f.get('date'), through=f.get('through')||from;
    if(through<from)throw new Error('Slutdatumet måste vara samma som eller efter startdatumet.');const span=Math.round((new Date(through)-new Date(from))/86400000);if(span>365)throw new Error('Välj ett datumintervall på högst ett år.');
    const type=f.get('type'), start=f.get('start'), end=f.get('end'), replacementId=f.get('replacement'), cs=f.get('coverStart'), ce=f.get('coverEnd');
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
  if(!existing){const fieldset=document.createElement('fieldset');fieldset.className='repeat-days';fieldset.innerHTML=`<legend>Gäller dessa veckodagar i datumintervallet</legend><div>${weekdayLabels.map((day,i)=>`<label><input name="days" type="checkbox" value="${i}" checked><span>${day}</span></label>`).join('')}</div><small>För återkommande pensionsdagar väljer du ett längre datumintervall och de aktuella veckodagarna.</small>`;$('#exception-type').closest('label').before(fieldset);}
}
function teamSettings() {
  const team=workingTeam();if(!team)return;
  modal('Teaminställningar','Ge teamet ett namn som medarbetarna känner igen.',`<label>Teamnamn<input name="name" value="${esc(team.name)}" required maxlength="60"></label>`,async f=>{const name=f.get('name').trim();if(!name)throw new Error('Ange ett teamnamn.');const next=copy();next.teams.find(t=>t.id===team.id).name=name;await save(next);});
}

function websiteUrl(value) {
  try { return new URL(value); } catch { throw new Error('Ange en giltig webbadress.'); }
}
function shareModal() {
  const team=workingTeam()||currentTeam();if(!team)return;
  const local=/^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  const base=local?(localStorage.getItem('skift-published-url')||''):location.origin+location.pathname;
  modal('En skanning. Hela veckan.',local?'Ange adressen till den publicerade webbplatsen för att skapa en QR-kod som medarbetarna kan skanna.':'Skriv ut koden för teamet. Den öppnar alltid den aktuella veckan.',`<label>Publicerad webbadress<input name="url" type="url" id="share-url" value="${esc(base)}" placeholder="https://dittnamn.github.io/ditt-repository/" required></label><div id="qr-output" class="qr-output"><span>Teamets QR-kod visas här.</span></div><p class="field-note">Team: ${esc(team.name)}. QR-koden innehåller bara länken till webbplatsen. Medarbetarna loggar in när teamet är anslutet.</p>`,async f=>{
    const url=websiteUrl(f.get('url'));if(!['https:','http:'].includes(url.protocol))throw new Error('Använd en webbadress som börjar med https://.');if(['localhost','127.0.0.1'].includes(url.hostname))throw new Error('Använd den publicerade adressen så att mobiler kan öppna den.');url.search='';url.searchParams.set('team',team.id);localStorage.setItem('skift-published-url',f.get('url'));drawQR(url.toString());
    try {await navigator.clipboard.writeText(url.toString());toast('Teamlänken har kopierats');}catch{toast('Teamlänken visas under koden.');}
  },{submit:'Kopiera teamlänk',eyebrow:'DELA TEAMETS SCHEMA'});
  const field=$('#share-url');field.addEventListener('input',()=>{try{const url=websiteUrl(field.value);if(!['https:','http:'].includes(url.protocol))return;url.search='';url.searchParams.set('team',team.id);drawQR(url.toString());}catch{$('#qr-output').textContent='Ange en fullständig webbadress.';}});
  if(base)field.dispatchEvent(new Event('input'));
  // Copying is a repeatable action; keep the dialog open for downloading or printing.
  $('#modal-form').onsubmit=async e=>{e.preventDefault();try{const url=websiteUrl(field.value);if(!['https:','http:'].includes(url.protocol)||['localhost','127.0.0.1'].includes(url.hostname))throw new Error('Ange den publicerade webbadressen först.');url.search='';url.searchParams.set('team',team.id);localStorage.setItem('skift-published-url',field.value);drawQR(url.toString());try{await navigator.clipboard.writeText(url.toString());toast('Teamlänken har kopierats');}catch{toast('Länken kunde inte kopieras. Kopiera teamlänken under QR-koden.');}}catch(error){$('.form-error',$('#modal')).textContent=error.message;}};
}
function drawQR(url) {
  const qr=qrcode(0,'M');qr.addData(url);qr.make();$('#qr-output').innerHTML=`${qr.createSvgTag({cellSize:5,margin:20,scalable:true})}<a href="${esc(url)}" target="_blank" rel="noopener">${esc(url)}</a><button class="secondary-btn" type="button" data-action="download-qr">${icon('download')} Ladda ner QR-kod</button>`;
  $('#qr-output svg').setAttribute('role','img');$('#qr-output svg').setAttribute('aria-label','QR-kod för teamets schema');
}
function download(content,type,name) {const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function setupModal() {
  modal('Redo att dela med teamet?','Demot fungerar på din enhet. Anslut en databas för att dela scheman säkert mellan mobiler.',`<ol class="setup-steps"><li>Lägg projektet i ett GitHub-repository och aktivera GitHub Pages.</li><li>Skapa ett Supabase-projekt och kör den medföljande databasinstallationen.</li><li>Lägg till projektets webbadress och publika nyckel i <strong>config.js</strong>.</li><li>Skapa ett administratörskonto och bjud sedan in medarbetare enligt installationsguiden.</li></ol><p class="field-note">Fullständiga instruktioner finns i README.md. Exportera en säkerhetskopia här och importera den sedan som utkast i den anslutna arbetsytan.</p>`,async()=>{}, {submit:'Jag förstår'});
}
function renderLogin(error='') {
  $('#app').innerHTML=`<main class="login-page"><a class="brand" href="./"><span class="brand-mark">${icon('calendar')}</span>skift<span class="brand-period">.</span></a><section class="login-card"><div class="eyebrow">DITT TEAM, SAMORDNAT</div><h1>Ditt nästa pass<br>börjar här.</h1><p>Logga in för att se ditt schema och vilka du ska arbeta med.</p><form id="login-form"><label>E-post<input name="email" type="email" autocomplete="username" required placeholder="du@exempel.se"></label><label>Lösenord<input name="password" type="password" autocomplete="current-password" required minlength="6"></label><p class="form-error" role="alert">${esc(error)}</p><button class="primary-btn" type="submit">Logga in ${icon('arrow')}</button></form><small>Din administratör skapar ditt konto. Kontakta administratören om du behöver åtkomst eller ett nytt lösenord.</small></section><p class="login-caption">Ett tydligt schema. En lugnare vecka.</p></main>`;
  $('#login-form').onsubmit=async e=>{e.preventDefault();e.submitter.disabled=true;const f=new FormData(e.target);try{workspace=await store.login(f.get('email'),f.get('password'));shell();}catch(err){renderLogin(err.message);}};
}
function bindRotationDrag() {
  let source;
  document.querySelectorAll('.rotation-table tbody tr').forEach(row=>{row.ondragstart=e=>{if(e.target.closest('select,button')){e.preventDefault();return;}source=Number(row.dataset.row);e.dataTransfer.effectAllowed='move';};row.ondragover=e=>{e.preventDefault();};row.ondrop=async e=>{e.preventDefault();const target=Number(row.dataset.row);if(source===undefined||source===target)return;await reorderRow(source,target);};});
}
async function reorderRow(from,to) {const next=copy(),team=next.teams.find(t=>t.id===workingTeam().id),v=editingVersion(team);if(versionPublished(v))throw new Error('Skapa ett nytt grundschema för att ändra ordningen på publicerade veckor.');const [row]=v.rotation.splice(from,1);v.rotation.splice(to,0,row);await save(next,'Veckornas ordning har ändrats i utkastet');}
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
    case 'delete-exception':if(admin()){const next=copy();next.exceptions=next.exceptions.filter(e=>e.id!==button.dataset.id);await save(next,'Ändringen har tagits bort');$('#modal').close();}break;
    case 'settings':if(admin())teamSettings();break;
    case 'share':shareModal();break;
    case 'setup':setupModal();break;
    case 'download-qr':{const svg=$('#qr-output svg');if(svg)download(new XMLSerializer().serializeToString(svg),'image/svg+xml',`skift-${workingTeam()?.name||'team'}-qr.svg`);break;}
    case 'preview':ui.previewDraft=true;ui.view='schedule';shell();break;
    case 'publish':if(admin()){
      const errors=model.validateState(workspace.working);if(errors.length)throw new Error(errors[0]);
      modal('Redo att publicera?','Publicering uppdaterar schemat som medarbetarna ser. Privata anteckningar och frånvaroorsaker visas bara i administrationsvyn.',`<div class="publish-overview">${workspace.working.teams.length} team · ${workspace.working.teams.reduce((n,t)=>n+t.members.filter(m=>!m.activeUntil||m.activeUntil>today()).length,0)} aktiva medarbetare</div>`,async()=>{workspace={...workspace,...await store.publish(workspace.working)};ui.previewDraft=false;shell();toast('Schemat har publicerats');},{submit:'Publicera schema'});
    }break;
    case 'export':if(admin())download(JSON.stringify(workspace.working,null,2),'application/json',`skift-backup-${today()}.json`);break;
    case 'move-row':if(admin())await reorderRow(Number(button.dataset.row),Number(button.dataset.row)+Number(button.dataset.dir));break;
    case 'logout':await store.logout();workspace=await store.init();shell();break;
    case 'refresh':if(!ui.busy){workspace=await store.init();shell();if(workspace.error)toast(workspace.error,true);else toast('Schemat har uppdaterats');}break;
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
    else if(target.classList.contains('rotation-cell')&&admin()){const next=copy(),team=next.teams.find(t=>t.id===workingTeam().id);editingVersion(team).rotation[Number(target.dataset.row)][Number(target.dataset.day)]=target.value;await save(next,'Passet har uppdaterats i utkastet');}
    else if(target.classList.contains('position-select')&&admin()){const next=copy(),team=next.teams.find(t=>t.id===workingTeam().id);if(versionPublished(editingVersion(team)))throw new Error('Skapa ett nytt grundschema för att ändra publicerade startpositioner.');if(Number(target.value))editingVersion(team).positions[target.dataset.member]=Number(target.value);else delete editingVersion(team).positions[target.dataset.member];await save(next,'Startpositionen har uppdaterats');}
    else if(target.id==='import-file'&&admin()&&target.files[0]){let state;try{state=JSON.parse(await target.files[0].text());}catch{throw new Error('Filen kunde inte läsas. Välj en giltig säkerhetskopia från Skift.');}const errors=model.validateState(state);if(errors.length)throw new Error(errors[0]);modal('Ersätta ditt arbetsutkast?','Det publicerade schemat är tillgängligt tills du publicerar det importerade utkastet.',`<p>${state.teams.length} team i säkerhetskopian.</p>`,async()=>{workspace={...workspace,...await store.importData(state)};ui.teamId=undefined;editingVersionId=undefined;shell();toast('Säkerhetskopian har importerats som utkast');},{submit:'Importera utkast'});}
  }catch(error){toast(error.message,true);shell();}
});
$('#modal').addEventListener('click',e=>{if(e.target===$('#modal')){const rect=e.target.getBoundingClientRect();if(e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom)e.target.close();}});
async function refreshSharedSchedule() {
  if(workspace?.mode!=='cloud'||workspace.role==='signed-out'||$('#modal').open||ui.busy)return;
  try {const fresh=await store.init();if(fresh.role==='signed-out'){workspace=fresh;shell();return;}if(fresh.error){toast(fresh.error,true);return;}if(fresh.revision!==workspace.revision||fresh.role!==workspace.role){workspace=fresh;shell();toast('Ditt schema är uppdaterat');}}catch(error){toast(error.message,true);}
}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refreshSharedSchedule();});
setInterval(()=>{if(document.visibilityState==='visible')refreshSharedSchedule();},60000);
try {workspace=await store.init();shell();if(workspace.error&&workspace.role!=='signed-out')toast(workspace.error,true);}catch(error){$('#app').innerHTML=`<main class="error-page">${icon('info')}<h1>Vi kunde inte öppna din arbetsyta.</h1><p>${esc(error.message)}</p><button class="primary-btn" onclick="location.reload()">Försök igen</button></main>`;}

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
const colorLabel = color => ({amber:'Bärnsten',mint:'Mintgrön',blue:'Blå',lavender:'Lavendel',purple:'Lila',teal:'Turkos',rose:'Rosa',peach:'Persika',sage:'Salviagrön'}[color] || color);
const initials = name => name.split(/\s+/).map(w => w[0]).slice(0,2).join('').toUpperCase();
const avatar = (member, i = 0, small = false) => `<span class="avatar tone-${i % 5} ${small ? 'small' : ''}" title="${esc(member.name)}">${esc(initials(member.name))}</span>`;
const urlParams = new URLSearchParams(location.search);
const ui = {view:'schedule',date:urlParams.get('date') && /^\d{4}-\d{2}-\d{2}$/.test(urlParams.get('date')) && !isNaN(Date.parse(urlParams.get('date'))) ? urlParams.get('date') : today(), teamId:urlParams.get('team') || localStorage.getItem('skift-team'),memberId:localStorage.getItem('skift-person'),adminTab:'people',editingSchedule:false,busy:false};
let workspace;
let adminUnlocked = false;
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
const label = (value) => ({vacation:'Semester',sick:'Sjukfrånvaro',pension:'Pensionsdag',custom:'Anpassat pass',off:'Ledig',cover:'Ersättningspass',shift:'Arbetar'}[value] || value);

function normalizeSelection() {
  const team = currentTeam();
  ui.teamId = team?.id;
  ui.memberId = team ? currentMember(team)?.id : undefined;
}
function toast(message, error = false) {
  const el = $('#toast'); el.textContent = message; el.className = `toast visible ${error ? 'error' : ''}`;
  clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove('visible'), 4500);
}
function shell() {
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
  if (ui.view === 'admin' && ui.adminTab === 'rotation' && team) { setupRotationAdmin(); bindRotationDrag(); }
}

function dateRange() {
  const days = model.weekDates(ui.date);
  return `${fmt(days[0],{day:'numeric',month:'short'})} – ${fmt(days[6],{day:'numeric',month:'short',year:'numeric'})}`;
}
function heading(team, teams) {
  const opts = teams.map(t=>`<option value="${esc(t.id)}" ${t.id===team.id?'selected':''}>${esc(t.name)}</option>`).join('');
  const teamTitle = `<div class="heading-team"><span class="heading-team-icon">${icon('team')}</span><span class="heading-team-label">${esc(team.name)}</span>${icon('down','heading-team-chevron')}<select id="team-select" aria-label="Välj team">${opts}</select></div>`;
  return `<div class="page-heading"><div>${teamTitle}</div></div>
  <div class="schedule-toolbar"><div class="date-navigation"><button class="icon-btn" data-action="navigate" data-step="-1" aria-label="Föregående vecka">${icon('left')}</button><strong>${dateRange()}</strong><button class="icon-btn" data-action="navigate" data-step="1" aria-label="Nästa vecka">${icon('right')}</button><button class="today-btn" data-action="today">Idag</button></div><div class="view-controls"><label class="date-picker" title="Gå till ett datum">${icon('calendar')}<span>Välj datum</span><input id="jump-date" type="date" value="${ui.date}" aria-label="Gå till ett datum"></label></div></div>
  ${admin() && ui.editingSchedule ? `<div class="published-label"><span class="draft-dot"></span>Redigerar schema</div>` : ''}`;
}

function scheduleView() {
  const team=currentTeam();
  const teams=data()?.teams || [];
  return heading(team, teams) + rosterView(team);
}
function hours(minutes) { return new Intl.NumberFormat('sv-SE',{maximumFractionDigits:1}).format(minutes / 60); }
function colorFor(team,date,code) { return model.activeVersion(team,date)?.shifts[code]?.color || 'mint'; }
function rosterView(team) {
  const state=data(), dates=model.weekDates(ui.date), editable=admin()&&ui.editingSchedule;
  const assignments=Object.fromEntries(dates.map(d=>[d,model.getDayAssignments(state,team.id,d)]));
  const home=team.members.filter(m=>(!m.activeUntil||m.activeUntil>dates[0])&&m.activeFrom<=dates[6]);
  const visitors=[...new Set(Object.values(assignments).flat().map(s=>s.memberId))].filter(id=>!home.some(m=>m.id===id)).map(findMember).filter(Boolean);
  const members=[...home,...visitors], version=model.activeVersion(team,ui.date);
  const todayAssignments = assignments[today()];
  if (todayAssignments) {
    const firstStarts = new Map();
    for (const shift of todayAssignments) {
      if (shift.start && (!firstStarts.has(shift.memberId) || shift.start < firstStarts.get(shift.memberId))) {
        firstStarts.set(shift.memberId, shift.start);
      }
    }
    members.sort((a, b) => (firstStarts.get(a.id) || '99:99').localeCompare(firstStarts.get(b.id) || '99:99'));
  }
  const control=(text,kind,member,date,canEdit)=>{
    if(!text)return '';
    return canEdit?'<button class="roster-control '+kind+'" data-action="roster-edit" data-member="'+esc(member.id)+'" data-date="'+date+'" aria-label="'+(kind==='status'?'Status':'Ersättare')+' för '+esc(member.name)+', '+fmt(date,{day:'numeric',month:'long'})+'"><span>'+esc(text)+'</span>'+icon('edit')+'</button>':'<span class="roster-value '+kind+'">'+esc(text)+'</span>';
  };
  const rows=members.map((m,i)=>{
    const isHome=home.some(p=>p.id===m.id), position=isHome&&version?model.rotationPosition(version,m.id,ui.date):0;
    const cells=dates.map(d=>({date:d,shifts:assignments[d].filter(a=>a.memberId===m.id),exception:state.exceptions.find(e=>e.teamId===team.id&&e.memberId===m.id&&e.date===d),main:isHome?model.getShift(state,team.id,m.id,d):null,active:isHome&&m.activeFrom<=d&&(!m.activeUntil||m.activeUntil>d)}));
    const shiftCells=cells.map(c=>{
      const isToday=c.date===today();
      const editAttr=(editable&&c.active)?' data-action="roster-edit" data-member="'+esc(m.id)+'" data-date="'+c.date+'" role="button" tabindex="0" title="Ändra pass för '+esc(m.name)+', '+fmt(c.date,{day:'numeric',month:'short'})+'"':'';
      const offText=c.exception?label(c.exception.type):(c.active?'Ledig':isHome?'Ej aktiv':'Inget pass');
      const content=c.shifts.length?c.shifts.map(a=>'<div class="roster-shift '+esc(a.color||colorFor(team,c.date,a.code))+'"><b>'+esc(a.code||'↗')+(a.type==='cover'?' ↗':'')+'</b><span>'+a.start+'–'+a.end+'</span></div>').join(''):'<div class="roster-off">'+(c.exception&&c.main?.code?'<s>'+esc(c.main.code)+'</s>':'—')+'<span>'+offText+'</span></div>';
      return '<td class="'+(isToday?'roster-today':'')+(editable&&c.active?' roster-editable':'')+'"'+editAttr+'>'+content+'</td>';
    }).join('');

    const hasAnyStatus=cells.some(c=>c.exception||c.shifts.some(a=>a.type==='cover'));
    const hasAnyReplacement=cells.some(c=>c.exception?.replacementId||(editable&&c.main?.needsCoverage));

    const statuses=cells.map(c=>{
      const text=c.exception?label(c.exception.type):c.shifts.some(a=>a.type==='cover')?'Ersättningspass':'';
      return '<td>'+control(text,'status',m,c.date,editable&&c.active)+'</td>';
    }).join('');

    const replacements=cells.map(c=>{
      const replacement=c.exception?.replacementId?findMember(c.exception.replacementId):null;
      const text=replacement?.name||(editable&&c.main?.needsCoverage?'Behövs':'');
      const time=replacement?'<small class="roster-cover-time">'+(c.exception.replacementStart||c.main?.originalStart||'')+'–'+(c.exception.replacementEnd||c.main?.originalEnd||'')+'</small>':'';
      return '<td>'+(text?control(text,'replacement',m,c.date,editable&&c.active)+time:'')+'</td>';
    }).join('');

    let metaRows='';
    if(hasAnyStatus&&hasAnyReplacement){
      metaRows='<tr class="roster-meta"><th scope="row">Status</th>'+statuses+'</tr><tr class="roster-meta roster-last"><th scope="row">Ersättare</th>'+replacements+'</tr>';
    }else if(hasAnyStatus){
      metaRows='<tr class="roster-meta roster-last"><th scope="row">Status</th>'+statuses+'</tr>';
    }else if(hasAnyReplacement){
      metaRows='<tr class="roster-meta roster-last"><th scope="row">Ersättare</th>'+replacements+'</tr>';
    }

    const shiftRowClass=metaRows?'roster-shifts':'roster-shifts roster-last';
    return '<tbody class="roster-person"><tr class="'+shiftRowClass+'"><th scope="row" class="roster-name"><div class="roster-person-label">'+avatar(m,i,true)+'<span>'+esc(m.name)+(position?'':'<small>'+(isHome?'Timvikarie':'Gästande ersättare')+'</small>')+'</span></div></th>'+shiftCells+'</tr>'+metaRows+'</tbody>';
  }).join('');
  return '<section class="roster-panel"><div class="roster-scroll" tabindex="0" role="region" aria-label="Teamets veckoschema, rulla i sidled för fler dagar"><table class="roster-table"><caption class="sr-only">'+esc(team.name)+', kalendervecka '+model.isoWeek(ui.date).week+'</caption><colgroup><col class="roster-name-col">'+dates.map(()=>'<col>').join('')+'</colgroup><thead><tr><th scope="col" class="roster-corner">Medarbetare<span>Vecka '+model.isoWeek(ui.date).week+'</span></th>'+dates.map((d,i)=>'<th scope="col" class="'+(d===today()?'roster-today':'')+' '+(i>4?'roster-weekend':'')+'"><span>'+weekdayNames[i]+'</span><strong>'+fmt(d,{day:'numeric',month:'short'})+'</strong>'+(d===today()?'<small>Idag</small>':'')+'</th>').join('')+'</tr></thead>'+rows+'</table></div></section>';
}
const findMember = id => (ui.view==='admin'?workspace.working?.teams:data()?.teams || []).flatMap(t=>t.members).find(m=>m.id===id);

function empty(title,description,action,button) { return `<div class="empty-state">${icon('calendar')}<h2>${title}</h2><p>${description}</p>${action?`<button class="primary-btn" data-action="${action}">${button}</button>`:''}</div>`; }
function emptyWorkspace() {return empty('Din arbetsyta är redo','Lägg till ditt första team och fyll i schemat. Sparade ändringar visas direkt för medarbetarna.',admin()?'add-team':null,'Lägg till ett team');}
function adminView() {
  const teams=workspace.working.teams, team=teams.find(t=>t.id===ui.teamId)||teams[0];
  const tabs=[['people','Medarbetare'],['rotation','Grundschema'],['changes','Ändringar']];
  return `<div class="page-heading admin-heading"><div><h1>Ett schema som passar.</h1><p>Hantera teamets grundschema och individuella ändringar.</p></div></div><div class="admin-status">${icon('edit')}<span>Sparade ändringar publiceras automatiskt.</span><button class="text-button" data-action="edit-schedule">Redigera veckan ${icon('arrow')}</button></div><div class="admin-toolbar"><label>Team<select id="admin-team-select">${teams.map(t=>`<option value="${esc(t.id)}" ${t.id===team?.id?'selected':''}>${esc(t.name)}</option>`).join('')}</select></label><button class="secondary-btn" data-action="add-team">${icon('plus')} Lägg till team</button><button class="icon-btn" data-action="settings" aria-label="Teaminställningar" ${!team?'disabled':''}>${icon('settings')}</button></div>${team?`<div class="admin-tabs" role="tablist">${tabs.map(([id,name])=>`<button role="tab" aria-selected="${ui.adminTab===id}" class="${ui.adminTab===id?'active':''}" data-action="admin-tab" data-tab="${id}">${name}${id==='changes'?`<span>${workspace.working.exceptions.filter(e=>e.teamId===team.id).length}</span>`:''}</button>`).join('')}</div>${ui.adminTab==='people'?peopleAdmin(team):ui.adminTab==='rotation'?rotationAdmin(team):changesAdmin(team)}`:emptyWorkspace()}<div class="backup-bar"><span>${icon('download')} Spara en kopia av ditt schema.</span><button class="text-button" data-action="export">Exportera säkerhetskopia</button><label class="text-button import-label">Importera säkerhetskopia<input id="import-file" type="file" accept="application/json,.json"></label></div>`;
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
  const currentMon=model.mondayOf(today());
  const refMon=version.referenceMonday;
  const isCurrentWeek=refMon===currentMon;
  const weeksPassed=Math.round((Date.parse(currentMon)-Date.parse(refMon))/604800000);
  return `<section class="admin-panel rotation-panel"><div class="panel-heading"><div><h2>Det återkommande grundschemat</h2><p>Välj ett pass i varje ruta. En tom ruta betyder ledig.</p></div><button class="secondary-btn" data-action="new-rotation">${icon('plus')} Ny rotation</button></div><div class="rotation-settings"><label>Schemaversion<select id="version-select">${[...team.versions].sort((a,b)=>a.effectiveFrom.localeCompare(b.effectiveFrom)).map(v=>`<option value="${esc(v.id)}" ${v.id===version.id?'selected':''}>Från ${v.effectiveFrom} · ${weeksLabel(v.rotation.length)}</option>`).join('')}</select></label><div class="reference-monday-control"><label for="reference-monday-input">Startmåndag (referensvecka)<div class="reference-monday-input-wrap"><input id="reference-monday-input" type="date" value="${version.referenceMonday}" title="Välj startmåndag"><button type="button" class="secondary-btn sync-week-btn" data-action="sync-reference-today" title="Sätt startmåndag till nuvarande vecka">${isCurrentWeek?'✓ Denna vecka':`Sätt till denna vecka (v. ${model.isoWeek(today()).week})`}</button></div></label><span class="reference-monday-caption">Vecka ${model.isoWeek(refMon).week} (${fmt(refMon,{day:'numeric',month:'short',year:'numeric'})}) ${weeksPassed!==0?`· ${weeksPassed>0?`${weeksPassed} v sedan start`:`om ${Math.abs(weeksPassed)} v`}`:'· Nuvarande vecka'}</span></div><div><span>Antal schemaveckor</span><strong>${weeksLabel(version.rotation.length)}</strong></div><button class="text-button" data-action="version-dates" title="Gäller från måndag m.m.">Fler datuminställningar</button></div><div class="rotation-scroll"><table class="rotation-table"><thead><tr><th>Vecka</th>${weekdayLabels.map(d=>`<th>${d}</th>`).join('')}<th></th></tr></thead><tbody>${version.rotation.map((row,i)=>`<tr draggable="true" data-row="${i}"><th><span class="drag-handle" title="Dra för att ändra ordning">⠿</span> ${i+1}</th>${row.map((code,j)=>`<td><select class="rotation-cell ${version.shifts[code]?.color || ''}" data-row="${i}" data-day="${j}" aria-label="Vecka ${i+1}, ${weekdayNames[j]}"><option value="">—</option>${Object.keys(version.shifts).map(c=>`<option value="${esc(c)}" ${c===code?'selected':''}>${esc(c)}</option>`).join('')}</select></td>`).join('')}<td><button class="icon-btn row-move" data-action="move-row" data-row="${i}" data-dir="-1" aria-label="Flytta vecka ${i+1} uppåt" ${i===0?'disabled':''}>↑</button><button class="icon-btn row-move" data-action="move-row" data-row="${i}" data-dir="1" aria-label="Flytta vecka ${i+1} nedåt" ${i===version.rotation.length-1?'disabled':''}>↓</button></td></tr>`).join('')}</tbody></table></div><div class="rotation-footnote">${icon('info')} På mobilen kan du svepa tabellen i sidled. Använd pilarna för att ändra veckornas ordning.</div></section><section class="admin-panel"><div class="panel-heading"><div><h2>Startpositioner & Veckorotation</h2><p>Varje medarbetares schemavecka den ${fmt(version.referenceMonday,{day:'numeric',month:'short',year:'numeric'})} (v. ${model.isoWeek(version.referenceMonday).week}).</p></div><div class="rotation-shift-actions"><span class="shift-hint">Flytta teamets vecka:</span><div class="button-group"><button type="button" class="secondary-btn shift-btn" data-action="shift-team-rotation" data-step="-1" title="Flytta alla medarbetares rotation 1 vecka bakåt">◀ -1 vecka</button><button type="button" class="secondary-btn shift-btn" data-action="shift-team-rotation" data-step="1" title="Flytta alla medarbetares rotation 1 vecka framåt">+1 vecka ▶</button></div></div></div><div class="positions-list">${team.members.map((m,i)=>`<div class="position-row">${avatar(m,i,true)}<div class="position-info"><strong>${esc(m.name)}</strong></div><select class="position-select" data-member="${esc(m.id)}" aria-label="Startvecka för ${esc(m.name)}">${m.role==='part-time'?`<option value="0" ${!version.positions[m.id]?'selected':''}>Endast ersättningspass</option>`:''}${version.rotation.map((_,j)=>`<option value="${j+1}" ${Number(version.positions[m.id])===j+1?'selected':''}>Vecka ${j+1}</option>`).join('')}</select></div>`).join('')}</div></section><section class="admin-panel"><div class="panel-heading"><div><h2>Passtider</h2><p>Tiderna gäller för den här schemaversionen.</p></div><button class="secondary-btn" data-action="add-shift">${icon('plus')} Lägg till pass</button></div><div class="shift-definitions">${Object.entries(version.shifts).map(([code,s])=>`<button data-action="edit-shift" data-code="${esc(code)}"><span class="code-badge ${esc(s.color)}">${esc(code)}</span><strong>${s.start}–${s.end}</strong>${icon('edit')}</button>`).join('')}</div></section>`;
}
function changesAdmin(team) {
  const changes=workspace.working.exceptions.filter(e=>e.teamId===team.id).sort((a,b)=>b.date.localeCompare(a.date));
  return `<section class="admin-panel"><div class="panel-heading"><div><h2>Individuella ändringar</h2><p>Frånvaro, kortare arbetstid och ersättningspass.</p></div><button class="secondary-btn" data-action="exception">${icon('plus')} Lägg till ändring</button></div>${changes.length?`<div class="changes-list">${changes.map(e=>{const shift=model.getShift(workspace.working,team.id,e.memberId,e.date);return `<button class="change-row" data-action="edit-exception" data-id="${esc(e.id)}"><span class="change-date">${fmt(e.date,{day:'numeric',month:'short'})}<small>${e.date.slice(0,4)}</small></span><div><strong>${esc(findMember(e.memberId)?.name || 'Tidigare medarbetare')}</strong><span>${label(e.type)}${e.start&&e.end?' · '+e.start+'–'+e.end:''}${e.replacementId?' · Ersätts av '+esc(findMember(e.replacementId)?.name||'Medarbetare'):''}</span>${shift.needsCoverage?`<small class="coverage-warning">${hours(shift.uncoveredMinutes||0)} timmar behöver ersättare</small>`:''}</div>${icon('edit')}</button>`;}).join('')}</div>`:empty('Inga individuella ändringar','Lägg till en ändring när någon är frånvarande eller behöver andra arbetstider.')}</section><div class="info-card">${icon('info')}<p><strong>Frånvaroorsaker är privata.</strong> Publicerade scheman visar arbetstider och lediga dagar. Dina anteckningar och frånvaroorsaker visas bara i administrationsvyn.</p></div>`;
}

function modal(title,description,body,onSubmit,options={}) {
  const dialog=$('#modal');
  dialog.innerHTML=`<div class="modal-header"><div><h2>${title}</h2></div><button class="icon-btn" data-action="close-modal" aria-label="Stäng dialogrutan">${icon('close')}</button></div>${description?`<p class="modal-description">${description}</p>`:''}<form id="modal-form">${body}<p class="form-error" role="alert"></p><div class="modal-actions">${options.extra||''}<button class="secondary-btn" type="button" data-action="close-modal">Avbryt</button><button class="primary-btn" type="submit">${options.submit || 'Spara'}</button></div></form>`;
  $('#modal-form').onsubmit=async e=>{e.preventDefault();const button=e.submitter;button.disabled=true;try {await onSubmit(new FormData(e.target));dialog.close();}catch(err){$('.form-error',dialog).textContent=err.message;}finally{button.disabled=false;}};
  dialog.showModal();
}
async function save(next, message='Ändringarna har sparats') {
  if(!admin())throw new Error('Lås upp Hantera innan du gör ändringar.');
  const errors=model.validateState(next); if(errors.length)throw new Error(errors[0]);
  if(ui.busy)throw new Error('En ändring sparas. Försök igen om en stund.');
  ui.busy=true;
  try{const result=await store.publish(next);workspace={...workspace,...result};ui.busy=false;shell();toast(message);}finally{ui.busy=false;}
}
const workingTeam = () => workspace.working.teams.find(t=>t.id===ui.teamId)||workspace.working.teams[0];
const editingVersion = team => team.versions.find(v=>v.id===editingVersionId)||team.versions.at(-1);
const copy = () => structuredClone(workspace.working);
function setupRotationAdmin() {
  const team=workingTeam(), version=editingVersion(team);
  document.querySelectorAll('.position-select').forEach(select=>{
    const member=team.members.find(m=>m.id===select.dataset.member);
    if(member?.role==='part-time'&&!select.querySelector('option[value="0"]')){const option=document.createElement('option');option.value='0';option.textContent='Endast ersättningspass';select.prepend(option);if(!version.positions[member.id])select.value='0';}
  });
}
function versionDates() {
  const team=workingTeam(),version=editingVersion(team);
  modal('Välj grundschemats startdatum.','Startpositionerna gäller på referensmåndagen. Kontrollera dem när du ändrar datumen.',`<label>Gäller från måndag<input name="effective" type="date" value="${version.effectiveFrom}" required></label><label>Referensmåndag<input name="reference" type="date" value="${version.referenceMonday}" required></label>`,async f=>{const effective=model.mondayOf(f.get('effective')),reference=model.mondayOf(f.get('reference'));if(team.versions.some(v=>v.id!==version.id&&v.effectiveFrom===effective))throw new Error('En annan version börjar redan det datumet.');const next=copy(),target=next.teams.find(t=>t.id===team.id).versions.find(v=>v.id===version.id);target.effectiveFrom=effective;target.referenceMonday=reference;await save(next,'Schemats datum har uppdaterats');});
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
  modal(member?'Redigera medarbetare':'Lägg till en medarbetare.',member?'Ändringarna publiceras när du sparar.':'Ange namn och startposition i grundschemat.',`<label>Namn<input name="name" value="${esc(member?.name||'')}" required maxlength="60" autocomplete="off"></label><div class="form-grid"><label>Roll<select name="role"><option value="member">Medarbetare</option><option value="part-time" ${member?.role==='part-time'?'selected':''}>Timvikarie</option></select></label><label>Börjar den<input name="from" type="date" value="${member?.activeFrom||ui.date}" required></label></div>${!member?`<label>Startposition den ${fmt(version.referenceMonday,{day:'numeric',month:'short',year:'numeric'})}<select name="position"><option value="0">Endast ersättningspass (timvikarie)</option>${version.rotation.map((_,i)=>`<option value="${i+1}" ${i===0?'selected':''}>Vecka ${i+1}</option>`).join('')}</select></label>`:''}${member?`<label>Tas bort från teamet från och med<input name="until" type="date" value="${member.activeUntil||''}"><small>Lämna tomt för att behålla medarbetaren. Tidigare scheman bevaras.</small></label>`:''}`,async f=>{
    const next=copy(), target=next.teams.find(t=>t.id===team.id), name=f.get('name').trim(), from=f.get('from'), until=f.get('until')||null;
    if(!name)throw new Error('Ange ett namn.');if(until&&until<=from)throw new Error('Slutdatumet måste vara efter startdatumet.');
    if(member)Object.assign(target.members.find(m=>m.id===member.id),{name,role:f.get('role'),activeFrom:from,activeUntil:until});
    else {const position=Number(f.get('position'));if(!position&&f.get('role')!=='part-time')throw new Error('Medarbetare med endast ersättningspass måste ha rollen Timvikarie.');const id=model.uid();target.members.push({id,name,role:f.get('role'),activeFrom:from,activeUntil:null});if(position)target.versions.forEach(v=>{const weeks=Math.round((Date.parse(v.referenceMonday)-Date.parse(version.referenceMonday))/604800000);v.positions[id]=((position-1+weeks)%v.rotation.length+v.rotation.length)%v.rotation.length+1;});}
    await save(next,member?'Medarbetaren har uppdaterats':'Medarbetaren har lagts till');
  });
}
function newRotation() {
  const team=workingTeam(), old=editingVersion(team), date=model.mondayOf(ui.date);
  modal('Anpassa ditt grundschema.','Skapa en ny version från en måndag. Tidigare datum behåller det gamla grundschemat.',`<div class="form-grid"><label>Gäller från måndag<input name="date" type="date" value="${date}" required></label><label>Antal veckor<input name="length" type="number" min="1" max="52" value="${old.rotation.length}" required></label></div><p class="field-note">Befintliga veckor kopieras. Nya veckor är tomma. Den nya rotationen publiceras direkt när du skapar den.</p>`,async f=>{
    const from=f.get('date');if(model.mondayOf(from)!==from)throw new Error('Det nya grundschemat måste börja på en måndag.');if(team.versions.some(v=>v.effectiveFrom===from))throw new Error('En version börjar redan det här datumet. Välj en annan måndag eller redigera den versionen.');
    const next=copy(), target=next.teams.find(t=>t.id===team.id), version=model.createVersion(target,from,Number(f.get('length')));target.versions.push(version);target.versions.sort((a,b)=>a.effectiveFrom.localeCompare(b.effectiveFrom));editingVersionId=version.id;await save(next,'En ny rotation har skapats. Kontrollera startpositionerna.');
  },{submit:'Skapa schema'});
}
function shiftModal(code) {
  const team=workingTeam(), version=editingVersion(team), shift=version.shifts[code];
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
  modal('Teaminställningar','Ändra teamets namn eller ta bort teamet.',`<label>Teamnamn<input name="name" value="${esc(team.name)}" required maxlength="60"></label>`,async f=>{const name=f.get('name').trim();if(!name)throw new Error('Ange ett teamnamn.');const next=copy();next.teams.find(t=>t.id===team.id).name=name;await save(next);},{extra:'<button type="button" class="danger-text" data-action="delete-team">Ta bort team</button>'});
}
function deleteTeamModal() {
  const team=workingTeam();if(!team)return;
  modal('Ta bort team?', 'Teamet tas bort från schemat direkt när du bekräftar.',
    `<p><strong>${esc(team.name)}</strong> och dess ${team.members.length} medarbetare, alla grundscheman och individuella ändringar tas bort, inklusive historik. Ersättningspass som teamets medarbetare har i andra team tas också bort.</p>`,
    async()=>{
      const next=model.deleteTeam(workspace.working,team.id);
      await save(next,'Teamet har tagits bort');
      editingVersionId=undefined;
    },{submit:'Ta bort team'});
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
async function reorderRow(from,to) {const next=copy(),team=next.teams.find(t=>t.id===workingTeam().id),v=editingVersion(team);const [row]=v.rotation.splice(from,1);v.rotation.splice(to,0,row);await save(next,'Veckornas ordning har ändrats');}
function openAdmin() {
  if (!hasAdminRole()) return;
  const enter = () => { ui.view='admin'; shell(); window.scrollTo({top:0,behavior:'smooth'}); };
  if (adminUnlocked) { enter(); return; }
  // A local UI lock. Cloud authorization is still enforced by the server role.
  modal('Öppna Hantera','Ange lösenordet för att hantera schemat.',
    '<label>Lösenord<input name="password" type="password" autocomplete="current-password" required autofocus></label>',
    async form => {
      if (form.get('password') !== 'lirrydoz') throw new Error('Fel lösenord. Försök igen.');
      if (!hasAdminRole()) throw new Error('Du saknar behörighet att hantera schemat.');
      adminUnlocked = true;
      enter();
    }, {submit:'Öppna Hantera'});
}
async function handleAction(button) {
  const action=button.dataset.action;
  switch(action) {
    case 'roster-edit':if(admin()&&ui.editingSchedule){const existing=workspace.working.exceptions.find(e=>e.teamId===currentTeam().id&&e.memberId===button.dataset.member&&e.date===button.dataset.date);exceptionModal({id:existing?.id,memberId:button.dataset.member,date:button.dataset.date});}break;
    case 'view': if(button.dataset.view==='admin'){openAdmin();break;}ui.view='schedule';ui.editingSchedule=false;adminUnlocked=false;shell();window.scrollTo({top:0,behavior:'smooth'});break;
    case 'admin':openAdmin();break;
    case 'navigate': ui.date=model.addDays(ui.date,Number(button.dataset.step)*7);shell();break;
    case 'today':ui.date=today();shell();break;
    case 'admin-tab':if(admin()){ui.adminTab=button.dataset.tab;shell();}break;
    case 'close-modal':$('#modal').close();break;
    case 'add-team':if(admin())addTeam();break;
    case 'add-person':if(admin())personModal();break;
    case 'edit-person':if(admin())personModal(button.dataset.member);break;
    case 'new-rotation':if(admin())newRotation();break;
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
    case 'move-row':if(admin())await reorderRow(Number(button.dataset.row),Number(button.dataset.row)+Number(button.dataset.dir));break;
    case 'logout':adminUnlocked=false;ui.editingSchedule=false;ui.view='schedule';await store.logout();workspace=await store.init();shell();break;
    case 'refresh':if(!ui.busy){workspace=await store.refresh();shell();if(workspace.error)toast(workspace.error,true);else toast('Schemat har uppdaterats');}break;
  }
}
document.addEventListener('click',async e=>{const button=e.target.closest('[data-action]');if(!button||button.disabled)return;try{await handleAction(button);}catch(error){toast(error.message,true);}});
document.addEventListener('change',async e=>{
  const target=e.target;
  try {
    if(['team-select','admin-team-select'].includes(target.id)){ui.teamId=target.value;editingVersionId=undefined;localStorage.setItem('skift-team',ui.teamId);shell();}
    else if(target.id==='jump-date'){if(target.value){ui.date=target.value;shell();}}
    else if(target.id==='version-select'){editingVersionId=target.value;shell();}
    else if(target.id==='reference-monday-input'&&admin()){
      if(target.value){
        const monday=model.mondayOf(target.value);
        target.value=monday;
        const next=copy(),team=next.teams.find(t=>t.id===workingTeam().id),v=editingVersion(team);
        if(v.referenceMonday!==monday){
          v.referenceMonday=monday;
          await save(next,`Startmåndag ändrad till ${monday} (v. ${model.isoWeek(monday).week})`);
        }
      }
    }
    else if(target.classList.contains('rotation-cell')&&admin()){const next=copy(),team=next.teams.find(t=>t.id===workingTeam().id);editingVersion(team).rotation[Number(target.dataset.row)][Number(target.dataset.day)]=target.value;await save(next,'Passet har uppdaterats');}
    else if(target.classList.contains('position-select')&&admin()){const next=copy(),team=next.teams.find(t=>t.id===workingTeam().id);if(Number(target.value))editingVersion(team).positions[target.dataset.member]=Number(target.value);else delete editingVersion(team).positions[target.dataset.member];await save(next,'Startpositionen har uppdaterats');}
    else if(target.id==='import-file'&&admin()&&target.files[0]){let state;try{state=JSON.parse(await target.files[0].text());}catch{throw new Error('Filen kunde inte läsas. Välj en giltig säkerhetskopia från RSSB.');}const errors=model.validateState(state);if(errors.length)throw new Error(errors[0]);modal('Ersätta schemat?','Säkerhetskopian ersätter det aktuella schemat och publiceras direkt när du bekräftar.',`<p>${state.teams.length} team i säkerhetskopian.</p>`,async()=>{await save(state,'Säkerhetskopian har importerats');ui.teamId=undefined;editingVersionId=undefined;shell();},{submit:'Importera schema'});}
  }catch(error){toast(error.message,true);shell();}
});
$('#modal').addEventListener('click',e=>{if(e.target===$('#modal')){const rect=e.target.getBoundingClientRect();if(e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom)e.target.close();}});
let refreshingSchedule = false;
async function refreshSharedSchedule() {
  const canApply=()=>Boolean(workspace)&&workspace.role!=='signed-out'&&!$('#modal').open&&!ui.busy;
  if(refreshingSchedule||!canApply())return;
  refreshingSchedule=true;
  try {const fresh=await store.refresh({canApply});if(!canApply())return;if(fresh.role==='signed-out'){workspace=fresh;shell();return;}if(fresh.error){toast(fresh.error,true);return;}if(fresh.revision!==workspace.revision||fresh.role!==workspace.role||JSON.stringify(fresh.published)!==JSON.stringify(workspace.published)||JSON.stringify(fresh.working)!==JSON.stringify(workspace.working)){workspace=fresh;shell();toast('Ditt schema är uppdaterat');}}catch(error){toast(error.message,true);}finally{refreshingSchedule=false;}
}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refreshSharedSchedule();});
window.addEventListener('focus',refreshSharedSchedule);
window.addEventListener('pageshow',refreshSharedSchedule);
window.addEventListener('storage',event=>{if(event.key==='skift-workspace-v1'||event.key===null)refreshSharedSchedule();});
$('#modal').addEventListener('close',refreshSharedSchedule);
setInterval(()=>{if(document.visibilityState==='visible')refreshSharedSchedule();},60000);
try {workspace=await store.init();shell();if(workspace.error&&workspace.role!=='signed-out')toast(workspace.error,true);}catch(error){$('#app').innerHTML=`<main class="error-page">${icon('info')}<h1>Vi kunde inte öppna din arbetsyta.</h1><p>${esc(error.message)}</p><button class="primary-btn" onclick="location.reload()">Försök igen</button></main>`;}

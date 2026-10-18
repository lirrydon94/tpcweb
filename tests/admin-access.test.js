import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import * as model from '../src/model.js';
import { defaultWorkspace } from './fixtures/workspace.js';

test('staff opens a recurring personal schedule, saves only that employee and reopens saved days', async()=>{
  const state=model.organizeState(model.seedState());
  const page=await openApp('admin',{working:state,published:model.publishState(state),revision:1});
  await page.click('admin');await page.submit('lirrydoz');
  await page.click('edit-person',undefined,{member:'member-1'});
  assert.match(page.dialog.innerHTML,/Redigera personligt schema/);
  await page.click('person-schedule',undefined,{member:'member-1'});
  assert.match(page.dialog.innerHTML,/Anställningsgrad/);
  await page.submit({effectiveFrom:'2026-10-12',employmentPercent:'80','mode-0-0':'custom','start-0-0':'11:30','end-0-0':'18:30','mode-0-4':'off'});
  assert.equal(page.error.textContent,'');assert.equal(page.dialog.open,false);
  const saved=page.getWorkspace().published;
  assert.equal(model.getShift(saved,'team-1','member-1','2026-10-12').end,'18:30');
  assert.equal(model.getShift(saved,'team-1','member-1','2026-12-28').end,'18:30');
  assert.deepEqual(model.getShift(saved,'team-1','member-2','2026-10-12'),model.getShift(state,'team-1','member-2','2026-10-12'));
  assert.deepEqual(saved.teams[0].versions[0].positions,state.teams[0].versions[0].positions);
  await page.change({id:'personal-saved-date',dataset:{member:'member-1'},value:'2026-10-12'});
  assert.match(page.dialog.innerHTML,/value="80"/);assert.match(page.dialog.innerHTML,/value="18:30"/);
  assert.match(page.dialog.innerHTML,/value="off" selected/);
});

test('personal schedule validation and failed publication keep the form open without saving', async()=>{
  const state=model.organizeState(model.seedState());
  const page=await openApp('admin',{working:state,published:model.publishState(state),revision:1});
  await page.click('admin');await page.submit('lirrydoz');
  await page.click('person-schedule',undefined,{member:'member-1'});
  await page.submit({effectiveFrom:'2026-10-12',employmentPercent:'80','mode-0-0':'custom','start-0-0':'10:00','end-0-0':'10:00'});
  assert.match(page.error.textContent,/giltiga/);assert.equal(page.dialog.open,true);
  assert.equal(page.getWorkspace().revision,1);
  page.failPublish('Kunde inte spara');
  await page.submit({effectiveFrom:'2026-10-12',employmentPercent:'80'});
  assert.equal(page.error.textContent,'Kunde inte spara');assert.equal(page.dialog.open,true);
  assert.equal(page.getWorkspace().revision,1);
});

test('viewers cannot open personal schedule editing', async()=>{
  const page=await openApp('viewer');
  await page.click('person-schedule',undefined,{member:'member-1'});
  assert.equal(page.dialog.open,false);
});

test('Bosse week 7 defaults to Monday so A2, A, A become leave in the visible week',async()=>{
  const state=model.organizeState(structuredClone(defaultWorkspace.working));
  const bosse=state.employees.find(e=>e.name==='Bosse');
  const group=state.teams.find(g=>g.members.some(m=>m.id===bosse.id));
  const page=await openApp('admin',{working:state,published:model.publishState(state),revision:1});
  await page.click('admin');await page.submit('lirrydoz');
  await page.change({id:'personal-saved-date',dataset:{member:bosse.id},value:'2026-10-16'});
  assert.match(page.dialog.innerHTML,/data-personal-week="6" class="personal-current-week"/);
  const start=page.dialog.innerHTML.match(/name="effectiveFrom" required value="([^"]+)"/)[1];
  assert.equal(start,'2026-10-12');
  await page.submit({effectiveFrom:start,employmentPercent:'100','mode-6-0':'leave','mode-6-1':'leave','mode-6-2':'leave'});
  assert.equal(page.error.textContent,'');
  for(const date of ['2026-10-12','2026-10-13','2026-10-14']){
    assert.equal(model.getShift(page.getWorkspace().published,group.id,bosse.id,date).type,'leave');
  }
  await page.change({id:'personal-saved-date',dataset:{member:bosse.id},value:'2026-10-16'});
  assert.match(page.dialog.innerHTML,/name="effectiveFrom" required value="2026-10-12"/);
  const viewer=await openApp('viewer',page.getWorkspace());
  const row=viewer.app.innerHTML.match(/<tbody class="roster-person">.*?<\/tbody>/gs).find(row=>row.includes('<span>Bosse<'));
  const cells=row.match(/<td\b[^>]*>.*?<\/td>/gs);
  for(const cell of cells.slice(0,3)){assert.match(cell,/Tjänstledig/);assert.doesNotMatch(cell,/06:15–15:15|07:00–16:00/);}
});

test('new personal schedule start cannot precede the employee placement within the week',async()=>{
  const state=model.organizeState(model.seedState());
  const employee=state.employees[0];employee.activeFrom='2026-10-14';employee.placements[0].from='2026-10-14';
  state.teams[0].members[0].activeFrom='2026-10-14';
  const page=await openApp('admin',{working:state,published:model.publishState(state),revision:1});
  await page.click('admin');await page.submit('lirrydoz');
  await page.change({id:'personal-saved-date',dataset:{member:employee.id},value:'2026-10-16'});
  assert.match(page.dialog.innerHTML,/name="effectiveFrom" required value="2026-10-14"/);
});

test('viewers see published personal leave, days off and adjusted hours instead of the group shifts',async()=>{
  const state=model.organizeState(model.seedState()),published=structuredClone(state);
  const group=published.teams[0],version=group.versions[0];
  const rotation=version.rotation.map(()=>Array(7).fill(null));
  rotation[0][0]={type:'leave'};
  rotation[0][1]={type:'off'};
  rotation[0][2]={type:'custom',start:'08:00',end:'12:00'};
  model.savePersonalSchedule(published,group.id,version.id,{memberId:'member-1',effectiveFrom:'2026-10-12',employmentPercent:80,rotation});
  const page=await openApp('viewer',{working:state,published:model.publishState(published),revision:2});
  const row=page.app.innerHTML.match(/<tbody class="roster-person">.*?<\/tbody>/gs).find(row=>row.includes('<span>Du<'));
  const cells=row.match(/<td\b[^>]*>.*?<\/td>/gs);
  assert.match(cells[0],/Tjänstledig/);assert.doesNotMatch(cells[0],/11:30–20:30/);
  assert.match(cells[1],/Ledig/);assert.doesNotMatch(cells[1],/09:30–18:30/);
  assert.match(cells[2],/08:00–12:00/);assert.doesNotMatch(cells[2],/08:00–17:00/);
  assert.doesNotMatch(page.app.innerHTML,/data-action="roster-edit"/);
});

test('personal grid displays group shifts, highlights the selected rotation week and publishes leave',async()=>{
  const state=model.organizeState(model.seedState());
  const page=await openApp('admin',{working:state,published:model.publishState(state),revision:1});
  await page.click('admin');await page.submit('lirrydoz');
  await page.change({id:'personal-saved-date',dataset:{member:'member-1'},value:'2026-10-19'});
  assert.match(page.dialog.innerHTML,/Det återkommande grundschemat/);
  assert.match(page.dialog.innerHTML,/class="rotation-table personal-rotation-table"/);
  assert.match(page.dialog.innerHTML,/data-personal-week="1" class="personal-current-week"/);
  assert.match(page.dialog.innerHTML,/value="inherit" selected>C · grupp/);
  assert.match(page.dialog.innerHTML,/value="leave" >Tjänstledig/);
  assert.doesNotMatch(page.dialog.innerHTML,/<details/);
  await page.submit({effectiveFrom:'2026-10-12',employmentPercent:'80','mode-0-0':'leave','mode-0-1':'shift:A'});
  assert.equal(page.error.textContent,'');
  assert.equal(model.getShift(page.getWorkspace().published,'team-1','member-1','2026-10-12').type,'leave');
  await page.click('view','schedule');
  const row=page.app.innerHTML.match(/<tbody class="roster-person">.*?<\/tbody>/gs).find(row=>row.includes('<span>Du<'));
  assert.match(row,/Tjänstledig/);assert.match(row,/07:00–16:00/);
});

async function openApp(role = 'admin', initial = defaultWorkspace, preferences = new Map(), search = '?date=2026-10-14', navigation = new Map()) {
  let saved = { ...structuredClone(initial), mode: 'demo', role };
  const listeners = {};
  let publishError = null;
  const app = { innerHTML: '' }, form = {}, error = { textContent: '' };
  const dialog = {
    open: false, innerHTML: '',
    showModal() { this.open = true; error.textContent = ''; },
    close() { this.open = false; },
    querySelector: selector => selector === '.form-error' ? error : null,
    addEventListener() {},
  };
  const elements = { '#app': app, '#modal': dialog, '#modal-form': form, '#toast': {}, '#exception-type': { closest: () => ({ before() {} }) } };
  elements['#change-results']={set innerHTML(value){app.innerHTML=app.innerHTML.replace(/(<div id="change-results">)[\s\S]*(<\/div><p class="change-footnote")/,(_match,start,end)=>start+value+end);}};
  const context = vm.createContext({
    model,
    store: {
      init: async () => structuredClone(saved),
      publish: async working => {
        if (publishError) throw new Error(publishError);
        saved = { ...saved, working: structuredClone(working), published: model.publishState(working), revision: saved.revision + 1 };
        return structuredClone(saved);
      },
    },
    document: {
      createElement: () => ({}),
      querySelector: selector => elements[selector],
      querySelectorAll: () => [],
      addEventListener: (type, fn) => { listeners[type] = fn; },
    },
    window: { addEventListener() {}, scrollTo() {} },
    location: { search },
    localStorage: { getItem: key => preferences.get(key) || null, setItem: (key, value) => preferences.set(key, value) },
    sessionStorage: { getItem: key => navigation.get(key) || null, setItem: (key, value) => navigation.set(key, value) },
    URLSearchParams, Intl, Date, structuredClone,
    FormData: class { constructor(target) { this.get = key => target[key]; this.has = key => Boolean(target[key]); this.getAll = key => target[key] || []; } },
    setInterval() {}, setTimeout() {}, clearTimeout() {},
  });
  const source = (await readFile(new URL('../src/app.js', import.meta.url), 'utf8'))
    .replace(/^import .*;\r?\n/gm, '');
  await vm.runInContext(`(async () => { ${source}\n })()`, context);
  return {
    app, dialog, error,
    getWorkspace: () => structuredClone(saved),
    failPublish: message => { publishError = message; },
    change: target => listeners.change({ target }),
    input: target => listeners.input({ target }),
    toggle: target => listeners.toggle({ target }),
    click: (action, view, extra = {}) => listeners.click({ target: { closest: () => ({ dataset: { action, view, ...extra } }) } }),
    submit: (values = {}) => form.onsubmit({ preventDefault() {}, submitter: {}, target: typeof values === 'string' ? { password: values } : values }),
  };
}

test('deleting an individual change keeps Hantera and its tab after a file-triggered reload', async () => {
  const state = model.organizeState(model.seedState());
  state.exceptions = [{ id: 'remove-absence', teamId: 'team-1', memberId: 'member-1', date: '2026-10-14', type: 'vacation' }];
  const initial = { working: state, published: model.publishState(state), revision: 1 };
  const preferences = new Map([['skift-admin-remembered', 'true']]);
  const navigation = new Map();
  const search = '?date=2026-10-14';
  const page = await openApp('admin', initial, preferences, search, navigation);
  await page.click('admin');
  await page.click('admin-tab', undefined, { tab: 'changes' });
  await page.click('edit-exception', undefined, { id: 'remove-absence' });
  assert.equal(page.dialog.open, true);
  // This must already exist before saving: Live Server can reload before the
  // save request returns and before the application gets to render again.
  assert.equal(JSON.parse([...navigation.values()][0]).adminTab, 'changes');
  await page.click('delete-exception', undefined, { id: 'remove-absence' });
  assert.equal(page.dialog.open, false);
  assert.equal(page.getWorkspace().working.exceptions.length, 0);
  assert.equal(page.getWorkspace().published.exceptions.length, 0);
  assert.match(page.app.innerHTML, /<h1>Hantera avdelningen<\/h1>/);
  const reloaded = await openApp('admin', page.getWorkspace(), preferences, search, navigation);
  assert.match(reloaded.app.innerHTML, /<h1>Hantera avdelningen<\/h1>/);
  assert.match(reloaded.app.innerHTML, /aria-selected="true"[^>]*data-tab="changes"/);
  assert.match(reloaded.app.innerHTML, /Inga individuella ändringar/);
  assert.equal(JSON.parse([...navigation.values()][0]).teamId, 'team-1');
  // Deliberately switching back to Schema must still survive the next reload.
  await reloaded.click('view', 'schedule');
  const schedule = await openApp('admin', page.getWorkspace(), preferences, search, navigation);
  assert.doesNotMatch(schedule.app.innerHTML, /<h1>Hantera avdelningen<\/h1>/);
});

test('remembered navigation does not unlock Hantera or grant a viewer admin access', async () => {
  for (const role of ['admin', 'viewer']) {
    const navigation = new Map([['skift-navigation:/?date=2026-10-14', JSON.stringify({ view: 'admin', adminTab: 'changes' })]]);
    const preferences = new Map(role === 'viewer' ? [['skift-admin-remembered', 'true']] : []);
    const page = await openApp(role, defaultWorkspace, preferences, '?date=2026-10-14', navigation);
    assert.doesNotMatch(page.app.innerHTML, /<h1>Hantera avdelningen<\/h1>/);
  }
});

test('absence cells show their replacement inline without duplicate status rows and remain editable', async () => {
  const state=model.organizeState(model.seedState());
  state.employees.push({id:'temp-cover',name:'Kim & Co',role:'part-time',activeFrom:'2026-01-05',departmentId:state.departments[0].id,placements:[]});
  state.exceptions=[
    {id:'full-cover',teamId:'team-1',memberId:'member-1',date:'2026-10-12',type:'vacation',replacementId:'temp-cover'},
    {id:'partial-cover',teamId:'team-1',memberId:'member-1',date:'2026-10-13',type:'sick',replacementId:'temp-cover',replacementStart:'10:00',replacementEnd:'14:00'},
    {id:'no-cover',teamId:'team-1',memberId:'member-1',date:'2026-10-14',type:'leave'},
  ];
  const page=await openApp('admin',{working:state,published:model.publishState(state),revision:1});
  const personRow=()=>page.app.innerHTML.match(/<tbody class="roster-person">.*?<\/tbody>/gs).find(row=>row.includes('<span>Du<'));
  const row=personRow(),cells=row.match(/<td\b[^>]*>.*?<\/td>/gs);
  assert.equal((row.match(/<tr\b/g)||[]).length,1);
  assert.equal((cells[0].match(/Semester/g)||[]).length,1);
  assert.match(cells[0],/class="roster-shift roster-absence-card purple"/);
  assert.match(cells[1],/class="roster-shift roster-absence-card blue"/);
  assert.match(cells[2],/class="roster-shift roster-absence-card teal"/);
  assert.match(cells[0],/Semester<\/span><\/div><div class="roster-replacement"><span>Ersättare: <strong>Kim &amp; Co<\/strong><\/span>/);
  assert.doesNotMatch(cells[0],/11:30–20:30/);
  assert.match(cells[1],/Sjuk<\/span><\/div><div class="roster-replacement">/);
  assert.match(cells[1],/<small class="roster-cover-time">10:00–14:00<\/small>/);
  assert.ok(!cells[2].includes('roster-replacement'));
  assert.ok(!page.app.innerHTML.includes('roster-meta'));
  assert.doesNotMatch(page.app.innerHTML,/<span>Kim &amp; Co(?:<small>|<\/span>)/);
  assert.equal((page.app.innerHTML.match(/<tbody class="roster-person">/g)||[]).length,state.teams[0].members.length);
  const viewer=await openApp('viewer',page.getWorkspace());
  const viewerRow=viewer.app.innerHTML.match(/<tbody class="roster-person">.*?<\/tbody>/gs).find(row=>row.includes('<span>Du<'));
  assert.equal(viewerRow,row);
  assert.doesNotMatch(viewer.app.innerHTML,/<span>Kim &amp; Co(?:<small>|<\/span>)/);
  await page.click('admin');await page.submit('lirrydoz');await page.click('edit-schedule');
  assert.doesNotMatch(page.app.innerHTML,/<span>Kim &amp; Co(?:<small>|<\/span>)/);
  assert.match(personRow(),/Ersättare behövs/);
  assert.match(personRow(),/data-action="roster-edit" data-group="team-1" data-member="member-1" data-date="2026-10-13"/);
  await page.click('roster-edit',undefined,{group:'team-1',member:'member-1',date:'2026-10-13'});
  assert.equal(page.dialog.open,true);
  assert.match(page.dialog.innerHTML,/value="temp-cover" selected/);
  assert.match(page.dialog.innerHTML,/value="10:00"/);
});

test('Hantera remembers successful unlocks across navigation and reopening', async () => {
  const preferences = new Map();
  const page = await openApp('admin', defaultWorkspace, preferences);
  assert.ok(page.app.innerHTML.includes('Hantera'));
  await page.click('edit-schedule');
  assert.ok(!page.app.innerHTML.includes('Redigerar schema'));
  await page.click('view', 'admin');
  assert.equal(page.dialog.open, true);
  assert.ok(page.dialog.innerHTML.includes('type="password"'));
  assert.ok(!page.app.innerHTML.includes('Dina medarbetare'));

  await page.submit('fel');
  assert.equal(page.error.textContent, 'Fel lösenord. Försök igen.');
  assert.equal(page.dialog.open, true);
  assert.ok(!page.app.innerHTML.includes('Dina medarbetare'));

  await page.submit('lirrydoz');
  assert.equal(page.dialog.open, false);
  assert.ok(page.app.innerHTML.includes('Dina medarbetare'));
  await page.click('edit-schedule');
  assert.ok(page.app.innerHTML.includes('Redigerar schema'));
  await page.click('admin');
  assert.ok(page.app.innerHTML.includes('Dina medarbetare'));
  await page.click('view', 'schedule');
  await page.click('admin');
  assert.equal(page.dialog.open, false);
  assert.ok(page.app.innerHTML.includes('Dina medarbetare'));
  assert.equal(preferences.get('skift-admin-remembered'), 'true');

  const reloaded = await openApp('admin', defaultWorkspace, preferences);
  await reloaded.click('view', 'admin');
  assert.equal(reloaded.dialog.open, false);
  assert.ok(reloaded.app.innerHTML.includes('Dina medarbetare'));
  const freshBrowser = await openApp();
  await freshBrowser.click('admin');
  assert.equal(freshBrowser.dialog.open, true);
  const viewer = await openApp('viewer', defaultWorkspace, preferences);
  await viewer.click('admin');
  assert.ok(!viewer.app.innerHTML.includes('Dina medarbetare'));
});

test('rotation matching previews without saving, rebases weeks and saves the whole team', async () => {
  const page=await openApp();
  await page.click('admin');
  await page.submit('lirrydoz');
  const before=page.getWorkspace();
  const team=before.working.teams[0],version=team.versions.at(-1),member=team.members[0];
  await page.click('match-rotation');
  assert.ok(page.dialog.innerHTML.includes('Kalendervecka att jämföra'));
  assert.ok(page.dialog.innerHTML.includes('match-week-select'));
  assert.ok(page.dialog.innerHTML.includes('Denna vecka'));
  assert.ok(page.dialog.innerHTML.includes('Mån'));
  await page.change({id:'',classList:{contains: name=>name==='match-position'},dataset:{member:member.id},value:'3'});
  assert.deepEqual(page.getWorkspace(),before);
  await page.click('close-modal');
  assert.deepEqual(page.getWorkspace(),before);
  await page.click('match-rotation');
  await page.change({id:'',classList:{contains: name=>name==='match-position'},dataset:{member:member.id},value:'3'});
  await page.change({id:'match-calendar-week',value:'2026-W43'});
  assert.deepEqual(page.getWorkspace(),before);
  page.failPublish('Kunde inte spara');
  await page.submit();
  assert.equal(page.dialog.open,true);
  assert.equal(page.error.textContent,'Kunde inte spara');
  page.failPublish(null);
  await page.submit();
  assert.equal(page.dialog.open,false);
  const saved=page.getWorkspace().working.teams[0].versions.find(v=>v.id===version.id);
  assert.equal(saved.referenceMonday,'2026-10-19');
  assert.equal(model.rotationPosition(saved,member.id,'2026-10-12'),3);
  assert.equal(model.rotationPosition(saved,member.id,'2026-10-19'),4);
  for(const other of team.members.slice(1))assert.equal(model.rotationPosition(saved,other.id,'2026-10-19'),model.rotationPosition(version,other.id,'2026-10-19'));
});

test('Liridon matching uses the calendar week version even when the editor selected an older schedule',async()=>{
  const state=model.organizeState(structuredClone(defaultWorkspace.working));
  const group=state.teams[0],member=group.members.find(m=>m.name==='Liridon');
  const current=model.activeVersion(group,'2026-10-12'),old=group.versions.find(v=>v.id!==current.id);
  const page=await openApp('admin',{working:state,published:model.publishState(state),revision:1});
  await page.click('admin');await page.submit('lirrydoz');
  await page.click('admin-tab',undefined,{tab:'rotation'});
  await page.change({id:'version-select',value:old.id,classList:{contains:()=>false}});
  const before=page.getWorkspace();
  await page.click('match-rotation');
  const preview=()=>page.dialog.innerHTML.match(new RegExp(`data-member="${member.id}">([\\s\\S]*?)<\\/select><\\/label><p class="field-note">([\\s\\S]*?)<\\/p>`));
  let row=preview();
  assert.match(row[1],/value="2" selected/);
  assert.match(row[2],/Mån: Ledig · Tis: C 11:30–20:30 · Ons: B 09:30–18:30 · Tor: A2 06:15–15:15 · Fre: Ledig · Lör: C 11:30–20:30 · Sön: C 11:30–20:30/);
  assert.deepEqual(page.getWorkspace(),before);
  await page.click('match-week-step',undefined,{step:'-1'});
  row=preview();
  assert.match(row[1],new RegExp(`value="${model.rotationPosition(old,member.id,'2026-10-05')}" selected`));
  await page.click('match-week-step',undefined,{step:'1'});
  assert.match(preview()[1],/value="2" selected/);
  await page.submit();assert.equal(page.error.textContent,'');
  const after=page.getWorkspace().published;
  assert.deepEqual(after.teams[0].versions.find(v=>v.id===old.id),old);
  for(const date of model.weekDates('2026-10-12'))assert.deepEqual(model.getShift(after,group.id,member.id,date),model.getShift(before.published,group.id,member.id,date));
});

test('matching previews personal leave and dated absence through the same rules as the roster',async()=>{
  const state=model.organizeState(model.seedState()),group=state.teams[0],version=group.versions[0];
  const rotation=version.rotation.map(()=>Array(7).fill(null));rotation[0][0]={type:'leave'};
  model.savePersonalSchedule(state,group.id,version.id,{memberId:'member-1',effectiveFrom:'2026-10-12',employmentPercent:80,rotation});
  state.exceptions.push({id:'dated',memberId:'member-1',teamId:group.id,date:'2026-10-13',type:'vacation'});
  const page=await openApp('admin',{working:state,published:model.publishState(state),revision:1});
  await page.click('admin');await page.submit('lirrydoz');await page.click('match-rotation');
  assert.match(page.dialog.innerHTML,/Mån: Tjänstledig · Tis: Semester · Ons: F 08:00–17:00/);
  await page.change({id:'',classList:{contains:name=>name==='match-position'},dataset:{member:'member-1'},value:'2'});
  assert.match(page.dialog.innerHTML,/Mån: Ledig · Tis: Semester · Ons: B 09:30–18:30/);
  assert.equal(page.getWorkspace().revision,1);
});

test('rotation weeks can be deleted with confirmation and positions remain valid', async () => {
  const page=await openApp();
  await page.click('admin');
  await page.submit('lirrydoz');
  const before=page.getWorkspace();
  const original=before.working.teams[0].versions.at(-1);
  await page.click('delete-row',undefined,{row:'1'});
  assert.equal(page.dialog.open,true);
  await page.click('close-modal');
  assert.deepEqual(page.getWorkspace(),before);
  await page.click('delete-row',undefined,{row:'1'});
  await page.submit();
  const updated=page.getWorkspace().working.teams[0].versions.at(-1);
  assert.deepEqual(updated.rotation,original.rotation.filter((_,i)=>i!==1));
  for(const [id,p] of Object.entries(original.positions))assert.equal(updated.positions[id],p>2?p-1:p);
  while(page.getWorkspace().working.teams[0].versions.at(-1).rotation.length>1){
    const length=page.getWorkspace().working.teams[0].versions.at(-1).rotation.length;
    await page.click('delete-row',undefined,{row:String(length-1)});
    await page.submit();
    assert.equal(page.dialog.open,false);
  }
  await page.click('delete-row',undefined,{row:'0'});
  assert.equal(page.dialog.open,false);
  assert.equal(page.getWorkspace().working.teams[0].versions.at(-1).rotation.length,1);
  assert.deepEqual(model.validateState(page.getWorkspace().working),[]);
});

test('settings, rotation changes and imports publish on save, and failed saves stay open', async () => {
  const page = await openApp();
  await page.click('admin');
  await page.submit('lirrydoz');
  assert.ok(!page.app.innerHTML.includes('data-action="publish"'));
  await page.click('settings');
  await page.submit({ name: 'Uppdaterat team' });
  assert.equal(page.getWorkspace().published.teams[0].name, 'Uppdaterat team');

  await page.change({ classList: { contains: name => name === 'rotation-cell' }, dataset: { row: '0', day: '0' }, value: 'A' });
  assert.equal(page.getWorkspace().published.teams[0].versions.at(-1).rotation[0][0], 'A');

  const imported = structuredClone(page.getWorkspace().working);
  imported.teams[0].name = 'Importerat team';
  await page.change({ id: 'import-file', classList: { contains: () => false }, files: [{ text: async () => JSON.stringify(imported) }] });
  assert.equal(page.getWorkspace().published.teams[0].name, 'Uppdaterat team');
  await page.submit();
  assert.equal(page.getWorkspace().published.teams[0].name, 'Importerat team');

  const before = page.getWorkspace();
  page.failPublish('Kunde inte spara');
  await page.click('settings');
  await page.submit({ name: 'Ska inte synas' });
  assert.equal(page.dialog.open, true);
  assert.equal(page.error.textContent, 'Kunde inte spara');
  assert.deepEqual(page.getWorkspace(), before);
});

test('viewer accounts cannot open Hantera through either navigation action', async () => {
  const page = await openApp('viewer');
  await page.click('view', 'admin');
  await page.click('admin');
  assert.equal(page.dialog.open, false);
  assert.ok(!page.app.innerHTML.includes('Dina medarbetare'));
});

test('team settings require confirmation and immediately publish deletion, including the last team', async () => {
  const page = await openApp();
  await page.click('delete-team');
  assert.equal(page.dialog.open, false);
  await page.click('admin');
  await page.submit('lirrydoz');
  await page.click('settings');
  assert.ok(page.dialog.innerHTML.includes('data-action="delete-team"'));
  await page.click('delete-team');
  assert.ok(page.dialog.innerHTML.includes('Ta bort grupp?'));
  assert.ok(page.dialog.innerHTML.includes('Löpare'));
  await page.click('close-modal');
  assert.equal(page.getWorkspace().working.teams.length, 1);
  await page.click('settings');
  await page.click('delete-team');
  await page.submit();
  assert.equal(page.error.textContent, '');
  assert.equal(page.dialog.open, false);
  assert.equal(page.getWorkspace().working.teams.length, 0);
  assert.equal(page.getWorkspace().working.exceptions.length, 0);
  assert.equal(page.getWorkspace().published.teams.length, 0);
  assert.ok(page.app.innerHTML.includes('Lägg till personal'));
  assert.ok(!page.app.innerHTML.includes('Publicera ändringar'));
  await page.click('view', 'schedule');
  assert.ok(!page.app.innerHTML.includes('id="team-select"'));
  assert.ok(!page.app.innerHTML.includes('Löpare'));
});

test('deleting the selected team removes it from the schedule dropdown and selects a remaining team', async () => {
  const initial = structuredClone(defaultWorkspace);
  const otherTeam = structuredClone(initial.working.teams[0]);
  otherTeam.id = 'remaining-team';
  otherTeam.name = 'Kvarvarande team';
  otherTeam.members = [];
  for (const version of otherTeam.versions) version.positions = {};
  initial.working.teams.push(structuredClone(otherTeam));
  initial.published.teams.push(structuredClone(otherTeam));
  const page = await openApp('admin', initial);
  await page.click('admin');
  await page.submit('lirrydoz');
  await page.click('settings');
  await page.click('delete-team');
  await page.submit();
  assert.equal(page.error.textContent, '');
  await page.click('view', 'schedule');
  assert.ok(page.app.innerHTML.includes('<option value="remaining-team" selected> Kvarvarande team</option>'));
  assert.ok(!page.app.innerHTML.includes('Löpare'));
  assert.ok(!page.app.innerHTML.includes('<option value="team-1"'));
});

test('the selected team is restored on reopening even when the link names another team', async () => {
  const initial = structuredClone(defaultWorkspace);
  for (const state of [initial.working, initial.published]) {
    const team = structuredClone(state.teams[0]);
    team.id = 'second-team';
    team.name = 'Andra teamet';
    state.teams.push(team);
  }
  const preferences = new Map();
  const search = '?team=' + initial.published.teams[0].id;
  const page = await openApp('viewer', initial, preferences, search);
  await page.change({ id: 'team-select', value: 'second-team' });
  assert.equal(preferences.get('skift-team'), 'second-team');
  const reopened = await openApp('viewer', initial, preferences, search);
  assert.ok(reopened.app.innerHTML.includes('<option value="second-team" selected>'));
  preferences.set('skift-team', 'deleted-team');
  const fallback = await openApp('viewer', initial, preferences, search);
  assert.ok(fallback.app.innerHTML.includes('<option value="' + initial.published.teams[0].id + '" selected>'));
});

test('department registration and placement persist without requiring a group', async () => {
  const page=await openApp();await page.click('admin');await page.submit('lirrydoz');
  await page.click('add-department');await page.submit({name:'Medicin'});
  await page.click('add-person');await page.submit({name:'Nina',role:'member',from:'2026-10-14',placement:''});
  assert.equal(page.error.textContent,'');
  let state=page.getWorkspace().working;const employee=state.employees.find(e=>e.name==='Nina');assert.ok(employee);assert.equal(state.teams.flatMap(g=>g.members).some(m=>m.id===employee.id),false);
  await page.click('add-work-team');await page.submit({name:'Städ'});
  await page.click('add-team');await page.submit({name:'Dag',length:'1',date:'2026-10-12',copy:false});
  state=page.getWorkspace().working;const group=state.teams.find(g=>g.name==='Dag');assert.ok(group);
  await page.click('edit-person',undefined,{member:employee.id});await page.submit({name:'Nina',role:'member',placement:'group:'+group.id});
  assert.equal(page.error.textContent,'');state=page.getWorkspace().working;assert.equal(model.placementOn(state.employees.find(e=>e.id===employee.id),employee.activeFrom).groupId,group.id);assert.deepEqual(model.validateState(state),[]);
});

test('adding a rotation week appends a blank row directly without creating a version', async () => {
  const page=await openApp();
  await page.click('admin');await page.submit('lirrydoz');
  const before=model.organizeState(page.getWorkspace().working).teams[0];
  await page.click('new-rotation');
  assert.equal(page.dialog.open,false);
  const after=page.getWorkspace().working.teams[0];
  const expected=structuredClone(before);
  expected.versions.at(-1).rotation.push(Array(7).fill(''));
  assert.deepEqual(after,expected);
  assert.deepEqual(page.getWorkspace().published.teams[0],expected);
  page.failPublish('Kunde inte spara');
  await page.click('new-rotation');
  assert.deepEqual(page.getWorkspace().working.teams[0],expected);
});

test('individual changes filter by team across groups and keep edits in the correct group', async () => {
  const state=model.organizeState(model.seedState());
  const first=state.teams[0], workTeam=state.workTeams[0];
  const night=structuredClone(first);night.id='night';night.name='Natt';night.members=[];night.versions.forEach(v=>v.positions={});state.teams.push(night);
  const other=structuredClone(night);other.id='other-group';other.workTeamId='other-team';state.teams.push(other);
  state.workTeams.push({id:'other-team',departmentId:state.departments[0].id,name:'Annat team'});
  model.placeEmployee(state,'member-1',workTeam.id,night.id,'2026-10-12');
  model.placeEmployee(state,'member-2','other-team',other.id,'2026-10-12');
  state.exceptions=[
    {id:'day-absence',teamId:first.id,memberId:'member-3',date:'2026-10-14',type:'vacation'},
    {id:'night-absence',teamId:night.id,memberId:'member-1',date:'2026-10-15',type:'vacation'},
    {id:'other-absence',teamId:other.id,memberId:'member-2',date:'2031-10-14',type:'vacation'},
  ];
  const page=await openApp('admin',{working:state,published:model.publishState(state),revision:1});
  await page.click('admin');await page.submit('lirrydoz');
  await page.click('admin-tab',undefined,{tab:'changes'});
  assert.match(page.app.innerHTML,/id="work-team-select"/);
  assert.doesNotMatch(page.app.innerHTML,/id="admin-team-select"/);
  assert.match(page.app.innerHTML,/data-id="day-absence"/);
  assert.match(page.app.innerHTML,/data-id="night-absence"/);
  assert.doesNotMatch(page.app.innerHTML,/data-id="other-absence"/);
  assert.doesNotMatch(page.app.innerHTML.match(/id="changes-year">(.*?)<\/select>/s)[1],/2031/);
  await page.change({id:'changes-year',value:'2026'});
  await page.click('edit-exception',undefined,{id:'night-absence'});
  await page.submit({member:'member-1',date:'2026-10-15',type:'leave',replacement:'',note:'Ändrad'});
  assert.equal(page.error.textContent,'');
  assert.equal(page.getWorkspace().working.exceptions.find(e=>e.id==='night-absence').teamId,night.id);
  await page.click('exception');
  assert.match(page.dialog.innerHTML,/value="member-1"/);
  assert.match(page.dialog.innerHTML,/value="member-3"/);
  await page.submit({member:'member-1',date:'2026-10-16',through:'2026-10-16',days:['4'],type:'vacation',replacement:'',note:''});
  assert.equal(page.error.textContent,'');
  assert.equal(page.getWorkspace().working.exceptions.find(e=>e.date==='2026-10-16').teamId,night.id);
  await page.click('delete-exception',undefined,{id:'night-absence'});
  assert.doesNotMatch(page.app.innerHTML,/data-id="night-absence"/);
  assert.match(page.app.innerHTML,/data-id="day-absence"/);
  await page.change({id:'work-team-select',value:'other-team'});
  const yearOptions=page.app.innerHTML.match(/id="changes-year">(.*?)<\/select>/s)[1];
  assert.match(yearOptions,/2031/);
  assert.doesNotMatch(yearOptions,/2026/);
  assert.match(page.app.innerHTML,/data-id="other-absence"/);
  assert.doesNotMatch(page.app.innerHTML,/data-id="day-absence"/);
});

test('51 people with 20 vacation dates each render compactly and can be searched, paged and filtered', async () => {
  const state=model.seedState(),group=state.teams[0],template=group.members[0];
  group.members=Array.from({length:51},(_,i)=>({...template,id:'person-'+(i+1),name:'Person '+String(i+1).padStart(2,'0')}));
  for(const version of group.versions)version.positions=Object.fromEntries(group.members.map(member=>[member.id,1]));
  state.exceptions=group.members.flatMap(member=>Array.from({length:20},(_,i)=>({id:member.id+'-day-'+i,teamId:group.id,memberId:member.id,date:model.addDays('2027-07-01',i),type:'vacation'})));
  model.organizeState(state);
  const preferences=new Map([['skift-admin-remembered','true']]),navigation=new Map();
  const page=await openApp('admin',{working:state,published:model.publishState(state),revision:1},preferences,'?date=2026-10-14',navigation);
  await page.click('admin');await page.click('admin-tab',undefined,{tab:'changes'});
  assert.equal((page.app.innerHTML.match(/class="change-person"/g)||[]).length,10);
  assert.equal((page.app.innerHTML.match(/class="change-period"/g)||[]).length,10);
  assert.equal((page.app.innerHTML.match(/class="change-day"/g)||[]).length,200);
  assert.match(page.app.innerHTML,/<strong>1020<\/strong> registrerade dagar/);
  assert.match(page.app.innerHTML,/Visar 1–10 av 51 medarbetare/);
  assert.doesNotMatch(page.app.innerHTML,/data-change-person="[^"]+" open/);
  await page.click('changes-page',undefined,{step:'1'});
  assert.match(page.app.innerHTML,/Visar 11–20 av 51 medarbetare/);
  await page.input({id:'changes-search',value:'person 51'});
  assert.match(page.app.innerHTML,/Visar 1–1 av 1 medarbetare/);
  assert.equal((page.app.innerHTML.match(/class="change-person"/g)||[]).length,1);
  assert.match(page.app.innerHTML,/data-id="person-51-day-0"/);
  await page.toggle({dataset:{changePerson:'person-51'},open:true});
  await page.toggle({dataset:{changePeriod:'person-51-day-0'},open:true});
  const reloaded=await openApp('admin',page.getWorkspace(),preferences,'?date=2026-10-14',navigation);
  assert.match(reloaded.app.innerHTML,/data-change-person="person-51" open/);
  assert.match(reloaded.app.innerHTML,/data-change-period="person-51-day-0" open/);
  await page.change({id:'changes-year',value:'2027'});
  await page.change({id:'changes-month',value:'08'});
  assert.match(page.app.innerHTML,/Inga ändringar matchar dina filter/);
  await page.change({id:'changes-month',value:'07'});
  assert.match(page.app.innerHTML,/Visar 1–1 av 1 medarbetare/);
  await page.change({id:'changes-type',value:'sick'});
  assert.match(page.app.innerHTML,/Inga ändringar matchar dina filter/);
  await page.click('changes-reset');
  assert.match(page.app.innerHTML,/Visar 1–10 av 51 medarbetare/);
});

test('year filter shows every month in that year and can narrow to one month or reset', async () => {
  const state=model.organizeState(model.seedState());
  state.exceptions=['2026-01-15','2026-12-15','2027-01-15'].map((date,i)=>({id:'year-'+i,teamId:'team-1',memberId:'member-1',date,type:'vacation'}));
  const preferences=new Map([['skift-admin-remembered','true']]),navigation=new Map();
  const page=await openApp('admin',{working:state,published:model.publishState(state),revision:1},preferences,'',navigation);
  await page.click('admin');await page.click('admin-tab',undefined,{tab:'changes'});
  assert.deepEqual([...page.app.innerHTML.match(/id="changes-year">(.*?)<\/select>/s)[1].matchAll(/value="(\d{4})"/g)].map(match=>match[1]),['2026','2027']);
  await page.change({id:'changes-year',value:'2026'});
  assert.match(page.app.innerHTML,/>Hela året<\/option>/);
  assert.match(page.app.innerHTML,/data-id="year-0"/);
  assert.match(page.app.innerHTML,/data-id="year-1"/);
  assert.doesNotMatch(page.app.innerHTML,/data-id="year-2"/);
  await page.change({id:'changes-month',value:'12'});
  assert.doesNotMatch(page.app.innerHTML,/data-id="year-0"/);
  assert.match(page.app.innerHTML,/data-id="year-1"/);
  await page.change({id:'changes-month',value:''});
  const reloaded=await openApp('admin',page.getWorkspace(),preferences,'',navigation);
  assert.match(reloaded.app.innerHTML,/value="2026" selected/);
  assert.match(reloaded.app.innerHTML,/data-id="year-0"/);
  assert.match(reloaded.app.innerHTML,/data-id="year-1"/);
  assert.doesNotMatch(reloaded.app.innerHTML,/data-id="year-2"/);
  await reloaded.click('changes-reset');
  assert.match(reloaded.app.innerHTML,/data-id="year-2"/);
  await reloaded.change({id:'changes-year',value:'2027'});
  await reloaded.click('delete-exception',undefined,{id:'year-2'});
  assert.doesNotMatch(reloaded.app.innerHTML.match(/id="changes-year">(.*?)<\/select>/s)[1],/2027/);
  assert.match(reloaded.app.innerHTML,/data-id="year-0"/);
});

test('period grouping preserves date gaps, different absence types, groups and working hours', async () => {
  const source=(await readFile(new URL('../src/app.js',import.meta.url),'utf8'));
  const helper=source.slice(source.indexOf('function changePeriods('),source.indexOf('function changeRange('));
  const entries=[
    {id:'a',teamId:'day',date:'2026-12-31',type:'vacation'},
    {id:'b',teamId:'day',date:'2027-01-01',type:'vacation',replacementId:'someone'},
    {id:'gap',teamId:'day',date:'2027-01-03',type:'vacation'},
    {id:'type',teamId:'day',date:'2027-01-04',type:'sick'},
    {id:'group',teamId:'night',date:'2027-01-04',type:'vacation'},
    {id:'hours1',teamId:'day',date:'2027-01-05',type:'pension',start:'08:00',end:'12:00'},
    {id:'hours2',teamId:'day',date:'2027-01-06',type:'pension',start:'08:00',end:'14:00'},
  ];
  const before=JSON.stringify(entries);
  const result=vm.runInNewContext(helper+'\nchangePeriods(entries)',{model,entries});
  assert.equal(result.length,6);
  assert.equal(result[0].entries.length,2);
  assert.equal(result[0].end,'2027-01-01');
  assert.equal(JSON.stringify(entries),before);
});

test('schedule shows all groups of the selected team in one table and edits the correct group', async () => {
  const state=model.organizeState(model.seedState());
  state.workTeams[0].name='Service';state.teams[0].name='Dag';
  const night=structuredClone(state.teams[0]);night.id='night-group';night.name='Natt';night.members=[];night.versions.forEach(v=>{v.positions={};});state.teams.push(night);
  model.placeEmployee(state,'member-1',state.workTeams[0].id,night.id,'2026-10-12');
  const page=await openApp('admin',{working:state,published:model.publishState(state),revision:1});
  assert.equal((page.app.innerHTML.match(/<table class="roster-table">/g)||[]).length,1);
  assert.ok(!page.app.innerHTML.includes('scope="rowgroup"'));
  assert.equal((page.app.innerHTML.match(/<tbody class="roster-person">/g)||[]).length,7);
  assert.ok(page.app.innerHTML.includes('selected>\u2003Service</option>') || page.app.innerHTML.includes('selected>Service</option>'));
  assert.ok(!page.app.innerHTML.includes('value="night-group"'));
  assert.doesNotMatch(page.app.innerHTML, /<small>Service(?:<| ·)/);
  await page.click('admin');await page.submit('lirrydoz');await page.click('edit-schedule');
  assert.ok(page.app.innerHTML.includes('data-group="night-group"'));
  await page.click('roster-edit',undefined,{group:night.id,member:'member-1',date:'2026-10-14'});
  assert.equal(page.dialog.open,true);
  assert.ok(page.dialog.innerHTML.includes('value="member-1" selected'));
  assert.ok(!page.dialog.innerHTML.includes('value="member-2" selected'));
});

test('rotation matching allows selecting week 1 through the end of the year without version restriction error', async () => {
  const page = await openApp();
  await page.click('admin');
  await page.submit('lirrydoz');
  await page.click('match-rotation');
  assert.ok(page.dialog.innerHTML.includes('Vecka 1 ('));
  assert.ok(page.dialog.innerHTML.includes('Vecka 53 ('));
  await page.change({ id: 'match-week-select', value: '2025-12-29' });
  assert.equal(page.error.textContent, '');
  await page.click('match-week-step', undefined, { step: '-1' });
  assert.equal(page.error.textContent, '');
  await page.change({ id: 'match-calendar-week', value: '2026-W01' });
  assert.equal(page.error.textContent, '');
});

test('department selection shows the combined schedule and remains available in the selector', async () => {
  const page = await openApp();
  assert.ok(page.app.innerHTML.includes('Min avdelning'));
  await page.change({ id: 'team-select', value: 'dept:department-default' });
  assert.ok(page.app.innerHTML.includes('Min avdelning'));
  const rows = (page.app.innerHTML.match(/<tbody class="roster-person">/g)||[]).length;
  assert.ok(rows >= 1);
  assert.ok(page.app.innerHTML.includes('<small>Löpare</small>'));
});

 test('inactive groups are absent from a team schedule and active groups are not selector options', async () => {
  const state=model.organizeState(model.seedState());
  const group=state.teams[0];
  state.workTeams[0].name='Service';group.name='Dolda gruppen';group.showScheduleName=false;
  const visible=structuredClone(group);visible.id='visible';visible.name='Synliga gruppen';visible.showScheduleName=true;visible.members=[];visible.versions.forEach(v=>v.positions={});state.teams.push(visible);
  model.placeEmployee(state,'member-1',state.workTeams[0].id,visible.id,'2026-10-12');
  const page=await openApp('admin',{working:state,published:model.publishState(state),revision:1});
  const selector=page.app.innerHTML.match(/<select id="team-select"[^>]*>(.*?)<\/select>/s)[1];
  assert.ok(selector.includes('Service'));
  assert.ok(!selector.includes('Dolda gruppen'));
  assert.ok(!selector.includes('Synliga gruppen'));
  assert.equal((page.app.innerHTML.match(/<tbody class="roster-person">/g)||[]).length,1);
  await page.change({id:'team-select',value:'dept:'+state.departments[0].id});
  assert.equal((page.app.innerHTML.match(/<tbody class="roster-person">/g)||[]).length,1);
  assert.ok(page.app.innerHTML.includes('value="dept:'+state.departments[0].id+'" selected'));
});

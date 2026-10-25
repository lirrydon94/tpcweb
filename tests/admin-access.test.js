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
  assert.doesNotMatch(page.dialog.innerHTML,/Anställningsgrad (%)|name="employmentPercent"/);
  assert.doesNotMatch(page.dialog.innerHTML,/Gäller från|Visa sparat schema från|personal-saved-date/);
  assert.match(page.dialog.innerHTML,/<input type="hidden" name="effectiveFrom" value="[0-9-]+">/);
  await page.submit({effectiveFrom:'2026-10-12',employmentPercent:'80','mode-0-0':'custom','start-0-0':'11:30','end-0-0':'18:30','mode-0-4':'off'});
  assert.equal(page.error.textContent,'');assert.equal(page.dialog.open,false);
  const saved=page.getWorkspace().published;
  assert.equal(saved.teams[0].versions[0].personalSchedules[0].employmentPercent,model.personalScheduleStats(saved.teams[0].versions[0],saved.teams[0].versions[0].personalSchedules[0].rotation).employmentPercent);
  assert.notEqual(saved.teams[0].versions[0].personalSchedules[0].employmentPercent,80);
  assert.equal(model.getShift(saved,'team-1','member-1','2026-10-12').end,'18:30');
  assert.equal(model.getShift(saved,'team-1','member-1','2026-12-28').end,'18:30');
  assert.deepEqual(model.getShift(saved,'team-1','member-2','2026-10-12'),model.getShift(state,'team-1','member-2','2026-10-12'));
  assert.deepEqual(saved.teams[0].versions[0].positions,state.teams[0].versions[0].positions);
  page.setToday('2026-10-12');await page.click('person-schedule',undefined,{member:'member-1'});
  assert.match(page.dialog.innerHTML,/id="personal-hours"/);assert.match(page.dialog.innerHTML,/value="18:30"/);
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

test('hourly skills save on the person, reopen after reload and can be cleared', async()=>{
  const state=model.useLoopingSchedules(model.seedState());
  const departmentId=state.departments[0].id;
  state.workTeams[0].name='Beställning';
  state.workTeams.push({id:'waste',name:'Avfall',departmentId,scheduleActive:false});
  state.employees.push({id:'hourly',name:'Kim',role:'part-time',departmentId,activeFrom:'2026-01-01',placements:[]});
  const initial={working:state,published:model.publishState(state),revision:1};
  const page=await openApp('admin',initial);
  await page.click('admin');await page.submit('lirrydoz');
  await page.click('edit-person',undefined,{member:'hourly'});
  assert.match(page.dialog.innerHTML, /<legend>Kunskaper<\/legend>/);
  assert.match(page.dialog.innerHTML, /value="waste"/);
  await page.submit({name:'Kim',role:'part-time',skilledTeamIds:[state.workTeams[0].id]});
  assert.equal(page.error.textContent,'');
  const saved=page.getWorkspace();
  for(const version of [saved.working,saved.published]){
    assert.deepEqual(version.employees.find(e=>e.id==='hourly').skilledTeamIds,[state.workTeams[0].id]);
    assert.deepEqual(version.employees.find(e=>e.id==='member-1'),state.employees.find(e=>e.id==='member-1'));
  }
  assert.match(page.app.innerHTML, /<strong>Kim<\/strong><small>Beställning<\/small>/);
  const reloaded=await openApp('admin',saved,new Map(),'?date=2026-10-14',new Map([['skift-admin-remembered','true']]));
  await reloaded.click('admin');await reloaded.click('edit-person',undefined,{member:'hourly'});
  assert.match(reloaded.dialog.innerHTML,new RegExp(`value="${state.workTeams[0].id}" checked`));
  assert.doesNotMatch(reloaded.dialog.innerHTML,/value="waste" checked/);
  await reloaded.submit({name:'Kim',role:'part-time',skilledTeamIds:[]});
  assert.deepEqual(reloaded.getWorkspace().working.employees.find(e=>e.id==='hourly').skilledTeamIds,[]);
  assert.doesNotMatch(reloaded.app.innerHTML, /<strong>Kim<\/strong><small>/);
});

test('a new hourly employee can have several skills and failed saving preserves existing skills', async()=>{
  const state=model.organizeState(model.seedState()),departmentId=state.departments[0].id;
  state.workTeams.push({id:'waste',name:'Avfall',departmentId});
  const page=await openApp('admin',{working:state,published:model.publishState(state),revision:1});
  await page.click('admin');await page.submit('lirrydoz');await page.click('add-hourly');
  await page.submit({name:'Alex',role:'part-time',skilledTeamIds:[state.workTeams[0].id,'waste']});
  assert.equal(page.error.textContent,'');
  const hourly=page.getWorkspace().working.employees.find(e=>e.name==='Alex');
  assert.deepEqual(hourly.skilledTeamIds,[state.workTeams[0].id,'waste']);
  assert.equal(model.placementOn(hourly,hourly.activeFrom).teamId,null);
  await page.click('edit-person',undefined,{member:hourly.id});page.failPublish('Kunde inte spara');
  await page.submit({name:'Alex',role:'part-time',skilledTeamIds:[]});
  assert.equal(page.dialog.open,true);assert.equal(page.error.textContent,'Kunde inte spara');
  assert.deepEqual(page.getWorkspace().working.employees.find(e=>e.id===hourly.id).skilledTeamIds,hourly.skilledTeamIds);
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
  page.setToday('2026-10-16');await page.click('person-schedule',undefined,{member:bosse.id});
  assert.match(page.dialog.innerHTML,/data-personal-week="6" class="personal-current-week"/);
  const start=page.dialog.innerHTML.match(/name="effectiveFrom" value="([^"]+)"/)[1];
  assert.equal(start,'2026-10-12');
  await page.submit({effectiveFrom:start,employmentPercent:'100','mode-6-0':'leave','mode-6-1':'leave','mode-6-2':'leave'});
  assert.equal(page.error.textContent,'');
  for(const date of ['2026-10-12','2026-10-13','2026-10-14']){
    assert.equal(model.getShift(page.getWorkspace().published,group.id,bosse.id,date).type,'leave');
  }
  page.setToday('2026-10-16');await page.click('person-schedule',undefined,{member:bosse.id});
  assert.match(page.dialog.innerHTML,/name="effectiveFrom" value="2026-10-12"/);
  const viewer=await openApp('viewer',page.getWorkspace());
  const row=viewer.app.innerHTML.match(/<tbody class="roster-person">.*?<\/tbody>/gs).find(row=>row.includes('<span>Bosse<'));
  const cells=row.match(/<td\b[^>]*>.*?<\/td>/gs);
  for(const cell of cells.slice(0,3)){assert.match(cell,/Tjänstledig/);assert.doesNotMatch(cell,/06:15–15:15|07:00–16:00/);}
});

test('a looping personal schedule can cover the week before the employee registration date',async()=>{
  const state=model.organizeState(model.seedState());
  const employee=state.employees[0];employee.activeFrom='2026-10-14';employee.placements[0].from='2026-10-14';
  state.teams[0].members[0].activeFrom='2026-10-14';
  const page=await openApp('admin',{working:state,published:model.publishState(state),revision:1});
  await page.click('admin');await page.submit('lirrydoz');
  page.setToday('2026-10-16');await page.click('person-schedule',undefined,{member:employee.id});
  assert.match(page.dialog.innerHTML,/name="effectiveFrom" value="2026-10-12"/);
  await page.submit({effectiveFrom:'2026-10-12','mode-0-0':'leave'});
  assert.equal(page.error.textContent,'');
  assert.equal(model.getShift(page.getWorkspace().published,'team-1',employee.id,'2026-10-12').type,'leave');
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
  page.setToday('2026-10-19');await page.click('person-schedule',undefined,{member:'member-1'});
  assert.doesNotMatch(page.dialog.innerHTML,/Det återkommande grundschemat|Personen fortsätter på sin plats|Gruppens vanliga pass är ifyllda|personal-effective-note/);
  assert.match(page.dialog.innerHTML,/class="rotation-table personal-rotation-table"/);
  assert.match(page.dialog.innerHTML,/data-personal-week="1" class="personal-current-week"/);
  assert.match(page.dialog.innerHTML,/value="inherit" selected>C</);
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
  let currentDate = null;
  const app = { innerHTML: '' }, form = {}, error = { textContent: '' };
  const dialog = {
    open: false, innerHTML: '',
    showModal() { this.open = true; error.textContent = ''; },
    close() { this.open = false; },
    querySelector: selector => selector === '.form-error' ? error : null,
    addEventListener() {},
  };
  const elements = { '#app': app, '#modal': dialog, '#modal-form': form, '#toast': {}, '#exception-type': { closest: () => ({ before() {} }) } };
  elements['#change-results']={set innerHTML(value){app.innerHTML=app.innerHTML.replace(/(<div id="change-results">)[\s\S]*(<\/div><\/section>)/,(_match,start,end)=>start+value+end);}};
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
    localStorage: { getItem: key => preferences.get(key) || null, setItem: (key, value) => preferences.set(key, value), removeItem: key => preferences.delete(key) },
    sessionStorage: { getItem: key => navigation.get(key) || null, setItem: (key, value) => navigation.set(key, value), removeItem: key => navigation.delete(key) },
    URLSearchParams, Intl, structuredClone,
    Date: class extends Date { constructor(...args) { super(...(args.length ? args : currentDate ? [currentDate+'T12:00:00Z'] : [])); } },
    FormData: class { constructor(target) { this.get = key => target[key]; this.has = key => Boolean(target[key]); this.getAll = key => target[key] || []; } },
    setInterval() {}, setTimeout() {}, clearTimeout() {},
  });
  const source = (await readFile(new URL('../src/app.js', import.meta.url), 'utf8'))
    .replace(/^import .*;\r?\n/gm, '');
  await vm.runInContext(`(async () => { ${source}\n globalThis.openExceptionForTest=exceptionModal; })()`, context);
  return {
    app, dialog, error,
    setToday: date => { currentDate = date; },
    getWorkspace: () => structuredClone(saved),
    failPublish: message => { publishError = message; },
    change: target => listeners.change({ target }),
    input: target => listeners.input({ target }),
    toggle: target => listeners.toggle({ target }),
    click: (action, view, extra = {}) => listeners.click({ target: { closest: () => ({ dataset: { action, view, ...extra } }) } }),
    openException: options => context.openExceptionForTest(options),
    submit: (values = {}) => form.onsubmit({ preventDefault() {}, submitter: {}, target: typeof values === 'string' ? { password: values } : values }),
  };
}

test('employee deletion requires confirmation, can be cancelled and persists in both saved views',async()=>{
  const state=model.organizeState(model.seedState()),employee=state.employees[0];
  employee.name='Hilde & <test>';state.teams[0].members[0].name=employee.name;
  const page=await openApp('admin',{working:state,published:model.publishState(state),revision:1});
  await page.click('delete-person',undefined,{member:employee.id});assert.equal(page.dialog.open,false);
  await page.click('admin');await page.submit('lirrydoz');
  await page.click('edit-person',undefined,{member:employee.id});
  assert.match(page.dialog.innerHTML,/data-action="delete-person" data-member="member-1">Ta bort medarbetare/);
  const before=page.getWorkspace();
  await page.click('delete-person',undefined,{member:employee.id});
  assert.match(page.dialog.innerHTML,/Ta bort medarbetare\?/);
  assert.match(page.dialog.innerHTML,/<strong>Hilde &amp; &lt;test&gt;<\/strong>/);
  assert.match(page.dialog.innerHTML,/lämnas utan ersättare/);
  assert.match(page.dialog.innerHTML,/class="primary-btn danger-btn" type="submit">Ta bort medarbetare/);
  assert.deepEqual(page.getWorkspace(),before);
  await page.click('close-modal');assert.deepEqual(page.getWorkspace(),before);
  await page.click('edit-person',undefined,{member:employee.id});await page.click('delete-person',undefined,{member:employee.id});await page.submit();
  assert.equal(page.error.textContent,'');assert.equal(page.dialog.open,false);
  const saved=page.getWorkspace();
  for(const snapshot of [saved.working,saved.published]){
    assert.equal(snapshot.employees.some(person=>person.id===employee.id),false);
    assert.equal(snapshot.teams.some(group=>group.members.some(person=>person.id===employee.id)),false);
  }
  assert.equal(saved.revision,before.revision+1);
  assert.doesNotMatch(page.app.innerHTML,/data-action="edit-person" data-member="member-1"/);
  const reloaded=await openApp('admin',saved,new Map(),'?date=2026-10-14',new Map([['skift-admin-remembered','true']]));
  await reloaded.click('admin');assert.doesNotMatch(reloaded.app.innerHTML,/data-action="edit-person" data-member="member-1"/);
  assert.match(reloaded.app.innerHTML,/data-action="edit-person" data-member="member-2"/);
});

test('failed employee deletion keeps both saved views intact and allows retrying the confirmation',async()=>{
  const state=model.organizeState(model.seedState()),page=await openApp('admin',{working:state,published:model.publishState(state),revision:1});
  await page.click('admin');await page.submit('lirrydoz');await page.click('edit-person',undefined,{member:'member-1'});
  await page.click('delete-person',undefined,{member:'member-1'});
  const before=page.getWorkspace();page.failPublish('Kunde inte spara borttagningen');await page.submit();
  assert.equal(page.error.textContent,'Kunde inte spara borttagningen');assert.equal(page.dialog.open,true);
  assert.deepEqual(page.getWorkspace(),before);
  page.failPublish(null);await page.submit();assert.equal(page.error.textContent,'');assert.equal(page.dialog.open,false);
  assert.equal(page.getWorkspace().working.employees.some(person=>person.id==='member-1'),false);
});

test('employee deletion works for hourly staff and the last employee, while new people and viewers have no delete control',async()=>{
  for(const role of ['part-time','member']){
    let state=model.organizeState(model.seedState());
    for(const person of state.employees.slice(1))state=model.deleteEmployee(state,person.id);
    if(role==='part-time'){
      state.employees[0].role=role;
      model.placeEmployee(state,'member-1',null,null,'2026-10-12');
    }
    const page=await openApp('admin',{working:state,published:model.publishState(state),revision:1});
    await page.click('admin');await page.submit('lirrydoz');
    for(const action of ['add-person','add-hourly']){
      await page.click(action);assert.doesNotMatch(page.dialog.innerHTML,/data-action="delete-person"/);
      await page.click('close-modal');
    }
    await page.click('edit-person',undefined,{member:'member-1'});assert.match(page.dialog.innerHTML,/data-action="delete-person"/);
    await page.click('delete-person',undefined,{member:'member-1'});await page.submit();
    assert.equal(page.error.textContent,'');assert.deepEqual(page.getWorkspace().working.employees,[]);
    assert.match(page.app.innerHTML,/Lägg till personal/);
    await page.click('view','schedule');assert.equal(page.error.textContent,'');
  }
  const viewer=await openApp('viewer');
  await viewer.click('edit-person',undefined,{member:'member-1'});await viewer.click('delete-person',undefined,{member:'member-1'});
  assert.equal(viewer.dialog.open,false);
});

test('deleting an individual change keeps Hantera and its tab after a file-triggered reload', async () => {
  const state = model.organizeState(model.seedState());
  state.exceptions = [{ id: 'remove-absence', teamId: 'team-1', memberId: 'member-1', date: '2026-10-14', type: 'vacation' }];
  const initial = { working: state, published: model.publishState(state), revision: 1 };
  const preferences = new Map();
  const navigation = new Map([['skift-admin-remembered', 'true']]);
  const search = '?date=2026-10-14';
  const page = await openApp('admin', initial, preferences, search, navigation);
  await page.click('admin');
  await page.click('admin-tab', undefined, { tab: 'changes' });
  await page.click('edit-exception', undefined, { id: 'remove-absence' });
  assert.equal(page.dialog.open, true);
  // This must already exist before saving: Live Server can reload before the
  // save request returns and before the application gets to render again.
  const savedNav = () => JSON.parse([...navigation.entries()].find(([k]) => k.startsWith('skift-navigation'))[1]);
  assert.equal(savedNav().adminTab, 'changes');
  await page.click('delete-exception', undefined, { id: 'remove-absence' });
  assert.equal(page.dialog.open, false);
  assert.equal(page.getWorkspace().working.exceptions.length, 0);
  assert.equal(page.getWorkspace().published.exceptions.length, 0);
  assert.match(page.app.innerHTML, /<h1>Hantera avdelningen<\/h1>/);
  const reloaded = await openApp('admin', page.getWorkspace(), preferences, search, navigation);
  assert.match(reloaded.app.innerHTML, /<h1>Hantera avdelningen<\/h1>/);
  assert.match(reloaded.app.innerHTML, /aria-selected="true"[^>]*data-tab="changes"/);
  assert.match(reloaded.app.innerHTML, /Inga individuella ändringar/);
  assert.equal(savedNav().teamId, 'team-1');
  // Deliberately switching back to Schema must still survive the next reload.
  await reloaded.click('view', 'schedule');
  const schedule = await openApp('admin', page.getWorkspace(), preferences, search, navigation);
  assert.doesNotMatch(schedule.app.innerHTML, /<h1>Hantera avdelningen<\/h1>/);
});

test('remembered navigation does not unlock Hantera or grant a viewer admin access', async () => {
  for (const role of ['admin', 'viewer']) {
    const navigation = new Map([['skift-navigation:/?date=2026-10-14', JSON.stringify({ view: 'admin', adminTab: 'changes' })], ...(role === 'viewer' ? [['skift-admin-remembered', 'true']] : [])]);
    const preferences = new Map();
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

test('Hantera remembers successful unlocks within session and requires password when reopened', async () => {
  const preferences = new Map();
  const navigation = new Map();
  const page = await openApp('admin', defaultWorkspace, preferences, '?date=2026-10-14', navigation);
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
  assert.equal(navigation.get('skift-admin-remembered'), 'true');
  assert.equal(preferences.get('skift-admin-remembered'), undefined);

  const reloaded = await openApp('admin', defaultWorkspace, preferences, '?date=2026-10-14', navigation);
  await reloaded.click('view', 'admin');
  assert.equal(reloaded.dialog.open, false);
  assert.ok(reloaded.app.innerHTML.includes('Dina medarbetare'));
  const closedBrowser = await openApp('admin', defaultWorkspace, preferences);
  await closedBrowser.click('admin');
  assert.equal(closedBrowser.dialog.open, true);
  const viewer = await openApp('viewer', defaultWorkspace, preferences, '?date=2026-10-14', navigation);
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

test('Liridon matching uses the same looping schedule when comparing earlier weeks',async()=>{
  const state=model.useLoopingSchedules(structuredClone(defaultWorkspace.working));
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
  assert.match(row[1],new RegExp(`value="${model.rotationPosition(current,member.id,'2026-10-05')}" selected`));
  await page.click('match-week-step',undefined,{step:'1'});
  assert.match(preview()[1],/value="2" selected/);
  await page.submit();assert.equal(page.error.textContent,'');
  const after=page.getWorkspace().published;
  assert.deepEqual(after.teams[0].versions.find(v=>v.id===old.id),old);
  for(const date of model.weekDates('2026-10-12'))assert.deepEqual(model.getShift(after,group.id,member.id,date),model.getShift(before.published,group.id,member.id,date));
});

test('rotation matching shows a midweek transfer only in the current group without changing its loop on save',async()=>{
  const state=model.organizeState(model.seedState()),night=state.teams[0];
  night.name='Natt';
  night.members[0].name='Rickard';state.employees[0].name='Rickard';
  const plus={...structuredClone(night),id:'night-plus',name:'Natt+',members:[]};
  for(const version of plus.versions)version.positions={};
  state.teams.push(plus);
  model.placeEmployee(state,'member-1',night.workTeamId,plus.id,'2026-10-23');
  model.useLoopingSchedules(state);
  const page=await openApp('admin',{working:state,published:model.publishState(state),revision:1},new Map(),'?date=2026-10-23');
  page.setToday('2026-10-23');
  await page.click('admin');await page.submit('lirrydoz');await page.click('admin-tab',undefined,{tab:'rotation'});
  await page.click('match-rotation');
  assert.doesNotMatch(page.dialog.innerHTML,/data-member="member-1"/);
  assert.match(page.dialog.innerHTML,/data-member="member-2"/);
  assert.match(page.dialog.innerHTML,/personer som tillhör gruppen idag/);
  // Changing the comparison week must not reintroduce former group members.
  await page.change({id:'match-week-select',value:'2026-10-12'});
  assert.doesNotMatch(page.dialog.innerHTML,/data-member="member-1"/);
  await page.change({id:'',classList:{contains:name=>name==='match-position'},dataset:{member:'member-2'},value:'4'});
  await page.click('match-week-step',undefined,{step:'2'});
  assert.doesNotMatch(page.dialog.innerHTML,/data-member="member-1"/);
  await page.submit();assert.equal(page.error.textContent,'');
  const saved=page.getWorkspace().published;
  for(let offset=0;offset<11;offset++){
    const date=model.addDays('2026-10-12',offset);
    assert.deepEqual(model.getShift(saved,night.id,'member-1',date),model.getShift(state,night.id,'member-1',date));
    assert.deepEqual(model.getShift(saved,plus.id,'member-1',date),model.getShift(state,plus.id,'member-1',date));
  }
  assert.deepEqual(saved.teams.find(group=>group.id===plus.id),plus);
  await page.change({id:'admin-team-select',value:plus.id});
  await page.click('match-rotation');
  assert.match(page.dialog.innerHTML,/<label>Rickard<select class="match-position" data-member="member-1"/);
  assert.doesNotMatch(page.dialog.innerHTML,/data-member="member-2"/);
  await page.change({id:'match-week-select',value:'2026-10-12'});
  assert.match(page.dialog.innerHTML,/data-member="member-1"/);
});

test('rotation matching excludes ended and unassigned employees but ignores registration dates for loops',async()=>{
  const state=model.organizeState(model.seedState());
  state.employees[0].activeUntil='2026-10-23';
  state.employees[1].activeFrom='2026-10-24';
  model.placeEmployee(state,'member-3',null,null,'2026-10-23');
  const page=await openApp('admin',{working:state,published:model.publishState(state),revision:1});
  page.setToday('2026-10-23');
  await page.click('admin');await page.submit('lirrydoz');await page.click('match-rotation');
  for(const id of ['member-1','member-3'])assert.ok(!page.dialog.innerHTML.includes(`data-member="${id}"`));
  assert.match(page.dialog.innerHTML,/data-member="member-2"/);
  assert.match(page.dialog.innerHTML,/data-member="member-4"/);
});

test('the roster uses the current group for the whole week and recurring editors have no start-date controls',async()=>{
  const state=model.organizeState(model.seedState()),old=state.teams[0];
  old.members[0].name='Rickard';state.employees[0].name='Rickard';
  old.members[0].activeFrom='2026-10-16';state.employees[0].activeFrom='2026-10-16';
  state.employees[0].placements[0].from='2026-10-16';
  const group={...structuredClone(old),id:'night-plus',name:'Natt+',members:[]};
  const version=group.versions[0];
  version.effectiveFrom='2026-10-26';version.referenceMonday='2026-10-19';version.positions={};
  version.rotation=[['V2','V2','','','','','V3']];
  version.shifts.V2={start:'19:04',end:'06:30',color:'rose'};
  version.shifts.V3={start:'19:04',end:'06:30',color:'red'};
  state.teams.push(group);
  model.placeEmployee(state,'member-1',old.workTeamId,group.id,'2026-10-23');
  const page=await openApp('admin',{working:state,published:model.publishState(state),revision:1},new Map(),'?date=2026-10-23');
  page.setToday('2026-10-23');
  const checkRow=()=>{
    const rows=page.app.innerHTML.match(/<tbody class="roster-person">.*?<\/tbody>/gs).filter(row=>row.includes('<span>Rickard<'));
    assert.equal(rows.length,1);
    const cells=rows[0].match(/<td\b[^>]*>.*?<\/td>/gs);
    assert.doesNotMatch(rows[0],/Ej aktiv/);
    for(const day of [0,1])assert.match(cells[day],/<b>V2<\/b>/);
    for(const day of [2,3,4,5])assert.match(cells[day],/Ledig/);
    assert.match(cells[6],/<b>V3<\/b>/);
  };
  checkRow();
  await page.click('navigate',undefined,{step:'-1'});checkRow(); // Registration week, 12–18 October.
  await page.click('navigate',undefined,{step:'-1'});checkRow(); // Entirely before registration.
  await page.click('navigate',undefined,{step:'3'});checkRow();
  await page.click('admin');await page.submit('lirrydoz');await page.click('admin-tab',undefined,{tab:'rotation'});
  await page.change({id:'admin-team-select',value:group.id});
  assert.match(page.app.innerHTML,/Schemat loopar utan start- eller slutdatum/);
  assert.doesNotMatch(page.app.innerHTML,/Ändra startdatum|Gäller från måndag|version-dates/);
  await page.click('add-team');
  assert.doesNotMatch(page.dialog.innerHTML,/name="date"|Börjar på måndag/);
  await page.submit({name:'Loopgrupp',length:'2'});
  assert.equal(page.error.textContent,'');
  const created=page.getWorkspace().working.teams.find(item=>item.name==='Loopgrupp');
  assert.equal(created.loopSchedule,true);
  assert.equal(created.versions[0].rotation.length,2);
  await page.click('person-schedule',undefined,{member:'member-1'});
  assert.doesNotMatch(page.dialog.innerHTML,/id="personal-start-week"|type="date" name="effectiveFrom"/);
  assert.match(page.dialog.innerHTML,/upprepas varje varv utan startdatum/);
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

test('shared passes save across groups, reopen after reload and are inherited by new groups', async () => {
  const state=model.organizeState(model.seedState()), group=state.teams[0];
  const sibling=structuredClone(group);sibling.id='night';sibling.name='Natt';sibling.members=[];
  for(const version of sibling.versions){version.positions={};version.shifts.N={start:'22:00',end:'06:00',color:'blue'};version.rotation[0][0]='N';}
  state.teams.push(sibling);
  const page=await openApp('admin',{working:state,published:model.publishState(state),revision:1});
  await page.click('admin');await page.submit('lirrydoz');await page.click('admin-tab',undefined,{tab:'rotation'});
  assert.match(page.app.innerHTML,/Gemensamma pass för alla grupper i teamet/);
  assert.match(page.app.innerHTML,/data-action="edit-shift" data-code="N"/);
  await page.click('edit-shift',undefined,{code:'N'});
  await page.submit({code:'NATT',start:'21:00',end:'06:00',color:'purple'});
  assert.equal(page.error.textContent,'');
  let saved=page.getWorkspace();
  for(const snapshot of [saved.working,saved.published])for(const target of snapshot.teams){
    assert.equal(target.versions[0].shifts.NATT.start,'21:00');
    assert.equal(target.versions[0].shifts.N,undefined);
  }
  await page.change({id:'admin-team-select',value:'night'});
  assert.match(page.app.innerHTML,/<option value="NATT" selected>NATT<\/option>/);
  const beforeFailure=page.getWorkspace();
  await page.click('edit-shift',undefined,{code:'NATT'});page.failPublish('Kunde inte spara');
  await page.submit({code:'N2',start:'20:00',end:'06:00',color:'blue'});
  assert.equal(page.dialog.open,true);assert.equal(page.error.textContent,'Kunde inte spara');
  assert.deepEqual(page.getWorkspace(),beforeFailure);
  page.failPublish(null);await page.click('close-modal');
  await page.click('add-team');await page.submit({name:'Ny grupp',length:'1',date:'2026-10-12'});
  assert.equal(page.error.textContent,'');saved=page.getWorkspace();
  const created=saved.working.teams.find(item=>item.name==='Ny grupp');
  assert.deepEqual(created.versions[0].shifts,saved.working.workTeams[0].shifts);
  assert.deepEqual(created.versions[0].rotation,[Array(7).fill('')]);
  const reloaded=await openApp('admin',saved);
  await reloaded.click('admin');await reloaded.submit('lirrydoz');await reloaded.click('admin-tab',undefined,{tab:'rotation'});
  await reloaded.change({id:'admin-team-select',value:created.id});
  await reloaded.click('edit-shift',undefined,{code:'NATT'});
  assert.match(reloaded.dialog.innerHTML,/value="21:00"/);
});

test('a new team starts with its own empty pass list instead of copying another team', async () => {
  const page=await openApp();await page.click('admin');await page.submit('lirrydoz');
  await page.click('admin-tab',undefined,{tab:'rotation'});
  await page.click('add-work-team');await page.submit({name:'Nytt team'});
  await page.click('add-team');await page.submit({name:'Första grupp',length:'1',date:'2026-10-12',copy:true});
  assert.equal(page.error.textContent,'');
  const state=page.getWorkspace().working,team=state.workTeams.find(item=>item.name==='Nytt team');
  assert.deepEqual(team.shifts,{});
  assert.deepEqual(state.teams.find(item=>item.workTeamId===team.id).versions[0].rotation,[Array(7).fill('')]);
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

test('team and group cog buttons open settings and rename only the selected item',async()=>{
  const state=model.organizeState(model.seedState()),original=state.workTeams[0];
  state.workTeams.push({id:'second-team',name:'Avfall & service',departmentId:state.departments[0].id});
  const group=structuredClone(state.teams[0]);group.id='second-group';group.name='Kväll';group.workTeamId='second-team';group.members=[];group.versions.forEach(version=>{version.positions={};});state.teams.push(group);
  const page=await openApp('admin',{working:state,published:model.publishState(state),revision:1});
  await page.click('admin');await page.submit('lirrydoz');await page.click('admin-tab',undefined,{tab:'rotation'});
  assert.match(page.app.innerHTML,/<button[^>]*data-action="work-team-settings"[^>]*aria-label="Teaminställningar"[^>]*aria-haspopup="dialog"/);
  assert.match(page.app.innerHTML,/<button[^>]*data-action="settings"[^>]*aria-label="Gruppinställningar"[^>]*aria-haspopup="dialog"/);
  assert.doesNotMatch(page.app.innerHTML,/data-action="rename-work-team"|>Byt namn på grupp</);
  await page.change({id:'work-team-select',value:'second-team'});await page.click('work-team-settings');
  assert.match(page.dialog.innerHTML,/Teaminställningar/);
  assert.match(page.dialog.innerHTML,/value="Avfall &amp; service"/);
  assert.match(page.dialog.innerHTML,/data-action="delete-work-team" data-team="second-team"/);
  await page.submit({name:'   '});assert.equal(page.error.textContent,'Ange ett teamnamn.');assert.equal(page.dialog.open,true);
  await page.submit({name:'Nytt teamnamn'});assert.equal(page.error.textContent,'');
  assert.equal(page.getWorkspace().published.workTeams.find(team=>team.id==='second-team').name,'Nytt teamnamn');
  assert.equal(page.getWorkspace().published.workTeams.find(team=>team.id===original.id).name,original.name);
  assert.equal(page.getWorkspace().published.teams.find(item=>item.id===group.id).name,'Kväll');
  await page.click('settings');assert.match(page.dialog.innerHTML,/Gruppinställningar/);assert.match(page.dialog.innerHTML,/value="Kväll"/);
  await page.submit({name:'Nytt gruppnamn'});assert.equal(page.error.textContent,'');
  assert.equal(page.getWorkspace().published.teams.find(item=>item.id===group.id).name,'Nytt gruppnamn');
  assert.equal(page.getWorkspace().published.workTeams.find(team=>team.id==='second-team').name,'Nytt teamnamn');
});

test('work team deletion requires confirmation, can be cancelled and keeps staff when deleting the last team',async()=>{
  const state=model.organizeState(model.seedState()),id=state.workTeams[0].id;
  const page=await openApp('admin',{working:state,published:model.publishState(state),revision:1});
  await page.click('work-team-settings');await page.click('delete-work-team',undefined,{team:id});assert.equal(page.dialog.open,false);
  await page.click('admin');await page.submit('lirrydoz');await page.click('admin-tab',undefined,{tab:'rotation'});
  await page.click('work-team-settings');await page.click('delete-work-team',undefined,{team:id});
  assert.match(page.dialog.innerHTML,/Ta bort team\?/);
  assert.match(page.dialog.innerHTML,/1 grupp och dess schema/);
  assert.match(page.dialog.innerHTML,/Personalen finns kvar i avdelningen/);
  assert.match(page.dialog.innerHTML,/class="primary-btn danger-btn" type="submit">Ta bort team/);
  const before=page.getWorkspace();await page.click('close-modal');assert.deepEqual(page.getWorkspace(),before);
  await page.click('work-team-settings');await page.click('delete-work-team',undefined,{team:id});
  page.failPublish('Kunde inte ta bort teamet');await page.submit();
  assert.equal(page.error.textContent,'Kunde inte ta bort teamet');assert.equal(page.dialog.open,true);assert.deepEqual(page.getWorkspace(),before);
  page.failPublish(null);await page.submit();assert.equal(page.error.textContent,'');assert.equal(page.dialog.open,false);
  for(const snapshot of [page.getWorkspace().working,page.getWorkspace().published]){
    assert.deepEqual(snapshot.workTeams,[]);assert.deepEqual(snapshot.teams,[]);assert.equal(snapshot.employees.length,7);
  }
  assert.match(page.app.innerHTML,/Skapa avdelningens första team/);
  assert.doesNotMatch(page.app.innerHTML,/data-action="work-team-settings"|data-action="settings"|data-team-active=/);
  await page.click('admin-tab',undefined,{tab:'people'});assert.match(page.app.innerHTML,/Ej placerade/);
  assert.equal((page.app.innerHTML.match(/class="staff-person-card"/g)||[]).length,7);
  const reloaded=await openApp('admin',page.getWorkspace(),new Map(),'?date=2026-10-14',new Map([['skift-admin-remembered','true']]));
  await reloaded.click('admin');await reloaded.click('admin-tab',undefined,{tab:'rotation'});assert.match(reloaded.app.innerHTML,/Skapa avdelningens första team/);
});

test('removing the selected work team falls back to another team and viewers cannot open its settings',async()=>{
  const state=model.useLoopingSchedules(model.seedState()),first=state.workTeams[0];
  state.workTeams.push({id:'empty-team',name:'Tomt team',departmentId:state.departments[0].id});
  const page=await openApp('admin',{working:state,published:model.publishState(state),revision:1});
  await page.click('admin');await page.submit('lirrydoz');await page.click('admin-tab',undefined,{tab:'rotation'});
  await page.change({id:'work-team-select',value:'empty-team'});
  assert.match(page.app.innerHTML,/data-action="work-team-settings"/);assert.doesNotMatch(page.app.innerHTML,/data-action="settings"/);
  await page.click('work-team-settings');await page.click('delete-work-team',undefined,{team:'empty-team'});await page.submit();
  assert.equal(page.error.textContent,'');assert.match(page.app.innerHTML,new RegExp(`value="${first.id}" selected`));
  assert.match(page.app.innerHTML,/data-action="settings"/);assert.deepEqual(page.getWorkspace().working.teams,state.teams);
  const viewer=await openApp('viewer');
  for(const action of ['work-team-settings','delete-work-team','settings','delete-team'])await viewer.click(action);
  assert.equal(viewer.dialog.open,false);
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
  const before=model.useLoopingSchedules(page.getWorkspace().working).teams[0];
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
  page.openException({memberId:'member-1',date:'2026-10-16'});
  await page.submit({member:'member-1',type:'vacation',replacement:'',note:''});
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

test('department-wide absence selection includes every team, persists and keeps new changes in the correct group',async()=>{
  const state=model.organizeState(model.seedState()),first=state.teams[0],department=state.departments[0];
  department.name='Transport Centralen';
  state.departments.push({id:'elsewhere',name:'Annan avdelning'});
  state.workTeams.push({id:'second-team',name:'Avfall',departmentId:department.id},{id:'foreign-team',name:'Externt team',departmentId:'elsewhere'});
  for(const [id,workTeamId] of [['second-group','second-team'],['foreign-group','foreign-team']]){
    const group=structuredClone(first);group.id=id;group.workTeamId=workTeamId;group.members=[];group.versions.forEach(version=>{version.positions={};});state.teams.push(group);
  }
  state.employees.push({id:'foreign-person',name:'Utomstående',role:'member',departmentId:'elsewhere',activeFrom:'2026-01-01',placements:[]});
  model.placeEmployee(state,'member-2','second-team','second-group','2026-10-12');
  model.placeEmployee(state,'foreign-person','foreign-team','foreign-group','2026-10-12');
  state.exceptions=[
    {id:'first-absence',teamId:first.id,memberId:'member-1',date:'2026-10-14',type:'sick'},
    {id:'second-absence',teamId:'second-group',memberId:'member-2',date:'2031-10-14',type:'sick'},
    {id:'foreign-absence',teamId:'foreign-group',memberId:'foreign-person',date:'2035-10-14',type:'leave'},
  ];
  const navigation=new Map(),page=await openApp('admin',{working:state,published:model.publishState(state),revision:1},new Map(),'?date=2026-10-14',navigation);
  const scope='dept:'+department.id,selector=()=>page.app.innerHTML.match(/id="work-team-select">(.*?)<\/select>/s)[1];
  await page.click('admin');await page.submit('lirrydoz');await page.click('admin-tab',undefined,{tab:'changes'});
  assert.ok(selector().includes('value="'+scope+'"'));assert.match(selector(),/>Transport Centralen<\/option>/);
  assert.match(page.app.innerHTML,/data-id="first-absence"/);assert.doesNotMatch(page.app.innerHTML,/data-id="second-absence"/);
  await page.change({id:'work-team-select',value:scope});
  assert.ok(selector().includes('value="'+scope+'" selected'));
  assert.match(page.app.innerHTML,/data-id="first-absence"/);assert.match(page.app.innerHTML,/data-id="second-absence"/);assert.doesNotMatch(page.app.innerHTML,/data-id="foreign-absence"/);
  const years=page.app.innerHTML.match(/id="changes-year">(.*?)<\/select>/s)[1];
  assert.match(years,/2026/);assert.match(years,/2031/);assert.doesNotMatch(years,/2035/);
  await page.input({id:'changes-search',value:'Anna'});
  assert.match(page.app.innerHTML,/data-id="second-absence"/);assert.doesNotMatch(page.app.innerHTML,/data-id="first-absence"/);
  await page.click('changes-reset');
  await page.click('exception');assert.match(page.dialog.innerHTML,/value="member-2"/);assert.doesNotMatch(page.dialog.innerHTML,/value="foreign-person" selected/);await page.click('close-modal');
  await page.click('admin-tab',undefined,{tab:'rotation'});assert.ok(!selector().includes('value="'+scope+'"'));
  await page.click('admin-tab',undefined,{tab:'changes'});assert.ok(selector().includes('value="'+scope+'" selected'));
  const reloaded=await openApp('admin',page.getWorkspace(),new Map(),'?date=2026-10-14',navigation);
  assert.ok(reloaded.app.innerHTML.includes('value="'+scope+'" selected'));
  assert.match(reloaded.app.innerHTML,/data-id="first-absence"/);assert.match(reloaded.app.innerHTML,/data-id="second-absence"/);
  reloaded.openException({memberId:'member-2',date:'2026-10-16'});await reloaded.submit({type:'leave',replacement:'',note:''});
  assert.equal(reloaded.error.textContent,'');
  assert.equal(reloaded.getWorkspace().working.exceptions.find(entry=>entry.memberId==='member-2'&&entry.date==='2026-10-16').teamId,'second-group');
  await reloaded.change({id:'work-team-select',value:'second-team'});
  assert.match(reloaded.app.innerHTML,/data-id="second-absence"/);assert.doesNotMatch(reloaded.app.innerHTML,/data-id="first-absence"/);
  await reloaded.change({id:'work-team-select',value:scope});await reloaded.change({id:'department-select',value:'elsewhere'});
  assert.match(reloaded.app.innerHTML,/<option value="dept:elsewhere" selected>Annan avdelning<\/option>/);
  assert.match(reloaded.app.innerHTML,/data-id="foreign-absence"/);assert.doesNotMatch(reloaded.app.innerHTML,/data-id="first-absence"|data-id="second-absence"/);
});

test('51 people with 20 vacation dates each render compactly and can be searched, paged and filtered', async () => {
  const state=model.seedState(),group=state.teams[0],template=group.members[0];
  group.members=Array.from({length:51},(_,i)=>({...template,id:'person-'+(i+1),name:'Person '+String(i+1).padStart(2,'0')}));
  for(const version of group.versions)version.positions=Object.fromEntries(group.members.map(member=>[member.id,1]));
  state.exceptions=group.members.flatMap(member=>Array.from({length:20},(_,i)=>({id:member.id+'-day-'+i,teamId:group.id,memberId:member.id,date:model.addDays('2027-07-01',i),type:'vacation'})));
  model.organizeState(state);
  const preferences=new Map(),navigation=new Map([['skift-admin-remembered','true']]);
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
  const preferences=new Map(),navigation=new Map([['skift-admin-remembered','true']]);
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

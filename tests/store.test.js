import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultWorkspace } from './fixtures/workspace.js';
import { defaultWorkspace as hostedWorkspace } from '../src/default-data.js';
import { init, saveDraft, publish, importData } from '../src/store.js';
import { getShift, deleteTeam, validateState, organizeState, seedState, savePersonalSchedule } from '../src/model.js';

test('personal schedules publish, persist and reach another device on the hosted site',async t=>{
  const memory=new Map();
  const replaceGlobal=(key,value)=>{
    const original=Object.getOwnPropertyDescriptor(globalThis,key);
    Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
    t.after(()=>{if(original)Object.defineProperty(globalThis,key,original);else delete globalThis[key];});
  };
  replaceGlobal('localStorage',{getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,value)});
  replaceGlobal('location',{hostname:'schedule.example.test',protocol:'https:'});
  const store=await import('../src/store.js?personal-publication');
  await store.init();
  const state=organizeState(seedState()),group=state.teams[0],version=group.versions[0];
  const rotation=version.rotation.map(()=>Array(7).fill(null));
  rotation[0][0]={type:'leave'};rotation[0][1]={type:'off'};rotation[0][2]={type:'custom',start:'08:00',end:'12:00'};
  savePersonalSchedule(state,group.id,version.id,{memberId:'member-1',effectiveFrom:'2026-10-12',employmentPercent:80,rotation});
  const saved=await store.publish(state);
  assert.equal(getShift(saved.published,group.id,'member-1','2026-10-12').type,'leave');
  assert.equal(getShift((await store.init()).published,group.id,'member-1','2026-10-13').working,false);
  const fetchMock=t.mock.method(globalThis,'fetch',async()=>({ok:true,text:async()=>`export const defaultWorkspace = ${JSON.stringify(saved)};`}));
  memory.clear(); // Another device still has the originally shipped defaults.
  const reader=await import('../src/store.js?personal-hosted-reader');
  await reader.init();
  const refreshed=await reader.refresh();
  assert.equal(getShift(refreshed.published,group.id,'member-1','2026-10-12').type,'leave');
  assert.equal(getShift(refreshed.published,group.id,'member-1','2026-10-13').working,false);
  assert.equal(getShift(refreshed.published,group.id,'member-1','2026-10-14').end,'12:00');
  assert.equal(getShift(refreshed.published,group.id,'member-1','2026-12-28').type,'leave');
  assert.equal((await reader.init()).revision,saved.revision);
  assert.deepEqual(fetchMock.mock.calls[0].arguments[1],{cache:'no-store'});
});

test('existing browser schedules receive the start-date correction once without losing edits', async () => {
  const saved = structuredClone(defaultWorkspace);
  saved.revision += 10;
  for (const state of [saved.working, saved.published]) {
    for (const member of state.teams[0].members.slice(7)) member.activeFrom = '2026-10-13';
  }
  saved.working.teams[0].name = 'Lokalt teamnamn';
  saved.working.teams[0].members[0].activeFrom = '2026-10-13';
  saved.working.teams[0].members[7].activeUntil = '2026-11-01';
  saved.working.teams[0].members[8].activeFrom = '2026-10-14';
  const expected = structuredClone(saved);
  for (const state of [expected.working, expected.published]) {
    for (const member of state.teams[0].members.slice(7)) {
      if (member.activeFrom === '2026-10-13') member.activeFrom = '2026-10-12';
    }
  }
  for (const entry of expected.published.exceptions) {
    const original = expected.working.exceptions.find(item => item.id === entry.id);
    if (entry.type === 'off' && original && ['vacation', 'sick', 'leave', 'pension'].includes(original.type) && !original.start && !original.end) entry.type = original.type;
  }
  const memory = new Map([['skift-workspace-v1', JSON.stringify(saved)]]);
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value: {
    getItem: key => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, value),
  } });
  try {
    const result = await init();
    assert.deepEqual(result.working, expected.working);
    assert.deepEqual(result.published, expected.published);
    assert.equal(result.revision, saved.revision);
    assert.deepEqual(JSON.parse(memory.get('skift-workspace-v1')).working, expected.working);
    const memberId = result.published.teams[0].members[7].id;
    assert.equal(getShift(result.published, 'team-1', memberId, '2026-10-12').code, 'B');
    assert.equal(getShift(result.published, 'team-1', memberId, '2026-10-11').working, false);

    // A later deliberate change to the same date must survive reload and publishing.
    const draft = structuredClone(result.published);
    draft.teams[0].members[7].activeFrom = '2026-10-13';
    await saveDraft(draft);
    assert.equal((await init()).working.teams[0].members[7].activeFrom, '2026-10-13');
    await publish(draft);
    assert.equal((await init()).published.teams[0].members[7].activeFrom, '2026-10-13');
  } finally {
    if (originalStorage === undefined) delete globalThis.localStorage;
    else Object.defineProperty(globalThis, 'localStorage', originalStorage);
  }
});

test('publishing and importing update the visible schedule while hiding private notes', async t => {
  const memory = new Map();
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value: {
    getItem: key => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, value),
  } });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete globalThis.localStorage;
  });
  const state = (await init()).working;
  state.teams[0].name = 'Direkt sparat';
  state.exceptions.push({ id: 'private-absence', teamId: 'team-1', memberId: 'member-2', date: '2026-10-14', type: 'sick', note: 'Privat anteckning' });
  const result = await publish(state);
  assert.equal(result.published.teams[0].name, 'Direkt sparat');
  assert.equal(result.working.exceptions.at(-1).note, 'Privat anteckning');
  assert.equal(result.published.exceptions.at(-1).type, 'sick');
  assert.equal(result.published.exceptions.at(-1).note, undefined);
  state.teams[0].name = 'Direkt importerat';
  await importData(state);
  assert.equal((await init()).published.teams[0].name, 'Direkt importerat');
  const before = memory.get('skift-workspace-v1');
  state.teams[0].versions[0].shifts.A.end = state.teams[0].versions[0].shifts.A.start;
  await assert.rejects(() => publish(state));
  assert.equal(memory.get('skift-workspace-v1'), before);
});

test('older draft deletions are removed from the saved public schedule and stay removed on reload', async t => {
  for (const removeLastTeam of [false, true]) {
    await t.test(removeLastTeam ? 'last team' : 'one of several teams', async t => {
      const saved = structuredClone(defaultWorkspace);
      saved.revision += 20;
      if (!removeLastTeam) {
        const otherTeam = {
          id: 'remaining-team', name: 'Kvarvarande team', color: '#356e58',
          members: [{ id: 'remaining-member', name: 'Kollega', role: 'part-time', activeFrom: '2026-01-05' }],
          versions: [{ id: 'other-version', effectiveFrom: '2026-01-05', referenceMonday: '2026-01-05', rotation: [Array(7).fill('')], shifts: {}, positions: {} }],
        };
        for (const state of [saved.working, saved.published]) {
          state.teams.push(structuredClone(otherTeam));
          state.exceptions.push({ id: 'cross-team-cover', teamId: otherTeam.id, memberId: 'remaining-member', date: '2026-10-14', type: 'off', replacementId: 'member-1', replacementStart: '07:00', replacementEnd: '16:00' });
        }
      }
      saved.working = deleteTeam(saved.working, 'team-1');
      if (!removeLastTeam) saved.working.teams[0].name = 'Äldre namnändring i utkast';
      const expected = deleteTeam(saved.published, 'team-1');
      const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
      const memory = new Map([['skift-workspace-v1', JSON.stringify(saved)]]);
      Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value: {
        getItem: key => memory.get(key) ?? null,
        setItem: (key, value) => memory.set(key, value),
      } });
      t.after(() => {
        if (original) Object.defineProperty(globalThis, 'localStorage', original);
        else delete globalThis.localStorage;
      });
      const result = await init();
      assert.deepEqual(result.working, saved.working);
      assert.deepEqual(result.published.teams, expected.teams);
      assert.deepEqual(result.published.exceptions, expected.exceptions);
      assert.deepEqual(validateState(result.published), []);
      assert.equal(result.revision, saved.revision + 1);
      assert.deepEqual(JSON.parse(memory.get('skift-workspace-v1')).published, result.published);
      const reloaded = await init();
      assert.deepEqual(reloaded.published, result.published);
      assert.equal(reloaded.revision, result.revision);
    });
  }
});

test('local refresh loads coworkers saved in another tab and newer preview files', async t => {
  const memory = new Map();
  const replaceGlobal = (key, value) => {
    const original = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    t.after(() => {
      if (original) Object.defineProperty(globalThis, key, original);
      else delete globalThis[key];
    });
  };
  replaceGlobal('localStorage', {
    getItem: key => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, value),
  });
  replaceGlobal('location', { hostname: '127.0.0.1', port: '5173' });
  let remote = structuredClone(hostedWorkspace);
  const fileResponse = value => ({ ok: true, text: async () => `export const defaultWorkspace = ${JSON.stringify(value)};\n` });
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => fileResponse(remote));
  const store = await import('../src/store.js?refresh-tests');
  const initial = await store.init();

  const otherTab = structuredClone(initial);
  otherTab.revision++;
  otherTab.published.teams[0].members.push({ id: 'new-coworker', name: 'Ny kollega', activeFrom: '2026-10-12' });
  memory.set('skift-workspace-v1', JSON.stringify(otherTab));
  assert.equal((await store.refresh()).published.teams[0].members.at(-1).name, 'Ny kollega');

  remote = structuredClone(otherTab);
  remote.revision++;
  remote.published.teams[0].members.push({ id: 'file-coworker', name: 'Från filen', activeFrom: '2026-10-12' });
  assert.equal((await store.refresh()).published.teams[0].members.at(-1).name, 'Från filen');
  assert.equal((await store.init()).published.teams[0].members.at(-1).name, 'Från filen');
  assert.equal(JSON.parse(memory.get('skift-workspace-v1')).revision, remote.revision);
  assert.equal(fetchMock.mock.calls[0].arguments[0].href, new URL('../src/default-data.js', import.meta.url).href);
  assert.deepEqual(fetchMock.mock.calls[0].arguments[1], { cache: 'no-store' });

  const current = await store.init();
  remote = structuredClone(hostedWorkspace); // An older file must not remove coworkers.
  assert.deepEqual((await store.refresh()).published, current.published);
  fetchMock.mock.mockImplementation(async () => { throw new Error('Offline'); });
  assert.deepEqual((await store.refresh()).published, current.published);

  let resolveFetch;
  fetchMock.mock.mockImplementation(() => new Promise(resolve => { resolveFetch = resolve; }));
  const pending = store.refresh();
  const draft = structuredClone(current.working);
  draft.teams[0].name = 'Sparat medan uppdateringen pågick';
  // Disable file sync for this save; only the pending GET is under test.
  globalThis.location = { hostname: 'example.test' };
  await store.saveDraft(draft);
  resolveFetch(fileResponse({ ...remote, revision: current.revision + 10 }));
  assert.equal((await pending).working.teams[0].name, draft.teams[0].name);
});

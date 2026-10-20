import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import * as model from '../src/model.js';
import { defaultWorkspace } from './fixtures/workspace.js';

async function openApp(preferences = new Map()) {
  const state = model.organizeState(model.seedState());
  let saved = { working: state, published: model.publishState(state), revision: 1, mode: 'demo', role: 'admin' };
  const listeners = {};
  const app = { innerHTML: '' };
  const elements = { '#app': app, '#toast': {}, '#modal': { addEventListener() {} } };

  const context = vm.createContext({
    model,
    store: {
      init: async () => structuredClone(saved),
      publish: async working => {
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
    location: { search: '' },
    localStorage: {
      getItem: key => preferences.get(key) || null,
      setItem: (key, value) => preferences.set(key, value),
    },
    sessionStorage: { getItem: () => null, setItem() {} },
    URLSearchParams, Intl, structuredClone,
    Date,
    FormData: class {},
    setInterval() {}, setTimeout() {}, clearTimeout() {},
  });

  const source = (await readFile(new URL('../src/app.js', import.meta.url), 'utf8'))
    .replace(/^import .*;\r?\n/gm, '');
  await vm.runInContext(`(async () => { ${source}\n })()`, context);

  return {
    app,
    preferences,
    click: (action, view, extra = {}) => listeners.click({ target: { closest: () => ({ dataset: { action, view, ...extra } }) } }),
  };
}

test('staff columns render with data-column-id, draggable headings, drag handles and collapse icon', async () => {
  const preferences = new Map([['skift-admin-remembered', 'true']]);
  const page = await openApp(preferences);
  await page.click('admin');

  assert.match(page.app.innerHTML, /class="staff-column\s*"/);
  assert.match(page.app.innerHTML, /data-column-id="work-team-1"/);
  assert.match(page.app.innerHTML, /data-column-id="hourly"/);
  assert.match(page.app.innerHTML, /class="staff-column-heading"[^>]*draggable="true"/);
  assert.match(page.app.innerHTML, /class="staff-drag-handle"[^>]*>⠿<\/span>/);
  assert.match(page.app.innerHTML, /class="staff-collapse-icon"/);
  assert.match(page.app.innerHTML, /aria-expanded="true"/);
});

test('staff columns restore custom order from browser localStorage memory', async () => {
  // Put 'hourly' first, then 'work-team-1'
  const customOrder = ['hourly', 'work-team-1'];
  const preferences = new Map([
    ['skift-admin-remembered', 'true'],
    ['skift-staff-columns-department-default', JSON.stringify(customOrder)],
  ]);
  const page = await openApp(preferences);
  await page.click('admin');

  const hourlyIndex = page.app.innerHTML.indexOf('data-column-id="hourly"');
  const teamIndex = page.app.innerHTML.indexOf('data-column-id="work-team-1"');

  assert.ok(hourlyIndex !== -1, 'hourly column should be present');
  assert.ok(teamIndex !== -1, 'work-team-1 column should be present');
  assert.ok(hourlyIndex < teamIndex, 'hourly column should appear before work-team-1 as saved in localStorage');
});

test('staff columns can be stacked under other staff columns in lanes', async () => {
  // Put 'hourly' under 'work-team-1' in lane 0
  const stackedOrder = [['work-team-1', 'hourly']];
  const preferences = new Map([
    ['skift-admin-remembered', 'true'],
    ['skift-staff-columns-department-default', JSON.stringify(stackedOrder)],
  ]);
  const page = await openApp(preferences);
  await page.click('admin');

  const lanes = page.app.innerHTML.split('<div class="staff-lane">').slice(1);
  const stackedLane = lanes.find(l => l.includes('data-column-id="work-team-1"') && l.includes('data-column-id="hourly"'));

  assert.ok(stackedLane, 'Both columns should be inside the same staff-lane');
  const teamPos = stackedLane.indexOf('data-column-id="work-team-1"');
  const hourlyPos = stackedLane.indexOf('data-column-id="hourly"');
  assert.ok(teamPos < hourlyPos, 'hourly should be placed under work-team-1 in that lane');
});

test('staff columns restore collapsed state from localStorage memory', async () => {
  const preferences = new Map([
    ['skift-admin-remembered', 'true'],
    ['skift-staff-collapsed-department-default', JSON.stringify(['hourly'])],
  ]);
  const page = await openApp(preferences);
  await page.click('admin');

  assert.match(page.app.innerHTML, /class="staff-column staff-column-collapsed"[^>]*data-column-id="hourly"/);
  assert.match(page.app.innerHTML, /aria-expanded="false"/);
});

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
    sessionStorage: { getItem: key => preferences.get(key) || null, setItem: (key, value) => preferences.set(key, value) },
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

test('staff columns render with data-column-id, pointer-driven headings, drag handles and collapse icon', async () => {
  const preferences = new Map([['skift-admin-remembered', 'true']]);
  const page = await openApp(preferences);
  await page.click('admin');

  assert.match(page.app.innerHTML, /class="staff-column\s*"/);
  assert.match(page.app.innerHTML, /data-column-id="work-team-1"/);
  assert.match(page.app.innerHTML, /data-column-id="hourly"/);
  assert.match(page.app.innerHTML, /class="staff-column-heading"[^>]*draggable="false"/);
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

async function dragHarness() {
  const source = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
  const listeners = new Map(), frames = new Map();
  let frameId = 0, saves = 0, collapses = 0;
  const classes = () => ({ add() {}, remove() {} });
  const rect = (left, top, width, height) => ({ left, top, right: left + width, bottom: top + height, width, height });
  const heading = {
    addEventListener() {}, removeEventListener() {}, setPointerCapture() {}, hasPointerCapture: () => false,
  };
  const column = {
    isConnected: true, classList: classes(), nextElementSibling: null,
    getBoundingClientRect: () => rect(0, 0, 280, 200),
    querySelector: () => heading,
    cloneNode: () => ({ classList: classes(), style: {}, setAttribute() {}, removeAttribute() {}, querySelectorAll: () => [], remove() {} }),
  };
  const other = { getBoundingClientRect: () => rect(300, 0, 280, 120) };
  const firstLane = { children: [column], lastElementChild: column, getBoundingClientRect: () => rect(0, 0, 280, 200) };
  const secondLane = { children: [other], lastElementChild: other, getBoundingClientRect: () => rect(300, 0, 280, 120), insertBefore(item, before) { this.children.splice(before ? this.children.indexOf(before) : this.children.length, 0, item); } };
  column.parentElement = firstLane;
  const board = {
    getBoundingClientRect: () => rect(0, 0, 600, 300),
    querySelectorAll: selector => selector === '.staff-lane' ? [firstLane, secondLane] : [column],
  };
  const context = vm.createContext({
    document: { querySelector: () => board, createElement: () => ({ style: {}, remove() {} }), body: { classList: classes(), append() {} } },
    window: { innerHeight: 800, scrollBy() {}, addEventListener: (type, fn) => listeners.set(type, fn), removeEventListener: type => listeners.delete(type) },
    requestAnimationFrame: fn => { frames.set(++frameId, fn); return frameId; },
    cancelAnimationFrame: id => frames.delete(id), setTimeout() {},
    toggleStaffColumnCollapse: () => collapses++, saveStaffColumnsOrder: () => saves++,
    extractStaffBoardLayout: () => [], pruneEmptyLanes() {}, layoutStaffBoard() {},
  });
  vm.runInContext('let staffDragSource = null, justDraggedStaff = false, cancelStaffDrag = null;\n' + source.slice(source.indexOf('function staffDropTarget('), source.indexOf('function bindRotationDrag(')) + '\nbindStaffColumnDrag();', context);
  const pointer = (x, y, extra = {}) => ({ clientX: x, clientY: y, pointerId: 1, isPrimary: true, button: 0, target: {}, preventDefault() {}, ...extra });
  return { column, other, board, heading, firstLane, secondLane, listeners, frames,
    target: (x, y) => context.staffDropTarget(board, column, x, y),
    down: () => heading.onpointerdown(pointer(100, 80)),
    move: (x, y, extra) => listeners.get('pointermove')?.(pointer(x, y, extra)),
    up: (x, y) => listeners.get('pointerup')?.(pointer(x, y)),
    get saves() { return saves; }, get collapses() { return collapses; },
  };
}

test('staff drop targets distinguish stacking, lane edges, no-op and outside drops', async () => {
  const h = await dragHarness();
  assert.equal(h.target(100, 80), null);
  assert.equal(h.target(700, 80), null);
  assert.equal(h.target(400, 20).before, h.other);
  assert.equal(h.target(400, 100).before, null);
  assert.equal(h.target(305, 80).edge, true);
  assert.equal(h.target(575, 80).after, true);
});

test('staff drag keeps layout stable until release, ignores other pointers and saves once', async () => {
  const h = await dragHarness();
  h.down();
  h.move(400, 100, { pointerId: 2 });
  assert.equal(h.frames.size, 0);
  h.move(400, 100);
  assert.equal(h.frames.size, 1);
  assert.equal(h.saves, 0);
  assert.deepEqual(h.secondLane.children, [h.other]);
  h.up(400, 100);
  assert.deepEqual(h.secondLane.children, [h.other, h.column]);
  assert.equal(h.saves, 1);
  assert.equal(h.frames.size, 0);
  assert.equal(h.listeners.size, 0);
  h.heading.onclick({ target: {} });
  assert.equal(h.collapses, 0, 'release click must not collapse the dragged column');
});

test('short clicks still collapse; Escape, cancellation and outside drops do not save', async () => {
  const click = await dragHarness();
  click.down(); click.move(103, 82); click.up(103, 82);
  click.heading.onclick({ target: {} });
  assert.equal(click.collapses, 1);
  for (const reason of ['escape', 'pointercancel', 'blur', 'outside']) {
    const h = await dragHarness();
    h.down(); h.move(400, 100);
    if (reason === 'escape') h.listeners.get('keydown')({ key: 'Escape', preventDefault() {} });
    else if (reason === 'outside') h.up(700, 100);
    else h.listeners.get(reason)();
    assert.equal(h.saves, 0, reason);
    assert.equal(h.frames.size, 0, reason);
    assert.equal(h.listeners.size, 0, reason);
  }
});

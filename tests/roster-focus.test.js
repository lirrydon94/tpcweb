import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import * as model from '../src/model.js';

async function openRoster(mobile = true) {
  const listeners = {}, timers = new Map();
  let names = [], html = '', timerId = 0, resize;
  const viewport = { matches: mobile, addEventListener: (_, fn) => { resize = fn; } };
  const app = {
    get innerHTML() { return html; },
    set innerHTML(value) {
      html = value;
      names.forEach(name => { name.isConnected = false; });
      names = [...value.matchAll(/data-roster-member="([^"]+)"/g)].map(([, id]) => {
        const row = { hidden: false };
        return {
          dataset: { rosterMember: id }, isConnected: true, row,
          closest(selector) { return selector === 'tbody' ? row : selector === '[data-roster-member]' ? this : null; },
          setAttribute(key, value) { this[key] = value; },
        };
      });
    },
  };
  const modal = { open: false, close() {}, addEventListener() {} };
  const state = model.organizeState(model.seedState());
  const context = vm.createContext({
    model, store: { init: async () => ({ working: state, published: model.publishState(state), role: 'viewer', mode: 'demo' }) },
    document: {
      querySelector: selector => ({ '#app': app, '#modal': modal }[selector]),
      querySelectorAll: () => names,
      addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    },
    window: { matchMedia: () => viewport, addEventListener() {}, scrollTo() {} },
    location: { search: '?date=2026-10-14' },
    localStorage: { getItem: () => null, setItem() {} },
    sessionStorage: { getItem: () => null, setItem() {} },
    URLSearchParams, Intl, Date, structuredClone,
    setTimeout(fn, ms) { timers.set(++timerId, { fn, ms }); return timerId; },
    clearTimeout(id) { timers.delete(id); }, setInterval() {},
  });
  const source = (await readFile(new URL('../src/app.js', import.meta.url), 'utf8')).replace(/^import .*;\r?\n/gm, '');
  await vm.runInContext(`(async () => { ${source}\n })()`, context);
  assert.match(html, /roster-table/);
  return {
    app, get names() { return names; },
    get visible() { return names.filter(name => !name.row.hidden); },
    async send(type, target = names[0], extra = {}) {
      const event = { target, pointerId: 1, pointerType: 'touch', isPrimary: true, clientX: 20, clientY: 20, preventDefault() {}, ...extra };
      for (const listener of listeners[type] || []) await listener(event);
    },
    hold() { for (const [id, timer] of timers) if (timer.ms === 500) { timers.delete(id); timer.fn(); } },
    resize(value) { viewport.matches = value; resize(); },
  };
}

test('mobile hold isolates one person, release keeps focus, next tap restores everyone', async () => {
  const page = await openRoster(), count = page.names.length, name = page.names[2];
  assert.ok(count > 2);
  await page.send('pointerdown', name);
  page.hold();
  assert.deepEqual(page.visible, [name]);
  assert.equal(name['aria-pressed'], 'true');
  await page.send('pointerup', name);
  await page.send('click', name);
  assert.deepEqual(page.visible, [name]);
  await page.send('pointerdown', name);
  await page.send('pointerup', name);
  await page.send('click', name);
  assert.equal(page.visible.length, count);
});

test('short taps, movement, cancellation and scrolling do not activate focus', async () => {
  for (const interruption of ['pointerup', 'pointermove', 'pointercancel', 'scroll']) {
    const page = await openRoster(), count = page.names.length;
    await page.send('pointerdown');
    await page.send(interruption, page.names[0], { clientX: 40 });
    page.hold();
    await page.send('click');
    assert.equal(page.visible.length, count, interruption);
  }
});

test('focus survives week navigation and clears on team changes or desktop resize', async () => {
  const page = await openRoster(), id = page.names[0].dataset.rosterMember;
  await page.send('pointerdown'); page.hold();
  const nextWeek = { dataset: { action: 'navigate', step: '1' }, closest: selector => selector === '[data-action]' ? nextWeek : null };
  await page.send('click', nextWeek);
  assert.deepEqual(page.visible.map(name => name.dataset.rosterMember), [id]);
  await page.send('change', { id: 'team-select', value: 'team-1', dataset: {} });
  assert.equal(page.visible.length, page.names.length);
  await page.send('pointerdown'); page.hold();
  page.resize(false);
  assert.doesNotMatch(page.app.innerHTML, /data-roster-member/);
  page.resize(true);
  assert.equal(page.visible.length, page.names.length);
});

test('desktop remains unchanged and mobile keyboard users can toggle focus', async () => {
  const desktop = await openRoster(false);
  assert.doesNotMatch(desktop.app.innerHTML, /data-roster-member/);
  const page = await openRoster(), count = page.names.length;
  await page.send('keydown', page.names[1], { key: 'Enter' });
  assert.equal(page.visible.length, 1);
  await page.send('keydown', page.names[1], { key: ' ' });
  assert.equal(page.visible.length, count);
});

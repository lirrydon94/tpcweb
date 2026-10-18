import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import * as model from '../src/model.js';

async function openRoster(mobile = true, touch = false) {
  const listeners = {}, timers = new Map();
  let names = [], html = '', timerId = 0;
  const media = new Map();
  const matchMedia = query => {
    if (!media.has(query)) media.set(query, {
      matches: mobile || (query.includes('pointer: coarse') && touch),
      listeners: [], addEventListener(_, fn) { this.listeners.push(fn); },
    });
    return media.get(query);
  };
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
    window: { matchMedia, addEventListener() {}, scrollTo() {} },
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
    resize(value) {
      mobile = value;
      const changed = [];
      for (const [query, entry] of media) {
        const matches = mobile || (query.includes('pointer: coarse') && touch);
        if (matches !== entry.matches) { entry.matches = matches; changed.push(entry); }
      }
      for (const entry of changed) entry.listeners.forEach(fn => fn());
    },
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

test('wide touch screens support hold and tap, and rotation preserves the selected person', async () => {
  const page = await openRoster(false, true), count = page.names.length;
  const id = page.names[2].dataset.rosterMember;
  await page.send('pointerdown', page.names[2]); page.hold();
  await page.send('pointerup', page.names[2]); await page.send('click', page.names[2]);
  assert.deepEqual(page.visible.map(name => name.dataset.rosterMember), [id]);
  page.resize(true);
  assert.deepEqual(page.visible.map(name => name.dataset.rosterMember), [id]);
  page.resize(false);
  assert.deepEqual(page.visible.map(name => name.dataset.rosterMember), [id]);
  const selected = page.visible[0];
  await page.send('pointerdown', selected); await page.send('pointerup', selected); await page.send('click', selected);
  assert.equal(page.visible.length, count);
});

test('landscape touch blocks the copy menu only in the roster; desktop keeps it', async () => {
  for (const touch of [true, false]) {
    const page = await openRoster(false, touch);
    let blocked = false;
    const roster = { closest: selector => selector === '.roster-panel' ? roster : null };
    await page.send('contextmenu', roster, { preventDefault() { blocked = true; } });
    assert.equal(blocked, touch);
    blocked = false;
    await page.send('contextmenu', { closest: () => null }, { preventDefault() { blocked = true; } });
    assert.equal(blocked, false);
  }
});

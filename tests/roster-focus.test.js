import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import * as model from '../src/model.js';

async function openRoster(mobile = true, touch = false, { landscape = false, reducedMotion = false } = {}) {
  const listeners = {}, timers = new Map();
  let names = [], html = '', timerId = 0, scroller, panel, preview;
  const animations = [];
  const matchesQuery = query => query === '(orientation: landscape)' ? landscape
    : query === '(prefers-reduced-motion: reduce)' ? reducedMotion
    : mobile || (query.includes('pointer: coarse') && touch);
  const media = new Map();
  const matchMedia = query => {
    if (!media.has(query)) media.set(query, {
      matches: matchesQuery(query),
      listeners: [], addEventListener(_, fn) { this.listeners.push(fn); },
    });
    return media.get(query);
  };
  const createScroller = () => ({
    isConnected: true, scrollLeft: 0, scrollTop: 0, scrollWidth: 1000, clientWidth: 600,
    style: { transform: '' }, querySelectorAll: () => [],
    classList: { add() {}, remove() {} }, setAttribute() {}, remove() { this.isConnected = false; },
    closest(selector) { return selector === '.roster-scroll' ? this : selector === '.roster-panel' ? panel : null; },
    cloneNode: () => createScroller(),
    animate(frames, options) { animations.push({ frames, options }); return { finished: Promise.resolve(), cancel() {} }; },
  });
  const app = {
    get innerHTML() { return html; },
    set innerHTML(value) {
      html = value;
      if (scroller) scroller.isConnected = false;
      scroller = createScroller();
      panel = { classList: { add() {}, remove() {} }, append() {} };
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
      createElement: () => ({ querySelector: () => (preview = createScroller()) }),
      querySelector: selector => ({ '#app': app, '#modal': modal, '.roster-scroll': scroller }[selector]),
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
    app, animations, get scroller() { return scroller; }, get preview() { return preview; }, get names() { return names; },
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
        const matches = matchesQuery(query);
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

async function swipe(page, points, { cancel = false } = {}) {
  const scroller = page.scroller;
  const touch = ([clientX, clientY = 20]) => ({ identifier: 1, clientX, clientY });
  await page.send('touchstart', scroller, { touches: [touch(points[0])] });
  for (const point of points.slice(1)) await page.send('touchmove', scroller, { touches: [touch(point)], cancelable: true });
  await page.send(cancel ? 'touchcancel' : 'touchend', scroller, { touches: [], changedTouches: [touch(points.at(-1))] });
}

test('landscape edge swipes slide both ways and preserve the focused person and vertical position', async () => {
  const page = await openRoster(false, true, { landscape: true });
  await page.send('keydown', page.names[2], { key: 'Enter' });
  const id = page.visible[0].dataset.rosterMember;
  page.scroller.scrollLeft = 400; page.scroller.scrollTop = 80;
  await swipe(page, [[300], [220]]);
  assert.match(page.app.innerHTML, /id="jump-date"[^>]*value="2026-10-21"/);
  assert.equal(page.scroller.scrollLeft, 0);
  assert.equal(page.scroller.scrollTop, 80);
  assert.deepEqual(page.visible.map(name => name.dataset.rosterMember), [id]);
  assert.equal(page.animations.length, 2);
  assert.equal(page.animations[0].frames[0].transform, 'translateX(-80px)');
  assert.equal(page.animations[0].frames[1].transform, 'translateX(-600px)');
  assert.equal(page.animations[1].frames[0].transform, 'translateX(520px)');
  assert.ok(page.animations[1].options.duration > 300);
  await swipe(page, [[100], [180]]);
  assert.match(page.app.innerHTML, /id="jump-date"[^>]*value="2026-10-14"/);
  assert.equal(page.scroller.scrollLeft, 400);
  assert.equal(page.animations[2].frames[1].transform, 'translateX(600px)');
});

test('day scrolling, short swipes, vertical gestures, reversal and cancelled gestures do not change week', async () => {
  for (const scenario of [
    { left: 200, points: [[300], [200]] },
    { left: 400, points: [[300], [270]] },
    { left: 400, points: [[300, 20], [280, 110]] },
    { left: 400, points: [[300], [220], [260]] },
    { left: 400, points: [[300], [220]], cancel: true },
  ]) {
    const page = await openRoster(false, true, { landscape: true });
    page.scroller.scrollLeft = scenario.left;
    await swipe(page, scenario.points, scenario);
    assert.match(page.app.innerHTML, /id="jump-date"[^>]*value="2026-10-14"/);
    assert.equal(page.scroller.style.transform, '');
  }
});

test('a continued swipe after reaching the edge changes only one week', async () => {
  const page = await openRoster(false, true, { landscape: true });
  const scroller = page.scroller;
  scroller.scrollLeft = 300;
  const touch = clientX => ({ identifier: 1, clientX, clientY: 20 });
  await page.send('touchstart', scroller, { touches: [touch(400)] });
  await page.send('touchmove', scroller, { touches: [touch(300)], cancelable: true });
  assert.equal(scroller.scrollLeft, 400);
  await page.send('touchmove', scroller, { touches: [touch(220)], cancelable: true });
  await page.send('touchend', scroller, { touches: [], changedTouches: [touch(220)] });
  await page.send('touchend', scroller, { touches: [], changedTouches: [touch(220)] });
  assert.match(page.app.innerHTML, /id="jump-date"[^>]*value="2026-10-21"/);
  assert.equal(page.animations.length, 2);
});

test('portrait keeps normal scrolling and reduced motion changes week without animation', async () => {
  const portrait = await openRoster(true, true);
  portrait.scroller.scrollLeft = 400;
  await swipe(portrait, [[300], [220]]);
  assert.match(portrait.app.innerHTML, /id="jump-date"[^>]*value="2026-10-14"/);
  const reduced = await openRoster(false, true, { landscape: true, reducedMotion: true });
  reduced.scroller.scrollLeft = 400;
  await swipe(reduced, [[300], [220]]);
  assert.match(reduced.app.innerHTML, /id="jump-date"[^>]*value="2026-10-21"/);
  assert.equal(reduced.animations.length, 0);
});

test('the adjacent week follows the finger before release and reversal follows without jumping', async () => {
  const page = await openRoster(false, true, { landscape: true });
  const scroller = page.scroller;
  scroller.scrollLeft = 370;
  const touch = clientX => ({ identifier: 1, clientX, clientY: 20 });
  await page.send('touchstart', scroller, { touches: [touch(400)] });
  await page.send('touchmove', scroller, { touches: [touch(350)], cancelable: true });
  assert.equal(scroller.scrollLeft, 400);
  assert.equal(scroller.style.transform, 'translateX(-20px)');
  assert.equal(page.preview.style.transform, 'translateX(580px)');
  assert.match(page.app.innerHTML, /id="jump-date"[^>]*value="2026-10-14"/);
  assert.equal(page.animations.length, 0);
  await page.send('touchmove', scroller, { touches: [touch(280)], cancelable: true });
  assert.equal(scroller.style.transform, 'translateX(-90px)');
  await page.send('touchmove', scroller, { touches: [touch(320)], cancelable: true });
  assert.equal(scroller.style.transform, 'translateX(-50px)');
  await page.send('touchend', scroller, { touches: [], changedTouches: [touch(320)] });
  assert.match(page.app.innerHTML, /id="jump-date"[^>]*value="2026-10-14"/);
  assert.equal(page.animations[0].frames[0].transform, 'translateX(-50px)');
  assert.equal(page.animations[0].frames[1].transform, 'translateX(0px)');
  assert.equal(scroller.style.transform, '');
});

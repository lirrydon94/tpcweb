import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import * as model from '../src/model.js';

async function openApp(initialDate = '2026-10-14') {
  const listeners = {}, timers = new Map();
  let html = '', timerId = 0;
  let scrollTargets = [];

  const app = {
    get innerHTML() { return html; },
    set innerHTML(value) { html = value; },
  };
  const modal = { open: false, close() {}, addEventListener() {} };
  const toast = { textContent: '', className: '', classList: { add() {}, remove() {} } };
  const state = model.organizeState(model.seedState());

  // Simple DOM query implementation for the rendered roster
  function parseElements(selector) {
    if (selector === '#app') return [app];
    if (selector === '#modal') return [modal];
    if (selector === '#toast') return [toast];
    if (selector === '.roster-scroll') {
      if (!html.includes('class="roster-scroll"')) return [];
      return [{
        scrollLeft: 0,
        scrollWidth: 1200,
        clientWidth: 400,
        clientLeft: 0,
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 600 }),
        scrollTo(opts) { scrollTargets.push(opts); this.scrollLeft = opts.left; },
      }];
    }
    if (selector === '.roster-corner') {
      if (!html.includes('class="roster-corner"')) return [];
      return [{
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 88, height: 50 }),
      }];
    }
    // Match headers or cells by nth-child
    const thMatch = selector.match(/\.roster-table thead th:nth-child\((\d+)\)/);
    if (thMatch) {
      const idx = Number(thMatch[1]);
      const classList = new Set();
      return [{
        tagName: 'TH',
        dataset: {},
        classList: {
          add(c) { classList.add(c); },
          remove(c) { classList.delete(c); },
          has(c) { return classList.has(c); },
        },
        getBoundingClientRect: () => ({ left: 88 + (idx - 2) * 150, top: 0, width: 150, height: 50 }),
      }];
    }
    const tdMatch = selector.match(/\.roster-table tbody td:nth-child\((\d+)\)/);
    if (tdMatch) {
      const classList = new Set();
      return [{
        tagName: 'TD',
        dataset: {},
        classList: {
          add(c) { classList.add(c); },
          remove(c) { classList.delete(c); },
          has(c) { return classList.has(c); },
        },
      }];
    }
    const combinedMatch = selector.includes('th:nth-child') && selector.includes('td:nth-child');
    if (combinedMatch) {
      const m = selector.match(/th:nth-child\((\d+)\)/);
      const idx = m ? Number(m[1]) : 2;
      const thList = new Set(), tdList = new Set();
      return [
        {
          tagName: 'TH',
          classList: { add(c) { thList.add(c); }, remove(c) { thList.delete(c); }, has(c) { return thList.has(c); } },
          getBoundingClientRect: () => ({ left: 88 + (idx - 2) * 150, top: 0, width: 150, height: 50 }),
        },
        {
          tagName: 'TD',
          classList: { add(c) { tdList.add(c); }, remove(c) { tdList.delete(c); }, has(c) { return tdList.has(c); } },
        },
      ];
    }
    return [];
  }

  const context = vm.createContext({
    model,
    store: { init: async () => ({ working: state, published: model.publishState(state), role: 'viewer', mode: 'demo' }) },
    document: {
      querySelector: selector => parseElements(selector)[0] || null,
      querySelectorAll: selector => parseElements(selector),
      addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    },
    window: {
      matchMedia: () => ({ matches: false, addEventListener() {} }),
      addEventListener() {},
      scrollTo() {},
    },
    location: { search: `?date=${initialDate}` },
    localStorage: { getItem: () => null, setItem() {} },
    sessionStorage: { getItem: () => null, setItem() {} },
    URLSearchParams, Intl, Date, structuredClone,
    setTimeout(fn, ms) { timers.set(++timerId, { fn, ms }); return timerId; },
    clearTimeout(id) { timers.delete(id); },
    setInterval() {},
  });

  const source = (await readFile(new URL('../src/app.js', import.meta.url), 'utf8')).replace(/^import .*;\r?\n/gm, '');
  await vm.runInContext(`(async () => { ${source}\n })()`, context);

  return {
    app,
    get html() { return html; },
    get scrollTargets() { return scrollTargets; },
    async change(target) {
      const el = { classList: { contains: () => false }, dataset: {}, ...target };
      for (const listener of listeners['change'] || []) await listener({ target: el });
    },
    async clickAction(action) {
      const button = { dataset: { action }, closest: selector => selector === '[data-action]' ? button : null };
      for (const listener of listeners['click'] || []) await listener({ target: button });
    },
    fastForwardHighlight() {
      for (const [id, timer] of timers) {
        if (timer.ms === 1600) {
          timers.delete(id);
          timer.fn();
        }
      }
    },
  };
}

test('jump-date change triggers horizontal snap and column highlight', async () => {
  const page = await openApp('2026-10-14');
  assert.ok(page.html.includes('id="jump-date"'));
  assert.ok(page.html.includes('data-date="2026-10-14"'));

  // Jump to Friday 2026-10-16
  await page.change({ id: 'jump-date', value: '2026-10-16' });

  // Verify the date was updated in the toolbar
  assert.ok(page.html.includes('value="2026-10-16"'));
  assert.ok(page.html.includes('data-date="2026-10-16"'));

  // Verify that scrollTo was called to snap to the column
  assert.ok(page.scrollTargets.length > 0, 'scrollTo should have been called on roster-scroll');
  const lastScroll = page.scrollTargets[page.scrollTargets.length - 1];
  assert.equal(typeof lastScroll.left, 'number');
  assert.equal(lastScroll.behavior, 'smooth');

  // Verify fast-forwarding the timer clears the highlight
  page.fastForwardHighlight();
});

test('today button triggers horizontal snap and highlight', async () => {
  const page = await openApp('2026-10-14');
  const countBefore = page.scrollTargets.length;

  await page.clickAction('today');

  assert.ok(page.scrollTargets.length > countBefore, 'scrollTo should have been called on clicking Idag');
  const lastScroll = page.scrollTargets[page.scrollTargets.length - 1];
  assert.equal(typeof lastScroll.left, 'number');
  assert.equal(lastScroll.behavior, 'smooth');
});

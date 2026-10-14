import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import * as model from '../src/model.js';
import { defaultWorkspace } from '../src/default-data.js';

test('local roster refreshes on tab changes and waits while a dialog is open', async () => {
  const listeners = {};
  const modal = { open: false, addEventListener: (type, fn) => { listeners[`modal:${type}`] = fn; } };
  const app = { innerHTML: '' };
  const toast = {};
  const elements = { '#app': app, '#modal': modal, '#toast': toast };
  let current = { ...structuredClone(defaultWorkspace), mode: 'demo', role: 'admin' };
  const full = structuredClone(current);
  current.published.teams[0].members = current.published.teams[0].members.slice(0, 7);
  let reads = 0;
  const context = vm.createContext({
    model,
    store: {
      init: async () => structuredClone(current),
      refresh: async () => { reads++; return structuredClone(current); },
    },
    document: {
      visibilityState: 'visible',
      querySelector: selector => elements[selector],
      addEventListener: (type, fn) => { listeners[type] = fn; },
    },
    window: { addEventListener: (type, fn) => { listeners[type] = fn; } },
    location: { search: '?date=2026-10-14' },
    localStorage: { getItem: () => null },
    URLSearchParams, Intl, Date, structuredClone,
    setInterval: fn => { listeners.interval = fn; },
    setTimeout: () => 1, clearTimeout: () => {},
  });
  const source = (await readFile(new URL('../src/app.js', import.meta.url), 'utf8'))
    .replace(/^import .*;\r?\n/gm, '');
  await vm.runInContext(`(async () => { ${source}\n })()`, context);
  assert.ok(!app.innerHTML.includes('Christer'));
  current = full;
  current.revision++;
  listeners.storage({ key: 'skift-workspace-v1' });
  await new Promise(resolve => setImmediate(resolve));
  for (const name of ['Christer', 'Martin', 'Mikael', 'Bosse']) assert.ok(app.innerHTML.includes(name), name);

  modal.open = true;
  current.published.teams[0].members[7].name = 'Uppdaterad kollega';
  current.revision++;
  await listeners.focus();
  assert.equal(reads, 1);
  assert.ok(!app.innerHTML.includes('Uppdaterad kollega'));
  modal.open = false;
  await listeners['modal:close']();
  assert.ok(app.innerHTML.includes('Uppdaterad kollega'));

  current.published.teams[0].members[7].name = 'Tillbaka i sidan';
  await listeners.pageshow();
  assert.ok(app.innerHTML.includes('Tillbaka i sidan'));
});

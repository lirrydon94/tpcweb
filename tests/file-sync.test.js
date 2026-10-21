import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createWorkspaceServer } from '../scripts/serve.mjs';
import { readWorkspace } from '../scripts/workspace-file.mjs';
import { defaultWorkspace } from '../src/default-data.js';

function browser(t, saved, hostname = '127.0.0.1') {
  const memory = new Map(saved ? [['skift-workspace-v1', JSON.stringify(saved)]] : []);
  for (const [key, value] of Object.entries({
    location: { hostname, port: '5500' },
    localStorage: { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) },
  })) {
    const original = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    t.after(() => { if (original) Object.defineProperty(globalThis, key, original); else delete globalThis[key]; });
  }
  return memory;
}
const response = (value, status = 200) => ({ ok: status === 200, status,
  headers: new Headers({ 'content-type': 'application/json' }), json: async () => value });

test('Live Server network failure still falls back and awaits the complete file save', async t => {
  const memory = browser(t);
  const store = await import('../src/store.js?sync-fallback');
  const initial = await store.init();
  let finish;
  let requestBody;
  const mock = t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (url === '/api/save-workspace') throw new TypeError('Live Server rejected POST');
    requestBody = JSON.parse(options.body);
    await new Promise(resolve => { finish = resolve; });
    return response({ ok: true, revision: requestBody.revision });
  });
  initial.working.teams[0].name = 'Sparat till projektet';
  let completed = false;
  const saving = store.publish(initial.working).then(result => { completed = true; return result; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(completed, false);
  assert.equal(JSON.parse(memory.get('skift-workspace-v1')).pendingFileSync, true);
  finish();
  const saved = await saving;
  assert.equal(saved.fileSync.state, 'file');
  assert.equal(JSON.parse(memory.get('skift-workspace-v1')).pendingFileSync, false);
  assert.deepEqual(requestBody.working, saved.working);
  assert.deepEqual(requestBody.published, saved.published);
  assert.equal(mock.mock.calls[1].arguments[0], 'http://127.0.0.1:5173/api/save-workspace');
});

test('failed sync survives reload and a newer file, then retries without losing data', async t => {
  browser(t);
  const store = await import('../src/store.js?sync-retry');
  const initial = await store.init();
  const mock = t.mock.method(globalThis, 'fetch', async () => { throw new Error('Offline'); });
  initial.working.teams[0].name = 'Osynkade ändringar';
  const pending = await store.publish(initial.working);
  assert.equal(pending.fileSync.state, 'browser');
  assert.equal((await store.init()).working.teams[0].name, 'Osynkade ändringar');
  const newer = { ...structuredClone(defaultWorkspace), revision: pending.revision + 5 };
  mock.mock.mockImplementation(async () => ({ ok: true, text: async () => `export const defaultWorkspace = ${JSON.stringify(newer)};` }));
  assert.equal((await store.refresh()).working.teams[0].name, 'Osynkade ändringar');
  mock.mock.mockImplementation(async () => response({ ok: true, revision: pending.revision }));
  assert.equal((await store.syncProject()).fileSync.state, 'file');
});

test('legacy Live Server changes at equal revision are preserved without automatic writes', async t => {
  const legacy = structuredClone(defaultWorkspace);
  legacy.working.teams[0].name = 'Äldre webbläsarändring';
  browser(t, legacy);
  const mock = t.mock.method(globalThis, 'fetch', async () => { throw new Error('Unexpected write'); });
  const store = await import('../src/store.js?sync-legacy');
  const result = await store.init();
  assert.equal(result.working.teams[0].name, 'Äldre webbläsarändring');
  assert.equal(result.pendingFileSync, true);
  assert.equal(mock.mock.calls.length, 0);
});

test('hosted edits never claim to update GitHub or contact a local server', async t => {
  browser(t, null, 'example.github.io');
  const mock = t.mock.method(globalThis, 'fetch', async () => { throw new Error('Unexpected request'); });
  const store = await import('../src/store.js?sync-hosted');
  const initial = await store.init();
  const result = await store.publish(initial.working);
  assert.equal(result.fileSync.state, 'browser');
  assert.match(result.fileSync.message, /uppdaterar inte GitHub Pages/);
  assert.equal(mock.mock.calls.length, 0);
});

test('hosted browser changes are reset to the pushed project schedule when a new version is published', async t => {
  const memory = browser(t, null, 'example.github.io');
  const store = await import('../src/store.js?sync-hosted-push-reset');
  const initial = await store.init();
  initial.working.teams[0].name = 'Lokal ändring på GitHub Pages';
  await store.publish(initial.working);
  assert.equal((await store.init()).working.teams[0].name, 'Lokal ändring på GitHub Pages');

  // Admin commits and pushes a new schedule from the local computer:
  const pushed = structuredClone(defaultWorkspace);
  pushed.revision = defaultWorkspace.revision + 5;
  pushed.working.teams[0].name = 'Pushat från administratören';
  pushed.published.teams[0].name = 'Pushat från administratören';

  // refresh() fetches the new default-data.js on GitHub Pages:
  t.mock.method(globalThis, 'fetch', async () => ({
    ok: true, text: async () => `export const defaultWorkspace = ${JSON.stringify(pushed)};`,
  }));
  const refreshed = await store.refresh();
  assert.equal(refreshed.working.teams[0].name, 'Pushat från administratören');
  assert.equal(refreshed.published.teams[0].name, 'Pushat från administratören');
  assert.equal(JSON.parse(memory.get('skift-workspace-v1')).working.teams[0].name, 'Pushat från administratören');

  // Also test when baseRevision was undefined (legacy browser copy on GitHub Pages):
  const legacyHosted = structuredClone(initial);
  delete legacyHosted.baseRevision;
  legacyHosted.working.teams[0].name = 'Gammal sparad webbläsarkopia';
  memory.set('skift-workspace-v1', JSON.stringify(legacyHosted));
  const legacyReloaded = await store.init();
  assert.equal(legacyReloaded.working.teams[0].name, 'Pushat från administratören');
});

test('reload after a file write confirms an exact pending copy without another POST', async t => {
  const memory = browser(t, { ...structuredClone(defaultWorkspace), pendingFileSync: true });
  const store = await import('../src/store.js?sync-reload');
  const saved = await store.init();
  assert.equal(saved.pendingFileSync, false);
  assert.equal(saved.fileSync.state, 'file');
  assert.equal(JSON.parse(memory.get('skift-workspace-v1')).pendingFileSync, false);
});

test('a file conflict is visible and never retried against another server', async t => {
  browser(t);
  const store = await import('../src/store.js?sync-conflict');
  const saved = await store.init();
  const mock = t.mock.method(globalThis, 'fetch', async () => response({ ok: false }, 409));
  const result = await store.publish(saved.working);
  assert.equal(result.fileSync.state, 'browser');
  assert.match(result.fileSync.message, /annan version/);
  assert.equal(result.pendingFileSync, true);
  assert.equal(mock.mock.calls.length, 1);
});

test('sync server writes all data, allows Live Server, and rejects stale or invalid saves', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'skift-sync-'));
  await fs.mkdir(path.join(root, 'src'));
  await fs.writeFile(path.join(root, 'src', 'default-data.js'), `export const defaultWorkspace = ${JSON.stringify(defaultWorkspace)};`);
  const server = createWorkspaceServer(root);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    assert.ok(root.startsWith(path.join(os.tmpdir(), 'skift-sync-')));
    await fs.rm(root, { recursive: true, force: true });
  });
  const url = `http://127.0.0.1:${server.address().port}/api/save-workspace`;
  const post = (body, origin = 'http://127.0.0.1:5500') => fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(body),
  });
  const data = structuredClone(defaultWorkspace);
  data.revision++;
  data.working.teams[0].name = 'Alla uppgifter';
  data.working.extraSettings = { note: 'Anteckning med åäö' };
  const saved = await post(data);
  assert.equal(saved.status, 200);
  assert.equal(saved.headers.get('access-control-allow-origin'), 'http://127.0.0.1:5500');
  assert.deepEqual(await readWorkspace(root), data);
  assert.equal((await (await post(data)).json()).unchanged, true);
  assert.equal((await post(defaultWorkspace)).status, 409);
  assert.equal((await post({ ...data, working: defaultWorkspace.working })).status, 409);
  assert.equal((await post({ revision: 9999, working: {}, published: {} })).status, 400);
  assert.equal((await post(data, 'https://example.com')).status, 403);
  assert.deepEqual(await readWorkspace(root), data);
  assert.deepEqual(await fs.readdir(path.join(root, 'src')), ['default-data.js']);
});

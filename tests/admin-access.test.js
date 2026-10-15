import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import * as model from '../src/model.js';
import { defaultWorkspace } from '../src/default-data.js';

async function openApp(role = 'admin', initial = defaultWorkspace, preferences = new Map(), search = '?date=2026-10-14') {
  let saved = { ...structuredClone(initial), mode: 'demo', role };
  const listeners = {};
  let publishError = null;
  const app = { innerHTML: '' }, form = {}, error = { textContent: '' };
  const dialog = {
    open: false, innerHTML: '',
    showModal() { this.open = true; error.textContent = ''; },
    close() { this.open = false; },
    querySelector: selector => selector === '.form-error' ? error : null,
    addEventListener() {},
  };
  const elements = { '#app': app, '#modal': dialog, '#modal-form': form, '#toast': {} };
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
      querySelector: selector => elements[selector],
      addEventListener: (type, fn) => { listeners[type] = fn; },
    },
    window: { addEventListener() {}, scrollTo() {} },
    location: { search },
    localStorage: { getItem: key => preferences.get(key) || null, setItem: (key, value) => preferences.set(key, value) },
    URLSearchParams, Intl, Date, structuredClone,
    FormData: class { constructor(target) { this.get = key => target[key]; } },
    setInterval() {}, setTimeout() {}, clearTimeout() {},
  });
  const source = (await readFile(new URL('../src/app.js', import.meta.url), 'utf8'))
    .replace(/^import .*;\r?\n/gm, '');
  await vm.runInContext(`(async () => { ${source}\n })()`, context);
  return {
    app, dialog, error,
    getWorkspace: () => structuredClone(saved),
    failPublish: message => { publishError = message; },
    change: target => listeners.change({ target }),
    click: (action, view) => listeners.click({ target: { closest: () => ({ dataset: { action, view } }) } }),
    submit: (values = {}) => form.onsubmit({ preventDefault() {}, submitter: {}, target: typeof values === 'string' ? { password: values } : values }),
  };
}

test('Hantera requires the password and locks again when returning to Schema', async () => {
  const page = await openApp();
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
  assert.equal(page.dialog.open, true);
  assert.ok(!page.app.innerHTML.includes('Dina medarbetare'));
  await page.click('close-modal');
  assert.equal(page.dialog.open, false);
  assert.ok(!page.app.innerHTML.includes('Dina medarbetare'));

  const reloaded = await openApp();
  await reloaded.click('view', 'admin');
  assert.equal(reloaded.dialog.open, true);
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

test('team settings require confirmation and immediately publish deletion, including the last team', async () => {
  const page = await openApp();
  await page.click('delete-team');
  assert.equal(page.dialog.open, false);
  await page.click('admin');
  await page.submit('lirrydoz');
  await page.click('settings');
  assert.ok(page.dialog.innerHTML.includes('data-action="delete-team"'));
  await page.click('delete-team');
  assert.ok(page.dialog.innerHTML.includes('Ta bort team?'));
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
  assert.ok(page.app.innerHTML.includes('Lägg till team'));
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
  assert.ok(page.app.innerHTML.includes('<option value="remaining-team" selected>Kvarvarande team</option>'));
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

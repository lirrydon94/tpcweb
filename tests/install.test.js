import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = (await readFile(new URL('../src/install.js', import.meta.url), 'utf8'))
  .replaceAll('import.meta.url', "'https://example.com/tpcweb/src/install.js?v=123'");

function setup({ ios = false, userAgent, standalone = false, dismissed = false, desktop = false, storageBlocked = false } = {}) {
  const listeners = {}, elements = {}, media = {}, timers = [];
  const stored = new Map(dismissed ? [['rssb-install-dismissed:/tpcweb/', String(Date.now())]] : []);
  for (const id of ['install-dialog', 'install-entry', 'install-confirm', 'install-dismiss', 'install-guide', 'install-status', 'install-open', 'install-help']) {
    elements[`#${id}`] = {
      hidden: false, open: false, textContent: '', handlers: {},
      addEventListener(type, fn) { this.handlers[type] = fn; },
      showModal() { this.open = true; },
      close() { this.open = false; this.handlers.close?.(); },
    };
  }
  const registrations = [];
  vm.runInNewContext(source, {
    URL, Date, setTimeout: fn => timers.push(fn),
    localStorage: {
      getItem(key) { if (storageBlocked) throw Error(); return stored.get(key); },
      setItem(key, value) { if (storageBlocked) throw Error(); stored.set(key, value); },
    },
    navigator: {
      userAgent: userAgent ?? (ios ? 'iPhone' : 'Android'), standalone,
      serviceWorker: { register: (...args) => { registrations.push(args); return Promise.resolve(); } },
    },
    document: {
      visibilityState: 'visible',
      querySelector: selector => selector === 'dialog[open]' ? Object.values(elements).find(el => el.open) : elements[selector],
    },
    window: {
      isSecureContext: true,
      addEventListener: (type, fn) => { listeners[type] = fn; },
      matchMedia(query) {
        return media[query] = {
          matches: query.includes('standalone') ? standalone : !desktop,
          handlers: {},
          addEventListener(type, fn) { this.handlers[type] = fn; },
        };
      },
    },
  });
  return { elements, listeners, timers, registrations, media, stored };
}

test('Android requests installation only after a tap and keeps help available after acceptance', async () => {
  const { elements: el, listeners, registrations } = setup();
  let prompted = 0, prevented = false;
  listeners.beforeinstallprompt({
    preventDefault() { prevented = true; },
    prompt: async () => { prompted++; },
    userChoice: Promise.resolve({ outcome: 'accepted' }),
  });
  assert.equal(prevented, true);
  assert.equal(el['#install-dialog'].open, true);
  assert.equal(el['#install-confirm'].textContent, 'Installera appen');
  assert.equal(prompted, 0);
  assert.equal(registrations[0][0].href, 'https://example.com/tpcweb/sw.js');
  await el['#install-confirm'].handlers.click();
  assert.equal(prompted, 1);
  assert.equal(el['#install-dialog'].open, true);
  assert.match(el['#install-status'].textContent, /Installationen har begärts/);
  assert.equal(el['#install-help'].hidden, false);
  assert.equal(el['#install-entry'].hidden, false);
  listeners.appinstalled();
  assert.equal(el['#install-entry'].hidden, false);
  el['#install-help'].handlers.click();
  assert.equal(el['#install-guide'].hidden, false);
  assert.match(el['#install-guide'].innerHTML, /Chrome/);
  el['#install-dismiss'].handlers.click();
  el['#install-open'].handlers.click();
  assert.equal(el['#install-dialog'].open, true);
  assert.equal(el['#install-help'].hidden, false);
  el['#install-help'].handlers.click();
  assert.equal(el['#install-guide'].hidden, false);
  assert.equal(prompted, 1);
});

test('a fresh browser prompt permits retry without reusing the previous native prompt', async () => {
  const { elements: el, listeners } = setup();
  let firstCalls = 0, retryCalls = 0;
  listeners.beforeinstallprompt({
    preventDefault() {},
    prompt: async () => { firstCalls++; },
    userChoice: Promise.resolve({ outcome: 'accepted' }),
  });
  await el['#install-confirm'].handlers.click();
  listeners.appinstalled();
  el['#install-help'].handlers.click();
  el['#install-dismiss'].handlers.click();
  el['#install-open'].handlers.click();
  el['#install-help'].handlers.click();
  assert.equal(firstCalls, 1);
  listeners.beforeinstallprompt({
    preventDefault() {},
    prompt: async () => { retryCalls++; },
    userChoice: Promise.resolve({ outcome: 'accepted' }),
  });
  assert.equal(el['#install-confirm'].hidden, false);
  assert.equal(el['#install-confirm'].textContent, 'Installera appen');
  assert.equal(el['#install-guide'].hidden, true);
  await el['#install-confirm'].handlers.click();
  assert.equal(firstCalls, 1);
  assert.equal(retryCalls, 1);
  assert.match(el['#install-status'].textContent, /Installationen har begärts/);
});

test('double taps and an early appinstalled event preserve Android recovery help', async () => {
  const { elements: el, listeners } = setup();
  let calls = 0, resolveChoice;
  listeners.beforeinstallprompt({
    preventDefault() {},
    prompt: async () => { calls++; },
    userChoice: new Promise(resolve => { resolveChoice = resolve; }),
  });
  const requesting = el['#install-confirm'].handlers.click();
  await el['#install-confirm'].handlers.click();
  assert.equal(calls, 1);
  assert.equal(el['#install-confirm'].disabled, true);
  listeners.appinstalled();
  assert.equal(el['#install-entry'].hidden, false);
  assert.equal(el['#install-help'].hidden, false);
  assert.match(el['#install-status'].textContent, /Installationen har begärts/);
  resolveChoice({ outcome: 'accepted' });
  await requesting;
  assert.equal(calls, 1);
  assert.equal(el['#install-confirm'].disabled, false);
  assert.equal(el['#install-dialog'].open, true);
  assert.equal(el['#install-entry'].hidden, false);
  el['#install-help'].handlers.click();
  assert.equal(el['#install-guide'].hidden, false);
});

test('Samsung Internet has matching menu instructions and can still use its native prompt', async () => {
  const { elements: el, listeners, timers } = setup({
    userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S921B) SamsungBrowser/28.0 Chrome/130.0 Mobile Safari/537.36',
  });
  timers[0]();
  await el['#install-confirm'].handlers.click();
  assert.equal(el['#install-guide'].hidden, false);
  assert.match(el['#install-guide'].innerHTML, /Samsung Internet/);
  assert.match(el['#install-guide'].innerHTML, /[☰≡]|tre streck/i);
  assert.match(el['#install-guide'].innerHTML, /Chrome/);
  let calls = 0;
  listeners.beforeinstallprompt({
    preventDefault() {},
    prompt: async () => { calls++; },
    userChoice: Promise.resolve({ outcome: 'accepted' }),
  });
  await el['#install-confirm'].handlers.click();
  assert.equal(calls, 1);
  assert.equal(el['#install-help'].hidden, false);
});

test('iPhone shows manual instructions and can reopen after dismissal', async () => {
  const { elements: el, timers, stored } = setup({ ios: true });
  timers[0]();
  assert.equal(el['#install-dialog'].open, true);
  assert.equal(el['#install-confirm'].textContent, 'Visa hur du installerar');
  await el['#install-confirm'].handlers.click();
  assert.equal(el['#install-guide'].hidden, false);
  assert.match(el['#install-guide'].innerHTML, /Lägg till på hemskärmen/);
  assert.equal(el['#install-confirm'].hidden, true);
  el['#install-dismiss'].handlers.click();
  assert.ok(stored.has('rssb-install-dismissed:/tpcweb/'));
  el['#install-open'].handlers.click();
  assert.equal(el['#install-dialog'].open, true);
});

test('dismissal suppresses automatic popup but keeps manual installation available', () => {
  const { elements: el, timers } = setup({ dismissed: true });
  timers[0]();
  assert.equal(el['#install-dialog'].open, false);
  assert.equal(el['#install-entry'].hidden, false);
  el['#install-open'].handlers.click();
  assert.equal(el['#install-dialog'].open, true);
});

test('standalone app and desktop do not show the mobile installation popup', () => {
  for (const options of [{ standalone: true }, { desktop: true }]) {
    const { elements: el, timers } = setup(options);
    timers[0]();
    assert.equal(el['#install-entry'].hidden, true);
    assert.equal(el['#install-dialog'].open, false);
  }
});

test('entering standalone mode hides Android installation help after a request', async () => {
  const { elements: el, listeners, media } = setup();
  listeners.beforeinstallprompt({
    preventDefault() {},
    prompt: async () => {},
    userChoice: Promise.resolve({ outcome: 'accepted' }),
  });
  await el['#install-confirm'].handlers.click();
  listeners.appinstalled();
  const displayMode = media['(display-mode: standalone)'];
  displayMode.matches = true;
  displayMode.handlers.change();
  assert.equal(el['#install-entry'].hidden, true);
  assert.equal(el['#install-dialog'].open, false);
});

test('rejected native prompt falls back to useful instructions and is never reused', async () => {
  const { elements: el, listeners } = setup({ storageBlocked: true });
  let calls = 0;
  listeners.beforeinstallprompt({ preventDefault() {}, prompt: async () => { calls++; throw Error(); } });
  await el['#install-confirm'].handlers.click();
  assert.equal(el['#install-guide'].hidden, false);
  assert.match(el['#install-status'].textContent, /kunde inte öppnas/);
  el['#install-dismiss'].handlers.click();
  el['#install-open'].handlers.click();
  await el['#install-confirm'].handlers.click();
  assert.equal(calls, 1);
});

test('manifest resolves launch URL and real PNG icons within GitHub Pages scope', async () => {
  const manifest = JSON.parse(await readFile(new URL('../manifest.webmanifest', import.meta.url), 'utf8'));
  const base = 'https://example.com/tpcweb/manifest.webmanifest';
  for (const key of ['id', 'start_url', 'scope']) assert.equal(new URL(manifest[key], base).pathname, '/tpcweb/');
  assert.equal(manifest.display, 'standalone');
  for (const icon of manifest.icons) {
    const bytes = await readFile(new URL(`../${icon.src}`, import.meta.url));
    const size = Number(icon.sizes.split('x')[0]);
    assert.equal(bytes.readUInt32BE(16), size);
    assert.equal(bytes.readUInt32BE(20), size);
  }
});

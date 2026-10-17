import { config } from '../config.js';
import { seedState, publishState, validateState, deleteTeam } from './model.js';
import { defaultWorkspace } from './default-data.js';

const LOCAL_KEY = 'skift-workspace-v1';
const SESSION_KEY = 'skift-session-v1';
const cloud = Boolean(config.supabaseUrl || config.supabaseAnonKey);
let session = null;
let snapshot = null;
let latestDefaults = defaultWorkspace;

const clone = (value) => JSON.parse(JSON.stringify(value));

const START_DATE_FIX = 'lopare-start-date-2026-10-12';
const START_DATE_MEMBERS = new Set([
  '92c661cf-5f06-4fb6-ade2-8ab6fd6117a3',
  '29c00ea2-214d-43fb-a8fd-1ba0178641ad',
  '20059f25-50b1-4a8d-a3d6-99e63d7c6ae9',
  'ce36d572-b884-48a0-95f2-08eb437928ed',
]);

function fixLocalStartDates(saved) {
  if (saved.appliedFixes?.includes(START_DATE_FIX)) return false;
  // These existing coworkers were entered on Tuesday, hiding their Monday shifts.
  // Match only the affected records; keep intentional start dates and other edits.
  for (const state of [saved.working, saved.published]) {
    const team = state.teams.find(item => item.id === 'team-1');
    for (const member of team?.members || []) {
      if (START_DATE_MEMBERS.has(member.id) && member.activeFrom === '2026-10-13') {
        member.activeFrom = '2026-10-12';
      }
    }
  }
  saved.appliedFixes = [...(saved.appliedFixes || []), START_DATE_FIX];
  return true;
}

function fixLocalNovemberCover(saved) {
  const fix = 'confirmed-cover-2026-11-21-niklas';
  if (saved.appliedFixes?.includes(fix)) return false;
  // Apply the user's confirmed booking to existing browser copies too. Their
  // revision may exceed the file's revision, so replacing the workspace loses edits.
  const replacementId = '52e6b2d0-f39d-4333-ae2c-3eae344bb72e';
  const matches = entry => entry.id === 'd0ee73f0-cf1e-40ad-ac51-e503b6d0026b'
    && entry.teamId === 'team-1' && entry.memberId === 'member-1' && entry.date === '2026-11-21';
  const entries = [saved.working, saved.published].map(state => state.exceptions.find(matches));
  if (entries.some(entry => !entry)) return false;
  // A changed booking takes precedence over this one-time correction.
  if (entries.every(entry => entry.type === 'vacation' && !entry.start && !entry.end
    && (!entry.replacementId || entry.replacementId === replacementId)
    && !entry.replacementStart && !entry.replacementEnd)) {
    const states = [saved.working, saved.published].map(state => {
      const next = clone(state);
      next.exceptions.find(matches).replacementId = replacementId;
      return next;
    });
    if (states.some(state => validateState(state).length)) return false;
    if (entries.some(entry => !entry.replacementId)) {
      [saved.working, saved.published] = states;
      saved.revision++;
    }
  }
  saved.appliedFixes = [...(saved.appliedFixes || []), fix];
  return true;
}

function restoreAbsenceStatuses(saved) {
  let changed = false;
  for (const entry of saved.published.exceptions) {
    if (entry.type !== 'off') continue;
    const original = saved.working.exceptions.find(item => item.id === entry.id
      && item.teamId === entry.teamId && item.memberId === entry.memberId && item.date === entry.date);
    if (original && ['vacation', 'sick', 'leave', 'pension'].includes(original.type)
      && !original.start && !original.end) {
      entry.type = original.type;
      changed = true;
    }
  }
  return changed;
}

function syncRemovedTeams(saved) {
  // Deletions saved before automatic publishing may exist only in working.
  // Apply those deletions without publishing unrelated old draft edits.
  const remaining = new Set(saved.working.teams.map(team => team.id));
  const removed = saved.published.teams.filter(team => !remaining.has(team.id));
  if (!removed.length) return false;
  for (const team of removed) saved.published = deleteTeam(saved.published, team.id);
  saved.published.publishedAt = new Date().toISOString();
  saved.revision++;
  return true;
}

const localPayload = value => JSON.stringify({
  working: value.working, published: value.published, revision: value.revision,
  appliedFixes: value.appliedFixes || [],
  pendingFileSync: Boolean(value.pendingFileSync),
});

function checkState(state) {
  if (!state || state.schemaVersion !== 1 || !Array.isArray(state.teams) || !Array.isArray(state.exceptions)) {
    throw new Error('Välj en schemafil från Skift som innehåller schemaVersion 1, teams och exceptions.');
  }
  if (JSON.stringify(state).length > 5_000_000) throw new Error('Schemat är för stort (högst 5 MB).');
  return clone(state);
}

function publicState(state) {
  const published = publishState(checkState(state));
  const result = JSON.parse(JSON.stringify(published, (key, value) => (
    ['note', 'reason', 'adminNote', 'medicalDetails'].includes(key) ? undefined : value
  )));
  return result;
}

function signedOut(error) {
  return { mode: 'cloud', role: 'signed-out', working: null, published: null, revision: 0, user: null, ...(error ? { error } : {}) };
}

function rememberSession(value) {
  session = value;
  if (value) sessionStorage.setItem(SESSION_KEY, JSON.stringify(value));
  else sessionStorage.removeItem(SESSION_KEY);
}

function normalizeSession(value) {
  return {
    access_token: value.access_token,
    refresh_token: value.refresh_token,
    expires_at: value.expires_at || Math.floor(Date.now() / 1000) + (value.expires_in || 3600),
    user: { email: value.user?.email || '' },
  };
}

async function request(path, body, token) {
  let response;
  try {
    response = await fetch(`${config.supabaseUrl.replace(/\/$/, '')}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        apikey: config.supabaseAnonKey,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'Content-Type': 'application/json',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new Error('Kunde inte ansluta till det delade schemat. Kontrollera din internetanslutning.');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (/revision|changed|(?:version(?:en)?\s+(?:har\s+)?)?ändrats?/i.test(data.message || '')) {
      throw new Error('Schemat har ändrats i en annan session. Ladda om sidan innan du sparar.');
    }
    const knownErrors = {
      invalid_credentials: 'Fel e-postadress eller lösenord.',
      email_not_confirmed: 'Bekräfta din e-postadress innan du loggar in.',
      user_banned: 'Kontot är spärrat. Kontakta din administratör.',
      over_request_rate_limit: 'För många försök. Vänta en stund och försök igen.',
      over_email_send_rate_limit: 'För många e-postförfrågningar. Vänta en stund och försök igen.',
      session_not_found: 'Din inloggning har gått ut. Logga in igen.',
      refresh_token_not_found: 'Din inloggning har gått ut. Logga in igen.',
      refresh_token_already_used: 'Din inloggning behöver förnyas. Logga in igen.',
      PGRST301: 'Din inloggning är ogiltig. Logga in igen.',
      PGRST302: 'Logga in för att öppna det delade schemat.',
    };
    const rawMessage = data.msg || data.error_description || data.message;
    const knownMessage = knownErrors[data.error_code || data.code]
      || (rawMessage === 'Invalid login credentials' ? 'Fel e-postadress eller lösenord.' : null)
      || (rawMessage === 'Email not confirmed' ? 'Bekräfta din e-postadress innan du loggar in.' : null)
      || (rawMessage === 'JWT expired' ? 'Din inloggning har gått ut. Logga in igen.' : null)
      || (rawMessage === 'Invalid API key' ? 'Supabase-nyckeln är ogiltig. Kontrollera config.js.' : null)
      || (response.status === 429 ? 'För många försök. Vänta en stund och försök igen.' : null);
    throw new Error(knownMessage || rawMessage || `Servern svarade med fel ${response.status}.`);
  }
  return data;
}

async function accessToken() {
  if (!session) throw new Error('Logga in för att öppna det delade schemat.');
  if (session.expires_at <= Math.floor(Date.now() / 1000) + 60) {
    try {
      const refreshed = await request('/auth/v1/token?grant_type=refresh_token', { refresh_token: session.refresh_token });
      rememberSession(normalizeSession(refreshed));
    } catch (error) {
      rememberSession(null);
      throw new Error(`Logga in igen. ${error.message}`);
    }
  }
  return session.access_token;
}

function cloudSnapshot(data) {
  const role = data.role === 'admin' ? 'admin' : 'viewer';
  return {
    mode: 'cloud', role,
    working: checkState(role === 'admin' ? data.working : data.published),
    published: checkState(data.published),
    revision: Number(data.revision),
    user: session?.user || null,
  };
}

async function readCloud() {
  const data = await request('/rest/v1/rpc/get_workspace', {}, await accessToken());
  snapshot = cloudSnapshot(data);
  return clone(snapshot);
}

const isLocal = () => typeof location !== 'undefined'
  && ['localhost', '127.0.0.1'].includes(location.hostname);
const browserOnly = () => ({ state: 'browser', message: isLocal()
  ? 'Sparat endast i webbläsaren. Starta npm run dev i projektet och välj Spara till projektet före din commit och push.'
  : 'Sparat endast i den här webbläsaren. Ändringar här uppdaterar inte GitHub Pages. Gör ändringarna på din lokala dator och spara till projektet.' });

async function syncToFile(value) {
  if (!isLocal()) return browserOnly();
  const payload = localPayload(value);
  const urls = ['/api/save-workspace'];
  if (location.port !== '5173') urls.push('http://127.0.0.1:5173/api/save-workspace');
  for (const url of urls) {
    try {
      const response = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload,
        signal: AbortSignal.timeout(5000),
      });
      if (response.status === 409) return { state: 'browser', message: 'Projektfilen har en annan version. Dina ändringar finns kvar i webbläsaren. Exportera en säkerhetskopia innan du jämför versionerna.' };
      if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) continue;
      const result = await response.json();
      if (result.ok === true && result.revision === value.revision) {
        latestDefaults = clone(value);
        return { state: 'file', message: 'Sparat i projektfilen. Ta med src/default-data.js i din commit och push för att uppdatera GitHub Pages.' };
      }
    } catch { /* Live Server may reject POST; still try the local sync server. */ }
  }
  return browserOnly();
}

async function saveLocal(value) {
  value.pendingFileSync = true;
  try {
    localStorage.setItem(LOCAL_KEY, localPayload(value));
  } catch {
    throw new Error('Kunde inte spara på den här enheten. Kontrollera webbläsarens lagringsutrymme.');
  }
  snapshot = value;
  const fileSync = await syncToFile(value);
  if (snapshot !== value) return clone(snapshot);
  snapshot.fileSync = fileSync;
  snapshot.pendingFileSync = fileSync.state !== 'file';
  try { localStorage.setItem(LOCAL_KEY, localPayload(snapshot)); } catch { /* Original browser copy remains. */ }
  return clone(snapshot);
}

export async function syncProject() {
  if (cloud || !snapshot || !isLocal()) throw new Error('Spara till projektet från sidan på din lokala dator.');
  return saveLocal({ ...snapshot });
}

function sameScheduleData(left, right) {
  return JSON.stringify([left?.working, left?.published])
    === JSON.stringify([right?.working, right?.published]);
}

export async function init() {
  if (cloud) {
    if (!config.supabaseUrl || !config.supabaseAnonKey) return signedOut('Fyll i både Supabase-adressen och den publika nyckeln i config.js.');
    try {
      session = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
      if (!session?.access_token || !session?.refresh_token) {
        rememberSession(null);
        return signedOut();
      }
      return await readCloud();
    } catch (error) {
      return signedOut(error.message);
    }
  }
  let saved;
  let warning;
  try {
    saved = JSON.parse(localStorage.getItem(LOCAL_KEY) || 'null');
    if (saved) {
      checkState(saved.working);
      checkState(saved.published);
      if (!Number.isSafeInteger(saved.revision) || saved.revision < 0) throw new Error('Ogiltigt versionsnummer.');
    }
  } catch {
    saved = null;
    warning = 'Det sparade demoschemat kunde inte läsas. Ett nytt exempel visas. Exportera en säkerhetskopia efter dina ändringar.';
  }
  // Old Live Server copies have no sync marker. Preserve differing browser data
  // until it can be exported or explicitly synchronized, even at equal revision.
  if (saved && isLocal() && saved.pendingFileSync === undefined && !sameScheduleData(saved, latestDefaults)) {
    saved.pendingFileSync = true;
  }
  const useDefaults = !saved || (!saved.pendingFileSync && latestDefaults
    && (saved.revision || 0) <= latestDefaults.revision
    && !sameScheduleData(saved, latestDefaults));
  if (useDefaults) {
    saved = clone(latestDefaults || { working: seedState(), published: publicState(seedState()), revision: 0 });
  }
  // Live Server can reload as soon as the file changes, before POST resolves.
  // An exact match in the newly loaded file confirms that pending write.
  const confirmedFile = saved.pendingFileSync && saved.revision === latestDefaults?.revision
    && sameScheduleData(saved, latestDefaults);
  if (confirmedFile) saved.pendingFileSync = false;
  const fixedDates = fixLocalStartDates(saved);
  const restoredStatuses = restoreAbsenceStatuses(saved);
  const removedTeams = syncRemovedTeams(saved);
  const fixedCover = fixLocalNovemberCover(saved);
  if (fixedDates || restoredStatuses || fixedCover || useDefaults || confirmedFile) {
    try {
      localStorage.setItem(LOCAL_KEY, localPayload(saved));
    } catch {
      warning = 'Schemat har uppdaterats i vyn men kunde inte sparas på den här enheten.';
    }
  }
  // Rename only the original built-in demo identity; preserve custom and cloud names.
  for (const state of [saved.working, saved.published]) {
    const builtInTeam = state.teams.find(team => team?.id === 'team-1');
    const builtInMember = Array.isArray(builtInTeam?.members)
      ? builtInTeam.members.find(member => member?.id === 'member-1') : null;
    if (builtInMember?.name === 'You') builtInMember.name = 'Du';
  }
  snapshot = { mode: 'demo', role: 'admin', ...saved, pendingFileSync: Boolean(saved.pendingFileSync), ...(warning ? { error: warning } : {}) };
  snapshot.fileSync = saved.pendingFileSync || !sameScheduleData(saved, latestDefaults)
    ? browserOnly()
    : { state: 'file', message: isLocal()
      ? 'Schemat finns i projektfilen. Ta med src/default-data.js i din commit och push.'
      : 'Visar schemat från webbplatsens datafil.' };
  if (removedTeams) {
    try { return await saveLocal(snapshot); }
    catch (error) { snapshot.error = error.message; }
  }
  return clone(snapshot);
}

export async function refresh({ canApply = () => true } = {}) {
  const previous = snapshot;
  let defaults;
  if (!cloud && typeof location !== 'undefined') {
    try {
      const response = await fetch(new URL('./default-data.js', import.meta.url), { cache: 'no-store' });
      if (response.ok) {
        // The sync scripts store a JSON object in this module. Read it as data
        // so both previews and the hosted site receive newly published schedules
        // without keeping the initial module import cached until a page reload.
        const source = await response.text();
        const value = JSON.parse(source.replace(/^\s*export const defaultWorkspace\s*=\s*/, '').replace(/;\s*$/, ''));
        checkState(value.working);
        checkState(value.published);
        if (Number.isSafeInteger(value.revision) && value.revision >= 0) defaults = value;
      }
    } catch {
      // A network outage must not hide the saved browser schedule.
    }
  }
  // A save or a newly opened editor takes precedence over a background read.
  if (snapshot !== previous || !canApply()) return clone(snapshot);
  if (defaults && (!latestDefaults
    || defaults.revision > latestDefaults.revision
    || (defaults.revision === latestDefaults.revision && !sameScheduleData(defaults, latestDefaults)))) {
    latestDefaults = defaults;
  }
  return init();
}

export async function saveDraft(state) {
  const working = checkState(state);
  if (!snapshot) throw new Error('Öppna schemat innan du sparar.');
  if (cloud) {
    const result = await request('/rest/v1/rpc/save_draft', {
      p_draft: working, p_expected_revision: snapshot.revision,
    }, await accessToken());
    snapshot = cloudSnapshot(result);
    return clone(snapshot);
  }
  return saveLocal({ ...snapshot, working, revision: snapshot.revision + 1 });
}

export async function publish(state) {
  const working = checkState(state);
  // Validate the full rotation before making it visible to coworkers.
  const published = publicState(working);
  if (!snapshot) throw new Error('Öppna schemat innan du publicerar.');
  if (cloud) {
    const result = await request('/rest/v1/rpc/publish_workspace', {
      p_draft: working, p_expected_revision: snapshot.revision,
    }, await accessToken());
    snapshot = cloudSnapshot(result);
    return clone(snapshot);
  }
  return saveLocal({ ...snapshot, working: { ...working, publishedAt: published.publishedAt }, published, revision: snapshot.revision + 1 });
}

export async function login(email, password) {
  if (!cloud) throw new Error('Den lokala demon använder ingen inloggning.');
  const result = await request('/auth/v1/token?grant_type=password', { email: email.trim(), password });
  rememberSession(normalizeSession(result));
  try {
    return await readCloud();
  } catch (error) {
    rememberSession(null);
    throw error;
  }
}

export async function logout() {
  if (cloud && session) {
    // Clear this browser even if the logout request cannot reach the server.
    const token = session.access_token;
    rememberSession(null);
    snapshot = null;
    await request('/auth/v1/logout', {}, token).catch(() => {});
    return signedOut();
  }
  return init();
}

export function exportData() {
  if (!snapshot?.working || snapshot.role !== 'admin') throw new Error('Endast en administratör kan exportera schemat.');
  return clone(snapshot.working);
}

export async function importData(state) {
  const working = checkState(state);
  const errors = validateState(working);
  if (errors.length) throw new Error(errors.join('\n'));
  return publish(working);
}

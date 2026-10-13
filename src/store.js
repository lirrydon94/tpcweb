import { config } from '../config.js';
import { seedState, publishState, validateState } from './model.js';

const LOCAL_KEY = 'skift-workspace-v1';
const SESSION_KEY = 'skift-session-v1';
const cloud = Boolean(config.supabaseUrl || config.supabaseAnonKey);
let session = null;
let snapshot = null;

const clone = (value) => JSON.parse(JSON.stringify(value));

function checkState(state) {
  if (!state || state.schemaVersion !== 1 || !Array.isArray(state.teams) || !Array.isArray(state.exceptions)) {
    throw new Error('Choose a Skift schedule file containing schemaVersion 1, teams, and exceptions.');
  }
  if (JSON.stringify(state).length > 5_000_000) throw new Error('The schedule is too large (maximum 5 MB).');
  return clone(state);
}

function publicState(state) {
  const published = publishState(checkState(state));
  const result = JSON.parse(JSON.stringify(published, (key, value) => (
    ['note', 'reason', 'adminNote', 'medicalDetails'].includes(key) ? undefined : value
  )));
  // Coworkers see hours and unavailability. Only administrators see the reason.
  result.exceptions = result.exceptions.map((entry) => {
    const copy = { ...entry };
    delete copy.note;
    delete copy.reason;
    delete copy.adminNote;
    delete copy.medicalDetails;
    if (['sick', 'vacation', 'pension'].includes(copy.type)) {
      copy.type = copy.type === 'pension' && copy.start && copy.end ? 'custom' : 'off';
    }
    return copy;
  });
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
    throw new Error('Could not connect to the shared schedule. Check your internet connection.');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (/revision|changed|ändrat/i.test(data.message || '')) {
      throw new Error('The schedule changed in another session. Reload the page before saving.');
    }
    throw new Error(data.msg || data.error_description || data.message || `The server returned error ${response.status}.`);
  }
  return data;
}

async function accessToken() {
  if (!session) throw new Error('Sign in to open the shared schedule.');
  if (session.expires_at <= Math.floor(Date.now() / 1000) + 60) {
    try {
      const refreshed = await request('/auth/v1/token?grant_type=refresh_token', { refresh_token: session.refresh_token });
      rememberSession(normalizeSession(refreshed));
    } catch (error) {
      rememberSession(null);
      throw new Error(`Please sign in again. ${error.message}`);
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

function saveLocal(value) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify({ working: value.working, published: value.published, revision: value.revision }));
  } catch {
    throw new Error('Could not save on this device. Check your browser storage space.');
  }
  snapshot = value;
  return clone(snapshot);
}

export async function init() {
  if (cloud) {
    if (!config.supabaseUrl || !config.supabaseAnonKey) return signedOut('Fill in both the Supabase URL and public key in config.js.');
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
      if (!Number.isSafeInteger(saved.revision) || saved.revision < 0) throw new Error('Invalid revision');
    }
  } catch {
    saved = null;
    warning = 'The saved demo could not be read. A new example is shown; export a backup after making changes.';
  }
  if (!saved) {
    const working = seedState();
    saved = { working, published: publicState(working), revision: 0 };
  }
  snapshot = { mode: 'demo', role: 'admin', ...saved, ...(warning ? { error: warning } : {}) };
  return clone(snapshot);
}

export async function saveDraft(state) {
  const working = checkState(state);
  if (!snapshot) throw new Error('Open the schedule before saving.');
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
  if (!snapshot) throw new Error('Open the schedule before publishing.');
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
  if (!cloud) throw new Error('The local demo does not use sign-in.');
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
  if (!snapshot?.working || snapshot.role !== 'admin') throw new Error('Only an administrator can export the schedule.');
  return clone(snapshot.working);
}

export async function importData(state) {
  const working = checkState(state);
  const errors = validateState(working);
  if (errors.length) throw new Error(errors.join('\n'));
  return saveDraft(working);
}

import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { validateState } from '../src/model.js';

export async function readWorkspace(root) {
  const source = await fs.readFile(path.join(root, 'src', 'default-data.js'), 'utf8');
  return JSON.parse(source.replace(/^\s*export const defaultWorkspace\s*=\s*/, '').replace(/;\s*$/, ''));
}

const scheduleData = value => JSON.stringify([value.working, value.published]);

export async function writeWorkspace(root, data) {
  if (!data || !Number.isSafeInteger(data.revision) || data.revision < 0
    || !data.working || !data.published
    || validateState(data.working).length || validateState(data.published).length) {
    throw Object.assign(new Error('Invalid workspace'), { status: 400 });
  }
  const workspace = {
    working: data.working, published: data.published, revision: data.revision,
    appliedFixes: Array.isArray(data.appliedFixes) ? data.appliedFixes : [],
  };
  const previous = await readWorkspace(root);
  if (data.revision < previous.revision
    || (data.revision === previous.revision && scheduleData(data) !== scheduleData(previous))) {
    throw Object.assign(new Error('Project file has a conflicting revision'), { status: 409 });
  }
  if (JSON.stringify(previous) === JSON.stringify(workspace)) {
    return { ok: true, revision: data.revision, unchanged: true };
  }
  const target = path.join(root, 'src', 'default-data.js');
  const temporary = `${target}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, `export const defaultWorkspace = ${JSON.stringify(workspace, null, 2)};\n`, 'utf8');
    await fs.rename(temporary, target);
  } finally { await fs.rm(temporary, { force: true }); }
  return { ok: true, revision: data.revision };
}

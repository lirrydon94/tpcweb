import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import * as model from '../src/model.js';

const source = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
const modalSource = source.slice(source.indexOf('function shiftModal('), source.indexOf('function exceptionModal('));

function editor(code = 'N', personal = true) {
  const state = model.seedState(), team = state.teams[0], version = team.versions[0];
  version.shifts.N = { start: '22:00', end: '06:00', color: 'blue' };
  version.rotation[0][0] = 'N';
  if (personal) {
    const rotation = version.rotation.map(() => Array(7).fill(null));
    rotation[0][1] = { type: 'shift', code: 'N' };
    rotation[0][2] = { type: 'shift', code: 'A' };
    rotation[0][3] = { type: 'custom', start: '10:00', end: '14:00' };
    rotation[0][4] = { type: 'leave' };
    version.personalSchedules = [{ memberId: 'member-1', effectiveFrom: '2026-10-12', employmentPercent: 100, rotation }];
  }
  team.versions.push({ ...structuredClone(version), id: 'future', effectiveFrom: '2027-01-04' });
  const otherTeam = structuredClone(team);
  otherTeam.id = 'team-2';
  otherTeam.members.forEach(member => { member.id = `other-${member.id}`; });
  otherTeam.versions.forEach(item => {
    item.positions = Object.fromEntries(Object.entries(item.positions).map(([id, position]) => [`other-${id}`, position]));
    for (const schedule of item.personalSchedules || []) schedule.memberId = `other-${schedule.memberId}`;
  });
  state.teams.push(otherTeam);
  model.organizeState(state);
  const sibling = structuredClone(team);
  sibling.id = 'sibling';
  sibling.members = [];
  sibling.showScheduleName = false;
  for (const item of sibling.versions) { item.positions = {}; delete item.personalSchedules; }
  state.teams.push(sibling);
  let submit, body, saved;
  vm.runInNewContext(modalSource + '\nshiftModal(code);', {
    code, model, workingTeam: () => team, editingVersion: () => version,
    esc: value => String(value), icon: () => '', colorLabel: value => value,
    copy: () => structuredClone(state),
    modal: (_title, _description, html, callback) => { body = html; submit = callback; },
    save: async next => { assert.deepEqual(model.validateState(next), []); saved = structuredClone(next); },
  });
  return { state, body, get saved() { return saved; },
    submit: (newCode, overrides = {}) => submit(new Map(Object.entries({ code: newCode, start: '22:00', end: '06:00', color: 'blue', ...overrides }))),
  };
}

test('renaming a pass updates all group versions in its team and leaves other teams alone', async () => {
  const edit = editor(), original = structuredClone(edit.state);
  assert.doesNotMatch(edit.body.match(/<input name="code"[^>]*>/)[0], /readonly|disabled/);
  await edit.submit('natt');
  const version = edit.saved.teams[0].versions[0];
  assert.equal(Object.hasOwn(version.shifts, 'N'), false);
  assert.deepEqual(version.shifts.NATT, original.teams[0].versions[0].shifts.N);
  for (const date of ['2026-10-12', '2026-10-13']) {
    const before = model.getShift(original, 'team-1', 'member-1', date);
    const after = model.getShift(edit.saved, 'team-1', 'member-1', date);
    assert.equal(before.code, 'N');
    assert.deepEqual(after, { ...before, code: 'NATT' });
  }
  assert.deepEqual(version.personalSchedules[0].rotation[0].slice(2), original.teams[0].versions[0].personalSchedules[0].rotation[0].slice(2));
  assert.equal(edit.saved.teams[0].versions[1].personalSchedules[0].rotation[0][1].code, 'NATT');
  for (const group of [edit.saved.teams[0], edit.saved.teams[2]]) for (const item of group.versions) {
    assert.equal(item.rotation[0][0], 'NATT');
    assert.equal(Object.hasOwn(item.shifts, 'N'), false);
    assert.deepEqual(item.shifts, edit.saved.workTeams[0].shifts);
  }
  assert.deepEqual(edit.saved.teams[1], original.teams[1]);
  assert.deepEqual(edit.state, original);
});

test('renaming works without personal schedules and can also change times and color', async () => {
  const edit = editor('N', false);
  await edit.submit('N2', { start: '21:00', color: 'purple' });
  const shift = model.getShift(edit.saved, 'team-1', 'member-1', '2026-10-12');
  assert.equal(shift.code, 'N2');
  assert.equal(shift.start, '21:00');
  assert.equal(shift.color, 'purple');
  assert.equal(shift.minutes, 540);
});

test('existing pass codes cannot be overwritten by renaming or adding', async () => {
  for (const code of ['N', null]) {
    const edit = editor(code), original = structuredClone(edit.state);
    await assert.rejects(edit.submit('a'), /passkoden finns redan/);
    assert.equal(edit.saved, undefined);
    assert.deepEqual(edit.state, original);
  }
});

test('editing times without renaming and adding a new pass still work', async () => {
  for (const code of ['N', null]) {
    const edit = editor(code);
    await edit.submit(code || 'N2', { start: '21:00' });
    const version = edit.saved.teams[0].versions[0];
    assert.equal(version.shifts[code || 'N2'].start, '21:00');
    assert.deepEqual(version.rotation, edit.state.teams[0].versions[0].rotation);
    assert.deepEqual(version.personalSchedules, edit.state.teams[0].versions[0].personalSchedules);
  }
});

test('invalid pass codes and equal start and end times do not save', async () => {
  const edit = editor();
  for (const code of ['', 'TOOLONG', 'N!']) await assert.rejects(edit.submit(code), /passkod med/);
  await assert.rejects(edit.submit('N2', { end: '22:00' }), /Start- och sluttid/);
  assert.equal(edit.saved, undefined);
});

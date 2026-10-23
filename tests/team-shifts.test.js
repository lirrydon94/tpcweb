import test from 'node:test';
import assert from 'node:assert/strict';
import * as model from '../src/model.js';
import { defaultWorkspace } from '../src/default-data.js';

test('existing teams share all passes without changing scheduled times or rotation positions', () => {
  const before = structuredClone(defaultWorkspace.working);
  const state = model.organizeState(structuredClone(before));
  for (const team of state.workTeams) {
    for (const group of state.teams.filter(item => item.workTeamId === team.id)) {
      const original = before.teams.find(item => item.id === group.id);
      for (const version of group.versions) {
        const previous = original.versions.find(item => item.id === version.id);
        assert.deepEqual(version.shifts, team.shifts);
        assert.deepEqual(version.positions, previous.positions);
        previous.rotation.forEach((row, week) => row.forEach((code, day) => {
          if (!code) return assert.equal(version.rotation[week][day], '');
          const current = version.shifts[version.rotation[week][day]];
          assert.equal(current.start, previous.shifts[code].start);
          assert.equal(current.end, previous.shifts[code].end);
        }));
      }
    }
  }
  const ordering = state.workTeams.find(team => team.name === 'Beställning');
  for (const code of ['N', 'Z', 'V1', 'V2', 'V3']) assert.ok(ordering.shifts[code]);
  assert.equal(state.workTeams.find(team => team.name === 'Avfall').shifts.N, undefined);
  assert.deepEqual(model.validateState(state), []);
  const saved = JSON.parse(JSON.stringify(state));
  model.organizeState(state);
  assert.deepEqual(state, saved);
});

test('conflicting legacy times get distinct codes without overwriting existing codes or personal shifts', () => {
  const state = model.organizeState(model.seedState()), group = state.teams[0];
  delete state.workTeams[0].shifts; // A pre-migration backup.
  const older = group.versions[0];
  older.shifts.N = { start: '21:00', end: '06:00', color: 'blue' };
  older.shifts.N2 = { start: '20:00', end: '06:00', color: 'red' };
  older.rotation[0][0] = 'N';
  const rotation = older.rotation.map(() => Array(7).fill(null));
  rotation[0][1] = { type: 'shift', code: 'N' };
  older.personalSchedules = [{ memberId: 'member-1', effectiveFrom: '2026-10-12', employmentPercent: 100, rotation }];
  const newer = structuredClone(older);
  newer.id = 'newer'; newer.effectiveFrom = '2027-01-04';
  newer.shifts.N.start = '22:00';
  group.versions.push(newer);
  const sibling = structuredClone(group);
  sibling.id = 'night'; sibling.members = [];
  sibling.versions = [structuredClone(older)];
  sibling.versions[0].positions = {}; delete sibling.versions[0].personalSchedules;
  state.teams.push(sibling);
  const before = model.getShift(state, group.id, 'member-1', '2026-10-12');
  model.organizeState(state);
  assert.equal(older.rotation[0][0], 'N3');
  assert.equal(older.personalSchedules[0].rotation[0][1].code, 'N3');
  assert.equal(sibling.versions[0].rotation[0][0], 'N3');
  assert.equal(newer.rotation[0][0], 'N');
  assert.equal(state.workTeams[0].shifts.N2.start, '20:00');
  assert.deepEqual(model.getShift(state, group.id, 'member-1', '2026-10-12'), { ...before, code: 'N3' });
  assert.deepEqual(model.validateState(state), []);
  const saved = structuredClone(state);
  model.organizeState(state);
  assert.deepEqual(state, saved);
});

test('the shared catalogue survives publication, reload and deletion of the last group', () => {
  const state = model.organizeState(model.seedState()), group = state.teams[0];
  model.saveTeamShift(state, group.id, null, 'N', { start: '22:00', end: '06:00', color: 'blue' });
  const saved = JSON.parse(JSON.stringify(model.publishState(state)));
  model.organizeState(saved);
  const empty = model.deleteTeam(saved, group.id);
  model.organizeState(empty);
  assert.deepEqual(empty.workTeams[0].shifts.N, state.workTeams[0].shifts.N);
  const newGroup = { ...structuredClone(group), id: 'new', members: [], versions: [model.createVersion({ versions: [], members: [] }, '2027-01-04', 1)] };
  empty.teams.push(newGroup);
  model.organizeState(empty);
  assert.deepEqual(newGroup.versions[0].shifts, empty.workTeams[0].shifts);
  assert.deepEqual(model.validateState(empty), []);
});

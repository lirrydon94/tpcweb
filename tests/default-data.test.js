import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultWorkspace } from '../src/default-data.js';
import { defaultWorkspace as testWorkspace } from './fixtures/workspace.js';
import { getShift, validateState } from '../src/model.js';

test('published default workspace contains valid working and published schedules', () => {
  assert.equal(defaultWorkspace.schemaVersion, undefined);
  assert.equal(defaultWorkspace.working.schemaVersion, 1);
  assert.equal(defaultWorkspace.published.schemaVersion, 1);
  assert.deepEqual(validateState(defaultWorkspace.working), []);
  assert.deepEqual(validateState(defaultWorkspace.published), []);
});

test('baseline fixture contains valid team Löpare with all 11 coworkers', () => {
  assert.deepEqual(validateState(testWorkspace.working), []);
  assert.deepEqual(validateState(testWorkspace.published), []);
  const team = testWorkspace.working.teams[0];
  assert.equal(team.name, 'Löpare');
  assert.equal(team.members.length, 11);

  const expectedNames = [
    'Liridon', 'Liam', 'Jörgen', 'Emil', 'Sokrates', 'Joachim',
    'Agne', 'Christer', 'Martin', 'Mikael', 'Bosse'
  ];
  assert.deepEqual(team.members.map(m => m.name), expectedNames);
});

test('all four added coworkers have their scheduled Monday shifts in both views', () => {
  for (const state of [testWorkspace.working, testWorkspace.published]) {
    const team = state.teams[0];
    for (const [name, code, start, end] of [
      ['Christer', 'B', '09:30', '18:30'],
      ['Martin', 'B', '09:30', '18:30'],
      ['Mikael', 'C', '11:30', '20:30'],
      ['Bosse', 'A2', '06:15', '15:15'],
    ]) {
      const member = team.members.find(item => item.name === name);
      const shift = getShift(state, team.id, member.id, '2026-10-12');
      assert.equal(shift.working, true, name);
      assert.deepEqual([shift.code, shift.start, shift.end], [code, start, end], name);
    }
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultWorkspace } from '../src/default-data.js';
import { validateState } from '../src/model.js';

test('defaultWorkspace contains valid team Löpare with all 11 coworkers', () => {
  assert.equal(defaultWorkspace.schemaVersion, undefined);
  assert.equal(defaultWorkspace.working.schemaVersion, 1);
  assert.equal(defaultWorkspace.published.schemaVersion, 1);
  assert.deepEqual(validateState(defaultWorkspace.working), []);
  assert.deepEqual(validateState(defaultWorkspace.published), []);

  const team = defaultWorkspace.working.teams[0];
  assert.equal(team.name, 'Löpare');
  assert.equal(team.members.length, 11);

  const expectedNames = [
    'Liridon', 'Liam', 'Jörgen', 'Emil', 'Sokrates', 'Joachim',
    'Agne', 'Christer', 'Martin', 'Mikael', 'Bosse'
  ];
  assert.deepEqual(team.members.map(m => m.name), expectedNames);
});

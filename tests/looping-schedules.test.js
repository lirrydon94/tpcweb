import test from 'node:test';
import assert from 'node:assert/strict';
import * as model from '../src/model.js';
import { defaultWorkspace } from '../src/default-data.js';

test('Rickard follows Natt+ throughout both weeks, regardless of former schedule and placement dates', () => {
  for (const view of ['working', 'published']) {
    const state = model.useLoopingSchedules(structuredClone(defaultWorkspace[view]));
    const employee = state.employees.find(item => item.name === 'Rickard');
    const group = state.teams.find(item => item.id === model.placementOn(employee, '2026-10-19').groupId);
    assert.equal(group.name, 'Natt+');
    for (const monday of ['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26', '2027-01-04']) {
      assert.deepEqual(model.weekDates(monday).map(date => {
        assert.equal(model.placementOn(employee, date).groupId, group.id);
        const shift = model.getShift(state, group.id, employee.id, date);
        return shift.working ? shift.code : '';
      }), ['V2', 'V2', '', '', '', '', 'V3']);
    }
    assert.deepEqual(model.validateState(state), []);
  }
});

test('the latest rotation repeats before its old start date and across year and daylight-saving boundaries', () => {
  const state = model.organizeState(model.seedState()), group = state.teams[0];
  const latest = structuredClone(group.versions[0]);
  latest.id = 'loop'; latest.effectiveFrom = '2026-10-26'; latest.referenceMonday = '2026-10-19';
  latest.rotation = [['A', '', '', '', '', '', ''], ['B', '', '', '', '', '', ''], ['C', '', '', '', '', '', '']];
  latest.positions = Object.fromEntries(group.members.map(member => [member.id, 1]));
  group.versions.push(latest);
  const originals = structuredClone(group.versions);
  model.useLoopingSchedules(state);
  for (const [monday, expected] of [['2026-10-12', 'C'], ['2026-10-19', 'A'], ['2026-10-26', 'B'], ['2026-11-02', 'C'], ['2026-12-28', 'B'], ['2027-01-04', 'C'], ['2027-03-29', 'C']]) {
    assert.equal(model.activeVersion(group, monday).id, latest.id);
    assert.equal(model.getShift(state, group.id, 'member-1', monday).code, expected);
    assert.equal(model.getShift(state, group.id, 'member-1', model.addDays(monday, 1)).working, false);
  }
  assert.deepEqual(group.versions.map(({ loopSchedule, ...version }) => version), originals);
  const saved = JSON.parse(JSON.stringify(model.publishState(state)));
  model.useLoopingSchedules(saved);
  assert.deepEqual(saved.teams, state.teams);
  assert.deepEqual(saved.employees, state.employees);
});

test('personal recurring days loop while dated absences still apply only on their dates', () => {
  const state = model.useLoopingSchedules(model.seedState()), group = state.teams[0], version = group.versions[0];
  version.rotation = [['A', 'A', 'A', '', '', '', '']];
  version.positions = Object.fromEntries(group.members.map(member => [member.id, 1]));
  model.savePersonalSchedule(state, group.id, version.id, {
    memberId: 'member-1', effectiveFrom: '2026-10-23', employmentPercent: 100,
    rotation: [[{ type: 'leave' }, { type: 'shift', code: 'B' }, null, null, null, null, null]],
  });
  state.exceptions.push({ id: 'dated', memberId: 'member-1', teamId: group.id, date: '2026-10-20', type: 'vacation' });
  for (const monday of ['2026-10-12', '2026-10-19', '2026-10-26']) {
    assert.equal(model.getShift(state, group.id, 'member-1', monday).type, 'leave');
  }
  assert.equal(model.getShift(state, group.id, 'member-1', '2026-10-20').type, 'vacation');
  assert.equal(model.getShift(state, group.id, 'member-1', '2026-10-13').code, 'B');
  assert.equal(model.getShift(state, group.id, 'member-1', '2026-10-27').code, 'B');
  assert.equal(model.getShift(state, group.id, 'member-1', '2026-01-04').rotationWeek, 1);
  assert.deepEqual(model.validateState(state), []);
});

test('night staff loops before registration while explicit end dates and hourly availability still apply', () => {
  for (const view of ['working', 'published']) {
    const state = model.useLoopingSchedules(structuredClone(defaultWorkspace[view]));
    const groups = state.teams.filter(group => ['Natt', 'Natt+'].includes(group.name));
    assert.equal(groups.length, 2);
    for (const group of groups) for (const member of group.members) {
      if (!model.belongsToGroup(state, member.id, group.id, '2026-10-12')) continue;
      for (const date of model.weekDates('2026-10-12')) {
        assert.equal(model.isActive(member, date), true, `${member.name} ${date}`);
        assert.ok(model.getShift(state, group.id, member.id, date).rotationWeek > 0, `${member.name} ${date}`);
      }
    }
  }
  const state = model.useLoopingSchedules(model.seedState()), group = state.teams[0];
  const member = group.members[0];
  member.activeFrom = '2026-10-16';member.activeUntil = '2026-10-19';
  assert.equal(model.isActive(member, '2026-10-12'), true);
  assert.equal(model.isActive(member, '2026-10-19'), false);
  assert.equal(model.getShift(state, group.id, member.id, '2026-10-19').working, false);
  const hourly = { role: 'part-time', activeFrom: '2026-10-16' };
  assert.equal(model.isActive(hourly, '2026-10-12'), false);
  assert.equal(model.isActive(hourly, '2026-10-16'), true);
});

test('group changes select one current group for the entire loop and survive publication', () => {
  const state = model.useLoopingSchedules(model.seedState()), old = state.teams[0];
  const group = { ...structuredClone(old), id: 'night-plus', members: [] };
  group.versions[0].positions = {};
  state.teams.push(group);
  model.placeEmployee(state, 'member-1', old.workTeamId, group.id, '2026-10-23');
  const saved = model.publishState(state);
  for (const date of ['2026-10-19', '2026-10-23', '2027-01-04']) {
    assert.equal(model.belongsToGroup(saved, 'member-1', old.id, date), false);
    assert.equal(model.belongsToGroup(saved, 'member-1', group.id, date), true);
  }
  assert.equal(saved.employees[0].placements.length, 2);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { seedState, organizeState, applyExceptionDrafts, getDayAssignments, placeEmployee } from '../src/model.js';

function calendarState() {
  const state = organizeState(seedState()), group = state.teams[0], version = group.versions[0];
  version.rotation = [['A', 'A', 'A', 'A', 'A', '', '']];
  version.positions = Object.fromEntries(group.members.map(member => [member.id, 1]));
  for (const [id, name] of [['anna', 'Anna'], ['johan', 'Johan']]) {
    state.employees.push({ id, name, role: 'part-time', activeFrom: '2026-01-01', activeUntil: null,
      departmentId: state.departments[0].id, placements: [] });
  }
  return state;
}

const draft = (date, replacementId, extra = {}) => ({ memberId: 'member-1', date, type: 'vacation', replacementId, ...extra });

test('separate calendar batches across months keep their replacement and save atomically', () => {
  const original = calendarState(), before = structuredClone(original);
  const drafts = ['2026-10-28', '2026-10-29', '2026-10-30'].map(date => draft(date, 'anna'));
  drafts.push(...['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06'].map(date => draft(date, 'johan')));
  const result = applyExceptionDrafts(original, drafts, { groupIds: ['team-1'] });
  assert.deepEqual(original, before);
  assert.equal(result.entries.length, 8);
  assert.deepEqual(result.skippedDates, []);
  assert.equal(new Set(result.entries.map(entry => entry.id)).size, 8);
  assert.deepEqual(result.entries.map(entry => entry.replacementId), ['anna', 'anna', 'anna', 'johan', 'johan', 'johan', 'johan', 'johan']);
  assert.equal(getDayAssignments(result.state, 'team-1', '2026-11-02').find(item => item.memberId === 'johan').type, 'cover');
  const updated = applyExceptionDrafts(result.state, [draft('2026-10-29', 'johan')]);
  assert.equal(updated.entries[0].id, result.entries[1].id);
  assert.equal(updated.state.exceptions.length, 8);
  assert.equal(result.state.exceptions.find(entry => entry.date === '2026-10-29').replacementId, 'anna');
});

test('a rejected later batch leaves earlier batches and the source untouched', () => {
  const state = calendarState(), before = structuredClone(state);
  assert.throws(() => applyExceptionDrafts(state, [draft('2026-10-28', 'anna'), draft('2026-10-29', 'member-2')]), /överlappande pass/);
  assert.deepEqual(state, before);
  assert.throws(() => applyExceptionDrafts(state, [draft('2026-10-28', 'member-1')]), /annan person/);
  assert.throws(() => applyExceptionDrafts(state, [draft('2026-10-28', 'missing')]), /kunde inte hittas/);
  assert.throws(() => applyExceptionDrafts(state, [draft('2026-10-31', 'anna')]), /inget ordinarie pass/);
});

test('calendar absences honor personal scheduled days and allow uncovered leave', () => {
  const state = calendarState(), version = state.teams[0].versions[0];
  version.personalSchedules = [{ memberId: 'member-1', effectiveFrom: '2026-10-01', employmentPercent: 80,
    rotation: [[null, null, null, { type: 'off' }, null, null, null]] }];
  const { state: saved, entries, skippedDates } = applyExceptionDrafts(state,
    [draft('2026-10-28', ''), draft('2026-10-29', ''), draft('2026-10-31', '')]);
  assert.equal(entries.length, 1);
  assert.deepEqual(skippedDates, ['2026-10-29', '2026-10-31']);
  assert.equal(saved.exceptions[0].replacementId, undefined);
  assert.throws(() => applyExceptionDrafts(state, [draft('2026-10-31', '')]), /inga schemalagda arbetsdagar/);
  assert.equal(applyExceptionDrafts(state, [draft('2026-10-31', '', { type: 'leave' })]).entries.length, 1);
});

test('group placement and active dates are validated for every selected date', () => {
  const state = calendarState(), other = structuredClone(state.teams[0]);
  other.id = 'other';other.members = [];other.versions[0].positions = {};
  state.teams.push(other);
  placeEmployee(state, 'member-1', state.workTeams[0].id, other.id, '2026-11-01');
  const entries = applyExceptionDrafts(state, [draft('2026-10-30', ''), draft('2026-11-02', '')], { groupIds: ['team-1', 'other'] }).entries;
  assert.deepEqual(entries.map(entry => entry.teamId), ['team-1', 'other']);
  assert.throws(() => applyExceptionDrafts(state, [draft('2026-11-02', '')], { groupIds: ['team-1'] }), /aktiv placering/);
  assert.throws(() => applyExceptionDrafts(state, [draft('2026-11-02', '', { teamId: 'team-1' })]), /aktiv placering/);
  state.employees.find(item => item.id === 'anna').activeUntil = '2026-11-01';
  assert.throws(() => applyExceptionDrafts(state, [draft('2026-11-02', 'anna')]), /aktiva period/);
  state.teams.find(group => group.id === 'other').members[0].activeUntil = '2026-11-02';
  assert.throws(() => applyExceptionDrafts(state, [draft('2026-11-02', '')]), /aktiv placering/);
});

test('editing the same custom type preserves work hours and clears obsolete replacement times', () => {
  const state = calendarState();
  state.exceptions.push({ id: 'custom', teamId: 'team-1', memberId: 'member-1', date: '2026-10-28',
    type: 'custom', start: '09:00', end: '13:00', replacementId: 'anna', replacementStart: '13:00', replacementEnd: '16:00' });
  const custom = applyExceptionDrafts(state, [draft('2026-10-28', '', { type: 'custom', note: ' Ny notering ' })]).entries[0];
  assert.equal(custom.id, 'custom');assert.equal(custom.start, '09:00');assert.equal(custom.end, '13:00');
  assert.equal(custom.replacementId, undefined);assert.equal(custom.replacementStart, undefined);assert.equal(custom.note, 'Ny notering');
  const sick = applyExceptionDrafts(state, [draft('2026-10-28', 'johan', { type: 'sick' })]).entries[0];
  assert.equal(sick.start, undefined);assert.equal(sick.end, undefined);assert.equal(sick.replacementStart, undefined);
  assert.throws(() => applyExceptionDrafts(state, [draft('2026-10-28', 'anna', { replacementStart: '13:00' })]), /giltiga och olika/);
  assert.throws(() => applyExceptionDrafts(state, [draft('2026-10-28', 'anna', { replacementStart: '13:00', replacementEnd: '13:00' })]), /giltiga och olika/);
});

test('replacement checks include other batches and shifts crossing midnight', () => {
  const state = calendarState(), version = state.teams[0].versions[0];
  version.shifts.N = { start: '22:00', end: '06:00', color: 'blue' };
  state.workTeams[0].shifts.N = structuredClone(version.shifts.N);
  version.rotation[0][2] = 'N';
  assert.throws(() => applyExceptionDrafts(state, [
    draft('2026-10-28', 'anna'),
    draft('2026-10-29', 'anna', { replacementStart: '05:00', replacementEnd: '12:00' }),
  ]), /överlappande pass/);
  assert.throws(() => applyExceptionDrafts(state, [
    draft('2026-10-28', 'anna'),
    draft('2026-10-28', 'anna', { memberId: 'member-2' }),
  ]), /överlappande pass/);
  const result = applyExceptionDrafts(state, [
    draft('2026-10-28', 'anna'),
    draft('2026-10-29', 'anna', { replacementStart: '06:00', replacementEnd: '12:00' }),
  ]);
  assert.equal(result.entries.length, 2);
});

test('an absent replacement cannot be assigned by another batch', () => {
  const state = calendarState();
  const drafts = [draft('2026-10-28', 'member-2'), draft('2026-10-28', '', { memberId: 'member-2', type: 'sick' })];
  assert.throws(() => applyExceptionDrafts(state, drafts), /på grund av frånvaro/);
  assert.deepEqual(state.exceptions, []);
});

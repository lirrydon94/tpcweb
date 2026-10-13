import test from 'node:test';
import assert from 'node:assert/strict';
import {
  seedState, mondayOf, addDays, weekDates, isoWeek, rotationPosition,
  activeVersion, getShift, getDayAssignments, getCoworkers, weekStats,
  createVersion, archiveMember, validateState, publishState,
} from '../src/model.js';

test('ISO calendar dates work at year boundaries and daylight-saving transitions', () => {
  assert.equal(mondayOf('2027-01-03'), '2026-12-28');
  assert.deepEqual(isoWeek('2027-01-03'), { week: 53, year: 2026 });
  assert.deepEqual(isoWeek('2027-01-04'), { week: 1, year: 2027 });
  assert.equal(addDays('2026-03-28', 2), '2026-03-30');
  assert.equal(addDays('2026-10-24', 2), '2026-10-26');
  assert.equal(weekDates('2026-10-25')[6], '2026-10-25');
  assert.throws(() => mondayOf('2026-02-30'), RangeError);
});

test('the screenshot rotation repeats and works backward for different starting positions', () => {
  const state = seedState();
  const version = state.teams[0].versions[0];
  assert.equal(rotationPosition(version, 'member-1', '2026-10-12'), 1);
  assert.equal(rotationPosition(version, 'member-7', '2026-10-12'), 7);
  assert.equal(rotationPosition(version, 'member-1', '2026-10-05'), 11);
  assert.equal(rotationPosition(version, 'member-7', '2026-11-16'), 1);
  assert.equal(rotationPosition(version, 'member-1', '2026-12-28'), 1);
  assert.equal(getShift(state, 'team-1', 'member-1', '2026-10-12').start, '11:30');
  assert.equal(getShift(state, 'team-1', 'member-1', '2026-10-17').working, false);
  assert.deepEqual(weekStats(state, 'team-1', 'member-1', '2026-10-12'), {
    shifts: 5, hours: 45, minutes: 2700, daysOff: 2, covers: 0, rotationWeek: 1,
  });
});

test('new rotation lengths apply on the chosen date without rewriting earlier schedules', () => {
  const state = seedState();
  const team = state.teams[0];
  const old = team.versions[0];
  const next = createVersion(team, '2026-11-02', 12);
  next.positions['member-1'] = 1;
  next.rotation[0][0] = 'A';
  team.versions.push(next);
  assert.equal(activeVersion(team, '2026-11-01').id, old.id);
  assert.equal(activeVersion(team, '2026-11-02').id, next.id);
  assert.equal(getShift(state, team.id, 'member-1', '2026-11-02').start, '07:00');
  assert.equal(getShift(state, team.id, 'member-1', '2026-10-12').start, '11:30');
  assert.deepEqual(next.rotation[11], ['', '', '', '', '', '', '']);
  assert.equal(getShift(state, team.id, 'member-1', '2025-12-29').rotationWeek, 0);
  assert.deepEqual(validateState(state), []);
});

test('sickness preserves rotation and tracks uncovered hours after a partial replacement', () => {
  const state = seedState();
  state.exceptions.push({ id: 'sick-1', teamId: 'team-1', memberId: 'member-1', date: '2026-10-12', type: 'sick', replacementId: 'member-2', replacementStart: '11:30', replacementEnd: '16:00' });
  const absent = getShift(state, 'team-1', 'member-1', '2026-10-12');
  assert.equal(absent.working, false);
  assert.equal(absent.originalStart, '11:30');
  assert.equal(absent.uncoveredMinutes, 270);
  assert.equal(absent.needsCoverage, true);
  const cover = getShift(state, 'team-1', 'member-2', '2026-10-12');
  assert.equal(cover.type, 'cover');
  assert.equal(cover.conflict, false);
  assert.equal(getShift(state, 'team-1', 'member-1', '2026-10-19').rotationWeek, 2);
  assert.ok(getDayAssignments(state, 'team-1', '2026-10-12').every(item => item.memberId !== 'member-1'));
});

test('coworkers include actual overlapping hours and detect double-booked replacements', () => {
  const state = seedState();
  state.exceptions.push({ id: 'sick-1', teamId: 'team-1', memberId: 'member-1', date: '2026-10-12', type: 'sick', replacementId: 'member-4', replacementStart: '11:30', replacementEnd: '16:00' });
  const shifts = getDayAssignments(state, 'team-1', '2026-10-12');
  assert.equal(shifts.find(item => item.type === 'cover').conflict, true);
  assert.equal(shifts.find(item => item.memberId === 'member-4' && item.type === 'shift').conflict, true);
  const coworkers = getCoworkers(state, 'team-1', 'member-7', '2026-10-12');
  assert.ok(coworkers.every(item => item.overlapMinutes > 0));
  assert.ok(coworkers.some(item => item.memberId === 'member-3' && item.overlapStart === '08:00' && item.overlapEnd === '15:15'));
  assert.ok(!coworkers.some(item => item.memberId === 'member-1'));
});

test('reduced pension shifts and replacement intervals together cover the original shift', () => {
  const state = seedState();
  state.exceptions.push({ id: 'pension-1', teamId: 'team-1', memberId: 'member-1', date: '2026-10-12', type: 'pension', start: '11:30', end: '15:00', replacementId: 'member-2', replacementStart: '15:00', replacementEnd: '20:30' });
  const shift = getShift(state, 'team-1', 'member-1', '2026-10-12');
  assert.equal(shift.working, true);
  assert.equal(shift.minutes, 210);
  assert.equal(shift.uncoveredMinutes, 0);
  assert.equal(shift.needsCoverage, false);
});

test('archiving is effective from the chosen date and preserves history', () => {
  const state = seedState();
  archiveMember(state.teams[0], 'member-1', '2026-10-13');
  assert.equal(getShift(state, 'team-1', 'member-1', '2026-10-12').working, true);
  assert.equal(getShift(state, 'team-1', 'member-1', '2026-10-13').working, false);
  assert.equal(getShift(state, 'team-1', 'member-1', '2026-11-12').rotationWeek, 0);
});

test('replacement coworkers can belong to another team', () => {
  const state = seedState();
  state.teams.push({ id: 'team-2', name: 'Relief', color: '#000000', members: [{ id: 'relief-1', name: 'Lee', role: 'part-time', activeFrom: '2026-01-01', activeUntil: null }], versions: [{ id: 'relief-v1', effectiveFrom: '2026-01-01', referenceMonday: '2026-10-12', rotation: [Array(7).fill('')], shifts: {}, positions: {} }] });
  state.exceptions.push({ id: 'leave-1', teamId: 'team-1', memberId: 'member-1', date: '2026-10-12', type: 'vacation', replacementId: 'relief-1' });
  const replacement = getDayAssignments(state, 'team-1', '2026-10-12').find(item => item.memberId === 'relief-1');
  assert.equal(replacement.type, 'cover');
  assert.equal(replacement.minutes, 540);
  assert.equal(getShift(state, 'team-2', 'relief-1', '2026-10-12').type, 'cover');
  assert.ok(getCoworkers(state, 'team-2', 'relief-1', '2026-10-12').length > 0);
  assert.deepEqual(validateState(state), []);
});

test('overnight conflicts include a shift ending the following morning', () => {
  const state = seedState();
  state.exceptions.push({ id: 'night', teamId: 'team-1', memberId: 'member-2', date: '2026-10-11', type: 'custom', start: '22:00', end: '14:00' });
  state.exceptions.push({ id: 'sick', teamId: 'team-1', memberId: 'member-1', date: '2026-10-12', type: 'sick', replacementId: 'member-2', replacementStart: '11:30', replacementEnd: '16:00' });
  assert.equal(getShift(state, 'team-1', 'member-2', '2026-10-12').conflict, true);
  const overlap = getCoworkers(state, 'team-1', 'member-3', '2026-10-12').find(item => item.date === '2026-10-11');
  assert.equal(overlap.overlapStart, '08:00');
  assert.equal(overlap.overlapEnd, '14:00');
});

test('publication clones the draft and rejects invalid hours and duplicate changes', () => {
  const state = seedState();
  assert.deepEqual(validateState(state), []);
  const published = publishState(state);
  assert.ok(published.publishedAt);
  state.teams[0].members[0].name = 'Changed';
  assert.equal(published.teams[0].members[0].name, 'You');
  state.teams[0].versions[0].shifts.A.start = '25:00';
  assert.throws(() => publishState(state), /valid.*start and end times/);
});

test('malformed imported entries produce errors instead of crashing validation', () => {
  const state = seedState();
  state.teams.push(null);
  state.teams[0].members.push(null);
  state.teams[0].versions.push(null);
  state.exceptions.push(null);
  assert.ok(validateState(state).length >= 4);
});

test('a person joining the current rotation needs a position, historical versions can omit it', () => {
  const state = seedState();
  const team = state.teams[0];
  const newMember = { id: 'new-person', name: 'Pat', role: 'member', activeFrom: '2026-11-02', activeUntil: null };
  team.members.push(newMember);
  assert.ok(validateState(state).some(error => error.includes('Pat')));
  const next = createVersion(team, '2026-11-02', 12);
  team.versions.push(next);
  assert.deepEqual(validateState(state), []);
  assert.equal(getShift(state, 'team-1', newMember.id, '2026-10-26').working, false);
  assert.equal(getShift(state, 'team-1', newMember.id, '2026-11-02').rotationWeek, 1);
});

test('full-day absence makes a coworker unavailable as a replacement and leaves coverage open', () => {
  for (const type of ['sick', 'vacation', 'off', 'pension']) {
    const state = seedState();
    state.exceptions.push({ id: 'absent', teamId: 'team-1', memberId: 'member-2', date: '2026-10-12', type });
    state.exceptions.push({ id: 'needs-cover', teamId: 'team-1', memberId: 'member-1', date: '2026-10-12', type: 'sick', replacementId: 'member-2' });
    assert.equal(getShift(state, 'team-1', 'member-2', '2026-10-12').working, false);
    const source = getShift(state, 'team-1', 'member-1', '2026-10-12');
    assert.equal(source.needsCoverage, true);
    assert.equal(source.uncoveredMinutes, 540);
    assert.ok(!getDayAssignments(state, 'team-1', '2026-10-12').some(item => item.memberId === 'member-2'));
    assert.throws(() => publishState(state), /unavailable for replacement/);
  }
});

test('replacement shifts cannot fall before a start date or on/after a removal date', () => {
  for (const dates of [{ activeFrom: '2026-10-13', activeUntil: null }, { activeFrom: '2026-01-05', activeUntil: '2026-10-12' }]) {
    const state = seedState();
    Object.assign(state.teams[0].members[1], dates);
    state.exceptions.push({ id: 'needs-cover', teamId: 'team-1', memberId: 'member-1', date: '2026-10-12', type: 'sick', replacementId: 'member-2' });
    assert.equal(getShift(state, 'team-1', 'member-1', '2026-10-12').uncoveredMinutes, 540);
    assert.throws(() => publishState(state), /outside their active dates/);
  }
});

test('publication rejects replacements that overlap regular or overnight shifts', () => {
  const state = seedState();
  state.exceptions.push({ id: 'needs-cover', teamId: 'team-1', memberId: 'member-1', date: '2026-10-12', type: 'sick', replacementId: 'member-4' });
  assert.throws(() => publishState(state), /overlapping shifts on 2026-10-12/);
  state.exceptions[0].replacementId = 'member-2';
  state.exceptions.push({ id: 'night', teamId: 'team-1', memberId: 'member-2', date: '2026-10-11', type: 'custom', start: '22:00', end: '14:00' });
  assert.throws(() => publishState(state), /overlapping shifts on 2026-10-12/);
});

test('a reduced pension shift can accept a cover only outside its own working hours', () => {
  const state = seedState();
  state.exceptions.push({ id: 'pension', teamId: 'team-1', memberId: 'member-2', date: '2026-10-12', type: 'pension', start: '07:00', end: '11:30' });
  state.exceptions.push({ id: 'needs-cover', teamId: 'team-1', memberId: 'member-1', date: '2026-10-12', type: 'sick', replacementId: 'member-2', replacementStart: '11:30', replacementEnd: '20:30' });
  assert.deepEqual(validateState(state), []);
  assert.equal(getShift(state, 'team-1', 'member-1', '2026-10-12').needsCoverage, false);
  state.exceptions[1].replacementStart = '11:00';
  assert.throws(() => publishState(state), /overlapping shifts/);
});

test('cover-only part-timers remain outside the regular rotation when a version is resized', () => {
  const state = seedState();
  const team = state.teams[0];
  team.members.push({ id: 'relief-person', name: 'Lee', role: 'part-time', activeFrom: '2026-01-05', activeUntil: null });
  const next = createVersion(team, '2026-11-02', 12);
  assert.equal(next.positions['relief-person'], undefined);
  team.versions.push(next);
  assert.deepEqual(validateState(state), []);
  state.exceptions.push({ id: 'needs-cover', teamId: 'team-1', memberId: 'member-1', date: '2026-11-02', type: 'sick', replacementId: 'relief-person' });
  assert.equal(getShift(state, 'team-1', 'relief-person', '2026-11-02').type, 'cover');
  assert.ok(publishState(state).publishedAt);
});

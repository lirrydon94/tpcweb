import test from 'node:test';
import assert from 'node:assert/strict';
import * as model from '../src/model.js';

function setupState() {
  const state = model.organizeState(model.seedState('2026-10-12'));
  return state;
}

test('turbyte exception creates valid working shift with originalCode and new code', () => {
  const state = setupState();
  const group = state.teams[0];
  const member1 = group.members[0]; // has scheduled shift on 2026-10-12
  const origShift = model.getReplacementShift(state, group.id, member1.id, '2026-10-12');
  assert.equal(origShift.working, true);

  const draft = {
    memberId: member1.id,
    teamId: group.id,
    date: '2026-10-12',
    type: 'turbyte',
    code: 'B',
    originalCode: origShift.code,
    start: '09:30',
    end: '18:30',
  };

  const result = model.applyExceptionDrafts(state, [draft], { groupIds: [group.id] });
  assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0].type, 'turbyte');
  assert.equal(result.entries[0].code, 'B');
  assert.equal(result.entries[0].originalCode, origShift.code);

  const shift = model.getShift(result.state, group.id, member1.id, '2026-10-12');
  assert.equal(shift.type, 'turbyte');
  assert.equal(shift.working, true);
  assert.equal(shift.code, 'B');
  assert.equal(shift.originalCode, origShift.code);
  assert.equal(shift.start, '09:30');
  assert.equal(shift.end, '18:30');
  assert.equal(shift.color, 'blue'); // Color matches swapped shift B, not original C (purple)
  assert.equal(shift.needsCoverage, false);
});

test('paired turbyte between two coworkers correctly swaps their shifts without creating cover conflicts', () => {
  const state = setupState();
  const group = state.teams[0];
  const member4 = group.members.find(m => m.id === 'member-4'); // has shift A (07:00-16:00)
  const member7 = group.members.find(m => m.id === 'member-7'); // has shift A2 (06:15-15:15)
  const base4 = model.getReplacementShift(state, group.id, member4.id, '2026-10-12');
  const base7 = model.getReplacementShift(state, group.id, member7.id, '2026-10-12');

  assert.equal(base4.code, 'A');
  assert.equal(base7.code, 'A2');

  const draft4 = {
    memberId: member4.id,
    teamId: group.id,
    date: '2026-10-12',
    type: 'turbyte',
    code: base7.code,
    originalCode: base4.code,
    start: base7.start,
    end: base7.end,
    replacementId: member7.id,
  };

  const draft7 = {
    memberId: member7.id,
    teamId: group.id,
    date: '2026-10-12',
    type: 'turbyte',
    code: base4.code,
    originalCode: base7.code,
    start: base4.start,
    end: base4.end,
    replacementId: member4.id,
  };

  const result = model.applyExceptionDrafts(state, [draft4, draft7], { groupIds: [group.id] });
  assert.equal(result.entries.length, 2);

  const shift4 = model.getShift(result.state, group.id, member4.id, '2026-10-12');
  const shift7 = model.getShift(result.state, group.id, member7.id, '2026-10-12');

  // member4 had A, now works A2
  assert.equal(shift4.code, 'A2');
  assert.equal(shift4.originalCode, 'A');
  assert.equal(shift4.start, '06:15');
  assert.equal(shift4.end, '15:15');
  assert.equal(shift4.conflict, false);

  // member7 had A2, now works A
  assert.equal(shift7.code, 'A');
  assert.equal(shift7.originalCode, 'A2');
  assert.equal(shift7.start, '07:00');
  assert.equal(shift7.end, '16:00');
  assert.equal(shift7.conflict, false);

  // Turbyte must not create extra cover entries
  const changeEntries = model.getChangeEntries(result.state);
  const covers = changeEntries.filter(e => e.sourceExceptionId);
  assert.equal(covers.length, 0);

  // Validate state must pass without errors
  const errors = model.validateState(result.state);
  assert.deepEqual(errors, []);
});

test('turbyte roster markup renders original shift with lower opacity, arrow, new shift and turbyte badge', () => {
  // Test helper simulating the roster card generation logic in app.js
  const esc = s => String(s);
  const color = 'amber';
  const a = {
    type: 'turbyte',
    code: 'A2',
    originalCode: 'A',
    start: '06:15',
    end: '15:15',
    replacementId: 'member-7',
  };
  const c = {
    exception: { type: 'turbyte', code: 'A2', originalCode: 'A' },
    main: { code: 'A' },
  };

  const isTurbyte = a.type === 'turbyte' || c.exception?.type === 'turbyte';
  assert.equal(isTurbyte, true);

  const origCode = a.originalCode || c.main?.originalCode || c.exception?.originalCode || c.main?.code || '';
  const newCode = a.code || c.exception?.code || origCode;
  const shiftTitle = (origCode && newCode && origCode !== newCode)
    ? '<span class="roster-shift-original">' + esc(origCode) + '</span><span class="roster-shift-arrow"> → </span><span class="roster-shift-swapped">' + esc(newCode) + '</span>'
    : esc(newCode || origCode || 'Pass');
  const partner = { name: 'Sara' };
  const partnerTitle = partner ? 'Turbyte med ' + esc(partner.name) : 'Turbyte';
  const html = '<div class="roster-shift ' + color + '" title="' + esc(partnerTitle) + '"><b>' + shiftTitle + '</b><span>' + a.start + '–' + a.end + '</span><small class="roster-shift-status">Turbyte</small></div>';

  assert.ok(html.includes('<span class="roster-shift-original">A</span>'));
  assert.ok(html.includes('<span class="roster-shift-arrow"> → </span>'));
  assert.ok(html.includes('<span class="roster-shift-swapped">A2</span>'));
  assert.ok(html.includes('<span>06:15–15:15</span>'));
  assert.ok(html.includes('<small class="roster-shift-status">Turbyte</small>'));
  assert.ok(html.includes('title="Turbyte med Sara"'));
});

test('getActiveDayShifts returns only active working coworkers on that day with coworker name and shift details', () => {
  const state = setupState();
  const shifts = model.getActiveDayShifts(state, '2026-10-12', { memberId: 'member-1', scope: 'group', teamId: 'team-1' });

  // Du (member-1) is excluded
  assert.ok(!shifts.some(s => s.memberId === 'member-1'));
  // Off members (Anna member-2, Johan member-5) are excluded
  assert.ok(!shifts.some(s => s.memberId === 'member-2'));
  assert.ok(!shifts.some(s => s.memberId === 'member-5'));

  // Working members are included with correct format: [Namn] [Kod]-tur ( [Start] - [Slut] )
  const sara = shifts.find(s => s.memberId === 'member-4');
  assert.ok(sara);
  assert.equal(sara.code, 'A');
  assert.equal(sara.label, 'Sara A-tur ( 07:00 - 16:00 )');
  assert.equal(sara.value, 'A:member-4');

  const david = shifts.find(s => s.memberId === 'member-7');
  assert.ok(david);
  assert.equal(david.code, 'A2');
  assert.equal(david.label, 'David A2-tur ( 06:15 - 15:15 )');
  assert.equal(david.value, 'A2:member-7');
});


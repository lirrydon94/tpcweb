import test from 'node:test';
import assert from 'node:assert/strict';
import * as model from '../src/model.js';

function booking() {
  const state=model.organizeState(model.seedState());
  state.employees.push({id:'hourly',name:'Kim',role:'part-time',departmentId:state.departments[0].id,placements:[]});
  state.exceptions=[{id:'absence',teamId:'team-1',memberId:'member-1',date:'2026-10-12',type:'vacation',replacementId:'member-2'}];
  return state;
}

test('regular replacements get overtime entries without duplicating assignments or changing stored exceptions',()=>{
  const state=booking(),before=structuredClone(state);
  const assignments=model.getDayAssignments(state,'team-1','2026-10-12');
  const entries=model.getChangeEntries(state);
  assert.equal(entries.length,2);
  assert.deepEqual(entries[0],state.exceptions[0]);
  assert.equal(entries[1].memberId,'member-2');
  assert.equal(entries[1].type,'overtime');
  assert.equal(entries[1].sourceMemberId,'member-1');
  assert.equal(entries[1].sourceExceptionId,'absence');
  assert.equal(entries[1].start,'11:30');
  assert.equal(entries[1].end,'20:30');
  assert.equal(entries[1].minutes,540);
  assert.deepEqual(state,before);
  assert.deepEqual(model.getDayAssignments(state,'team-1','2026-10-12'),assignments);
});

test('replacement entries follow changed people, partial overnight times and deleted bookings',()=>{
  const state=booking(),entry=state.exceptions[0];
  entry.replacementId='hourly';entry.replacementStart='22:00';entry.replacementEnd='02:00';
  const cover=model.getChangeEntries(state).find(item=>item.sourceExceptionId);
  assert.equal(cover.type,'cover');assert.equal(cover.memberId,'hourly');
  assert.equal(cover.start,'22:00');assert.equal(cover.end,'02:00');assert.equal(cover.minutes,240);
  entry.replacementStart='23:00';
  assert.equal(model.getChangeEntries(state)[1].minutes,180);
  delete entry.replacementId;
  assert.deepEqual(model.getChangeEntries(state),[entry]);
  state.exceptions=[];
  assert.deepEqual(model.getChangeEntries(state),[]);
});

test('unavailable replacements and dates without a replacement shift do not create work entries',()=>{
  const state=booking();
  state.exceptions.push({id:'sick',teamId:'team-1',memberId:'member-2',date:'2026-10-12',type:'sick'});
  assert.equal(model.getChangeEntries(state).some(entry=>entry.sourceExceptionId),false);
  state.exceptions.pop();state.exceptions[0].date='2026-10-17';
  assert.equal(model.getChangeEntries(state).some(entry=>entry.sourceExceptionId),false);
});

test('replacement type uses the employee record when an older group role differs',()=>{
  const state=booking();
  state.teams[0].members.find(person=>person.id==='member-2').role='part-time';
  assert.equal(model.getChangeEntries(state)[1].type,'overtime');
});

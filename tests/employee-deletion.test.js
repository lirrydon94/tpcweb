import test from 'node:test';
import assert from 'node:assert/strict';
import * as model from '../src/model.js';

test('deleting an employee clears every membership, rotation position, personal schedule and replacement reference',()=>{
  const state=model.organizeState(model.seedState()),group=state.teams[0],version=group.versions[0];
  const rotation=version.rotation.map(()=>Array(7).fill(null));rotation[0][1]={type:'leave'};
  for(const memberId of ['member-1','member-2'])model.savePersonalSchedule(state,group.id,version.id,{memberId,effectiveFrom:'2026-10-12',rotation});
  state.teams.push({...structuredClone(group),id:'previous-group',name:'Tidigare grupp'});
  state.exceptions=[
    {id:'own',teamId:group.id,memberId:'member-1',date:'2026-10-12',type:'vacation',replacementId:'member-2'},
    {id:'cover',teamId:group.id,memberId:'member-2',date:'2026-10-17',type:'sick',replacementId:'member-1',replacementStart:'13:00',replacementEnd:'16:00',note:'Behåll anteckningen'},
    {id:'keep',teamId:group.id,memberId:'member-2',date:'2026-10-18',type:'leave',note:'Oförändrad'},
  ];
  assert.deepEqual(model.validateState(state),[]);
  const before=structuredClone(state),next=model.deleteEmployee(state,'member-1');
  assert.deepEqual(state,before);
  assert.deepEqual(next.employees,before.employees.filter(person=>person.id!=='member-1'));
  for(let i=0;i<next.teams.length;i++){
    const remaining=next.teams[i];
    assert.deepEqual(remaining.members,before.teams[i].members.filter(member=>member.id!=='member-1'));
    for(const saved of remaining.versions){
      assert.equal(saved.positions['member-1'],undefined);
      assert.equal(saved.personalSchedules.some(schedule=>schedule.memberId==='member-1'),false);
      assert.equal(saved.personalSchedules.some(schedule=>schedule.memberId==='member-2'),true);
      assert.deepEqual(saved.rotation,version.rotation);
      assert.deepEqual(saved.shifts,version.shifts);
    }
  }
  assert.deepEqual(next.exceptions,[
    {id:'cover',teamId:group.id,memberId:'member-2',date:'2026-10-17',type:'sick',note:'Behåll anteckningen'},
    state.exceptions[2],
  ]);
  assert.equal(model.getShift(next,group.id,'member-2','2026-10-17').needsCoverage,true);
  assert.equal(model.getDayAssignments(next,group.id,'2026-10-17').some(item=>item.memberId==='member-1'),false);
  assert.deepEqual(model.validateState(next),[]);
  assert.equal(model.publishState(next).employees.some(person=>person.id==='member-1'),false);
});

test('hourly and unassigned employees can be deleted without changing group schedules',()=>{
  for(const role of ['part-time','member']){
    const state=model.organizeState(model.seedState());
    state.employees.push({id:'unplaced',name:'Kim',role,activeFrom:'2026-01-01',departmentId:state.departments[0].id,placements:[]});
    if(role==='part-time')state.exceptions.push({id:'hourly-cover',teamId:'team-1',memberId:'member-1',date:'2026-10-12',type:'sick',replacementId:'unplaced'});
    const before=structuredClone(state),next=model.deleteEmployee(state,'unplaced');
    assert.deepEqual(state,before);
    assert.deepEqual(next.teams,before.teams);
    assert.equal(next.employees.some(person=>person.id==='unplaced'),false);
    assert.equal(next.exceptions.some(entry=>entry.replacementId==='unplaced'),false);
    assert.deepEqual(model.validateState(next),[]);
  }
});

test('deleting the last employee leaves valid empty groups and a publishable workspace',()=>{
  let state=model.organizeState(model.seedState());
  const ids=state.employees.map(person=>person.id),rotation=structuredClone(state.teams[0].versions[0].rotation);
  for(const id of ids)state=model.deleteEmployee(state,id);
  assert.deepEqual(state.employees,[]);
  assert.deepEqual(state.teams[0].members,[]);
  assert.deepEqual(state.teams[0].versions[0].positions,{});
  assert.deepEqual(state.teams[0].versions[0].rotation,rotation);
  assert.deepEqual(model.validateState(state),[]);
  assert.deepEqual(model.publishState(state).employees,[]);
});

test('employee deletion also supports legacy groups and missing employees fail without changing state',()=>{
  const state=model.seedState(),before=structuredClone(state);
  assert.throws(()=>model.deleteEmployee(state,'missing'),/Medarbetaren kunde inte hittas/);
  assert.deepEqual(state,before);
  const next=model.deleteEmployee(state,'member-1');
  assert.equal(next.employees,undefined);
  assert.equal(next.teams[0].members.some(person=>person.id==='member-1'),false);
  assert.deepEqual(model.validateState(next),[]);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import * as model from '../src/model.js';

test('organization migration preserves existing shifts and is idempotent',()=>{
  const state=model.seedState(),before=model.getShift(state,'team-1','member-1','2026-10-12');
  model.organizeState(state);
  assert.deepEqual(model.getShift(state,'team-1','member-1','2026-10-12'),before);
  assert.equal(state.employees.length,7);
  const snapshot=structuredClone(state);model.organizeState(state);assert.deepEqual(state,snapshot);
  assert.deepEqual(model.validateState(state),[]);
});
test('department employees can be unassigned, inherit a group schedule, move and return without rewriting history',()=>{
  const state=model.organizeState(model.seedState());
  const e={id:'new-person',name:'Nina',role:'member',activeFrom:'2026-10-12',departmentId:state.departments[0].id,placements:[]};state.employees.push(e);
  assert.deepEqual(model.validateState(state),[]);
  model.placeEmployee(state,e.id,'work-team-1','team-1','2026-10-12');
  const before=model.getShift(state,'team-1',e.id,'2026-10-12');assert.equal(before.working,true);
  const second={...structuredClone(state.teams[0]),id:'night',members:[],versions:[{id:'night-version',effectiveFrom:'2026-01-05',referenceMonday:'2026-01-05',rotation:[['N','N','N','N','N','','']],shifts:{N:{start:'22:00',end:'06:00',color:'blue'}},positions:{}}]};state.teams.push(second);
  model.placeEmployee(state,e.id,'work-team-1','night','2026-10-19');
  assert.deepEqual(model.getShift(state,'team-1',e.id,'2026-10-12'),before);
  assert.equal(model.getShift(state,'team-1',e.id,'2026-10-19').working,false);
  assert.equal(model.getShift(state,'night',e.id,'2026-10-19').start,'22:00');
  model.placeEmployee(state,e.id,'work-team-1','team-1','2026-10-26');
  assert.equal(model.getShift(state,'night',e.id,'2026-10-26').working,false);
  assert.equal(state.teams[0].members.filter(m=>m.id===e.id).length,1);
  assert.deepEqual(model.validateState(state),[]);
  const published=model.publishState(state);assert.deepEqual(published.employees,state.employees);
});
test('cross-department placements are rejected and group deletion retains employees',()=>{
  const state=model.organizeState(model.seedState());state.departments.push({id:'other',name:'Other'});state.workTeams.push({id:'other-team',name:'Other',departmentId:'other'});
  assert.throws(()=>model.placeEmployee(state,'member-1','other-team',null,'2026-10-12'));
  const next=model.deleteTeam(state,'team-1');assert.equal(next.employees.length,7);assert.equal(model.placementOn(next.employees[0],'2026-10-12').groupId,null);assert.deepEqual(model.validateState(next),[]);
});

test('a one-week schedule publishes and repeats every week across year and daylight-saving boundaries',()=>{
  const state=model.organizeState(model.seedState());
  const group=state.teams[0],version=group.versions[0];
  version.rotation=[['A','A','A','A','A','','']];
  version.positions=Object.fromEntries(group.members.map(m=>[m.id,1]));
  const saved=model.publishState(state);
  for(const monday of ['2026-10-12','2026-10-26','2026-12-28','2027-01-04']){
    for(const member of group.members){
      for(let day=0;day<7;day++){
        const shift=model.getShift(saved,group.id,member.id,model.addDays(monday,day));
        assert.equal(shift.rotationWeek,1);
        assert.equal(shift.working,day<5);
        if(day<5)assert.equal(shift.start,'07:00');
      }
    }
  }
});

test('an hourly employee without a team or group can cover a shift',()=>{
  const state=model.organizeState(model.seedState());
  state.employees.push({id:'hourly-1',name:'Timmis',role:'part-time',activeFrom:'2026-10-01',activeUntil:null,departmentId:state.departments[0].id,placements:[]});
  state.exceptions.push({id:'cover-hourly',teamId:'team-1',memberId:'member-1',date:'2026-10-12',type:'sick',replacementId:'hourly-1'});
  assert.deepEqual(model.validateState(state),[]);
  const cover=model.getDayAssignments(state,'team-1','2026-10-12').find(a=>a.memberId==='hourly-1');
  assert.equal(cover.type,'cover');
  assert.equal(cover.start,'11:30');
  assert.equal(cover.end,'20:30');
  assert.equal(state.teams.some(g=>g.members.some(m=>m.id==='hourly-1')),false);
  assert.equal(model.getDayAssignments(state,'team-1','2026-10-13').some(a=>a.memberId==='hourly-1'),false);
});

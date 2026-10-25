import test from 'node:test';
import assert from 'node:assert/strict';
import * as model from '../src/model.js';

function organizationState(){
  const state=model.useLoopingSchedules(model.seedState()),group=state.teams[0],workTeam=state.workTeams[0];
  const version=group.versions[0];
  version.rotation=[['A','A','A','A','A','','']];
  version.positions=Object.fromEntries(group.members.map(person=>[person.id,1]));
  state.workTeams.push({id:'keep-team',name:'Kvarvarande team',departmentId:state.departments[0].id});
  for(const [id,parent] of [['sibling',workTeam.id],['keep-group','keep-team']]){
    const copy=structuredClone(group);copy.id=id;copy.workTeamId=parent;copy.members=[];
    copy.versions[0].positions={};state.teams.push(copy);
  }
  model.placeEmployee(state,'member-3','keep-team','keep-group','2026-10-12');
  model.placeEmployee(state,'member-4','keep-team','keep-group','2026-10-12');
  model.placeEmployee(state,'member-5',workTeam.id,'sibling','2026-10-12');
  for(const [groupId,memberId,weekday] of [[group.id,'member-1',2],['keep-group','member-4',3]]){
    const target=state.teams.find(item=>item.id===groupId),plan=target.versions[0];
    const rotation=plan.rotation.map(()=>Array(7).fill(null));rotation[0][weekday]={type:'off'};
    model.savePersonalSchedule(state,target.id,plan.id,{memberId,effectiveFrom:'2026-10-12',rotation});
  }
  state.employees.push({id:'hourly',name:'Eddie',role:'part-time',activeFrom:'2026-01-01',departmentId:state.departments[0].id,placements:[],skilledTeamIds:[workTeam.id,'keep-team']});
  state.exceptions=[
    {id:'removed-main',teamId:group.id,memberId:'member-2',date:'2026-10-12',type:'vacation',replacementId:'hourly'},
    {id:'removed-sibling',teamId:'sibling',memberId:'member-5',date:'2026-10-13',type:'vacation'},
    {id:'open-cover',teamId:'keep-group',memberId:'member-3',date:'2026-10-14',type:'sick',replacementId:'member-1',replacementStart:'08:00',replacementEnd:'12:00',note:'Behåll frånvaron'},
    {id:'keep-cover',teamId:'keep-group',memberId:'member-3',date:'2026-10-15',type:'vacation',replacementId:'member-4'},
    {id:'hourly-cover',teamId:'keep-group',memberId:'member-3',date:'2026-10-16',type:'vacation',replacementId:'hourly'},
  ];
  return state;
}

test('deleting a work team removes all its groups and changes while keeping employees and other teams',()=>{
  const state=organizationState(),before=structuredClone(state),removedId=state.workTeams[0].id;
  assert.deepEqual(model.validateState(state),[]);
  const next=model.deleteWorkTeam(state,removedId);
  assert.deepEqual(state,before);
  assert.deepEqual(next.workTeams,state.workTeams.filter(team=>team.id!==removedId));
  assert.deepEqual(next.teams,state.teams.filter(group=>group.workTeamId!==removedId));
  assert.deepEqual(next.departments,state.departments);
  assert.deepEqual(next.employees.map(person=>person.id),state.employees.map(person=>person.id));
  assert.deepEqual(next.employees.find(person=>person.id==='hourly').skilledTeamIds,['keep-team']);
  for(const person of next.employees)for(const placement of person.placements){
    assert.notEqual(placement.teamId,removedId);
    assert.ok(!['team-1','sibling'].includes(placement.groupId));
  }
  assert.deepEqual(next.exceptions,[
    {id:'open-cover',teamId:'keep-group',memberId:'member-3',date:'2026-10-14',type:'sick',note:'Behåll frånvaron'},
    state.exceptions[3],state.exceptions[4],
  ]);
  assert.equal(model.getShift(next,'keep-group','member-3','2026-10-14').needsCoverage,true);
  assert.equal(model.getShift(next,'keep-group','member-3','2026-10-15').needsCoverage,false);
  assert.equal(model.getShift(next,'keep-group','member-3','2026-10-16').needsCoverage,false);
  assert.deepEqual(model.validateState(next),[]);
  assert.deepEqual(model.publishState(next).workTeams,next.workTeams);
});

test('the last work team can be removed without deleting department staff',()=>{
  const state=model.organizeState(model.seedState()),next=model.deleteWorkTeam(state,state.workTeams[0].id);
  assert.deepEqual(next.workTeams,[]);assert.deepEqual(next.teams,[]);
  assert.equal(next.employees.length,7);
  for(const person of next.employees)assert.deepEqual(person.placements[0],{...state.employees.find(item=>item.id===person.id).placements[0],teamId:null,groupId:null});
  assert.deepEqual(model.validateState(next),[]);
  assert.equal(model.publishState(next).employees.length,7);
});

test('an empty team and its skill markers can be removed without changing other departments',()=>{
  const state=model.organizeState(model.seedState()),departmentId=state.departments[0].id;
  state.workTeams.push({id:'empty',name:'Tomt team',departmentId});
  state.departments.push({id:'other-department',name:'Annan avdelning'});
  state.workTeams.push({id:'other-team',name:'Externt',departmentId:'other-department'});
  state.employees.push({id:'hourly',name:'Eddie',role:'part-time',departmentId,placements:[],skilledTeamIds:['empty',state.workTeams[0].id]});
  const before=structuredClone(state),next=model.deleteWorkTeam(state,'empty');
  assert.deepEqual(state,before);assert.deepEqual(next.teams,state.teams);
  assert.deepEqual(next.workTeams.find(team=>team.id==='other-team'),state.workTeams.find(team=>team.id==='other-team'));
  assert.deepEqual(next.employees.at(-1).skilledTeamIds,[state.workTeams[0].id]);
  assert.deepEqual(model.validateState(next),[]);
});

test('deleting a missing work team fails without changing the source',()=>{
  const state=organizationState(),before=structuredClone(state);
  assert.throws(()=>model.deleteWorkTeam(state,'missing'),/Teamet kunde inte hittas/);
  assert.deepEqual(state,before);
});

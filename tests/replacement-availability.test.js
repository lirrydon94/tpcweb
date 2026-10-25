import test from 'node:test';
import assert from 'node:assert/strict';
import { seedState, getReplacementAvailability } from '../src/model.js';

function availabilityState() {
  const state=seedState(),group=state.teams[0];
  group.versions[0].rotation=[Array(7).fill('A')];
  group.versions[0].positions=Object.fromEntries(group.members.map(member=>[member.id,1]));
  group.versions[0].shifts.A={start:'07:00',end:'16:00',color:'mint'};
  group.members.push({id:'hourly',name:'Eddie',role:'part-time',activeFrom:'2026-01-01'});
  state.exceptions=[];
  return state;
}

const status=(state,id='hourly',date='2026-11-22',times={})=>getReplacementAvailability(state,'team-1','member-1',date,times).get(id);

test('availability distinguishes a free day, another employee’s cover and the candidate’s own absence',()=>{
  const state=availabilityState();
  assert.equal(status(state),'available');
  state.exceptions.push({id:'booking',teamId:'team-1',memberId:'member-2',date:'2026-11-22',type:'vacation',replacementId:'hourly'});
  assert.equal(status(state),'busy');
  for(const type of ['vacation','sick','leave','parental','off','pension']) {
    state.exceptions.push({id:'absence',teamId:'team-1',memberId:'hourly',date:'2026-11-22',type});
    assert.equal(status(state),type);
    state.exceptions.pop();
  }
  assert.equal(status(state,'hourly','2026-11-21'),'available');
});

test('availability uses the actual hours across teams and adjacent overnight dates',()=>{
  const state=availabilityState(),other=structuredClone(state.teams[0]);
  other.id='other';other.members=other.members.filter(person=>person.id==='member-2');
  state.teams.push(other);
  state.exceptions.push({id:'night',teamId:'other',memberId:'member-2',date:'2026-11-21',type:'vacation',replacementId:'hourly',replacementStart:'22:00',replacementEnd:'09:00'});
  assert.equal(status(state),'busy');
  assert.equal(status(state,'hourly','2026-11-22',{start:'09:00',end:'16:00'}),'available');
  state.exceptions[0].date='2026-11-23';state.exceptions[0].replacementStart='01:00';state.exceptions[0].replacementEnd='06:00';
  state.teams[0].versions[0].shifts.A={start:'22:00',end:'07:00',color:'mint'};
  assert.equal(status(state),'busy');
});

test('regular schedules, personal absence and shortened shifts determine availability',()=>{
  const state=availabilityState(),version=state.teams[0].versions[0];
  assert.equal(status(state,'member-2'),'busy');
  version.personalSchedules=[{memberId:'member-2',effectiveFrom:'2026-01-01',rotation:[[null,null,null,null,null,null,{type:'vacation'}]]}];
  assert.equal(status(state,'member-2'),'vacation');
  state.exceptions.push({id:'shortened',teamId:'team-1',memberId:'member-2',date:'2026-11-22',type:'pension',start:'07:00',end:'11:00'});
  assert.equal(status(state,'member-2'),'busy');
  assert.equal(status(state,'member-2','2026-11-22',{start:'11:00',end:'16:00'}),'available');
});

test('a candidate’s current cover is ignored only for the source shift being edited',()=>{
  const state=availabilityState();
  state.exceptions.push({id:'current',teamId:'team-1',memberId:'member-1',date:'2026-11-22',type:'vacation',replacementId:'hourly'});
  const before=structuredClone(state);
  assert.equal(status(state),'available');
  assert.deepEqual(state,before);
  state.exceptions.push({id:'other',teamId:'team-1',memberId:'member-3',date:'2026-11-22',type:'vacation',replacementId:'hourly'});
  assert.equal(status(state),'busy');
});

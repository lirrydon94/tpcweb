import test from 'node:test';
import assert from 'node:assert/strict';
import * as model from '../src/model.js';

function fixture() {
  const state=model.organizeState(model.seedState());
  const group=state.teams[0], version=group.versions[0];
  const plan={memberId:'member-1',effectiveFrom:'2026-10-12',employmentPercent:80,rotation:version.rotation.map(()=>Array(7).fill(null))};
  plan.rotation[0][0]={type:'custom',start:'11:30',end:'18:30'};
  plan.rotation[0][4]={type:'off'};
  return {state,group,version,plan};
}
const shift=(state,date,member='member-1')=>model.getShift(state,'team-1',member,date);
const save=({state,group,version,plan})=>model.savePersonalSchedule(state,group.id,version.id,plan);

test('employment percentage weights the whole rotation and counts changed and overnight shifts',()=>{
  const version={shifts:{A:{start:'08:00',end:'16:00'},B:{start:'22:00',end:'06:00'},C:{start:'08:00',end:'12:00'}},rotation:[['A','A','B','','','',''],['A','','','','','','']]};
  const rotation=[[null,{type:'leave'},{type:'shift',code:'C'},{type:'custom',start:'22:00',end:'02:00'},null,null,null],Array(7).fill(null)];
  assert.deepEqual(model.personalScheduleStats(version,rotation),{groupMinutes:1920,personalMinutes:1440,employmentPercent:75});
  assert.equal(model.personalScheduleStats(version).employmentPercent,100);
  rotation[1][0]={type:'custom',start:'08:00',end:'15:59'};
  assert.equal(model.personalScheduleStats(version,rotation).employmentPercent,74.9);
  for(const type of model.PERSONAL_ABSENCE_TYPES){
    assert.equal(model.personalScheduleStats(version,version.rotation.map(row=>row.map(()=>({type})))).employmentPercent,0);
  }
});

test('saving derives percentage from hours, including zero, overtime and an empty baseline',()=>{
  const f=fixture();save(f);
  assert.equal(f.version.personalSchedules[0].employmentPercent,model.personalScheduleStats(f.version,f.plan.rotation).employmentPercent);
  assert.notEqual(f.version.personalSchedules[0].employmentPercent,80);
  f.plan.rotation=f.version.rotation.map(row=>row.map(()=>({type:'leave'})));save(f);
  assert.equal(f.version.personalSchedules[0].employmentPercent,0);
  assert.deepEqual(model.validateState(f.state),[]);
  f.plan.rotation=f.version.rotation.map(row=>row.map(()=>({type:'custom',start:'00:00',end:'23:00'})));save(f);
  assert.ok(f.version.personalSchedules[0].employmentPercent>100);
  assert.deepEqual(model.validateState(f.state),[]);
  f.plan.rotation=f.version.rotation.map(()=>Array(7).fill(null));save(f);
  assert.equal(f.version.personalSchedules[0].employmentPercent,100);
  f.version.rotation=f.version.rotation.map(()=>Array(7).fill(''));save(f);
  assert.equal(f.version.personalSchedules[0].employmentPercent,null);
  assert.deepEqual(model.validateState(f.state),[]);
  f.plan.rotation[0][0]={type:'custom',start:'08:00',end:'12:00'};save(f);
  assert.equal(f.version.personalSchedules[0].employmentPercent,null);
  assert.deepEqual(model.validateState(f.state),[]);
});

test('moving an existing start date to Monday updates that plan without leaving a Friday override',()=>{
  const f=fixture();f.plan.effectiveFrom='2026-10-16';save(f);
  assert.equal(shift(f.state,'2026-10-12').end,'20:30');
  model.savePersonalSchedule(f.state,f.group.id,f.version.id,{...f.plan,effectiveFrom:'2026-10-12'}, {previousEffectiveFrom:'2026-10-16'});
  assert.equal(shift(f.state,'2026-10-12').end,'18:30');
  assert.equal(f.version.personalSchedules.length,1);
  assert.equal(model.personalScheduleOn(f.version,'member-1','2026-10-16').effectiveFrom,'2026-10-12');
});

test('moving a start date cannot silently replace another existing personal plan',()=>{
  const f=fixture();save(f);
  model.savePersonalSchedule(f.state,f.group.id,f.version.id,{...f.plan,effectiveFrom:'2026-10-16'});
  const before=structuredClone(f.version.personalSchedules);
  assert.throws(()=>model.savePersonalSchedule(f.state,f.group.id,f.version.id,f.plan,{previousEffectiveFrom:'2026-10-16'}),/redigera/);
  assert.deepEqual(f.version.personalSchedules,before);
});

test('recurring absence retains its status, original code and rotation position',()=>{
  for(const type of ['leave','vacation','sick','pension']) {
    const f=fixture(),original=structuredClone(f.state);
    f.plan.rotation[0][0]={type};save(f);
    for(const date of ['2026-10-12','2026-12-28']) {
      const actual=shift(f.state,date);
      assert.equal(actual.type,type);assert.equal(actual.code,'C');assert.equal(actual.working,false);
      assert.equal(actual.minutes,0);assert.equal(actual.rotationWeek,1);
    }
    assert.deepEqual(shift(f.state,'2026-10-19'),shift(original,'2026-10-19'));
    assert.deepEqual(shift(f.state,'2026-10-12','member-2'),shift(original,'2026-10-12','member-2'));
    assert.deepEqual(model.validateState(f.state),[]);
  }
});

test('a personal shift code inherits its defined times and validates unknown codes',()=>{
  const f=fixture();f.plan.rotation[0][0]={type:'shift',code:'B'};save(f);
  assert.equal(shift(f.state,'2026-10-12').code,'B');assert.equal(shift(f.state,'2026-10-12').start,'09:30');
  f.version.shifts.B.end='16:30';assert.equal(shift(f.state,'2026-10-12').end,'16:30');
  f.plan.rotation[0][0].code='missing';assert.throws(()=>save(f),/giltig/);
});

test('recurring leave prevents replacement bookings, while a dated working override takes precedence',()=>{
  const f=fixture();f.plan.rotation[0][0]={type:'leave'};save(f);
  f.state.exceptions.push({id:'replacement',teamId:'team-1',memberId:'member-2',date:'2026-10-12',type:'sick',replacementId:'member-1',replacementStart:'08:00',replacementEnd:'10:00'});
  assert.ok(model.validateState(f.state).some(error=>error.includes('på grund av frånvaro')));
  assert.equal(model.getDayAssignments(f.state,'team-1','2026-10-12').some(a=>a.memberId==='member-1'),false);
  f.state.exceptions.push({id:'override',teamId:'team-1',memberId:'member-1',date:'2026-10-12',type:'custom',start:'11:00',end:'12:00'});
  assert.deepEqual(model.validateState(f.state),[]);
  assert.equal(shift(f.state,'2026-10-12').type,'custom');
});

test('personal hours and days off repeat in the group rotation without changing colleagues or positions',()=>{
  const f=fixture(), original=structuredClone(f.state), rotation=structuredClone(f.version.rotation), positions={...f.version.positions};
  save(f);
  for(const date of ['2026-10-12','2026-12-28','2027-03-15']) {
    const own=shift(f.state,date);
    assert.equal(own.rotationWeek,1);assert.equal(own.start,'11:30');assert.equal(own.end,'18:30');assert.equal(own.minutes,420);
    assert.equal(shift(f.state,model.addDays(date,4)).working,false);
    for(const member of f.group.members.slice(1)) assert.deepEqual(shift(f.state,date,member.id),shift(original,date,member.id));
  }
  assert.deepEqual(shift(f.state,'2026-10-19'),shift(original,'2026-10-19'));
  assert.deepEqual(f.version.rotation,rotation);assert.deepEqual(f.version.positions,positions);
  assert.deepEqual(model.validateState(f.state),[]);
});

test('personal start dates preserve history and a dated reset restores group inheritance',()=>{
  const f=fixture(), original=structuredClone(f.state); save(f);
  assert.deepEqual(shift(f.state,'2026-07-27'),shift(original,'2026-07-27'));
  const reset={...f.plan,effectiveFrom:'2026-12-28',employmentPercent:100,rotation:f.version.rotation.map(()=>Array(7).fill(null))};
  model.savePersonalSchedule(f.state,f.group.id,f.version.id,reset);
  assert.equal(shift(f.state,'2026-10-12').end,'18:30');
  assert.deepEqual(shift(f.state,'2026-12-28'),shift(original,'2026-12-28'));
  model.savePersonalSchedule(f.state,f.group.id,f.version.id,{...reset,employmentPercent:90});
  assert.equal(f.version.personalSchedules.length,2);
});

test('unchanged days inherit updated group times; personal hours remain explicit',()=>{
  const f=fixture();save(f);
  f.version.shifts.B.end='17:00';f.version.shifts.C.end='22:00';
  assert.equal(shift(f.state,'2026-10-13').end,'17:00');
  assert.equal(shift(f.state,'2026-10-12').end,'18:30');
  assert.equal(model.weekStats(f.state,'team-1','member-1','2026-10-12').hours,32.5);
});

test('dated absence and cover use the personal hours and normal scheduling consumers see them',()=>{
  const f=fixture();save(f);
  f.state.employees.push({id:'temp',name:'Kim',role:'part-time',departmentId:f.state.departments[0].id,activeFrom:'2026-01-01',placements:[]});
  f.state.exceptions.push({id:'absence',memberId:'member-1',teamId:'team-1',date:'2026-10-12',type:'sick',replacementId:'temp'});
  const own=shift(f.state,'2026-10-12');assert.equal(own.working,false);assert.equal(own.originalEnd,'18:30');assert.equal(own.uncoveredMinutes,0);
  const cover=model.getDayAssignments(f.state,'team-1','2026-10-12').find(a=>a.memberId==='temp');
  assert.equal(cover.end,'18:30');assert.equal(cover.minutes,420);
  assert.deepEqual(model.validateState(f.state),[]);
});

test('personal overnight hours participate in replacement conflict detection',()=>{
  const f=fixture();f.plan.rotation[0][0]={type:'custom',start:'22:00',end:'06:00'};save(f);
  assert.equal(shift(f.state,'2026-10-12').minutes,480);
  f.state.exceptions.push({id:'overlap',memberId:'member-2',teamId:'team-1',date:'2026-10-13',type:'sick',replacementId:'member-1',replacementStart:'05:00',replacementEnd:'07:00'});
  assert.ok(model.validateState(f.state).some(error=>error.includes('överlappande')));
});

test('personal plans are scoped to the group and survive publication and version resizing',()=>{
  const f=fixture();save(f);
  const published=model.publishState(f.state);
  f.plan.rotation[0][0].end='12:00';
  assert.equal(shift(published,'2026-10-12').end,'18:30');
  const next=model.createVersion(f.group,'2026-12-28',3);f.group.versions.push(next);
  assert.equal(next.personalSchedules[0].rotation.length,3);
  assert.equal(shift(f.state,'2026-12-28').end,'18:30');
  model.placeEmployee(f.state,'member-1',null,null,'2026-12-29');
  assert.equal(shift(f.state,'2026-12-29').working,false);
  assert.deepEqual(model.validateState(f.state),[]);
});

test('reordering, appending and deleting group weeks remaps personal days',()=>{
  const f=fixture();save(f);
  let indices=f.version.rotation.map((_,i)=>i);indices.push(indices.shift());
  model.remapPersonalSchedules(f.version,indices);f.version.rotation=indices.map(i=>f.version.rotation[i]);
  assert.equal(f.version.personalSchedules[0].rotation.at(-1)[0].end,'18:30');
  f.version.rotation.push(Array(7).fill(''));
  model.remapPersonalSchedules(f.version,f.version.rotation.map((_,i)=>i));
  assert.deepEqual(f.version.personalSchedules[0].rotation.at(-1),Array(7).fill(null));
  indices=f.version.rotation.map((_,i)=>i).filter(i=>i!==10);
  model.remapPersonalSchedules(f.version,indices);f.version.rotation=indices.map(i=>f.version.rotation[i]);
  assert.ok(f.version.personalSchedules[0].rotation.flat().every(cell=>cell===null));
  assert.deepEqual(model.validateState(f.state),[]);
});

test('invalid personal schedules are rejected on save and publication',()=>{
  for(const change of [p=>p.effectiveFrom='2026-02-30',p=>p.memberId='missing',p=>p.rotation.pop(),p=>p.rotation[0][0]={type:'custom',start:'08:00',end:'08:00'},p=>p.rotation[0][0]={type:'custom',start:'25:00',end:'17:00'},p=>p.rotation[0][0]={type:'unknown'}]) {
    const f=fixture();change(f.plan);assert.throws(()=>save(f));
    f.version.personalSchedules=[f.plan];assert.notDeepEqual(model.validateState(f.state),[]);
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import * as model from '../src/model.js';

const source=await readFile(new URL('../src/app.js',import.meta.url),'utf8');
const editorSource=source.slice(source.indexOf('function exceptionModal('),source.indexOf('function teamSettings('));
const labels={vacation:'Semester',sick:'Sjuk',leave:'Tjänstledig',pension:'Pensionsdag',overtime:'Övertid',custom:'Anpassat pass',off:'Ledig',shift:'Arbetar'};
const esc=(value='')=>String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

function calendarState(){
  const state=model.useLoopingSchedules(model.organizeState(model.seedState())),group=state.teams[0];
  for(const version of group.versions){
    version.rotation=[['A','A','A','A','A','','']];
    version.positions=Object.fromEntries(group.members.map(member=>[member.id,1]));
  }
  state.exceptions=[];
  for(const [id,name] of [['anna','Anna'],['johan','Johan']])state.employees.push({id,name,role:'part-time',activeFrom:'2026-01-01',activeUntil:null,departmentId:state.departments[0].id,placements:[]});
  return state;
}

function openEditor({state=calendarState(),options={memberId:state.teams[0].members[0].id}}={}){
  const workspace={working:structuredClone(state)},fields={},nodes={},events={};
  let onSubmit,saveError=null,published=null,saves=0,dialogBody='',keepOpen=false;
  const toasts=[];
  const node=()=>({innerHTML:'',textContent:'',hidden:false,disabled:false,checked:false,required:false,setAttribute(){},removeAttribute(){},focus(){}});
  const form={
    querySelector:selector=>selector.startsWith('#')?nodes[selector]:fields[selector.match(/name="([^"]+)"/)?.[1]],
    querySelectorAll:()=>[],
    addEventListener:(type,handler)=>{events[type]=handler;},
  };
  const error=node(),dialog={open:true,querySelector:selector=>selector==='.form-error'?error:form.querySelector(selector),close(){this.open=false;}};
  const values=()=>Object.fromEntries(Object.entries(fields).map(([name,field])=>[name,field.value]));
  class FormValues{
    constructor(target){this.target=target===form?values():target;}
    get(name){return this.target[name]??null;}
    getAll(name){return this.target[name]||[];}
    has(name){return name in this.target;}
  }
  const modal=(_title,_description,body,submit,modalOptions)=>{
    dialogBody=body;onSubmit=submit;
    keepOpen=Boolean(modalOptions?.keepOpen);
    const html=body+(modalOptions?.extra||'');
    for(const match of html.matchAll(/\bid="([^"]+)"/g))nodes['#'+match[1]]=node();
    for(const match of html.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/g)){
      const name=match[1].match(/name="([^"]+)"/)?.[1];if(!name)continue;
      const options=[...match[2].matchAll(/<option\b([^>]*)>/g)];
      const chosen=options.find(option=>/\bselected\b/.test(option[1]))||options[0];
      fields[name]={...node(),name,value:chosen?.[1].match(/value="([^"]*)"/)?.[1]||''};
    }
    for(const match of html.matchAll(/<input\b([^>]*)>/g)){
      const name=match[1].match(/name="([^"]+)"/)?.[1];if(!name)continue;
      const value=match[1].match(/value="([^"]*)"/)?.[1]||'';
      fields[name]={...node(),name,value,checked:/\bchecked\b/.test(match[1])};
    }
    for(const match of html.matchAll(/<textarea\b([^>]*)>([\s\S]*?)<\/textarea>/g)){
      const name=match[1].match(/name="([^"]+)"/)?.[1];if(name)fields[name]={...node(),name,value:match[2]};
    }
  };
  const context=vm.createContext({document:{activeElement:null},model,workspace,ui:{date:'2026-10-28',view:'admin',adminTab:'changes'},workingTeam:()=>workspace.working.teams[0],organizationSelection:()=>({groups:workspace.working.teams}),modal,esc,label:value=>labels[value]||value,icon:()=>'',weekdayLabels:['Mån','Tis','Ons','Tor','Fre','Lör','Sön'],weekdayNames:['måndag','tisdag','onsdag','torsdag','fredag','lördag','söndag'],fmt:(date,options)=>new Intl.DateTimeFormat('sv-SE',{...options,timeZone:'UTC'}).format(new Date(date+'T12:00:00Z')),today:()=>'2026-10-28',hours:value=>value/60,copy:()=>structuredClone(workspace.working),$:selector=>selector==='#modal-form'?form:selector==='#modal'?dialog:selector==='.form-error'?error:nodes[selector],$$:selector=>form.querySelectorAll(selector),FormData:FormValues,structuredClone,Intl,Date,toast:message=>toasts.push(message),save:async next=>{if(saveError)throw new Error(saveError);saves++;published=structuredClone(next);workspace.working=structuredClone(next);},options});
  vm.runInContext(editorSource+'\nexceptionModal(options);',context);
  return {
    fields,nodes,error,dialog,toasts,
    body:()=>dialogBody,
    saved:()=>published,
    current:()=>structuredClone(workspace.working),
    saves:()=>saves,
    failSave:message=>{saveError=message;},
    set:(name,value)=>{fields[name].value=value;events.change?.({target:fields[name]});},
    check:(name,checked)=>{fields[name].checked=checked;events.change?.({target:fields[name]});},
    search:(value,kind='member')=>{fields[kind+'Search'].value=value;events.input?.({target:fields[kind+'Search']});},
    key:(key,kind='member')=>events.keydown?.({target:fields[kind+'Search'],key,preventDefault(){},stopPropagation(){}}),
    blur:(kind,relatedTarget=null)=>events.focusout?.({target:fields[kind+'Search'],relatedTarget}),
    pointer:(kind=null)=>events.pointerdown?.({target:{closest:selector=>selector==='[data-person-picker]'&&kind?{dataset:{personPicker:kind}}:null},preventDefault(){}}),
    click:(action,extra={},event={})=>events.click({...event,preventDefault(){},target:{closest:()=>({dataset:{exceptionAction:action,...extra}})}}),
    submit:async()=>{try{await onSubmit(new FormValues(form));if(!keepOpen)dialog.close();error.textContent='';}catch(err){error.textContent=err.message;}},
  };
}

const selectDays=(editor,dates)=>{for(const date of dates)editor.click('day',{date});};
const firstDates=['2026-10-28','2026-10-29','2026-10-30'];
const nextDates=['2026-11-02','2026-11-03','2026-11-04','2026-11-05','2026-11-06'];
const calendarCell=(editor,date)=>editor.nodes['#exception-month'].innerHTML.match(new RegExp(`<button\\b[^>]*data-date="${date}"[^>]*>[\\s\\S]*?<\\/button>`))?.[0]||'';
const replacementOption=(editor,id)=>editor.nodes['#exception-replacement-options'].innerHTML.match(new RegExp(`<button\\b[^>]*data-member-id="${id}"[^>]*>[\\s\\S]*?<\\/button>`))?.[0]||'';

test('recurring personal leave shows the group pass in the calendar while remaining absence',()=>{
  const state=calendarState(),group=state.teams[0],version=group.versions[0],memberId='member-2';
  version.rotation=[['A','A','A','A','A','',''],['B','B','F','A','','C','C']];
  version.positions[memberId]=2;
  const rotation=version.rotation.map(row=>row.map(()=>({type:'leave'})));
  model.savePersonalSchedule(state,group.id,version.id,{memberId,effectiveFrom:'2026-10-12',rotation});
  const original=structuredClone(state),editor=openEditor({state,options:{memberId,date:'2026-10-28'}});
  for(const [date,code,time] of [['2026-10-28','F','08:00–17:00'],['2026-10-29','A','07:00–16:00'],['2026-10-31','C','11:30–20:30']]){
    const cell=calendarCell(editor,date);
    assert.match(cell,new RegExp(`exception-day-code">${code}<`));
    assert.ok(cell.includes(time));assert.match(cell,/Tjänstledig/);
    assert.ok(cell.includes(`, ${time}, Tjänstledig"`));
    assert.equal(model.isScheduledWorkday(state,group.id,memberId,date),false);
    assert.equal(model.getShift(state,group.id,memberId,date).minutes,0);
  }
  assert.doesNotMatch(calendarCell(editor,'2026-10-30'),/exception-day-code|exception-day-pass/);
  editor.click('month',{step:'1'});
  assert.match(calendarCell(editor,'2026-11-01'),/exception-day-code">C</);
  assert.match(calendarCell(editor,'2026-11-01'),/11:30–20:30/);
  assert.match(calendarCell(editor,'2026-11-01'),/Tjänstledig/);
  assert.equal(editor.saves(),0);assert.deepEqual(editor.current(),original);assert.deepEqual(state,original);
});

test('calendar leave display preserves personal days off and dated working hours',()=>{
  const state=calendarState(),group=state.teams[0],version=group.versions[0],memberId='member-1';
  const rotation=version.rotation.map(()=>Array(7).fill(null));
  rotation[0][2]={type:'leave'};rotation[0][3]={type:'off'};rotation[0][4]={type:'custom',start:'09:00',end:'12:00'};
  model.savePersonalSchedule(state,group.id,version.id,{memberId,effectiveFrom:'2026-10-12',rotation});
  state.exceptions.push({id:'working',teamId:group.id,memberId,date:'2026-10-28',type:'overtime',start:'10:00',end:'13:00'});
  const editor=openEditor({state});
  assert.match(calendarCell(editor,'2026-10-28'),/10:00–13:00/);
  assert.doesNotMatch(calendarCell(editor,'2026-10-28'),/07:00–16:00/);
  assert.match(calendarCell(editor,'2026-10-29'),/Ledig/);
  assert.doesNotMatch(calendarCell(editor,'2026-10-29'),/exception-day-code|exception-day-pass/);
  assert.match(calendarCell(editor,'2026-10-30'),/09:00–12:00/);
  assert.doesNotMatch(calendarCell(editor,'2026-10-30'),/07:00–16:00/);
});

test('replacement suggestions show only unavailable dates and distinguish bookings from personal absence',()=>{
  const state=calendarState();
  state.exceptions.push({id:'booked',teamId:'team-1',memberId:'member-2',date:firstDates[1],type:'vacation',replacementId:'anna'});
  const editor=openEditor({state});
  selectDays(editor,[firstDates[1],firstDates[0]]);editor.search('Anna','replacement');
  const anna=replacementOption(editor,'anna');
  assert.match(anna,/Anna<\/span> ㆍ <small>Timmis<\/small>/);
  assert.match(anna,/Ej tillgänglig:/);
  assert.doesNotMatch(anna,/28\/10|data-availability="available"/);
  assert.match(anna,/data-availability="busy">29\/10 Jobbar/);
  state.exceptions.push({id:'holiday',teamId:'team-1',memberId:'anna',date:firstDates[1],type:'vacation'});
  const absent=openEditor({state});selectDays(absent,firstDates.slice(0,2));absent.search('Anna','replacement');
  assert.match(replacementOption(absent,'anna'),/data-availability="vacation">29\/10 Semester/);
  assert.doesNotMatch(replacementOption(absent,'anna'),/Jobbar/);
  assert.equal(editor.saves(),0);assert.equal(absent.saves(),0);
});

test('replacement status follows changed dates across months and disappears when no dates are selected',()=>{
  const editor=openEditor();editor.search('Anna','replacement');
  assert.doesNotMatch(replacementOption(editor,'anna'),/exception-replacement-availability/);
  editor.click('day',{date:firstDates[2]});editor.click('month',{step:'1'});editor.click('day',{date:nextDates[0]});
  editor.search('Anna','replacement');
  assert.match(replacementOption(editor,'anna'),/Tillgänglig alla dagar 30\/10, 2\/11/);
  editor.click('day',{date:firstDates[2]});editor.search('Anna','replacement');
  assert.doesNotMatch(replacementOption(editor,'anna'),/30\/10/);
  assert.match(replacementOption(editor,'anna'),/Tillgänglig 2\/11/);
  editor.click('clear');editor.search('Anna','replacement');
  assert.doesNotMatch(replacementOption(editor,'anna'),/exception-replacement-availability/);
});

test('replacement availability checks the requested partial hours and refreshes when those hours change',()=>{
  const state=calendarState();
  state.exceptions.push({id:'morning',teamId:'team-1',memberId:'member-2',date:firstDates[0],type:'vacation',replacementId:'anna',replacementStart:'07:00',replacementEnd:'11:00'});
  const editor=openEditor({state});editor.click('day',{date:firstDates[0]});editor.search('Anna','replacement');
  assert.match(replacementOption(editor,'anna'),/28\/10 Jobbar/);
  editor.set('replacement','johan');editor.set('coverMode','partial');editor.set('coverStart','11:00');editor.set('coverEnd','16:00');
  editor.search('Anna','replacement');assert.match(replacementOption(editor,'anna'),/Tillgänglig 28\/10/);
  editor.set('coverStart','10:30');editor.search('Anna','replacement');
  assert.match(replacementOption(editor,'anna'),/28\/10 Jobbar/);
});

test('editing saved or staged replacements does not count their own assignment as a conflicting booking',async()=>{
  const state=calendarState(),entry={id:'own',teamId:'team-1',memberId:'member-1',date:firstDates[0],type:'vacation',replacementId:'anna'};
  state.exceptions.push(entry);
  const saved=openEditor({state,options:{id:entry.id}});saved.search('Anna','replacement');
  assert.match(replacementOption(saved,'anna'),/Tillgänglig 28\/10/);
  const staged=openEditor();staged.set('type','vacation');staged.set('replacement','anna');
  staged.click('day',{date:firstDates[0]});await staged.click('assign');
  staged.click('day',{date:firstDates[0]});staged.search('Anna','replacement');
  assert.match(replacementOption(staged,'anna'),/Tillgänglig 28\/10/);
  assert.equal(staged.saves(),0);
});

test('replacement summaries show inactive working dates and omit selected dates without a shift',()=>{
  const state=calendarState();state.employees.find(person=>person.id==='anna').activeUntil=firstDates[1];
  const editor=openEditor({state});selectDays(editor,[firstDates[0],firstDates[1],'2026-10-31']);editor.search('Anna','replacement');
  assert.doesNotMatch(replacementOption(editor,'anna'),/28\/10|31\/10|Inget pass/);
  assert.match(replacementOption(editor,'anna'),/29\/10 Ej aktiv/);
  editor.search('Johan','replacement');
  assert.match(replacementOption(editor,'johan'),/Tillgänglig alla dagar 28–29\/10/);
  assert.doesNotMatch(replacementOption(editor,'johan'),/31\/10|Inget pass/);
});

test('all available working dates collapse to one range while selected days off are omitted',()=>{
  const editor=openEditor();selectDays(editor,[...firstDates,'2026-10-31']);editor.search('Anna','replacement');
  assert.match(replacementOption(editor,'anna'),/data-availability="available">Tillgänglig alla dagar 28–30\/10/);
  assert.equal((replacementOption(editor,'anna').match(/data-availability=/g)||[]).length,1);
  assert.doesNotMatch(replacementOption(editor,'anna'),/31\/10|Inget pass/);
  editor.click('clear');editor.click('day',{date:'2026-10-31'});editor.search('Anna','replacement');
  assert.doesNotMatch(replacementOption(editor,'anna'),/exception-replacement-availability/);
});

test('unavailable dates are chronological, preserve each cause and group consecutive matching dates',()=>{
  const state=calendarState();
  state.exceptions.push(
    {id:'sick-1',teamId:'team-1',memberId:'anna',date:firstDates[0],type:'sick'},
    {id:'sick-2',teamId:'team-1',memberId:'anna',date:firstDates[1],type:'sick'},
    {id:'leave',teamId:'team-1',memberId:'anna',date:firstDates[2],type:'leave'}
  );
  const editor=openEditor({state});selectDays(editor,[...firstDates].reverse());editor.search('Anna','replacement');
  const summary=replacementOption(editor,'anna');
  assert.match(summary,/Ej tillgänglig:/);
  assert.match(summary,/data-availability="sick">28–29\/10 Sjuk/);
  assert.match(summary,/data-availability="leave">30\/10 Tjänstledig/);
  assert.ok(summary.indexOf('28–29/10')<summary.indexOf('30/10'));
  assert.doesNotMatch(summary,/Tillgänglig alla dagar/);
});

test('unavailable ranges never include an unselected date or an available date between them',()=>{
  const state=calendarState();
  for(const d of [firstDates[0],firstDates[2]])state.exceptions.push({id:d,teamId:'team-1',memberId:'anna',date:d,type:'sick'});
  const editor=openEditor({state});selectDays(editor,firstDates);editor.search('Anna','replacement');
  assert.match(replacementOption(editor,'anna'),/28\/10 Sjuk/);
  assert.match(replacementOption(editor,'anna'),/30\/10 Sjuk/);
  assert.doesNotMatch(replacementOption(editor,'anna'),/28–30|29\/10/);
  state.exceptions.push({id:'middle',teamId:'team-1',memberId:'anna',date:firstDates[1],type:'sick'});
  const gaps=openEditor({state});selectDays(gaps,[firstDates[0],firstDates[2]]);gaps.search('Anna','replacement');
  assert.doesNotMatch(replacementOption(gaps,'anna'),/28–30|29\/10/);
});

test('available date ranges preserve month and year boundaries',()=>{
  const editor=openEditor();selectDays(editor,['2026-04-30','2026-05-01']);editor.search('Anna','replacement');
  assert.match(replacementOption(editor,'anna'),/Tillgänglig alla dagar 30\/4–1\/5/);
  editor.click('clear');selectDays(editor,['2026-12-31','2027-01-01']);editor.search('Anna','replacement');
  assert.match(replacementOption(editor,'anna'),/Tillgänglig alla dagar 31\/12\/2026–1\/1\/2027/);
});

test('Save all on an empty editor confirms there is nothing pending and closes the popup',async()=>{
  const editor=openEditor({options:{}});
  await editor.submit();
  assert.equal(editor.error.textContent,'');assert.equal(editor.saves(),0);
  assert.equal(editor.dialog.open,false);
  assert.equal(editor.toasts.at(-1),'Alla ändringar är redan sparade.');
});

test('Save all after a direct save or a deletion needs no new selection or second publication',async()=>{
  const state=calendarState(),entry={id:'saved-day',teamId:'team-1',memberId:'member-1',date:firstDates[0],type:'vacation',note:''};
  state.exceptions.push(entry);
  const editor=openEditor({state});editor.click('day',{date:entry.date});editor.set('replacement','anna');
  await editor.click('assign');assert.equal(editor.dialog.open,true);await editor.submit();
  assert.equal(editor.error.textContent,'');assert.equal(editor.saves(),1);
  assert.equal(editor.dialog.open,false);
  assert.equal(editor.saved().exceptions[0].replacementId,'anna');
  assert.equal(editor.toasts.at(-1),'Alla ändringar är redan sparade.');
  const afterDelete=openEditor({state:editor.current()});
  afterDelete.click('day',{date:entry.date});await afterDelete.click('delete');
  assert.equal(afterDelete.dialog.open,true);await afterDelete.submit();
  assert.equal(afterDelete.error.textContent,'');assert.equal(afterDelete.saves(),1);
  assert.equal(afterDelete.dialog.open,false);assert.deepEqual(afterDelete.saved().exceptions,[]);
});

test('Save all commits staged days and a current selection together without the assign step',async()=>{
  const editor=openEditor();editor.set('type','vacation');
  selectDays(editor,firstDates);await editor.click('assign');
  editor.click('month',{step:'1'});selectDays(editor,nextDates);editor.set('replacement','anna');
  await editor.submit();
  assert.equal(editor.error.textContent,'');assert.equal(editor.saves(),1);
  assert.equal(editor.dialog.open,false);assert.equal(editor.saved().exceptions.length,8);
  assert.ok(editor.saved().exceptions.filter(entry=>nextDates.includes(entry.date)).every(entry=>entry.replacementId==='anna'));
  const reopened=openEditor({state:editor.current(),options:{}});await reopened.submit();
  assert.equal(reopened.error.textContent,'');assert.equal(reopened.saves(),0);
  assert.equal(reopened.dialog.open,false);
});

for(const kind of ['member','replacement'])test(`${kind} suggestions stay open for scrollbar blur and close on outside clicks or Tab`,()=>{
  const editor=openEditor();
  editor.search('a',kind);
  const list=editor.nodes['#exception-'+kind+'-options'],suggestions=list.innerHTML;
  editor.pointer(kind);editor.blur(kind,{tagName:'DIALOG',id:'modal',closest:()=>null});
  assert.equal(list.hidden,false);
  assert.equal(list.innerHTML,suggestions);
  assert.equal(editor.fields[kind+'Search'].value,'a');
  editor.pointer();
  assert.equal(list.hidden,true);
  assert.notEqual(editor.fields[kind+'Search'].value,'a');
  editor.search('a',kind);editor.blur(kind,{name:'note',closest:()=>null});
  assert.equal(list.hidden,true);
  assert.equal(editor.saves(),0);
});

test('a new absence starts with no employee and requires a suggestion selection before dates can be assigned',async()=>{
  const state=calendarState(),editor=openEditor({state,options:{}});
  assert.equal(editor.fields.memberSearch.value,'');
  assert.equal(editor.fields.member.value,'');
  assert.match(calendarCell(editor,firstDates[0]),/disabled/);
  assert.doesNotMatch(calendarCell(editor,firstDates[0]),/07:00|Ej aktiv i gruppen/);
  selectDays(editor,firstDates);editor.click('assign');
  assert.equal(editor.saves(),0);
  assert.equal(editor.error.textContent,'Välj en medarbetare först.');
  editor.search(state.teams[0].members[0].name);editor.key('Enter');
  assert.equal(editor.fields.member.value,state.teams[0].members[0].id);
  assert.doesNotMatch(calendarCell(editor,firstDates[0]),/disabled/);
  editor.set('type','vacation');selectDays(editor,firstDates);await editor.submit();
  assert.equal(editor.error.textContent,'');
  assert.equal(editor.saves(),1);
  const reopened=openEditor({state:editor.current(),options:{}});
  assert.equal(reopened.fields.memberSearch.value,'');
  assert.equal(reopened.fields.member.value,'');
});

test('opening a specific employee from the schedule preserves that context',()=>{
  const state=calendarState(),member=state.teams[0].members[1];
  const editor=openEditor({state,options:{memberId:member.id,date:firstDates[0]}});
  assert.equal(editor.fields.memberSearch.value,member.name);
  assert.equal(editor.fields.member.value,member.id);
  assert.match(calendarCell(editor,firstDates[0]),/is-selected/);
});

test('new changes require an explicit type and do not silently become vacation',async()=>{
  const editor=openEditor();
  assert.equal(editor.fields.type.value,'');
  selectDays(editor,firstDates);await editor.click('assign');
  assert.equal(editor.error.textContent,'Välj typ av ändring först.');
  assert.doesNotMatch(calendarCell(editor,firstDates[0]),/is-staged/);
  await editor.submit();
  assert.equal(editor.saves(),0);
  assert.equal(editor.error.textContent,'Välj typ av ändring först.');
  editor.set('type','sick');await editor.submit();
  assert.equal(editor.error.textContent,'');
  assert.equal(editor.saves(),1);
  assert.ok(editor.saved().exceptions.every(entry=>entry.type==='sick'));
  assert.equal(openEditor({state:editor.current()}).fields.type.value,'');
});

test('overtime replaces pension in new changes and saves the full working hours',async()=>{
  const state=calendarState(),editor=openEditor({state});
  const typeOptions=editor.body().match(/<select name="type">([\s\S]*?)<\/select>/)[1];
  assert.match(typeOptions,/<option value="overtime"[^>]*>Övertid<\/option>/);
  assert.doesNotMatch(typeOptions,/value="pension"/);
  editor.set('type','overtime');selectDays(editor,firstDates.slice(0,2));
  assert.equal(editor.nodes['#exception-work-times'].hidden,false);
  assert.equal(editor.fields.workStart.value,'07:00');assert.equal(editor.fields.workEnd.value,'16:00');
  editor.set('workEnd','18:00');await editor.submit();
  assert.equal(editor.error.textContent,'');assert.equal(editor.saves(),1);
  assert.equal(editor.saved().exceptions.length,2);
  const shift=model.getShift(editor.saved(),'team-1','member-1',firstDates[0]);
  assert.equal(shift.type,'overtime');assert.equal(shift.working,true);
  assert.equal(shift.start,'07:00');assert.equal(shift.end,'18:00');
  assert.equal(shift.needsCoverage,false);
  assert.equal(model.weekStats(editor.saved(),'team-1','member-1',firstDates[0]).hours,model.weekStats(state,'team-1','member-1',firstDates[0]).hours+4);
  assert.equal(model.publishState(editor.saved()).exceptions[0].type,'overtime');
});

test('overtime on a day off requires hours and remains editable from the calendar',async()=>{
  const state=calendarState(),date='2026-10-31',editor=openEditor({state});
  editor.set('type','overtime');editor.click('day',{date});await editor.click('assign');
  assert.equal(editor.error.textContent,'Ange när passet börjar och slutar för övertid.');
  assert.equal(editor.saves(),0);
  editor.set('workStart','09:00');editor.set('workEnd','13:00');await editor.submit();
  assert.equal(editor.error.textContent,'');
  const entry=editor.saved().exceptions[0],shift=model.getShift(editor.saved(),'team-1','member-1',date);
  assert.equal(shift.working,true);assert.equal(shift.minutes,240);
  const reopened=openEditor({state:editor.saved()});reopened.click('day',{date});
  assert.equal(reopened.fields.type.value,'overtime');
  assert.equal(reopened.fields.workStart.value,'09:00');assert.equal(reopened.fields.workEnd.value,'13:00');
  reopened.set('workEnd','14:00');await reopened.click('assign');
  assert.equal(reopened.error.textContent,'');
  assert.equal(reopened.saved().exceptions.length,1);assert.equal(reopened.saved().exceptions[0].id,entry.id);
  assert.equal(model.getShift(reopened.saved(),'team-1','member-1',date).minutes,300);
});

test('changing overtime to vacation removes working hours and hides its time fields',async()=>{
  const state=calendarState();
  state.exceptions.push({id:'ot',teamId:'team-1',memberId:'member-1',date:firstDates[0],type:'overtime',start:'07:00',end:'18:00',note:''});
  const editor=openEditor({state});editor.click('day',{date:firstDates[0]});
  editor.set('type','vacation');
  assert.equal(editor.nodes['#exception-work-times'].hidden,true);
  assert.equal(editor.fields.workStart.disabled,true);assert.equal(editor.fields.workEnd.disabled,true);
  await editor.click('assign');
  assert.equal(editor.error.textContent,'');
  assert.equal(editor.saved().exceptions[0].type,'vacation');
  assert.equal(editor.saved().exceptions[0].start,undefined);
  assert.equal(model.getShift(editor.saved(),'team-1','member-1',firstDates[0]).working,false);
});

test('both person pickers show the current team and group rather than a historical membership',()=>{
  const state=calendarState(),group=state.teams[0],person=group.members[0];
  group.name='Dag & kväll';state.workTeams.find(team=>team.id===group.workTeamId).name='Beställning <1>';
  state.teams.push({...structuredClone(group),id:'historical',name:'Gammal grupp',workTeamId:'historical-team',members:[structuredClone(person)]});
  state.workTeams.push({id:'historical-team',departmentId:state.departments[0].id,name:'Tidigare team'});
  const editor=openEditor({state});
  editor.search(person.name);
  assert.match(editor.nodes['#exception-member-options'].innerHTML,/<small>Beställning &lt;1&gt; ㆍ Dag &amp; kväll<\/small>/);
  assert.doesNotMatch(editor.nodes['#exception-member-options'].innerHTML,/Tidigare team|Gammal grupp/);
  editor.set('member',group.members[1].id);editor.check('replacementRegular',true);editor.search(person.name,'replacement');
  assert.match(editor.nodes['#exception-replacement-options'].innerHTML,/<small>Beställning &lt;1&gt; ㆍ Dag &amp; kväll<\/small>/);
  assert.equal(editor.nodes['#exception-member-options'].hidden,true);
  editor.search('Anna','replacement');
  assert.match(editor.nodes['#exception-replacement-options'].innerHTML,/<small>Timmis<\/small>/);
});

test('replacement suggestions exclude the employee and support choosing, clearing and saving by ID',async()=>{
  const state=calendarState();state.employees.find(person=>person.id==='anna').name='Amanda';
  const editor=openEditor({state});
  assert.equal(editor.fields.replacementSearch.value,'');
  editor.search(state.teams[0].members[0].name,'replacement');
  assert.doesNotMatch(editor.nodes['#exception-replacement-options'].innerHTML,/data-member-id="member-1"/);
  editor.search('Amanda','replacement');editor.key('Enter','replacement');
  assert.equal(editor.fields.replacement.value,'anna');
  assert.equal(editor.fields.replacementSearch.value,'Amanda');
  assert.equal(editor.nodes['#exception-cover-options'].hidden,false);
  assert.equal(editor.saves(),0);
  editor.click('replacement-option',{memberId:''});
  assert.equal(editor.fields.replacement.value,'');
  assert.equal(editor.fields.replacementSearch.value,'Ingen ersättare');
  assert.equal(editor.nodes['#exception-cover-options'].hidden,true);
  editor.search('Amanda','replacement');editor.key('Enter','replacement');
  editor.set('type','vacation');selectDays(editor,firstDates);await editor.submit();
  assert.equal(editor.error.textContent,'');assert.equal(editor.saves(),1);
  assert.ok(editor.saved().exceptions.every(entry=>entry.replacementId==='anna'));
});

test('replacement role filters show hourly staff, regular staff or both without filtering the employee picker',()=>{
  const editor=openEditor();
  const list=()=>editor.nodes['#exception-replacement-options'].innerHTML;
  assert.equal(editor.fields.replacementPartTime.checked,true);
  assert.equal(editor.fields.replacementRegular.checked,false);
  editor.search('','replacement');
  assert.match(list(),/data-member-id="anna"/);assert.doesNotMatch(list(),/data-member-id="member-2"/);
  editor.check('replacementRegular',true);
  assert.match(list(),/data-member-id="anna"/);assert.match(list(),/data-member-id="member-2"/);
  editor.check('replacementRegular',false);
  assert.match(list(),/data-member-id="anna"/);assert.match(list(),/data-member-id="johan"/);
  assert.doesNotMatch(list(),/data-member-id="member-/);
  editor.check('replacementPartTime',false);editor.check('replacementRegular',true);
  assert.match(list(),/data-member-id="member-2"/);assert.doesNotMatch(list(),/data-member-id="anna"|data-member-id="johan"/);
  editor.check('replacementRegular',false);
  assert.doesNotMatch(list(),/data-member-id="[^\"]+"/);
  assert.match(list(),/Ingen ersättare/);
  editor.search('Anna');
  assert.match(editor.nodes['#exception-member-options'].innerHTML,/data-member-id="member-2"/);
});

test('role filtering preserves the search and keyboard selection chooses only matching replacements',()=>{
  const editor=openEditor();
  editor.search('Anna','replacement');editor.check('replacementRegular',false);
  const list=editor.nodes['#exception-replacement-options'].innerHTML;
  assert.match(list,/data-member-id="anna"/);
  assert.doesNotMatch(list,/data-member-id="member-2"|data-member-id="johan"/);
  assert.equal(editor.fields.replacementSearch.value,'Anna');
  editor.key('Enter','replacement');
  assert.equal(editor.fields.replacement.value,'anna');
  editor.click('replacement-option',{memberId:'member-2'});
  assert.equal(editor.fields.replacement.value,'anna');
  assert.equal(editor.saves(),0);
});

test('filtering hides candidates without clearing a chosen replacement or changing what gets saved',async()=>{
  const editor=openEditor();
  editor.set('replacement','anna');editor.check('replacementPartTime',false);
  editor.search('','replacement');
  assert.doesNotMatch(editor.nodes['#exception-replacement-options'].innerHTML,/data-member-id="anna"/);
  assert.equal(editor.fields.replacement.value,'anna');
  editor.set('type','vacation');selectDays(editor,firstDates);await editor.submit();
  assert.equal(editor.error.textContent,'');assert.equal(editor.saves(),1);
  assert.ok(editor.saved().exceptions.every(entry=>entry.replacementId==='anna'));
});

test('replacement filters use the employee role even when a group member has an older role',()=>{
  const state=calendarState();state.employees.find(person=>person.id==='member-2').role='part-time';
  const editor=openEditor({state});editor.check('replacementRegular',false);editor.search('','replacement');
  assert.match(editor.nodes['#exception-replacement-options'].innerHTML,/data-member-id="member-2"/);
  editor.check('replacementPartTime',false);editor.check('replacementRegular',true);
  assert.doesNotMatch(editor.nodes['#exception-replacement-options'].innerHTML,/data-member-id="member-2"/);
});

test('employee suggestions rank prefixes before partial matches and select the correct employee with Enter',()=>{
  const state=calendarState(),members=state.teams[0].members;
  members[0].name='Annika';members[1].name='Joanna';members[2].name='Anna';
  const editor=openEditor({state});
  selectDays(editor,firstDates);
  editor.search('ann');
  const suggestions=editor.nodes['#exception-member-options'].innerHTML;
  assert.ok(suggestions.indexOf('>Anna<')<suggestions.indexOf('>Annika<'));
  assert.ok(suggestions.indexOf('>Annika<')<suggestions.indexOf('>Joanna<'));
  assert.equal(editor.fields.member.value,members[0].id);
  editor.key('Enter');
  assert.equal(editor.fields.member.value,members[2].id);
  assert.equal(editor.fields.memberSearch.value,'Anna');
  assert.equal(editor.nodes['#exception-member-options'].hidden,true);
  assert.equal(editor.nodes['#exception-assign'].disabled,true);
  assert.equal(editor.saves(),0);
});

test('employee search handles accents, keyboard navigation, unknown names and Escape without changing the selection',()=>{
  const state=calendarState(),members=state.teams[0].members;
  members[0].name='Åsa';members[1].name='Asar';
  const editor=openEditor({state});
  editor.search('asa');
  assert.match(editor.nodes['#exception-member-options'].innerHTML,/>Åsa</);
  editor.key('ArrowDown');editor.key('Enter');
  assert.equal(editor.fields.member.value,members[1].id);
  editor.search('okänt namn');editor.key('Enter');
  assert.match(editor.nodes['#exception-member-options'].innerHTML,/Inga medarbetare hittades/);
  assert.equal(editor.fields.member.value,members[1].id);
  editor.key('Escape');
  assert.equal(editor.fields.memberSearch.value,'Asar');
  assert.equal(editor.nodes['#exception-member-options'].hidden,true);
});

test('suggestion clicks choose by employee ID and drafts lock both employee controls',()=>{
  const state=calendarState(),members=state.teams[0].members;
  members[0].name='Anna';members[1].name='Anna';
  const editor=openEditor({state});
  editor.search('Anna');editor.click('member-option',{memberId:members[1].id});
  assert.equal(editor.fields.member.value,members[1].id);
  editor.set('type','vacation');selectDays(editor,firstDates);editor.click('assign');
  assert.equal(editor.fields.memberSearch.disabled,true);
  assert.equal(editor.nodes['#exception-member-toggle'].disabled,true);
  editor.click('member-option',{memberId:members[0].id});
  assert.equal(editor.fields.member.value,members[1].id);
});

test('three days for Anna then five days for Johan remain a draft until saved together',async()=>{
  const editor=openEditor();
  assert.match(editor.body(),/exception-editor/);
  editor.set('type','vacation');selectDays(editor,firstDates);editor.set('replacement','anna');editor.click('assign');
  assert.equal(editor.saves(),0);assert.match(calendarCell(editor,firstDates[0]),/is-staged/);assert.match(calendarCell(editor,firstDates[0]),/Anna/);
  editor.click('month',{step:'1'});
  selectDays(editor,nextDates);editor.set('replacement','johan');editor.click('assign');
  assert.equal(editor.saves(),0);assert.match(calendarCell(editor,nextDates[0]),/is-staged/);assert.match(calendarCell(editor,nextDates[0]),/Johan/);
  await editor.submit();
  assert.equal(editor.error.textContent,'');assert.equal(editor.saves(),1);
  assert.equal(editor.saved().exceptions.length,8);
  assert.deepEqual(editor.saved().exceptions.filter(entry=>entry.replacementId==='anna').map(entry=>entry.date),firstDates);
  assert.deepEqual(editor.saved().exceptions.filter(entry=>entry.replacementId==='johan').map(entry=>entry.date),nextDates);
});

test('unassigned selections survive month navigation and save using the current settings',async()=>{
  const editor=openEditor();
  editor.set('type','vacation');selectDays(editor,['2026-10-30']);editor.click('month',{step:'1'});selectDays(editor,['2026-11-02']);
  editor.click('month',{step:'-1'});
  const selectedCell=editor.nodes['#exception-month'].innerHTML.match(/<button\b[^>]*data-date="2026-10-30"[^>]*>/)[0];
  assert.match(selectedCell,/is-selected/);assert.match(selectedCell,/aria-pressed="true"/);
  editor.set('replacement','anna');await editor.submit();
  assert.equal(editor.error.textContent,'');
  assert.deepEqual(editor.saved().exceptions.map(entry=>entry.date),['2026-10-30','2026-11-02']);
});

test('the date picker jumps eight months ahead without selecting or saving a day and Today returns to the current month',()=>{
  const editor=openEditor();
  editor.set('calendarDate','2027-06-15');
  assert.match(editor.nodes['#exception-month'].innerHTML,/juni 2027/);
  assert.ok(calendarCell(editor,'2027-06-15'));
  assert.doesNotMatch(calendarCell(editor,'2027-06-15'),/is-selected/);
  assert.equal(editor.nodes['#exception-assign'].disabled,true);
  assert.equal(editor.saves(),0);
  editor.click('today');
  assert.match(editor.nodes['#exception-month'].innerHTML,/oktober 2026/);
  assert.match(editor.nodes['#exception-month'].innerHTML,/name="calendarDate"[^>]*value="2026-10-28"/);
  assert.match(calendarCell(editor,'2026-10-28'),/is-today/);
});

test('date jumps and Today retain staged batches, selected dates and manually entered replacement hours',async()=>{
  const editor=openEditor();editor.set('type','vacation');
  selectDays(editor,firstDates);editor.set('replacement','anna');await editor.click('assign');
  editor.set('calendarDate','2027-06-15');editor.click('day',{date:'2027-06-15'});
  editor.set('replacement','johan');editor.set('coverMode','partial');editor.set('coverStart','10:00');editor.set('coverEnd','14:00');
  editor.click('today');
  assert.match(calendarCell(editor,firstDates[0]),/is-staged/);
  assert.equal(editor.fields.coverStart.value,'10:00');assert.equal(editor.fields.coverEnd.value,'14:00');
  editor.set('calendarDate','2027-06-15');
  assert.match(calendarCell(editor,'2027-06-15'),/is-selected/);
  await editor.submit();
  assert.equal(editor.error.textContent,'');assert.equal(editor.saves(),1);
  assert.equal(editor.saved().exceptions.length,4);
  assert.ok(editor.saved().exceptions.filter(entry=>firstDates.includes(entry.date)).every(entry=>entry.replacementId==='anna'));
  const future=editor.saved().exceptions.find(entry=>entry.date==='2027-06-15');
  assert.equal(future.replacementId,'johan');assert.equal(future.replacementStart,'10:00');assert.equal(future.replacementEnd,'14:00');
});

test('month arrows update the navigation date across years and invalid date input leaves the month unchanged',()=>{
  const editor=openEditor();editor.set('calendarDate','2026-12-31');editor.click('month',{step:'1'});
  assert.match(editor.nodes['#exception-month'].innerHTML,/januari 2027/);
  assert.match(editor.nodes['#exception-month'].innerHTML,/name="calendarDate"[^>]*value="2027-01-01"/);
  editor.click('month',{step:'-1'});
  assert.match(editor.nodes['#exception-month'].innerHTML,/december 2026/);
  editor.set('calendarDate','2027-02-30');editor.set('calendarDate','');
  assert.match(editor.nodes['#exception-month'].innerHTML,/december 2026/);
  assert.equal(editor.saves(),0);
});

test('an assigned batch can be selected again and given another replacement',async()=>{
  const editor=openEditor();
  editor.set('type','vacation');selectDays(editor,firstDates);editor.set('replacement','anna');editor.click('assign');
  selectDays(editor,firstDates);editor.set('replacement','johan');editor.click('assign');
  await editor.submit();
  assert.equal(editor.error.textContent,'');assert.equal(editor.saved().exceptions.length,3);
  assert.ok(editor.saved().exceptions.every(entry=>entry.replacementId==='johan'));
});

test('removing some draft dates leaves the other assignments intact',async()=>{
  const editor=openEditor();
  editor.set('type','vacation');selectDays(editor,firstDates);editor.set('replacement','anna');editor.click('assign');
  editor.click('month',{step:'1'});selectDays(editor,nextDates);editor.set('replacement','johan');editor.click('assign');
  selectDays(editor,nextDates.slice(0,2));await editor.click('delete');
  assert.equal(editor.saves(),0);await editor.submit();
  assert.equal(editor.error.textContent,'');assert.equal(editor.saved().exceptions.length,6);
  assert.deepEqual(editor.saved().exceptions.filter(entry=>entry.replacementId==='anna').map(entry=>entry.date),firstDates);
  assert.deepEqual(editor.saved().exceptions.filter(entry=>entry.replacementId==='johan').map(entry=>entry.date),nextDates.slice(2));
});

test('removing selected draft dates does not recreate them on save',async()=>{
  const editor=openEditor();
  editor.set('type','vacation');selectDays(editor,firstDates);editor.set('replacement','anna');editor.click('assign');
  editor.click('month',{step:'1'});selectDays(editor,nextDates);editor.set('replacement','johan');editor.click('assign');
  selectDays(editor,nextDates);
  assert.match(editor.nodes['#exception-footer-summary'].innerHTML,/5 dagar markerade/);
  await editor.click('delete');await editor.submit();
  assert.equal(editor.error.textContent,'');assert.equal(editor.saved().exceptions.length,3);
  assert.deepEqual(editor.saved().exceptions.map(entry=>entry.date),firstDates);
  assert.ok(editor.saved().exceptions.every(entry=>entry.replacementId==='anna'));
});

for(const type of ['custom','pension'])test(`an existing working ${type} exception displays and preserves its adjusted hours`,async()=>{
  const state=calendarState(),existing={id:'adjusted',teamId:'team-1',memberId:'member-1',date:'2026-10-28',type,start:'09:00',end:'13:00'};
  state.exceptions.push(existing);
  const editor=openEditor({state,options:{id:existing.id}});
  assert.equal(editor.fields.type.value,type);
  const cell=editor.nodes['#exception-month'].innerHTML.match(/<button\b[^>]*data-date="2026-10-28"[^>]*>[\s\S]*?<\/button>/)[0];
  assert.match(cell,/09:00–13:00/);assert.doesNotMatch(cell,/07:00–16:00/);
  await editor.submit();assert.equal(editor.error.textContent,'');
  const saved=editor.saved().exceptions.find(entry=>entry.id===existing.id);
  assert.equal(saved.type,type);assert.equal(saved.start,'09:00');assert.equal(saved.end,'13:00');
  assert.equal(state.exceptions[0].start,'09:00');assert.equal(state.exceptions[0].end,'13:00');
});

test('editing a partial replacement batch preserves its entered replacement times',async()=>{
  const editor=openEditor();
  editor.set('type','vacation');selectDays(editor,firstDates);editor.set('replacement','anna');editor.set('coverMode','partial');
  editor.set('coverStart','10:00');editor.set('coverEnd','14:00');editor.click('assign');
  selectDays(editor,firstDates);
  assert.equal(editor.fields.coverMode.value,'partial');assert.equal(editor.fields.coverStart.value,'10:00');assert.equal(editor.fields.coverEnd.value,'14:00');
  editor.set('replacement','johan');editor.click('assign');await editor.submit();
  assert.equal(editor.error.textContent,'');assert.equal(editor.saved().exceptions.length,3);
  assert.ok(editor.saved().exceptions.every(entry=>entry.replacementId==='johan'&&entry.replacementStart==='10:00'&&entry.replacementEnd==='14:00'));
});

test('partial cover defaults follow the selected shift and retain manual times while selection is unchanged',()=>{
  const state=calendarState();
  for(const version of state.teams[0].versions)version.rotation[0][3]='B';
  const editor=openEditor({state});
  editor.set('replacement','anna');editor.click('day',{date:'2026-10-28'});editor.set('coverMode','partial');
  assert.equal(editor.fields.coverStart.value,'07:00');assert.equal(editor.fields.coverEnd.value,'16:00');
  assert.equal(editor.nodes['#exception-cover-times'].hidden,false);
  editor.set('coverStart','10:00');editor.set('coverEnd','14:00');
  editor.set('coverMode','full');editor.set('coverMode','partial');
  assert.equal(editor.fields.coverStart.value,'10:00');assert.equal(editor.fields.coverEnd.value,'14:00');
  editor.click('day',{date:'2026-10-28'});editor.click('day',{date:'2026-10-29'});
  assert.equal(editor.fields.coverStart.value,'09:30');assert.equal(editor.fields.coverEnd.value,'18:30');
});

test('opening an existing partial replacement keeps its saved cover times',async()=>{
  const state=calendarState();
  state.exceptions.push({id:'partial',teamId:'team-1',memberId:'member-1',date:'2026-10-28',type:'vacation',replacementId:'anna',replacementStart:'11:00',replacementEnd:'14:00'});
  const editor=openEditor({state,options:{id:'partial'}});
  assert.equal(editor.fields.coverMode.value,'partial');assert.equal(editor.fields.coverStart.value,'11:00');assert.equal(editor.fields.coverEnd.value,'14:00');
  assert.equal(editor.nodes['#exception-cover-times'].hidden,false);
  await editor.submit();assert.equal(editor.error.textContent,'');
  const entry=editor.saved().exceptions.find(item=>item.id==='partial');
  assert.equal(entry.replacementStart,'11:00');assert.equal(entry.replacementEnd,'14:00');
});

test('selecting saved vacation loads its settings and edits only that day in place',async()=>{
  const state=calendarState(),saved={id:'vacation',teamId:'team-1',memberId:'member-1',date:firstDates[0],type:'vacation',replacementId:'anna',replacementStart:'10:00',replacementEnd:'14:00',note:'Tidigare anteckning'};
  const untouched={...saved,id:'next-vacation',date:firstDates[1]};
  state.exceptions.push(saved,untouched);
  const editor=openEditor({state});
  assert.equal(editor.fields.type.value,'');
  editor.click('day',{date:saved.date});
  assert.equal(editor.fields.type.value,'vacation');
  assert.equal(editor.fields.replacement.value,'anna');
  assert.equal(editor.fields.replacementSearch.value,'Anna');
  assert.equal(editor.fields.coverMode.value,'partial');
  assert.equal(editor.fields.coverStart.value,'10:00');
  assert.equal(editor.fields.coverEnd.value,'14:00');
  assert.equal(editor.fields.note.value,'Tidigare anteckning');
  assert.equal(editor.nodes['#exception-assign'].textContent,'Spara ändring');
  assert.equal(editor.saves(),0);
  editor.set('type','sick');editor.set('replacement','johan');editor.set('note','Ny anteckning');
  await editor.click('assign');
  assert.equal(editor.error.textContent,'');assert.equal(editor.saves(),1);
  assert.equal(editor.dialog.open,true);
  assert.deepEqual(editor.saved().exceptions.find(entry=>entry.id===saved.id),{...saved,type:'sick',replacementId:'johan',note:'Ny anteckning'});
  assert.deepEqual(editor.saved().exceptions.find(entry=>entry.id===untouched.id),untouched);
  assert.equal(editor.saved().exceptions.length,2);
  assert.doesNotMatch(calendarCell(editor,saved.date),/is-staged|is-selected/);
  assert.equal(editor.fields.memberSearch.disabled,false);
  editor.click('day',{date:untouched.date});editor.set('note','Nästa dag');
  await editor.click('assign');
  assert.equal(editor.error.textContent,'');assert.equal(editor.saves(),2);
  assert.equal(editor.dialog.open,true);
  assert.equal(editor.saved().exceptions.find(entry=>entry.id===untouched.id).note,'Nästa dag');
  assert.equal(editor.saved().exceptions.length,2);
});

test('a failed direct update keeps the selected saved day and its changes ready to retry',async()=>{
  const state=calendarState(),entry={id:'saved-vacation',teamId:'team-1',memberId:'member-1',date:firstDates[0],type:'vacation',note:'Semester'};
  state.exceptions.push(entry);
  const editor=openEditor({state});
  editor.click('day',{date:entry.date});editor.set('replacement','anna');editor.failSave('Kunde inte spara');
  await editor.click('assign');
  assert.equal(editor.error.textContent,'Kunde inte spara');
  assert.equal(editor.dialog.open,true);assert.equal(editor.saves(),0);
  assert.equal(editor.nodes['#exception-assign'].textContent,'Spara ändring');
  assert.equal(editor.nodes['#exception-assign'].disabled,false);
  assert.match(calendarCell(editor,entry.date),/is-selected/);
  assert.equal(editor.fields.replacement.value,'anna');
  assert.deepEqual(editor.current().exceptions,[entry]);
  editor.failSave(null);await editor.click('assign');
  assert.equal(editor.error.textContent,'');assert.equal(editor.saves(),1);
  assert.equal(editor.dialog.open,true);
  assert.equal(editor.saved().exceptions.length,1);
  assert.deepEqual(editor.saved().exceptions[0],{...entry,replacementId:'anna'});
});

test('directly saving an existing day also preserves and saves other staged assignments',async()=>{
  const state=calendarState(),entry={id:'saved-vacation',teamId:'team-1',memberId:'member-1',date:firstDates[0],type:'vacation',note:''};
  state.exceptions.push(entry);
  const editor=openEditor({state});
  editor.set('type','sick');editor.click('day',{date:firstDates[1]});await editor.click('assign');
  assert.equal(editor.saves(),0);
  editor.click('day',{date:entry.date});editor.set('replacement','anna');
  assert.equal(editor.nodes['#exception-assign'].textContent,'Spara ändringar');
  await editor.click('assign');
  assert.equal(editor.error.textContent,'');assert.equal(editor.saves(),1);
  assert.equal(editor.saved().exceptions.length,2);
  assert.equal(editor.saved().exceptions.find(item=>item.id===entry.id).replacementId,'anna');
  assert.equal(editor.saved().exceptions.find(item=>item.date===firstDates[1]).type,'sick');
  assert.equal(editor.dialog.open,true);
  assert.doesNotMatch(calendarCell(editor,entry.date),/is-staged|is-selected/);
  assert.doesNotMatch(calendarCell(editor,firstDates[1]),/is-staged|is-selected/);
});

test('mixing new and saved dates continues to stage a batch until the footer saves it',async()=>{
  const state=calendarState(),entry={id:'saved-vacation',teamId:'team-1',memberId:'member-1',date:firstDates[0],type:'vacation',note:''};
  state.exceptions.push(entry);
  const editor=openEditor({state});
  selectDays(editor,firstDates.slice(0,2));editor.set('replacement','anna');
  assert.equal(editor.nodes['#exception-assign'].textContent,'Tilldela 2 dagar');
  await editor.click('assign');
  assert.equal(editor.saves(),0);assert.equal(editor.dialog.open,true);
  await editor.submit();
  assert.equal(editor.error.textContent,'');assert.equal(editor.saves(),1);
  assert.equal(editor.saved().exceptions.length,2);
  assert.equal(editor.saved().exceptions.filter(item=>item.date===entry.date).length,1);
  assert.equal(editor.saved().exceptions.find(item=>item.date===entry.date).id,entry.id);
});

test('saved days without replacement clear prior settings while multi-selection keeps the chosen settings',()=>{
  const state=calendarState();
  state.exceptions.push({id:'leave',teamId:'team-1',memberId:'member-1',date:firstDates[1],type:'leave',note:''});
  const editor=openEditor({state});
  editor.set('type','sick');editor.set('replacement','anna');editor.set('coverMode','partial');editor.set('coverStart','10:00');editor.set('coverEnd','14:00');editor.set('note','Utkast');
  selectDays(editor,firstDates.slice(0,2));
  assert.equal(editor.fields.type.value,'sick');assert.equal(editor.fields.replacement.value,'anna');
  editor.click('clear');editor.click('day',{date:firstDates[1]});
  assert.equal(editor.fields.type.value,'leave');
  assert.equal(editor.fields.replacement.value,'');
  assert.equal(editor.fields.replacementSearch.value,'Ingen ersättare');
  assert.equal(editor.fields.coverMode.value,'full');
  assert.equal(editor.nodes['#exception-cover-options'].hidden,true);
  assert.equal(editor.fields.coverStart.value,'');assert.equal(editor.fields.coverEnd.value,'');
  assert.equal(editor.fields.note.value,'');
  assert.equal(editor.saves(),0);
});

test('saved custom shifts can be selected from the calendar and keep their adjusted hours',async()=>{
  const state=calendarState(),entry={id:'custom-day',teamId:'team-1',memberId:'member-1',date:firstDates[0],type:'custom',start:'09:00',end:'13:00',note:'Kortare pass'};
  state.exceptions.push(entry);
  const editor=openEditor({state});
  editor.click('day',{date:entry.date});
  assert.equal(editor.fields.type.value,'custom');assert.equal(editor.fields.note.value,'Kortare pass');
  await editor.submit();
  assert.equal(editor.error.textContent,'');
  assert.deepEqual(editor.saved().exceptions.find(item=>item.id===entry.id),entry);
});

test('changing employee clears pending selections before a new employee is edited',async()=>{
  const editor=openEditor();
  editor.set('type','vacation');selectDays(editor,['2026-10-28']);editor.set('member','member-2');
  selectDays(editor,['2026-10-29']);editor.set('replacement','anna');await editor.submit();
  assert.equal(editor.error.textContent,'');assert.equal(editor.saved().exceptions.length,1);
  assert.equal(editor.saved().exceptions[0].memberId,'member-2');assert.equal(editor.saved().exceptions[0].date,'2026-10-29');
});

test('closing the editor discards draft assignments without writing schedule data',()=>{
  const state=calendarState(),before=structuredClone(state),editor=openEditor({state});
  editor.set('type','vacation');selectDays(editor,firstDates);editor.set('replacement','anna');editor.click('assign');editor.dialog.close();
  assert.equal(editor.saves(),0);assert.equal(editor.saved(),null);assert.deepEqual(state,before);
});

test('failed saving keeps assigned batches available for retry',async()=>{
  const editor=openEditor();
  editor.set('type','vacation');selectDays(editor,firstDates);editor.set('replacement','anna');editor.click('assign');
  editor.failSave('Kunde inte spara');await editor.submit();
  assert.equal(editor.error.textContent,'Kunde inte spara');assert.equal(editor.dialog.open,true);assert.equal(editor.saves(),0);
  assert.match(calendarCell(editor,firstDates[0]),/is-staged/);assert.match(calendarCell(editor,firstDates[0]),/Anna/);
  editor.failSave(null);await editor.submit();
  assert.equal(editor.error.textContent,'');assert.equal(editor.saved().exceptions.length,3);assert.equal(editor.saves(),1);
});

test('shift-click selects a date range and an individual selected day can be toggled off',async()=>{
  const editor=openEditor();
  editor.set('type','vacation');
  editor.click('day',{date:'2026-10-28'});
  editor.click('day',{date:'2026-10-30'},{shiftKey:true});
  editor.click('day',{date:'2026-10-29'});
  await editor.submit();
  assert.equal(editor.error.textContent,'');
  assert.deepEqual(editor.saved().exceptions.map(entry=>entry.date),['2026-10-28','2026-10-30']);
});

test('the calendar editor omits recurring controls and the summaries below the calendar',()=>{
  const editor=openEditor();
  assert.doesNotMatch(editor.body(),/Markera återkommande dagar|exception-repeat|repeatFrom|repeatThrough|repeatDays/);
  assert.doesNotMatch(editor.body(),/exception-selection|exception-batches|Dina tilldelningar/);
});

function addSickness(state,dates=firstDates){
  state.exceptions.push(...dates.map((date,index)=>({id:'sick-'+index,teamId:'team-1',memberId:'member-1',date,type:'sick',replacementId:'anna'})));
  return state;
}

test('deleting three selected sickness dates removes all three changes and their replacement passes in one save',async()=>{
  const state=addSickness(calendarState()),before=structuredClone(state),editor=openEditor({state,options:{id:'sick-0'}});
  editor.click('clear');selectDays(editor,firstDates);
  assert.equal(editor.nodes['#exception-delete'].textContent,'Ta bort 3 ändringar');
  await editor.click('delete');
  assert.equal(editor.error.textContent,'');assert.equal(editor.saves(),1);assert.equal(editor.dialog.open,true);
  assert.deepEqual(editor.saved().exceptions,[]);
  assert.equal(editor.nodes['#exception-delete'].hidden,true);
  assert.equal(editor.nodes['#exception-assign'].disabled,true);
  for(const date of firstDates){
    const restored=model.getShift(editor.saved(),'team-1','member-1',date);
    assert.equal(restored.type,'shift');assert.equal(restored.start,'07:00');assert.equal(restored.end,'16:00');
    assert.ok(!model.getDayAssignments(editor.saved(),'team-1',date).some(pass=>pass.memberId==='anna'));
  }
  assert.deepEqual(state,before);
});

test('deleting overtime restores the day off and keeps the calendar open for the next date',async()=>{
  const state=calendarState(),date='2026-10-31';
  state.exceptions.push({id:'overtime',teamId:'team-1',memberId:'member-1',date,type:'overtime',start:'09:00',end:'13:00',note:''});
  const editor=openEditor({state});editor.click('day',{date});await editor.click('delete');
  assert.equal(editor.error.textContent,'');assert.equal(editor.saves(),1);
  assert.equal(editor.dialog.open,true);
  assert.equal(model.getShift(editor.saved(),'team-1','member-1',date).working,false);
  assert.doesNotMatch(calendarCell(editor,date),/Övertid|09:00|is-selected/);
  assert.equal(editor.nodes['#exception-delete'].hidden,true);
  assert.equal(editor.fields.memberSearch.disabled,false);
  editor.click('day',{date:firstDates[0]});
  assert.match(calendarCell(editor,firstDates[0]),/is-selected/);
  assert.equal(editor.nodes['#exception-assign'].disabled,false);
});

test('bulk deletion keeps unselected dates and other employees while selected dates cross months',async()=>{
  const dates=['2026-10-30','2026-11-02','2026-11-03'],state=addSickness(calendarState(),dates);
  const untouched=[{id:'unselected',teamId:'team-1',memberId:'member-1',date:'2026-11-04',type:'vacation'},
    {id:'other-person',teamId:'team-1',memberId:'member-2',date:'2026-11-02',type:'sick'}];
  state.exceptions.push(...untouched);
  const editor=openEditor({state});
  selectDays(editor,[dates[0]]);editor.click('month',{step:'1'});selectDays(editor,dates.slice(1));
  await editor.click('delete');
  assert.equal(editor.error.textContent,'');assert.equal(editor.saves(),1);
  assert.deepEqual(editor.saved().exceptions,untouched);
});

test('failed bulk deletion keeps the selected days and changes available for retry',async()=>{
  const state=addSickness(calendarState()),editor=openEditor({state});
  selectDays(editor,firstDates);editor.failSave('Kunde inte spara');await editor.click('delete');
  assert.equal(editor.error.textContent,'Kunde inte spara');assert.equal(editor.saves(),0);assert.equal(editor.dialog.open,true);
  assert.deepEqual(editor.current(),state);
  for(const date of firstDates)assert.match(calendarCell(editor,date),/aria-pressed="true"/);
  editor.failSave(null);await editor.click('delete');
  assert.equal(editor.error.textContent,'');assert.equal(editor.saves(),1);assert.deepEqual(editor.saved().exceptions,[]);
});

test('deleting selected draft dates removes their assignments without publishing',async()=>{
  const editor=openEditor();
  editor.set('type','vacation');selectDays(editor,firstDates);editor.set('replacement','anna');editor.click('assign');selectDays(editor,firstDates);
  await editor.click('delete');
  assert.equal(editor.error.textContent,'');assert.equal(editor.saves(),0);assert.equal(editor.saved(),null);
  for(const date of firstDates){assert.doesNotMatch(calendarCell(editor,date),/is-staged/);assert.doesNotMatch(calendarCell(editor,date),/Anna/);}
  assert.deepEqual(editor.current().exceptions,[]);
});

test('bulk deletion removes selected saved and draft changes while preserving an unrelated unsaved batch',async()=>{
  const state=addSickness(calendarState(),[firstDates[0]]),editor=openEditor({state});
  editor.set('type','vacation');selectDays(editor,[firstDates[1]]);editor.set('replacement','anna');editor.click('assign');
  editor.click('month',{step:'1'});selectDays(editor,nextDates);editor.set('replacement','johan');editor.click('assign');
  editor.click('month',{step:'-1'});selectDays(editor,firstDates.slice(0,2));
  assert.equal(editor.nodes['#exception-delete'].textContent,'Ta bort 2 ändringar');
  await editor.click('delete');
  assert.equal(editor.error.textContent,'');assert.equal(editor.saves(),1);assert.equal(editor.dialog.open,true);
  assert.deepEqual(editor.saved().exceptions,[]);
  assert.doesNotMatch(calendarCell(editor,firstDates[1]),/is-staged/);
  editor.click('month',{step:'1'});
  for(const date of nextDates){assert.match(calendarCell(editor,date),/is-staged/);assert.match(calendarCell(editor,date),/Johan/);}
  await editor.submit();assert.equal(editor.error.textContent,'');assert.equal(editor.saves(),2);
  assert.deepEqual(editor.saved().exceptions.map(entry=>entry.date),nextDates);
  assert.ok(editor.saved().exceptions.every(entry=>entry.replacementId==='johan'));
});

test('delete targets count only selected changes and disappear when the selection is cleared',()=>{
  const state=addSickness(calendarState(),[firstDates[0]]),editor=openEditor({state});
  selectDays(editor,firstDates);
  assert.equal(editor.nodes['#exception-delete'].textContent,'Ta bort ändring');assert.equal(editor.nodes['#exception-delete'].disabled,false);
  editor.click('clear');assert.equal(editor.nodes['#exception-delete'].hidden,true);
});

test('deleting selected changes in one group preserves same-person records in another group',async()=>{
  const state=addSickness(calendarState()),other=structuredClone(state.teams[0]);
  other.id='other-group';other.name='Andra gruppen';state.teams.push(other);
  const untouched={id:'other-group-sick',teamId:other.id,memberId:'member-1',date:firstDates[0],type:'sick'};
  state.exceptions.push(untouched);
  const editor=openEditor({state,options:{groupId:'team-1',memberId:state.teams[0].members[0].id}});
  selectDays(editor,firstDates);await editor.click('delete');
  assert.equal(editor.error.textContent,'');assert.equal(editor.saves(),1);
  assert.deepEqual(editor.saved().exceptions,[untouched]);
});

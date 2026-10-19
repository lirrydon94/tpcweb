import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import * as model from '../src/model.js';

const source=await readFile(new URL('../src/app.js',import.meta.url),'utf8');
const helpers=source.slice(source.indexOf('function personalHoursSummary('),source.indexOf('let editingVersionId;'));

test('personal form recalculates percentage on pass changes, time input and reset',()=>{
  const version={rotation:[['A','A','','','','','']],shifts:{A:{start:'08:00',end:'16:00'},B:{start:'08:00',end:'12:00'}}};
  const fields={};
  const makeNode=()=>({classList:{toggle(){}},querySelector:()=>({})});
  const cells=version.rotation[0].map((_,day)=>{
    for(const [name,value] of Object.entries({mode:'inherit',start:'08:00',end:'16:00'}))fields[`${name}-0-${day}`]={value};
    return makeNode();
  });
  const week=makeNode(), events={};
  const nodes={'#personal-position-date':{value:'',addEventListener(){}},'#personal-hours':{},'#personal-reset':{}};
  const form={
    querySelector:selector=>nodes[selector]||fields[selector.match(/name="(.*?)"/)?.[1]]||cells[Number(selector.match(/data-personal-day="0-(\d)"/)?.[1])],
    querySelectorAll:selector=>selector==='[data-personal-week]'?[week]:Object.entries(fields).filter(([key])=>key.startsWith('mode-')).map(([,field])=>field),
    addEventListener:(name,fn)=>events[name]=fn
  };
  let confirmReset=false;
  const confirmations=[];
  vm.runInNewContext(helpers+'\nsetupPersonalScheduleFields(version,{},{});',{$:()=>form,model,version,hours:n=>n/60,label:type=>type,Intl,window:{confirm:message=>{confirmations.push(message);return confirmReset;}}});
  assert.match(nodes['#personal-hours'].innerHTML,/<strong>100 %<\/strong>/);
  fields['mode-0-0'].value='leave';events.change();
  assert.match(nodes['#personal-hours'].innerHTML,/<strong>50 %<\/strong>/);
  fields['mode-0-1'].value='shift:B';events.change();
  assert.match(nodes['#personal-hours'].innerHTML,/<strong>25 %<\/strong>/);
  fields['mode-0-1'].value='custom';fields['start-0-1'].value='22:00';fields['end-0-1'].value='06:00';events.input();
  assert.match(nodes['#personal-hours'].innerHTML,/<strong>50 %<\/strong>/);
  fields['end-0-1'].value='02:00';events.input();
  assert.match(nodes['#personal-hours'].innerHTML,/<strong>25 %<\/strong>/);
  assert.match(nodes['#personal-hours'].innerHTML,/4 <small>timmar.*16 <small>timmar/);
  const beforeCancel=structuredClone(fields),summaryBeforeCancel=nodes['#personal-hours'].innerHTML;
  nodes['#personal-reset'].onclick();
  assert.match(confirmations[0],/Är du säker på att du vill återställa personens schema till gruppschemat/);
  assert.deepEqual(fields,beforeCancel);
  assert.equal(nodes['#personal-hours'].innerHTML,summaryBeforeCancel);
  fields['mode-0-1'].value='off';events.change();
  assert.match(nodes['#personal-hours'].innerHTML,/<strong>0 %<\/strong>/);
  confirmReset=true;
  nodes['#personal-reset'].onclick();
  assert.equal(confirmations.length,2);
  assert.match(nodes['#personal-hours'].innerHTML,/<strong>100 %<\/strong>/);
  assert.ok(Object.entries(fields).filter(([key])=>key.startsWith('mode-')).every(([,field])=>field.value==='inherit'));
});

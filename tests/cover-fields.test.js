import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source=await readFile(new URL('../src/app.js',import.meta.url),'utf8');
const helpers=source.slice(source.indexOf('function coverMinutes('),source.indexOf('function exceptionModal('));
function openCover(start='',end=''){
  const fields=Object.fromEntries(Object.entries({replacement:'cover-person',coverMode:'full',date:'2026-10-12',member:'member-1',coverStart:start,coverEnd:end}).map(([name,value])=>[name,{value}]));
  const nodes={'#cover-options':{},'#cover-times':{},'#cover-summary':{}};
  const events={};
  const form={querySelector:selector=>nodes[selector]||fields[selector.match(/name="(.*?)"/)[1]],addEventListener:(name,fn)=>events[name]=fn};
  vm.runInNewContext(helpers+"\nsetupCoverFields('team-1');",{$:()=>form,workspace:{working:{}},hours:n=>n/60,model:{getShift:(_state,_team,_member,date)=>date==='2026-10-12'?{originalStart:'07:00',originalEnd:'16:00'}:{start:'09:30',end:'18:30'}}});
  return {fields,nodes,update:events.change};
}
test('partial cover starts with the original shift times and preserves manual changes',()=>{
  const {fields,nodes,update}=openCover();
  fields.coverMode.value='partial';update();
  assert.equal(fields.coverStart.value,'07:00');assert.equal(fields.coverEnd.value,'16:00');
  assert.equal(nodes['#cover-times'].hidden,false);
  fields.coverStart.value='10:00';update();
  assert.equal(fields.coverStart.value,'10:00');
  assert.match(nodes['#cover-summary'].textContent,/6 timmar/);
  fields.coverMode.value='full';update();fields.coverMode.value='partial';update();
  assert.equal(fields.coverStart.value,'10:00');
  fields.date.value='2026-10-13';update();
  assert.equal(fields.coverStart.value,'09:30');assert.equal(fields.coverEnd.value,'18:30');
});
test('saved partial cover times are retained on opening',()=>{
  const {fields}=openCover('11:00','14:00');
  assert.equal(fields.coverStart.value,'11:00');assert.equal(fields.coverEnd.value,'14:00');
});

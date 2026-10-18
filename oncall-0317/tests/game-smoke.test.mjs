import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
const base=resolve(dirname(fileURLToPath(import.meta.url)),'../public');
const js=readFileSync(resolve(base,'app.js'),'utf8');
function createEnvironment(){
  const elements=new Map();
  const nodes=Object.fromEntries(['outside','gateway','web','auth','share','database','preview'].map(n=>[n,new FakeElement(n)]));
  function e(id){if(!elements.has(id))elements.set(id,new FakeElement(id));return elements.get(id);}
  const dom={addEventListener(){},hidden:false,getElementById:e,querySelector(sel){if(sel==='.node-alert')return e('node-alert');if(sel==='.ui-toast')return null;return e(sel);},querySelectorAll(sel){return sel==='[data-node]'?Object.values(nodes):[];},createElement(){return new FakeElement('created');},body:{appendChild(){}}};
  const window={scrollTo(){},location:{protocol:'file:'},confirm(){return true},print(){}};
  const sandbox={document:dom,window,clearInterval(){},setInterval(){return 1;},setTimeout(){return 1;},clearTimeout(){},console,fetch(){throw Error('unexpected fetch')}};
  runInNewContext(js,sandbox);
  return {game:window.__oncallTesting,e};
}
class FakeElement{
  constructor(id){this.id=id;this.dataset={node:id};this.attributes={};this.classes=new Set();this.classList={add:(c)=>this.classes.add(c),remove:(c)=>this.classes.delete(c),toggle:(c,b)=>{if(b===undefined)b=!this.classes.has(c);if(b)this.classes.add(c);else this.classes.delete(c);return b},contains:(c)=>this.classes.has(c)};this.value='';this.style={};this.innerHTML='';this.textContent='';this.disabled=false;}
  setAttribute(k,v){this.attributes[k]=v;}
  addEventListener(){}
}
test('simulated defense: contain → root fix → test yields a report',()=>{
  const {game,e}=createEnvironment();
  game.start(true);
  assert.equal(game.getState().stage,0);
  game.act('contain');
  assert.equal(game.getState().stage,1);
  assert.equal(game.getState().service,88);
  game.act('patch');
  assert.equal(game.getState().patched,true);
  assert.equal(game.getState().stage,2);
  game.act('test');
  assert.equal(game.getState().completed,true);
  assert.equal(game.getState().tested,true);
  assert.equal(e('report-fix').textContent,'実施');
  assert.equal(e('report-screen').classes.has('hidden'),false);
  assert.ok(e('report-timeline').innerHTML.includes('共有機能を一時停止'));
});
test('poor strategy accumulates risk and does not mark root fix complete',()=>{
  const {game,e}=createEnvironment();
  game.start(true);
  game.act('block');game.act('hide');game.act('rush');
  const state=game.getState();
  assert.equal(state.completed,true);assert.equal(state.patched,false);
  assert.ok(state.exposed>0);assert.ok(state.technicalDebt>=3);
  assert.equal(e('report-fix').textContent,'未実施');
});
test('standalone offline classifier does not pretend to use AI',()=>{
  const {game}=createEnvironment();
  const result=game.offlineClassify('サーバー側で資料の権限を確認する');
  assert.equal(result.mode,'offline');assert.equal(result.category,'root_fix');
});

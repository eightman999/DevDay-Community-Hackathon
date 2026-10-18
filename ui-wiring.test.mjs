import fs from 'node:fs';import assert from 'node:assert/strict';
const html=fs.readFileSync(new URL('./dist/index.html',import.meta.url),'utf8'),ids=new Set([...html.matchAll(/id="([^"]+)"/g)].map(m=>m[1])),elements=new Map();let frame;const ctx=new Proxy({measureText:()=>({width:100})},{get:(target,key)=>target[key]??(()=>{})});function element(key){if(!elements.has(key))elements.set(key,{textContent:'',innerHTML:'',dataset:{},style:{},classList:{add(){},remove(){},toggle(){}},setAttribute(){},addEventListener(){},close(){this.open=false},showModal(){this.open=true},getContext:()=>ctx});return elements.get(key)}
globalThis.document={body:{dataset:{}},activeElement:null,querySelector:s=>{if(s.startsWith('#')&&!ids.has(s.slice(1))&&!/^#(zone-|status-|hint-)/.test(s)&&s!=='#deadline')throw Error('Unknown element '+s);return element(s)},querySelectorAll:()=>[],addEventListener(){}};globalThis.requestAnimationFrame=fn=>frame=fn;globalThis.matchMedia=()=>({matches:false});await import('./dist/app.mjs');assert.equal(element('#clock').textContent,'02:00');element('#startBtn').onclick();assert.equal(element('#allowBtn').disabled,false);assert(element('#paper').innerHTML.includes('SMBv1'));element('#paper').onclick({target:{closest:()=>({dataset:{field:'a'},classList:{toggle(){}},setAttribute(){}})}});assert(element('#comparisonHint').textContent.includes('確認メモ'));const decidedPaper=element('#paper').innerHTML;assert(element('#deskRule').innerHTML.includes('通過条件'));element('#allowBtn').onclick();assert.equal(element('#paper').innerHTML,decidedPaper);assert.equal(element('#stamp').textContent,'TRANSIT ALLOWED');assert.equal(element('#integrity').textContent,6);assert(element('#incidents').innerHTML.includes('SMBv1'));element('#zones').onclick({target:{closest:selector=>selector==='[data-patch]'?{dataset:{patch:'auth'}}:null}});assert(element('#worker').textContent.includes('あと10秒'));frame(performance.now()+500);assert(element('#generation').textContent.startsWith('世代'));element('#resetBtn').onclick();assert.equal(element('#integrity').textContent,0);assert(element('#startBtn').hidden===false);console.log('PASS: 画面要素の接続 / 開始 / 伝票の生成 / 承認と盤面の状態連動 / 修復 / Canvas描画処理 / リセット (DOM stub, 実ブラウザではない)');
element('#startBtn').onclick();element('#bookBtn').onclick();assert.equal(element('#textbook').open,true);assert.equal(element('#allowBtn').disabled,true);assert(element('#currentAnswer').innerHTML.includes('判定後'));assert(element('#answerRows').innerHTML.includes('未審査'));element('#labTwelve').onclick();assert.equal(element('#labStatus').textContent,'世代 12 / 生存セル 24');element('#labReset').onclick();assert.equal(element('#labStatus').textContent,'世代 0 / 生存セル 12');element('#closeBook').onclick();assert.equal(element('#textbook').open,false);assert.equal(element('#allowBtn').disabled,false);console.log('PASS: 教科書と正解理由 / 履歴 / 開閉時の一時停止・再開 / 実験台の自己複製・リセット (DOM stub)');

element('#catalogBtn').onclick();assert.equal(element('#catalog').open,true);assert.equal(element('#allowBtn').disabled,true);assert.equal((element('#catalogRows').innerHTML.match(/<tr>/g)||[]).length,16);assert.equal((element('#vulnerabilityRows').innerHTML.match(/<article>/g)||[]).length,4);element('#closeCatalog').onclick();assert.equal(element('#catalog').open,false);assert.equal(element('#allowBtn').disabled,false);console.log('PASS: 通信フィールド照合 / CSV由来の4ポリシー・16通信一覧 / 一覧開閉での停止・再開 (DOM stub)');

element('#resetBtn').onclick();element('#enemyMode').value='scripted';element('#enemyMode').onchange();assert.equal(element('#enemySource').textContent,'CSV順の練習モード');element('#startBtn').onclick();assert.equal(element('#enemyMode').disabled,true);element('#resetBtn').onclick();element('#enemyMode').value='adaptive';element('#enemyMode').onchange();assert(element('#enemySource').textContent.includes('ローカル'));element('#startBtn').onclick();assert(element('#paper').innerHTML.includes('CSV #001'));console.log('PASS: 適応型/CSV順の切替・当直中の固定・CSVテンプレート表示 (DOM stub)');

assert.equal((element('#paper').innerHTML.match(/data-field=/g)||[]).length,10);
assert(element('#paper').innerHTML.includes('RECEPTION-03'));
assert(element('#paper').innerHTML.includes('TLS 1.2'));
const selectField=(key,label,value)=>element('#paper').onclick({target:{closest:()=>({dataset:{field:key},classList:{toggle(){}},setAttribute(){},querySelector:selector=>({textContent:selector==='span'?label:value})})}});
selectField('sourceSystem','送信元端末','RECEPTION-03');
selectField('transport','通信方式','TLS 1.2');
assert(!element('#comparisonHint').textContent.includes('拒否：'));
assert(element('#comparisonHint').textContent.includes('参考情報'));
selectField('a','通信方式','SMBv1');
selectField('b','対象端末の更新','未適用');
assert(element('#comparisonHint').textContent.includes('確認メモ'));
console.log('PASS: 補助項目は参考、チェックと確認メモで判定前の答えは開示しない (DOM stub)');

assert.equal((element('#paper').innerHTML.match(/<tr>/g)||[]).length,7);
assert(!element('#paper').innerHTML.match(/<h3>[^<]*脆弱性/));
for(const key of ['identity','permission','handling','capacity'])selectField(key,key,'example');
assert(element('#comparisonHint').textContent.includes('6/6'));
assert(!element('#comparisonHint').textContent.includes('拒否：'));
selectField('identity','主体','example');
assert(element('#comparisonHint').textContent.includes('5/6'));
assert(element('#comparisonHint').textContent.includes('5/6'));
element('#bookBtn').onclick();
assert(!element('#currentAnswer').innerHTML.includes('正解：拒否'));
assert(!element('#answerRows').innerHTML.includes('必要な条件を満たしていません'));
assert(element('#answerRows').innerHTML.includes('判定後'));
element('#closeBook').onclick();
element('#denyBtn').onclick();
assert(element('#memo').textContent.includes('拒否：'));
element('#bookBtn').onclick();
assert(element('#answerRows').innerHTML.includes('通信方式'));
assert(element('#answerRows').innerHTML.includes('規則：'));
console.log('PASS: 6項目の確認メモ / 審査中の解答非表示 / 判定後の違反根拠と履歴 (DOM stub)');

// Provider outputs are rendered as text; pausing for reference material still permits consultation.
globalThis.fetch=async()=>({ok:true,status:200,json:async()=>({source:'agents',reason:'agents',message:'<b>6項目の規則を確認しましょう</b>',review:{good:'照合を続けました。',improve:'未審査の通信も確認しましょう。',next:'主体と送信条件まで照合しましょう。'}})});
element('#resetBtn').onclick();
assert.equal(element('#consultBtn').disabled,true);
assert(element('#companionMessage').textContent.includes('6項目'));
element('#enemyMode').value='scripted';element('#enemyMode').onchange();element('#startBtn').onclick();
element('#pauseBtn').onclick();
assert.equal(element('#allowBtn').disabled,true);assert.equal(element('#consultBtn').disabled,false);
for(let i=0;i<5;i++)await element('#consultBtn').onclick();
assert.equal(element('#companionCount').textContent,'相談 5 / 5');
assert.equal(element('#consultBtn').disabled,true);
assert.equal(element('#companionMessage').textContent,'<b>6項目の規則を確認しましょう</b>');
assert.equal(element('#companionHistory2').hidden,false);
assert.equal(element('#companionHistory0').textContent,'<b>6項目の規則を確認しましょう</b>');
await element('#consultBtn').onclick();assert.equal(element('#companionCount').textContent,'相談 5 / 5');
element('#pauseBtn').onclick();
let companionNow=performance.now();for(let i=0;i<245;i++){companionNow+=501;frame(companionNow);}
await new Promise(resolve=>setTimeout(resolve,0));
assert.equal(element('#report').open,true);
assert.equal(element('#reviewStatus').textContent,'Agents API');
assert.equal(element('#reviewGood').textContent,'照合を続けました。');
assert.equal(element('#consultBtn').disabled,true);
console.log('PASS: 相棒のテキスト表示 / 一時停止中の相談 / 最大5回 / 履歴3件 / 終了時の自動振り返り (DOM stub)');

let resolveCompanion;
globalThis.fetch=()=>new Promise(resolve=>{resolveCompanion=resolve;});
element('#resetBtn').onclick();element('#startBtn').onclick();const staleConsult=element('#consultBtn').onclick();
assert.equal(element('#consultBtn').disabled,true);
element('#resetBtn').onclick();
resolveCompanion({ok:true,status:200,json:async()=>({source:'agents',reason:'agents',message:'古い応答'})});
await staleConsult;
assert(element('#companionMessage').textContent.includes('6項目'));
assert(!element('#companionMessage').textContent.includes('古い応答'));
assert.equal(element('#companionCount').textContent,'相談 0 / 5');
console.log('PASS: リセット時の相談中断 / 前の当直の遅着応答を破棄 (DOM stub)');
element('#startBtn').onclick();const changedSelection=element('#consultBtn').onclick();
assert(element('#companionStatus').textContent.includes('定型のヒント'));
const beforeSelection=element('#companionMessage').textContent;
element('#zones').onclick({target:{closest:selector=>selector==='[data-select]'?{dataset:{select:'share'}}:null}});
resolveCompanion({ok:true,status:200,json:async()=>({source:'agents',reason:'agents',message:'別の申請への応答'})});
await changedSelection;
assert.equal(element('#companionMessage').textContent,beforeSelection);
assert(element('#companionStatus').textContent.includes('相談対象が変わった'));
assert.equal(element('#consultBtn').disabled,false);
element('#resetBtn').onclick();
console.log('PASS: 即時の定型ヒント / 審査対象の変更で遅着応答を破棄 (DOM stub)');

assert(!html.includes('class="actiondock"'));
for(const id of ['inspectBtn','quarantineBtn','rootFixBtn'])assert(!ids.has(id));
console.log('PASS: 確認メモ・一時隔離・根本修復の3ボタン列を非表示 (DOM構造)');

// The same frame loop drives automatic notes and bounded engine defenses.
globalThis.fetch=async()=>({ok:false,status:404});
element('#resetBtn').onclick();element('#enemyMode').value='scripted';element('#enemyMode').onchange();element('#startBtn').onclick();
let supportNow=performance.now();for(let i=0;i<8;i++){supportNow+=501;frame(supportNow);}
assert(element('#companionAuto').textContent.includes('確認メモ'));
assert(element('#comparisonHint').textContent.includes('確認メモ'));
assert.equal(element('#allowBtn').disabled,false);
element('#allowBtn').onclick();
for(let i=0;i<85;i++){supportNow+=501;frame(supportNow);}
await new Promise(resolve=>setImmediate(resolve));
element('#pauseBtn').onclick();assert(Number(element('#fixed').textContent)>=1);
assert(Number(element('#trust').textContent)>=4);
element('#resetBtn').onclick();
assert.equal(Number(element('#fixed').textContent),0);
console.log('PASS: フレーム駆動の先輩自動メモ / 侵入後の自動隔離と修復 / リセット (DOM stub)');

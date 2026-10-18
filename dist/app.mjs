import { companionSnapshot, localCompanion } from './companion-context.mjs';
import { createCompanionProvider, companionSource } from './companion.mjs';
import { CompanionSupport } from './companion-support.mjs';
import { SoundEffects, GameSoundEvents } from './sound-effects.mjs';
import { BackgroundMusic } from './music.mjs';
import {Shift,TYPES,ORDER,INCIDENTS,lifeStep,expectedVerdict,verdictReason} from './engine.mjs';
import { EnemyDirector } from './enemy.mjs';
import { createEnemyProvider } from './enemy-provider.mjs';
import {THREATS,makeInspection,inspectionChecks} from './threats.mjs';
const threatFor=r=>THREATS.find(p=>p.id===r?.inspection?.patternId);
const inspectionRule=p=>p.fieldA+'は「'+p.safeA+'」、'+p.fieldB+'は「'+p.safeB+'」。この2項目に加え、主体・権限・送信条件・処理量の4規則も満たす必要がある。';
const threatCards=()=>THREATS.map((p,index)=>`<article><code>${String(index+1).padStart(2,'0')} / ${esc(p.id)}</code><b>${esc(p.name)}</b><p>${esc(p.weakness)}</p><p><strong>病院で起こり得る影響</strong><br>${esc(p.impact)}</p><small>演習の通過条件：${esc(inspectionRule(p))}<br>根本対策：${esc(p.patch)}</small><a href="${esc(p.source)}" target="_blank" rel="noopener">一次資料 ↗</a></article>`).join('');
import {highLifeStep,seedReplicator} from './automata.mjs';
import {BoardState,hitTest,boardPoint} from './board-state.mjs';
import {drawBoard} from './board-renderer.mjs';
const boardState=new BoardState();let boardScene;const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
const $=s=>document.querySelector(s);
const bgm=new BackgroundMusic(status=>{$('#bgmStatus').textContent=status;});
const sounds=new SoundEffects(()=>bgm.ensureContext());
const soundEvents=new GameSoundEvents(sounds);
$('#seBtn').onclick=()=>{sounds.setEnabled(!sounds.enabled);$('#seBtn').textContent=sounds.enabled?'SE ON':'SE OFF';$('#seBtn').setAttribute('aria-pressed',String(sounds.enabled));if(sounds.enabled)void sounds.play('inspect');};
$('#bgmBtn').onclick=()=>{bgm.setEnabled(!bgm.enabled);$('#bgmBtn').textContent=bgm.enabled?'BGM ON':'BGM OFF';$('#bgmBtn').setAttribute('aria-pressed',String(bgm.enabled));};
$('#bgmVolume').oninput=e=>bgm.setVolume(Number(e.target.value)/100);
document.addEventListener('visibilitychange',()=>{bgm.setRunning(shift.running&&!document.hidden);if(document.hidden)sounds.stop();});
const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let comparedFields=new Set(),catalogResume=false;
let enemy=null;
function createShift(){enemy?.dispose();enemy=$('#enemyMode').value==='scripted'?null:new EnemyDirector({provider:createEnemyProvider()});return new Shift({director:enemy});}
let shift=createShift(),filter=null,selectedId=null,last=performance.now(),lifeGen=-1,stampUntil=0,reported=false,guideResume=false;let bookResume=false,labCells=seedReplicator(48,48,20,20),labGen=0;let atlasLife=new Set(),timelineItems=[],lastTimeline="";
const companionGreeting='6項目の観測内容と規則を、一つずつ照合しましょう。困ったときは相談してください。';
let companionShift=null,companionProvider=null,companionSupport=null,companionAbort=null,reviewAbort=null,companionToken=0,companionSelection=null,consultUses=0,companionBusy=false,companionHistory=[],companionMetrics=null;
function publishCompanion(result){
  $('#companionMessage').textContent=result.message;
  $('#companionStatus').textContent=companionSource(result);
  $('#companionSignIn').hidden=result.reason!=='sign-in-required';
  companionHistory.unshift(result.message);companionHistory=companionHistory.slice(0,3);
  for(let index=0;index<3;index++){const item=$('#companionHistory'+index);item.textContent=companionHistory[index]||'';item.hidden=!companionHistory[index];}
}
function cancelConsult(){companionToken++;companionAbort?.abort();companionAbort=null;companionBusy=false;}
function syncCompanion(){
  const metrics={repaired:shift.repaired,damage:(shift.unavailableRecords||0)+(shift.postponedAppointments||0)+(shift.exposedRecords||0)+(shift.alteredRecords||0)};
  if(companionShift!==shift){
    cancelConsult();reviewAbort?.abort();reviewAbort=null;companionShift=shift;companionProvider=createCompanionProvider();consultUses=0;companionHistory=[];companionMetrics=metrics;companionSelection=selectedId;
    companionSupport?.dispose();
    companionSupport=new CompanionSupport({provider:companionProvider,onAction:action=>{
      publishCompanion(action);$('#companionAuto').textContent='自動サポート / '+({note:'確認メモ',quarantine:'一時隔離',repair:'根本修復'}[action.kind])+' / '+(action.source==='agents'?'Agents API':'ローカル');
      companionMetrics={repaired:shift.repaired,damage:shift.unavailableRecords+shift.postponedAppointments+shift.exposedRecords+shift.alteredRecords};
    }});
    $('#companionAuto').textContent='先輩が確認メモ・一時隔離・根本修復を自動サポート';
    publishCompanion({message:companionGreeting,source:'local',reason:'local'});
    $('#reviewStatus').textContent='当直終了後に振り返ります。';$('#reviewMessage').textContent='';
    for(const key of ['Good','Improve','Next'])$('#review'+key).textContent='';$('#reviewSignIn').hidden=true;
  }
  if(companionSelection!==selectedId||shift.done){
    if(companionBusy){cancelConsult();$('#companionStatus').textContent='定型応答 / 相談対象が変わったため終了';}
    companionSelection=selectedId;
  }
  if(metrics.repaired>companionMetrics.repaired)publishCompanion({message:'根本修復を確認しました。再侵入の防止と、既に生じた被害の復旧は別に確認しましょう。',source:'local',reason:'local'});
  else if(metrics.damage>companionMetrics.damage)publishCompanion({message:'診療データへの影響が増えています。監視マップの被害と修復状況を確認しましょう。',source:'local',reason:'local'});
  companionMetrics=metrics;
  $('#consultBtn').disabled=!shift.started||shift.done||companionBusy||consultUses>=5;
  $('#companionCount').textContent=`相談 ${consultUses} / 5`;
}
async function consultCompanion(){
  if(!shift.started||shift.done||companionBusy||consultUses>=5)return;
  const currentShift=shift,selection=selectedId,token=++companionToken;
  companionAbort=new AbortController();companionBusy=true;consultUses++;
  publishCompanion(localCompanion(companionSnapshot(shift,selectedId),'consult'));$('#companionStatus').textContent='定型のヒントを表示中 / AIに接続中… 当直は続きます';syncCompanion();
  const result=await companionProvider.message(companionSnapshot(shift,selectedId),'consult',{signal:companionAbort.signal});
  if(token!==companionToken||shift!==currentShift||selectedId!==selection||shift.done)return;
  companionAbort=null;companionBusy=false;publishCompanion(result);syncCompanion();
}
function applyCompanionReview(result){
  $('#reviewMessage').textContent=result.message;$('#reviewStatus').textContent=companionSource(result);
  $('#reviewGood').textContent=result.review.good;$('#reviewImprove').textContent=result.review.improve;$('#reviewNext').textContent=result.review.next;
  $('#reviewSignIn').hidden=result.reason!=='sign-in-required';
}
async function reviewCompanion(){
  cancelConsult();reviewAbort?.abort();reviewAbort=new AbortController();const currentShift=shift,context=companionSnapshot(shift);
  applyCompanionReview(localCompanion(context,'review'));$('#reviewStatus').textContent='定型の振り返りを表示中 / AIに接続中…';
  const result=await companionProvider.message(context,'review',{signal:reviewAbort.signal});
  if(shift===currentShift){reviewAbort=null;applyCompanionReview(result);}
}
$('#consultBtn').onclick=consultCompanion;
function automaticNote(){
  const r=getRequest();
  if(!r||performance.now()<stampUntil||$('#paper').dataset.ticket!==String(r.id))return false;
  const check=inspectionChecks(r.inspection).find(item=>!comparedFields.has(item.key));
  if(!check)return false;
  comparedFields.add(check.key);
  const field=$('[data-field="'+check.key+'"]');field?.classList.add('selected');field?.setAttribute('aria-pressed','true');
  compareRequest();return true;
}
function initBoards(){boardState.reset();atlasLife=new Set();for(let y=1;y<59;y++)for(let x=1;x<47;x++)if((x*17+y*31+x*y*3)%19<4)atlasLife.add(y*48+x);lifeGen=-1;}
$('#zones').innerHTML=ORDER.map((type,i)=>`<article class="zone" id="zone-${type}"><button class="zonepick" data-select="${type}" aria-label="${esc(TYPES[type].name)}の通信を調べる" aria-pressed="false"><span><b>${['⌑','▤','⇥','▣'][i]} ${esc(TYPES[type].name)}</b><small>${esc(TYPES[type].pattern)}</small></span><span class="zonestatus" id="status-${type}">監視中</span></button><div class="zonefoot"><p id="hint-${type}"></p><button class="patch" data-patch="${type}" disabled></button></div></article>`).join('');
initBoards();
$('#mainboard').onclick=event=>{
  if(!boardScene)return;
  const rect=event.currentTarget.getBoundingClientRect();
  const point=boardPoint((event.clientX-rect.left)/rect.width,(event.clientY-rect.top)/rect.height);
  const id=hitTest(boardScene,point.x,point.y);
  if(id!==null){filter=null;selectedId=id;stampUntil=0;$('#stamp').classList.remove('show');renderUI(true);if(matchMedia('(max-width:720px)').matches)setView('desk');}
};
function selectZone(type){filter=type;selectedId=null;stampUntil=0;$('#stamp').classList.remove('show');renderUI(true);if(matchMedia('(max-width:720px)').matches)setView('desk');}
function setView(view){document.body.dataset.view=view;$('#showBoard').setAttribute('aria-pressed',String(view==='board'));$('#showDesk').setAttribute('aria-pressed',String(view==='desk'));}
function getRequest(){return shift.pending(filter).find(r=>r.id===selectedId)||null;}
function fieldLabels(type,r=null){const p=threatFor(r);if(p)return[p.fieldA,p.fieldB];return type==='auth'?['職員ID','認証キーの送信先']:type==='share'?['カルテの担当ID','参照する職員ID']:type==='flood'?['検査データの送信元','毎秒の受信件数']:['データの分類','予約資料の送信先'];}
function renderField(field, comparison=false){
  return `<button class="paperrow${comparison?' comparison-value':''}" data-field="${field.key}" aria-pressed="false"><span${comparison?' class="sr-only"':''}>${esc(field.label)}</span><strong class="${/[\u3000-\u9fff]/.test(field.value)?'jp':''}">${esc(field.value)}</strong></button>`;
}
function renderPaper(r){
  const t=TYPES[r.type],pattern=threatFor(r),labels=fieldLabels(r.type,r);
  const character=INCIDENTS.find(item=>item.id===r.templateId)||INCIDENTS.find(item=>item.type===r.type);
  const portrait=character?.characterImage||'',characterName=character?.characterName||'通信の使者';
  comparedFields.clear();
  $('#comparisonHint').textContent='6項目を照合してください。確認した行にメモを付けられます。正解は判定後に表示します。';
  const findings=pattern ? inspectionChecks(r.inspection) : [
    {key:'a',label:labels[0],value:r.inspection?.a??r.a},
    {key:'b',label:labels[1],value:r.inspection?.b??(r.b+(r.type==='flood'?' 件 / 秒':''))}
  ];
  const extraFields=[
    {key:'sourceSystem',label:'送信元端末',value:character?.sourceSystem||'未記載'},
    {key:'destinationSystem',label:'接続先システム',value:character?.destinationSystem||'未記載'},
    {key:'transport',label:'申請の暗号化',value:character?.transport||'未記載'},
    {key:'purpose',label:'処理目的',value:character?.purpose||'未記載'}
  ];
  const comparison=pattern?`
    <p class="inspection-instruction" id="inspectionInstruction">6項目を下までスクロールして照合。主体・権限・送信条件・数値も確認。</p>
    <div class="review-evidence" tabindex="0" role="region" aria-label="6項目の審査資料。スクロールで全項目を確認">
    <table class="inspection-table" aria-describedby="inspectionInstruction">
      <caption class="sr-only">観測した申請と適用する規則。チェックは確認メモで、正誤の表示ではありません。</caption>
      <thead><tr><th scope="col">確認項目</th><th scope="col">観測した内容</th><th scope="col">適用する規則</th></tr></thead>
      <tbody>${findings.map(field=>`<tr><th scope="row">${esc(field.label)}</th><td>${renderField(field,true)}</td><td class="review-rule">${esc(field.rule)}</td></tr>`).join('')}</tbody>
    </table></div>`:`<p class="inspection-instruction">${esc(t.rule)}</p><div class="field-grid">${findings.map(field=>renderField(field)).join('')}</div>`;
  $('#paper').innerHTML=`
    <div class="paperhead"><span>TRANSIT REQUEST / ${esc(r.type.toUpperCase())}</span><span>#${String(r.id).padStart(3,'0')}</span></div>
    <h3>${esc(t.name)} / ${r.type==='exfil'?'データ転送申請':r.type==='flood'?'データ処理申請':r.type==='share'?'データアクセス申請':'認証・接続申請'} <small>6項目の照合${r.templateId?' / CSV #'+String(r.templateId).padStart(3,'0'):''}</small></h3>
    <div class="request-summary">
      <figure class="request-character">${portrait?`<img src="${esc(portrait)}" alt="${esc(characterName)}：${esc(character?.characterRole||'病院データの使者')}" width="56" height="56" decoding="async">`:''}<figcaption><b>${esc(characterName)}</b><small>${esc(character?.characterRole||'病院データの使者')}</small></figcaption></figure>
      <p class="character-line">「${esc(character?.characterLine||'このデータの宛先と権限を確認してください。')}」</p>
      <div class="deadline"><span>自動通過まで</span><b id="deadline">${Math.max(0,Math.ceil(r.deadline-shift.time))}s</b></div>
    </div>
    <section class="request-fields" aria-label="通信の照合">${comparison}</section>
    <details class="request-extras"><summary>その他の申請情報 <span>送信元・接続先など4項目</span></summary><div class="field-grid">${extraFields.map(field=>renderField(field)).join('')}</div></details>`;
  $('#paper').hidden=false;
  $('#empty').hidden=true;
  $('#deskRule').innerHTML=`<b>${esc(t.name)} / 通過条件</b>${pattern?`<ol>${findings.map(field=>`<li><b>${esc(field.label)}</b>：${esc(field.rule)}</li>`).join('')}</ol>`:`<p>${esc(t.rule)}</p>`}<p class="ruleinstruction">6項目すべてを満たす通信を通す。一つでも違反・欠損があれば遮断。公開資料と診療情報では送信条件が異なります。</p>`;
}
function compareRequest(){const r=getRequest();if(!r||performance.now()<stampUntil)return;const checks=inspectionChecks(r.inspection),remaining=checks.filter(check=>!comparedFields.has(check.key));$('#comparisonHint').textContent=remaining.length?`確認メモ ${checks.length-remaining.length}/6：残りは${remaining.map(check=>check.label).join('・')}。`:'確認メモ 6/6。チェックは確認済みの印です。規則を満たすか判断して通過・遮断を選んでください。';}
function renderUI(force=false){bgm.setIncidents(ORDER.reduce((count,type)=>count+shift.zones[type].attacks,0));bgm.setRunning(shift.running&&!document.hidden);soundEvents.consume(shift.effects,!document.hidden);const pending=shift.pending(filter);if(!pending.some(r=>r.id===selectedId)){selectedId=pending[0]?.id??null;force=true;}const r=getRequest();$('#clock').textContent=format(120-shift.time);$('#eventTime').textContent=format(shift.time);$('#integrity').textContent=shift.unavailableRecords;$('#trust').textContent=shift.postponedAppointments;$('#integrity').classList.toggle('impact',shift.unavailableRecords>0);$('#trust').classList.toggle('impact',shift.postponedAppointments>0);$('#dataMeter').style.width=shift.unavailableRecords+'%';$('#trustMeter').style.width=shift.postponedAppointments+'%';$('#pending').textContent=String(shift.pending().length).padStart(2,'0');$('#mobileCount').textContent=shift.pending().length;$('#fixed').textContent=shift.repaired;$('#exposedValue').textContent=(shift.exposedRecords||0)+'件';$('#alteredValue').textContent=(shift.alteredRecords||0)+'件';$('#deskCount').textContent=String(pending.length).padStart(2,'0')+' WAITING';$('#filterLabel').textContent=filter?TYPES[filter].name+' の伝票':'すべての領域';$('#eventLog').textContent=shift.lastLog;$('#startBtn').hidden=shift.started;$('#pauseBtn').hidden=!shift.started;$('#enemyMode').disabled=shift.started;const source=enemy?.status;const enemyText=!enemy?'CSV順の練習モード':source?.pending?'敵が次の経路を選択中':source?.source==='decisions'?'敵の判断：'+({switch:'転進',feint:'陽動',pressure:'集中'}[source.tactic]||'適応')+' / 次の間隔 '+(source.interval||7)+'秒':source?.reason==='sign-in-required'?'敵の判断：ローカル（AI適応はログイン後）':source?.reason==='unconfigured'?'敵の判断：ローカル（API未設定）':source?.reason==='timeout'?'敵の判断：ローカル（応答待ちを切替）':'敵の判断：ローカル';$('#enemySignIn').hidden=source?.reason!=='sign-in-required';if($('#enemySource').textContent!==enemyText)$('#enemySource').textContent=enemyText;$('#pauseBtn').disabled=shift.done;$('#pauseBtn').textContent=shift.running?'一時停止 Ⅱ':'再開 ▶';const busy=ORDER.find(k=>shift.zones[k].repairEnd);$('#worker').textContent=busy?TYPES[busy].name+'：あと'+Math.ceil(shift.zones[busy].repairEnd-shift.time)+'秒':'修正担当：待機中';
const q=pending.map(x=>`<button class="queueitem ${x.id===selectedId?'selected':''} ${x.deadline-shift.time<5?'urgent':''}" data-ticket="${x.id}" aria-label="通信 ${x.id} ${esc(TYPES[x.type].name)}">#${String(x.id).padStart(3,'0')} · ${esc(TYPES[x.type].name)}</button>`).join('');if($('#queue').innerHTML!==q)$('#queue').innerHTML=q;
if(performance.now()<stampUntil){/* Keep the decided document under its stamp until dispatch. */}else if(r){if(force||$('#paper').dataset.ticket!==String(r.id)){renderPaper(r);$('#paper').dataset.ticket=String(r.id);}if($('#deadline'))$('#deadline').textContent=Math.max(0,Math.ceil(r.deadline-shift.time))+'s';}else{$('#deskRule').innerHTML=filter?'<b>'+esc(TYPES[filter].name)+' / 通過条件</b><p>'+esc(TYPES[filter].rule)+'</p>':'<b>01 / 照合の手順</b><p>6項目の観測内容と適用する規則を照合する。</p>';$('#comparisonHint').textContent='審査対象の通信を選択してください。';$('#paper').hidden=true;$('#paper').dataset.ticket='';$('#empty').hidden=false;$('#empty').innerHTML=shift.started?'<div>⌁</div><h3>審査待ちの通信はありません。</h3><p>次のデータを待つか、<br>「全通信を表示」で別の領域を確認。</p><span>6項目の照合で、必要な通信を届けましょう。</span>':'<div>▦</div><h3>病院の診療を、止めない。</h3><p>受付・カルテ・検査・予約の通信を審査。<br>必要なデータを届け、不正な通過を止める。</p><span>感染の封じ込めと、被害の復旧は別の仕事です。</span>';}
$('#allowBtn').disabled=$('#denyBtn').disabled=!shift.running||!r||performance.now()<stampUntil;
for(const type of ORDER){const z=shift.zones[type],n=shift.pending(type).length;$('#zone-'+type).classList.toggle('selected',filter===type||(!filter&&r?.type===type));$('#zone-'+type).classList.toggle('underattack',z.attacks>0);$('#zone-'+type).classList.toggle('fixed',z.fixed);$('[data-select="'+type+'"]').setAttribute('aria-pressed',String(filter===type));$('#status-'+type).textContent=!shift.started?'監視待機':z.fixed?'▥ 防壁稼働':z.repairEnd?'修正中 '+Math.ceil(z.repairEnd-shift.time)+'s':z.quarantineUntil>shift.time?'Ⅱ 隔離 '+Math.ceil(z.quarantineUntil-shift.time)+'s':z.attacks?'侵入 '+z.attacks+'件':n?'審査待ち '+n+'件':'● 正常';$('#hint-'+type).textContent=z.fixed?'青い防壁が再侵入を防ぐ。':z.attacks?'不正な処理が進行中。根本修復で止める。':TYPES[type].hint;const p=$('[data-patch="'+type+'"]');p.disabled=!shift.running||z.fixed||!!busy;p.textContent=z.fixed?'▥ 修正済み':z.repairEnd?'修正中… '+Math.ceil(z.repairEnd-shift.time)+'s':'▥ 根本修正 · 10秒';}
syncCompanion();renderTelemetry();drawBoards(performance.now());if(shift.done&&!reported){reported=true;showReport();}}
function format(t){const s=Math.max(0,Math.ceil(t));return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');}
function decide(allow){if(performance.now()<stampUntil)return;const r=getRequest();if(!r||!shift.decide(r.id,allow))return;$('#stamp').textContent=allow?'TRANSIT ALLOWED':'TRANSIT BLOCKED';$('#stamp').className='stamp show '+(allow?'approved':'denied');$('#memo').textContent=verdictReason(r)+(threatFor(r)?' 対象の弱点：'+threatFor(r).name:'');stampUntil=performance.now()+950;selectedId=null;renderUI(true);publishCompanion({message:'判定を記録しました。調査ログの理由と、照合した6項目を見比べましょう。',source:'local',reason:'local'});}
function drawBoards(now){
  const visualTime=shift.started?shift.time:now/1000;
  const gen=Math.floor(visualTime*3);
  if(gen!==lifeGen){
    atlasLife=lifeStep(atlasLife,48,60);
    if(gen%9===0)for(let j=0;j<5;j++){
      const x=4+(gen*3+j*13)%36,y=3+(gen+j*7)%49;
      for(const[dx,dy]of[[1,0],[2,1],[0,2],[1,2],[2,2]])atlasLife.add((y+dy)*48+x+dx);
    }
    lifeGen=gen;
  }
  $('#generation').textContent='世代 '+String(shift.started?Math.floor(shift.time*3):0).padStart(4,'0');
  boardScene=boardState.update(shift,{selectedId,filter,reducedMotion:reducedMotion.matches});
  const canvas=$('#mainboard');
  const labelScale=Math.min(2.6,Math.max(1,1152/(canvas.clientWidth||1152)));
  drawBoard(canvas.getContext('2d'),boardScene,atlasLife,gen,{labelScale});
}
function renderTelemetry(){const attacks=ORDER.reduce((n,k)=>n+shift.zones[k].attacks,0);$('#threatBars').innerHTML=Array.from({length:12},(_,i)=>'<i class="'+(i<Math.min(12,attacks*3)?'lit':'')+'"></i>').join('');$('#threatLabel').textContent=!shift.started?'待機':attacks>=3?'高':attacks?'中':'低';$('#threatLabel').style.color=attacks?'#a00000':'#006000';$('#dataValue').textContent=shift.unavailableRecords+'件';$('#trustValue').textContent=shift.postponedAppointments+'件';$('#queueMeter').style.width=Math.min(100,shift.pending().length*25)+'%';$('#mapMode').textContent=!shift.started?'青い自陣 / 当直開始で審査':shift.done?'当直終了':shift.running?'黄色い通信を選択して審査':'一時停止中';const type=filter||getRequest()?.type||'auth';$('#mapHint').textContent=threatFor(getRequest())?'確認対象：'+threatFor(getRequest()).name:TYPES[type].name+'：'+TYPES[type].hint;
if(shift.lastLog!==lastTimeline){lastTimeline=shift.lastLog;timelineItems.unshift({at:format(shift.time),text:shift.lastLog});timelineItems=timelineItems.slice(0,7);$('#timeline').innerHTML=timelineItems.map(e=>'<div><time>'+e.at+'</time><p>'+esc(e.text)+'</p></div>').join('');}
const pending=ORDER.filter(k=>shift.zones[k].attacks||shift.pending(k).length);$('#incidentCount').textContent=pending.length;$('#incidents').innerHTML=pending.length?pending.map(k=>'<button data-incident="'+k+'" class="'+(shift.zones[k].attacks?'hot':'')+'"><span>△</span><div><b>'+esc(TYPES[k].name)+'</b><small>'+(shift.zones[k].attacks?esc(threatFor(shift.requests.find(r=>r.type===k&&!expectedVerdict(r)&&(r.status==='allow'||r.status==='timeout')))?.name||TYPES[k].label)+'が進行中':shift.pending(k).length+'件の申請が審査待ち')+'</small></div><i>↗</i></button>').join(''):'<p class="noincident">現在、未対応の異常なし。</p>';}
function showReport(){void sounds.play('finish');$('#reportTitle').textContent=shift.unavailableRecords===0&&shift.postponedAppointments===0&&!shift.exposedRecords&&!shift.alteredRecords?'診療を止めずに、守り切った。':shift.data>=60?'当直終了。被害の確認と復旧へ。':'病院のシステム停止が、診療に影響した。';$('#enemyReport').textContent=enemy?'通信選択：Decisions API '+shift.requests.filter(r=>r.enemySource==='decisions').length+'件 / ローカル '+shift.requests.filter(r=>r.enemySource!=='decisions').length+'件':'通信選択：CSV順の練習モード';$('#reportMetrics').innerHTML=`<div><strong>${shift.unavailableRecords}<small> 件</small></strong><small>参照できないカルテ</small></div><div><strong>${shift.postponedAppointments}<small> 件</small></strong><small>延期になった診療予約</small></div><div><strong>${shift.exposedRecords||0}<small> 件</small></strong><small>漏えいした模擬カルテ</small></div><div><strong>${shift.alteredRecords||0}<small> 件</small></strong><small>改変された模擬カルテ</small></div><div><strong>${shift.repaired}/4</strong><small>感染経路の根本修復</small></div>`;$('#reportZones').innerHTML=ORDER.map(type=>{const z=shift.zones[type];return `<div class="reportzone"><b>${esc(TYPES[type].name)} / ${esc(TYPES[type].label)}　${z.fixed?'▥ 再感染対策済み':'弱点が残る'}</b><p>正しい審査 ${z.correct}件 · 不正通過 ${z.missed}件 · 防壁の自動拒否 ${z.defended}件 · 未審査 ${shift.pending(type).length}件</p><p>守る仕組み：${esc(THREATS.filter(p=>p.route===type).map(p=>p.patch).join(' / '))}。</p></div>`;}).join('');$('#report').showModal();void reviewCompanion();}
function reset(){sounds.stop();bgm.reset();shift=createShift();selectedId=null;filter=null;reported=false;stampUntil=0;timelineItems=[];lastTimeline='';$('#memo').textContent='盤面と伝票を照合し、広がる前に対応する。';$('#stamp').className='stamp';$('#stamp').textContent='';$('#report').close();initBoards();setView('board');renderUI(true);}
$('#startBtn').onclick=()=>{void bgm.unlock();void sounds.play('start');shift.start();filter=null;last=performance.now();renderUI(true)};$('#pauseBtn').onclick=()=>{if(shift.done)return;shift.running=!shift.running;if(shift.running)void bgm.unlock();last=performance.now();renderUI()};$('#zones').onclick=e=>{const patch=e.target.closest('[data-patch]'),pick=e.target.closest('[data-select]');if(patch){if(shift.repair(patch.dataset.patch))void sounds.play('repairStart');renderUI();}else if(pick)selectZone(pick.dataset.select)};$('#queue').onclick=e=>{const b=e.target.closest('[data-ticket]');if(b){selectedId=Number(b.dataset.ticket);stampUntil=0;$('#stamp').classList.remove('show');renderUI(true)}};$('#allBtn').onclick=()=>{filter=null;selectedId=null;stampUntil=0;$('#stamp').classList.remove('show');renderUI(true)};$('#allowBtn').onclick=()=>decide(true);$('#denyBtn').onclick=()=>decide(false);$('#resetBtn').onclick=reset;$('#retryBtn').onclick=reset;$('#closeReport').onclick=()=>$('#report').close();$('#guideBtn').onclick=()=>{guideResume=shift.running;shift.running=false;$('#guide').showModal();renderUI()};function closeGuide(){$('#guide').close();if(guideResume&&!shift.done)shift.running=true;guideResume=false;last=performance.now();renderUI()}$('#closeGuide').onclick=closeGuide;$('#guideStart').onclick=closeGuide;$('#guide').addEventListener('cancel',e=>{e.preventDefault();closeGuide()});$('#showBoard').onclick=()=>setView('board');$('#showDesk').onclick=()=>setView('desk');document.addEventListener('keydown',e=>{if(e.repeat||$('#textbook').open||$('#guide').open||$('#report').open||$('#catalog').open||['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName))return;if(e.key==='ArrowLeft'){e.preventDefault();decide(false)}else if(e.key==='ArrowRight'){e.preventDefault();decide(true)}});
$('#paper').onclick=e=>{const field=e.target.closest('[data-field]');if(!field||performance.now()<stampUntil)return;const key=field.dataset.field;if(!inspectionChecks(getRequest()?.inspection).some(check=>check.key===key)){$('#comparisonHint').textContent='参考情報です。判定には6項目の審査資料を使います。';return;}if(comparedFields.has(key))comparedFields.delete(key);else comparedFields.add(key);field.classList.toggle('selected',comparedFields.has(key));field.setAttribute('aria-pressed',String(comparedFields.has(key)));compareRequest();};$('#incidents').onclick=e=>{const b=e.target.closest('[data-incident]');if(b)selectZone(b.dataset.incident)};let uiTick=0;function frame(now){const dt=Math.min(.5,(now-last)/1000);last=now;if(shift.running){shift.advance(dt);enemy?.tick(shift);}if(now-uiTick>150){if(now>=stampUntil){$('#stamp').classList.remove('show');$('#stamp').textContent='';}renderUI();uiTick=now;}companionSupport?.tick(shift,{selectedId,onNote:automaticNote});drawBoards(now);requestAnimationFrame(frame);}renderUI(true);requestAnimationFrame(frame);

function drawLab(){const ctx=$('#replicaLab').getContext('2d');ctx.fillStyle='#0b1812';ctx.fillRect(0,0,384,384);for(let y=0;y<48;y++)for(let x=0;x<48;x++){ctx.fillStyle=labCells.has(y*48+x)?'#ed8c6b':'#1a2b20';ctx.fillRect(x*8+1,y*8+1,6,6);}$('#labStatus').textContent='世代 '+labGen+' / 生存セル '+labCells.size;}
function renderBook(){$('#bookPolicyCards').innerHTML=ORDER.map(type=>`<article><b>${esc(TYPES[type].name)} / ${esc(TYPES[type].label)}</b><p>${esc(TYPES[type].rule)}</p><small>照合欄：${fieldLabels(type).join(' / ')}<br>根本修復：${esc(TYPES[type].patch)}</small></article>`).join('');$('#bookThreatCards').innerHTML=threatCards();const r=getRequest();$('#currentAnswer').innerHTML=r?.status==='pending'?'<p>審査中の答えは判定後に表示します。規則と観測内容を照合してください。</p>':r?'<b>申請 #'+String(r.id).padStart(3,'0')+' の正解：'+(expectedVerdict(r)?'承認':'拒否')+'</b><p>'+esc(verdictReason(r))+'</p>':'<p>審査中の申請はありません。盤面に戻り、申請書を選ぶと正解を確認できます。</p>';$('#answerRows').innerHTML=shift.requests.length?shift.requests.map(r=>{const expect=expectedVerdict(r);const actual=({allow:'承認',deny:'拒否',timeout:'自動通過',auto:'防壁で拒否',pending:'未審査'})[r.status];const correct=r.status==='pending'?null:r.status==='auto'?true:(r.status==='allow'||r.status==='timeout')===expect;return '<tr><td>#'+String(r.id).padStart(3,'0')+'<small>'+esc(TYPES[r.type].name)+'</small></td><td>'+(r.inspection?inspectionChecks(r.inspection).map(check=>esc(check.label)+'：'+esc(check.value)).join('<br>'):esc(r.a)+' / '+esc(r.b))+'</td><td>'+actual+'<small class="'+(correct===false?'wronganswer':'')+'">'+(correct===null?'—':correct?'○ 正解':'× 要復習')+'</small></td><td><b>'+(r.status==='pending'?'判定後':expect?'承認':'拒否')+'</b><small>'+esc(r.status==='pending'?'':verdictReason(r))+'</small></td></tr>';}).join(''):'<tr><td colspan="4">当直を開始すると、到着した申請の答え合わせがここに記録されます。</td></tr>';drawLab();}
function openBook(){bookResume=shift.running;shift.running=false;renderBook();$('#textbook').showModal();renderUI();}
function closeBook(){$('#textbook').close();if(bookResume&&!shift.done)shift.running=true;bookResume=false;last=performance.now();renderUI();}
$('#bookBtn').onclick=openBook;$('#reportBook').onclick=()=>{$('#report').close();openBook()};$('#closeBook').onclick=closeBook;$('#textbook').addEventListener('cancel',e=>{e.preventDefault();closeBook()});$('#labStep').onclick=()=>{labCells=highLifeStep(labCells,48,48);labGen++;drawLab()};$('#labTwelve').onclick=()=>{for(let i=0;i<12;i++)labCells=highLifeStep(labCells,48,48);labGen+=12;drawLab()};$('#labReset').onclick=()=>{labCells=seedReplicator(48,48,20,20);labGen=0;drawLab()};

function openCatalog(){catalogResume=shift.running;shift.running=false;$('#vulnerabilityRows').innerHTML=ORDER.map(type=>`<article><code>${esc(type.toUpperCase())}</code><b>${esc(TYPES[type].name)} / ${esc(TYPES[type].label)}</b><p>${esc(TYPES[type].rule)}</p><small>根本修復：${esc(TYPES[type].patch)}</small></article>`).join('');$('#catalogRows').innerHTML=INCIDENTS.map(r=>`<tr><td><div class="catalog-character">${r.characterImage?`<img src="${esc(r.characterImage)}" alt="${esc(r.characterName||'通信の使者')}" width="44" height="44" loading="lazy">`:""}<span>#${String(r.id).padStart(3,'0')}<small>${esc(r.characterName||'')}</small></span></div></td><td>${esc(TYPES[r.type].name)}<small>${esc(r.sourceSystem||'')} → ${esc(r.destinationSystem||'')}<br>${esc(r.transport||'')} / ${esc(r.purpose||'')}</small></td><td>${esc(r.a)}</td><td>${esc(r.b)}</td></tr>`).join('');$('#attackPatternRows').innerHTML=threatCards();$('#catalog').showModal();renderUI();}
function closeCatalog(){$('#catalog').close();if(catalogResume&&!shift.done)shift.running=true;catalogResume=false;last=performance.now();renderUI();}
$('#catalogBtn').onclick=openCatalog;$('#closeCatalog').onclick=closeCatalog;$('#catalog').addEventListener('cancel',e=>{e.preventDefault();closeCatalog()});

$('#enemyMode').onchange=()=>{if(!shift.started){shift=createShift();renderUI(true);}};

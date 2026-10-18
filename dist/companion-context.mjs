import {INCIDENTS, ORDER, TYPES, expectedVerdict, verdictReason} from './engine.mjs';
import {makeInspection} from './threats.mjs';

const statuses = new Set(['pending','allow','deny','timeout','auto']);
const number = (v, max) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max;
const invalid = () => { throw new Error('invalid-context'); };

// Only these fields cross the HTTP boundary. No pending evidence, answer, or character dialogue.
export function companionSnapshot(shift, selectedId = null) {
  if(!shift.requests.some(r=>r.id===selectedId&&r.status==='pending'))selectedId=null;
  return normalizeCompanionContext({time:shift.time, done:shift.done, selectedId,
    requests:shift.requests.map(r=>({id:r.id,templateId:r.templateId,type:r.type,status:r.status,deadline:Math.min(160,r.deadline)})),
    zones:ORDER.map(type=>({type,fixed:shift.zones[type].fixed,repairEnd:shift.zones[type].repairEnd,
      quarantineUntil:shift.zones[type].quarantineUntil,attacks:shift.zones[type].attacks})),
    metrics:{unavailable:shift.unavailableRecords,exposed:shift.exposedRecords,altered:shift.alteredRecords,postponed:shift.postponedAppointments,repaired:shift.repaired,quarantineUses:shift.quarantineUses}});
}

export function normalizeCompanionContext(raw) {
  if (!raw || !number(raw.time,120) || typeof raw.done !== 'boolean' || (raw.done && raw.time !== 120) ||
      !Array.isArray(raw.requests) || raw.requests.length>16 || !Array.isArray(raw.zones) || raw.zones.length!==4 || !raw.metrics) invalid();
  const seen=new Set();
  const requests=raw.requests.map(r=>{
    const template=INCIDENTS.find(t=>t.id===r?.templateId);
    if(!r || !Number.isInteger(r.id) || r.id<1 || r.id>16 || seen.has(r.id) || !template || r.type!==template.type || !statuses.has(r.status) || !number(r.deadline,160)) invalid();
    seen.add(r.id);
    return {id:r.id,templateId:r.templateId,type:r.type,status:r.status,deadline:r.deadline};
  });
  if(raw.selectedId!==null && (!Number.isInteger(raw.selectedId)||!requests.some(r=>r.id===raw.selectedId&&r.status==='pending'))) invalid();
  const zoneTypes=new Set();
  const zones=raw.zones.map(z=>{
    if(!z || !ORDER.includes(z.type)||zoneTypes.has(z.type)||typeof z.fixed!=='boolean'||!number(z.repairEnd,130)||!number(z.quarantineUntil,128)||!Number.isInteger(z.attacks)||!number(z.attacks,16)) invalid();
    zoneTypes.add(z.type);
    return {type:z.type,fixed:z.fixed,repairEnd:z.repairEnd,quarantineUntil:z.quarantineUntil,attacks:z.attacks};
  });
  const metrics={};
  for(const key of ['unavailable','exposed','altered','postponed','repaired','quarantineUses']){
    if(!Number.isInteger(raw.metrics[key])||!number(raw.metrics[key],key==='repaired'?4:key==='quarantineUses'?2:100)) invalid();
    metrics[key]=raw.metrics[key];
  }
  return {time:raw.time,done:raw.done,selectedId:raw.selectedId,requests,zones,metrics};
}

function judged(context) {
  return context.requests.filter(r=>r.status!=='pending').map(r=>{
    const template=INCIDENTS.find(t=>t.id===r.templateId);
    const evidence={...template,inspection:makeInspection({...template,templateId:r.templateId},r.id-1)};
    const expected=expectedVerdict(evidence);
    return {id:r.id,type:r.type,status:r.status,correct:r.status==='auto'||((r.status==='allow'||r.status==='timeout')===expected),reason:verdictReason(evidence)};
  });
}

// API explanations are grounded in the shared answer functions, only after a judgement.
export function companionEvidence(context,kind) {
  context=normalizeCompanionContext(context);
  return {kind,time:context.time,done:context.done,metrics:context.metrics,zones:context.zones,
    pending:context.requests.filter(r=>r.status==='pending').map(({id,type,deadline})=>({id,area:TYPES[type].name,remaining:Math.max(0,Math.ceil(deadline-context.time))})),
    selectedId:context.selectedId,judged:judged(context),...(kind==='support'?{actions:supportActions(context)}:{})};
}

export function supportActions(context){
  const actions=[{kind:'wait',type:null}];
  const busy=context.zones.some(z=>z.repairEnd>context.time);
  for(const z of context.zones){
    if(!z.attacks||z.fixed)continue;
    if(context.metrics.quarantineUses<2&&z.quarantineUntil<=context.time)actions.push({kind:'quarantine',type:z.type});
    if(!busy)actions.push({kind:'repair',type:z.type});
  }
  return actions;
}
export function validSupportAction(context,action){return !!action&&supportActions(context).some(a=>a.kind===action.kind&&a.type===action.type);}
export function localSupport(context){
  const actions=supportActions(context),action=actions.find(a=>a.kind==='quarantine')||actions.find(a=>a.kind==='repair')||actions[0];
  return {source:'local',reason:'local',message:action.kind==='wait'?'先輩が監視を続けています。':`${TYPES[action.type].name}の${action.kind==='quarantine'?'一時隔離':'根本修復'}を支援します。`,action};
}

export function localCompanion(context,kind='consult') {
  context=normalizeCompanionContext(context);
  if(kind==='support')return localSupport(context);
  const records=judged(context), correct=records.filter(r=>r.correct).length;
  if(kind==='review'){
    const mistake=records.find(r=>!r.correct), pending=context.requests.filter(r=>r.status==='pending').length;
    const review={
      good:correct?`判定済み${records.length}件のうち${correct}件は正しい審査または防壁の自動拒否でした。`:'当直の記録を残せました。教科書で判断の根拠を確認できます。',
      improve:mistake?`通信 #${String(mistake.id).padStart(3,'0')}：${mistake.reason}`:pending?`未審査が${pending}件残りました。待ち時間と自動通過の期限にも目を向けましょう。`:'今回の判定済み通信に誤りはありません。必要な通信を届けられたかも確認しましょう。',
      next:'次の当直では、6項目を順に照合し、期限が近い通信から審査しましょう。根本修復でも既存被害は戻りません。'
    };
    return {source:'local',reason:'local',message:'当直お疲れさまでした。記録をもとに振り返りましょう。',review};
  }
  const selected=context.requests.find(r=>r.id===context.selectedId);
  const danger=context.zones.find(z=>z.attacks&&!z.fixed&&!z.repairEnd);
  let message='6項目すべての観測内容と規則を照合しましょう。確認メモは正誤の表示ではありません。';
  if(danger)message=`${TYPES[danger.type].name}で侵入が続いています。別の通信への侵入を防ぐため、6項目の照合と自動通過の期限を確認しましょう。既存被害の復旧は別に必要です。`;
  else if(selected)message=`通信 #${String(selected.id).padStart(3,'0')} は自動通過まであと${Math.max(0,Math.ceil(selected.deadline-context.time))}秒。技術所見に加えて、主体・権限・送信条件・展開後の処理量を確認しましょう。`;
  return {source:'local',reason:'local',message};
}

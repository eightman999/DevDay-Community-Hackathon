import {companionSnapshot,localSupport,supportActions,validSupportAction} from './companion-context.mjs';
import {TYPES} from './engine.mjs';

// The companion owns notes and defensive support; only the player may allow/deny.
export class CompanionSupport {
  constructor({provider=null,onAction=()=>{}}={}){this.provider=provider;this.onAction=onAction;this.version=0;this.disposed=false;this.shift=null;this.nextNote=0;this.nextDefense=0;this.flight=null;this.ready=null;this.calls=0;}
  reset(){this.version++;this.flight?.controller.abort();this.flight=null;this.ready=null;this.shift=null;this.calls=0;this.nextNote=0;this.nextDefense=0;}
  dispose(){this.reset();this.disposed=true;}
  tick(shift,{selectedId=null,onNote=()=>false}={}){
    if(this.disposed)return;
    if(this.shift!==shift){this.reset();this.shift=shift;}
    if(shift.done){this.flight?.controller.abort();this.flight=null;this.ready=null;return;}
    if(!shift.running)return;
    if(shift.time>=this.nextNote){
      this.nextNote=shift.time+2;
      const request=shift.requests.find(r=>r.id===selectedId&&r.status==='pending');
      if(request&&onNote())this.onAction({kind:'note',type:request.type,message:`先輩：通信 #${String(request.id).padStart(3,'0')} の確認メモを付けました。規則を満たすかは自分で判断してください。`,source:'local'});
    }
    if(shift.time<this.nextDefense)return;
    const context=companionSnapshot(shift,selectedId);
    if(supportActions(context).length===1){this.ready=null;return;}
    let result=this.ready;this.ready=null;
    if(result&&!validSupportAction(context,result.action))result=null;
    if(!result&&this.flight){
      if(shift.time-this.flight.at<8)return;
      this.flight.controller.abort();this.flight=null;this.version++;
      result=localSupport(context);
    }
    if(!result&&!this.flight&&this.provider?.support&&this.calls<6){
      const controller=new AbortController(),version=++this.version;this.calls++;
      this.flight={controller,at:shift.time};
      Promise.resolve().then(()=>{
        if(this.disposed||this.version!==version)return null;
        return this.provider.support(context,{signal:controller.signal});
      }).then(value=>{
        if(this.disposed||this.version!==version||this.shift!==shift)return;
        this.flight=null;this.ready=value;
      }).catch(()=>{if(this.version===version){this.flight=null;this.ready=localSupport(context);}});
      return;
    }
    if(!result)result=localSupport(context);
    const {kind,type}=result.action;
    const applied=kind==='quarantine'?shift.quarantine(type):kind==='repair'?shift.repair(type):false;
    this.nextDefense=shift.time+(kind==='wait'?3:2);
    if(applied){
      const message=`先輩：${TYPES[type].name}の${kind==='quarantine'?'一時隔離を実行しました（8秒、模擬予約4件を延期）。':'根本修復を開始しました（10秒、同時に1領域）。'}`;
      shift.lastLog=message;this.onAction({kind,type,source:result.source,message});
    }
  }
}

export const BASE_TEMPO=176;
export const tempoForIncidents=count=>120+10*Math.min(6,Math.max(0,Number(count)||0));

// Audio starts only inside a user gesture. The game remains usable if audio fails.
export class BackgroundMusic {
  constructor(onStatus = () => {}) {
    this.onStatus=onStatus; this.enabled=true; this.volume=.18; this.running=false;
    this.tempo=120;this.rate=120/BASE_TEMPO;this.rateRamp=null;
    this.offset=0; this.context=null; this.buffer=null; this.source=null; this.loading=null;
  }
  prepare() {
    if (this.loading) return this.loading;
    this.loading=new Promise((resolve,reject)=>{
      const worker=new Worker(new URL('./music-worker.mjs',import.meta.url),{type:'module'});
      const timeout=setTimeout(()=>{worker.terminate();reject(new Error('音源生成がタイムアウトしました'));},60000);
      worker.onmessage=({data})=>{
        clearTimeout(timeout); worker.terminate();
        if(data.error) reject(new Error(data.error)); else {this.rendered=data;resolve();}
      };
      worker.onerror=()=>{clearTimeout(timeout);worker.terminate();reject(new Error('音源を生成できません'));};
      worker.postMessage({render:true});
    }).catch(error=>{this.loading=null;throw error;});
    return this.loading;
  }
  async unlock() {
    if(!this.enabled) return;
    try {
      this.preparing=true;this.error=false;
      this.ensureContext();
      // Invoke resume before waiting for the worker so browser gesture permission survives.
      const resume=this.context.resume();
      this.onStatus('音源準備中');
      await Promise.all([resume,this.prepare()]);
      if(!this.buffer){
        const {left,right,sampleRate}=this.rendered;
        this.buffer=this.context.createBuffer(2,left.length,sampleRate);
        this.buffer.copyToChannel(left,0);this.buffer.copyToChannel(right,1);
        this.rendered=null;
      }
      this.preparing=false;this.sync();
    } catch(error) { this.preparing=false;this.error=true;this.sync(); console.warn('BGM:',error.message); }
  }
  ensureContext() {
    if(!this.context) {
      const Audio=globalThis.AudioContext||globalThis.webkitAudioContext;
      if(!Audio) throw new Error('音声非対応');
      this.context=new Audio();this.gain=this.context.createGain();
      this.gain.gain.value=this.volume;this.gain.connect(this.context.destination);
    }
    return this.context;
  }
  sync() {
    const play=this.running&&this.enabled;
    if(!play&&this.source){
      this.offset=this.positionAt(this.context.currentTime);
      this.source.stop();this.source.disconnect();this.source=null;
    }
    if(play&&!this.source&&this.buffer&&this.context.state==='running'){
      this.source=this.context.createBufferSource();this.source.buffer=this.buffer;
      this.source.loop=true;this.source.connect(this.gain);
      this.source.playbackRate.setValueAtTime(this.tempo/BASE_TEMPO,this.context.currentTime);
      this.rate=this.tempo/BASE_TEMPO;this.rateRamp=null;
      this.startedAt=this.context.currentTime;this.source.start(0,this.offset);
    }
    this.onStatus(!this.enabled?'OFF':this.error?'音声エラー：OFF→ONで再試行':this.preparing?'音源準備中':this.source?`再生中 ${this.tempo} BPM`:this.buffer?'一時停止':'待機');
  }
  rateAt(time) {
    if(!this.rateRamp)return this.rate;
    const {from,to,start,end}=this.rateRamp;
    return from+(to-from)*Math.max(0,Math.min(1,(time-start)/(end-start)));
  }
  positionAt(time) {
    let elapsed=(time-this.startedAt)*this.rate;
    if(this.rateRamp) {
      const {from,to,start,end}=this.rateRamp;
      const rampTime=Math.max(0,Math.min(time,end)-start);
      elapsed=(start-this.startedAt)*from+from*rampTime+(to-from)*rampTime*rampTime/(2*(end-start))+Math.max(0,time-end)*to;
    }
    return (this.offset+elapsed)%this.buffer.duration;
  }
  setIncidents(count) {
    const tempo=tempoForIncidents(count);
    if(tempo===this.tempo)return;
    this.tempo=tempo;
    if(this.source) {
      const now=this.context.currentTime,from=this.rateAt(now),to=tempo/BASE_TEMPO;
      this.offset=this.positionAt(now);this.startedAt=now;this.rate=from;
      this.rateRamp={from,to,start:now,end:now+1.5};
      const rate=this.source.playbackRate;
      rate.cancelScheduledValues(now);rate.setValueAtTime(from,now);rate.linearRampToValueAtTime(to,now+1.5);
    }
    this.sync();
  }
  setRunning(running) { if(this.running===running)return;this.running=running;this.sync(); }
  setEnabled(enabled) {this.enabled=enabled;this.sync();if(enabled)void this.unlock();}
  setVolume(value) {this.volume=Math.max(0,Math.min(1,Number(value)||0));if(this.gain)this.gain.gain.setTargetAtTime(this.volume,this.context.currentTime,.025);}
  reset() {this.setRunning(false);this.offset=0;this.tempo=120;this.rate=120/BASE_TEMPO;this.rateRamp=null;}
}

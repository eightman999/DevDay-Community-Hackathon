// Short console-style cues. No samples, network or dependency on BGM rendering.
const CUES = {
  start:[[523,.08],[659,.08],[784,.14]],
  arrival:[[880,.045],[1175,.055]],
  allow:[[660,.055],[990,.09]],
  block:[[330,.06],[220,.075]],
  error:[[155,.09],[116,.12]],
  alarm:[[220,.09],[440,.09],[220,.09]],
  inspect:[[1320,.035],[1760,.04]],
  quarantine:[[440,.06],[330,.06],[220,.12]],
  repairStart:[[392,.06],[523,.09]],
  repaired:[[523,.07],[659,.07],[784,.07],[1047,.16]],
  finish:[[784,.09],[659,.09],[523,.23]],
};
export const SOUND_NAMES=Object.keys(CUES);
export function renderSound(name,sampleRate=44100) {
  const notes=CUES[name];
  if(!notes) return new Float32Array(0);
  const size=notes.reduce((n,[,duration])=>n+Math.round(duration*sampleRate),0);
  const data=new Float32Array(size);
  let offset=0;
  for(const [frequency,duration] of notes) {
    const length=Math.round(duration*sampleRate);
    for(let i=0;i<length;i++) {
      const t=i/sampleRate;
      const envelope=Math.min(1,i/(sampleRate*.002))*Math.min(1,(length-1-i)/(sampleRate*.012));
      // A few odd harmonics give a pulse cue with controlled high-frequency energy.
      let pulse=0;
      for(const h of [1,3,5,7]) if(frequency*h<sampleRate*.43) pulse+=Math.sin(2*Math.PI*frequency*h*t)/h;
      data[offset+i]=Math.round(pulse*15)/15*envelope*.32;
    }
    offset+=length;
  }
  return data;
}
export class SoundEffects {
  constructor(getContext) {
    this.getContext=getContext;this.enabled=true;this.volume=.45;
    this.active=new Set();this.buffers=new Map();this.epoch=0;
  }
  async play(name) {
    if(!this.enabled||!CUES[name]||this.active.size>=6) return;
    const epoch=this.epoch;
    try {
      const context=this.getContext();
      if(context.state!=='running') await context.resume();
      if(!this.enabled||epoch!==this.epoch||this.active.size>=6) return;
      if(!this.gain){this.gain=context.createGain();this.gain.gain.value=this.volume;this.gain.connect(context.destination);}
      if(!this.buffers.has(name)) {
        const data=renderSound(name,context.sampleRate);
        const buffer=context.createBuffer(1,data.length,context.sampleRate);
        buffer.copyToChannel(data,0);this.buffers.set(name,buffer);
      }
      const source=context.createBufferSource();source.buffer=this.buffers.get(name);
      source.connect(this.gain);this.active.add(source);
      source.onended=()=>{this.active.delete(source);source.disconnect();};
      source.start();
    } catch { /* Audio unavailable: the game and visual feedback still work. */ }
  }
  stop() {this.epoch++;for(const source of this.active){source.stop();source.disconnect();}this.active.clear();}
  setEnabled(enabled) {this.enabled=enabled;if(!enabled)this.stop();}
}

// Consume each engine effect once, even when renderUI runs repeatedly or pruning
// changes array indices. Reset uses new event objects, so no historical replay.
export class GameSoundEvents {
  constructor(sounds) {this.sounds=sounds;this.seen=new WeakSet();}
  consume(effects,audible=true) {
    const names={arrival:'arrival',good:'allow',stop:'block',attack:'alarm',falseblock:'error',wall:'repaired'};
    const cues=new Set();
    for(const effect of effects) {
      if(this.seen.has(effect)) continue;
      this.seen.add(effect);
      if(audible&&names[effect.kind]) cues.add(names[effect.kind]);
    }
    for(const cue of cues) void this.sounds.play(cue);
  }
}

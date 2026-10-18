import { UzumeCompiler } from './vendor/uzume.mjs';

export const TEMPO = 176;
export const BARS = 96;
export const SAMPLE_RATE = 44100;

// Keep the supplied notes/arrangement; assign a separate timbre and mix to each part.
const DRUMS = {dk:['kick',105],dkc:['kick',105],ds:['snare',96],dh:['hat',36],dhr:['hat',30],dg:['rim',48],dt:['tom',80],dc:['crash',48],dr:['snare',65]};

export function arrangeScore(score) {
  return score.replace(/^(\w+) = measure\[/gm, (definition, name) => {
    const [wave, volume] = DRUMS[name] || (/^b[dbfa]$/.test(name) ? ['bass',60] : /^o/.test(name) ? ['square',20] : /^x/.test(name) ? ['arp',22] : /^k/.test(name) ? ['square',21] : ['lead',34]);
    return `set wave(${wave}); set volume(${volume});\n${definition}`;
  });
}

export function createMusicCompiler() {
  const compiler = new UzumeCompiler();
  const engine = compiler.audioEngine;
  // NES-like 15-bit LFSR noise, clocked at 11 kHz; pulse and triangle voices.
  let lfsr = 1;
  engine.generateWaveform = (frequency, duration, wave, volume, articulation) => {
    const output = new Float32Array(Math.floor(duration * SAMPLE_RATE));
    let noise = 0, clock = -1, previousNoise = 0;
    const percussion = ['kick','snare','hat','crash','rim','tom'].includes(wave);
    for (let i = 0; i < output.length; i++) {
      const t = i / SAMPLE_RATE;
      if (Math.floor(t*11025)!==clock) {
        clock=Math.floor(t*11025);
        lfsr=(lfsr>>>1)|(((lfsr^(lfsr>>>1))&1)<<14);
        previousNoise=noise;noise=(lfsr&1)?1:-1;
      }
      let value;
      if (wave==='kick') value = Math.round(Math.sin(2*Math.PI*(46*t+100*.018*(1-Math.exp(-t/.018))))*7)/7*Math.exp(-t*24)+noise*.12*Math.exp(-t*220);
      else if (wave==='snare') value = noise*.85*Math.exp(-t*28)+Math.sign(Math.sin(2*Math.PI*185*t))*.3*Math.exp(-t*55);
      else if (wave==='hat'||wave==='crash') value = (noise-previousNoise)*.5*Math.exp(-t*(wave==='hat'?80:13));
      else if (wave==='rim') value = (Math.sign(Math.sin(2*Math.PI*1560*t))*.65+noise*.35)*Math.exp(-t*100);
      else if (wave==='tom') value = Math.round(Math.sin(2*Math.PI*(frequency*t+frequency*.018*(1-Math.exp(-t/.03))))*7)/7*Math.exp(-t*22);
      else {
        value=0;
        const duty=wave==='lead'?.25:wave==='arp'?.125:.5;
        for (let h=1;h<=16&&frequency*h<SAMPLE_RATE*.43;h++) {
          if(wave==='bass') {
            if(h%2) value+=8/(Math.PI*Math.PI)*Math.sin(2*Math.PI*frequency*h*t)*Math.sin(Math.PI*h/2)/(h*h);
          } else value+=4/(Math.PI*h)*Math.sin(Math.PI*h*duty)*Math.cos(2*Math.PI*h*(frequency*t-duty/2));
        }
        // DAC steps retain the handheld-console edge without a full-scale square mix.
        value=Math.round(value*15)/15;
        const gate=duration*(articulation==='stc'?.5:.87);
        value*=Math.min(1,t/.002)*Math.max(0,Math.min(1,(gate-t)/.008));
      }
      const tail=Math.min(1,(output.length-1-i)/100);
      output[i]=value*volume*tail*(percussion?1:.8);
    }
    return output;
  };
  compiler.mixBuffers = buffers => {
    const mixed = new Float32Array(Math.max(0,...buffers.map(b=>b.length)));
    for (const buffer of buffers) for (let i=0;i<buffer.length;i++) mixed[i]+=buffer[i];
    return mixed;
  };
  const render = compiler.renderSingleMeasure.bind(compiler), cache = new Map();
  compiler.renderSingleMeasure = name => {
    if (!cache.has(name)) cache.set(name,(async()=>{
      const bar = new Float32Array(Math.round(SAMPLE_RATE*240/TEMPO));
      if (DRUMS[name]) {
        // Lay hits over rests, keeping their attacks on the original grid while
        // giving the snare/crash enough tail to sound like drums rather than ticks.
        const [wave,volume]=DRUMS[name];
        const decay={kick:.15,snare:.17,hat:.055,rim:.055,tom:.18,crash:.48}[wave];
        let beat=0;
        for(const note of compiler.measures.get(name)) {
          if(note.pitch) {
            const at=Math.round(beat*60/TEMPO*SAMPLE_RATE);
            const hit=engine.generateWaveform(engine.noteToFrequency(note.pitch),decay,wave,volume/127*(note.articulation==='acc'?1.15:.85));
            for(let i=0;i<hit.length&&at+i<bar.length;i++) bar[at+i]+=hit[i];
          }
          beat+=note.duration;
        }
      } else {
        const raw=await render(name);
        bar.set(raw.subarray(0,bar.length));
      }
      return bar;
    })());
    return cache.get(name);
  };
  return compiler;
}

export async function renderMusic(score) {
  const compiler = createMusicCompiler();
  const mono = await compiler.compile(arrangeScore(score));
  const left = new Float32Array(mono.length), right = new Float32Array(mono.length);
  const delayL = Math.round(SAMPLE_RATE*60/TEMPO*.75), delayR = Math.round(SAMPLE_RATE*60/TEMPO*.5);
  let smooth = 0;
  for (let i=0;i<mono.length;i++) {
    smooth += .72*(mono[i]-smooth);
    // Circular delay preserves the 96-bar loop and its reverb tail at the seam.
    left[i] = Math.tanh((smooth+mono[(i-delayL+mono.length)%mono.length]*.08)*.65)*.78;
    right[i] = Math.tanh((smooth+mono[(i-delayR+mono.length)%mono.length]*.08)*.65)*.78;
  }
  return {left,right,sampleRate:SAMPLE_RATE,bars:BARS,tempo:TEMPO};
}

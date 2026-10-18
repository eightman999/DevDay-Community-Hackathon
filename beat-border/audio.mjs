export function createAudio(){
 let ctx,master,noise,next=0,enabled=true,base=0;
 const midi=n=>440*2**((n-69)/12);
 function tone(freq,when,len,gain=.08,type='triangle'){
   const o=ctx.createOscillator(),g=ctx.createGain();o.type=type;o.frequency.value=freq;g.gain.setValueAtTime(0,when);g.gain.linearRampToValueAtTime(gain,when+.008);g.gain.exponentialRampToValueAtTime(.0001,when+len);o.connect(g);g.connect(master);o.start(when);o.stop(when+len+.01);
 }
 function drum(when,snare=false){
   if(snare){const s=ctx.createBufferSource(),g=ctx.createGain();s.buffer=noise;const f=ctx.createBiquadFilter();f.type='highpass';f.frequency.value=1200;g.gain.setValueAtTime(.16,when);g.gain.exponentialRampToValueAtTime(.001,when+.11);s.connect(f);f.connect(g);g.connect(master);s.start(when);s.stop(when+.12);}
   else{const o=ctx.createOscillator(),g=ctx.createGain();o.frequency.setValueAtTime(135,when);o.frequency.exponentialRampToValueAtTime(42,when+.12);g.gain.setValueAtTime(.35,when);g.gain.exponentialRampToValueAtTime(.001,when+.18);o.connect(g);g.connect(master);o.start(when);o.stop(when+.2);}
 }
 return {
   start(){if(ctx)ctx.close();const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;ctx=new Audio();master=ctx.createGain();master.gain.value=enabled?.6:0;master.connect(ctx.destination);noise=ctx.createBuffer(1,ctx.sampleRate*.15,ctx.sampleRate);const d=noise.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;next=0;base=ctx.currentTime;ctx.resume().catch(()=>{});},
   schedule(time){if(!ctx||ctx.state!=='running')return;const pattern=[62,69,74,77,74,69,65,69,60,67,72,76,72,67,64,67];while(next*.125<time+.12&&next*.125<30){const t=next*.125,at=base+t;if(at>=ctx.currentTime){if(next%4===0)drum(at);if(next%8===4)drum(at,true);if(next%2===0)tone(6400,at,.025,.018,'square');if(next%4===0)tone(midi([38,38,41,36][Math.floor(next/16)%4]),at,.22,.14,'triangle');if([0,3,6,10,12,15].includes(next%16))tone(midi(pattern[next%16]),at,.16,.045,'square');if(t>=2&&Math.abs((t-2)%2.5)<.001)tone(1046.5,at,.10,.11,'sine');}next++;}},
   pause(){ctx?.suspend().catch(()=>{});},resume(){ctx?.resume().catch(()=>{});},
   setEnabled(v){enabled=v;if(master)master.gain.setTargetAtTime(enabled?.6:0,ctx.currentTime,.02);},
   feedback(correct){if(ctx?.state==='running')tone(correct?midi(86):midi(44),ctx.currentTime,.1,correct?.055:.08,correct?'sine':'sawtooth');},
   stop(){ctx?.suspend().catch(()=>{});}
 };
}

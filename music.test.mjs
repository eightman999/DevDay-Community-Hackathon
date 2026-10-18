import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderMusic,createMusicCompiler,arrangeScore,SAMPLE_RATE,TEMPO} from './dist/music-renderer.mjs';
import {BackgroundMusic} from './dist/music.mjs';

test('provided 96-bar arrangement renders finite stereo PCM at 176 BPM',async()=>{
  const score=readFileSync(new URL('./dist/music/tactical-breach.txt',import.meta.url),'utf8');
  const {left,right}=await renderMusic(score);
  assert.equal(left.length,96*Math.round(SAMPLE_RATE*240/TEMPO));
  assert.equal(right.length,left.length);
  let peak=0,energy=0,difference=0;
  for(let i=0;i<left.length;i++){
    assert(Number.isFinite(left[i])&&Number.isFinite(right[i]));
    peak=Math.max(peak,Math.abs(left[i]),Math.abs(right[i]));energy+=left[i]**2;difference+=Math.abs(left[i]-right[i]);
  }
  assert(peak>.1&&peak<1);assert(Math.sqrt(energy/left.length)>.02);assert(difference>100);
  console.log({duration:left.length/SAMPLE_RATE,peak,rms:Math.sqrt(energy/left.length)});
});
test('each drum voice decays to zero and differs from a pitched synth',()=>{
  const engine=createMusicCompiler().audioEngine;
  for(const voice of ['kick','snare','hat','rim','tom','crash']){
    const hit=engine.generateWaveform(180,.17,voice,.5);
    assert(hit.at(-1)===0);assert(hit.some(v=>Math.abs(v)>.01));
  }
  assert(arrangeScore('bd = measure[nD2-4];').includes('wave(bass)'));
});
test('pause, mute, resume and reset do not duplicate sources or lose playback position',()=>{
  let starts=0,stops=0;
  const music=new BackgroundMusic();
  music.context={currentTime:0,state:'running',createBufferSource:()=>({playbackRate:{setValueAtTime(){}},connect(){},disconnect(){},start(){starts++},stop(){stops++}})};
  music.gain={gain:{setTargetAtTime(){}}};music.buffer={duration:130};
  music.setRunning(true);music.setRunning(true);assert.equal(starts,1);
  music.context.currentTime=12;music.setRunning(false);assert(Math.abs(music.offset-12*120/176)<1e-10);assert.equal(stops,1);
  music.setRunning(true);assert.equal(starts,2);
  music.setEnabled(false);assert.equal(stops,2);
  music.reset();assert.equal(music.offset,0);
});
test('a late audio preparation cannot restart a paused or muted shift',async()=>{
  const music=new BackgroundMusic();let complete,starts=0;
  music.context={resume:()=>Promise.resolve(),currentTime:0,state:'running',createBuffer:()=>({copyToChannel(){},duration:1}),createBufferSource:()=>({connect(){},start(){starts++}})};
  music.prepare=()=>new Promise(resolve=>complete=resolve);
  music.rendered={left:new Float32Array(10),right:new Float32Array(10),sampleRate:44100};
  music.setRunning(true);const pending=music.unlock();music.setRunning(false);music.enabled=false;complete();await pending;assert.equal(starts,0);
});

test('SE cues are finite, bounded and end at zero',async()=>{
  const {SOUND_NAMES,renderSound}=await import('./dist/sound-effects.mjs');
  for(const name of SOUND_NAMES){
    const pcm=renderSound(name);
    assert(pcm.length>1000&&pcm.length<44100);
    assert(pcm.at(-1)===0);
    assert(pcm.every(x=>Number.isFinite(x)&&Math.abs(x)<.7));
    assert(pcm.some(x=>Math.abs(x)>.1));
  }
});
test('game SE do not replay after UI redraws, effect pruning or background updates',async()=>{
  const {GameSoundEvents}=await import('./dist/sound-effects.mjs');
  const played=[],events=new GameSoundEvents({play:name=>played.push(name)});
  const arrival={kind:'arrival'},attack={kind:'attack'},wall={kind:'wall'};
  events.consume([arrival]);events.consume([arrival]);events.consume([arrival,attack]);
  events.consume([attack,wall],false);events.consume([wall]);
  assert.deepEqual(played,['arrival','alarm']);
  events.consume([{kind:'wall'},{kind:'wall'}]);
  assert.deepEqual(played,['arrival','alarm','repaired']);
});
test('muting SE cancels pending context resume and active sounds',async()=>{
  const {SoundEffects}=await import('./dist/sound-effects.mjs');
  let resume,starts=0,stops=0;
  const context={state:'suspended',sampleRate:44100,resume:()=>new Promise(resolve=>resume=resolve),createGain:()=>({gain:{value:0},connect(){}}),createBuffer:()=>({copyToChannel(){}}),createBufferSource:()=>({playbackRate:{setValueAtTime(){}},connect(){},disconnect(){},start(){starts++},stop(){stops++}})};
  const sounds=new SoundEffects(()=>context);
  const pending=sounds.play('start');sounds.setEnabled(false);resume();await pending;
  assert.equal(starts,0);
  context.state='running';sounds.setEnabled(true);await sounds.play('start');
  assert.equal(starts,1);sounds.setEnabled(false);assert.equal(stops,1);assert.equal(sounds.active.size,0);
});
test('snare and crash sustain over rests without shifting the bar grid',async()=>{
  const compiler=createMusicCompiler();
  await compiler.compile(arrangeScore('set tempo(176); ds = measure[R-1, acc nD4-0.125,R-0.875,R-1,acc nD4-0.125,R-0.875]; dc = measure[acc nC7-0.125,R-3.875]; read(ds & dc);'));
  const snare=await compiler.renderSingleMeasure('ds'),crash=await compiler.renderSingleMeasure('dc');
  const at=Math.round(SAMPLE_RATE*60/TEMPO);
  assert(snare.subarray(0,at).every(x=>x===0));
  assert(snare.subarray(at+3000,at+5000).some(x=>Math.abs(x)>.01));
  assert(crash.subarray(5000,10000).some(x=>Math.abs(x)>.01));
  assert.equal(snare.length,Math.round(SAMPLE_RATE*240/TEMPO));
});

test('incident tempo ramps from 120 to 180 and clamps to bounds',async()=>{
  const {tempoForIncidents}=await import('./dist/music.mjs');
  assert.deepEqual([0,1,3,6,20,-5].map(tempoForIncidents),[120,130,150,180,180,120]);
  const calls=[],rate={cancelScheduledValues(){},setValueAtTime(value){calls.push(value)},linearRampToValueAtTime(value){calls.push(value)}};
  const music=new BackgroundMusic();
  assert.equal(music.volume,.18);
  music.context={currentTime:10,state:'running'};music.buffer={duration:200};
  music.running=true;music.startedAt=0;music.source={playbackRate:rate};
  music.setIncidents(6);
  assert.equal(music.tempo,180);assert(Math.abs(music.offset-10*120/176)<1e-10);
  assert.deepEqual(calls,[120/176,180/176]);
  // Integral of the linear tempo ramp preserves the cursor when paused/resumed.
  const expected=10*120/176+1.5*150/176+1.5*180/176;
  assert(Math.abs(music.positionAt(13)-expected)<1e-10);
  music.context.currentTime=10.75;const before=music.positionAt(10.75);
  music.setIncidents(0);assert.equal(music.tempo,120);
  assert(Math.abs(music.positionAt(10.75)-before)<1e-10);
});

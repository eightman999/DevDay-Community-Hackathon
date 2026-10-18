import {createGame,ITEMS,ACTIONS,DURATION,WINDOW,BEAT} from './engine.mjs';
import {drawSprite} from './sprites.mjs';
import {createAudio} from './audio.mjs';
const $=id=>document.getElementById(id),game=createGame(),audio=createAudio(),keys=[...document.querySelectorAll('[data-action]')];
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
let last=performance.now(),shown=-1,feedbackUntil=0,stampUntil=0,noticeUntil=0,notified=false,sound=true,aboutWasPlaying=false,visualIndex=-1,visualUntil=0;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
function feedback(text,kind=''){const el=$('feedback');el.textContent=text;el.className='feedback '+kind;feedbackUntil=performance.now()+1100;}
function renderItem(s){
 const index=performance.now()<visualUntil?visualIndex:s.index;
 if(shown===index)return;shown=index;
 const item=ITEMS[index];
 if(item){drawSprite($('sprite'),item.kind);$('fileName').textContent=item.name;$('format').textContent=item.format;$('content').textContent=item.content;$('detail').textContent=item.detail;$('itemNumber').textContent=`${String(item.id).padStart(2,'0')} / 12`;}
 else{$('fileName').textContent='すべてのデータを検査しました';$('content').textContent='まもなく検査終了。';$('detail').textContent='';$('format').textContent='完了';$('sprite').style.opacity='.3';}
 $('queue').replaceChildren();ITEMS.slice(index+1,index+4).forEach((x,i)=>{const row=document.createElement('div');row.className='queue-item';const c=document.createElement('canvas');c.width=c.height=160;c.setAttribute('aria-label','次のデータ');drawSprite(c,x.kind);const label=document.createElement('span');label.textContent=`0${i+1} / ${x.format}`;row.append(c,label);$('queue').append(row);});
}
function showRecord(r){
 if(!r)return;
 visualIndex=r.id-1;visualUntil=performance.now()+400;
 const label=r.action?ACTIONS[r.action]:'見送り';
 const good=r.correct&&r.grade!=='MISS';
 feedback(good?`${r.grade}  /  ${label}で正解！`:`${r.grade==='MISS'?'MISS':'判定ミス'}  /  正解は「${ACTIONS[r.expected]}」`,good?'good':'bad');
 const stamp=$('stamp');stamp.textContent=good?label:r.grade==='MISS'?'MISS':'判定ミス';stamp.className='stamp show'+(good?'':' wrong');stampUntil=performance.now()+500;audio.feedback(good);
}
function choose(action){
 const r=game.choose(action);if(!r)return;if(r.early){feedback('まだ早い！ 白いノーツを中央まで待とう');return;}
 const key=keys.find(b=>b.dataset.action===action);key.classList.add('pressed');setTimeout(()=>key.classList.remove('pressed'),130);showRecord(r);render();
}
function start(){
 for(const id of ['intro','result','pauseDialog'])if($(id).open)$(id).close();game.start();audio.start();last=performance.now();shown=-1;visualIndex=-1;visualUntil=0;notified=false;feedbackUntil=0;stampUntil=0;noticeUntil=0;$('sprite').style.opacity='1';$('stamp').className='stamp';$('notice').classList.remove('visible');$('extraRule').classList.remove('active');$('extraRule').textContent='後半に追加通達あり';keys.forEach(b=>b.disabled=false);$('pause').disabled=false;render();
}
function pause(){if(game.snapshot().phase!=='playing')return;game.pause();audio.pause();keys.forEach(b=>b.disabled=true);$('pauseDialog').showModal();}
function resume(){if($('pauseDialog').open)$('pauseDialog').close();game.resume();audio.resume();last=performance.now();keys.forEach(b=>b.disabled=false);}
function result(){
 audio.stop();keys.forEach(b=>b.disabled=true);$('pause').disabled=true;const s=game.snapshot();
 $('accuracy').textContent=`${s.correct}/12`;$('perfects').textContent=s.results.filter(r=>r.grade==='PERFECT').length;$('totalScore').textContent=s.score;
 $('rank').textContent=s.score>=1100?'S':s.score>=850?'A':s.score>=600?'B':s.score>=300?'C':'D';
 const leaked=s.results.filter(r=>r.action==='allow'&&r.expected==='reject').length;
 $('resultMessage').textContent=s.correct===12?`判断は全問正解！ 最大${s.maxCombo}コンボ。次は拍の精度を磨こう。`:leaked?`拒否すべきデータを${leaked}件通しました。内容と、途中の追加通達をチェックしよう。`:`正しい判断は${s.correct}件。白いノーツが中央に来るまでに、中身を読もう。`;
 $('review').replaceChildren();for(const r of s.results){const li=document.createElement('li'),title=document.createElement('strong');title.textContent=`${r.correct?'✓':'×'} ${r.name} — ${r.action?ACTIONS[r.action]:'未判定'} / ${r.grade}`;li.append(title,document.createElement('br'),`正解：${ACTIONS[r.expected]}。${r.reason}`);$('review').append(li);}
 $('result').showModal();
}
function render(){
 const s=game.snapshot();renderItem(s);$('score').textContent=String(s.score).padStart(4,'0');$('combo').textContent=String(s.combo).padStart(2,'0');$('clock').textContent=`0:${String(Math.ceil(DURATION-s.time)).padStart(2,'0')}`;
 $('progressText').textContent=s.phase==='ready'?'READY TO INSPECT':`${Math.min(s.index,12)} / 12 FILES INSPECTED`;
 if(s.ruleUpdated&&!notified){notified=true;$('extraRule').textContent='追加：実行ファイル .exe も拒否';$('extraRule').classList.add('active');$('notice').textContent='緊急通達：これから .exe も「拒否」';$('notice').classList.add('visible');noticeUntil=performance.now()+2600;}
 const now=performance.now();if(now>noticeUntil)$('notice').classList.remove('visible');if(now>stampUntil)$('stamp').classList.remove('show');
 if(now>feedbackUntil){const remaining=s.item?s.item.target-s.time:0;$('feedback').textContent=s.phase==='ready'?'白いノーツが中央に来たら、判定！':s.phase==='paused'?'検査を一時停止しています':remaining>0&&s.time<2?`準備… ${Math.ceil(remaining/BEAT)}`:'白いノーツが中央に来たら、判定！';$('feedback').className='feedback';}
 const bounce=reduced?0:Math.max(0,Math.cos(s.time/BEAT*Math.PI*2))*-7;$('sprite').style.transform=`translateY(${bounce}px) rotate(${reduced?0:Math.sin(s.time*2)*1.5}deg)`;
 drawRail(s);
}
function drawRail(s){
 const canvas=$('rail'),box=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);if(canvas.width!==Math.round(box.width*dpr)||canvas.height!==Math.round(box.height*dpr)){canvas.width=Math.round(box.width*dpr);canvas.height=Math.round(box.height*dpr);}
 const c=canvas.getContext('2d'),w=canvas.width,h=canvas.height,mid=w*.5,speed=Math.min(w*.22,230*dpr);c.clearRect(0,0,w,h);
 c.strokeStyle='#325751';c.lineWidth=dpr;c.beginPath();c.moveTo(0,h/2);c.lineTo(w,h/2);c.stroke();
 // Green ticks are the metronome; white square notes are actual judgments.
 for(let beat=Math.floor(s.time/BEAT)-8;beat<s.time/BEAT+12;beat++){const x=mid+(beat*BEAT-s.time)*speed;if(x<0||x>w)continue;c.fillStyle=beat%4===0?'#5e9b83':'#325a51';c.fillRect(x-1*dpr,h/2-3*dpr,2*dpr,6*dpr);}
 for(const item of ITEMS){if(item.id<=s.index)continue;const x=mid+(item.target-s.time)*speed;if(x<-30||x>w+30)continue;const near=Math.abs(item.target-s.time)<WINDOW;c.shadowColor='#c1ffe2';c.shadowBlur=near?18*dpr:6*dpr;c.fillStyle=near?'#88ffd0':'#f7f0d7';const size=(near?15:12)*dpr;c.fillRect(x-size/2,h/2-size/2,size,size);c.shadowBlur=0;}
 const pulse=Math.max(0,1-(s.time%BEAT)/.2);c.fillStyle=`rgba(121,233,187,${pulse*.3})`;c.fillRect(mid-22*dpr,h/2-22*dpr,44*dpr,44*dpr);
}
function frame(now){const dt=Math.max(0,(now-last)/1000);last=now;const s=game.snapshot();if(s.phase==='playing'){const missed=game.update(dt);missed.forEach(showRecord);audio.schedule(game.snapshot().time);if(game.snapshot().phase==='done')result();}render();requestAnimationFrame(frame);}
keys.forEach(b=>b.addEventListener('pointerdown',e=>{if(!b.disabled&&e.button===0){e.preventDefault();choose(b.dataset.action);}}));
// Keyboard activation by assistive technology still uses click (pointer events above consume native clicks).
keys.forEach(b=>b.addEventListener('click',e=>{if(e.detail===0)choose(b.dataset.action);}));
document.addEventListener('keydown',e=>{if(e.repeat||document.querySelector('dialog[open]'))return;const a={ArrowLeft:'allow',a:'allow',A:'allow',ArrowDown:'reject',s:'reject',S:'reject',ArrowRight:'hold',d:'hold',D:'hold'}[e.key];if(a){e.preventDefault();choose(a);}if(e.key==='Escape'||e.key==='p')pause();});
$('start').onclick=start;$('retry').onclick=start;$('restartPause').onclick=start;$('pause').onclick=pause;$('resume').onclick=resume;
$('sound').onclick=()=>{sound=!sound;audio.setEnabled(sound);$('sound').textContent=`音 ${sound?'ON':'OFF'}`;$('sound').setAttribute('aria-pressed',String(sound));};
$('about').onclick=()=>{aboutWasPlaying=game.snapshot().phase==='playing';if(aboutWasPlaying){game.pause();audio.pause();keys.forEach(b=>b.disabled=true);}$('aboutDialog').showModal();};
$('closeAbout').onclick=()=>{$('aboutDialog').close();if(aboutWasPlaying)$('pauseDialog').showModal();};
$('aboutDialog').addEventListener('cancel',e=>{e.preventDefault();$('closeAbout').click();});
for(const id of ['intro','result','pauseDialog'])$(id).addEventListener('cancel',e=>e.preventDefault());
document.addEventListener('visibilitychange',()=>{if(document.hidden&&game.snapshot().phase==='playing')pause();});
render();$('intro').showModal();requestAnimationFrame(frame);

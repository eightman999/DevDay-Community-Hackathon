export const BPM = 120;
export const BEAT = 0.5;
export const DURATION = 30;
export const WINDOW = 0.22;
export const ACTIONS = { allow: '許可', reject: '拒否', hold: '保留' };
const originals = [
  {name:'休日の空.png',kind:'photo',format:'.png',content:'青い空と、白い雲。',detail:'個人情報：なし',pii:false},
  {name:'連絡メモ.txt',kind:'document',format:'.txt',content:'電話番号：090-••••-••••',detail:'個人の連絡先を含む',pii:true},
  {name:'night-loop.wav',kind:'music',format:'.wav',content:'夜の街を歩くための音楽。',detail:'個人情報：なし',pii:false},
  {name:'secret-box.zip',kind:'locked',format:'.zip',content:'暗号化されて読めません',detail:'内容：確認できない',unreadable:true},
  {name:'こわい顔.png',kind:'virus',format:'.png',content:'ゲーム用モンスターの画像。',detail:'個人情報：なし',pii:false},
  {name:'住所録.csv',kind:'document',format:'.csv',content:'住所：架空市 みどり町…',detail:'個人の住所を含む',pii:true},
  {name:'free-gift.exe',kind:'gift',format:'.exe',content:'起動するとプレゼント！',detail:'種類：実行ファイル',executable:true},
  {name:'春の花.png',kind:'photo',format:'.png',content:'公園で咲いた小さな花。',detail:'個人情報：なし',pii:false},
  {name:'private-note.zip',kind:'locked',format:'.zip',content:'パスワードが必要です',detail:'内容：確認できない',unreadable:true},
  {name:'連絡先つき.mp3',kind:'music',format:'.mp3',content:'説明欄：個人メールアドレス',detail:'連絡先：player@example.invalid',pii:true},
  {name:'smile-virus.exe',kind:'virus',format:'.exe',content:'かわいい顔のアプリです。',detail:'種類：実行ファイル',executable:true},
  {name:'おつかれさま.txt',kind:'document',format:'.txt',content:'よいデータで、よい明日を。',detail:'個人情報：なし',pii:false}
];
export const ITEMS = originals.map((x,i)=>({...x,id:i+1,target:2+i*2.5}));
export function classify(item, time) {
  if(item.pii) return {action:'reject',reason:'個人情報が含まれています。'};
  if(item.unreadable) return {action:'hold',reason:'中身を確認できないため、追加検査へ。'};
  if(item.executable && time >= 15) return {action:'reject',reason:'追加ルール：実行ファイル（.exe）は拒否。'};
  return {action:'allow',reason:'現在の禁止条件に当てはまりません。'};
}
export function timingGrade(offset) {
  const d=Math.abs(offset);
  return d <= .075 ? 'PERFECT' : d <= .15 ? 'GOOD' : d <= WINDOW+1e-9 ? 'OK' : null;
}
export function createGame() {
  let phase='ready',time=0,results=[],index=0,combo=0,maxCombo=0;
  function record(action,offset) {
    const item=ITEMS[index],expected=classify(item,item.target),grade=action ? timingGrade(offset) : 'MISS';
    const correct=action===expected.action,points=correct ? ({PERFECT:100,GOOD:80,OK:50}[grade]||0) : 0;
    combo=correct && grade!=='MISS' ? combo+1 : 0;maxCombo=Math.max(combo,maxCombo);
    const r={id:item.id,name:item.name,action,expected:expected.action,reason:expected.reason,grade,correct,offset,points};
    results.push(r);index++;return r;
  }
  return {
    start(){phase='playing';time=0;results=[];index=0;combo=0;maxCombo=0;},
    pause(){if(phase==='playing')phase='paused';},
    resume(){if(phase==='paused')phase='playing';},
    update(seconds){
      if(phase!=='playing')return [];
      time=Math.min(DURATION,time+Math.max(0,seconds));const missed=[];
      while(index<ITEMS.length && time>ITEMS[index].target+WINDOW)missed.push(record(null,null));
      if(time>=DURATION)phase='done';return missed;
    },
    choose(action){
      if(phase!=='playing'||!ACTIONS[action]||index>=ITEMS.length)return null;
      const offset=time-ITEMS[index].target;
      if(!timingGrade(offset))return {early:true};
      return record(action,offset);
    },
    snapshot(){return {phase,time,index,combo,maxCombo,results:results.map(x=>({...x})),item:index<ITEMS.length?{...ITEMS[index]}:null,
      score:results.reduce((s,r)=>s+r.points,0),correct:results.filter(r=>r.correct).length,ruleUpdated:time>=15};}
  };
}

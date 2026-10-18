/* 03:17 — ON CALL / non-public prototype. No real systems are scanned. */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const safe = (input) => String(input).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const stages = [
    {
      title: '不審な閲覧を検知',
      text: '架空サービス HARBOR の共有機能で、他人の資料を閲覧できる疑いが出ています。最初の30秒、何から始めますか？',
      evidence: ['観測：一般ユーザーが許可外の資料ページへ到達', '未確定：どの範囲まで閲覧されたか'],
      noteTitle: '脆弱性と攻撃は、別のもの。',
      note: '不審なアクセスを止めても、共有機能に権限確認の抜けが残っていれば、別の経路から同じ問題が再発する可能性があります。',
      actions: [
        {id:'inspect', icon:'⌕',title:'アクセスログを調査',desc:'事実と影響範囲を確かめる。攻撃は進行する',time:17},
        {id:'contain',icon:'⊘',title:'共有機能を一時停止',desc:'追加被害を抑えるが、正規利用にも影響',time:13},
        {id:'block',icon:'⊞',title:'怪しい接続元を遮断',desc:'目の前の通信だけ止める応急処置',time:9}
      ]
    },
    {
      title: '原因を修正する',
      text: '調査により、資料のIDだけで閲覧できてしまう設計が疑われています。見た目の修正ではなく、本当に直すべき場所は？',
      evidence: ['確認対象：/documents/:id の閲覧権限', '問題：ログイン状態と資料ごとの閲覧許可は別'],
      noteTitle: '認証と認可は違う。',
      note: '「誰なのか」を確かめるのが認証。「その資料を見てよいか」を確認するのが認可です。URLやボタンを隠すだけでは認可の代わりになりません。',
      actions: [
        {id:'patch',icon:'⬡',title:'サーバー側で閲覧権限を確認',desc:'資料の所有者・共有先をサーバー側で照合',time:25},
        {id:'hide',icon:'◌',title:'共有リンクを画面から隠す',desc:'画面は変わるが、裏側のAPIは変わらない',time:8},
        {id:'ratelimit',icon:'≋',title:'リクエストに回数制限を追加',desc:'試行頻度を減らすが、認可欠落は残る',time:12}
      ]
    },
    {
      title: '次の機能を公開する？',
      text: 'チームが「管理者向けプレビュー機能」の公開を待っています。新しい機能には新しいアクセス経路が生まれます。どうリリースしますか？',
      evidence: ['変更：管理画面への新しい経路が追加予定', '確認したい：権限のないユーザーを拒否するテスト'],
      noteTitle: '開発は悪ではない。確認を省くのが危険。',
      note: '機能追加そのものが必ず脆弱性を生むわけではありません。安全なリリースには、権限テスト・レビュー・必要なら延期という選択肢があります。',
      actions: [
        {id:'test',icon:'✓',title:'権限テストをしてから公開',desc:'安全確認に時間をかけ、問題時は公開を止める',time:24},
        {id:'rush',icon:'➤',title:'確認を省いて今すぐ公開',desc:'機能は早く届くが、新しいリスクを残す',time:6},
        {id:'postpone',icon:'Ⅱ',title:'公開を延期し、先に問題を解決',desc:'新機能は遅れるが、被害拡大を避ける',time:11}
      ]
    }
  ];
  const nodes = {
    outside:{name:'外部ネットワーク',title:'利用者と不審なアクセス',detail:'正常なユーザーも、疑わしいリクエストも、入口から入ってきます。見た目だけでは区別できません。'},
    gateway:{name:'入口 / GATEWAY',title:'通信の入口',detail:'遮断やレート制限はできても、資料単位の閲覧権限まで保証することはできません。'},
    web:{name:'Webサーバー',title:'画面とAPIの処理',detail:'フロントエンドでボタンを隠しても、APIへの直接リクエストを必ずしも防げません。'},
    auth:{name:'認証 / IDENTITY',title:'利用者の本人確認',detail:'ログインに成功しただけでは、他人の資料へのアクセスが許可されたことにはなりません。'},
    share:{name:'共有機能 / SHARING',title:'資料ごとの閲覧権限が不足している疑い',detail:'本シナリオの根本原因は、資料ごとのアクセス許可をサーバーで確認していないことです。'},
    database:{name:'データ保管庫 / STORE',title:'資料を保存する場所',detail:'大事なのは、アクセスを要求した人にその資料を見せてよいかどうかを、適切な箇所で確認することです。'},
    preview:{name:'新機能 / ADMIN PREVIEW',title:'リリース待ちの管理プレビュー',detail:'新しい経路が増えるため、一般ユーザーからのアクセスを拒否するテストが必要です。'}
  };
  let game = null;
  let timer = null;
  let toastTimer = null;
  let apiStatus = 'standalone';
  let pendingAction = null;
  const shownScreen = (screen) => {
    for (const name of ['intro','game','report']) $(name+'-screen').classList.toggle('hidden', name !== screen);
    window.scrollTo({top:0, behavior:'auto'});
  };
  const gameTime = () => {
    if (!game) return '03:17';
    const m = 17 + Math.floor(game.elapsed / 60);
    const s = game.elapsed % 60;
    return `03:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  };
  const formatTime = (seconds) => `${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
  const notify = (message) => {
    document.querySelector('.ui-toast')?.remove();
    clearTimeout(toastTimer);
    const el = document.createElement('div');
    el.className = 'ui-toast'; el.role = 'status'; el.textContent = message;
    document.body.appendChild(el); toastTimer = setTimeout(() => el.remove(), 3200);
  };
  function makeGame(training){
    return {training, stage:0, elapsed:0, remaining:120, service:100, exposed:0, threat:25,
      contained:false, investigated:false, blocked:false, patched:false, cosmetic:false, rateLimited:false,
      tested:false, rushed:false, postponed:false, technicalDebt:1, timeout:false, completed:false,
      log:[{when:'03:17:00',text:'<strong>着信を受理。</strong>共有機能で不審な閲覧を検知しました。'}], history:[], node:'share'};
  }
  function startGame(training=false){
    clearInterval(timer);
    game = makeGame(training); pendingAction = null;
    $('custom-text').value=''; $('custom-result').classList.add('hidden');
    shownScreen('game');
    renderAll();
    if(!training) timer = setInterval(tick,1000);
  }
  function tick(){
    if(!game || game.completed || game.training) return;
    game.remaining--;
    game.elapsed++;
    if(game.elapsed%7===0){
      if(!game.patched){
        game.threat=clamp(game.threat+(game.contained?2:5),0,100);
        if(game.threat>=63 && !game.contained) game.exposed=clamp(game.exposed+3,0,100);
      } else game.threat=clamp(game.threat-3,0,100);
    }
    renderHUD();
    if(game.remaining<=0){ game.timeout=true; endGame(); }
  }
  function spend(amount){
    game.elapsed+=amount;
    if(!game.training) game.remaining=Math.max(0,game.remaining-amount);
    if(!game.patched && !game.contained){
      game.threat=clamp(game.threat+Math.round(amount/4),0,100);
      if(game.threat>62) game.exposed=clamp(game.exposed+Math.round(amount/7),0,100);
    }
  }
  function writeLog(html){
    game.log.unshift({when:gameTime(),text:html});
    if(game.log.length>6)game.log.length=6;
  }
  function performAction(id){
    if(!game || game.completed)return;
    const stage=stages[game.stage];
    const action=stage.actions.find((a)=>a.id===id);
    if(!action)return;
    let result='',risk=false;
    spend(action.time);
    switch(id){
      case 'inspect':game.investigated=true;game.threat=clamp(game.threat+5,0,100);result='閲覧ログで、許可されていない資料へのアクセスを確認。ただし調査中も不審なアクセスは続きました。';break;
      case 'contain':game.contained=true;game.service=clamp(game.service-12,0,100);game.threat=clamp(game.threat-18,0,100);result='共有機能を一時停止。追加のアクセスを抑制しましたが、正規利用者も共有機能を使えません。';break;
      case 'block':game.blocked=true;game.threat=clamp(game.threat+12,0,100);risk=true;result='特定の接続元を遮断。しかし別の接続元から再試行され、根本原因は残っています。';break;
      case 'patch':game.patched=true;game.technicalDebt=Math.max(0,game.technicalDebt-1);game.threat=clamp(game.threat-42,0,100);if(game.contained)game.service=clamp(game.service+9,0,100);result='サーバー側の資料単位の認可チェックを追加しました。今回の侵入経路に対処できました。';break;
      case 'hide':game.cosmetic=true;game.technicalDebt++;game.threat=clamp(game.threat+24,0,100);game.exposed=clamp(game.exposed+13,0,100);risk=true;result='共有リンクは非表示になりましたが、API経由ではアクセスが続きました。問題が再発しています。';break;
      case 'ratelimit':game.rateLimited=true;game.technicalDebt++;game.threat=clamp(game.threat-9,0,100);risk=true;result='リクエスト頻度は抑えました。ただし、権限チェックの欠落は未解決です。';break;
      case 'test':game.tested=true;if(game.patched){game.threat=clamp(game.threat-14,0,100);result='権限テストに成功し、プレビュー機能を安全に公開できました。';}else{game.postponed=true;game.threat=clamp(game.threat-5,0,100);result='権限テストで問題を発見。公開を取りやめましたが、共有機能の根本問題は残っています。';}break;
      case 'rush':game.rushed=true;game.technicalDebt++;game.threat=clamp(game.threat+30,0,100);game.exposed=clamp(game.exposed+12,0,100);risk=true;result='テストを省いて新機能を公開。管理プレビューの権限不備という新たなリスクが加わりました。';break;
      case 'postpone':game.postponed=true;game.threat=clamp(game.threat-6,0,100);result='公開を延期。機能提供は遅れますが、不確実なまま新しい経路を開かずに済みました。';break;
    }
    if(!game.patched && !game.contained && (id==='hide'||id==='rush'))game.exposed=clamp(game.exposed+7,0,100);
    game.history.push({phase:game.stage,action:action.title,effect:result,risk,time:gameTime(),id});
    writeLog(`<strong>${safe(action.title)}</strong> — ${safe(result)}`);
    game.stage++;
    pendingAction=null;
    $('custom-result').classList.add('hidden');$('custom-text').value='';
    if(game.stage>=stages.length || game.remaining<=0){if(game.remaining<=0)game.timeout=true;endGame();return;}
    game.node=game.stage===2?'preview':'share';
    renderAll();
    notify(risk?'この対処だけでは危険が残ります。':'対応を記録しました。次の局面に進みます。');
  }
  function renderHUD(){
    if(!game)return;
    $('hud-time').textContent=game.training?'∞':formatTime(game.remaining);
    $('hud-timer-fill').style.width=game.training?'100%':`${game.remaining/120*100}%`;
    $('hud-timer-fill').style.background=game.remaining<30?'var(--rose)':'var(--mint)';
    $('hud-uptime').innerHTML=`${Math.round(game.service)}<span>%</span>`;
    $('hud-data').innerHTML=`${Math.round(game.exposed)}<span>%</span>`;
    $('hud-threat').innerHTML=`${Math.round(game.threat)}<span>%</span>`;
    $('game-mode-chip').textContent=game.training?'STUDY / NO TIMER':'STANDARD / 120 SEC';
    const stamp=$('map-status');
    stamp.className='status-badge '+(game.patched?'status-safe':game.contained?'status-warn':'status-danger');
    stamp.textContent=game.patched?'認可チェック修正済':game.contained?'共有機能を停止中':'問題発生中';
    $('threat-caption').textContent=game.patched?'侵入経路を封鎖':game.threat>68?'不正アクセスが進行':'経路を調査中';
    $('uptime-caption').textContent=game.service<95?'一部機能を制限中':'サービス稼働中';
    $('data-caption').textContent='影響度（演習用の架空値）';
  }
  function renderMap(){
    const risk=document.querySelector('[data-node="share"]');
    risk.classList.toggle('patched',game.patched);
    risk.classList.toggle('node-risk',!game.patched);
    document.querySelector('.node-alert').setAttribute('visibility',game.patched?'hidden':'visible');
    document.querySelector('[data-node="preview"]').classList.toggle('revealed',game.stage===2||game.rushed||game.tested||game.postponed);
    document.querySelector('[data-node="preview"]').classList.toggle('alerting',game.rushed);
    document.querySelectorAll('[data-node]').forEach((el)=>{const selected=el.dataset.node===game.node;el.classList.toggle('active',selected);el.setAttribute('aria-pressed',selected?'true':'false');});
    $('attack-dot').setAttribute('opacity',game.patched?'.15':'1');
    const n=nodes[game.node];
    $('node-inspector').innerHTML=`<div><span class="inspector-kicker">SELECTED NODE / ${safe(n.name)}</span><strong>${safe(n.title)}</strong></div><span class="inspector-right">${safe(n.detail)}</span>`;
  }
  function renderTimeline(){
    $('game-timeline').innerHTML=game.log.map(item=>`<div class="timeline-event"><time>${safe(item.when)}</time><span>${item.text}</span></div>`).join('');
  }
  function renderStage(){
    const stage=stages[game.stage];
    $('incident-title').textContent=stage.title;
    $('stage-number').textContent=`/ PHASE 0${game.stage+1}`;
    $('incident-description').textContent=stage.text;
    $('incident-evidence').innerHTML=stage.evidence.map(line=>`<span>◈ ${safe(line)}</span>`).join('');
    $('action-count').textContent=`STEP ${game.stage+1} / 3`;
    $('lesson-title').textContent=stage.noteTitle;
    $('lesson-content').textContent=stage.note;
    $('phase-tracker').innerHTML=['01  初動','02  原因修正','03  リリース'].map((label,i)=>`<div class="phase ${i===game.stage?'current':i<game.stage?'done':''}">${i<game.stage?'✓ ':''}${label}</div>`).join('');
    $('action-cards').innerHTML=stage.actions.map((a)=>`<button class="action-btn" type="button" data-action="${a.id}" aria-label="${safe(a.title)}"><span class="action-icon">${safe(a.icon)}</span><span class="action-text"><b>${safe(a.title)}</b><small>${safe(a.desc)}</small></span><span class="action-time">${a.time} sec</span></button>`).join('');
    $('custom-text').placeholder=game.stage===0?'例：まず共有機能を止めて被害を抑える':game.stage===1?'例：サーバー側で資料の閲覧権限を確認する':'例：公開前に権限テストを実行したい';
  }
  function renderAll(){renderHUD();renderMap();renderTimeline();renderStage();}
  function selectNode(name){if(!game||game.completed||!nodes[name])return;game.node=name;renderMap();}
  function grade(){
    const protection=clamp(100-game.exposed,0,100), uptime=clamp(game.service,0,100);
    const strategy=game.patched?100:10, release=game.tested||game.postponed?100:12;
    const score=Math.round(.42*protection+.23*uptime+.25*strategy+.10*release-(game.rushed?12:0));
    return {score,grade:score>=86?'A':score>=66?'B':score>=46?'C':'D',protection,uptime};
  }
  function endGame(){
    if(!game||game.completed)return;
    game.completed=true;clearInterval(timer);
    const result=grade();
    $('report-grade').textContent=result.grade;
    $('report-grade-desc').textContent=game.timeout?'時間切れ：途中までの対応を記録':game.patched?'原因に対処できました':'根本的な問題が残っています';
    $('report-protection').textContent=`${Math.round(result.protection)}%`;
    $('report-service').textContent=`${Math.round(result.uptime)}%`;
    $('report-fix').textContent=game.patched?'実施':'未実施';
    $('report-timeline').innerHTML=game.history.length?game.history.map((item)=>`<article class="report-list-item ${item.risk?'is-risk':''}"><time>PHASE 0${item.phase+1} / ${safe(item.time)}</time><h3>${safe(item.action)}</h3><p>${safe(item.effect)}</p></article>`).join(''):'<p>意思決定を行う前に時間切れとなりました。</p>';
    const takeaways=[];
    if(game.patched)takeaways.push('資料を表示する前に、サーバー側で閲覧権限を確認することが有効です。');
    else takeaways.push('画面上のリンク非表示や接続元の遮断だけでは、サーバー側の認可欠落は解消しません。');
    if(game.contained)takeaways.push('機能の一時停止は被害拡大を抑えますが、正規利用者への影響も発生します。');
    else takeaways.push('影響が分からないときは、初動でログ確認や一時的な制限を検討します。');
    if(game.rushed)takeaways.push('検証せずに新経路を公開すると、新たなリスクを持ち込む可能性があります。');
    else takeaways.push('リリース前の権限テストや延期は、状況に応じた適切な選択です。');
    $('report-takeaways').innerHTML=`<ul>${takeaways.map(t=>`<li>${safe(t)}</li>`).join('')}</ul>`;
    $('report-conclusion').textContent=game.timeout?'今回は時間切れです。次回は最初に被害を抑える方法と、根本原因を直す方法を考えてみましょう。':game.patched?'今回のシナリオでは根本原因に対処しました。ただし、実運用では追加テスト・監視・影響調査が必要です。':'今回のシナリオではアクセス制御の問題が残っています。次回は「サーバー側で誰がどの資料を見られるか」を確認してみましょう。';
    shownScreen('report');
  }
  const responseMap = [
    {investigate:'inspect',contain:'contain',monitor:'block'},
    {root_fix:'patch',cosmetic:'hide',rate_limit:'ratelimit'},
    {test:'test',rush:'rush',postpone:'postpone'}
  ];
  function offlineClassify(text){
    const matches=[];
    const tests=[
      ['root_fix',/権限|認可|認証.*閲覧|所有者|共有先|サーバー側|サーバ側|権利|authorization/i],
      ['cosmetic',/隠す|非表示|表示を消す|リンクを消す|UIだけ|ボタンを消す/i],
      ['rate_limit',/レート|回数制限|頻度制限|リクエスト制限/i],
      ['investigate',/ログ|調査|証拠|原因を調べ|監査/i],
      ['contain',/一時停止|サービス停止|共有機能を止|一時遮断|機能を閉じ|機能停止/i],
      ['monitor',/IP|接続元|通信を遮断|不審なアクセスを遮断/i],
      ['test',/テスト|試験|検証|CI|レビュー|チェックしてから/i],
      ['postpone',/延期|見送|保留|公開しない/i],
      ['rush',/すぐ公開|今すぐ公開|急いで公開|そのまま公開|テストせず公開/i]
    ];
    for(const [kind,regex] of tests)if(regex.test(text))matches.push(kind);
    return {category:matches.length===1?matches[0]:'unknown',mode:'offline',confidence:null};
  }
  async function evaluateText(){
    if(!game||game.completed)return;
    const text=$('custom-text').value.trim();
    const div=$('custom-result');div.className='custom-result';pendingAction=null;
    if(text.length<7||text.length>300){div.classList.add('error');div.textContent='7〜300文字で、具体的な対処案を入力してください。';return;}
    const btn=$('evaluate-btn');btn.disabled=true;btn.textContent='判定中…';
    let result=null;
    if(window.location.protocol==='http:'||window.location.protocol==='https:'){
      const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),9000);
      try{
        const response=await fetch('/api/evaluate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text,stage:game.stage}),signal:controller.signal});
        if(!response.ok)throw Error('server error');
        result=await response.json();
      }catch(_e){result={...offlineClassify(text),mode:'offline-fallback'};}
      finally{clearTimeout(timeout);}
    }else result=offlineClassify(text);
    btn.disabled=false;btn.textContent='対処案を判定 ↗';
    if(!game||game.completed)return;
    const source=result.mode==='live'?'Decisions APIで分類':result.mode==='offline-fallback'?'通信失敗 → ローカル判定（AI未使用）':'ローカルデモ判定（AI未使用）';
    const category=result.category;
    const actionId=responseMap[game.stage][category];
    if(!actionId){
      div.classList.add('error');
      div.innerHTML=`<strong>${safe(source)}</strong><div>この局面で実行する対処を特定できませんでした。1つの操作を具体的に書くか、上の選択肢を使ってください。</div>`;
      return;
    }
    const action=stages[game.stage].actions.find(a=>a.id===actionId);
    pendingAction={id:actionId,stage:game.stage};
    div.innerHTML=`<strong>${safe(source)}</strong><div>「${safe(action.title)}」として解釈しました。${safe(action.desc)}。</div><div class="result-actions"><button class="button button-primary" type="button" id="confirm-custom">この対応を実行</button><button class="button button-outline" type="button" id="cancel-custom">取り消す</button></div>`;
    $('confirm-custom').addEventListener('click',()=>{if(pendingAction && pendingAction.stage===game.stage)performAction(pendingAction.id);});
    $('cancel-custom').addEventListener('click',()=>{pendingAction=null;div.classList.add('hidden');});
  }
  async function loadStatus(){
    if(window.location.protocol!=='http:'&&window.location.protocol!=='https:')return;
    try{
      const response=await fetch('/api/status',{cache:'no-store'});
      if(!response.ok)return;
      const status=await response.json();
      apiStatus=status.mode==='live'?'live':'offline';
      $('engine-chip').textContent=apiStatus==='live'?'Decisions API 利用可能':'ローカルデモ判定';
    }catch(_){apiStatus='standalone';}
  }
  function showHelp(){const dialog=$('help-dialog');if(!dialog.open)dialog.showModal();}
  $('start-btn').addEventListener('click',()=>startGame(false));
  $('practice-btn').addEventListener('click',()=>startGame(true));
  $('restart-btn').addEventListener('click',()=>startGame(false));
  $('report-print').addEventListener('click',()=>window.print());
  $('evaluate-btn').addEventListener('click',evaluateText);
  $('custom-text').addEventListener('input',()=>{$('custom-result').classList.add('hidden');pendingAction=null;});
  $('action-cards').addEventListener('click',event=>{const button=event.target.closest('button[data-action]');if(button)performAction(button.dataset.action);});
  document.querySelectorAll('[data-node]').forEach(node=>{
    node.addEventListener('click',()=>selectNode(node.dataset.node));
    node.addEventListener('keydown',(event)=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();selectNode(node.dataset.node);}});
  });
  $('help-btn').addEventListener('click',showHelp);$('lesson-help').addEventListener('click',showHelp);
  $('close-help').addEventListener('click',()=>$('help-dialog').close());
  $('brand-home').addEventListener('click',(event)=>{event.preventDefault();if(game&&!game.completed&&!window.confirm('対応中のゲームを終了してタイトルに戻りますか？'))return;clearInterval(timer);game=null;shownScreen('intro');});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&game&&!game.training&&!game.completed)clearInterval(timer);else if(!document.hidden&&game&&!game.training&&!game.completed){clearInterval(timer);timer=setInterval(tick,1000);}});
  loadStatus();
  window.__oncallTesting={ // local smoke-test hook; not used by the game itself
    start:startGame,getState:()=>game?JSON.parse(JSON.stringify(game)):null,act:performAction,offlineClassify
  };
})();

import { COLORS, SHAPES } from './engine.mjs';

// Only game facts: no identity, browser history, or device data.
export function buildCoachingReport(s) {
  const color = id => COLORS.find(v => v.id === id)?.name || id;
  const shape = id => SHAPES.find(v => v.id === id)?.name || id;
  const round = n => Math.round(n);
  const fraction = n => ((n % 1) + 1) % 1;
  const learned = s.player.periodMs !== null;
  const tempo = learned ? Math.abs(s.player.periodMs - s.target.periodMs) / s.target.periodMs : null;
  const delta = learned ? Math.abs(fraction((s.elapsedMs - s.player.anchorMs) / s.player.periodMs) - fraction((s.elapsedMs - s.target.anchorMs) / s.target.periodMs)) : null;
  const phase = learned ? Math.min(delta, 1 - delta) : null;
  const mismatch = ['color', 'shape', 'rhythm'].filter(k => !s.match[k]).map(k => ({color:'色',shape:'形',rhythm:'リズム'})[k]);
  const metadata = {
    moment: `${s.phase}; ${(s.elapsedMs / 1000).toFixed(1)}秒; 疑われ度${round(s.suspicion)}%; 環境${s.environment.index + 1}`,
    target: `${color(s.target.color)} / ${shape(s.target.shape)} / ${s.target.periodMs}ms周期`,
    player: `${color(s.player.color)} / ${shape(s.player.shape)} / ${learned ? `${s.player.periodMs}ms周期` : 'リズム未学習'}`,
    rhythm: learned ? `周期誤差${(tempo * 100).toFixed(1)}%; 位相差${(phase * 100).toFixed(1)}%周期; 判定${s.match.rhythm ? '一致' : '不一致'}` : '未学習。足元の光に合わせて2回タップが必要',
    scan: `${s.scan.active ? 'スキャン中' : `次まで${Math.max(0,s.scan.nextInMs / 1000).toFixed(1)}秒`}; 通過${s.scansSurvived}回; 不一致:${mismatch.join('・') || 'なし'}`,
    exposure: `スキャン中の不一致累計: 色${round(s.stats.colorMismatchMs)}ms / 形${round(s.stats.shapeMismatchMs)}ms / リズム${round(s.stats.rhythmMismatchMs)}ms`,
  };
  const text = ['MIMIC プレイ相談（この瞬間の記録）', ...Object.entries(metadata).map(([key,value]) => `${key}: ${value}`),
    'ルール: 90秒生存で成功。スキャン中の不一致で疑われ度が上がり、100%で失敗。一致すると回復。色4種・形3種。リズムは2タップで周期と位相を覚え自動継続。周期誤差18%以内かつ位相差20%周期以内で一致。',
    'この記録から、次に直す操作を優先順に最大3つ、日本語で教えて。これはゲームであり実際のセキュリティ診断ではない。記録にない過去の操作は推測と明記して。'].join('\n');
  return { metadata, text, mismatch };
}

export function installCoaching({ game, pauseGame, openDialog, dialog }) {
  const $ = id => document.getElementById(id);
  let report;
  function capture() {
    // Capture before pausing so the record retains the original game phase.
    report = buildCoachingReport(game.snapshot());
    pauseGame();
    $('coachReport').textContent = report.text;
    $('coachReport').setAttribute('oai-annotation-metadata', JSON.stringify(report.metadata));
    $('coachStatus').textContent = '';
    const supported = typeof document.oai?.annotation?.request === 'function';
    $('askCoach').hidden = !supported;
    $('coachAvailability').textContent = supported
      ? 'このブラウザはChatGPTへの相談に対応しています。記録を確認してから送信できます。'
      : 'このブラウザでは直接の相談は利用できません。記録をコピーしてChatGPTに貼り付けてください。';
    openDialog(dialog);
  }
  $('coachButton').addEventListener('click', capture);
  $('resultCoach').addEventListener('click', capture);
  $('askCoach').addEventListener('click', () => {
    const api = document.oai?.annotation;
    if (typeof api?.request !== 'function') return;
    try {
      const result = api.request($('coachReport'), {
        metadata: report.metadata,
        initialComment: 'このMIMICのプレイ記録から、次に直す操作を優先順に3つ教えて。リズムは周期と位相の違いも説明して。',
      });
      $('coachStatus').textContent = result?.accepted
        ? '相談のリクエストを受け付けました。注釈画面で内容を確認し、自分で送信してください。'
        : '相談画面を開けませんでした。記録のコピーを使うか、ブラウザの注釈設定を確認してください。';
    } catch {
      $('coachStatus').textContent = '直接の相談を利用できません。記録をコピーして相談できます。';
    }
  });
  $('copyCoach').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(report.text);
      $('coachStatus').textContent = 'コピーしました。ChatGPTに貼り付けて相談できます。';
    } catch {
      const range = document.createRange();
      range.selectNodeContents($('coachReport'));
      const selection = window.getSelection();
      selection.removeAllRanges(); selection.addRange(range);
      $('coachStatus').textContent = '自動コピーを利用できません。選択された記録を手動でコピーしてください。';
    }
  });
}

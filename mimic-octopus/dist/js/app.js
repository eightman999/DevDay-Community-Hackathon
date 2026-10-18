import { createGame, COLORS, SHAPES } from './engine.mjs';
import { installCoaching } from './coaching.mjs';

const $ = (id) => document.getElementById(id);
const game = createGame();
const shell = $('gameShell');
const colorButtons = new Map();
const shapeButtons = new Map();
const dots = [...document.querySelectorAll('.beat-dots i')];
const dialogs = [$('helpDialog'), $('conceptDialog'), $('coachDialog')];
const rhythmCard = document.querySelector('.rhythm-card');
const scanCell = document.querySelector('.scan-cell');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const storeKey = 'mimic-octopus.best.v1';
let scene = null;
let lastFrame = null;
let previousPhase = 'ready';
let previousEnvironment = -1;
let previousScanCount = 0;
let lastTargetBeat = null;
let bannerUntil = 0;
let dialogPausedGame = false;
let buttonReleaseTimer = null;
let best = 0;
let audio = null;
const activeVoices = new Set();
let soundEnabled = false;
let frameHandle = 0;
let lastHudUpdate = -Infinity;
let uiSnapshot = game.snapshot();

try { best = Math.max(0, Number(localStorage.getItem(storeKey)) || 0); } catch { /* Storage is optional. */ }
$('bestScore').textContent = best ? `BEST ${best.toLocaleString()}` : 'BEST —';

function releaseVoice(voice) {
  if (!activeVoices.delete(voice)) return;
  voice.oscillator.onended = null;
  voice.oscillator.disconnect();
  voice.gain.disconnect();
}

function stopAllTones() {
  for (const voice of [...activeVoices]) {
    try { voice.oscillator.stop(); } catch { /* An already-ended voice is still safe to release. */ }
    releaseVoice(voice);
  }
}

function tone(frequency, duration = 0.075, volume = 0.035, offset = 0) {
  if (!soundEnabled || !audio || audio.state !== 'running') return;
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  const start = audio.currentTime + offset;
  oscillator.type = 'sine';
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(volume, start + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain);
  gain.connect(audio.destination);
  const voice = { oscillator, gain };
  activeVoices.add(voice);
  oscillator.onended = () => releaseVoice(voice);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.01);
}

async function activateAudio() {
  if (!soundEnabled) return;
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) throw new Error('Audio unavailable');
    audio ||= new AudioContextClass();
    if (audio.state !== 'running') await audio.resume();
  } catch {
    soundEnabled = false;
    updateSoundButton();
  }
}

function updateSoundButton() {
  $('soundButton').setAttribute('aria-pressed', String(soundEnabled));
  $('soundButton').setAttribute('aria-label', `サウンドを${soundEnabled ? 'オフ' : 'オン'}にする`);
  $('soundWaves').setAttribute('d', soundEnabled ? 'M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14' : 'm16 9 5 6m0-6-5 6');
}

$('soundButton').addEventListener('click', async () => {
  soundEnabled = !soundEnabled;
  updateSoundButton();
  if (soundEnabled) { await activateAudio(); tone(660); }
  else {
    stopAllTones();
    if (audio?.state === 'running') void audio.suspend();
  }
});

for (const color of COLORS) {
  const button = document.createElement('button');
  button.className = 'color-choice';
  button.style.setProperty('--swatch', color.hex);
  button.setAttribute('aria-label', `色を${color.name}にする`);
  button.title = color.name;
  button.disabled = true;
  button.addEventListener('click', () => selectColor(color.id));
  $('colorChoices').append(button);
  colorButtons.set(color.id, button);
}

for (const shape of SHAPES) {
  const button = document.createElement('button');
  button.className = 'shape-choice';
  button.setAttribute('aria-label', `形を${shape.name}にする`);
  button.title = shape.name;
  button.disabled = true;
  const icon = document.createElement('span');
  icon.className = `shape-icon ${shape.id}`;
  icon.setAttribute('aria-hidden', 'true');
  button.append(icon);
  button.addEventListener('click', (event) => {
    if (performance.now() < suppressShapeClickUntil) { event.preventDefault(); return; }
    selectShape(shape.id);
  });
  $('shapeChoices').append(button);
  shapeButtons.set(shape.id, button);
}

function selectColor(id) {
  if (game.setColor(id)) { tone(420, 0.055, 0.025); paintHud(game.snapshot(), true); }
}

function selectShape(id) {
  if (game.setShape(id)) { tone(520, 0.055, 0.025); paintHud(game.snapshot(), true); }
}

function cycleShape(direction) {
  const index = SHAPES.findIndex(({ id }) => id === game.snapshot().player.shape);
  selectShape(SHAPES[(index + direction + SHAPES.length) % SHAPES.length].id);
}

let swipeStart = null;
let suppressShapeClickUntil = 0;
$('shapeChoices').addEventListener('pointerdown', (event) => {
  if (game.snapshot().phase !== 'playing') return;
  swipeStart = { x: event.clientX, y: event.clientY, id: event.pointerId };
});
$('shapeChoices').addEventListener('pointerup', (event) => {
  if (!swipeStart || swipeStart.id !== event.pointerId) return;
  const dx = event.clientX - swipeStart.x;
  const dy = event.clientY - swipeStart.y;
  swipeStart = null;
  if (Math.abs(dx) >= 28 && Math.abs(dx) > Math.abs(dy) * 1.4) {
    suppressShapeClickUntil = performance.now() + 300;
    cycleShape(dx > 0 ? 1 : -1);
  }
});
$('shapeChoices').addEventListener('pointercancel', () => { swipeStart = null; });

function tapRhythm() {
  if (game.snapshot().phase !== 'playing') return;
  game.tap();
  tone(880, 0.045, 0.035);
  $('tapButton').classList.add('pressed');
  clearTimeout(buttonReleaseTimer);
  buttonReleaseTimer = setTimeout(() => $('tapButton').classList.remove('pressed'), 90);
  paintHud(game.snapshot(), true);
}

// Pointer-down keeps the learned phase aligned with the actual touch, not release.
$('tapButton').addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  event.preventDefault();
  tapRhythm();
});
$('tapButton').addEventListener('click', (event) => {
  // Keyboard and assistive technology activate a button with a zero-detail click.
  if (event.detail === 0) tapRhythm();
});

function startGame() {
  if (!scene) return;
  stopAllTones();
  void activateAudio();
  dialogs.forEach((dialog) => { if (dialog.open) dialog.close(); });
  dialogPausedGame = false;
  previousEnvironment = -1;
  previousScanCount = 0;
  lastTargetBeat = null;
  game.start();
  lastFrame = performance.now();
  paintHud(game.snapshot(), true);
  tone(440, 0.09, 0.035);
  tone(660, 0.1, 0.035, 0.09);
  $('tapButton').focus({ preventScroll: true });
}

function pauseGame() {
  if (game.snapshot().phase !== 'playing') return;
  game.pause();
  stopAllTones();
  if (audio?.state === 'running') void audio.suspend();
  paintHud(game.snapshot(), true);
}

function resumeGame() {
  if (dialogs.some((dialog) => dialog.open)) return;
  game.resume();
  lastFrame = performance.now();
  lastTargetBeat = null;
  void activateAudio();
  paintHud(game.snapshot(), true);
}

function returnToTitle() {
  stopAllTones();
  game.reset();
  previousEnvironment = -1;
  lastTargetBeat = null;
  paintHud(game.snapshot(), true);
  $('startButton').focus({ preventScroll: true });
}

$('startButton').addEventListener('click', startGame);
$('retryButton').addEventListener('click', startGame);
$('restartFromPause').addEventListener('click', startGame);
$('pauseButton').addEventListener('click', pauseGame);
$('resumeButton').addEventListener('click', resumeGame);
$('backButton').addEventListener('click', returnToTitle);
$('reloadButton').addEventListener('click', () => location.reload());

function openDialog(dialog) {
  dialogPausedGame = game.snapshot().phase === 'playing';
  if (dialogPausedGame) pauseGame();
  dialog.showModal();
}

$('helpButton').addEventListener('click', () => openDialog($('helpDialog')));
$('conceptButton').addEventListener('click', () => openDialog($('conceptDialog')));
for (const dialog of dialogs) {
  dialog.querySelectorAll('.close-dialog').forEach((button) => button.addEventListener('click', () => dialog.close()));
  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
  dialog.addEventListener('close', () => {
    if (dialogPausedGame && !document.hidden) { dialogPausedGame = false; resumeGame(); }
  });
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) { dialogPausedGame = false; pauseGame(); }
  lastFrame = performance.now();
});

document.addEventListener('keydown', (event) => {
  if (event.ctrlKey || event.metaKey || event.altKey || dialogs.some((dialog) => dialog.open)) return;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)) return;
  const phase = game.snapshot().phase;
  if (event.repeat) {
    if (phase === 'playing' && ['Space', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
    return;
  }
  if (event.code === 'Escape' || event.code === 'KeyP') {
    if (phase === 'playing') pauseGame(); else if (phase === 'paused') resumeGame();
    event.preventDefault();
    return;
  }
  if (phase !== 'playing') return;
  const colorIndex = ['KeyQ', 'KeyW', 'KeyE', 'KeyR'].indexOf(event.code);
  if (colorIndex >= 0) { event.preventDefault(); selectColor(COLORS[colorIndex].id); }
  else if (event.code === 'ArrowLeft' || event.code === 'KeyA') { event.preventDefault(); cycleShape(-1); }
  else if (event.code === 'ArrowRight' || event.code === 'KeyD') { event.preventDefault(); cycleShape(1); }
  else if (event.code === 'Space') { event.preventDefault(); tapRhythm(); }
});

function renderResult(state) {
  const won = state.phase === 'won';
  document.querySelector('.result-card').classList.toggle('lost', !won);
  $('resultKicker').textContent = won ? 'MISSION COMPLETE' : 'IDENTITY REVEALED';
  $('resultRank').textContent = state.result.rank;
  $('resultTitle').textContent = won ? 'うまく、まぎれた。' : 'タコだと、ばれた。';
  $('resultDescription').textContent = won ? '90秒の潜伏に成功。きみはもう、街の一員。' : '一度深呼吸。次は、もっと自然にまねられる。';
  $('resultTime').replaceChildren(document.createTextNode((state.elapsedMs / 1000).toFixed(won ? 0 : 1)), Object.assign(document.createElement('small'), { textContent: '秒' }));
  $('resultScans').replaceChildren(document.createTextNode(String(state.scansSurvived)), Object.assign(document.createElement('small'), { textContent: '回' }));
  $('resultScore').textContent = Math.round(state.score).toLocaleString();
  const lessons = {
    color: '色の変化に気をつけて。周りが変わったら、スキャンの前に色を選び直そう。',
    shape: '形の変化に気をつけて。まる・しかく・ながいを見分けて、スワイプしよう。',
    rhythm: 'リズムがヒント。周りの足元が光る瞬間に2回タップ。覚えたら、自動で続く。',
    none: '完璧な擬態！ 色も、形も、リズムも、ちゃんと街に溶け込めた。',
  };
  $('resultLesson').textContent = lessons[state.result.dominantMismatch] || lessons.rhythm;
  if (state.score > best) {
    best = Math.round(state.score);
    try { localStorage.setItem(storeKey, String(best)); } catch { /* A blocked store must not affect play. */ }
    $('bestScore').textContent = `BEST ${best.toLocaleString()}`;
  }
  tone(won ? 660 : 260, 0.17, 0.035);
  if (won) { tone(880, 0.16, 0.035, 0.13); tone(1100, 0.2, 0.035, 0.26); }
  $('retryButton').focus({ preventScroll: true });
}

const traitNames = { color: '色', shape: '形', rhythm: 'リズム' };

function paintHud(state, force = false) {
  uiSnapshot = state;
  const phaseChanged = state.phase !== previousPhase;
  const playing = state.phase === 'playing';
  const ready = state.phase === 'ready';
  const finished = state.phase === 'won' || state.phase === 'lost';
  if (phaseChanged || force) {
    shell.dataset.phase = state.phase;
    $('introCard').classList.toggle('hidden', !ready);
    $('pauseOverlay').classList.toggle('hidden', state.phase !== 'paused');
    $('resultOverlay').classList.toggle('hidden', !finished);
    $('pauseButton').disabled = !playing;
    $('tapButton').disabled = !playing;
    for (const button of [...colorButtons.values(), ...shapeButtons.values()]) button.disabled = !playing;
    $('worldStatus').classList.toggle('hidden', ready || finished);
    if (phaseChanged && finished) renderResult(state);
    if (phaseChanged && state.phase === 'paused') $('resumeButton').focus({ preventScroll: true });
  }
  previousPhase = state.phase;

  if (playing && state.environment.index !== previousEnvironment) {
    const initial = state.environment.index === 0;
    $('eventTitle').textContent = initial ? 'まずは、リズムを覚えよう。' : state.environment.label;
    $('eventDetail').textContent = initial ? '周りの足元が光る瞬間に、2回タップ。' : `${state.environment.changes.map((key) => traitNames[key]).join('・')}が変わった！ 周りに合わせ直そう。`;
    bannerUntil = state.elapsedMs + (initial ? 4400 : 2700);
    previousEnvironment = state.environment.index;
    if (!initial) { tone(620, 0.08, 0.035); tone(930, 0.1, 0.035, 0.08); }
  }
  $('eventBanner').classList.toggle('show', playing && state.elapsedMs < bannerUntil);

  if (state.scansSurvived > previousScanCount) {
    if (playing) { tone(700, 0.07, 0.025); tone(1050, 0.09, 0.025, 0.07); }
    previousScanCount = state.scansSurvived;
  }

  const seconds = Math.ceil(state.remainingMs / 1000);
  $('timeValue').textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  const suspicion = Math.round(state.suspicion);
  $('suspicionValue').replaceChildren(document.createTextNode(String(suspicion)), Object.assign(document.createElement('small'), { textContent: '%' }));
  $('suspicionMeter').setAttribute('aria-valuenow', String(suspicion));
  $('suspicionFill').style.width = `${state.suspicion}%`;
  $('scoreValue').textContent = String(Math.round(state.score)).padStart(4, '0');
  scanCell.classList.toggle('scanning', state.scan.active);
  scanCell.classList.toggle('warning', !state.scan.active && state.scan.nextInMs > 0 && state.scan.nextInMs < 2000 && playing);
  $('scanCaption').textContent = state.scan.active ? '擬態をチェック中' : '次のスキャン';
  $('scanValue').textContent = ready ? '準備中' : finished ? '終了' : state.scan.active ? 'SCANNING' : state.scan.nextInMs > 0 ? `${(state.scan.nextInMs / 1000).toFixed(1)}s` : '通過完了';

  for (const [id, button] of colorButtons) button.setAttribute('aria-pressed', String(state.player.color === id));
  for (const [id, button] of shapeButtons) button.setAttribute('aria-pressed', String(state.player.shape === id));
  $('selectedColor').textContent = COLORS.find(({ id }) => id === state.player.color)?.name || '';
  $('selectedShape').textContent = SHAPES.find(({ id }) => id === state.player.shape)?.name || '';
  for (const key of ['color', 'shape', 'rhythm']) {
    const chip = $(`match${key[0].toUpperCase()}${key.slice(1)}`);
    chip.classList.toggle('good', state.match[key]);
    chip.setAttribute('aria-label', `${traitNames[key]}：${state.match[key] ? '一致' : '違う'}`);
  }
  const allMatched = state.match.color && state.match.shape && state.match.rhythm;
  $('matchCaption').textContent = allMatched ? '擬態できている' : '周りになじもう';
  $('statusText').textContent = state.phase === 'paused' ? '時間は止まっています。' : state.scan.active ? (allMatched ? 'スキャン中。うまく、まぎれている。' : '見られている！ 違うところを合わせよう。') : state.player.periodMs === null ? 'まずは、光った瞬間に2回タップ。' : allMatched ? 'まぎれている。その調子。' : `${['color', 'shape', 'rhythm'].filter((key) => !state.match[key]).map((key) => traitNames[key]).join('・')}を合わせ直そう。`;
  $('statusDot').style.background = state.scan.active && !allMatched ? '#ff9d8d' : allMatched ? '#87e4c9' : '#ffd07e';

  $('rhythmMessage').textContent = ready ? '光った瞬間に、2回' : state.rhythm.message;
  $('rhythmDetail').textContent = state.rhythm.pending ? '次の1拍で、もう1回' : state.match.rhythm ? '覚えたリズムで、自動で動いている' : state.player.periodMs === null ? '足元の光と、跳ねる頂点が目印' : '周りの動きを見て、もう一度2回';
  $('tapLabel').textContent = state.rhythm.pending ? '2 / 2' : 'TAP';
  $('tapButton').classList.toggle('listening', state.rhythm.pending);
  $('tapButton').classList.toggle('synced', state.match.rhythm);
  rhythmCard.classList.toggle('good', state.match.rhythm);
  rhythmCard.classList.toggle('off', !state.match.rhythm && state.player.periodMs !== null);
}

function animateRhythm(state) {
  const active = state.phase === 'playing';
  const beatFloat = (state.elapsedMs - state.target.anchorMs) / state.target.periodMs;
  const beatNumber = Math.floor(beatFloat);
  const phase = ((beatFloat % 1) + 1) % 1;
  const glow = Math.exp(-phase * 7);
  $('tapRing').style.setProperty('--beat-scale', active ? String(1 + phase * 0.16) : '1');
  $('tapRing').style.setProperty('--beat-opacity', active ? String(0.12 + glow * 0.88) : '0.4');
  dots.forEach((dot, i) => dot.classList.toggle('lit', active && i === ((beatNumber % 4) + 4) % 4 && phase < 0.28));
  const beatKey = `${state.target.anchorMs}:${state.target.periodMs}:${beatNumber}`;
  if (active && lastTargetBeat !== beatKey) {
    if (lastTargetBeat !== null) tone(state.scan.active ? 600 : 740, 0.055, state.scan.active ? 0.028 : 0.018);
    lastTargetBeat = beatKey;
  }
}

function frame(now) {
  const elapsed = lastFrame === null ? 0 : Math.max(0, now - lastFrame);
  lastFrame = now;
  game.update(elapsed);
  const state = game.snapshot();
  if (now - lastHudUpdate >= 50 || state.phase !== previousPhase || state.environment.index !== previousEnvironment) {
    paintHud(state);
    lastHudUpdate = now;
  }
  animateRhythm(state);
  scene.render(state, Math.min(elapsed / 1000, 0.06), { reducedMotion: reducedMotion.matches });
  frameHandle = requestAnimationFrame(frame);
}

function resizeScene() {
  if (!scene) return;
  const { width, height } = $('world').getBoundingClientRect();
  scene.resize(Math.max(1, width), Math.max(1, height));
}

async function initialize() {
  paintHud(uiSnapshot, true);
  try {
    const { createScene } = await import('./scene.js');
    scene = createScene({ canvas: $('gameCanvas') });
    shell.dataset.renderer = scene.renderer?.kind || 'webgl';
    if (scene.renderer?.kind === 'software') {
      document.querySelector('.bottom-bar > span').textContent = 'まねして、まぎれて、生きのびる。 · 軽量表示';
    }
    resizeScene();
    scene.render(game.snapshot(), 0, { reducedMotion: reducedMotion.matches });
    const observer = new ResizeObserver(resizeScene);
    observer.observe($('world'));
    $('gameCanvas').addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      pauseGame();
      cancelAnimationFrame(frameHandle);
      $('loadError').classList.remove('hidden');
      $('loadErrorText').textContent = '3D描画が中断しました。再読み込みして、もう一度もぐりこもう。';
    });
    $('startButton').disabled = false;
    $('startButtonText').textContent = 'もぐりこむ';
    frameHandle = requestAnimationFrame(frame);
    window.addEventListener('pagehide', () => {
      cancelAnimationFrame(frameHandle);
      observer.disconnect();
      stopAllTones();
      if (audio?.state === 'running') void audio.suspend();
    });
    // A page restored from the back-forward cache keeps its WebGL scene.
    window.addEventListener('pageshow', (event) => {
      if (!event.persisted) return;
      cancelAnimationFrame(frameHandle);
      observer.observe($('world'));
      lastFrame = performance.now();
      pauseGame();
      frameHandle = requestAnimationFrame(frame);
    });
  } catch (error) {
    console.error('MIMIC initialization failed:', error);
    $('introCard').classList.add('hidden');
    $('loadError').classList.remove('hidden');
    $('loadErrorText').textContent = 'このブラウザでは3D描画を開始できませんでした。最新版のSafari・Chromeなどで、再読み込みしてお試しください。';
  }
}

installCoaching({ game, pauseGame, openDialog, dialog: $('coachDialog') });
void initialize();

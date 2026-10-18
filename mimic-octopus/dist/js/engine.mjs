/**
 * Deterministic, DOM-free game rules.
 *
 * Inputs are sampled against a 10 ms simulation clock. Rendering can run at any
 * frame rate, and a suspended tab can safely supply one large elapsed interval.
 */
export const DURATION_MS = 90_000;

export const COLORS = Object.freeze([
  Object.freeze({ id: 'gold', name: 'きいろ', hex: '#F4C96B' }),
  Object.freeze({ id: 'cyan', name: 'あお', hex: '#65C4D6' }),
  Object.freeze({ id: 'violet', name: 'むらさき', hex: '#A798E2' }),
  Object.freeze({ id: 'coral', name: 'ピンク', hex: '#EF9C9B' }),
]);

export const SHAPES = Object.freeze([
  Object.freeze({ id: 'round', name: 'まる' }),
  Object.freeze({ id: 'square', name: 'しかく' }),
  Object.freeze({ id: 'capsule', name: 'ながい' }),
]);

const STEP_MS = 10;
const EPSILON = 1e-7;
const MIN_TAP_INTERVAL_MS = 260;
const MAX_TAP_INTERVAL_MS = 1_800;
const TEMPO_TOLERANCE = 0.18;
const PHASE_TOLERANCE = 0.20;
const RECOVERY_PER_SECOND = 6;
const DAMAGE_PER_SECOND = Object.freeze({ color: 12, shape: 12, rhythm: 14 });
const COLOR_IDS = new Set(COLORS.map(({ id }) => id));
const SHAPE_IDS = new Set(SHAPES.map(({ id }) => id));

// Changes are deliberately authored. The first eight stages alter one or two
// traits; the last update alters all three with time to observe two new beats.
const STAGES = Object.freeze([
  { atMs: 0, color: 'gold', shape: 'square', periodMs: 900,
    label: 'フォルダの街', scanAtMs: 6_200, scanDurationMs: 2_000 },
  { atMs: 10_000, color: 'cyan', shape: 'square', periodMs: 900,
    label: 'カラーテーマ更新', scanAtMs: 14_900, scanDurationMs: 2_000 },
  { atMs: 19_500, color: 'cyan', shape: 'round', periodMs: 600,
    label: 'アイコン一斉変換', scanAtMs: 24_200, scanDurationMs: 2_000 },
  { atMs: 30_500, color: 'violet', shape: 'round', periodMs: 600,
    label: 'テーマがパープルに', scanAtMs: 34_700, scanDurationMs: 2_100 },
  { atMs: 41_000, color: 'violet', shape: 'capsule', periodMs: 1_200,
    label: '通信モードへ', scanAtMs: 45_100, scanDurationMs: 2_200 },
  { atMs: 51_500, color: 'coral', shape: 'capsule', periodMs: 1_200,
    label: '警戒テーマに更新', scanAtMs: 55_300, scanDurationMs: 2_200 },
  { atMs: 62_500, color: 'coral', shape: 'square', periodMs: 750,
    label: '圧縮アップデート', scanAtMs: 65_900, scanDurationMs: 2_300 },
  { atMs: 73_000, color: 'cyan', shape: 'square', periodMs: 750,
    label: '高速スキャン開始', scanAtMs: 76_400, scanDurationMs: 2_400 },
  { atMs: 81_500, color: 'gold', shape: 'round', periodMs: 500,
    label: '最終アップデート', scanAtMs: 84_900, scanDurationMs: 2_600 },
].map(Object.freeze));

const SCANS = STAGES.map((stage, index) => Object.freeze({
  index,
  startMs: stage.scanAtMs,
  endMs: stage.scanAtMs + stage.scanDurationMs,
  durationMs: stage.scanDurationMs,
}));

const fraction = (number) => ((number % 1) + 1) % 1;
const cloneTarget = (target) => ({ ...target });

function rhythmComparison(player, target, timeMs) {
  if (player.periodMs === null) {
    return { matches: false, tempoError: 1, phaseError: 0.5, error: 1 };
  }
  const tempoError = Math.abs(player.periodMs - target.periodMs) / target.periodMs;
  const playerPhase = fraction((timeMs - player.anchorMs) / player.periodMs);
  const targetPhase = fraction((timeMs - target.anchorMs) / target.periodMs);
  const difference = Math.abs(playerPhase - targetPhase);
  const phaseError = Math.min(difference, 1 - difference);
  return {
    matches: tempoError <= TEMPO_TOLERANCE + EPSILON
      && phaseError <= PHASE_TOLERANCE + EPSILON,
    tempoError,
    phaseError,
    // A display-friendly distance: 0 = exact, 1 = clearly different.
    error: Math.min(1, Math.max(tempoError, phaseError * 2)),
  };
}

/** Options are reserved for future difficulty presets; the initial build is authored. */
export function createGame(options = {}) {
  void options;
  let phase;
  let elapsedMs;
  let accumulatorMs;
  let suspicion;
  let score;
  let scansSurvived;
  let target;
  let previousTarget;
  let player;
  let stageIndex;
  let changes;
  let pendingTapMs;
  let lastTapMs;
  let rhythmMessage;
  let rhythmFeedback;
  let result;
  let stats;
  let scanMatchedMs;

  function initialize(nextPhase) {
    phase = nextPhase;
    elapsedMs = 0;
    accumulatorMs = 0;
    suspicion = 0;
    score = 0;
    scansSurvived = 0;
    stageIndex = 0;
    const initial = STAGES[0];
    target = {
      color: initial.color,
      shape: initial.shape,
      periodMs: initial.periodMs,
      anchorMs: 0,
    };
    previousTarget = cloneTarget(target);
    player = { color: initial.color, shape: initial.shape, periodMs: null, anchorMs: 0 };
    changes = [];
    pendingTapMs = null;
    lastTapMs = null;
    rhythmMessage = 'まわりの動きに合わせて、2回タップ';
    rhythmFeedback = 'idle';
    result = null;
    stats = { colorMismatchMs: 0, shapeMismatchMs: 0, rhythmMismatchMs: 0 };
    scanMatchedMs = SCANS.map(() => 0);
  }

  function matchingAt(timeMs) {
    const rhythm = rhythmComparison(player, target, timeMs);
    return {
      color: player.color === target.color,
      shape: player.shape === target.shape,
      rhythm: rhythm.matches,
      rhythmError: rhythm.error,
    };
  }

  function applyStage(index) {
    const stage = STAGES[index];
    previousTarget = cloneTarget(target);
    changes = [];
    if (stage.color !== target.color) changes.push('color');
    if (stage.shape !== target.shape) changes.push('shape');
    const rhythmChanged = stage.periodMs !== target.periodMs;
    if (rhythmChanged) changes.push('rhythm');
    target = {
      color: stage.color,
      shape: stage.shape,
      periodMs: stage.periodMs,
      anchorMs: rhythmChanged ? stage.atMs : target.anchorMs,
    };
    stageIndex = index;
    if (rhythmChanged && pendingTapMs === null) {
      rhythmFeedback = 'off';
      rhythmMessage = 'リズムが変わった！ もう2回タップ';
    }
  }

  function dominantMismatch() {
    const exposures = [
      ['color', stats.colorMismatchMs],
      ['shape', stats.shapeMismatchMs],
      ['rhythm', stats.rhythmMismatchMs],
    ];
    exposures.sort((a, b) => b[1] - a[1]);
    return exposures[0][1] > 0 ? exposures[0][0] : 'none';
  }

  function finish(won) {
    phase = won ? 'won' : 'lost';
    pendingTapMs = null;
    const mismatchMs = stats.colorMismatchMs + stats.shapeMismatchMs + stats.rhythmMismatchMs;
    const rank = !won ? 'RETRY'
      : mismatchMs <= 500 ? 'S'
        : mismatchMs <= 4_000 ? 'A'
          : mismatchMs <= 10_000 ? 'B' : 'C';
    result = {
      reason: won ? '90秒、擬態を守りきった！' : 'スキャンで擬態を見破られた',
      dominantMismatch: dominantMismatch(),
      rank,
    };
  }

  function activeScanAt(timeMs) {
    return SCANS.find((scan) => timeMs >= scan.startMs && timeMs < scan.endMs);
  }

  function advanceTick() {
    const nextTimeMs = Math.min(DURATION_MS, elapsedMs + STEP_MS);
    const stepMs = nextTimeMs - elapsedMs;
    const sampleMs = elapsedMs + stepMs / 2;
    const match = matchingAt(sampleMs);
    const allMatch = match.color && match.shape && match.rhythm;
    const scan = activeScanAt(sampleMs);
    const seconds = stepMs / 1_000;

    if (allMatch) {
      suspicion = Math.max(0, suspicion - RECOVERY_PER_SECOND * seconds);
      score += 5 * seconds;
      if (scan) scanMatchedMs[scan.index] += stepMs;
    } else if (scan) {
      let damagePerSecond = 0;
      for (const trait of ['color', 'shape', 'rhythm']) {
        if (!match[trait]) {
          stats[`${trait}MismatchMs`] += stepMs;
          damagePerSecond += DAMAGE_PER_SECOND[trait];
        }
      }
      suspicion = Math.min(100, suspicion + damagePerSecond * seconds);
    }

    elapsedMs = nextTimeMs;
    if (pendingTapMs !== null && elapsedMs - pendingTapMs > MAX_TAP_INTERVAL_MS) {
      pendingTapMs = null;
      rhythmFeedback = 'invalid';
      rhythmMessage = '間が空いたので、もう一度2回タップ';
    }
    while (stageIndex + 1 < STAGES.length && STAGES[stageIndex + 1].atMs <= elapsedMs) {
      applyStage(stageIndex + 1);
    }

    if (suspicion >= 100 - EPSILON) {
      suspicion = 100;
      finish(false);
      return;
    }
    if (scan && elapsedMs >= scan.endMs) {
      scansSurvived += 1;
      score += 80 + 120 * scanMatchedMs[scan.index] / scan.durationMs;
    }
    if (elapsedMs >= DURATION_MS) finish(true);
  }

  function snapshot() {
    const scan = activeScanAt(elapsedMs);
    const nextScan = SCANS.find((candidate) => candidate.startMs > elapsedMs);
    const nextStage = STAGES[stageIndex + 1];
    return {
      phase,
      elapsedMs,
      remainingMs: Math.max(0, DURATION_MS - elapsedMs),
      suspicion: Math.round(suspicion * 100) / 100,
      score: Math.floor(score + EPSILON),
      scansSurvived,
      target: cloneTarget(target),
      previousTarget: cloneTarget(previousTarget),
      player: { ...player },
      match: matchingAt(elapsedMs),
      scan: {
        active: Boolean(scan),
        progress: scan ? Math.min(1, (elapsedMs - scan.startMs) / scan.durationMs) : 0,
        nextInMs: scan ? 0 : nextScan ? nextScan.startMs - elapsedMs : 0,
      },
      environment: {
        index: stageIndex,
        changedAtMs: STAGES[stageIndex].atMs,
        nextInMs: nextStage ? nextStage.atMs - elapsedMs : 0,
        changes: [...changes],
        label: STAGES[stageIndex].label,
      },
      rhythm: {
        pending: pendingTapMs !== null,
        lastTapMs,
        message: rhythmMessage,
        feedback: rhythmFeedback,
      },
      result: result ? { ...result } : null,
      stats: { ...stats },
    };
  }

  function update(dtMs) {
    if (phase !== 'playing' || !Number.isFinite(dtMs) || dtMs <= 0) return snapshot();
    accumulatorMs += dtMs;
    while (accumulatorMs + EPSILON >= STEP_MS && phase === 'playing') {
      accumulatorMs = Math.max(0, accumulatorMs - STEP_MS);
      advanceTick();
    }
    if (phase !== 'playing') accumulatorMs = 0;
    return snapshot();
  }

  function tap() {
    if (phase !== 'playing') return false;
    lastTapMs = elapsedMs;
    if (pendingTapMs === null) {
      pendingTapMs = elapsedMs;
      rhythmFeedback = 'listening';
      rhythmMessage = '次の「ぽん」に合わせて、もう1回';
      return true;
    }

    const firstTapMs = pendingTapMs;
    const intervalMs = elapsedMs - firstTapMs;
    pendingTapMs = null;
    if (intervalMs < MIN_TAP_INTERVAL_MS || intervalMs > MAX_TAP_INTERVAL_MS) {
      rhythmFeedback = 'invalid';
      rhythmMessage = intervalMs < MIN_TAP_INTERVAL_MS
        ? 'もう少し間をあけて、2回タップ'
        : '間が空いたので、もう一度2回タップ';
      return false;
    }

    // Tempo assistance locks a close interval to the observed beat. First-tap
    // phase is retained, so tapping consistently between beats still fails.
    const closeTempo = Math.abs(intervalMs - target.periodMs) / target.periodMs
      <= TEMPO_TOLERANCE + EPSILON;
    player.periodMs = closeTempo ? target.periodMs : intervalMs;
    player.anchorMs = firstTapMs;
    const comparison = rhythmComparison(player, target, elapsedMs);
    rhythmFeedback = comparison.matches ? 'good' : 'off';
    rhythmMessage = comparison.matches
      ? 'リズムを覚えた！ 自動でくり返すよ'
      : comparison.tempoError > TEMPO_TOLERANCE
        ? '速さが違うかも。もう一度2回タップ'
        : 'タイミングがずれた。周りと同時に2回';
    return true;
  }

  initialize('ready');
  return {
    start() { initialize('playing'); return snapshot(); },
    update,
    setColor(id) {
      if (phase !== 'playing' || !COLOR_IDS.has(id)) return false;
      player.color = id;
      return true;
    },
    setShape(id) {
      if (phase !== 'playing' || !SHAPE_IDS.has(id)) return false;
      player.shape = id;
      return true;
    },
    tap,
    pause() {
      if (phase !== 'playing') return false;
      phase = 'paused';
      return true;
    },
    resume() {
      if (phase !== 'paused') return false;
      phase = 'playing';
      return true;
    },
    reset() { initialize('ready'); return snapshot(); },
    snapshot,
  };
}

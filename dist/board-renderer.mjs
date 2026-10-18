import { BOARD } from './board-state.mjs';

const COLORS = { waiting: '#f2c65b', approach: '#f2c65b', accepted: '#8bd5ff', intrusion: '#f16c65', rejected: '#b9b8a7' };
const TYPE_LABELS = { auth: '受付', share: 'カルテ', flood: '検査', exfil: '予約' };
const CELL = 12;

export function drawBoard(ctx, scene, life, generation, { labelScale = 1 } = {}) {
  const w = BOARD.width * CELL, h = BOARD.height * CELL;
  ctx.save();
  ctx.fillStyle = '#111b20'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#10283f'; ctx.fillRect(48 * CELL, 0, w / 2, h);

  const cell = (x, y, color, glow = false) => {
    ctx.fillStyle = color; ctx.shadowColor = color;
    ctx.shadowBlur = glow && !scene.reducedMotion ? 8 : 0;
    ctx.fillRect(x * CELL + 1, y * CELL + 1, 9, 9);
    ctx.shadowBlur = 0;
  };
  // Dead home cells stay blue, even if all the living cells disappear.
  for (let y = 0; y < 60; y++) {
    // A soft lift around the queue builds over the final six seconds to auto-pass.
    // It follows game time, so pauses and extended deadlines also affect the light.
    const lift = scene.waitingUrgency * Math.max(0, 1 - Math.abs(y + .5 - 30) / 13) ** 2;
    const waitingColor = `rgb(${Math.round(24 + 26 * lift)},${Math.round(38 + 20 * lift)},${Math.round(43 + 8 * lift)})`;
    for (let x = 0; x < 96; x++) {
      cell(x, y, x < 48 ? waitingColor : (x + y) % 3 ? '#17344b' : '#1a3e58');
    }
  }
  for (const n of life) {
    const x = n % 48, y = Math.floor(n / 48);
    cell(x + 48, y, (n + generation) % 7 === 0 ? '#73c5f4' : '#367ca8');
  }

  for (const field of scene.threats.values()) {
    const z = scene.zones[field.type];
    ctx.globalAlpha = z.quarantineUntil > scene.time ? .55 : 1;
    for (const n of field.cells) cell(n % field.w + 48, Math.floor(n / field.w), '#f16c65', true);
    ctx.globalAlpha = 1;
  }

  ctx.strokeStyle = '#91a29f55'; ctx.lineWidth = 1; ctx.setLineDash([5, 8]);
  ctx.beginPath(); ctx.moveTo(3 * CELL, 30 * CELL); ctx.lineTo(47 * CELL, 30 * CELL); ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = '#718d9b'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(47.5 * CELL, 4 * CELL); ctx.lineTo(47.5 * CELL, 26 * CELL);
  ctx.moveTo(47.5 * CELL, 34 * CELL); ctx.lineTo(47.5 * CELL, 56 * CELL); ctx.stroke();

  for (const node of scene.nodes.filter(n => n.visible)) {
    const color = COLORS[node.phase];
    ctx.globalAlpha = (node.opacity ?? 1) * (node.dimmed ? .4 : 1);
    if (node.trail?.length) {
      ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.setLineDash([5, 5]); ctx.beginPath();
      node.trail.forEach((p, i) => i ? ctx.lineTo(p.x * CELL, p.y * CELL) : ctx.moveTo(p.x * CELL, p.y * CELL));
      ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.fillStyle = '#10191bf2'; ctx.fillRect((node.x - 3.2) * CELL, (node.y - 6) * CELL, 6.4 * CELL, 13.5 * CELL);
    ctx.strokeStyle = node.selected ? '#f1f5f9' : color; ctx.lineWidth = node.selected ? 3 : 1;
    ctx.strokeRect((node.x - 3.2) * CELL, (node.y - 6) * CELL, 6.4 * CELL, 13.5 * CELL);
    // The packet silhouette is stable; its internal cells change brightness.
    for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) {
      if (Math.abs(x) + Math.abs(y) > 1 && x === y) continue;
      cell(node.x + x - .5, node.y + y - .5,
        !scene.reducedMotion && (x + y + Math.floor(scene.time * 3)) % 3 === 0 ? '#8b7952' : color);
    }
    ctx.textAlign = 'center'; ctx.font = `600 ${13 * labelScale}px monospace`; ctx.fillStyle = color;
    ctx.fillText('#' + String(node.id).padStart(3, '0'), node.x * CELL, (node.y - 3.5) * CELL);
    ctx.font = `${10 * labelScale}px sans-serif`;
    ctx.fillText(TYPE_LABELS[node.type], node.x * CELL, (node.y + 4) * CELL);
    const result = node.remaining !== undefined ? node.remaining + 's'
      : node.phase === 'rejected' ? (node.auto ? '× 防壁' : '× 遮断')
      : node.phase === 'intrusion' ? '! 侵入' : '✓ 通過';
    ctx.fillText(result, node.x * CELL, (node.y + 6.4) * CELL);
    if (node.phase === 'rejected') {
      ctx.strokeStyle = '#f1f5f9'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo((node.x - 1.5) * CELL, (node.y - 1.5) * CELL);
      ctx.lineTo((node.x + 1.5) * CELL, (node.y + 1.5) * CELL); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // Gate status is separate from the queue: isolating one type does not block all traffic.
  ctx.fillStyle = '#10191b'; ctx.fillRect(45.8 * CELL, 26 * CELL, 3.4 * CELL, 8 * CELL);
  ctx.strokeStyle = '#8bd5ff'; ctx.lineWidth = 3;
  ctx.strokeRect(45.8 * CELL, 26 * CELL, 3.4 * CELL, 8 * CELL);
  ctx.fillStyle = '#cde9f8'; ctx.textAlign = 'center'; ctx.font = `600 ${12 * labelScale}px monospace`;
  ctx.fillText('GATE', 47.5 * CELL, 24 * CELL);

  function label(text, x, y, color, font = '16px monospace') {
    ctx.save(); ctx.translate(x * CELL, y * CELL);
    ctx.font = font.replace(/([\d.]+)px/, (_, size) => `${Number(size) * labelScale}px`); ctx.textAlign = 'center';
    const metrics = ctx.measureText(text);
    ctx.fillStyle = '#10191be8'; ctx.fillRect(-metrics.width / 2 - 10, -19, metrics.width + 20, 28);
    ctx.fillStyle = color; ctx.fillText(text, 0, 0); ctx.restore();
  }
  label('外部 / EXTERNAL', 22, 12, '#a8b8bf');
  label('自陣 / BLUE', 73, 12, '#8bd5ff');
  if (scene.overflow) label('ほか ' + scene.overflow + ' 件', 8, 45, '#f2c65b');
  label(scene.attacks ? '! 侵入 ' + scene.attacks + '件' : '● 正常サービス', 73, 52,
    scene.attacks ? '#f16c65' : '#8bd5ff');

  const statuses = Object.entries(scene.zones).flatMap(([type, z]) => {
    if (z.fixed) return [TYPE_LABELS[type] + ' ▥ 修復済み'];
    if (z.quarantineUntil > scene.time) return [TYPE_LABELS[type] + ' Ⅱ ' + Math.ceil(z.quarantineUntil - scene.time) + 's'];
    if (z.repairEnd) return [TYPE_LABELS[type] + ' 修復 ' + Math.ceil(z.repairEnd - scene.time) + 's'];
    return [];
  });
  statuses.forEach((text, i) => label(text, 80, 17 + i * 4, '#c7dfeb', '14px sans-serif'));
  ctx.restore();
}

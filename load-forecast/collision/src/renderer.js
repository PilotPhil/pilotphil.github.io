/* Canvas visuals for the collision lab. Everything is hand-drawn: no assets,
 * no renderer dependency, no external fonts. */

import { clamp } from './math.js';

const UI_FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';
const MONO_FONT = '"SFMono-Regular", "Cascadia Code", "Roboto Mono", ui-monospace, monospace';

const COLORS = {
  ink: '#14313a',
  inkSoft: '#41606a',
  muted: '#7a9299',
  fieldLine: 'rgba(48, 106, 118, 0.1)',
  blue: '#26809d',
  blueDeep: '#116a86',
  blueSoft: '#eaf7fa',
  amber: '#cb8843',
  amberDeep: '#ad6c2d',
  coral: '#d45f4b',
  coralDeep: '#b54b39',
  violet: '#6a5fc9',
  violetDeep: '#5247b8',
  green: '#2c9178',
  bodyStroke: 'rgba(108, 146, 153, 0.86)',
  bodyStrokeSoft: 'rgba(109, 145, 151, 0.72)',
  tagBg: 'rgba(255, 255, 255, 0.93)',
};

const BODY_TONES = [
  { top: '#f7fdfc', bottom: '#d3e5e6', edge: 'rgba(93, 137, 144, 0.92)' },
  { top: '#f8fdfd', bottom: '#d8e6eb', edge: 'rgba(89, 134, 146, 0.9)' },
  { top: '#f8fdfa', bottom: '#d3e6dd', edge: 'rgba(88, 137, 129, 0.9)' },
  { top: '#f9fdfd', bottom: '#dae7ed', edge: 'rgba(93, 135, 150, 0.9)' },
  { top: '#f8fdfb', bottom: '#d5e7e4', edge: 'rgba(86, 134, 135, 0.9)' },
];

function alpha(hex, a) {
  const value = hex.replace('#', '');
  const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value;
  const number = Number.parseInt(full, 16);
  const r = (number >> 16) & 255;
  const g = (number >> 8) & 255;
  const b = number & 255;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function polygonPath(ctx, points) {
  if (!points.length) return;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i].x, points[i].y);
  ctx.closePath();
}

function insetPolygon(points, amount) {
  if (!points.length) return [];
  let cx = 0;
  let cy = 0;
  for (const p of points) {
    cx += p.x;
    cy += p.y;
  }
  cx /= points.length;
  cy /= points.length;
  return points.map((p) => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const length = Math.hypot(dx, dy) || 1;
    const inset = Math.min(amount, length * 0.3);
    return { x: p.x - (dx / length) * inset, y: p.y - (dy / length) * inset };
  });
}

function roundedRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w * 0.5, h * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function drawCornerTicks(ctx, aabb, color, length = 5, width = 1.2) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  const { minX, minY, maxX, maxY } = aabb;
  ctx.moveTo(minX, minY + length);
  ctx.lineTo(minX, minY);
  ctx.lineTo(minX + length, minY);
  ctx.moveTo(maxX - length, minY);
  ctx.lineTo(maxX, minY);
  ctx.lineTo(maxX, minY + length);
  ctx.moveTo(maxX, maxY - length);
  ctx.lineTo(maxX, maxY);
  ctx.lineTo(maxX - length, maxY);
  ctx.moveTo(minX + length, maxY);
  ctx.lineTo(minX, maxY);
  ctx.lineTo(minX, maxY - length);
  ctx.stroke();
  ctx.restore();
}

function drawAabb(ctx, aabb, options = {}) {
  const {
    color = 'rgba(48, 106, 118, 0.3)',
    dash = [4, 4],
    width = 1,
    fill = null,
    corners = false,
    cornerColor = color,
  } = options;
  ctx.save();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fillRect(aabb.minX, aabb.minY, aabb.maxX - aabb.minX, aabb.maxY - aabb.minY);
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.setLineDash(dash);
  ctx.strokeRect(aabb.minX + 0.5, aabb.minY + 0.5, aabb.maxX - aabb.minX, aabb.maxY - aabb.minY);
  ctx.setLineDash([]);
  ctx.restore();
  if (corners) drawCornerTicks(ctx, aabb, cornerColor, 5, width + 0.15);
}

function drawTag(ctx, text, x, y, options = {}) {
  const {
    color = COLORS.inkSoft,
    bg = COLORS.tagBg,
    border = 'rgba(123, 158, 163, 0.25)',
    dot = null,
    align = 'left',
    font = `600 7px ${MONO_FONT}`,
    height = 15,
  } = options;
  ctx.save();
  ctx.font = font;
  const textWidth = ctx.measureText(text).width;
  const padX = 5.5;
  const dotSpace = dot ? 8 : 0;
  const width = textWidth + padX * 2 + dotSpace;
  let left = x;
  if (align === 'right') left = x - width;
  else if (align === 'center') left = x - width * 0.5;
  const top = y - height * 0.5;

  ctx.shadowColor = 'rgba(24, 70, 80, 0.16)';
  ctx.shadowBlur = 7;
  ctx.shadowOffsetY = 2;
  roundedRect(ctx, left, top, width, height, 4.5);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = border;
  ctx.lineWidth = 1;
  ctx.stroke();

  if (dot) {
    ctx.beginPath();
    ctx.arc(left + padX + 1.4, y, 2.1, 0, Math.PI * 2);
    ctx.fillStyle = dot;
    ctx.fill();
  }
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, left + padX + dotSpace, y + 0.3);
  ctx.restore();
  return { left, width, top, height };
}

function measureTag(ctx, text, options = {}) {
  const {
    dot = null,
    align = 'left',
    font = `600 7px ${MONO_FONT}`,
    height = 15,
    padX = 5.5,
  } = options;
  ctx.save();
  ctx.font = font;
  const width = ctx.measureText(text).width + padX * 2 + (dot ? 8 : 0);
  ctx.restore();
  return { width, height, dotSpace: dot ? 8 : 0, padX, align };
}

function tagRectAt(x, y, measured) {
  let left = x;
  if (measured.align === 'right') left = x - measured.width;
  else if (measured.align === 'center') left = x - measured.width * 0.5;
  const top = y - measured.height * 0.5;
  return {
    left,
    top,
    right: left + measured.width,
    bottom: top + measured.height,
    width: measured.width,
    height: measured.height,
  };
}

function rectsOverlap(a, b, padding = 0) {
  return (
    a.left < b.right + padding &&
    a.right > b.left - padding &&
    a.top < b.bottom + padding &&
    a.bottom > b.top - padding
  );
}

function drawBody(ctx, body, status, time) {
  const bounds = body.aabb;
  const tone = BODY_TONES[body.id % BODY_TONES.length];
  let fillTop = tone.top;
  let fillBottom = tone.bottom;
  let stroke = tone.edge;
  let lineWidth = 1.2;

  if (status === 'candidate') {
    fillTop = '#fdf8ef';
    fillBottom = '#f2dfc6';
    stroke = alpha(COLORS.amber, 0.94);
    lineWidth = 1.4;
  } else if (status === 'hit') {
    fillTop = '#fff8f5';
    fillBottom = '#f6d8d0';
    stroke = alpha(COLORS.coral, 0.94);
    lineWidth = 1.7;
  }

  ctx.save();
  polygonPath(ctx, body.vertices.map((p) => ({ x: p.x + 2.5, y: p.y + 5 })));
  ctx.fillStyle = 'rgba(24, 67, 75, 0.085)';
  ctx.fill();

  const gradient = ctx.createLinearGradient(bounds.minX, bounds.minY, bounds.maxX, bounds.maxY);
  gradient.addColorStop(0, fillTop);
  gradient.addColorStop(1, fillBottom);
  polygonPath(ctx, body.vertices);
  ctx.fillStyle = gradient;
  ctx.fill();

  if (status === 'hit') {
    ctx.save();
    ctx.shadowColor = alpha(COLORS.coral, 0.3);
    ctx.shadowBlur = 14;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
    ctx.restore();
  }

  ctx.strokeStyle = stroke;
  ctx.lineWidth = lineWidth;
  ctx.lineJoin = 'round';
  ctx.stroke();

  if (status !== 'idle') {
    const inner = insetPolygon(body.vertices, 2.4);
    polygonPath(ctx, inner);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 0.9;
    ctx.stroke();
  }

  const vertexColor = status === 'hit' ? alpha(COLORS.coral, 0.7) : status === 'candidate' ? alpha(COLORS.amber, 0.65) : 'rgba(133, 161, 164, 0.42)';
  for (const point of body.vertices) {
    ctx.beginPath();
    ctx.arc(point.x, point.y, status === 'idle' ? 1.1 : 1.35, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.fill();
    ctx.strokeStyle = vertexColor;
    ctx.lineWidth = 0.75;
    ctx.stroke();
  }
  ctx.restore();
}

function drawProbe(ctx, probe, hasFocusHit, time) {
  const bounds = probe.aabb;
  const center = probe.center;

  ctx.save();
  // A soft, breathing ring marks the query body without adding visual weight.
  const pulse = 0.5 + 0.5 * Math.sin(time * 1.7);
  ctx.beginPath();
  ctx.arc(center.x, center.y, probe.radius + 13 + pulse * 3, 0, Math.PI * 2);
  ctx.strokeStyle = `rgba(38, 128, 157, ${0.1 + pulse * 0.04})`;
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 6]);
  ctx.stroke();
  ctx.setLineDash([]);

  polygonPath(ctx, probe.vertices.map((p) => ({ x: p.x + 2, y: p.y + 6 })));
  ctx.fillStyle = 'rgba(23, 84, 99, 0.12)';
  ctx.fill();

  ctx.save();
  ctx.shadowColor = 'rgba(27, 102, 125, 0.28)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 4;
  const gradient = ctx.createLinearGradient(bounds.minX, bounds.minY, bounds.maxX, bounds.maxY);
  gradient.addColorStop(0, '#ffffff');
  gradient.addColorStop(0.62, '#f4fcfe');
  gradient.addColorStop(1, '#cfe8ef');
  polygonPath(ctx, probe.vertices);
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.restore();

  polygonPath(ctx, probe.vertices);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)';
  ctx.lineWidth = 4.4;
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.strokeStyle = COLORS.blueDeep;
  ctx.lineWidth = 1.9;
  ctx.stroke();

  const inner = insetPolygon(probe.vertices, 2.8);
  polygonPath(ctx, inner);
  ctx.strokeStyle = alpha(COLORS.blue, 0.22);
  ctx.lineWidth = 0.9;
  ctx.stroke();

  for (const point of probe.vertices) {
    ctx.beginPath();
    ctx.arc(point.x, point.y, 1.55, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = alpha(COLORS.blueDeep, 0.8);
    ctx.lineWidth = 0.85;
    ctx.stroke();
  }

  // Center dot and a short heading tick make slow rotation legible.
  ctx.beginPath();
  ctx.arc(center.x, center.y, 2.2, 0, Math.PI * 2);
  ctx.fillStyle = COLORS.blueDeep;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(center.x, center.y, 4.8, 0, Math.PI * 2);
  ctx.strokeStyle = alpha(COLORS.blue, 0.22);
  ctx.lineWidth = 0.9;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(center.x, center.y);
  ctx.lineTo(center.x + Math.cos(probe.angle) * (probe.radius * 0.45), center.y + Math.sin(probe.angle) * (probe.radius * 0.45));
  ctx.strokeStyle = alpha(COLORS.blueDeep, 0.34);
  ctx.lineWidth = 1;
  ctx.stroke();

  if (hasFocusHit) {
    ctx.beginPath();
    ctx.arc(center.x, center.y, probe.radius + 7, 0, Math.PI * 2);
    ctx.strokeStyle = alpha(COLORS.coral, 0.22 + pulse * 0.1);
    ctx.lineWidth = 1.2;
    ctx.setLineDash([3, 5]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();
}

function drawGridOverlay(ctx, field, overlay) {
  const { originX, originY, cellSize, cols, rows, occupied, queryCells } = overlay;
  ctx.save();
  ctx.beginPath();
  ctx.rect(field.x, field.y, field.w, field.h);
  ctx.clip();

  for (const cell of occupied) {
    ctx.fillStyle = 'rgba(48, 125, 140, 0.035)';
    ctx.fillRect(originX + cell.cx * cellSize, originY + cell.cy * cellSize, cellSize, cellSize);
  }

  ctx.beginPath();
  for (let i = 0; i <= cols; i += 1) {
    const x = originX + i * cellSize;
    if (x < field.x - 0.5 || x > field.x + field.w + 0.5) continue;
    ctx.moveTo(x, field.y);
    ctx.lineTo(x, field.y + field.h);
  }
  for (let j = 0; j <= rows; j += 1) {
    const y = originY + j * cellSize;
    if (y < field.y - 0.5 || y > field.y + field.h + 0.5) continue;
    ctx.moveTo(field.x, y);
    ctx.lineTo(field.x + field.w, y);
  }
  ctx.strokeStyle = 'rgba(46, 103, 115, 0.125)';
  ctx.lineWidth = 0.8;
  ctx.stroke();

  for (const cell of queryCells) {
    roundedRect(ctx, originX + cell.cx * cellSize + 1, originY + cell.cy * cellSize + 1, cellSize - 2, cellSize - 2, 3);
    ctx.fillStyle = 'rgba(38, 128, 157, 0.088)';
    ctx.fill();
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = 'rgba(38, 128, 157, 0.4)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.strokeStyle = 'rgba(38, 128, 157, 0.12)';
  ctx.lineWidth = 1;
  ctx.strokeRect(field.x + 0.5, field.y + 0.5, field.w - 1, field.h - 1);
  ctx.restore();
}

function drawQuadtreeOverlay(ctx, field, overlay) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(field.x, field.y, field.w, field.h);
  ctx.clip();

  const visit = (node) => {
    if (!node.hasContent) return;
    if (node.visited) {
      ctx.fillStyle = 'rgba(38, 128, 157, 0.045)';
      ctx.fillRect(node.x, node.y, node.w, node.h);
    }
    ctx.strokeStyle = node.visited ? 'rgba(38, 128, 157, 0.3)' : 'rgba(61, 112, 122, 0.115)';
    ctx.lineWidth = node.visited ? 1 : 0.75;
    if (!node.visited) ctx.setLineDash([2.5, 4]);
    ctx.strokeRect(node.x + 0.5, node.y + 0.5, node.w, node.h);
    ctx.setLineDash([]);
    if (node.children) {
      for (const child of node.children) visit(child);
    }
  };
  visit(overlay.root);
  ctx.restore();
}

function drawSweepOverlay(ctx, field, overlay, candidateSet, hitSet) {
  const { band, sortedBodies, xOverlappingIds } = overlay;
  const xSet = new Set(xOverlappingIds);
  ctx.save();
  ctx.beginPath();
  ctx.rect(field.x, field.y, field.w, field.h);
  ctx.clip();

  ctx.fillStyle = 'rgba(38, 128, 157, 0.05)';
  ctx.fillRect(band.minX, field.y, Math.max(1, band.maxX - band.minX), field.h);
  ctx.strokeStyle = 'rgba(38, 128, 157, 0.24)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(band.minX + 0.5, field.y);
  ctx.lineTo(band.minX + 0.5, field.y + field.h);
  ctx.moveTo(band.maxX - 0.5, field.y);
  ctx.lineTo(band.maxX - 0.5, field.y + field.h);
  ctx.stroke();
  ctx.setLineDash([]);

  for (const body of sortedBodies) {
    const y = Math.min(field.y + field.h - 11, body.aabb.maxY + 9);
    const isHit = hitSet.has(body.id);
    const isCandidate = candidateSet.has(body.id);
    const isX = xSet.has(body.id);
    let color = 'rgba(39, 91, 103, 0.24)';
    let width = 1.5;
    if (isX) {
      color = 'rgba(203, 136, 67, 0.42)';
      width = 1.8;
    }
    if (isCandidate) {
      color = 'rgba(203, 136, 67, 0.74)';
      width = 2.1;
    }
    if (isHit) {
      color = 'rgba(212, 95, 75, 0.82)';
      width = 2.2;
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(body.aabb.minX, y);
    ctx.lineTo(body.aabb.maxX, y);
    ctx.moveTo(body.aabb.minX, y - 2.4);
    ctx.lineTo(body.aabb.minX, y + 2.4);
    ctx.moveTo(body.aabb.maxX, y - 2.4);
    ctx.lineTo(body.aabb.maxX, y + 2.4);
    ctx.stroke();
  }

  // A tiny x-axis ruler anchors the projection idea at the base of the field.
  const rulerY = field.y + field.h - 2.5;
  ctx.strokeStyle = 'rgba(38, 128, 157, 0.2)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(field.x, rulerY);
  ctx.lineTo(field.x + field.w, rulerY);
  for (let x = field.x + 40; x < field.x + field.w; x += 80) {
    ctx.moveTo(x, rulerY - 2);
    ctx.lineTo(x, rulerY + 2);
  }
  ctx.stroke();
  ctx.strokeStyle = 'rgba(38, 128, 157, 0.55)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(band.minX, rulerY);
  ctx.lineTo(band.maxX, rulerY);
  ctx.stroke();

  drawTag(ctx, 'X SWEEP', band.minX + 4, field.y + 13, {
    color: alpha(COLORS.blueDeep, 0.85),
    border: 'rgba(122, 171, 181, 0.32)',
    dot: alpha(COLORS.blue, 0.6),
    font: `600 6.5px ${MONO_FONT}`,
    height: 14,
    bg: 'rgba(255, 255, 255, 0.72)',
  });
  ctx.restore();
}

function drawBruteOverlay(ctx, probe, bodies, field, candidateSet, hitSet) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(field.x, field.y, field.w, field.h);
  ctx.clip();
  for (const body of bodies) {
    const isHit = hitSet.has(body.id);
    const isCandidate = candidateSet.has(body.id);
    let color = 'rgba(45, 99, 111, 0.22)';
    let width = 0.9;
    if (isCandidate) {
      color = 'rgba(203, 136, 67, 0.58)';
      width = 1.15;
    }
    if (isHit) {
      color = 'rgba(212, 95, 75, 0.62)';
      width = 1.2;
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.setLineDash(isCandidate || isHit ? [3, 4] : [2, 6]);
    ctx.beginPath();
    ctx.moveTo(probe.center.x, probe.center.y);
    ctx.lineTo(body.center.x, body.center.y);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.restore();
}

function drawFocus(ctx, probe, focus, focusGjk, time) {
  if (!focus) return;
  const isHit = Boolean(focusGjk && focusGjk.hit);
  const mid = {
    x: (probe.center.x + focus.center.x) * 0.5,
    y: (probe.center.y + focus.center.y) * 0.5,
  };
  ctx.save();
  ctx.strokeStyle = alpha(COLORS.violet, isHit ? 0.4 : 0.28);
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 4]);
  ctx.beginPath();
  ctx.moveTo(probe.center.x, probe.center.y);
  ctx.lineTo(focus.center.x, focus.center.y);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.beginPath();
  ctx.arc(focus.center.x, focus.center.y, 3, 0, Math.PI * 2);
  ctx.strokeStyle = alpha(COLORS.violet, 0.35);
  ctx.lineWidth = 1;
  ctx.stroke();

  if (isHit) {
    const pulse = 0.5 + 0.5 * Math.sin(time * 3.4);
    ctx.beginPath();
    ctx.arc(mid.x, mid.y, 8 + pulse * 5, 0, Math.PI * 2);
    ctx.fillStyle = alpha(COLORS.coral, 0.055 + pulse * 0.035);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(mid.x, mid.y, 6.5 + pulse * 2.2, 0, Math.PI * 2);
    ctx.strokeStyle = alpha(COLORS.coral, 0.32 + pulse * 0.18);
    ctx.lineWidth = 1.1;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(mid.x, mid.y, 3.1, 0, Math.PI * 2);
    ctx.fillStyle = alpha(COLORS.coral, 0.92);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
  ctx.restore();
}

function drawSceneLabels(ctx, probe, focus, focusGjk, field) {
  const queryFont = `600 6.7px ${MONO_FONT}`;
  const queryOptions = {
    color: COLORS.blueDeep,
    border: 'rgba(109, 171, 184, 0.34)',
    dot: alpha(COLORS.blue, 0.8),
    align: 'center',
    font: queryFont,
  };
  const queryMeasured = measureTag(ctx, 'QUERY', queryOptions);
  const queryX = clamp(
    probe.center.x,
    field.x + queryMeasured.width * 0.5 + 3,
    field.x + field.w - queryMeasured.width * 0.5 - 3,
  );
  let queryY = probe.aabb.minY - 11;
  if (queryY - queryMeasured.height * 0.5 < field.y + 4) {
    queryY = Math.min(field.y + field.h - queryMeasured.height * 0.5 - 3, probe.aabb.maxY + 11);
  }
  const queryRect = tagRectAt(queryX, queryY, queryMeasured);

  if (focus) {
    const isHit = Boolean(focusGjk && focusGjk.hit);
    const tagColor = isHit ? COLORS.coralDeep : COLORS.amberDeep;
    const dotColor = isHit ? COLORS.coral : COLORS.amber;
    const focusText = `障碍体 ${String(focus.id + 1).padStart(2, '0')}`;
    const focusOptions = {
      color: tagColor,
      border: isHit ? 'rgba(224, 158, 144, 0.38)' : 'rgba(218, 179, 128, 0.36)',
      dot: dotColor,
      font: queryFont,
    };
    const measured = measureTag(ctx, focusText, { ...focusOptions, align: 'left' });
    const gap = 5;
    const candidates = [
      { x: focus.aabb.maxX + gap, y: focus.center.y, align: 'left', bias: 0 },
      { x: focus.aabb.minX - gap, y: focus.center.y, align: 'right', bias: 14 },
      { x: focus.center.x, y: focus.aabb.minY - 11, align: 'center', bias: 26 },
      { x: focus.center.x, y: focus.aabb.maxY + 11, align: 'center', bias: 34 },
    ];
    let best = null;
    for (const candidate of candidates) {
      const rect = tagRectAt(candidate.x, candidate.y, { ...measured, align: candidate.align });
      let score = candidate.bias;
      if (rect.left < field.x + 3 || rect.right > field.x + field.w - 3) score += 2000;
      if (rect.top < field.y + 3 || rect.bottom > field.y + field.h - 3) score += 2000;
      if (rectsOverlap(rect, queryRect, 2)) score += 4000;
      if (rectsOverlap(rect, probe.aabb, 2)) score += 800;
      if (rectsOverlap(rect, focus.aabb, 2)) score += 350;
      if (!best || score < best.score) best = { ...candidate, rect, score };
    }
    drawTag(ctx, focusText, best.x, best.y, { ...focusOptions, align: best.align, font: queryFont });
  }

  drawTag(ctx, 'QUERY', queryX, queryY, queryOptions);
}

function drawFieldFrame(ctx, field) {
  const { x, y, w, h } = field;
  const length = 13;
  ctx.save();
  ctx.strokeStyle = 'rgba(44, 100, 111, 0.22)';
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(x, y + length);
  ctx.lineTo(x, y);
  ctx.lineTo(x + length, y);
  ctx.moveTo(x + w - length, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + length);
  ctx.moveTo(x + w, y + h - length);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x + w - length, y + h);
  ctx.moveTo(x + length, y + h);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x, y + h - length);
  ctx.stroke();
  ctx.restore();
}

export function renderScene(canvas, state) {
  const rect = canvas.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const pixelWidth = Math.round(rect.width * dpr);
  const pixelHeight = Math.round(rect.height * dpr);
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);

  const {
    field,
    bodies,
    probe,
    broad,
    focus,
    focusGjk,
    candidateSet,
    hitSet,
    showAllAabbs,
    time,
  } = state;

  drawFieldFrame(ctx, field);

  if (broad.overlay.kind === 'grid') drawGridOverlay(ctx, field, broad.overlay);
  else if (broad.overlay.kind === 'quadtree') drawQuadtreeOverlay(ctx, field, broad.overlay);
  else if (broad.overlay.kind === 'brute') drawBruteOverlay(ctx, probe, bodies, field, candidateSet, hitSet);
  else if (broad.overlay.kind === 'sap') drawSweepOverlay(ctx, field, broad.overlay, candidateSet, hitSet);

  if (showAllAabbs) {
    for (const body of bodies) {
      if (candidateSet.has(body.id) || hitSet.has(body.id)) continue;
      drawAabb(ctx, body.aabb, {
        color: 'rgba(63, 111, 120, 0.19)',
        dash: [3, 4],
        width: 0.8,
      });
    }
  }

  for (const body of bodies) {
    const status = hitSet.has(body.id) ? 'hit' : candidateSet.has(body.id) ? 'candidate' : 'idle';
    drawBody(ctx, body, status, time);
  }

  drawFocus(ctx, probe, focus, focusGjk, time);
  drawProbe(ctx, probe, Boolean(focusGjk && focusGjk.hit), time);

  if (showAllAabbs || candidateSet.size) {
    for (const body of bodies) {
      if (!candidateSet.has(body.id)) continue;
      const hit = hitSet.has(body.id);
      const isFocus = focus && focus.id === body.id;
      drawAabb(ctx, body.aabb, {
        color: hit ? alpha(COLORS.coral, isFocus ? 0.7 : 0.5) : alpha(COLORS.amber, isFocus ? 0.65 : 0.45),
        dash: [5, 4],
        width: isFocus ? 1.15 : 0.9,
        fill: hit ? 'rgba(212, 95, 75, 0.035)' : 'rgba(203, 136, 67, 0.03)',
        corners: isFocus,
        cornerColor: hit ? alpha(COLORS.coral, 0.85) : alpha(COLORS.amber, 0.8),
      });
    }
  }

  drawAabb(ctx, probe.aabb, {
    color: 'rgba(17, 106, 134, 0.52)',
    dash: [4, 4],
    width: 1.05,
    fill: 'rgba(38, 128, 157, 0.022)',
    corners: true,
    cornerColor: 'rgba(17, 106, 134, 0.78)',
  });

  drawSceneLabels(ctx, probe, focus, focusGjk, field);
}

/* --------------------------------------------------------------------------
   Minkowski / simplex inset
   -------------------------------------------------------------------------- */

function drawMinkowskiIdle(ctx, width, height, label) {
  ctx.save();
  ctx.strokeStyle = 'rgba(106, 95, 201, 0.18)';
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 4]);
  ctx.beginPath();
  ctx.arc(width * 0.5, height * 0.5, Math.min(width, height) * 0.26, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = 'rgba(106, 95, 201, 0.2)';
  ctx.beginPath();
  ctx.moveTo(width * 0.5 - 8, height * 0.5);
  ctx.lineTo(width * 0.5 + 8, height * 0.5);
  ctx.moveTo(width * 0.5, height * 0.5 - 8);
  ctx.lineTo(width * 0.5, height * 0.5 + 8);
  ctx.stroke();
  ctx.fillStyle = 'rgba(106, 95, 201, 0.52)';
  ctx.font = `500 7px ${UI_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, width * 0.5, height * 0.5 + 24);
  ctx.restore();
}

export function renderMinkowski(canvas, data, time) {
  const rect = canvas.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const pixelWidth = Math.round(rect.width * dpr);
  const pixelHeight = Math.round(rect.height * dpr);
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);
  const width = rect.width;
  const height = rect.height;

  if (!data || data.idle) {
    drawMinkowskiIdle(ctx, width, height, data && data.label ? data.label : '等待 AABB 候选');
    return;
  }

  const { hull = [], simplex = [], trace = [], hit = false } = data;
  const all = [{ x: 0, y: 0 }, ...hull, ...trace.map((entry) => entry.support)];
  if (simplex) all.push(...simplex);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of all) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  const extentX = Math.max(26, maxX - minX);
  const extentY = Math.max(20, maxY - minY);
  const pad = 10;
  const scale = Math.min((width - pad * 2) / (extentX * 1.18), (height - pad * 2) / (extentY * 1.18));
  const centerX = (minX + maxX) * 0.5;
  const centerY = (minY + maxY) * 0.5;
  const toScreen = (p) => ({
    x: width * 0.5 + (p.x - centerX) * scale,
    y: height * 0.5 - (p.y - centerY) * scale,
  });
  const origin = toScreen({ x: 0, y: 0 });

  ctx.save();
  // A quiet dot grid gives the inset a measured-diagram feel.
  ctx.fillStyle = 'rgba(106, 95, 201, 0.085)';
  for (let x = 12; x < width; x += 14) {
    for (let y = 10; y < height; y += 14) {
      ctx.beginPath();
      ctx.arc(x, y, 0.65, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Faint axis crosshair through the origin.
  ctx.strokeStyle = 'rgba(106, 95, 201, 0.12)';
  ctx.lineWidth = 0.7;
  ctx.setLineDash([2, 4]);
  ctx.beginPath();
  ctx.moveTo(0, origin.y + 0.5);
  ctx.lineTo(width, origin.y + 0.5);
  ctx.moveTo(origin.x + 0.5, 0);
  ctx.lineTo(origin.x + 0.5, height);
  ctx.stroke();
  ctx.setLineDash([]);

  if (hull.length >= 3) {
    const hullPoints = hull.map(toScreen);
    polygonPath(ctx, hullPoints);
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, 'rgba(106, 95, 201, 0.1)');
    gradient.addColorStop(1, 'rgba(106, 95, 201, 0.035)');
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.strokeStyle = 'rgba(106, 95, 201, 0.33)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Support points: hollow markers, starting at the oldest one.
  for (let i = 0; i < trace.length; i += 1) {
    const point = toScreen(trace[i].support);
    ctx.beginPath();
    ctx.arc(point.x, point.y, 1.7, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.fill();
    ctx.strokeStyle = i === trace.length - 1 ? alpha(COLORS.violet, 0.8) : alpha(COLORS.violet, 0.42);
    ctx.lineWidth = 0.9;
    ctx.stroke();
  }

  if (simplex.length === 3) {
    const triangle = simplex.map(toScreen);
    polygonPath(ctx, triangle);
    ctx.fillStyle = alpha(COLORS.violet, 0.15);
    ctx.fill();
    ctx.strokeStyle = alpha(COLORS.violet, 0.9);
    ctx.lineWidth = 1.3;
    ctx.lineJoin = 'round';
    ctx.stroke();
    for (const point of triangle) {
      ctx.beginPath();
      ctx.arc(point.x, point.y, 2.2, 0, Math.PI * 2);
      ctx.fillStyle = COLORS.violet;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.lineWidth = 0.9;
      ctx.stroke();
    }
  } else if (simplex.length === 2) {
    const [a, b] = simplex.map(toScreen);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = alpha(COLORS.violet, 0.92);
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    ctx.stroke();
    for (const point of [a, b]) {
      ctx.beginPath();
      ctx.arc(point.x, point.y, 2.1, 0, Math.PI * 2);
      ctx.fillStyle = COLORS.violet;
      ctx.fill();
    }
  } else if (simplex.length === 1) {
    const point = toScreen(simplex[0]);
    ctx.beginPath();
    ctx.arc(point.x, point.y, 2.8, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.violet;
    ctx.fill();
  }

  // Origin marker. A hit fills it; a miss keeps it hollow.
  const pulse = 0.5 + 0.5 * Math.sin(time * 3);
  if (hit) {
    ctx.beginPath();
    ctx.arc(origin.x, origin.y, 8 + pulse * 3, 0, Math.PI * 2);
    ctx.fillStyle = alpha(COLORS.coral, 0.08 + pulse * 0.03);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(origin.x, origin.y, 4, 0, Math.PI * 2);
  ctx.fillStyle = hit ? alpha(COLORS.coral, 0.96) : 'rgba(255, 255, 255, 0.96)';
  ctx.fill();
  ctx.strokeStyle = alpha(COLORS.coral, 0.92);
  ctx.lineWidth = 1.1;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(origin.x - 8, origin.y + 0.5);
  ctx.lineTo(origin.x - 5, origin.y + 0.5);
  ctx.moveTo(origin.x + 5, origin.y + 0.5);
  ctx.lineTo(origin.x + 8, origin.y + 0.5);
  ctx.moveTo(origin.x + 0.5, origin.y - 8);
  ctx.lineTo(origin.x + 0.5, origin.y - 5);
  ctx.moveTo(origin.x + 0.5, origin.y + 5);
  ctx.lineTo(origin.x + 0.5, origin.y + 8);
  ctx.strokeStyle = alpha(COLORS.coral, 0.55);
  ctx.lineWidth = 0.8;
  ctx.stroke();

  ctx.font = `600 6.5px ${MONO_FONT}`;
  ctx.fillStyle = 'rgba(154, 124, 115, 0.8)';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('O', origin.x + 6, origin.y - 8);
  ctx.restore();
}

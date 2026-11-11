import {
  BROAD_PHASE_ALGORITHMS,
  BROAD_PHASE_BY_ID,
  runBroadPhase,
} from './broadphase.js';
import {
  aabbDistanceSq,
  aabbOverlap,
  boundsOf,
  createLocalPolygon,
  minkowskiDifferenceHull,
  transformPolygon,
} from './geometry.js';
import { gjk } from './gjk.js';
import { clamp, damp, makeRandom, range, TAU } from './math.js';
import { renderMinkowski, renderScene } from './renderer.js';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const canvas = $('#scene');
const stage = $('#stage');
const paramsPanel = $('#paramsPanel');
const collapseBtn = $('#collapseBtn');
const algoCards = $$('.algo-card');
const bodyCountInput = $('#bodyCount');
const bodyCountOut = $('#bodyCountOut');
const aabbToggle = $('#aabbToggle');
const resetBtn = $('#resetBtn');
const shuffleBtn = $('#shuffleBtn');
const pauseBtn = $('#pauseBtn');
const roamToggle = $('#roamToggle');
const roamText = $('#roamText');
const livePill = $('#livePill');
const liveText = $('#liveText');
const hintText = $('#hintText');
const focusChip = $('#focusChip');
const focusName = $('#focusName');
const focusState = $('#focusState');
const algoNoteText = $('#algoNoteText');
const broadTitle = $('#broadTitle');
const broadDesc = $('#broadDesc');
const broadFig = $('#broadFig');
const broadFormula = $('#broadFormula');
const broadLiveLabel = $('#broadLiveLabel');
const broadLive = $('#broadLive');
const broadExtra = $('#broadExtra');
const liveQueryAabb = $('#liveQueryAabb');
const liveAabbCount = $('#liveAabbCount');
const liveGjkIter = $('#liveGjkIter');
const liveGjkShape = $('#liveGjkShape');
const liveGjkState = $('#liveGjkState');
const liveVerdict = $('#liveVerdict');
const liveDistance = $('#liveDistance');
const liveCalls = $('#liveCalls');
const verdictQuiet = $('#verdictQuiet');
const minkowskiCanvas = $('#minkowskiCanvas');
const minkowskiMeta = $('#minkowskiMeta');
const minkowskiCard = $('#minkowskiCard');
const minkowskiState = $('#minkowskiState');
const statBodies = $('#statBodies');
const statCandidates = $('#statCandidates');
const statHits = $('#statHits');
const statCut = $('#statCut');
const toast = $('#toast');
const explainerScroll = $('#explainerScroll');
const scrollCue = $('#scrollCue');

const ALGO_NOTES = {
  brute: '每个包围盒都直接求交，适合小规模场景。',
  sap: '排序后只扫描 x 区间相接的一段。',
  grid: '只读查询盒压住的少数格子，再合并去重。',
  quad: '递归细分空间，只访问与查询盒相交的节点。',
};

const SIMPLEX_NAMES = {
  1: '点',
  2: '线段',
  3: '三角形',
};

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const state = {
  stageWidth: 0,
  stageHeight: 0,
  field: null,
  layout: { cols: 5, rows: 4 },
  seed: 20261111,
  count: 16,
  algorithmId: 'grid',
  bodies: [],
  probe: null,
  paused: false,
  autoRoam: !prefersReducedMotion,
  showAllAabbs: true,
  time: 0,
  target: null,
  targetKind: null,
  lastKind: 'overlap',
  lastBodyId: null,
  targetTravel: 0,
  dwell: 2.2,
  dragging: false,
  focusPinnedId: null,
  broad: null,
  candidates: [],
  candidateSet: new Set(),
  hitSet: new Set(),
  hits: [],
  gjkByBody: new Map(),
  focus: null,
  focusGjk: null,
  minkowskiData: { idle: true, label: '等待 AABB 候选' },
  lastFrame: 0,
  lastUiUpdate: 0,
  toastTimer: 0,
  resizeTimer: 0,
  booted: false,
};

/* --------------------------------------------------------------------------
   Layout & geometry
   -------------------------------------------------------------------------- */

function computeField(width, height) {
  const side = clamp(width * 0.042, 16, 44);
  const top = clamp(height * 0.105, 58, 86);
  const bottom = clamp(height * 0.105, 52, 78);
  return {
    x: side,
    y: top,
    w: Math.max(150, width - side * 2),
    h: Math.max(130, height - top - bottom),
  };
}

function chooseGrid(count, field) {
  const fieldAspect = field.w / Math.max(1, field.h);
  let best = { cols: 2, rows: Math.ceil(count / 2), score: Infinity };
  for (let cols = 2; cols <= count; cols += 1) {
    const rows = Math.ceil(count / cols);
    const cellAspect = fieldAspect * (rows / cols);
    const distortion = Math.abs(Math.log(Math.max(0.001, cellAspect)));
    const waste = cols * rows - count;
    // Prefer roughly square cells, then layouts that leave fewer empty slots.
    const score = distortion + (waste / Math.max(1, count)) * 0.9;
    if (score < best.score) best = { cols, rows, score };
  }
  return { cols: best.cols, rows: best.rows };
}

function assignPositions(bodies, cols, rows) {
  const random = makeRandom((state.seed ^ 0x9e3779b9) >>> 0);
  const slots = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) slots.push({ col, row });
  }
  for (let i = slots.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }
  bodies.forEach((body, index) => {
    const slot = slots[index % slots.length];
    const jitterX = range(random, -0.1, 0.1);
    const jitterY = range(random, -0.1, 0.1);
    body.nx = clamp((slot.col + 0.5 + jitterX) / cols, 0.04, 0.96);
    body.ny = clamp((slot.row + 0.5 + jitterY) / rows, 0.05, 0.95);
  });
}

function baseBodyRadius() {
  const { cols, rows } = state.layout;
  const cell = Math.min(state.field.w / cols, state.field.h / rows);
  return clamp(cell * 0.37, 16, 66);
}

function probeRadius() {
  return clamp(baseBodyRadius() * 0.86, 21, 52);
}

function createBodies() {
  const random = makeRandom((state.seed + 0x27d4eb) >>> 0);
  const vertexCounts = [3, 4, 4, 5, 5, 5, 6, 6, 6, 7];
  const bodies = [];
  for (let i = 0; i < state.count; i += 1) {
    const vertexCount = vertexCounts[Math.floor(random() * vertexCounts.length)];
    const local = createLocalPolygon(random, vertexCount);
    bodies.push({
      id: i,
      local,
      sizeFactor: range(random, 0.84, 1.04),
      angle: range(random, 0, TAU),
      spin: !prefersReducedMotion && random() < 0.68 ? range(random, -0.14, 0.14) : 0,
      nx: 0.5,
      ny: 0.5,
      x: 0,
      y: 0,
      radius: 0,
      vertices: [],
      aabb: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
      center: { x: 0, y: 0 },
    });
  }
  return bodies;
}

function createProbe() {
  const random = makeRandom((state.seed + 0x4013) >>> 0);
  return {
    local: createLocalPolygon(random, 6),
    nx: 0.58,
    ny: 0.48,
    angle: range(random, 0, TAU),
    spin: prefersReducedMotion ? 0 : range(random, 0.1, 0.2) * (random() < 0.5 ? -1 : 1),
    x: 0,
    y: 0,
    radius: 40,
    vertices: [],
    aabb: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
    center: { x: 0, y: 0 },
  };
}

function refreshBody(body) {
  const base = baseBodyRadius();
  body.x = state.field.x + body.nx * state.field.w;
  body.y = state.field.y + body.ny * state.field.h;
  body.radius = base * body.sizeFactor;
  body.center.x = body.x;
  body.center.y = body.y;
  body.vertices = transformPolygon(body.local, body.x, body.y, body.angle, body.radius);
  body.aabb = boundsOf(body.vertices);
}

function refreshProbeGeometryOnly() {
  const probe = state.probe;
  probe.radius = probeRadius();
  probe.x = state.field.x + probe.nx * state.field.w;
  probe.y = state.field.y + probe.ny * state.field.h;
  probe.center.x = probe.x;
  probe.center.y = probe.y;
  probe.vertices = transformPolygon(probe.local, probe.x, probe.y, probe.angle, probe.radius);
  probe.aabb = boundsOf(probe.vertices);
}

function refreshGeometry() {
  for (const body of state.bodies) refreshBody(body);
  refreshProbeGeometryOnly();
}

function applyField() {
  state.stageWidth = Math.max(1, stage.clientWidth);
  state.stageHeight = Math.max(1, stage.clientHeight);
  state.field = computeField(state.stageWidth, state.stageHeight);
}

function rebuildWorld({ initialProbe = false, newProbe = false } = {}) {
  applyField();
  state.layout = chooseGrid(state.count, state.field);
  state.bodies = createBodies();
  assignPositions(state.bodies, state.layout.cols, state.layout.rows);
  if (newProbe || !state.probe) state.probe = createProbe();
  state.focusPinnedId = null;
  state.target = null;
  state.targetTravel = 0;
  state.dwell = 1.2;
  state.lastBodyId = null;
  refreshGeometry();
  if (initialProbe) {
    placeProbeInitialOverlap();
  } else {
    nudgeProbeOutOfOverlays();
    refreshProbeGeometryOnly();
  }
  updateStaticUI();
}

function reflowWorld() {
  applyField();
  const nextLayout = chooseGrid(state.count, state.field);
  const previous = state.layout;
  state.layout = nextLayout;
  if (nextLayout.cols !== previous.cols || nextLayout.rows !== previous.rows) {
    assignPositions(state.bodies, nextLayout.cols, nextLayout.rows);
  }
  state.target = null;
  state.targetTravel = 0;
  state.dwell = Math.min(state.dwell, 0.5);
  refreshGeometry();
  nudgeProbeOutOfOverlays();
  refreshProbeGeometryOnly();
}

function pointInRect(x, y, rect, padding = 0) {
  return x >= rect.left - padding && x <= rect.right + padding && y >= rect.top - padding && y <= rect.bottom + padding;
}

function rectForElement(element, padding) {
  if (!element || element.offsetWidth === 0 || element.offsetHeight === 0) return null;
  const stageRect = stage.getBoundingClientRect();
  const rect = element.getBoundingClientRect();
  return {
    left: rect.left - stageRect.left - padding,
    top: rect.top - stageRect.top - padding,
    right: rect.right - stageRect.left + padding,
    bottom: rect.bottom - stageRect.top + padding,
  };
}

function getOverlayBlockers() {
  const rects = [];
  const params = rectForElement(paramsPanel, 13);
  if (params) rects.push(params);
  const card = rectForElement(minkowskiCard, 9);
  if (card) rects.push(card);
  return rects;
}

function pointBlocked(x, y, padding = 0) {
  return getOverlayBlockers().some((rect) => pointInRect(x, y, rect, padding));
}

function pushCenterOutOfRect(rect, cx, cy, edgeGap) {
  const margin = state.probe.radius * 0.55;
  const minX = state.field.x + margin;
  const maxX = state.field.x + state.field.w - margin;
  const minY = state.field.y + margin;
  const maxY = state.field.y + state.field.h - margin;
  const candidates = [
    { x: rect.right + edgeGap, y: cy, distance: rect.right + edgeGap - cx },
    { x: rect.left - edgeGap, y: cy, distance: cx - (rect.left - edgeGap) },
    { x: cx, y: rect.bottom + edgeGap, distance: rect.bottom + edgeGap - cy },
    { x: cx, y: rect.top - edgeGap, distance: cy - (rect.top - edgeGap) },
  ].filter((candidate) => candidate.x >= minX && candidate.x <= maxX && candidate.y >= minY && candidate.y <= maxY);
  candidates.sort((a, b) => a.distance - b.distance);
  return candidates[0] || { x: clamp(cx, minX, maxX), y: clamp(cy, minY, maxY) };
}

function constrainProbePosition(x, y) {
  const probe = state.probe;
  const margin = probe.radius * 0.55;
  let cx = clamp(x, state.field.x + margin, state.field.x + state.field.w - margin);
  let cy = clamp(y, state.field.y + margin, state.field.y + state.field.h - margin);
  for (let pass = 0; pass < 2; pass += 1) {
    for (const rect of getOverlayBlockers()) {
      if (!pointInRect(cx, cy, rect, 3)) continue;
      const next = pushCenterOutOfRect(rect, cx, cy, probe.radius * 0.7);
      cx = next.x;
      cy = next.y;
    }
  }
  return {
    x: clamp(cx, state.field.x + margin, state.field.x + state.field.w - margin),
    y: clamp(cy, state.field.y + margin, state.field.y + state.field.h - margin),
  };
}

function nudgeProbeOutOfOverlays() {
  const probe = state.probe;
  if (!pointBlocked(probe.x, probe.y, 3)) return;
  const next = constrainProbePosition(probe.x, probe.y);
  probe.nx = (next.x - state.field.x) / state.field.w;
  probe.ny = (next.y - state.field.y) / state.field.h;
}

function placeProbeInitialOverlap() {
  const aim = {
    x: state.field.x + state.field.w * 0.62,
    y: state.field.y + state.field.h * 0.52,
  };
  const visible = state.bodies
    .filter((body) => !pointBlocked(body.center.x, body.center.y, 18))
    .sort((a, b) => Math.hypot(a.center.x - aim.x, a.center.y - aim.y) - Math.hypot(b.center.x - aim.x, b.center.y - aim.y));
  const pool = visible.length ? visible : state.bodies.slice();

  let found = false;
  outer: for (const body of pool.slice(0, 8)) {
    const baseAngle = (body.id * 1.9 + 0.65) % TAU;
    state.probe.angle = (baseAngle + 1.15) % TAU;
    const radiiSum = body.radius + state.probe.radius;
    for (const fraction of [0.62, 0.54, 0.46, 0.36, 0.24, 0.12]) {
      const offset = radiiSum * fraction;
      const px = body.center.x + Math.cos(baseAngle) * offset;
      const py = body.center.y + Math.sin(baseAngle) * offset;
      if (pointBlocked(px, py, state.probe.radius * 0.25)) continue;
      state.probe.nx = (px - state.field.x) / state.field.w;
      state.probe.ny = (py - state.field.y) / state.field.h;
      refreshProbeGeometryOnly();
      const result = gjk(state.probe.vertices, body.vertices, {
        centerA: state.probe.center,
        centerB: body.center,
      });
      if (result.hit) {
        found = true;
        state.lastBodyId = body.id;
        break outer;
      }
    }
  }

  if (!found) {
    state.probe.nx = 0.58;
    state.probe.ny = 0.48;
    refreshProbeGeometryOnly();
    nudgeProbeOutOfOverlays();
  }
  state.target = null;
  state.targetKind = null;
  state.lastKind = 'overlap';
  state.dwell = 2.2;
}

/* --------------------------------------------------------------------------
   Detection
   -------------------------------------------------------------------------- */

function chooseFocus(candidates, gjkByBody) {
  if (state.focusPinnedId !== null) {
    const pinned = candidates.find((body) => body.id === state.focusPinnedId);
    if (pinned) return pinned;
    state.focusPinnedId = null;
  }
  const sorted = candidates.slice().sort((a, b) => {
    const aHit = gjkByBody.get(a.id)?.hit ? 1 : 0;
    const bHit = gjkByBody.get(b.id)?.hit ? 1 : 0;
    if (aHit !== bHit) return bHit - aHit;
    const aGap = aabbDistanceSq(state.probe.aabb, a.aabb);
    const bGap = aabbDistanceSq(state.probe.aabb, b.aabb);
    if (Math.abs(aGap - bGap) > 1e-6) return aGap - bGap;
    const aDistance = (a.center.x - state.probe.center.x) ** 2 + (a.center.y - state.probe.center.y) ** 2;
    const bDistance = (b.center.x - state.probe.center.x) ** 2 + (b.center.y - state.probe.center.y) ** 2;
    return aDistance - bDistance;
  });
  return sorted[0] || null;
}

function updateDetection() {
  if (!state.field) return;
  const probeShape = {
    id: 'probe',
    aabb: state.probe.aabb,
    center: state.probe.center,
  };
  const broad = runBroadPhase(state.algorithmId, probeShape, state.bodies, state.field);
  const candidates = broad.candidates.slice();
  const candidateSet = new Set(candidates.map((body) => body.id));
  const gjkByBody = new Map();
  const hits = [];

  for (const body of candidates) {
    const result = gjk(state.probe.vertices, body.vertices, {
      centerA: state.probe.center,
      centerB: body.center,
    });
    gjkByBody.set(body.id, result);
    if (result.hit) hits.push(body);
  }

  const hitSet = new Set(hits.map((body) => body.id));
  const focus = chooseFocus(candidates, gjkByBody);
  const focusGjk = focus ? gjkByBody.get(focus.id) : null;

  state.broad = broad;
  state.candidates = candidates;
  state.candidateSet = candidateSet;
  state.hits = hits;
  state.hitSet = hitSet;
  state.gjkByBody = gjkByBody;
  state.focus = focus || null;
  state.focusGjk = focusGjk || null;

  if (focus && focusGjk) {
    const hull = minkowskiDifferenceHull(state.probe.vertices, focus.vertices);
    state.minkowskiData = {
      idle: false,
      hull,
      simplex: focusGjk.simplex,
      trace: focusGjk.trace,
      hit: focusGjk.hit,
    };
  } else {
    state.minkowskiData = { idle: true, label: '等待 AABB 候选' };
  }
}

/* --------------------------------------------------------------------------
   Auto tour
   -------------------------------------------------------------------------- */

function chooseTarget() {
  const probe = state.probe;
  const lastBody = state.bodies.find((body) => body.id === state.lastBodyId);
  const visibleBodies = state.bodies.filter(
    (body) => !pointBlocked(body.center.x, body.center.y, 12) && body.id !== state.lastBodyId,
  );
  const wantOverlap = state.lastKind !== 'overlap';
  // Stay on the same obstacle for the near-miss, then tour on to a fresh one.
  let pool;
  if (!wantOverlap) {
    pool = lastBody && !pointBlocked(lastBody.center.x, lastBody.center.y, 12) ? [lastBody] : visibleBodies;
  } else {
    pool = visibleBodies.length ? visibleBodies : state.bodies.filter((body) => body.id !== state.lastBodyId);
  }
  let chosen = null;

  for (let attempt = 0; attempt < 14; attempt += 1) {
    const body = pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
    if (!body) break;
    const angle = Math.random() * TAU;
    let tx;
    let ty;
    if (wantOverlap) {
      const offset = (body.radius + probe.radius) * range(Math.random, 0.5, 0.66);
      tx = body.center.x + Math.cos(angle) * offset;
      ty = body.center.y + Math.sin(angle) * offset;
    } else {
      // Park just outside the obstacle: the AABBs often still overlap while
      // the actual polygons do not, which is the perfect miss-state demo.
      const distance = (body.radius + probe.radius) * range(Math.random, 1.035, 1.18) + 3;
      tx = body.center.x + Math.cos(angle) * distance;
      ty = body.center.y + Math.sin(angle) * distance;
    }
    const margin = probe.radius * 0.75;
    tx = clamp(tx, state.field.x + margin, state.field.x + state.field.w - margin);
    ty = clamp(ty, state.field.y + margin, state.field.y + state.field.h - margin);
    if (pointBlocked(tx, ty, probe.radius * 0.5)) continue;
    chosen = { body, x: tx, y: ty };
    break;
  }

  if (!chosen) {
    const fallback = constrainProbePosition(
      state.field.x + state.field.w * 0.62,
      state.field.y + state.field.h * 0.58,
    );
    chosen = { body: null, x: fallback.x, y: fallback.y };
  }

  state.target = {
    nx: (chosen.x - state.field.x) / state.field.w,
    ny: (chosen.y - state.field.y) / state.field.h,
  };
  state.targetKind = wantOverlap ? 'overlap' : 'miss';
  state.lastKind = state.targetKind;
  state.targetTravel = 0;
  if (chosen.body) state.lastBodyId = chosen.body.id;
}

function cancelTarget() {
  state.target = null;
  state.targetTravel = 0;
  state.dwell = Math.max(state.dwell, 0.45);
}

function updateAuto(dt) {
  if (!state.autoRoam) return;

  if (state.target) {
    const probe = state.probe;
    if (pointBlocked(
      state.field.x + state.target.nx * state.field.w,
      state.field.y + state.target.ny * state.field.h,
      2,
    )) {
      cancelTarget();
      return;
    }
    const dx = (state.target.nx - probe.nx) * state.field.w;
    const dy = (state.target.ny - probe.ny) * state.field.h;
    const distance = Math.hypot(dx, dy);
    state.targetTravel += dt;
    probe.nx = damp(probe.nx, state.target.nx, 1.35, dt);
    probe.ny = damp(probe.ny, state.target.ny, 1.35, dt);
    if (distance < 2.4 || state.targetTravel > 8.5) {
      probe.nx = state.target.nx;
      probe.ny = state.target.ny;
      const kind = state.targetKind;
      state.target = null;
      state.targetTravel = 0;
      state.dwell = kind === 'overlap' ? 1.7 : 1.25;
    }
    return;
  }

  state.dwell -= dt;
  if (state.dwell <= 0) chooseTarget();
}

/* --------------------------------------------------------------------------
   UI synchronisation
   -------------------------------------------------------------------------- */

function setTone(element, tone) {
  element.classList.toggle('is-hit', tone === 'hit');
  element.classList.toggle('is-miss', tone === 'miss');
  element.classList.toggle('is-idle', tone === 'idle');
}

function updateStaticUI() {
  statBodies.textContent = String(state.bodies.length);
  if (bodyCountInput.value !== String(state.count)) bodyCountInput.value = String(state.count);
  bodyCountOut.textContent = String(state.count);
  const min = Number(bodyCountInput.min);
  const max = Number(bodyCountInput.max);
  const percentage = ((state.count - min) / Math.max(1, max - min)) * 100;
  bodyCountInput.style.setProperty('--fill', `${percentage}%`);

  for (const card of algoCards) {
    const active = card.dataset.algo === state.algorithmId;
    card.classList.toggle('is-active', active);
    card.setAttribute('aria-pressed', String(active));
  }

  aabbToggle.classList.toggle('is-on', state.showAllAabbs);
  aabbToggle.setAttribute('aria-pressed', String(state.showAllAabbs));
  roamToggle.classList.toggle('is-on', state.autoRoam);
  roamToggle.setAttribute('aria-pressed', String(state.autoRoam));
  roamText.textContent = state.autoRoam ? '自动巡游' : '手动控制';
  pauseBtn.classList.toggle('is-paused', state.paused);
  pauseBtn.setAttribute('aria-label', state.paused ? '继续检测' : '暂停检测');
  livePill.classList.toggle('is-paused', state.paused);
  liveText.textContent = state.paused ? '已暂停' : '实时检测';
  hintText.textContent = state.autoRoam ? '拖动查询体接管 · 空格暂停 · R 重排' : '拖动查询体 · 空格暂停 · R 重排';
  verdictQuiet.textContent = '布尔结果';
}

function applyAlgorithmUI() {
  const algorithm = BROAD_PHASE_BY_ID[state.algorithmId];
  algoNoteText.textContent = ALGO_NOTES[algorithm.id];
  broadTitle.textContent = algorithm.stepTitle;
  broadDesc.textContent = algorithm.stepDesc;
  broadFormula.innerHTML = algorithm.formulaHtml;
  broadLiveLabel.textContent = algorithm.liveLabel;
  const card = algoCards.find((item) => item.dataset.algo === algorithm.id);
  const icon = card ? card.querySelector('.algo-icon svg') : null;
  if (icon) broadFig.innerHTML = icon.outerHTML;
  updateStaticUI();
  requestAnimationFrame(updateScrollCue);
}

function simplexText(length) {
  return SIMPLEX_NAMES[length] || '—';
}

function updateBroadPhaseLive(broad) {
  const metrics = broad.metrics;
  switch (broad.algorithm.id) {
    case 'sap':
      broadLive.textContent = `${metrics.scanned} / ${metrics.sorted} 段`;
      broadExtra.textContent = `x 投影重叠 ${metrics.xOverlaps} 段`;
      break;
    case 'grid':
      broadLive.textContent = `${metrics.cellsVisited} / ${metrics.cellsTotal} 格`;
      broadExtra.textContent = `收集 ${metrics.bodiesCollected} 个物体做 AABB 检查`;
      break;
    case 'quad':
      broadLive.textContent = `${metrics.nodesVisited} / ${metrics.nodesTotal} 节点`;
      broadExtra.textContent = `检查 ${metrics.nodesExamined} 节点 · ${metrics.bodiesCollected} 个物体`;
      break;
    case 'brute':
    default:
      broadLive.textContent = `${metrics.scanned} / ${state.bodies.length} 个`;
      broadExtra.textContent = '无预处理 · 全部测试';
      break;
  }
}

function updateReadouts(force = false) {
  if (!state.broad) return;
  const broad = state.broad;
  const candidateCount = state.candidates.length;
  const hitCount = state.hits.length;
  const focus = state.focus;
  const focusGjk = state.focusGjk;
  const isHit = Boolean(focusGjk && focusGjk.hit);
  const isMiss = Boolean(focusGjk && !focusGjk.hit);
  const tone = isHit ? 'hit' : isMiss ? 'miss' : 'idle';

  statCandidates.textContent = String(candidateCount);
  statHits.textContent = String(hitCount);
  const excluded = state.bodies.length ? Math.round((1 - candidateCount / state.bodies.length) * 100) : 0;
  statCut.textContent = candidateCount === 0 ? '全部排除' : `已排除 ${excluded}%`;

  const queryWidth = state.probe.aabb.maxX - state.probe.aabb.minX;
  const queryHeight = state.probe.aabb.maxY - state.probe.aabb.minY;
  liveQueryAabb.textContent = `${Math.round(queryWidth)} × ${Math.round(queryHeight)} px`;
  liveAabbCount.textContent = `${broad.examined} 个`;
  liveCalls.textContent = `${candidateCount} 次`;

  if (focus) {
    focusName.textContent = `查询体 ↔ 障碍体 ${String(focus.id + 1).padStart(2, '0')}`;
    focusState.textContent = isHit ? '相交' : '分离';
  } else {
    focusName.textContent = '没有 AABB 候选';
    focusState.textContent = '无候选';
  }
  setTone(focusState, tone);

  liveGjkIter.textContent = focusGjk ? `${focusGjk.iterations} 次` : '—';
  liveGjkShape.textContent = focusGjk ? simplexText(focusGjk.simplex.length) : '—';
  liveGjkState.textContent = isHit ? '相交' : isMiss ? '分离' : '等待';
  setTone(liveGjkState, tone);

  liveVerdict.textContent = isHit ? '相交' : isMiss ? '分离' : '—';
  setTone(liveVerdict, tone);
  liveDistance.textContent = focusGjk ? (focusGjk.hit ? '0.0 px' : `${focusGjk.distance.toFixed(1)} px`) : '—';
  minkowskiState.textContent = focusGjk ? (isHit ? '相交' : '分离') : '等待候选';
  setTone(minkowskiState, tone);
  minkowskiMeta.textContent = focusGjk
    ? `${focusGjk.iterations} 轮 · ${isHit ? '原点在内' : '原点在外'}`
    : '—';

  updateBroadPhaseLive(broad);
  if (force) updateStaticUI();
}

function showToast(message, duration = 1700) {
  toast.textContent = message;
  toast.classList.add('is-visible');
  clearTimeout(state.toastTimer);
  state.toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), duration);
}

function updateScrollCue() {
  if (!explainerScroll) return;
  if (window.innerWidth <= 1100) {
    scrollCue.classList.remove('is-visible');
    return;
  }
  const overflow = explainerScroll.scrollHeight - explainerScroll.clientHeight > 18;
  const atBottom = explainerScroll.scrollTop + explainerScroll.clientHeight >= explainerScroll.scrollHeight - 22;
  scrollCue.classList.toggle('is-visible', overflow && !atBottom);
}

function setAlgorithm(algorithmId, { announce = false } = {}) {
  if (!BROAD_PHASE_BY_ID[algorithmId] || state.algorithmId === algorithmId) return;
  state.algorithmId = algorithmId;
  state.focusPinnedId = null;
  applyAlgorithmUI();
  if (announce) showToast(`已切换到 · ${BROAD_PHASE_BY_ID[algorithmId].name}`);
  updateDetection();
  updateReadouts(true);
}

function setPaused(paused) {
  if (state.paused === paused) return;
  state.paused = paused;
  updateStaticUI();
  state.lastFrame = performance.now();
}

function setAutoRoam(enabled, { silent = false } = {}) {
  if (state.autoRoam === enabled) {
    if (enabled && state.paused) setPaused(false);
    return;
  }
  state.autoRoam = enabled;
  state.target = null;
  state.targetTravel = 0;
  state.dwell = 0.35;
  if (enabled) {
    setPaused(false);
    if (!silent) showToast('自动巡游已开启');
  } else if (!silent) {
    showToast('已接管查询体');
  }
  updateStaticUI();
}

/* --------------------------------------------------------------------------
   Interaction
   -------------------------------------------------------------------------- */

function getStagePoint(event) {
  const rect = stage.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function isNearProbe(point) {
  if (!state.probe) return false;
  const dx = point.x - state.probe.center.x;
  const dy = point.y - state.probe.center.y;
  return dx * dx + dy * dy <= (state.probe.radius + 14) ** 2;
}

function onPointerDown(event) {
  if (event.button !== undefined && event.button !== 0) return;
  const point = getStagePoint(event);
  if (!isNearProbe(point)) return;
  event.preventDefault();
  state.dragging = true;
  state.target = null;
  if (state.autoRoam) setAutoRoam(false, { silent: true });
  canvas.classList.add('is-dragging');
  canvas.classList.remove('is-hovering-probe');
  canvas.setPointerCapture?.(event.pointerId);
  moveProbeTo(point.x, point.y);
}

function moveProbeTo(x, y) {
  const constrained = constrainProbePosition(x, y);
  state.probe.nx = (constrained.x - state.field.x) / state.field.w;
  state.probe.ny = (constrained.y - state.field.y) / state.field.h;
  refreshProbeGeometryOnly();
  updateDetection();
  updateReadouts();
}

function onPointerMove(event) {
  const point = getStagePoint(event);
  if (state.dragging) {
    event.preventDefault();
    moveProbeTo(point.x, point.y);
    return;
  }
  canvas.classList.toggle('is-hovering-probe', isNearProbe(point));
}

function onPointerUp(event) {
  if (!state.dragging) return;
  state.dragging = false;
  canvas.classList.remove('is-dragging');
  canvas.releasePointerCapture?.(event.pointerId);
  const point = getStagePoint(event);
  canvas.classList.toggle('is-hovering-probe', isNearProbe(point));
}

function onFocusChipClick() {
  const candidates = state.candidates.slice().sort((a, b) => a.id - b.id);
  if (!candidates.length) {
    showToast('还没有候选对，先把查询体拖到障碍体附近');
    return;
  }
  if (candidates.length === 1) {
    showToast('当前只有一个候选对');
    return;
  }
  const currentId = state.focusPinnedId ?? state.focus?.id ?? null;
  const currentIndex = candidates.findIndex((body) => body.id === currentId);
  const next = candidates[(currentIndex + 1) % candidates.length];
  state.focusPinnedId = next.id;
  showToast(`焦点 · 障碍体 ${String(next.id + 1).padStart(2, '0')}`);
  updateDetection();
  updateReadouts(true);
}

function updateBodyCount() {
  const next = clamp(Number(bodyCountInput.value) || state.count, 8, 24);
  if (next === state.count) return;
  state.count = next;
  bodyCountOut.textContent = String(state.count);
  statBodies.textContent = String(state.count);
  const min = Number(bodyCountInput.min);
  const max = Number(bodyCountInput.max);
  bodyCountInput.style.setProperty('--fill', `${((state.count - min) / Math.max(1, max - min)) * 100}%`);
  rebuildWorld({ initialProbe: false, newProbe: false });
  state.dwell = 0.35;
  updateDetection();
  updateReadouts(true);
}

function shuffle({ announce = true } = {}) {
  state.seed = Math.floor(Math.random() * 1_000_000);
  state.focusPinnedId = null;
  rebuildWorld({ initialProbe: true, newProbe: true });
  updateDetection();
  updateReadouts(true);
  if (announce) showToast('布局已重排');
  updateScrollCue();
}

function toggleCollapse() {
  const collapsed = paramsPanel.classList.toggle('is-collapsed');
  collapseBtn.setAttribute('aria-expanded', String(!collapsed));
  collapseBtn.setAttribute('aria-label', collapsed ? '展开检测设置' : '收起检测设置');
  if (!collapsed) {
    nudgeProbeOutOfOverlays();
    refreshProbeGeometryOnly();
    updateDetection();
    updateReadouts();
  }
  // The panel's footprint changes after the CSS transition; retry then.
  window.setTimeout(() => {
    nudgeProbeOutOfOverlays();
    refreshProbeGeometryOnly();
    updateDetection();
    updateReadouts();
  }, 260);
}

function bindEvents() {
  for (const card of algoCards) {
    card.addEventListener('click', () => setAlgorithm(card.dataset.algo, { announce: true }));
  }

  bodyCountInput.addEventListener('input', updateBodyCount);
  bodyCountInput.addEventListener('change', () => bodyCountInput.blur());

  aabbToggle.addEventListener('click', () => {
    state.showAllAabbs = !state.showAllAabbs;
    updateStaticUI();
  });

  roamToggle.addEventListener('click', () => setAutoRoam(!state.autoRoam));
  pauseBtn.addEventListener('click', () => setPaused(!state.paused));
  shuffleBtn.addEventListener('click', () => shuffle());
  resetBtn.addEventListener('click', () => shuffle());
  collapseBtn.addEventListener('click', toggleCollapse);
  focusChip.addEventListener('click', onFocusChipClick);

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointerleave', () => {
    if (!state.dragging) canvas.classList.remove('is-hovering-probe');
  });
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
  window.addEventListener('blur', () => {
    if (state.dragging) {
      state.dragging = false;
      canvas.classList.remove('is-dragging');
    }
  });

  explainerScroll.addEventListener('scroll', updateScrollCue, { passive: true });
  window.addEventListener('resize', () => {
    updateScrollCue();
    scheduleResize();
  });

  window.addEventListener('keydown', (event) => {
    const target = event.target;
    const isForm = target instanceof HTMLElement && (target.matches('input, button, textarea, select') || target.isContentEditable);
    if (isForm) return;
    if (event.code === 'Space') {
      event.preventDefault();
      setPaused(!state.paused);
      return;
    }
    if (event.key.toLowerCase() === 'r') {
      event.preventDefault();
      shuffle();
      return;
    }
    if (event.key.toLowerCase() === 'a') {
      event.preventDefault();
      setAutoRoam(!state.autoRoam);
      return;
    }
    const index = Number(event.key) - 1;
    if (index >= 0 && index < BROAD_PHASE_ALGORITHMS.length) {
      setAlgorithm(BROAD_PHASE_ALGORITHMS[index].id, { announce: true });
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) state.lastFrame = performance.now();
  });
}

function scheduleResize() {
  clearTimeout(state.resizeTimer);
  state.resizeTimer = window.setTimeout(() => {
    if (!state.booted) return;
    const width = stage.clientWidth;
    const height = stage.clientHeight;
    if (Math.abs(width - state.stageWidth) < 2 && Math.abs(height - state.stageHeight) < 2) return;
    reflowWorld();
    updateDetection();
    updateReadouts(true);
    updateScrollCue();
  }, 90);
}

/* --------------------------------------------------------------------------
   Frame loop
   -------------------------------------------------------------------------- */

function loop(now) {
  if (!state.booted) return;
  const dt = clamp((now - state.lastFrame) / 1000, 0, 0.05);
  state.lastFrame = now;

  if (!state.paused) {
    state.time += dt;
    for (const body of state.bodies) body.angle = (body.angle + body.spin * dt) % TAU;
    state.probe.angle = (state.probe.angle + state.probe.spin * dt) % TAU;
    updateAuto(dt);
  }

  refreshGeometry();
  updateDetection();

  renderScene(canvas, {
    field: state.field,
    bodies: state.bodies,
    probe: state.probe,
    broad: state.broad,
    focus: state.focus,
    focusGjk: state.focusGjk,
    candidateSet: state.candidateSet,
    hitSet: state.hitSet,
    showAllAabbs: state.showAllAabbs,
    time: state.time,
  });
  renderMinkowski(minkowskiCanvas, state.minkowskiData, state.time);

  if (now - state.lastUiUpdate > 85) {
    updateReadouts();
    state.lastUiUpdate = now;
  }
  requestAnimationFrame(loop);
}

/* --------------------------------------------------------------------------
   Boot
   -------------------------------------------------------------------------- */

function applyUrlOverrides() {
  const params = new URLSearchParams(window.location.search);
  const algorithm = params.get('algo');
  if (algorithm && BROAD_PHASE_BY_ID[algorithm]) state.algorithmId = algorithm;

  const countParam = params.get('n');
  if (countParam !== null) {
    const count = Number(countParam);
    if (Number.isFinite(count)) state.count = clamp(Math.round(count), 8, 24);
  }

  const seedParam = params.get('seed');
  if (seedParam !== null) {
    const seed = Number(seedParam);
    if (Number.isFinite(seed) && seed > 0) state.seed = Math.floor(seed);
  }

  if (params.get('still') === '1') {
    state.autoRoam = false;
    state.paused = true;
  }

  if (params.get('debug') === '1') {
    window.__collisionLab = state;
  }
}

function boot() {
  if (state.booted) return;
  if (!stage.clientWidth || !stage.clientHeight) {
    requestAnimationFrame(boot);
    return;
  }

  applyUrlOverrides();
  if (window.innerWidth <= 780) {
    paramsPanel.classList.add('is-collapsed');
    collapseBtn.setAttribute('aria-expanded', 'false');
    collapseBtn.setAttribute('aria-label', '展开检测设置');
  }

  state.booted = true;
  state.lastFrame = performance.now();
  rebuildWorld({ initialProbe: true, newProbe: true });
  applyAlgorithmUI();
  updateStaticUI();
  bindEvents();
  updateDetection();
  updateReadouts(true);

  new ResizeObserver(scheduleResize).observe(stage);

  requestAnimationFrame(loop);
  requestAnimationFrame(updateScrollCue);
}

boot();

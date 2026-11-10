import {
  BuoyancySimulation,
  MAX_BODIES,
  FIXED_STEP,
  bodyStatus,
} from './physics.js';
import { createShape, SHAPE_META } from './shapes.js';
import { IceRenderer, OrbitCamera, pickBody } from './renderer.js';
import { clamp, randRange, randomQuaternion } from './math.js';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const SHAPE_ICONS = {
  box: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8l8-4 8 4v9l-8 4-8-4V8Z"/><path d="M4 8l8 4 8-4M12 12v9"/></svg>',
  hex: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8l7.6 4.4v9.6L12 21.2l-7.6-4.4V7.2L12 2.8Z"/><path d="M4.4 7.2L12 11.7l7.6-4.5M12 11.7v9.5"/></svg>',
  sphere: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.4"/><ellipse cx="12" cy="12" rx="3.7" ry="8.4"/><path d="M4.1 9.8h15.8"/></svg>',
  tetra: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8L21 19H3L12 2.8Z"/><path d="M12 2.8v9.5m0 0L3 19m9-6.7L21 19"/></svg>',
  cylinder: '<svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="5.8" rx="7" ry="2.8"/><path d="M5 5.8v12.4c0 1.55 3.13 2.8 7 2.8s7-1.25 7-2.8V5.8"/><path d="M5 18.2c0 1.55 3.13 2.8 7 2.8s7-1.25 7-2.8"/></svg>',
};

const INITIAL_TYPES = ['box', 'tetra', 'hex', 'sphere', 'cylinder'];
const INITIAL_LAYOUT = ['below', 'below', 'surface', 'above', 'above'];

const SPAWN_SLOTS = [
  // These five points read as a single loose row from the default camera.
  // Keep the leftmost slot below the parameter card by starting that block low.
  [-0.66, 2.46],
  [0.01, 1.98],
  [0.88, 1.78],
  [1.57, 1.19],
  [2.3, 0.96],
  [0.41, 3.3],
  [2.27, 2.33],
  [0.17, 0.19],
];

const canvas = $('#scene');
const stage = $('#stage');
const annotations = $('#annotations');
const forceGroup = $('#forceGroup');
const buoyancyGroup = $('#buoyancyGroup');
const gravityGroup = $('#gravityGroup');
const sliceGroup = $('#sliceGroup');
const ambientSections = $('#ambientSections');
const sliceGlow = $('#sliceGlow');
const sliceLine = $('#sliceLine');
const buoyancyArrow = $('#buoyancyArrow');
const gravityArrow = $('#gravityArrow');
const cobHalo = $('#cobHalo');
const cobDot = $('#cobDot');
const cogHalo = $('#cogHalo');
const cogDot = $('#cogDot');
const forceLabels = $('#forceLabels');
const cobTag = $('#cobTag');
const cogTag = $('#cogTag');
const fbTag = $('#fbTag');
const gTag = $('#gTag');
const livePill = $('#livePill');
const liveText = $('#liveText');
const pauseBtn = $('#pauseBtn');
const forceToggle = $('#forceToggle');
const paramsPanel = $('#paramsPanel');
const collapseBtn = $('#collapseBtn');
const webglFallback = $('#webglFallback');
const bodyCountEl = $('#bodyCount');
const densityNote = $('#densityNote');
const densityNoteText = $('#densityNoteText');
const selectedChip = $('#selectedChip');
const selectedIcon = $('#selectedIcon');
const selectedName = $('#selectedName');
const selectedState = $('#selectedState');
const toast = $('#toast');
const scrollCue = $('#scrollCue');
const explainerScroll = $('#explainerScroll');
const shapeAddButtons = $$('.shape-add');

const waterDensityInput = $('#waterDensity');
const iceDensityInput = $('#iceDensity');
const gravityInput = $('#gravity');
const waterDensityOut = $('#waterDensityOut');
const iceDensityOut = $('#iceDensityOut');
const gravityOut = $('#gravityOut');

const liveFields = {
  sliceState: $('#sliceState'),
  volumeLive: $('#volumeLive'),
  cobLive: $('#cobLive'),
  forceLive: $('#forceLive'),
  weightLive: $('#weightLive'),
  torqueLive: $('#torqueLive'),
  spinLive: $('#spinLive'),
};

const simulation = new BuoyancySimulation({
  waterDensity: Number(waterDensityInput.value),
  iceDensity: Number(iceDensityInput.value),
  gravity: Number(gravityInput.value),
});

const camera = new OrbitCamera();
let renderer = null;
let paused = false;
let showForces = true;
let selectedId = null;
let nextSlot = 0;
let accumulator = 0;
let lastFrame = performance.now();
let lastReadout = 0;
let toastTimer = 0;
let headerIconType = null;
let annotationsSize = { width: 0, height: 0 };

const ambientPolys = [];
if (ambientSections) {
  for (let i = 0; i < MAX_BODIES; i++) {
    const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    polygon.setAttribute('class', 'ambient-slice');
    polygon.style.display = 'none';
    ambientSections.appendChild(polygon);
    ambientPolys.push(polygon);
  }
}

try {
  renderer = new IceRenderer(canvas, camera);
} catch (error) {
  console.error(error);
  webglFallback.hidden = false;
  canvas.style.visibility = 'hidden';
}

/* --------------------------------------------------------------------------
   Creation / scene lifecycle
   -------------------------------------------------------------------------- */

function makeSpawnOptions(index, { added = false } = {}) {
  const slot = SPAWN_SLOTS[index % SPAWN_SLOTS.length];
  const jitter = added ? 0.07 : 0.035;
  const x = slot[0] + randRange(Math.random, -jitter, jitter);
  const z = slot[1] + randRange(Math.random, -jitter, jitter);

  let y;
  if (added) {
    const sign = Math.random() < 0.5 ? -1 : 1;
    y = sign * randRange(Math.random, 0.34, 0.82);
  } else {
    const layout = INITIAL_LAYOUT[index] || (Math.random() < 0.5 ? 'below' : 'above');
    if (layout === 'surface') {
      // Keep one block on the waterline so the live cross-section is visible at once.
      y = randRange(Math.random, -0.06, 0.1);
    } else {
      const magnitude = randRange(Math.random, 0.34, 0.68);
      y = layout === 'above' ? magnitude : -magnitude;
    }
  }

  return {
    position: [x, y, z],
    quaternion: randomQuaternion(),
    velocity: [0, 0, 0],
    angularVelocity: [randRange(Math.random, -0.16, 0.16), randRange(Math.random, -0.16, 0.16), randRange(Math.random, -0.16, 0.16)],
  };
}

function firstLookSelection() {
  const partial = simulation.bodies.find(
    (body) => body.submergedFraction > 0.055 && body.submergedFraction < 0.945,
  );
  return (partial || simulation.bodies[0])?.id ?? null;
}

function spawnBody(type, { slotIndex, added = false, select = true } = {}) {
  if (simulation.bodies.length >= MAX_BODIES) {
    showToast('最多同时放入 8 块冰');
    return null;
  }
  const shape = createShape(type);
  const body = simulation.addBody(shape, makeSpawnOptions(slotIndex, { added }));
  if (select) selectedId = body.id;
  syncControls();
  if (select) refreshSelectedHeader(true);
  updateReadouts(true);
  return body;
}

function resetExperiment({ autoPlay = true } = {}) {
  if (renderer) renderer.releaseBodies(simulation.bodies);
  simulation.removeAll();
  simulation.time = 0;
  nextSlot = 0;
  accumulator = 0;
  if (autoPlay) setPaused(false);
  for (let i = 0; i < INITIAL_TYPES.length; i++) {
    const type = INITIAL_TYPES[i];
    const shape = createShape(type);
    simulation.addBody(shape, makeSpawnOptions(nextSlot, { added: false }));
    nextSlot++;
  }
  selectedId = firstLookSelection();
  syncControls();
  refreshSelectedHeader(true);
  updateReadouts(true);
  if (renderer) wakeScene();
}

function addShape(type) {
  if (simulation.bodies.length >= MAX_BODIES) {
    showToast('最多同时放入 8 块冰');
    return;
  }
  spawnBody(type, { slotIndex: nextSlot, added: true, select: true });
  nextSlot++;
  showToast(`已放入${SHAPE_META[type].label}`);
}

function cycleSelection() {
  if (!simulation.bodies.length) return;
  const index = simulation.bodies.findIndex((body) => body.id === selectedId);
  const next = simulation.bodies[(index + 1) % simulation.bodies.length];
  selectedId = next.id;
  refreshSelectedHeader(true);
  updateReadouts(true);
}

/* --------------------------------------------------------------------------
   Controls
   -------------------------------------------------------------------------- */

function setPaused(next) {
  paused = next;
  accumulator = 0;
  livePill.classList.toggle('is-paused', paused);
  liveText.textContent = paused ? '已暂停' : '实时演算';
  pauseBtn.classList.toggle('is-paused', paused);
  pauseBtn.setAttribute('aria-label', paused ? '继续仿真' : '暂停仿真');
  lastFrame = performance.now();
}

function updateRangeAppearance(input) {
  const min = Number(input.min);
  const max = Number(input.max);
  const value = Number(input.value);
  const percent = ((value - min) / (max - min)) * 100;
  input.style.setProperty('--fill', `${percent}%`);
}

function syncMaterial() {
  const water = Number(waterDensityInput.value);
  const ice = Number(iceDensityInput.value);
  const gravity = Number(gravityInput.value);
  simulation.setMaterial({ waterDensity: water, iceDensity: ice, gravity });
  waterDensityOut.textContent = formatInteger(water);
  iceDensityOut.textContent = formatInteger(ice);
  gravityOut.textContent = gravity.toFixed(1);
  updateDensityNote();
  updateReadouts(true);
}

function updateDensityNote() {
  const ratio = simulation.iceDensity / Math.max(1, simulation.waterDensity);
  const sinking = ratio >= 0.999;
  densityNote.classList.toggle('is-sinking', sinking);
  if (sinking) {
    densityNoteText.textContent = '冰密度 ≥ 水密度 · 冰块会下沉';
  } else if (ratio > 0.97) {
    densityNoteText.textContent = '接近中性浮力 · 只会露出很小一角';
  } else {
    densityNoteText.textContent = `平稳漂浮时约 ${Math.round(ratio * 100)}% 体积在水下`;
  }
}

function syncControls() {
  waterDensityInput.value = String(simulation.waterDensity);
  iceDensityInput.value = String(simulation.iceDensity);
  gravityInput.value = String(simulation.gravity);
  waterDensityOut.textContent = formatInteger(simulation.waterDensity);
  iceDensityOut.textContent = formatInteger(simulation.iceDensity);
  gravityOut.textContent = simulation.gravity.toFixed(1);
  for (const input of [waterDensityInput, iceDensityInput, gravityInput]) {
    updateRangeAppearance(input);
  }
  const count = simulation.bodies.length;
  bodyCountEl.textContent = String(count);
  for (const button of shapeAddButtons) button.disabled = count >= MAX_BODIES;
  updateDensityNote();
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('is-visible');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast.classList.remove('is-visible');
  }, 1700);
}

function updateScrollCue() {
  if (!scrollCue || !explainerScroll) return;
  const maxScroll = explainerScroll.scrollHeight - explainerScroll.clientHeight;
  const hasOverflow = maxScroll > 16;
  const atBottom = explainerScroll.scrollTop >= maxScroll - 10;
  scrollCue.classList.toggle('is-visible', hasOverflow && !atBottom);
}

function toggleForces() {
  showForces = !showForces;
  forceToggle.classList.toggle('is-on', showForces);
  forceToggle.setAttribute('aria-pressed', String(showForces));
  annotations.classList.toggle('forces-off', !showForces);
  forceLabels.classList.toggle('is-hidden', !showForces);
}

function setParamsCollapsed(collapsed) {
  paramsPanel.classList.toggle('is-collapsed', collapsed);
  collapseBtn.setAttribute('aria-expanded', String(!collapsed));
  collapseBtn.setAttribute('aria-label', collapsed ? '展开参数面板' : '收起参数面板');
}

function toggleParams() {
  setParamsCollapsed(!paramsPanel.classList.contains('is-collapsed'));
}

for (const input of [waterDensityInput, iceDensityInput, gravityInput]) {
  input.addEventListener('input', () => {
    updateRangeAppearance(input);
    syncMaterial();
  });
}

for (const button of shapeAddButtons) {
  button.addEventListener('click', () => addShape(button.dataset.shape));
}

$('#resetBtn').addEventListener('click', () => resetExperiment());
$('#viewBtn').addEventListener('click', () => camera.reset());
$('#pauseBtn').addEventListener('click', () => setPaused(!paused));
forceToggle.addEventListener('click', toggleForces);
collapseBtn.addEventListener('click', toggleParams);
selectedChip.addEventListener('click', cycleSelection);
explainerScroll.addEventListener('scroll', updateScrollCue, { passive: true });
window.addEventListener('resize', updateScrollCue);

document.addEventListener('keydown', (event) => {
  const target = event.target;
  const tag = target && target.tagName;
  const interactive = ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A'].includes(tag)
    || (target && target.isContentEditable);
  if (event.code === 'Space' && !interactive) {
    event.preventDefault();
    setPaused(!paused);
  }
});

/* --------------------------------------------------------------------------
   Pointer camera + selection
   -------------------------------------------------------------------------- */

const activePointers = new Map();
let orbitStart = null;
let pinchDistance = 0;
let tappedDuringPinch = false;

function pointerDistance() {
  const points = [...activePointers.values()];
  if (points.length < 2) return 0;
  return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
}

function pickAt(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const hit = pickBody(simulation.bodies, camera, clientX - rect.left, clientY - rect.top);
  if (!hit) return;
  selectedId = hit.id;
  refreshSelectedHeader(true);
  updateReadouts(true);
}

function startOrbit(pointerId, x, y) {
  orbitStart = {
    id: pointerId,
    x,
    y,
    lastX: x,
    lastY: y,
    moved: 0,
  };
}

canvas.addEventListener('pointerdown', (event) => {
  if (event.pointerType === 'mouse' && event.button !== 0) return;
  try {
    canvas.setPointerCapture(event.pointerId);
  } catch {
    /* pointer capture is a progressive enhancement */
  }
  activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  canvas.classList.add('is-dragging');
  if (activePointers.size === 1) {
    startOrbit(event.pointerId, event.clientX, event.clientY);
    tappedDuringPinch = false;
  } else {
    orbitStart = null;
    pinchDistance = pointerDistance();
    tappedDuringPinch = true;
  }
});

canvas.addEventListener('pointermove', (event) => {
  const pointer = activePointers.get(event.pointerId);
  if (!pointer) {
    if (renderer && activePointers.size === 0) {
      const rect = canvas.getBoundingClientRect();
      const hit = pickBody(simulation.bodies, camera, event.clientX - rect.left, event.clientY - rect.top);
      canvas.style.cursor = hit ? 'pointer' : '';
    }
    return;
  }

  pointer.x = event.clientX;
  pointer.y = event.clientY;

  if (activePointers.size > 1) {
    const distance = pointerDistance();
    if (pinchDistance > 0 && distance > 0) camera.zoom(pinchDistance / distance);
    pinchDistance = distance;
    return;
  }

  if (orbitStart && orbitStart.id === event.pointerId) {
    const dx = event.clientX - orbitStart.lastX;
    const dy = event.clientY - orbitStart.lastY;
    orbitStart.moved += Math.abs(dx) + Math.abs(dy);
    orbitStart.lastX = event.clientX;
    orbitStart.lastY = event.clientY;
    camera.orbit(dx, dy);
  }
});

function endPointer(event) {
  const wasOnlyPointer = activePointers.size === 1;
  const shouldTap = wasOnlyPointer
    && orbitStart
    && orbitStart.id === event.pointerId
    && orbitStart.moved < 5
    && !tappedDuringPinch;

  activePointers.delete(event.pointerId);

  if (activePointers.size === 0) {
    canvas.classList.remove('is-dragging');
    orbitStart = null;
    pinchDistance = 0;
    tappedDuringPinch = false;
    if (shouldTap) pickAt(event.clientX, event.clientY);
  } else if (activePointers.size === 1) {
    const [remainingId, point] = activePointers.entries().next().value;
    startOrbit(remainingId, point.x, point.y);
    pinchDistance = 0;
  }
}

canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);

canvas.addEventListener('wheel', (event) => {
  event.preventDefault();
  const delta = clamp(event.deltaY, -110, 110);
  camera.zoom(Math.exp(delta * 0.0016));
}, { passive: false });

/* --------------------------------------------------------------------------
   Numeric readouts
   -------------------------------------------------------------------------- */

function formatInteger(value) {
  return Math.round(value).toLocaleString('en-US');
}

function formatVolume(value) {
  if (!Number.isFinite(value) || value <= 0.0002) return '0 m³';
  return `${value.toFixed(3)} m³`;
}

function formatForce(value) {
  if (!Number.isFinite(value)) return '—';
  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(2)} kN`;
  return `${Math.round(value)} N`;
}

function formatTorque(value) {
  if (!Number.isFinite(value)) return '—';
  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(2)} kN·m`;
  return `${value.toFixed(1)} N·m`;
}

function formatCoord(value) {
  if (!value) return '—';
  const sign = (n) => `${n < 0 ? '−' : ''}${Math.abs(n).toFixed(2)}`;
  return `(${sign(value[0])}, ${sign(value[1])}, ${sign(value[2])}) m`;
}

function currentBody() {
  return simulation.bodies.find((body) => body.id === selectedId) || simulation.bodies[0] || null;
}

function refreshSelectedHeader(force = false) {
  const body = currentBody();
  if (!body) {
    selectedName.textContent = '正在准备冰块';
    selectedState.textContent = '—';
    selectedState.className = 'selected-state';
    selectedIcon.innerHTML = SHAPE_ICONS.box;
    headerIconType = null;
    return;
  }
  if (force || headerIconType !== body.shape.type) {
    selectedIcon.innerHTML = SHAPE_ICONS[body.shape.type];
    headerIconType = body.shape.type;
  }
  selectedName.textContent = `${body.shape.label} · ${String(body.id).padStart(2, '0')}`;
  const status = bodyStatus(simulation, body);
  selectedState.textContent = status.label;
  selectedState.className = `selected-state state-${status.key}`;
  selectedChip.setAttribute(
    'aria-label',
    `当前选中${body.shape.label}，${status.label}。点击切换到下一块冰。`,
  );
}

function updateReadouts(forceHeader = false) {
  const body = currentBody();
  if (forceHeader) refreshSelectedHeader(true);
  if (!body) {
    for (const field of Object.values(liveFields)) field.textContent = '—';
    return;
  }

  const forces = simulation.forceSnapshot(body);
  const submerged = forces.submergedFraction;
  const sectionCount = body.section.length;
  const pct = Math.round(submerged * 100);

  if (submerged <= 0.002) {
    liveFields.sliceState.textContent = '尚未触水';
  } else if (submerged >= 0.998) {
    liveFields.sliceState.textContent = '整体浸没';
  } else {
    liveFields.sliceState.textContent = `${sectionCount} 边截面 · 水下 ${pct}%`;
  }

  liveFields.volumeLive.textContent = `${formatVolume(body.submergedVolume)} · ${pct}%`;
  liveFields.cobLive.textContent = formatCoord(body.centerOfBuoyancy);
  liveFields.forceLive.textContent = formatForce(forces.buoyancy);
  liveFields.weightLive.textContent = formatForce(forces.weight);
  liveFields.torqueLive.textContent = formatTorque(forces.torqueMagnitude);
  liveFields.spinLive.textContent = `${Math.hypot(...body.angularVelocity).toFixed(2)} rad/s`;

  refreshSelectedHeader(forceHeader);
  updateScrollCue();
}

/* --------------------------------------------------------------------------
   Annotation overlay (slice outline, centres, force arrows)
   -------------------------------------------------------------------------- */

function setLine(line, x1, y1, x2, y2) {
  line.setAttribute('x1', x1.toFixed(2));
  line.setAttribute('y1', y1.toFixed(2));
  line.setAttribute('x2', x2.toFixed(2));
  line.setAttribute('y2', y2.toFixed(2));
}

function setCircle(circle, x, y) {
  circle.setAttribute('cx', x.toFixed(2));
  circle.setAttribute('cy', y.toFixed(2));
}

function setLabelsVisible(visible) {
  forceLabels.classList.toggle('is-hidden', !visible);
}

function placePointTag(tag, x, y, side) {
  tag.style.display = '';
  tag.classList.toggle('is-left', side === 'left');
  tag.style.left = `${clamp(x, 10, annotationsSize.width - 10).toFixed(1)}px`;
  tag.style.top = `${clamp(y, 16, annotationsSize.height - 16).toFixed(1)}px`;
}

function placeForceTag(tag, x, y, side, below = false) {
  tag.style.display = '';
  const left = side === 'left' ? x - 7 : x + 7;
  tag.style.left = `${clamp(left, 8, annotationsSize.width - 8).toFixed(1)}px`;
  tag.style.top = `${clamp(below ? y + 11 : y - 10, 10, annotationsSize.height - 10).toFixed(1)}px`;
  tag.style.transform = side === 'left' ? 'translate(-100%, -50%)' : 'translate(0, -50%)';
}

function updateAnnotations() {
  if (!renderer) return;
  const width = stage.clientWidth;
  const height = stage.clientHeight;
  if (width <= 0 || height <= 0) return;
  if (width !== annotationsSize.width || height !== annotationsSize.height) {
    annotationsSize = { width, height };
    annotations.setAttribute('viewBox', `0 0 ${width} ${height}`);
  }

  const body = currentBody();

  // Every floating neighbour also receives a quiet waterline contour. It makes
  // the horizontal cut-off plane legible without turning the scene into a diagram.
  let ambientIndex = 0;
  for (const candidate of simulation.bodies) {
    if (body && candidate.id === body.id) continue;
    if (candidate.section.length < 3) continue;
    const projected = candidate.section
      .map((point) => camera.project(point))
      .filter((point) => point.depth > 0.04);
    if (projected.length < 3) continue;
    ambientPolys[ambientIndex].setAttribute(
      'points',
      projected.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' '),
    );
    ambientPolys[ambientIndex].style.display = '';
    ambientIndex++;
    if (ambientIndex >= ambientPolys.length) break;
  }
  for (let i = ambientIndex; i < ambientPolys.length; i++) ambientPolys[i].style.display = 'none';

  if (!body) {
    sliceGroup.style.display = 'none';
    forceGroup.style.display = 'none';
    setLabelsVisible(false);
    return;
  }

  // Waterline section outline.
  const projectedSection = body.section
    .map((point) => camera.project(point))
    .filter((point) => point.depth > 0.04);
  if (projectedSection.length >= 3) {
    const points = projectedSection.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
    sliceLine.setAttribute('points', points);
    sliceGlow.setAttribute('points', points);
    sliceGroup.style.display = '';
  } else {
    sliceGroup.style.display = 'none';
  }

  if (!showForces) {
    forceGroup.style.display = 'none';
    setLabelsVisible(false);
    return;
  }

  const centerScreen = camera.project(body.position);
  if (centerScreen.depth <= 0.04) {
    forceGroup.style.display = 'none';
    setLabelsVisible(false);
    return;
  }

  const forces = simulation.forceSnapshot(body);
  const cg = centerScreen;
  const cb = body.centerOfBuoyancy ? camera.project(body.centerOfBuoyancy) : null;
  const hasBuoyancy = Boolean(cb) && forces.buoyancy > 0.01 && cb.depth > 0.04;
  const reference = Math.max(forces.buoyancy, forces.weight, 1);
  const buoyancyLength = clamp(28 + 38 * (forces.buoyancy / reference), 20, 66);
  const gravityLength = clamp(28 + 38 * (forces.weight / reference), 20, 66);

  forceGroup.style.display = '';
  setLabelsVisible(true);

  // Centre of gravity and its downward arrow.
  const centersAreClose = hasBuoyancy && Math.abs(cg.x - cb.x) < 26 && Math.abs(cg.y - cb.y) < 36;
  const cogLabelToLeft = cg.x > width - 76 || centersAreClose;
  setCircle(cogDot, cg.x, cg.y);
  setCircle(cogHalo, cg.x, cg.y);
  placePointTag(cogTag, cg.x + (cogLabelToLeft ? -10 : 10), cg.y - (centersAreClose ? 12 : 0), cogLabelToLeft ? 'left' : 'right');

  const gravityTipY = Math.min(height - 26, cg.y + gravityLength);
  setLine(gravityArrow, cg.x, cg.y + 4.5, cg.x, gravityTipY);
  placeForceTag(gTag, cg.x, gravityTipY, cg.x > width - 52 ? 'left' : 'right', false);
  gravityGroup.style.display = '';

  if (hasBuoyancy) {
    buoyancyGroup.style.display = '';
    const cbLabelToLeft = !centersAreClose && cb.x > width - 76;
    setCircle(cobDot, cb.x, cb.y);
    setCircle(cobHalo, cb.x, cb.y);
    placePointTag(cobTag, cb.x + (cbLabelToLeft ? -10 : 10), cb.y + (centersAreClose ? 12 : 0), cbLabelToLeft ? 'left' : 'right');

    const buoyancyTipY = Math.max(24, cb.y - buoyancyLength);
    setLine(buoyancyArrow, cb.x, cb.y - 4.5, cb.x, buoyancyTipY);
    placeForceTag(fbTag, cb.x, buoyancyTipY, cb.x > width - 52 ? 'left' : 'right', false);
  } else {
    buoyancyGroup.style.display = 'none';
    fbTag.style.display = 'none';
    cobTag.style.display = 'none';
  }
}

/* --------------------------------------------------------------------------
   Animation loop
   -------------------------------------------------------------------------- */

function wakeScene() {
  lastFrame = performance.now();
}

requestAnimationFrame(() => updateScrollCue());

function frame(now) {
  const dt = Math.min(0.05, Math.max(0, (now - lastFrame) / 1000));
  lastFrame = now;

  if (!paused) {
    accumulator = Math.min(accumulator + dt, FIXED_STEP * 8);
    while (accumulator >= FIXED_STEP) {
      simulation.step(FIXED_STEP);
      accumulator -= FIXED_STEP;
    }
  }

  if (renderer) {
    renderer.render(simulation, selectedId, dt);
    updateAnnotations();
  }

  if (now - lastReadout > 90) {
    updateReadouts();
    lastReadout = now;
  }

  requestAnimationFrame(frame);
}

/* --------------------------------------------------------------------------
   Boot
   -------------------------------------------------------------------------- */

syncControls();
resetExperiment({ autoPlay: true });
if (window.matchMedia('(max-width: 640px)').matches) setParamsCollapsed(true);

requestAnimationFrame((now) => {
  lastFrame = now;
  lastReadout = 0;
  requestAnimationFrame(frame);
});

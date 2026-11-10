/*
 * Six-degree-of-freedom buoyancy simulation.
 *
 * Each frame:
 *   1. transform the convex ice mesh into world space
 *   2. clip every face against the plane y = waterLevel and cap the opening
 *   3. sum signed tetrahedra to get the submerged volume and its centroid
 *   4. apply buoyancy at that centroid, gravity at the centre of mass
 *   5. integrate translation + orientation with a semi-implicit method
 */
import {
  add,
  addScaled,
  cross,
  dot,
  integrateQuat,
  invert3,
  length,
  mat3FromQuat,
  mat3Vec3,
  mulMat3,
  scale,
  sub,
  transpose3,
} from './math.js';

export const MAX_BODIES = 8;
export const FIXED_STEP = 1 / 120;
export const FLOOR_Y = -2.15;
const WATER_EPS = 1e-7;
const MAX_ANGULAR_SPEED = 11;
const MAX_SPEED = 7;

function faceCrosses(a, b, level) {
  return (a[1] <= level + WATER_EPS) !== (b[1] <= level + WATER_EPS);
}

function intersectWater(a, b, level) {
  const da = a[1] - level;
  const db = b[1] - level;
  const t = da / (da - db || 1e-9);
  return [
    a[0] + (b[0] - a[0]) * t,
    level,
    a[2] + (b[2] - a[2]) * t,
  ];
}

function accumulateTriangle(state, a, b, c) {
  const v = dot(a, cross(b, c)) / 6;
  state.volume += v;
  state.moment[0] += v * (a[0] + b[0] + c[0]) / 4;
  state.moment[1] += v * (a[1] + b[1] + c[1]) / 4;
  state.moment[2] += v * (a[2] + b[2] + c[2]) / 4;
}

function triangulateAndAccumulate(state, points) {
  const a = points[0];
  for (let i = 1; i < points.length - 1; i++) {
    accumulateTriangle(state, a, points[i], points[i + 1]);
  }
}

function capNormalY(points) {
  let ny = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    ny += (a[2] - b[2]) * (a[0] + b[0]);
  }
  return ny;
}

/**
 * Compute the submerged volume, centre of buoyancy and waterline polygon.
 * Returns world-space values. This is the core "slice" routine.
 */
export function computeSubmerged(shape, worldVertices, waterLevel) {
  let minY = Infinity;
  let maxY = -Infinity;
  for (const v of worldVertices) {
    if (v[1] < minY) minY = v[1];
    if (v[1] > maxY) maxY = v[1];
  }

  if (maxY <= waterLevel + WATER_EPS) {
    return {
      volume: shape.volume,
      centroid: worldVertices.length ? null : null,
      section: [],
      fullySubmerged: true,
      minY,
      maxY,
    };
  }
  if (minY >= waterLevel - WATER_EPS) {
    return {
      volume: 0,
      centroid: null,
      section: [],
      fullySubmerged: false,
      minY,
      maxY,
    };
  }

  const state = { volume: 0, moment: [0, 0, 0] };
  const capPoints = [];
  const seen = new Set();
  let level = waterLevel;

  const addCapPoint = (p) => {
    const key = `${Math.round(p[0] * 1e5)}:${Math.round(p[2] * 1e5)}`;
    if (seen.has(key)) return;
    seen.add(key);
    capPoints.push(p);
  };

  for (const face of shape.faces) {
    const poly = face.map((i) => worldVertices[i]);
    let insideCount = 0;
    for (const p of poly) if (p[1] <= level + WATER_EPS) insideCount++;
    if (insideCount === 0) continue;

    if (insideCount === poly.length) {
      triangulateAndAccumulate(state, poly);
      continue;
    }

    const clipped = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const aIn = a[1] <= level + WATER_EPS;
      if (aIn) clipped.push(a);
      if (faceCrosses(a, b, level)) {
        const p = intersectWater(a, b, level);
        clipped.push(p);
        addCapPoint(p);
      }
    }
    if (clipped.length >= 3) triangulateAndAccumulate(state, clipped);
  }

  if (capPoints.length >= 3) {
    let cx = 0;
    let cz = 0;
    for (const p of capPoints) {
      cx += p[0];
      cz += p[2];
    }
    cx /= capPoints.length;
    cz /= capPoints.length;
    capPoints.sort((a, b) => Math.atan2(a[2] - cz, a[0] - cx) - Math.atan2(b[2] - cz, b[0] - cx));
    // A valid cap must face upward; reverse if the ordering looks downward.
    if (capNormalY(capPoints) < 0) capPoints.reverse();
    triangulateAndAccumulate(state, capPoints);
  }

  let volume = state.volume;
  let moment = state.moment;
  if (volume < 0) {
    volume = -volume;
    moment = [-moment[0], -moment[1], -moment[2]];
  }
  if (volume < 1e-10) {
    return {
      volume: 0,
      centroid: null,
      section: [],
      fullySubmerged: false,
      minY,
      maxY,
    };
  }

  return {
    volume,
    centroid: [moment[0] / volume, moment[1] / volume, moment[2] / volume],
    section: capPoints,
    fullySubmerged: false,
    minY,
    maxY,
  };
}

function makeBodyRecord(id, shape, position, quaternion, velocity, angularVelocity) {
  return {
    id,
    shape,
    position: [...position],
    quaternion: [...quaternion],
    velocity: [...velocity],
    angularVelocity: [...angularVelocity],
    submergedVolume: 0,
    submergedFraction: 0,
    centerOfBuoyancy: null,
    section: [],
    minY: 0,
    maxY: 0,
    grounded: false,
    buoyancyMagnitude: 0,
    weightMagnitude: 0,
    torqueMagnitude: 0,
    netForceMagnitude: 0,
    sampledAt: 0,
  };
}

export class BuoyancySimulation {
  constructor({
    waterDensity = 1000,
    iceDensity = 900,
    gravity = 9.81,
    waterLevel = 0,
  } = {}) {
    this.waterDensity = waterDensity;
    this.iceDensity = iceDensity;
    this.gravity = gravity;
    this.waterLevel = waterLevel;
    this.bodies = [];
    this.time = 0;
    this.nextId = 1;
  }

  addBody(shape, {
    position = [0, 0, 0],
    quaternion = [0, 0, 0, 1],
    velocity = [0, 0, 0],
    angularVelocity = [0, 0, 0],
  } = {}) {
    const body = makeBodyRecord(
      this.nextId++,
      shape,
      position,
      quaternion,
      velocity,
      angularVelocity,
    );
    this.bodies.push(body);
    this.sampleBody(body);
    return body;
  }

  removeAll() {
    this.bodies.length = 0;
  }

  setMaterial({ waterDensity, iceDensity, gravity }) {
    if (Number.isFinite(waterDensity)) this.waterDensity = waterDensity;
    if (Number.isFinite(iceDensity)) this.iceDensity = iceDensity;
    if (Number.isFinite(gravity)) this.gravity = gravity;
  }

  forceSnapshot(body) {
    const submerged = Math.max(0, Math.min(body.shape.volume, body.submergedVolume));
    const buoyancy = this.waterDensity * this.gravity * submerged;
    const weight = this.iceDensity * this.gravity * body.shape.volume;
    let torque = [0, 0, 0];
    if (body.centerOfBuoyancy && submerged > 0) {
      torque = cross(sub(body.centerOfBuoyancy, body.position), [0, buoyancy, 0]);
    }
    return {
      buoyancy,
      weight,
      netVertical: buoyancy - weight,
      torque,
      torqueMagnitude: length(torque),
      submergedFraction: body.shape.volume > 0 ? submerged / body.shape.volume : 0,
    };
  }

  sampleBody(body) {
    const shape = body.shape;
    const q = body.quaternion;
    const pos = body.position;
    const rotation = mat3FromQuat(q);
    const worldVertices = shape.vertices.map((v) => add(pos, mat3Vec3(rotation, v)));
    const clipped = computeSubmerged(shape, worldVertices, this.waterLevel);
    let centroid = clipped.centroid;
    if (clipped.fullySubmerged) centroid = [...pos];
    body.submergedVolume = clipped.volume;
    body.submergedFraction = clipped.volume / shape.volume;
    body.centerOfBuoyancy = centroid;
    body.section = clipped.section;
    body.minY = clipped.minY;
    body.maxY = clipped.maxY;
    body.sampledAt = this.time;

    const forces = this.forceSnapshot(body);
    body.buoyancyMagnitude = forces.buoyancy;
    body.weightMagnitude = forces.weight;
    body.torqueMagnitude = forces.torqueMagnitude;
    body.netForceMagnitude = Math.abs(forces.netVertical);
    return clipped;
  }

  refreshAll() {
    for (const body of this.bodies) this.sampleBody(body);
  }

  step(dt = FIXED_STEP) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    // Safety: never advance a single call by more than a few fixed frames.
    const h = Math.min(dt, 1 / 30);
    this.time += h;
    for (const body of this.bodies) this.integrateBody(body, h);
  }

  integrateBody(body, dt) {
    this.sampleBody(body);
    const shape = body.shape;
    const mass = this.iceDensity * shape.volume;
    if (mass <= 1e-9) return;

    const submergedFraction = body.submergedFraction;
    const forces = this.forceSnapshot(body);
    const velocity = body.velocity;

    // Water resistance is only meaningful near / beneath the surface. A tiny
    // amount of air drag keeps free-fall visually calm. Damping is deliberately
    // stronger near the waterline, which removes bobbing quickly while still
    // allowing blocks to rise briskly through deep water.
    const nearSurface = 4 * submergedFraction * (1 - submergedFraction);
    const linearDamping = 0.08 + 1.8 * submergedFraction + 4.8 * nearSurface;
    const accel = [
      -velocity[0] * linearDamping,
      forces.netVertical / mass - velocity[1] * linearDamping,
      -velocity[2] * linearDamping,
    ];

    body.velocity = [
      Math.max(-MAX_SPEED, Math.min(MAX_SPEED, velocity[0] + accel[0] * dt)),
      Math.max(-MAX_SPEED, Math.min(MAX_SPEED, velocity[1] + accel[1] * dt)),
      Math.max(-MAX_SPEED, Math.min(MAX_SPEED, velocity[2] + accel[2] * dt)),
    ];
    body.position = add(body.position, scale(body.velocity, dt));

    const R = mat3FromQuat(body.quaternion);
    const inertiaUnitWorld = mulMat3(mulMat3(R, shape.inertiaUnit), transpose3(R));
    const inertiaUnitWorldInv = invert3(inertiaUnitWorld);
    let alpha = [0, 0, 0];
    if (inertiaUnitWorldInv) {
      // The world inertia is mass * inertiaUnitWorld, hence the 1/mass here.
      alpha = scale(mat3Vec3(inertiaUnitWorldInv, forces.torque), 1 / mass);
    }
    // Angular resistance, strongest near the surface.
    const angularDamping = 0.2 + 1.7 * submergedFraction + 3.8 * nearSurface;
    alpha = [
      alpha[0] - body.angularVelocity[0] * angularDamping,
      alpha[1] - body.angularVelocity[1] * angularDamping,
      alpha[2] - body.angularVelocity[2] * angularDamping,
    ];
    let omega = add(body.angularVelocity, scale(alpha, dt));
    const omegaSpeed = length(omega);
    if (omegaSpeed > MAX_ANGULAR_SPEED) omega = scale(omega, MAX_ANGULAR_SPEED / omegaSpeed);
    body.angularVelocity = omega;
    body.quaternion = integrateQuat(body.quaternion, omega, dt);

    // A soft, invisible basin floor catches very dense blocks without letting
    // them fall out of the scene. The floor is below the water surface.
    const floorCenter = FLOOR_Y + shape.boundRadius * 0.88;
    if (body.position[1] < floorCenter) {
      body.position[1] = floorCenter;
      if (body.velocity[1] < 0) body.velocity[1] *= -0.12;
      body.velocity[0] *= 0.9;
      body.velocity[2] *= 0.9;
      body.angularVelocity = scale(body.angularVelocity, 0.9);
      body.grounded = true;
    } else {
      body.grounded = false;
    }
  }
}

/** Classify the current body for the small status pill in the UI. */
export function bodyStatus(sim, body) {
  const force = sim.forceSnapshot(body);
  const sub = force.submergedFraction;
  const v = body.velocity[1];
  const speed = Math.hypot(body.velocity[0], body.velocity[1], body.velocity[2]);
  const spin = length(body.angularVelocity);
  if (body.grounded && sim.iceDensity >= sim.waterDensity) {
    return { key: 'sunk', label: '沉在池底' };
  }
  if (sub < 0.002) {
    return v < -0.08
      ? { key: 'falling', label: '下落中' }
      : { key: 'air', label: '在水面之上' };
  }
  if (sub > 0.998) {
    if (force.netVertical > 0.01 * force.weight) return { key: 'rising', label: '上浮中' };
    if (force.netVertical < -0.01 * force.weight) return { key: 'sinking', label: '下沉中' };
    return { key: 'neutral', label: '中性浮力' };
  }
  if (
    Math.abs(force.netVertical) < 0.025 * Math.max(force.weight, 1e-6) &&
    speed < 0.16 &&
    spin < 0.35
  ) {
    return { key: 'float', label: '稳定漂浮' };
  }
  if (v > 0.1 || force.netVertical > 0.04 * force.weight) {
    return { key: 'rising', label: '上浮中' };
  }
  if (v < -0.1 || force.netVertical < -0.04 * force.weight) {
    return { key: 'sinking', label: '下沉中' };
  }
  return { key: 'settling', label: '调整姿态' };
}

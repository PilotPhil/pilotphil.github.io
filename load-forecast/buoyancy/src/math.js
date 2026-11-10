/* Small, dependency-free vector / quaternion / matrix helpers. */

export const TAU = Math.PI * 2;

export const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const randRange = (rng, lo, hi) => lo + (hi - lo) * rng();
export const smoothstep = (edge0, edge1, x) => {
  const t = clamp((x - edge0) / (edge1 - edge0 || 1e-9), 0, 1);
  return t * t * (3 - 2 * t);
};

/* ---- vec3, represented as plain [x, y, z] arrays ----------------------- */
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const addScaled = (a, b, s) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const length = (a) => Math.hypot(a[0], a[1], a[2]);
export const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
export const normalize = (a) => {
  const l = Math.hypot(a[0], a[1], a[2]);
  return l > 1e-12 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0];
};
export const lerpVec = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
export const vec3 = (x = 0, y = 0, z = 0) => [x, y, z];

/* ---- quaternion, represented as [x, y, z, w] --------------------------- */
export const quatIdentity = () => [0, 0, 0, 1];

export function randomQuaternion(rng = Math.random) {
  // Shoemake's method: a uniform random rotation on SO(3).
  const u1 = rng();
  const u2 = rng();
  const u3 = rng();
  const s1 = Math.sqrt(1 - u1);
  const s2 = Math.sqrt(u1);
  return [
    s1 * Math.sin(TAU * u2),
    s1 * Math.cos(TAU * u2),
    s2 * Math.sin(TAU * u3),
    s2 * Math.cos(TAU * u3),
  ];
}

export function quatNormalize(q) {
  const l = Math.hypot(q[0], q[1], q[2], q[3]);
  if (l < 1e-12) return [0, 0, 0, 1];
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
}

export function quatMultiply(a, b) {
  const ax = a[0], ay = a[1], az = a[2], aw = a[3];
  const bx = b[0], by = b[1], bz = b[2], bw = b[3];
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

export function rotateVec(q, v) {
  // v' = v + 2 * cross(q.xyz, cross(q.xyz, v) + w*v)
  const x = q[0], y = q[1], z = q[2], w = q[3];
  const tx = 2 * (y * v[2] - z * v[1]);
  const ty = 2 * (z * v[0] - x * v[2]);
  const tz = 2 * (x * v[1] - y * v[0]);
  return [
    v[0] + w * tx + (y * tz - z * ty),
    v[1] + w * ty + (z * tx - x * tz),
    v[2] + w * tz + (x * ty - y * tx),
  ];
}

export function integrateQuat(q, omega, dt) {
  // World-space angular velocity: qdot = 1/2 * [omega, 0] * q
  const dq = quatMultiply([omega[0], omega[1], omega[2], 0], q);
  return quatNormalize([
    q[0] + 0.5 * dq[0] * dt,
    q[1] + 0.5 * dq[1] * dt,
    q[2] + 0.5 * dq[2] * dt,
    q[3] + 0.5 * dq[3] * dt,
  ]);
}

export function rotateVecs(q, vertices) {
  return vertices.map((v) => rotateVec(q, v));
}

/* ---- 3x3 matrices, row-major ------------------------------------------ */
export function mat3FromQuat(q) {
  const x = q[0], y = q[1], z = q[2], w = q[3];
  const xx = x * x, yy = y * y, zz = z * z;
  const xy = x * y, xz = x * z, yz = y * z;
  const wx = w * x, wy = w * y, wz = w * z;
  return [
    1 - 2 * (yy + zz), 2 * (xy - wz), 2 * (xz + wy),
    2 * (xy + wz), 1 - 2 * (xx + zz), 2 * (yz - wx),
    2 * (xz - wy), 2 * (yz + wx), 1 - 2 * (xx + yy),
  ];
}

export function mat3Vec3(m, v) {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ];
}

export function transpose3(m) {
  return [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
}

export function mulMat3(a, b) {
  const out = new Array(9);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      out[r * 3 + c] =
        a[r * 3] * b[c] +
        a[r * 3 + 1] * b[3 + c] +
        a[r * 3 + 2] * b[6 + c];
    }
  }
  return out;
}

export function invert3(m) {
  const a00 = m[0], a01 = m[1], a02 = m[2];
  const a10 = m[3], a11 = m[4], a12 = m[5];
  const a20 = m[6], a21 = m[7], a22 = m[8];
  const det =
    a00 * (a11 * a22 - a12 * a21) -
    a01 * (a10 * a22 - a12 * a20) +
    a02 * (a10 * a21 - a11 * a20);
  if (Math.abs(det) < 1e-14) return null;
  const id = 1 / det;
  return [
    (a11 * a22 - a12 * a21) * id,
    (a02 * a21 - a01 * a22) * id,
    (a01 * a12 - a02 * a11) * id,
    (a12 * a20 - a10 * a22) * id,
    (a00 * a22 - a02 * a20) * id,
    (a02 * a10 - a00 * a12) * id,
    (a10 * a21 - a11 * a20) * id,
    (a01 * a20 - a00 * a21) * id,
    (a00 * a11 - a01 * a10) * id,
  ];
}

/* ---- 4x4 matrices, column-major (ready for WebGL) ---------------------- */
export function mat4Identity() {
  return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}

export function mat4Multiply(a, b) {
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      out[c * 4 + r] =
        a[r] * b[c * 4] +
        a[4 + r] * b[c * 4 + 1] +
        a[8 + r] * b[c * 4 + 2] +
        a[12 + r] * b[c * 4 + 3];
    }
  }
  return out;
}

export function perspective(fovY, aspect, near, far) {
  const f = 1 / Math.tan(fovY / 2);
  const nf = 1 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0,
  ]);
}

export function lookAt(eye, target, up = [0, 1, 0]) {
  const z = normalize(sub(eye, target));           // camera looks down -z
  const x = normalize(cross(up, z));
  const y = cross(z, x);
  return new Float32Array([
    x[0], y[0], z[0], 0,
    x[1], y[1], z[1], 0,
    x[2], y[2], z[2], 0,
    -dot(x, eye), -dot(y, eye), -dot(z, eye), 1,
  ]);
}

export function mat4Model(q, position) {
  const r = mat3FromQuat(q); // row-major
  const p = position;
  return new Float32Array([
    r[0], r[3], r[6], 0,
    r[1], r[4], r[7], 0,
    r[2], r[5], r[8], 0,
    p[0], p[1], p[2], 1,
  ]);
}

export function transformPoint4(m, p) {
  const x = p[0], y = p[1], z = p[2];
  const w = m[3] * x + m[7] * y + m[11] * z + m[15];
  return [
    (m[0] * x + m[4] * y + m[8] * z + m[12]) / w,
    (m[1] * x + m[5] * y + m[9] * z + m[13]) / w,
    (m[2] * x + m[6] * y + m[10] * z + m[14]) / w,
    w,
  ];
}

export function mat3ColFromRow(m) {
  return new Float32Array([m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]]);
}


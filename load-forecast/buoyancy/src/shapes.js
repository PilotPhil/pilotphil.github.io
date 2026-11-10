/*
 * Convex ice meshes. Every shape is a closed, outward-oriented triangle/polygon
 * mesh. Geometry is recentred on its own volumetric centroid, so the rigid-body
 * origin is also the centre of mass (uniform density).
 */
import {
  add,
  cross,
  dot,
  length,
  normalize,
  randRange,
} from './math.js';

export const SHAPE_ORDER = ['box', 'hex', 'sphere', 'tetra', 'cylinder'];

export const SHAPE_META = {
  box: { label: '长方体', short: '长方体' },
  hex: { label: '六棱柱', short: '六棱柱' },
  sphere: { label: '球体', short: '球体' },
  tetra: { label: '四面体', short: '四面体' },
  cylinder: { label: '圆柱体', short: '圆柱体' },
};

function newellNormal(vertices, face) {
  let nx = 0, ny = 0, nz = 0;
  for (let i = 0; i < face.length; i++) {
    const a = vertices[face[i]];
    const b = vertices[face[(i + 1) % face.length]];
    nx += (a[1] - b[1]) * (a[2] + b[2]);
    ny += (a[2] - b[2]) * (a[0] + b[0]);
    nz += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return [nx, ny, nz];
}

export function orientFaces(vertices, faces) {
  const center = vertices.reduce((s, v) => add(s, v), [0, 0, 0]).map((v) => v / vertices.length);
  for (const face of faces) {
    const normal = newellNormal(vertices, face);
    const faceCenter = face.reduce((s, i) => add(s, vertices[i]), [0, 0, 0]).map((v) => v / face.length);
    if (dot(normal, [faceCenter[0] - center[0], faceCenter[1] - center[1], faceCenter[2] - center[2]]) < 0) {
      face.reverse();
    }
  }
  return faces;
}

/** Signed volume and first moment of a closed polygon mesh. */
export function meshVolumeCentroid(vertices, faces) {
  let volume = 0;
  let mx = 0, my = 0, mz = 0;
  for (const face of faces) {
    const a = vertices[face[0]];
    for (let i = 1; i < face.length - 1; i++) {
      const b = vertices[face[i]];
      const c = vertices[face[i + 1]];
      const v = dot(a, cross(b, c)) / 6;
      volume += v;
      mx += v * (a[0] + b[0] + c[0]) / 4;
      my += v * (a[1] + b[1] + c[1]) / 4;
      mz += v * (a[2] + b[2] + c[2]) / 4;
    }
  }
  if (Math.abs(volume) < 1e-12) return { volume: 0, centroid: [0, 0, 0] };
  return { volume, centroid: [mx / volume, my / volume, mz / volume] };
}

function inertiaPerMass(vertices, faces, volume) {
  // C = integral(x x^T dV). For a tetrahedron (0,a,b,c), by symmetry:
  // C_tet = V_tet / 20 * (s s^T + aa^T + bb^T + cc^T), s = a+b+c.
  // I = trace(C)I - C, and the per-mass inertia is I / V.
  const C = new Array(9).fill(0);
  for (const face of faces) {
    const a = vertices[face[0]];
    for (let i = 1; i < face.length - 1; i++) {
      const b = vertices[face[i]];
      const c = vertices[face[i + 1]];
      const v = dot(a, cross(b, c)) / 6;
      const s = [a[0] + b[0] + c[0], a[1] + b[1] + c[1], a[2] + b[2] + c[2]];
      const src = [a, b, c];
      const w = v / 20;
      for (let r = 0; r < 3; r++) {
        for (let q = 0; q < 3; q++) {
          let term = s[r] * s[q];
          for (const p of src) term += p[r] * p[q];
          C[r * 3 + q] += w * term;
        }
      }
    }
  }
  const cxx = C[0] / volume;
  const cyy = C[4] / volume;
  const czz = C[8] / volume;
  const cxy = (C[1] + C[3]) * 0.5 / volume;
  const cxz = (C[2] + C[6]) * 0.5 / volume;
  const cyz = (C[5] + C[7]) * 0.5 / volume;
  return [
    cyy + czz, -cxy, -cxz,
    -cxy, cxx + czz, -cyz,
    -cxz, -cyz, cxx + cyy,
  ];
}

function buildRenderData(vertices, faces, { smooth = false, edges = true } = {}) {
  const positions = [];
  const normals = [];
  const seen = new Set();
  const edgePositions = [];

  for (const face of faces) {
    const n = normalize(newellNormal(vertices, face));
    for (let i = 1; i < face.length - 1; i++) {
      const ids = [face[0], face[i], face[i + 1]];
      for (const id of ids) {
        positions.push(...vertices[id]);
        if (smooth) normals.push(...normalize(vertices[id]));
        else normals.push(...n);
      }
    }
    if (edges) {
      for (let i = 0; i < face.length; i++) {
        const a = face[i];
        const b = face[(i + 1) % face.length];
        const key = a < b ? `${a}:${b}` : `${b}:${a}`;
        if (seen.has(key)) continue;
        seen.add(key);
        edgePositions.push(...vertices[a], ...vertices[b]);
      }
    }
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    edgePositions: new Float32Array(edgePositions),
    edgeCount: edgePositions.length / 3,
  };
}

function buildBox(rng) {
  const w = randRange(rng, 0.53, 0.81);
  const h = randRange(rng, 0.38, 0.68);
  const d = randRange(rng, 0.49, 0.79);
  const x = w / 2, y = h / 2, z = d / 2;
  const vertices = [
    [-x, -y, -z], [x, -y, -z], [x, y, -z], [-x, y, -z],
    [-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z],
  ];
  const faces = [
    [0, 3, 2, 1],
    [4, 5, 6, 7],
    [0, 4, 7, 3],
    [1, 2, 6, 5],
    [0, 1, 5, 4],
    [3, 7, 6, 2],
  ];
  return { vertices, faces, smooth: false, dims: { w, h, d } };
}

function buildPrism(rng, sides, radius, height) {
  const vertices = [];
  const half = height / 2;
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2 + Math.PI / sides;
    vertices.push([Math.cos(a) * radius, -half, Math.sin(a) * radius]);
  }
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2 + Math.PI / sides;
    vertices.push([Math.cos(a) * radius, half, Math.sin(a) * radius]);
  }
  const faces = [];
  faces.push([...Array(sides).keys()]);
  faces.push([...Array(sides).keys()].map((i) => sides * 2 - 1 - i));
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    faces.push([i, sides + i, sides + j, j]);
  }
  return { vertices, faces, smooth: false };
}

function buildSphere(rng) {
  const radius = randRange(rng, 0.295, 0.405);
  const lonSegments = 20;
  const latSegments = 12;
  const vertices = [[0, radius, 0], [0, -radius, 0]];
  // vertices[0] = north pole, vertices[1] = south pole
  for (let lat = 1; lat < latSegments; lat++) {
    const phi = (lat / latSegments) * Math.PI;
    const y = Math.cos(phi) * radius;
    const r = Math.sin(phi) * radius;
    for (let lon = 0; lon < lonSegments; lon++) {
      const theta = (lon / lonSegments) * Math.PI * 2;
      vertices.push([Math.cos(theta) * r, y, Math.sin(theta) * r]);
    }
  }
  const faces = [];
  const ringStart = 2;
  const ringIndex = (lat, lon) => ringStart + (lat - 1) * lonSegments + (lon % lonSegments);
  for (let lon = 0; lon < lonSegments; lon++) {
    faces.push([0, ringIndex(1, lon), ringIndex(1, lon + 1)]);
  }
  for (let lat = 1; lat < latSegments - 1; lat++) {
    for (let lon = 0; lon < lonSegments; lon++) {
      faces.push([
        ringIndex(lat, lon),
        ringIndex(lat + 1, lon),
        ringIndex(lat + 1, lon + 1),
        ringIndex(lat, lon + 1),
      ]);
    }
  }
  for (let lon = 0; lon < lonSegments; lon++) {
    faces.push([1, ringIndex(latSegments - 1, lon + 1), ringIndex(latSegments - 1, lon)]);
  }
  return { vertices, faces, smooth: true, edges: false, radius };
}

function buildTetra(rng) {
  const edge = randRange(rng, 0.6, 0.84);
  const s = edge / (2 * Math.SQRT2);
  const vertices = [
    [s, s, s],
    [s, -s, -s],
    [-s, s, -s],
    [-s, -s, s],
  ];
  const faces = [
    [0, 1, 2],
    [0, 3, 1],
    [0, 2, 3],
    [1, 3, 2],
  ];
  return { vertices, faces, smooth: false, edge };
}

function buildCylinder(rng) {
  return buildPrism(rng, 20, randRange(rng, 0.27, 0.37), randRange(rng, 0.43, 0.69));
}

const BUILDERS = {
  box: buildBox,
  hex: (rng) => buildPrism(rng, 6, randRange(rng, 0.32, 0.43), randRange(rng, 0.41, 0.7)),
  sphere: buildSphere,
  tetra: buildTetra,
  cylinder: buildCylinder,
};

/**
 * Build one randomized ice body of the requested type.
 * Returned local vertices are centred at the centre of mass.
 */
export function createShape(type = 'box', rng = Math.random) {
  const key = SHAPE_META[type] ? type : 'box';
  const built = BUILDERS[key](rng);
  let vertices = built.vertices;
  let faces = built.faces;
  orientFaces(vertices, faces);

  const raw = meshVolumeCentroid(vertices, faces);
  const c = raw.centroid;
  vertices = vertices.map((v) => [v[0] - c[0], v[1] - c[1], v[2] - c[2]]);
  const stats = meshVolumeCentroid(vertices, faces);
  const volume = Math.abs(stats.volume);
  const inertiaUnit = inertiaPerMass(vertices, faces, volume);

  let boundRadius = 0;
  for (const v of vertices) boundRadius = Math.max(boundRadius, length(v));

  const render = buildRenderData(vertices, faces, {
    smooth: built.smooth,
    edges: built.edges !== false,
  });

  return {
    type: key,
    label: SHAPE_META[key].label,
    vertices,
    faces,
    volume,
    inertiaUnit,
    boundRadius,
    render,
    dims: built.dims || null,
  };
}

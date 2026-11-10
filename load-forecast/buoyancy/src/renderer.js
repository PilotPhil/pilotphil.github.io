/* Minimal WebGL 1 renderer: faceted ice, crisp edges, and a transparent sea. */
import {
  clamp,
  mat3ColFromRow,
  mat3FromQuat,
  mat4Model,
  lookAt,
  normalize,
  perspective,
  sub,
  cross,
  dot,
} from './math.js';

export class OrbitCamera {
  constructor({
    yaw = 0.48,
    pitch = 0.4,
    distance = 8.8,
    target = [-0.2, -0.18, 0.02],
    fov = (36.5 * Math.PI) / 180,
  } = {}) {
    this.home = { yaw, pitch, distance, target: [...target], fov };
    this.yaw = yaw;
    this.pitch = pitch;
    this.distance = distance;
    this.target = [...target];
    this.fov = fov;
    this.aspect = 1;
    this.view = null;
    this.projection = null;
    this.width = 0;
    this.height = 0;
    this.layoutScale = 1;
  }

  eye() {
    const cp = Math.cos(this.pitch);
    return [
      this.target[0] + Math.sin(this.yaw) * cp * this.distance * this.layoutScale,
      this.target[1] + Math.sin(this.pitch) * this.distance * this.layoutScale,
      this.target[2] + Math.cos(this.yaw) * cp * this.distance * this.layoutScale,
    ];
  }

  basis() {
    const eye = this.eye();
    const forward = normalize(sub(this.target, eye));
    const right = normalize(cross(forward, [0, 1, 0]));
    const up = cross(right, forward);
    return { eye, forward, right, up };
  }

  update(width, height) {
    if (width <= 0 || height <= 0) return;
    this.width = width;
    this.height = height;
    this.aspect = width / height;
    // On tall / narrow stages keep the horizontal field wide enough for the
    // whole ice row by pulling the camera back, rather than cropping it.
    this.layoutScale = Math.max(1, 1.05 / Math.max(0.35, this.aspect));
    const eye = this.eye();
    this.view = lookAt(eye, this.target, [0, 1, 0]);
    this.projection = perspective(this.fov, this.aspect, 0.08, 60);
  }

  project(point) {
    const { eye, forward, right, up } = this.basis();
    const rel = [point[0] - eye[0], point[1] - eye[1], point[2] - eye[2]];
    const z = dot(rel, forward);
    if (z <= 0.03) return { visible: false, x: 0, y: 0, depth: z };
    const tan = Math.tan(this.fov / 2);
    const nx = dot(rel, right) / (z * tan * this.aspect);
    const ny = dot(rel, up) / (z * tan);
    return {
      visible: nx > -1.12 && nx < 1.12 && ny > -1.12 && ny < 1.12,
      x: (nx * 0.5 + 0.5) * this.width,
      y: (1 - (ny * 0.5 + 0.5)) * this.height,
      depth: z,
    };
  }

  screenRay(sx, sy) {
    const { eye, forward, right, up } = this.basis();
    const tan = Math.tan(this.fov / 2);
    const nx = (sx / Math.max(1, this.width)) * 2 - 1;
    const ny = 1 - (sy / Math.max(1, this.height)) * 2;
    const dir = normalize([
      forward[0] + right[0] * nx * tan * this.aspect + up[0] * ny * tan,
      forward[1] + right[1] * nx * tan * this.aspect + up[1] * ny * tan,
      forward[2] + right[2] * nx * tan * this.aspect + up[2] * ny * tan,
    ]);
    return { origin: eye, dir };
  }

  orbit(dx, dy) {
    this.yaw -= dx * 0.006;
    this.pitch = clamp(this.pitch + dy * 0.0045, 0.1, 1.22);
  }

  zoom(factor) {
    this.distance = clamp(this.distance * factor, 4.2, 12.5);
  }

  reset() {
    this.yaw = this.home.yaw;
    this.pitch = this.home.pitch;
    this.distance = this.home.distance;
    this.target = [...this.home.target];
  }
}

const ICE_VERT = `
attribute vec3 aPosition;
attribute vec3 aNormal;
uniform mat4 uProjection;
uniform mat4 uView;
uniform mat4 uModel;
uniform mat3 uNormalMat;
varying vec3 vWorld;
varying vec3 vNormal;

void main() {
  vec4 world = uModel * vec4(aPosition, 1.0);
  vWorld = world.xyz;
  vNormal = normalize(uNormalMat * aNormal);
  gl_Position = uProjection * uView * world;
}
`;

const ICE_FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

varying vec3 vWorld;
varying vec3 vNormal;

uniform vec3 uCamera;
uniform float uWaterLevel;
uniform float uSelected;
uniform float uTime;
uniform vec3 uIceLight;
uniform vec3 uIceMid;
uniform vec3 uIceShadow;
uniform vec3 uWaterTint;
uniform vec3 uAccent;

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(uCamera - vWorld);
  vec3 L1 = normalize(vec3(-0.45, 0.9, 0.55));
  vec3 L2 = normalize(vec3(0.72, 0.3, -0.55));
  float d1 = max(dot(N, L1), 0.0);
  float d2 = max(dot(N, L2), 0.0);
  float hemi = clamp(N.y * 0.5 + 0.5, 0.0, 1.0);

  float keyLight = smoothstep(0.08, 1.0, d1);
  float skyLight = smoothstep(-0.25, 0.95, N.y);

  vec3 albedo = mix(uIceShadow, uIceMid, 0.25 + 0.58 * skyLight);
  albedo = mix(albedo, uIceLight, keyLight * 0.44);
  albedo *= 0.86 + 0.1 * d2;

  float fresnel = pow(1.0 - max(dot(N, V), 0.0), 2.7);
  vec3 halfDir = normalize(L1 + V);
  float spec = pow(max(dot(N, halfDir), 0.0), 72.0);

  vec3 above = albedo;
  above += fresnel * vec3(0.20, 0.38, 0.42);
  above += pow(fresnel, 2.8) * vec3(0.36, 0.48, 0.48);
  above += spec * vec3(0.72, 0.92, 0.96) * 0.24;

  float under = smoothstep(-0.01, 0.012, uWaterLevel - vWorld.y);
  float depth = max(uWaterLevel - vWorld.y, 0.0);
  float depthT = clamp(depth / 1.2, 0.0, 1.0);
  vec3 underwater = mix(uWaterTint, vec3(0.21, 0.56, 0.70), depthT * 0.5);
  underwater = mix(underwater, albedo * 0.72, 0.48);
  underwater += fresnel * vec3(0.10, 0.25, 0.27);
  underwater += spec * vec3(0.30, 0.48, 0.48) * 0.18;
  vec3 color = mix(above, underwater, under);

  float wetline = 1.0 - smoothstep(0.0, 0.016, abs(vWorld.y - uWaterLevel));
  color += wetline * under * vec3(0.20, 0.34, 0.34);

  float pulse = 0.82 + 0.18 * sin(uTime * 2.4);
  color += uSelected * fresnel * uAccent * 0.8 * pulse;
  color += uSelected * under * vec3(0.015, 0.055, 0.07);

  gl_FragColor = vec4(color, 1.0);
}
`;

const OUTLINE_VERT = `
attribute vec3 aPosition;
uniform mat4 uProjection;
uniform mat4 uView;
uniform mat4 uModel;
uniform float uScale;

void main() {
  vec3 scaled = aPosition * uScale;
  gl_Position = uProjection * uView * uModel * vec4(scaled, 1.0);
}
`;

const OUTLINE_FRAG = `
precision mediump float;
uniform vec3 uColor;
uniform float uAlpha;

void main() {
  gl_FragColor = vec4(uColor, uAlpha);
}
`;

const LINE_VERT = `
attribute vec3 aPosition;
uniform mat4 uProjection;
uniform mat4 uView;
uniform mat4 uModel;

void main() {
  gl_Position = uProjection * uView * uModel * vec4(aPosition, 1.0);
}
`;

const LINE_FRAG = `
precision mediump float;
uniform vec3 uColor;
uniform float uAlpha;

void main() {
  gl_FragColor = vec4(uColor, uAlpha);
}
`;

const WATER_VERT = `
attribute vec3 aPosition;
uniform mat4 uProjection;
uniform mat4 uView;
varying vec3 vWorld;

void main() {
  vWorld = aPosition;
  gl_Position = uProjection * uView * vec4(aPosition, 1.0);
}
`;

const WATER_FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

varying vec3 vWorld;
uniform float uTime;
uniform vec3 uShallow;
uniform vec3 uDeep;
uniform vec4 uShadows[8];

void main() {
  vec2 p = vWorld.xz;
  float t = uTime;
  float radius = length(p);
  float disc = 1.0 - smoothstep(5.02, 5.42, radius);
  if (disc < 0.004) discard;

  // Deeper at the centre, pale and glassy at the rim.
  float edge = smoothstep(0.15, 5.1, radius);
  vec3 color = mix(uDeep, uShallow, edge * 0.75);

  float c1 = sin(p.x * 3.1 + sin(p.y * 1.8 + t * 0.25) * 1.15 + t * 0.22);
  float c2 = sin(p.y * 2.7 - sin(p.x * 1.5 - t * 0.18) * 1.0 - t * 0.17);
  float c3 = sin((p.x + p.y) * 4.2 + t * 0.32);
  float caustic = smoothstep(0.56, 1.0, abs(c1 * c2 + c3 * 0.35));
  color = mix(color, vec3(0.85, 0.97, 1.0), caustic * 0.18);

  float sparkleField = sin(p.x * 7.2 + sin(p.y * 2.4 + t * 0.3) * 1.3 + t * 0.4)
                     * sin(p.y * 6.1 - sin(p.x * 1.9 - t * 0.2) * 1.1 - t * 0.32);
  float sparkle = smoothstep(0.93, 1.0, sparkleField) * 0.12;
  color += sparkle * vec3(0.9, 0.98, 1.0);

  float rim = 1.0 - smoothstep(0.0, 0.035, abs(radius - 5.0));
  float shelf = smoothstep(4.65, 5.02, radius) * (1.0 - smoothstep(5.02, 5.32, radius));
  color = mix(color, vec3(0.18, 0.53, 0.67), shelf * 0.14);
  color = mix(color, vec3(0.84, 0.96, 0.99), rim * 0.82);

  float contactGlow = 0.0;
  for (int i = 0; i < 8; i++) {
    vec4 shadow = uShadows[i];
    float active = step(0.001, shadow.w);
    float d = distance(p, shadow.xy);
    float contact = 1.0 - smoothstep(shadow.z * 0.12, shadow.z * 0.82, d);
    color = mix(color, vec3(0.16, 0.48, 0.61), contact * 0.1 * shadow.w * active);

    float phase = t * 0.45 + float(i) * 1.7;
    float ringRadius = shadow.z * (1.04 + 0.025 * sin(phase));
    float ring = 1.0 - smoothstep(0.0, 0.016, abs(d - ringRadius));
    contactGlow += ring * 0.18 * shadow.w * active;

    float outerRing = 1.0 - smoothstep(0.0, 0.012, abs(d - shadow.z * 1.55));
    contactGlow += outerRing * 0.035 * shadow.w * active;
  }
  color += contactGlow * vec3(0.74, 0.92, 0.93);

  float alpha = (0.38 + caustic * 0.07 + sparkle * 0.28 + rim * 0.2) * disc;
  gl_FragColor = vec4(color, clamp(alpha, 0.0, 0.58));
}
`;

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compilation failed: ${log}`);
  }
  return shader;
}

function createProgram(gl, vertSource, fragSource) {
  const vert = compileShader(gl, gl.VERTEX_SHADER, vertSource);
  const frag = compileShader(gl, gl.FRAGMENT_SHADER, fragSource);
  const program = gl.createProgram();
  gl.attachShader(program, vert);
  gl.attachShader(program, frag);
  gl.linkProgram(program);
  gl.deleteShader(vert);
  gl.deleteShader(frag);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Program link failed: ${log}`);
  }
  return program;
}

export class IceRenderer {
  constructor(canvas, camera) {
    this.canvas = canvas;
    this.camera = camera;
    const gl = canvas.getContext('webgl', {
      alpha: true,
      antialias: true,
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
    }) || canvas.getContext('experimental-webgl');
    if (!gl) throw new Error('WebGL is not available.');
    this.gl = gl;
    this.gpuCache = new WeakMap();
    this.elapsed = 0;
    this.shadowData = new Float32Array(8 * 4);

    this.ice = this.buildIceProgram();
    this.outline = this.buildOutlineProgram();
    this.line = this.buildLineProgram();
    this.water = this.buildWaterProgram();
    this.waterPlane = this.buildWaterPlane();

    gl.disable(gl.BLEND);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.clearColor(0, 0, 0, 0);
  }

  buildIceProgram() {
    const gl = this.gl;
    const program = createProgram(gl, ICE_VERT, ICE_FRAG);
    const attrib = {
      position: gl.getAttribLocation(program, 'aPosition'),
      normal: gl.getAttribLocation(program, 'aNormal'),
    };
    const uniform = {};
    for (const name of [
      'uProjection', 'uView', 'uModel', 'uNormalMat', 'uCamera',
      'uWaterLevel', 'uSelected', 'uTime', 'uIceLight', 'uIceMid',
      'uIceShadow', 'uWaterTint', 'uAccent',
    ]) uniform[name] = gl.getUniformLocation(program, name);
    return { program, attrib, uniform };
  }

  buildLineProgram() {
    const gl = this.gl;
    const program = createProgram(gl, LINE_VERT, LINE_FRAG);
    const attrib = { position: gl.getAttribLocation(program, 'aPosition') };
    const uniform = {};
    for (const name of ['uProjection', 'uView', 'uModel', 'uColor', 'uAlpha']) {
      uniform[name] = gl.getUniformLocation(program, name);
    }
    return { program, attrib, uniform };
  }

  buildOutlineProgram() {
    const gl = this.gl;
    const program = createProgram(gl, OUTLINE_VERT, OUTLINE_FRAG);
    const attrib = { position: gl.getAttribLocation(program, 'aPosition') };
    const uniform = {};
    for (const name of ['uProjection', 'uView', 'uModel', 'uScale', 'uColor', 'uAlpha']) {
      uniform[name] = gl.getUniformLocation(program, name);
    }
    return { program, attrib, uniform };
  }

  buildWaterProgram() {
    const gl = this.gl;
    const program = createProgram(gl, WATER_VERT, WATER_FRAG);
    const attrib = { position: gl.getAttribLocation(program, 'aPosition') };
    const uniform = {};
    for (const name of [
      'uProjection', 'uView', 'uTime', 'uShallow', 'uDeep', 'uShadows[0]',
    ]) uniform[name] = gl.getUniformLocation(program, name);
    return { program, attrib, uniform };
  }

  buildWaterPlane() {
    const gl = this.gl;
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -22, 0, -22,
      22, 0, -22,
      -22, 0, 22,
      22, 0, 22,
    ]), gl.STATIC_DRAW);
    return buffer;
  }

  getGpu(shape) {
    let gpu = this.gpuCache.get(shape);
    if (gpu) return gpu;
    const gl = this.gl;
    const make = (data) => {
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      return buffer;
    };
    gpu = {
      positions: make(shape.render.positions),
      normals: make(shape.render.normals),
      edges: make(shape.render.edgePositions),
      edgeCount: shape.render.edgeCount,
    };
    this.gpuCache.set(shape, gpu);
    return gpu;
  }

  releaseBodies(bodies) {
    const gl = this.gl;
    for (const body of bodies) {
      const gpu = this.gpuCache.get(body.shape);
      if (!gpu) continue;
      gl.deleteBuffer(gpu.positions);
      gl.deleteBuffer(gpu.normals);
      gl.deleteBuffer(gpu.edges);
      this.gpuCache.delete(body.shape);
    }
  }

  resizeToDisplaySize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
    const height = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.gl.viewport(0, 0, width, height);
    if (this.canvas.clientWidth > 0 && this.canvas.clientHeight > 0) {
      this.camera.update(this.canvas.clientWidth, this.canvas.clientHeight);
    }
  }

  render(sim, selectedId, dt = 0.016) {
    this.elapsed += dt;
    this.resizeToDisplaySize();
    const gl = this.gl;
    const { width, height } = this.canvas;
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const bodies = [...sim.bodies];
    const selectedIndex = bodies.findIndex((b) => b.id === selectedId);
    if (selectedIndex >= 0) {
      const [selected] = bodies.splice(selectedIndex, 1);
      bodies.push(selected);
    }

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.frontFace(gl.CCW);
    gl.disable(gl.BLEND);
    gl.depthMask(true);
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(1.0, 1.0);

    gl.useProgram(this.ice.program);
    gl.uniformMatrix4fv(this.ice.uniform.uProjection, false, this.camera.projection);
    gl.uniformMatrix4fv(this.ice.uniform.uView, false, this.camera.view);
    gl.uniform3fv(this.ice.uniform.uCamera, this.camera.eye());
    gl.uniform1f(this.ice.uniform.uWaterLevel, sim.waterLevel);
    gl.uniform1f(this.ice.uniform.uTime, this.elapsed);
    gl.uniform3f(this.ice.uniform.uIceLight, 0.96, 0.995, 1.0);
    gl.uniform3f(this.ice.uniform.uIceMid, 0.62, 0.91, 0.97);
    gl.uniform3f(this.ice.uniform.uIceShadow, 0.30, 0.67, 0.81);
    gl.uniform3f(this.ice.uniform.uWaterTint, 0.31, 0.68, 0.80);
    gl.uniform3f(this.ice.uniform.uAccent, 0.06, 0.55, 0.76);

    // A cheap back-face silhouette pass gives the faceted ice a readable rim
    // without a post-processing buffer.
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.cullFace(gl.FRONT);
    gl.depthMask(false);
    gl.useProgram(this.outline.program);
    gl.uniformMatrix4fv(this.outline.uniform.uProjection, false, this.camera.projection);
    gl.uniformMatrix4fv(this.outline.uniform.uView, false, this.camera.view);
    for (const body of bodies) {
      const gpu = this.getGpu(body.shape);
      const selected = body.id === selectedId;
      gl.uniformMatrix4fv(this.outline.uniform.uModel, false, mat4Model(body.quaternion, body.position));
      gl.uniform1f(this.outline.uniform.uScale, selected ? 1.04 : 1.032);
      gl.uniform3f(this.outline.uniform.uColor, selected ? 0.02 : 0.05, selected ? 0.37 : 0.24, selected ? 0.5 : 0.31);
      gl.uniform1f(this.outline.uniform.uAlpha, selected ? 0.55 : 0.36);
      gl.bindBuffer(gl.ARRAY_BUFFER, gpu.positions);
      gl.enableVertexAttribArray(this.outline.attrib.position);
      gl.vertexAttribPointer(this.outline.attrib.position, 3, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, body.shape.render.positions.length / 3);
    }
    gl.cullFace(gl.BACK);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.useProgram(this.ice.program);

    for (const body of bodies) {
      const gpu = this.getGpu(body.shape);
      const model = mat4Model(body.quaternion, body.position);
      const rotation = mat3FromQuat(body.quaternion);
      gl.uniformMatrix4fv(this.ice.uniform.uModel, false, model);
      gl.uniformMatrix3fv(this.ice.uniform.uNormalMat, false, mat3ColFromRow(rotation));
      gl.uniform1f(this.ice.uniform.uSelected, body.id === selectedId ? 1 : 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, gpu.positions);
      gl.enableVertexAttribArray(this.ice.attrib.position);
      gl.vertexAttribPointer(this.ice.attrib.position, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, gpu.normals);
      gl.enableVertexAttribArray(this.ice.attrib.normal);
      gl.vertexAttribPointer(this.ice.attrib.normal, 3, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, body.shape.render.positions.length / 3);
    }

    // Facet / silhouette lines.
    gl.disable(gl.POLYGON_OFFSET_FILL);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.useProgram(this.line.program);
    gl.uniformMatrix4fv(this.line.uniform.uProjection, false, this.camera.projection);
    gl.uniformMatrix4fv(this.line.uniform.uView, false, this.camera.view);

    for (const body of bodies) {
      if (body.shape.render.edgeCount === 0) continue;
      const gpu = this.getGpu(body.shape);
      const selected = body.id === selectedId;
      const model = mat4Model(body.quaternion, body.position);
      gl.uniformMatrix4fv(this.line.uniform.uModel, false, model);
      gl.uniform3f(this.line.uniform.uColor, selected ? 0.03 : 0.055, selected ? 0.44 : 0.22, selected ? 0.59 : 0.30);
      gl.uniform1f(this.line.uniform.uAlpha, selected ? 0.82 : 0.52);
      gl.bindBuffer(gl.ARRAY_BUFFER, gpu.edges);
      gl.enableVertexAttribArray(this.line.attrib.position);
      gl.vertexAttribPointer(this.line.attrib.position, 3, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.LINES, 0, gpu.edgeCount);
    }

    // Transparent water surface, drawn after the bodies so depth testing tints
    // only the parts that are actually beneath it.
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.enable(gl.BLEND);
    gl.useProgram(this.water.program);
    gl.uniformMatrix4fv(this.water.uniform.uProjection, false, this.camera.projection);
    gl.uniformMatrix4fv(this.water.uniform.uView, false, this.camera.view);
    gl.uniform1f(this.water.uniform.uTime, this.elapsed);
    gl.uniform3f(this.water.uniform.uShallow, 0.57, 0.84, 0.93);
    gl.uniform3f(this.water.uniform.uDeep, 0.27, 0.61, 0.77);

    this.shadowData.fill(0);
    for (let i = 0; i < Math.min(8, sim.bodies.length); i++) {
      const body = sim.bodies[i];
      const above = Math.max(0, body.minY - sim.waterLevel);
      const below = Math.max(0, sim.waterLevel - body.maxY);
      let strength = 0;
      if (body.submergedFraction > 0.015 && body.submergedFraction < 0.995) strength = 1;
      else if (body.submergedFraction <= 0.015 && above < 1.2) strength = 0.5 * (1 - above / 1.2);
      else if (body.submergedFraction >= 0.995 && below < 0.35) strength = 0.4;
      if (sim.bodies.length > 8) strength *= 0.5;
      const base = i * 4;
      this.shadowData[base] = body.position[0];
      this.shadowData[base + 1] = body.position[2];
      this.shadowData[base + 2] = body.shape.boundRadius * (0.64 + above * 0.35);
      this.shadowData[base + 3] = clamp(strength, 0, 1);
    }
    gl.uniform4fv(this.water.uniform['uShadows[0]'], this.shadowData);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.waterPlane);
    gl.enableVertexAttribArray(this.water.attrib.position);
    gl.vertexAttribPointer(this.water.attrib.position, 3, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    gl.depthMask(true);
    gl.disable(gl.BLEND);
    return { width, height };
  }
}

/** Ray-sphere hit test used by click-to-select. */
export function pickBody(bodies, camera, sx, sy) {
  const ray = camera.screenRay(sx, sy);
  let best = null;
  let bestT = Infinity;
  for (const body of bodies) {
    const oc = sub(ray.origin, body.position);
    const b = dot(oc, ray.dir);
    const c = dot(oc, oc) - (body.shape.boundRadius * 1.02) ** 2;
    const disc = b * b - c;
    if (disc < 0) continue;
    const t = -b - Math.sqrt(disc);
    if (t > 0 && t < bestT) {
      bestT = t;
      best = body;
    }
  }
  return best;
}

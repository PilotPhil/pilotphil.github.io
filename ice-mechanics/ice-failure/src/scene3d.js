/* ==========================================================================
 * scene3d.js — 主应力空间 (σ₁, σ₂, σ₃) 三维演示
 *  · 四个 g = 1 失效面（径向剖分 + 盒体裁剪）
 *  · σ₃ = 常数 切片平面与四条包络线
 *  · 应力点、单轴强度点、坐标轴与刻度（HTML 标签）
 * ========================================================================== */
(function () {
  'use strict';
  const C = window.ICECriteria;
  const BOX_MIN = -10, BOX_MAX = 5;
  const CENTER = new THREE.Vector3((BOX_MIN + BOX_MAX) / 2, (BOX_MIN + BOX_MAX) / 2, (BOX_MIN + BOX_MAX) / 2);

  const COL_INK = 0x2c3a4e;
  const COL_AXIS = 0x8c99ac;
  const COL_GRID = 0xc7d2e0;

  class Scene3D {
    constructor(container, labelsEl) {
      this.container = container;
      this.labelsEl = labelsEl;
      this.state = { s: [0, 0, 0], focus: null, visible: {}, showSlice: true };
      this.mode = '2d';
      this.available = true;
      this.instant = /[?&]noanim/.test(location.search)
        || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
      this.dirty = true;
      this._sliceKey = '';
      this._labels = [];
      this._surfaces = {};
      this._curveMeshes = {};
      this._pointPos = new THREE.Vector3();

      this.orbit = { theta: 0.74, phi: 1.12, r: 38, tx: CENTER.x, ty: CENTER.y, tz: CENTER.z };
      this.goal = { ...this.orbit };
      this._dragging = null;

      this._initRenderer();
      this._initScene();
      this._buildAxes();
      this._buildSurfaces();
      this._buildSlice();
      this._buildPoint();
      this._buildLabels();
      this._bindPointer();
      this.resize();

      this._loop = this._loop.bind(this);
      requestAnimationFrame(this._loop);
    }

    /* ------------------------------------------------------------ 初始化 */
    _initRenderer() {
      this.renderer = new THREE.WebGLRenderer({
        antialias: true, alpha: true, preserveDrawingBuffer: true,
        powerPreference: 'high-performance',
      });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.renderer.localClippingEnabled = true;
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.setClearColor(0x000000, 0);
      this.container.appendChild(this.renderer.domElement);

      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(36, 1, 0.1, 400);
      this.camera.position.set(24, 15, 27);
      this.camera.lookAt(CENTER);

      this.scene.add(new THREE.HemisphereLight(0xffffff, 0xdfe7f2, 1.15));
      const key = new THREE.DirectionalLight(0xffffff, 1.1);
      key.position.set(20, 30, 24);
      this.scene.add(key);
      const fill = new THREE.DirectionalLight(0xdfeaff, 0.55);
      fill.position.set(-24, -10, -18);
      this.scene.add(fill);
    }

    _initScene() {
      const b = BOX_MIN, m = BOX_MAX;
      this.clipPlanes = [
        new THREE.Plane(new THREE.Vector3(1, 0, 0), -b),
        new THREE.Plane(new THREE.Vector3(-1, 0, 0), m),
        new THREE.Plane(new THREE.Vector3(0, 1, 0), -b),
        new THREE.Plane(new THREE.Vector3(0, -1, 0), m),
        new THREE.Plane(new THREE.Vector3(0, 0, 1), -b),
        new THREE.Plane(new THREE.Vector3(0, 0, -1), m),
      ];
    }

    /* -------------------------------------------------------------- 坐标轴 */
    _buildAxes() {
      const g = new THREE.Group();
      const axisLen = BOX_MAX + 1.2;
      const mat = new THREE.MeshBasicMaterial({ color: COL_AXIS });

      const cyl = (from, to, radius) => {
        const dir = new THREE.Vector3().subVectors(to, from);
        const len = dir.length();
        const geo = new THREE.CylinderGeometry(radius, radius, len, 8);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(from).addScaledVector(dir, 0.5);
        mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
        return mesh;
      };

      // 三条主轴
      g.add(cyl(new THREE.Vector3(BOX_MIN, 0, 0), new THREE.Vector3(axisLen, 0, 0), 0.035));
      g.add(cyl(new THREE.Vector3(0, BOX_MIN, 0), new THREE.Vector3(0, axisLen, 0), 0.035));
      g.add(cyl(new THREE.Vector3(0, 0, BOX_MIN), new THREE.Vector3(0, 0, axisLen), 0.035));

      // 箭头
      const cone = (pos, dir) => {
        const geo = new THREE.ConeGeometry(0.12, 0.42, 10);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(pos);
        mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        return mesh;
      };
      g.add(cone(new THREE.Vector3(axisLen, 0, 0), new THREE.Vector3(1, 0, 0)));
      g.add(cone(new THREE.Vector3(0, axisLen, 0), new THREE.Vector3(0, 1, 0)));
      g.add(cone(new THREE.Vector3(0, 0, axisLen), new THREE.Vector3(0, 0, 1)));

      // 刻度
      const tickMat = new THREE.MeshBasicMaterial({ color: COL_AXIS });
      for (let v = BOX_MIN; v <= BOX_MAX - 1e-9; v += 2) {
        if (Math.abs(v) < 1e-9) continue;
        const t = 0.16;
        g.add(cyl(new THREE.Vector3(v, -t, 0), new THREE.Vector3(v, t, 0), 0.022));
        g.add(cyl(new THREE.Vector3(-t, v, 0), new THREE.Vector3(t, v, 0), 0.022));
        g.add(cyl(new THREE.Vector3(0, -t, v), new THREE.Vector3(0, t, v), 0.022));
      }

      // 包围盒棱线
      const pts = [];
      const c = [BOX_MIN, BOX_MAX];
      for (const a of c) for (const b2 of c) {
        pts.push(new THREE.Vector3(BOX_MIN, a, b2), new THREE.Vector3(BOX_MAX, a, b2));
        pts.push(new THREE.Vector3(a, BOX_MIN, b2), new THREE.Vector3(a, BOX_MAX, b2));
        pts.push(new THREE.Vector3(a, b2, BOX_MIN), new THREE.Vector3(a, b2, BOX_MAX));
      }
      const boxGeo = new THREE.BufferGeometry().setFromPoints(pts);
      const boxLines = new THREE.LineSegments(boxGeo, new THREE.LineBasicMaterial({
        color: COL_GRID, transparent: true, opacity: 0.55,
      }));
      g.add(boxLines);

      this.scene.add(g);
      this.axisGroup = g;
    }

    /* ------------------------------------------------------------ 失效面 */
    _buildSurfaces() {
      for (const crit of C.CRITERIA) {
        const mesh = C.surfaceMesh(crit, { nt: 120 });
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
        geo.setAttribute('normal', new THREE.BufferAttribute(mesh.normals, 3));
        geo.setIndex(new THREE.BufferAttribute(mesh.indices, 1));

        const col = new THREE.Color(crit.color);
        const matBase = {
          color: col,
          emissive: col,
          emissiveIntensity: 0.16,
          roughness: 0.55,
          metalness: 0.0,
          transparent: true,
          opacity: 0.10,
          depthWrite: false,
          flatShading: !!crit.flat,
          clippingPlanes: this.clipPlanes,
        };
        // 背面 / 正面分两遍绘制：先画背面再画正面，消除半透明自混合的斑块
        const matBack = new THREE.MeshStandardMaterial({ ...matBase, side: THREE.BackSide });
        const matFront = new THREE.MeshStandardMaterial({ ...matBase, side: THREE.FrontSide });
        const back = new THREE.Mesh(geo, matBack);
        back.renderOrder = 2;
        back.visible = false;
        this.scene.add(back);
        const front = new THREE.Mesh(geo, matFront);
        front.renderOrder = 2.5;
        front.visible = false;
        this.scene.add(front);

        // 稀疏网格线，帮助读出三维形状
        const linePos = [];
        const step = 32;
        for (let i = 0; i <= mesh.ns; i += step) {
          for (let j = 0; j < mesh.nt; j++) {
            const j2 = (j + 1) % mesh.nt;
            const a = i * mesh.nt + j, b = i * mesh.nt + j2;
            if (!mesh.ok[a] || !mesh.ok[b]) continue;
            linePos.push(
              mesh.positions[a * 3], mesh.positions[a * 3 + 1], mesh.positions[a * 3 + 2],
              mesh.positions[b * 3], mesh.positions[b * 3 + 1], mesh.positions[b * 3 + 2]);
          }
        }
        for (let j = 0; j < mesh.nt; j += step) {
          for (let i = 0; i < mesh.ns; i++) {
            const a = i * mesh.nt + j, b = (i + 1) * mesh.nt + j;
            if (!mesh.ok[a] || !mesh.ok[b]) continue;
            linePos.push(
              mesh.positions[a * 3], mesh.positions[a * 3 + 1], mesh.positions[a * 3 + 2],
              mesh.positions[b * 3], mesh.positions[b * 3 + 1], mesh.positions[b * 3 + 2]);
          }
        }
        const lineGeo = new THREE.BufferGeometry();
        lineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(linePos), 3));
        const lineMat = new THREE.LineBasicMaterial({
          color: col, transparent: true, opacity: 0.42, depthWrite: false,
          clippingPlanes: this.clipPlanes,
        });
        const lines = new THREE.LineSegments(lineGeo, lineMat);
        lines.renderOrder = 3;
        lines.visible = false;
        this.scene.add(lines);

        this._surfaces[crit.id] = { back, front, mats: [matBack, matFront], lines, lineMat };
      }
    }

    /* -------------------------------------------------------------- 切片 */
    _buildSlice() {
      const size = BOX_MAX - BOX_MIN;
      const geo = new THREE.PlaneGeometry(size, size);
      const mat = new THREE.MeshBasicMaterial({
        color: 0xE8F1FA, transparent: true, opacity: 0.30,
        side: THREE.DoubleSide, depthWrite: false,
      });
      const plane = new THREE.Mesh(geo, mat);
      plane.position.set(CENTER.x, CENTER.y, 0);
      plane.renderOrder = 1;
      this.scene.add(plane);
      this.slicePlane = plane;

      // 边框
      const half = size / 2;
      const borderPts = [
        new THREE.Vector3(-half, -half, 0), new THREE.Vector3(half, -half, 0),
        new THREE.Vector3(half, half, 0), new THREE.Vector3(-half, half, 0),
      ];
      const borderGeo = new THREE.BufferGeometry().setFromPoints(
        borderPts.concat([borderPts[0]]).map(p => p.clone().add(new THREE.Vector3(CENTER.x, CENTER.y, 0)))
      );
      const border = new THREE.Line(borderGeo, new THREE.LineBasicMaterial({
        color: 0x9db6d2, transparent: true, opacity: 0.8,
      }));
      border.renderOrder = 1;
      this.scene.add(border);
      this.sliceBorder = border;

      this.curveGroup = new THREE.Group();
      this.scene.add(this.curveGroup);
      this._rebuildSliceCurves(0);
    }

    /** 材料参数变化后重建全部失效面与切片曲线 */
    rebuildSurfaces() {
      for (const crit of C.CRITERIA) {
        const item = this._surfaces[crit.id];
        if (!item) continue;
        this.scene.remove(item.back, item.front, item.lines);
        item.back.geometry.dispose();
        item.mats.forEach(m => m.dispose());
        item.lines.geometry.dispose();
        item.lineMat.dispose();
        delete this._surfaces[crit.id];
      }
      this._buildSurfaces();
      this._applyEmphasis();
      this._rebuildSliceCurves(this.state.s[2]);
      this.dirty = true;
    }

    _rebuildSliceCurves(s3) {
      while (this.curveGroup.children.length) {
        const ch = this.curveGroup.children.pop();
        ch.geometry.dispose();
        ch.material.dispose();
      }
      const curves = C.contourAtS3(s3, BOX_MIN, BOX_MAX, BOX_MIN, BOX_MAX, 120);
      for (const crit of C.CRITERIA) {
        const lines = curves[crit.id] || [];
        if (!lines.length) continue;
        const parts = [];
        for (const line of lines) {
          if (line.length < 3) continue;
          parts.push(planarTube(line, 0.045, s3));
        }
        if (!parts.length) continue;
        const merged = mergeGeometries(parts);
        const mat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(crit.color),
          emissive: new THREE.Color(crit.color),
          emissiveIntensity: 0.35,
          roughness: 0.45,
          metalness: 0,
          transparent: true,
          opacity: 1,
          clippingPlanes: this.clipPlanes,
        });
        const mesh = new THREE.Mesh(merged, mat);
        mesh.renderOrder = 3;
        mesh.visible = this.state.visible[crit.id] !== false;
        this.curveGroup.add(mesh);
        this._curveMeshes[crit.id] = mesh;
      }
      this._sliceKey = s3.toFixed(4);
      this.dirty = true;
    }

    /* ------------------------------------------------------------ 应力点 */
    _buildPoint() {
      const mat = new THREE.MeshStandardMaterial({ color: 0x101828, roughness: 0.35, metalness: 0.1 });
      this.pointMesh = new THREE.Mesh(new THREE.SphereGeometry(0.22, 24, 18), mat);
      this.pointMesh.renderOrder = 4;
      this.scene.add(this.pointMesh);

      this.pointHalo = new THREE.Mesh(
        new THREE.SphereGeometry(0.38, 20, 14),
        new THREE.MeshBasicMaterial({ color: 0x0b63a8, transparent: true, opacity: 0.16, depthWrite: false })
      );
      this.pointHalo.renderOrder = 4;
      this.scene.add(this.pointHalo);

      const lineGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0),
      ]);
      this.vectorLine = new THREE.Line(lineGeo, new THREE.LineDashedMaterial({
        color: 0x2c3a4e, dashSize: 0.42, gapSize: 0.3, transparent: true, opacity: 0.65,
      }));
      this.vectorLine.renderOrder = 3;
      this.scene.add(this.vectorLine);

      // 单轴强度点（T / C）
      const mk = (x, y, z, col) => {
        const m = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.16, 0),
          new THREE.MeshBasicMaterial({ color: col })
        );
        m.position.set(x, y, z);
        this.scene.add(m);
      };
      mk(0.8, 0, 0, 0x2c3a4e); mk(-4, 0, 0, 0x2c3a4e);
      mk(0, 0.8, 0, 0x7d8899); mk(0, -4, 0, 0x7d8899);
      mk(0, 0, 1.6, 0x7d8899); mk(0, 0, -8, 0x7d8899);
    }

    /* -------------------------------------------------------------- 标签 */
    _buildLabels() {
      const add = (text, pos, cls, ox = 0, oy = 0) => {
        const el = document.createElement('div');
        el.className = 'lbl ' + (cls || '');
        el.innerHTML = text;
        this.labelsEl.appendChild(el);
        const item = { el, pos: pos.clone(), ox, oy, cls };
        this._labels.push(item);
        return item;
      };
      const T = (t) => t;
      for (let v = BOX_MIN; v <= BOX_MAX - 1e-9; v += 2) {
        if (Math.abs(v) > 1e-9) add(String(v), new THREE.Vector3(v, 0, 0), '', 0, 15);
      }
      for (let v = BOX_MIN; v <= BOX_MAX - 1e-9; v += 2) {
        if (Math.abs(v) > 1e-9) add(String(v), new THREE.Vector3(0, v, 0), '', -17, 0);
      }
      for (let v = BOX_MIN; v <= BOX_MAX - 1e-9; v += 2) {
        if (Math.abs(v) > 1e-9) add(String(v), new THREE.Vector3(0, 0, v), '', 16, 8);
      }
      add('σ₁ / MPa', new THREE.Vector3(BOX_MAX + 1.9, -0.9, 0), 'axis');
      add('σ₂ / MPa', new THREE.Vector3(0, BOX_MAX + 1.9, 0), 'axis');
      add('σ₃ / MPa', new THREE.Vector3(0, 0, BOX_MAX + 1.9), 'axis');
      add('T', new THREE.Vector3(0.8, 0, 0), 'marker', 0, -16);
      add('C', new THREE.Vector3(-4, 0, 0), 'marker', 0, -16);
      this.sliceLabel = add('σ₃ = 0.00', new THREE.Vector3(BOX_MIN + 0.4, BOX_MAX - 0.3, 0), 'slice', 0, -14);
    }

    /* ------------------------------------------------------------ 交互 */
    _bindPointer() {
      const el = this.renderer.domElement;
      let mode = null, lx = 0, ly = 0;
      const down = (e) => {
        el.setPointerCapture(e.pointerId);
        mode = (e.button === 2 || e.shiftKey) ? 'pan' : 'rotate';
        lx = e.clientX; ly = e.clientY;
        this._dragging = mode;
        el.style.cursor = mode === 'pan' ? 'move' : 'grabbing';
      };
      const move = (e) => {
        if (!this._dragging) return;
        const dx = e.clientX - lx, dy = e.clientY - ly;
        lx = e.clientX; ly = e.clientY;
        if (this._dragging === 'rotate') {
          this.goal.theta -= dx * 0.007;
          this.goal.phi = clamp(this.goal.phi - dy * 0.007, 0.18, Math.PI - 0.18);
        } else {
          const panScale = this.goal.r * 0.0016;
          const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrix, 0);
          const up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrix, 1);
          this.goal.tx += (-right.x * dx + up.x * dy) * panScale;
          this.goal.ty += (-right.y * dx + up.y * dy) * panScale;
          this.goal.tz += (-right.z * dx + up.z * dy) * panScale;
        }
        this.dirty = true;
      };
      const up = (e) => {
        this._dragging = null;
        el.style.cursor = 'grab';
        try { el.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      };
      el.addEventListener('pointerdown', down);
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('contextmenu', (e) => e.preventDefault());
      el.addEventListener('wheel', (e) => {
        e.preventDefault();
        this.goal.r = clamp(this.goal.r * Math.exp(e.deltaY * 0.0011), 14, 110);
        this.dirty = true;
      }, { passive: false });

      // 双指缩放
      let pinch = null;
      el.addEventListener('touchstart', (e) => {
        if (e.touches.length === 2) {
          pinch = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        }
      }, { passive: true });
      el.addEventListener('touchmove', (e) => {
        if (e.touches.length === 2 && pinch) {
          const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
          this.goal.r = clamp(this.goal.r * (pinch / d), 14, 110);
          pinch = d; this.dirty = true;
        }
      }, { passive: true });
      el.addEventListener('touchend', () => { pinch = null; }, { passive: true });
      el.style.cursor = 'grab';
    }

    /* ------------------------------------------------------------ 状态 */
    setState(patch) {
      const s3Changed = patch.s && Math.abs(patch.s[2] - this.state.s[2]) > 1e-4;
      Object.assign(this.state, patch);
      if (s3Changed) {
        this.slicePlane.position.z = patch.s[2];
        this.sliceBorder.position.z = patch.s[2];
        this.sliceLabel.pos.set(BOX_MIN + 0.4, BOX_MAX - 0.3, patch.s[2]);
        this.sliceLabel.el.textContent = `σ₃ = ${patch.s[2].toFixed(2)}`;
        this._rebuildSliceCurves(patch.s[2]);
      }
      if (patch.focus !== undefined || patch.visible) this._applyEmphasis();
      this._updatePoint();
      this.dirty = true;
    }

    _applyEmphasis() {
      const focus = this.state.focus;
      for (const crit of C.CRITERIA) {
        const item = this._surfaces[crit.id];
        if (!item) continue;
        const vis = this.state.visible[crit.id] !== false;
        const show = vis && this.mode === '3d';
        item.back.visible = show;
        item.front.visible = show;
        if (item.lines) item.lines.visible = show && focus === crit.id;
        const isFocus = focus === crit.id;
        const dim = focus && !isFocus;
        const alpha = isFocus ? 0.22 : (dim ? 0.022 : 0.10);
        for (const m of item.mats) {
          m.opacity = alpha;
          m.emissiveIntensity = isFocus ? 0.24 : 0.16;
        }
        if (item.lineMat) item.lineMat.opacity = isFocus ? 0.78 : (dim ? 0.06 : 0.4);
      }
      for (const crit of C.CRITERIA) {
        const m = this._curveMeshes[crit.id];
        if (!m) continue;
        const isFocus = focus === crit.id;
        const dim = focus && !isFocus;
        m.visible = this.state.visible[crit.id] !== false;
        m.material.opacity = dim ? 0.28 : 1;
        m.material.emissiveIntensity = isFocus ? 0.55 : 0.35;
      }
    }

    _updatePoint() {
      const [a, b, c] = this.state.s;
      this.pointMesh.position.set(a, b, c);
      this.pointHalo.position.set(a, b, c);
      const pos = this.vectorLine.geometry.attributes.position;
      pos.setXYZ(0, 0, 0, 0);
      pos.setXYZ(1, a, b, c);
      pos.needsUpdate = true;
      this.vectorLine.geometry.computeBoundingSphere();
      this.vectorLine.computeLineDistances();
      this._pointPos.set(a, b, c);
    }

    setMode(mode) {
      this.mode = mode;
      const is3d = mode === '3d';
      this.slicePlane.visible = true;
      this.sliceBorder.visible = true;
      for (const crit of C.CRITERIA) {
        const item = this._surfaces[crit.id];
        const on = is3d && this.state.visible[crit.id] !== false;
        item.back.visible = on;
        item.front.visible = on;
        if (item.lines) item.lines.visible = on;
      }
      this.curveGroup.visible = true;
      this.pointHalo.visible = is3d;
      this._labels.forEach(l => { l.el.style.display = is3d ? '' : 'none'; });
      this.dirty = true;
    }

    faceOn(animate) {
      this.goal.theta = 0;
      this.goal.phi = Math.PI / 2 - 0.0001;
      this.goal.r = 40;
      this.goal.tx = CENTER.x; this.goal.ty = CENTER.y; this.goal.tz = CENTER.z;
      if (!animate || this.instant) this._snapOrbit();
      this.dirty = true;
    }

    oblique(animate) {
      this.goal.theta = 0.74;
      this.goal.phi = 1.12;
      this.goal.r = 38;
      this.goal.tx = CENTER.x; this.goal.ty = CENTER.y; this.goal.tz = CENTER.z;
      if (!animate || this.instant) this._snapOrbit();
      this.dirty = true;
    }

    _snapOrbit() {
      Object.assign(this.orbit, this.goal);
    }

    resetView() {
      this.oblique(true);
    }

    resize() {
      const box = this.container.getBoundingClientRect();
      const w = Math.max(200, box.width), h = Math.max(200, box.height);
      this.W = w; this.H = h;
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.dirty = true;
    }

    capture() {
      this.renderer.render(this.scene, this.camera);
      return this.renderer.domElement.toDataURL('image/png');
    }

    /* ------------------------------------------------------------ 渲染 */
    _loop() {
      requestAnimationFrame(this._loop);
      const o = this.orbit, g = this.goal;
      const k = 0.16;
      let moving = false;
      for (const key of ['theta', 'phi', 'r', 'tx', 'ty', 'tz']) {
        const d = g[key] - o[key];
        if (Math.abs(d) > 1e-4) { o[key] += d * k; moving = true; }
        else o[key] = g[key];
      }
      if (moving) this.dirty = true;
      if (this.dirty) {
        this.dirty = false;
        this._render();
      }
    }

    _render() {
      const o = this.orbit;
      const sp = Math.sin(o.phi), cp = Math.cos(o.phi);
      this.camera.position.set(
        o.tx + o.r * sp * Math.sin(o.theta),
        o.ty + o.r * cp,
        o.tz + o.r * sp * Math.cos(o.theta)
      );
      this.camera.lookAt(o.tx, o.ty, o.tz);
      this.camera.updateMatrixWorld();
      this.renderer.render(this.scene, this.camera);
      this._placeLabels();
    }

    _placeLabels() {
      if (this.mode !== '3d') return;
      const v = new THREE.Vector3();
      const w = this.W, h = this.H;
      v.set(0, 0, 0).project(this.camera);
      const ox = (v.x * 0.5 + 0.5) * w, oy = (-v.y * 0.5 + 0.5) * h;
      for (const item of this._labels) {
        v.copy(item.pos).project(this.camera);
        const sx = (v.x * 0.5 + 0.5) * w;
        const sy = (-v.y * 0.5 + 0.5) * h;
        let visible = v.z < 1 && sx > -80 && sx < w + 80 && sy > -40 && sy < h + 40;
        // 坐标轴高度透视缩短时，原点附近的刻度会挤成一团，隐藏之
        if (visible && item.cls === '') {
          const dx = sx - ox, dy = sy - oy;
          if (dx * dx + dy * dy < 24 * 24) visible = false;
        }
        item.sx = sx + item.ox; item.sy = sy + item.oy; item.visible = visible;
        if (!visible) { item.el.classList.remove('is-on'); continue; }
        item.el.style.transform = `translate3d(${item.sx.toFixed(1)}px,${item.sy.toFixed(1)}px,0) translate(-50%,-50%)`;
        item.el.classList.add('is-on');
      }
    }

    /** 供截图使用：当前标签的屏幕坐标 */
    getLabelSnapshots() {
      return this._labels.map(it => ({
        text: it.el.textContent, cls: it.cls, x: it.sx, y: it.sy, visible: !!it.visible,
      }));
    }
  }

  /* ---------------------------------------------------------- 工具函数 */
  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

  function planarTube(points, radius, z, radial = 5) {
    const n = points.length;
    const first = points[0], last = points[n - 1];
    const closed = Math.hypot(first[0] - last[0], first[1] - last[1]) < 1e-6;
    const pos = new Float32Array(n * radial * 3);
    for (let i = 0; i < n; i++) {
      const p = points[i];
      const prev = points[closed ? (i - 1 + n) % n : Math.max(0, i - 1)];
      const next = points[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
      let tx = next[0] - prev[0], ty = next[1] - prev[1];
      const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
      const nx = -ty, ny = tx;
      for (let k = 0; k < radial; k++) {
        const ang = k / radial * Math.PI * 2;
        const ca = Math.cos(ang), sa = Math.sin(ang);
        const o = (i * radial + k) * 3;
        pos[o] = p[0] + radius * ca * nx;
        pos[o + 1] = p[1] + radius * ca * ny;
        pos[o + 2] = z + radius * sa;
      }
    }
    const idx = [];
    const segs = closed ? n : n - 1;
    for (let i = 0; i < segs; i++) {
      const i2 = (i + 1) % n;
      for (let k = 0; k < radial; k++) {
        const k2 = (k + 1) % radial;
        const a = i * radial + k, b = i * radial + k2, c = i2 * radial + k, d = i2 * radial + k2;
        idx.push(a, b, c, b, d, c);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  }

  /** 简易几何合并（仅 position / normal / index） */
  function mergeGeometries(geos) {
    let vCount = 0, iCount = 0;
    for (const g of geos) {
      vCount += g.attributes.position.count;
      iCount += g.index.count;
    }
    const pos = new Float32Array(vCount * 3);
    const nrm = new Float32Array(vCount * 3);
    const idx = new Uint32Array(iCount);
    let vo = 0, io = 0;
    for (const g of geos) {
      const p = g.attributes.position.array;
      const n = g.attributes.normal.array;
      pos.set(p, vo * 3); nrm.set(n, vo * 3);
      const ind = g.index.array;
      for (let i = 0; i < ind.length; i++) idx[io + i] = ind[i] + vo;
      vo += g.attributes.position.count;
      io += ind.length;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    out.setIndex(new THREE.BufferAttribute(idx, 1));
    return out;
  }

  window.Scene3D = Scene3D;
})();


/* ==========================================================================
 * criteria.js — 四种海冰失效准则：二维 / 三维形式、等值线与失效面网格
 *
 * 参数（任务书 v5 二维 / v4 三维）：
 *   σt = 0.8 MPa，σc = 4.0 MPa；拉为正、压为负。
 *   Mohr–Coulomb 由两单轴强度点标定：sinφ = 2/3，c = 0.894427 MPa，
 *   归一化后 g = (5σmax − σmin)/4，σmax/min 含 0。
 *   Tsai–Wu：F11 = 1.0, F33 = 0.5；G1111 = 0.3125, G3333 = 0.078125,
 *   G1122 = −0.1875, G1133 = −0.0625（σ3 为柱轴方向，横向各向同性）。
 *   三维形式在 σ3 = 0 时严格退化为任务书 v5 的二维形式。
 * ========================================================================== */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.ICECriteria = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ---------------------------------------------------------------- 材料参数 */
  const TASK = Object.freeze({ st: 0.8, sc: 4.0, S: 1.0 });   // 任务书给定值

  const MAT = {
    st: TASK.st, sc: TASK.sc, S: TASK.S, sMin: 0,
    sinPhi: 0, phiDeg: 0, c: 0,
    F11: 0, F33: 0, G1111: 0, G3333: 0, G1122: 0, G1133: 0,
    twApex: 0, version: 0,
  };

  /* 三维 Tsai–Wu 的柱轴方向系数保持任务书 v4 的比例：
     F33/F11 = 0.5，G3333/G1111 = 0.25，G1133/G1111 = −0.2
     （即沿柱轴强度为水平方向的 2 倍）。
     面内交叉项 G1122 不再按固定比例取，而由剪切强度 S 标定。 */
  const TW_RATIO = Object.freeze({ F33: 0.5, G3333: 0.25, G1133: -0.2 });

  /**
   * 由单轴拉伸 σt、单轴压缩 σc 与剪切强度 S 重新标定全部准则参数。
   * 默认值 (0.8, 4.0, 1.0) 时与任务书 v4/v5 的系数逐位一致。
   */
  function setStrengths(st, sc, S) {
    st = Math.min(2.0, Math.max(0.2, Number(st) || TASK.st));
    sc = Math.min(10.0, Math.max(0.4, Number(sc) || TASK.sc));
    if (sc - st < 0.1) sc = st + 0.1;                 // 保持 σc > σt
    if (sc > 10) { sc = 10; st = Math.min(st, 9.9); }

    // 剪切强度下限：S ≤ √(σtσc)/2 时 G1111 + G1122 ≤ 0，判据退化为双曲线
    const sMin = 0.5 * Math.sqrt(st * sc) * 1.02;
    S = Number(S);
    if (!Number.isFinite(S)) S = TASK.S;
    S = Math.min(6.0, Math.max(sMin, S));

    MAT.st = st; MAT.sc = sc; MAT.S = S; MAT.sMin = sMin;
    MAT.sinPhi = (sc - st) / (sc + st);
    MAT.phiDeg = Math.asin(MAT.sinPhi) * 180 / Math.PI;
    MAT.c = st * (1 + MAT.sinPhi) / (2 * Math.cos(Math.asin(MAT.sinPhi)));

    MAT.F11 = 1 / st - 1 / sc;                        // 线性项
    MAT.G1111 = 1 / (st * sc);                        // 面内二次项
    MAT.G1122 = MAT.G1111 - 1 / (2 * S * S);          // 交叉项：纯剪切 (S, −S) 时 g = 1
    MAT.F33 = TW_RATIO.F33 * MAT.F11;
    MAT.G3333 = TW_RATIO.G3333 * MAT.G1111;
    MAT.G1133 = TW_RATIO.G1133 * MAT.G1111;

    // 静水轴上的拉伸闭合点：a s² + b s − 1 = 0
    const a = 2 * MAT.G1111 + MAT.G3333 + 2 * MAT.G1122 + 4 * MAT.G1133;
    const b = 2 * MAT.F11 + MAT.F33;
    MAT.twApex = (-b + Math.sqrt(b * b + 4 * a)) / (2 * a);

    // 各失效面的静水应力区间
    BY_ID.rank.sMax = MAT.st;
    BY_ID.mc.sMax = MAT.st;
    BY_ID.mc.sMin = -MAT.sc;
    BY_ID.tw.sMax = MAT.twApex;
    BY_ID.tw.sMin = -14;

    MAT.version++;
    return MAT;
  }

  /* ------------------------------------------------------------- 准则函数 */
  function gRank(s1, s2, s3) {
    return Math.max(s1, s2, s3, 0) / MAT.st;
  }
  function gMises(s1, s2, s3) {
    const a = s1 - s2, b = s2 - s3, c = s3 - s1;
    return Math.sqrt((a * a + b * b + c * c) / 2) / MAT.sc;
  }
  function gMC(s1, s2, s3) {
    const hi = Math.max(s1, s2, s3, 0);
    const lo = Math.min(s1, s2, s3, 0);
    return hi / MAT.st - lo / MAT.sc;
  }
  function gTW(s1, s2, s3) {
    return MAT.F11 * (s1 + s2) + MAT.F33 * s3
      + MAT.G1111 * (s1 * s1 + s2 * s2) + MAT.G3333 * s3 * s3
      + 2 * MAT.G1122 * s1 * s2 + 2 * MAT.G1133 * (s1 + s2) * s3;
  }

  /* --------------------------------------------------------------- 梯度 */
  function gradRank(s1, s2, s3) {
    if (Math.max(s1, s2, s3, 0) <= 0) return [0, 0, 0];
    const g = [0, 0, 0];
    const i = (s1 >= s2 && s1 >= s3) ? 0 : (s2 >= s3 ? 1 : 2);
    g[i] = 1 / MAT.st;
    return g;
  }
  function gradMises(s1, s2, s3) {
    const a = s1 - s2, b = s2 - s3, c = s3 - s1;
    const se = Math.sqrt((a * a + b * b + c * c) / 2);
    if (se < 1e-12) return [0, 0, 0];
    const k = 1 / (2 * MAT.sc * se);
    return [k * (2 * s1 - s2 - s3), k * (2 * s2 - s3 - s1), k * (2 * s3 - s1 - s2)];
  }
  function gradMC(s1, s2, s3) {
    const g = [0, 0, 0];
    if (Math.max(s1, s2, s3) > 0) {
      const i = (s1 >= s2 && s1 >= s3) ? 0 : (s2 >= s3 ? 1 : 2);
      g[i] += 1 / MAT.st;
    }
    if (Math.min(s1, s2, s3) < 0) {
      const j = (s1 <= s2 && s1 <= s3) ? 0 : (s2 <= s3 ? 1 : 2);
      g[j] -= 1 / MAT.sc;
    }
    return g;
  }
  function gradTW(s1, s2, s3) {
    return [
      MAT.F11 + 2 * MAT.G1111 * s1 + 2 * MAT.G1122 * s2 + 2 * MAT.G1133 * s3,
      MAT.F11 + 2 * MAT.G1111 * s2 + 2 * MAT.G1122 * s1 + 2 * MAT.G1133 * s3,
      MAT.F33 + 2 * MAT.G3333 * s3 + 2 * MAT.G1133 * (s1 + s2),
    ];
  }

  /* --------------------------------------------------------------- 准则表 */
  const CRITERIA = [
    {
      id: 'rank', name: '第一强度理论', short: '最大拉应力', color: '#0072B2',
      g: gRank, grad: gradRank, flat: true,
      sMin: -14, sMax: MAT.st, ns: 96,
      tag: 'max(σ,0)/σt',
      note: '只限制最大拉应力。全部受压时 max(·,0)=0，g 恒为 0，不能给出压缩破坏界限。',
    },
    {
      id: 'mises', name: 'Mises', short: '畸变能', color: '#D55E00',
      g: gMises, grad: gradMises, flat: false,
      sMin: -14, sMax: 6, ns: 96,
      tag: 'σe/σc',
      note: '按压缩强度 σ<sub>c</sub> 标定，拉伸侧边界被放大到 σ<sub>c</sub>；只与偏应力有关，静水压力不改变 g。',
    },
    {
      id: 'mc', name: 'Mohr–Coulomb', short: '拉压异性', color: '#009E73',
      g: gMC, grad: gradMC, flat: true,
      sMin: -MAT.sc, sMax: MAT.st, ns: 84,
      tag: 'σmax/σt − σmin/σc',
      note: '由单轴拉伸与压缩两点标定：sinφ = (σ<sub>c</sub>−σ<sub>t</sub>)/(σ<sub>c</sub>+σ<sub>t</sub>)，c = σ<sub>t</sub>(1+sinφ)/(2cosφ)。拉压组合时 σ<sub>max</sub> 与 σ<sub>min</sub> 同时起作用。',
    },
    {
      id: 'tw', name: 'Tsai–Wu', short: '二次型判据', color: '#AA3377',
      g: gTW, grad: gradTW, flat: false,
      sMin: -14, sMax: 0.4, ns: 120,
      tag: 'F·σ + G:σσ',
      note: '线性项使 g 可以为负，不能直接当作强度利用率。交叉项 G₁₁₂₂ 由剪切强度 S 标定；沿柱轴（σ₃）的单轴强度取水平方向的 2 倍。',
    },
  ];

  const BY_ID = Object.fromEntries(CRITERIA.map(c => [c.id, c]));

  // 按任务书取值完成首次标定
  setStrengths(TASK.st, TASK.sc, TASK.S);

  /* --------------------------------------------------------------- 工具 */
  function gAt(id, s) { return BY_ID[id].g(s[0], s[1], s[2]); }
  function verdict(g) { return g >= 1; }

  function derived(s) {
    const [a, b, c] = s;
    const sorted = [a, b, c].sort((x, y) => y - x);
    return {
      mean: (a + b + c) / 3,
      mises: Math.sqrt(((a - b) ** 2 + (b - c) ** 2 + (c - a) ** 2) / 2),
      max: sorted[0],
      min: sorted[2],
      mid: sorted[1],
    };
  }

  /* --------------------------------------------------------- 二维等值线 */
  /**
   * 在 (x0..x1) × (y0..y1) 上求 g = level 的等值线（Marching Squares）。
   * @returns {Array<Array<[number,number]>>} 首尾相接的折线集合
   */
  function contour(gfun, level, x0, x1, y0, y1, n) {
    return chain(contourSegments(gfun, level, x0, x1, y0, y1, n)).filter(l => l.length >= 3);
  }

  /** 只产生无序线段（便于自检） */
  function contourSegments(gfun, level, x0, x1, y0, y1, n) {
    const nx = n, ny = n;
    const dx = (x1 - x0) / nx, dy = (y1 - y0) / ny;
    const W = nx + 1, H = ny + 1;
    const vals = new Float64Array(W * H);
    for (let j = 0; j < H; j++) {
      const y = y0 + j * dy;
      for (let i = 0; i < W; i++) vals[j * W + i] = gfun(x0 + i * dx, y);
    }

    // 网格边上的交点（相邻单元共享，保证折线可首尾相接）
    const eh = new Float64Array(nx * H * 2).fill(NaN);   // 水平边 (i,j)-(i+1,j)
    const ev = new Float64Array(W * ny * 2).fill(NaN);   // 竖直边 (i,j)-(i,j+1)
    for (let j = 0; j < H; j++) {
      for (let i = 0; i < nx; i++) {
        const a = vals[j * W + i], b = vals[j * W + i + 1];
        if ((a < level) !== (b < level)) {
          const t = (level - a) / (b - a);
          const k = (j * nx + i) * 2;
          eh[k] = x0 + (i + t) * dx; eh[k + 1] = y0 + j * dy;
        }
      }
    }
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < W; i++) {
        const a = vals[j * W + i], b = vals[(j + 1) * W + i];
        if ((a < level) !== (b < level)) {
          const t = (level - a) / (b - a);
          const k = (j * W + i) * 2;
          ev[k] = x0 + i * dx; ev[k + 1] = y0 + (j + t) * dy;
        }
      }
    }

    const segs = [];
    const push = (i1, a1, i2, a2) => {       // i1 / i2 为已乘 2 的数组下标
      const p = a1[i1], q = a1[i1 + 1];
      const r = a2[i2], s = a2[i2 + 1];
      if (Number.isNaN(p) || Number.isNaN(r)) return;
      segs.push([[p, q], [r, s]]);
    };
    const EDGE_H = (i, j) => ((j * nx + i) * 2);
    const EDGE_V = (i, j) => ((j * W + i) * 2);

    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const a = vals[j * W + i] >= level;
        const b = vals[j * W + i + 1] >= level;
        const c = vals[(j + 1) * W + i + 1] >= level;
        const d = vals[(j + 1) * W + i] >= level;
        const idx = (a ? 1 : 0) | (b ? 2 : 0) | (c ? 4 : 0) | (d ? 8 : 0);
        if (idx === 0 || idx === 15) continue;

        const e0 = [eh, EDGE_H(i, j)];          // 下边
        const e1 = [ev, EDGE_V(i + 1, j)];      // 右边
        const e2 = [eh, EDGE_H(i, j + 1)];      // 上边
        const e3 = [ev, EDGE_V(i, j)];          // 左边
        const E = [e0, e1, e2, e3];

        const add = (u, v) => push(E[u][1], E[u][0], E[v][1], E[v][0]);
        switch (idx) {
          case 1: add(3, 0); break;
          case 2: add(0, 1); break;
          case 3: add(3, 1); break;
          case 4: add(1, 2); break;
          case 6: add(0, 2); break;
          case 7: add(3, 2); break;
          case 8: add(2, 3); break;
          case 9: add(2, 0); break;
          case 11: add(2, 1); break;
          case 12: add(1, 3); break;
          case 13: add(1, 0); break;
          case 14: add(0, 3); break;
          case 5: {
            const center = (vals[j * W + i] + vals[j * W + i + 1] + vals[(j + 1) * W + i + 1] + vals[(j + 1) * W + i]) / 4;
            if (center >= level) { add(0, 1); add(2, 3); }
            else { add(3, 0); add(1, 2); }
            break;
          }
          case 10: {
            const center = (vals[j * W + i] + vals[j * W + i + 1] + vals[(j + 1) * W + i + 1] + vals[(j + 1) * W + i]) / 4;
            if (center >= level) { add(3, 0); add(1, 2); }
            else { add(0, 1); add(2, 3); }
            break;
          }
        }
      }
    }
    return segs;
  }

  /** 把无序线段接成折线（首尾相接，闭合线首尾点相同） */
  function chain(segs, tol = 1e-5) {
    const key = p => Math.round(p[0] / tol) + ',' + Math.round(p[1] / tol);
    const map = new Map();
    for (let i = 0; i < segs.length; i++) {
      for (const p of segs[i]) {
        const k = key(p);
        let arr = map.get(k);
        if (!arr) map.set(k, arr = []);
        arr.push(i);
      }
    }
    const used = new Uint8Array(segs.length);
    const out = [];
    for (let i = 0; i < segs.length; i++) {
      if (used[i]) continue;
      used[i] = 1;
      const line = [segs[i][0], segs[i][1]];
      let guard = 0;
      while (guard++ < segs.length) {
        const end = line[line.length - 1];
        const cand = (map.get(key(end)) || []).find(k => !used[k]);
        if (cand === undefined) break;
        used[cand] = 1;
        const s = segs[cand];
        const nxt = key(s[0]) === key(end) ? s[1] : s[0];
        line.push(nxt);
        if (key(nxt) === key(line[0])) break;
      }
      guard = 0;
      while (guard++ < segs.length) {
        const start = line[0];
        const cand = (map.get(key(start)) || []).find(k => !used[k]);
        if (cand === undefined) break;
        used[cand] = 1;
        const s = segs[cand];
        const nxt = key(s[1]) === key(start) ? s[0] : s[1];
        line.unshift(nxt);
        if (key(nxt) === key(line[line.length - 1])) break;
      }
      out.push(line);
    }
    return out;
  }

  /** σ₃ = 常数 截面上的四条包络线 */
  function contourAtS3(s3, x0, x1, y0, y1, n) {
    const res = {};
    for (const c of CRITERIA) {
      res[c.id] = contour((x, y) => c.g(x, y, s3), 1, x0, x1, y0, y1, n);
    }
    return res;
  }

  /* --------------------------------------------------------- 三维失效面 */
  const E1 = [Math.SQRT1_2, -Math.SQRT1_2, 0];                       // 偏平面基矢
  const E2 = [1 / Math.sqrt(6), 1 / Math.sqrt(6), -2 / Math.sqrt(6)];

  /**
   * 以静水轴为极轴做径向剖分，得到 g = 1 曲面网格。
   * 对四种准则，各静水应力截面均为包含轴点的凸区域，径向单值。
   */
  function surfaceMesh(crit, opts = {}) {
    const nt = opts.nt || 120;
    const ns = opts.ns || crit.ns || 96;
    const rmax = opts.rmax || 80;
    const { g, grad } = crit;
    const sMin = crit.sMin, sMax = crit.sMax;
    const count = (ns + 1) * nt;
    const pos = new Float32Array(count * 3);
    const nrm = new Float32Array(count * 3);
    const ok = new Uint8Array(count);
    let valid = 0;

    for (let i = 0; i <= ns; i++) {
      const s = sMin + (sMax - sMin) * (i / ns);
      const base = [s, s, s];
      const onAxis = g(s, s, s) >= 1;
      for (let j = 0; j < nt; j++) {
        const th = Math.PI / 6 + j * 2 * Math.PI / nt;   // 从 30° 起，对齐六边形/三角形棱线
        const ct = Math.cos(th), st = Math.sin(th);
        const d = [ct * E1[0] + st * E2[0], ct * E1[1] + st * E2[1], ct * E1[2] + st * E2[2]];
        const idx = i * nt + j;

        let r = 0;
        if (!onAxis) {
          const f = rr => g(base[0] + rr * d[0], base[1] + rr * d[1], base[2] + rr * d[2]);
          if (f(rmax) >= 1) {
            let lo = 0, hi = rmax;
            for (let k = 0; k < 56; k++) {
              const mid = (lo + hi) * 0.5;
              if (f(mid) >= 1) hi = mid; else lo = mid;
            }
            r = hi;
          } else {
            continue;   // 该方向无交点（理论上不出现）
          }
        }
        const x = base[0] + r * d[0], y = base[1] + r * d[1], z = base[2] + r * d[2];
        pos[idx * 3] = x; pos[idx * 3 + 1] = y; pos[idx * 3 + 2] = z;
        const gr = grad(x, y, z);
        const len = Math.hypot(gr[0], gr[1], gr[2]);
        if (len > 1e-9) {
          nrm[idx * 3] = gr[0] / len; nrm[idx * 3 + 1] = gr[1] / len; nrm[idx * 3 + 2] = gr[2] / len;
        } else {
          nrm[idx * 3] = d[0]; nrm[idx * 3 + 1] = d[1]; nrm[idx * 3 + 2] = d[2];
        }
        ok[idx] = 1; valid++;
      }
    }

    const indices = [];
    for (let i = 0; i < ns; i++) {
      for (let j = 0; j < nt; j++) {
        const j2 = (j + 1) % nt;
        const a = i * nt + j, b = i * nt + j2, c = (i + 1) * nt + j, d = (i + 1) * nt + j2;
        if (ok[a] && ok[b] && ok[c]) indices.push(a, b, c);
        if (ok[b] && ok[d] && ok[c]) indices.push(b, d, c);
      }
    }
    return {
      positions: pos, normals: nrm, indices: new Uint32Array(indices),
      vertexCount: count, valid, triangleCount: indices.length / 3,
      ns, nt, ok,
    };
  }

  /* --------------------------------------------------------------- 自检 */
  const CASES = [
    { n: 1, s: [1.0, 0, 0] },
    { n: 2, s: [0.7, 0.7, 0] },
    { n: 3, s: [0.5, -2.0, 0] },
    { n: 4, s: [0, -3.0, 0] },
    { n: 5, s: [0, -4.5, 0] },
    { n: 6, s: [-5.0, -5.0, 0] },
    { n: 7, s: [2.0, -2.0, 0] },
  ];
  const EXPECTED = [
    [1.25, 0.25, 1.25, 1.3125],
    [0.875, 0.175, 0.875, 1.5225],
    [0.625, 0.57282196186948, 1.125, 0.203125],
    [0, 0.75, 0.75, -0.1875],
    [0, 1.125, 1.125, 1.828125],
    [0, 1.25, 1.25, -3.75],
    [2.5, 0.86602540378444, 3.0, 4.0],
  ];

  function selfTest() {
    // 固定用任务书取值自检，不受界面上可调参数影响
    const saved = { st: MAT.st, sc: MAT.sc, S: MAT.S };
    setStrengths(TASK.st, TASK.sc, TASK.S);
    const rows = [];
    let pass = true;
    CASES.forEach((c, i) => {
      CRITERIA.forEach((cr, k) => {
        const v = cr.g(c.s[0], c.s[1], c.s[2]);
        const e = EXPECTED[i][k];
        if (Math.abs(v - e) > 1e-9) {
          pass = false;
          rows.push({ ok: false, msg: `工况${c.n} ${cr.name}: g=${v.toFixed(9)} 期望 ${e}` });
        }
      });
    });
    // σ3 = 0 时三维式与二维式一致性
    const s3test = [[0.5, -2, 0], [-5, -5, 0], [1.0, 0, 0]];
    for (const s of s3test) {
      const a = gMC(s[0], s[1], 0), b = (5 * Math.max(s[0], s[1], 0) - Math.min(s[0], s[1], 0)) / 4;
      if (Math.abs(a - b) > 1e-12) { pass = false; rows.push({ ok: false, msg: 'MC 二维退化不一致' }); }
    }
    // 曲面网格
    for (const c of CRITERIA) {
      const m = surfaceMesh(c, { ns: 40, nt: 60 });
      if (!(m.valid > 100 && m.triangleCount > 100)) {
        pass = false; rows.push({ ok: false, msg: `${c.name} 曲面网格为空` });
      }
    }
    // 包络线闭合性（σ3 = 0）
    for (const c of CRITERIA) {
      const lines = contour((x, y) => c.g(x, y, 0), 1, -10, 5, -10, 5, 120);
      if (!lines.length) { pass = false; rows.push({ ok: false, msg: `${c.name} 包络线为空` }); }
    }
    if (pass) rows.unshift({ ok: true, msg: '7 组工况 × 4 准则的 g 值、三维退化、曲面网格与包络线：全部通过' });
    setStrengths(saved.st, saved.sc, saved.S);
    return { pass, rows };
  }

  return {
    MAT, TASK, TW_RATIO, CRITERIA, BY_ID, setStrengths,
    gAt, verdict, derived, contour, contourSegments, contourAtS3, surfaceMesh, selfTest, CASES, EXPECTED,
  };
});

/* ==========================================================================
 * app.js — 状态管理、界面联动、预设工况、判定与公式代入
 * ========================================================================== */
(function () {
  'use strict';
  const C = window.ICECriteria;
  const MAT = C.MAT;

  const $ = (sel) => document.querySelector(sel);
  const INSTANT = /[?&]noanim/.test(location.search)
    || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const fmt2 = (v) => (Math.abs(v) < 0.0005 ? 0 : v).toFixed(2);
  const fmt3 = (v) => v.toFixed(3);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  /* ------------------------------------------------------------- 预设工况 */
  const PRESETS_2D = [
    {
      id: 'p1', n: 1, s: [1.0, 0, 0], focus: 'mises',
      label: '1', coords: '(1.0, 0)',
      why: '<b>工况 1</b>　σ₁ = 1.0 MPa 已超过 σt = 0.8 MPa：第一强度、Mohr–Coulomb、Tsai–Wu 均判破坏。Mises 以 σc = 4.0 MPa 标定，拉伸侧边界被放大到 4.0 MPa，因此仍判未破坏。',
    },
    {
      id: 'p2', n: 2, s: [0.7, 0.7, 0], focus: 'tw',
      label: '2', coords: '(0.7, 0.7)',
      why: '<b>工况 2</b>　等双轴拉伸 0.7 MPa 低于 0.8 MPa，第一强度与 Mohr–Coulomb 未达边界；但 Tsai–Wu 的等双轴拉伸极限只有 0.472 MPa，所以只有它判破坏。',
    },
    {
      id: 'p3', n: 3, s: [0.5, -2.0, 0], focus: 'mc',
      label: '3', coords: '(0.5, −2.0)',
      why: '<b>工况 3</b>　一拉一压使 Mohr–Coulomb 的 5σmax − σmin = 5×0.5 + 2.0 = 4.5 MPa，超过 4 MPa 界限；最大拉应力仅 0.5 MPa，未到 0.8 MPa，其余三种准则判未破坏。',
    },
    {
      id: 'p4', n: 4, s: [0, -3.0, 0], focus: null,
      label: '4', coords: '(0, −3.0)',
      why: '<b>工况 4</b>　单轴压缩 3.0 MPa 低于 4.0 MPa 的压缩界限，四种准则均判未破坏。',
    },
    {
      id: 'p5', n: 5, s: [0, -4.5, 0], focus: 'rank',
      label: '5', coords: '(0, −4.5)',
      why: '<b>工况 5</b>　压缩 4.5 MPa 超过 4.0 MPa：Mises、Mohr–Coulomb、Tsai–Wu 判破坏；第一强度理论只看最大拉应力（此处为 0），不能给出压缩界限，g 恒为 0。',
    },
    {
      id: 'p6', n: 6, s: [-5.0, -5.0, 0], focus: 'tw',
      label: '6', coords: '(−5, −5)',
      why: '<b>工况 6</b>　双轴压缩 −5 MPa：Mises 与 Mohr–Coulomb 已越界；Tsai–Wu 的等双轴压缩极限为 −8.472 MPa，仍在椭球内，且 g = −3.75 为负值——线性项使 g 不能直接当作强度利用率。',
    },
    {
      id: 'p7', n: 7, s: [2.0, -2.0, 0], focus: 'mises',
      label: '7', coords: '(2.0, −2.0)',
      why: '<b>工况 7</b>　纯剪切型拉压组合：Mohr–Coulomb 与 Tsai–Wu 的 g 分别达到 3.0 和 4.0，第一强度理论因拉应力 2.0 MPa 也判破坏；只有 Mises 的等效应力 3.46 MPa 仍低于 4.0 MPa。',
    },
  ];

  const PRESETS_3D = [
    {
      id: 't1', tri: true, s: [-2, -2, -6], focus: 'mises',
      label: '围压 2 · 轴压 6', coords: '(−2, −2, −6)',
      why: '<b>三轴压缩</b>　围压 2 MPa、轴压 6 MPa：Mises 等效应力恰为 4.0 MPa（g = 1.000，临界判破坏）；Mohr–Coulomb 因 σmin = −6 判破坏；Tsai–Wu 沿柱轴的压缩强度为 8 MPa，仍判未破坏。',
    },
    {
      id: 't2', tri: true, s: [-5, -5, -5], focus: 'mc',
      label: '静水压缩 5', coords: '(−5, −5, −5)',
      why: '<b>静水压缩</b>　偏应力为零，Mises 的 g = 0；Mohr–Coulomb 因 σmax 取 max(·,0)、σmin = −5，得 g = 1.25 判破坏。这是含 0 的 max/min 定义带来的结果，说明简化判据在纯静水压力下的局限。',
    },
    {
      id: 't3', tri: true, s: [0, 0, -4], focus: 'tw',
      label: '柱轴单压 4', coords: '(0, 0, −4)',
      why: '<b>柱轴单压</b>　沿 σ₃ 压缩 4 MPa：Mises 与 Mohr–Coulomb 恰在 g = 1 的边界上；Tsai–Wu 的柱轴压缩强度为 8 MPa，g = −0.75 判未破坏。同一 4 MPa 压缩，沿 σ₁ 与沿 σ₃ 的结论不同，这是 Tsai–Wu 各向异性的体现。',
    },
    {
      id: 't4', tri: true, s: [0.5, 0.5, -3], focus: 'mc',
      label: '双拉 0.5 + σ₃ −3', coords: '(0.5, 0.5, −3)',
      why: '<b>第三维改变判定</b>　在等双轴拉伸 0.5 MPa 上叠加 σ₃ = −3 MPa：Mohr–Coulomb 的 σmin 由 0 变为 −3，g 从 0.625 升到 1.375 判破坏；第一强度、Mises、Tsai–Wu 仍判未破坏。',
    },
  ];
  const ALL_PRESETS = [...PRESETS_2D, ...PRESETS_3D];

  /* ---------------------------------------------------------------- 状态 */
  const state = {
    mode: '2d',
    s: [0, 0, 0],
    focus: null,
    visible: { rank: true, mises: true, mc: true, tw: true },
    preset: null,
    showSlice: true,
  };

  let chart, scene;
  let els = {};
  let tween = null;
  let lastWhy = null;

  /** WebGL 不可用时的空实现，保证二维演示与面板功能不受影响 */
  function nullScene() {
    const noop = () => {};
    return {
      available: false, dirty: false,
      setState: noop, setMode: noop, faceOn: noop, oblique: noop,
      resetView: noop, resize: noop, capture: () => '',
      getLabelSnapshots: () => [],
    };
  }

  /* ---------------------------------------------------------------- 启动 */
  function init() {
    els = {
      stage: $('#stage'), panel: $('#panel'),
      chart: $('#chart2d'), scene3d: $('#scene3d'), labels: $('#labels'),
      modeSwitch: $('#modeSwitch'), modeThumb: $('#modeThumb'),
      modeChip: $('#modeChip'), modeChipText: $('#modeChipText'), viewChip: $('#viewChip'),
      stageScale: $('#stageScale'),
      paramRows: $('#paramRows'), paramDerived: $('#paramDerived'), coefBlock: $('#coefBlock'),
      hdrSt: $('#hdrSt'), hdrSc: $('#hdrSc'), btnResetParams: $('#btnResetParams'),
      legend: $('#legend'), stressRows: $('#stressRows'), derived: $('#derived'),
      stateTag: $('#stateTag'), presets2d: $('#presets2d'), presets3d: $('#presets3d'),
      verdicts: $('#verdicts'), explain: $('#explain'), detailBody: $('#detailBody'),
      detailName: $('#detailName'), detailCard: $('#detailCard'), helpModal: $('#helpModal'), selftest: $('#selftest'),
      toast: $('#toast'),
    };

    chart = new Chart2D(els.chart, {
      onPick: ({ s1, s2 }) => setStress([s1, s2, state.s[2]]),
    });
    try {
      scene = new Scene3D(els.scene3d, els.labels);
      scene.setMode('2d');
    } catch (err) {
      // 浏览器未启用 WebGL 时降级：保留二维演示，禁用三维开关
      scene = nullScene();
      const btn3d = els.modeSwitch.querySelector('[data-mode="3d"]');
      if (btn3d) {
        btn3d.disabled = true;
        btn3d.style.opacity = '.45';
        btn3d.style.cursor = 'not-allowed';
        btn3d.title = '当前浏览器未启用 WebGL，三维视图不可用';
      }
      setTimeout(() => toast('三维视图不可用：浏览器未启用 WebGL'), 600);
    }
    if (/[?&]noanim/.test(location.search)) els.stage.classList.add('no-anim');

    buildLegend();
    buildParamRows();
    buildStressRows();
    buildPresets();
    buildVerdicts();

    bindUI();

    // 自检固定在任务书取值下运行（不受地址栏参数影响）
    const st = C.selfTest();
    els.selftest.innerHTML = st.rows.map(r =>
      `<div class="${r.ok ? 'ok' : 'fail'}">${r.ok ? '✓' : '✗'} ${r.msg}</div>`
    ).join('');

    applyHash();
    renderAll();
    moveThumb();
    setTimeout(moveThumb, 60);
    setTimeout(moveThumb, 400);

    new ResizeObserver(() => { chart.resize(); scene.resize(); }).observe(els.stage);

    if (/[?&]selftest/.test(location.search)) {
      document.title = (st.pass ? 'SELFTEST-PASS ' : 'SELFTEST-FAIL ') + document.title;
      els.helpModal.classList.add('is-open');
    }
  }

  /* ------------------------------------------------------------ 输入条件 */
  const PARAMS = [
    { key: 'st', sym: 'σ<sub>t</sub>', note: '单轴拉伸强度', min: 0.2, max: 2.0, step: 0.05 },
    { key: 'sc', sym: 'σ<sub>c</sub>', note: '单轴压缩强度', min: 0.4, max: 10.0, step: 0.1 },
    { key: 'S', sym: 'S', note: '剪切强度', min: 0.2, max: 6.0, step: 0.05 },
  ];

  function buildParamRows() {
    els.paramRows.innerHTML = '';
    for (const p of PARAMS) {
      const row = document.createElement('div');
      row.className = 'srow prow';
      row.dataset.key = p.key;
      row.innerHTML = `
        <div class="srow-top">
          <span class="sname">${p.sym}</span>
          <span class="snote">${p.note}</span>
          <input class="snum" type="number" min="${p.min}" max="${p.max}" step="${p.step}" value="${C.MAT[p.key].toFixed(2)}" aria-label="${p.note}">
          <span class="sunit">MPa</span>
        </div>
        <div class="slider-wrap">
          <input class="srange" type="range" min="${p.min}" max="${p.max}" step="${p.step}" value="${C.MAT[p.key]}" aria-label="${p.note} 滑块">
        </div>`;
      const num = row.querySelector('.snum');
      const range = row.querySelector('.srange');
      const apply = (v, fromNum) => {
        const cur = { st: C.MAT.st, sc: C.MAT.sc, S: C.MAT.S };
        cur[p.key] = v;
        setParams(cur.st, cur.sc, cur.S, fromNum ? p.key : null);
      };
      num.addEventListener('input', () => {
        if (num.value === '') return;
        const v = parseFloat(num.value);
        if (Number.isFinite(v)) apply(v, true);
      });
      num.addEventListener('blur', () => { num.value = C.MAT[p.key].toFixed(2); });
      range.addEventListener('input', () => apply(parseFloat(range.value), false));
      els.paramRows.appendChild(row);
    }
    renderParams();
  }

  /** 修改材料强度并联动二维包络线、三维失效面与判定 */
  let geomTimer = null;
  function setParams(st, sc, S, skipKey) {
    const pst = C.MAT.st, psc = C.MAT.sc, pS = C.MAT.S;
    C.setStrengths(st, sc, S);
    if (Math.abs(C.MAT.st - pst) < 1e-9 && Math.abs(C.MAT.sc - psc) < 1e-9 && Math.abs(C.MAT.S - pS) < 1e-9) {
      renderParams(skipKey);
      return;
    }
    // 预设工况的解释文字基于任务书取值，改参数后改用通用说明
    state.preset = null;
    lastWhy = null;
    markPreset();
    renderParams(skipKey);
    chart.invalidate();
    renderAll();
    clearTimeout(geomTimer);
    geomTimer = setTimeout(() => scene.rebuildSurfaces(), 150);
  }

  const fmtNum = (v, d) => v.toFixed(d).replace('-', '−');

  function renderParams(skipKey) {
    const m = C.MAT;
    els.paramRows.querySelectorAll('.prow').forEach(row => {
      const k = row.dataset.key;
      const range = row.querySelector('.srange');
      const num = row.querySelector('.snum');
      if (k === 'S') {                      // 剪切强度下限随 σt、σc 变化
        range.min = m.sMin.toFixed(2);
        num.min = m.sMin.toFixed(2);
      }
      if (k === skipKey) return;
      num.value = m[k].toFixed(2);
      range.value = m[k];
    });
    els.paramDerived.innerHTML =
      `<span>sinφ <b>${m.sinPhi.toFixed(3)}</b></span>` +
      `<span>φ <b>${m.phiDeg.toFixed(2)}°</b></span>` +
      `<span>c <b>${m.c.toFixed(3)}</b></span>` +
      `<span>柱轴 <b>${(2 * m.st).toFixed(2)} / −${(2 * m.sc).toFixed(2)}</b></span>`;
    renderCoef();
    els.hdrSt.textContent = m.st.toFixed(2);
    els.hdrSc.textContent = m.sc.toFixed(2);
  }

  /** Tsai–Wu 系数：二维三个，三维另加三个柱轴方向系数 */
  function renderCoef() {
    const m = C.MAT, three = state.mode === '3d';
    let html =
      `<div class="coef-head">Tsai–Wu 系数</div>` +
      `<div class="coef-line"><span>F₁₁ = 1/σ<sub>t</sub> − 1/σ<sub>c</sub> = 1/${m.st.toFixed(2)} − 1/${m.sc.toFixed(2)}</span><b>${fmtNum(m.F11, 3)}</b></div>` +
      `<div class="coef-line"><span>G₁₁₁₁ = 1/(σ<sub>t</sub>σ<sub>c</sub>) = 1/(${m.st.toFixed(2)}×${m.sc.toFixed(2)})</span><b>${fmtNum(m.G1111, 4)}</b></div>` +
      `<div class="coef-line"><span>G₁₁₂₂ = G₁₁₁₁ − 1/(2S²) = ${m.G1111.toFixed(4)} − 1/(2×${m.S.toFixed(2)}²)</span><b>${fmtNum(m.G1122, 4)}</b></div>`;
    if (three) {
      html +=
        `<div class="coef-sub">三维（柱轴强度取水平方向的 2 倍）</div>` +
        `<div class="coef-line"><span>F₃₃ = 0.5F₁₁ = 1/(2σ<sub>t</sub>) − 1/(2σ<sub>c</sub>)</span><b>${fmtNum(m.F33, 3)}</b></div>` +
        `<div class="coef-line"><span>G₃₃₃₃ = 0.25G₁₁₁₁</span><b>${fmtNum(m.G3333, 4)}</b></div>` +
        `<div class="coef-line"><span>G₁₁₃₃ = −0.2G₁₁₁₁</span><b>${fmtNum(m.G1133, 4)}</b></div>`;
    }
    els.coefBlock.innerHTML = html;
    state._coefKey = state.mode + '|' + C.MAT.version;
  }

  /* ------------------------------------------------------------ 图例 */
  function buildLegend() {
    els.legend.innerHTML = '';
    for (const c of C.CRITERIA) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'lg';
      b.dataset.id = c.id;
      b.style.setProperty('--c', c.color);
      b.title = `${c.name}（点击聚焦；隐藏时点击恢复显示）`;
      b.innerHTML = `<span class="sw"></span>${c.name}`;
      b.addEventListener('click', () => {
        if (state.visible[c.id] === false) { toggleVisible(c.id, true); return; }
        setFocus(state.focus === c.id ? null : c.id);
      });
      els.legend.appendChild(b);
    }
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'lg-reset';
    reset.id = 'lgReset';
    reset.textContent = '显示全部';
    reset.hidden = true;
    reset.addEventListener('click', () => {
      for (const c of C.CRITERIA) state.visible[c.id] = true;
      renderAll();
    });
    els.legend.appendChild(reset);
  }

  /* ------------------------------------------------------------ 滑块 */
  const AXIS_NOTE = ['水平 1 方向', '水平 2 方向', '柱轴（竖直）'];
  function buildStressRows() {
    els.stressRows.innerHTML = '';
    for (let i = 0; i < 3; i++) {
      const row = document.createElement('div');
      row.className = 'srow';
      row.dataset.i = i;
      row.innerHTML = `
        <div class="srow-top">
          <span class="sname">σ<sub>${i + 1}</sub></span>
          <span class="snote">${AXIS_NOTE[i]}</span>
          <input class="snum" type="number" min="-10" max="5" step="0.05" value="0" aria-label="σ${i + 1}">
          <span class="sunit">MPa</span>
        </div>
        <div class="slider-wrap">
          <input class="srange" type="range" min="-10" max="5" step="0.05" value="0" aria-label="σ${i + 1} 滑块">
          <span class="zero-tick" style="left:66.667%"></span>
        </div>`;
      const num = row.querySelector('.snum');
      const range = row.querySelector('.srange');
      num.addEventListener('input', () => {
        if (num.value === '') return;
        const v = clamp(parseFloat(num.value), -10, 5);
        if (Number.isFinite(v)) setStress(update(state.s, i, v));
      });
      num.addEventListener('blur', () => { num.value = fmt2(state.s[i]); });
      range.addEventListener('input', () => setStress(update(state.s, i, parseFloat(range.value))));
      if (i === 2) {
        // 二维模式下点 σ₃ 行即开启第三维
        row.addEventListener('click', () => { if (state.mode === '2d') setMode('3d'); });
      }
      els.stressRows.appendChild(row);
    }
  }

  function update(arr, i, v) {
    const out = arr.slice();
    out[i] = v;
    return out;
  }

  /* ------------------------------------------------------------ 预设 */
  function buildPresets() {
    const make = (p, host) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'preset' + (p.tri ? ' tri' : '');
      b.dataset.id = p.id;
      b.title = `σ = ${p.coords} MPa`;
      b.innerHTML = p.tri ? p.label : `<span class="pn">${p.label}</span>${p.coords}`;
      b.addEventListener('click', () => applyPreset(p));
      host.appendChild(b);
    };
    PRESETS_2D.forEach(p => make(p, els.presets2d));
    PRESETS_3D.forEach(p => make(p, els.presets3d));
  }

  function applyPreset(p) {
    state.preset = p.id;
    lastWhy = p.why;
    const need3d = Math.abs(p.s[2]) > 1e-9;
    if (need3d && state.mode !== '3d') setMode('3d', { keepStress: true });
    setFocus(p.focus);
    animateStress(p.s, 460);
    markPreset();
    renderExplain();
  }

  function markPreset() {
    document.querySelectorAll('.preset').forEach(b => {
      b.classList.toggle('is-active', b.dataset.id === state.preset);
    });
  }

  /* ------------------------------------------------------------ 判定表 */
  function buildVerdicts() {
    els.verdicts.innerHTML = '';
    for (const c of C.CRITERIA) {
      const row = document.createElement('div');
      row.className = 'vrow';
      row.dataset.id = c.id;
      row.setAttribute('role', 'button');
      row.setAttribute('tabindex', '0');
      row.style.setProperty('--c', c.color);
      row.innerHTML = `
        <input type="checkbox" class="vcheck" checked aria-label="显示${c.name}">
        <span class="vname">${c.name}</span>
        <span class="vval">—</span>
        <span class="vbadge">—</span>
        <span class="vexpr"></span>
        <span class="vbar"><i style="width:0%"></i></span>`;
      const cb = row.querySelector('.vcheck');
      cb.addEventListener('click', (e) => e.stopPropagation());
      cb.addEventListener('change', () => toggleVisible(c.id, cb.checked));
      row.addEventListener('click', () => setFocus(state.focus === c.id ? null : c.id));
      row.addEventListener('keydown', (e) => {
        if (e.target !== row) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setFocus(state.focus === c.id ? null : c.id);
        }
      });
      els.verdicts.appendChild(row);
    }
  }

  /** 勾选/取消某个准则的显示 */
  function toggleVisible(id, on) {
    state.visible[id] = !!on;
    if (!on && state.focus === id) state.focus = null;
    renderAll();
  }

  /* ------------------------------------------------------------ 交互绑定 */
  function bindUI() {
    els.modeSwitch.querySelectorAll('button').forEach(b => {
      b.addEventListener('click', () => setMode(b.dataset.mode));
    });
    els.btnResetParams.addEventListener('click', () => {
      setParams(C.TASK.st, C.TASK.sc, C.TASK.S);
      toast('已恢复任务书取值');
    });
    $('#btnShot').addEventListener('click', screenshot);
    $('#btnFull').addEventListener('click', toggleFullscreen);
    $('#btnHelp').addEventListener('click', () => els.helpModal.classList.add('is-open'));
    els.helpModal.querySelectorAll('[data-close]').forEach(el => {
      el.addEventListener('click', () => els.helpModal.classList.remove('is-open'));
    });
    window.addEventListener('keydown', onKey);
    window.addEventListener('hashchange', applyHash);
  }

  function onKey(e) {
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || e.metaKey || e.ctrlKey) return;
    const k = e.key;
    if (k >= '1' && k <= '4') {
      const c = C.CRITERIA[Number(k) - 1];
      setFocus(state.focus === c.id ? null : c.id);
      e.preventDefault();
    } else if (k === '0' || k === 'Escape') {
      if (els.helpModal.classList.contains('is-open')) els.helpModal.classList.remove('is-open');
      else setFocus(null);
    } else if (k === 'd' || k === 'D') {
      setMode(state.mode === '2d' ? '3d' : '2d');
    } else if (k === 'r' || k === 'R') {
      scene.resetView(); toast('视角已复位');
    } else if (k === 's' || k === 'S') {
      screenshot();
    } else if (k === 'f' || k === 'F') {
      toggleFullscreen();
    } else if (k === '?') {
      els.helpModal.classList.toggle('is-open');
    } else if (k === 'ArrowLeft' || k === 'ArrowRight') {
      const d = (k === 'ArrowRight' ? 1 : -1) * 0.05;
      setStress(update(state.s, 0, clamp(state.s[0] + d, -10, 5)));
      e.preventDefault();
    } else if (k === 'ArrowUp' || k === 'ArrowDown') {
      const d = (k === 'ArrowUp' ? 1 : -1) * 0.05;
      setStress(update(state.s, 1, clamp(state.s[1] + d, -10, 5)));
      e.preventDefault();
    } else if ((k === 'PageUp' || k === 'PageDown') && state.mode === '3d') {
      const d = (k === 'PageUp' ? 1 : -1) * 0.05;
      setStress(update(state.s, 2, clamp(state.s[2] + d, -10, 5)));
      e.preventDefault();
    }
  }

  /* ------------------------------------------------------------ 状态更新 */
  function setStress(s, opts = {}) {
    tween = null;
    state.s = s.map(v => Math.round(clamp(v, -10, 5) / 0.05) * 0.05);
    if (opts.keepPreset !== true) {
      const p = ALL_PRESETS.find(p => p.s.every((v, i) => Math.abs(v - state.s[i]) < 1e-6));
      state.preset = p ? p.id : null;
      lastWhy = p ? p.why : null;
      markPreset();
    }
    renderAll();
  }

  function animateStress(target, dur = 420) {
    if (INSTANT) {
      state.s = target.slice();
      renderAll();
      return;
    }
    tween = { from: state.s.slice(), to: target.slice(), t0: performance.now(), dur };
    const step = (now) => {
      if (!tween) return;
      const t = clamp((now - tween.t0) / tween.dur, 0, 1);
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      state.s = tween.from.map((v, i) => Math.round((v + (tween.to[i] - v) * e) / 0.05) * 0.05);
      renderAll();
      if (t < 1) requestAnimationFrame(step);
      else { tween = null; }
    };
    requestAnimationFrame(step);
  }

  function setFocus(id) {
    state.focus = id;
    renderAll();
  }

  let modeToken = 0;
  function setMode(mode, opts = {}) {
    if (mode === state.mode) return;
    if (mode === '3d' && !scene.available) {
      toast('当前环境不支持 WebGL，三维视图不可用');
      return;
    }
    const token = ++modeToken;
    state.mode = mode;
    const is3d = mode === '3d';

    els.stage.classList.toggle('is-3d', is3d);
    els.modeChip.classList.toggle('is-3d', is3d);
    els.modeSwitch.querySelectorAll('button').forEach(b => {
      const on = b.dataset.mode === mode;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    moveThumb();

    if (is3d) {
      scene.setMode('3d');
      scene.faceOn(false);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (token === modeToken) scene.oblique(true);
      }));
    } else {
      scene.faceOn(true);
      setTimeout(() => { if (token === modeToken) scene.setMode('2d'); }, 260);
      if (!opts.keepStress) animateStress([state.s[0], state.s[1], 0], 380);
    }
    renderAll();
    writeHash();
  }

  function moveThumb() {
    const active = els.modeSwitch.querySelector('button.is-active');
    if (!active) return;
    els.modeThumb.style.width = active.offsetWidth + 'px';
    els.modeThumb.style.transform = `translateX(${active.offsetLeft - 4}px)`;
  }

  /* ------------------------------------------------------------ 渲染 */
  function renderAll() {
    const s = state.s;
    chart.setState({ s, focus: state.focus, visible: state.visible, hidden: state.mode === '3d' });
    scene.setState({ s, focus: state.focus, visible: state.visible });

    // 滑块
    els.stressRows.querySelectorAll('.srow').forEach((row, i) => {
      row.querySelector('.snum').value = fmt2(s[i]);
      row.querySelector('.srange').value = s[i];
      const locked = i === 2 && state.mode === '2d';
      row.classList.toggle('is-locked', locked);
      row.querySelector('.srange').disabled = locked;
      row.querySelector('.snum').disabled = locked;
      const note = row.querySelector('.snote');
      if (locked) {
        note.innerHTML = '锁定为 0 <span class="lock-tag">点击开启三维</span>';
        row.title = '点击开启第三维 σ₃';
      } else {
        note.textContent = AXIS_NOTE[i];
        row.title = '';
      }
    });

    // 派生量
    const d = C.derived(s);
    els.derived.innerHTML = `
      <span>σ<sub>max</sub> <b>${fmt2(d.max)}</b></span>
      <span>σ<sub>min</sub> <b>${fmt2(d.min)}</b></span>
      <span>平均应力 p <b>${fmt2(d.mean)}</b></span>
      <span>Mises σ<sub>e</sub> <b>${fmt2(d.mises)}</b></span>`;

    // 判定表
    const fv = state.mode + '|' + C.MAT.version;
    if (state._fv !== fv) {
      state._fv = fv;
      els.verdicts.querySelectorAll('.vrow').forEach(row => {
        row.querySelector('.vexpr').innerHTML = gFormulaHTML(row.dataset.id);
      });
    }
    // 二维/三维切换时，输入条件卡片里的 Tsai–Wu 系数条目随之增减
    if (state._coefKey !== fv) renderCoef();
    const verdicts = {};
    els.verdicts.querySelectorAll('.vrow').forEach(row => {
      const id = row.dataset.id;
      const crit = C.BY_ID[id];
      const g = crit.g(s[0], s[1], s[2]);
      const bad = g >= 1;
      verdicts[id] = bad;
      row.querySelector('.vval').textContent = g.toFixed(3);
      row.querySelector('.vval').className = 'vval ' + (bad ? 'is-bad' : 'is-ok');
      const badge = row.querySelector('.vbadge');
      badge.textContent = bad ? '破坏' : '未破坏';
      badge.className = 'vbadge ' + (bad ? 'bad' : 'ok');
      const pct = clamp(Math.max(g, 0) / 2, 0, 1) * 100;
      row.querySelector('.vbar i').style.width = pct.toFixed(1) + '%';
      const vis = state.visible[id] !== false;
      row.querySelector('.vcheck').checked = vis;
      row.classList.toggle('is-sel', state.focus === id);
      row.classList.toggle('is-off', !vis);
    });
    state._verdicts = verdicts;

    // 图例
    els.legend.querySelectorAll('.lg').forEach(b => {
      const id = b.dataset.id;
      const on = state.focus === id;
      const vis = state.visible[id] !== false;
      b.classList.toggle('is-sel', on);
      b.classList.toggle('is-dim', !!state.focus && !on);
      b.classList.toggle('is-off', !vis);
      b.title = vis
        ? `${C.BY_ID[id].name}（点击聚焦）`
        : `${C.BY_ID[id].name}（已隐藏，点击显示）`;
    });
    const resetBtn = els.legend.querySelector('#lgReset');
    if (resetBtn) resetBtn.hidden = C.CRITERIA.every(c => state.visible[c.id] !== false);

    // 顶部胶囊
    els.modeChipText.innerHTML = state.mode === '2d'
      ? '平面应力 · σ<sub>3</sub> = 0'
      : `三轴应力 · σ<sub>3</sub> = ${fmt2(s[2])} MPa`;
    els.viewChip.textContent = state.mode === '2d' ? '二维包络线' : '三维失效面 · σ₃ 切片';
    els.stageScale.innerHTML = state.mode === '2d'
      ? 'σ<sub>1</sub>–σ<sub>2</sub> 平面 · 等比例 · MPa'
      : '主应力空间 σ<sub>1</sub>/σ<sub>2</sub>/σ<sub>3</sub> · 等比例 · MPa';
    els.stateTag.textContent = state.mode === '2d' ? '平面应力' : '三轴应力';

    renderDetail();
    renderExplain();
    writeHash();
  }

  function renderExplain() {
    const s = state.s;
    const isTask = Math.abs(C.MAT.st - C.TASK.st) < 1e-9 && Math.abs(C.MAT.sc - C.TASK.sc) < 1e-9
      && Math.abs(C.MAT.S - C.TASK.S) < 1e-9;
    if (lastWhy && state.preset && isTask) {
      els.explain.innerHTML = lastWhy;
      return;
    }
    const failing = C.CRITERIA.filter(c => c.g(s[0], s[1], s[2]) >= 1);
    const d = C.derived(s);
    const lines = [];
    if (!failing.length) {
      lines.push('四种准则<b>均判未破坏</b>：当前应力点位于四条包络线以内。');
    } else if (failing.length === C.CRITERIA.length) {
      lines.push('四种准则<b>一致判为破坏</b>。');
    } else {
      lines.push(`四种准则中 <b>${failing.map(c => c.name).join('、')}</b> 判破坏，其余判未破坏。`);
    }
    const bits = [];
    if (d.max > 0) bits.push(`最大拉应力 ${fmt2(d.max)} MPa`);
    else if (d.max < 0) bits.push('三个主应力均为压应力');
    else bits.push('最大主应力为 0（无拉应力）');
    bits.push(`Mises 等效应力 ${fmt2(d.mises)} MPa`);
    bits.push(`5σ<sub>max</sub> − σ<sub>min</sub> = ${fmt2(5 * Math.max(d.max, 0) - Math.min(d.min, 0))} MPa`);
    lines.push(bits.join('；') + '。');
    if (state.mode === '3d') {
      lines.push('第三维通过 σ₃ 进入判据：第一强度与 Mohr–Coulomb 取三向极值，Mises 只与偏应力有关，Tsai–Wu 还含 <i>F</i><sub>33</sub>σ₃、<i>G</i><sub>3333</sub>σ₃² 与交叉项。');
    }
    els.explain.innerHTML = lines.join(' ');
  }

  /* ------------------------------------------------------------ 计算过程 */
  function renderDetail() {
    const s = state.s;
    const id = state.focus;
    if (!id) {
      els.detailCard.hidden = true;
      return;
    }
    const wasHidden = els.detailCard.hidden;
    els.detailCard.hidden = false;
    const crit = C.BY_ID[id];
    const g = crit.g(s[0], s[1], s[2]);
    els.detailName.innerHTML = `<span style="color:${crit.color};font-weight:700">●</span> ${crit.name}`;
    const body = [detailFormula(id, s, g)];
    els.detailBody.innerHTML = body.join('') +
      `<p class="note">${crit.note}</p>`;
    if (wasHidden && !INSTANT) {
      setTimeout(() => els.detailCard.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 60);
    }
  }

  /** 判定表中每个准则的 g 公式（随二维/三维与材料参数变化） */
  function gFormulaHTML(id) {
    const m = C.MAT, three = state.mode === '3d';
    if (id === 'rank') {
      return three
        ? `g = max(σ₁, σ₂, σ₃, 0) / ${m.st.toFixed(2)}`
        : `g = max(σ₁, σ₂, 0) / ${m.st.toFixed(2)}`;
    }
    if (id === 'mises') {
      return three
        ? `g = √[(σ₁−σ₂)² + (σ₂−σ₃)² + (σ₃−σ₁)²] / (√2 × ${m.sc.toFixed(2)})`
        : `g = √(σ₁² − σ₁σ₂ + σ₂²) / ${m.sc.toFixed(2)}`;
    }
    if (id === 'mc') {
      return `g = (${(m.sc / m.st).toFixed(2)}σ<sub>max</sub> − σ<sub>min</sub>) / ${m.sc.toFixed(2)}`;
    }
    const coef = 2 * m.G1122;
    const cSign = coef < 0 ? '−' : '+';
    return three
      ? 'g = F₁₁(σ₁+σ₂) + F₃₃σ₃ + G₁₁₁₁(σ₁²+σ₂²) + G₃₃₃₃σ₃² + 2G₁₁₂₂σ₁σ₂ + 2G₁₁₃₃(σ₁+σ₂)σ₃'
      : `g = ${m.F11.toFixed(3)}(σ₁+σ₂) + ${m.G1111.toFixed(4)}(σ₁²+σ₂²) ${cSign} ${Math.abs(coef).toFixed(4)}σ₁σ₂`;
  }

  function detailFormula(id, s, g) {
    const [a, b, c] = s;
    const m = C.MAT;
    const three = state.mode === '3d';
    const gHtml = `<span class="${g >= 1 ? 'bad' : 'num'}">${g.toFixed(3)}</span>`;

    if (id === 'rank') {
      const mx = Math.max(a, b, c, 0);
      const args = three ? `${fmt2(a)}, ${fmt2(b)}, ${fmt2(c)}, 0` : `${fmt2(a)}, ${fmt2(b)}, 0`;
      return `
        <div class="formula">${three ? 'g = max(σ₁, σ₂, σ₃, 0)' : 'g = max(σ₁, σ₂, 0)'} / ${m.st.toFixed(2)}</div>
        <div class="subst">= max(${args}) / ${m.st.toFixed(2)}<br>= ${fmt2(mx)} / ${m.st.toFixed(2)} = ${gHtml}</div>`;
    }
    if (id === 'mises') {
      const sc = m.sc.toFixed(2);
      const den = (Math.SQRT2 * m.sc).toFixed(3);
      if (three) {
        const se = Math.sqrt(((a - b) ** 2 + (b - c) ** 2 + (c - a) ** 2) / 2);
        return `
          <div class="formula">g = √[(σ₁−σ₂)² + (σ₂−σ₃)² + (σ₃−σ₁)²] / (√2 × ${sc})</div>
          <div class="subst">= √[(${fmt2(a)}−${fmt2(b)})² + (${fmt2(b)}−${fmt2(c)})² + (${fmt2(c)}−${fmt2(a)})²] / ${den}<br>
          = √${(se * se).toFixed(3)} / ${den} = ${fmt2(se)} / ${den} = ${gHtml}</div>`;
      }
      const q = a * a - a * b + b * b;
      return `
        <div class="formula">g = √(σ₁² − σ₁σ₂ + σ₂²) / ${sc}</div>
        <div class="subst">= √(${fmt2(a)}² − ${fmt2(a)}×${fmt2(b)} + ${fmt2(b)}²) / ${sc}<br>= √${q.toFixed(3)} / ${sc} = ${gHtml}</div>`;
    }
    if (id === 'mc') {
      const hi = Math.max(a, b, c, 0), lo = Math.min(a, b, c, 0);
      const k = (m.sc / m.st).toFixed(2);
      const args = three ? `${fmt2(a)}, ${fmt2(b)}, ${fmt2(c)}, 0` : `${fmt2(a)}, ${fmt2(b)}, 0`;
      return `
        <div class="formula">g = (${k}σ<sub>max</sub> − σ<sub>min</sub>) / ${m.sc.toFixed(2)}</div>
        <div class="subst">σ<sub>max</sub> = max(${args}) = ${fmt2(hi)}<br>
        σ<sub>min</sub> = min(${args}) = ${fmt2(lo)}<br>
        = (${k}×${fmt2(hi)} − (${fmt2(lo)})) / ${m.sc.toFixed(2)} = ${fmt2(m.sc / m.st * hi - lo)} / ${m.sc.toFixed(2)} = ${gHtml}</div>`;
    }
    // Tsai–Wu
    if (three) {
      const t1 = m.F11 * (a + b), t2 = m.F33 * c;
      const t3 = m.G1111 * (a * a + b * b), t4 = m.G3333 * c * c;
      const t5 = 2 * m.G1122 * a * b, t6 = 2 * m.G1133 * (a + b) * c;
      return `
        <div class="formula">g = F₁₁(σ₁+σ₂) + F₃₃σ₃ + G₁₁₁₁(σ₁²+σ₂²) + G₃₃₃₃σ₃² + 2G₁₁₂₂σ₁σ₂ + 2G₁₁₃₃(σ₁+σ₂)σ₃</div>
        <div class="subst">= ${m.F11.toFixed(3)}×(${fmt2(a)}+${fmt2(b)}) + ${m.F33.toFixed(3)}×(${fmt2(c)}) + ${m.G1111.toFixed(4)}×(${fmt2(a)}²+${fmt2(b)}²) + ${m.G3333.toFixed(4)}×(${fmt2(c)})²<br>
        &nbsp;&nbsp;+ 2×(${m.G1122.toFixed(4)})×(${fmt2(a)})(${fmt2(b)}) + 2×(${m.G1133.toFixed(4)})×(${fmt2(a)}+${fmt2(b)})(${fmt2(c)})<br>
        = ${fmt2(t1)} + ${fmt2(t2)} + ${fmt2(t3)} + ${fmt2(t4)} + ${fmt2(t5)} + ${fmt2(t6)} = ${gHtml}</div>`;
    }
    const u = a + b, v = a * a + b * b, w = a * b;
    const coef = 2 * m.G1122;                         // σ₁σ₂ 项的系数，可正可负
    const cSign = coef < 0 ? '−' : '+';
    const p = (x) => x < 0 ? `(${fmt2(x)})` : fmt2(x);
    const t1 = m.F11 * u, t2 = m.G1111 * v, t3 = coef * w;
    return `
      <div class="formula">g = ${m.F11.toFixed(3)}(σ₁+σ₂) + ${m.G1111.toFixed(4)}(σ₁²+σ₂²) ${cSign} ${Math.abs(coef).toFixed(4)}σ₁σ₂</div>
      <div class="subst">= ${m.F11.toFixed(3)}×(${p(a)} + ${p(b)}) + ${m.G1111.toFixed(4)}×(${(a * a).toFixed(2)} + ${(b * b).toFixed(2)}) ${cSign} ${Math.abs(coef).toFixed(4)}×(${p(a)})(${p(b)})<br>
      = ${p(t1)} + ${p(t2)} + ${p(t3)} = ${gHtml}</div>`;
  }

  /* ------------------------------------------------------------ 截图 */
  function screenshot() {
    const W = els.stage.clientWidth, H = els.stage.clientHeight;
    const legendH = 46;
    const cv = document.createElement('canvas');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(W * dpr);
    cv.height = Math.round((H + legendH) * dpr);
    const ctx = cv.getContext('2d');
    ctx.scale(dpr, dpr);

    // 背景
    const grad = ctx.createRadialGradient(W * 0.5, -H * 0.2, 40, W * 0.5, H * 0.5, Math.max(W, H) * 0.9);
    grad.addColorStop(0, '#FFFFFF');
    grad.addColorStop(1, '#EDF2F9');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H + legendH);

    if (state.mode === '2d') {
      ctx.drawImage(els.chart, 0, 0, W, H);
    } else {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, W, H);
        drawSceneLabels(ctx, W, H);
        drawExportLegend(ctx, W, H, legendH);
        download(cv);
      };
      img.src = scene.capture();
      return;
    }
    drawExportLegend(ctx, W, H, legendH);
    download(cv);
  }

  function drawSceneLabels(ctx, W, H) {
    const items = scene.getLabelSnapshots();
    for (const it of items) {
      if (!it.visible) continue;
      if (it.cls === 'slice') {
        ctx.font = '10.5px "Cascadia Mono", monospace';
        const tw = ctx.measureText(it.text).width;
        ctx.fillStyle = 'rgba(255,255,255,.9)';
        ctx.strokeStyle = '#CFE0F0';
        ctx.lineWidth = 1;
        roundRect(ctx, it.x - tw / 2 - 6, it.y - 9, tw + 12, 18, 5);
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#0A4E84';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(it.text, it.x, it.y);
      } else {
        const isAxis = it.cls === 'axis';
        const isMarker = it.cls === 'marker';
        ctx.font = isAxis ? '600 13.5px "Microsoft YaHei", sans-serif'
          : isMarker ? '700 10.5px "Microsoft YaHei", sans-serif'
            : '11.5px "Cambria Math", serif';
        ctx.fillStyle = isAxis ? '#3D4A5C' : '#6B7789';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(it.text, it.x, it.y);
      }
    }
  }

  function drawExportLegend(ctx, W, H, legendH) {
    ctx.save();
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, H, W, legendH);
    ctx.strokeStyle = '#E4E9F1';
    ctx.beginPath(); ctx.moveTo(0, H + 0.5); ctx.lineTo(W, H + 0.5); ctx.stroke();
    let x = 18;
    const y = H + legendH / 2;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    for (const c of C.CRITERIA) {
      if (state.visible[c.id] === false) continue;
      ctx.fillStyle = c.color;
      ctx.fillRect(x, y - 2, 16, 4);
      x += 22;
      ctx.fillStyle = '#475467';
      ctx.font = '11.5px "Microsoft YaHei", sans-serif';
      ctx.fillText(c.name, x, y);
      x += ctx.measureText(c.name).width + 20;
    }
    const tag = state.mode === '2d' ? 'σ₃ = 0' : `σ₃ = ${fmt2(state.s[2])} MPa`;
    ctx.textAlign = 'right';
    ctx.fillStyle = '#8B95A7';
    ctx.font = '11px "Cascadia Mono", monospace';
    ctx.fillText(`(${fmt2(state.s[0])}, ${fmt2(state.s[1])}, ${fmt2(state.s[2])}) MPa · ${tag}`, W - 18, y);
    ctx.restore();
  }

  function download(cv) {
    const a = document.createElement('a');
    const tag = state.mode === '2d' ? '2D' : `3D_s3-${fmt2(state.s[2])}`;
    a.download = `海冰失效包络面_${tag}_${fmt2(state.s[0])}_${fmt2(state.s[1])}.png`;
    a.href = cv.toDataURL('image/png');
    a.click();
    toast('画面已保存为 PNG');
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  }

  let toastTimer = null;
  function toast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove('is-on'), 1700);
  }

  /* ------------------------------------------------------------ 地址栏状态 */
  let hashTimer = null;
  function writeHash() {
    clearTimeout(hashTimer);
    hashTimer = setTimeout(() => {
      const q = new URLSearchParams();
      q.set('m', state.mode);
      q.set('s', state.s.map(v => fmt2(v)).join(','));
      q.set('st', C.MAT.st.toFixed(2));
      q.set('sc', C.MAT.sc.toFixed(2));
      q.set('S', C.MAT.S.toFixed(2));
      q.set('v', C.CRITERIA.map(c => state.visible[c.id] === false ? '0' : '1').join(''));
      if (state.focus) q.set('f', state.focus);
      if (state.preset) q.set('p', state.preset);
      const h = '#' + q.toString();
      if (location.hash !== h) {
        try { history.replaceState(null, '', h); } catch (e) { /* file:// 下可能被拒绝 */ }
      }
    }, 140);
  }

  function applyHash() {
    const raw = location.hash.replace(/^#/, '');
    if (!raw) return;
    const q = new URLSearchParams(raw);
    const stv = parseFloat(q.get('st'));
    const scv = parseFloat(q.get('sc'));
    const Sv = parseFloat(q.get('S'));
    if (Number.isFinite(stv) || Number.isFinite(scv) || Number.isFinite(Sv)) {
      C.setStrengths(
        Number.isFinite(stv) ? stv : C.MAT.st,
        Number.isFinite(scv) ? scv : C.MAT.sc,
        Number.isFinite(Sv) ? Sv : C.MAT.S
      );
    }
    const mode = q.get('m');
    const s = q.get('s');
    if (s) {
      const arr = s.split(',').map(Number);
      if (arr.length === 3 && arr.every(Number.isFinite)) state.s = arr.map(v => clamp(v, -10, 5));
    }
    const f = q.get('f');
    const v = q.get('v');
    if (v && v.length === C.CRITERIA.length) {
      C.CRITERIA.forEach((c, i) => { state.visible[c.id] = v[i] !== '0'; });
    }
    if (f && C.BY_ID[f] && state.visible[f] !== false) state.focus = f;
    const p = q.get('p');
    if (p && ALL_PRESETS.some(x => x.id === p)) {
      const preset = ALL_PRESETS.find(x => x.id === p);
      const matches = preset.s.every((v, i) => Math.abs(v - state.s[i]) < 1e-6);
      if (matches) {
        state.preset = p;
        lastWhy = preset.why;
      } else {
        state.preset = null;
        lastWhy = null;
      }
    }
    const cam = q.get('cam');
    if (cam) {
      const [th, ph, rr] = cam.split(',').map(Number);
      if (Number.isFinite(th) && Number.isFinite(ph)) {
        setTimeout(() => {
          scene.goal.theta = th;
          scene.goal.phi = ph;
          if (Number.isFinite(rr)) scene.goal.r = rr;
          scene.orbit.theta = th; scene.orbit.phi = ph;
          if (Number.isFinite(rr)) scene.orbit.r = rr;
          scene.dirty = true;
        }, 40);
      }
    }
    if (mode === '3d' && state.mode !== '3d') {
      // 直接切换，不做动画
      state.mode = '2d';
      setMode('3d', { keepStress: true });
    } else if (mode === '2d' && state.mode !== '2d') {
      state.mode = '3d';
      setMode('2d', { keepStress: true });
    }
    markPreset();
    renderParams();
    renderAll();
    moveThumb();
  }

  /* ------------------------------------------------------------ 尺寸 */
  window.addEventListener('resize', () => { moveThumb(); });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

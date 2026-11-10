/* ==========================================================================
 * chart2d.js — σ₁–σ₂ 平面双轴包络线（Canvas 2D）
 *  · 等比例坐标，范围与任务书报告图一致：−10 … 5 MPa
 *  · 可拖动应力点；聚焦准则时显示其失效区淡色填充
 * ========================================================================== */
(function () {
  'use strict';
  const C = window.ICECriteria;

  const X0 = -10, X1 = 5, Y0 = -10, Y1 = 5;
  const TICK = 2;
  const FONT = '"Microsoft YaHei UI","Microsoft YaHei","PingFang SC",system-ui,sans-serif';
  const MONO = '"Cascadia Mono","Consolas",monospace';

  class Chart2D {
    constructor(canvas, opts = {}) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.state = { s: [0, 0, 0], focus: null, visible: {} };
      this.onPick = opts.onPick || (() => {});
      this.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      this._maskCache = new Map();
      this._curves = null;
      this._curvesKey = '';
      this._hover = null;
      this._bind();
      this.resize();
    }

    _bind() {
      const cv = this.canvas;
      let dragging = false;

      const toStress = (ev) => {
        const r = cv.getBoundingClientRect();
        const x = (ev.clientX - r.left - this.L) / this.S * (X1 - X0) + X0;
        const y = Y1 - (ev.clientY - r.top - this.T) / this.S * (Y1 - Y0);
        return [x, y];
      };
      const inside = (ev) => {
        const r = cv.getBoundingClientRect();
        const px = ev.clientX - r.left, py = ev.clientY - r.top;
        return px >= this.L - 6 && px <= this.L + this.S + 6 && py >= this.T - 6 && py <= this.T + this.S + 6;
      };

      cv.addEventListener('pointerdown', (ev) => {
        if (!inside(ev)) return;
        dragging = true;
        cv.setPointerCapture(ev.pointerId);
        cv.style.cursor = 'grabbing';
        const [x, y] = toStress(ev);
        this.onPick(this._snap(x, y));
      });
      cv.addEventListener('pointermove', (ev) => {
        if (dragging) {
          const [x, y] = toStress(ev);
          this.onPick(this._snap(x, y));
          return;
        }
        cv.style.cursor = inside(ev) ? 'crosshair' : 'default';
      });
      const stop = (ev) => {
        if (!dragging) return;
        dragging = false;
        cv.style.cursor = 'crosshair';
        try { cv.releasePointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
      };
      cv.addEventListener('pointerup', stop);
      cv.addEventListener('pointercancel', stop);
    }

    _snap(x, y) {
      const step = 0.05;
      const cl = (v, lo, hi) => Math.min(hi, Math.max(lo, Math.round(v / step) * step));
      return { s1: cl(x, X0, X1), s2: cl(y, Y0, Y1) };
    }

    setState(patch) {
      Object.assign(this.state, patch);
      if (this.state.hidden) { this._pending = true; return; }
      this._pending = false;
      this.render();
    }

    resize() {
      const box = this.canvas.parentElement.getBoundingClientRect();
      const w = Math.max(320, box.width), h = Math.max(260, box.height);
      this.W = w; this.H = h;
      this.canvas.width = Math.round(w * this.dpr);
      this.canvas.height = Math.round(h * this.dpr);
      this.canvas.style.width = w + 'px';
      this.canvas.style.height = h + 'px';

      // 绘图区：正方形，避开顶部胶囊与底部图例
      const padL = 64, padR = 42, padT = 44, padB = 88;
      const S = Math.max(180, Math.min(w - padL - padR, h - padT - padB));
      this.S = S;
      this.L = padL + Math.max(0, (w - padL - padR - S) / 2);
      this.T = padT + Math.max(0, (h - padT - padB - S) / 2);
      this.render();
    }

    _px(x) { return this.L + (x - X0) / (X1 - X0) * this.S; }
    _py(y) { return this.T + (Y1 - y) / (Y1 - Y0) * this.S; }

    _curvesAt(s3) {
      const key = `${C.MAT.version}|${s3.toFixed(4)}`;
      if (this._curvesKey !== key) {
        this._curves = C.contourAtS3(s3, X0, X1, Y0, Y1, 240);
        this._curvesKey = key;
        this._maskCache.clear();
      }
      return this._curves;
    }

    /** 材料参数变化后清空等值线缓存 */
    invalidate() {
      this._curvesKey = '';
      this._maskCache.clear();
    }

    render() {
      const { ctx } = this;
      const { S, L, T } = this;
      const s = this.state.s;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.clearRect(0, 0, this.W, this.H);

      const curves = this._curvesAt(s[2]);
      const focus = this.state.focus;

      /* ---------- 网格与坐标轴 ---------- */
      ctx.save();
      ctx.beginPath(); ctx.rect(L, T, S, S); ctx.clip();

      ctx.lineWidth = 1;
      ctx.strokeStyle = '#E9EEF5';
      for (let v = X0; v <= X1 + 1e-9; v += TICK) {
        const px = this._px(v), py = this._py(v);
        ctx.beginPath(); ctx.moveTo(px, T); ctx.lineTo(px, T + S); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(L, py); ctx.lineTo(L + S, py); ctx.stroke();
      }

      // 未破坏区淡色填充（仅聚焦准则）
      if (focus) {
        const img = this._mask(focus, s[2]);
        if (img) {
          ctx.globalAlpha = 0.055;
          ctx.imageSmoothingEnabled = true;
          ctx.drawImage(img, L, T, S, S);
          ctx.globalAlpha = 1;
        }
      }

      // 零轴
      ctx.strokeStyle = '#B7C3D3';
      ctx.lineWidth = 1.2;
      const zx = this._px(0), zy = this._py(0);
      ctx.beginPath(); ctx.moveTo(zx, T); ctx.lineTo(zx, T + S); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(L, zy); ctx.lineTo(L + S, zy); ctx.stroke();

      /* ---------- 包络线 ---------- */
      for (const c of C.CRITERIA) {
        const lines = curves[c.id];
        if (!lines || !lines.length) continue;
        if (this.state.visible[c.id] === false) continue;
        const isFocus = focus === c.id;
        const dim = focus && !isFocus;
        ctx.lineWidth = isFocus ? 3.4 : 2.3;
        ctx.strokeStyle = c.color;
        ctx.globalAlpha = dim ? 0.42 : 1;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        for (const line of lines) {
          ctx.beginPath();
          for (let i = 0; i < line.length; i++) {
            const px = this._px(line[i][0]), py = this._py(line[i][1]);
            if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
          }
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
      ctx.restore();

      /* ---------- 边框 ---------- */
      ctx.strokeStyle = '#DCE3EC';
      ctx.lineWidth = 1;
      ctx.strokeRect(L + 0.5, T + 0.5, S - 1, S - 1);

      /* ---------- 刻度 ---------- */
      ctx.fillStyle = '#8B95A7';
      ctx.font = `11px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (let v = X0; v <= X1 + 1e-9; v += TICK) {
        if (Math.abs(v) < 1e-9) continue;
        const px = this._px(v);
        ctx.fillText(String(v), px, T + S + 8);
        ctx.strokeStyle = '#C9D3E1'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(px, T + S); ctx.lineTo(px, T + S + 4); ctx.stroke();
      }
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (let v = Y0; v <= Y1 + 1e-9; v += TICK) {
        if (Math.abs(v) < 1e-9) continue;
        const py = this._py(v);
        ctx.fillText(String(v), L - 9, py);
        ctx.strokeStyle = '#C9D3E1'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(L - 4, py); ctx.lineTo(L, py); ctx.stroke();
      }
      ctx.textAlign = 'right'; ctx.textBaseline = 'top';
      ctx.fillText('0', L - 9, this._py(0) + 3);

      /* ---------- 轴名 ---------- */
      ctx.fillStyle = '#5B6B80';
      ctx.font = `12.5px ${FONT}`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText('σ₁ / MPa', L + S / 2, T + S + 30);
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText('σ₂ / MPa', L + 8, T + 6);

      /* ---------- 工况点 ---------- */
      if (Math.abs(s[2]) < 1e-9) {
        const off = { 1: [20, -20], 2: [-20, -20], 3: [18, 16], 4: [20, 2], 5: [20, 0], 6: [-22, 18], 7: [20, -2] };
        for (const cs of C.CASES) {
          const px = this._px(cs.s[0]), py = this._py(cs.s[1]);
          ctx.beginPath(); ctx.arc(px, py, 4.2, 0, Math.PI * 2);
          ctx.fillStyle = '#2C3A4E'; ctx.fill();
          ctx.beginPath(); ctx.arc(px, py, 6.2, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 2; ctx.stroke();
          const o = off[cs.n] || [16, -16];
          ctx.font = `bold 11px ${FONT}`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,.95)';
          ctx.strokeText(String(cs.n), px + o[0], py + o[1]);
          ctx.fillStyle = '#3A4A60';
          ctx.fillText(String(cs.n), px + o[0], py + o[1]);
        }
        // T / C 单轴强度点
        for (const [x, y, lab, dx, dy] of [[0.8, 0, 'T', 12, 15], [-4, 0, 'C', -13, -13]]) {
          const px = this._px(x), py = this._py(y);
          ctx.strokeStyle = '#2C3A4E'; ctx.lineWidth = 1.6;
          ctx.strokeRect(px - 4.5, py - 4.5, 9, 9);
          ctx.font = `bold 11px ${FONT}`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,.95)';
          ctx.strokeText(lab, px + dx, py + dy);
          ctx.fillStyle = '#3A4A60';
          ctx.fillText(lab, px + dx, py + dy);
        }
      }

      /* ---------- 当前应力点 ---------- */
      const px = this._px(s[0]), py = this._py(s[1]);
      ctx.save();
      ctx.beginPath(); ctx.arc(px, py, 13, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(11,99,168,.10)'; ctx.fill();
      ctx.beginPath(); ctx.arc(px, py, 7.5, 0, Math.PI * 2);
      ctx.fillStyle = '#0B63A8'; ctx.fill();
      ctx.lineWidth = 2.5; ctx.strokeStyle = '#fff'; ctx.stroke();
      ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#fff'; ctx.fill();
      ctx.restore();

      // 坐标标签
      const label = `(${s[0].toFixed(2)}, ${s[1].toFixed(2)})`;
      ctx.font = `11.5px ${MONO}`;
      const tw = ctx.measureText(label).width;
      let bx = px + 14, by = py - 30;
      if (bx + tw + 14 > L + S) bx = px - tw - 26;
      if (by < T + 2) by = py + 16;
      ctx.fillStyle = 'rgba(255,255,255,.94)';
      ctx.strokeStyle = '#D6E3F1'; ctx.lineWidth = 1;
      roundRect(ctx, bx, by, tw + 14, 21, 6);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#0A4E84';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(label, bx + 7, by + 11);
    }

    _mask(id, s3) {
      const key = `${id}|${s3.toFixed(3)}`;
      if (this._maskCache.has(key)) return this._maskCache.get(key);
      const crit = C.BY_ID[id];
      const N = 180;
      const off = document.createElement('canvas');
      off.width = N; off.height = N;
      const octx = off.getContext('2d');
      const img = octx.createImageData(N, N);
      const rgb = hexToRgb(crit.color);
      for (let j = 0; j < N; j++) {
        const y = Y1 - (j + 0.5) / N * (Y1 - Y0);
        for (let i = 0; i < N; i++) {
          const x = X0 + (i + 0.5) / N * (X1 - X0);
          if (crit.g(x, y, s3) < 1) {
            const k = (j * N + i) * 4;
            img.data[k] = rgb[0]; img.data[k + 1] = rgb[1]; img.data[k + 2] = rgb[2]; img.data[k + 3] = 255;
          }
        }
      }
      octx.putImageData(img, 0, 0);
      this._maskCache.set(key, off);
      return off;
    }
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
  function hexToRgb(h) {
    const n = parseInt(h.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  window.Chart2D = Chart2D;
})();

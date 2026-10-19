/* 量子线路：用简单文本描述，自动排版成线路图。
 *
 *   qubits 3              比特数（从上到下编号 0,1,2…）
 *   in 0 |j_1\rangle      左侧输入标签（LaTeX）
 *   out 0 |k_1\rangle     右侧输出标签
 *   H 0                   单比特门，门名按 LaTeX 显示，如 R_2、R_z(\theta)
 *   ~I 1                  门名前加 ~：虚线框（如示意"相当于作用了 I"）
 *   X 1 replace           放在这根线上一个门的同一位置，分步显示到它时替换掉上一个门
 *   C1 R_2 0              受控门：控制比特 1，作用在 0 上（多个控制：C1,2 X 0）
 *   C0 X 1                目标为 X 时画成 ⊕
 *   C0 * 1                控制相位（两端都是实心点）
 *   C0 *\pi/2 1          带角度标注的控制相位（角度写在竖线上方，LaTeX）
 *   SWAP 0 2              交换
 *   M 0                   测量
 *   cbits 2               经典比特数（画在量子线下方的双线，从上到下编号 0,1,…）
 *   cin 0 c_0             经典比特的左侧标签（LaTeX）
 *   M 0 1                 测量 Qubit 0，结果写入经典比特 1（双线箭头连到经典线）
 *   U_f 0-2               跨多比特的大方框
 *   |                     强制换列（之后的门另起一列）
 *   ...                   省略号列
 *   # 注释
 */
(function () {
  'use strict';
  const QS = (window.QS = window.QS || {});

  function parse(spec) {
    const c = { n: 1, m: 0, ins: {}, outs: {}, cins: {}, ops: [] };
    for (let raw of String(spec || '').split('\n')) {
      const line = raw.replace(/#.*$/, '').trim();
      if (!line) continue;
      const tok = line.split(/\s+/);
      const head = tok[0];
      if (head === 'qubits') { c.n = Math.max(1, Math.min(16, parseInt(tok[1]) || 1)); continue; }
      if (head === 'cbits') { c.m = Math.max(0, Math.min(16, parseInt(tok[1]) || 0)); continue; }
      if (head === 'cin') { c.cins[parseInt(tok[1])] = tok.slice(2).join(' '); continue; }
      if (head === 'in' || head === 'out') {
        (head === 'in' ? c.ins : c.outs)[parseInt(tok[1])] = tok.slice(2).join(' ');
        continue;
      }
      if (head === '|') { c.ops.push({ kind: 'break' }); continue; }
      if (head === '...') { c.ops.push({ kind: 'dots' }); continue; }
      if (head === 'SWAP') { c.ops.push({ kind: 'swap', qs: [parseInt(tok[1]), parseInt(tok[2])] }); continue; }
      if (head === 'M') {
        const cb = tok[2] === undefined ? null : parseInt(tok[2]);
        c.ops.push({ kind: 'meas', qs: [parseInt(tok[1])], cbit: Number.isInteger(cb) ? cb : null });
        continue;
      }
      const cm = /^C([\d,]+)$/.exec(head);
      if (cm) {
        const ctrls = cm[1].split(',').map(Number);
        const gate = tok[1], t = parseInt(tok[2]);
        c.ops.push({ kind: 'ctrl', ctrls, gate, qs: ctrls.concat([t]), target: t });
        continue;
      }
      const range = /^(\d+)-(\d+)$/.exec(tok[1] || '');
      if (range) {
        const a = +range[1], b = +range[2];
        // 标签较长（如 \\mathrm{QFT}_{16}）时方框占 2～3 列宽
        const len = head.replace(/\\(mathrm|text|operatorname)\{([^}]*)\}/g, '$2').replace(/\\[a-zA-Z]+|[{}_^]/g, '').length;
        c.ops.push({ kind: 'multi', gate: head, lo: Math.min(a, b), hi: Math.max(a, b), qs: [a, b], w: len <= 2 ? 1 : len <= 6 ? 2 : 3 });
        continue;
      }
      const op = { kind: 'gate', gate: head, qs: [parseInt(tok[1])] };
      if (head.length > 1 && head[0] === '~') { op.gate = head.slice(1); op.dashed = true; }
      if (tok[2] === 'replace') op.replace = true;
      c.ops.push(op);
    }
    c.ops = c.ops.filter((o) => (!o.qs || o.qs.every((q) => q >= 0 && q < c.n)) && (o.cbit == null || (o.cbit >= 0 && o.cbit < c.m)));
    // 写入经典比特的测量：竖向双线穿过下方所有线，排版时占住这些行
    for (const o of c.ops) if (o.cbit != null) o.rows = [o.qs[0], c.n + c.m - 1];
    return c;
  }

  /** 贪心排版：每个门放到它所涉及比特区间里最早的空闲列 */
  function layout(c) {
    const free = new Array(c.n + c.m).fill(0);
    let floor = 0, cols = 0;
    for (const op of c.ops) {
      if (op.kind === 'break' || op.kind === 'dots') {
        const m = Math.max(floor, ...free);
        if (op.kind === 'dots') { op.col = m; floor = m + 1; } else floor = m;
        cols = Math.max(cols, floor);
        continue;
      }
      if (op.replace) {
        // 与这根线上的上一个门同一位置
        const prev = c.ops.slice(0, c.ops.indexOf(op)).reverse().find((o) => o.qs && o.kind !== 'break' && o.qs.includes(op.qs[0]));
        if (prev) { op.col = prev.col; op.w = prev.w; prev.replacedBy = op; continue; }
      }
      const span = op.rows || op.qs;
      const lo = Math.min(...span), hi = Math.max(...span);
      let col = floor;
      for (let q = lo; q <= hi; q++) col = Math.max(col, free[q]);
      const w = op.w || 1;
      for (let q = lo; q <= hi; q++) free[q] = col + w;
      op.col = col;
      cols = Math.max(cols, col + w);
    }
    c.cols = cols;
    return c;
  }

  function gateOps(c) {
    return c.ops.filter((o) => o.kind !== 'break');
  }

  QS.circuit = {
    parse,
    stepCount(spec, mode) {
      const c = layout(parse(spec));
      if (mode === 'column') return Math.max(1, c.cols);
      return Math.max(1, gateOps(c).length);
    },
    render(host, b) {
      const c = layout(parse(b.spec));
      const scale = b.scale || 1;
      const ROW = 64 * scale, COL = 76 * scale, BOX = 44 * scale;
      const hasIn = Object.keys(c.ins).length + Object.keys(c.cins).length > 0, hasOut = Object.keys(c.outs).length > 0;
      const PADL = hasIn ? 96 * scale : 24 * scale, PADR = hasOut ? 96 * scale : 24 * scale;
      const W = PADL + c.cols * COL + PADR, H = (c.n + c.m) * ROW;
      const x = (col) => PADL + col * COL + COL / 2;
      const y = (q) => q * ROW + ROW / 2;

      const box = document.createElement('div');
      box.className = 'qs-circuit';
      box.style.width = W + 'px';
      box.style.height = H + 'px';
      box.style.fontSize = 22 * scale + 'px';
      host.appendChild(box);

      const NS = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('width', W);
      svg.setAttribute('height', H);
      svg.classList.add('qs-circuit-wires');
      box.appendChild(svg);
      const line = (g, x1, y1, x2, y2, cls) => {
        const l = document.createElementNS(NS, 'line');
        l.setAttribute('x1', x1); l.setAttribute('y1', y1); l.setAttribute('x2', x2); l.setAttribute('y2', y2);
        if (cls) l.setAttribute('class', cls);
        g.appendChild(l);
        return l;
      };
      const circle = (g, cx, cy, r, cls) => {
        const e = document.createElementNS(NS, 'circle');
        e.setAttribute('cx', cx); e.setAttribute('cy', cy); e.setAttribute('r', r);
        if (cls) e.setAttribute('class', cls);
        g.appendChild(e);
        return e;
      };
      for (let q = 0; q < c.n; q++) line(svg, PADL - 8 * scale, y(q), W - PADR + 8 * scale, y(q), 'w');
      // 经典比特：双线
      const DG = 2.2 * scale;
      for (let k = 0; k < c.m; k++) {
        const r = c.n + k;
        line(svg, PADL - 8 * scale, y(r) - DG, W - PADR + 8 * scale, y(r) - DG, 'cw');
        line(svg, PADL - 8 * scale, y(r) + DG, W - PADR + 8 * scale, y(r) + DG, 'cw');
      }

      const label = (q, tex, side) => {
        const d = document.createElement('div');
        d.className = 'qs-circuit-label qs-circuit-' + side;
        d.innerHTML = QS.tex(tex, false);
        d.style.top = y(q) + 'px';
        if (side === 'in') d.style.right = W - PADL + 14 * scale + 'px';
        else d.style.left = W - PADR + 14 * scale + 'px';
        box.appendChild(d);
      };
      for (const q in c.ins) label(+q, c.ins[q], 'in');
      for (const q in c.outs) label(+q, c.outs[q], 'out');
      for (const k in c.cins) if (+k < c.m) label(c.n + +k, c.cins[k], 'in');

      const mode = b.stepwise || 'none';
      const ops = gateOps(c);
      ops.forEach((op, i) => {
        const g = document.createElementNS(NS, 'g');
        svg.appendChild(g);
        const parts = [g];
        const gateBox = (q0, q1, tex, cls) => {
          const d = document.createElement('div');
          d.className = 'qs-gate ' + (cls || '');
          const wide = ((op.w || 1) - 1) * COL;
          d.style.left = x(op.col) - BOX / 2 + 'px';
          d.style.top = y(q0) - BOX / 2 + 'px';
          d.style.width = BOX + wide + 'px';
          d.style.height = y(q1) - y(q0) + BOX + 'px';
          d.innerHTML = tex !== null ? QS.tex(tex, false) : '';
          box.appendChild(d);
          parts.push(d);
        };
        const X = x(op.col);
        if (op.kind === 'gate') gateBox(op.qs[0], op.qs[0], op.gate, op.dashed ? 'qs-gate-dashed' : '');
        else if (op.kind === 'multi') gateBox(op.lo, op.hi, op.gate, 'qs-gate-multi');
        else if (op.kind === 'meas') {
          gateBox(op.qs[0], op.qs[0], null, 'qs-gate-meas');
          parts[parts.length - 1].innerHTML =
            '<svg viewBox="0 0 44 44"><path d="M9 31 A13 13 0 0 1 35 31" fill="none" stroke="currentColor" stroke-width="2.4"/><line x1="22" y1="31" x2="32" y2="15" stroke="currentColor" stroke-width="2.4"/></svg>';
          if (op.cbit != null) {
            // 双线从测量框底部连到经典线，末端是箭头
            const y0 = y(op.qs[0]) + BOX / 2, y1 = y(c.n + op.cbit) - 2.2 * scale, a = 7 * scale;
            line(g, X - 2.2 * scale, y0, X - 2.2 * scale, y1 - a, 'cw');
            line(g, X + 2.2 * scale, y0, X + 2.2 * scale, y1 - a, 'cw');
            const tri = document.createElementNS(NS, 'path');
            tri.setAttribute('d', `M${X - a} ${y1 - a} L${X + a} ${y1 - a} L${X} ${y1} Z`);
            tri.setAttribute('class', 'arrow');
            g.appendChild(tri);
          }
        } else if (op.kind === 'swap') {
          const [a, bq] = op.qs, s = 9 * scale;
          line(g, X, y(a), X, y(bq), 'v');
          for (const q of [a, bq]) {
            line(g, X - s, y(q) - s, X + s, y(q) + s, 'x');
            line(g, X - s, y(q) + s, X + s, y(q) - s, 'x');
          }
        } else if (op.kind === 'ctrl') {
          const lo = Math.min(...op.qs), hi = Math.max(...op.qs);
          line(g, X, y(lo), X, y(hi), 'v');
          for (const q of op.ctrls) circle(g, X, y(q), 7 * scale, 'dot');
          if (op.gate === 'X') {
            circle(g, X, y(op.target), 15 * scale, 'oplus');
            line(g, X - 15 * scale, y(op.target), X + 15 * scale, y(op.target), 'v');
            line(g, X, y(op.target) - 15 * scale, X, y(op.target) + 15 * scale, 'v');
          } else if (op.gate[0] === '*') {
            circle(g, X, y(op.target), 7 * scale, 'dot');
            if (op.gate.length > 1) {
              const d = document.createElement('div');
              d.className = 'qs-circuit-angle';
              d.innerHTML = QS.tex(op.gate.slice(1), false);
              d.style.left = X + 'px';
              d.style.top = y(lo) - 12 * scale + 'px';
              box.appendChild(d);
              parts.push(d);
            }
          }
          else gateBox(op.target, op.target, op.gate);
        } else if (op.kind === 'dots') {
          for (let q = 0; q < c.n; q++) {
            const d = document.createElement('div');
            d.className = 'qs-circuit-dots';
            d.style.left = X - COL / 2 + 'px';
            d.style.width = COL + 'px';
            d.style.top = y(q) - 16 * scale + 'px';
            d.textContent = '⋯';
            box.appendChild(d);
            parts.push(d);
          }
        }
        op.parts = parts;
        if (mode !== 'none') {
          op.stepAt = (b.step || 0) + (mode === 'column' ? op.col : i);
          for (const p of parts) p.setAttribute('data-step', op.stepAt);
        }
      });
      // 被替换的门：不分步时直接不显示，分步时显示到替换它的那一步为止
      for (const op of ops) {
        if (!op.replacedBy) continue;
        for (const p of op.parts) {
          if (mode === 'none') p.style.display = 'none';
          else p.setAttribute('data-until', op.replacedBy.stepAt);
        }
      }
    },
  };
})();

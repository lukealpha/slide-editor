/* 量子线路：用简单文本描述，自动排版成线路图。
 *
 *   qubits 3              比特数（从上到下编号 0,1,2…）
 *   in 0 |j_1\rangle      左侧输入标签（LaTeX）
 *   out 0 |k_1\rangle     右侧输出标签
 *   H 0                   单比特门，门名按 LaTeX 显示，如 R_2、R_z(\theta)
 *   C1 R_2 0              受控门：控制比特 1，作用在 0 上（多个控制：C1,2 X 0）
 *   C0 X 1                目标为 X 时画成 ⊕
 *   C0 * 1                控制相位（两端都是实心点）
 *   SWAP 0 2              交换
 *   M 0                   测量
 *   U_f 0-2               跨多比特的大方框
 *   |                     强制换列（之后的门另起一列）
 *   ...                   省略号列
 *   # 注释
 */
(function () {
  'use strict';
  const QS = (window.QS = window.QS || {});

  function parse(spec) {
    const c = { n: 1, ins: {}, outs: {}, ops: [] };
    for (let raw of String(spec || '').split('\n')) {
      const line = raw.replace(/#.*$/, '').trim();
      if (!line) continue;
      const tok = line.split(/\s+/);
      const head = tok[0];
      if (head === 'qubits') { c.n = Math.max(1, Math.min(16, parseInt(tok[1]) || 1)); continue; }
      if (head === 'in' || head === 'out') {
        (head === 'in' ? c.ins : c.outs)[parseInt(tok[1])] = tok.slice(2).join(' ');
        continue;
      }
      if (head === '|') { c.ops.push({ kind: 'break' }); continue; }
      if (head === '...') { c.ops.push({ kind: 'dots' }); continue; }
      if (head === 'SWAP') { c.ops.push({ kind: 'swap', qs: [parseInt(tok[1]), parseInt(tok[2])] }); continue; }
      if (head === 'M') { c.ops.push({ kind: 'meas', qs: [parseInt(tok[1])] }); continue; }
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
        c.ops.push({ kind: 'multi', gate: head, lo: Math.min(a, b), hi: Math.max(a, b), qs: [a, b] });
        continue;
      }
      c.ops.push({ kind: 'gate', gate: head, qs: [parseInt(tok[1])] });
    }
    c.ops = c.ops.filter((o) => !o.qs || o.qs.every((q) => q >= 0 && q < c.n));
    return c;
  }

  /** 贪心排版：每个门放到它所涉及比特区间里最早的空闲列 */
  function layout(c) {
    const free = new Array(c.n).fill(0);
    let floor = 0, cols = 0;
    for (const op of c.ops) {
      if (op.kind === 'break' || op.kind === 'dots') {
        const m = Math.max(floor, ...free);
        if (op.kind === 'dots') { op.col = m; floor = m + 1; } else floor = m;
        cols = Math.max(cols, floor);
        continue;
      }
      const lo = Math.min(...op.qs), hi = Math.max(...op.qs);
      let col = floor;
      for (let q = lo; q <= hi; q++) col = Math.max(col, free[q]);
      for (let q = lo; q <= hi; q++) free[q] = col + 1;
      op.col = col;
      cols = Math.max(cols, col + 1);
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
      const hasIn = Object.keys(c.ins).length > 0, hasOut = Object.keys(c.outs).length > 0;
      const PADL = hasIn ? 96 * scale : 24 * scale, PADR = hasOut ? 96 * scale : 24 * scale;
      const W = PADL + c.cols * COL + PADR, H = c.n * ROW;
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

      const mode = b.stepwise || 'none';
      const ops = gateOps(c);
      ops.forEach((op, i) => {
        const g = document.createElementNS(NS, 'g');
        svg.appendChild(g);
        const parts = [g];
        const gateBox = (q0, q1, tex, cls) => {
          const d = document.createElement('div');
          d.className = 'qs-gate ' + (cls || '');
          d.style.left = x(op.col) - BOX / 2 + 'px';
          d.style.top = y(q0) - BOX / 2 + 'px';
          d.style.width = BOX + 'px';
          d.style.height = y(q1) - y(q0) + BOX + 'px';
          d.innerHTML = tex !== null ? QS.tex(tex, false) : '';
          box.appendChild(d);
          parts.push(d);
        };
        const X = x(op.col);
        if (op.kind === 'gate') gateBox(op.qs[0], op.qs[0], op.gate);
        else if (op.kind === 'multi') gateBox(op.lo, op.hi, op.gate, 'qs-gate-multi');
        else if (op.kind === 'meas') {
          gateBox(op.qs[0], op.qs[0], null, 'qs-gate-meas');
          parts[parts.length - 1].innerHTML =
            '<svg viewBox="0 0 44 44"><path d="M9 31 A13 13 0 0 1 35 31" fill="none" stroke="currentColor" stroke-width="2.4"/><line x1="22" y1="31" x2="32" y2="15" stroke="currentColor" stroke-width="2.4"/></svg>';
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
          } else if (op.gate === '*') circle(g, X, y(op.target), 7 * scale, 'dot');
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
        if (mode !== 'none') {
          const k = mode === 'column' ? op.col : i;
          for (const p of parts) {
            if (p.dataset) p.dataset.step = (b.step || 0) + k;
            else p.setAttribute('data-step', (b.step || 0) + k);
          }
        }
      });
    },
  };
})();

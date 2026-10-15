/* 封面插画：IBM 讲义拼贴风格，元素为 量子线路 / 态矢量 / 量子比特（Bloch 球）/ FFT 蝶形图 / 量子波动与相位。
 * 颜色全部取自 --accent，换主题色时插画自动跟着变。 */
(function () {
  'use strict';
  const QS = (window.QS = window.QS || {});

  QS.coverArt = function () {
    const A = 'var(--accent)';
    const L = 'color-mix(in srgb, var(--accent) 45%, white)';
    const P = 'color-mix(in srgb, var(--accent) 18%, white)';
    const D = 'color-mix(in srgb, var(--accent) 70%, black)';
    const INK = '#161616', G1 = '#e0e0e0', G2 = '#c6c6c6', G3 = '#8d8d8d';
    const s = [];
    const r = (x, y, w, h, f, extra) => s.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${f}" ${extra || ''}/>`);
    const c = (x, y, rr, f, extra) => s.push(`<circle cx="${x}" cy="${y}" r="${rr}" fill="${f}" ${extra || ''}/>`);
    const l = (x1, y1, x2, y2, st, w, extra) => s.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${st}" stroke-width="${w}" ${extra || ''}/>`);
    const t = (x, y, txt, size, f, extra) => s.push(`<text x="${x}" y="${y}" font-size="${size}" fill="${f}" font-family="KaTeX_Main, 'Times New Roman', serif" ${extra || ''}>${txt}</text>`);

    s.push(`<defs>
      <clipPath id="qsWaveClip"><rect x="0" y="392" width="182" height="208"/></clipPath>
      <clipPath id="qsArch"><path d="M196 600 V262 A122 122 0 0 1 440 262 V600 Z"/></clipPath>
    </defs>`);

    /* 1 量子线路（左上） */
    r(0, 0, 292, 112, G1);
    [26, 56, 86].forEach((y) => l(10, y, 282, y, G2, 5));
    const sq = (x, y) => r(x - 10, y - 10, 20, 20, A);
    const ctl = (x, y1, y2) => { l(x, y1, x, y2, L, 3); c(x, y1, 6, INK); c(x, y2, 11, L); l(x - 6, y2, x + 6, y2, '#fff', 2.5); l(x, y2 - 6, x, y2 + 6, '#fff', 2.5); };
    sq(32, 26); t(26, 32, 'H', 16, '#fff', 'font-style="normal"');
    ctl(74, 56, 26); sq(116, 86); sq(116, 56); ctl(158, 86, 56); sq(200, 26); ctl(238, 26, 86); sq(270, 56);

    /* 2 比特寄存器方格（右上，深色） */
    r(452, 0, 148, 250, INK);
    const bits = '1011001110010110100111010110001011100101';
    for (let i = 0; i < 8; i++) for (let j = 0; j < 5; j++) {
      const on = bits[(i * 5 + j) % bits.length] === '1';
      r(466 + j * 26, 14 + i * 28, 18, 18, on ? A : '#393939');
    }

    /* 3 顶部中间：蓝色坡道 + 管道 */
    s.push(`<path d="M300 0 H440 V150 H392 V48 H300 Z" fill="${P}"/>`);
    s.push(`<path d="M300 112 L392 48 V150 H300 Z" fill="${A}"/>`);
    r(410, 0, 12, 150, A);

    /* 4 态矢量（左中） */
    r(0, 122, 186, 260, '#fff');
    t(16, 162, '|<tspan font-style="italic">ψ</tspan>⟩', 30, INK);
    const amps = [0.9, 0.35, 0.6, 0.2, 0.75, 0.45, 0.3, 0.55];
    s.push(`<path d="M56 186 q-12 0 -12 12 v152 q0 12 12 12" fill="none" stroke="${INK}" stroke-width="2.5"/>`);
    s.push(`<path d="M168 186 q12 0 12 12 v152 q0 12 -12 12" fill="none" stroke="${INK}" stroke-width="2.5"/>`);
    amps.forEach((a, i) => {
      const y = 196 + i * 20;
      r(62, y - 5, 72 * a, 10, i % 2 ? L : A);
      const ang = (i * Math.PI) / 4;
      c(156, y, 7, 'none', `stroke="${G3}" stroke-width="1.5"`);
      l(156, y, 156 + 7 * Math.cos(ang), y - 7 * Math.sin(ang), INK, 2, 'stroke-linecap="round"');
    });

    /* 5 中央拱门 + Bloch 球（量子比特） */
    s.push(`<path d="M196 600 V262 A122 122 0 0 1 440 262 V600 Z" fill="${G1}"/>`);
    s.push(`<g clip-path="url(#qsArch)">`);
    r(196, 430, 244, 170, G2);
    s.push(`</g>`);
    const cx = 318, cy = 290, R = 92;
    c(cx, cy, R, '#fff', `stroke="${INK}" stroke-width="2.5"`);
    s.push(`<path d="M${cx - R} ${cy} A${R} 28 0 0 0 ${cx + R} ${cy}" fill="none" stroke="${INK}" stroke-width="1.8"/>`);
    s.push(`<path d="M${cx - R} ${cy} A${R} 28 0 0 1 ${cx + R} ${cy}" fill="none" stroke="${G3}" stroke-width="1.5" stroke-dasharray="5 5"/>`);
    l(cx, cy - R - 10, cx, cy + R + 10, G3, 1.5, 'stroke-dasharray="4 4"');
    const vx = cx + 54, vy = cy - 58;
    l(cx, cy, vx, vy, A, 4, 'stroke-linecap="round"');
    s.push(`<path d="M${cx} ${cy} L${vx} ${vy}" stroke="none"/>`);
    s.push(`<path d="M${vx} ${vy + 26} L${cx} ${cy} " fill="none" stroke="${G3}" stroke-width="1.2" stroke-dasharray="3 4"/>`);
    c(vx, vy, 9, A);
    c(cx, cy, 4, INK);
    t(cx - 14, cy - R - 16, '|0⟩', 22, INK);
    t(cx - 14, cy + R + 32, '|1⟩', 22, INK);

    /* 6 FFT 蝶形图（右中） */
    r(452, 262, 148, 168, '#fff');
    const fx = [468, 508, 548, 588], fy = (i) => 278 + i * 19.5;
    for (let st = 0; st < 3; st++) {
      const span = 4 >> st;
      for (let i = 0; i < 8; i++) {
        const j = i ^ span;
        l(fx[st], fy(i), fx[st + 1], fy(i), G2, 1.5);
        l(fx[st], fy(i), fx[st + 1], fy(j), st === 1 ? A : INK, st === 1 ? 2 : 1.2);
      }
    }
    for (const x of fx) for (let i = 0; i < 8; i++) c(x, fy(i), 3.6, x === fx[3] ? A : INK);

    /* 7 量子波动：同心圆弧（左下） */
    r(0, 392, 182, 208, '#fff');
    s.push(`<g clip-path="url(#qsWaveClip)">`);
    for (let k = 13; k >= 1; k--) c(0, 600, k * 18, k % 3 === 0 ? INK : k % 3 === 1 ? A : '#fff');
    s.push(`</g>`);

    /* 8 相位时钟 + 概率振幅波（拱门下方） */
    const phases = [0, 0.25, 0.5, 0.75];
    phases.forEach((ph, i) => {
      const x = 232 + i * 58, y = 470, rr = 20;
      c(x, y, rr, '#fff', `stroke="${INK}" stroke-width="2"`);
      const a = Math.PI / 2 - ph * 2 * Math.PI;
      l(x, y, x + 15 * Math.cos(a), y - 15 * Math.sin(a), A, 3.5, 'stroke-linecap="round"');
      c(x, y, 3, INK);
    });
    let wave = 'M206 540';
    for (let x = 206; x <= 430; x += 4) wave += ` L${x} ${540 - 22 * Math.sin((x - 206) / 18) * Math.exp(-(((x - 318) / 70) ** 2))}`;
    s.push(`<path d="${wave}" fill="none" stroke="${A}" stroke-width="3"/>`);
    for (let x = 214; x <= 430; x += 18) c(x, 540 - 22 * Math.sin((x - 206) / 18) * Math.exp(-(((x - 318) / 70) ** 2)), 3, INK);

    /* 9 台阶（右下） */
    s.push(`<path d="M452 600 V442 H600 V600 Z" fill="${P}"/>`);
    s.push(`<path d="M600 442 V600 H452 V572 H490 V542 H526 V512 H562 V478 H600 Z" fill="${INK}"/>`);
    c(500, 486, 16, A);

    /* 10 点缀：只用纯色扁平圆点，不用渐变 */
    c(446, 172, 9, A);
    c(214, 220, 7, INK);
    c(452, 448, 6, A);

    return `<svg viewBox="0 0 600 600" xmlns="http://www.w3.org/2000/svg">${s.join('')}</svg>`;
  };
})();

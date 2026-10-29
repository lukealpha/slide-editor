#!/usr/bin/env node
/* npm run check: validate deck.json — theme, structure, IDs, KaTeX parsing, animation components and images */
'use strict';
const fs = require('fs');
const path = require('path');
const { ROOT, SLIDE, resolve, load, animationFiles, readDeck, useTheme } = require('./engine');

const errors = [], warns = [];
let deck;
try {
  deck = readDeck();
} catch (e) {
  console.error('  ✗ deck.json is not valid JSON: ' + e.message);
  process.exit(1);
}
const katex = require(path.join(ROOT, 'vendor/katex/katex.min.js'));
const QS = load('engine/i18n.js', 'engine/core.js', 'engine/circuit.js');
QS.migrate(deck);
const theme = useTheme(deck);

const animIds = new Set();
for (const f of animationFiles()) {
  const src = fs.readFileSync(path.join(SLIDE, 'animations', f), 'utf8');
  for (const m of src.matchAll(/registerAnimation\(\{\s*id:\s*['"]([^'"]+)['"]/g)) animIds.add(m[1]);
}

const ID_RE = { S: /^S-[2-9A-HJ-NP-Z]{3}$/, B: /^B-[2-9A-HJ-NP-Z]{3}$/, T: /^T-[2-9A-HJ-NP-Z]{3}$/ };
const seen = new Map();
function checkId(id, kind, where) {
  if (!id) return errors.push(`${where}: missing id`);
  if (!ID_RE[kind].test(id)) warns.push(`${where}: ID ${id} is malformed (expected ${kind}-XXX)`);
  if (seen.has(id)) errors.push(`${where}: ID ${id} duplicates ${seen.get(id)}`);
  seen.set(id, where);
}
function tex(src, display, where) {
  try {
    katex.renderToString(src, QS.katexOptions ? QS.katexOptions(display) : { displayMode: display, throwOnError: true, strict: false });
  } catch (e) {
    errors.push(`${where}: formula error ${e.message.replace(/^KaTeX parse error: /, '')}\n      ${src}`);
  }
}
function inline(s, where) {
  for (const m of String(s || '').matchAll(/\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g)) tex(m[1] !== undefined ? m[1] : m[2], m[1] !== undefined, where);
}

// 主题：内容里有主题不支持的页面类型、内容块、字号时报错（导出也会拒绝）；主题还可以有自己的检查
if (!(deck.meta && deck.meta.theme)) warns.push(`meta.theme is not set; using the default theme ${theme.id}`);
for (const e of QS.themeIssues(deck)) errors.push(e);
if (theme.check) theme.check(deck, { error: (m) => errors.push(m), warn: (m) => warns.push(m) });
const TEXT_KEYS = new Set(['title', 'notes']);
for (const k of Object.values(theme.slideTypes)) for (const key of k.textKeys || []) TEXT_KEYS.add(key);
const usedTodoFiles = new Set();
(deck.slides || []).forEach((s, i) => {
  const w = `Slide ${i + 1} ${s.id || ''}`;
  checkId(s.id, 'S', w);
  for (const k of TEXT_KEYS) inline(s[k], `${w} ${k}`);
  for (const td of s.todos || []) {
    const tw = `${w} | ${td.id || '?'} TODO`;
    checkId(td.id, 'T', tw);
    if (td.block && !(s.blocks || []).some((b) => b.id === td.block)) warns.push(`${tw}: pinned block ${td.block} no longer exists (shown at its last free position)`);
    warns.push(`${tw}${td.block ? ' on ' + td.block : ` at (${Math.round(td.x || 0)}, ${Math.round(td.y || 0)})`}: ${String(td.text || '').replace(/\s+/g, ' ')}` +
      ((td.files || []).length ? `  [attachments: ${td.files.join(', ')}]` : ''));
    for (const f of td.files || []) {
      usedTodoFiles.add(f);
      if (!fs.existsSync(resolve(f))) errors.push(`${tw}: attachment not found: ${f}`);
    }
  }
  if (s.type !== 'content') return;
  if (!Array.isArray(s.blocks)) return errors.push(`${w}: missing blocks array`);
  s.blocks.forEach((b) => {
    const bw = `${w} | ${b.id || '?'} ${b.type}`;
    checkId(b.id, 'B', bw);
    if (!QS.BLOCK_TYPES[b.type]) return errors.push(`${bw}: unknown block type`);
    if (!theme.blocks.includes(b.type)) return;
    if (b.step !== undefined && !(Number.isInteger(b.step) && b.step >= 0)) errors.push(`${bw}: step must be a non-negative integer`);
    if (b.until !== undefined && !(Number.isInteger(b.until) && b.until > (b.step || 0))) errors.push(`${bw}: until must be an integer greater than step (${b.step || 0})`);
    if (b.reserve !== undefined && typeof b.reserve !== 'boolean') errors.push(`${bw}: reserve must be true or false`);
    if (b.delay !== undefined && !(typeof b.delay === 'number' && b.delay >= 0)) errors.push(`${bw}: delay must be a non-negative number of milliseconds`);
    if (b.col !== undefined && !['left', 'right', 'full'].includes(b.col)) errors.push(`${bw}: col must be left/right/full`);
    for (const k of ['text', 'items', 'body', 'label', 'caption']) inline(b[k], bw);
    if (b.type === 'formula') QS.splitSeq(b.latex).forEach((t) => tex(t, true, bw));
    if (b.type === 'table') {
      const rows = QS.tableRows(b.rows);
      const ws = QS.tableWidths(b.widths);
      if (b.widths && !ws.length) warns.push(`${bw}: widths "${b.widths}" has no positive numbers; ignored`);
      if (ws.reduce((x, y) => x + y, 0) > 100.5) warns.push(`${bw}: column widths add up to more than 100%`);
      rows.forEach((r) => r.forEach((c) => inline(c, bw)));
      const n = new Set(rows.map((r) => r.length));
      if (n.size > 1) warns.push(`${bw}: rows have different numbers of cells (${[...n].join(', ')}); missing cells are left empty`);
    }
    if (b.type === 'circuit') {
      const c = QS.circuit.parse(b.spec);
      Object.values(c.ins).concat(Object.values(c.outs)).forEach((t) => tex(t, false, bw + ' label'));
      Object.values(c.cins || {}).forEach((t) => tex(t, false, bw + ' label'));
      c.ops.forEach((op) => {
        if (!op.gate || (op.kind === 'ctrl' && op.gate === 'X')) return;
        if (op.gate[0] === '*') { if (op.gate.length > 1) tex(op.gate.slice(1), false, bw + ' angle'); }
        else tex(op.gate, false, bw + ' gate');
      });
      // 拼错的关键字（如 Qubits）或比特编号超出范围的门会被静默丢掉：数一数
      const lines = String(b.spec || '').split('\n').map((l) => l.replace(/#.*$/, '').trim()).filter(Boolean);
      const gateLines = lines.filter((l) => !/^(qubits|cbits|in|out|cin)\s/.test(l));
      if (c.ops.length < gateLines.length) warns.push(`${bw}: ${gateLines.length - c.ops.length} circuit line(s) dropped (misspelled keyword, or a qubit/cbit index out of range)`);
    }
    if (b.type === 'anim') {
      if (!b.component) warns.push(`${bw}: no animation component selected`);
      else if (!animIds.has(b.component)) errors.push(`${bw}: animation component not found: ${b.component}`);
    }
    if (b.stageSteps !== undefined) {
      const ss = b.stageSteps;
      if (b.type !== 'anim' && !(b.type === 'table' && b.stepwise)) warns.push(`${bw}: stageSteps only applies to animations and row-by-row tables; ignored`);
      else if (!Array.isArray(ss) || !ss.every(Number.isInteger)) errors.push(`${bw}: stageSteps must be an array of integers`);
      else if (ss.some((v, i) => v <= (i ? ss[i - 1] : b.step || 0))) warns.push(`${bw}: stageSteps ${JSON.stringify(ss)} should increase strictly after step ${b.step || 0}; out-of-order entries are pushed later when played`);
    }
    if (b.type === 'image') {
      if (!b.src) warns.push(`${bw}: no image selected`);
      else if (!fs.existsSync(resolve(b.src))) errors.push(`${bw}: image not found: ${b.src}`);
    }
  });
});

// todo/ 里没有被任何 TODO 引用的附件（TODO 处理完或附件被移除后留下的）
let orphans = [];
try {
  orphans = fs.readdirSync(path.join(SLIDE, 'todo')).filter((f) => !f.startsWith('.')).map((f) => 'todo/' + f).filter((f) => !usedTodoFiles.has(f));
} catch (e) {}
for (const f of orphans) warns.push(`unused TODO attachment (safe to delete): ${f}`);

const n = (deck.slides || []).length;
for (const e of errors) console.log('  ✗ ' + e);
for (const e of warns) console.log('  · ' + e);
console.log(`\n  ${path.relative(process.cwd(), SLIDE) || '.'} (theme ${theme.id}): ${n} slides, ${errors.length} error(s), ${warns.length} note(s).${errors.length ? '' : ' ✓'}`);
process.exit(errors.length ? 1 : 0);

#!/usr/bin/env node
/* npm run check: validate deck.json — structure, IDs, KaTeX parsing, animation components and images */
'use strict';
const fs = require('fs');
const path = require('path');
const { ROOT, SLIDE, resolve, load, animationFiles, readDeck } = require('./engine');

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
    katex.renderToString(src, { displayMode: display, throwOnError: true, strict: false });
  } catch (e) {
    errors.push(`${where}: formula error ${e.message.replace(/^KaTeX parse error: /, '')}\n      ${src}`);
  }
}
function inline(s, where) {
  for (const m of String(s || '').matchAll(/\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g)) tex(m[1] !== undefined ? m[1] : m[2], m[1] !== undefined, where);
}

const TYPES = { cover: 1, section: 1, content: 1 };
const usedTodoFiles = new Set();
(deck.slides || []).forEach((s, i) => {
  const w = `Slide ${i + 1} ${s.id || ''}`;
  checkId(s.id, 'S', w);
  if (!TYPES[s.type]) errors.push(`${w}: unknown slide type ${s.type}`);
  for (const k of ['title', 'titleAlt', 'subtitle', 'author', 'footer', 'notes']) inline(s[k], `${w} ${k}`);
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
    if (b.step !== undefined && !(Number.isInteger(b.step) && b.step >= 0)) errors.push(`${bw}: step must be a non-negative integer`);
    if (b.col !== undefined && b.col !== 'left' && b.col !== 'right') errors.push(`${bw}: col must be left/right`);
    for (const k of ['text', 'items', 'body', 'label', 'caption']) inline(b[k], bw);
    if (b.type === 'formula') QS.splitSeq(b.latex).forEach((t) => tex(t, true, bw));
    if (b.type === 'circuit') {
      const c = QS.circuit.parse(b.spec);
      Object.values(c.ins).concat(Object.values(c.outs)).forEach((t) => tex(t, false, bw + ' label'));
      c.ops.forEach((op) => { if (op.gate && op.gate !== '*' && !(op.kind === 'ctrl' && op.gate === 'X')) tex(op.gate, false, bw + ' gate'); });
    }
    if (b.type === 'anim') {
      if (!b.component) warns.push(`${bw}: no animation component selected`);
      else if (!animIds.has(b.component)) errors.push(`${bw}: animation component not found: ${b.component}`);
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
console.log(`\n  ${path.relative(process.cwd(), SLIDE) || '.'}: ${n} slides, ${errors.length} error(s), ${warns.length} note(s).${errors.length ? '' : ' ✓'}`);
process.exit(errors.length ? 1 : 0);

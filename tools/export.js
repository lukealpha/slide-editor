#!/usr/bin/env node
/* npm run export: export deck.json to a single-file HTML in export/ without opening the editor */
'use strict';
const fs = require('fs');
const path = require('path');
const { SLIDE, resolve, load, animationFiles, readDeck } = require('./engine');

(async () => {
  const QS = load('engine/i18n.js', 'engine/core.js', 'engine/fontsubset.js', 'engine/export.js');
  const io = {
    text: async (f) => fs.readFileSync(resolve(f), 'utf8'),
    bytes: async (f) => new Uint8Array(fs.readFileSync(resolve(f))),
    dataURL: async (data, mime) => `data:${mime};base64,${Buffer.from(data).toString('base64')}`,
    animationFiles,
  };
  const deck = readDeck();
  const { html, name } = await QS.exportDeck(deck, (msg) => console.log('  ' + msg), io);
  fs.mkdirSync(path.join(SLIDE, 'export'), { recursive: true });
  const dest = path.join(SLIDE, 'export', name);
  fs.writeFileSync(dest, html);
  const todos = deck.slides.reduce((a, s) => a + (s.blocks || []).filter((b) => b.type === 'todo').length, 0);
  console.log(`\n  ✓ Exported: ${path.relative(process.cwd(), dest)} (${(fs.statSync(dest).size / 1048576).toFixed(2)} MB)`);
  if (todos) console.log(`  ⚠ ${todos} TODO block(s) still unhandled (hidden when presenting)`);
})().catch((e) => {
  console.error('\n  ✗ Export failed:', e.message);
  process.exit(1);
});

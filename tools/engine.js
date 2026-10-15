/* 在 Node 里载入浏览器端引擎代码（core / circuit / fontsubset / export），供命令行工具复用 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { ROOT, slideDir } = require('./slide');

const SLIDE = slideDir();
globalThis.window = globalThis;

function load(...files) {
  for (const f of files) vm.runInThisContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), { filename: f });
  return globalThis.QS;
}

/** 与服务器相同的路径规则：幻灯片内容取自幻灯片文件夹，其余取自编辑器目录 */
function resolve(rel) {
  const inSlide = rel === 'deck.json' || /^(assets|animations|export)\//.test(rel);
  return path.join(inSlide ? SLIDE : ROOT, rel);
}

function animationFiles() {
  try {
    return fs.readdirSync(path.join(SLIDE, 'animations')).filter((f) => f.endsWith('.js') && !f.startsWith('_')).sort();
  } catch (e) {
    return [];
  }
}

function readDeck() {
  const file = path.join(SLIDE, 'deck.json');
  if (!fs.existsSync(file)) {
    console.error(`  ✗ No deck.json in ${SLIDE} (run npm run dev once to create a blank slide, or pass --slide <folder>)`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

module.exports = { ROOT, SLIDE, resolve, load, animationFiles, readDeck };

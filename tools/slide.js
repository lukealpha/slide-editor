/* 定位当前编辑的幻灯片文件夹（deck.json + assets/ + animations/ + export/）。
 * 默认是编辑器目录下的 slide/；也可以用 --slide <路径> 或环境变量 SLIDE_DIR 指定其他位置。
 * 文件夹不存在或没有 deck.json 时，会创建一份只有封面的新幻灯片。 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function slideDir(argv = process.argv) {
  let p = process.env.SLIDE_DIR || '';
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--slide' && argv[i + 1]) p = argv[i + 1];
    else if (argv[i].startsWith('--slide=')) p = argv[i].slice(8);
  }
  return p ? path.resolve(process.cwd(), p) : path.join(ROOT, 'slide');
}

const STARTER = {
  meta: { title: 'Untitled presentation', accent: '#5588F6', pageNumbers: true },
  slides: [
    { id: 'S-CVR', type: 'cover', title: 'Untitled presentation', author: '', subtitle: '', footer: '', notes: '' },
    { id: 'S-2ND', type: 'content', title: 'New slide', layout: 'single', split: 55, notes: '', blocks: [] },
  ],
};

/** 确保幻灯片文件夹可用；新建时返回 true */
function ensureSlide(dir) {
  const deck = path.join(dir, 'deck.json');
  for (const sub of ['', 'assets', 'animations']) fs.mkdirSync(path.join(dir, sub), { recursive: true });
  if (fs.existsSync(deck)) return false;
  fs.writeFileSync(deck, JSON.stringify(STARTER, null, 2) + '\n');
  return true;
}

module.exports = { ROOT, slideDir, ensureSlide };

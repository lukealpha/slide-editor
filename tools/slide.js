/* 定位当前编辑的幻灯片文件夹（deck.json + assets/ + animations/ + export/）。
 * 默认是编辑器目录下的 slide/；也可以用 --slide <路径> 或环境变量 SLIDE_DIR 指定其他位置。
 * 文件夹不存在或没有 deck.json 时，会创建一份只有封面和一张空内容页的新幻灯片；
 * 主题用 --theme <id> 指定（themes/ 下的文件夹名，默认 ibm-quantum），只在新建时起作用。 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function argValue(name, argv = process.argv) {
  let v = '';
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--' + name && argv[i + 1]) v = argv[i + 1];
    else if (argv[i].startsWith('--' + name + '=')) v = argv[i].slice(name.length + 3);
  }
  return v;
}

function slideDir(argv = process.argv) {
  const p = argValue('slide', argv) || process.env.SLIDE_DIR || '';
  return p ? path.resolve(process.cwd(), p) : path.join(ROOT, 'slide');
}

const DEFAULT_THEME = 'ibm-quantum';
const themeExists = (id) => /^[a-z0-9][a-z0-9-]*$/.test(id) && fs.existsSync(path.join(ROOT, 'themes', id, 'theme.js'));

const starter = (theme) => ({
  meta: { title: 'Untitled presentation', theme },
  slides: [
    { id: 'S-CVR', type: 'cover', title: 'Untitled presentation', author: '', subtitle: '', footer: '', notes: '' },
    { id: 'S-2ND', type: 'content', title: 'New slide', layout: 'single', split: 55, notes: '', blocks: [] },
  ],
});

/** 确保幻灯片文件夹可用。返回 { created, note }：新建时 created 为 true；
 *  已有幻灯片又给了不同的 --theme 时，note 说明这个参数被忽略（主题只能手动改 deck.json）。 */
function ensureSlide(dir, argv = process.argv) {
  const deck = path.join(dir, 'deck.json');
  const want = argValue('theme', argv);
  if (want && !themeExists(want)) throw new Error(`Theme "${want}" not found (expected themes/${want}/theme.js)`);
  for (const sub of ['', 'assets', 'animations']) fs.mkdirSync(path.join(dir, sub), { recursive: true });
  if (fs.existsSync(deck)) {
    let cur = DEFAULT_THEME;
    try { cur = (JSON.parse(fs.readFileSync(deck, 'utf8')).meta || {}).theme || DEFAULT_THEME; } catch (e) {}
    return { created: false, note: want && want !== cur ? `This deck uses the "${cur}" theme; --theme ${want} is ignored (edit meta.theme in deck.json to change it)` : '' };
  }
  // 主题可以自带新幻灯片的初始内容（themes/<id>/starter.json），没有就用通用的封面 + 空内容页
  const theme = want || DEFAULT_THEME;
  const own = path.join(ROOT, 'themes', theme, 'starter.json');
  const data = fs.existsSync(own) ? JSON.parse(fs.readFileSync(own, 'utf8')) : starter(theme);
  data.meta = Object.assign({ theme }, data.meta, { theme });
  fs.writeFileSync(deck, JSON.stringify(data, null, 2) + '\n');
  return { created: true, note: '' };
}

module.exports = { ROOT, slideDir, ensureSlide, argValue };

#!/usr/bin/env node
/* 幻灯片编辑器的本地服务器。只用 Node 标准库，只监听本机 127.0.0.1。
 *   npm run dev                      启动并自动打开浏览器（编辑 ./slide）
 *   npm run serve                    只启动，不打开浏览器
 *   npm run dev -- --slide <路径>     编辑其他位置的幻灯片文件夹
 *   npm run dev -- --port <端口>      指定端口（默认 8765，被占用时依次往后试）
 *   npm run dev -- --theme <主题>     新建幻灯片时用的主题（themes/ 下的文件夹名，默认 ibm-quantum；已有的幻灯片不受影响）
 * 编辑器自身的文件（index.html、engine/、vendor/…）从本目录提供；
 * deck.json、assets/、animations/、export/ 来自幻灯片文件夹。
 */
'use strict';
const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { spawn, execFile } = require('child_process');
const { slideDir, ensureSlide } = require('./tools/slide');

const ROOT = __dirname;
const SLIDE = slideDir();
let ENSURED;
try {
  ENSURED = ensureSlide(SLIDE);
} catch (e) {
  console.error('  ✗ ' + e.message);
  process.exit(1);
}
const CREATED = ENSURED.created;
const DECK = path.join(SLIDE, 'deck.json');
const ASSETS = path.join(SLIDE, 'assets');
const EXPORT = path.join(SLIDE, 'export');
const ANIMS = path.join(SLIDE, 'animations');
const TODO_FILES = path.join(SLIDE, 'todo'); // TODO 标注的图片附件（只给 Claude 看，不导出）
const GIT_LOG_LIMIT = 300;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.woff': 'font/woff', '.woff2': 'font/woff2', '.otf': 'font/otf', '.ttf': 'font/ttf',
  '.wasm': 'application/wasm', '.md': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
};

function deckVersion() {
  try {
    const st = fs.statSync(DECK, { bigint: true });
    return `${st.mtimeNs}-${st.size}`;
  } catch (e) {
    return 'none';
  }
}

function safeName(name) {
  name = path.basename(decodeURIComponent(name || ''));
  name = name.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').replace(/^[. ]+|[. ]+$/g, '');
  return name || 'file';
}

function listDir(dir, filter) {
  try {
    return fs.readdirSync(dir).filter(filter).sort();
  } catch (e) {
    return [];
  }
}

function sendJSON(res, obj, status = 200) {
  const body = Buffer.from(JSON.stringify(obj));
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': body.length, 'Cache-Control': 'no-store' });
  res.end(body);
}

function readBody(req) {
  return new Promise((ok, fail) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => ok(Buffer.concat(chunks)));
    req.on('error', fail);
  });
}

/** URL → 文件：幻灯片内容走幻灯片文件夹，其余走编辑器目录 */
function resolveFile(pathname) {
  if (pathname === '/') pathname = '/index.html';
  const rel = decodeURIComponent(pathname).replace(/^\/+/, '');
  const inSlide = rel === 'deck.json' || /^(assets|animations|export|todo)\//.test(rel);
  const base = inSlide ? SLIDE : ROOT;
  const file = path.resolve(base, rel);
  return file.startsWith(base + path.sep) ? file : null;
}

async function serveStatic(req, res, pathname) {
  const file = resolveFile(pathname);
  if (!file) return sendJSON(res, { error: 'forbidden' }, 403);
  try {
    const st = await fsp.stat(file);
    if (!st.isFile()) throw new Error('not file');
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': 'no-store',
    });
    fs.createReadStream(file).pipe(res);
  } catch (e) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');
  }
}

async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;
  const q = Object.fromEntries(url.searchParams);

  if (req.method === 'GET') {
    if (p === '/api/version') return sendJSON(res, { version: deckVersion() });
    if (p === '/api/animations') return sendJSON(res, listDir(ANIMS, (f) => f.endsWith('.js') && !f.startsWith('_')));
    if (p === '/api/info') return sendJSON(res, { slideDir: SLIDE, slideName: path.basename(SLIDE) });
    if (p === '/api/git') return sendJSON(res, await gitInfo());
    if (p === '/api/git/show') return sendJSON(res, await gitShow(q.hash));
    if (p === '/api/assets') return sendJSON(res, listDir(ASSETS, (f) => !f.startsWith('.')));
    return serveStatic(req, res, p);
  }

  if (req.method !== 'POST') return sendJSON(res, { error: 'method' }, 405);
  const origin = req.headers.origin;
  if (origin && !origin.endsWith('//' + req.headers.host)) return sendJSON(res, { error: 'forbidden' }, 403);

  try {
    if (p === '/api/save') {
      const data = await readBody(req);
      JSON.parse(data.toString('utf8')); // 校验
      if (q.base && q.base !== deckVersion() && q.force !== '1') return sendJSON(res, { error: 'conflict', version: deckVersion() }, 409);
      const tmp = DECK + '.tmp';
      fs.writeFileSync(tmp, data);
      fs.renameSync(tmp, DECK);
      return sendJSON(res, { ok: true, version: deckVersion() });
    }
    if (p === '/api/upload') {
      // kind=todo：TODO 附件放进 todo/；否则是幻灯片素材，放进 assets/
      const isTodo = q.kind === 'todo';
      const dir = isTodo ? TODO_FILES : ASSETS;
      fs.mkdirSync(dir, { recursive: true });
      const name = safeName(q.name);
      const ext = path.extname(name), stem = name.slice(0, name.length - ext.length);
      let dest = path.join(dir, name);
      for (let i = 1; fs.existsSync(dest); i++) dest = path.join(dir, `${stem}-${i}${ext}`);
      fs.writeFileSync(dest, await readBody(req));
      return sendJSON(res, { ok: true, path: (isTodo ? 'todo/' : 'assets/') + path.basename(dest) });
    }
    if (p === '/api/export') {
      fs.mkdirSync(EXPORT, { recursive: true });
      const dest = path.join(EXPORT, safeName(q.name || '演示.html'));
      fs.writeFileSync(dest, await readBody(req));
      return sendJSON(res, { ok: true, path: dest, size: fs.statSync(dest).size });
    }
    if (p === '/api/reveal') {
      const target = path.resolve(SLIDE, decodeURIComponent(q.path || ''));
      if (target === SLIDE || target.startsWith(SLIDE + path.sep)) reveal(target);
      return sendJSON(res, { ok: true });
    }
  } catch (e) {
    return sendJSON(res, { error: String(e.message || e) }, 500);
  }
  return sendJSON(res, { error: 'unknown api' }, 404);
}

/* ---------- 只读的 git 信息（幻灯片文件夹自己的仓库；编辑器从不修改仓库） ---------- */
function git(args) {
  return new Promise((ok) =>
    execFile('git', ['-c', 'core.quotepath=off', ...args], {
      cwd: SLIDE, timeout: 8000, maxBuffer: 16 << 20,
      env: Object.assign({}, process.env, { GIT_OPTIONAL_LOCKS: '0', LC_ALL: 'C' }),
    }, (err, out, errOut) => ok({ err, out: out || '', errOut: errOut || '' }))
  );
}

async function gitInfo() {
  const ver = await git(['--version']);
  if (ver.err) return { available: false };
  const top = await git(['rev-parse', '--show-toplevel']);
  // 幻灯片文件夹必须是仓库根目录；如果只是被外层仓库包含（例如编辑器自己的仓库），视为"没有仓库"
  if (top.err || fs.realpathSync(top.out.trim()) !== fs.realpathSync(SLIDE)) return { available: true, repo: false, dir: SLIDE };
  const [branchR, headR, status] = await Promise.all([
    git(['symbolic-ref', '--short', '-q', 'HEAD']),
    git(['rev-parse', '-q', '--verify', 'HEAD']),
    git(['status', '--porcelain=v1', '-uall']),
  ]);
  const branch = branchR.out.trim() || null;
  const head = headR.err ? null : headR.out.trim();
  const dirty = status.out.split('\n').filter(Boolean).map((l) => ({ code: l.slice(0, 2), path: l.slice(3) }));
  let commits = [];
  if (head) {
    const log = await git(['log', '--branches', '--tags', '--remotes', 'HEAD', '--date-order', '-n', String(GIT_LOG_LIMIT + 1),
      '--format=%H%x1f%P%x1f%D%x1f%an%x1f%at%x1f%s%x1e']);
    commits = log.out.split('\x1e').map((r) => r.replace(/^\n/, '')).filter(Boolean).map((r) => {
      const [hash, parents, refs, author, time, subject] = r.split('\x1f');
      return { hash, parents: parents ? parents.split(' ') : [], refs: refs ? refs.split(', ') : [], author, time: +time, subject };
    });
  }
  const truncated = commits.length > GIT_LOG_LIMIT;
  return { available: true, repo: true, dir: SLIDE, branch, head, dirty, commits: commits.slice(0, GIT_LOG_LIMIT), truncated };
}

async function gitShow(hash) {
  if (!/^[0-9a-f]{4,64}$/.test(hash || '')) return { error: 'bad hash' };
  const r = await git(['show', '--stat=100', '--format=%H%n%an <%ae>%n%ai%n%n%B', hash]);
  return r.err ? { error: r.errOut.trim() } : { text: r.out };
}

function reveal(target) {
  if (process.platform === 'darwin') spawn('open', ['-R', target], { stdio: 'ignore' });
  else if (process.platform === 'win32') spawn('explorer', ['/select,', target], { stdio: 'ignore' });
  else spawn('xdg-open', [path.dirname(target)], { stdio: 'ignore' });
}

function openBrowser(url) {
  const cmd = process.platform === 'darwin' ? ['open', [url]] : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : ['xdg-open', [url]];
  try {
    spawn(cmd[0], cmd[1], { stdio: 'ignore', detached: true }).unref();
  } catch (e) {}
}

function listen(port) {
  const server = http.createServer((req, res) =>
    handle(req, res).catch((e) => {
      console.error(e);
      if (!res.headersSent) sendJSON(res, { error: String(e) }, 500);
    })
  );
  server.on('error', (e) => {
    if (e.code === 'EADDRINUSE' && port < 8784 && portArg < 0) listen(port + 1);
    else {
      console.error('Could not start the server:', e.message);
      process.exit(1);
    }
  });
  server.listen(port, '127.0.0.1', () => {
    const url = `http://127.0.0.1:${port}/`;
    console.log(`\n  Slide editor running at ${url}`);
    console.log(`  Slide folder: ${SLIDE}${CREATED ? '  (new — created a blank deck)' : ''}`);
    if (ENSURED.note) console.log(`  · ${ENSURED.note}`);
    console.log(`  Press Ctrl+C to stop.\n`);
    if (!process.argv.includes('--no-open')) openBrowser(url);
  });
}

const portArg = process.argv.indexOf('--port');
listen(portArg > 0 ? +process.argv[portArg + 1] || 8765 : 8765);

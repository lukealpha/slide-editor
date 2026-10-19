/* 导出：把整份演示打包成一个可以双击打开的 HTML 文件（字体子集化、公式字体、图片、动画全部内联） */
(function () {
  'use strict';
  const QS = window.QS;

  const ENGINE_JS = ['engine/i18n.js', 'engine/core.js', 'engine/circuit.js', 'engine/coverart.js', 'engine/player.js'];
  const WEIGHTS = [[300, 'Light'], [400, 'Regular'], [500, 'Medium'], [600, 'SemiBold']];
  // 除文稿内容外始终保留的字符：ASCII、常用标点、希腊字母、常用数学符号
  const EXTRA =
    ' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~' +
    '，。、；：？！“”‘’（）【】《》〈〉…—–·•→←↑↓⇒⇔×÷±≤≥≈≠∞∑∏∫√∂∈∉⊂⊆∪∩∀∃⟨⟩⊗⊕°′″‰％＋－＝' +
    'αβγδεζηθικλμνξοπρστυφχψωΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ' +
    '０１２３４５６７８９一二三四五六七八九十百千万页步骤共第';

  // 文件读取方式：浏览器里走 HTTP，命令行导出（tools/export.js）时传入基于文件系统的实现
  const browserIO = {
    async text(u) {
      const r = await fetch(u + (u.includes('?') ? '&' : '?') + 't=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) throw new Error(QS.t('exp.readFail', { f: u }));
      return r.text();
    },
    async bytes(u) {
      const r = await fetch(u, { cache: 'no-store' });
      if (!r.ok) throw new Error(QS.t('exp.readFail', { f: u }));
      return new Uint8Array(await r.arrayBuffer());
    },
    dataURL: (data, mime) =>
      new Promise((ok, fail) => {
        const fr = new FileReader();
        fr.onload = () => ok(fr.result);
        fr.onerror = fail;
        fr.readAsDataURL(new Blob([data], { type: mime }));
      }),
    animationFiles: () => QS.animationFiles || [],
  };
  const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp' };
  const safeScript = (s) => s.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');

  QS.exportDeck = async function (deck, progress, io) {
    progress = progress || (() => {});
    io = io || browserIO;
    // TODO 标注（以及它们的图片附件）只属于编辑器，不进入导出文件
    deck = JSON.parse(JSON.stringify(deck));
    for (const s of deck.slides) delete s.todos;
    const text = io.text, bytes = io.bytes, dataURL = io.dataURL;
    const animFiles = io.animationFiles().map((f) => 'animations/' + f);

    progress(QS.t('exp.readEngine'));
    const js = {};
    for (const f of ['vendor/katex/katex.min.js'].concat(ENGINE_JS, animFiles)) js[f] = await text(f);
    let katexCss = await text('vendor/katex/katex.min.css');
    let themeCss = await text('engine/theme.css');
    const playerCss = await text('engine/player.css');

    progress(QS.t('exp.mathFonts'));
    const fontUrls = Array.from(new Set(katexCss.match(/url\(fonts\/[^)]+\.woff2\)/g) || []));
    for (const u of fontUrls) {
      const file = u.slice(4, -1);
      katexCss = katexCss.split(u).join('url(' + (await dataURL(await bytes('vendor/katex/' + file), 'font/woff2')) + ')');
    }

    progress(QS.t('exp.chars'));
    let chars = EXTRA + JSON.stringify(deck);
    for (const f of ENGINE_JS.concat(animFiles)) chars += js[f];
    const uniq = Array.from(new Set(Array.from(chars))).join('');

    const wasm = await bytes('vendor/harfbuzz-subset.wasm');
    let faces = '';
    for (const [w, name] of WEIGHTS) {
      progress(QS.t('exp.subset', { w: name, n: Array.from(uniq).length }));
      const woff = await bytes(`vendor/fonts/IBMPlexSansSC-${name}.woff`);
      const sub = await QS.fontSubset.subsetWoff(wasm, woff, uniq);
      faces += `@font-face{font-family:'Plex SC';font-weight:${w};src:url(${await dataURL(sub, 'font/woff')}) format('woff');}\n`;
    }
    // 章节编号在非 Mac 电脑上的后备字体：本机私有的 Futura ND（商业字体，只为自用内嵌 ASCII 子集；文件不存在就跳过）
    try {
      const fnd = await bytes('vendor/fonts/private/FuturaND-Medium.ttf');
      let ascii = '';
      for (let i = 32; i < 127; i++) ascii += String.fromCharCode(i);
      progress(QS.t('exp.subsetFont', { name: 'Futura ND Medium', n: ascii.length }));
      const sub = await QS.fontSubset.subsetWoff(wasm, fnd, ascii);
      faces += `@font-face{font-family:'Futura ND Bundled';font-weight:500;src:url(${await dataURL(sub, 'font/woff')}) format('woff');}\n`;
    } catch (e) {
      console.warn('Futura ND fallback not embedded:', e.message);
    }
    themeCss = themeCss.replace(/@font-face[^}]*\}\s*/g, '');

    progress(QS.t('exp.images'));
    const assets = {};
    const paths = new Set((JSON.stringify(deck).match(/assets\/[^"\\]+/g) || []));
    for (const p of paths) {
      try {
        const ext = (p.split('.').pop() || '').toLowerCase();
        assets[p] = await dataURL(await bytes(p), MIME[ext] || 'application/octet-stream');
      } catch (e) {
        console.warn('Missing image:', p);
      }
    }

    // 图标：编辑器目录下的 favicon.svg，以 data URL 嵌入（导出文件要能单独打开）
    let icon = '';
    try {
      icon = `<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,${encodeURIComponent(await text('favicon.svg'))}">\n`;
    } catch (e) {
      console.warn('Favicon not embedded:', e.message);
    }

    progress(QS.t('exp.html'));
    const title = (deck.meta && deck.meta.title) || QS.t('player.defaultTitle');
    const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${QS.esc(title)}</title>
${icon}<!-- Exported by the slide editor on ${new Date().toISOString()}. Double-click to present; press P for presenter view. -->
<style>
${faces}
${katexCss}
${themeCss}
${playerCss}
</style>
</head>
<body>
<script>window.__QS_DECK__ = ${JSON.stringify(deck).replace(/</g, '\\u003c')};
window.__QS_ASSETS__ = ${JSON.stringify(assets)};</script>
${Object.keys(js).map((f) => `<script>/* ${f} */\n${safeScript(js[f])}\n</script>`).join('\n')}
<script>QS.assetMap = window.__QS_ASSETS__; QS.boot();</script>
</body>
</html>`;
    const name = title.replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 60) + '.html';
    return { html, name };
  };
})();

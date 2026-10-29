/* 主题 ibm-quantum：IBM Quantum Learning 讲义风格（默认主题，deck.json 没有 meta.theme 时使用）。
 * 画布 1280×720；页面类型：内容页、章节页（路线图 + 色块面板）、封面（四个可调模块 + 插画）。
 * 主题的接口见 engine/core.js 的 QS.registerTheme。 */
(function () {
  'use strict';
  const QS = window.QS;
  const el = QS.el, esc = QS.esc, spring = QS.spring, springFrames = QS.springFrames;
  const T = (k) => QS.t(k);

  /* ---------- 封面 ---------- */
  /** 封面布局参数（px，基于 1280×720 画布）。每页封面的 coverLayout 只存改动过的项，其余用这里的默认值。 */
  const COVER_LAYOUT = {
    left: 32, // 左侧文字的左边距
    titleTop: 22, // 标题区距顶部
    titleSize: 62, // 主标题字号
    altSize: 28, // 第二标题字号
    textWidth: 600, // 左侧文字栏宽度
    metaBottom: 112, // 汇报人/副标题组距底部（底部留白）
    metaGap: 64, // 汇报人与副标题之间的间距
    showArt: true, // 显示插画
    artSize: 584, // 插画边长
    artTop: 24, // 插画距顶部
    artRight: 30, // 插画距右侧
    footerBottom: 22, // 页脚距底部
  };
  const coverLayout = (slide) => Object.assign({}, COVER_LAYOUT, slide.coverLayout || {});

  /* ---------- 章节页 ---------- */
  const SECTION_STYLES = ['panel', 'roadmap']; // 第一个为默认
  const SEC = { H: 720, TOP: 72, BOTTOM: 72, NUM_BOTTOM: 337, NUM_HEIGHT: 180 };
  /** 挂载后计算：路线图竖直位置（当前章节尽量居中，与整体居中加权折中并限制在边距内）；
   *  大号编号：0–9 中最高的数字刚好 NUM_HEIGHT 高，底边落在 NUM_BOTTOM，左边与标签首字母按墨迹对齐 */
  /** 只差几像素就能放进一行的标题，略收字距，免得因为浏览器差异换行。
   *  Chrome 默认在行尾挤掉全角右括号"）"右半边的空白（text-spacing-trim），Safari 不挤，
   *  所以"量子傅里叶变换算法（QFT）"这种刚好卡在栏宽上的标题在 Safari 里会把"（QFT）"挤到第二行。 */
  function fitRoadmapTitles(list) {
    for (const t of list.querySelectorAll('.t')) {
      t.style.letterSpacing = '';
      const lh = parseFloat(getComputedStyle(t).lineHeight) || 0;
      if (!lh || t.offsetHeight < lh * 1.5) continue; // 已经是一行
      const avail = t.clientWidth;
      t.style.whiteSpace = 'nowrap';
      const natural = t.scrollWidth;
      t.style.whiteSpace = '';
      const n = Array.from(t.textContent).length;
      const over = natural - avail;
      if (over <= 0 || over > avail * 0.04 || !n) continue; // 差得多就照常换行
      t.style.letterSpacing = (-(over + 1) / n).toFixed(2) + 'px';
    }
  }
  function layoutSection(root) {
    const list = root.querySelector('.qs-rm');
    if (list && list.offsetHeight) {
      const inIntro = root.classList.contains('qs-sec-intro');
      // 最终状态：当前章节高亮，位置在"当前章节居中"与"整体居中"之间加权折中
      root.classList.add('qs-sec-notrans');
      root.classList.remove('qs-sec-intro');
      fitRoadmapTitles(list);
      const rows = Array.from(list.children), cur = rows.findIndex((r) => r.classList.contains('on'));
      const listH = list.offsetHeight;
      let top = (SEC.H - listH) / 2;
      if (cur >= 0) {
        const mid = rows[cur].offsetTop + rows[cur].offsetHeight / 2;
        top = 0.65 * (SEC.H / 2 - mid) + 0.35 * (SEC.H / 2 - listH / 2);
        top = Math.min(Math.max(top, SEC.TOP), SEC.H - SEC.BOTTOM - listH);
        if (listH > SEC.H - SEC.TOP - SEC.BOTTOM) top = (SEC.H - listH) / 2;
      }
      list.dataset.finalTop = Math.round(top);
      // 入场第一段的状态：所有章节样式一致，列表整体居中
      root.classList.add('qs-sec-intro');
      list.dataset.introTop = Math.round((SEC.H - list.offsetHeight) / 2);
      if (!inIntro) root.classList.remove('qs-sec-intro');
      list.style.top = (inIntro ? list.dataset.introTop : list.dataset.finalTop) + 'px';
      void root.offsetHeight;
      root.classList.remove('qs-sec-notrans');
    }
    const lab = root.querySelector('.qs-sec-label'), num = root.querySelector('.qs-sec-num');
    if (!lab || !num || !lab.isConnected) return;
    const c = document.createElement('canvas').getContext('2d');
    const lf = getComputedStyle(lab), nf = getComputedStyle(num);
    c.font = `${lf.fontWeight} ${lf.fontSize} ${lf.fontFamily}`;
    const first = (lab.textContent.trim()[0] || 'P').toUpperCase();
    const labInkLeft = parseFloat(lf.left) - c.measureText(first).actualBoundingBoxLeft;
    c.font = `${nf.fontWeight} 100px ${nf.fontFamily}`;
    let maxH = 0;
    for (const d of '0123456789') { const m = c.measureText(d); maxH = Math.max(maxH, m.actualBoundingBoxAscent + m.actualBoundingBoxDescent); }
    if (!maxH) return;
    const size = SEC.NUM_HEIGHT / (maxH / 100);
    num.style.fontSize = size.toFixed(1) + 'px';
    c.font = `${nf.fontWeight} ${size}px ${nf.fontFamily}`;
    const D = c.measureText(num.textContent), zero = c.measureText('0');
    const baseInBox = (size - (D.fontBoundingBoxAscent + D.fontBoundingBoxDescent)) / 2 + D.fontBoundingBoxAscent;
    num.style.left = (labInkLeft + D.actualBoundingBoxLeft) + 'px';
    num.style.top = (SEC.NUM_BOTTOM - zero.actualBoundingBoxDescent - baseInBox) + 'px';
  }

  /** 入场两段式：先以统一样式、整体居中的状态让所有章节依次冒出；全部停稳后演化出当前章节的高亮和最终位置 */
  function playSectionIntro(root) {
    const list = root.querySelector('.qs-rm');
    if (!list || list.dataset.introTop === undefined) return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return finishSectionIntro(root);
    clearTimeout(root._secTimer);
    root.classList.add('qs-sec-notrans', 'qs-sec-intro');
    list.style.top = list.dataset.introTop + 'px';
    void root.offsetHeight;
    root.classList.remove('qs-sec-notrans');
    // 第二段在最后一行"停稳"时立即开始：单行回弹动画 620ms，在 87%（约 540ms）时与终点偏差已小于 1px
    const start = parseFloat(getComputedStyle(root).getPropertyValue('--sec-rows')) * 1000 || 0;
    const settle = start + (list.children.length - 1) * 90 + 540;
    root._secTimer = setTimeout(() => evolveSection(root), settle);
  }
  function finishSectionIntro(root) {
    clearTimeout(root._secTimer);
    (root._secAnims || []).forEach((a) => a.cancel());
    root._secAnims = [];
    const list = root.querySelector('.qs-rm');
    root.classList.remove('qs-sec-intro');
    if (list && list.dataset.finalTop !== undefined) list.style.top = list.dataset.finalTop + 'px';
  }

  function evolveSection(root) {
    const list = root.querySelector('.qs-rm');
    if (!list || !root.isConnected) return;
    const rows = Array.from(list.children), cur = rows.findIndex((r) => r.classList.contains('on'));
    const k = root.getBoundingClientRect().height / 720 || 1; // 画布缩放（FLIP 用未缩放坐标）
    const row = rows[cur], title = row && row.querySelector('.t'), num = row && row.querySelector('.n');
    const sub = row && row.querySelector('.s'), line = row && row.querySelector('.qs-rm-line');
    // FIRST：第一段末的状态
    const rel = (el, base) => { const a = el.getBoundingClientRect(), b = base.getBoundingClientRect(); return { x: (a.left - b.left) / k, y: (a.top - b.top) / k }; };
    const firstRowY = rows.map((r) => r.offsetTop);
    const firstTitle = title && rel(title, row), firstSize = title && parseFloat(getComputedStyle(title).fontSize);
    // 切到最终状态（无过渡），LAST
    root.classList.add('qs-sec-notrans');
    root.classList.remove('qs-sec-intro');
    list.style.top = list.dataset.finalTop + 'px';
    void root.offsetHeight;
    const lastRowY = rows.map((r) => r.offsetTop);
    const lastTitle = title && rel(title, row), lastSize = title && parseFloat(getComputedStyle(title).fontSize);
    const anims = (root._secAnims = []);
    const play = (el, f, opt) => el && anims.push(el.animate(f.frames, Object.assign({ duration: f.duration, fill: 'both', easing: 'linear' }, opt)));

    // 整个列表：从第一段的居中位置弹到最终位置
    const dList = (+list.dataset.introTop || 0) - (+list.dataset.finalTop || 0);
    if (dList) play(list, springFrames(spring({ freq: 3.2, damping: 0.35, v0: 0 }), (s) => ({ transform: `translateY(${(dList * (1 - s.x)).toFixed(2)}px)` })));

    // 各行：被推开，像波纹一样按与当前章节的距离错开
    rows.forEach((r, i) => {
      const dy = firstRowY[i] - lastRowY[i];
      if (Math.abs(dy) < 0.5) return;
      play(r, springFrames(spring({ freq: 3.75, damping: 0.22, brake: 1.5, v0: 3, ringFreq: 2.8, ringDamping: 0.15 }), (s) => ({ transform: `translateY(${(dy * (1 - s.x)).toFixed(2)}px)` })), { delay: Math.abs(i - cur) * 28 });
    });

    if (title) {
      // 标题：字号已是最终值，用 transform 从第一段的尺寸和位置弹过去（左上角为原点）
      const s0 = firstSize / lastSize, dx = firstTitle.x - lastTitle.x, dy = firstTitle.y - lastTitle.y;
      title.style.transformOrigin = '0 0';
      play(title, springFrames(spring({ freq: 3.75, damping: 0.22, brake: 1.7, v0: 1, ringFreq: 2.8, ringDamping: 0.15 }), (s) => {
        const p = 1 - s.x, sc = 1 - (1 - s0) * p;
        return { transform: `translate(${(dx * p).toFixed(2)}px, ${(dy * p).toFixed(2)}px) scale(${sc.toFixed(4)})` };
      }));
      play(title, { frames: [{ color: '#a8a8a8' }, { color: getComputedStyle(title).color }], duration: 160 }, { easing: 'ease-out' });
    }
    if (num) {
      num.style.display = 'inline-block';
      num.style.transformOrigin = '0 70%';
      play(num, springFrames(spring({ x0: 1, v0: 2.5, freq: 3.3, damping: 0.15 }), (s) => ({ transform: `scale(${(1 + (s.x - 1) * 0.9).toFixed(4)})` })));
      play(num, { frames: [{ color: '#a8a8a8' }, { color: getComputedStyle(num).color }], duration: 140 }, { easing: 'ease-out' });
    }
    if (line) {
      // 线条：极大初速度弹出；粗细随速度和加速度变化（快时拉细，急停时压扁）
      const S = spring({ freq: 4.5, damping: 0.24, brake: 1.9, v0: 4, ringFreq: 3.3, ringDamping: 0.15 });
      const vmax = Math.max(...S.map((q) => Math.abs(q.v))), amax = Math.max(...S.slice(4).map((q) => Math.abs(q.a))) || 1;
      play(line, springFrames(S, (s) => {
        const sp = Math.abs(s.v) / vmax, squash = (Math.abs(s.a) / amax) * (1 - sp);
        const sy = Math.max(0.35, 1 - 0.6 * sp + 0.9 * squash);
        return { transform: `scaleX(${Math.max(0, s.x).toFixed(4)}) scaleY(${sy.toFixed(3)})` };
      }));
    }
    if (sub) {
      play(sub, springFrames(spring({ freq: 3.2, damping: 0.2, v0: 0 }), (s, u) => ({
        transform: `translateY(${(-22 * (1 - s.x)).toFixed(2)}px)`,
        opacity: Math.min(1, u * 5).toFixed(3),
      })), { delay: 50 });
    }
    root.classList.remove('qs-sec-notrans');
  }

  /* ---------- 编辑器：封面布局（按模块分组的滑块，拖动时画布实时更新；只把改动过的项写进 coverLayout） ---------- */
  function coverLayoutProps(ui, p, s) {
    const { t, el, section, field, numIn, checkIn } = ui;
    const D = COVER_LAYOUT;
    const lay = new Proxy({}, {
      get: (_, k) => (s.coverLayout || {})[k],
      set: (_, k, v) => { (s.coverLayout = s.coverLayout || {})[k] = v; return true; },
    });
    const sec = section(p, t('ed.cl.title'));
    const slider = (key, min, max, step) => numIn(lay, key, { range: true, min, max, step: step || 1, def: D[key], unit: 'px' });
    const group = (label) => sec.appendChild(el('div', 'ed-subhead', QS.esc(label)));

    group(t('ed.cl.text'));
    field(sec, t('ed.cl.left'), slider('left', 0, 300));
    field(sec, t('ed.cl.titleTop'), slider('titleTop', 0, 400));
    field(sec, t('ed.cl.titleSize'), slider('titleSize', 28, 110));
    field(sec, t('ed.cl.altSize'), slider('altSize', 14, 56));
    field(sec, t('ed.cl.textWidth'), slider('textWidth', 240, 1200, 10));

    group(t('ed.cl.meta'));
    field(sec, t('ed.cl.metaBottom'), slider('metaBottom', 0, 600));
    field(sec, t('ed.cl.metaGap'), slider('metaGap', 0, 240));

    group(t('ed.cl.art'));
    checkIn(sec, lay, 'showArt', t('ed.cl.showArt'), { def: D.showArt, structure: true });
    if (lay.showArt !== false) {
      field(sec, t('ed.cl.artSize'), slider('artSize', 120, 720, 2));
      field(sec, t('ed.cl.artTop'), slider('artTop', 0, 400));
      field(sec, t('ed.cl.artRight'), slider('artRight', 0, 700));
    }

    group(t('ed.cl.footer'));
    field(sec, t('ed.cl.footerBottom'), slider('footerBottom', 0, 200));

    const reset = el('button', 'small', t('ed.cl.reset'));
    reset.onclick = () => {
      delete s.coverLayout;
      ui.changed({ structure: true });
    };
    sec.appendChild(reset);
  }

  QS.registerTheme({
    id: 'ibm-quantum',
    name: { en: 'IBM Quantum Learning', zh: 'IBM Quantum Learning 讲义' },
    width: 1280,
    height: 720,
    accent: '#5588F6',
    scripts: ['coverart.js'],
    // 导出时内嵌的字体（subset: 'text' 按文稿用到的字符子集化，'ascii' 只留 ASCII）；sample 用于载入时预热
    fonts: [
      { family: 'Plex SC', weight: 300, file: 'vendor/fonts/IBMPlexSansSC-Light.woff', label: 'IBM Plex Sans SC Light', sample: '量子' },
      { family: 'Plex SC', weight: 400, file: 'vendor/fonts/IBMPlexSansSC-Regular.woff', label: 'IBM Plex Sans SC Regular', sample: '量子' },
      { family: 'Plex SC', weight: 500, file: 'vendor/fonts/IBMPlexSansSC-Medium.woff', label: 'IBM Plex Sans SC Medium', sample: '量子' },
      { family: 'Plex SC', weight: 600, file: 'vendor/fonts/IBMPlexSansSC-SemiBold.woff', label: 'IBM Plex Sans SC SemiBold', sample: '量子' },
      // 章节编号在非 Mac 电脑上的后备字体：本机私有的 Futura ND（商业字体，只为自用内嵌 ASCII 子集；文件不存在就跳过）
      { family: 'Futura ND Bundled', weight: 500, file: 'vendor/fonts/private/FuturaND-Medium.ttf', label: 'Futura ND Medium', subset: 'ascii', optional: true, sample: 'PART 0123456789' },
    ],
    blocks: ['text', 'list', 'formula', 'box', 'image', 'table', 'circuit', 'anim', 'spacer'],
    textSizes: ['normal', 'large', 'small'],

    slideTypes: {
      content: { add: 'ed.addContent' },
      section: {
        add: 'ed.addSection',
        make: () => ({ title: T('default.sectionTitle'), subtitle: '', number: '' }),
        render(root, slide, deck) {
          // 路线图列出整份幻灯片的所有章节页，当前章节放大高亮；panel 样式在左侧加主题色面板和大号编号
          const style = SECTION_STYLES.includes(deck.meta && deck.meta.sectionStyle) ? deck.meta.sectionStyle : SECTION_STYLES[0];
          root.classList.add('qs-secstyle-' + style);
          const secs = deck.slides.filter((s) => s.type === 'section' && (!s.hidden || s.id === slide.id));
          const cur = secs.findIndex((s) => s.id === slide.id);
          const label = (s, i) => String(s.number || '').trim() || 'Part ' + (i + 1);
          if (style === 'panel') {
            const num = label(slide, cur);
            const digits = (num.match(/\d+/) || [String(cur + 1)])[0];
            const word = num.replace(/\d+/, '').replace(/\s+/g, ' ').trim() || 'Part';
            root.appendChild(el('div', 'qs-sec-panel', `<div class="qs-sec-label qs-futura">${esc(word)}</div><div class="qs-sec-num qs-futura">${esc(digits)}</div>`));
          }
          const list = el('ol', 'qs-rm');
          secs.forEach((s, i) => {
            const on = i === cur;
            const li = list.appendChild(el('li', on ? 'on' : '',
              `<span class="n qs-futura">${esc(label(s, i))}</span><span class="t${on ? ' qs-section-title' : ''}">${QS.inline(s.title)}</span>` +
              (on && s.subtitle ? `<span class="s">${QS.inline(s.subtitle)}</span>` : '') +
              (on ? '<i class="qs-rm-line"></i>' : '')));
            li.style.setProperty('--i', i); // 入场动画按顺序错开
          });
          root.appendChild(list);
        },
        mount(root) {
          layoutSection(root);
          // 字体（Futura / Futura ND）如果稍后才载入，载入后重新计算一次
          if (document.fonts && document.fonts.status !== 'loaded') document.fonts.ready.then(() => root.isConnected && layoutSection(root));
        },
        setStep(root, step, animate) {
          animate ? playSectionIntro(root) : finishSectionIntro(root);
        },
        destroy(root) {
          clearTimeout(root._secTimer);
        },
        fields(ui, sec, s) {
          const { t, field, textIn } = ui;
          field(sec, t('ed.mainTitle'), textIn(s, 'title'));
          field(sec, t('ed.sectionNum'), textIn(s, 'number'), t('ed.sectionNumHint'));
          field(sec, t('ed.subtitle'), textIn(s, 'subtitle', { rows: 2 }));
        },
      },
      cover: {
        add: 'ed.addCover',
        make: () => ({ title: T('default.coverTitle'), subtitle: '', author: '', footer: '' }),
        render(root, slide) {
          // 封面由四个模块组成：标题区、汇报人/副标题组、插画、页脚；位置和大小来自 coverLayout
          const L = coverLayout(slide);
          const px = (v) => v + 'px';
          const left = el('div', 'qs-cover-text');
          Object.assign(left.style, { left: px(L.left), top: px(L.titleTop), width: px(L.textWidth) });
          const h1 = el('h1', 'qs-cover-title', QS.inline(slide.title));
          h1.style.fontSize = px(L.titleSize);
          left.appendChild(h1);
          if (slide.titleAlt) {
            const alt = el('div', 'qs-cover-title-alt', QS.inline(slide.titleAlt));
            alt.style.fontSize = px(L.altSize);
            left.appendChild(alt);
          }
          root.appendChild(left);
          if (slide.author || slide.subtitle) {
            const meta = el('div', 'qs-cover-meta');
            Object.assign(meta.style, { left: px(L.left), bottom: px(L.metaBottom), width: px(L.textWidth) });
            meta.style.setProperty('--meta-gap', px(L.metaGap));
            if (slide.subtitle) meta.appendChild(el('div', 'qs-cover-sub', QS.inline(slide.subtitle)));
            if (slide.author) meta.appendChild(el('div', 'qs-cover-author', QS.inline(slide.author)));
            root.appendChild(meta);
          }
          if (L.showArt && L.artSize > 0) {
            const art = el('div', 'qs-cover-art');
            Object.assign(art.style, { right: px(L.artRight), top: px(L.artTop), width: px(L.artSize), height: px(L.artSize) });
            if (QS.coverArt) art.innerHTML = QS.coverArt();
            root.appendChild(art);
          }
          if (slide.footer) {
            const foot = el('div', 'qs-cover-footer', QS.inline(slide.footer));
            Object.assign(foot.style, { left: px(L.left), bottom: px(L.footerBottom) });
            root.appendChild(foot);
          }
        },
        fields(ui, sec, s) {
          const { t, field, textIn } = ui;
          field(sec, t('ed.mainTitle'), textIn(s, 'title', { rows: 2 }), t('ed.titleBreakHint'));
          field(sec, t('ed.titleAlt'), textIn(s, 'titleAlt', { rows: 2 }), t('ed.titleAltHint'));
          field(sec, t('ed.coverSub'), textIn(s, 'subtitle', { rows: 2 }));
          field(sec, t('ed.author'), textIn(s, 'author'));
          field(sec, t('ed.footer'), textIn(s, 'footer'));
        },
        panels: coverLayoutProps,
        textKeys: ['title', 'titleAlt', 'subtitle', 'author', 'footer'],
      },
    },

    /** 内容页右下角的页码 */
    decorate(root, slide, deck, opts) {
      if (deck.meta && deck.meta.pageNumbers && slide.type === 'content' && opts.pageNo) {
        root.appendChild(el('div', 'qs-pageno', String(opts.pageNo)));
      }
    },

    /** 设置面板里的主题选项 */
    settings(ui, sec, m) {
      const { t, field, checkIn, seg } = ui;
      checkIn(sec, m, 'pageNumbers', t('ed.setPageNo'), { structure: true });
      field(sec, t('ed.setSecStyle'), seg(m, 'sectionStyle', SECTION_STYLES.map((k) => [k, t('ed.secStyle.' + k)]), { structure: true }), t('ed.setSecStyleHint'));
    },

    /** npm run check 的主题专属检查 */
    check(deck, report) {
      const st = deck.meta && deck.meta.sectionStyle;
      if (st !== undefined && !SECTION_STYLES.includes(st)) report.warn(`meta.sectionStyle "${st}" is not one of ${SECTION_STYLES.join(' / ')}; using ${SECTION_STYLES[0]}`);
    },
  });
})();

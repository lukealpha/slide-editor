/* QS 核心：数据模型、行内标记、内容块渲染、步骤控制。编辑器、放映器、导出文件共用这一份代码。 */
(function () {
  'use strict';
  const QS = (window.QS = window.QS || {});

  // 画布逻辑尺寸由当前主题决定（QS.setTheme 改写），这里是默认主题的值
  QS.W = 1280;
  QS.H = 720;

  /* ---------- 编号 ---------- */
  const ID_CHARS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  function rand3() {
    let s = '';
    for (let i = 0; i < 3; i++) s += ID_CHARS[Math.floor(Math.random() * ID_CHARS.length)];
    return s;
  }
  QS.collectIds = function (deck) {
    const ids = new Set();
    for (const s of deck.slides) {
      ids.add(s.id);
      for (const b of s.blocks || []) ids.add(b.id);
      for (const td of s.todos || []) ids.add(td.id);
    }
    return ids;
  };
  QS.newId = function (deck, prefix) {
    const ids = QS.collectIds(deck);
    let id;
    do id = prefix + '-' + rand3(); while (ids.has(id));
    return id;
  };

  /* ---------- 内容块类型（名称、默认值） ---------- */
  // 显示名称在 i18n.js 的 type.* 词条里；默认文字随界面语言
  const T = (k) => (QS.t ? QS.t(k) : k);
  QS.BLOCK_TYPES = {
    text: { make: () => ({ text: T('default.text') }) },
    list: { make: () => ({ items: T('default.list'), ordered: false, stepwise: false }) },
    formula: { make: () => ({ latex: '\\hat{F}\\,|j\\rangle = \\frac{1}{\\sqrt{N}}\\sum_{k=0}^{N-1} e^{2\\pi i jk/N}|k\\rangle', boxed: true }) },
    box: { make: () => ({ label: T('default.box.label'), body: T('default.box.body'), variant: 'example' }) },
    image: { make: () => ({ src: '', width: 60, caption: '' }) },
    table: { make: () => ({ rows: T('default.table'), header: true, headerCol: false, align: 'center' }) },
    circuit: { make: () => ({ spec: 'qubits 2\nH 0\nC0 X 1', stepwise: 'none', scale: 1 }) },
    anim: { make: () => ({ component: '', params: {}, height: 360 }) },
    spacer: { make: () => ({ height: 24 }) },
  };
  QS.ANIMS = { fade: 1, rise: 1, none: 1 }; // 入场效果；名称见 effect.* 词条

  QS.makeBlock = function (deck, type) {
    return Object.assign({ id: QS.newId(deck, 'B'), type, step: 0, anim: 'fade' }, QS.BLOCK_TYPES[type].make());
  };

  QS.makeSlide = function (deck, type) {
    const s = { id: QS.newId(deck, 'S'), type, title: '', notes: '' };
    if (type === 'content') Object.assign(s, { title: T('default.slideTitle'), layout: 'single', split: 55, blocks: [] });
    else {
      const def = QS.theme && QS.theme.slideTypes[type];
      if (def && def.make) Object.assign(s, def.make(deck));
    }
    return s;
  };

  /* ---------- TODO 标注 ----------
   * 每页的 todos 数组：{ id: 'T-XXX', text, block, fx, fy } 钉在某个内容块上（fx/fy 为块内的相对位置 0–1，块移动时跟着走）
   *                    或 { id, text, x, y } 自由放在 1280×720 画布坐标上。
   * TODO 不是内容块，不参与排版，只在编辑器里显示。 */
  QS.todoCount = function (deck) {
    return deck.slides.reduce((a, s) => a + (s.todos || []).length, 0);
  };

  /* 隐藏页（slide.hidden）：编辑器里照常显示和编辑，放映、打印和导出时整页去掉。
   * 章节路线图和页码也按去掉隐藏页之后的顺序计算，编辑器预览与放映一致。 */
  QS.visibleSlides = (deck) => deck.slides.filter((s) => !s.hidden);
  QS.visibleDeck = (deck) => Object.assign({}, deck, { slides: QS.visibleSlides(deck) });
  /** 编辑器里的第 idx 页在放映中的位置：本页隐藏时取它之后第一张可见页（没有就取最后一张）；没有可见页返回 -1 */
  QS.visibleIndex = function (deck, idx) {
    let n = -1;
    for (let i = 0; i < deck.slides.length; i++) {
      if (deck.slides[i].hidden) continue;
      n++;
      if (i >= idx) return n;
    }
    return n;
  };
  /** 页码：前面（含本页）可见页的数量 */
  QS.pageNo = (deck, idx) => deck.slides.slice(0, idx + 1).filter((s) => !s.hidden).length;

  /** 旧版数据迁移：把 type: 'todo' 的内容块转成钉在前一个块下沿的 TODO 标注 */
  QS.migrate = function (deck) {
    for (const s of deck.slides || []) {
      if (!s.blocks || !s.blocks.some((b) => b.type === 'todo')) continue;
      const keep = [];
      for (const b of s.blocks) {
        if (b.type !== 'todo') { keep.push(b); continue; }
        const prev = keep[keep.length - 1];
        const td = { id: b.id.replace(/^B-/, 'T-'), text: b.text || '' };
        Object.assign(td, prev ? { block: prev.id, fx: 0.02, fy: 1 } : { x: 110, y: 160 });
        (s.todos = s.todos || []).push(td);
      }
      s.blocks = keep;
    }
    return deck;
  };

  /* ---------- 主题 ----------
   * 每份幻灯片在 deck.json 的 meta.theme 里写明主题（没有时用 ibm-quantum），开始时定好，之后一般不再改：
   * 编辑器里只读显示；换主题要手动改 deck.json，而且不保证内容在另一个主题下还能正确显示——
   * 主题不支持的页面类型、内容块显示成占位提示，npm run check 报错，导出拒绝执行。
   * 主题放在编辑器目录的 themes/<id>/：theme.js 调用 QS.registerTheme(def)，theme.css 是全部视觉样式。def 的字段：
   *   id, name, width / height（画布逻辑尺寸）, accent（默认主题色）, scripts（同目录下另外要载入的脚本）,
   *   fonts（导出时内嵌的字体，见 export.js）, blocks（可用的内容块类型）, textSizes（正文块的字号选项）,
   *   slideTypes：{ 类型: { add（"添加"按钮的词条）, make(deck)（新建时的字段）, render(root, slide, deck, opts),
   *                mount(root, slide), setStep(root, step, animate), destroy(root),
   *                fields(ui, sec, slide)（编辑器里本页设置的字段）, panels(ui, p, slide)（另外的设置分组）, textKeys } }，
   *                content 类型的正文由引擎排版，主题可以只给 add / fields；
   *   decorate(root, slide, deck, opts)：每页渲染完后加页眉页脚、页码等；settings(ui, sec, meta)：设置面板里的主题选项；
   *   check(deck, report)：npm run check 的额外检查；i18n：{ en: {…}, zh: {…} } 主题专属的界面文字。 */
  QS.DEFAULT_THEME = 'ibm-quantum';
  QS.themes = QS.themes || {};
  QS.registerTheme = function (def) {
    QS.themes[def.id] = def;
    if (def.i18n && QS.i18n) for (const lang of Object.keys(def.i18n)) Object.assign((QS.i18n[lang] = QS.i18n[lang] || {}), def.i18n[lang]);
  };
  QS.themeId = (deck) => (deck && deck.meta && deck.meta.theme) || QS.DEFAULT_THEME;
  QS.setTheme = function (def) {
    QS.theme = def;
    QS.W = def.width;
    QS.H = def.height;
    if (typeof document !== 'undefined') {
      const st = document.documentElement.style;
      st.setProperty('--qs-w', def.width + 'px');
      st.setProperty('--qs-h', def.height + 'px');
      st.setProperty('--qs-aspect', def.width + ' / ' + def.height);
    }
  };
  function loadScript(src) {
    return new Promise((ok, fail) => {
      const s = document.createElement('script');
      s.src = src + '?t=' + Date.now();
      s.onload = ok;
      s.onerror = () => fail(new Error(src));
      document.head.appendChild(s);
    });
  }
  // 主题样式表插在 engine/base.css 后面，保持"基础 → 主题 → 放映器 / 编辑器界面"的层叠顺序
  function loadCss(href) {
    return new Promise((ok, fail) => {
      const l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = href + '?t=' + Date.now();
      l.onload = ok;
      l.onerror = () => fail(new Error(href));
      const base = document.getElementById('qs-base-css');
      if (base) base.after(l);
      else document.head.appendChild(l);
    });
  }
  /** 载入并启用 deck 指定的主题；找不到时抛出错误（编辑器、放映页显示出来，不做猜测）。导出文件里主题已内联。 */
  QS.useTheme = async function (deck) {
    const id = QS.themeId(deck);
    if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) throw new Error(QS.t('core.themeMissing', { id }));
    if (!QS.themes[id]) {
      const base = 'themes/' + id + '/';
      try {
        await Promise.all([loadScript(base + 'theme.js'), loadCss(base + 'theme.css')]);
        for (const f of (QS.themes[id] && QS.themes[id].scripts) || []) await loadScript(base + f);
      } catch (e) {
        throw new Error(QS.t('core.themeMissing', { id }));
      }
      if (!QS.themes[id]) throw new Error(QS.t('core.themeMissing', { id }));
    }
    QS.setTheme(QS.themes[id]);
    return QS.theme;
  };
  /** 预先载入主题的字体（sample 里的字形），避免第一次渲染时用后备字体排版 */
  QS.loadThemeFonts = function () {
    if (typeof document === 'undefined' || !document.fonts || !document.fonts.load) return Promise.resolve();
    return Promise.all((QS.theme.fonts || []).map((f) => document.fonts.load(`${f.style || 'normal'} ${f.weight || 400} 24px "${f.family}"`, f.sample || 'Aa'))).catch(() => {});
  };
  /** 内容与主题不一致的地方（主题没有的页面类型、内容块类型、字号）。npm run check 和导出据此报错 */
  QS.themeIssues = function (deck, theme) {
    theme = theme || QS.theme;
    const out = [];
    (deck.slides || []).forEach((s, i) => {
      const w = `Slide ${i + 1} ${s.id}`;
      if (!theme.slideTypes[s.type]) out.push(`${w}: theme ${theme.id} has no "${s.type}" slide type`);
      if (s.type !== 'content') return;
      for (const b of s.blocks || []) {
        if (!QS.BLOCK_TYPES[b.type]) continue; // 未知类型由 check 另外报
        if (!theme.blocks.includes(b.type)) out.push(`${w} | ${b.id} ${b.type}: theme ${theme.id} has no "${b.type}" block`);
        else if (b.type === 'text' && b.size && !(theme.textSizes || ['normal']).includes(b.size)) out.push(`${w} | ${b.id} text: theme ${theme.id} has no text size "${b.size}"`);
      }
    });
    return out;
  };

  /* ---------- 弹簧动画（主题和动画组件共用） ----------
   * spring() 逐帧积分一个阻尼振子，从 x0 运动到 1；springFrames() 把采样变成 Web Animations 关键帧。
   * 典型用法是"绷紧的弹簧突然释放"：弹簧在画面出现前就已压紧（不可见），第一帧就是释放——以极大初速度弹出，
   * 冲过终点后急刹（过冲短），随后以松弛的弹簧来回晃几下停稳。 */
  function spring(o) {
    // 阻尼分三段：释放时用 damping；第一次冲过终点后改用 brake 急刹（过冲短）；
    // 之后进入弛豫：换成更软的弹簧（ringFreq / ringDamping，缺省沿用 freq / damping），慢慢地、松松地晃停
    const dt = 1 / 240, brake = o.brake === undefined ? o.damping : o.brake;
    const ringW = 2 * Math.PI * (o.ringFreq || o.freq), ringZ = o.ringDamping === undefined ? o.damping : o.ringDamping;
    let x = o.x0 || 0, v = o.v0 || 0, phase = 0;
    const out = [{ x, v, a: 0 }];
    for (let t = dt; t < 5; t += dt) {
      const w = phase === 2 ? ringW : 2 * Math.PI * o.freq, z = phase === 0 ? o.damping : phase === 1 ? brake : ringZ;
      const a = -w * w * (x - 1) - 2 * z * w * v;
      v += a * dt;
      const px = x;
      x += v * dt;
      if (phase === 0 && px !== 1 && (px - 1) * (x - 1) <= 0) phase = 1;
      else if (phase === 1 && v * (x - 1) <= 0) phase = 2;
      out.push({ x, v, a });
      if (t > 0.06 && Math.abs(x - 1) < 0.0005 && Math.abs(v) < 0.03) break;
    }
    out[out.length - 1] = { x: 1, v: 0, a: 0 };
    return out;
  }
  /** 把采样（每 1/240 s）抽成约 120fps 的关键帧；map 把一个采样点变成 CSS 属性 */
  function springFrames(samples, map) {
    const n = Math.max(2, Math.round((samples.length - 1) / 2));
    const frames = [];
    for (let i = 0; i <= n; i++) frames.push(Object.assign({ offset: i / n }, map(samples[Math.round((i / n) * (samples.length - 1))], i / n)));
    return { frames, duration: ((samples.length - 1) / 240) * 1000 };
  }
  QS.spring = spring;
  QS.springFrames = springFrames;
  /* ---------- 公式序列的变形：两个相邻公式里相同的字形从旧位置滑到新位置 ----------
   * 只对设了 morph 的公式块、放映时向前一步（animate）时播放。做法：把旧公式的每个字形（KaTeX 的叶子元素、svg 定界符、分数线）
   * 复制到一层浮层上，按出现顺序做最长公共子序列匹配；匹配上的从旧位置滑到新位置（并按尺寸缩放），
   * 没匹配上的旧字形原地淡出，新公式里没匹配上的字形淡入。滑动期间新公式里对应的字形先隐藏，结束后换回真身。 */
  function katexLeaves(item) {
    const out = [];
    const host = item.querySelector('.katex-html') || item;
    (function walk(e) {
      for (const c of e.children) {
        const tag = c.tagName.toLowerCase();
        if (tag === 'svg') { out.push({ el: c, tok: 'svg' }); continue; }
        if (c.classList.contains('frac-line') || c.classList.contains('hline') || c.classList.contains('rule')) { out.push({ el: c, tok: 'rule' }); continue; }
        if (!c.children.length) {
          const t = c.textContent.replace(/\s+/g, '');
          if (t) out.push({ el: c, tok: t });
          continue;
        }
        walk(c);
      }
    })(host);
    const range = document.createRange();
    return out.filter((l) => {
      // 文字取字形本身的范围：有的叶子带内边距（例如根号里的 2 左边留出了根号的位置）
      if (l.tok === 'svg' || l.tok === 'rule') l.r = l.el.getBoundingClientRect();
      else { range.selectNodeContents(l.el); l.r = range.getBoundingClientRect(); }
      return l.r.width > 0.5 && l.r.height > 0.5;
    });
  }
  function lcsPairs(a, b) {
    const n = a.length, m = b.length;
    const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i].tok === b[j].tok ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    const pairs = [];
    let i = 0, j = 0;
    while (i < n && j < m) {
      if (a[i].tok === b[j].tok) { pairs.push([i, j]); i++; j++; }
      else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
      else j++;
    }
    return pairs;
  }
  function morphFormula(fEl, oldItem, newItem, oldLeaves) {
    const base = fEl.getBoundingClientRect();
    const k = base.width / (fEl.offsetWidth || base.width || 1) || 1; // 画布缩放
    const newLeaves = katexLeaves(newItem);
    // \mv{…} 标出的同一段内容在新公式里原样出现（例如一个相位挪到别的因子上）：整段先配对，沿弧线挪过去，不参与按顺序的匹配
    const groups = (ls) => {
      const m = new Map();
      ls.forEach((l, i) => {
        const g = l.el.closest('.qs-mv');
        if (g) (m.get(g) || m.set(g, []).get(g)).push(i);
      });
      return [...m.values()];
    };
    const sig = (ls, g) => g.map((i) => ls[i].tok).join('\u0001');
    const moved = new Set(), usedOld = new Set(), usedNew = new Set(), pairs = [];
    const newGroups = groups(newLeaves);
    for (const og of groups(oldLeaves)) {
      const ng = newGroups.find((g) => !usedNew.has(g[0]) && sig(newLeaves, g) === sig(oldLeaves, og));
      if (!ng) continue;
      og.forEach((i, n) => { pairs.push([i, ng[n]]); moved.add(i); usedOld.add(i); usedNew.add(ng[n]); });
    }
    const restOld = oldLeaves.map((l, i) => i).filter((i) => !usedOld.has(i));
    const restNew = newLeaves.map((l, j) => j).filter((j) => !usedNew.has(j));
    for (const [a, b] of lcsPairs(restOld.map((i) => oldLeaves[i]), restNew.map((j) => newLeaves[j]))) pairs.push([restOld[a], restNew[b]]);
    const DUR = 640, EASE = 'cubic-bezier(.65,0,.35,1)';
    const layer = document.createElement('div');
    layer.className = 'qs-morph';
    fEl.appendChild(layer);
    const anims = [];
    const clone = (l) => {
      const r = l.r, e = l.el, cs = getComputedStyle(e);
      let c;
      if (l.tok === 'svg') {
        c = e.cloneNode(true);
        c.setAttribute('width', r.width / k);
        c.setAttribute('height', r.height / k);
      } else {
        c = document.createElement('div');
        if (l.tok === 'rule') c.style.background = cs.borderBottomColor || cs.color;
        else {
          c.textContent = e.textContent;
          c.style.fontFamily = cs.fontFamily;
          c.style.fontSize = cs.fontSize;
          c.style.fontStyle = cs.fontStyle;
          c.style.fontWeight = cs.fontWeight;
          c.style.lineHeight = r.height / k + 'px';
          c.style.whiteSpace = 'pre';
        }
      }
      c.style.position = 'absolute';
      c.style.left = (r.left - base.left) / k + 'px';
      c.style.top = (r.top - base.top) / k + 'px';
      c.style.width = r.width / k + 'px';
      c.style.height = r.height / k + 'px';
      c.style.color = cs.color;
      c.style.transformOrigin = '0 0';
      layer.appendChild(c);
      return c;
    };
    const matchedOld = new Set(pairs.map((p) => p[0])), matchedNew = new Set(pairs.map((p) => p[1]));
    oldLeaves.forEach((l, i) => {
      l.c = clone(l);
      if (!matchedOld.has(i)) anims.push(l.c.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 240, easing: 'ease-out', fill: 'forwards' }));
    });
    for (const [i, j] of pairs) {
      const o = oldLeaves[i], w = newLeaves[j];
      const dx = (w.r.left - o.r.left) / k, dy = (w.r.top - o.r.top) / k;
      const sx = w.r.width / o.r.width, sy = w.r.height / o.r.height;
      const end = `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px) scale(${sx.toFixed(4)}, ${sy.toFixed(4)})`;
      let keys = [{ transform: 'none' }, { transform: end }];
      if (moved.has(i)) {
        // 挪动的那段从上方划一道弧，看得出是它自己在移动
        const lift = Math.max(10, (o.r.height / k) * 0.9);
        keys = [{ transform: 'none' }, { transform: `translate(${(dx / 2).toFixed(2)}px, ${(dy / 2 - lift).toFixed(2)}px) scale(${((1 + sx) / 2).toFixed(4)}, ${((1 + sy) / 2).toFixed(4)})` }, { transform: end }];
      }
      anims.push(o.c.animate(keys, { duration: DUR, easing: EASE, fill: 'forwards' }));
      w.el.style.visibility = 'hidden';
    }
    newLeaves.forEach((l, j) => {
      if (!matchedNew.has(j)) anims.push(l.el.animate([{ opacity: 0 }, { opacity: 0, offset: 0.3 }, { opacity: 1 }], { duration: DUR, easing: 'ease-out' }));
    });
    oldItem.style.visibility = 'hidden';
    newItem.style.transition = 'none';
    let over = false;
    const done = () => {
      if (over) return;
      over = true;
      layer.remove();
      for (const [, j] of pairs) newLeaves[j].el.style.visibility = '';
      oldItem.style.visibility = '';
      newItem.style.transition = '';
    };
    const timer = setTimeout(done, DUR + 40);
    return { finish() { clearTimeout(timer); anims.forEach((a) => a.cancel()); done(); } };
  }

  /* ---------- 块的收起 / 撑开 ----------
   * 收起：先淡出（0.25 s），再把高度和下边距收到 0，下面的块随之平滑上移；撑开：同时（0.25 s 后）把高度撑开，再淡入。 */
  const COLLAPSE_EASE = 'cubic-bezier(.65,0,.35,1)';
  // 返回第二遍要做的事（读尺寸、改高度）；不用变时返回 null
  function collapseBlock(w, collapsed, animate) {
    if (w._collapsed === collapsed) return null;
    // 第一次定状态（刚渲染、翻到本页）不做动画：块该显示就按普通的出现方式淡入，不走"撑开"
    if (w._collapsed === undefined) animate = false;
    w._collapsed = collapsed;
    clearTimeout(w._collapseTimer);
    // 收起的块是这一栏最后一块时，连上一个块的下边距也抵掉，不在底部留空隙；
    // 后面还有块时不抵（否则后面的块会被多拉上去一个边距，接替出现的文字就不在原来的位置）
    const prevMB = () => (w.previousElementSibling && !w.nextElementSibling ? '-' + getComputedStyle(w.previousElementSibling).marginBottom : '0px');
    if (!animate || !w.isConnected) {
      w.style.transition = 'none';
      return () => {
      if (!w._mb && !w.style.marginBottom) w._mb = getComputedStyle(w).marginBottom;
      w.style.overflow = collapsed ? 'hidden' : '';
      w.style.height = collapsed ? '0px' : '';
      w.style.marginBottom = collapsed ? '0px' : '';
      w.style.marginTop = collapsed ? prevMB() : '';
      void w.offsetHeight;
      w.style.transition = '';
      };
    }
    // 先定好过渡，再读尺寸：读尺寸会立即结算样式，此前刚切换的 qs-on / qs-off 若没有这里的过渡就会瞬间跳变
    if (collapsed) {
      w.style.transition = `opacity 0.25s ease, visibility 0s 0.25s, transform 0.25s ease, height 0.6s ${COLLAPSE_EASE} 0.25s, margin 0.6s ${COLLAPSE_EASE} 0.25s`;
      return () => {
      const h = w.offsetHeight, mb = getComputedStyle(w).marginBottom, pmb = prevMB();
      if (!w._mb) w._mb = mb;
      w.style.overflow = 'hidden';
      w.style.height = h + 'px';
      w.style.marginBottom = mb;
      w.style.marginTop = '0px';
      void w.offsetHeight;
      w.style.height = '0px';
      w.style.marginBottom = '0px';
      w.style.marginTop = pmb;
      };
    } else {
      // 与同一步里收起的块同步（都在 0.25 s 后开始），总高度不变；高度撑开之后才淡入
      w.style.transition = `height 0.6s ${COLLAPSE_EASE} 0.25s, margin 0.6s ${COLLAPSE_EASE} 0.25s, opacity 0.45s ease 0.85s, transform 0.45s ease 0.85s, visibility 0s 0s`;
      return () => {
      const target = w.scrollHeight;
      w.style.height = target + 'px';
      w.style.marginBottom = w._mb || '18px';
      w.style.marginTop = '0px';
      w._collapseTimer = setTimeout(() => {
        if (w._collapsed) return;
        w.style.transition = 'none';
        w.style.height = '';
        w.style.overflow = '';
        w.style.marginBottom = '';
        w.style.marginTop = '';
        void w.offsetHeight;
        w.style.transition = '';
      }, 1400);
      };
    }
  }

  /* ---------- 动画组件注册 ---------- */
  QS.animations = QS.animations || {};
  QS.registerAnimation = function (def) {
    QS.animations[def.id] = def;
  };
  QS.animParams = function (block) {
    const def = QS.animations[block.component];
    const p = {};
    if (def) for (const d of def.params || []) p[d.key] = block.params && block.params[d.key] !== undefined ? block.params[d.key] : d.default;
    return p;
  };

  /* ---------- 步骤 ---------- */
  QS.blockSpan = function (b) {
    // 内容块占用的额外步数（内部逐步出现的条目数 - 1）
    switch (b.type) {
      case 'list':
        return b.stepwise ? Math.max(0, splitLines(b.items).length - 1) : 0;
      case 'formula':
        return Math.max(0, splitSeq(b.latex).length - 1);
      case 'box':
        return Math.max(0, splitSeq(b.body).length - 1);
      case 'table':
        return b.stepwise ? Math.max(0, QS.tableRows(b.rows).length - (b.header === false ? 1 : 2)) : 0;
      case 'circuit':
        return b.stepwise && b.stepwise !== 'none' && QS.circuit ? Math.max(0, QS.circuit.stepCount(b.spec, b.stepwise) - 1) : 0;
      case 'anim': {
        const def = QS.animations[b.component];
        if (!def || !def.steps) return 0;
        return typeof def.steps === 'function' ? def.steps(QS.animParams(b)) : def.steps;
      }
      default:
        return 0;
    }
  };
  /** 动画组件各阶段（1…span）播放的步骤；逐行出现的表格里，第 2 行起各行出现的步骤（第 1 行随块出现）。
   *  默认紧跟块出现的步骤连续递增；b.stageSteps 可逐个指定（中间允许空出几步给别的内容），按严格递增规整：缺省项 = 前一项 + 1 */
  QS.stageSteps = function (b) {
    const span = b.type === 'anim' || (b.type === 'table' && b.stepwise) ? QS.blockSpan(b) : 0;
    const custom = Array.isArray(b.stageSteps) ? b.stageSteps : [];
    const out = [];
    let prev = b.step || 0;
    for (let i = 0; i < span; i++) {
      const v = custom[i];
      prev = Math.max(prev + 1, Number.isInteger(v) ? v : prev + 1);
      out.push(prev);
    }
    return out;
  };
  /** 块最后一个步骤（出现，或最后一个内部阶段） */
  QS.blockLastStep = function (b) {
    const ss = QS.stageSteps(b);
    return ss.length ? ss[ss.length - 1] : (b.step || 0) + QS.blockSpan(b);
  };
  /** 块消失的步骤（b.until，须大于出现的步骤；否则不消失） */
  QS.blockUntil = function (b) {
    return Number.isInteger(b.until) && b.until > (b.step || 0) ? b.until : null;
  };
  QS.maxStep = function (slide) {
    let m = 0;
    for (const b of slide.blocks || []) m = Math.max(m, QS.blockLastStep(b), QS.blockUntil(b) || 0);
    return m;
  };

  function splitLines(s) {
    return String(s || '').split('\n').filter((l) => l.trim() !== '');
  }
  function splitSeq(s) {
    return String(s || '').split(/\n\s*>>>\s*\n/).map((x) => x.trim()).filter((x) => x);
  }
  QS.splitSeq = splitSeq;
  /** 表格：每行一行，单元格用 | 分隔（$…$ 里的 | 不算；\| 表示字面的 |） */
  QS.tableWidths = (src) => String(src || '').split(/[,，\s]+/).filter(Boolean).map(Number).filter((n) => n > 0);
  QS.tableRows = function (src) {
    return splitLines(src).map((line) => {
      const cells = [];
      let cur = '', math = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '\\' && line[i + 1] === '|') { cur += '|'; i++; continue; }
        if (ch === '$') math = !math;
        if (ch === '|' && !math) { cells.push(cur.trim()); cur = ''; continue; }
        cur += ch;
      }
      cells.push(cur.trim());
      return cells;
    });
  };

  /* ---------- 行内标记 ---------- */
  function esc(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }
  QS.esc = esc;

  /** KaTeX 选项：唯一放开的是 \chg{…}（= \htmlClass{qs-chg}{…}），用来标出公式里"变了的部分"，
   *  它出现的那一步弹跳一下并变成主题色，下一步再渐变回黑色 */
  QS.katexOptions = function (display) {
    return {
      displayMode: !!display, throwOnError: true, strict: false,
      trust: (ctx) => ctx.command === '\\htmlClass' && (ctx.class === 'qs-chg' || ctx.class === 'qs-mv'),
      macros: { '\\chg': '\\htmlClass{qs-chg}{#1}', '\\mv': '\\htmlClass{qs-mv}{#1}' },
    };
  };
  QS.tex = function (latex, display) {
    if (!window.katex) return '<code>' + esc(latex) + '</code>';
    try {
      return katex.renderToString(latex, QS.katexOptions(display));
    } catch (e) {
      return '<span class="qs-tex-err" title="' + esc(e.message) + '">' + esc(latex) + '</span>';
    }
  };

  /** 段内标记：[[高亮]]、{{蓝字}}、**加粗**、*斜体*、$行内公式$、$$行间公式$$ */
  QS.inline = function (src) {
    const math = [];
    let s = String(src || '').replace(/\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g, (m, d, i) => {
      math.push(d !== undefined ? QS.tex(d, true) : QS.tex(i, false));
      return '\u0001' + (math.length - 1) + '\u0002';
    });
    s = esc(s)
      .replace(/\[\[([\s\S]+?)\]\]/g, '<span class="qs-hl">$1</span>')
      .replace(/\{\{([\s\S]+?)\}\}/g, '<span class="qs-accent">$1</span>')
      .replace(/\*\*([\s\S]+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*\n]+?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');
    return s.replace(/\u0001(\d+)\u0002/g, (m, i) => math[+i]);
  };

  /** 多段文字：空行分段 */
  QS.paragraphs = function (src) {
    return String(src || '')
      .split(/\n\s*\n/)
      .filter((p) => p.trim())
      .map((p) => '<p>' + QS.inline(p.trim()) + '</p>')
      .join('');
  };

  /* ---------- 资源路径（导出时替换成内嵌数据） ---------- */
  QS.assetURL = function (src) {
    if (QS.assetMap && QS.assetMap[src]) return QS.assetMap[src];
    return src;
  };

  /* ---------- 内容块渲染 ---------- */
  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }
  QS.el = el;

  const RENDER = {
    text(b) {
      const e = el('div', 'qs-text qs-size-' + (b.size || 'normal'), QS.paragraphs(b.text));
      if (b.align) e.style.textAlign = b.align;
      return e;
    },
    list(b, ctx) {
      const e = el(b.ordered ? 'ol' : 'ul', 'qs-list');
      if (b.size) e.style.fontSize = b.size + '%';
      splitLines(b.items).forEach((line, i) => {
        const li = el('li', '', QS.inline(line.replace(/^\s*[-*]\s+/, '')));
        if (b.stepwise) {
          li.dataset.step = (b.step || 0) + i;
          li.classList.add('qs-sub');
        }
        e.appendChild(li);
      });
      return e;
    },
    formula(b) {
      const seq = splitSeq(b.latex);
      const e = el('div', 'qs-formula' + (b.boxed === false ? '' : ' qs-boxed'));
      if (b.size) e.style.fontSize = b.size + '%';
      if (seq.length <= 1) {
        e.innerHTML = QS.tex(seq[0] || '', true);
      } else {
        // 公式序列：同一位置依次变换
        e.classList.add('qs-seq');
        if (b.morph) e.classList.add('qs-morphable'); // 相邻公式之间做字形变形（否则按原来的方式切换）
        seq.forEach((tex, i) => {
          const v = el('div', 'qs-seq-item', QS.tex(tex, true));
          v.dataset.step = (b.step || 0) + i;
          if (i < seq.length - 1) v.dataset.until = (b.step || 0) + i + 1;
          e.appendChild(v);
        });
      }
      if (b.caption) e.appendChild(el('div', 'qs-formula-cap', QS.inline(b.caption)));
      return e;
    },
    table(b) {
      const rows = QS.tableRows(b.rows);
      const ncol = Math.max(1, ...rows.map((r) => r.length));
      const e = el('div', 'qs-table-wrap' + (b.align === 'left' ? ' qs-table-alignleft' : ''));
      const tb = el('table', 'qs-table' + (b.full ? ' qs-table-full' : '') + (b.headerCol ? ' qs-table-hcol' : ''));
      if (b.size) tb.style.fontSize = b.size + '%';
      tb.style.setProperty('--qs-table-align', b.align === 'left' ? 'left' : 'center');
      // 列宽（可选）：逗号分隔的百分比，如 "12, 43, 35"，对应 LaTeX 的 p{.43\linewidth}；设了列宽时表格按固定布局排
      const widths = QS.tableWidths(b.widths);
      if (widths.length) {
        tb.classList.add('qs-table-fixed');
        const cg = tb.appendChild(el('colgroup'));
        for (let c = 0; c < ncol; c++) {
          const col = cg.appendChild(el('col'));
          if (widths[c]) col.style.width = widths[c] + '%';
        }
      }
      const head = b.header !== false && rows.length ? rows[0] : null;
      if (head) {
        const tr = el('tr');
        for (let c = 0; c < ncol; c++) tr.appendChild(el('th', '', QS.inline(head[c] || '')));
        tb.appendChild(el('thead')).appendChild(tr);
      }
      const body = tb.appendChild(el('tbody'));
      const rowSteps = QS.stageSteps(b);
      rows.slice(head ? 1 : 0).forEach((r, i) => {
        const tr = el('tr');
        for (let c = 0; c < ncol; c++) {
          const td = el(c === 0 && b.headerCol ? 'th' : 'td', '', QS.inline(r[c] || ''));
          if (td.tagName === 'TH') td.scope = 'row';
          tr.appendChild(td);
        }
        if (b.stepwise) {
          tr.dataset.step = i ? rowSteps[i - 1] : b.step || 0;
          tr.classList.add('qs-sub');
        }
        body.appendChild(tr);
      });
      e.appendChild(tb);
      if (b.caption) e.appendChild(el('div', 'qs-table-cap', QS.inline(b.caption)));
      return e;
    },
    box(b) {
      const e = el('div', 'qs-box qs-box-' + (b.variant || 'example'));
      if (b.label) e.appendChild(el('div', 'qs-box-label', QS.inline(b.label)));
      const seq = splitSeq(b.body);
      if (seq.length <= 1) e.appendChild(el('div', 'qs-box-body', QS.paragraphs(b.body)));
      else {
        // 多段正文（用单独一行 >>> 隔开）：在同一个框里依次替换，每段占一步
        const body = el('div', 'qs-box-body qs-box-seq');
        seq.forEach((txt, i) => {
          const v = el('div', 'qs-seq-item', QS.paragraphs(txt));
          v.dataset.step = (b.step || 0) + i;
          if (i < seq.length - 1) v.dataset.until = (b.step || 0) + i + 1;
          body.appendChild(v);
        });
        e.appendChild(body);
      }
      return e;
    },
    image(b) {
      const e = el('figure', 'qs-image');
      if (b.src) {
        const img = el('img');
        img.src = QS.assetURL(b.src);
        img.style.width = (b.width || 60) + '%';
        e.appendChild(img);
      } else e.appendChild(el('div', 'qs-image-empty', T('core.noImage')));
      if (b.caption) e.appendChild(el('figcaption', '', QS.inline(b.caption)));
      return e;
    },
    circuit(b, ctx) {
      const e = el('div', 'qs-circuit-wrap');
      if (QS.circuit) QS.circuit.render(e, b);
      return e;
    },
    anim(b, ctx) {
      const e = el('div', 'qs-anim');
      e.style.height = (b.height || 360) + 'px';
      const def = QS.animations[b.component];
      if (!def) {
        e.appendChild(el('div', 'qs-anim-missing', b.component ? esc(QS.t('core.animMissing', { id: b.component })) : T('core.animNone')));
        return e;
      }
      ctx.anims.push({ block: b, el: e, def });
      return e;
    },
    spacer(b) {
      // fill：撑满本栏剩下的高度（同 LaTeX 的 \vfill），height 是最小高度
      const e = el('div', 'qs-spacer' + (b.fill ? ' qs-spacer-fill' : ''));
      if (b.fill) e.style.minHeight = (b.height || 0) + 'px';
      else e.style.height = (b.height || 24) + 'px';
      return e;
    },
  };

  function renderBlock(b, ctx) {
    const r = RENDER[b.type];
    const inner = !r ? el('div', '', esc(QS.t('core.unknownBlock', { type: b.type })))
      : !QS.theme.blocks.includes(b.type) ? el('div', 'qs-unsupported', esc(QS.t('core.unsupportedBlock', { type: b.type, theme: QS.theme.id })))
      : r(b, ctx);
    const wrap = el('div', 'qs-block qs-b-' + b.type);
    wrap.dataset.blockId = b.id;
    wrap.dataset.step = b.step || 0;
    wrap.dataset.anim = b.anim || 'fade';
    // until：这一步起淡出并收起占的高度（下面的内容随之上移）；reserve: false：出现之前不占位置
    const until = QS.blockUntil(b);
    if (until !== null) {
      wrap.dataset.until = until;
      wrap.classList.add('qs-until');
    }
    if (b.reserve === false) wrap.classList.add('qs-noreserve');
    // delay（ms）：同一步里晚一点再出现（例如等同一步的动画画完）；只影响出现，不影响消失
    if (b.delay > 0) {
      wrap.dataset.delay = b.delay;
      wrap.style.setProperty('--qs-delay', b.delay + 'ms');
    }
    wrap.appendChild(inner);
    return wrap;
  }

  /* ---------- 幻灯片渲染 ---------- */
  /**
   * opts.mode: 'present' | 'edit' | 'thumb'
   * 返回 { root, setStep(step, animate), destroy() }
   */
  QS.renderSlide = function (deck, slide, opts) {
    opts = opts || {};
    const mode = opts.mode || 'present';
    const root = el('div', 'qs-slide qs-type-' + slide.type + ' qs-mode-' + mode);
    const theme = QS.theme, kind = theme.slideTypes[slide.type];
    const accent = (deck.meta && deck.meta.accent) || theme.accent || '#5588F6';
    root.style.setProperty('--accent', accent);
    root.dataset.slideId = slide.id;
    const ctx = { anims: [], mode };

    if (!kind) {
      root.appendChild(el('div', 'qs-unsupported', esc(QS.t('core.unsupportedSlide', { type: slide.type, theme: theme.id }))));
    } else if (kind.render) {
      kind.render(root, slide, deck, opts);
    } else {
      if (slide.title) root.appendChild(el('h1', 'qs-title', QS.inline(slide.title)));
      const body = el('div', 'qs-body');
      const split = slide.layout === 'split';
      const r = Math.min(80, Math.max(20, slide.split || 55));
      const grid = r + 'fr ' + (100 - r) + 'fr';
      const newCols = (parent) => {
        const c = { left: el('div', 'qs-col qs-col-left'), right: el('div', 'qs-col qs-col-right') };
        parent.appendChild(c.left);
        parent.appendChild(c.right);
        return c;
      };
      // 两栏：整页分左右两栏；有 col: 'full' 的块时改成混排——连续的左 / 右栏块组成一个两栏区（.qs-cols），
      // 通栏块单独占一行，按块的顺序从上往下排
      const mixed = split && (slide.blocks || []).some((b) => b.col === 'full');
      let cols = null;
      if (split && !mixed) {
        body.classList.add('qs-split');
        body.style.gridTemplateColumns = grid;
        cols = newCols(body);
      }
      if (mixed) body.classList.add('qs-split-mixed');
      for (const b of slide.blocks || []) {
        const node = renderBlock(b, ctx);
        if (mixed && b.col === 'full') {
          cols = null;
          body.appendChild(node);
        } else if (split) {
          if (!cols) {
            const row = body.appendChild(el('div', 'qs-cols'));
            row.style.gridTemplateColumns = grid;
            cols = newCols(row);
          }
          (b.col === 'right' ? cols.right : cols.left).appendChild(node);
        } else body.appendChild(node);
      }
      root.appendChild(body);
    }

    if (theme.decorate) theme.decorate(root, slide, deck, opts);

    // 分步内容一律从隐藏状态开始，避免翻页时后面步骤的内容先闪现再淡出
    root.querySelectorAll('[data-step]').forEach((n) => n.classList.add('qs-off'));

    // 挂载动画组件
    const controllers = [];
    const pending = ctx.anims.map((a) => () => {
      try {
        const params = QS.animParams(a.block);
        const api = {
          mode,
          accent,
          // 当前主题：组件可以按主题调整外观，用 cssVar('--ink') 之类取主题的颜色（字体从幻灯片继承，不用另外设置）
          theme: { id: theme.id, width: theme.width, height: theme.height },
          cssVar: (name) => getComputedStyle(a.el).getPropertyValue(name).trim(),
          blockId: a.block.id,
          emit: (state) => opts.onAnimState && opts.onAnimState(a.block.id, state),
        };
        const c = a.def.mount(a.el, params, api) || {};
        controllers.push({ id: a.block.id, step: a.block.step || 0, stages: QS.stageSteps(a.block), c });
      } catch (e) {
        a.el.innerHTML = '<div class="qs-anim-missing">' + esc(QS.t('core.animError', { msg: e.message })) + '</div>';
        console.error(e);
      }
    });

    let mounted = false;
    let current = -1;
    const api = {
      root,
      mount() {
        if (mounted) return;
        mounted = true;
        pending.forEach((f) => f());
        if (kind && kind.mount) kind.mount(root, slide);
        if (current >= 0) api.setStep(current, false);
      },
      setStep(step, animate) {
        current = step;
        // 公式序列：先结束上一次还在进行的变形，再记下每个序列当前显示的公式和它的字形位置
        (root._morphs || []).forEach((m) => m.finish());
        root._morphs = [];
        const seqBefore = animate
          ? Array.from(root.querySelectorAll('.qs-formula.qs-seq.qs-morphable')).map((f) => {
              const item = f.querySelector(':scope > .qs-seq-item.qs-on');
              return { f, item, leaves: item ? katexLeaves(item) : null };
            })
          : [];
        root.classList.toggle('qs-noanim', !animate);
        if (kind && kind.setStep) kind.setStep(root, step, animate);
        root.querySelectorAll('[data-step]').forEach((n) => {
          const s = +n.dataset.step;
          const u = n.dataset.until !== undefined ? +n.dataset.until : Infinity;
          const on = step >= s && step < u;
          n.classList.toggle('qs-on', on);
          n.classList.toggle('qs-off', !on);
        });
        // 消失 / 出现时收起或撑开块的高度（编辑器按预览的步骤同样收起，版面与放映一致）
        // 两遍：先给所有要变的块定好过渡，再读尺寸、改高度（读尺寸会结算整页的样式）
        {
          const jobs = [];
          root.querySelectorAll('.qs-block.qs-until, .qs-block.qs-noreserve').forEach((w) => {
            const s = +w.dataset.step, u = w.dataset.until !== undefined ? +w.dataset.until : Infinity;
            const job = collapseBlock(w, step >= u || (w.classList.contains('qs-noreserve') && step < s), animate);
            if (job) jobs.push(job);
          });
          jobs.forEach((f) => f());
        }
        // 向前一步换到下一个公式时做变形
        for (const sb of seqBefore) {
          const now = sb.f.querySelector(':scope > .qs-seq-item.qs-on');
          if (sb.item && now && now !== sb.item && now === sb.item.nextElementSibling) {
            try { root._morphs.push(morphFormula(sb.f, sb.item, now, sb.leaves)); } catch (e) { console.error(e); }
          }
        }
        // \chg{…} 标出的部分：所在内容出现的那一步是主题色（向前翻到这一步时先跳一下），之后渐变回黑色
        root.querySelectorAll('.qs-chg').forEach((c) => {
          const host = c.closest('[data-step]');
          const fresh = !!host && +host.dataset.step === step;
          const was = c.classList.contains('qs-chg-on');
          c.classList.toggle('qs-chg-on', fresh);
          if (fresh && !was && animate && c.animate) {
            const f = springFrames(spring({ x0: 1, v0: 5, freq: 2.4, damping: 0.25, brake: 0.7, ringFreq: 2.2, ringDamping: 0.2 }), (p) => ({ transform: `scale(${p.x.toFixed(4)})` }));
            c.animate(f.frames, { duration: f.duration, easing: 'linear' });
          }
        });
        for (const k of controllers) {
          const stage = k.stages.filter((s) => s <= step).length;
          if (k.c.update) k.c.update(stage, !!animate, step >= k.step);
        }
      },
      setAnimState(blockId, state) {
        for (const k of controllers) if (k.id === blockId && k.c.setState) k.c.setState(state);
      },
      destroy() {
        if (kind && kind.destroy) kind.destroy(root);
        for (const k of controllers) if (k.c.destroy) try { k.c.destroy(); } catch (e) {}
        root.remove();
      },
    };
    return api;
  };

  /* ---------- 开发模式下从服务器载入 animations/ 里的全部组件 ---------- */
  QS.animationFiles = [];
  QS.loadAnimations = async function () {
    if (window.__QS_DECK__) return; // 导出文件里动画已内联
    let files = [];
    try {
      files = await (await fetch('api/animations', { cache: 'no-store' })).json();
    } catch (e) {
      console.warn('Could not list animations (open through the local server)', e);
    }
    QS.animationFiles = files;
    for (const f of files) {
      await new Promise((ok) => {
        const s = document.createElement('script');
        s.src = 'animations/' + f + '?t=' + Date.now();
        s.onload = s.onerror = ok;
        document.head.appendChild(s);
      });
    }
  };

  /* ---------- 整份文稿中的文本（导出时字体子集化用） ---------- */
  QS.deckText = function (deck) {
    return JSON.stringify(deck);
  };
})();

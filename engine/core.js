/* QS 核心：数据模型、行内标记、内容块渲染、步骤控制。编辑器、放映器、导出文件共用这一份代码。 */
(function () {
  'use strict';
  const QS = (window.QS = window.QS || {});

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
    circuit: { make: () => ({ spec: 'qubits 2\nH 0\nC0 X 1', stepwise: 'none', scale: 1 }) },
    anim: { make: () => ({ component: '', params: {}, height: 360 }) },
    spacer: { make: () => ({ height: 24 }) },
  };
  QS.ANIMS = { fade: 1, rise: 1, none: 1 }; // 入场效果；名称见 effect.* 词条

  QS.makeBlock = function (deck, type) {
    return Object.assign({ id: QS.newId(deck, 'B'), type, step: 0, anim: 'fade' }, QS.BLOCK_TYPES[type].make());
  };
  /** 封面布局参数（px，基于 1280×720 画布）。每页封面的 coverLayout 只存改动过的项，其余用这里的默认值。 */
  QS.COVER_LAYOUT = {
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
  QS.coverLayout = (slide) => Object.assign({}, QS.COVER_LAYOUT, slide.coverLayout || {});

  QS.makeSlide = function (deck, type) {
    const s = { id: QS.newId(deck, 'S'), type, title: '', notes: '' };
    if (type === 'content') Object.assign(s, { title: T('default.slideTitle'), layout: 'single', split: 55, blocks: [] });
    if (type === 'section') Object.assign(s, { title: T('default.sectionTitle'), subtitle: '', number: '' });
    if (type === 'cover') Object.assign(s, { title: T('default.coverTitle'), subtitle: '', author: '', footer: '' });
    return s;
  };

  /* ---------- TODO 标注 ----------
   * 每页的 todos 数组：{ id: 'T-XXX', text, block, fx, fy } 钉在某个内容块上（fx/fy 为块内的相对位置 0–1，块移动时跟着走）
   *                    或 { id, text, x, y } 自由放在 1280×720 画布坐标上。
   * TODO 不是内容块，不参与排版，只在编辑器里显示。 */
  QS.todoCount = function (deck) {
    return deck.slides.reduce((a, s) => a + (s.todos || []).length, 0);
  };

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

  /* ---------- 章节页 ---------- */
  QS.SECTION_STYLES = ['panel', 'roadmap']; // 第一个为默认
  const SEC = { H: 720, TOP: 72, BOTTOM: 72, NUM_BOTTOM: 337, NUM_HEIGHT: 180 };
  /** 挂载后计算：路线图竖直位置（当前章节尽量居中，与整体居中加权折中并限制在边距内）；
   *  大号编号：0–9 中最高的数字刚好 NUM_HEIGHT 高，底边落在 NUM_BOTTOM，左边与标签首字母按墨迹对齐 */
  QS.layoutSection = function (root) {
    const list = root.querySelector('.qs-rm');
    if (list && list.offsetHeight) {
      const inIntro = root.classList.contains('qs-sec-intro');
      // 最终状态：当前章节高亮，位置在"当前章节居中"与"整体居中"之间加权折中
      root.classList.add('qs-sec-notrans');
      root.classList.remove('qs-sec-intro');
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
  };

  /** 入场两段式：先以统一样式、整体居中的状态让所有章节依次冒出；全部停稳后演化出当前章节的高亮和最终位置 */
  QS.playSectionIntro = function (root) {
    const list = root.querySelector('.qs-rm');
    if (!list || list.dataset.introTop === undefined) return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return QS.finishSectionIntro(root);
    clearTimeout(root._secTimer);
    root.classList.add('qs-sec-notrans', 'qs-sec-intro');
    list.style.top = list.dataset.introTop + 'px';
    void root.offsetHeight;
    root.classList.remove('qs-sec-notrans');
    // 第二段在最后一行"停稳"时立即开始：单行回弹动画 620ms，在 87%（约 540ms）时与终点偏差已小于 1px
    const start = parseFloat(getComputedStyle(root).getPropertyValue('--sec-rows')) * 1000 || 0;
    const settle = start + (list.children.length - 1) * 90 + 540;
    root._secTimer = setTimeout(() => evolveSection(root), settle);
  };
  QS.finishSectionIntro = function (root) {
    clearTimeout(root._secTimer);
    (root._secAnims || []).forEach((a) => a.cancel());
    root._secAnims = [];
    const list = root.querySelector('.qs-rm');
    root.classList.remove('qs-sec-intro');
    if (list && list.dataset.finalTop !== undefined) list.style.top = list.dataset.finalTop + 'px';
  };

  /* ---------- 第二段："绷紧的弹簧突然释放" ----------
   * 弹簧在画面出现前就已压紧（不可见），第二段的第一帧就是释放：
   *   线条：以极大初速度从 0 弹出，高速时被拉长变细；冲过终点后急刹（过冲短、压扁变粗），随后以松弛的弹簧来回晃几下停稳；
   *   标题：同一瞬间从小号弹性放大（FLIP：字号立即变为最终值，用 transform 从原尺寸弹过去），冲过头再回弹；编号跟着跳一下；
   *   其他行：被变大的当前章节推开，像波纹一样离得越远越晚动，各自带弹性；整个列表也弹性地移到最终位置；
   *   副标题：晚一拍被"甩"出来。
   * 所有运动由阻尼振子逐帧积分得到，采样成 Web Animations 关键帧。 */
  function spring(o) {
    // 阻尼分三段：释放时用 damping；第一次冲过终点后改用 brake 急刹（过冲短）；之后回到较轻的 damping 来回晃（振荡持久）
    const w = 2 * Math.PI * o.freq, dt = 1 / 240, brake = o.brake === undefined ? o.damping : o.brake;
    let x = o.x0 || 0, v = o.v0 || 0, phase = 0;
    const out = [{ x, v, a: 0 }];
    for (let t = dt; t < 3; t += dt) {
      const a = -w * w * (x - 1) - 2 * (phase === 1 ? brake : o.damping) * w * v;
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
    if (dList) play(list, springFrames(spring({ freq: 3.5, damping: 0.4, v0: 0 }), (s) => ({ transform: `translateY(${(dList * (1 - s.x)).toFixed(2)}px)` })));

    // 各行：被推开，像波纹一样按与当前章节的距离错开
    rows.forEach((r, i) => {
      const dy = firstRowY[i] - lastRowY[i];
      if (Math.abs(dy) < 0.5) return;
      play(r, springFrames(spring({ freq: 3.75, damping: 0.22, brake: 1.5, v0: 3 }), (s) => ({ transform: `translateY(${(dy * (1 - s.x)).toFixed(2)}px)` })), { delay: Math.abs(i - cur) * 28 });
    });

    if (title) {
      // 标题：字号已是最终值，用 transform 从第一段的尺寸和位置弹过去（左上角为原点）
      const s0 = firstSize / lastSize, dx = firstTitle.x - lastTitle.x, dy = firstTitle.y - lastTitle.y;
      title.style.transformOrigin = '0 0';
      play(title, springFrames(spring({ freq: 3.75, damping: 0.22, brake: 1.7, v0: 1 }), (s) => {
        const p = 1 - s.x, sc = 1 - (1 - s0) * p;
        return { transform: `translate(${(dx * p).toFixed(2)}px, ${(dy * p).toFixed(2)}px) scale(${sc.toFixed(4)})` };
      }));
      play(title, { frames: [{ color: '#a8a8a8' }, { color: getComputedStyle(title).color }], duration: 160 }, { easing: 'ease-out' });
    }
    if (num) {
      num.style.display = 'inline-block';
      num.style.transformOrigin = '0 70%';
      play(num, springFrames(spring({ x0: 1, v0: 3.5, freq: 4.25, damping: 0.2 }), (s) => ({ transform: `scale(${(1 + (s.x - 1) * 0.9).toFixed(4)})` })));
      play(num, { frames: [{ color: '#a8a8a8' }, { color: getComputedStyle(num).color }], duration: 140 }, { easing: 'ease-out' });
    }
    if (line) {
      // 线条：极大初速度弹出；粗细随速度和加速度变化（快时拉细，急停时压扁）
      const S = spring({ freq: 4.5, damping: 0.24, brake: 1.9, v0: 4 });
      const vmax = Math.max(...S.map((q) => Math.abs(q.v))), amax = Math.max(...S.slice(4).map((q) => Math.abs(q.a))) || 1;
      play(line, springFrames(S, (s) => {
        const sp = Math.abs(s.v) / vmax, squash = (Math.abs(s.a) / amax) * (1 - sp);
        const sy = Math.max(0.35, 1 - 0.6 * sp + 0.9 * squash);
        return { transform: `scaleX(${Math.max(0, s.x).toFixed(4)}) scaleY(${sy.toFixed(3)})` };
      }));
    }
    if (sub) {
      play(sub, springFrames(spring({ freq: 4, damping: 0.3, v0: 0 }), (s, u) => ({
        transform: `translateY(${(-22 * (1 - s.x)).toFixed(2)}px)`,
        opacity: Math.min(1, u * 5).toFixed(3),
      })), { delay: 50 });
    }
    root.classList.remove('qs-sec-notrans');
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
  QS.maxStep = function (slide) {
    let m = 0;
    for (const b of slide.blocks || []) m = Math.max(m, (b.step || 0) + QS.blockSpan(b));
    return m;
  };

  function splitLines(s) {
    return String(s || '').split('\n').filter((l) => l.trim() !== '');
  }
  function splitSeq(s) {
    return String(s || '').split(/\n\s*>>>\s*\n/).map((x) => x.trim()).filter((x) => x);
  }
  QS.splitSeq = splitSeq;

  /* ---------- 行内标记 ---------- */
  function esc(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }
  QS.esc = esc;

  QS.tex = function (latex, display) {
    if (!window.katex) return '<code>' + esc(latex) + '</code>';
    try {
      return katex.renderToString(latex, { displayMode: !!display, throwOnError: true, strict: false, trust: false });
    } catch (e) {
      return '<span class="qs-tex-err" title="' + esc(e.message) + '">' + esc(latex) + '</span>';
    }
  };

  /** 段内标记：[[高亮]]、{{蓝字}}、**加粗**、$行内公式$、$$行间公式$$ */
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
    box(b) {
      const e = el('div', 'qs-box qs-box-' + (b.variant || 'example'));
      if (b.label) e.appendChild(el('div', 'qs-box-label', QS.inline(b.label)));
      e.appendChild(el('div', 'qs-box-body', QS.paragraphs(b.body)));
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
      const e = el('div', 'qs-spacer');
      e.style.height = (b.height || 24) + 'px';
      return e;
    },
  };

  function renderBlock(b, ctx) {
    const r = RENDER[b.type];
    const inner = r ? r(b, ctx) : el('div', '', esc(QS.t('core.unknownBlock', { type: b.type })));
    const wrap = el('div', 'qs-block qs-b-' + b.type);
    wrap.dataset.blockId = b.id;
    wrap.dataset.step = b.step || 0;
    wrap.dataset.anim = b.anim || 'fade';
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
    root.style.setProperty('--accent', (deck.meta && deck.meta.accent) || '#5588F6');
    root.dataset.slideId = slide.id;
    const ctx = { anims: [], mode };

    if (slide.type === 'cover') {
      // 封面由四个模块组成：标题区、汇报人/副标题组、插画、页脚；位置和大小来自 coverLayout
      const L = QS.coverLayout(slide);
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
    } else if (slide.type === 'section') {
      // 路线图列出整份幻灯片的所有章节页，当前章节放大高亮；panel 样式在左侧加主题色面板和大号编号
      const style = QS.SECTION_STYLES.includes(deck.meta && deck.meta.sectionStyle) ? deck.meta.sectionStyle : QS.SECTION_STYLES[0];
      root.classList.add('qs-secstyle-' + style);
      const secs = deck.slides.filter((s) => s.type === 'section');
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
    } else {
      if (slide.title) root.appendChild(el('h1', 'qs-title', QS.inline(slide.title)));
      const body = el('div', 'qs-body');
      const split = slide.layout === 'split';
      if (split) {
        body.classList.add('qs-split');
        const r = Math.min(80, Math.max(20, slide.split || 55));
        body.style.gridTemplateColumns = r + 'fr ' + (100 - r) + 'fr';
      }
      const cols = split ? { left: el('div', 'qs-col qs-col-left'), right: el('div', 'qs-col qs-col-right') } : null;
      if (cols) {
        body.appendChild(cols.left);
        body.appendChild(cols.right);
      }
      for (const b of slide.blocks || []) {
        const node = renderBlock(b, ctx);
        if (cols) (b.col === 'right' ? cols.right : cols.left).appendChild(node);
        else body.appendChild(node);
      }
      root.appendChild(body);
    }

    if (deck.meta && deck.meta.pageNumbers && slide.type === 'content' && opts.pageNo) {
      root.appendChild(el('div', 'qs-pageno', String(opts.pageNo)));
    }

    // 分步内容一律从隐藏状态开始，避免翻页时后面步骤的内容先闪现再淡出
    root.querySelectorAll('[data-step]').forEach((n) => n.classList.add('qs-off'));

    // 挂载动画组件
    const controllers = [];
    const pending = ctx.anims.map((a) => () => {
      try {
        const params = QS.animParams(a.block);
        const api = {
          mode,
          accent: (deck.meta && deck.meta.accent) || '#5588F6',
          blockId: a.block.id,
          emit: (state) => opts.onAnimState && opts.onAnimState(a.block.id, state),
        };
        const c = a.def.mount(a.el, params, api) || {};
        controllers.push({ id: a.block.id, step: a.block.step || 0, span: QS.blockSpan(a.block), c });
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
        if (slide.type === 'section') {
          QS.layoutSection(root);
          // 字体（Futura / Futura ND）如果稍后才载入，载入后重新计算一次
          if (document.fonts && document.fonts.status !== 'loaded') document.fonts.ready.then(() => root.isConnected && QS.layoutSection(root));
        }
        if (current >= 0) api.setStep(current, false);
      },
      setStep(step, animate) {
        current = step;
        root.classList.toggle('qs-noanim', !animate);
        if (slide.type === 'section') animate ? QS.playSectionIntro(root) : QS.finishSectionIntro(root);
        root.querySelectorAll('[data-step]').forEach((n) => {
          const s = +n.dataset.step;
          const u = n.dataset.until !== undefined ? +n.dataset.until : Infinity;
          const on = step >= s && step < u;
          n.classList.toggle('qs-on', on);
          n.classList.toggle('qs-off', !on);
        });
        for (const k of controllers) {
          const stage = Math.max(0, Math.min(k.span, step - k.step));
          if (k.c.update) k.c.update(stage, !!animate, step >= k.step);
        }
      },
      setAnimState(blockId, state) {
        for (const k of controllers) if (k.id === blockId && k.c.setState) k.c.setState(state);
      },
      destroy() {
        clearTimeout(root._secTimer);
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

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
      const left = el('div', 'qs-cover-text');
      left.appendChild(el('h1', 'qs-cover-title', QS.inline(slide.title)));
      if (slide.author) left.appendChild(el('div', 'qs-cover-author', QS.inline(slide.author)));
      if (slide.subtitle) left.appendChild(el('div', 'qs-cover-sub', QS.inline(slide.subtitle)));
      root.appendChild(left);
      const art = el('div', 'qs-cover-art');
      if (QS.coverArt) art.innerHTML = QS.coverArt();
      root.appendChild(art);
      if (slide.footer) root.appendChild(el('div', 'qs-cover-footer', QS.inline(slide.footer)));
    } else if (slide.type === 'section') {
      const box = el('div', 'qs-section-box');
      if (slide.number) box.appendChild(el('div', 'qs-section-num', esc(slide.number)));
      box.appendChild(el('h1', 'qs-section-title', QS.inline(slide.title)));
      if (slide.subtitle) box.appendChild(el('div', 'qs-section-sub', QS.inline(slide.subtitle)));
      root.appendChild(box);
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
        if (current >= 0) api.setStep(current, false);
      },
      setStep(step, animate) {
        current = step;
        root.classList.toggle('qs-noanim', !animate);
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

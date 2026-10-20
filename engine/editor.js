/* 可视化编辑器（界面文字全部来自 engine/i18n.js） */
(function () {
  'use strict';
  const QS = window.QS;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const el = (tag, cls, html) => QS.el(tag, cls, html);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const t = (k, v) => QS.t(k, v);
  const DEFAULT_ACCENT = '#5588F6';

  const E = {
    deck: null,
    version: null,
    slideIdx: 0,
    blockId: null,
    todoId: null, // 选中的 TODO 标注
    showTodos: true,
    placing: false, // 正在放置新的 TODO
    todoList: false, // 右侧面板显示全部 TODO 列表
    previewStep: null, // null = 最终状态
    showIds: true,
    dirty: false,
    saving: false,
    undo: [],
    redo: [],
    committed: '',
    groupTimer: null,
    saveTimer: null,
    view: null,
    thumbs: new Map(),
    clip: null,
    playing: false,
  };
  QS.editor = E;

  /* ================= 数据辅助 ================= */
  const slide = () => E.deck.slides[E.slideIdx];
  const block = () => (slide().blocks || []).find((b) => b.id === E.blockId) || null;
  const todo = () => (slide().todos || []).find((x) => x.id === E.todoId) || null;
  const typeName = (b) => (QS.BLOCK_TYPES[b.type] ? t('type.' + b.type) : b.type);
  const slideTypeName = (type) => t('slide.' + type);

  function snippet(b) {
    let s = '';
    if (b.type === 'text') s = b.text;
    else if (b.type === 'list') s = b.items;
    else if (b.type === 'formula') s = b.latex;
    else if (b.type === 'box') s = (b.label || '') + ' ' + (b.body || '');
    else if (b.type === 'table') s = b.rows;
    else if (b.type === 'image') s = b.src || t('core.noImage');
    else if (b.type === 'circuit') s = b.spec;
    else if (b.type === 'anim') s = QS.tl((QS.animations[b.component] || {}).name) || b.component || t('core.animNone');
    s = String(s || '').replace(/\s+/g, ' ').trim();
    return s.length > 28 ? s.slice(0, 28) + '…' : s;
  }
  function refText(b) {
    const s = slide();
    const page = t('ed.refSlide', { i: E.slideIdx + 1, id: s.id });
    if (!b) return t('ed.ref.slide', { page, title: String(s.title || '').replace(/\s+/g, ' ') });
    if (/^T-/.test(b.id)) {
      const pb = b.block && (s.blocks || []).find((x) => x.id === b.block);
      const where = pb ? `${pb.id} ${typeName(pb)}` : `(${Math.round(b.x || 0)}, ${Math.round(b.y || 0)})`;
      const ref = t('ed.ref.todo', { page, id: b.id, where, snip: String(b.text || '').replace(/\s+/g, ' ').trim() });
      return (b.files || []).length ? ref + t('ed.ref.files', { files: b.files.join(', ') }) : ref;
    }
    return t('ed.ref.block', { page, id: b.id, type: typeName(b), snip: snippet(b) });
  }
  function copyRef(b) {
    const ref = refText(b);
    (navigator.clipboard ? navigator.clipboard.writeText(ref) : Promise.reject()).then(
      () => toast(t('ed.refCopied', { ref })),
      () => prompt(t('ed.refPrompt'), ref)
    );
  }
  function reassignIds(b) {
    b.id = QS.newId(E.deck, 'B');
    return b;
  }

  /* ================= 修改、撤销、保存 ================= */
  function changed(opts) {
    opts = opts || {};
    if (!E.groupTimer) {
      E.undo.push(E.committed);
      if (E.undo.length > 300) E.undo.shift();
      E.redo = [];
    }
    clearTimeout(E.groupTimer);
    E.groupTimer = setTimeout(closeGroup, 700);
    E.dirty = true;
    setStatus();
    if (opts.structure) {
      renderSlideList();
      renderProps();
    }
    scheduleCanvas();
    scheduleThumb(E.slideIdx);
    clearTimeout(E.saveTimer);
    E.saveTimer = setTimeout(save, 800);
  }
  function closeGroup() {
    clearTimeout(E.groupTimer);
    E.groupTimer = null;
    E.committed = JSON.stringify(E.deck);
  }
  function undo() {
    if (E.groupTimer) closeGroup();
    if (!E.undo.length) return toast(t('ed.nothingUndo'));
    E.redo.push(JSON.stringify(E.deck));
    E.deck = JSON.parse(E.undo.pop());
    afterHistoryJump();
  }
  function redo() {
    if (!E.redo.length) return toast(t('ed.nothingRedo'));
    E.undo.push(JSON.stringify(E.deck));
    E.deck = JSON.parse(E.redo.pop());
    afterHistoryJump();
  }
  function afterHistoryJump() {
    E.committed = JSON.stringify(E.deck);
    E.slideIdx = Math.min(E.slideIdx, E.deck.slides.length - 1);
    if (!block()) E.blockId = null;
    E.dirty = true;
    renderAll();
    clearTimeout(E.saveTimer);
    E.saveTimer = setTimeout(save, 300);
  }

  async function save(force) {
    clearTimeout(E.saveTimer);
    if (!E.dirty) return;
    if (E.saving) { E.saveTimer = setTimeout(save, 400); return; }
    E.saving = true;
    setStatus();
    const body = JSON.stringify(E.deck, null, 2);
    try {
      const res = await fetch('api/save?base=' + encodeURIComponent(E.version) + (force ? '&force=1' : ''), { method: 'POST', body });
      const j = await res.json();
      if (res.status === 409) {
        E.saving = false;
        return conflict();
      }
      if (!res.ok) throw new Error(j.error || res.status);
      E.version = j.version;
      if (JSON.stringify(E.deck, null, 2) === body) E.dirty = false;
      QS.gitBadgeSoon($('#ed-git'));
    } catch (e) {
      toast(t('ed.saveFail', { msg: e.message }), 'err');
      E.saveTimer = setTimeout(save, 3000);
    }
    E.saving = false;
    setStatus();
  }

  function setStatus() {
    const s = $('#ed-status');
    if (!s) return;
    s.textContent = t(E.saving ? 'ed.status.saving' : E.dirty ? 'ed.status.dirty' : 'ed.status.ok');
    s.className = E.saving ? 'saving' : E.dirty ? 'dirty' : 'ok';
    $('#ed-undo').disabled = !E.undo.length && !E.groupTimer;
    $('#ed-redo').disabled = !E.redo.length;
  }

  /* 外部修改（例如 Claude 直接改了 deck.json） */
  async function poll() {
    if (E.saving || E.playing) return;
    try {
      const j = await (await fetch('api/version', { cache: 'no-store' })).json();
      if (j.version !== E.version && !E.saving) {
        if (E.dirty) conflict();
        else await reloadFromDisk(t('ed.loadedExternal'));
      }
    } catch (e) {
      setOffline(true);
      return;
    }
    setOffline(false);
  }
  function setOffline(off) {
    document.body.classList.toggle('ed-offline', off);
  }
  async function reloadFromDisk(msg) {
    const res = await fetch('deck.json?t=' + Date.now(), { cache: 'no-store' });
    const deck = QS.migrate(await res.json());
    const v = (await (await fetch('api/version', { cache: 'no-store' })).json()).version;
    const keepSlide = slide() && slide().id, keepBlock = E.blockId;
    if (E.groupTimer) closeGroup();
    E.undo.push(JSON.stringify(E.deck));
    E.deck = deck;
    E.version = v;
    E.committed = JSON.stringify(deck);
    E.dirty = false;
    const si = deck.slides.findIndex((s) => s.id === keepSlide);
    E.slideIdx = si >= 0 ? si : Math.min(E.slideIdx, deck.slides.length - 1);
    E.blockId = keepBlock;
    if (!block()) E.blockId = null;
    renderAll();
    if (msg) toast(msg + t('ed.undoHint'));
  }
  let conflictOpen = false;
  function conflict() {
    if (conflictOpen) return;
    conflictOpen = true;
    modal(t('ed.conflict.title'), t('ed.conflict.body'), [
      { label: t('ed.conflict.theirs'), primary: true, run: () => reloadFromDisk(t('ed.loadedTheirs')) },
      { label: t('ed.conflict.mine'), run: () => save(true) },
    ]).then(() => (conflictOpen = false));
  }

  /* ================= 界面骨架 ================= */
  function buildShell() {
    document.body.innerHTML = `
    <header class="ed-top">
      <div class="ed-brand"><span class="ed-logo"></span><span id="ed-title"></span></div>
      <button id="ed-undo" title="${t('ed.undoTip')}">${t('ed.undo')}</button>
      <button id="ed-redo" title="${t('ed.redoTip')}">${t('ed.redo')}</button>
      <span id="ed-status"></span>
      <span class="ed-offline-tag">${t('ed.offline')}</span>
      <span class="ed-flex"></span>
      <button id="ed-todo" class="ed-todo-btn" title="${t('ed.todoTip')}"></button>
      <button id="ed-help">${t('ed.help')}</button>
      <button id="ed-git" class="ed-git-btn" title="${t('git.badgeTip')}">Git</button>
      <button id="ed-settings">${t('ed.settings')}</button>
      <button id="ed-print">${t('ed.print')}</button>
      <button id="ed-export">${t('ed.export')}</button>
      <button id="ed-presenter">${t('ed.presenter')}</button>
      <button id="ed-play-start">${t('ed.playStart')}</button>
      <button id="ed-play" class="primary" title="⌘↩">${t('ed.play')}</button>
    </header>
    <aside class="ed-slides">
      <div class="ed-slide-list"></div>
      <div class="ed-slide-add">
        <button data-add="content">${t('ed.addContent')}</button>
        <button data-add="section">${t('ed.addSection')}</button>
        <button data-add="cover">${t('ed.addCover')}</button>
      </div>
    </aside>
    <main class="ed-main">
      <div class="ed-canvas-head">
        <span id="ed-slide-ref"></span>
        <button id="ed-copy-slide-ref" class="small">${t('ed.copySlideRef')}</button>
        <button id="ed-add-todo" class="small ed-add-todo" title="${t('ed.addTodoTip')}">${t('ed.addTodo')}</button>
        <span class="ed-flex"></span>
        <label class="ed-check"><input type="checkbox" id="ed-show-todos" checked> ${t('ed.showTodos')}</label>
        <label class="ed-check"><input type="checkbox" id="ed-show-ids" checked> ${t('ed.showIds')}</label>
      </div>
      <div class="ed-canvas"><div class="ed-stage"></div></div>
      <div class="ed-stepbar"></div>
    </main>
    <aside class="ed-props"></aside>
    <div class="ed-toasts"></div>`;

    $('#ed-undo').onclick = undo;
    $('#ed-redo').onclick = redo;
    $('#ed-play').onclick = () => play(E.slideIdx);
    $('#ed-play-start').onclick = () => play(0);
    $('#ed-presenter').onclick = async () => {
      await save();
      const v = QS.visibleIndex(E.deck, E.slideIdx);
      if (v < 0) return toast(t('ed.allHidden'), 'err');
      window.open('present.html#presenter&s=' + (v + 1), 'qs-presenter');
    };
    $('#ed-print').onclick = async () => {
      await save();
      window.open('present.html#print', 'qs-print');
    };
    $('#ed-export').onclick = doExport;
    $('#ed-help').onclick = showHelp;
    $('#ed-git').onclick = () => QS.showGit();
    $('#ed-settings').onclick = showSettings;
    $('#ed-todo').onclick = () => {
      E.todoList = !E.todoList;
      E.todoId = null;
      E.blockId = null;
      $$('.ed-stage .qs-block').forEach((n) => n.classList.remove('ed-selected'));
      $$('.ed-stage .ed-pin').forEach((n) => n.classList.remove('sel'));
      renderProps();
    };
    $('#ed-copy-slide-ref').onclick = () => copyRef(null);
    $('#ed-show-ids').onchange = (e) => {
      E.showIds = e.target.checked;
      renderCanvas();
    };
    $('#ed-show-todos').onchange = (e) => {
      E.showTodos = e.target.checked;
      renderCanvas();
    };
    $('#ed-add-todo').onclick = () => setPlacing(!E.placing);
    $$('.ed-slide-add button').forEach((b) => (b.onclick = () => addSlide(b.dataset.add)));

    const canvas = $('.ed-canvas');
    new ResizeObserver(() => E.view && QS.fit(canvas, E.view.root)).observe(canvas);
    canvas.addEventListener('click', onCanvasClick);
    canvas.addEventListener('dblclick', (e) => {
      const w = e.target.closest('.qs-block');
      if (w) setTimeout(() => { const f = $('.ed-props [data-main]'); if (f) f.focus(); }, 0);
      else if (e.target.closest('.qs-title, .qs-cover-title, .qs-section-title')) {
        selectBlock(null);
        setTimeout(() => { const f = $('.ed-props [data-key=title]'); if (f) f.focus(); }, 0);
      }
    });
    canvas.addEventListener('contextmenu', onCanvasMenu);
    canvas.addEventListener('dragover', (e) => { if (hasFiles(e)) { e.preventDefault(); canvas.classList.add('drop'); } });
    canvas.addEventListener('dragleave', () => canvas.classList.remove('drop'));
    canvas.addEventListener('drop', (e) => {
      canvas.classList.remove('drop');
      if (!hasFiles(e)) return;
      e.preventDefault();
      const imgs = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'));
      const pin = e.target.closest('.ed-pin');
      const td = pin && (slide().todos || []).find((x) => x.id === pin.dataset.todoId);
      if (td) return attachFiles(td, imgs); // 拖到图钉上 = 作为这个 TODO 的附件
      for (const f of imgs) insertImageFile(f);
    });
    window.addEventListener('keydown', onKey);
    window.addEventListener('paste', onPaste);
    window.addEventListener('beforeunload', (e) => {
      if (E.dirty) { save(); e.preventDefault(); e.returnValue = ''; }
    });
  }
  const hasFiles = (e) => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');

  function renderAll() {
    $('#ed-title').textContent = (E.deck.meta && E.deck.meta.title) || t('ed.untitled');
    document.documentElement.style.setProperty('--accent', accent());
    renderSlideList();
    renderCanvas();
    renderProps();
    setStatus();
  }
  const accent = () => (E.deck.meta && E.deck.meta.accent) || DEFAULT_ACCENT;

  /* ================= 左侧：幻灯片列表 ================= */
  // 列表的滚动位置：重绘列表时保持不变，并存进 localStorage，刷新页面后恢复
  const LIST_SCROLL_KEY = 'qs-editor-list-scroll';
  let listScrollBound = false;
  function savedListScroll() {
    try { return +localStorage.getItem(LIST_SCROLL_KEY) || 0; } catch (e) { return 0; }
  }
  function bindListScroll(list) {
    if (listScrollBound) return;
    listScrollBound = true;
    let timer = null;
    list.addEventListener('scroll', () => {
      clearTimeout(timer);
      timer = setTimeout(() => { try { localStorage.setItem(LIST_SCROLL_KEY, String(Math.round(list.scrollTop))); } catch (e) {} }, 150);
    });
  }
  function renderSlideList() {
    const list = $('.ed-slide-list');
    const first = !listScrollBound;
    const keep = first ? savedListScroll() : list.scrollTop;
    for (const t of E.thumbs.values()) t.r && t.r.destroy();
    E.thumbs.clear();
    list.innerHTML = '';
    E.deck.slides.forEach((s, i) => {
      const item = el('div', 'ed-slide-item' + (i === E.slideIdx ? ' active' : '') + (s.hidden ? ' hidden-slide' : ''));
      item.draggable = true;
      item.dataset.idx = i;
      const hasTodo = (s.todos || []).length > 0;
      item.innerHTML = `<div class="ed-slide-meta"><b>${i + 1}</b><span class="ed-sid">${s.id}</span>${s.hidden ? `<span class="ed-hidden-dot" title="${t('ed.hiddenTip')}">${t('ed.hiddenBadge')}</span>` : ''}${hasTodo ? `<span class="ed-todo-dot" title="${t('ed.slideHasTodo')}">TODO</span>` : ''}
        <span class="ed-flex"></span><button class="tiny" data-act="dup" title="${t('ed.dupSlide')}">⧉</button><button class="tiny" data-act="del" title="${t('ed.delSlide')}">✕</button></div>
        <div class="ed-thumb"></div>`;
      item.onclick = (e) => {
        const act = e.target.dataset && e.target.dataset.act;
        if (act === 'dup') return dupSlide(i);
        if (act === 'del') return delSlide(i);
        E.todoList = false;
        selectSlide(i);
      };
      item.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/qs-slide', String(i));
        item.classList.add('dragging');
      });
      item.addEventListener('dragend', () => item.classList.remove('dragging'));
      item.addEventListener('dragover', (e) => {
        if (!Array.from(e.dataTransfer.types).includes('text/qs-slide')) return;
        e.preventDefault();
        const r = item.getBoundingClientRect();
        item.classList.toggle('drop-before', e.clientY < r.top + r.height / 2);
        item.classList.toggle('drop-after', e.clientY >= r.top + r.height / 2);
      });
      item.addEventListener('dragleave', () => item.classList.remove('drop-before', 'drop-after'));
      item.addEventListener('drop', (e) => {
        const from = +e.dataTransfer.getData('text/qs-slide');
        const after = item.classList.contains('drop-after');
        item.classList.remove('drop-before', 'drop-after');
        if (isNaN(from)) return;
        e.preventDefault();
        let to = i + (after ? 1 : 0);
        if (from < to) to--;
        if (from === to) return;
        const cur = slide();
        const [s0] = E.deck.slides.splice(from, 1);
        E.deck.slides.splice(to, 0, s0);
        E.slideIdx = E.deck.slides.indexOf(cur);
        changed({ structure: true });
      });
      list.appendChild(item);
      E.thumbs.set(i, { frame: $('.ed-thumb', item), r: null });
      drawThumb(i);
    });
    list.scrollTop = keep;
    bindListScroll(list);
    updateTodoBtn();
  }
  function drawThumb(i) {
    const t = E.thumbs.get(i);
    if (!t) return;
    if (t.r) t.r.destroy();
    const s = E.deck.slides[i];
    t.r = QS.renderStatic(t.frame, E.deck, i, QS.maxStep(s), { mode: 'thumb' });
  }
  let thumbTimer = null;
  function scheduleThumb(i) {
    clearTimeout(thumbTimer);
    thumbTimer = setTimeout(() => drawThumb(i), 400);
  }
  function updateTodoBtn() {
    const n = QS.todoCount(E.deck);
    const b = $('#ed-todo');
    b.textContent = 'TODO ' + n;
    b.style.display = n ? '' : 'none';
  }

  function selectSlide(i, blockId, todoId) {
    E.slideIdx = Math.max(0, Math.min(E.deck.slides.length - 1, i));
    E.blockId = blockId || null;
    E.todoId = todoId || null;
    E.previewStep = null;
    $$('.ed-slide-item').forEach((n) => n.classList.toggle('active', +n.dataset.idx === E.slideIdx));
    const act = $('.ed-slide-item.active');
    if (act) act.scrollIntoView({ block: 'nearest' });
    renderCanvas();
    renderProps();
  }
  function selectBlock(id) {
    E.blockId = id;
    E.todoId = null;
    E.todoList = false;
    $$('.ed-stage .qs-block').forEach((n) => n.classList.toggle('ed-selected', n.dataset.blockId === id));
    $$('.ed-stage .ed-pin').forEach((n) => n.classList.remove('sel'));
    renderProps();
  }
  function selectTodo(id) {
    E.todoId = id;
    E.blockId = null;
    $$('.ed-stage .qs-block').forEach((n) => n.classList.remove('ed-selected'));
    $$('.ed-stage .ed-pin').forEach((n) => n.classList.toggle('sel', n.dataset.todoId === id));
    renderProps();
  }

  function addSlide(type) {
    const s = QS.makeSlide(E.deck, type);
    E.deck.slides.splice(E.slideIdx + 1, 0, s);
    E.slideIdx++;
    E.blockId = null;
    changed({ structure: true });
  }
  function dupSlide(i) {
    const s = clone(E.deck.slides[i]);
    s.id = QS.newId(E.deck, 'S');
    E.deck.slides.splice(i + 1, 0, s);
    (s.blocks || []).forEach(reassignIds);
    E.slideIdx = i + 1;
    E.blockId = null;
    changed({ structure: true });
  }
  function delSlide(i) {
    if (E.deck.slides.length <= 1) return toast(t('ed.keepOne'));
    E.deck.slides.splice(i, 1);
    E.slideIdx = Math.min(E.slideIdx, E.deck.slides.length - 1);
    E.blockId = null;
    changed({ structure: true });
    toast(t('ed.slideDeleted', { n: i + 1 }));
  }

  /* ================= 中间：画布 ================= */
  let canvasTimer = null;
  function scheduleCanvas() {
    clearTimeout(canvasTimer);
    canvasTimer = setTimeout(renderCanvas, 60);
  }
  function renderCanvas() {
    try { if (slide()) localStorage.setItem('qs-editor-slide', slide().id); } catch (e) {}
    clearTimeout(canvasTimer);
    const stage = $('.ed-stage');
    if (E.view) E.view.destroy();
    stage.innerHTML = '';
    const s = slide();
    E.view = QS.renderSlide(E.deck, s, { mode: 'edit', pageNo: QS.pageNo(E.deck, E.slideIdx) });
    const root = E.view.root;
    root.classList.add('qs-scaled');
    root.classList.toggle('ed-ids', E.showIds);
    stage.appendChild(root);
    $$('.qs-block', root).forEach((w) => {
      const b = (s.blocks || []).find((x) => x.id === w.dataset.blockId);
      if (!b) return;
      const span = QS.blockSpan(b), ss = QS.stageSteps(b);
      const gaps = ss.some((v, i) => v !== (b.step || 0) + i + 1);
      const st = gaps ? [b.step || 0].concat(ss).join(',') : (b.step || 0) + (span ? '–' + QS.blockLastStep(b) : '');
      const badge = el('div', 'ed-badge', `${b.id}<i>${t('ed.badgeStep', { s: st })}</i>`);
      if (w.closest('.qs-col-right')) badge.classList.add('right');
      w.appendChild(badge);
      if (b.id === E.blockId) w.classList.add('ed-selected');
    });
    QS.fit($('.ed-canvas'), root);
    E.view.mount();
    const max = QS.maxStep(s);
    if (E.previewStep !== null && E.previewStep > max) E.previewStep = null;
    const step = E.previewStep === null ? max : E.previewStep;
    root.classList.toggle('qs-ghost', E.previewStep !== null);
    E.view.setStep(step, false);
    drawPins();
    $('#ed-slide-ref').innerHTML = t('ed.slideRef', { i: E.slideIdx + 1, n: E.deck.slides.length, id: s.id, type: slideTypeName(s.type) });
    renderStepbar(max);
  }

  function renderStepbar(max) {
    const bar = $('.ed-stepbar');
    bar.innerHTML = '';
    bar.appendChild(el('span', 'ed-stepbar-label', t('ed.stepPreview')));
    const mk = (label, val, title) => {
      const b = el('button', 'small' + (E.previewStep === val ? ' on' : ''), label);
      if (title) b.title = title;
      b.onclick = () => { E.previewStep = val; renderCanvas(); };
      bar.appendChild(b);
    };
    mk(t('ed.stepFinal'), null, t('ed.stepFinalTip'));
    for (let i = 0; i <= max; i++) mk(String(i), i, i === 0 ? t('ed.step0Tip') : t('ed.stepNTip', { n: i }));
    const play = el('button', 'small ed-step-play', t('ed.playSlide'));
    play.onclick = playInCanvas;
    bar.appendChild(play);
    bar.appendChild(el('span', 'ed-stepbar-hint', max ? t('ed.ghostHint') : t('ed.noSteps')));
  }
  let canvasPlay = null;
  function playInCanvas() {
    clearInterval(canvasPlay);
    E.previewStep = 0;
    renderCanvas();
    E.view.root.classList.remove('qs-ghost');
    E.view.setStep(0, true);
    const max = QS.maxStep(slide());
    let k = 0;
    canvasPlay = setInterval(() => {
      k++;
      if (k > max) {
        clearInterval(canvasPlay);
        E.previewStep = null;
        setTimeout(renderCanvas, 900);
        return;
      }
      E.view.setStep(k, true);
      $$('.ed-stepbar button').forEach((b) => b.classList.toggle('on', b.textContent === String(k)));
    }, 1300);
  }

  function onCanvasClick(e) {
    if (E.placing) {
      if (e.target.closest('.qs-slide')) addTodoAt(slidePoint(e.clientX, e.clientY));
      setPlacing(false);
      return;
    }
    if (e.target.closest('.ed-pin')) return;
    const w = e.target.closest('.qs-block');
    if (w) selectBlock(w.dataset.blockId);
    else if (e.target.closest('.qs-slide')) selectBlock(null);
  }

  function onCanvasMenu(e) {
    if (!e.target.closest('.qs-slide')) return;
    e.preventDefault();
    setPlacing(false);
    const pin = e.target.closest('.ed-pin');
    if (pin) {
      selectTodo(pin.dataset.todoId);
      const td = todo();
      return menu(e.clientX, e.clientY, [
        [t('ed.menu.copyRef'), () => copyRef(td)],
        [t('ed.menu.delTodo'), () => delTodo()],
      ]);
    }
    const pt = slidePoint(e.clientX, e.clientY);
    const items = [[t('ed.menu.addTodoHere'), () => addTodoAt(pt)]];
    const w = e.target.closest('.qs-block');
    if (w) {
      selectBlock(w.dataset.blockId);
      const b = block();
      items.push(
        [t('ed.menu.copyRef'), () => copyRef(b)],
        [t('ed.menu.dup'), () => dupBlock()],
        [t('ed.menu.up'), () => moveBlock(-1)],
        [t('ed.menu.down'), () => moveBlock(1)],
        [t('ed.menu.del'), () => delBlock()]
      );
    }
    menu(e.clientX, e.clientY, items);
  }

  /* ================= TODO 标注（图钉，不占版面，只在编辑器里显示） ================= */
  function slideBox() {
    const r = E.view.root.getBoundingClientRect();
    return { r, k: r.width / QS.W };
  }
  function slidePoint(cx, cy) {
    const { r, k } = slideBox();
    return { x: Math.max(0, Math.min(QS.W, (cx - r.left) / k)), y: Math.max(0, Math.min(QS.H, (cy - r.top) / k)) };
  }
  function blockRect(id) {
    const n = E.view.root.querySelector(`.qs-block[data-block-id="${id}"]`);
    if (!n) return null;
    const { r, k } = slideBox();
    const b = n.getBoundingClientRect();
    return { x: (b.left - r.left) / k, y: (b.top - r.top) / k, w: b.width / k, h: b.height / k };
  }
  function todoPos(td) {
    if (td.block) {
      const b = blockRect(td.block);
      if (b) return { x: b.x + (td.fx || 0) * b.w, y: b.y + (td.fy || 0) * b.h };
    }
    return { x: td.x == null ? 110 : td.x, y: td.y == null ? 160 : td.y };
  }
  /** 根据位置决定锚点：落在内容块上就钉在块上（相对位置），否则用画布坐标 */
  function anchorAt(pt) {
    const { r, k } = slideBox();
    const hit = document.elementsFromPoint(r.left + pt.x * k, r.top + pt.y * k)
      .map((n) => n.closest && n.closest('.qs-block'))
      .find((n) => n && E.view.root.contains(n));
    const a = { x: Math.round(pt.x), y: Math.round(pt.y) };
    if (hit) {
      const b = blockRect(hit.dataset.blockId);
      a.block = hit.dataset.blockId;
      a.fx = +Math.max(0, Math.min(1, (pt.x - b.x) / (b.w || 1))).toFixed(3);
      a.fy = +Math.max(0, Math.min(1, (pt.y - b.y) / (b.h || 1))).toFixed(3);
    }
    return a;
  }
  function setAnchor(td, pt) {
    delete td.block; delete td.fx; delete td.fy;
    Object.assign(td, anchorAt(pt));
  }
  function setPlacing(on) {
    E.placing = on;
    $('.ed-canvas').classList.toggle('placing', on);
    $('#ed-add-todo').classList.toggle('on', on);
    if (on) toast(t('ed.placeTodo'));
  }
  function addTodoAt(pt) {
    const s = slide();
    const td = { id: QS.newId(E.deck, 'T'), text: '' };
    setAnchor(td, pt);
    (s.todos = s.todos || []).push(td);
    E.todoId = td.id;
    E.blockId = null;
    changed({ structure: true });
    renderCanvas();
    setTimeout(() => { const f = $('.ed-props [data-main]'); if (f) f.focus(); }, 0);
  }
  function delTodo() {
    const s = slide(), td = todo();
    if (!td) return;
    s.todos.splice(s.todos.indexOf(td), 1);
    if (!s.todos.length) delete s.todos;
    E.todoId = null;
    changed({ structure: true });
    toast(t('ed.todo.deleted', { id: td.id }));
  }
  /** 把图片作为 TODO 附件上传到幻灯片的 todo/ 文件夹（只给 Claude 参考，不会导出） */
  async function attachFiles(td, files) {
    files = Array.from(files || []).filter((f) => f && f.type && f.type.startsWith('image/'));
    if (!files.length) return;
    try {
      for (const f of files) {
        const ext = (f.type.split('/')[1] || 'png').replace('jpeg', 'jpg').replace('svg+xml', 'svg');
        const name = td.id + '-' + (f.name && !/^image\.\w+$/.test(f.name) ? f.name : Date.now() + '.' + ext);
        (td.files = td.files || []).push(await uploadFile(f, 'todo', name));
      }
      E.todoId = td.id;
      E.blockId = null;
      changed({ structure: true });
      renderCanvas();
      toast(t('ed.todo.attached', { n: files.length, id: td.id }));
    } catch (e) {
      toast(t('ed.uploadFail', { msg: e.message }), 'err');
    }
  }

  function drawPins() {
    const s = slide();
    if (!E.showTodos || !(s.todos || []).length) return;
    const layer = el('div', 'ed-pins');
    E.view.root.appendChild(layer);
    s.todos.forEach((td, i) => {
      const p = todoPos(td);
      const pin = el('div', 'ed-pin' + (td.id === E.todoId ? ' sel' : '') + (p.x > QS.W - 380 ? ' flip' : ''));
      pin.dataset.todoId = td.id;
      pin.style.left = p.x + 'px';
      pin.style.top = p.y + 'px';
      const txt = String(td.text || '').trim() || t('ed.todo.empty');
      const nf = (td.files || []).length;
      pin.innerHTML = `<span class="ed-pin-dot">${i + 1}</span><span class="ed-pin-text">${nf ? `<b class="ed-pin-files">📎${nf}</b>` : ''}${QS.esc(txt)}</span>`;
      pin.title = td.id;
      pin.addEventListener('mousedown', (e) => startPinDrag(e, td, pin));
      layer.appendChild(pin);
    });
  }
  function startPinDrag(e, td, pin) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const start = { x: e.clientX, y: e.clientY };
    let moved = false, pt = null;
    const move = (ev) => {
      if (!moved && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 4) return;
      moved = true;
      pin.classList.add('dragging');
      pt = slidePoint(ev.clientX, ev.clientY);
      pin.style.left = pt.x + 'px';
      pin.style.top = pt.y + 'px';
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      if (!moved) return selectTodo(td.id);
      setAnchor(td, pt); // 拖动时图钉不接收鼠标，可以命中下面的内容块
      E.todoId = td.id;
      E.blockId = null;
      changed({ structure: true });
      renderCanvas();
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }

  /* ================= 内容块操作 ================= */
  function insertBlock(type, preset) {
    const s = slide();
    if (s.type !== 'content') return toast(t('ed.contentOnly'));
    s.blocks = s.blocks || [];
    const b = Object.assign(QS.makeBlock(E.deck, type), preset || {});
    const cur = block();
    const at = cur ? s.blocks.indexOf(cur) + 1 : s.blocks.length;
    if (cur) {
      b.col = cur.col;
      b.step = cur.step || 0;
    } else if (s.layout === 'split' && (type === 'anim' || type === 'image' || type === 'circuit')) b.col = 'right';
    s.blocks.splice(at, 0, b);
    E.blockId = b.id;
    changed({ structure: true });
    return b;
  }
  function dupBlock() {
    const s = slide(), b = block();
    if (!b) return;
    const c = reassignIds(clone(b));
    s.blocks.splice(s.blocks.indexOf(b) + 1, 0, c);
    E.blockId = c.id;
    changed({ structure: true });
  }
  function delBlock() {
    const s = slide(), b = block();
    if (!b) return;
    const i = s.blocks.indexOf(b);
    s.blocks.splice(i, 1);
    E.blockId = null;
    changed({ structure: true });
    toast(t('ed.blockDeleted', { id: b.id }));
  }
  function moveBlock(d) {
    const s = slide(), b = block();
    if (!b) return;
    const i = s.blocks.indexOf(b), j = i + d;
    if (j < 0 || j >= s.blocks.length) return;
    s.blocks.splice(i, 1);
    s.blocks.splice(j, 0, b);
    changed({ structure: true });
  }

  async function uploadFile(f, kind, name) {
    const q = 'name=' + encodeURIComponent(name || f.name || 'image.png') + (kind ? '&kind=' + kind : '');
    const res = await fetch('api/upload?' + q, { method: 'POST', body: f });
    const j = await res.json();
    if (!j.ok) throw new Error(j.error);
    return j.path;
  }
  async function insertImageFile(f) {
    try {
      const path = await uploadFile(f);
      insertBlock('image', { src: path });
      toast(t('ed.imageSaved', { path }));
    } catch (e) {
      toast(t('ed.uploadFail', { msg: e.message }), 'err');
    }
  }

  /* ================= 右侧：属性面板 ================= */
  function renderProps() {
    const p = $('.ed-props');
    p.innerHTML = '';
    E.stageSync = null;
    const b = block(), td = todo();
    $('#ed-todo').classList.toggle('on', E.todoList);
    if (td) return todoProps(p, td);
    else if (E.todoList) return todoListProps(p);
    else if (b) blockProps(p, b);
    else slideProps(p, slide());
    if (slide().type === 'content') palette(p);
  }

  /** 全部 TODO 列表（按页分组），点击一条跳到对应页面并打开详情 */
  function todoListProps(p) {
    const n = QS.todoCount(E.deck);
    const sec = section(p, t('ed.todoList.title', { n }));
    if (!n) {
      sec.appendChild(el('div', 'ed-empty', QS.esc(t('ed.todoList.empty'))));
      return;
    }
    sec.appendChild(el('p', 'ed-hint', QS.esc(t('ed.todoList.hint'))));
    E.deck.slides.forEach((s, si) => {
      if (!(s.todos || []).length) return;
      const title = String(s.title || '').replace(/\s+/g, ' ').replace(/\$[^$]*\$/g, '…');
      sec.appendChild(el('div', 'ed-tl-slide', `${QS.esc(t('ed.refSlide', { i: si + 1, id: s.id }))} <span>${QS.esc(title)}</span>`));
      s.todos.forEach((td, ti) => {
        const pb = td.block && (s.blocks || []).find((x) => x.id === td.block);
        const where = pb ? t('ed.todo.on', { id: pb.id, type: typeName(pb) }) : t('ed.todo.at', { x: Math.round(td.x || 0), y: Math.round(td.y || 0) });
        const nf = (td.files || []).length;
        const row = el('div', 'ed-tl-item');
        row.innerHTML = `<span class="ed-tl-dot">${ti + 1}</span><span class="ed-tl-body">
          <span class="ed-tl-text">${QS.esc(String(td.text || '').trim() || t('ed.todo.empty'))}</span>
          <span class="ed-tl-meta"><code>${td.id}</code> · ${QS.esc(where)}${nf ? ` · 📎${nf}` : ''}</span></span>`;
        row.onclick = () => selectSlide(si, null, td.id);
        sec.appendChild(row);
      });
    });
  }

  function section(p, title) {
    const sec = el('section', 'ed-sec');
    if (title) sec.appendChild(el('h3', '', title));
    p.appendChild(sec);
    return sec;
  }
  function field(sec, label, input, hint) {
    const f = el('label', 'ed-field');
    f.appendChild(el('span', 'ed-label', label));
    f.appendChild(input);
    if (hint) f.appendChild(el('span', 'ed-hint', hint));
    sec.appendChild(f);
    return f;
  }
  function textIn(obj, key, o) {
    o = o || {};
    const inp = o.rows ? el('textarea') : el('input');
    if (o.rows) inp.rows = o.rows;
    else inp.type = 'text';
    if (o.mono) inp.classList.add('mono');
    if (o.main) inp.dataset.main = '1';
    inp.dataset.key = key;
    inp.placeholder = o.placeholder || '';
    inp.value = obj[key] == null ? '' : obj[key];
    inp.spellcheck = false;
    inp.addEventListener('input', () => {
      obj[key] = inp.value;
      changed();
      if (o.after) o.after(inp.value);
      if (o.listRefresh) refreshOutline();
    });
    if (o.rows) autoGrow(inp);
    return inp;
  }
  function autoGrow(ta) {
    const fitH = () => { ta.style.height = 'auto'; ta.style.height = Math.min(420, ta.scrollHeight + 2) + 'px'; };
    ta.addEventListener('input', fitH);
    setTimeout(fitH, 0);
  }
  /** 动画组件各阶段在第几步播放：每个阶段一个输入框；改动后严格递增规整，和默认的连续步骤相同时去掉 stageSteps */
  function stageEditor(sec, b) {
    const n = QS.blockSpan(b);
    const desc = el('div', 'ed-desc');
    sec.appendChild(desc);
    const box = el('div', 'ed-stages');
    sec.appendChild(box);
    const inputs = [];
    const isDefault = (ss) => ss.every((v, i) => v === (b.step || 0) + i + 1);
    const sync = () => {
      const ss = QS.stageSteps(b);
      inputs.forEach((inp, i) => { if (document.activeElement !== inp) inp.value = ss[i]; inp.min = (i ? ss[i - 1] : b.step || 0) + 1; });
      desc.textContent = t(isDefault(ss) ? 'ed.f.animSteps' : 'ed.f.animStepsCustom', { n, a: b.step || 0, b: ss[ss.length - 1] });
      reset.disabled = isDefault(ss);
    };
    const commit = (i, v) => {
      const ss = QS.stageSteps(b);
      ss[i] = v;
      for (let k = i + 1; k < n; k++) if (ss[k] <= ss[k - 1]) ss[k] = ss[k - 1] + 1; // 后面的阶段被推后，保持递增
      b.stageSteps = ss;
      if (isDefault(QS.stageSteps(b))) delete b.stageSteps;
      changed();
      sync();
      renderStepbar(QS.maxStep(slide()));
    };
    for (let i = 0; i < n; i++) {
      const row = el('label', 'ed-stage');
      row.appendChild(el('span', '', t('ed.f.stageN', { i: i + 1 })));
      const inp = el('input');
      inp.type = 'number';
      inp.max = 99;
      inp.addEventListener('change', () => { if (inp.value !== '') commit(i, Math.max(+inp.min, Math.round(+inp.value))); sync(); });
      row.appendChild(inp);
      box.appendChild(row);
      inputs.push(inp);
    }
    const reset = el('button', 'small', t('ed.f.stageReset'));
    reset.onclick = (e) => { e.preventDefault(); delete b.stageSteps; changed(); sync(); renderStepbar(QS.maxStep(slide())); };
    box.appendChild(reset);
    E.stageSync = sync; // 块的出现步骤改变时刷新
    sync();
  }
  function numIn(obj, key, o) {
    o = o || {};
    const inp = el('input');
    inp.type = o.range ? 'range' : 'number';
    if (o.min !== undefined) inp.min = o.min;
    if (o.max !== undefined) inp.max = o.max;
    inp.step = o.step || 1;
    inp.value = obj[key] == null ? (o.def == null ? '' : o.def) : obj[key];
    const out = o.range ? el('span', 'ed-range-val', String(inp.value) + (o.unit || '')) : null;
    inp.addEventListener('input', () => {
      if (inp.value === '') return;
      obj[key] = +inp.value;
      if (out) out.textContent = inp.value + (o.unit || '');
      changed();
      if (o.after) o.after();
    });
    if (!out) return inp;
    const w = el('div', 'ed-range');
    w.appendChild(inp);
    w.appendChild(out);
    return w;
  }
  function selectIn(obj, key, options, o) {
    o = o || {};
    const s = el('select');
    for (const [v, label] of options) {
      const op = el('option', '', label);
      op.value = v;
      s.appendChild(op);
    }
    s.value = obj[key] == null ? options[0][0] : String(obj[key]);
    s.addEventListener('change', () => {
      let v = s.value;
      if (v === 'true') v = true;
      else if (v === 'false') v = false;
      obj[key] = v;
      changed({ structure: !!o.structure });
      if (o.after) o.after();
    });
    return s;
  }
  function checkIn(sec, obj, key, label, o) {
    o = o || {};
    const l = el('label', 'ed-check');
    const c = el('input');
    c.type = 'checkbox';
    c.checked = obj[key] === undefined ? !!o.def : !!obj[key];
    c.onchange = () => {
      obj[key] = c.checked;
      changed({ structure: !!o.structure });
    };
    l.appendChild(c);
    l.appendChild(document.createTextNode(' ' + label));
    sec.appendChild(l);
    return l;
  }
  function seg(obj, key, options, o) {
    o = o || {};
    const w = el('div', 'ed-seg');
    const cur = obj[key] == null ? options[0][0] : obj[key];
    for (const [v, label] of options) {
      const b = el('button', v === cur ? 'on' : '', label);
      b.type = 'button';
      b.onclick = (e) => {
        e.preventDefault();
        obj[key] = v;
        $$('button', w).forEach((x) => x.classList.toggle('on', x === b));
        changed({ structure: !!o.structure });
      };
      w.appendChild(b);
    }
    return w;
  }

  function slideProps(p, s) {
    const sec = section(p, t('ed.settingsFor', { type: slideTypeName(s.type) }));
    const ref = el('div', 'ed-idrow', `<code>${s.id}</code><span class="ed-flex"></span>`);
    const cb = el('button', 'small', t('ed.copySlideRef'));
    cb.onclick = () => copyRef(null);
    ref.appendChild(cb);
    sec.appendChild(ref);
    const hid = el('label', 'ed-check ed-hide-toggle');
    const hc = el('input');
    hc.type = 'checkbox';
    hc.checked = !!s.hidden;
    hc.onchange = () => {
      if (hc.checked) s.hidden = true;
      else delete s.hidden;
      changed({ structure: true }); // 路线图和页码随之变化，缩略图全部重画
    };
    hid.appendChild(hc);
    hid.appendChild(document.createTextNode(' ' + t('ed.hidden')));
    sec.appendChild(hid);
    sec.appendChild(el('div', 'ed-hint', t('ed.hiddenHint')));
    field(sec, s.type === 'content' ? t('ed.title') : t('ed.mainTitle'), textIn(s, 'title', { rows: s.type === 'cover' ? 2 : 0 }), s.type === 'cover' ? t('ed.titleBreakHint') : '');
    if (s.type === 'cover') {
      field(sec, t('ed.titleAlt'), textIn(s, 'titleAlt', { rows: 2 }), t('ed.titleAltHint'));
      field(sec, t('ed.coverSub'), textIn(s, 'subtitle', { rows: 2 }));
      field(sec, t('ed.author'), textIn(s, 'author'));
      field(sec, t('ed.footer'), textIn(s, 'footer'));
    }
    if (s.type === 'section') {
      field(sec, t('ed.sectionNum'), textIn(s, 'number'), t('ed.sectionNumHint'));
      field(sec, t('ed.subtitle'), textIn(s, 'subtitle', { rows: 2 }));
    }
    if (s.type === 'content') {
      field(sec, t('ed.layout'), seg(s, 'layout', [['single', t('ed.layout.single')], ['split', t('ed.layout.split')]], { structure: true }));
      if (s.layout === 'split') field(sec, t('ed.leftWidth'), numIn(s, 'split', { range: true, min: 25, max: 75, def: 55, unit: '%' }));
    }
    field(sec, t('ed.notes'), textIn(s, 'notes', { rows: 4, placeholder: t('ed.notesPh') }));
    if (s.type === 'cover') coverLayoutProps(p, s);

    if (s.type === 'content') {
      const o = section(p, t('ed.blocksOnSlide'));
      o.appendChild(el('div', 'ed-outline'));
      refreshOutline();
      if (!(s.blocks || []).length) o.appendChild(el('div', 'ed-empty', t('ed.noBlocks')));
    }
  }

  /** 封面布局：按模块分组的滑块，拖动时画布实时更新；只把改动过的项写进 coverLayout */
  function coverLayoutProps(p, s) {
    const D = QS.COVER_LAYOUT;
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
      changed({ structure: true });
    };
    sec.appendChild(reset);
  }

  function refreshOutline() {
    const box = $('.ed-outline');
    if (!box) return;
    const s = slide();
    box.innerHTML = '';
    (s.blocks || []).forEach((b, i) => {
      const r = el('div', 'ed-ol-item' + (b.id === E.blockId ? ' on' : ''));
      r.draggable = true;
      r.innerHTML = `<span class="ed-ol-grip">⋮⋮</span><code>${b.id}</code><span class="ed-ol-type">${typeName(b)}</span>
        <span class="ed-ol-snip">${QS.esc(snippet(b))}</span><span class="ed-ol-step">${s.layout === 'split' ? (b.col === 'right' ? t('ed.colR') : t('ed.colL')) : ''}${t('ed.stepShort', { s: b.step || 0 })}</span>`;
      r.onclick = () => selectBlock(b.id);
      r.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/qs-block', String(i)));
      r.addEventListener('dragover', (e) => {
        if (!Array.from(e.dataTransfer.types).includes('text/qs-block')) return;
        e.preventDefault();
        r.classList.add('drop-before');
      });
      r.addEventListener('dragleave', () => r.classList.remove('drop-before'));
      r.addEventListener('drop', (e) => {
        r.classList.remove('drop-before');
        const from = +e.dataTransfer.getData('text/qs-block');
        if (isNaN(from)) return;
        let to = i;
        if (from < to) to--;
        const [x] = s.blocks.splice(from, 1);
        s.blocks.splice(to, 0, x);
        changed({ structure: true });
      });
      box.appendChild(r);
    });
  }

  function palette(p) {
    const sec = section(p, block() ? t('ed.addAfter') : t('ed.addBlock'));
    sec.classList.add('ed-palette');
    for (const type of Object.keys(QS.BLOCK_TYPES)) {
      const b = el('button', 'small', t('type.' + type));
      b.onclick = () => insertBlock(type);
      sec.appendChild(b);
    }
  }

  function todoProps(p, td) {
    const s = slide();
    const top = el('div', 'ed-back');
    // 从 TODO 列表进来的，返回列表；否则返回本页设置
    const back = el('button', 'small', E.todoList ? t('ed.todo.backToList') : t('ed.backToSlide'));
    back.onclick = () => {
      if (!E.todoList) return selectBlock(null);
      E.todoId = null;
      $$('.ed-stage .ed-pin').forEach((n) => n.classList.remove('sel'));
      renderProps();
    };
    top.appendChild(back);
    p.appendChild(top);
    const sec = section(p, t('ed.todo.title'));
    const ref = el('div', 'ed-idrow', `<code>${td.id}</code><span class="ed-flex"></span>`);
    const cb = el('button', 'small', t('ed.copyRef'));
    cb.title = t('ed.copyRefTip');
    cb.onclick = () => copyRef(td);
    ref.appendChild(cb);
    sec.appendChild(ref);
    field(sec, t('ed.f.todo'), textIn(td, 'text', { rows: 6, main: true, placeholder: t('ed.f.todoPh') }));
    const pb = td.block && (s.blocks || []).find((x) => x.id === td.block);
    sec.appendChild(el('div', 'ed-desc', pb
      ? QS.esc(t('ed.todo.pinnedTo', { id: pb.id, type: typeName(pb) }))
      : QS.esc(t('ed.todo.free', { x: Math.round(td.x || 0), y: Math.round(td.y || 0) }))));
    sec.appendChild(el('p', 'ed-hint', QS.esc(t('ed.todo.dragHint'))));

    const fsec = section(p, t('ed.todo.files'));
    fsec.classList.add('ed-todo-files');
    const grid = el('div', 'ed-thumbs');
    (td.files || []).forEach((f, i) => {
      const th = el('div', 'ed-thumb-file');
      th.innerHTML = `<img src="${QS.esc(f)}" alt=""><span>${QS.esc(f.replace(/^todo\//, ''))}</span>`;
      th.title = f;
      th.onclick = () => window.open(f, '_blank');
      const x = el('button', 'tiny', '✕');
      x.title = t('ed.todo.removeFile');
      x.onclick = (e) => {
        e.stopPropagation();
        td.files.splice(i, 1);
        if (!td.files.length) delete td.files;
        changed({ structure: true });
      };
      th.appendChild(x);
      grid.appendChild(th);
    });
    fsec.appendChild(grid);
    const fi = el('input');
    fi.type = 'file';
    fi.accept = 'image/*';
    fi.multiple = true;
    fi.style.display = 'none';
    fi.onchange = () => attachFiles(td, fi.files);
    const add = el('button', 'small', t('ed.todo.addFile'));
    add.onclick = () => fi.click();
    fsec.appendChild(add);
    fsec.appendChild(fi);
    fsec.appendChild(el('p', 'ed-hint', QS.esc(t('ed.todo.filesHint'))));
    fsec.addEventListener('dragover', (e) => { if (hasFiles(e)) { e.preventDefault(); fsec.classList.add('drop'); } });
    fsec.addEventListener('dragleave', () => fsec.classList.remove('drop'));
    fsec.addEventListener('drop', (e) => {
      fsec.classList.remove('drop');
      if (!hasFiles(e)) return;
      e.preventDefault();
      attachFiles(td, e.dataTransfer.files);
    });

    const a = section(p, '');
    a.classList.add('ed-actions');
    const del = el('button', 'small danger', t('ed.menu.delTodo'));
    del.onclick = delTodo;
    a.appendChild(del);
  }

  function blockProps(p, b) {
    const s = slide();
    const top = el('div', 'ed-back');
    const back = el('button', 'small', t('ed.backToSlide'));
    back.onclick = () => selectBlock(null);
    top.appendChild(back);
    p.appendChild(top);

    const sec = section(p, typeName(b));
    const ref = el('div', 'ed-idrow', `<code>${b.id}</code><span class="ed-flex"></span>`);
    const cb = el('button', 'small', t('ed.copyRef'));
    cb.title = t('ed.copyRefTip');
    cb.onclick = () => copyRef(b);
    ref.appendChild(cb);
    sec.appendChild(ref);

    const T = {
      text() {
        field(sec, t('ed.f.text'), textIn(b, 'text', { rows: 5, main: true, listRefresh: true }), t('ed.markupHint'));
        field(sec, t('ed.f.size'), seg(b, 'size', [['normal', t('ed.f.size.normal')], ['large', t('ed.f.size.large')], ['small', t('ed.f.size.small')]]));
        field(sec, t('ed.f.align'), seg(b, 'align', [['', t('ed.f.align.left')], ['center', t('ed.f.align.center')]]));
      },
      list() {
        field(sec, t('ed.f.items'), textIn(b, 'items', { rows: 5, main: true, listRefresh: true }), t('ed.markupHint'));
        checkIn(sec, b, 'ordered', t('ed.f.ordered'));
        checkIn(sec, b, 'stepwise', t('ed.f.stepwise'), { structure: true });
      },
      formula() {
        const err = el('div', 'ed-tex-err');
        const check = (v) => {
          const msgs = [];
          for (const tex of QS.splitSeq(v)) {
            try { katex.renderToString(tex, QS.katexOptions(true)); } catch (e) { msgs.push(e.message.replace(/^KaTeX parse error: /, '')); }
          }
          err.textContent = msgs.length ? t('ed.f.texErr', { msg: msgs.join('; ') }) : '';
        };
        field(sec, t('ed.f.latex'), textIn(b, 'latex', { rows: 4, mono: true, main: true, listRefresh: true, after: check }), t('ed.f.latexHint'));
        sec.appendChild(err);
        check(b.latex);
        checkIn(sec, b, 'boxed', t('ed.f.boxed'), { def: true });
        checkIn(sec, b, 'morph', t('ed.f.morph'));
        field(sec, t('ed.f.sizePct'), numIn(b, 'size', { range: true, min: 60, max: 180, step: 5, def: 100, unit: '%' }));
        field(sec, t('ed.f.caption'), textIn(b, 'caption'));
      },
      box() {
        field(sec, t('ed.f.label'), textIn(b, 'label', { placeholder: t('ed.f.labelPh') }));
        field(sec, t('ed.f.variant'), seg(b, 'variant', [['example', t('ed.f.variant.example')], ['note', t('ed.f.variant.note')]]));
        field(sec, t('ed.f.body'), textIn(b, 'body', { rows: 5, main: true, listRefresh: true }), t('ed.markupHint') + ' ' + t('ed.f.boxSeqHint'));
      },
      image() {
        const pick = el('div', 'ed-row');
        const up = el('button', 'small', t('ed.f.pickImage'));
        const fi = el('input');
        fi.type = 'file';
        fi.accept = 'image/*';
        fi.style.display = 'none';
        fi.onchange = async () => {
          if (!fi.files[0]) return;
          try {
            b.src = await uploadFile(fi.files[0]);
            changed({ structure: true });
          } catch (e) { toast(t('ed.uploadFail', { msg: e.message }), 'err'); }
        };
        up.onclick = (e) => { e.preventDefault(); fi.click(); };
        pick.appendChild(up);
        pick.appendChild(fi);
        const exist = el('select');
        exist.innerHTML = `<option value="">${t('ed.f.fromAssets')}</option>`;
        fetch('api/assets').then((r) => r.json()).then((fs) => fs.forEach((f) => {
          const o = el('option', '', f);
          o.value = 'assets/' + f;
          exist.appendChild(o);
        }));
        exist.onchange = () => { if (exist.value) { b.src = exist.value; changed({ structure: true }); } };
        pick.appendChild(exist);
        field(sec, t('ed.f.image'), pick, t('ed.f.imageHint'));
        field(sec, t('ed.f.path'), textIn(b, 'src', { mono: true }));
        field(sec, t('ed.f.width'), numIn(b, 'width', { range: true, min: 10, max: 100, def: 60, unit: '%' }));
        field(sec, t('ed.f.caption'), textIn(b, 'caption'));
      },
      table() {
        field(sec, t('ed.f.rows'), textIn(b, 'rows', { rows: 6, mono: true, main: true, listRefresh: true }), t('ed.f.rowsHint'));
        checkIn(sec, b, 'header', t('ed.f.tHeader'), { def: true, structure: true });
        checkIn(sec, b, 'headerCol', t('ed.f.tHeaderCol'));
        checkIn(sec, b, 'full', t('ed.f.tFull'));
        checkIn(sec, b, 'stepwise', t('ed.f.tStepwise'), { structure: true });
        field(sec, t('ed.f.tAlign'), seg(b, 'align', [['center', t('ed.f.align.center')], ['left', t('ed.f.align.left')]]));
        field(sec, t('ed.f.sizePct'), numIn(b, 'size', { range: true, min: 60, max: 150, step: 5, def: 100, unit: '%' }));
        field(sec, t('ed.f.caption'), textIn(b, 'caption'));
      },
      circuit() {
        field(sec, t('ed.f.spec'), textIn(b, 'spec', { rows: 8, mono: true, main: true, listRefresh: true }));
        const help = el('details', 'ed-details');
        help.innerHTML = `<summary>${t('ed.f.specHelp')}</summary><pre>${QS.esc(t('ed.f.specHelpBody'))}</pre>`;
        sec.appendChild(help);
        field(sec, t('ed.f.circuitStep'), seg(b, 'stepwise', [['none', t('ed.f.circuitStep.none')], ['gate', t('ed.f.circuitStep.gate')], ['column', t('ed.f.circuitStep.column')]], { structure: true }));
        field(sec, t('ed.f.scale'), numIn(b, 'scale', { range: true, min: 0.5, max: 1.6, step: 0.05, def: 1 }));
      },
      anim() {
        const opts = [['', t('ed.f.componentNone')]].concat(Object.values(QS.animations).map((d) => [d.id, QS.tl(d.name) || d.id]));
        field(sec, t('ed.f.component'), selectIn(b, 'component', opts, { structure: true, after: () => { b.params = {}; renderProps(); } }));
        const def = QS.animations[b.component];
        if (def && def.description) sec.appendChild(el('div', 'ed-desc', QS.esc(QS.tl(def.description))));
        field(sec, t('ed.f.height'), numIn(b, 'height', { range: true, min: 120, max: 560, step: 10, def: 360, unit: 'px' }));
        if (def && def.params && def.params.length) {
          const ps = section(p, t('ed.f.params'));
          b.params = b.params || {};
          for (const d of def.params) {
            if (b.params[d.key] === undefined) b.params[d.key] = d.default;
            let input;
            if (d.type === 'select') input = selectIn(b.params, d.key, d.options.map((o) => (Array.isArray(o) ? o.map(String) : [String(o), String(o)])), { structure: true });
            else if (d.type === 'bool') { checkIn(ps, b.params, d.key, QS.tl(d.label) || d.key, { structure: true }); continue; }
            else if (d.type === 'text') input = textIn(b.params, d.key);
            else if (d.type === 'color') { input = el('input'); input.type = 'color'; input.value = b.params[d.key]; input.oninput = () => { b.params[d.key] = input.value; changed(); }; }
            else input = numIn(b.params, d.key, { range: d.min !== undefined && d.max !== undefined, min: d.min, max: d.max, step: d.step || 1, def: d.default, after: () => renderStepbar(QS.maxStep(s)) });
            field(ps, QS.tl(d.label) || d.key, input, QS.tl(d.hint));
          }
        }
        if (def && def.steps && QS.blockSpan(b)) stageEditor(sec, b);
      },
      spacer() {
        field(sec, t('ed.f.height'), numIn(b, 'height', { range: true, min: 4, max: 200, def: 24, unit: 'px' }));
      },
    };
    (T[b.type] || (() => {}))();

    const c = section(p, t('ed.appear'));
    const stepRow = el('div', 'ed-row');
    const minus = el('button', 'small', '−'), plus = el('button', 'small', '+');
    const stepIn = numIn(b, 'step', { min: 0, max: 99, def: 0, after: () => { refreshOutline(); if (E.stageSync) E.stageSync(); } });
    minus.onclick = (e) => { e.preventDefault(); b.step = Math.max(0, (b.step || 0) - 1); stepIn.value = b.step; changed(); refreshOutline(); if (E.stageSync) E.stageSync(); };
    plus.onclick = (e) => { e.preventDefault(); b.step = (b.step || 0) + 1; stepIn.value = b.step; changed(); refreshOutline(); if (E.stageSync) E.stageSync(); };
    stepRow.appendChild(minus);
    stepRow.appendChild(stepIn);
    stepRow.appendChild(plus);
    field(c, t('ed.appearStep'), stepRow, t('ed.appearStepHint'));
    field(c, t('ed.effect'), selectIn(b, 'anim', Object.keys(QS.ANIMS).map((k) => [k, t('effect.' + k)])));
    // 消失的步骤：空着 = 一直显示
    const untilIn = el('input');
    untilIn.type = 'number';
    untilIn.min = 1;
    untilIn.max = 99;
    untilIn.value = b.until == null ? '' : b.until;
    untilIn.addEventListener('input', () => {
      if (untilIn.value === '') delete b.until;
      else b.until = +untilIn.value;
      changed();
      refreshOutline();
    });
    field(c, t('ed.untilStep'), untilIn, t('ed.untilStepHint'));
    // 出现之前是否占位置（默认占；关掉时块出现时才把下面的内容撑开）
    const rsLab = el('label', 'ed-check');
    const rsBox = el('input');
    rsBox.type = 'checkbox';
    rsBox.checked = b.reserve !== false;
    rsBox.onchange = () => {
      if (rsBox.checked) delete b.reserve;
      else b.reserve = false;
      changed();
    };
    rsLab.appendChild(rsBox);
    rsLab.appendChild(document.createTextNode(' ' + t('ed.reserve')));
    c.appendChild(rsLab);
    if (s.layout === 'split') field(c, t('ed.column'), seg(b, 'col', [['left', t('ed.column.left')], ['right', t('ed.column.right')]]));

    const a = section(p, '');
    a.classList.add('ed-actions');
    [['up', () => moveBlock(-1)], ['down', () => moveBlock(1)], ['dup', dupBlock], ['del', delBlock]].forEach(([k, f]) => {
      const bt = el('button', 'small' + (k === 'del' ? ' danger' : ''), t('ed.act.' + k));
      bt.onclick = f;
      a.appendChild(bt);
    });
  }

  /* ================= 放映 ================= */
  function play(idx) {
    if (E.playing) return;
    const start = QS.visibleIndex(E.deck, idx);
    if (start < 0) return toast(t('ed.allHidden'), 'err');
    E.playing = true;
    const ov = el('div', 'ed-play');
    document.body.appendChild(ov);
    const player = new QS.Player(ov, QS.visibleDeck(clone(E.deck)), {
      start,
      onEscape: () => close(),
      hideCursor: true,
    });
    const close = () => {
      if (!E.playing) return;
      E.playing = false;
      const id = player.slide.id; // 放映里只有可见页，按 ID 找回编辑器里的位置
      player.destroy();
      ov.remove();
      document.removeEventListener('fullscreenchange', onFs);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      const i = E.deck.slides.findIndex((x) => x.id === id);
      if (i >= 0) selectSlide(i);
    };
    const onFs = () => { if (!document.fullscreenElement) close(); };
    document.addEventListener('fullscreenchange', onFs);
    if (ov.requestFullscreen) ov.requestFullscreen().catch(() => toast(t('ed.noFullscreen')));
  }

  /* ================= 键盘、粘贴 ================= */
  function typing(e) {
    return e.target.closest && e.target.closest('input, textarea, select, [contenteditable]');
  }
  function onKey(e) {
    if (E.playing || $('.ed-modal')) return;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'z') {
      if (typing(e)) return;
      e.preventDefault();
      e.shiftKey ? redo() : undo();
      return;
    }
    if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); save(); return; }
    if (mod && e.key === 'Enter') { e.preventDefault(); play(E.slideIdx); return; }
    if (typing(e)) return;
    if (mod && e.key.toLowerCase() === 'd' && block()) { e.preventDefault(); dupBlock(); return; }
    if (mod && e.key.toLowerCase() === 'c' && block() && !String(window.getSelection())) { E.clip = clone(block()); toast(t('ed.blockCopied', { id: E.clip.id })); return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && todo()) { e.preventDefault(); delTodo(); return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && block()) { e.preventDefault(); delBlock(); return; }
    if (e.key === 'Escape') { if (E.placing) setPlacing(false); else selectBlock(null); return; }
    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && block()) { e.preventDefault(); moveBlock(e.key === 'ArrowUp' ? -1 : 1); return; }
    if (!block() && !todo() && (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'PageUp' || e.key === 'PageDown')) {
      e.preventDefault();
      selectSlide(E.slideIdx + (e.key === 'ArrowUp' || e.key === 'PageUp' ? -1 : 1));
    }
  }
  function onPaste(e) {
    if (E.playing) return;
    const items = Array.from((e.clipboardData && e.clipboardData.items) || []);
    const img = items.find((i) => i.type.startsWith('image/'));
    if (img && todo()) {
      // 选中 TODO 时粘贴截图 = 添加附件（在 TODO 文本框里粘贴也一样）
      e.preventDefault();
      return attachFiles(todo(), items.filter((i) => i.type.startsWith('image/')).map((i) => i.getAsFile()));
    }
    if (typing(e)) return;
    if (img) {
      e.preventDefault();
      const f = img.getAsFile();
      const ext = (img.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
      insertImageFile(new File([f], 'paste-' + Date.now() + '.' + ext, { type: img.type }));
      return;
    }
    if (E.clip && slide().type === 'content') {
      e.preventDefault();
      const b = reassignIds(clone(E.clip));
      const s = slide();
      s.blocks = s.blocks || [];
      const cur = block();
      s.blocks.splice(cur ? s.blocks.indexOf(cur) + 1 : s.blocks.length, 0, b);
      if (s.layout !== 'split') delete b.col;
      E.blockId = b.id;
      changed({ structure: true });
    }
  }

  /* ================= 弹窗、菜单、提示 ================= */
  function toast(msg, kind) {
    const t = el('div', 'ed-toast ' + (kind || ''), QS.esc(msg));
    $('.ed-toasts').appendChild(t);
    setTimeout(() => t.classList.add('gone'), kind === 'err' ? 6000 : 3200);
    setTimeout(() => t.remove(), kind === 'err' ? 6600 : 3800);
  }
  QS.toast = toast;
  function modal(title, html, buttons, opts) {
    return new Promise((done) => {
      const ov = el('div', 'ed-modal');
      const box = el('div', 'ed-modal-box' + (opts && opts.wide ? ' wide' : ''));
      box.innerHTML = `<h2>${title}</h2><div class="ed-modal-body"></div><div class="ed-modal-btns"></div>`;
      const body = $('.ed-modal-body', box);
      if (typeof html === 'string') body.innerHTML = html;
      else body.appendChild(html);
      const close = () => { ov.remove(); done(); };
      for (const bt of buttons || [{ label: t('ed.close'), primary: true }]) {
        const b = el('button', bt.primary ? 'primary' : '', bt.label);
        b.onclick = async () => { close(); if (bt.run) await bt.run(); };
        $('.ed-modal-btns', box).appendChild(b);
      }
      ov.appendChild(box);
      ov.addEventListener('mousedown', (e) => { if (e.target === ov && !(opts && opts.sticky)) close(); });
      ov.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
      document.body.appendChild(ov);
      ov.tabIndex = -1;
      ov.focus();
    });
  }
  QS.modal = modal;
  function menu(x, y, items) {
    const old = $('.ed-menu');
    if (old) old.remove();
    const m = el('div', 'ed-menu');
    for (const [label, fn] of items) {
      const b = el('button', '', label);
      b.onclick = () => { m.remove(); fn(); };
      m.appendChild(b);
    }
    m.style.left = x + 'px';
    m.style.top = y + 'px';
    document.body.appendChild(m);
    setTimeout(() => document.addEventListener('mousedown', function h(e) {
      if (!m.contains(e.target)) { m.remove(); document.removeEventListener('mousedown', h); }
    }), 0);
  }

  function showHelp() {
    modal(t('ed.helpTitle'), t('ed.helpHtml'), null, { wide: true });
  }

  function showSettings() {
    const m = (E.deck.meta = E.deck.meta || {});
    const box = el('div');
    const sec = section(box, '');
    field(sec, t('ed.setDeckTitle'), textIn(m, 'title', { after: () => ($('#ed-title').textContent = m.title) }));
    const row = el('div', 'ed-row');
    const pick = el('input');
    pick.type = 'color';
    pick.value = accent();
    const hex = el('input');
    hex.type = 'text';
    hex.className = 'mono';
    hex.value = accent();
    hex.style.width = '110px';
    const apply = (v) => {
      if (!/^#[0-9a-fA-F]{6}$/.test(v)) return;
      m.accent = v.toUpperCase();
      pick.value = v;
      hex.value = m.accent;
      document.documentElement.style.setProperty('--accent', m.accent);
      changed();
      renderSlideList();
    };
    pick.oninput = () => apply(pick.value);
    hex.oninput = () => apply(hex.value.trim());
    const reset = el('button', 'small', t('ed.setAccentReset'));
    reset.onclick = (e) => { e.preventDefault(); apply(DEFAULT_ACCENT); };
    row.appendChild(pick);
    row.appendChild(hex);
    row.appendChild(reset);
    field(sec, t('ed.setAccent'), row);
    checkIn(sec, m, 'pageNumbers', t('ed.setPageNo'), { structure: true });
    field(sec, t('ed.setSecStyle'), seg(m, 'sectionStyle', QS.SECTION_STYLES.map((k) => [k, t('ed.secStyle.' + k)]), { structure: true }), t('ed.setSecStyleHint'));
    modal(t('ed.setTitle'), box);
  }

  /* ================= 导出 ================= */
  async function doExport() {
    await save();
    const todos = QS.todoCount(E.deck);
    const hidden = E.deck.slides.length - QS.visibleSlides(E.deck).length;
    const prog = el('div', 'ed-progress', t('ed.expPrepare'));
    const ov = el('div', 'ed-modal');
    const box = el('div', 'ed-modal-box');
    box.innerHTML = `<h2>${t('ed.exporting')}</h2>`;
    box.appendChild(prog);
    ov.appendChild(box);
    document.body.appendChild(ov);
    try {
      const { html, name } = await QS.exportDeck(E.deck, (msg) => (prog.textContent = msg));
      prog.textContent = t('ed.expWrite');
      const res = await fetch('api/export?name=' + encodeURIComponent(name), { method: 'POST', body: html });
      const j = await res.json();
      ov.remove();
      if (!j.ok) throw new Error(j.error);
      const rel = 'export/' + name;
      modal(t('ed.expDoneTitle'), t('ed.expDoneBody', { path: QS.esc(j.path), size: (j.size / 1048576).toFixed(2) }) + (hidden ? t('ed.expHidden', { n: hidden }) : '') + (todos ? t('ed.expTodos', { n: todos }) : ''),
        [
          { label: t('ed.expReveal'), primary: true, run: () => fetch('api/reveal?path=' + encodeURIComponent(rel), { method: 'POST' }) },
          { label: t('ed.close') },
        ]);
    } catch (e) {
      ov.remove();
      console.error(e);
      modal(t('ed.expFailTitle'), `<p>${QS.esc(e.message)}</p>`);
    }
  }

  /* ================= 启动 ================= */
  QS.editorStart = async function () {
    document.documentElement.lang = QS.lang === 'zh' ? 'zh-CN' : 'en';
    document.title = t('ed.docTitle');
    buildShell();
    try {
      const res = await fetch('deck.json?t=' + Date.now(), { cache: 'no-store' });
      E.deck = await res.json();
      E.version = (await (await fetch('api/version')).json()).version;
    } catch (e) {
      document.body.innerHTML = `<div class="ed-fatal"><h2>${t('ed.fatalTitle')}</h2><p>${t('ed.fatalBody')}</p><pre>${QS.esc(e.message)}</pre></div>`;
      return;
    }
    const before = JSON.stringify(E.deck);
    QS.migrate(E.deck);
    E.committed = JSON.stringify(E.deck);
    if (E.committed !== before) { E.dirty = true; setTimeout(save, 500); } // 旧版 TODO 块已转换，写回文件
    // 刷新后回到上次选中的幻灯片（按 ID）
    try {
      const si = E.deck.slides.findIndex((x) => x.id === localStorage.getItem('qs-editor-slide'));
      if (si >= 0) E.slideIdx = si;
    } catch (e) {}
    if (document.fonts) await Promise.all([300, 400, 500, 600].map((w) => document.fonts.load(w + ' 24px "Plex SC"', '量子')).concat([document.fonts.load('500 24px "Futura ND Bundled"', 'PART 0123456789')])).catch(() => {});
    renderAll();
    setInterval(poll, 1500);
    QS.gitBadge($('#ed-git'));
    setInterval(() => QS.gitBadge($('#ed-git')), 15000);
  };
})();

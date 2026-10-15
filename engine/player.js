/* 放映器、演讲者视图、打印模式。开发时由 present.html 载入，导出时整体内联进单文件。 */
(function () {
  'use strict';
  const QS = (window.QS = window.QS || {});

  /* ---------- 把 1280×720 的幻灯片缩放进任意容器 ---------- */
  function fit(frame, inner) {
    const w = frame.clientWidth, h = frame.clientHeight;
    const k = Math.min(w / QS.W, h / QS.H);
    inner.style.transform = `translate(${(w - QS.W * k) / 2}px, ${(h - QS.H * k) / 2}px) scale(${k})`;
  }
  QS.fit = fit;

  /** 静态预览（演讲者视图里的"下一步"、打印模式） */
  QS.renderStatic = function (frame, deck, idx, step, opts) {
    frame.innerHTML = '';
    const slide = deck.slides[idx];
    if (!slide) return null;
    const r = QS.renderSlide(deck, slide, Object.assign({ mode: 'present', pageNo: idx + 1 }, opts));
    r.root.classList.add('qs-scaled');
    frame.appendChild(r.root);
    r.mount();
    r.setStep(step, false);
    fit(frame, r.root);
    return r;
  };

  /* ---------- 放映器 ---------- */
  class Player {
    constructor(host, deck, opts) {
      this.opts = opts || {};
      this.deck = deck;
      this.host = host;
      this.idx = Math.max(0, Math.min(deck.slides.length - 1, this.opts.start || 0));
      this.step = 0;
      this.cur = null;
      this.frame = QS.el('div', 'qs-player');
      this.cover = QS.el('div', 'qs-blackout');
      this.frame.appendChild(this.cover);
      host.appendChild(this.frame);
      this.onKey = this.onKey.bind(this);
      this.onResize = () => this.cur && fit(this.frame, this.cur.root);
      if (!this.opts.passive) window.addEventListener('keydown', this.onKey);
      window.addEventListener('resize', this.onResize);
      this.frame.addEventListener('click', (e) => {
        if (this.opts.passive || e.target.closest('.qs-anim, a, button, input')) return;
        this.next();
      });
      this.numBuf = '';
      this.show(this.idx, this.opts.startStep || 0, true, true); // 初始显示不广播，由已打开的窗口回复当前位置
    }
    get slide() { return this.deck.slides[this.idx]; }
    maxStep(i) { return QS.maxStep(this.deck.slides[i === undefined ? this.idx : i]); }

    show(idx, step, animate, silent) {
      idx = Math.max(0, Math.min(this.deck.slides.length - 1, idx));
      if (idx !== this.idx || !this.cur) {
        if (this.cur) this.cur.destroy();
        this.idx = idx;
        this.cur = QS.renderSlide(this.deck, this.slide, {
          mode: 'present',
          pageNo: idx + 1,
          onAnimState: (id, st) => this.opts.onAnimState && this.opts.onAnimState(this.idx, id, st),
        });
        this.cur.root.classList.add('qs-scaled');
        this.frame.insertBefore(this.cur.root, this.cover);
        fit(this.frame, this.cur.root);
        this.cur.mount();
      }
      this.step = Math.max(0, Math.min(this.maxStep(), step));
      this.cur.setStep(this.step, animate);
      if (!silent && this.opts.onChange) this.opts.onChange(this.idx, this.step);
    }
    next() {
      if (this.step < this.maxStep()) this.show(this.idx, this.step + 1, true);
      else if (this.idx < this.deck.slides.length - 1) this.show(this.idx + 1, 0, true);
    }
    prev() {
      if (this.step > 0) this.show(this.idx, this.step - 1, true);
      else if (this.idx > 0) this.show(this.idx - 1, this.maxStep(this.idx - 1), false);
    }
    nextSlide() { if (this.idx < this.deck.slides.length - 1) this.show(this.idx + 1, 0, true); }
    prevSlide() { if (this.idx > 0) this.show(this.idx - 1, 0, true); }
    blackout(on) { this.cover.classList.toggle('on', on === undefined ? !this.cover.classList.contains('on') : on); }

    onKey(e) {
      if (e.target.closest && e.target.closest('input, textarea, select, [contenteditable]')) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key;
      if (/^[0-9]$/.test(k)) { this.numBuf += k; return; }
      if (k === 'Enter' && this.numBuf) { this.show(+this.numBuf - 1, 0, true); this.numBuf = ''; e.preventDefault(); return; }
      this.numBuf = '';
      if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(k)) {
        e.shiftKey ? this.nextSlide() : this.next();
      } else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(k)) {
        e.shiftKey ? this.prevSlide() : this.prev();
      } else if (k === 'Home') this.show(0, 0, true);
      else if (k === 'End') this.show(this.deck.slides.length - 1, 0, true);
      else if (k === 'b' || k === 'B' || k === '.') this.blackout();
      else if (k === 'f' || k === 'F') QS.toggleFullscreen(document.documentElement);
      else if (k === 'Escape' && this.opts.onEscape) this.opts.onEscape();
      else if ((k === 'p' || k === 'P') && this.opts.onPresenter) this.opts.onPresenter();
      else return;
      e.preventDefault();
    }
    setAnimState(idx, id, st) {
      if (idx === this.idx && this.cur) this.cur.setAnimState(id, st);
    }
    destroy() {
      window.removeEventListener('keydown', this.onKey);
      window.removeEventListener('resize', this.onResize);
      if (this.cur) this.cur.destroy();
      this.frame.remove();
    }
  }
  QS.Player = Player;

  QS.toggleFullscreen = function (elm) {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (elm.requestFullscreen) elm.requestFullscreen().catch(() => {});
  };

  /* ---------- 多窗口同步（演讲者 ↔ 观众） ---------- */
  function makeSync(onMsg) {
    const peers = new Set();
    let bc = null;
    try {
      bc = new BroadcastChannel('qs-present');
      bc.onmessage = (e) => onMsg(e.data);
    } catch (e) {}
    window.addEventListener('message', (e) => {
      if (e.data && e.data.__qs) {
        if (e.source) peers.add(e.source);
        onMsg(e.data);
      }
    });
    if (window.opener) peers.add(window.opener);
    return {
      add(w) { if (w) peers.add(w); },
      send(msg) {
        msg.__qs = 1;
        if (bc) try { bc.postMessage(msg); } catch (e) {}
        for (const w of peers) try { if (!w.closed) w.postMessage(msg, '*'); } catch (e) {}
      },
    };
  }

  function hashParams() {
    const p = {};
    location.hash.replace(/^#/, '').split('&').forEach((kv) => {
      if (!kv) return;
      const [k, v] = kv.split('=');
      p[k] = v === undefined ? true : decodeURIComponent(v);
    });
    return p;
  }
  function baseURL() { return location.href.split('#')[0]; }

  /* ---------- 放映页面（普通 / 观众窗口） ---------- */
  function startAudience(deck, params) {
    document.body.className = 'qs-page-player';
    let applying = false;
    const sync = makeSync((m) => {
      if (m.type === 'go' && (m.idx !== player.idx || m.step !== player.step)) {
        applying = true;
        player.show(m.idx, m.step, m.animate !== false);
        applying = false;
      } else if (m.type === 'anim') player.setAnimState(m.idx, m.id, m.state);
      else if (m.type === 'black') player.blackout(m.on);
      else if (m.type === 'hello') sync.send({ type: 'go', idx: player.idx, step: player.step, animate: false });
    });
    const player = new Player(document.body, deck, {
      start: params.s ? +params.s - 1 : 0,
      onChange: (idx, step) => { if (!applying) sync.send({ type: 'go', idx, step }); },
      onAnimState: (idx, id, state) => sync.send({ type: 'anim', idx, id, state }),
      onPresenter: () => sync.add(window.open(baseURL() + '#presenter', 'qs-presenter')),
    });
    const hint = QS.el('div', 'qs-hint', QS.esc(QS.t('player.hint')));
    document.body.appendChild(hint);
    setTimeout(() => hint.classList.add('gone'), 3500);
    sync.send({ type: 'hello' });
  }

  /* ---------- 演讲者视图 ---------- */
  function startPresenter(deck, params) {
    document.body.className = 'qs-page-presenter';
    document.title = QS.t('pv.title', { title: (deck.meta && deck.meta.title) || '' });
    const ui = QS.el('div', 'qs-pv');
    ui.innerHTML = `
      <div class="qs-pv-cur"></div>
      <div class="qs-pv-side">
        <div class="qs-pv-label">${QS.t('pv.next')}</div>
        <div class="qs-pv-next"></div>
        <div class="qs-pv-label">${QS.t('pv.notes')}</div>
        <div class="qs-pv-notes"></div>
      </div>
      <div class="qs-pv-bar">
        <span class="qs-pv-pos"></span>
        <span class="qs-pv-timer" title="${QS.t('pv.timerTip')}">00:00</span>
        <button data-act="reset">${QS.t('pv.reset')}</button>
        <span class="qs-pv-clock"></span>
        <span class="qs-pv-spacer"></span>
        <button data-act="black">${QS.t('pv.black')}</button>
        <button data-act="audience" class="primary">${QS.t('pv.audience')}</button>
      </div>`;
    document.body.appendChild(ui);
    const $ = (s) => ui.querySelector(s);
    let applying = false;
    const sync = makeSync((m) => {
      if (m.type === 'go' && (m.idx !== player.idx || m.step !== player.step)) {
        applying = true;
        player.show(m.idx, m.step, m.animate !== false);
        applying = false;
      } else if (m.type === 'anim') player.setAnimState(m.idx, m.id, m.state);
      else if (m.type === 'hello') sync.send({ type: 'go', idx: player.idx, step: player.step, animate: false });
    });
    let nextR = null;
    const refresh = (idx, step) => {
      const max = QS.maxStep(deck.slides[idx]);
      $('.qs-pv-pos').textContent = QS.t('pv.pos', { i: idx + 1, n: deck.slides.length, s: step, m: max });
      const notes = deck.slides[idx].notes || '';
      $('.qs-pv-notes').innerHTML = notes ? QS.paragraphs(notes) : '<span class="qs-pv-empty">' + QS.esc(QS.t('pv.noNotes')) + '</span>';
      if (nextR) nextR.destroy();
      const nf = $('.qs-pv-next');
      if (step < max) nextR = QS.renderStatic(nf, deck, idx, step + 1);
      else if (idx < deck.slides.length - 1) nextR = QS.renderStatic(nf, deck, idx + 1, 0);
      else { nextR = null; nf.innerHTML = '<div class="qs-pv-end">' + QS.esc(QS.t('pv.end')) + '</div>'; }
    };
    const player = new Player($('.qs-pv-cur'), deck, {
      start: params.s ? +params.s - 1 : 0,
      onChange: (idx, step) => {
        refresh(idx, step);
        if (!applying) sync.send({ type: 'go', idx, step });
      },
      onAnimState: (idx, id, state) => sync.send({ type: 'anim', idx, id, state }),
    });
    player.blackout = () => {};
    refresh(player.idx, player.step);
    window.addEventListener('resize', () => refresh(player.idx, player.step));

    let t0 = Date.now(), paused = 0, pausedAt = 0;
    const fmt = (ms) => { const s = Math.floor(ms / 1000); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
    setInterval(() => {
      const now = Date.now();
      $('.qs-pv-timer').textContent = fmt((pausedAt || now) - t0 - paused);
      $('.qs-pv-clock').textContent = new Date().toLocaleTimeString(QS.lang === 'zh' ? 'zh-CN' : 'en-GB', { hour: '2-digit', minute: '2-digit' });
    }, 250);
    $('.qs-pv-timer').onclick = () => {
      if (pausedAt) { paused += Date.now() - pausedAt; pausedAt = 0; } else pausedAt = Date.now();
    };
    let black = false;
    ui.querySelector('[data-act=reset]').onclick = () => { t0 = Date.now(); paused = 0; pausedAt = 0; };
    ui.querySelector('[data-act=black]').onclick = () => { black = !black; sync.send({ type: 'black', on: black }); };
    ui.querySelector('[data-act=audience]').onclick = () => {
      const w = window.open(baseURL() + '#audience&s=' + (player.idx + 1), 'qs-audience', 'popup,width=1280,height=760');
      sync.add(w);
    };
    window.addEventListener('keydown', (e) => {
      if ((e.key === 'b' || e.key === 'B' || e.key === '.') && !e.metaKey) { black = !black; sync.send({ type: 'black', on: black }); }
    });
    sync.send({ type: 'hello' });
  }

  /* ---------- 打印 / 存为 PDF ---------- */
  function startPrint(deck, params) {
    document.body.className = 'qs-page-print';
    const bar = QS.el('div', 'qs-print-bar');
    const each = params.each !== undefined;
    bar.innerHTML = `<b>${QS.t('print.title')}</b>
      <label><input type="checkbox" ${each ? 'checked' : ''}> ${QS.t('print.each')}</label>
      <button class="primary">${QS.t('print.btn')}</button>
      <span>${QS.esc(QS.t('print.hint'))}</span>`;
    document.body.appendChild(bar);
    bar.querySelector('input').onchange = (e) => { location.hash = e.target.checked ? 'print&each' : 'print'; location.reload(); };
    bar.querySelector('button').onclick = () => window.print();
    deck.slides.forEach((s, i) => {
      const max = QS.maxStep(s);
      const steps = each ? [...Array(max + 1).keys()] : [max];
      for (const st of steps) {
        const page = QS.el('div', 'qs-print-page');
        document.body.appendChild(page);
        const r = QS.renderSlide(deck, s, { mode: 'present', pageNo: i + 1 });
        page.appendChild(r.root);
        r.mount();
        r.setStep(st, false);
      }
    });
  }

  /* ---------- 启动 ---------- */
  QS.boot = async function () {
    let deck = window.__QS_DECK__;
    if (!deck) {
      const res = await fetch('deck.json?t=' + Date.now(), { cache: 'no-store' });
      deck = await res.json();
    }
    QS.migrate(deck);
    if (document.fonts && document.fonts.load) {
      await Promise.all([300, 400, 500, 600].map((w) => document.fonts.load(w + ' 24px "Plex SC"', '量子')).concat([document.fonts.load('500 24px "Futura ND Bundled"', 'PART 0123456789'), document.fonts.ready])).catch(() => {});
    }
    document.title = (deck.meta && deck.meta.title) || QS.t('player.defaultTitle');
    document.documentElement.lang = QS.lang === 'zh' ? 'zh-CN' : 'en';
    const p = hashParams();
    window.addEventListener('hashchange', () => location.reload());
    if (p.presenter) startPresenter(deck, p);
    else if (p.print) startPrint(deck, p);
    else startAudience(deck, p);
  };
})();

/* 主题 sysu-beamer：中山大学 Beamer 模板（Berlin / smoothbars / circles，余荫铠版本）的复刻。
 * 画布 960×720（4:3，对应 128mm×96mm 的 Beamer 页面，1pt ≈ 2.646px）；正文 11pt ≈ 28.9px。
 * 页面类型：内容页（顶部章节导航条 + 蓝色标题栏 + 两层页脚 + 右下角校徽水印）、封面（\titlepage，不带页眉页脚）。
 * 章节的写法同 LaTeX：内容页的 section 字段相当于 \section，之后的页都属于这一节，直到下一个 section；
 * appendix 相当于 \appendix，从这一页起是备用页：导航条只列备用部分的章节，页码显示为"备用 N"。 */
(function () {
  'use strict';
  const QS = window.QS;
  const el = QS.el, esc = QS.esc;
  const T = (k) => QS.t(k);

  /** 整份幻灯片的结构：每张可见内容页属于哪一部分（正文 / 备用）、哪一节，以及页码 */
  function structure(deck, current) {
    const slides = deck.slides.filter((s) => !s.hidden || s.id === current.id);
    let part = 0, sec = null, mainCount = 0;
    const info = new Map();
    slides.forEach((s, i) => {
      if (s.type === 'content') {
        if (s.appendix) part = 1;
        if (String(s.section || '').trim()) sec = { title: s.section, part, frames: [] };
        else if (sec && sec.part !== part) sec = null; // 进入备用部分但没写新的节：不属于任何节
      }
      if (part === 0) mainCount = i + 1;
      const own = s.type === 'content' ? sec : null;
      if (own) own.frames.push(s.id);
      info.set(s.id, { no: i + 1, part, sec: own });
    });
    const sections = [];
    for (const v of info.values()) if (v.sec && !sections.includes(v.sec)) sections.push(v.sec);
    return { info, sections, mainCount };
  }

  /** 顶部导航条：本部分的所有节，每节下面一排小圆点（每页一个，当前页实心） */
  function headline(st, me) {
    const head = el('div', 'bm-head');
    const nav = head.appendChild(el('div', 'bm-nav'));
    for (const sec of st.sections.filter((x) => x.part === me.part)) {
      const on = sec === me.sec;
      const box = nav.appendChild(el('div', 'bm-sec' + (on ? ' on' : '')));
      box.appendChild(el('div', 'bm-sec-name', QS.inline(sec.title)));
      const dots = box.appendChild(el('div', 'bm-dots'));
      for (const id of sec.frames) dots.appendChild(el('i', id === me.id ? 'on' : ''));
    }
    return head;
  }

  function footline(deck, st, me) {
    const m = deck.meta || {};
    // 页码前缀是幻灯片内容（不随观看者的界面语言变化），可在设置里改
    // 间距用 CSS 做，不用特殊空格字符（导出的字体子集里没有它们）
    const no = me.part === 0 ? `${me.no}<i class="bm-of">/</i>${st.mainCount}` : `${esc(m.backupLabel || '备用')}<i class="bm-gap"></i>${me.no - st.mainCount}`;
    const foot = el('div', 'bm-foot');
    foot.appendChild(el('div', 'bm-foot-a', `<span>${QS.inline(m.footAuthor || '')}</span><span>${QS.inline(m.footRight || '')}</span>`));
    foot.appendChild(el('div', 'bm-foot-b', `<span>${QS.inline(m.shortTitle || m.title || '')}</span><span>${no}</span>`));
    return foot;
  }

  QS.registerTheme({
    id: 'sysu-beamer',
    name: { en: 'SYSU Beamer (Berlin)', zh: '中山大学 Beamer（Berlin）' },
    width: 960,
    height: 720,
    accent: '#333399',
    fonts: [
      { family: 'LM Roman 10', weight: 400, file: 'themes/sysu-beamer/fonts/lmroman10-regular.otf', label: 'Latin Modern Roman', sample: 'Aa' },
      { family: 'LM Roman 10', weight: 700, file: 'themes/sysu-beamer/fonts/lmroman10-bold.otf', label: 'Latin Modern Roman Bold', sample: 'Aa' },
      { family: 'LM Roman 10', weight: 400, style: 'italic', file: 'themes/sysu-beamer/fonts/lmroman10-italic.otf', label: 'Latin Modern Roman Italic', sample: 'Aa' },
      { family: 'Fandol Song', weight: 400, file: 'themes/sysu-beamer/fonts/FandolSong-Regular.otf', label: 'FandolSong Regular', sample: '中山大学' },
      { family: 'Fandol Song', weight: 700, file: 'themes/sysu-beamer/fonts/FandolSong-Bold.otf', label: 'FandolSong Bold', sample: '中山大学' },
    ],
    blocks: ['text', 'list', 'formula', 'box', 'image', 'table', 'anim', 'spacer'],
    // normal = 正文 11pt；small = \small；source = \smallsource（出处小字）；takeaway = \takeaway（蓝色粗体结论句）
    textSizes: ['normal', 'small', 'source', 'takeaway'],

    slideTypes: {
      content: {
        add: 'ed.addContent',
        fields(ui, sec, s) {
          const { t, field, textIn, checkIn } = ui;
          field(sec, t('bm.section'), textIn(s, 'section', { after: () => ui.changed({ structure: true }) }), t('bm.sectionHint'));
          checkIn(sec, s, 'appendix', t('bm.appendix'), { structure: true });
          sec.appendChild(el('div', 'ed-hint', esc(t('bm.appendixHint'))));
        },
        textKeys: ['section'],
      },
      cover: {
        add: 'bm.addCover',
        make: () => ({ title: T('default.coverTitle'), subtitle: '', author: '', institute: '', date: '' }),
        render(root, slide) {
          const page = root.appendChild(el('div', 'bm-titlepage'));
          const box = page.appendChild(el('div', 'bm-titlebox'));
          box.appendChild(el('div', 'bm-tp-title', QS.inline(slide.title)));
          if (slide.subtitle) box.appendChild(el('div', 'bm-tp-sub', QS.inline(slide.subtitle)));
          if (slide.author) page.appendChild(el('div', 'bm-tp-author', QS.inline(slide.author)));
          if (slide.institute) page.appendChild(el('div', 'bm-tp-inst', QS.inline(slide.institute)));
          if (slide.date) page.appendChild(el('div', 'bm-tp-date', QS.inline(slide.date)));
        },
        fields(ui, sec, s) {
          const { t, field, textIn } = ui;
          field(sec, t('ed.mainTitle'), textIn(s, 'title', { rows: 2 }), t('ed.titleBreakHint'));
          field(sec, t('ed.subtitle'), textIn(s, 'subtitle'));
          field(sec, t('ed.author'), textIn(s, 'author', { rows: 2 }), t('bm.authorHint'));
          field(sec, t('bm.institute'), textIn(s, 'institute'));
          field(sec, t('bm.date'), textIn(s, 'date'), t('bm.dateHint'));
        },
        textKeys: ['title', 'subtitle', 'author', 'institute', 'date'],
      },
    },

    /** 内容页的页眉（章节导航）、页脚和水印；封面是 plain 页，什么都不加 */
    decorate(root, slide, deck) {
      if (slide.type !== 'content') return;
      const st = structure(deck, slide);
      const me = Object.assign({ id: slide.id }, st.info.get(slide.id));
      root.insertBefore(el('div', 'bm-mark'), root.firstChild);
      root.appendChild(headline(st, me));
      root.appendChild(footline(deck, st, me));
      if (!slide.title) root.classList.add('bm-notitle');
    },

    settings(ui, sec, m) {
      const { t, field, textIn } = ui;
      field(sec, t('bm.shortTitle'), textIn(m, 'shortTitle', { after: () => ui.changed({ structure: true }) }), t('bm.shortTitleHint'));
      field(sec, t('bm.footAuthor'), textIn(m, 'footAuthor', { after: () => ui.changed({ structure: true }) }));
      field(sec, t('bm.footRight'), textIn(m, 'footRight', { after: () => ui.changed({ structure: true }) }));
      field(sec, t('bm.backupLabel'), textIn(m, 'backupLabel', { placeholder: '备用', after: () => ui.changed({ structure: true }) }), t('bm.backupLabelHint'));
    },

    check(deck, report) {
      const content = deck.slides.filter((s) => s.type === 'content' && !s.hidden);
      const first = content.findIndex((s) => String(s.section || '').trim());
      if (content.length && first !== 0) report.warn(`${(content[0] || {}).id}: the first content slide has no section, so it is missing from the navigation bar`);
    },

    i18n: {
      en: {
        'bm.addCover': '+ Title page',
        'bm.section': 'Starts a section (navigation bar title)',
        'bm.sectionHint': 'Like \\section: this and the following slides belong to it until the next slide that starts a section. Leave empty to stay in the current section.',
        'bm.appendix': 'Backup slides start here (\\appendix)',
        'bm.appendixHint': 'From this slide on, page numbers read "备用 N" (label set in Settings) and the navigation bar lists only the backup sections.',
        'bm.authorHint': 'One line per row, e.g. presenter and supervisor.',
        'bm.institute': 'Institute',
        'bm.date': 'Date line',
        'bm.dateHint': 'The last line of the title page (\\date), e.g. the occasion.',
        'bm.shortTitle': 'Short title (footer)',
        'bm.shortTitleHint': 'Shown at the bottom left of every content slide; defaults to the presentation title.',
        'bm.footAuthor': 'Footer, upper row left (presenter)',
        'bm.footRight': 'Footer, upper row right',
        'bm.backupLabel': 'Backup page label',
        'bm.backupLabelHint': 'Backup slides number their pages as "<label> N" (default 备用).',
        'ed.f.size.source': 'Source note',
        'ed.f.size.takeaway': 'Takeaway',
        'slide.cover': 'Title page',
      },
      zh: {
        'bm.addCover': '＋ 封面',
        'bm.section': '开始新的一节（导航条标题）',
        'bm.sectionHint': '相当于 \\section：本页和后面的页都属于这一节，直到下一个开始新节的页。留空表示仍在当前节里。',
        'bm.appendix': '从本页起是备用页（\\appendix）',
        'bm.appendixHint': '从这一页起，页码显示为"备用 N"，导航条只列备用部分的章节。',
        'bm.authorHint': '每行一项，例如汇报人、指导老师。',
        'bm.institute': '单位',
        'bm.date': '日期行',
        'bm.dateHint': '封面最后一行（\\date），例如答辩场合。',
        'bm.shortTitle': '短标题（页脚）',
        'bm.shortTitleHint': '显示在每张内容页的左下角；不填时用演示标题。',
        'bm.footAuthor': '页脚上排左侧（汇报人）',
        'bm.footRight': '页脚上排右侧',
        'bm.backupLabel': '备用页的页码前缀',
        'bm.backupLabelHint': '备用页的页码显示为"前缀 N"，默认"备用"。',
        'ed.f.size.source': '出处小字',
        'ed.f.size.takeaway': '结论句',
        'slide.cover': '封面',
      },
    },
  });
})();

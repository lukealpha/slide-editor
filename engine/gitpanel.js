/* Git 面板：只读显示幻灯片文件夹自己的 git 仓库（提交图、分支、未提交的修改）。
 * 编辑器从不创建、提交或修改仓库——是否用 git 管理幻灯片完全由用户决定。 */
(function () {
  'use strict';
  const QS = window.QS;
  const t = (k, v) => QS.t(k, v);
  const el = (tag, cls, html) => QS.el(tag, cls, html);

  const ROW = 30, LANE = 16, PAD = 12;
  const COLORS = ['var(--accent)', '#24a148', '#ff832b', '#a56eff', '#fa4d56', '#08bdba', '#d12771', '#8a3800'];
  const color = (i) => COLORS[i % COLORS.length];

  async function fetchGit() {
    const r = await fetch('api/git', { cache: 'no-store' });
    return r.json();
  }

  /* ---------- 顶栏按钮上的状态（分支名 / 有未提交修改时显示圆点） ---------- */
  let badgeTimer = null;
  QS.gitBadge = async function (btn) {
    try {
      const g = await fetchGit();
      if (!g.available || !g.repo) {
        btn.innerHTML = `Git <span class="ed-git-none">${QS.esc(t('git.badgeNone'))}</span>`;
      } else {
        const name = g.branch || (g.head ? g.head.slice(0, 7) : '—');
        btn.innerHTML = `Git <span class="ed-git-branch">${QS.esc(name)}</span>${g.dirty.length ? '<span class="ed-git-dot" title="' + QS.esc(t('git.wip', { n: g.dirty.length })) + '"></span>' : ''}`;
      }
    } catch (e) {}
  };
  QS.gitBadgeSoon = function (btn) {
    clearTimeout(badgeTimer);
    badgeTimer = setTimeout(() => QS.gitBadge(btn), 1500);
  };

  /* ---------- 提交图布局：为每个提交分配泳道，记录相邻两行之间的连线 ---------- */
  function layout(commits, wip, head) {
    const rows = [];
    let lanes = [];
    const free = () => {
      const i = lanes.indexOf(null);
      return i < 0 ? lanes.length : i;
    };
    if (wip && head) {
      lanes = [head];
      rows.push({ wip: true, col: 0, segs: [{ from: 0, lane: 0 }], after: lanes.slice() });
    }
    for (const c of commits) {
      let col = lanes.indexOf(c.hash);
      if (col < 0) {
        col = free();
        lanes[col] = c.hash;
      }
      for (let j = 0; j < lanes.length; j++) if (j !== col && lanes[j] === c.hash) lanes[j] = null; // 汇合到本提交
      const segs = [];
      const fresh = new Set(); // 本行新开的泳道：只有从本提交引出的那条线
      lanes[col] = c.parents[0] || null;
      c.parents.slice(1).forEach((p) => {
        let k = lanes.indexOf(p);
        if (k < 0) {
          k = free();
          lanes[k] = p;
          fresh.add(k);
        }
        segs.push({ from: col, lane: k });
      });
      lanes.forEach((h, j) => {
        if (h !== null && !fresh.has(j)) segs.push({ from: j, lane: j });
      });
      while (lanes.length && lanes[lanes.length - 1] === null) lanes.pop();
      rows.push({ commit: c, col, segs, after: lanes.slice() });
    }
    return rows;
  }

  function graphSVG(rows) {
    const width = PAD + LANE * Math.max(1, ...rows.map((r) => Math.max(r.col + 1, r.after.length, ...r.segs.map((s) => Math.max(s.from, s.lane) + 1)))) + 4;
    const height = rows.length * ROW;
    const x = (i) => PAD + i * LANE;
    const y = (r) => r * ROW + ROW / 2;
    const parts = [];
    rows.forEach((r, i) => {
      const next = rows[i + 1];
      for (const s of r.segs) {
        const h = r.after[s.lane];
        const sx = x(s.from), sy = y(i);
        let ex, ey;
        if (next) {
          ex = next.commit && next.commit.hash === h ? x(next.col) : x(s.lane);
          ey = y(i + 1);
        } else {
          ex = x(s.lane);
          ey = height; // 历史被截断或父提交不在列表中：线延伸到底部
        }
        const c = color(s.lane === r.col || s.from === r.col ? r.col : s.lane);
        const d = sx === ex ? `M${sx} ${sy} L${ex} ${ey}` : `M${sx} ${sy} C${sx} ${(sy + ey) / 2} ${ex} ${(sy + ey) / 2} ${ex} ${ey}`;
        parts.push(`<path d="${d}" stroke="${c}" stroke-width="2" fill="none"${r.wip ? ' stroke-dasharray="3 3"' : ''}/>`);
      }
    });
    rows.forEach((r, i) => {
      const cx = x(r.col), cy = y(i), c = color(r.col);
      if (r.wip) parts.push(`<circle cx="${cx}" cy="${cy}" r="5" fill="#fff" stroke="${c}" stroke-width="2" stroke-dasharray="2 2"/>`);
      else if (r.commit.parents.length > 1) parts.push(`<circle cx="${cx}" cy="${cy}" r="5" fill="#fff" stroke="${c}" stroke-width="2.5"/>`);
      else parts.push(`<circle cx="${cx}" cy="${cy}" r="5" fill="${c}"/>`);
    });
    return { svg: `<svg width="${width}" height="${height}" class="ed-git-svg">${parts.join('')}</svg>`, width };
  }

  function refBadges(refs) {
    return refs
      .map((r) => {
        if (r === 'HEAD') return '<span class="ed-ref head">HEAD</span>';
        if (r.startsWith('HEAD -> ')) return `<span class="ed-ref head">${QS.esc(r.slice(8))}</span>`;
        if (r.startsWith('tag: ')) return `<span class="ed-ref tag">${QS.esc(r.slice(5))}</span>`;
        if (r.includes('/')) return `<span class="ed-ref remote">${QS.esc(r)}</span>`;
        return `<span class="ed-ref">${QS.esc(r)}</span>`;
      })
      .join('');
  }

  function ago(sec) {
    const rtf = new Intl.RelativeTimeFormat(QS.lang === 'zh' ? 'zh-CN' : 'en', { numeric: 'auto' });
    const d = sec - Date.now() / 1000;
    const units = [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]];
    for (const [u, s] of units) if (Math.abs(d) >= s) return rtf.format(Math.round(d / s), u);
    return rtf.format(Math.round(d), 'second');
  }

  /* ---------- 面板 ---------- */
  async function render(box) {
    box.innerHTML = `<div class="ed-progress">${QS.esc(t('git.loading'))}</div>`;
    let g;
    try {
      g = await fetchGit();
    } catch (e) {
      box.innerHTML = `<p>${QS.esc(e.message)}</p>`;
      return;
    }
    box.innerHTML = '';
    const head = el('div', 'ed-git-head');
    head.innerHTML = `<code title="${QS.esc(g.dir || '')}">${QS.esc(g.dir || '')}</code><span class="ed-flex"></span>`;
    const refresh = el('button', 'small', t('git.refresh'));
    refresh.onclick = () => render(box);
    head.appendChild(refresh);
    box.appendChild(head);

    if (!g.available) {
      box.appendChild(el('p', '', QS.esc(t('git.unavailable'))));
      return;
    }
    if (!g.repo) {
      box.appendChild(el('div', '', t('git.noRepo')));
      box.appendChild(el('pre', 'ed-git-cmd', `cd "${QS.esc(g.dir)}"\ngit init`));
      return;
    }

    const info = el('div', 'ed-git-info');
    info.innerHTML = `${QS.esc(t('git.branch'))}: <b>${QS.esc(g.branch || t('git.detached'))}</b>` +
      (g.head ? ` · HEAD <code>${g.head.slice(0, 7)}</code>` : '') +
      ` · ${g.dirty.length ? `<span class="ed-git-dirty">${QS.esc(t('git.wip', { n: g.dirty.length }))}</span>` : QS.esc(t('git.clean'))}`;
    box.appendChild(info);

    if (!g.commits.length) {
      box.appendChild(el('p', 'ed-empty', QS.esc(t('git.noCommits'))));
      if (g.dirty.length) box.appendChild(fileList(g.dirty));
      box.appendChild(el('p', 'ed-hint', QS.esc(t('git.readOnly'))));
      return;
    }

    const rows = layout(g.commits, g.dirty.length > 0, g.head);
    const { svg, width } = graphSVG(rows);
    const wrap = el('div', 'ed-git-graph');
    const lines = el('div', 'ed-git-rows');
    lines.style.paddingLeft = width + 'px';
    const svgHost = el('div', 'ed-git-svghost', svg);
    wrap.appendChild(svgHost);
    wrap.appendChild(lines);
    rows.forEach((r) => {
      const row = el('div', 'ed-git-row' + (r.wip ? ' wip' : ''));
      if (r.wip) row.innerHTML = `<span class="ed-git-subj"><i>${QS.esc(t('git.wip', { n: g.dirty.length }))}</i></span>`;
      else {
        const c = r.commit;
        row.innerHTML = `<code class="ed-git-hash">${c.hash.slice(0, 7)}</code><span class="ed-git-subj">${refBadges(c.refs)}${QS.esc(c.subject)}</span>` +
          `<span class="ed-git-author">${QS.esc(c.author)}</span><span class="ed-git-time" title="${new Date(c.time * 1000).toLocaleString()}">${QS.esc(ago(c.time))}</span>`;
      }
      row.onclick = () => toggleDetail(row, r, g);
      lines.appendChild(row);
    });
    box.appendChild(wrap);
    if (g.truncated) box.appendChild(el('p', 'ed-hint', QS.esc(t('git.truncated', { n: g.commits.length }))));
    box.appendChild(el('p', 'ed-hint', QS.esc(t('git.readOnly'))));
  }

  function fileList(files) {
    const pre = el('pre', 'ed-git-detail');
    pre.textContent = files.map((f) => f.code + ' ' + f.path).join('\n');
    return pre;
  }

  // 详情显示在列表下方，不插入行间，以免打乱与提交图的对齐
  async function toggleDetail(row, r, g) {
    const lines = row.parentNode;
    const panel = lines.parentNode.nextElementSibling && lines.parentNode.nextElementSibling.classList.contains('ed-git-detail')
      ? lines.parentNode.nextElementSibling : null;
    const wasOn = row.classList.contains('on');
    lines.querySelectorAll('.ed-git-row.on').forEach((n) => n.classList.remove('on'));
    if (panel) panel.remove();
    if (wasOn) return;
    row.classList.add('on');
    let detail;
    if (r.wip) detail = fileList(g.dirty);
    else {
      detail = el('pre', 'ed-git-detail', QS.esc(t('git.loading')));
      fetch('api/git/show?hash=' + r.commit.hash).then((x) => x.json()).then((j) => (detail.textContent = j.text || j.error || ''));
    }
    lines.parentNode.after(detail);
  }

  QS.showGit = async function () {
    const info = await fetch('api/info').then((r) => r.json()).catch(() => ({}));
    const box = el('div', 'ed-git');
    QS.modal(QS.esc(t('git.title', { name: info.slideName || 'slide' })), box, null, { wide: true });
    render(box);
  };
})();

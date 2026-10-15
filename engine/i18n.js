/* UI 多语言。语言跟随浏览器设置（支持 en / zh，其他语言用英文）；缺失的词条回退到英文。
 * 用法：QS.t('key', { var: 1 })；组件元数据可写成 { en: '…', zh: '…' }，用 QS.tl() 取当前语言。 */
(function () {
  'use strict';
  const QS = (window.QS = window.QS || {});

  const en = {
    /* content block types / effects / slide types */
    'type.text': 'Text',
    'type.list': 'List',
    'type.formula': 'Formula',
    'type.box': 'Example box',
    'type.image': 'Image',
    'type.circuit': 'Circuit',
    'type.anim': 'Animation',
    'type.spacer': 'Spacer',
    'effect.fade': 'Fade in',
    'effect.rise': 'Rise & fade',
    'effect.none': 'Appear instantly',
    'slide.content': 'Content slide',
    'slide.section': 'Section slide',
    'slide.cover': 'Cover',
    'default.text': 'Type your text here. [[Keywords]] get a blue highlight, $e^{i\\theta}$ is inline math.',
    'default.list': 'First item\nSecond item',
    'default.box.label': 'Example 1',
    'default.box.body': 'Text inside the box. [[Highlights]] and $math$ work here too.',
    'default.slideTitle': 'New slide',
    'default.sectionTitle': 'Section title',
    'default.coverTitle': 'Title',

    /* placeholders rendered on slides */
    'core.noImage': '(No image selected)',
    'core.animMissing': 'Animation component not found: {id}',
    'core.animNone': '(No animation component selected)',
    'core.unknownBlock': 'Unknown block type: {type}',
    'core.animError': 'Animation error: {msg}',

    /* player / presenter / print */
    'player.hint': '→ / Space: next step   ←: back   F: fullscreen   B: blackout   P: presenter view   number + Enter: go to slide',
    'player.defaultTitle': 'Presentation',
    'pv.title': 'Presenter view · {title}',
    'pv.next': 'NEXT',
    'pv.notes': 'SPEAKER NOTES',
    'pv.timerTip': 'Click to pause / resume',
    'pv.reset': 'Reset timer',
    'pv.black': 'Blackout (B)',
    'pv.audience': 'Open audience window',
    'pv.pos': 'Slide {i} / {n}   Step {s} / {m}',
    'pv.noNotes': '(No notes for this slide)',
    'pv.end': 'End of presentation',
    'print.title': 'Print / Save as PDF',
    'print.each': 'One page per animation step',
    'print.btn': 'Print…',
    'print.hint': 'In the print dialog choose "Save as PDF" and set margins to "None".',

    /* export */
    'exp.readFail': 'Could not read: {f}',
    'exp.readEngine': 'Reading engine code…',
    'exp.mathFonts': 'Embedding math fonts…',
    'exp.chars': 'Collecting the characters in use…',
    'exp.subset': 'Subsetting IBM Plex Sans SC {w} ({n} characters)…',
    'exp.images': 'Embedding images…',
    'exp.html': 'Generating HTML…',

    /* editor: top bar */
    'ed.untitled': 'Untitled',
    'ed.undo': '↶ Undo',
    'ed.undoTip': 'Undo (⌘Z)',
    'ed.redo': '↷ Redo',
    'ed.redoTip': 'Redo (⇧⌘Z)',
    'ed.offline': '⚠ Disconnected from server — cannot save',
    'ed.todoTip': 'Jump to the next TODO',
    'ed.help': 'Help',
    'ed.settings': 'Settings',
    'ed.print': 'Print / PDF',
    'ed.export': 'Export',
    'ed.presenter': 'Presenter mode',
    'ed.playStart': 'Play from start',
    'ed.play': '▶ Play from here',
    'ed.status.saving': 'Saving…',
    'ed.status.dirty': 'Unsaved',
    'ed.status.ok': 'Saved',

    /* editor: slide list */
    'ed.addContent': '+ Content',
    'ed.addSection': '+ Section',
    'ed.addCover': '+ Cover',
    'ed.dupSlide': 'Duplicate slide',
    'ed.delSlide': 'Delete slide',
    'ed.slideHasTodo': 'This slide has a TODO',
    'ed.keepOne': 'At least one slide must remain',
    'ed.slideDeleted': 'Deleted slide {n} (⌘Z to undo)',

    /* editor: canvas */
    'ed.slideRef': 'Slide <b>{i}</b> / {n} · <code>{id}</code> · {type}',
    'ed.copySlideRef': 'Copy slide reference',
    'ed.showIds': 'Show IDs',
    'ed.badgeStep': 'step {s}',
    'ed.stepPreview': 'Step preview',
    'ed.stepFinal': 'Final',
    'ed.stepFinalTip': 'How the slide looks once everything has appeared',
    'ed.step0Tip': 'Visible as soon as the slide opens',
    'ed.stepNTip': 'After pressing "next" {n} time(s)',
    'ed.playSlide': '▶ Play this slide',
    'ed.ghostHint': 'Content not yet visible is shown as a faint ghost',
    'ed.noSteps': 'This slide has no step animations',

    /* editor: context menu / block ops */
    'ed.addTodo': '+ TODO',
    'ed.addTodoTip': 'Pin a TODO note anywhere on the slide — it never takes up layout space',
    'ed.placeTodo': 'Click where the TODO should go (Esc to cancel)',
    'ed.showTodos': 'Show TODOs',
    'ed.menu.addTodoHere': 'Add TODO here',
    'ed.menu.delTodo': 'Delete TODO',
    'ed.todo.title': 'TODO note',
    'ed.todo.empty': '(empty TODO)',
    'ed.todo.pinnedTo': 'Pinned to {id} ({type}) — it follows the block when the layout changes.',
    'ed.todo.free': 'Free position ({x}, {y}) on the 1280×720 slide.',
    'ed.todo.dragHint': 'Drag the pin to move it; drop it on a block to attach it there. TODO notes take no layout space and only appear in the editor — never when presenting or exporting.',
    'ed.todo.deleted': 'Deleted {id} (⌘Z to undo)',
    'ed.todo.files': 'Attachments',
    'ed.todo.addFile': 'Add images…',
    'ed.todo.filesHint': 'Images for Claude to look at — sketches, screenshots, references. Drop images here or onto the pin, or paste with ⌘V while this TODO is selected. They are stored in the slide\'s todo/ folder and never exported.',
    'ed.todo.removeFile': 'Remove attachment (the file stays in todo/)',
    'ed.todo.attached': 'Attached {n} image(s) to {id}',
    'ed.ref.files': ' (attachments: {files})',
    'ed.ref.todo': '[{page} | TODO {id} at {where}] "{snip}"',
    'ed.menu.copyRef': 'Copy reference (for Claude)',
    'ed.menu.dup': 'Duplicate block',
    'ed.menu.up': 'Move up',
    'ed.menu.down': 'Move down',
    'ed.menu.del': 'Delete',
    'ed.contentOnly': 'Blocks can only be added to content slides',
    'ed.blockDeleted': 'Deleted {id} (⌘Z to undo)',
    'ed.imageSaved': 'Image saved to {path}',
    'ed.uploadFail': 'Upload failed: {msg}',
    'ed.refCopied': 'Reference copied: {ref}',
    'ed.refPrompt': 'Copy this reference:',
    'ed.refSlide': 'Slide {i} {id}',
    'ed.docTitle': 'Slide Editor',
    'ed.ref.slide': '[{page} "{title}"]',
    'ed.ref.block': '[{page} | {id} {type}] "{snip}"',
    'ed.blockCopied': 'Copied {id} — switch to another slide and press ⌘V to paste',
    'ed.nothingUndo': 'Nothing to undo',
    'ed.nothingRedo': 'Nothing to redo',
    'ed.saveFail': 'Save failed: {msg} (is npm run dev still running?)',

    /* editor: external change / conflict */
    'ed.loadedExternal': 'Loaded external changes',
    'ed.undoHint': ' (use Undo to go back)',
    'ed.conflict.title': 'The file was changed elsewhere',
    'ed.conflict.body': '<p>deck.json was changed outside the editor (usually Claude just added something for you), and you also have unsaved changes here.</p>',
    'ed.conflict.theirs': 'Load the external version',
    'ed.conflict.mine': 'Keep mine (overwrite external changes)',
    'ed.loadedTheirs': 'Loaded the external version',

    /* editor: properties panel */
    'ed.settingsFor': '{type} settings',
    'ed.title': 'Title',
    'ed.mainTitle': 'Main title',
    'ed.titleBreakHint': 'Use line breaks to control where the title wraps',
    'ed.author': 'Author / presenter',
    'ed.coverSub': 'Subtitle (lower left)',
    'ed.footer': 'Footer',
    'ed.sectionNum': 'Label (e.g. Part 2)',
    'ed.subtitle': 'Subtitle',
    'ed.layout': 'Layout',
    'ed.layout.single': 'Single column',
    'ed.layout.split': 'Two columns',
    'ed.leftWidth': 'Left column width',
    'ed.notes': 'Speaker notes (presenter view only)',
    'ed.notesPh': 'What to say on this slide…',
    'ed.blocksOnSlide': 'Blocks on this slide',
    'ed.noBlocks': 'No blocks yet — add one with the buttons below.',
    'ed.colL': 'L·',
    'ed.colR': 'R·',
    'ed.stepShort': 'step {s}',
    'ed.addAfter': 'Add after this block',
    'ed.addBlock': 'Add block',
    'ed.backToSlide': '← Slide settings',
    'ed.copyRef': 'Copy reference',
    'ed.copyRefTip': 'Copy text that pinpoints this block, to send to Claude',
    'ed.markupHint': '[[highlight]]   {{blue}}   **bold**   $inline math$   $$display math$$   blank line = new paragraph',
    'ed.f.text': 'Text',
    'ed.f.size': 'Size',
    'ed.f.size.normal': 'Normal',
    'ed.f.size.large': 'Large',
    'ed.f.size.small': 'Small',
    'ed.f.align': 'Alignment',
    'ed.f.align.left': 'Left',
    'ed.f.align.center': 'Center',
    'ed.f.items': 'Items (one per line)',
    'ed.f.ordered': 'Numbered list (1. 2. 3.)',
    'ed.f.stepwise': 'Reveal one item at a time (one step each)',
    'ed.f.latex': 'LaTeX formula',
    'ed.f.latexHint': 'For several formulas, separate them with a line containing only >>> — each "next" morphs the formula in place into the following one.',
    'ed.f.texErr': 'Formula error: {msg}',
    'ed.f.boxed': 'Gray background box',
    'ed.f.sizePct': 'Size (%)',
    'ed.f.caption': 'Caption (optional)',
    'ed.f.label': 'Label',
    'ed.f.labelPh': 'Example 1 / Definition / Theorem',
    'ed.f.variant': 'Style',
    'ed.f.variant.example': 'Example box',
    'ed.f.variant.note': 'Note box',
    'ed.f.body': 'Content',
    'ed.f.pickImage': 'Choose image file…',
    'ed.f.fromAssets': 'Pick from assets/…',
    'ed.f.image': 'Image',
    'ed.f.imageHint': 'You can also drag an image onto the canvas, or copy a screenshot and press ⌘V in the editor.',
    'ed.f.path': 'Path',
    'ed.f.width': 'Width',
    'ed.f.spec': 'Circuit description',
    'ed.f.specHelp': 'Circuit syntax',
    'ed.f.specHelpBody': 'qubits 3          number of qubits\nin 0 |j_1\\rangle   left label (LaTeX)\nout 0 |k_1\\rangle  right label\nH 0               single-qubit gate (name may be LaTeX, e.g. R_2)\nC1 R_2 0          controlled gate: control 1, target 0\nC1,2 X 0          several controls; X target is drawn as ⊕\nC0 * 1            controlled phase (dots at both ends)\nSWAP 0 2          swap\nM 0               measurement\nU_f 0-2           box spanning several qubits\n|                 force a new column\n...               ellipsis column\n# comment',
    'ed.f.circuitStep': 'Reveal',
    'ed.f.circuitStep.none': 'All at once',
    'ed.f.circuitStep.gate': 'One gate per step',
    'ed.f.circuitStep.column': 'One column per step',
    'ed.f.scale': 'Scale',
    'ed.f.component': 'Animation component',
    'ed.f.componentNone': '— choose a component —',
    'ed.f.height': 'Height',
    'ed.f.params': 'Animation parameters',
    'ed.f.animSteps': 'This component has {n} internal stage(s) and occupies steps {a}–{b}.',
    'ed.f.todo': 'Request for Claude',
    'ed.f.todoPh': 'e.g. Put an animation here showing how each qubit\'s phase accumulates in a 3-qubit QFT',
    'ed.appear': 'Appearance',
    'ed.appearStep': 'Appears at step',
    'ed.appearStepHint': '0 = visible as soon as the slide opens; 1 = appears after pressing "next" once; and so on. Blocks with the same step appear together.',
    'ed.effect': 'Entrance effect',
    'ed.column': 'Column',
    'ed.column.left': 'Left',
    'ed.column.right': 'Right',
    'ed.act.up': 'Up',
    'ed.act.down': 'Down',
    'ed.act.dup': 'Duplicate',
    'ed.act.del': 'Delete',

    /* editor: play */
    'ed.noFullscreen': 'Could not enter fullscreen — press Esc to stop',

    /* editor: dialogs */
    'ed.close': 'Close',
    'ed.helpTitle': 'Help',
    'ed.helpHtml': `
      <h4>Text markup</h4>
      <table class="ed-help-tab">
        <tr><td><code>[[qubit]]</code></td><td>Blue highlight (sweeps in from the left when it appears)</td></tr>
        <tr><td><code>{{phase}}</code></td><td>Blue text</td></tr>
        <tr><td><code>**key point**</code></td><td>Bold</td></tr>
        <tr><td><code>$e^{i\\theta}$</code></td><td>Inline math</td></tr>
        <tr><td><code>$$\\sum_k x_k$$</code></td><td>Display math</td></tr>
        <tr><td>Blank line</td><td>New paragraph</td></tr>
      </table>
      <h4>Step animations</h4>
      <p>Every block has an "appears at step" number: 0 shows it as soon as the slide opens, 1 after pressing "next" once, and so on. Lists can reveal item by item; in a formula block, separate several formulas with a line containing only <code>&gt;&gt;&gt;</code> and they morph in place one after another; circuits can reveal gate by gate. Use "Step preview" below the canvas to inspect each step.</p>
      <h4>Working with Claude</h4>
      <p>① Every block has a permanent ID (e.g. <code>B-7K2</code>) that never changes when you insert or reorder. Right-click a block → "Copy reference" and paste it to Claude to pinpoint it.<br>
         ② Click <b>+ TODO</b> above the canvas (or right-click anywhere on a slide, including covers) to pin a TODO note exactly where you want something — it takes no layout space. Describe what you want, then tell Claude "handle the TODOs".<br>
         ③ When Claude edits the file, the editor reloads automatically. Not happy? Press ⌘Z. For longer-term history, manage the slide folder with Git (see the Git button).</p>
      <h4>Keyboard shortcuts</h4>
      <table class="ed-help-tab">
        <tr><td>⌘Z / ⇧⌘Z</td><td>Undo / redo</td></tr>
        <tr><td>⌘↩</td><td>Play from the current slide</td></tr>
        <tr><td>⌘D, ⌘C / ⌘V</td><td>Duplicate block; copy & paste blocks across slides</td></tr>
        <tr><td>⌥↑ / ⌥↓</td><td>Move selected block up / down</td></tr>
        <tr><td>Delete</td><td>Delete selected block</td></tr>
        <tr><td>↑ / ↓</td><td>Switch slides (when no block is selected)</td></tr>
        <tr><td>⌘V (screenshot)</td><td>Insert image</td></tr>
      </table>
      <h4>While presenting</h4>
      <p>→ / Space / clicker: next step   ←: back   ⇧→: next slide   number + Enter: go to slide   B: blackout   F: fullscreen   P: presenter view   Esc: exit</p>`,
    'git.badgeTip': 'Git history of the slide folder (read-only)',
    'git.badgeNone': 'no repo',
    'git.title': 'Git history — {name}',
    'git.refresh': 'Refresh',
    'git.loading': 'Loading…',
    'git.unavailable': 'Git is not installed on this computer, so no history can be shown.',
    'git.noRepo': '<p>This slide folder is not a Git repository, so there is no history to show.</p><p>The editor never creates or changes repositories. If you want version control for this slide, run these commands in a terminal:</p>',
    'git.branch': 'Branch',
    'git.detached': 'detached HEAD',
    'git.wip': 'Uncommitted changes ({n})',
    'git.clean': 'working tree clean',
    'git.noCommits': 'No commits yet.',
    'git.truncated': 'Showing the latest {n} commits.',
    'git.readOnly': 'Read-only view — click a row for details. Commit, branch and roll back with Git itself.',
    'ed.setTitle': 'Settings',
    'ed.setDeckTitle': 'Presentation title (browser tab and export file name)',
    'ed.setAccent': 'Accent color (highlights, circuit gates and cover art follow it)',
    'ed.setAccentReset': 'Reset to default blue',
    'ed.setPageNo': 'Show page numbers on content slides',
    'ed.exporting': 'Exporting…',
    'ed.expPrepare': 'Preparing…',
    'ed.expWrite': 'Writing file…',
    'ed.expDoneTitle': 'Export complete',
    'ed.expDoneBody': '<p>Single-file presentation created:<br><code>{path}</code><br>Size: {size} MB</p><p>Copy this file to any computer and double-click it to present in Chrome / Edge / Safari — no internet or installation needed. Press <b>P</b> after opening for presenter view.</p>',
    'ed.expTodos': '<p class="ed-warn">Note: {n} TODO note(s) are still open (they never appear in the export).</p>',
    'ed.expReveal': 'Show in Finder',
    'ed.expFailTitle': 'Export failed',
    'ed.fatalTitle': 'Could not load deck.json',
    'ed.fatalBody': 'Run <code>npm run dev</code> in the project folder to open the editor (it needs the local server).',
  };

  const zh = {
    'type.text': '正文',
    'type.list': '列表',
    'type.formula': '公式框',
    'type.box': '示例框',
    'type.image': '图片',
    'type.circuit': '量子线路',
    'type.anim': '动画',
    'type.spacer': '间隔',
    'effect.fade': '淡入',
    'effect.rise': '上浮淡入',
    'effect.none': '直接出现',
    'slide.content': '内容页',
    'slide.section': '章节页',
    'slide.cover': '封面',
    'default.text': '在这里输入正文，[[关键词]] 会蓝色高亮，$e^{i\\theta}$ 是行内公式。',
    'default.list': '第一条\n第二条',
    'default.box.label': '例 1',
    'default.box.body': '框内文字，同样支持 [[高亮]] 和 $公式$。',
    'default.slideTitle': '新的一页',
    'default.sectionTitle': '章节标题',
    'default.coverTitle': '标题',

    'core.noImage': '（未选择图片）',
    'core.animMissing': '找不到动画组件：{id}',
    'core.animNone': '（未选择动画组件）',
    'core.unknownBlock': '未知内容块：{type}',
    'core.animError': '动画出错：{msg}',

    'player.hint': '→ / 空格 下一步　← 上一步　F 全屏　B 黑屏　P 演讲者视图　数字+回车 跳页',
    'player.defaultTitle': '演示',
    'pv.title': '演讲者视图 · {title}',
    'pv.next': '下一步',
    'pv.notes': '讲稿备注',
    'pv.timerTip': '点击暂停 / 继续',
    'pv.reset': '计时归零',
    'pv.black': '黑屏 (B)',
    'pv.audience': '打开观众窗口',
    'pv.pos': '第 {i} / {n} 页　步骤 {s} / {m}',
    'pv.noNotes': '（本页没有备注）',
    'pv.end': '放映结束',
    'print.title': '打印 / 存为 PDF',
    'print.each': '每个动画步骤单独一页',
    'print.btn': '打印…',
    'print.hint': '在打印对话框中选择"存储为 PDF"，并把边距设为"无"。',

    'exp.readFail': '读取失败：{f}',
    'exp.readEngine': '读取引擎代码…',
    'exp.mathFonts': '内嵌公式字体…',
    'exp.chars': '统计用到的文字…',
    'exp.subset': '字体子集化：IBM Plex Sans SC {w}（{n} 个字符）…',
    'exp.images': '内嵌图片…',
    'exp.html': '生成 HTML…',

    'ed.untitled': '未命名',
    'ed.undo': '↶ 撤销',
    'ed.undoTip': '撤销 (⌘Z)',
    'ed.redo': '↷ 重做',
    'ed.redoTip': '重做 (⇧⌘Z)',
    'ed.offline': '⚠ 与服务器断开，无法保存',
    'ed.todoTip': '跳到下一个 TODO',
    'ed.help': '帮助',
    'ed.settings': '全局设置',
    'ed.print': '打印 / PDF',
    'ed.export': '导出演示文件',
    'ed.presenter': '演讲者模式',
    'ed.playStart': '从头放映',
    'ed.play': '▶ 从当前页放映',
    'ed.status.saving': '保存中…',
    'ed.status.dirty': '未保存',
    'ed.status.ok': '已保存',

    'ed.addContent': '＋ 内容页',
    'ed.addSection': '＋ 章节页',
    'ed.addCover': '＋ 封面',
    'ed.dupSlide': '复制本页',
    'ed.delSlide': '删除本页',
    'ed.slideHasTodo': '本页有 TODO',
    'ed.keepOne': '至少要保留一页',
    'ed.slideDeleted': '已删除第 {n} 页（⌘Z 可撤销）',

    'ed.slideRef': '第 <b>{i}</b> / {n} 页 · <code>{id}</code> · {type}',
    'ed.copySlideRef': '复制本页引用',
    'ed.showIds': '显示编号',
    'ed.badgeStep': '步{s}',
    'ed.stepPreview': '步骤预览',
    'ed.stepFinal': '最终',
    'ed.stepFinalTip': '显示本页全部内容出现后的样子',
    'ed.step0Tip': '翻到本页时立即显示的内容',
    'ed.stepNTip': '按第 {n} 次"下一步"之后',
    'ed.playSlide': '▶ 播放本页动画',
    'ed.ghostHint': '未出现的内容在预览中显示为淡影',
    'ed.noSteps': '本页没有分步动画',

    'ed.addTodo': '+ TODO',
    'ed.addTodoTip': '在页面任意位置钉一个 TODO 标注，不占版面',
    'ed.placeTodo': '点击要放 TODO 的位置（Esc 取消）',
    'ed.showTodos': '显示 TODO',
    'ed.menu.addTodoHere': '在这里添加 TODO',
    'ed.menu.delTodo': '删除 TODO',
    'ed.todo.title': 'TODO 标注',
    'ed.todo.empty': '（空 TODO）',
    'ed.todo.pinnedTo': '钉在 {id}（{type}）上，排版变化时会跟着这个块移动。',
    'ed.todo.free': '自由位置（{x}, {y}），坐标基于 1280×720 画布。',
    'ed.todo.dragHint': '拖动图钉可以移动它；拖到某个内容块上就会钉在那个块上。TODO 标注不占版面，只在编辑器里显示，放映和导出时都不会出现。',
    'ed.todo.deleted': '已删除 {id}（⌘Z 可撤销）',
    'ed.todo.files': '附件',
    'ed.todo.addFile': '添加图片…',
    'ed.todo.filesHint': '给 Claude 参考的图片，比如草图、截图、参考资料。可以把图片拖到这里或拖到图钉上，也可以在选中这个 TODO 时按 ⌘V 粘贴。附件保存在幻灯片的 todo/ 文件夹里，不会被导出。',
    'ed.todo.removeFile': '移除附件（文件仍保留在 todo/ 里）',
    'ed.todo.attached': '已给 {id} 添加 {n} 张图片',
    'ed.ref.files': '（附件：{files}）',
    'ed.ref.todo': '【{page}｜TODO {id} 位于 {where}】“{snip}”',
    'ed.menu.copyRef': '复制引用（发给 Claude）',
    'ed.menu.dup': '复制这个块',
    'ed.menu.up': '上移',
    'ed.menu.down': '下移',
    'ed.menu.del': '删除',
    'ed.contentOnly': '只有内容页可以添加内容块',
    'ed.blockDeleted': '已删除 {id}（⌘Z 可撤销）',
    'ed.imageSaved': '图片已保存到 {path}',
    'ed.uploadFail': '上传失败：{msg}',
    'ed.refCopied': '已复制引用：{ref}',
    'ed.refPrompt': '复制下面这段引用：',
    'ed.refSlide': '第{i}页 {id}',
    'ed.docTitle': '幻灯片编辑器',
    'ed.ref.slide': '【{page}「{title}」】',
    'ed.ref.block': '【{page}｜{id} {type}】“{snip}”',
    'ed.blockCopied': '已复制 {id}，切到别的页按 ⌘V 粘贴',
    'ed.nothingUndo': '没有可撤销的操作',
    'ed.nothingRedo': '没有可重做的操作',
    'ed.saveFail': '保存失败：{msg}（npm run dev 还在运行吗？）',

    'ed.loadedExternal': '已载入外部修改',
    'ed.undoHint': '（可以用"撤销"回到之前的版本）',
    'ed.conflict.title': '文件被外部修改了',
    'ed.conflict.body': '<p>deck.json 在编辑器之外被改动了（通常是 Claude 刚刚帮你加了内容），而你这边也有尚未保存的修改。</p>',
    'ed.conflict.theirs': '载入外部版本',
    'ed.conflict.mine': '保留我的版本（覆盖外部修改）',
    'ed.loadedTheirs': '已载入外部版本',

    'ed.settingsFor': '{type}设置',
    'ed.title': '标题',
    'ed.mainTitle': '主标题',
    'ed.titleBreakHint': '手动换行可控制标题断行',
    'ed.author': '作者 / 汇报人',
    'ed.coverSub': '副标题（左下）',
    'ed.footer': '页脚',
    'ed.sectionNum': '编号（如 Part 2）',
    'ed.subtitle': '副标题',
    'ed.layout': '布局',
    'ed.layout.single': '单栏',
    'ed.layout.split': '左右两栏',
    'ed.leftWidth': '左栏宽度',
    'ed.notes': '讲稿备注（只在演讲者视图显示）',
    'ed.notesPh': '这一页要讲的话…',
    'ed.blocksOnSlide': '本页内容块',
    'ed.noBlocks': '还没有内容块，用下方按钮添加。',
    'ed.colL': '左·',
    'ed.colR': '右·',
    'ed.stepShort': '步{s}',
    'ed.addAfter': '在此块后面添加',
    'ed.addBlock': '添加内容块',
    'ed.backToSlide': '← 本页设置',
    'ed.copyRef': '复制引用',
    'ed.copyRefTip': '复制一段能精确定位这个块的文字，发给 Claude',
    'ed.markupHint': '[[高亮]]　{{蓝字}}　**加粗**　$行内公式$　$$行间公式$$　空行=分段',
    'ed.f.text': '文字',
    'ed.f.size': '字号',
    'ed.f.size.normal': '正常',
    'ed.f.size.large': '大',
    'ed.f.size.small': '小',
    'ed.f.align': '对齐',
    'ed.f.align.left': '左对齐',
    'ed.f.align.center': '居中',
    'ed.f.items': '条目（每行一条）',
    'ed.f.ordered': '编号列表（1. 2. 3.）',
    'ed.f.stepwise': '逐条出现（每条占一步）',
    'ed.f.latex': 'LaTeX 公式',
    'ed.f.latexHint': '写多个公式时，用单独一行 >>> 隔开：每按一次"下一步"，就在原位变换到下一个公式。',
    'ed.f.texErr': '公式错误：{msg}',
    'ed.f.boxed': '灰色底框',
    'ed.f.sizePct': '字号（%）',
    'ed.f.caption': '说明文字（可选）',
    'ed.f.label': '标签',
    'ed.f.labelPh': '例 1 / 定义 / 定理',
    'ed.f.variant': '样式',
    'ed.f.variant.example': '示例框',
    'ed.f.variant.note': '提示框',
    'ed.f.body': '内容',
    'ed.f.pickImage': '选择图片文件…',
    'ed.f.fromAssets': '从 assets/ 里选…',
    'ed.f.image': '图片',
    'ed.f.imageHint': '也可以直接把图片拖到画布上，或复制截图后在编辑器里按 ⌘V。',
    'ed.f.path': '路径',
    'ed.f.width': '宽度',
    'ed.f.spec': '线路描述',
    'ed.f.specHelp': '线路语法',
    'ed.f.specHelpBody': 'qubits 3          比特数\nin 0 |j_1\\rangle   左侧标签（LaTeX）\nout 0 |k_1\\rangle  右侧标签\nH 0               单比特门（门名可写 LaTeX，如 R_2）\nC1 R_2 0          受控门：控制 1，作用在 0\nC1,2 X 0          多控制；目标为 X 时画 ⊕\nC0 * 1            受控相位（两端实心点）\nSWAP 0 2          交换\nM 0               测量\nU_f 0-2           跨多比特的方框\n|                 强制换列\n...               省略号列\n# 注释',
    'ed.f.circuitStep': '逐步出现',
    'ed.f.circuitStep.none': '整体出现',
    'ed.f.circuitStep.gate': '每个门一步',
    'ed.f.circuitStep.column': '每列一步',
    'ed.f.scale': '缩放',
    'ed.f.component': '动画组件',
    'ed.f.componentNone': '— 选择动画组件 —',
    'ed.f.height': '高度',
    'ed.f.params': '动画参数',
    'ed.f.animSteps': '这个组件内部有 {n} 个动画阶段，会占用步骤 {a}–{b}。',
    'ed.f.todo': '给 Claude 的需求',
    'ed.f.todoPh': '例如：在这里放一个动画，演示 3 比特 QFT 中每个比特的相位如何累积',
    'ed.appear': '出现方式',
    'ed.appearStep': '出现步骤',
    'ed.appearStepHint': '0 = 翻到本页就显示；1 = 按一次"下一步"后出现；依此类推。步骤号相同的块会同时出现。',
    'ed.effect': '入场效果',
    'ed.column': '所在栏',
    'ed.column.left': '左栏',
    'ed.column.right': '右栏',
    'ed.act.up': '上移',
    'ed.act.down': '下移',
    'ed.act.dup': '复制',
    'ed.act.del': '删除',

    'ed.noFullscreen': '无法进入全屏，按 Esc 退出放映',

    'ed.close': '关闭',
    'ed.helpTitle': '使用说明',
    'ed.helpHtml': `
      <h4>文字标记</h4>
      <table class="ed-help-tab">
        <tr><td><code>[[量子比特]]</code></td><td>蓝底白字高亮（出现时从左向右扫入）</td></tr>
        <tr><td><code>{{相位}}</code></td><td>蓝色文字</td></tr>
        <tr><td><code>**重点**</code></td><td>加粗</td></tr>
        <tr><td><code>$e^{i\\theta}$</code></td><td>行内公式</td></tr>
        <tr><td><code>$$\\sum_k x_k$$</code></td><td>行间公式</td></tr>
        <tr><td>空一行</td><td>另起一段</td></tr>
      </table>
      <h4>分步动画</h4>
      <p>每个内容块都有"出现步骤"：0 表示翻到本页就显示，1 表示按一次"下一步"后出现，以此类推。列表可以逐条出现；公式框里用单独一行 <code>&gt;&gt;&gt;</code> 隔开多个公式，会在原位依次变换；线路可以逐门出现。画布下方的"步骤预览"可以查看每一步的状态。</p>
      <h4>和 Claude 协作</h4>
      <p>① 每个块都有固定编号（如 <code>B-7K2</code>），插入或排序都不会变。右键块 →"复制引用"，粘贴给 Claude 即可精确定位。<br>
         ② 点画布上方的 <b>+ TODO</b>（或在任何页面上右键，包括封面），在想加内容的位置钉一个 TODO 标注并写下需求，它不占版面。然后告诉 Claude"处理 TODO"。<br>
         ③ Claude 修改文件后，编辑器会自动刷新；如果不满意，按 ⌘Z 撤销；更长期的版本管理请用 Git 管理幻灯片文件夹（见 Git 按钮）。</p>
      <h4>快捷键</h4>
      <table class="ed-help-tab">
        <tr><td>⌘Z / ⇧⌘Z</td><td>撤销 / 重做</td></tr>
        <tr><td>⌘↩</td><td>从当前页放映</td></tr>
        <tr><td>⌘D、⌘C / ⌘V</td><td>复制块；跨页复制粘贴块</td></tr>
        <tr><td>⌥↑ / ⌥↓</td><td>上移 / 下移选中的块</td></tr>
        <tr><td>Delete</td><td>删除选中的块</td></tr>
        <tr><td>↑ / ↓</td><td>切换幻灯片（未选中块时）</td></tr>
        <tr><td>⌘V（粘贴截图）</td><td>插入图片</td></tr>
      </table>
      <h4>放映时</h4>
      <p>→ / 空格 / 翻页笔：下一步　←：上一步　⇧→：直接下一页　数字+回车：跳页　B：黑屏　F：全屏　P：打开演讲者视图　Esc：退出</p>`,
    'git.badgeTip': '幻灯片文件夹的 Git 历史（只读）',
    'git.badgeNone': '无仓库',
    'git.title': 'Git 历史 — {name}',
    'git.refresh': '刷新',
    'git.loading': '加载中…',
    'git.unavailable': '这台电脑没有安装 Git，无法显示历史。',
    'git.noRepo': '<p>这个幻灯片文件夹不是 Git 仓库，所以没有历史可显示。</p><p>编辑器不会创建或修改任何仓库。如果想用版本控制管理这份幻灯片，在终端里运行：</p>',
    'git.branch': '分支',
    'git.detached': '游离 HEAD',
    'git.wip': '未提交的修改（{n} 个文件）',
    'git.clean': '工作区干净',
    'git.noCommits': '还没有提交。',
    'git.truncated': '只显示最近 {n} 个提交。',
    'git.readOnly': '只读视图，点击一行查看详情。提交、分支、回退请直接用 Git 操作。',
    'ed.setTitle': '全局设置',
    'ed.setDeckTitle': '演示标题（浏览器标签和导出文件名）',
    'ed.setAccent': '主题色（高亮、线路门、封面插画都会跟着变）',
    'ed.setAccentReset': '恢复默认蓝',
    'ed.setPageNo': '内容页右下角显示页码',
    'ed.exporting': '正在导出…',
    'ed.expPrepare': '准备中…',
    'ed.expWrite': '写入文件…',
    'ed.expDoneTitle': '导出完成',
    'ed.expDoneBody': '<p>已生成单文件演示：<br><code>{path}</code><br>大小：{size} MB</p><p>把这个文件拷到任何电脑上，用 Chrome / Edge / Safari 双击打开即可放映，不需要联网，也不需要安装任何东西。打开后按 <b>P</b> 可以进入演讲者视图。</p>',
    'ed.expTodos': '<p class="ed-warn">注意：还有 {n} 个 TODO 标注没处理（导出文件里不会出现）。</p>',
    'ed.expReveal': '在访达中显示',
    'ed.expFailTitle': '导出失败',
    'ed.fatalTitle': '无法载入 deck.json',
    'ed.fatalBody': '请在项目文件夹里运行 <code>npm run dev</code> 打开编辑器（需要本地服务器）。',
  };

  const DICT = { en, zh };
  QS.i18n = DICT;

  /** 按浏览器的语言偏好顺序取第一个支持的语言（zh-CN、zh-TW… → zh），都不支持则用英文。
   *  命令行工具（Node 里没有 document）始终用英文。 */
  function pick() {
    if (typeof document === 'undefined' || typeof navigator === 'undefined') return 'en';
    const prefs = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || 'en'];
    for (const tag of prefs) {
      const base = String(tag).toLowerCase().split('-')[0];
      if (DICT[base]) return base;
    }
    return 'en';
  }
  QS.lang = pick();

  /** 取词条：当前语言 → 英文 → key 本身；{name} 占位符用 vars 替换 */
  QS.t = function (key, vars) {
    const cur = DICT[QS.lang] || en;
    let s = cur[key] !== undefined ? cur[key] : en[key] !== undefined ? en[key] : key;
    if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m));
    return s;
  };
  /** 组件元数据里的可本地化字段：字符串原样返回，{en, zh} 取当前语言，回退英文 */
  QS.tl = function (v) {
    if (!v || typeof v !== 'object') return v;
    return v[QS.lang] !== undefined ? v[QS.lang] : v.en !== undefined ? v.en : Object.values(v)[0];
  };
})();

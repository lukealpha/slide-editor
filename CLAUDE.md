# 幻灯片编辑系统

离线幻灯片编辑器、放映器和导出器，外观由每份幻灯片自己的主题决定（IBM Quantum Learning 讲义风格、中山大学 Beamer 等）。用户在 GUI 里编辑内容；Claude 负责按用户指定的位置加内容、写动画组件。
当前正在编辑的幻灯片的内容背景见 `slide/CLAUDE.md`；它用哪个主题看 `slide/deck.json` 的 `meta.theme`。

## 两个仓库，严格分离

- **编辑系统**：本目录，是一个 git 仓库，`.gitignore` 里忽略了 `/slide/`。
- **幻灯片**：`slide/` 是完全独立的内容文件夹，包含 `deck.json`、`assets/`、`animations/`、`export/`。它是否用 git 管理由用户决定：编辑器和 Claude 都**不得**替它 init、commit 或做任何修改仓库的操作，除非用户明确要求。
- 编辑器没有自带的版本管理（快照、历史都已删除）。顶栏的 Git 按钮只读显示 `slide/` 自己仓库的提交图（`engine/gitpanel.js` + `/api/git`）。服务器会确认 `slide/` 本身就是仓库根目录，否则视为"没有仓库"，避免误显示外层编辑器仓库。
- 换一份幻灯片：用户把 `slide/` 拷走，再运行 `npm run dev`，会自动生成一份空白的 `slide/`（`npm run dev -- --theme <主题>` 指定主题，只在新建时起作用）。也可以用 `npm run dev -- --slide <路径>` 或环境变量 `SLIDE_DIR` 编辑其他位置的幻灯片（`check` / `export` 同理）。`--port <端口>` 指定端口（默认 8765）。
- 服务器的路径规则（`tools/slide.js`、`tools/engine.js` 的 `resolve`）：`deck.json`、`assets/*`、`animations/*`、`export/*` 映射到幻灯片文件夹，其余（包括 `themes/`）映射到编辑器目录。

## 主题

- 每份幻灯片在 `deck.json` 的 `meta.theme` 里写明主题（没有这个字段时是 `ibm-quantum`）。主题在新建时定好，之后一般不改：编辑器设置里只读显示，没有修改入口。要换只能手动改 `meta.theme`，而且不保证内容在另一个主题下还能用——主题不支持的页面类型、内容块、字号在编辑器里显示成红色占位，`npm run check` 报错，导出拒绝执行。**Claude 不要替用户改 `meta.theme`**，除非用户明确要求。
- 主题放在 `themes/<id>/`：`theme.js`（调用 `QS.registerTheme(def)`，字段说明见 `engine/core.js` 的"主题"一节）、`theme.css`（全部视觉样式）、可选的 `starter.json`（新建幻灯片的初始内容）、字体和图片。主题决定：画布尺寸、有哪些页面类型及其渲染和编辑字段、可用的内容块和正文字号、每页的页眉页脚（`decorate`）、设置面板里的主题选项、导出时内嵌的字体、`check` 的额外检查。主题专属的界面文字写在 `def.i18n`（en / zh 两种都要有）。
- 与主题无关的机制（尺寸变量、逐步出现、公式序列与变形、块的收起、占位提示）在 `engine/base.css`；主题样式表在它之后载入。
- 现有主题：
  - `ibm-quantum`：IBM Quantum Learning 讲义风格，1280×720，IBM Plex Sans SC。页面类型 `content` / `section` / `cover`。
  - `sysu-beamer`：中山大学 Beamer 模板（Berlin / smoothbars / circles）的复刻，960×720（4:3，1pt ≈ 2.646px），Latin Modern + Fandol 宋体（`themes/sysu-beamer/fonts/`，许可证文件在同一目录）。页面类型 `content` / `cover`；没有电路块。尺寸量自 XeLaTeX 编译的原版 PDF。

## 结构

- `slide/deck.json`：全部幻灯片内容，唯一数据源。编辑器每 1.5 秒检测一次文件变化，自动载入外部修改。
- `index.html` + `engine/editor.js`：编辑器。`present.html`：放映（`#presenter` 演讲者视图，`#audience` 观众窗口，`#print` 打印）。
- `engine/core.js`：主题注册与载入、内容块渲染、行内标记、步骤逻辑；`circuit.js`：线路；`player.js`：放映与多窗口同步；`export.js` + `fontsubset.js`：导出单文件 HTML（只打包这份幻灯片的主题，用 harfbuzz wasm 把主题字体子集化）。IBM 主题的封面插画在 `themes/ibm-quantum/coverart.js`。
- `server.js`：Node 标准库，零依赖（不需要 npm install），仅 127.0.0.1。
- npm 脚本：`dev`/`start`（启动并打开浏览器）、`serve`（不打开浏览器）、`export`（命令行导出到 `slide/export/`）、`check`（校验 deck.json：主题、编号、KaTeX、组件、图片）。`tools/engine.js` 在 Node 里用 vm 载入浏览器端引擎代码和幻灯片的主题，导出逻辑与编辑器共用 `engine/export.js`。
- `slide/animations/*.js`：这份幻灯片的动画组件，服务器会自动列出（`_` 开头的文件除外）。新组件从 `templates/animation.js` 复制。
- 界面文字全部在 `engine/i18n.js`，主题专属的在主题的 `i18n` 里（跟随浏览器的语言设置：中文浏览器用 zh，其他一律 en；en 也是缺失词条的回退。编辑器里没有语言选单，导出文件同样按观看者的浏览器语言显示）。新增 UI 文字必须两种语言都加词条，不要在代码里写死。组件的 name / description / 参数 label 可写成 `{ en, zh }`。
- 引擎是 classic script（不能用 ES module），因为导出文件要能在 `file://` 下直接运行。不允许引入 CDN 或需要 npm 构建的东西。

## 修改 deck.json 的规则

1. 不再做快照。如果 `slide/` 是 git 仓库，用户自己管理提交，Claude 不要替他提交。改动后告诉用户改了哪些块（ID），方便他用 ⌘Z 撤销或在 git 里查看。
2. 用户引用的格式是 `[Slide 5 S-K3P | B-9XF Formula] "…"`、`[Slide 5 S-K3P | TODO T-4KX at B-9XF Formula] "…"`（英文界面）或 `【第5页 S-K3P｜B-9XF 公式框】"…"`（中文界面）。按 ID 定位，不要按页码定位（页码会变，ID 不会）。
3. 新建 ID：幻灯片 `S-XXX`，内容块 `B-XXX`，TODO 标注 `T-XXX`。XXX 是 3 个字符，取自 `23456789ABCDEFGHJKLMNPQRSTUVWXYZ`，全文唯一。不要修改已有 ID。
4. "处理 TODO"：TODO 不是内容块，而是每页 `todos` 数组里的标注，不占版面，只在编辑器显示。`{ id: "T-XXX", text, block, fx, fy, x, y }`：有 `block` 时钉在该块上（`fx`/`fy` 是块内的相对位置，0–1），否则 `x`/`y` 是画布坐标（画布尺寸见主题，IBM 1280×720、Beamer 960×720）（钉在块上时 `x`/`y` 是块失效时的后备位置）。按 `text` 的要求、结合它所在的位置（钉在哪个块的哪个部位，或画布上哪个区域）实现内容，完成后删掉这条 todo；最后一条删掉时把 `todos` 字段一并删除。封面页和章节页也可以有 TODO。TODO 可以带图片附件 `files: ["todo/T-XXX-….png"]`，路径相对于幻灯片文件夹，图片存在 `slide/todo/`，处理前用 Read 工具看图。附件不会被导出：如果图片本身要放进幻灯片，先复制到 `assets/` 再引用。TODO 处理完后，连同它的附件文件一起删除（`npm run check` 会列出没有被引用的附件）。导出时所有 todos 会从数据里去掉。旧版的 `type: "todo"` 块会被 `QS.migrate` 自动转换。
5. 只用这份幻灯片的主题支持的页面类型、内容块和字号（见下文和 `themes/<id>/theme.js` 的 `slideTypes` / `blocks` / `textSizes`）。
6. 写完后运行 `npm run check`（会检查主题是否匹配、JSON 合法性、编号、KaTeX 能否解析、组件和图片是否存在）。

## 内容块字段

通用字段：`id`, `type`, `step`（出现步骤，0 表示翻到本页即显示）, `until`（可选，大于 `step`：到这一步淡出并收起占的高度，下面的块随之平滑上移）, `reserve`（可选，`false` 时出现之前不占位置，出现时才把高度撑开）, `anim`（`fade` | `rise` | `none`）, `delay`（可选，毫秒：翻到这一步后晚一点再出现，例如等同一步的动画画完）, `col`（`left` | `right` | `full`，仅在幻灯片 `layout: "split"` 时生效；有 `full` 块时变成混排：连续的左 / 右栏块组成一个两栏区，`full` 块单独占满一行，按块的顺序从上往下排——相当于 Beamer 的 columns 环境后面接通栏内容）。编辑器按预览的步骤同样收起；要编辑已消失的块，在步骤预览里切到它还在的那一步。

| type | 字段 |
|---|---|
| text | `text`, `size`（由主题决定：ibm-quantum 为 normal / large / small；sysu-beamer 为 normal / small / source（\smallsource 灰色出处小字）/ takeaway（\takeaway 蓝色粗体结论句））, `align` |
| list | `items`（每行一条）, `ordered`, `stepwise`（逐条出现，每条占一步）, `size`（%） |
| formula | `latex`（多个公式用单独一行 `>>>` 分隔，依次在原位变换，每个占一步）, `morph`（可选：放映时向前一步，两个公式里相同的字形按顺序匹配，从旧位置滑到新位置，其余的淡出 / 淡入（`core.js` 的 `morphFormula`）；不设时按原来的方式切换；`\mv{…}` 包住的一段如果在下一个公式里也用 `\mv{…}` 原样出现，就整段沿弧线挪过去）,（`latex` 里的 `\chg{…}` 标出变了的部分：它所在的公式出现的那一步弹一下并变成主题色，下一步渐变回黑色；对任何带 step 的内容里的公式都有效）, `boxed`, `size`（%）, `caption` |
| box | `label`, `body`（可用单独一行 `>>>` 隔开多段：在同一个框里依次替换，每段占一步，旧的立即让位、新的淡入）, `variant`（example / note） |
| image | `src`（`assets/…`）, `width`（%）, `caption` |
| table | `rows`（每行一行，单元格用 `|` 分隔；`$…$` 里的 `|` 不算，`\|` 是字面的 `|`；单元格支持行内标记）, `header`（第一行是表头，默认 true）, `headerCol`（第一列是行标题）, `full`（占满整行宽度）, `widths`（可选，逗号分隔的列宽百分比，如 `"13, 48.5, 38.5"`，对应 LaTeX 的 `p{…}` 列）, `align`（center / left；sysu-beamer 下 left 的表格靠左放）, `stepwise`（逐行出现）, `stageSteps`（可选，逐行出现时第 2 行起各行出现的步骤，规则同 anim 的 stageSteps；第 1 行随块出现）, `size`（%）, `caption` |
| circuit | `spec`（语法见 `engine/circuit.js` 文件头）, `stepwise`（none / gate / column）, `scale` |
| anim | `component`, `params`, `height`（px）, `stageSteps`（可选：组件第 1、2…个内部阶段分别在第几步播放，严格递增，可以留出间隔给文字；不写则紧跟 `step` 连续播放） |
| spacer | `height`, `fill`（可选：撑满本栏剩下的高度，同 LaTeX 的 `\vfill`，`height` 为最小值） |

行内标记：`[[高亮]]`、`{{蓝字}}`（sysu-beamer 下是 `\alert`）、`**加粗**`、`*斜体*`、`$行内$`、`$$行间$$`、空行分段。

### ibm-quantum 主题

章节页样式由全局 `meta.sectionStyle` 决定（`panel` 色块分栏 + 路线图，默认；`roadmap` 仅路线图），路线图自动列出所有 section 页；编号用 Futura：Mac 用系统 Futura，其他电脑用本机私有的 `vendor/fonts/private/FuturaND-Medium.ttf`（Neufville Digital 商业字体，许可证禁止再分发——应用户要求作为自用备份提交在私有远端仓库里，所以这个仓库**必须保持私有**：公开之前先把它从历史里彻底清掉；导出文件会内嵌其 ASCII 子集，导出文件也只能自用，不能分享）。
幻灯片类型：`cover`（title / titleAlt（主标题下方的灰色第二标题）/ author / subtitle（与 author 组成下部一组）/ footer / coverLayout（可选的布局参数，只存改动过的项，键与默认值见 `themes/ibm-quantum/theme.js` 的 `COVER_LAYOUT`：left、titleTop、titleSize、altSize、textWidth、metaBottom、metaGap、showArt、artSize、artTop、artRight、footerBottom，单位 px））、`section`（number（如 Part 2，数字成为大号编号；留空自动编号）/ title / subtitle）、`content`（title / layout / split / blocks）。`meta.pageNumbers` 控制内容页页码。
画布逻辑尺寸 1280×720。正文区从 top 150 到 bottom 48，左右各留 96px，可用高度约 520px。

### sysu-beamer 主题

幻灯片类型：`cover`（即 `\titlepage`：title（换行用回车）/ subtitle / author（每行一项）/ institute / date）、`content`（title / layout / split / blocks / `section` / `appendix`）。`section` 相当于 `\section`：本页和之后的页都属于这一节，直到下一个写了 `section` 的页，顶部导航条列出本部分的各节、每页一个小圆点；`appendix: true` 相当于 `\appendix`，从这一页起是备用页，导航条只列备用部分的节，页码显示为"备用 N"（前缀是 `meta.backupLabel`）。页脚：`meta.footAuthor` / `meta.footRight`（上排左右）、`meta.shortTitle`（下排左，缺省用 `meta.title`）、页码"n / 正文页数"。
画布逻辑尺寸 960×720。正文区 top 161 到 bottom 86（约 473px 高），左右各留 52.5px；正文 28.9px（11pt），\small 26.4px。图片优先用 SVG（LaTeX 的 TikZ 图用 `xelatex -no-pdf` + `dvisvgm --no-fonts`，PDF 图用 Inkscape 转）。

### 两个主题共同

每页都有 `notes` 字段，存讲稿备注；可选 `hidden: true` 表示放映时隐藏（编辑器照常显示，放映、打印、导出时整页去掉，章节路线图、导航条和页码也不计入；不隐藏时删掉该字段）。加内容前先估算高度，不要溢出。

## 动画组件约定

`QS.registerAnimation({ id, name, description, params, steps, mount(el, params, api) })`
- `params`：`[{ key, label, type: number|select|bool|text|color, min, max, step, default, options, hint }]`，编辑器会自动为它们生成控件。
- `steps`：组件内部的阶段数（数字，或 `params => 数字`）。默认块占用步骤 `step … step+steps`；块上设置 `stageSteps` 时，各阶段改在指定的步骤播放（`QS.stageSteps(b)` 给出规整后的结果），中间的步骤 `update` 仍收到前一个阶段。
- `mount` 返回 `{ update(stage, animate, visible), setState(state), destroy() }`；`api` 包含 `mode`（edit / present / thumb）、`accent`、`theme`（`{ id, width, height }`）、`cssVar(name)`（取主题的颜色等 CSS 变量，例如 `cssVar('--ink')`）、`emit(state)`（交互状态会同步到演讲者/观众另一窗口）。
- 组件的文字从幻灯片继承字体，不要另设 font-family；布局按容器的实际宽度（`el.clientWidth`）算，不要假设画布是 1280 宽（Beamer 主题两栏里一栏只有约 410px）。
- `animate=false` 时必须直接跳到该阶段的最终状态（编辑器预览、往回翻页时用到）。
- 样式写在组件文件内自带的 `<style>` 里，类名加组件前缀。中文文字会被自动纳入导出字体子集。

## 验证

`.claude/launch.json` 里的 `slides-editor`（即 `npm run serve`）会启动服务器。浏览器检查 `present.html`（视口按主题的画布尺寸）。改了引擎或 `ibm-quantum` 主题时，用 `--slide` 指向一份 IBM 主题幻灯片的副本，对比改动前后 `present.html#print&each` 的截图，确认外观没变。导出可以在编辑器里点"导出演示文件"，也可以运行 `npm run export`，都生成到 `slide/export/`。测试 Git 面板时，把幻灯片复制到 scratchpad，在副本里建仓库，再用 `--slide` 指向它，不要在用户的 `slide/` 里执行 `git init`。

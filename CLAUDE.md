# 幻灯片编辑系统

IBM Quantum Learning 讲义风格的离线幻灯片编辑器、放映器和导出器。用户在 GUI 里编辑内容；Claude 负责按用户指定的位置加内容、写动画组件。
当前正在编辑的幻灯片的主题和背景见 `slide/CLAUDE.md`。

## 两个仓库，严格分离

- **编辑系统**：本目录，是一个 git 仓库，`.gitignore` 里忽略了 `/slide/`。
- **幻灯片**：`slide/` 是完全独立的内容文件夹，包含 `deck.json`、`assets/`、`animations/`、`export/`。它是否用 git 管理由用户决定：编辑器和 Claude 都**不得**替它 init、commit 或做任何修改仓库的操作，除非用户明确要求。
- 编辑器没有自带的版本管理（快照、历史都已删除）。顶栏的 Git 按钮只读显示 `slide/` 自己仓库的提交图（`engine/gitpanel.js` + `/api/git`）。服务器会确认 `slide/` 本身就是仓库根目录，否则视为"没有仓库"，避免误显示外层编辑器仓库。
- 换一份幻灯片：用户把 `slide/` 拷走，再运行 `npm run dev`，会自动生成一份空白的 `slide/`。也可以用 `npm run dev -- --slide <路径>` 或环境变量 `SLIDE_DIR` 编辑其他位置的幻灯片（`check` / `export` 同理）。
- 服务器的路径规则（`tools/slide.js`、`tools/engine.js` 的 `resolve`）：`deck.json`、`assets/*`、`animations/*`、`export/*` 映射到幻灯片文件夹，其余映射到编辑器目录。

## 结构

- `slide/deck.json`：全部幻灯片内容，唯一数据源。编辑器每 1.5 秒检测一次文件变化，自动载入外部修改。
- `index.html` + `engine/editor.js`：编辑器。`present.html`：放映（`#presenter` 演讲者视图，`#audience` 观众窗口，`#print` 打印）。
- `engine/core.js`：内容块渲染、行内标记、步骤逻辑；`circuit.js`：线路；`coverart.js`：封面插画；`player.js`：放映与多窗口同步；`export.js` + `fontsubset.js`：导出单文件 HTML（harfbuzz wasm 子集化 IBM Plex Sans SC）。
- `server.js`：Node 标准库，零依赖（不需要 npm install），仅 127.0.0.1。
- npm 脚本：`dev`/`start`（启动并打开浏览器）、`serve`（不打开浏览器）、`export`（命令行导出到 `slide/export/`）、`check`（校验 deck.json：编号、KaTeX、组件、图片）。`tools/engine.js` 在 Node 里用 vm 载入浏览器端引擎代码，导出逻辑与编辑器共用 `engine/export.js`。
- `slide/animations/*.js`：这份幻灯片的动画组件，服务器会自动列出（`_` 开头的文件除外）。新组件从 `templates/animation.js` 复制。
- 界面文字全部在 `engine/i18n.js`（en 为默认和回退，zh 可选；语言存在浏览器 localStorage `qs-lang`，导出文件沿用导出时的语言）。新增 UI 文字必须两种语言都加词条，不要在代码里写死。组件的 name / description / 参数 label 可写成 `{ en, zh }`。
- 引擎是 classic script（不能用 ES module），因为导出文件要能在 `file://` 下直接运行。不允许引入 CDN 或需要 npm 构建的东西。

## 修改 deck.json 的规则

1. 不再做快照。如果 `slide/` 是 git 仓库，用户自己管理提交，Claude 不要替他提交。改动后告诉用户改了哪些块（ID），方便他用 ⌘Z 撤销或在 git 里查看。
2. 用户引用的格式是 `[Slide 5 S-K3P | B-9XF Formula] "…"`（英文界面）或 `【第5页 S-K3P｜B-9XF 公式框】"…"`（中文界面）。按 ID 定位，不要按页码定位（页码会变，ID 不会）。
3. 新建 ID：幻灯片 `S-XXX`，内容块 `B-XXX`。XXX 是 3 个字符，取自 `23456789ABCDEFGHJKLMNPQRSTUVWXYZ`，全文唯一。不要修改已有 ID。
4. "处理 TODO"：找出 `type: "todo"` 的块，按 `text` 的要求实现，再把 TODO 块替换成实际内容（替换时沿用它的位置、`step` 和 `col`）。
5. 写完后运行 `npm run check`（会检查 JSON 合法性、编号、KaTeX 能否解析、组件和图片是否存在）。

## 内容块字段

通用字段：`id`, `type`, `step`（出现步骤，0 表示翻到本页即显示）, `anim`（`fade` | `rise` | `none`）, `col`（`left` | `right`，仅在幻灯片 `layout: "split"` 时生效）。

| type | 字段 |
|---|---|
| text | `text`, `size`（normal / large / small）, `align` |
| list | `items`（每行一条）, `ordered`, `stepwise`（逐条出现，每条占一步） |
| formula | `latex`（多个公式用单独一行 `>>>` 分隔，依次在原位变换，每个占一步）, `boxed`, `size`（%）, `caption` |
| box | `label`, `body`, `variant`（example / note） |
| image | `src`（`assets/…`）, `width`（%）, `caption` |
| circuit | `spec`（语法见 `engine/circuit.js` 文件头）, `stepwise`（none / gate / column）, `scale` |
| anim | `component`, `params`, `height`（px） |
| todo | `text`（只在编辑器显示） |
| spacer | `height` |

行内标记：`[[高亮]]`、`{{蓝字}}`、`**加粗**`、`$行内$`、`$$行间$$`、空行分段。
幻灯片类型：`cover`（title / author / subtitle / footer）、`section`（number / title / subtitle）、`content`（title / layout / split / blocks）。每页都有 `notes` 字段，存讲稿备注。
画布逻辑尺寸 1280×720。正文区从 top 150 到 bottom 48，左右各留 96px，可用高度约 520px。加内容前先估算高度，不要溢出。

## 动画组件约定

`QS.registerAnimation({ id, name, description, params, steps, mount(el, params, api) })`
- `params`：`[{ key, label, type: number|select|bool|text|color, min, max, step, default, options, hint }]`，编辑器会自动为它们生成控件。
- `steps`：组件内部的阶段数（数字，或 `params => 数字`）。块占用步骤 `step … step+steps`。
- `mount` 返回 `{ update(stage, animate, visible), setState(state), destroy() }`；`api` 包含 `mode`（edit / present / thumb）、`accent`、`emit(state)`（交互状态会同步到演讲者/观众另一窗口）。
- `animate=false` 时必须直接跳到该阶段的最终状态（编辑器预览、往回翻页时用到）。
- 样式写在组件文件内自带的 `<style>` 里，类名加组件前缀。中文文字会被自动纳入导出字体子集。

## 验证

`.claude/launch.json` 里的 `slides-editor`（即 `npm run serve`）会启动服务器。浏览器检查 `present.html`（视口 1280×720）。导出可以在编辑器里点"导出演示文件"，也可以运行 `npm run export`，都生成到 `slide/export/`。测试 Git 面板时，把幻灯片复制到 scratchpad，在副本里建仓库，再用 `--slide` 指向它，不要在用户的 `slide/` 里执行 `git init`。

# 安装

## 1. 安装 Node.js（≥ 18）

本项目只需要 Node.js 18 或更高版本（推荐 LTS），npm 随 Node.js 一起安装。**不需要运行 `npm install`。**

先检查是否已安装、版本是否 ≥ 18：

```bash
node -v
```

没有安装或版本过低时，按系统安装：

**Windows**（PowerShell 或 cmd）：

```bash
winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements
```

装完后重新打开终端，或者在 PowerShell 里刷新 PATH：

```powershell
$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')
```

没有 winget 时，从 <https://nodejs.org> 下载 LTS 安装包（.msi）安装。

**macOS**：

```bash
brew install node
```

没有 Homebrew 时，从 <https://nodejs.org> 下载 .pkg 安装包。

**Linux（Debian / Ubuntu）**：

```bash
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash - && sudo apt-get install -y nodejs
```

## 2. 获取代码

```bash
git clone https://github.com/lukealpha/slide-editor.git
```

```bash
cd slide-editor
```

## 3. 启动并确认安装成功

```bash
npm run dev
```

终端打印 `Slide editor running at http://127.0.0.1:<端口>/` 并自动打开浏览器，即安装成功（默认端口 8765，被占用时自动换下一个）。`Ctrl+C` 停止。

不想自动打开浏览器时用：

```bash
npm run serve
```

---
layout: page
title: 安装
lang: zh-CN
permalink: /zh-CN/install/
---

## 目录

- [概览](#概览)
- [前置要求](#前置要求)
- [步骤 1：下载并运行安装脚本](#步骤-1下载并运行安装脚本)
- [步骤 2：GUI 设置向导（浏览器）](#步骤-2gui-设置向导浏览器)
- [安装后：添加技能与软件包](#安装后添加技能与软件包)
- [各平台说明](#各平台说明)
  - [Windows（WSL2）](#windowswsl2)
- [安装脚本做了什么](#安装脚本做了什么)
  - [安装脚本写入的配置文件](#安装脚本写入的配置文件)
  - [网络镜像与超时配置](#网络镜像与超时配置)
- [卸载](#卸载)

---

## 概览

AcaClaw 安装分为两步：

| 步骤 | 界面 | 内容 |
|---|---|---|
| **步骤 1** | 终端（一条命令） | 下载并安装 OpenClaw、AcaClaw 插件、Miniforge 与学术技能 |
| **步骤 2** | 浏览器（GUI 向导） | 引导选择学科、配置 AI 服务商、工作区与安全级别 |

步骤 1 需要终端，因为要安装系统级组件（Node 包、Conda 环境、CLI 工具）。**这是唯一需要终端的一步。**

步骤 2 在安装结束后自动在浏览器中打开。GUI 向导处理所有交互选择 — 无终端菜单、无需手写配置。

AcaClaw **不单独运行桌面 GUI 程序**。它在自己的网关端口提供浏览器界面（`http://localhost:2090`）。OpenClaw 自带管理后台仍在默认网关运行（`http://localhost:18789`）。两个网关、两个端口、两套前端。

安装完成后，技能、学科包、配置与备份均可通过浏览器管理。详见 [Web 界面]({{ '/zh-CN/desktop-gui/' | relative_url }})。

### 平台支持

| 平台 | 状态 | 说明 |
|---|---|---|
| **Linux**（Ubuntu、Debian、Fedora 等） | **阶段 1 — 已提供** | 通过 CLI 安装脚本完整支持 |
| **macOS**（Intel 与 Apple Silicon） | **阶段 1 — 已提供** | 通过 CLI 安装脚本完整支持 |
| **Windows（WSL2）** | **阶段 1 — 已提供** | 在 WSL2 终端中安装，浏览器窗口在 Windows 侧打开 |

---

## 前置要求

| 要求 | 版本 | 如何检查 |
|---|---|---|
| **Node.js** | 22 或更高 | `node --version` |
| **npm** | 随 Node 附带 | `npm --version` |
| **Docker**（可选） | 较新版本 | `docker --version` |

仅在使用 [最高安全模式]({{ '/zh-CN/security/' | relative_url }})（代码均在容器中运行）时需要 Docker。

若无 Node.js，请从 [nodejs.org](https://nodejs.org/) 安装。

---

## 步骤 1：下载并运行安装脚本

在终端执行：

```bash
curl -fsSL https://acaclaw.com/install.sh | bash
```

或先下载再审阅：

```bash
curl -fsSL https://acaclaw.com/install.sh -o install.sh
less install.sh
bash install.sh
```

脚本会自动安装依赖，结束时启动网关并在浏览器打开设置向导。

---

## 步骤 2：GUI 设置向导（浏览器）

安装完成后，浏览器会打开 `http://localhost:2090/` 进入 AcaClaw 设置向导。

### 为什么使用 Web 应用向导而不是原生二进制文件？

由于隔离区（Quarantine）和智能屏幕保护等机制，终端安装脚本很难在所有操作系统上安全可靠地启动原生 GUI 应用程序。

作为替代，安装程序会尝试使用你现有的 Chrome 或 Edge 浏览器，将设置向导作为一个**独立的应用窗口**（即“Dock 应用”，没有浏览器标签页或地址栏）启动。如果找不到支持的浏览器，它会优雅地回退到打开一个标准的浏览器标签页。

这提供了一种原生应用般的体验，同时完全在本地运行且受操作系统信任。

### 向导页面

**第 1 屏 — 学科**：选择主要研究领域，决定 Conda 中预装哪些科学包。

**第 2 屏 — AI 服务商**：选择 Anthropic / OpenAI / Google AI / OpenClaw Web，填写 API 密钥并测试连接，选择模型。

**第 3 屏 — 工作区位置**：默认 `~/AcaClaw/`，可更换目录并预览将创建的目录结构。

**第 4 屏 — 安全级别**：标准（推荐）或最高（需 Docker）。

**第 5 屏 — 完成**：汇总选项，点击完成；后台为所选学科创建 Conda 环境。

完成后进入 AcaClaw 控制台，安装结束。

---

## 安装后：添加技能与软件包

初始设置之后的操作均在浏览器中完成。

### 安装新技能

浏览器 **Skills** 标签 → **ClawHub** → 浏览或搜索 → **Install**。网关通过 WebSocket 调用 `skills.install` 并显示进度。

### 添加新学科

**Environment** 标签 → **Add Discipline** → 选择化学、生物等。网关调用 `acaclaw.env.install`，后台执行 `conda env create`，界面显示进度条。

### 安装单个软件包

**Environment** 标签 → **Install Package** → 输入包名，通过网关在活动环境中执行 `conda install`。

### 底层机制

浏览器不直接执行 shell。它向网关发 WebSocket 消息，由网关启动实际进程（`clawhub install`、`conda install`、`conda env create`），进度与错误通过 WebSocket 回传。

---

## 各平台说明

### Linux

```bash
curl -fsSL https://acaclaw.com/install.sh | bash
```

- 需 Node.js 22+
- 通过 `xdg-open http://localhost:2090/` 打开向导
- 无显示服务器（无头/SSH）时脚本会打印需手动访问的 URL
- **桌面集成**：安装 `.desktop` 文件，可在启动器与 Dock 中固定 AcaClaw

### macOS

```bash
curl -fsSL https://acaclaw.com/install.sh | bash
```

- 支持 Intel 与 Apple Silicon
- 需 Xcode Command Line Tools（脚本可提示安装）
- 通过 `open http://localhost:2090/` 打开向导
- **桌面集成**：`~/Applications/AcaClaw.app`、桌面别名、书签三层保障

### Windows（WSL2）

```bash
# 在 WSL2 终端中执行
curl -fsSL https://acaclaw.com/install.sh | bash
```

安装脚本自动检测 WSL2（通过 `WSL_DISTRO_NAME` 或 `/proc/version`），走标准 Linux 安装流程，并附加四项 WSL2 专属操作：

#### WSL2 与原生 Linux 的区别

| 方面 | 原生 Linux | WSL2 |
|---|---|---|
| 安装位置 | `~/.openclaw/`、`~/.acaclaw/` | 相同（位于 WSL2 文件系统内） |
| Node.js / Conda / 插件 | 安装在 Linux 中 | 相同 |
| 网关进程 | 运行在 Linux 中 | 相同 — `localhost:2090` 自动转发到 Windows |
| 应用窗口 | 通过 Linux Chrome/Edge PWA | 打开 Windows 侧浏览器（通过 `cmd.exe /c start`） |
| 设置向导 | 在 Linux 浏览器中打开 | 在 Windows 浏览器中打开（API 密钥在 Windows 侧输入） |
| 桌面快捷方式 | `.desktop` 文件 | Windows 桌面 `.lnk` 文件（通过 `wsl.exe` 启动） |
| 工作区快捷方式 | 无 | Windows 桌面快捷方式 → `~/AcaClaw/` |

#### 1. 通过 Windows 浏览器实现独立应用窗口

WSL2 没有原生显示服务器。安装脚本不尝试打开 Linux 浏览器（那需要 WSLg 或 X 服务器），而是直接启动 **Windows 侧浏览器**：

```bash
# install.sh 在 PLATFORM=wsl2 时的检测逻辑
cmd.exe /c start "" "http://localhost:2090/"
```

WSL2 自动将 `localhost` 端口转发到 Windows，因此 `http://localhost:2090/` 会在用户的默认 Windows 浏览器（通常是 Edge 或 Chrome）中打开 AcaClaw 界面。

为实现独立应用窗口体验（无地址栏、无浏览器标签页），安装脚本尝试在 Windows 侧使用 Chromium `--app` 模式：

```bash
# 优先尝试 Edge（Windows 10/11 预装）
"/mnt/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" \
  --app="http://localhost:2090/" --no-first-run --disable-fre &

# 回退：Chrome
"/mnt/c/Program Files/Google/Chrome/Application/chrome.exe" \
  --app="http://localhost:2090/" --no-first-run &

# 最终回退：普通浏览器标签页
cmd.exe /c start "" "http://localhost:2090/"
```

这为用户提供了与 macOS（WKWebView）和原生 Linux（PWA）相同的无框应用窗口体验，但使用的是 Windows Edge/Chrome。

#### 2. 设置向导在 Windows 侧打开

设置向导（API 密钥输入、学科选择、安全级别）在 **Windows 浏览器**中打开，而不在 WSL2 内部打开。原因：

- 用户从 Windows 密码管理器 / 浏览器会话中复制粘贴 API 密钥
- Windows 是主要桌面环境；WSL2 是计算后端
- 不依赖 WSLg 或 X11 转发

安装脚本检测 WSL2 后调用 `cmd.exe /c start` 而非 `xdg-open`：

```bash
case "$PLATFORM" in
  wsl2)
    # 在 Windows 浏览器中打开，而非 WSL2 Linux 浏览器
    cmd.exe /c start "" "$SETUP_URL" 2>/dev/null || true
    ;;
esac
```

#### 3. Windows 桌面上的工作区快捷方式

在 WSL2 内创建 `~/AcaClaw/` 后，安装脚本在用户的 Windows 桌面上创建一个**快捷方式**，指向 WSL2 工作区文件夹：

```
Windows 桌面/
  AcaClaw Workspace.lnk  →  \\wsl$\Ubuntu\home\user\AcaClaw\
```

用户可以从 Windows 文件资源管理器直接浏览研究文件，无需手动输入 `\\wsl$\` 路径。通过 PowerShell 创建：

```powershell
$desktop = [Environment]::GetFolderPath('Desktop')
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut("$desktop\AcaClaw Workspace.lnk")
$shortcut.TargetPath = "\\wsl$\$distro\home\$user\AcaClaw"
$shortcut.Description = "AcaClaw Research Workspace (WSL2)"
$shortcut.Save()
```

#### 4. Windows 桌面上的应用快捷方式

第二个 `.lnk` 快捷方式创建在 Windows 桌面上，用于**启动 AcaClaw**：

```
Windows 桌面/
  AcaClaw.lnk  →  wsl.exe -d Ubuntu -- bash ~/.acaclaw/start.sh
```

双击此快捷方式：
1. 在 WSL2 内启动网关（如果尚未运行）
2. 在 Windows 浏览器中以独立应用窗口打开 `http://localhost:2090/`
3. 无终端窗口保留（快捷方式以最小化方式运行）

通过 PowerShell 创建：

```powershell
$shortcut.TargetPath = "wsl.exe"
$shortcut.Arguments = "-d $distro -- bash $HOME/.acaclaw/start.sh"
$shortcut.WindowStyle = 7  # 最小化
```

#### WSL2 桌面集成汇总

安装完成后，Windows 桌面上有两个快捷方式：

| 快捷方式 | 目标 | 用途 |
|---|---|---|
| **AcaClaw** | `wsl.exe -- bash ~/.acaclaw/start.sh` | 启动应用（网关 + 浏览器窗口） |
| **AcaClaw Workspace** | `\\wsl$\Ubuntu\home\user\AcaClaw\` | 在 Windows 文件资源管理器中打开研究文件 |

#### WSL2 前置要求

| 要求 | 检查方式 | 说明 |
|---|---|---|
| 已安装 WSL2 | 在 PowerShell 中运行 `wsl --version` | Windows 10 2004+ 或 Windows 11 |
| Ubuntu（或其他发行版） | 在 PowerShell 中运行 `wsl -l -v` | 推荐 Ubuntu 22.04+ |
| `wslpath` 可用 | 在 WSL2 中运行 `which wslpath` | 所有现代 WSL2 发行版均自带 |
| Windows 侧有 Edge 或 Chrome | Windows 10/11 预装 | 用于独立应用窗口 |

Node.js、npm 和 Conda 由安装脚本在 **WSL2 内部**安装 — 无需在 Windows 侧安装 Node.js。

---

## 安装脚本做了什么

| 步骤 | 操作 | 位置 |
|---|---|---|
| 1 | 通过 npm 安装 OpenClaw（自动选择最快源，带超时） | 全局 `npm install -g openclaw` |
| 2 | 安装 Miniforge（GitHub + 清华/北外镜像） | `~/.acaclaw/miniforge3/` |
| 3 | 复制 AcaClaw 插件 | `~/.openclaw/extensions/` |
| 4 | 从 ClawHub 安装学术技能（带镜像回退） | `~/.openclaw/skills/` |
| 5 | 写入 AcaClaw 配置 | `~/.openclaw/openclaw.json`（复制已有 API 密钥） |
| 6 | 复制管理脚本（`start.sh`、`stop.sh`、`uninstall.sh`） | `~/.acaclaw/` |
| 6a | 保存已安装版本 | `~/.acaclaw/config/version.txt` |
| 6b | 创建桌面快捷方式（应用 + 工作区） | 因平台而异（见下表） |
| 7 | 注册 systemd 服务、启动网关并打开向导 | `openclaw gateway run` → `http://localhost:2090/` |

**桌面快捷方式（步骤 6b）按平台分：**

| 平台 | 应用快捷方式 | 工作区快捷方式 |
|---|---|---|
| Linux | `~/.local/share/applications/` 中的 `.desktop` 文件 | — |
| macOS | `~/Applications/AcaClaw.app` | — |
| WSL2 | Windows 桌面 `AcaClaw.lnk` → `wsl.exe -- bash start.sh` | Windows 桌面 `AcaClaw Workspace.lnk` → `\\wsl$\...\AcaClaw\` |

> 步骤 6–6b 在网关启动**之前**执行。这确保即使网关或浏览器启动失败（WSL2 上因 systemd 问题常见），管理脚本和桌面快捷方式也始终可用。

向导随后创建 Conda 环境、保存配置、创建 `~/AcaClaw/` 结构。除包下载与密钥测试外，不向互联网发送你的私密数据。

### 安装脚本写入的配置文件

安装脚本写入以下配置和设置文件。**升级**（在已有安装上重新运行安装脚本）时，除特别注明外，所有文件均会被覆盖。

#### `~/.openclaw/`（OpenClaw 配置目录）

| 文件 | 行号 | 写入方式 | 创建 / 覆盖 | 用途 |
|---|---|---|---|---|
| `openclaw.json` | 1522–1577 | Python 合并 | 合并覆盖（保留用户 API 密钥和模型选择） | 主网关 + 代理 + 模型配置 |
| `openclaw.json` | 1585–1601 | Python 写入 | 仅创建（无已有配置时） | 从模板创建全新配置 |
| `openclaw.json` | 1613–1664 | Python 读取-修改-写入（调用 3 次） | 覆盖 | 应用必需覆盖项：auth、controlUi、plugins.allow、微信频道 |
| `openclaw.json.bak` | 1518 | `cp -f` | 覆盖 | 合并前的备份 |

#### `~/.acaclaw/config/`（AcaClaw 配置目录）

| 文件 | 行号 | 写入方式 | 创建 / 覆盖 | 用途 |
|---|---|---|---|---|
| `version.txt` | 1883 | `echo >` | 覆盖 | 已安装的 AcaClaw 版本 |
| `conda-prefix.txt` | 1179 | `echo >` | 覆盖 | Miniforge 安装路径 |
| `security-mode.txt` | 1759 | 条件写入 | **升级时保留** | `default` 或 `maximum`；升级时读取已有值，全新安装时写入选择的模式 |
| `plugins.json` | 1767–1823 | 合并 / 创建 | **升级时合并** | AcaClaw 插件设置；升级时保留用户自定义并与新默认值合并 |
| `setup-pending.json` | 2009 / 2021 | `cat > <<` heredoc | 覆盖 | 向导状态；升级时 `setupComplete: true`，全新安装时 `false` |

#### `~/AcaClaw/.acaclaw/`（工作区元数据）

| 文件 | 行号 | 写入方式 | 创建 / 覆盖 | 用途 |
|---|---|---|---|---|
| `workspace.json` | 1699–1706 | `cat > <<` heredoc | **仅创建**（`~/AcaClaw/` 已存在时跳过） | 工作区名称、学科、创建时间戳、工作区 ID |

#### `~/.acaclaw/miniforge3/.condarc`（Conda 频道配置）

| 文件 | 行号 | 写入方式 | 创建 / 覆盖 | 用途 |
|---|---|---|---|---|
| `.condarc` | 1062 | `cat > <<` heredoc | 覆盖 | 镜像频道配置（镜像测试通过时） |
| `.condarc` | 1080 | `cat > <<` heredoc | 覆盖 | 官方 conda-forge 配置（无可用镜像时） |
| `.condarc` | 1137 | `cat > <<` heredoc | 覆盖 | 镜像失败后重试使用官方 conda-forge |

#### 安装脚本复制的其他文件

| 文件 | 行号 | 写入方式 | 用途 |
|---|---|---|---|
| `~/.openclaw/extensions/*`（插件） | 1214 | `cp -r` | AcaClaw 插件目录 |
| 微信补丁（`channel.ts`、`login-qr.ts`） | 1259、1261 | `cp -f` | 微信插件源码补丁 |
| UI 静态资源 | 1293 | `cp -r` | Web GUI 静态文件 |
| 代理 `IDENTITY.md` / `SOUL.md` | 1774 | `cp` | 代理身份文件同步到工作区 |
| `start.sh`、`stop.sh`、`uninstall.sh` | 2139 | `cp -f` | 管理脚本 |
| `environment-*.yml` | 2149 | `cp -f` | Conda 环境定义文件 |

> **注意：** `~/.condarc`（用户级）在安装过程中会被临时备份并移除，安装完成后通过 shell trap 恢复。不会被永久修改。

### 网络镜像与超时配置

安装脚本在主源响应过慢或不可达时，自动回退到更快的镜像。这在防火墙后或 GitHub/npm 被限速的地区尤其有用。

**各来源的回退链：**

| 来源 | 主源 | 镜像回退 |
|---|---|---|
| **nvm**（Node.js 安装器） | `github.com/nvm-sh/nvm` | `gitee.com/mirrors/nvm` |
| **Node.js 二进制文件** | `nodejs.org/dist/` | `npmmirror.com/mirrors/node/` |
| **Git clone** | `github.com` HTTPS | GitHub 代理（`ghproxy.com`）→ SSH |
| **npm 包** | `registry.npmjs.org` | `registry.npmmirror.com` |
| **Miniforge** | `github.com` releases | 清华镜像 → 北外镜像 |
| **Conda 频道** | `conda-forge`（官方） | 清华镜像 → 北外镜像 |
| **ClawHub 技能** | `clawhub.com` | `cn.clawhub-mirror.com` |

**通过环境变量覆盖：**

所有镜像地址和超时值均可配置，在运行安装脚本前设置即可：

```bash
# nvm 安装脚本镜像（墙内用户使用 gitee 镜像）
export NVM_MIRROR="https://gitee.com/mirrors/nvm/raw/master/install.sh"  # 默认值

# Node.js 二进制下载镜像（自动检测，或手动设置）
export NVM_NODEJS_ORG_MIRROR="https://npmmirror.com/mirrors/node/"  # 默认值：自动检测

# GitHub 镜像代理（github.com 克隆慢时使用）
export GITHUB_MIRROR="https://ghproxy.com"          # 默认值

# ClawHub 技能注册表镜像
export CLAWHUB_MIRROR="https://cn.clawhub-mirror.com"  # 默认值

# 单个技能安装超时（秒），超时后回退到镜像
export CLAWHUB_SKILL_TIMEOUT=15                      # 默认值

# npm 安装超时（秒），用于 openclaw 和 clawhub CLI
export NETWORK_TIMEOUT=60                            # 默认值
```

示例：使用自定义 GitHub 镜像和更长的超时时间：

```bash
GITHUB_MIRROR="https://mirror.ghproxy.com" NETWORK_TIMEOUT=120 bash install.sh
```

**若已安装 OpenClaw**：AcaClaw **不会修改** `~/.openclaw/`。卸载 AcaClaw 后，你的 OpenClaw 配置保持不变。

---

## 卸载

AcaClaw 支持两种卸载方式：通过浏览器 GUI 或终端。

### 方式 1：浏览器 GUI（设置页面）

打开 AcaClaw → 导航至 **Settings** → 点击 **Uninstall** 标签。

卸载标签显示：

- 将被删除的内容与保留的内容
- **Remove AcaClaw only** — 仅移除 AcaClaw，保留 OpenClaw
- **Remove everything** — 同时移除 AcaClaw 和 OpenClaw

点击按钮、确认后卸载开始执行，实时显示进度日志。无需终端。

### 方式 2：终端

移除 AcaClaw 和 OpenClaw：

```bash
bash ~/.acaclaw/uninstall.sh
```

#### 脚本选项

| 参数 | 说明 |
|---|---|
| `--yes` / `-y` | 跳过确认提示 |
| `--keep-backups` | 保留 `~/.acaclaw/backups/` 中的备份文件 |

### 删除内容

| 项目 | 路径 |
|---|---|
| AcaClaw 数据（插件、技能、配置、会话） | `~/.openclaw/` |
| AcaClaw conda 环境 | conda env list |
| AcaClaw 配置与审计数据 | `~/.acaclaw/` |
| AcaClaw 安装的 Miniforge | `~/.acaclaw/miniforge3/` |
| AcaClaw 桌面快捷方式 | 应用启动器 / 桌面 |
| AcaClaw 网关服务 | `acaclaw-gateway.service` |
| OpenClaw | `~/.openclaw/` |
| OpenClaw CLI | npm 全局包 |

### 保留内容

| 项目 | 路径 |
|---|---|
| 研究数据 | `~/AcaClaw/` |
| 系统 conda 安装 | `~/miniconda3/`、`~/miniforge3/` 等 |

卸载脚本**不会**自动删除 `~/AcaClaw/` — 研究文件归你所有。

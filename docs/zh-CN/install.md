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
- [安装脚本做了什么](#安装脚本做了什么)
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

AcaClaw **不单独运行桌面 GUI 程序**。它在网关同一端口提供浏览器界面（`http://localhost:2090`）。OpenClaw 自带管理后台仍在 `http://localhost:2090/admin`。一个网关、一个端口、两套前端。

安装完成后，技能、学科包、配置与备份均可通过浏览器管理。详见 [Web 界面]({{ '/zh-CN/desktop-gui/' | relative_url }})。

### 平台支持

| 平台 | 状态 | 说明 |
|---|---|---|
| **Linux**（Ubuntu、Debian、Fedora 等） | **阶段 1 — 已提供** | 通过 CLI 安装脚本完整支持 |
| **macOS**（Intel 与 Apple Silicon） | **阶段 1 — 已提供** | 通过 CLI 安装脚本完整支持 |
| **Windows（WSL2）** | **阶段 2 — 规划中** | 将在后续版本提供 |

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

### 为何用浏览器而非原生窗口？

终端安装脚本难以可靠启动原生 GUI：

- **macOS**：Gatekeeper 会隔离未签名下载应用
- **Windows**：SmartScreen 可能拦截未签名可执行文件
- **Linux**：显示服务器环境各异

浏览器已安装且被系统信任，无上述问题。向导在本地通过 OpenClaw 内置 Web UI 运行（除包下载与 API 密钥测试外，配置不离开本机）。

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

### Windows（WSL2）— 阶段 2

> WSL2 支持计划在阶段 2 提供，当前版本尚未适配。

---

## 安装脚本做了什么

| 步骤 | 操作 | 位置 |
|---|---|---|
| 1 | 通过 npm 安装 OpenClaw | 全局 `npm install -g openclaw` |
| 2 | 安装 Miniforge | `~/.acaclaw/miniforge3/` |
| 3 | 复制 AcaClaw 插件 | `~/.openclaw-acaclaw/plugins/`（独立 profile） |
| 4 | 从 ClawHub 安装学术技能 | `~/.openclaw-acaclaw/skills/` |
| 5 | 写入 AcaClaw 配置 | `~/.openclaw-acaclaw/openclaw.json`（可通过 `$include` 继承已有 API 密钥） |
| 6 | 启动网关并打开向导 | `openclaw --profile acaclaw gateway run` → `http://localhost:2090/` |

向导随后创建 Conda 环境、保存配置、创建 `~/AcaClaw/` 结构。除包下载与密钥测试外，不向互联网发送你的私密数据。

**若已安装 OpenClaw**：AcaClaw **不会修改** `~/.openclaw/`。卸载 AcaClaw 后，你的 OpenClaw 配置保持不变。

---

## 卸载

```bash
curl -fsSL https://acaclaw.com/uninstall.sh | bash
```

或手动删除 profile、数据目录等（详见英文 install 文档）。卸载脚本**不会**自动删除 `~/AcaClaw/` — 研究文件归你所有。

**OpenClaw 不受影响**：`~/.openclaw/` 保持原状。

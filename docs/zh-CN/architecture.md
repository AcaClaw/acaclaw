---
layout: page
title: 架构设计
lang: zh-CN
permalink: /zh-CN/architecture/
---

> **设计原则**：AcaClaw 是发行版而非 fork。所有定制位于 OpenClaw 的扩展点 — 技能、插件、配置与环境。**零上游源码修改。**

---

## 设计理念

### 目标用户

面向**不是软件工程师的科学家**：化学、物理、生物、医学研究者与学生。每项设计都需通过：**「从未打开过终端的生物学研究生能否使用？」**

### Ubuntu 类比

| Linux 生态 | AcaClaw 生态 |
|------------|--------------|
| Linux 内核 | OpenClaw（网关、智能体、CLI、插件 SDK） |
| Ubuntu 桌面 | AcaClaw（策展发行版 + GUI） |
| apt 包 | ClawHub 技能 + AcaClaw 技能 |
| 依赖解析 | AcaClaw 环境兼容性测试 |
| Ubuntu 安全 | AcaClaw 安全插件 + 默认沙箱倾向 |
| Ubuntu LTS | 与 OpenClaw 版本兼容性测试 |

### 核心原则

1. **非侵入** — 不修改 OpenClaw 源码，通过技能、插件、配置与环境扩展
2. **一事一最佳** — 每项能力只提供一种默认最佳方案，预配置可用
3. **数据神圣** — 每次文件修改前自动备份
4. **零认知负担** — 用户不应看到「请安装某依赖」类提示
5. **分层独立** — AcaClaw 叠在 OpenClaw 之上，OpenClaw 可独立升级
6. **安全优先** — 默认比上游更严格，工作区受限
7. **贡献不分叉** — 技能发布到 ClawHub，不维护平行生态
8. **环境兼容** — 预装技能在同一策展环境中联调通过

---

## 分层模型

自下而上：**操作系统 / 容器** → **OpenClaw（未修改）** → **AcaClaw 环境（Miniforge 等）** → **AcaClaw 插件** → **策展学术技能** → **用户工作区与用户技能** → **AcaClaw Web GUI**。

### 层间规则

| 规则 | 说明 |
|------|------|
| 仅向上依赖 | 每层只依赖下层 |
| 无向下耦合 | OpenClaw 不知晓 AcaClaw |
| 技能优先级 | 用户技能 > 策展技能 > OpenClaw 内置 |
| 插件注册 | 通过标准 `OpenClawPluginApi` |
| 配置叠加 | 通过 `openclaw config set` 等写入 `openclaw.json` |
| GUI 包裹 CLI | 界面层调用底层命令 |

---

## 「一事一最佳」原则

### 选型维度

重视**正确性/质量**、**对 AI 易用**、**许可证**、**维护活跃度**；体积为次要考量。

### 刻意不包含

多绘图库重复预装、基础安装中的大型深度学习框架、完整 TeX Live、IDE 等 — 可按需通过 ClawHub 或可选配置添加。

---

## 组件架构（仓库布局）

```
acaclaw/
├── plugins/          # OpenClaw 插件
├── skills.json       # 策展技能清单
├── env/conda/        # Conda 环境定义
├── config/           # 配置叠加
├── scripts/          # install.sh / uninstall.sh 等
└── docs/             # 本站文档
```

---

## 技能架构

AcaClaw **策展、创作、测试并发布**高质量学术技能至 ClawHub，使整个 OpenClaw 社区受益。

### 贡献不分叉

发布到 ClawHub、署名贡献者、使用官方 `clawhub` 客户端，不在自有服务器镜像技能。

### 质量门禁

代码审阅、集成测试、环境兼容性、安全审阅、标准/最高模式兼容、贡献者章节完整等。

### 发布工作流

贡献者在 acaclaw-skills 提 PR → 团队审阅 → 合并后 CI 发布到 ClawHub → 更新 `skills.json` 与 Hub 页面。

---

## 环境架构

详见 [计算环境]({{ '/zh-CN/computing-environment/' | relative_url }})。

Miniforge（conda-forge）管理 Python/R 与独立 Conda 环境：**基础安装** → **学科选择合并包** → **按需安装**（冲突时再建辅助环境）。

---

## 数据安全架构

详见 [数据安全]({{ '/zh-CN/data-safety/' | relative_url }})。

在 OpenClaw 基础设施之上叠加：**逐文件版本化 + 回收站 + 同步**（默认开启）与可选**工作区快照**。

---

## 与 OpenClaw 的集成点

AcaClaw **仅**使用官方 API：`OpenClawPluginApi`、`openclaw.json`、SKILL.md、`clawhub`、`openclaw config set`、`openclaw gateway run`、Docker 沙箱配置等。若无官方 API，AcaClaw **不做**。

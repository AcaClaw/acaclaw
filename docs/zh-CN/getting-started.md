---
layout: page
title: 快速开始
lang: zh-CN
permalink: /zh-CN/getting-started/
---

## 首次启动

完成 [安装 AcaClaw]({{ '/zh-CN/install/' | relative_url }}) 后，首次启动：

1. 打开 AcaClaw
2. 选择你的领域（化学、物理、生物、医学、工程、数学等）
3. 连接 AI 服务商（OpenAI、Google、Anthropic — 向导会引导你）
4. 开始提问

就这些。无需终端、无需手写配置文件、无需包管理器。

---

## 你的工作区

工作区位于 `~/AcaClaw/`，你的文件、数据与结果都在这里。

```
~/AcaClaw/
├── data/
│   ├── raw/           ← 原始数据（AI 不会修改）
│   └── processed/     ← 分析输出、计算结果
├── documents/
│   ├── drafts/        ← 稿件与报告草稿
│   └── final/         ← 定稿、可投稿版本
├── figures/           ← 生成的图表与可视化
├── references/        ← 论文（PDF）、参考文献（.bib、.ris）
├── notes/             ← 研究笔记、会议纪要
├── output/            ← AI 生成的输出（摘要、引用等）
└── README.md          ← 自动生成的空间说明
```

### 核心规则

- **边界**：AcaClaw 不能在此目录之外读、写或删除文件
- **原始数据保护**：`data/raw/` 中的文件不会被修改 — 结果写入 `data/processed/`
- **自动备份**：每次修改前都会备份

---

## 你可以问什么

下面是可以立刻尝试的示例：

**文献检索：**
> 「找几篇近期关于 CRISPR-Cas9 在心肌组织中递送机制的论文」

**数据分析：**
> 「这是我的患者结局 CSV，比较各治疗组，并画一张适合论文的图」

**写作：**
> 「帮我写蛋白质晶体学论文的方法部分」

**参考文献：**
> 「把这些参考文献格式化为 APA」

**数学：**
> 「逐步解这个微分方程」

---

## 安全级别

AcaClaw 提供两种安全级别，按需选择：

| 级别 | 作用 | 需要 Docker？ |
|---|---|---|
| **标准（默认）** | 操作限制在工作区内；命令黑名单、审计、自动备份 | 否 |
| **最高** | 上述全部 + 所有代码在 Docker 容器中运行，完全隔离 | 是 |

两种级别均包含：
- 每次修改前自动备份文件
- 每次操作的完整审计日志
- 隐私优先 — 数据留在本机

---

## 多个工作区

可将 AcaClaw 指向任意目录：

```bash
openclaw config set agents.defaults.workspace ~/my-research
```

每个工作区独立，拥有各自的备份与元数据。

---

## 接下来

- [架构设计]({{ '/zh-CN/architecture/' | relative_url }}) — AcaClaw 如何构建
- [安全架构]({{ '/zh-CN/security/' | relative_url }}) — 安全设计详解
- [工作空间]({{ '/zh-CN/workspace/' | relative_url }}) — 工作区设计深入
- [参与贡献]({{ '/zh-CN/contributing/' | relative_url }}) — 如何贡献技能与代码

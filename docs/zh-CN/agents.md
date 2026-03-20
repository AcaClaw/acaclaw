---
layout: page
title: 数字科研助手
lang: zh-CN
permalink: /zh-CN/agents/
---

> **多智能体架构**：跨学科并行工作的学术「数字生命」助手。

AcaClaw 预置五名学术智能体 — 每人格、学科专长、Conda 环境与技能集各不相同。它们在同一个 OpenClaw 网关上并行运行，各自拥有隔离的工作区与会话。

---

## 目录

- [概览](#概览)
- [智能体列表](#智能体列表)
- [架构](#架构)
- [并行如何工作](#并行如何工作)
- [智能体工作区结构](#智能体工作区结构)
- [身份与人设](#身份与人设)
- [各智能体技能](#各智能体技能)
- [从界面启动](#从界面启动)
- [命令行用法](#命令行用法)

---

## 概览

每名 AcaClaw 智能体是一个完全隔离的「数字生命」，具备：

| 属性 | 说明 |
|------|------|
| **身份** | 唯一名称、表情、人设与行为准则 |
| **工作区** | 独立目录，自有文件与记忆 |
| **环境** | 学科专用 Conda 环境（bio、med、chem、phys 或 general） |
| **技能** | 与专长匹配的策展技能集 |
| **会话** | 独立的聊天历史与会话状态 |

智能体共享同一 OpenClaw 网关但彼此独立 — 可通过每名智能体各自的聊天标签页同时对话。

---

## 智能体列表

| 智能体 ID | 表情 | 名称 | 学科 | Conda 环境 | 专长 |
|-----------|------|------|------|------------|------|
| `biologist` | 🧬 | Dr. Gene | 生物学 | `acaclaw-bio` | 基因组学、序列分析、系统发育、Biopython |
| `medscientist` | 🏥 | Dr. Curie | 医学 | `acaclaw-med` | 临床数据、生存分析、流行病学、DICOM |
| `ai-researcher` | 🤖 | Dr. Turing | AI/ML | `acaclaw` | ML/DL 框架、训练、基准、arXiv |
| `data-analyst` | 📊 | Dr. Bayes | 统计 | `acaclaw` | Pandas、R/tidyverse、可视化、统计检验 |
| `cs-scientist` | 💻 | Dr. Knuth | 计算机科学 | `acaclaw` | 算法设计、系统编程、代码审阅 |

---

## 架构

```
OpenClaw 网关（端口 2090）
├── 智能体：biologist    → 工作区：~/AcaClaw/agents/biologist/
│   ├── IDENTITY.md     (Dr. Gene 🧬)
│   ├── SOUL.md         （行为人设）
│   ├── Conda：acaclaw-bio
│   └── 会话：web:main@biologist
├── 智能体：medscientist → 工作区：~/AcaClaw/agents/medscientist/
│   ├── IDENTITY.md     (Dr. Curie 🏥)
│   ├── SOUL.md
│   ├── Conda：acaclaw-med
│   └── 会话：web:main@medscientist
├── 智能体：ai-researcher → 工作区：~/AcaClaw/agents/ai-researcher/
├── 智能体：data-analyst  → 工作区：~/AcaClaw/agents/data-analyst/
└── 智能体：cs-scientist  → 工作区：~/AcaClaw/agents/cs-scientist/
```

每名智能体在独立会话上下文中运行：

- **会话键格式**：`web:main@<agentId>` — 按智能体区分
- **互不串话**：智能体不能读取彼此会话
- **共享数据**：`~/AcaClaw/data/` 对所有智能体可读，便于协作

---

## 并行如何工作

1. Web 界面中**每名智能体一个聊天标签**，可同时向不同智能体发消息
2. 每条消息经会话键路由：`web:main@biologist`、`web:main@ai-researcher` 等
3. 网关独立处理请求 — 一名智能体「思考」不阻塞另一名
4. 智能体通过 WebSocket 按 `runId` 并行流式返回

### 并行工作流示例

```
你 → [Dr. Gene 标签]      「分析 data/raw/rnaseq.csv 中的 RNA-seq 数据」
你 → [Dr. Bayes 标签]     「对 data/processed/features.csv 做 PCA」
你 → [Dr. Turing 标签]    「在 arxiv 上搜 2025–2026 年 transformer 蛋白质模型」

三名智能体同时工作，结果在各自标签页中显示。
```

---

## 智能体工作区结构

每名智能体在 `~/AcaClaw/agents/<id>/` 下有独立工作区：

```
~/AcaClaw/agents/biologist/
├── IDENTITY.md          # 名称、表情、生物类型、气质、主题
├── SOUL.md              # 系统人设与行为规则
├── AGENTS.md            # 工作区专用说明
├── memory/              # 按日记忆日志
└── workspace/           # 工作目录
    ├── data/
    ├── output/
    └── notes/
```

---

## 身份与人设

每名智能体由两个关键文件定义角色：

### IDENTITY.md

可见身份 — 名称、表情与视觉主题：

```markdown
- Name: Dr. Gene
- Emoji: 🧬
- Creature: computational biologist
- Vibe: methodical, curious, precise
- Theme: nature
```

### SOUL.md

行为准则 — 如何思考、回应与解决问题：

```markdown
You are a computational biologist specializing in genomics and molecular biology.
Always consider biological significance alongside statistical significance.
Prefer Biopython and scikit-bio for sequence analysis.
Use R/Bioconductor for differential expression analysis.
When presenting results, include biological context and pathway implications.
```

---

## 各智能体技能

每名智能体加载与其学科匹配的技能集，在会话启动时筛选。

| 智能体 | 主要技能 |
|--------|----------|
| Dr. Gene | nano-pdf、xurl、coding-agent、paper-search（生物学期刊） |
| Dr. Curie | nano-pdf、xurl、coding-agent、clinical-data-tools |
| Dr. Turing | nano-pdf、xurl、coding-agent、arxiv-search、model-benchmarks |
| Dr. Bayes | nano-pdf、xurl、coding-agent、data-visualization |
| Dr. Knuth | nano-pdf、xurl、coding-agent、code-review、algorithm-design |

---

## 从界面启动

1. 侧边栏进入 **Agents（智能体）**
2. 每张卡片显示状态（空闲/工作中）、人设与学科
3. 点击 **Start** 激活并打开该智能体的聊天标签
4. 聊天视图为每名活跃智能体显示标签 — 可自由切换
5. 可向不同智能体并行发送消息

---

## 命令行用法

```bash
# 列出所有智能体
openclaw agents list

# 向指定智能体发消息
openclaw message --agent biologist "Analyze the FASTA sequences in data/raw/sequences.fa"

# 查看智能体身份
openclaw agents identity get biologist

# 并行启动多名智能体（多个终端）
openclaw message --agent biologist "Run sequence alignment" &
openclaw message --agent data-analyst "Generate correlation plots" &
openclaw message --agent ai-researcher "Search for RLHF papers" &
wait
```

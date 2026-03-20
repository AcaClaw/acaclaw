---
layout: home
title: AcaClaw
lang: zh-CN
permalink: /zh-CN/
---

<div class="hero">
  <img src="{{ '/assets/logo/AcaClaw.svg' | relative_url }}" alt="AcaClaw" class="hero-logo">
  <h1>AcaClaw</h1>
  <p class="tagline">Academia Claw — 你的 AI 联合科学家，一键安装，即刻可用</p>
  <div class="hero-actions">
    <a href="{{ '/zh-CN/getting-started/' | relative_url }}" class="hero-btn primary">快速开始</a>
    <a href="https://github.com/acaclaw/acaclaw" class="hero-btn secondary" target="_blank" rel="noopener">GitHub</a>
  </div>
</div>

<p align="center">
  <img src="{{ '/poster/acaclaw-poster-zh.svg' | relative_url }}" alt="AcaClaw 特性介绍" style="max-width: 100%; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); margin: 20px 0;">
</p>

> **注意**: 中文文档正在编写中。英文文档稳定后，中文版将持续更新。你可以点击右上角的 **EN** 切换到英文版。

---

## 什么是 AcaClaw？

**AcaClaw (Academia Claw)** 是你的专属 AI 科学家（AI Co-Scientist）。无论你需要的是 AI 生物学家、AI 化学家还是数据科学家，AcaClaw 都能为你提供特定学科的数字科研伙伴。无论你是终端极客还是初次接触电脑的用户，AcaClaw 开箱即用。

**AcaClaw 相对于 OpenClaw 加强了以下特色：**

- **用户友好的 GUI**：无需终端知识。通过直观的图形界面管理一切。
- **工作区与项目系统**：文件修改与删除默认在工作区进行，防止数据丢失。
- **学术 Skills**：根据不同学科深度定制你特定学术领域的科学家 skills。
- **计算环境**：依据学科定制计算环境，统一管理 Python, R, CUDA 等科学计算环境，保证 skills 兼容。
- **数据备份**：自动备份每一个修改的文件 — 你的数据永远安全。

基于 [OpenClaw](https://github.com/openclaw/openclaw) 开源 AI 平台构建。正如 Ubuntu 之于 Linux，AcaClaw 之于 OpenClaw：一切就绪，即刻可用。

---

## 为什么选择 AcaClaw

| # | 目标 | 含义 |
|---|------|------|
| **1** | **无代码 GUI** | AcaClaw 专为用户而生，不仅是开发者。从环境设置到文件管理，一切都通过直观的图形界面完成。 |
| **2** | **工作区与项目系统** | 智能分离用户文件与底层架构。AI 自动检测活动工作区，并将文件树注入上下文，随时了解你的工作内容。 |
| **3** | **预装学术技能** | 一次安装即获论文搜索、数据分析、引用管理、图表生成 — 全部预配置好。 |
| **4** | **策展和贡献高质量技能** | 每个技能由团队（创建者、测试者、调试者、审阅者、维护者）构建，经过严格测试，发布到 [ClawHub](https://clawhub.ai)。 |
| **5** | **技能环境兼容** | 每个学科有独立 Conda 环境，所有包保证兼容。活跃环境自动检测并注入 AI 上下文。 |
| **6** | **数据安全** | 每次修改文件前自动备份。版本化快照，一键恢复。 |

---

## 适用人群

| 你是... | AcaClaw 帮你... |
|---------|------------------|
| **研究生** | 搜索论文、管理参考文献、撰写论文、分析数据 |
| **实验室研究员** | 处理实验数据、生成图表、撰写报告 |
| **教授 / PI** | 撰写基金申请、审阅论文、准备课程材料 |
| **医学研究者** | 搜索 PubMed/临床数据库、总结研究发现 |
| **本科生** | 文献综述、实验报告、作业辅导 |
| **高中生** | 研究项目、数学辅导、科学报告写作 |
| **工程师** | 数据分析、技术文档、文献调研 |

---

## 核心功能

<div class="features">
  <div class="feature-card">
    <h3>🖥️ 用户友好的 GUI</h3>
    <p>专为非程序员设计。无需在终端中进行任何配置，通过直观的图形界面即可管理一切。</p>
  </div>
  <div class="feature-card">
    <h3>📁 工作区与项目系统</h3>
    <p>智能分离可见文件与隐藏架构。AI 会自动了解你的项目结构，并严格遵守工作区边界。</p>
  </div>
  <div class="feature-card">
    <h3>🎓 基于学科的 AI 联合科学家</h3>
    <p>一键安装你的专业领域所需的一切。自动为你配置 AI 生物学家、化学家或数据科学家，并配备专业技能和计算环境。</p>
  </div>
  <div class="feature-card">
    <h3>🔍 论文搜索</h3>
    <p>同时搜索 arXiv、PubMed、Semantic Scholar、CrossRef。阅读 PDF，提取发现，生成带引用的结构化摘要。</p>
  </div>
  <div class="feature-card">
    <h3>📊 数据分析</h3>
    <p>用自然语言描述数据和问题，获得统计分析和出版级图表。原始数据永不被修改。</p>
  </div>
  <div class="feature-card">
    <h3>📝 写作工具</h3>
    <p>撰写、编辑和组织论文。在不同格式间转换。从研究笔记生成幻灯片。管理任意格式的引用。</p>
  </div>
  <div class="feature-card">
    <h3>🛡️ 数据安全</h3>
    <p>每次修改前自动备份文件。版本化快照，一键恢复。数据留在你的电脑上 — 不上传云端。</p>
  </div>
</div>

---

## 许可证

MIT 许可证 — 向所有人免费开放。详见 [LICENSE](https://github.com/acaclaw/acaclaw/blob/main/LICENSE)。

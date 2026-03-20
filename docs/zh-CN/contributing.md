---
layout: page
title: 参与贡献
lang: zh-CN
permalink: /zh-CN/contributing/
---

> **宗旨**：通过团队协作策展并贡献高质量技能。

AcaClaw 面向全球学术社区 — 尤其欢迎研究者的贡献。

---

## 如何贡献

### 创建技能

在 [acaclaw-skills](https://github.com/acaclaw/acaclaw-skills) 仓库中为你的学术领域编写技能。

1. Fork [acaclaw-skills](https://github.com/acaclaw/acaclaw-skills)
2. 按 SKILL.md 格式创建技能
3. 添加测试，验证技能在共享的 AcaClaw Conda 环境中可用
4. 提交 PR — 你将作为 **创建者（Creator）** 被署名

### 测试技能

在真实数据上运行技能，报告边界情况，编写测试用例。

- 署名为 **测试者（Tester）**

### 修复缺陷

定位并修复现有技能中的边界问题。

- 署名为 **调试者（Debugger）**

### 代码审阅

在技能发布到 ClawHub 前审阅 PR。

- 署名为 **审阅者（Reviewer）**

### 撰写文档

教程、使用指南、翻译。

- 署名为 **文档撰写者（Documenter）**

### 维护技能

保持技能与新版 OpenClaw 及环境更新兼容。

- 署名为 **维护者（Maintainer）**

---

## 认可的角色

| 角色 | 说明 |
|------|------|
| **Creator** | 设计与实现技能的原创作者 |
| **Author** | 编写技能核心功能的主要贡献者 |
| **Tester** | 在多环境中验证并编写测试 |
| **Maintainer** | 保持技能与新版 OpenClaw 兼容 |
| **Debugger** | 修复关键缺陷或边界情况 |
| **Reviewer** | 在发布前审阅代码并给出质量反馈 |
| **Documenter** | 编写使用指南、示例或翻译 |

每一次贡献都会被记录，每一位贡献者都会被署名。

---

## 质量门禁

技能发布到 ClawHub 前必须通过：

| 门禁 | 检查内容 |
|------|----------|
| **代码审阅** | 至少一名审阅者批准 |
| **集成测试** | 在固定 OpenClaw 版本上运行 |
| **环境兼容性** | 依赖在共享 Conda 环境中可解析 |
| **安全审阅** | 无数据外泄、无危险命令 |
| **兼容性测试** | 在标准与最高安全模式下均可工作 |
| **署名检查** | SKILL.md 中含完整的 `## Contributors` 小节 |

---

## 环境兼容性

所有技能共享同一 Conda 环境（`env/conda/environment-base.yml`）。添加新技能时：

1. 仅在 `skills.json` 中声明技能实际导入的包
2. 确保版本要求与现有环境兼容
3. 运行完整测试套件，确认与其他技能无冲突
4. 若存在冲突，在发布前与维护者协作解决

**引入无法解决的依赖冲突的技能将不会被发布。**

---

## 署名

- 每个技能的 SKILL.md 含 `## Contributors` 表格（在 ClawHub 上展示）
- 每位贡献者在 [acaclaw.com/hub](https://acaclaw.com/hub) 展示
- Git 历史为权威作者记录

---

## 开发环境

```bash
git clone https://github.com/acaclaw/acaclaw.git
cd acaclaw
npm install
npx vitest run
npx tsc --noEmit
```

---

## 许可证

参与贡献即表示你同意将贡献以 MIT 许可证授权。

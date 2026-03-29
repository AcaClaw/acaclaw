---
layout: page
title: 技能管理
lang: zh-CN
permalink: /zh-CN/skills/
---

> **宗旨 2：通过团队协作策展并贡献高质量技能。**

AcaClaw 提供一套经策展的学术技能 — 由团队共同筛选、测试与维护。每项技能都会发布到 [ClawHub](https://clawhub.ai)，使整个 OpenClaw 生态受益。

---

## 目录 {#table-of-contents}

- [技能分层](#skill-categories)
- [技能存放位置](#where-skills-live)
- [技能界面（UI）](#skills-ui)
- [技能如何被选中](#how-skills-are-selected)
- [扩展生态，避免分叉](#expand-the-ecosystem-dont-diverge)
- [依靠团队，而非个人英雄主义](#teamwork-not-individual-heroics)
- [管理官方技能](#managing-official-skills)
- [策展 ClawHub 技能](#curating-clawhub-skills)
- [致谢贡献者](#acknowledging-contributors)
- [贡献新技能](#contributing-new-skills)
- [同步 GitHub 与 acaclaw.com](#syncing-github-and-acaclawcom)

---

## 技能分层 {#skill-categories}

AcaClaw 将技能分为三个层级。每层用途不同。

### 基础技能（随 OpenClaw 捆绑）

这些技能随 OpenClaw 发布，是 AcaClaw 智能体的必要技能。AcaClaw 直接继承 — 无需单独安装。

| 技能 | 作用 |
|---|---|
| `nano-pdf` | 读取并提取 PDF 文本 |
| `xurl` | 获取并解析网页内容 |
| `summarize` | 摘要文档与文本 |
| `humanizer` | 将 AI 生成文本转化为自然流畅的人类语言 |
| `clawhub` | 浏览并从 ClawHub 安装技能 |

**筛选规则**：AcaClaw 从不替换或覆盖基础技能。OpenClaw 自带的，我们就使用。

### 核心学术技能（跨学科）

建议每位研究者无论学科都安装的跨学科技能。在 Staff 面板中列出，可分配给任意职员。所有技能均已在 ClawHub 上验证。

| 技能 | 类别 | 作用 |
|---|---|---|
| `literature-search` | 文献 | 检索 arXiv、PubMed、Semantic Scholar |
| `academic-deep-research` | 文献 | 跨学术数据库开展透明、严谨的研究并保留审计轨迹 |
| `literature-review` | 文献 | 结构化文献综述，含合成与研究空白分析 |
| `arxiv-cli-tools` | 文献 | 获取并检索 arXiv 论文的 CLI 工具 |
| `academic-citation-manager` | 写作 | 按 APA、Vancouver、Nature 及 9000+ 格式排版参考文献 |
| `ai-humanizer` | 写作 | 检测并弱化典型「AI 腔」写作模式 |
| `academic-writing` | 写作 | 学术论文、文献综述、方法学等方面的专家级智能体 |
| `autonomous-research` | 研究 | 面向定性或定量研究的多步自主研究 |
| `survey-designer` | 研究 | 为研究数据采集而设计并管理问卷 |
| `data-analyst` | 数据分析 | 数据可视化、报告、SQL、电子表格 |
| `mermaid` | 数据分析 | 从文本生成图表（流程图、时序图、类图等） |
| `pandoc-convert-openclaw` | 文档 | 通过 Pandoc 在 Word、PDF、LaTeX 与 Markdown 之间互相转换 |
| `agentic-coding` | 开发 | 自主编写并执行代码 |
| `docker-essentials` | 开发 | 容器管理必备的 Docker 命令 |
| `git-essentials` | 开发 | 版本控制必备的 Git 命令 |

**筛选规则**：同一用途只保留最佳工具。只有在 ClawHub 上已验证的技能才会被列入。

### 社区技能（ClawHub）

由更广泛的 OpenClaw 社区在 ClawHub 上发布的技能。用户可通过 Staff 面板或 `clawhub install <skill>` 按需安装。

AcaClaw 不捆绑社区技能，但在 [acaclaw.com/hub](https://acaclaw.com/hub) 维护推荐列表 — 参见 [策展 ClawHub 技能](#curating-clawhub-skills)。

---

## 技能存放位置 {#where-skills-live}

技能存储在 AcaClaw 网关的工作目录中。AcaClaw 使用 `~/.openclaw/` 作为主目录，因此从 ClawHub 安装的托管技能会存放到：

```
~/.openclaw/skills/<skill-name>/
```

### 存储路径

网关按以下优先级扫描目录（后者覆盖前者）：

| 优先级 | 路径 | 说明 |
|---|---|---|
| 1（最低） | 配置中的 `skills.load.extraDirs` | 额外的技能文件夹 |
| 2 | `<openclaw-package>/skills/` | 随 OpenClaw 捆绑（基础技能） |
| 3 | **`~/.openclaw/skills/`** | 托管技能 — **ClawHub 安装落在此目录** |
| 4 | `~/.agents/skills/` | 个人智能体技能 |
| 5 | `<workspace>/.agents/skills/` | 按项目的智能体技能 |
| 6（最高） | `<workspace>/skills/` | 工作区技能 |

### 对 AcaClaw 的含义

- **通过 Staff 面板或 `clawhub install` 安装的技能会存入 `~/.openclaw/skills/`**
- 基础技能（捆绑）不会写入磁盘 — 始终从 OpenClaw 包中加载
- 若仅为 AcaClaw 覆盖某项技能，请放在 `~/AcaClaw/skills/<skill>/`（工作区级覆盖）

---

## 技能界面（UI）{#skills-ui}

AcaClaw 桌面界面在两处呈现技能：**技能视图**与 **Staff 面板**。

### 技能视图（`#skills`）

| 标签页 | 内容 |
|---|---|
| **已安装** | 所有已安装技能 — 托管（ClawHub）技能排在前，捆绑技能在后，均按字母顺序排列 |
| **ClawHub** | 实时检索 [clawhub.ai](https://clawhub.ai) — 输入关键词搜索，点击「安装」即可拉取技能 |

**已安装标签页操作：**

| 操作 | 显示时机 | 作用 |
|---|---|---|
| **禁用** | 技能已安装且已启用 | 将技能标记为非活跃状态；智能体将不使用该技能 |
| **启用** | 技能已被禁用 | 重新激活该技能 |

页脚实时显示计数：`N 已安装 · N 捆绑 · N 可用`。

### Staff 面板（技能标签页）

从 Staff 视图打开：点击职员卡片 → 选择「技能」标签。

| 区域 | 内容 |
|---|---|
| **已分配技能** | 分配给该职员的每项技能以胶囊形式展示；计数实时更新 |
| **推荐** | 来自 ClawHub 的跨学科技能 — 已安装显示「+ 添加」，未安装显示「安装」 |

**「+ 添加」与「安装」的区别：**

| 按钮 | 含义 |
|---|---|
| **+ 添加** | 技能已安装到网关 — 将其分配给该职员 |
| **安装** | 技能尚未安装 — 从 ClawHub 拉取后分配给该职员 |
| **×**（胶囊上） | 从该职员的分配列表中移除此技能 |

Staff 网格中的卡片始终显示已分配技能的正确数量，面板头部显示当前已安装网关技能的数量。

---

## 技能如何被选中 {#how-skills-are-selected}

AcaClaw 收录的每项技能都必须通过相同的筛选标准：

| 标准 | 权重 | 说明 |
|---|---|---|
| **准确性 / 质量** | 关键 | 必须产出正确、可发表水准的结果 |
| **（对 AI 的）易用性** | 高 | 智能体应能通过工具调用稳定地操作 |
| **许可证** | 高 | 优先 MIT/BSD/Apache；GPL/AGPL 可走单独流程 |
| **维护状况** | 高 | 积极维护，对缺陷有响应 |
| **环境兼容性** | 关键 | 依赖须在共享 Conda 环境中干净解析 |
| **体积** | 中 | 更小的安装体积优先 |

### 我们有意排除的内容

| 排除项 | 原因 |
|---|---|
| 同一用途的多个工具 | 每类任务只保留最佳；用户可从 ClawHub 自行添加替代方案 |
| 基础环境中的深度学习框架 | 多数研究者不需要；可作为可选安装 |
| 基础环境中的 LaTeX | 约 4 GB；Pandoc 可处理转换；可作为附加组件 |
| 未测试的社区技能 | 所有收录技能必须通过质量门禁 |

### 决策流程

1. **明确需求** — 当前技能尚未覆盖的真实研究任务
2. **调研现有方案** — 查阅 ClawHub、既有工具与社区诉求
3. **选定最佳候选** — 按上述标准评估
4. **在环境中测试** — 确认依赖与其他已收录技能无冲突
5. **团队评审** — 至少一名审阅者、一名测试者，并完成安全检查
6. **发布与交付** — 先上 ClawHub，再更新 `skills.json`

---

## 扩展生态，避免分叉 {#expand-the-ecosystem-dont-diverge}

这是核心原则。AcaClaw 向 ClawHub 贡献 — 从不另建平行生态。

| 我们会做 | 我们绝不会做 |
|---|---|
| 将所有技能发布到 ClawHub | 在我们自己的服务器上托管技能 |
| 通过 `clawhub install` 安装技能 | 用自定义安装器绕过 ClawHub |
| 在 OpenClaw 上游提 issue 与 PR | Fork OpenClaw 或长期维护补丁 |
| 按姓名与角色致谢每位贡献者 | 以团队品牌发布却不署名 |
| 在同一环境中联测所有技能 | 发布依赖相互冲突的技能 |
| 在 acaclaw.com 推荐社区技能 | 未经许可把社区技能拉进我们的仓库 |

### 为何重要

- **对用户**：在 AcaClaw 与原版 OpenClaw 间切换顺畅，技能处处可用。
- **对贡献者**：你的技能触达整个 OpenClaw 用户群，而非仅 AcaClaw 用户。
- **对生态**：单一注册表、单一格式、单一社区，避免碎片化。

### 准则

> **若是技能，就上 ClawHub。若是插件，就上 npm。若是配置变更，就进 `openclaw.json`。AcaClaw 不维护本应属于上游的内容。**

---

## 依靠团队，而非个人英雄主义 {#teamwork-not-individual-heroics}

AcaClaw 的技能由团队共建，而非个人单打独斗。每项技能都有多名贡献者，分工明确。

### 为何需要团队？

| 个人模式 | 团队模式 |
|---|---|
| 一人编写、测试并维护 | 分工：创建者、测试者、审阅者、维护者 |
| 质量取决于单人精力 | 质量由团队持续保障 |
| 巴士因子 = 1 | 巴士因子 ≥ 3 |
| 创建者倦怠则技能消亡 | 创建者离开后维护者可接手 |
| 「在我机器上能跑」 | 由专职测试者在多环境中验证 |

### 团队角色

| 角色 | 职责 |
|---|---|
| **Creator（创建者）** | 设计与实现技能，撰写初始 SKILL.md |
| **Author（作者）** | 为技能贡献重要功能或扩展 |
| **Tester（测试者）** | 在多环境中验证，编写测试用例，报告边界情况 |
| **Maintainer（维护者）** | 保持技能兼容新版 OpenClaw 与环境更新 |
| **Debugger（调试者）** | 修复关键缺陷与边界问题 |
| **Reviewer（审阅者）** | 在发布前审阅代码、测试与安全 |
| **Documenter（文档撰写者）** | 编写使用指南、示例与翻译 |

### 最低团队规模

技能在发布前须至少具备：

- 1 名创建者
- 1 名审阅者（须为不同人员）
- 1 名测试者（可与审阅者为同一人）

从而确保没有任何技能未经第二双眼睛就上线。

---

## 管理官方技能 {#managing-official-skills}

AcaClaw 使用来自 ClawHub 的已验证技能。当前跨学科技能列表由主 acaclaw 仓库中的 `skills.json` 和 UI 源码中的 `AVAILABLE_SKILLS` 共同维护。

### skills.json

仓库根目录的 `skills.json` 定义了智能体必需技能（始终安装且不可移除）：

```json
{
  "agent_required": [
    { "name": "nano-pdf" },
    { "name": "xurl" },
    { "name": "summarize" },
    { "name": "humanizer" }
  ]
}
```

### 测试

所有托管技能均通过 `tests/` 目录中的测试套件验证：

| 测试文件 | 检查内容 |
|---|---|
| `tests/security.test.ts` | 安全插件、限制模式、凭据隔离 |
| `tests/backup.test.ts` | 工作区数据（含技能）的备份与恢复 |

### 维护工作流

1. **OpenClaw 发布新版本** → 运行 `pnpm test` 验证
2. **ClawHub 技能消失或更名** → 更新 `ui/src/views/staff.ts` 中的 `AVAILABLE_SKILLS` 以及 `ui/src/views/skills.ts` 中的 `CURATED_SKILLS`
3. **新增技能** → 确认其在 ClawHub 上存在后，加入 `AVAILABLE_SKILLS`，并用 Playwright 测试
4. **技能名不一致** → 同步更新 `skills.json` 中的 `agent_required` 与 `skills.ts` 中的 `AGENT_REQUIRED_SKILLS`

### 版本固定

AcaClaw 始终通过以下命令安装 ClawHub 托管技能的最新版本：

```sh
clawhub --workdir ~/.openclaw --no-input install --force <skill>
```

`install.sh` 脚本在全新安装时固定核心技能：

```sh
CORE_SKILLS=("nano-pdf" "xurl" "summarize" "humanizer")
```

---

## 策展 ClawHub 技能 {#curating-clawhub-skills}

除官方 AcaClaw 技能外，社区也会在 ClawHub 发布技能。AcaClaw 会策展其中的佼佼者。

### 策展的含义

| 我们会做 | 我们不会做 |
|---|---|
| 在 [acaclaw.com/hub](https://acaclaw.com/hub) 测试并推荐技能 | 把社区技能复制进我们的仓库 |
| 链接到原始 ClawHub 页面 | 以我们的名义重新发布 |
| 显著致谢原作者 | 将策展功劳据为己有 |
| 向上游（技能作者）报告缺陷 | 在不回馈的情况下 Fork 并私自修复 |

### 策展标准

当社区技能满足以下条件时，可获得 AcaClaw 推荐：

| 标准 | 说明 |
|---|---|
| **填补空白** | 覆盖官方技能尚未满足的用例 |
| **环境兼容** | 可与 AcaClaw 的 Conda 环境并存安装 |
| **维护活跃** | 作者响应 issue，跟进新版 OpenClaw |
| **安全** | 通过 AcaClaw 安全审阅（无外泄、无危险命令） |
| **文档完善** | 有清晰的使用说明与示例 |

### acaclaw.com 上的推荐技能

[acaclaw.com/hub](https://acaclaw.com/hub) 展示：

- **官方技能** — 由 AcaClaw 团队构建并发布到 ClawHub
- **推荐技能** — 经 AcaClaw 审核的社区技能（带「Community」徽章）
- **安装说明** — 一键安装或 `clawhub install <skill>`
- **作者与贡献者署名** — 链接到 ClawHub 个人主页

---

## 致谢贡献者 {#acknowledging-contributors}

每一次贡献都有记录。每一位贡献者都会署名。

### 署名出现位置

| 位置 | 展示内容 |
|---|---|
| **SKILL.md 中的 `## Contributors` 一节** | 姓名、角色、主页链接 — 在 ClawHub 技能页渲染 |
| **[acaclaw.com](https://acaclaw.com)** | 按技能展示贡献者，可按角色排序 |
| **GitHub acaclaw-skills 仓库** | Git 历史为权威作者记录 |
| **CHANGELOG.md** | 新版本说明中致谢新技能与修复的贡献者 |
| **AcaClaw README** | 列出头部贡献者及链接 |

### 署名格式

每项技能的 SKILL.md 或 README.md 包含：

```markdown
## Contributors

| Contributor | Role | Profile |
|---|---|---|
| @alice | Creator | [clawhub.ai/alice](https://clawhub.ai/alice) |
| @bob | Tester, Debugger | [clawhub.ai/bob](https://clawhub.ai/bob) |
| @carol | Reviewer | [clawhub.ai/carol](https://clawhub.ai/carol) |
| @dan | Maintainer | [clawhub.ai/dan](https://clawhub.ai/dan) |
| @eve | Documenter | [clawhub.ai/eve](https://clawhub.ai/eve) |
```

### 规则

- 每位贡献者均予署名 — 不设「贡献太小」门槛
- 角色可叠加 — 同一人可兼任多职
- Git 历史为最终依据 — 只要提交过代码即予署名
- 贡献者不会被除名，即使不再参与
- Creator 角色仅可由原始技能作者担任

---

## 贡献新技能 {#contributing-new-skills}

贡献新技能有两条路径：通过 GitHub（面向开发者）与通过 acaclaw.com（面向偏好网页的研究者）。

### 路径 1：GitHub（acaclaw-skills 仓库） {#path-1-github-acaclaw-skills-repo}

熟悉 Git 与代码的贡献者：

1. **查重** — 检索 [ClawHub](https://clawhub.ai) 与既有 [acaclaw-skills](https://github.com/acaclaw/acaclaw-skills) issue
2. **开 issue** — 描述技能、目标用户与预期依赖
3. **Fork 仓库** — `github.com/acaclaw/acaclaw-skills`
4. **创建技能**：
   ```
   disciplines/your-field/
   ├── SKILL.md              ← 遵循 ClawHub SKILL.md 格式
   ├── your-skill.test.ts    ← 测试
   └── README.md             ← 使用说明 + Contributors 表
   ```
5. **声明依赖** — 仅在 PR 说明与 `skills.json` 中列出技能实际 import 的包
6. **运行环境检查** — `scripts/env-check.sh` 确认无冲突
7. **开 PR** — 填写 PR 模板；你将作为 **Creator** 被署名
8. **团队评审** — 审阅、测试与安全检查须全部通过
9. **合并并发布** — CI 发布到 ClawHub；更新 `skills.json`

### 路径 2：acaclaw.com（网页提交） {#path-2-acaclawcom-web-submission}

不愿使用 Git 的研究者：

1. 访问 [acaclaw.com/submit](https://acaclaw.com/submit)
2. 填写技能提交表单：
   - **名称** — 简短、具描述性（例如 `gel-analyzer`）
   - **描述** — 技能做什么、面向谁
   - **学科** — 服务的领域
   - **SKILL.md 内容** — 粘贴或上传技能定义
   - **依赖** — 技能所需的 Python/R 等包
   - **你的信息** — 姓名、邮箱、ClawHub 主页（用于署名）
3. AcaClaw 团队成员将你的提交转为 acaclaw-skills 上的 PR
4. 你在技能的 Contributors 表中被署名为 **Creator**
5. 团队审阅、测试并发布到 ClawHub

### 如何选择路径？

| 若你…… | 使用 |
|---|---|
| 熟悉 Git 并希望完全掌控 | [GitHub](#path-1-github-acaclaw-skills-repo) |
| 偏好网页表单而非终端 | [acaclaw.com](#path-2-acaclawcom-web-submission) |
| 想修复现有技能 | [GitHub](#path-1-github-acaclaw-skills-repo)（Fork + PR） |
| 想提议技能想法但暂不实现 | 在 [acaclaw-skills](https://github.com/acaclaw/acaclaw-skills/issues) 开 issue |

### 质量门禁

任何技能在发布前必须通过全部门禁：

| 门禁 | 检查内容 |
|---|---|
| **代码审阅** | 至少一名审阅者批准 |
| **集成测试** | 在固定 OpenClaw 版本上正常运行 |
| **环境兼容性** | 依赖在共享 Conda 环境中干净解析 |
| **安全审阅** | 无数据外泄、无危险命令、无凭据泄露 |
| **兼容性测试** | 在标准与最高安全模式下均可工作 |
| **署名检查** | 存在完整的 `## Contributors` 一节 |

**任一门禁未通过则不予发布。** 贡献者会收到反馈并可持续修订。

---

## 同步 GitHub 与 acaclaw.com {#syncing-github-and-acaclawcom}

[acaclaw-skills](https://github.com/acaclaw/acaclaw-skills) GitHub 仓库是唯一可信来源。网站反映仓库内容 — 绝不会反过来。

### 同步如何运作

```
                   ┌─────────────────────────────┐
                   │   acaclaw-skills (GitHub)    │
                   │   Source of truth for all    │
                   │   skill code and metadata    │
                   └────────────┬────────────────┘
                                │
                    PR merged → CI runs
                                │
              ┌─────────────────┼─────────────────┐
              │                 │                   │
              ▼                 ▼                   ▼
     ┌────────────────┐ ┌──────────────┐  ┌────────────────┐
     │   ClawHub       │ │ acaclaw.com  │  │ acaclaw repo   │
     │   (publish)     │ │ /hub (build) │  │ skills.json    │
     │                 │ │              │  │ (pin version)  │
     └────────────────┘ └──────────────┘  └────────────────┘
```

### 流程

| 步骤 | 发生的事 | 触发方式 |
|---|---|---|
| 1 | 贡献者在 acaclaw-skills 开 PR | 手动（GitHub 或网页提交） |
| 2 | CI 运行测试（单元、集成、环境、安全） | PR 打开/更新 |
| 3 | 团队审阅并合并 | 人工审阅 |
| 4 | CI 将技能发布到 ClawHub | 合并到 main |
| 5 | CI 用新技能数据重建 [acaclaw.com/hub](https://acaclaw.com/hub) | 合并到 main |
| 6 | AcaClaw 团队在 acaclaw 仓库更新 `skills.json` 中的新版本 | acaclaw 上的手动 PR |
| 7 | 下一次 AcaClaw 发行包含新技能 | AcaClaw 发布周期 |

### 规则

- **GitHub 为权威** — 所有技能代码、测试与元数据均在 acaclaw-skills 仓库
- **网站为视图** — acaclaw.com/hub 从 GitHub 读取；网站上的编辑会生成 PR，而非直接改库
- **ClawHub 为注册表** — 技能从 ClawHub 安装，而非直接从 GitHub 或 acaclaw.com
- **版本固定明确** — acaclaw 仓库中的 `skills.json` 固定各发行版附带的确切版本
- **无手动部署** — CI 自动处理发布与网站重建

### 网页提交流程

当研究者通过 [acaclaw.com/submit](https://acaclaw.com/submit) 提交技能时：

1. 提交保存为草稿
2. AcaClaw 团队成员审阅草稿
3. 若采纳，由团队成员在 acaclaw-skills 上创建含技能内容的 PR
4. 执行标准 PR 审阅流程
5. 贡献者署名为 Creator
6. 合并后技能出现在 acaclaw.com/hub

这样既保持 GitHub 仓库为单一可信来源，又让非开发者也能参与贡献。

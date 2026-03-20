---
layout: page
title: 计算环境
lang: zh-CN
permalink: /zh-CN/computing-environment/
---

> **设计原则**：默认最小化。只装需要的，在需要时再装。发生冲突时自动新建环境 — 绝不破坏已有可用配置。

---

## 概览

AcaClaw 使用 [Miniforge](https://github.com/conda-forge/miniforge)（conda-forge）在隔离的 Conda 环境中管理 Python、R 与系统级科学工具。

**为何选 Miniforge？**

| 需求 | Miniforge 的优势 |
|---|---|
| 同一环境中 Python + R | Conda 原生解析跨语言依赖 |
| 无授权问题 | Miniforge 仅用 conda-forge（完全开源；与 Anaconda 不同） |
| 全平台可用 | Linux、macOS、Windows（x86_64 与 arm64） |
| 可复现 | YAML 锁定文件固定确切版本 |
| 与系统 Python/R 隔离 | 不与操作系统包冲突 |

---

## 三阶段安装

AcaClaw 分阶段安装 — 除阶段 1 外，每一阶段都可独立、按需进行。

```
Stage 1          Stage 2               Stage 3
Base Install     Discipline Packages   On-Demand Packages
─────────────    ───────────────────   ──────────────────
Miniforge        bioclaw               User requests
Python 3.12      chemclaw              "install seaborn"
bash tools       medclaw               ↓
core stack       sciclaw               Try default env
                 (R optional)          ↓ conflict?
                                       Create new env
```

---

### 阶段 1：基础安装

每次安装 AcaClaw 都从这里开始。这是**默认环境**（`acaclaw`）。

**会安装的内容：**

| 组件 | 说明 |
|---|---|
| **Miniforge** | `~/.acaclaw/miniforge3` — conda/mamba 包管理器 |
| **Python 3.12** | 最新稳定版 CPython |
| **核心科学栈** | numpy, scipy, pandas, matplotlib, statsmodels, sympy |
| **交互式计算** | JupyterLab（Python 内核） |
| **文档工具** | openpyxl, xlsxwriter |
| **研究工具** | semanticscholar, pymupdf（经 pip） |

**默认不安装的内容：**

- R（在阶段 2 或之后按需启用）
- 学科专用包（阶段 2）
- 深度学习框架
- LaTeX / TeX Live

**Conda 环境名：** `acaclaw`

```bash
# 由安装程序创建
conda create -n acaclaw -c conda-forge python=3.12 numpy scipy pandas ...
```

这是**主环境** — 所有命令默认在此运行。

---

### 阶段 2：学科环境

基础安装完成后，用户选择一个或多个学科。每个学科会向基础环境加入一组**必备**包。

#### 可用学科

| 学科 | 环境附加名 | Python 包 | R 包（可选） |
|---|---|---|---|
| 生物学 | `bioclaw` | biopython, scikit-bio | r-biocmanager |
| 化学 | `chemclaw` | rdkit | — |
| 医学 | `medclaw` | lifelines, pydicom | r-survival |
| 科学/物理 | `sciclaw` | astropy, lmfit | — |

#### R 支持

R **默认不安装**。用户选择任一学科时，会询问：

```
Include R language support? [y/N]
```

若选是，会向环境加入：

| R 组件 | 用途 |
|---|---|
| `r-base` (>=4.3) | R 解释器 |
| `r-irkernel` (>=1.3) | JupyterLab 的 R 内核 |
| `r-essentials` (>=4.3) | 核心 R 包（tidyverse、ggplot2、dplyr、tidyr 等） |

以及学科相关 R 包（例如生物学的 `r-biocmanager`、医学的 `r-survival`）。

#### 单一学科

用户只选一个学科时，其包会加入基础 `acaclaw` 环境：

```bash
# 用户选择「生物学」+ R
conda install -n acaclaw biopython scikit-bio r-base r-irkernel r-essentials r-biocmanager
```

环境仍名为 `acaclaw`，不会新建环境。

#### 多个学科

用户选择多个学科（例如生物学 + 医学）时，所选包会合并进基础 `acaclaw` 环境：

```bash
# 用户选择生物学 + 医学 + R
conda install -n acaclaw \
  biopython scikit-bio \
  lifelines pydicom \
  r-base r-irkernel r-essentials r-biocmanager r-survival
```

Conda 会自动解析重叠依赖。环境仍为 `acaclaw` — 一个环境，合并所有学科。

#### 「必备包」理念

每个学科**只**包含满足以下条件的包：
1. **必需** — 没有它们该学科无法开展工作
2. **稳定** — 维护良好，与基础栈兼容
3. **体量小** — 占用尽量小（基础环境不放 4GB 级框架）

其余均在需要时安装（阶段 3）。

---

### 阶段 3：按需安装包

当用户（或 AI 代理）需要当前环境中没有的包时，系统采用**级联解析**策略。

#### 解析流程

```
用户: "Install seaborn"
         │
         ▼
┌─ 步骤 1：尝试默认环境 (acaclaw) ───────────────┐
│  conda install --dry-run -n acaclaw seaborn    │
│  ↓                                             │
│  无冲突？ → 在此安装。结束。                    │
│  有冲突？ → 进入步骤 2。                        │
└────────────────────────────────────────────────┘
         │ conflict
         ▼
┌─ 步骤 2：尝试已有辅助环境 ─────────────────────┐
│  对每个已注册的辅助环境：                       │
│    conda install --dry-run -n <aux> seaborn    │
│    无冲突？ → 在此安装。结束。                  │
│  全部冲突？ → 进入步骤 3。                      │
└────────────────────────────────────────────────┘
         │ all conflict
         ▼
┌─ 步骤 3：请用户新建环境 ───────────────────────┐
│  "seaborn 与当前环境冲突。                      │
│   是否为其新建环境？"                          │
│                                                │
│  用户确认 → conda create -n <name> ...         │
│  在配置与 manifest 中注册新环境。               │
│  将新环境及其用途告知 LLM。                     │
└────────────────────────────────────────────────┘
```

#### 为何是这个顺序？

| 步骤 | 理由 |
|---|---|
| 先试默认 | 尽量集中在一个环境，减少环境碎片化 |
| 再试辅助环境 | 在新建前复用已有「溢出」环境 |
| 最后新建 | 仅在确有必要时；由用户确认名称与用途 |

#### 新环境注册

新建环境后，系统会：

1. **创建 Conda 环境**，包含所请求的包及兼容的基础包
2. **写入配置** — 更新 `~/.acaclaw/config/env-manifest.json`：

```json
{
  "environments": {
    "acaclaw": {
      "type": "primary",
      "description": "Base scientific environment + Biology + Medicine",
      "pythonVersion": "3.12.8",
      "rVersion": "4.4.1"
    },
    "acaclaw-gpu": {
      "type": "auxiliary",
      "description": "GPU-accelerated computing (PyTorch, CUDA)",
      "pythonVersion": "3.12.8",
      "createdAt": "2026-03-14T10:30:00Z",
      "createdReason": "PyTorch CUDA conflicts with numpy 1.x in primary env"
    }
  },
  "defaultEnv": "acaclaw"
}
```

3. **更新 LLM 上下文** — `@acaclaw/academic-env` 插件读取 manifest，并将所有环境注入系统提示：

```
## Computing Environments

Primary: `acaclaw` (Python 3.12, R 4.4, Biology + Medicine packages)
Auxiliary: `acaclaw-gpu` (PyTorch + CUDA — use for deep learning tasks)

Use the primary env for general tasks. Switch to acaclaw-gpu when
the user needs GPU computing or deep learning.
```

4. **注册自动激活规则** — 插件根据命令所需包，在命令前加上正确的 `conda run -n <env>`。

#### 级联示例

```
第 1 天：用户安装 AcaClaw
  → acaclaw 环境：Python、numpy、scipy、pandas、matplotlib

第 2 天：用户选择生物学学科
  → acaclaw 环境：+ biopython、scikit-bio

第 5 天：用户说「安装 seaborn」
  → 尝试 acaclaw：无冲突 → 安装在 acaclaw ✓

第 8 天：用户说「安装带 CUDA 的 pytorch」
  → 尝试 acaclaw：冲突（CUDA toolkit 与系统库等）
  → 尚无辅助环境
  → 询问用户：「是否为 GPU 计算新建环境？」
  → 用户确认 → 创建 acaclaw-gpu
  → 写入 manifest，通知 LLM

第 10 天：用户说「安装 torchvision」
  → 尝试 acaclaw：冲突
  → 尝试 acaclaw-gpu：无冲突 → 安装在 acaclaw-gpu ✓

第 15 天：用户说「安装 jax[cuda]」
  → 尝试 acaclaw：冲突
  → 尝试 acaclaw-gpu：冲突（JAX CUDA 与 PyTorch CUDA）
  → 询问用户：「是否为 JAX 新建环境？」
  → 用户确认 → 创建 acaclaw-jax
```

---

## 环境自动激活

`@acaclaw/academic-env` 插件透明地处理环境激活。

### 工作方式

1. **默认**：所有 `bash`/`exec` 工具调用都会加上前缀 `conda run -n acaclaw`
2. **路由**：若命令引用的包仅在辅助环境中可用，插件会路由到该环境
3. **显式**：用户始终可指定：`conda run -n acaclaw-gpu python train.py`

### 路由规则

| 场景 | 使用的环境 |
|---|---|
| `python analysis.py`（使用 pandas） | `acaclaw`（主环境） |
| `python train.py`（使用 pytorch） | `acaclaw-gpu`（自动检测） |
| `Rscript plot.R`（使用 ggplot2） | `acaclaw`（主环境，若已装 R） |
| `jupyter lab` | `acaclaw`（主环境 — 所有内核可见） |

LLM 知道各包位于哪个环境，并选用正确环境。

---

## 目录结构

```
~/.acaclaw/
├── miniforge3/              # Miniforge 安装
│   ├── bin/
│   │   ├── conda
│   │   ├── mamba
│   │   └── python           # base Python（不直接使用）
│   └── envs/
│       ├── acaclaw/          # 主环境
│       ├── acaclaw-gpu/      # 辅助环境（用户创建）
│       └── ...
├── config/
│   ├── profile.txt           # 已选学科
│   ├── conda-prefix.txt      # 所用 conda 安装路径
│   ├── env-manifest.json     # 全部环境、描述、元数据
│   └── security-mode.txt     # Standard 或 Maximum
└── backups/
    └── ...
```

---

## Conda 环境定义

环境 YAML 文件位于 AcaClaw 仓库的 `env/conda/`。它们定义**基础**与**学科附加**包。

| 文件 | 用途 |
|---|---|
| `environment-base.yml` | 基础 `acaclaw` 环境 — Python + 核心科学栈 |
| `environment-bio.yml` | 生物学附加包（biopython、scikit-bio） |
| `environment-chem.yml` | 化学附加包（rdkit） |
| `environment-med.yml` | 医学附加包（lifelines、pydicom） |
| `environment-phys.yml` | 物理附加包（astropy、lmfit） |
| `environment-r.yml` | R 语言附加（r-base、r-irkernel、r-essentials） |

学科文件**只**列出学科相关包。安装程序在安装时将其与基础合并。

---

## 包冲突检测

安装任何包之前，系统会执行 dry-run 以检测冲突：

```bash
conda install --dry-run -n <env> <package> 2>&1
```

| 退出码 | 含义 | 操作 |
|---|---|---|
| 0 | 兼容 | 在此环境安装 |
| 非零且含 "conflict" | 依赖冲突 | 尝试级联中的下一环境 |
| 非零且为其他原因 | 网络等错误 | 重试或报错 |

系统不会安装会破坏现有环境的包。

---

## CLI 命令

`@acaclaw/academic-env` 插件提供以下命令：

```bash
# 显示所有环境及其状态
openclaw acaclaw-env status

# 列出主环境中的包
openclaw acaclaw-env packages

# 列出指定环境中的包
openclaw acaclaw-env packages --env acaclaw-gpu

# 列出可用学科
openclaw acaclaw-env disciplines

# 向主环境添加学科
openclaw acaclaw-env add-discipline biology

# 安装包（使用级联解析）
openclaw acaclaw-env install <package>

# 新建辅助环境
openclaw acaclaw-env create-env <name> --description "Purpose of this env"

# 显示所有已注册环境
openclaw acaclaw-env list-envs
```

---

## 设计理由

### 为何不按学科拆分环境？

旧设计为每个学科单独环境（acaclaw-bio、acaclaw-chem 等）。问题：

| 问题 | 影响 |
|---|---|
| 基础包重复 | 仅 numpy/scipy/pandas 每个环境约 ~800MB |
| 多学科用户有 N 个环境 | 难以判断某任务该用哪个环境 |
| 无共享状态 | 在 bio 环境装 seaborn 对 chem 环境无帮助 |

新设计：一个主环境，学科包合并其中；仅在冲突时使用辅助环境。

### 为何不预装 R？

| 考量 | 决定 |
|---|---|
| R 生态约 ~1.5GB | 对只需 Python 的用户过大 |
| 并非所有学科都需要 R | 化学/物理很少用 R |
| 后续易添加 | `openclaw acaclaw-env install r-base r-irkernel r-essentials` |

R 在选学科时可选，或之后按需安装。

### 为何用级联解析？

| 备选方案 | 为何不采用 |
|---|---|
| 总是新建环境 | 环境泛滥 — 用户易有 10+ 个环境 |
| 总在默认环境安装 | 冲突时会破坏已有包 |
| 每次都问用户 | 体验差 — 多数安装本无冲突 |

级联：先试默认 → 再试辅助 → 再问用户。兼顾各方。

### 为何选 Miniforge 而非其他方案？

| 备选 | 为何不选 |
|---|---|
| Anaconda | 超过 200 人的组织有商业授权要求 |
| Miniconda | 使用 defaults 频道（受 Anaconda 服务条款约束） |
| venv + pip | 无法管理 R、C 库或系统工具 |
| uv | 仅 Python，无 R |
| Nix | 学习曲线陡，IDE 集成弱 |
| renv | 仅 R，无 Python |
| Pixi | 有前景但生态尚不成熟 |

Miniforge（conda-forge）是在单一、无授权障碍的环境管理器中同时处理 Python + R + C 依赖的实用选择。

---

## 与 OpenClaw 的集成

AcaClaw 运行在 OpenClaw 之上。理解 OpenClaw 如何执行 Python 对正确集成环境至关重要。

### OpenClaw 如何执行命令

OpenClaw 有两种运行模式：

| 模式 | Python 如何被找到 | 环境变量 |
|---|---|---|
| **网关（宿主机）** | 继承宿主机 PATH。运行登录 shell 探测（`/bin/sh -lc env`）以获取完整 PATH，包含 `.bashrc`/`.zshrc` 中的 conda/pyenv/nvm 等 | 安全策略会**屏蔽** `PYTHONHOME` 与 `PYTHONPATH` |
| **沙箱（Docker）** | 使用容器内 PATH（`/usr/local/bin:...`）。仅有 `apt` 提供的系统 `python3`。宿主机 conda 环境不可见 | 仅传递 `sandbox.docker.env` 中配置的变量 |

### OpenClaw 不做的事

- 不检测 conda、venv、pyenv 等任何 Python 环境管理器
- 不激活虚拟环境
- 不向沙箱容器传递 `CONDA_PREFIX`、`VIRTUAL_ENV`、`PYENV_VERSION`
- 不管理 Python 包
- 不知道安装了哪些包

### AcaClaw 如何弥合差距

AcaClaw 通过三处 OpenClaw 集成点，使 Miniforge 环境透明可用：

#### 1. `before_tool_call` 钩子 — 命令包装

`@acaclaw/academic-env` 插件拦截每个 `bash`/`exec` 工具调用，并加上 `conda run` 前缀：

```
用户说: "Run my analysis"
LLM 生成: python analysis.py
插件改写为: conda run --no-banner -n acaclaw python analysis.py
```

原因包括：
- `conda run` 不需要 `conda activate` — 无需改 shell 配置
- 通过绝对路径找到 conda（`~/.acaclaw/miniforge3/bin/conda`）
- **仅网关模式** — 沙箱模式下容器内不存在宿主机的 conda 二进制文件（见下文 [沙箱模式](#sandbox-mode-considerations)）

#### 2. `tools.exec.pathPrepend` — PATH 配置

在网关模式下，AcaClaw 配置 OpenClaw 将 Miniforge 的 bin 目录置于 PATH 前部：

```json
{
  "tools": {
    "exec": {
      "pathPrepend": ["~/.acaclaw/miniforge3/bin"]
    }
  }
}
```

这样即使未初始化 shell 配置，`conda` 与 `mamba` 在网关模式下也可用。

> **说明：** 沙箱模式下，该宿主机路径在容器内不存在。沙箱需要不同方案 — 见下文 [沙箱模式](#sandbox-mode-considerations)。

#### 3. `before_prompt_build` 钩子 — LLM 上下文

插件在系统提示中注入「计算环境」一节，告知 LLM：
- 有哪些环境、各含何内容
- 哪些包已可用（无需再装）
- 何时用主环境、何时用辅助环境
- 除非用户明确要求，否则不要执行 `pip install`、`conda install` 或 `install.packages()`

### 已有环境探测

启动时，`@acaclaw/academic-env` 插件会探测已有环境：

```
1. 检查 ~/.acaclaw/miniforge3/bin/conda（AcaClaw 自带的 Miniforge）
2. 检查 ~/.acaclaw/miniforge3/condabin/conda（备用路径）
3. 在系统 PATH 中查找 conda（用户已有的 Miniforge/Anaconda/Miniconda）
4. 若找到：执行 'conda env list --json' 发现所有环境
5. 读取 ~/.acaclaw/config/env-manifest.json 获取已注册的 AcaClaw 环境
6. 合并：向 LLM 报告所有发现的环境
```

**复用策略**：若用户已有可用的 Miniforge 或 conda 安装，AcaClaw 可使用它，而无需再装一份。安装程序在以下路径查找已有 conda：

| 路径 | 含义 |
|---|---|
| `~/.acaclaw/miniforge3` | AcaClaw 自带 Miniforge（优先） |
| `~/miniforge3` | 用户独立 Miniforge |
| `~/mambaforge` | 用户独立 Mambaforge |
| `~/miniconda3` | 用户 Miniconda（需 conda-forge 频道） |
| `~/anaconda3` | 用户 Anaconda（不推荐 — 授权） |
| 系统 `conda` | PATH 上任意 conda |

若发现已有 conda，安装程序会询问：

```
Found existing conda at ~/miniforge3 (Miniforge 24.3.0).
  1) Use existing conda installation (recommended if compatible)
  2) Install AcaClaw's own Miniforge at ~/.acaclaw/miniforge3
```

无论选用哪个 conda，都会**新建** `acaclaw` 环境。

### 沙箱模式注意事项
{: #sandbox-mode-considerations}

OpenClaw 在沙箱（Docker）模式下运行时，宿主机的 Miniforge **不可访问**。沙箱容器完全隔离：

- **网络**：默认 `none` — 无外网，`curl`/`wget` 无法下载包
- **根文件系统**：默认只读 — 无法向 `/opt`、`/usr` 等安装软件
- **可写位置**：仅 `/tmp`、`/var/tmp`、`/run`（tmpfs）以及挂载的 `/workspace`
- **宿主机路径**：仅挂载项目工作区；`~/.acaclaw/miniforge3` 不可见
- **环境变量**：不继承宿主机环境；仅传递显式配置的变量

在沙箱模式下使 conda 可用，有三种策略：

#### 策略 1：绑定挂载宿主机 Miniforge（推荐）

将宿主机 Miniforge 只读挂载进容器：

```json
{
  "agents": {
    "defaults": {
      "sandbox": {
        "docker": {
          "binds": [
            "~/.acaclaw/miniforge3:/opt/miniforge3:ro"
          ],
          "env": {
            "PATH": "/opt/miniforge3/envs/acaclaw/bin:/opt/miniforge3/bin:/usr/local/bin:/usr/bin:/bin"
          }
        }
      }
    }
  }
}
```

速度快（无安装步骤）、与宿主机环境一致、可离线工作。因源路径在工作区外，需要 `dangerouslyAllowExternalBindSources: true`。

#### 策略 2：预装 Miniforge 的自定义 Docker 镜像

构建包含 Miniforge 与 `acaclaw` 环境的沙箱镜像：

```dockerfile
FROM openclaw-sandbox:bookworm-slim
RUN curl -fsSL https://github.com/conda-forge/miniforge/releases/latest/download/Miniforge3-Linux-$(uname -m).sh -o /tmp/mf.sh \
    && bash /tmp/mf.sh -b -p /opt/miniforge3 \
    && rm /tmp/mf.sh
COPY environment.yml /tmp/environment.yml
RUN /opt/miniforge3/bin/conda env create -f /tmp/environment.yml
ENV PATH="/opt/miniforge3/envs/acaclaw/bin:/opt/miniforge3/bin:$PATH"
```

然后配置 OpenClaw 使用该自定义镜像：

```json
{
  "agents": {
    "defaults": {
      "sandbox": {
        "docker": {
          "image": "acaclaw-sandbox:latest"
        }
      }
    }
  }
}
```

对团队最稳妥，但包变更时需要重建镜像。

#### 策略 3：`setupCommand`（需要网络与可写根）

在容器创建时于容器内安装 Miniforge。需覆盖默认沙箱安全设置：

```json
{
  "agents": {
    "defaults": {
      "sandbox": {
        "docker": {
          "network": "bridge",
          "readOnlyRoot": false,
          "setupCommand": "curl -fsSL https://github.com/conda-forge/miniforge/releases/latest/download/Miniforge3-Linux-$(uname -m).sh -o /tmp/mf.sh && bash /tmp/mf.sh -b -p /opt/miniforge3 && /opt/miniforge3/bin/conda env create -f /workspace/.acaclaw/environment.yml",
          "env": {
            "PATH": "/opt/miniforge3/envs/acaclaw/bin:/opt/miniforge3/bin:/usr/local/bin:/usr/bin:/bin"
          }
        }
      }
    }
  }
}
```

> **警告：** 这会削弱沙箱安全性（开放网络与可写根文件系统），且较慢 — 每个新容器都要下载 Miniforge 并创建环境。优先使用策略 1 或 2。

### AcaClaw 写入的配置文件

| 文件 | 写入方 | 读取方 | 用途 |
|---|---|---|---|
| `~/.acaclaw/config/profile.txt` | 安装程序 | 插件 | 已选学科 |
| `~/.acaclaw/config/env-manifest.json` | 插件 | 插件、LLM | 全部环境、包、版本、描述 |
| `~/.acaclaw/config/security-mode.txt` | 安装程序 | 插件 | Standard 或 Maximum |
| `openclaw.json`（`tools.exec.pathPrepend`） | 安装程序 | OpenClaw exec 工具 | Miniforge bin 加入 PATH |
| `openclaw.json`（`plugins.*`） | 安装程序 | OpenClaw 插件加载器 | 插件设置 |

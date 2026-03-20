---
layout: page
title: 数据安全
lang: zh-CN
permalink: /zh-CN/data-safety/
---

> **设计原则**：研究数据不可替代。每次修改文件前必须先备份，每次删除必须可恢复，每次恢复必须可验证。

---

## 概述

AcaClaw 在 OpenClaw 之上构建多层数据保护体系。系统有两层用途不同的备份，外加基于回收站的删除安全网。

```
┌────────────────────────────────────────────────────────────────┐
│  AcaClaw Data Safety                                            │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Backup Layer B: Workspace Snapshot                      │  │
│  │  Full workspace backup, manual/scheduled, default OFF    │  │
│  │  For disaster recovery — disk failure, accidental wipe   │  │
│  ├──────────────────────────────────────────────────────────┤  │
│  │  Backup Layer A: Per-File Versioning + Trash + Sync      │  │
│  │  A1: Pre-modification backup (SHA-256, dedup-aware)      │  │
│  │  A2: Deletion → .trash/ (not permanent delete)           │  │
│  │  A3: Periodic sync (rsync-style change detection)        │  │
│  │  Always ON, lightweight, automatic                       │  │
│  ├──────────────────────────────────────────────────────────┤  │
│  │  Foundation: OpenClaw Infrastructure                     │  │
│  │  Session archiving, config rotation, boundary checks,    │  │
│  │  workspace git init, exec approval system                │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

### 两层、三种机制

| | A1：版本化 | A2：回收站 | A3：定期同步 | B：工作区快照 |
|---|---|---|---|---|
| **用途** | 撤销 AI 改动 | 恢复已删文件 | 捕获手动编辑 | 灾难恢复 |
| **默认** | **开启** | **开启** | **开启** | **关闭** |
| **触发** | AI 工具调用 | AI 删除 | 定时 / 会话开始 | 手动 / 定时 |
| **范围** | 单个文件 | 已删文件 | 整个工作区 | 完整工作区树 |
| **存储** | 小（去重感知） | 小 | 小（去重共享） | 大（完整副本） |
| **磁盘风险** | 低 | 低 | 低 | **高** |
| **最适合** | 「撤销那次编辑」 | 「找回删掉的文件」 | 「我在 Jupyter 里改了」 | 「硬盘挂了」 |

---

## OpenClaw 提供的能力（第一层）

AcaClaw 原样继承 OpenClaw 的下列数据安全机制。

### 会话归档

会话被重置或删除时，OpenClaw **不会**立即删除转写文件，而是为文件加上时间戳后缀重命名：

| 操作 | 原文件 | 归档为 |
|--------|--------------|-------------|
| 重置 | `<sessionId>.jsonl` | `<sessionId>.jsonl.reset.<timestamp>` |
| 删除 | `<sessionId>.jsonl` | `<sessionId>.jsonl.deleted.<timestamp>` |

归档保留时间由 `session.maintenance.resetArchiveRetention` 控制（默认 30 天）。这意味着在保留期内，误重置会话总是可以恢复。

### 会话维护

OpenClaw 的会话清理遵循严格顺序，以避免数据丢失：

1. 修剪早于 `pruneAfter`（默认 30 天）的陈旧条目
2. 将条目数量限制在 `maxEntries`（默认 500，先删最旧）
3. 为被移除条目的转写文件做归档（重命名，不删除）
4. 清除超过保留期的旧 `.deleted.*` 与 `.reset.*` 归档
5. 当超过 `rotateBytes`（默认 10 MB）时轮转 `sessions.json`
6. 在 `highWaterBytes`（默认 `maxDiskBytes` 的 80%）方向执行磁盘预算

要点：仅当 `session.maintenance.mode` 为 `"enforce"` 时才执行清理（默认为 `"warn"` — 仅报告）。AcaClaw 在标准与最高配置中均设为 `"enforce"`。

### 配置文件轮转

OpenClaw 为 `openclaw.json` 保留 **5 份轮转备份**：

```
openclaw.json          ← current
openclaw.json.bak      ← previous
openclaw.json.bak.1    ← two versions ago
openclaw.json.bak.2
openclaw.json.bak.3
openclaw.json.bak.4    ← oldest preserved
```

所有备份均以 `0o600`（仅所有者可读写）权限写入。崩溃写入产生的孤立 `.bak.*` 文件会自动清理。

### 工作区 Git 初始化

OpenClaw 会将新工作区自动初始化为 git 仓库（`git init`）。由此可获得：

- 通过 `git log` 查看文件级历史
- 对比变更的能力
- 通过 `git checkout` 或 `git stash` 恢复

Git 初始化为尽力而为 — 即使未安装 git，工作区创建仍会成功。

### 文件边界强制

OpenClaw 阻止工具访问允许边界之外的文件：

| 保护 | 阻止的行为 |
|-----------|------------------|
| 符号链接逃逸检测 | 工具不能跟随工作区外的符号链接 |
| 路径穿越拒绝 | 文件操作中阻止 `../` 段 |
| 沙箱挂载限制 | 不能挂载 `/docker.sock`、`/etc`、`/proc`、`/sys`、`/dev` |
| 容器绑定校验 | 自定义绑定需通过允许源根校验 |

### 危险工具审批

修改文件的工具（`fs_write`、`fs_delete`、`fs_move`、`apply_patch`、`exec`）在执行前需要显式审批。审批策略：

- `"deny"`：阻止所有宿主机 exec
- `"allowlist"`：仅允许预先批准的命令
- `"full"`：允许一切（提升权限）

已批准的命令绑定到具体可执行路径与文件操作数 — 若审批后目标文件发生变化，审批失效。

---

## 备份层 A：按文件版本化 + 回收站（默认开启）

层 A 通过两种机制保护单个文件：修改前版本化与基于回收站的删除。

### A1：修改前版本化

`@acaclaw/backup` 插件拦截每一次修改文件的工具调用，在实际修改发生**之前**创建已校验的备份。

### 工作原理

```
Tool call arrives (write, edit, apply_patch, bash, exec, process)
   │
   ▼
@acaclaw/backup (before_tool_call, priority 200)
   │
   ├─ Extract target file path from tool params
   │
   ├─ File doesn't exist? → Skip (new file creation, nothing to back up)
   │
   ├─ File excluded? → Skip (matches excludePatterns)
   │
   ├─ Copy original file to backup directory
   │
   ├─ Compute SHA-256 of original
   │
   ├─ Compute SHA-256 of backup copy
   │
   ├─ Compare checksums
   │   ├─ Match → Write metadata JSON, allow tool call
   │   └─ Mismatch → BLOCK the tool call entirely
   │
   └─ Backup I/O error → BLOCK the tool call entirely
```

### 失败即阻止策略

与许多备份系统「尽力而为并继续」不同，若备份失败，AcaClaw **会阻止文件修改**。这是面向学术数据的刻意设计：

| 场景 | 结果 |
|----------|--------|
| 备份成功且校验和一致 | 工具调用继续 |
| 备份成功但校验和不一致 | 工具调用**被阻止** — 数据完整性问题 |
| 备份 I/O 错误（磁盘满、权限等） | 工具调用**被阻止** — 无法保证可恢复 |
| 文件尚不存在（新文件） | 工具调用继续 — 无内容可备份 |
| 文件匹配排除模式 | 工具调用继续 — 按策略排除 |

LLM 会收到明确的错误信息，说明写入被阻止的原因，以便告知用户。

### 备份存储布局

```
~/.acaclaw/backups/
├── <workspaceId>/                     # Per-workspace isolation
│   └── files/
│       ├── 2026-03-14/                # Date-organized
│       │   ├── 14-30-22.results.csv           # Backup copy
│       │   ├── 14-30-22.results.csv.meta.json # Metadata
│       │   ├── 15-01-47.analysis.py
│       │   └── 15-01-47.analysis.py.meta.json
│       └── 2026-03-13/
│           └── ...
└── _global/                           # Files outside any workspace
    └── files/
        └── ...
```

工作区 ID 由工作区根路径派生：`<dirName>-<sha256(absPath)[0:12]>`。这样在多个项目间切换时备份仍能保持有序。

### 元数据记录

每次备份都包含 JSON 元数据文件：

```json
{
  "originalPath": "/home/user/research/data/results.csv",
  "workspaceRelativePath": "data/results.csv",
  "workspaceId": "research-a1b2c3d4e5f6",
  "backupTime": "2026-03-14T14:30:22.000Z",
  "operation": "modify",
  "toolCall": "write",
  "agentSession": "session-abc123",
  "originalChecksum": "sha256:e3b0c44298fc1c149...",
  "originalSize": 15432,
  "backupChecksum": "sha256:e3b0c44298fc1c149...",
  "description": "Backed up before write operation"
}
```

该元数据支持：

- **取证式恢复**：确切知道是哪一个工具调用、在何时修改了文件
- **完整性校验**：比对校验和确认备份未损坏
- **选择性还原**：从特定会话中找到特定版本
- **审计轨迹**：追踪 AI 驱动修改下的数据血缘

### 去重感知版本化（二进制文件优化）

默认情况下，层 A1 在每次修改前保存文件的**完整副本**。对小文本文件影响可忽略，但对大型二进制文件成本会累积：

| 文件 | 每日编辑次数 | 存储（每日完整副本） |
|------|:------------:|:--------------------------:|
| `paper.docx`（5 MB） | 5 | 25 MB |
| `presentation.pptx`（50 MB） | 3 | 150 MB |
| `dataset.xlsx`（200 MB） | 2 | 400 MB |

AcaClaw 通过**去重感知版本化**缓解这一问题 — 两种机制在不影响可恢复性的前提下减少占用。

#### 1. 未变则跳过

在创建备份副本前，AcaClaw 将文件当前 SHA-256 与最近一次备份的校验和比较。若一致则跳过备份 — 自上次备份以来文件实际未变。

```
Tool call: write presentation.pptx
  │
  ├─ SHA-256(current file) = abc123...
  ├─ SHA-256(latest backup) = abc123...  ← same!
  └─ Skip backup (no new copy needed)
```

这能覆盖常见模式：工具用相同内容重写文件（例如未改动的保存、仅格式化重写，或批量触碰但未真正修改文件）。

#### 2. 硬链接去重

当多份备份内容相同（同一 SHA-256）时，AcaClaw 只存一份物理副本，后续版本使用[硬链接](https://en.wikipedia.org/wiki/Hard_link)。这与 `rsync --link-dest` 所用技术相同。

```
~/.acaclaw/backups/<workspace>/files/
├── 2026-03-14/
│   ├── 14-30-22.presentation.pptx      # 50 MB (physical copy)
│   └── 16-45-10.presentation.pptx      # 0 MB (hardlink to above — same content)
└── 2026-03-15/
    └── 09-10-05.presentation.pptx      # 50 MB (new physical copy — content changed)
```

硬链接对使用者透明 — 每个备份路径都可独立用于还原。若删除其中一个硬链接，其余仍有效。

| 条件 | 存储成本 |
|-----------|:------------|
| 自上次备份以来文件未变 | 0（完全跳过） |
| 文件内容与已有某份备份相同 | 0（硬链接） |
| 文件内容为新的 | 完整副本（与此前相同） |

> **平台说明**：硬链接在 Linux、macOS 与 NTFS（Windows）上可用。不能跨文件系统边界 — 若 `backupDir` 与源文件不在同一挂载点，AcaClaw 会回退为完整副本。

### 排除的文件

默认下列模式不参与备份（不值得备份）：

```
*.tmp
node_modules/
.git/
__pycache__/
```

用户可通过 `plugins.acaclaw-backup.excludePatterns` 自定义。

### 恢复文件

AcaClaw 提供三种恢复方式：

#### 1. 自然语言（经 LLM）

```
User: "Undo the last change to results.csv"
LLM: calls backup_restore(filePath="data/results.csv", version=0)
→ "Restored data/results.csv from backup (2026-03-14T14:30:22Z)"
```

#### 2. LLM 工具：`backup_list` + `backup_restore`

```
User: "Show me all versions of my analysis script"
LLM: calls backup_list(filePath="src/analysis.py")
→ "[0] 2026-03-14T15:01:47Z — 12 KB — triggered by: edit
   [1] 2026-03-14T10:22:03Z — 11 KB — triggered by: apply_patch
   [2] 2026-03-13T09:15:00Z — 8 KB — triggered by: write"

User: "Restore version 2"
LLM: calls backup_restore(filePath="src/analysis.py", version=2)
```

#### 3. CLI：`openclaw acaclaw-backup`

```bash
# List backup versions
openclaw acaclaw-backup list data/results.csv

# Restore the most recent backup
openclaw acaclaw-backup restore data/results.csv

# Restore a specific version
openclaw acaclaw-backup restore data/results.csv --version 2
```

---

### A2：基于回收站的删除（非永久删除）

当 AI 代理删除文件或文件夹时，AcaClaw **将其移到回收站目录**，而非永久删除。这是误删的最后一道防线。

#### 工作原理

`@acaclaw/backup` 插件拦截删除操作（`rm`、`fs_delete`、`rmdir`），并将其改写为移动到回收站：

```
AI runs: rm data/old-results.csv
Plugin rewrites to: mv data/old-results.csv ~/.acaclaw/backups/.trash/2026-03-14/14-30-22.old-results.csv
```

适用于：

| 操作 | 拦截方式 |
|-----------|---------------------|
| `fs_delete` 工具 | `before_tool_call` 钩子改写为移动 |
| bash/exec 中的 `rm` | 在 `before_tool_call` 中改写命令 |
| `rm -r`（目录） | 整个目录移到回收站 |
| `rmdir` | 拦截并移动 |

#### 回收站存储布局

```
~/.acaclaw/backups/.trash/
├── 2026-03-14/
│   ├── 14-30-22.old-results.csv                    # Deleted file
│   ├── 14-30-22.old-results.csv.meta.json           # Metadata
│   ├── 15-10-05.draft-figures/                      # Deleted directory
│   │   ├── fig1.png
│   │   └── fig2.pdf
│   └── 15-10-05.draft-figures.meta.json
└── 2026-03-13/
    └── ...
```

每个回收项都带有元数据：

```json
{
  "originalPath": "/home/user/research/data/old-results.csv",
  "workspaceRelativePath": "data/old-results.csv",
  "trashedAt": "2026-03-14T14:30:22.000Z",
  "operation": "delete",
  "toolCall": "bash",
  "agentSession": "session-abc123",
  "originalChecksum": "sha256:e3b0c44298fc1c149...",
  "originalSize": 15432,
  "isDirectory": false
}
```

#### 为何不用系统回收站？

| 考量 | 系统回收站（`~/.Trash/`） | AcaClaw 回收站（`.trash/`） |
|---------|---------------------------|---------------------------|
| 位置一致性 | 随操作系统与桌面环境变化 | 始终在 `~/.acaclaw/backups/.trash/` |
| 元数据 | 无工具/会话追踪 | 完整审计元数据 |
| 保留策略 | 用户自行清空 | 可配置自动清理 |
| CLI 恢复 | 依赖桌面工具 | `openclaw acaclaw-backup restore-trash` |
| 无头/SSH | 常不可用 | 始终可用 |
| 沙箱模式 | 系统回收站不可访问 | AcaClaw 回收站在已挂载路径上 |

OpenClaw 自身对配置重置（`openclaw reset`）使用系统 `trash` 命令。AcaClaw 使用独立的 `.trash/` 目录，使研究文件的删除与系统级操作解耦，并具备完整审计元数据。

#### 回收站保留

回收站文件是临时的 — 用户控制何时永久删除：

| 设置 | 默认值 | 说明 |
|---------|---------|-------------|
| `trashRetentionDays` | 30 | 回收站文件自动清除前的天数 |
| `trashMaxStorageGB` | 5 | 回收站最大占用，超出则清除最旧项 |

```jsonc
{
  "plugins": {
    "acaclaw-backup": {
      "trashRetentionDays": 14,   // Purge after 2 weeks
      "trashMaxStorageGB": 2      // Limit to 2 GB
    }
  }
}
```

#### 从回收站恢复

```bash
# List trashed files
openclaw acaclaw-backup list-trash

# Restore a specific file to its original location
openclaw acaclaw-backup restore-trash data/old-results.csv

# Permanently empty trash (user-initiated only)
openclaw acaclaw-backup empty-trash
```

或通过自然语言：

```
User: "I accidentally deleted old-results.csv, can you recover it?"
LLM: calls trash_restore(filePath="data/old-results.csv")
→ "Restored data/old-results.csv from trash (deleted 2026-03-14T14:30:22Z)"
```

---

### A3：后台同步（rsync 风格，仅空闲时）

层 A1 仅在 AI 通过工具调用修改文件时触发。但研究者也会手动编辑 — 在 Jupyter、外部编辑器中，或通过绕过 AcaClaw 钩子的 shell 命令。**后台同步**在系统**空闲**时扫描工作区变更（无正在运行的 AI 任务），填补这一空白。

#### 工作原理

AcaClaw 维护**文件清单**（校验和 + 时间戳），在空闲时与当前工作区状态比较 — 类似 `rsync` 如何检测变更文件。

```
Gateway becomes idle (no active tool call or LLM request)
   │
   ├─ Wait for idle grace period (default: 60 seconds)
   │   └─ If new job starts during grace period → cancel, wait again
   │
   ├─ Walk workspace directory tree (background priority)
   │
   ├─ For each file:
   │   ├─ Compare mtime + size against manifest
   │   │   ├─ Match → Skip (file unchanged)
   │   │   └─ Mismatch → Compute SHA-256
   │   │       ├─ Hash matches manifest → Update mtime only (metadata change)
   │   │       └─ Hash differs → File changed since last sync
   │   │           ├─ Skip-if-unchanged: check latest A1 backup hash
   │   │           ├─ New content → Copy to backups/ (with hardlink dedup)
   │   │           └─ Update manifest
   │   └─ File not in manifest → New file, add to manifest (no backup needed)
   │
   ├─ If new job arrives mid-sync → pause sync, resume when idle again
   │
   └─ Files in manifest but not on disk → Deleted outside AI session
       └─ Log warning (trash only applies to AI-initiated deletion)
```

#### 仅空闲时调度

同步从不与正在进行的 AI 工作争抢：

| 系统状态 | 同步行为 |
|-------------|---------------|
| AI 正在处理请求 | **不运行** — 零开销 |
| 工具调用进行中 | **不运行** |
| 空闲时间 < 宽限期 | **等待** — 用户可能发送下一条消息 |
| 空闲时间 ≥ 宽限期 | **运行** — 后台优先级 |
| 同步过程中有新任务 | **暂停** — 再次空闲后继续 |
| 未检测到变更 | 很快完成（仅 stat，无额外 I/O） |

这意味着同步对 **AI 响应延迟零影响**，且仅在系统本可空闲时使用磁盘 I/O。

#### 能覆盖的场景

| 场景 | A1 钩子 | A3 同步 |
|----------|:-------:|:-------:|
| AI 通过工具调用编辑文件 | ✓ | ✓（冗余，会去重） |
| 用户在 Jupyter 中编辑 | — | ✓ |
| 用户在外部编辑器中编辑 | — | ✓ |
| Shell 命令修改文件（`sed`、`awk`） | 部分 | ✓ |
| 流水线写入新输出文件 | — | ✓（为后续撤销捕获状态） |

#### 快速变更检测

每次同步都对所有文件做完整 SHA-256 在大工作区会很慢。AcaClaw 使用两阶段检查（与 rsync 相同策略）：

1. **快速检查**：将 `mtime` + 文件大小与清单比较。若均一致则跳过。每个文件约 <1 ms。
2. **哈希检查**：仅对 mtime 或大小不一致的文件计算。确认内容是否真正改变。

对含 10,000 个文件、其中 20 个有变更的工作区，意味着约 10,000 次 stat（快）+ 约 20 次哈希计算（与变更数据量成正比）。

#### 配置

| 设置 | 默认值 | 说明 |
|---------|---------|-------------|
| `syncEnabled` | `true` | 启用后台同步 |
| `syncIdleGraceSeconds` | `60` | 空闲多少秒后开始同步 |
| `syncMinIntervalMinutes` | `10` | 两次同步之间的最短时间（避免空闲/活跃快速切换时抖动） |
| `syncExcludePatterns` | （与 A1 排除相同） | 同步时跳过的模式 |

```jsonc
{
  "plugins": {
    "acaclaw-backup": {
      "syncEnabled": true,
      "syncIdleGraceSeconds": 30,    // Start sync after 30s of idle
      "syncMinIntervalMinutes": 5,   // But no more often than every 5 minutes
      "syncExcludePatterns": ["*.tmp", "node_modules/", ".git/", "__pycache__/", "*.h5"]
    }
  }
}
```

用户也可随时触发手动同步（跳过空闲检查）：

```bash
# Sync now (scan for changes and back up)
openclaw acaclaw-backup sync

# Sync with verbose output (shows what changed)
openclaw acaclaw-backup sync --verbose
```

#### 同步清单

清单与备份放在一起，记录每个被跟踪文件的最后已知状态：

```
~/.acaclaw/backups/<workspace>/
├── sync-manifest.json      # Current file state
└── files/                   # Backup copies (shared with A1)
```

```json
{
  "lastSync": "2026-03-14T15:30:00.000Z",
  "files": {
    "data/results.csv": {
      "sha256": "e3b0c44298fc1c149...",
      "size": 15432,
      "mtime": "2026-03-14T14:30:22.000Z"
    },
    "slides/presentation.pptx": {
      "sha256": "a1b2c3d4e5f6...",
      "size": 52428800,
      "mtime": "2026-03-14T10:00:00.000Z"
    }
  }
}
```

A1 备份与 A3 同步备份共用同一 `files/` 目录与硬链接去重池 — 两种机制之间无重复占用。

---

## 备份层 B：工作区快照（默认关闭）

层 B 对整个工作区做完整的时间点快照。用于灾难恢复 — 不用于单条变更的撤销/重做（那是层 A 的职责）。

### 为何默认关闭

工作区快照可能非常大：

| 工作区大小 | 快照大小 | 保留 3 份快照 |
|---------------|--------------|-------------------|
| 100 MB | ~100 MB | ~300 MB |
| 1 GB | ~1 GB | ~3 GB |
| 10 GB（大数据集） | ~10 GB | ~30 GB |

对使用大型数据集（基因组、影像、模拟）的研究者，工作区快照可能超过可用磁盘空间。**用户必须显式启用该功能并配置存储上限。**

### 启用工作区快照

```jsonc
{
  "plugins": {
    "acaclaw-backup": {
      "workspaceSnapshot": {
        "enabled": true,
        "maxSnapshots": 3,          // Keep at most 3 snapshots
        "maxStorageGB": 20,         // Hard limit on snapshot storage
        "excludePatterns": [        // Don't snapshot these
          "*.tmp",
          "node_modules/",
          ".git/",
          "__pycache__/",
          "*.h5",                   // Large HDF5 files
          "*.zarr/"                 // Large array stores
        ]
      }
    }
  }
}
```

### 快照包含什么

快照同时捕获 **OpenClaw 工作区**与 **AcaClaw 工作区**：

| 目录 | 内容 | 是否包含？ |
|-----------|-----------------|-----------|
| OpenClaw 工作区（`~/.openclaw/workspace/`） | 代理记忆、AGENTS.md、SOUL.md、用户文件 | 是 |
| AcaClaw 工作区（项目目录） | 研究数据、脚本、论文 | 是 |
| `~/.openclaw/agents/*/sessions/` | 会话转写 | 否（请用 `openclaw backup`） |
| `~/.openclaw/credentials/` | API 密钥、OAuth | 否（请用 `openclaw backup`） |
| `~/.acaclaw/backups/` | 层 A 备份 | 否（会形成循环） |

### 快照存储布局

```
~/.acaclaw/backups/snapshots/
├── 2026-03-14T10-00-00/
│   ├── manifest.json                    # Snapshot metadata
│   ├── openclaw-workspace.tar.gz        # OpenClaw workspace archive
│   └── project-workspace.tar.gz         # Project workspace archive
├── 2026-03-13T10-00-00/
│   └── ...
└── 2026-03-12T10-00-00/
    └── ...
```

### 快照清单

```json
{
  "snapshotTime": "2026-03-14T10:00:00.000Z",
  "openclawWorkspace": "~/.openclaw/workspace",
  "projectWorkspace": "~/research/my-project",
  "openclawWorkspaceSize": 52428800,
  "projectWorkspaceSize": 104857600,
  "excludePatterns": ["*.tmp", "node_modules/", ".git/"],
  "checksums": {
    "openclaw-workspace.tar.gz": "sha256:abc123...",
    "project-workspace.tar.gz": "sha256:def456..."
  }
}
```

### 创建与管理快照

```bash
# Create a snapshot manually
openclaw acaclaw-backup snapshot

# List existing snapshots
openclaw acaclaw-backup snapshot-list

# Restore from a snapshot (extracts to original locations)
openclaw acaclaw-backup snapshot-restore 2026-03-14T10-00-00

# Delete a specific snapshot
openclaw acaclaw-backup snapshot-delete 2026-03-14T10-00-00
```

### 快照轮转

达到 `maxSnapshots` 时，创建新快照前会删除最旧的快照。超过 `maxStorageGB` 时，按最旧优先删除快照直至低于预算。

---

## 与 Git 的协同

OpenClaw 会将工作区自动初始化为 git 仓库。AcaClaw 的备份系统设计为 **补充 git，而非替代**。二者用途不同，对不同文件类型的表现也不同。

### Git 与 AcaClaw 备份：分工

| 文件类型 | Git | AcaClaw 备份 | 建议 |
|-----------|-----|----------------|----------------|
| 源码（`.py`、`.R`、`.md`） | 极佳（增量压缩、diff、blame） | 可用但无 diff | 版本管理用 git，撤销安全用 AcaClaw |
| 小数据（`.csv`、`.json`、`.tsv`） | 好（基于文本的 diff） | 可用 | 里程碑用 git，每次改动安全用 AcaClaw |
| 二进制文档（`.docx`、`.pptx`、`.xlsx`） | 差（每次提交整份拷贝，无 diff） | 可用（整份拷贝，成本类似） | **仅用 AcaClaw 备份** — 这些勿进 git |
| 大型二进制（`.h5`、`.zarr`、`.nii`、图像） | 很差（`.git/` 膨胀） | 可用但占磁盘 | **两者均排除** — 使用外部存储 |
| 生成物（`.pdf`、图表） | 不必要（可再生成） | AcaClaw 回收站可防误删 | git 排除；AcaClaw 回收站足够 |

### AcaClaw 如何避免与 Git 冲突

AcaClaw 备份使用 `~/.acaclaw/backups/` — 与工作区完全分离的目录。从不写入工作区内的 `.git/`，也不干扰 git 操作。

| 顾虑 | 处理方式 |
|---------|-----------------|
| 备份文件出现在 `git status` | 不会 — 备份在工作区外 |
| `.trash/` 出现在 `git status` | 不会 — 回收站在 `~/.acaclaw/backups/.trash/`，不在工作区 |
| 工作区内的快照归档 | 不会 — 快照在 `~/.acaclaw/backups/snapshots/` |
| 工作区内的 AcaClaw 元数据 | `~/.acaclaw/` 自有 `.gitignore`，内容为 `*`（排除全部） |

### 研究工作区推荐的 `.gitignore`

AcaClaw 建议在工作区添加 `.gitignore`，保持 git 干净：

```gitignore
# Binary documents (use AcaClaw backup instead of git)
*.docx
*.pptx
*.xlsx

# Large data files (use external storage)
*.h5
*.hdf5
*.zarr/
*.nii
*.nii.gz

# Generated output (regenerable)
*.pdf
plots/
figures/

# Temporary files
*.tmp
__pycache__/
.ipynb_checkpoints/
```

该 `.gitignore` 确保 git 跟踪其擅长的内容（文本、代码、小数据），而 AcaClaw 的层 A 备份处理 git 吃力的二进制文件。

### Git 管里程碑，AcaClaw 管安全网

推荐工作流：

```
Day-to-day work:
  AI modifies files → AcaClaw Layer A backs up each change automatically
  AI deletes files  → AcaClaw moves to .trash/ automatically
  User says "undo"  → AcaClaw restores from Layer A backup

Key milestones:
  User: "git add -A && git commit -m 'Pre-submission draft'"
  → Git captures a named, browsable snapshot of text/code changes

Disaster recovery (if enabled):
  User: "openclaw acaclaw-backup snapshot"
  → Layer B captures full workspace including binary files

Off-machine backup:
  User: "git push origin main"
  → Text/code backed up to remote
  User: "openclaw backup create"
  → Full state (sessions, config, credentials) archived as .tar.gz
```

### 二进制文件：高效处理

Git 在每次提交中将二进制存为完整副本。50 MB 的 PowerPoint 提交 10 次约产生 ~500 MB 的 git 历史。

AcaClaw 通过去重感知版本化（未变跳过 + 硬链接去重）与定期同步，更高效地处理二进制：

| 特性 | Git | AcaClaw A1 + A3 |
|---------|-----|-----------------|
| 相同内容的多版本 | 每次提交整份拷贝 | 去重（硬链接或跳过） |
| 存储增长 | 随提交线性、永久累积 | 由 `retentionDays` + `maxStorageGB` 约束 |
| 清理 | 手动 `git gc`、激进 repack | 基于保留期的自动修剪 |
| 变更检测 | `git add` 时内容哈希 | mtime + 大小快速路径，必要时再哈希 |
| 捕获手动编辑 | 仅当用户执行 `git add/commit` | 通过 A3 定期同步自动 |
| `.git/` 膨胀 | 是 — clone 带全历史 | 否 — 备份在工作区外 |

**实际存储示例**（50 MB `.pptx`，每周 10 次编辑，其中 3 次真正改变内容）：

| 方法 | 4 周后存储 |
|--------|:---------------------:|
| Git（无 LFS） | 2 GB（`.git/` 中 40 份完整拷贝） |
| AcaClaw A1 无去重 | 2 GB（40 份完整拷贝） |
| AcaClaw A1 带去重 | **约 150 MB**（每周 3 个唯一版本 × 4 = 12 份拷贝，其余硬链接） |
| AcaClaw A1 带去重 + 30 天保留 | **约 150 MB** 后自动修剪 |

对大型二进制数据集（单文件 > 100 MB），git 与 AcaClaw 备份都不合适。研究者应使用专门的数据管理手段：

| 工具 | 用例 |
|------|----------|
| Git LFS | 必须与 git 一起版本控制的二进制 |
| DVC（Data Version Control） | ML 数据集与实验追踪 |
| 高校 NAS / 云存储 | 原始仪器数据、影像扫描 |
| S3 / GCS 桶 | 带版本控制的大规模存储 |

---

## 额外的删除防护

除回收站系统（层 A2）外，AcaClaw 还有防止数据丢失的额外控制：

| 控制 | 机制 |
|---------|-----------|
| **工具拒绝列表** | `@acaclaw/security` 阻止 `fs_delete`、`sessions_spawn`、`gateway` |
| **命令拒绝列表** | 阻止 `rm -rf`、`shred`、`chmod 777` 等 12 种模式 |
| **工作区限制** | `workspaceOnly: true` — 工具不能访问工作区外文件 |
| **沙箱隔离**（最高模式） | Docker 容器，根文件系统只读，仅挂载 `/workspace` |

即使删除命令绕过拒绝列表（例如新的命令形态），层 A 的备份插件也已在命令执行前复制了文件 — 且回收站系统会直接拦截 `rm` / `fs_delete` 操作。

---

## 保留与清理策略

### 默认保留

| 数据类型 | 保留 | 由谁控制 |
|-----------|-----------|---------------|
| 层 A1/A3 文件备份 | 30 天 | `plugins.acaclaw-backup.retentionDays` |
| 回收站文件 | 30 天 | `plugins.acaclaw-backup.trashRetentionDays` |
| A3 同步清单 | 永久（仅元数据） | 自动维护 |
| 层 B 工作区快照 | 按数量（3） | `plugins.acaclaw-backup.workspaceSnapshot.maxSnapshots` |
| 会话转写 | 30 天 | `session.maintenance.pruneAfter` |
| 会话重置归档 | 30 天 | `session.maintenance.resetArchiveRetention` |
| 审计日志 | 90 天 | `plugins.acaclaw-security.auditRetentionDays` |
| 配置备份 | 最近 5 个版本 | OpenClaw 内置（不可配置） |

### 存储预算

| 预算 | 默认 | 范围 |
|--------|---------|-------|
| 层 A1 + A3 文件备份（共享） | 10 GB | `maxStorageGB` |
| 回收站 | 5 GB | `trashMaxStorageGB` |
| 层 B 快照 | 20 GB | `workspaceSnapshot.maxStorageGB` |

### 用户何时可删除数据

用户拥有完全控制权。除基于保留期的自动修剪外，所有删除均由用户发起。

```bash
# Layer A: manage file backups
openclaw acaclaw-backup list data/results.csv        # List versions
openclaw acaclaw-backup restore data/results.csv     # Restore latest

# Trash: manage deleted files
openclaw acaclaw-backup list-trash                   # List trashed files
openclaw acaclaw-backup restore-trash data/old.csv   # Restore from trash
openclaw acaclaw-backup empty-trash                  # Permanently empty trash

# Layer B: manage snapshots (if enabled)
openclaw acaclaw-backup snapshot-list                # List snapshots
openclaw acaclaw-backup snapshot-delete <name>       # Delete a snapshot

# Manual cleanup
rm -rf ~/.acaclaw/backups/                           # Delete everything
```

### 长期归档

对需要长期保存的研究数据（基金要求、论文可复现性）：

| 策略 | 保留内容 | 离机？ |
|----------|------------------|:------------:|
| Git + 远程（`git push`） | 文本/代码版本历史 | 是 |
| `openclaw backup create` | 完整状态（会话、配置、凭据、工作区） | `.tar.gz` — 可复制到任意位置 |
| 外部工具（Time Machine、rsync、高校 NAS） | `~/.acaclaw/` 下一切 | 视工具而定 |
| 层 B 快照 | 某时间点的工作区 | 否（仅本地） |

---

## 数据流摘要

```
                    User's research files
                           │
            ┌──────────────┼──────────────┐
            │              │              │
     File modification  File deletion  System idle
     (write/edit/exec)  (rm/fs_delete)  (no active job)
            │              │              │
            ▼              ▼              ▼
  Layer A1: Versioning  A2: Trash    A3: Background Sync
  ├─ Skip-if-unchanged ├─ Move to   ├─ Wait for idle grace
  ├─ SHA-256 original   │  .trash/   ├─ Walk workspace
  ├─ Copy (or hardlink) ├─ Write     ├─ mtime+size check
  ├─ SHA-256 backup     │  metadata  ├─ Hash only if changed
  ├─ Verify match       ├─ Log to    ├─ Skip-if-unchanged
  ├─ Write metadata     │  audit     ├─ Copy (or hardlink)
  └─ ✓ Allow / ✗ Block  └─ File      ├─ Update manifest
            │              recoverable ├─ Pause if job arrives
            ▼              │           └─ Shares files/ with A1
    @acaclaw/security      ▼
    ├─ Check deny-list  @acaclaw/security
    ├─ Log to audit     ├─ Log deletion
    └─ ✓ Allow / ✗ Block└─ ✓ Allow (already in trash)
            │
            ▼
    OpenClaw exec layer
    └─ Execute tool
            │
            ▼
      File modified
```

---

## 配置参考

### 备份插件（`@acaclaw/backup`）

```jsonc
{
  "plugins": {
    "acaclaw-backup": {
      // --- Layer A1: Per-File Versioning (dedup-aware) ---

      // Where to store backups. Default: ~/.acaclaw/backups
      "backupDir": "~/.acaclaw/backups",

      // Days to keep file backups before pruning. Default: 30
      "retentionDays": 30,

      // Maximum storage for file backups in GB. Default: 10
      // (shared budget for A1 + A3 — they use the same files/ directory)
      "maxStorageGB": 10,

      // Hash algorithm for integrity checks. Default: sha256
      "checksumAlgorithm": "sha256",

      // Files to skip from backup. Default: ["*.tmp", "node_modules/", ".git/", "__pycache__/"]
      "excludePatterns": ["*.tmp", "node_modules/", ".git/", "__pycache__/"],

      // Create full snapshot before batch operations. Default: true
      "snapshotBeforeBatch": true,

      // Use hardlink deduplication for identical backups. Default: true
      // Falls back to full copies if backupDir is on a different filesystem.
      "hardlinkDedup": true,

      // --- Layer A2: Trash ---

      // Days to keep trashed files before permanent deletion. Default: 30
      "trashRetentionDays": 30,

      // Maximum trash storage in GB. Default: 5
      "trashMaxStorageGB": 5,

      // --- Layer A3: Background Sync (idle-only) ---

      // Enable background sync. Default: true
      "syncEnabled": true,

      // Seconds of idle before sync starts. Default: 60
      "syncIdleGraceSeconds": 60,

      // Minimum minutes between sync runs. Default: 10
      "syncMinIntervalMinutes": 10,

      // Patterns to exclude from sync (defaults to excludePatterns)
      "syncExcludePatterns": ["*.tmp", "node_modules/", ".git/", "__pycache__/"],

      // --- Layer B: Workspace Snapshot (default OFF) ---

      "workspaceSnapshot": {
        // Must be explicitly enabled. Default: false
        "enabled": false,

        // Maximum number of snapshots to keep. Default: 3
        "maxSnapshots": 3,

        // Maximum snapshot storage in GB. Default: 20
        "maxStorageGB": 20,

        // Patterns to exclude from snapshots
        "excludePatterns": ["*.tmp", "node_modules/", ".git/", "__pycache__/"]
      }
    }
  }
}
```

### 会话维护（OpenClaw）

```jsonc
{
  "session": {
    "maintenance": {
      // "warn" (report only) or "enforce" (apply cleanup). AcaClaw sets: "enforce"
      "mode": "enforce",

      // Delete sessions older than this. Default: 30d
      "pruneAfter": "30d",

      // Maximum session count. Default: 500
      "maxEntries": 500,

      // Rotate session store file at this size. Default: 10mb
      "rotateBytes": "10mb",

      // How long to keep .reset.* and .deleted.* archives. Default: 30d
      "resetArchiveRetention": "30d",

      // Hard disk budget (optional, unset by default)
      "maxDiskBytes": "5gb",

      // Target when over budget. Default: 80% of maxDiskBytes
      "highWaterBytes": "4gb"
    }
  }
}
```

---

## 对比：OpenClaw 与 AcaClaw 数据安全

| 保护 | OpenClaw | AcaClaw |
|-----------|:--------:|:-------:|
| 会话归档（重命名，不删除） | ✓ | ✓（继承） |
| 配置文件轮转（5 份备份） | ✓ | ✓（继承） |
| 工作区 git 自动初始化 | ✓ | ✓（继承） |
| 文件边界强制 | ✓ | ✓（继承） |
| Exec 审批体系 | ✓ | ✓（继承） |
| `.tar.gz` 完整备份 CLI | ✓ | ✓（继承） |
| 修改前文件备份（层 A1） | — | ✓（`@acaclaw/backup`） |
| 去重感知版本化（跳过 + 硬链接） | — | ✓（`@acaclaw/backup`） |
| SHA-256 完整性校验 | — | ✓（`@acaclaw/backup`） |
| 备份失败即阻止 | — | ✓（`@acaclaw/backup`） |
| 带元数据的按文件版本历史 | — | ✓（`@acaclaw/backup`） |
| 基于回收站的删除（层 A2） | — | ✓（`@acaclaw/backup`） |
| 手动编辑的定期同步（A3） | — | ✓（`@acaclaw/backup`） |
| 工作区快照（层 B） | — | ✓（可选，`@acaclaw/backup`） |
| 自然语言恢复 | — | ✓（`backup_restore` / `trash_restore` 工具） |
| 删除命令拒绝列表 | — | ✓（`@acaclaw/security`） |
| 危险工具拒绝列表 | — | ✓（`@acaclaw/security`） |
| 工作区限制（默认） | — | ✓（配置叠加） |
| 所有文件操作的审计轨迹 | — | ✓（`@acaclaw/security`） |
| 与 Git 兼容（二进制感知）设计 | — | ✓（独立存储、`.gitignore` 指引） |
| 可配置保留与存储预算 | 部分 | ✓（按层预算） |

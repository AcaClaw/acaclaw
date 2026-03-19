---
layout: page
title: Workspace
lang: en
permalink: /en/workspace/
---

> **Principle**: User-facing files are visible. Infrastructure files are hidden.

---

## Problem

OpenClaw's default workspace lives at `~/.openclaw/workspace` — inside a hidden dotfolder. This works for developers, but creates problems for academic users:

1. **Discoverability** — users can't find their files in a file manager without "show hidden files"
2. **`workspaceOnly` paradox** — when operations are confined to the workspace, users need to know where it is

AcaClaw separates user-facing files from infrastructure:

| Content | OpenClaw default | AcaClaw |
|---------|:-:|:-:|
| Workspace (user files) | `~/.openclaw/workspace` (hidden) | `~/AcaClaw/` (visible) |
| Config, sessions, logs | `~/.openclaw/` (hidden) | `~/.acaclaw/` (hidden) |
| Backups | — | `~/.acaclaw/backups/` (hidden) |
| Audit logs | — | `~/.acaclaw/audit/` (hidden) |

---

## Directory Layout

```
~/                                      # User's home directory
│
├── AcaClaw/                            # ← WORKSPACE — visible, user-facing
│   ├── .acaclaw/                       #   Project metadata (hidden from AI)
│   │   ├── workspace.json              #   Name, discipline, ID
│   │   └── .gitignore
│   │
│   ├── data/
│   │   ├── raw/                        #   Original data — never modified
│   │   └── processed/                  #   Analysis outputs
│   │
│   ├── documents/
│   │   ├── drafts/                     #   Manuscript drafts
│   │   └── final/                      #   Finalized documents
│   │
│   ├── figures/                        #   Generated plots
│   ├── references/                     #   Bibliography, PDFs
│   ├── notes/                          #   Research notes
│   ├── output/                         #   AI-generated outputs
│   └── README.md                       #   Auto-generated guide
│
└── .acaclaw/                           # ← INFRASTRUCTURE — hidden
    ├── backups/                        #   Versioned file backups
    │   └── AcaClaw-a1b2c3d4e5f6/       #   Per-workspace backups
    ├── audit/                          #   Tool call audit logs
    ├── miniforge3/                     #   Conda installation
    └── envs/                           #   Environment metadata
```

---

## Access Rules

| Directory | AI tools | AcaClaw plugins | User |
|-----------|:-:|:-:|:-:|
| `~/AcaClaw/` | Read + Write | Read + Write | Read + Write |
| `~/AcaClaw/data/raw/` | Read only | Read only | Read + Write |
| `~/AcaClaw/.acaclaw/` | No access | Read + Write | Read + Write |
| `~/.openclaw/` | No access | No access | Read + Write |
| `~/.acaclaw/backups/` | No access | Write (backup plugin) | Read (restore) |
| `~/.acaclaw/audit/` | No access | Write (security plugin) | Read |
| Everything else | No access | No access | Full access |

### How access is enforced

| Boundary | Mechanism |
|----------|-----------|
| AI confined to workspace | `tools.fs.workspaceOnly: true` + `resolveSandboxPath()` |
| AI cannot escape via symlinks | `assertNoPathAliasEscape()` + realpath resolution |
| AI cannot escape via `..` | Relative path rejection |
| `data/raw/` read-only for AI | LLM system prompt instruction |
| `.acaclaw/` hidden from AI | `IGNORE_PATTERNS` in workspace tree scan |
| Backups outside workspace | Stored at `~/.acaclaw/backups/` |

---

## Workspace Plugin (`@acaclaw/workspace`)

The workspace plugin manages project structure, file tree scanning, and LLM context injection.

```
@acaclaw/workspace plugin
│
├── before_prompt_build hook (priority 150)
│   └── Scans workspace file tree (max 2 levels)
│       Injects into LLM system prompt:
│       - Working directory path
│       - Project name and discipline
│       - File tree with sizes
│       - Workspace boundary rules
│
├── workspace_info tool
│   └── Show project metadata, file tree, statistics
│
├── acaclaw.workspace.getWorkdir gateway method
│   └── Returns resolved workdir for a given agent
│
├── acaclaw.workspace.setWorkdir gateway method
│   └── Updates workdir for a given agent (persists to config)
│
├── acaclaw-workspace init CLI command
│   └── Create workspace with scaffold directories
│
├── acaclaw-workspace info CLI command
│   └── Display workspace metadata
│
└── acaclaw-workspace tree CLI command
    └── Print workspace file tree
```

---

## Workspace Config

`~/AcaClaw/.acaclaw/workspace.json`:

```json
{
  "name": "AcaClaw",
  "discipline": "biology",
  "createdAt": "2026-03-12T14:30:00Z",
  "workspaceId": "AcaClaw-a1b2c3d4e5f6"
}
```

---

## Backup Organization

Backups are organized per workspace using the stable workspace ID:

```
~/.acaclaw/backups/
├── AcaClaw-a1b2c3d4e5f6/          # Workspace-specific backups
│   └── files/
│       ├── 2026-03-12/
│       │   ├── 14-30-22.experiment-results.csv
│       │   └── 14-30-22.experiment-results.csv.meta.json
│       └── 2026-03-11/
│           └── ...
│
├── MyProject-f6e5d4c3b2a1/        # Another workspace
│   └── files/
│       └── ...
│
└── _global/                        # Legacy backups
    └── files/
        └── ...
```

### Backup metadata

```json
{
  "originalPath": "/home/user/AcaClaw/data/processed/results.csv",
  "workspaceRelativePath": "data/processed/results.csv",
  "workspaceId": "AcaClaw-a1b2c3d4e5f6",
  "backupTime": "2026-03-12T14:30:22Z",
  "operation": "modify",
  "toolCall": "bash",
  "originalChecksum": "sha256:...",
  "backupChecksum": "sha256:..."
}
```

---

## Working Directory (Workdir)

The **working directory** is the folder where agents read, write, and generate files. It is displayed in the **top-right** of the Chat view so users always know which directory is active.

### Visibility

The Chat header shows the current workdir as a path badge:

```
┌──────────────────────────────────────────────────┐
│  Chat                           📁 ~/AcaClaw     │
│                                    [Change]       │
├──────────────────────────────────────────────────┤
│  [ General ] [ 🧬 Dr. Gene ] [ 🤖 Dr. Turing ]  │
│  ...                                              │
```

- Each agent tab shows the workdir of the **currently active agent**
- The General tab uses the global default (`agents.defaults.workspace`)
- Per-agent tabs show the agent's own workspace (e.g. `~/AcaClaw/agents/biologist`)

### Changing the workdir

Users can change the workdir from the Chat view:

1. Click the path badge or **Change** button in the top-right
2. Enter a new absolute path in the dialog
3. The change is persisted via the gateway and takes effect immediately

The workdir can also be changed via CLI:

```bash
# Change global default
openclaw config set agents.defaults.workspace ~/my-research

# Change a specific agent's workspace
openclaw config set agents.list.0.workspace ~/my-research/biology
```

### Prompt injection

The workdir is injected into **every LLM prompt** via the workspace plugin's `before_prompt_build` hook. The agent always knows its working directory:

```
## Workspace
Working directory: /home/user/AcaClaw/agents/biologist
Project: biologist
Files: 42 (1.3 MB)

Directory structure:
  data/
    raw/
    processed/
  ...

IMPORTANT: All file operations are restricted to this workspace directory.
```

This ensures the agent:
- Knows where to read and write files
- Cannot operate outside the workspace boundary
- Sees the current file tree for context

### Gateway methods

| Method | Description |
|--------|-------------|
| `acaclaw.workspace.getWorkdir` | Returns the resolved workdir path for a given agent |
| `acaclaw.workspace.setWorkdir` | Updates the workdir for a given agent (persists to config) |

### Data flow

```
User clicks "Change" in Chat UI
  → gateway.call("acaclaw.workspace.setWorkdir", { agentId, path })
  → Workspace plugin validates path, updates config
  → UI updates path badge
  → Next LLM prompt picks up new workdir via before_prompt_build hook
```

---

## Multiple Workspaces

Users can point AcaClaw to any directory:

```bash
openclaw config set agents.defaults.workspace ~/my-research
```

Each workspace gets:
- Its own `.acaclaw/workspace.json` with a unique stable ID
- Its own backup directory at `~/.acaclaw/backups/<workspaceId>/`
- Its own LLM context injection (file tree, discipline, boundaries)

---

## Security Boundary

| Policy | Mechanism |
|--------|-----------|
| **File confinement** | `tools.fs.workspaceOnly: true` |
| **Exec confinement** | Exec tool CWD defaults to workspace root |
| **Tool deny-list** | `tools.deny: [gateway, cron, ...]` |
| **Command deny-list** | 15 dangerous command patterns |
| **Network allowlist** | Academic domains only |
| **Pre-modification backup** | Backup plugin (priority 200) |
| **Audit trail** | Every tool call logged |

**Enforcement chain** (in priority order):
1. **Backup** (priority 200) — copies original file before any change
2. **Security** (priority 100) — denies dangerous tools/commands/domains
3. **OpenClaw core** — enforces `workspaceOnly` boundary

In Maximum mode, Docker sandbox adds a third layer: the container only mounts the workspace with `rw` access.

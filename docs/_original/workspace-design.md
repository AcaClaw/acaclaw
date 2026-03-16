# AcaClaw Workspace Design

> **Principle**: User-facing files are visible. Infrastructure files are hidden.

---

## Table of Contents

- [Problem Statement](#problem-statement)
- [Directory Layout](#directory-layout)
- [Why the Workspace Is Visible](#why-the-workspace-is-visible)
- [How OpenClaw Resolves Workspaces](#how-openclaw-resolves-workspaces)
- [How AcaClaw Overrides the Default](#how-acaclaw-overrides-the-default)
- [Security Boundary](#security-boundary)
- [Workspace Scaffold](#workspace-scaffold)
- [Workspace Metadata](#workspace-metadata)
- [LLM Context Injection](#llm-context-injection)
- [Backup Integration](#backup-integration)
- [Multi-Workspace Support](#multi-workspace-support)
- [Comparison with OpenClaw Default](#comparison-with-openclaw-default)

---

## Problem Statement

OpenClaw's default workspace lives at `~/.openclaw/workspace` — inside a hidden dotfolder. This works for developers who understand dotfile conventions, but creates two problems for academic users:

1. **Discoverability** — users can't find their files in a file manager without enabling "show hidden files"
2. **`workspaceOnly` paradox** — when `workspaceOnly: true` confines all operations to the workspace, users need to know where that workspace is to put data into it and retrieve results

AcaClaw solves this by separating user-facing files (workspace) from infrastructure files (config, backups, audit logs):

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
│   │   ├── workspace.json              #   Name, discipline, ID, creation date
│   │   └── .gitignore                  #   Excludes metadata from version control
│   │
│   ├── data/
│   │   ├── raw/                        #   Original data — never modified by AI
│   │   └── processed/                  #   Analysis outputs, cleaned data
│   │
│   ├── documents/
│   │   ├── drafts/                     #   Manuscript and report drafts
│   │   └── final/                      #   Finalized documents for submission
│   │
│   ├── figures/                        #   Generated plots and visualizations
│   ├── references/                     #   Bibliography (.bib, .ris), downloaded PDFs
│   ├── notes/                          #   Research notes, meeting minutes
│   ├── output/                         #   AI-generated outputs (summaries, citations)
│   └── README.md                       #   Auto-generated workspace guide
│
└── .acaclaw/                           # ← INFRASTRUCTURE — hidden, system-managed
    ├── backups/
    │   └── AcaClaw-a1b2c3d4e5f6/       #   Per-workspace backups (by stable ID)
    │       └── files/
    │           └── 2026-03-14/         #   Daily backup directories
    ├── audit/
    │   └── 2026-03-14.jsonl            #   Tool call audit log
    ├── miniforge3/                     #   Conda installation (if installed)
    └── envs/                           #   Environment metadata
```

### Access Rules Reference

Every directory has explicit rules for who can read and write. Plugin and skill code must follow these.

| Directory | AI tools | AcaClaw plugins | User | Notes |
|-----------|:-:|:-:|:-:|---|
| `~/AcaClaw/` | Read + Write | Read + Write (via tool API) | Read + Write | `workspaceOnly` boundary |
| `~/AcaClaw/data/raw/` | Read only | Read only | Read + Write | Convention enforced via LLM prompt |
| `~/AcaClaw/.acaclaw/` | No access | Read + Write (metadata) | Read + Write | Excluded from AI file tree scan |
| `~/.openclaw/` | No access | **No access** | Read + Write | Owned by OpenClaw — never write here |
| `~/.acaclaw/backups/` | No access | Write (backup plugin) | Read (restore) | Outside workspace boundary |
| `~/.acaclaw/audit/` | No access | Write (security plugin) | Read | Outside workspace boundary |
| `~/.acaclaw/miniforge3/` | No access | No access | Read | Managed by installer only |
| Everything else | No access | No access | Full access | Blocked by `workspaceOnly: true` |

**Enforcement mechanisms:**

| Rule | How it's enforced |
|------|------------------|
| AI confined to `~/AcaClaw/` | OpenClaw `tools.fs.workspaceOnly: true` + `resolveSandboxPath()` |
| AI cannot follow symlinks outside | OpenClaw `assertNoPathAliasEscape()` (realpath resolution) |
| AI cannot use `../` to escape | OpenClaw relative path rejection in sandbox path resolver |
| `data/raw/` is read-only for AI | LLM system prompt instruction (soft convention, not kernel-enforced) |
| `.acaclaw/` hidden from AI | `IGNORE_PATTERNS` array in workspace tree scanner |
| Backups unreachable by AI | `~/.acaclaw/backups/` is outside the `workspaceOnly` boundary |
| Docker sandbox (Maximum mode) | Container mounts only `~/AcaClaw/` — kernel-level enforcement |

**Rules for plugin developers:**

1. **Never write to `~/.openclaw/`** — it belongs to OpenClaw core. AcaClaw plugins have no business there.
2. **Never bypass the tool API to write workspace files** — always go through OpenClaw's tool execution so that `workspaceOnly` checks and backup hooks run.
3. **Write AcaClaw infrastructure to `~/.acaclaw/` only** — backups, audit logs, environment metadata.
4. **Respect `data/raw/`** — treat it as read-only in all plugin code. Results go to `data/processed/`.
5. **Never store credentials in `~/.acaclaw/`** — credentials belong in `~/.openclaw/credentials/` (managed by OpenClaw).

### Why this split matters

| Concern | Workspace (`~/AcaClaw/`) | Infrastructure (`~/.acaclaw/`) |
|---------|:-:|:-:|
| User needs to find and open files | Yes | No |
| Visible in file manager by default | Yes | No |
| AI can read/write files here | Yes (confined here) | No (outside boundary) |
| Survives workspace deletion | — | Yes |
| Contains credentials or secrets | No | No (credentials in `~/.openclaw/`) |
| Backed up by AcaClaw | Yes (source) | No (destination) |

---

## Why the Workspace Is Visible

### The user journey

```
1. User installs AcaClaw
   └── Installer creates ~/AcaClaw/ with scaffold directories

2. User wants to analyze data
   └── Opens file manager → sees "AcaClaw" folder → drops CSV into data/raw/

3. User asks AI to analyze the data
   └── AI sees data/raw/experiment.csv in workspace file tree
   └── AI writes results to data/processed/results.csv

4. User wants the results
   └── Opens file manager → AcaClaw/ → data/processed/ → results.csv ✓
```

If the workspace were hidden at `~/.openclaw/workspace`:

```
2. User wants to analyze data
   └── Opens file manager → doesn't see any OpenClaw folder
   └── Needs to know: enable "show hidden files" → navigate to .openclaw → workspace
   └── Or: use terminal: cp data.csv ~/.openclaw/workspace/data/raw/
   └── ❌ Non-technical users are lost here
```

### Design rationale

- **File managers hide dotfolders by default** on Linux, macOS, and Windows
- **The workspace is the user's primary interaction point** — they put data in and take results out
- **Infrastructure belongs hidden** — backups, audit logs, Conda installations are system details
- **`~/AcaClaw/` is self-documenting** — the folder name tells the user what it is

---

## How OpenClaw Resolves Workspaces

OpenClaw resolves the workspace directory at gateway startup in this order:

| Priority | Source | Example |
|:-:|--------|---------|
| 1 | Per-agent config: `agents.list[i].workspace` | `"workspace": "~/research"` |
| 2 | Default agent config: `agents.defaults.workspace` | `"workspace": "~/AcaClaw"` |
| 3 | Profile suffix: `OPENCLAW_PROFILE` env var | `~/.openclaw/workspace-work` |
| 4 | Hardcoded fallback | `~/.openclaw/workspace` |

Resolution code lives in `src/agents/agent-scope.ts` (`resolveAgentWorkspaceDir`) and `src/agents/workspace.ts` (`resolveDefaultAgentWorkspaceDir`).

### Key functions

| Function | Role |
|----------|------|
| `resolveDefaultAgentWorkspaceDir()` | Returns `~/.openclaw/workspace` (or `~/.openclaw/workspace-{profile}`) |
| `resolveAgentWorkspaceDir(cfg, agentId)` | Checks agent-specific → default → fallback |
| `resolveStateDir()` | Returns `~/.openclaw/` (the hidden state root) |

---

## How AcaClaw Overrides the Default

AcaClaw sets `agents.defaults.workspace` in both config profiles:

**Standard mode** (`config/openclaw-defaults.json`):

```jsonc
{
  "agents": {
    "defaults": {
      "workspace": "~/AcaClaw"
    }
  }
}
```

**Maximum mode** (`config/openclaw-maximum.json`):

```jsonc
{
  "agents": {
    "defaults": {
      "workspace": "~/AcaClaw",
      "sandbox": {
        "mode": "all",
        "scope": "session",
        "workspaceAccess": "rw"
      }
    }
  }
}
```

The installer writes this config and creates `~/AcaClaw/` with scaffold directories during setup.

Users can change the workspace path at any time:

```bash
openclaw config set agents.defaults.workspace ~/my-research
```

---

## Security Boundary

When `workspaceOnly: true` (AcaClaw's default), all file operations are confined to the workspace root. This is why workspace visibility matters — the boundary must be a folder the user can actually find.

### Enforcement layers

```
Tool call: write("data/processed/results.csv", content)
   │
   ├── Is target path inside ~/AcaClaw/?
   │   ├── YES → proceed to backup → allow write
   │   └── NO → BLOCKED (resolveSandboxPath rejects)
   │
   ├── Path traversal? (../../etc/passwd)
   │   └── BLOCKED (relative path check rejects "..")
   │
   ├── Symlink escape? (symlink pointing outside workspace)
   │   └── BLOCKED (assertNoPathAliasEscape resolves realpath)
   │
   └── In Maximum mode (Docker):
       └── Container mount boundary: only ~/AcaClaw → /workspace (rw)
           └── Kernel-level enforcement — no path tricks can escape
```

### What the user sees

| Action | Standard mode | Maximum mode |
|--------|:-:|:-:|
| AI writes to `~/AcaClaw/data/processed/` | Allowed | Allowed (inside container mount) |
| AI reads `~/AcaClaw/data/raw/experiment.csv` | Allowed | Allowed (inside container mount) |
| AI writes to `~/Documents/` | Blocked by `workspaceOnly` | Blocked by container mount |
| AI reads `~/.ssh/id_rsa` | Blocked by `workspaceOnly` | Blocked by container mount |
| AI runs `rm -rf ~/` | Blocked by command deny-list | Blocked by container isolation |

---

## Workspace Scaffold

The `@acaclaw/workspace` plugin creates a structured project layout on initialization:

```bash
openclaw acaclaw-workspace init                        # Default: ~/AcaClaw
openclaw acaclaw-workspace init ~/my-research          # Custom path
openclaw acaclaw-workspace init --discipline biology   # Biology environment
openclaw acaclaw-workspace init --no-scaffold          # Skip directory creation
```

### Standard scaffold directories

| Directory | Purpose | AI behavior |
|-----------|---------|-------------|
| `data/raw/` | Original data files | Read-only by convention (LLM system prompt) |
| `data/processed/` | Analysis outputs, cleaned data | AI writes results here |
| `documents/drafts/` | Manuscript and report working copies | AI reads/writes |
| `documents/final/` | Finalized documents for submission | AI writes on user request |
| `figures/` | Plots and visualizations | AI writes generated figures |
| `references/` | Bibliography files, downloaded PDFs | AI writes search results |
| `notes/` | Research notes, meeting minutes | AI reads/writes |
| `output/` | AI-specific outputs (summaries, etc.) | AI writes |

### Why these directories

The structure mirrors how researchers already organize work:

- **Raw data separation** — `data/raw/` is sacrosanct. The AI is instructed never to modify files here. All results go to `data/processed/`. This is the single most important safety convention in AcaClaw.
- **Draft/final split** — researchers iterate on manuscripts. Separating drafts from finals prevents accidental overwrites of submission-ready documents.
- **Dedicated figures directory** — publication workflows require figures as standalone files. Having them in one place simplifies LaTeX/Word integration.
- **References directory** — downloaded papers and `.bib` files accumulate. A dedicated directory keeps them from cluttering the workspace root.

---

## Workspace Metadata

Each workspace stores project metadata at `.acaclaw/workspace.json`:

```jsonc
{
  "name": "My Research",               // Project display name
  "discipline": "biology",             // Maps to Conda environment
  "createdAt": "2026-03-14T10:00:00Z", // Initialization timestamp
  "workspaceId": "AcaClaw-a1b2c3d4e5f6" // Stable ID for backup+audit linking
}
```

### Workspace ID

Generated by hashing the absolute workspace path (`SHA-256`, truncated to 12 hex chars), prefixed with the directory name:

```
~/AcaClaw → AcaClaw-a1b2c3d4e5f6
~/my-research → my_research-f6e5d4c3b2a1
```

The ID is:
- **Stable** — same path always produces same ID
- **Unique** — SHA-256 collision is effectively impossible
- **Readable** — directory name prefix makes backup folders human-identifiable

Used by the backup plugin to organize backups per workspace and by audit logging to correlate events.

### Metadata visibility

| Audience | Sees `.acaclaw/workspace.json`? |
|----------|:-:|
| User (file manager) | Hidden (dotfolder) |
| AI (workspace file tree scan) | Excluded (in `IGNORE_PATTERNS`) |
| Git (version control) | Excluded (`.acaclaw/.gitignore` contains `*`) |
| Backup plugin | Reads workspace ID from it |

---

## LLM Context Injection

The `@acaclaw/workspace` plugin injects workspace context into every LLM prompt via the `before_prompt_build` hook (priority 150):

```
## Workspace
Working directory: /home/user/AcaClaw
Project: My Research
Discipline: biology

Files:
  data/
    raw/
      experiment.csv         (2.4 MB)
      measurements.xlsx      (156 KB)
    processed/
      cleaned-data.csv       (1.1 MB)
  documents/
    drafts/
      manuscript-v3.md       (34 KB)
  figures/
    figure1-boxplot.png      (89 KB)

IMPORTANT:
- All file operations are confined to this workspace.
- Never modify files in data/raw/ — write results to data/processed/.
- Use relative paths when referencing workspace files.
```

This ensures:
- The AI knows what files exist and their sizes
- The AI understands the workspace boundary
- The AI respects the raw data convention
- File tree is scanned at max 2 levels deep (configurable) to avoid prompt bloat

---

## Backup Integration

The `@acaclaw/backup` plugin uses the workspace ID to organize per-workspace backups:

```
~/.acaclaw/backups/
├── AcaClaw-a1b2c3d4e5f6/          # Workspace: ~/AcaClaw
│   └── files/
│       └── 2026-03-14/
│           ├── 10-30-22.results.csv
│           └── 10-30-22.results.csv.meta.json
│
├── my_research-f6e5d4c3b2a1/      # Workspace: ~/my-research
│   └── files/
│       └── ...
│
└── _global/                        # Pre-workspace or unconfigured backups
    └── files/
        └── ...
```

Each backup metadata file records:
- `originalPath` — absolute path at time of backup
- `workspaceRelativePath` — path relative to workspace root (portable)
- `workspaceId` — links backup to source workspace
- `sha256` — checksum of the original file before modification

Backups live **outside** the workspace at `~/.acaclaw/backups/` so they:
- Survive workspace deletion
- Cannot be modified by the AI (outside `workspaceOnly` boundary)
- Are not scanned into the LLM file tree

---

## Multi-Workspace Support

Users can create multiple workspaces for different projects:

```bash
# Create workspaces for different projects
openclaw acaclaw-workspace init ~/AcaClaw --name "General" --discipline general
openclaw acaclaw-workspace init ~/crispr-study --name "CRISPR Study" --discipline biology
openclaw acaclaw-workspace init ~/protein-sim --name "Protein Sim" --discipline chemistry

# Switch the active workspace
openclaw config set agents.defaults.workspace ~/crispr-study
```

### Per-agent workspaces

OpenClaw supports multiple agents, each with its own workspace:

```jsonc
{
  "agents": {
    "defaults": {
      "workspace": "~/AcaClaw"
    },
    "list": [
      {
        "id": "bio",
        "workspace": "~/crispr-study"
      },
      {
        "id": "chem",
        "workspace": "~/protein-sim"
      }
    ]
  }
}
```

Each agent's workspace is independently:
- Confined by `workspaceOnly` (if enabled)
- Backed up to its own directory under `~/.acaclaw/backups/{workspaceId}/`
- Scanned for LLM context injection

### Workspace isolation

| Property | Behavior |
|----------|----------|
| File access | Each agent can only access its own workspace (when `workspaceOnly: true`) |
| Backups | Organized by workspace ID — no cross-contamination |
| Audit log | Shared (single log at `~/.acaclaw/audit/`) — events tagged with workspace ID |
| Conda environment | Shared (Conda envs are system-level) — discipline metadata in workspace config |

---

## Comparison with OpenClaw Default

| Feature | OpenClaw default | AcaClaw |
|---------|:-:|:-:|
| Workspace path | `~/.openclaw/workspace` | `~/AcaClaw/` |
| Visible in file manager | No (hidden dotfolder) | Yes |
| Project scaffold | None (empty directory) | 8 standard research directories |
| Workspace metadata | None | `.acaclaw/workspace.json` |
| LLM file tree injection | No | Yes (plugin hook) |
| Raw data protection | No | Convention + LLM system prompt |
| Backup per workspace | No | Yes (stable workspace ID) |
| `workspaceOnly` default | `false` (unrestricted) | `true` (confined) |
| Multiple workspaces | Supported (per-agent config) | Supported + CLI tooling |
| Docker sandbox mount | Mounts whatever workspace is configured | Mounts `~/AcaClaw/` only |

### Why AcaClaw changes the default

OpenClaw is infrastructure for developers. AcaClaw is a product for researchers. The workspace design reflects this:

- **Developers** already have project directories and know how to configure tools. A hidden state directory is expected.
- **Researchers** need a single, obvious folder where their files live. They shouldn't need to know about dotfolders, config files, or terminal commands to find their analysis results.

The visible workspace at `~/AcaClaw/` combined with `workspaceOnly: true` creates a self-contained, discoverable, and safe working environment — all operations happen in one visible folder, nothing outside is touched, and everything is backed up before modification.

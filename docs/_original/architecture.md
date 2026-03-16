# AcaClaw Architecture

> **Design Principle**: AcaClaw is a distribution, not a fork. Every customization lives in OpenClaw's extension points — skills, plugins, configuration, and environment. Zero source code modifications. Users should never need to touch a terminal.

---

## Table of Contents

- [Design Philosophy](#design-philosophy)
  - [Four Core Purposes](#four-core-purposes)
  - [Core Principles](#core-principles)
  - [The Ubuntu Analogy](#the-ubuntu-analogy)
- [Layer Model](#layer-model)
- [The "One Best" Principle](#the-one-best-principle)
- [Workspace Architecture](#workspace-architecture)
  - [Workspace File Tree](#workspace-file-tree)
  - [Workspace Plugin](#workspace-plugin-acaclawworkspace)
  - [Workspace Backup Policy](#workspace-backup-policy)
  - [Workspace Security Policy](#workspace-security-policy)
- [Data Safety Architecture](#data-safety-architecture)
- [User Experience Architecture](#user-experience-architecture)
- [Component Architecture](#component-architecture)
- [Skill Architecture](#skill-architecture)
  - [Contributor Attribution Model](#contributor-attribution-model)
  - [AcaClaw Hub](#acaclaw-hub-acaclawcomhub)
  - [Publishing Workflow](#publishing-workflow)
  - [Quality Guarantee](#quality-guarantee)
- [Security Architecture](#security-architecture)
- [Environment Architecture](#environment-architecture)
  - [Environment Compatibility Rules](#environment-compatibility-rules)
- [Compatibility & Upgrade System](#compatibility--upgrade-system)
- [Patch Record System](#patch-record-system)
- [Distribution Packaging](#distribution-packaging)
- [Integration Points with OpenClaw](#integration-points-with-openclaw)
- [Design Decisions & Rationale](#design-decisions--rationale)

---

## Design Philosophy

### Target Users

AcaClaw is designed for **scientists who are not software engineers**: chemists, physicists, biologists, medical researchers, and students. These users:

- Do not know what a terminal, Docker, or LaTeX is — and shouldn't have to
- Think in terms of "analyze my data", "find papers about X", "format this for Nature"
- Have irreplaceable data (experimental results, years of notes) that must never be lost
- Need tools that work, not tools they need to configure

Every design decision must pass this test: **"Would a biology grad student who has never opened a terminal be able to use this?"**

### Four Core Purposes

AcaClaw exists for four reasons. Every architectural decision traces back to one or more of these:

| # | Purpose | Architectural expression |
|---|---------|-------------------------|
| **1** | **Pre-ship academic skills** | One install gives researchers paper search, data analysis, citation management, figure generation — all pre-configured. No hunting for tools, no terminal, no configuration. |
| **2** | **Curate and contribute high-quality skills** | Every skill is built by a team (creator, tester, debugger, reviewer, maintainer), tested rigorously, and published to ClawHub. Individual contributors are credited by name and role. Quality comes from teamwork. |
| **3** | **Keep all skills environment-compatible** | Each discipline gets a self-contained Conda environment (e.g. `acaclaw-bio`) that includes all base packages plus discipline-specific ones. Dependencies are resolved at the distribution level. The active environment is auto-detected and injected into the LLM context so the AI knows what packages are available without reinstalling. |
| **4** | **Keep data safe** | Every file is automatically backed up before modification. Versioned snapshots, one-click restore, configurable retention. Research data is irreplaceable — the architecture ensures it is protected. |

These four purposes are the **essence of AcaClaw**. The Core Principles below are implementation strategies that serve them.

### Core Principles

1. **Non-invasive**: Never modify OpenClaw source code. Work exclusively through:
   - OpenClaw skill system (SKILL.md files)
   - OpenClaw plugin SDK (`OpenClawPluginApi`)
   - OpenClaw configuration (`openclaw.json`)
   - Environment setup (system packages, Conda, pip)

2. **One best** *(serves Purpose 1)*: For each capability, ship exactly one tool — the best one. Not five PDF libraries. Not three plotting packages. One. Pre-configured. Works out of the box.

3. **Data is sacred** *(serves Purpose 4)*: Every file modification is preceded by automatic backup. Versioned. Restorable. No exceptions. See [Data Safety Architecture](#data-safety-architecture).

4. **Zero-knowledge UX** *(serves Purpose 1)*: Users should never encounter "install X dependency", "run this command", or "edit this config file". One click to install. One click to start. Natural language to use.

5. **Layered independence**: AcaClaw sits ON TOP of OpenClaw, never below. OpenClaw can be upgraded independently. If AcaClaw is removed, OpenClaw still works.

6. **Security-first** *(serves Purpose 4)*: Stricter defaults than upstream. Workspace-restricted by default, Docker sandbox optional. Audit logging. No silent data exfiltration.

7. **Community-aligned** *(serves Purpose 2)*: MIT license. Full attribution. ClawHub-compatible. No vendor lock-in.

8. **Contribute, don't diverge** *(serves Purpose 2)*: Every skill AcaClaw creates is published to ClawHub — the official OpenClaw community hub. We never maintain a parallel ecosystem. Individual contributors are credited by name and role on every skill. Quality comes from people, and people deserve recognition.

9. **Environment compatibility** *(serves Purpose 3)*: Every pre-shipped skill is tested together in a single curated environment. We pin compatible versions, resolve dependency conflicts at the distribution level, and guarantee that all AcaClaw skills work side-by-side without breaking each other.

### The Ubuntu Analogy

| Linux Ecosystem | AcaClaw Ecosystem |
|---|---|
| Linux Kernel | OpenClaw (gateway, agent, CLI, plugin SDK) |
| Ubuntu Desktop | AcaClaw (curated distribution + GUI) |
| apt packages | ClawHub skills + AcaClaw skills |
| apt dependency resolution | AcaClaw environment compatibility testing |
| GNOME (GUI) | AcaClaw Desktop (planned) |
| Ubuntu Security (AppArmor) | AcaClaw security plugin + sandbox-by-default |
| Ubuntu LTS | AcaClaw compatibility-tested OpenClaw versions |

---

## Layer Model

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 6: AcaClaw Desktop GUI (planned)                      │
│  Research-focused interface — no terminal needed             │
├─────────────────────────────────────────────────────────────┤
│  Layer 5: User Workspace                                     │
│  User-installed ClawHub skills, personal data, projects      │
├─────────────────────────────────────────────────────────────┤
│  Layer 4: Curated Academic Skills (from ClawHub + bundled)    │
│  Installed via clawhub CLI, organized in acaclaw-skills repo │
├─────────────────────────────────────────────────────────────┤
│  Layer 3: AcaClaw Plugins                                    │
│  @acaclaw/workspace — project structure, file tree, context  │
│  @acaclaw/security — workspace policy, audit, network allow  │
│  @acaclaw/backup — automatic file versioning & restore       │
│  @acaclaw/academic-env — environment detection & paths       │
│  @acaclaw/compat-checker — upgrade compatibility validation  │
├─────────────────────────────────────────────────────────────┤
│  Layer 2: AcaClaw Environment                                │
│  Conda (Miniforge) + Scientific Python + Pandoc + PDF tools  │
├─────────────────────────────────────────────────────────────┤
│  Layer 1: OpenClaw (Upstream, Unmodified)                     │
│  Gateway · Agent · Plugin SDK · Skill System · CLI           │
├─────────────────────────────────────────────────────────────┤
│  Layer 0: Operating System / Container Runtime               │
│  Windows · macOS · Linux                                     │
└─────────────────────────────────────────────────────────────┘
```

### Layer Interaction Rules

| Rule | Description |
|---|---|
| **Upward dependency only** | Each layer depends only on layers below it |
| **No downward coupling** | OpenClaw (Layer 1) has no knowledge of AcaClaw |
| **Skill precedence** | User skills (L5) override curated skills (L4), which override OpenClaw bundled skills |
| **Plugin registration** | AcaClaw plugins register via the standard `OpenClawPluginApi` |
| **Config overlay** | AcaClaw writes to `openclaw.json` using `openclaw config set`; never patches config files directly |
| **GUI wraps CLI** | The GUI (L6) calls OpenClaw/AcaClaw commands underneath; no separate backend |

---

## The "One Best" Principle

AcaClaw does NOT ship "all the tools". It ships **one best tool per job**, pre-configured and tested together.

### Selection Criteria

For each capability, we evaluate candidates against:

| Criterion | Weight | Description |
|---|---|---|
| **Accuracy / Quality** | Critical | Must produce correct, publication-grade results |
| **Ease of use (for AI)** | High | The AI agent must be able to operate it reliably via tool calls |
| **License** | High | MIT/BSD/Apache preferred; GPL/AGPL acceptable as separate process |
| **Maintenance** | High | Actively maintained, responsive to bugs |
| **Size** | Medium | Smaller install footprint preferred |
| **Community** | Medium | Widely used in academia, good documentation |

### Current Selections

| Job | Selected Tool | Why this one |
|---|---|---|
| **Data analysis** | Pandas + SciPy | De facto standard in all scientific fields |
| **Visualization** | Matplotlib | Most widely used in publications; all journals accept it |
| **Statistics** | SciPy.stats + Statsmodels | Comprehensive; covers most academic statistical tests |
| **PDF reading** | PyMuPDF (fitz) | Fastest, best text extraction quality |
| **Document conversion** | Pandoc | Only tool that handles Word ↔ PDF ↔ journal templates reliably |
| **Reference management** | Citation.js + CSL | 10,000+ citation styles; no server required |
| **Paper search API** | Semantic Scholar API | Best free academic API; covers all major databases |
| **Math / Symbolic** | SymPy | Pure Python; no external dependencies |
| **Notebook** | JupyterLab | Universal standard for interactive science |

### What We Deliberately Exclude

| Excluded | Reason |
|---|---|
| Multiple plotting libraries (Seaborn, Plotly, Bokeh, Altair) at install time | One (Matplotlib) is enough; users can add others via ClawHub if needed |
| Deep learning frameworks (PyTorch, TensorFlow) in base install | Most researchers don't need them; available as optional profile |
| LaTeX (TeX Live) in base install | ~4 GB; most users just want Word/PDF output. Pandoc handles conversion. Available as optional add-on |
| Multiple PDF libraries | One best (PyMuPDF) is enough |
| IDE/editor tools | Scientists don't need code editors; AcaClaw handles code internally |

### Adding More Tools

Users who need additional tools can install them via:
1. **ClawHub**: `clawhub install <skill>` (from GUI or command)
2. **Conda**: `conda install -n acaclaw <package>` (advanced users)
3. **Domain profiles**: `acaclaw setup --profile bio` adds biology-specific tools

---

## Workspace Architecture

> **All file operations happen inside the workspace. Nothing outside is touched.**

AcaClaw uses OpenClaw's workspace system (`agents.defaults.workspace` + `tools.fs.workspaceOnly`) to confine all AI operations to a single, well-structured directory. Backups, security audit, and environment metadata live *outside* the workspace at `~/.acaclaw/`, so they survive workspace changes.

### Directory Map & Access Rules

AcaClaw uses three directories. Each has strict access rules that plugin and skill code must follow:

```
~/                                      # User's home directory
│
├── AcaClaw/                            # USER WORKSPACE — visible
│   ├── data/raw/                       #   Read-only by convention (AI never writes here)
│   ├── data/processed/                 #   AI writes analysis results here
│   ├── documents/                      #   Manuscripts, reports
│   ├── figures/                        #   Publication-ready plots
│   ├── references/                     #   Papers, .bib files
│   ├── notes/                          #   Research notes
│   ├── output/                         #   AI-generated outputs
│   └── .acaclaw/workspace.json         #   Project metadata (hidden in file manager)
│
├── .openclaw/                          # OPENCLAW STATE — hidden, managed by OpenClaw
│   ├── openclaw.json                   #   Config file
│   ├── agents/                         #   Agent state, sessions
│   ├── credentials/                    #   Auth tokens
│   └── logs/                           #   Gateway logs
│
└── .acaclaw/                           # ACACLAW INFRASTRUCTURE — hidden, managed by AcaClaw
    ├── backups/                        #   Versioned file backups (per workspace)
    ├── audit/                          #   Tool call audit logs
    ├── miniforge3/                     #   Conda installation
    └── envs/                           #   Environment metadata
```

### Access Rules

| Directory | AI tools (read) | AI tools (write) | AcaClaw plugins | User | OpenClaw core |
|-----------|:-:|:-:|:-:|:-:|:-:|
| `~/AcaClaw/` | **Yes** | **Yes** | **Yes** | **Yes** | Via `workspaceOnly` boundary |
| `~/AcaClaw/data/raw/` | **Yes** | **No** (convention) | Read only | **Yes** | No enforcement |
| `~/AcaClaw/.acaclaw/` | No (excluded from scan) | No (excluded from scan) | **Yes** (metadata) | **Yes** | No |
| `~/.openclaw/` | No | No | No | **Yes** | **Yes** (owner) |
| `~/.acaclaw/backups/` | No | No | **Yes** (backup plugin) | **Yes** (restore) | No |
| `~/.acaclaw/audit/` | No | No | **Yes** (security plugin) | **Yes** (read) | No |
| `~/.acaclaw/miniforge3/` | No | No | No | **Yes** | No |
| Everything else (`~/`, `/etc/`, etc.) | No | No | No | **Yes** | No |

### How access is enforced

| Boundary | Mechanism | Who enforces |
|----------|-----------|-------------|
| AI confined to workspace | `tools.fs.workspaceOnly: true` + `resolveSandboxPath()` | OpenClaw core |
| AI cannot escape via symlinks | `assertNoPathAliasEscape()` + realpath resolution | OpenClaw core |
| AI cannot escape via `..` | Relative path rejection in `resolveSandboxPath()` | OpenClaw core |
| `data/raw/` read-only | LLM system prompt instruction (convention, not hard enforced) | Workspace plugin |
| `.acaclaw/` excluded from AI | `IGNORE_PATTERNS` in workspace tree scan | Workspace plugin |
| Backups outside workspace | Backup dir at `~/.acaclaw/backups/` (outside `workspaceOnly` boundary) | Backup plugin |
| Audit logs outside workspace | Audit dir at `~/.acaclaw/audit/` (outside `workspaceOnly` boundary) | Security plugin |
| Docker sandbox (Maximum mode) | Container only mounts `~/AcaClaw/` as `rw` | Docker runtime |

> **Rule for plugin/skill developers**: Never write to `~/.openclaw/` — it belongs to OpenClaw. Never write to `~/AcaClaw/` directly from plugin code — use the OpenClaw tool API so that `workspaceOnly` enforcement and backup hooks run. Write AcaClaw infrastructure (backups, audit, env metadata) to `~/.acaclaw/` only.

### Design Principles

| Principle | Implementation |
|-----------|---------------|
| **Confinement** | `tools.fs.workspaceOnly: true` — all read/write/edit/delete restricted to workspace root |
| **Visibility** | Workspace at `~/AcaClaw/` — visible in home directory, not hidden |
| **Safety** | Backups stored externally at `~/.acaclaw/backups/<workspaceId>/` |
| **LLM awareness** | Workspace file tree injected into LLM prompt so AI knows what files exist |
| **Raw data protection** | `data/raw/` convention — AcaClaw writes results to `data/processed/` |

### Workspace File Tree

```
~/AcaClaw/                          # ← Workspace root (configurable)
├── .acaclaw/                       # Project metadata (excluded from AI file tree)
│   ├── workspace.json              # Project config: name, discipline, ID, creation date
│   └── .gitignore                  # Keeps metadata out of version control
│
├── data/
│   ├── raw/                        # Original data — AcaClaw never modifies these
│   └── processed/                  # Analysis outputs, cleaned data, computed results
│
├── documents/
│   ├── drafts/                     # Manuscript and report drafts
│   └── final/                      # Finalized documents for submission
│
├── figures/                        # Generated plots and visualizations
├── references/                     # Bibliography files (.bib, .ris), downloaded PDFs
├── notes/                          # Research notes, meeting minutes, lab notebook entries
├── output/                         # AcaClaw-generated outputs (summaries, citations, etc.)
└── README.md                       # Auto-generated workspace guide
```

**Why this structure?**
- Maps to how researchers actually organize work
- Separates original data (`raw/`) from computed results (`processed/`)
- Separates drafts from final versions
- Output from AI operations goes to a dedicated directory
- Metadata (`.acaclaw/`) is hidden from the AI and from version control

### Workspace Plugin (`@acaclaw/workspace`)

```
@acaclaw/workspace plugin
│
├── register(api: OpenClawPluginApi)
│   │
│   ├── api.on("before_prompt_build", injectWorkspaceContext, { priority: 150 })
│   │   └── Scans workspace file tree (max 2 levels)
│   │       Injects into LLM system prompt:
│   │       - Working directory path
│   │       - Project name and discipline
│   │       - File tree with sizes
│   │       - Workspace boundary rules
│   │
│   ├── api.registerTool("workspace_info", infoTool)
│   │   └── Show project metadata, file tree, statistics
│   │
│   ├── api.registerCli("acaclaw-workspace init", initCommand)
│   │   └── Create workspace with scaffold directories
│   │       Args: [path], --name, --discipline, --no-scaffold
│   │
│   ├── api.registerCli("acaclaw-workspace info", infoCommand)
│   │   └── Display workspace metadata
│   │
│   └── api.registerCli("acaclaw-workspace tree", treeCommand)
│       └── Print workspace file tree
```

### Workspace Config (`.acaclaw/workspace.json`)

```jsonc
{
  "name": "AcaClaw",             // Project name
  "discipline": "biology",       // Matches Conda environment
  "createdAt": "2026-03-12T14:30:00Z",
  "workspaceId": "AcaClaw-a1b2c3d4e5f6"  // Stable ID for backup organization
}
```

### Workspace Backup Policy

Backups are organized per workspace using a stable workspace ID derived from the workspace path:

```
~/.acaclaw/backups/
├── AcaClaw-a1b2c3d4e5f6/          # Workspace-specific backups
│   └── files/
│       ├── 2026-03-12/
│       │   ├── 14-30-22.experiment-results.csv
│       │   ├── 14-30-22.experiment-results.csv.meta.json
│       │   └── ...
│       └── 2026-03-11/
│           └── ...
│
├── MyProject-f6e5d4c3b2a1/        # Another workspace
│   └── files/
│       └── ...
│
└── _global/                        # Backups from before workspace was configured
    └── files/
        └── ...
```

Each backup metadata file includes:
- `originalPath` — absolute path at time of backup
- `workspaceRelativePath` — path relative to workspace root (portable)
- `workspaceId` — stable ID linking backup to its workspace

This design ensures:
- **Per-workspace isolation**: backups for one project don't mix with another
- **Portability**: workspace-relative paths survive moves/renames
- **Migration**: legacy flat backups in `_global/` are still searchable

### Workspace Security Policy

| Policy | Mechanism | Scope |
|--------|-----------|-------|
| **File confinement** | `tools.fs.workspaceOnly: true` | All file read/write/edit/delete tools |
| **Exec confinement** | Exec tool CWD defaults to workspace root | Shell commands |
| **Patch confinement** | `tools.exec.applyPatch.workspaceOnly: true` | apply_patch tool |
| **Tool deny-list** | `tools.deny: [gateway, cron, ...]` | Control-plane tools |
| **Command deny-list** | Security plugin: 15 dangerous command patterns | Shell tools |
| **Network allowlist** | Security plugin: academic domains only | Tools with URL params |
| **Pre-modification backup** | Backup plugin: priority 200 (runs first) | All file-modifying tools |
| **Audit trail** | Security plugin: every tool call logged with workspace path | All tools |

**Enforcement chain** (in priority order):
1. **Backup** (priority 200) — copies original file before any change
2. **Security** (priority 100) — denies dangerous tools/commands/domains
3. **OpenClaw core** — enforces `workspaceOnly` boundary via `resolveSandboxPath()`

In Maximum mode, Docker sandbox adds a third layer: the container only mounts the workspace with `rw` access.

---

## Data Safety Architecture

> **Axiom: Research data is irreplaceable. Every design choice must protect it.**

### Backup Plugin (`@acaclaw/backup`)

An OpenClaw plugin that intercepts all file-modifying operations:

```
@acaclaw/backup plugin
│
├── register(api: OpenClawPluginApi)
│   │
│   ├── api.on("before_tool_call", fileBackupHook, { priority: 200 })
│   │   └── For any tool call that writes/modifies/deletes a file:
│   │       1. Copy original file to backup directory
│   │       2. Write metadata (timestamp, operation, agent session)
│   │       3. Verify backup integrity (checksum)
│   │       4. Only then allow the tool call to proceed
│   │
│   ├── api.registerTool("backup_restore", restoreTool)
│   │   └── Restore a specific file from backup
│   │       - By timestamp: "restore experiment.csv from yesterday"
│   │       - By version: "show me all versions of manuscript.docx"
│   │
│   ├── api.registerTool("backup_list", listTool)
│   │   └── List all backups for a file or directory
│   │
│   ├── api.registerCli("acaclaw-backup restore", restoreCommand)
│   │   └── CLI: openclaw acaclaw-backup restore <file>
│   │
│   └── api.registerCli("acaclaw-backup list", listCommand)
│       └── CLI: openclaw acaclaw-backup list
│
│   Planned (not yet implemented):
│   ├── api.registerTool("backup_snapshot") — full workspace snapshots
│   └── api.registerService("backup_maintenance") — retention/integrity
```

### Backup Directory Structure

```
~/.acaclaw/backups/
├── <workspaceId>/                      # Per-workspace backup isolation
│   └── files/                          # Individual file backups
│       ├── 2026-03-12/
│       │   ├── 14-30-22.experiment-results.csv
│       │   ├── 14-30-22.experiment-results.csv.meta.json
│       │   ├── 15-10-05.manuscript-draft.docx
│       │   └── 15-10-05.manuscript-draft.docx.meta.json
│       └── 2026-03-11/
│           └── ...
│
├── _global/                            # Legacy/non-workspace backups
│   └── files/
│       └── ...
│
├── snapshots/                          # Full workspace snapshots (planned)
│   ├── 2026-03-12T14-30-00.snapshot/
│   │   ├── manifest.json              # List of all files + checksums
│   │   └── data/                      # Compressed copy of workspace
│   └── ...
│
└── config.json                         # Backup configuration
    # {
    #   "retentionDays": 30,
    #   "maxStorageGB": 10,
    #   "snapshotBeforeBatch": true,
    #   "checksumAlgorithm": "sha256",
    #   "excludePatterns": ["*.tmp", "node_modules/"]
    # }
```

### Metadata Format

```jsonc
// 14-30-22.experiment-results.csv.meta.json
{
  "originalPath": "/home/user/AcaClaw/data/processed/experiment-results.csv",
  "workspaceRelativePath": "data/processed/experiment-results.csv",
  "workspaceId": "AcaClaw-a1b2c3d4e5f6",
  "backupTime": "2026-03-12T14:30:22Z",
  "operation": "modify",          // modify | delete | rename
  "toolCall": "bash",             // which tool modified the file
  "agentSession": "abc123",       // for audit trail
  "originalChecksum": "sha256:...",
  "originalSize": 142857,
  "backupChecksum": "sha256:...", // verify backup integrity
  "description": "Added statistical analysis columns"
}
```

### Safety Guarantees

| Guarantee | How it works |
|---|---|
| **No file is ever modified without backup** | `before_tool_call` hook blocks write operations until backup completes |
| **No file is ever deleted** | Deletions are intercepted; original is moved to backup, not removed |
| **Backup integrity is verified** | SHA-256 checksum computed on backup and verified against original |
| **Restore is always possible** | One-click restore from GUI or natural language ("undo the last change to my data") |
| **Storage is bounded** | Configurable retention policy; old backups pruned automatically with warning |
| **Backups survive crashes** | Write-ahead design: backup is completed before modification begins |

---

## User Experience Architecture

### UX Principles

1. **No terminal required**: Every operation is accessible via GUI or natural language
2. **Progressive disclosure**: Simple by default, advanced options available for power users
3. **Domain-first vocabulary**: Use "paper", "figure", "citation", "experiment" — not "SKILL.md", "plugin", "sandbox"
4. **Guided workflows**: Step-by-step wizards for common tasks (first install, paper writing, data analysis)

### Installation UX

```
┌────────────────────────────────────────────────────┐
│                                                     │
│  Current (Phase 1):                                 │
│  Download installer → double-click → wizard          │
│  Wizard asks: research field, AI provider, done.     │
│                                                     │
│  Future (Phase 2 — GUI):                             │
│  Open AcaClaw Desktop → everything is there          │
│  Chat panel + file browser + backup viewer           │
│                                                     │
└────────────────────────────────────────────────────┘
```

### Installer Flow (All Platforms)

```
1. User downloads platform-specific installer
   ├── Windows: .exe installer (NSIS/Electron)
   ├── macOS: .dmg (drag to Applications)
   └── Linux: .AppImage (double-click) or .deb/.rpm

2. Installer does everything silently:
   ├── Install Node.js 22 (if not present)
   ├── Install OpenClaw
   ├── Install Miniforge + scientific Python
   ├── Install AcaClaw plugins & skills
   ├── Detect Docker availability
   ├── Offer security level choice (Standard / Maximum)
   ├── Apply security defaults (workspace policy, backup, optional sandbox)
   └── Create desktop shortcut

3. First launch shows onboarding wizard (GUI):
   ├── "What is your research field?"
   │   → Chemistry / Physics / Biology / Medicine / Math / Other
   ├── "Connect your AI provider"
   │   → OpenAI / Google / Anthropic (with guided key setup)
   └── "You're ready! Try asking: 'Find papers about X'"
```

### GUI Architecture (Planned)

```
┌─────────────────────────────────────────────────────────┐
│  AcaClaw Desktop (Electron / Tauri)                      │
│                                                          │
│  ┌──────────────────┐  ┌──────────────────────────────┐  │
│  │                  │  │                              │  │
│  │  Chat Panel      │  │  Workspace Panel             │  │
│  │                  │  │                              │  │
│  │  "Analyze this   │  │  📁 My Research/             │  │
│  │   CSV and make   │  │    📁 experiment-data/       │  │
│  │   a figure"      │  │    📄 manuscript.docx        │  │
│  │                  │  │    📄 results.csv            │  │
│  │  [AI response    │  │    📄 figures/               │  │
│  │   with embedded  │  │                              │  │
│  │   chart]         │  │  ──────────────────────────  │  │
│  │                  │  │  📋 Recent Backups           │  │
│  │                  │  │    ↩ results.csv (2min ago)  │  │
│  │                  │  │    ↩ manuscript.docx (1hr)   │  │
│  └──────────────────┘  └──────────────────────────────┘  │
│                                                          │
│  ┌──────────────────────────────────────────────────────┐ │
│  │  Status Bar: 🟢 Connected  |  🛡️ Sandbox ON  |      │ │
│  │  💾 Backup: 142 files saved  |  🔄 OpenClaw 2026.3  │ │
│  └──────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

The GUI wraps OpenClaw's existing web UI and adds:
- **File browser** with backup/version history
- **One-click restore** for any backed-up file
- **Domain-specific quick actions** ("Search papers", "Analyze data", "Format references")
- **Settings panel** (no config files to edit)
- **Update manager** (one-click OpenClaw upgrade with compatibility check)

---

## Component Architecture

```
acaclaw/
├── plugins/                          # OpenClaw plugins (npm packages)
│   ├── workspace/                    # @acaclaw/workspace
│   │   ├── package.json
│   │   ├── openclaw.plugin.json
│   │   ├── index.ts                  # Plugin entry — hooks, tools, CLI
│   │   └── workspace.ts             # Workspace init, file tree scanning, LLM context
│   │
│   ├── backup/                       # @acaclaw/backup
│   │   ├── package.json
│   │   ├── openclaw.plugin.json
│   │   ├── index.ts                  # Plugin entry
│   │   └── backup.ts                 # Backup logic, hooks, tools, CLI
│   │
│   ├── security/                     # @acaclaw/security
│   │   ├── package.json
│   │   ├── openclaw.plugin.json
│   │   ├── index.ts
│   │   └── security.ts              # Policy, audit, scrubbing, hooks
│   │
│   ├── academic-env/                 # @acaclaw/academic-env
│   │   ├── package.json
│   │   ├── openclaw.plugin.json
│   │   ├── index.ts
│   │   └── academic-env.ts           # Discipline-aware env detection, LLM context, manifest
│   │
│   └── compat-checker/               # @acaclaw/compat-checker
│       ├── package.json
│       ├── openclaw.plugin.json
│       ├── index.ts
│       └── compat-checker.ts         # Version & env compatibility checks
│
├── skills.json                       # Curated skill manifest (names + sources)
│                                     # Skills live in a separate repo:
│                                     #   github.com/acaclaw/acaclaw-skills
│                                     # Installed via: clawhub install <skill>
│
├── env/                              # Environment definitions
│   └── conda/
│       ├── environment-base.yml      # General academic env (acaclaw)
│       ├── environment-bio.yml       # Biology env (acaclaw-bio, self-contained)
│       ├── environment-chem.yml      # Chemistry env (acaclaw-chem, self-contained)
│       ├── environment-med.yml       # Medicine env (acaclaw-med, self-contained)
│       └── environment-phys.yml      # Physics env (acaclaw-phys, self-contained)
│
├── config/                           # Default configuration overlays
│   ├── openclaw-defaults.json        # AcaClaw defaults for openclaw.json
│   └── openclaw-maximum.json         # Maximum security policy
│
├── tests/                            # Automated test suites
│   ├── backup.test.ts                # Backup plugin tests
│   └── security.test.ts              # Security plugin tests
│
├── scripts/
│   ├── install.sh                    # One-line installer (Linux/macOS)
│   └── uninstall.sh                  # Uninstaller with optional Conda env removal
│
├── docs/
│   └── architecture.md               # This file
│
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── CONTRIBUTING.md
├── LICENSE                           # MIT
└── README.md
```

### Planned (not yet implemented)

These components are designed but not yet built:

- `installer/` — Platform-specific installers (Windows NSIS, macOS .dmg, Linux AppImage)
- `gui/` — Desktop GUI with chat panel, file browser, onboarding wizard (Phase 2)
- `patches/` — Patch record system for upstream workarounds
- `.github/workflows/` — CI, nightly compat testing against OpenClaw main
- `scripts/install.ps1` — Windows PowerShell installer
- `scripts/upgrade.sh` — Upgrade orchestrator
- `env/system/` — System package lists (apt, brew)
- Additional test suites: compat/, data-safety/, env/, skills/, upgrade/

---

## Skill Architecture

AcaClaw does **not** write skills from scratch. Skills are an existing ecosystem — OpenClaw ships 53 bundled skills, and the community publishes more on [ClawHub](https://clawhub.ai). AcaClaw **curates, creates, tests, and publishes** high-quality academic skills back to ClawHub so the entire OpenClaw community benefits.

### Design Principle: Contribute, Don't Diverge

> AcaClaw publishes every skill to ClawHub under the `@acaclaw` organization account. We never maintain a private registry. Any OpenClaw user can `clawhub install paper-search` and get the exact same skill — AcaClaw is not required.

This is the essence of AcaClaw's relationship with the OpenClaw ecosystem:

| What we do | What we don't do |
|---|---|
| Publish all skills to ClawHub | Mirror or re-host skills on our own servers |
| Credit every contributor by name and role | Publish under a team brand without attribution |
| Install skills from ClawHub (official client) | Bypass ClawHub API or scrape |
| Test all skills together in one environment | Ship skills with conflicting dependencies |
| File bugs and PRs upstream on OpenClaw | Fork OpenClaw or maintain patches |
| Test skills rigorously before publishing | Publish untested or low-quality skills |

### Contributor Attribution Model

ClawHub displays skills as `by @acaclaw` (the publishing account). But AcaClaw is built by individuals, and each person's contribution is tracked and credited.

#### Recognized Roles

| Role | Description |
|------|-------------|
| **Creator** | Original author who designed and implemented the skill |
| **Author** | Wrote significant portions of the skill's functionality |
| **Tester** | Validated across environments, wrote test cases, edge-case testing |
| **Maintainer** | Keeps the skill updated and compatible with new OpenClaw releases |
| **Debugger** | Fixed critical bugs or edge cases |
| **Reviewer** | Reviewed code and provided quality feedback before publishing |
| **Documenter** | Wrote usage guides, examples, or translations |

#### Attribution Surfaces (Three Layers)

```
┌─────────────────────────────────────────────────────────────────┐
│  Layer 1: ClawHub Skill Page (SKILL.md body)                     │
│  Rendered directly on clawhub.ai/@acaclaw/<skill>                │
│                                                                  │
│  ## Contributors                                                 │
│  | Role       | Name   | Focus                        |         │
│  |------------|--------|------------------------------|         │
│  | Creator    | @alice | arXiv & Semantic Scholar      |         │
│  | Author     | @bob   | PubMed search, MeSH terms     |         │
│  | Tester     | @carol | Integration tests, CI         |         │
│  | Maintainer | @davy  | Compatibility, updates        |         │
├─────────────────────────────────────────────────────────────────┤
│  Layer 2: AcaClaw Hub Website (acaclaw.com/hub)                  │
│  Powered by github.com/acaclaw/hub repository                    │
│                                                                  │
│  - Full contributor profiles with photos and links               │
│  - Role-specific credit per skill (creator, tester, debugger...) │
│  - Contribution history and changelog per person                 │
│  - Direct links to ClawHub page and source repo                  │
│  - More prominent and concentrated than ClawHub display          │
├─────────────────────────────────────────────────────────────────┤
│  Layer 3: Git History (canonical truth)                           │
│  github.com/acaclaw/acaclaw-skills                               │
│                                                                  │
│  - git blame + commit history = indisputable authorship          │
│  - CONTRIBUTORS.md master record across all skills               │
│  - homepage field in SKILL.md links back to source               │
└─────────────────────────────────────────────────────────────────┘
```

The academic analogy: ClawHub is the journal (publisher), the `@acaclaw` account is the editorial board, and individual contributors are the paper authors. The journal name is on the cover, but the author names are what matter.

#### SKILL.md Contributor Section (Required)

Every AcaClaw skill MUST include a `## Contributors` section in the SKILL.md body. CI enforces this — publishing is blocked without it.

```yaml
---
name: paper-search
description: Search arXiv, PubMed, Semantic Scholar, CrossRef simultaneously
homepage: https://github.com/acaclaw/acaclaw-skills/tree/main/paper-search
metadata:
  openclaw:
    emoji: "🔍"
    requires:
      bins: ["curl"]
---

# Paper Search

Search across arXiv, PubMed, Semantic Scholar, and CrossRef simultaneously.

## Usage
...

## Contributors

| Role | Name | Focus |
|------|------|-------|
| Creator | @alice | Initial design, arXiv integration |
| Author | @bob | PubMed search, MeSH term handling |
| Tester | @carol | Edge case testing, CI pipeline |
| Maintainer | @davy | Ongoing updates, compatibility |

## About

Published by [AcaClaw](https://github.com/acaclaw/acaclaw-skills) · Built on [OpenClaw](https://github.com/openclaw/openclaw)
```

#### AcaClaw Hub (acaclaw.com/hub)

The [hub](https://github.com/acaclaw/hub) repository powers a website at `acaclaw.com/hub` that serves as the contributor showcase. While ClawHub focuses on skill discovery and installation, AcaClaw Hub focuses on **people**:

| Feature | ClawHub | AcaClaw Hub |
|---------|---------|-------------|
| Primary focus | Skill discovery + install | Contributor showcase |
| Attribution display | `by @acaclaw` (account owner) | Full contributor profiles with roles |
| Contributor detail | Markdown table in SKILL.md body | Dedicated profile pages, cross-skill view |
| Install command | `clawhub install <skill>` | Links to ClawHub for installation |
| Source of truth | Published skill bundles | GitHub source repo + git history |

AcaClaw Hub reads the contributor metadata from each SKILL.md in the acaclaw-skills repo and generates:
- Per-contributor pages ("Alice has created 3 skills, tested 5, debugged 2")
- Per-skill pages with full contributor list and links to ClawHub
- Leaderboards and contribution activity feeds
- Badge/widget embeds for contributor profiles

### Publishing Workflow

```
1. Contributor opens PR in acaclaw-skills repo
   └── Adds/modifies skill code + adds themselves to Contributors table

2. AcaClaw team reviews
   ├── Code review (Reviewer role)
   ├── Integration test suite runs against pinned OpenClaw version
   ├── Security review (no exfiltration, safe commands)
   └── CI verifies ## Contributors section exists

3. PR merged
   └── CI runs: clawhub publish under @acaclaw account
       └── Skill goes live on clawhub.ai/@acaclaw/<skill>

4. AcaClaw manifest updated
   └── skills.json pinned to new version

5. AcaClaw Hub rebuilt
   └── acaclaw.com/hub updated with new contributor data
```

### Quality Guarantee

The reason AcaClaw skills carry weight on ClawHub:

| Quality gate | What it checks |
|---|---|
| **Code review** | At least one reviewer signs off on every PR |
| **Integration tests** | Skill runs correctly against pinned OpenClaw version |
| **Environment compatibility** | Skill's dependencies resolve cleanly in the shared AcaClaw Conda environment — no version conflicts with any other pre-shipped skill |
| **Security review** | No data exfiltration, no dangerous commands, no credential leaks |
| **Compatibility test** | Works in both Standard and Maximum security modes |
| **Attribution check** | `## Contributors` section present and complete |
| **Documentation check** | Usage examples, edge cases, limitations documented |

This multi-person, multi-role process is what makes AcaClaw skills high-quality — and why every role (creator, tester, debugger, reviewer, maintainer) is credited.

### How Skills Work in OpenClaw

A skill is a directory containing a `SKILL.md` file plus optional scripts and references. Skills are loaded from multiple sources with this precedence (highest wins):

| Priority | Source | Path |
|---|---|---|
| 6 (highest) | Workspace skills | `<workspace>/skills/` |
| 5 | Project agents skills | `<workspace>/.agents/skills/` |
| 4 | Personal agents skills | `~/.agents/skills/` |
| 3 | Managed/local skills | `~/.openclaw/skills/` |
| 2 | Bundled skills | shipped with OpenClaw install |
| 1 (lowest) | Extra dirs + plugin skills | `skills.load.extraDirs` + plugin manifests |

Skills are installed via:
- **ClawHub CLI**: `clawhub install <skill>` — from the [ClawHub](https://clawhub.com) community registry
- **Manual placement**: drop a skill folder into `~/.openclaw/skills/`
- **Plugin manifests**: plugins can ship skills via `openclaw.plugin.json`

### AcaClaw's Approach: Contribute, Curate, Credit

AcaClaw maintains a **separate repository** ([acaclaw-skills](https://github.com/acaclaw/acaclaw-skills)) that:

1. **Creates** new academic-specific skills (paper search, citation manager, etc.) when no suitable skill exists
2. **Curates** the best existing skills from OpenClaw bundled + ClawHub for academic use
3. **Tests** every skill rigorously — integration tests, security review, compatibility checks
4. **Publishes** all skills to ClawHub under the `@acaclaw` account so the broader OpenClaw community benefits
5. **Credits** every contributor by name and role on the ClawHub page and on [acaclaw.com/hub](https://acaclaw.com/hub)
6. **Maintains** a manifest (`skills.json`) listing which skills to install for each domain profile

### Skill Manifest (`skills.json`)

The manifest in this repo defines which skills to install:

```jsonc
{
  "version": 1,
  "description": "AcaClaw curated skills manifest...",
  "environment": {
    "disciplines": {
      "general":   { "envName": "acaclaw",      "file": "env/conda/environment-base.yml" },
      "biology":   { "envName": "acaclaw-bio",  "file": "env/conda/environment-bio.yml" },
      "chemistry": { "envName": "acaclaw-chem", "file": "env/conda/environment-chem.yml" },
      "medicine":  { "envName": "acaclaw-med",  "file": "env/conda/environment-med.yml" },
      "physics":   { "envName": "acaclaw-phys", "file": "env/conda/environment-phys.yml" }
    },
    "notes": "Each discipline env is self-contained — includes all base packages plus discipline-specific ones."
  },
  "skills": {
    "core": [
      // ClawHub skills installed for all users (all disciplines)
      { "name": "paper-search", "source": "clawhub", "requires": ["requests", "beautifulsoup4"] },
      { "name": "citation-manager", "source": "clawhub", "requires": [] },
      { "name": "data-analyst", "source": "clawhub", "requires": ["numpy", "scipy", "pandas", "statsmodels"] },
      { "name": "figure-generator", "source": "clawhub", "requires": ["matplotlib", "numpy"] },
      { "name": "format-converter", "source": "clawhub", "requires": ["pymupdf", "openpyxl"] },
      { "name": "math-solver", "source": "clawhub", "requires": ["sympy", "numpy"] },
      // + manuscript-assistant, slide-maker, grant-helper, peer-reviewer
    ],
    "bundled": [
      // OpenClaw bundled skills useful for academics
      "nano-pdf", "xurl", "coding-agent", "clawhub"
    ],
    "disciplines": {
      "biology":  [{ "name": "bio-tools", "source": "clawhub", "requires": ["biopython"], "env": "acaclaw-bio" }],
      "chemistry":[{ "name": "chem-tools", "source": "clawhub", "requires": ["rdkit"], "env": "acaclaw-chem" }],
      "medicine": [{ "name": "med-tools", "source": "clawhub", "requires": ["lifelines", "pydicom"], "env": "acaclaw-med" }],
      "physics":  [{ "name": "physics-tools", "source": "clawhub", "requires": ["astropy", "lmfit"], "env": "acaclaw-phys" }]
    }
  }
}
```

### Installation Flow

```
Installer runs → reads skills.json
  │
  ├── Bundled skills: already installed with OpenClaw (no action needed)
  ├── ClawHub skills: clawhub install <skill> for each core + profile skill
  └── Skills installed to ~/.openclaw/skills/ (managed dir)
```

### Skill Development

New academic skills are developed in the `acaclaw-skills` repo by individual contributors, then published to ClawHub under the `@acaclaw` account after passing all quality gates:

```bash
# In the acaclaw-skills repo (CI handles publishing after PR merge)
cd skills/paper-search
clawhub publish . --slug paper-search --name "Paper Search" --version 1.0.0
```

This keeps the main AcaClaw repo focused on plugins, configuration, and the installer — while the skills repo handles all skill development, testing, attribution, and publishing.

The [hub](https://github.com/acaclaw/hub) repository generates the contributor showcase at `acaclaw.com/hub` from the same skill metadata.

---

## Security Architecture

### Two Security Levels

AcaClaw lets users choose a security level that fits their needs. Both levels share the same policy layer — the difference is where code actually runs.

| | Standard (Workspace Security) | Maximum (Sandbox Mode) |
|---|---|---|
| **Where code runs** | On the host, restricted to the workspace | Inside a disposable Docker container |
| **File access** | Workspace directory only (`tools.fs.workspaceOnly: true`) | Isolated sandbox filesystem |
| **Process isolation** | OS-level (host process) | Container-level (dropped capabilities, read-only root, seccomp) |
| **Network isolation** | Egress allowlist via AcaClaw plugin | Docker `network: none` + egress allowlist |
| **Requires Docker** | No | Yes |
| **Convenience** | Highest — nothing extra to install | Requires Docker Desktop (macOS/Windows) or Docker/Podman (Linux) |
| **Best for** | Most users — students, researchers, everyday academic work | Handling untrusted data, running unfamiliar code, shared/lab machines |

**Default**: Standard (Workspace Security). The installer offers Maximum mode during setup if Docker is detected.

### How It Works

OpenClaw provides three complementary security controls:

1. **Tool Policy** (`tools.*`) — software-level rules for which tools can be called and where they can write. Includes `tools.fs.workspaceOnly`, tool allow/deny lists, tool groups, exec deny patterns. No Docker needed.
2. **Sandbox** (`agents.defaults.sandbox.*`) — Docker containers that isolate tool execution. Modes: `off` / `non-main` / `all`. Scope: per-session / per-agent / shared.
3. **Elevated** (`tools.elevated.*`) — explicit escape hatch to run exec on the host when sandboxed.

AcaClaw uses **all three** — plus its own `before_tool_call` policy hooks on top:

```
AI decides to call a tool (bash, python, file_write, etc.)
  │
  ▼
┌──────────────────────────────────────────────────────────┐
│  AcaClaw Policy Layer (before_tool_call hook)             │ ← OUR CODE
│  ┌─ @acaclaw/backup: copy file before modification       │
│  ├─ @acaclaw/security: check command against policy      │
│  ├─ @acaclaw/security: log to audit trail                │
│  └─ @acaclaw/security: block if policy violation         │
└────────────────────────┬─────────────────────────────────┘
                         │ allowed? proceed
                         ▼
┌──────────────────────────────────────────────────────────┐
│  OpenClaw Tool Policy Layer                              │ ← NOT OUR CODE
│  tools.fs.workspaceOnly, tool allow/deny, exec policy    │
└────────────────────────┬─────────────────────────────────┘
                         │ allowed? proceed
                         ▼
┌──────────────────────────────────────────────────────────┐
│  OpenClaw Execution Layer                                │ ← NOT OUR CODE
│  Standard:  sandbox.mode=off  → host (workspace-only)    │
│  Maximum:   sandbox.mode=all  → Docker container          │
└──────────────────────────────────────────────────────────┘
```

**Key insight**: AcaClaw's `before_tool_call` hook fires BEFORE execution reaches OpenClaw's tool policy and sandbox. This means AcaClaw's policy enforcement (backup, audit, deny-list) works in both Standard and Maximum modes.

### Standard Mode — Workspace Security

Standard mode uses OpenClaw's tool policy to restrict operations to the workspace directory, without requiring Docker. Think of it like VS Code's Trusted Workspace — operations are confined to your project folder.

**What AcaClaw configures:**

```jsonc
{
  "agents": {
    "defaults": {
      "sandbox": { "mode": "off" }
    }
  },
  "tools": {
    "fs": { "workspaceOnly": true },         // read/write/edit restricted to workspace
    "exec": {
      "applyPatch": { "workspaceOnly": true } // apply_patch can't escape workspace
    },
    "deny": ["gateway", "cron", "sessions_spawn", "sessions_send"]
  }
}
```

**What protects you:**
- `tools.fs.workspaceOnly: true` — file tools (`read`, `write`, `edit`, `apply_patch`) cannot touch files outside the workspace
- AcaClaw `before_tool_call` hooks — backup files before modification, block dangerous commands, log all tool calls
- AcaClaw network policy — egress restricted to academic domains
- Gateway auth — required by default, no accidental public exposure
- Third-party skills — explicit opt-in only

**Trade-off**: Code executes on the host. A sufficiently creative command could still access host resources outside the workspace. The tool policy is a guardrail, not a security boundary. For most academic work, this is more than enough.

### Maximum Mode — Docker Sandbox

Maximum mode adds Docker container isolation on top of everything Standard mode provides. Each session runs tools inside a hardened, disposable container.

**What AcaClaw configures:**

```jsonc
{
  "agents": {
    "defaults": {
      "sandbox": {
        "mode": "all",
        "scope": "session",
        "workspaceAccess": "rw"
      }
    }
  },
  "tools": {
    "fs": { "workspaceOnly": true },
    "exec": {
      "applyPatch": { "workspaceOnly": true }
    },
    "deny": ["gateway", "cron", "sessions_spawn", "sessions_send"],
    "elevated": { "enabled": false }
  }
}
```

**What the Docker sandbox adds:**
- All Linux capabilities dropped
- Read-only root filesystem
- No network by default (`network: none`)
- Seccomp + AppArmor profiles
- Memory and PID limits
- Workspace mounted at `/workspace` (read-write by default)
- One container per session — destroyed when session ends
- `tools.elevated.enabled: false` — no escape hatch to host exec

**Platform-specific Docker behavior:**

| Platform | Docker sandbox | Notes |
|---|---|---|
| **Linux** | Native Docker/Podman — lightweight, fast | Best sandbox experience |
| **macOS** | Docker Desktop (runs a Linux VM) | Works well, minor performance overhead |
| **Windows** | Docker Desktop (requires WSL2 backend) | Code runs in a Linux container via WSL2; bash available inside container |

**Windows note:** Windows has no native bash. In Maximum mode, code runs inside a Linux Docker container, so bash is available. In Standard mode, OpenClaw resolves executables via PATH/PATHEXT and uses PowerShell/cmd.exe natively.

### Choosing a Security Level

The installer asks during setup. Users can change the level later via the settings panel or CLI.

| Scenario | Recommended level |
|---|---|
| Writing a paper, analyzing your own data | Standard |
| Student homework, course work | Standard |
| Processing data from untrusted sources | Maximum |
| Running code examples from the internet | Maximum |
| Shared lab computer, multiple users | Maximum |
| Quick literature search, reference management | Standard |

Advanced users can also use `openclaw sandbox explain` to inspect the effective security posture.

### Threat Model

AcaClaw targets users who may not understand security implications. The security model must be **invisible but strict**:

| Threat | Mitigation | Security Level |
|---|---|---|
| AI writes/deletes outside workspace | `tools.fs.workspaceOnly` + `before_tool_call` block | Both |
| AI runs dangerous command (`rm -rf /`) | `before_tool_call` deny-list blocks + logs | Both |
| AI overwrites important files | `before_tool_call` backs up file first | Both |
| AI exfiltrates data via network | Network egress allowlist (academic domains only) | Both |
| Prompt injection in skill content | `llm_input` hook scans for known patterns | Both |
| Credential leak in AI output | `llm_output` hook strips sensitive patterns | Both |
| Unauthorized gateway access | Mandatory gateway auth token | Both |
| Malicious ClawHub skill installed | Third-party skills require explicit opt-in | Both |
| Loss of research data | Versioned backups + integrity verification | Both |
| AI escapes workspace via creative shell commands | Docker container isolation blocks host access | Maximum only |
| AI spawns persistent background processes | Container PID limits + destroyed on session end | Maximum only |
| AI tries to access host network services | `network: none` in Docker | Maximum only |

### Security Across Every Layer

Security is not a single plugin — it is woven into every layer of AcaClaw:

| Layer | Security measure |
|---|---|
| **Skills** | Each skill's instructions include safety constraints (e.g. "never delete the original data file"). Skills declare `requires.bins` so they fail gracefully if tools are missing, rather than running broken commands. |
| **Backup plugin** | `before_tool_call` hook fires on every file-write tool, backs up the target file before the write proceeds. If backup fails, the write is blocked. |
| **Security plugin** | `before_tool_call` hook validates tool calls against policy (deny patterns, workspace-only writes, audit logging). Runs AFTER backup, BEFORE execution. |
| **Tool policy** | OpenClaw's `tools.fs.workspaceOnly` restricts file tools to workspace. `tools.deny` blocks control-plane tools. Applied by configuration, enforced by OpenClaw core. |
| **Docker sandbox** | (Maximum mode) Container isolation with all caps dropped, read-only root, no network, seccomp, memory/PID limits. |
| **Environment** | Conda environment is isolated from system Python. Scientific packages cannot interfere with OpenClaw or the OS. |
| **Configuration** | Gateway auth required, third-party skills disabled by default, workspace-only filesystem. Applied by the installer, not left to the user. |
| **Installer** | Detects Docker, offers security level choice, sets all secure defaults automatically. User never sees a config file. |
| **GUI (planned)** | Settings panel to switch security levels. Visual indicator (🟢 Standard / 🔒 Maximum). Backup browser for one-click restore. |

### Security Plugin Architecture

```
@acaclaw/security plugin
│
├── api.on("before_tool_call", toolValidator, { priority: 100 })
│   ├── Match tool call against command deny-list
│   │   (e.g. rm -rf, chmod 777, curl | sh, etc.)
│   ├── Block denied tools (e.g. browser launch in Maximum mode)
│   ├── Verify file operations stay within workspace
│   ├── Detect prompt injection patterns in tool arguments
│   ├── Scrub credentials from tool outputs
│   ├── Log every tool invocation to audit trail
│   └── Return { block: true, reason: "..." } on violation
│
├── api.registerTool("security_audit", auditTool)
│   └── Show recent security events and audit log
│
├── api.registerTool("security_status", statusTool)
│   └── Show current security mode, policy, and stats
│
├── api.registerCli("acaclaw-security audit", auditCommand)
│   └── CLI: openclaw acaclaw-security audit
│
├── api.registerCli("acaclaw-security status", statusCommand)
│   └── CLI: openclaw acaclaw-security status
│
└── Network domain allowlist (built-in):
    arxiv.org, api.semanticscholar.org,
    eutils.ncbi.nlm.nih.gov, api.crossref.org,
    api.openalex.org, doi.org, unpaywall.org
```

### Defaults Changed from OpenClaw

| Setting | OpenClaw Default | AcaClaw Standard | AcaClaw Maximum | Rationale |
|---|---|---|---|---|
| `sandbox.mode` | `off` | `off` | `all` | Standard relies on tool policy; Maximum adds container isolation |
| `tools.fs.workspaceOnly` | `false` | `true` | `true` | Restrict file tools to workspace in both modes |
| `tools.elevated.enabled` | `true` | `true` | `false` | Maximum mode prevents escape to host exec |
| Skill auto-enable | All loaded | Only vetted | Only vetted | Reduce attack surface |
| Gateway auth | Optional | Required | Required | No accidental exposure |
| Tool execution logging | Minimal | Full audit | Full audit | Reproducibility and accountability |
| File backup | None | Automatic | Automatic | Data safety |
| Third-party skills | Auto-load | Explicit opt-in | Explicit opt-in | Supply chain protection |
| Control-plane tools | Enabled | Denied | Denied | Block `gateway`, `cron`, `sessions_spawn`, `sessions_send`, `mcp_install`, `mcp_uninstall`, `config_set` |

---

## Environment Architecture

> **The second most important reason AcaClaw exists: environment compatibility.** Individual skills are great in isolation, but when skill A needs `numpy 1.26` and skill B needs `numpy 1.24`, the user's environment breaks. Researchers should never debug dependency conflicts. AcaClaw resolves them at the distribution level — like Ubuntu's apt resolves package conflicts so users don't have to.

### The Problem AcaClaw Solves

On vanilla OpenClaw, each skill manages its own dependencies independently:

```
Skill: paper-search     → needs requests>=2.31, beautifulsoup4>=4.12
Skill: data-analyst      → needs pandas>=2.2, numpy>=1.26, scipy>=1.12
Skill: bio-tools         → needs biopython>=1.83, numpy>=1.24,<1.26  ← CONFLICT!
Skill: chem-tools        → needs rdkit>=2024.03, numpy>=1.26
Skill: figure-generator  → needs matplotlib>=3.8, numpy>=1.26
```

Installing these independently can produce silent version conflicts. A user installing `bio-tools` after `data-analyst` might downgrade NumPy and break every other skill. The user sees a cryptic `ImportError` and has no idea why.

### AcaClaw's Solution: Self-Contained Discipline Environments

AcaClaw uses **discipline-specific, self-contained Conda environments**. When users install AcaClaw, they choose their research discipline (e.g. biology). This creates a single Conda env (e.g. `acaclaw-bio`) that contains ALL base packages plus discipline-specific ones. No overlays, no layering — one env with everything.

#### Key principles:

1. **Self-contained**: Each discipline env includes all base packages (NumPy, SciPy, Pandas, etc.) plus discipline additions. No `conda update` overlay needed.
2. **LLM-aware**: The active env and its packages are injected into the LLM system prompt via the `before_prompt_build` hook. The AI knows what's available and won't try to reinstall.
3. **Discoverable**: An env manifest (`~/.acaclaw/config/env-manifest.json`) lets other OpenClaw packages discover the active env and avoid duplicate installs.
4. **Auto-activated**: Shell commands are automatically prefixed with `conda run -n <env>` via the `before_tool_call` hook.

```
┌─────────────────────────────────────────────────────────────────┐
│  Discipline Environment Flow                                     │
│                                                                  │
│  1. User selects discipline during install                       │
│     "What is your primary research discipline?"                  │
│     → biology                                                    │
│                                                                  │
│  2. Self-contained env created from YAML                         │
│     conda env create -f environment-bio.yml                      │
│     → Creates acaclaw-bio with ALL packages                      │
│                                                                  │
│  3. Discipline saved to ~/.acaclaw/config/profile.txt            │
│     → "biology"                                                  │
│                                                                  │
│  4. On gateway start: academic-env plugin detects env            │
│     → Writes env manifest for cross-package discovery            │
│     → Injects env context into LLM system prompt                 │
│                                                                  │
│  5. LLM knows: "You have acaclaw-bio with numpy 1.26,            │
│     scipy 1.12, pandas 2.2, biopython 1.83, scikit-bio 0.6..."  │
│     → Uses packages directly, never reinstalls                   │
│                                                                  │
│  6. Other OpenClaw packages read env-manifest.json               │
│     → Know acaclaw-bio exists with these packages                │
│     → Skip redundant installs                                    │
└─────────────────────────────────────────────────────────────────┘
```

### Discipline Environments

| Discipline | Env name | Base packages included | Discipline-specific additions |
|---|---|---|---|
| General | `acaclaw` | NumPy, SciPy, Pandas, Matplotlib, Statsmodels, SymPy, JupyterLab, PyMuPDF, Semantic Scholar | — |
| Biology | `acaclaw-bio` | All base + | Biopython, scikit-bio |
| Chemistry | `acaclaw-chem` | All base + | RDKit |
| Medicine | `acaclaw-med` | All base + | lifelines, pydicom |
| Physics | `acaclaw-phys` | All base + | Astropy, lmfit |

Each env is defined by a **self-contained** YAML file — not a base + delta:

```yaml
# env/conda/environment-bio.yml — self-contained, includes ALL packages
name: acaclaw-bio
channels:
  - conda-forge
  - bioconda
dependencies:
  # === Base packages (same as environment-base.yml) ===
  - python=3.12
  - numpy>=1.26,<2.0
  - scipy>=1.12
  - pandas>=2.2
  - matplotlib>=3.8
  - statsmodels>=0.14
  - sympy>=1.12
  - jupyterlab>=4.1
  - openpyxl>=3.1
  - xlsxwriter>=3.2
  # === Biology-specific ===
  - biopython>=1.83
  - scikit-bio>=0.6
  - pip:
    - semanticscholar>=0.8
    - pymupdf>=1.24
```

### LLM Context Injection

The `@acaclaw/academic-env` plugin uses the `before_prompt_build` hook to inject environment information into the LLM's system prompt:

```
┌──────────────────────────────────────────────────────────────┐
│  System prompt addition (appended via appendSystemContext):   │
│                                                              │
│  ## Computing Environment                                    │
│  You have access to a pre-configured Python environment:     │
│  - Environment: acaclaw-bio (Biology)                        │
│  - Python: 3.12.8                                            │
│  - Available packages: numpy 1.26.4, scipy 1.12.0,           │
│    pandas 2.2.1, matplotlib 3.8.3, biopython 1.83,           │
│    scikit-bio 0.6.2, ...                                     │
│                                                              │
│  These packages are already installed. Use them directly      │
│  without pip install or conda install.                        │
│  Commands are auto-prefixed with conda run -n acaclaw-bio.   │
└──────────────────────────────────────────────────────────────┘
```

### Env Manifest (Cross-Package Discovery)

When the plugin starts, it writes `~/.acaclaw/config/env-manifest.json`:

```jsonc
{
  "discipline": "biology",
  "envName": "acaclaw-bio",
  "pythonVersion": "3.12.8",
  "condaPath": "/home/user/.acaclaw/miniforge3/bin/conda",
  "packages": ["numpy", "scipy", "pandas", "biopython", "scikit-bio"],
  "updatedAt": "2026-03-15T10:30:00Z"
}
```

Other OpenClaw packages can read this file to know:
- Which discipline env exists
- What packages are already available (no need to reinstall)
- Where conda is located (no PATH guessing)

### Conda-Based Isolation

AcaClaw uses [Miniforge](https://github.com/conda-forge/miniforge) for the scientific Python environment. This isolates the scientific stack from system Python and from OpenClaw's Node.js runtime.

```
~/.acaclaw/
├── miniforge3/
│   └── envs/
│       └── acaclaw-bio/             # Self-contained discipline env
│           ├── bin/python3          # Python 3.12+
│           └── lib/python3.12/site-packages/
│               ├── numpy/
│               ├── scipy/
│               ├── pandas/
│               ├── matplotlib/
│               ├── biopython/       # Discipline-specific
│               └── ...
├── backups/                         # File backup storage
├── config/
│   ├── profile.txt                  # Current discipline ("biology")
│   └── env-manifest.json           # Package discovery for other tools
└── audit/
    └── audit.jsonl                  # Security audit log
```

### Environment Compatibility Rules

| Rule | Description |
|---|---|
| **Self-contained envs** | Each discipline env includes ALL base packages plus discipline-specific ones. No overlays or `conda update` needed. |
| **One env per user** | A user runs one discipline env at a time. The active discipline is stored in `~/.acaclaw/config/profile.txt`. |
| **LLM awareness** | The active env and all available packages are injected into the LLM system prompt. The AI never tries to reinstall existing packages. |
| **Cross-package discovery** | An env manifest at `~/.acaclaw/config/env-manifest.json` lets other OpenClaw packages detect the active env and skip redundant installs. |
| **Auto-activation** | Shell commands are automatically prefixed with `conda run -n <env>` via the `before_tool_call` hook. Users never need to `conda activate` manually. |
| **Minimal deps** | Each skill declares only what it actually imports. No "nice to have" deps. |
| **Compatible ranges** | Version ranges are intersected across all skills per discipline. CI verifies resolution. |
| **Conflict = block** | If a new skill introduces an unresolvable conflict, it is not shipped until the conflict is resolved. |
| **User installs are separate** | Users can `conda install` additional packages. AcaClaw warns if this may conflict with pre-shipped skills. |
| **Clean uninstall** | The uninstaller asks whether to remove the Conda env. Removing AcaClaw does not remove OpenClaw. |

### Why This Is the Second Most Important Feature

Data safety (#1) protects researchers from losing work. Environment compatibility (#2) protects researchers from losing *time*. A single broken dependency can cost a researcher hours of debugging — hours they could spend on actual research. By resolving conflicts at the distribution level, AcaClaw eliminates an entire category of problems that researchers should never have to deal with.

This is also what makes the contributor model work: each skill is built by a team (creator, tester, debugger, maintainer), but those skills must compose. The environment compatibility pipeline is the technical foundation that makes the teamwork model possible — it is not enough for each skill to be individually excellent; they must work together.

### Tool Installation

System tools installed automatically by the installer:

| Tool | Purpose | Installed via |
|---|---|---|
| Pandoc | Document conversion (Word ↔ PDF) | System package manager |
| Poppler (pdftotext) | PDF text extraction | System package manager |
| Node.js 22 | OpenClaw runtime | Installer |
| Miniforge | Python environment manager | Installer |

### What Is NOT Installed by Default

| Tool | Why excluded | How to add |
|---|---|---|
| LaTeX (TeX Live, ~4 GB) | Most users just need Word/PDF via Pandoc | `acaclaw add latex` |
| Deep learning (PyTorch, TF) | Specialized; large download | `acaclaw add deeplearning` |
| Docker | Only needed for Maximum security mode | `acaclaw security set maximum` (installer offers if Docker detected) |

---

## Compatibility & Upgrade System

### Design Goal

Users click "Update" in the GUI (or run `acaclaw upgrade`). Everything updates safely. If something breaks, automatic rollback.

### Automated Compatibility Testing

```
CI Pipeline (compat-nightly.yml + compat-release.yml)
│
├── 1. Install latest OpenClaw from npm
├── 2. Install AcaClaw overlay
├── 3. Run compatibility tests:
│   ├── CLI commands functional
│   ├── All academic skills load and run
│   ├── All plugins register correctly
│   ├── ClawHub install/update works
│   ├── Sandbox execution works
│   ├── Backup plugin works
│   └── Security policies apply correctly
├── 4. Run environment tests:
│   ├── Python packages importable
│   ├── Pandoc conversion works
│   └── PDF tools work
├── 5. Generate compatibility report
├── 6. Update COMPATIBILITY.md if pass
└── 7. Open issue + alert maintainers if fail
```

### Upgrade Flow

```
acaclaw upgrade  (or click "Update" in GUI)
    │
    ├── 1. Backup current state (full snapshot)
    ├── 2. Check latest OpenClaw release
    ├── 3. Run pre-upgrade compatibility test (dry-run)
    ├── 4. Upgrade OpenClaw
    ├── 5. Re-apply AcaClaw configuration overlay
    ├── 6. Re-apply patches (if any exist in patches/)
    ├── 7. Run post-upgrade compatibility test
    ├── 8. Report results
    └── 9. If fail → automatic rollback to backup
```

### Version Matrix (COMPATIBILITY.md)

```markdown
| AcaClaw Version | OpenClaw Min | OpenClaw Max (Tested) | Status |
|---|---|---|---|
| 0.1.0 | 2026.3.1 | 2026.3.11 | ✅ Compatible |
```

---

## Patch Record System

> **Patches are an absolute last resort.** The design goal is zero patches. This system exists only as a safety net.

### Patch Lifecycle

1. **Record**: Named patch file in `patches/` with documentation
2. **Register**: Add to `patches/registry.json` with metadata + upstream issue link
3. **Auto-apply**: `acaclaw upgrade` re-applies registered patches after upgrade
4. **Auto-verify**: Compatibility tests verify patch still applies cleanly
5. **Retire**: When upstream fixes the issue, remove the patch

### Registry Format

```jsonc
// patches/registry.json
{
  "patches": [
    {
      "id": "0001-example",
      "file": "0001-example.patch",
      "description": "Example — not currently applied",
      "appliesTo": ">=2026.3.0 <2026.4.0",
      "upstreamIssue": "https://github.com/openclaw/openclaw/issues/XXXX",
      "status": "retired",             // active | retired
      "retiredInVersion": "2026.3.5",
      "autoApply": true
    }
  ]
}
```

### Principles

- Every patch MUST reference an upstream issue
- Every patch MUST have a clear retirement condition
- Patches MUST NOT alter OpenClaw's plugin SDK interface
- Prefer workarounds in AcaClaw's own code over patching OpenClaw
- If we need something OpenClaw doesn't support, contribute upstream

---

## Distribution Packaging

### Platform Installers

| Platform | Package format | What it installs |
|---|---|---|
| Windows | .exe (NSIS) | Node.js + OpenClaw + Miniforge + AcaClaw skills/plugins |
| macOS | .dmg | Same (uses Homebrew for system deps) |
| Linux | .AppImage + .deb + .rpm | Same (uses apt/dnf for system deps) |
| Advanced | `install.sh` / `install.ps1` | Same (for terminal-comfortable users) |

### What the Installer Does

```
1. Check/install Node.js 22
2. npm install -g openclaw@<tested-version>
3. Install Miniforge (if no conda found)
4. Ask user: "What is your primary research discipline?"
   → Creates self-contained env (e.g. acaclaw-bio) from discipline YAML
5. Install system tools (pandoc, poppler)
6. Install AcaClaw plugins (backup, security, academic-env, compat-checker)
7. Install curated skills from ClawHub (clawhub install <skill>)
8. Apply openclaw.json defaults (sandbox: all, backup: on, auth: required)
9. Save discipline to ~/.acaclaw/config/profile.txt
10. Run acaclaw doctor (verify everything works)
```

---

## Integration Points with OpenClaw

AcaClaw uses **only** these official OpenClaw extension points:

| Extension Point | AcaClaw Usage |
|---|---|
| **Skill system** (`SKILL.md`) | Curated skills installed from ClawHub + OpenClaw bundled |
| **Plugin SDK** (`OpenClawPluginApi`) | 4 plugins (backup, security, academic-env, compat-checker) |
| **`before_tool_call` hook** | File backup + security policy + conda run auto-prefix |
| **`before_prompt_build` hook** | LLM context injection (env packages, discipline info) |
| **`registerTool()`** | Restore tool, snapshot tool, env status tool |
| **`registerService()`** | Backup maintenance, network policy |
| **`registerCli()`** | `acaclaw` CLI subcommands (backup, security, env, compat) |
| **Configuration** (`openclaw.json`) | Sandbox, backup, security defaults |
| **Skill loading dirs** (`~/.openclaw/skills/`) | Skill installation target |
| **ClawHub** (`clawhub install`) | Community skill installation (fully compatible) |

### What AcaClaw Does NOT Touch

- OpenClaw source code (`src/`, `dist/`)
- OpenClaw's `node_modules/`
- OpenClaw's bundled skills
- OpenClaw's built-in channels or routing
- OpenClaw's build system or CI

---

## Design Decisions & Rationale

### D1: "One Best" over "Ship Everything"

**Decision**: For each capability, select and ship exactly one tool.

**Rationale**:
- Scientists are overwhelmed by too many choices ("which plotting library?")
- Fewer packages = smaller install, fewer conflicts, less maintenance
- Pre-configured best-in-class tools produce better results than unconfigured alternatives
- Additional tools available via ClawHub or conda for power users

### D2: GUI-first, terminal-optional

**Decision**: Design for GUI interaction. Terminal access is available but never required.

**Rationale**:
- Target users (chemists, biologists, medical researchers) rarely use terminals
- One-click install and natural-language interaction removes technical barriers
- The GUI wraps OpenClaw's existing CLI — no separate backend to maintain

### D3: Data backup as a core feature, not an afterthought

**Decision**: Build an OpenClaw plugin that automatically backs up every file before modification.

**Rationale**:
- Research data is irreplaceable — experimental results, years of notes, manuscripts
- AI agents can make mistakes; rollback must be trivial
- Scientists trust tools that protect their data, distrust tools that don't
- Versioned backups also enable reproducibility (audit trail of what changed and when)

### D4: No LaTeX by default

**Decision**: Don't install LaTeX (TeX Live) in the base profile. Use Pandoc for document conversion.

**Rationale**:
- TeX Live is ~4 GB — massive for users who just want Word ↔ PDF
- Most non-CS scientists don't know LaTeX and don't want to learn it
- Pandoc handles Word/PDF/HTML conversion without LaTeX for most cases
- LaTeX available as optional add-on for users who need it: `acaclaw add latex`

### D5: Conda over pip-only for Python environment

**Decision**: Use Miniforge/Conda for the scientific Python environment.

**Rationale**:
- Conda handles non-Python dependencies (LAPACK, MKL, CUDA) that pip cannot
- Conda environments are fully isolated from system Python
- Conda-forge has comprehensive scientific package coverage
- Reproducible across Linux, macOS, and Windows/WSL2

### D6: Skills over plugins for academic features

**Decision**: Implement most academic features as skills (SKILL.md), not plugins.

**Rationale**:
- Skills are simpler to author, review, and maintain
- Skills can be published to ClawHub individually
- Skills gracefully degrade when requirements aren't met
- Plugins are reserved for system-level concerns (backup, security, environment detection)

### D7: Tiered security — workspace security default, Docker sandbox optional

**Decision**: Offer two security levels. Standard (Workspace Security) uses OpenClaw's tool policy (`tools.fs.workspaceOnly`, deny lists) plus AcaClaw's `before_tool_call` hooks. Maximum (Sandbox Mode) adds Docker container isolation on top.

**Rationale**:
- Most academic users work on their own data in a project folder — workspace-level restrictions are sufficient and require zero extra setup
- Docker sandbox provides strong isolation but requires Docker installation, which is a barrier for non-technical users
- Standard mode works on every platform (Windows, macOS, Linux) without Docker

### D8: Contribute upstream, credit individuals

**Decision**: Publish all AcaClaw skills to ClawHub (the official OpenClaw hub) under a single `@acaclaw` account. Credit every individual contributor by name and role inside each SKILL.md and on AcaClaw Hub (acaclaw.com/hub).

**Rationale**:
- Diverging from the OpenClaw ecosystem (private registry, mirrored skills) fragments the community and creates maintenance burden
- Publishing to ClawHub means any OpenClaw user benefits, not just AcaClaw users
- ClawHub only shows the account owner (`by @acaclaw`) — individual credit must live in the SKILL.md body, which is rendered as the skill's page content
- The academic model (journal = publisher, authors = contributors) maps naturally to this: `@acaclaw` is the editorial board, contributors are the authors
- AcaClaw Hub (acaclaw.com/hub) provides a concentrated, people-first showcase that ClawHub's skill-first design doesn't
- Recognizing roles (creator, tester, debugger, maintainer) attracts and retains contributors — people contribute when they get credit
- Quality comes from this multi-person process: every skill is created, tested, debugged, reviewed, and maintained by named individuals

### D9: Discipline-specific self-contained environments

**Decision**: Each discipline gets a self-contained Conda environment (e.g. `acaclaw-bio`) that includes all base packages plus discipline-specific ones. The active env is auto-detected, injected into the LLM context, and discoverable by other OpenClaw packages. No overlays or per-skill envs.

**Rationale**:
- Self-contained envs are simpler than base + overlay — one `conda env create` instead of create + update
- LLM context injection means the AI knows what packages exist and never wastes time reinstalling them
- The env manifest (`env-manifest.json`) prevents duplicate installs when users add other OpenClaw packages
- Auto-activation via `before_tool_call` means users never need to `conda activate` manually
- Each discipline env is independently testable — CI can verify bio, chem, med, phys envs in parallel
- Clean uninstall: the uninstaller asks whether to remove the Conda env, giving users control

### D10: No OpenClaw source modifications

**Decision**: Zero modifications to OpenClaw source code, enforced by policy and CI.

**Rationale**:
- OpenClaw releases ~daily; maintaining patches is unsustainable
- OpenClaw's plugin SDK is comprehensive enough for our needs
- Source modifications create merge conflicts on every upgrade
- If we need something OpenClaw doesn't support, contribute upstream

### D11: MIT License

**Decision**: MIT for all AcaClaw-authored code.

**Rationale**:
- Compatible with OpenClaw's MIT license
- Maximally permissive for academic use (no copyleft friction)
- Universities often have IP policies that conflict with copyleft
- GPL/AGPL dependencies (Pandoc, PyMuPDF) invoked as separate processes, not linked

---

## Future Considerations

- **AcaClaw Desktop**: Full GUI for research workflows (Electron or Tauri)
- **Classroom mode**: Instructor assigns skills/policies to students
- **Offline mode**: Bundled local model for field research without internet
- **GPU profiles**: CUDA/ROCm environments for computational research
- **R / Julia support**: Extend beyond Python
- **Cloud backup**: Optional encrypted backup to university storage / cloud
- **Upstream contributions**: When AcaClaw identifies gaps in OpenClaw's plugin SDK, contribute PRs upstream

---
layout: page
title: Data Safety
lang: en
permalink: /en/data-safety/
---

> **Design Principle**: Research data is irreplaceable. Every file modification must be preceded by backup, every deletion must be recoverable, and every recovery must be verifiable.

---

## Overview

AcaClaw builds a multi-layer data protection system on top of OpenClaw. The system has two distinct backup layers that serve different purposes, plus a trash-based deletion safety net.

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

### Two Layers, Three Mechanisms

| | A1: Versioning | A2: Trash | A3: Periodic Sync | B: Workspace Snapshot |
|---|---|---|---|---|
| **Purpose** | Undo AI changes | Recover deleted files | Catch manual edits | Disaster recovery |
| **Default** | **ON** | **ON** | **ON** | **OFF** |
| **Trigger** | AI tool call | AI deletion | Timer / session start | Manual / scheduled |
| **Scope** | Individual files | Deleted files | Entire workspace | Full workspace tree |
| **Storage** | Small (dedup-aware) | Small | Small (dedup-shared) | Large (full copy) |
| **Disk risk** | Low | Low | Low | **High** |
| **Best for** | "Undo that edit" | "Recover deleted file" | "I edited in Jupyter" | "My disk died" |

---

## What OpenClaw Provides (Layer 1)

AcaClaw inherits these data safety mechanisms from OpenClaw without modification.

### Session Archiving

When a session is reset or deleted, OpenClaw does **not** immediately remove the transcript. Instead, it renames the file with a timestamp suffix:

| Action | Original file | Archived as |
|--------|--------------|-------------|
| Reset | `<sessionId>.jsonl` | `<sessionId>.jsonl.reset.<timestamp>` |
| Delete | `<sessionId>.jsonl` | `<sessionId>.jsonl.deleted.<timestamp>` |

Archives are retained according to `session.maintenance.resetArchiveRetention` (default: 30 days). This means accidentally resetting a session is always recoverable within the retention window.

### Session Maintenance

OpenClaw's session cleanup follows a strict order to prevent data loss:

1. Prune stale entries older than `pruneAfter` (default: 30 days)
2. Cap entry count to `maxEntries` (default: 500, oldest first)
3. Archive transcript files for removed entries (rename, not delete)
4. Purge old `.deleted.*` and `.reset.*` archives past retention
5. Rotate `sessions.json` when exceeding `rotateBytes` (default: 10 MB)
6. Enforce disk budget toward `highWaterBytes` (default: 80% of `maxDiskBytes`)

Key: cleanup only runs when `session.maintenance.mode` is `"enforce"` (default is `"warn"` — report only). AcaClaw sets `"enforce"` in both Standard and Maximum configs.

### Config File Rotation

OpenClaw keeps **5 rotating backups** of `openclaw.json`:

```
openclaw.json          ← current
openclaw.json.bak      ← previous
openclaw.json.bak.1    ← two versions ago
openclaw.json.bak.2
openclaw.json.bak.3
openclaw.json.bak.4    ← oldest preserved
```

All backups are written with `0o600` (owner-only) permissions. Orphan `.bak.*` files from crashed writes are auto-cleaned.

### Workspace Git Initialization

OpenClaw auto-initializes new workspaces as git repositories (`git init`). This provides:

- File-level version history via `git log`
- Ability to diff changes
- Recovery via `git checkout` or `git stash`

Git init is best-effort — workspace creation succeeds even if git is not installed.

### File Boundary Enforcement

OpenClaw prevents tools from accessing files outside allowed boundaries:

| Protection | What it prevents |
|-----------|------------------|
| Symlink escape detection | Tools cannot follow symlinks outside workspace |
| Path traversal rejection | `../` segments blocked in file operations |
| Sandbox mount restrictions | `/docker.sock`, `/etc`, `/proc`, `/sys`, `/dev` cannot be mounted |
| Container bind validation | Custom binds validated against allowed source roots |

### Dangerous Tool Approval

File-modifying tools (`fs_write`, `fs_delete`, `fs_move`, `apply_patch`, `exec`) require explicit approval before execution. Approval policies:

- `"deny"`: Block all host exec
- `"allowlist"`: Allow only pre-approved commands
- `"full"`: Allow everything (elevated privilege)

Approved commands are bound to specific executable paths and file operands — if the target file changes after approval, the approval is invalidated.

---

## Backup Layer A: Per-File Versioning + Trash (Default ON)

Layer A protects individual files through two mechanisms: pre-modification versioning and trash-based deletion.

### A1: Pre-Modification Versioning

The `@acaclaw/backup` plugin intercepts every file-modifying tool call and creates a verified backup **before** the modification proceeds.

### How It Works

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

### Block-on-Failure Policy

Unlike typical backup systems that "best-effort" and continue, AcaClaw **blocks the file modification** if backup fails. This is a deliberate design choice for academic data:

| Scenario | Result |
|----------|--------|
| Backup succeeds, checksums match | Tool call proceeds |
| Backup succeeds, checksums mismatch | Tool call **blocked** — data integrity issue |
| Backup I/O error (disk full, permissions) | Tool call **blocked** — cannot guarantee recovery |
| File doesn't exist yet (new file) | Tool call proceeds — nothing to back up |
| File matches exclude pattern | Tool call proceeds — excluded by policy |

The LLM receives a clear error message explaining why the write was blocked, so it can inform the user.

### Backup Storage Layout

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

The workspace ID is derived from the workspace root path: `<dirName>-<sha256(absPath)[0:12]>`. This keeps backups organized even when working across multiple projects.

### Metadata Records

Every backup includes a JSON metadata file:

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

This metadata enables:

- **Forensic recovery**: Know exactly which tool call modified the file and when
- **Integrity verification**: Compare checksums to confirm backup is uncorrupted
- **Selective restore**: Find the specific version from a specific session
- **Audit trail**: Trace data lineage across AI-driven modifications

### Dedup-Aware Versioning (Binary File Optimization)

By default, Layer A1 stores a **full copy** of every file before each modification. For small text files this is negligible, but for large binary files the cost adds up:

| File | Edits per day | Storage per day (full copy) |
|------|:------------:|:--------------------------:|
| `paper.docx` (5 MB) | 5 | 25 MB |
| `presentation.pptx` (50 MB) | 3 | 150 MB |
| `dataset.xlsx` (200 MB) | 2 | 400 MB |

AcaClaw mitigates this with **dedup-aware versioning** — two mechanisms that reduce storage without sacrificing recoverability.

#### 1. Skip-if-Unchanged

Before creating a backup copy, AcaClaw compares the file's current SHA-256 hash against the most recent backup's checksum. If they match, the backup is skipped — the file hasn't actually changed since the last backup.

```
Tool call: write presentation.pptx
  │
  ├─ SHA-256(current file) = abc123...
  ├─ SHA-256(latest backup) = abc123...  ← same!
  └─ Skip backup (no new copy needed)
```

This catches a common pattern: tools that rewrite a file with identical content (e.g., save-without-change, format-only rewrites, or batch operations that touch but don't modify files).

#### 2. Hardlink Deduplication

When multiple backups have identical content (same SHA-256), AcaClaw stores only one physical copy and creates [hardlinks](https://en.wikipedia.org/wiki/Hard_link) for subsequent versions. This is the same technique `rsync --link-dest` uses.

```
~/.acaclaw/backups/<workspace>/files/
├── 2026-03-14/
│   ├── 14-30-22.presentation.pptx      # 50 MB (physical copy)
│   └── 16-45-10.presentation.pptx      # 0 MB (hardlink to above — same content)
└── 2026-03-15/
    └── 09-10-05.presentation.pptx      # 50 MB (new physical copy — content changed)
```

Hardlinks are transparent — each backup path works independently for restore. If one hardlink is deleted, the others remain valid.

| Condition | Storage cost |
|-----------|:------------|
| File unchanged since last backup | 0 (skipped entirely) |
| File has same content as any existing backup | 0 (hardlink) |
| File content is new | Full copy (same as before) |

> **Platform note**: Hardlinks work on Linux, macOS, and NTFS (Windows). They do not work across filesystem boundaries — if `backupDir` is on a different mount point from the original, AcaClaw falls back to full copies.

### Excluded Files

By default, these patterns are excluded from backup (not worth backing up):

```
*.tmp
node_modules/
.git/
__pycache__/
```

Users can customize via `plugins.acaclaw-backup.excludePatterns`.

### Restoring Files

AcaClaw provides three ways to restore:

#### 1. Natural Language (via LLM)

```
User: "Undo the last change to results.csv"
LLM: calls backup_restore(filePath="data/results.csv", version=0)
→ "Restored data/results.csv from backup (2026-03-14T14:30:22Z)"
```

#### 2. LLM Tool: `backup_list` + `backup_restore`

```
User: "Show me all versions of my analysis script"
LLM: calls backup_list(filePath="src/analysis.py")
→ "[0] 2026-03-14T15:01:47Z — 12 KB — triggered by: edit
   [1] 2026-03-14T10:22:03Z — 11 KB — triggered by: apply_patch
   [2] 2026-03-13T09:15:00Z — 8 KB — triggered by: write"

User: "Restore version 2"
LLM: calls backup_restore(filePath="src/analysis.py", version=2)
```

#### 3. CLI: `openclaw acaclaw-backup`

```bash
# List backup versions
openclaw acaclaw-backup list data/results.csv

# Restore the most recent backup
openclaw acaclaw-backup restore data/results.csv

# Restore a specific version
openclaw acaclaw-backup restore data/results.csv --version 2
```

---

### A2: Trash-Based Deletion (No Permanent Delete)

When the AI agent deletes a file or folder, AcaClaw **moves it to a trash directory** instead of permanently deleting it. This is the last line of defense for accidental deletion.

#### How It Works

The `@acaclaw/backup` plugin intercepts deletion operations (`rm`, `fs_delete`, `rmdir`) and rewrites them as moves to the trash directory:

```
AI runs: rm data/old-results.csv
Plugin rewrites to: mv data/old-results.csv ~/.acaclaw/backups/.trash/2026-03-14/14-30-22.old-results.csv
```

This applies to:

| Operation | How it's intercepted |
|-----------|---------------------|
| `fs_delete` tool | `before_tool_call` hook rewrites to move |
| `rm` in bash/exec | Command rewriting in `before_tool_call` |
| `rm -r` (directory) | Entire directory moved to trash |
| `rmdir` | Intercepted and moved |

#### Trash Storage Layout

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

Each trashed item includes metadata:

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

#### Why Not System Trash?

| Concern | System trash (`~/.Trash/`) | AcaClaw trash (`.trash/`) |
|---------|---------------------------|---------------------------|
| Location consistency | Varies by OS and desktop env | Always `~/.acaclaw/backups/.trash/` |
| Metadata | No tool/session tracking | Full audit metadata |
| Retention policy | User-managed (manual empty) | Configurable auto-cleanup |
| CLI restore | Requires desktop tools | `openclaw acaclaw-backup restore-trash` |
| Headless/SSH | Often unavailable | Always works |
| Sandbox mode | System trash not accessible | AcaClaw trash is on mounted path |

OpenClaw itself uses the system `trash` command for its own config resets (`openclaw reset`). AcaClaw uses a separate `.trash/` directory so that research file deletion is decoupled from system-level operations and has full audit metadata.

#### Trash Retention

Trashed files are temporary — users control when they are permanently deleted:

| Setting | Default | Description |
|---------|---------|-------------|
| `trashRetentionDays` | 30 | Days before trashed files are auto-purged |
| `trashMaxStorageGB` | 5 | Maximum trash storage before oldest items are purged |

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

#### Restoring from Trash

```bash
# List trashed files
openclaw acaclaw-backup list-trash

# Restore a specific file to its original location
openclaw acaclaw-backup restore-trash data/old-results.csv

# Permanently empty trash (user-initiated only)
openclaw acaclaw-backup empty-trash
```

Or via natural language:

```
User: "I accidentally deleted old-results.csv, can you recover it?"
LLM: calls trash_restore(filePath="data/old-results.csv")
→ "Restored data/old-results.csv from trash (deleted 2026-03-14T14:30:22Z)"
```

---

### A3: Background Sync (rsync-Style, Idle-Only)

Layer A1 only triggers when the AI modifies files through tool calls. But researchers also edit files manually — in Jupyter notebooks, external editors, or via shell commands that bypass AcaClaw's hooks. **Background sync** closes this gap by scanning the workspace for changes **when the system is idle** — no active AI job running.

#### How It Works

AcaClaw maintains a **file manifest** (checksums + timestamps) and compares it against the current workspace state when idle — similar to how `rsync` detects changed files.

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

#### Idle-Only Scheduling

Sync never competes with active AI work:

| System state | Sync behavior |
|-------------|---------------|
| AI processing a request | **Not running** — zero overhead |
| Tool call in progress | **Not running** |
| Idle < grace period | **Waiting** — user may send next message |
| Idle ≥ grace period | **Running** — background priority |
| Job arrives during sync | **Paused** — resumes when idle again |
| No changes detected | Completes quickly (stat-only, no I/O) |

This means sync has **zero impact on AI response latency** and only uses disk I/O when the system would otherwise be doing nothing.

#### What This Catches

| Scenario | A1 hook | A3 sync |
|----------|:-------:|:-------:|
| AI edits a file via tool call | ✓ | ✓ (redundant, deduped) |
| User edits in Jupyter notebook | — | ✓ |
| User edits in external editor | — | ✓ |
| Shell command modifies file (`sed`, `awk`) | partial | ✓ |
| Pipeline writes new output files | — | ✓ (captures state for future undo) |

#### Fast Change Detection

Full SHA-256 of every file on every sync would be slow for large workspaces. AcaClaw uses a two-stage check (same strategy as rsync):

1. **Quick check**: Compare `mtime` + file size against manifest. If both match, skip. This takes <1ms per file.
2. **Hash check**: Only for files where mtime or size differ. Confirms whether content actually changed.

For a workspace with 10,000 files where 20 changed, this means ~10,000 stat calls (fast) + ~20 hash computations (proportional to changed data).

#### Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `syncEnabled` | `true` | Enable background sync |
| `syncIdleGraceSeconds` | `60` | Seconds of idle before sync starts |
| `syncMinIntervalMinutes` | `10` | Minimum time between sync runs (prevents thrashing on rapid idle/active cycles) |
| `syncExcludePatterns` | (same as A1 excludes) | Patterns to skip during sync |

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

Users can also trigger a manual sync at any time (bypasses idle check):

```bash
# Sync now (scan for changes and back up)
openclaw acaclaw-backup sync

# Sync with verbose output (shows what changed)
openclaw acaclaw-backup sync --verbose
```

#### Sync Manifest

The manifest lives alongside backups and records the last-known state of every tracked file:

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

A1 backups and A3 sync backups share the same `files/` directory and hardlink dedup pool — there is no duplication between the two mechanisms.

---

## Backup Layer B: Workspace Snapshot (Default OFF)

Layer B creates full point-in-time snapshots of the entire workspace. This is for disaster recovery — not for undo/redo of individual changes (that's Layer A's job).

### Why Default OFF

Workspace snapshots can be very large:

| Workspace size | Snapshot size | With 3 snapshots |
|---------------|--------------|-------------------|
| 100 MB | ~100 MB | ~300 MB |
| 1 GB | ~1 GB | ~3 GB |
| 10 GB (large dataset) | ~10 GB | ~30 GB |

For researchers working with large datasets (genomics, imaging, simulations), workspace snapshots could exceed available disk space. **Users must explicitly enable this feature and configure storage limits.**

### Enabling Workspace Snapshots

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

### What a Snapshot Includes

A snapshot captures **both** the OpenClaw workspace and the AcaClaw workspace:

| Directory | What it contains | Included? |
|-----------|-----------------|-----------|
| OpenClaw workspace (`~/.openclaw/workspace/`) | Agent memory, AGENTS.md, SOUL.md, user files | Yes |
| AcaClaw workspace (project directory) | Research data, scripts, papers | Yes |
| `~/.openclaw/agents/*/sessions/` | Session transcripts | No (use `openclaw backup` for this) |
| `~/.openclaw/credentials/` | API keys, OAuth | No (use `openclaw backup` for this) |
| `~/.acaclaw/backups/` | Layer A backups | No (would be circular) |

### Snapshot Storage Layout

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

### Snapshot Manifest

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

### Creating and Managing Snapshots

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

### Snapshot Rotation

When `maxSnapshots` is reached, the oldest snapshot is deleted before creating a new one. When `maxStorageGB` is exceeded, snapshots are deleted oldest-first until under budget.

---

## Compatibility with Git

OpenClaw auto-initializes workspaces as git repositories. AcaClaw's backup system is designed to **complement git, not replace it**. They serve different purposes and handle different file types well.

### Git vs AcaClaw Backup: Division of Labor

| File type | Git | AcaClaw backup | Recommendation |
|-----------|-----|----------------|----------------|
| Source code (`.py`, `.R`, `.md`) | Excellent (delta compression, diff, blame) | Works but no diff | Use git for versioning, AcaClaw for undo safety |
| Small data (`.csv`, `.json`, `.tsv`) | Good (text-based diff) | Works | Use git for milestones, AcaClaw for every-change safety |
| Binary documents (`.docx`, `.pptx`, `.xlsx`) | Poor (full copy each commit, no diff) | Works (full copy, same cost) | **Use AcaClaw backup only** — skip git for these |
| Large binary (`.h5`, `.zarr`, `.nii`, images) | Very poor (bloats `.git/`) | Works but uses disk space | **Exclude from both** — use external storage |
| Generated output (`.pdf`, plots) | Unnecessary (regenerable) | AcaClaw trash catches accidental deletion | Exclude from git; AcaClaw trash is enough |

### How AcaClaw Avoids Git Conflicts

AcaClaw backup uses `~/.acaclaw/backups/` — a completely separate directory from the workspace. It never writes inside the workspace's `.git/` directory or interferes with git operations.

| Concern | How it's handled |
|---------|-----------------|
| Backup files appear in `git status` | No — backups are outside the workspace |
| `.trash/` appears in `git status` | No — trash is in `~/.acaclaw/backups/.trash/`, not in workspace |
| Snapshot archives in workspace | No — snapshots are in `~/.acaclaw/backups/snapshots/` |
| AcaClaw metadata in workspace | `~/.acaclaw/` has its own `.gitignore` with `*` (excludes all) |

### Recommended `.gitignore` for Research Workspaces

AcaClaw recommends adding a `.gitignore` to the workspace to keep git clean:

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

This `.gitignore` ensures git tracks what it's good at (text, code, small data) while AcaClaw's Layer A backup handles binary files that git struggles with.

### Git for Milestones, AcaClaw for Safety Net

The recommended workflow:

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

### Binary Files: Efficient Handling

Git stores binary files as full copies on every commit. A 50 MB PowerPoint committed 10 times produces ~500 MB of git history.

AcaClaw handles binary files more efficiently through dedup-aware versioning (skip-if-unchanged + hardlink dedup) and periodic sync:

| Feature | Git | AcaClaw A1 + A3 |
|---------|-----|-----------------|
| Same-content versions | Full copy each commit | Deduplicated (hardlink or skipped) |
| Storage growth | Linear with commits, forever | Bounded by `retentionDays` + `maxStorageGB` |
| Cleanup | Manual `git gc`, aggressive repack | Automatic retention-based pruning |
| Change detection | Content hash on `git add` | mtime + size fast-path, hash only when needed |
| Catches manual edits | Only if user runs `git add/commit` | Automatic via A3 periodic sync |
| `.git/` bloat | Yes — clone gets full history | No — backups are outside workspace |

**Practical storage example** (50 MB `.pptx`, 10 edits/week, 3 actually change content):

| Method | Storage after 4 weeks |
|--------|:---------------------:|
| Git (no LFS) | 2 GB (40 full copies in `.git/`) |
| AcaClaw A1 without dedup | 2 GB (40 full copies) |
| AcaClaw A1 with dedup | **~150 MB** (3 unique versions/week × 4 = 12 copies, rest hardlinked) |
| AcaClaw A1 with dedup + 30d retention | **~150 MB** then auto-pruned |

For large binary datasets (> 100 MB per file), neither git nor AcaClaw backup is appropriate. Researchers should use dedicated data management:

| Tool | Use case |
|------|----------|
| Git LFS | Binary files that must be version-controlled with git |
| DVC (Data Version Control) | ML datasets and experiment tracking |
| University NAS / cloud storage | Raw instrument data, imaging scans |
| S3 / GCS buckets | Large-scale data storage with versioning |

---

## Additional Deletion Safeguards

Beyond the trash system (Layer A2), AcaClaw has additional controls that prevent data loss:

| Control | Mechanism |
|---------|-----------|
| **Tool deny-list** | `@acaclaw/security` blocks `fs_delete`, `sessions_spawn`, `gateway` |
| **Command deny-list** | `rm -rf`, `shred`, `chmod 777` and 12 other patterns blocked |
| **Workspace confinement** | `workspaceOnly: true` — tools cannot access files outside workspace |
| **Sandbox isolation** (Maximum mode) | Docker container with read-only rootfs, only `/workspace` mounted |

Even if a deletion command bypasses the deny-list (e.g., a novel command pattern), Layer A's backup plugin has already copied the file before the command executes — and the trash system catches any `rm`/`fs_delete` operations directly.

---

## Retention & Cleanup Policy

### Default Retention

| Data type | Retention | Controlled by |
|-----------|-----------|---------------|
| Layer A1/A3 file backups | 30 days | `plugins.acaclaw-backup.retentionDays` |
| Trash files | 30 days | `plugins.acaclaw-backup.trashRetentionDays` |
| A3 sync manifest | Permanent (metadata only) | Auto-maintained |
| Layer B workspace snapshots | Count-based (3) | `plugins.acaclaw-backup.workspaceSnapshot.maxSnapshots` |
| Session transcripts | 30 days | `session.maintenance.pruneAfter` |
| Session reset archives | 30 days | `session.maintenance.resetArchiveRetention` |
| Audit logs | 90 days | `plugins.acaclaw-security.auditRetentionDays` |
| Config backups | Last 5 versions | OpenClaw built-in (not configurable) |

### Storage Budgets

| Budget | Default | Scope |
|--------|---------|-------|
| Layer A1 + A3 file backups (shared) | 10 GB | `maxStorageGB` |
| Trash | 5 GB | `trashMaxStorageGB` |
| Layer B snapshots | 20 GB | `workspaceSnapshot.maxStorageGB` |

### When Users Can Delete Data

Users have full control. All deletion is user-initiated (except retention-based auto-pruning).

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

### Long-Term Archival

For research data that needs long-term preservation (grant requirements, publication reproducibility):

| Strategy | What it preserves | Off-machine? |
|----------|------------------|:------------:|
| Git + remote (`git push`) | Text/code version history | Yes |
| `openclaw backup create` | Full state (sessions, config, credentials, workspace) | `.tar.gz` — copy anywhere |
| External tools (Time Machine, rsync, university NAS) | Everything under `~/.acaclaw/` | Depends on tool |
| Layer B snapshots | Workspace at a point in time | No (local only) |

---

## Data Flow Summary

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

## Configuration Reference

### Backup Plugin (`@acaclaw/backup`)

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

### Session Maintenance (OpenClaw)

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

## Comparison: OpenClaw vs AcaClaw Data Safety

| Protection | OpenClaw | AcaClaw |
|-----------|:--------:|:-------:|
| Session archiving (rename, not delete) | ✓ | ✓ (inherited) |
| Config file rotation (5 backups) | ✓ | ✓ (inherited) |
| Workspace git auto-init | ✓ | ✓ (inherited) |
| File boundary enforcement | ✓ | ✓ (inherited) |
| Exec approval system | ✓ | ✓ (inherited) |
| `.tar.gz` full backup CLI | ✓ | ✓ (inherited) |
| Pre-modification file backup (Layer A1) | — | ✓ (`@acaclaw/backup`) |
| Dedup-aware versioning (skip + hardlink) | — | ✓ (`@acaclaw/backup`) |
| SHA-256 integrity verification | — | ✓ (`@acaclaw/backup`) |
| Block-on-backup-failure | — | ✓ (`@acaclaw/backup`) |
| Per-file version history with metadata | — | ✓ (`@acaclaw/backup`) |
| Trash-based deletion (Layer A2) | — | ✓ (`@acaclaw/backup`) |
| Periodic sync for manual edits (A3) | — | ✓ (`@acaclaw/backup`) |
| Workspace snapshots (Layer B) | — | ✓ (opt-in, `@acaclaw/backup`) |
| Natural language restore | — | ✓ (`backup_restore` / `trash_restore` tools) |
| Deletion command deny-list | — | ✓ (`@acaclaw/security`) |
| Dangerous tool deny-list | — | ✓ (`@acaclaw/security`) |
| Workspace confinement (default) | — | ✓ (config overlay) |
| Audit trail for all file operations | — | ✓ (`@acaclaw/security`) |
| Git-compatible (binary-aware) design | — | ✓ (separate storage, `.gitignore` guidance) |
| Configurable retention + storage budgets | partial | ✓ (per-layer budgets) |

---
layout: page
title: Architecture
lang: en
permalink: /en/architecture/
---

> **Design Principle**: AcaClaw is a distribution, not a fork. Every customization lives in OpenClaw's extension points — skills, plugins, configuration, and environment. Zero source code modifications.

---

## Design Philosophy

### Target Users

AcaClaw is designed for **scientists who are not software engineers**: chemists, physicists, biologists, medical researchers, and students. Every design decision must pass this test: **"Would a biology grad student who has never opened a terminal be able to use this?"**

### The Ubuntu Analogy

| Linux Ecosystem | AcaClaw Ecosystem |
|---|---|
| Linux Kernel | OpenClaw (gateway, agent, CLI, plugin SDK) |
| Ubuntu Desktop | AcaClaw (curated distribution + GUI) |
| apt packages | ClawHub skills + AcaClaw skills |
| apt dependency resolution | AcaClaw environment compatibility testing |
| Ubuntu Security (AppArmor) | AcaClaw security plugin + sandbox-by-default |
| Ubuntu LTS | AcaClaw compatibility-tested OpenClaw versions |

### Core Principles

1. **Non-invasive** — Never modify OpenClaw source code. Work through skills, plugins, config, and environments.
2. **One best** — For each capability, ship exactly one tool — the best one. Pre-configured. Works out of the box.
3. **Data is sacred** — Every file modification is preceded by automatic backup. No exceptions.
4. **Zero-knowledge UX** — Users should never encounter "install X dependency" or "run this command".
5. **Layered independence** — AcaClaw sits ON TOP of OpenClaw, never below. OpenClaw can be upgraded independently.
6. **Security-first** — Stricter defaults than upstream. Workspace-restricted by default.
7. **Contribute, don't diverge** — Every skill is published to ClawHub. We never maintain a parallel ecosystem.
8. **Environment compatibility** — Every pre-shipped skill is tested together in a single curated environment.

---

## Layer Model

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 6: AcaClaw Web GUI (design: /en/desktop-gui/)          │
│  Research-focused interface — no terminal needed             │
├─────────────────────────────────────────────────────────────┤
│  Layer 5: User Workspace                                     │
│  User-installed ClawHub skills, personal data, projects      │
├─────────────────────────────────────────────────────────────┤
│  Layer 4: Curated Academic Skills (from ClawHub + bundled)    │
│  Installed via clawhub CLI, organized in acaclaw-skills repo │
├─────────────────────────────────────────────────────────────┤
│  Layer 3: AcaClaw Plugins                                    │
│  @acaclaw/workspace, @acaclaw/security, @acaclaw/backup,    │
│  @acaclaw/academic-env, @acaclaw/compat-checker              │
├─────────────────────────────────────────────────────────────┤
│  Layer 2: AcaClaw Environment                                │
│  Miniforge + Python + R (opt-in) + Conda envs on demand      │
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
| **Config overlay** | AcaClaw writes to `openclaw.json` using `openclaw config set` |
| **GUI wraps CLI** | The GUI (L6) calls OpenClaw/AcaClaw commands underneath |

---

## The "One Best" Principle

AcaClaw ships **one best tool per job**, pre-configured and tested together.

### Selection Criteria

| Criterion | Weight | Description |
|---|---|---|
| **Accuracy / Quality** | Critical | Must produce correct, publication-grade results |
| **Ease of use (for AI)** | High | The AI agent must be able to operate it reliably |
| **License** | High | MIT/BSD/Apache preferred; GPL/AGPL acceptable as separate process |
| **Maintenance** | High | Actively maintained, responsive to bugs |
| **Size** | Medium | Smaller install footprint preferred |

### What We Deliberately Exclude

| Excluded | Reason |
|---|---|
| Multiple plotting libraries at install time | One (Matplotlib) is enough; users can add others via ClawHub |
| Deep learning frameworks in base install | Most researchers don't need them; available as optional profile |
| LaTeX (TeX Live) in base install | ~4 GB; Pandoc handles conversion. Available as optional add-on |
| IDE/editor tools | Scientists don't need code editors; AcaClaw handles code internally |

---

## Component Architecture

```
acaclaw/
├── plugins/                          # OpenClaw plugins (npm packages)
│   ├── workspace/                    # @acaclaw/workspace
│   ├── backup/                       # @acaclaw/backup
│   ├── security/                     # @acaclaw/security
│   ├── academic-env/                 # @acaclaw/academic-env
│   └── compat-checker/               # @acaclaw/compat-checker
│
├── skills.json                       # Curated skill manifest
├── env/conda/                        # Environment definitions
│   ├── environment-base.yml          # General academic (acaclaw)
│   ├── environment-bio.yml           # Biology (acaclaw-bio)
│   ├── environment-chem.yml          # Chemistry (acaclaw-chem)
│   ├── environment-med.yml           # Medicine (acaclaw-med)
│   └── environment-phys.yml          # Physics (acaclaw-phys)
│
├── config/                           # Configuration overlays
│   ├── openclaw-defaults.json        # AcaClaw defaults
│   └── openclaw-maximum.json         # Maximum security policy
│
├── scripts/
│   ├── install.sh                    # One-line installer
│   └── uninstall.sh                  # Uninstaller
│
└── docs/                             # Documentation (this site)
```

---

## Skill Architecture

AcaClaw **curates, creates, tests, and publishes** high-quality academic skills to ClawHub so the entire OpenClaw community benefits.

### Contribute, Don't Diverge

| What we do | What we don't do |
|---|---|
| Publish all skills to ClawHub | Mirror skills on our own servers |
| Credit every contributor by name and role | Publish under a team brand without attribution |
| Install skills from ClawHub (official client) | Bypass ClawHub API |
| Test all skills together in one environment | Ship skills with conflicting dependencies |
| File bugs and PRs upstream on OpenClaw | Fork OpenClaw or maintain patches |

### Contributor Attribution Model

Every AcaClaw skill includes a Contributors section rendered on the ClawHub skill page:

| Role | Description |
|------|-------------|
| **Creator** | Original author who designed and implemented the skill |
| **Author** | Wrote significant portions of the skill's functionality |
| **Tester** | Validated across environments, wrote test cases |
| **Maintainer** | Keeps the skill updated with new OpenClaw releases |
| **Debugger** | Fixed critical bugs or edge cases |
| **Reviewer** | Reviewed code and provided quality feedback |
| **Documenter** | Wrote usage guides, examples, or translations |

### Quality Gates

| Quality gate | What it checks |
|---|---|
| **Code review** | At least one reviewer signs off |
| **Integration tests** | Skill runs against pinned OpenClaw version |
| **Environment compatibility** | Dependencies resolve cleanly in shared Conda env |
| **Security review** | No exfiltration, no dangerous commands |
| **Compatibility test** | Works in both Standard and Maximum security modes |
| **Attribution check** | `## Contributors` section present and complete |

### Publishing Workflow

```
1. Contributor opens PR in acaclaw-skills repo
2. AcaClaw team reviews (code, tests, security, compatibility)
3. PR merged → CI publishes to ClawHub under @acaclaw account
4. skills.json updated with new version
5. AcaClaw Hub (acaclaw.com/hub) rebuilt with contributor data
```

---

## Environment Architecture

> Full documentation: [Computing Environment](/en/computing-environment/)

AcaClaw uses Miniforge (conda-forge) to manage Python and R in isolated Conda environments. The design follows three stages:

1. **Base Install** — Miniforge + Python + core scientific stack in a single `acaclaw` env
2. **Discipline Selection** — Must-have packages for chosen disciplines are merged into the base env. R is opt-in.
3. **On-Demand Packages** — New packages are installed into the default env first. Only on conflict, a new auxiliary env is created and registered.

### Environments

| Discipline | Add-on Name | Python Packages | R Packages (opt-in) |
|---|---|---|---|
| Biology | bioclaw | biopython, scikit-bio | r-biocmanager |
| Chemistry | chemclaw | rdkit | — |
| Medicine | medclaw | lifelines, pydicom | r-survival |
| Science/Physics | sciclaw | astropy, lmfit | — |

### Environment Compatibility Rules

- One primary environment (`acaclaw`) with all disciplines merged — no duplication
- R is opt-in — not installed by default
- New packages try the default env first; auxiliary envs created only on conflict
- All envs are registered in `~/.acaclaw/config/env-manifest.json` and injected into LLM context
- Miniforge (conda-forge) handles cross-language dependency resolution between Python and R
- See [Computing Environment](/en/computing-environment/) for the full cascade resolution design

---

## Data Safety Architecture

> Full documentation: [Data Safety](/en/data-safety/)

Research data is irreplaceable. AcaClaw builds a two-layer data protection system on top of OpenClaw's infrastructure:

| Layer | What it does | Default | Provided by |
|-------|-------------|---------|-------------|
| **OpenClaw Infrastructure** | Session archiving, config rotation, boundary enforcement, workspace git init, full backup CLI | Always ON | OpenClaw (inherited) |
| **Layer A: Per-File Versioning + Trash + Sync** | A1: Pre-modification backup (dedup-aware, SHA-256); A2: trash-based deletion; A3: idle-triggered rsync-style sync for manual edits | Always ON | `@acaclaw/backup` |
| **Layer B: Workspace Snapshots** | Full `.tar.gz` snapshots of workspace + config for disaster recovery | OFF (opt-in) | `@acaclaw/backup` |

### Key Safety Guarantees

| Guarantee | How it works |
|---|---|
| **No file modified without backup** | `before_tool_call` hook blocks writes until backup completes (Layer A1) |
| **No file permanently deleted** | Deletions intercepted and moved to `.trash/` with metadata (Layer A2) |
| **Backup integrity verified** | SHA-256 checksum on backup verified against original |
| **Restore always possible** | Natural language, LLM tools, or CLI |
| **Storage is bounded** | Per-layer configurable retention and storage budgets |
| **Backups survive crashes** | Write-ahead: backup completed before modification begins |
| **Git-compatible** | AcaClaw backups stored outside git; `.gitignore` guidance provided |

See [Data Safety](/en/data-safety/) for the complete design including trash system, workspace snapshots, git compatibility, retention policies, and configuration reference.

---

## Integration Points with OpenClaw

AcaClaw ONLY uses these official OpenClaw APIs:

| Integration point | What AcaClaw uses it for |
|---|---|
| `OpenClawPluginApi` | Register plugins, tools, hooks, CLI commands |
| `openclaw.json` | Apply default config (workspace path, security, tool policy) |
| SKILL.md format | Define and install academic skills |
| `clawhub` CLI | Install skills from ClawHub registry |
| `openclaw config set` | Set configuration values during install |
| `openclaw gateway run` | Start the gateway (wrapped by AcaClaw installer) |
| Docker sandbox config | `agents.defaults.sandbox.*` for Maximum mode |

If OpenClaw doesn't provide an API for something, AcaClaw Does. Not. Do. It.

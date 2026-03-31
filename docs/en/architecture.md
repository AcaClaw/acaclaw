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
9. **Don't re-implement** — Never re-implement what OpenClaw already provides. Use it, display it, configure it through OpenClaw's APIs.

---

## Responsibility Boundary

AcaClaw is a distribution layer — it builds on top of OpenClaw, not alongside it. The following table defines what each layer owns:

| Responsibility | Owner | AcaClaw's Role |
|---|---|---|
| **LLM handling** (model routing, streaming, tool calls) | OpenClaw | Use as-is — never re-implement |
| **API key storage** | OpenClaw config (`~/.openclaw/openclaw.json`) | Read and display; write via `config.set key/value` |
| **Model discovery** (provider catalogs, model lists) | OpenClaw extensions | Query via `models.list` — never maintain a separate catalog |
| **Provider URLs and auth** | OpenClaw extensions | Never hardcode — OpenClaw resolves these automatically |

> See [Providers & Models](/en/providers-and-models/) for the full provider architecture, model mapping, API reference, and AcaClaw GUI integration method.

| **Chat, sessions, message history** | OpenClaw gateway | Use via WebSocket RPC |
| **Plugin SDK, skill system, CLI** | OpenClaw | Use as-is |
| **Web GUI** | AcaClaw | AcaClaw's own research-focused UI |
| **Workspace and project system** | AcaClaw plugin | AcaClaw value-add |
| **Security policies** | AcaClaw plugin | Stricter defaults than OpenClaw |
| **Data backup** | AcaClaw plugin | AcaClaw value-add |
| **Academic skills** | AcaClaw + ClawHub | Curated discipline-specific skills |
| **Computing environment** | AcaClaw | Conda environments for each discipline |

### The Golden Rule

> **If OpenClaw already does it, don't re-implement it. AcaClaw's UI and OpenClaw's UI are both frontends to the same OpenClaw backend. The functionality is implemented once — in OpenClaw. Both UIs just use and display it.**

### Configuration

AcaClaw writes to OpenClaw's config using `openclaw config set` (CLI) or `config.set` (WebSocket RPC). The correct way to set a provider API key:

```bash
# Via CLI
openclaw config set models.providers.openrouter.apiKey "sk-or-..."

# Via environment variable
export OPENROUTER_API_KEY="sk-or-..."
```

AcaClaw's UI uses the same simple `config.set key/value` RPC that the onboarding wizard uses. It never reads the full config, mutates it, and writes it back. OpenClaw handles schema validation, default values, URL resolution, and model discovery.

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

## Directory Layout

AcaClaw uses two directories at runtime. Each has a clear purpose:

```
~/.openclaw/                      ← OpenClaw directory (config + managed state)
├── openclaw.json                 ← Single source of truth for ALL config
│   ├── models.providers.*        ← API keys, provider auth (OpenClaw handles)
│   ├── agents.*                  ← Agent definitions, default model (OpenClaw)
│   └── (future) acaclaw.*       ← AcaClaw plugin config (via config.set)
├── extensions/                   ← Installed OpenClaw extensions
├── skills/                       ← Installed skills
├── agents/                       ← Agent session data
├── ui/                           ← AcaClaw web UI (served by gateway)
├── memory/, logs/, completions/  ← OpenClaw runtime data
└── identity/                     ← Gateway identity

~/.acaclaw/                       ← AcaClaw runtime DATA only (not config)
├── backups/                      ← Versioned file backups (large data)
├── audit/                        ← Security audit logs (append-only)
├── config/                       ← [MIGRATION PENDING] → openclaw.json
│   ├── plugins.json              ← → acaclaw.* in openclaw.json
│   ├── security-mode.txt         ← → agents.defaults.sandbox.mode
│   └── setup-pending.json        ← → acaclaw.setup.* in openclaw.json
├── gateway.log                   ← Gateway runtime log
├── start.sh, stop.sh             ← Runtime scripts
└── browser-app/                  ← Electron/browser app data
```

### Design Principles

| Principle | Rule |
|---|---|
| **Config in OpenClaw** | All configuration lives in `openclaw.json`, written via `config.set`. AcaClaw never maintains a parallel config system. |
| **Data in AcaClaw** | Large files (backups), append-only logs (audit), and runtime artifacts (scripts, Electron cache) live in `~/.acaclaw/`. |
| **Shared directory** | AcaClaw uses the default `~/.openclaw/` directory. If the user already has a standalone OpenClaw install, AcaClaw inherits its API keys via `$include` and adds its own config on top. |
| **No direct file writes** | AcaClaw never writes directly to `~/.openclaw/` — always through OpenClaw's `config.set` API or plugin registration. |

### Migration Plan

`~/.acaclaw/config/` currently holds AcaClaw plugin settings that should migrate into `openclaw.json`. Until migration is complete:

- `plugins.json` settings will move to `acaclaw.*` namespace in `openclaw.json`
- `security-mode.txt` will use `agents.defaults.sandbox.mode`
- `setup-pending.json` will use `acaclaw.setup.*` namespace
- After migration, `~/.acaclaw/config/` will be removed
- `~/.acaclaw/` will contain only runtime data: backups, audit logs, gateway log, scripts

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

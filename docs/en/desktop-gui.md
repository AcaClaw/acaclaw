---
layout: page
title: Web GUI
lang: en
permalink: /en/desktop-gui/
---

> **Design Principle**: After install, no user should ever need a terminal. Every operation — monitoring, configuration, skill management, backup, security — is available through the GUI.

---

## Table of Contents

- [Philosophy](#philosophy)
- [Architecture](#architecture)
- [Screen Map](#screen-map)
- [1. Dashboard (Home)](#1-dashboard-home)
- [2. Agent Monitor](#2-agent-monitor)
- [3. Skills and Environment](#3-skills-and-environment)
- [4. API Keys and Providers](#4-api-keys-and-providers)
- [5. Gateway and Connections](#5-gateway-and-connections)
- [6. Security, Backup, and Workspace](#6-security-backup-and-workspace)
- [7. Setup Wizard (Browser-Based)](#7-setup-wizard-browser-based)
- [What AcaClaw's UI Includes](#what-acaclaws-ui-includes)
- [Implementation Approach](#implementation-approach)
- [Desktop Launch](#desktop-launch)
  - [→ Full auth and token details](/en/auth-and-app-launch/)
- [GUI-to-CLI Mapping](#gui-to-cli-mapping)

---

## Philosophy

### Minimal Terminal Usage

AcaClaw targets scientists who are not software engineers. The terminal is acceptable during initial install (download, run installer script), but after that, every operation must be available through the web GUI.

| Phase | Terminal needed? | What the user does |
|---|---|---|
| **Install** | Yes (one command) | Run install script, then setup wizard opens in browser |
| **First launch** | No | Wizard: choose discipline, enter API key, done |
| **Daily use** | No | Chat, view results, manage files |
| **Configuration** | No | GUI settings panels |
| **Monitoring** | No | Dashboard with live metrics |
| **Skill management** | No | Browse, install, update from GUI |
| **Backup / restore** | No | One-click restore from GUI |
| **Troubleshooting** | No | Built-in diagnostics panel |

### GUI Wraps CLI

The GUI calls OpenClaw and AcaClaw commands underneath. Every GUI action maps to a CLI command or gateway API call. This means:

- Power users can still use the CLI for everything
- The GUI never bypasses the CLI — it's a visual wrapper
- If the CLI can do it, the GUI can do it
- If the GUI can't do it, neither should the user need to

### One Window, Many Panels

AcaClaw uses a single-window design with a sidebar navigation. No pop-up windows, no multi-window management. Scientists should never lose track of where they are.

---

## Architecture

### Coexistence with OpenClaw

AcaClaw uses the default `~/.openclaw/` directory. If the user already has a standalone OpenClaw install, AcaClaw inherits its API keys via `$include` and adds its own config on top. AcaClaw never modifies OpenClaw source code — all customization lives in config overlays and plugins.

```
~/.openclaw/                      ← OpenClaw directory (config + managed state)
├── openclaw.json                 ← Single source of truth for ALL config
│   ├── models.providers.*        ← API keys, provider auth (OpenClaw handles)
│   ├── agents.*                  ← Agent definitions, default model (OpenClaw)
│   └── (future) acaclaw.*       ← AcaClaw plugin config (via config.set)
├── extensions/                   ← Installed OpenClaw extensions + AcaClaw plugins
├── skills/                       ← Installed skills (curated academic + user)
├── agents/                       ← Agent session data
├── ui/                           ← AcaClaw web UI (served by gateway)
├── memory/, logs/, completions/  ← OpenClaw runtime data
└── identity/                     ← Gateway identity

~/.acaclaw/                       ← AcaClaw runtime DATA only (not config)
├── backups/                      ← Versioned file backups (large data)
├── audit/                        ← Security audit logs (append-only)
├── miniforge3/                   ← Conda installation
├── gateway.log                   ← Gateway runtime log
├── start.sh, stop.sh             ← Runtime scripts
└── browser-app/                  ← Browser app data
```

**How config inheritance works:**

AcaClaw's config at `~/.openclaw/openclaw.json` uses OpenClaw's `$include` directive to inherit the user's existing settings:

```json
{
  "$include": "~/.openclaw/openclaw.json",
  "gateway": {
    "port": 2090,
    "controlUi": {
      "basePath": "/",
      "root": "~/.openclaw/ui"
    }
  },
  "agents": {
    "defaults": { "workspace": "~/AcaClaw" }
  },
  "tools": { ... },
  "plugins": { ... }
}
```

Deep merge behavior: AcaClaw's values (workspace, security, plugins) override. The user's API keys, model preferences, and channel configs flow through from the included file. If no existing OpenClaw install exists, `$include` is omitted and AcaClaw runs standalone.

**Key guarantees:**

| Scenario | Behavior |
|---|---|
| User has existing OpenClaw | AcaClaw inherits API keys via `$include`, never writes to `~/.openclaw/` |
| User updates OpenClaw | `npm install -g openclaw@latest` — AcaClaw unaffected |
| User uninstalls AcaClaw | `rm -rf ~/.acaclaw` and remove AcaClaw entries from `~/.openclaw/openclaw.json` |
| User runs both | OpenClaw gateway on default port, AcaClaw gateway on 2090 (separate gateways, same config) |
| User installs AcaClaw first | AcaClaw creates standalone config; OpenClaw installed later shares the same directory |

### Two UIs, Two Gateways

AcaClaw ships its own browser UI — a standalone SPA built with Lit, designed for academic workflows. OpenClaw's built-in admin dashboard remains available on the default gateway for advanced features.

Two gateways, two ports, same WebSocket API. Two frontends, each serving a different audience.

```
http://localhost:2090           → AcaClaw UI  (scientists' workspace)
http://localhost:18789          → OpenClaw UI (channels, debug, cron — unchanged)
```

```
┌───────────────────────────────────────────────────────────┐
│  Browser                                                   │
│                                                            │
│  ┌──────── :2090 ────────────┐  ┌──── :18789 ──────────┐  │
│  │  AcaClaw UI               │  │  OpenClaw UI          │  │
│  │  (academic workspace)     │  │  (full admin)         │  │
│  │                           │  │                       │  │
│  │  ┌─────────┐ ┌────────┐  │  │  13 tabs:             │  │
│  │  │ Sidebar  │ │ Main   │  │  │  chat, overview,      │  │
│  │  │          │ │ area   │  │  │  channels, instances,  │  │
│  │  │ Overview │ │        │  │  │  sessions, usage,      │  │
│  │  │ Chat     │ │        │  │  │  cron, agents, skills, │  │
│  │  │ Usage    │ │        │  │  │  nodes, config,        │  │
│  │  │ Skills   │ │        │  │  │  debug, logs           │  │
│  │  │ Environ. │ │        │  │  │                       │  │
│  │  │ Backup   │ │        │  │  │  (unchanged, served   │  │
│  │  │ Settings │ │        │  │  │   by default gateway) │  │
│  │  └─────────┘ └────────┘  │  └───────────────────────┘  │
│  └───────────┬───────────────┘             │               │
│              │          WebSocket (JSON-RPC)│               │
│              │                             │               │
├──────────────┼─────────────────────────────┼───────────────┤
│  AcaClaw Gateway (port 2090)    OpenClaw Gateway (18789)  │
│              ▼                             ▼               │
│  ┌──────────────────────────┐  ┌──────────────────────┐   │
│  │  controlUi serves        │  │  Default OpenClaw     │   │
│  │  AcaClaw SPA at /        │  │  control dashboard    │   │
│  │                          │  │                       │   │
│  │  WebSocket methods:      │  │  WebSocket methods:   │   │
│  │  health · config ·       │  │  Same API surface     │   │
│  │  sessions · skills ·     │  │                       │   │
│  │  agent · ...             │  │                       │   │
│  │                          │  │                       │   │
│  │  AcaClaw plugin methods: │  │                       │   │
│  │  acaclaw.env.*           │  │                       │   │
│  │  acaclaw.backup.*        │  │                       │   │
│  └──────────────────────────┘  └──────────────────────┘   │
└───────────────────────────────────────────────────────────┘
```

### How It Works

AcaClaw runs a dedicated gateway process (`acaclaw-gateway.service`) on port 2090. The gateway's `controlUi` middleware serves the AcaClaw SPA from `~/.openclaw/ui/`. OpenClaw's default gateway (`openclaw-gateway.service`) runs separately on port 18789 with its own built-in control dashboard.

AcaClaw's config:

```json
{
  "gateway": {
    "controlUi": {
      "basePath": "/",
      "root": "~/.openclaw/ui"
    }
  }
}
```

An AcaClaw UI plugin also registers a prefix route at `/` to inject the auth token into `index.html` and pass through reserved gateway paths:

```typescript
api.registerHttpRoute({
  path: "/",
  match: "prefix",
  auth: "gateway",
  handler: async (req, res, next) => {
    // Pass through reserved gateway paths — these are handled
    // by lower-priority middleware (health probes at priority 13, etc.)
    const reserved = ["/health", "/ready", "/api/", "/plugins/", "/admin"];
    if (reserved.some((p) => req.url.startsWith(p))) return next();

    // Serve AcaClaw's built SPA (static files + index.html fallback)
  },
});
```

The handler must pass through reserved paths. AcaClaw's prefix route runs at priority 10 in the gateway's HTTP dispatch pipeline — earlier than health/readiness probes (priority 13). Without the exclusion, `GET /health` would return AcaClaw's `index.html` instead of the probe response. The exclusion list is small and stable — OpenClaw's own control UI uses the same set.

### Why Separate Gateways

AcaClaw has its own gateway on port 2090 while OpenClaw's default gateway stays on port 18789. This avoids routing conflicts between two SPAs on the same port. Scientists type `localhost:2090` and see the AcaClaw workspace immediately. Power users access the full OpenClaw dashboard at `localhost:18789` or via the "OpenClaw" tab in AcaClaw's Settings.

### URL Routing

AcaClaw's SPA handles all client-side routes on port 2090. OpenClaw's dashboard runs independently on port 18789.

| URL | Gateway | View |
|---|---|---|
| `localhost:2090/` | AcaClaw | Overview (health, usage, quick actions) |
| `localhost:2090/chat` | AcaClaw | Chat interface |
| `localhost:2090/usage` | AcaClaw | Usage tracking |
| `localhost:2090/skills` | AcaClaw | Skills browser |
| `localhost:2090/environment` | AcaClaw | Conda env viewer |
| `localhost:2090/backup` | AcaClaw | Backup management |
| `localhost:2090/settings` | AcaClaw | Settings + "OpenClaw" tab → opens dashboard |
| `localhost:18789/` | OpenClaw | OpenClaw control dashboard |
| `localhost:18789/chat` | OpenClaw | OpenClaw chat |
| `localhost:18789/config` | OpenClaw | Full config editor |
| `localhost:18789/channels` | OpenClaw | Channels admin |
| `localhost:18789/debug` | OpenClaw | Debug inspector |
| `localhost:2090/api/*` | AcaClaw | REST API (gateway) |
| `localhost:2090/health` | AcaClaw | Health probe |

No path conflicts — each gateway serves its own UI independently.

### Why Two UIs Instead of One?

| Approach | Problem |
|---|---|
| **Fork OpenClaw UI** | Must maintain a fork — every OpenClaw UI update requires merging. |
| **Extend OpenClaw UI** | Navigation is hardcoded — no plugin API to add/remove tabs. |
| **Replace entirely** | Users who need channels, cron, or debug lose access. |
| **Two UIs, two gateways** | AcaClaw builds its own clean UI on port 2090. OpenClaw's dashboard stays unchanged on port 18789. No fork maintenance. Both audiences served. |

### What Each UI Provides

| Feature | AcaClaw UI (`:2090`) | OpenClaw UI (`:18789`) |
|---|---|---|
| Overview dashboard | Academic workspace (health, usage, quick actions) | Gateway-centric (uptime, auth, device pairing) |
| Chat | ✓ | ✓ |
| Usage tracking | ✓ | ✓ |
| Skills browser | ✓ | ✓ |
| Config editor | ✓ (simplified with presets) | ✓ (full schema-driven form) |
| Sessions | ✓ | ✓ |
| Agent management | ✓ | ✓ |
| Environment (Conda) | ✓ | — |
| Backup management | ✓ | — |
| Audit log | ✓ | — |
| Setup wizard | ✓ | — |
| Channels (WhatsApp, Telegram, etc.) | — | ✓ |
| Instances | — | ✓ |
| Cron | — | ✓ |
| Nodes (device pairing) | — | ✓ |
| Debug inspector | — | ✓ |
| Logs | — (via audit log) | ✓ |

Scientists use `:2090` for daily work. If they ever need channels or debug, the Settings page has an **OpenClaw** tab that opens `localhost:18789` in a new browser tab.

### What Changes Visually

| OpenClaw UI (`:18789`) | AcaClaw UI (`:2090`) |
|---|---|
| Admin dashboard for power users | Workspace for scientists |
| 13 tabs in 4 groups | 7 tabs, flat sidebar |
| Red accent (#ff5c5c) | Academic blue/teal accent |
| "OpenClaw" branding | "AcaClaw" branding with logo |
| Channels-focused overview | Research-focused overview with health score |
| Raw config editor | Simplified settings with presets |

### Technology Stack

| Component | Technology | Rationale |
|---|---|---|
| UI framework | Lit (Web Components) | Same as OpenClaw — can import shared components |
| State management | Lit signals | Matches OpenClaw's reactive pattern |
| Gateway communication | WebSocket JSON-RPC | Uses OpenClaw's existing gateway protocol |
| Styling | CSS custom properties | AcaClaw's own `base.css` with academic colors |
| Build tool | Vite | Outputs to `dist/`, served by plugin HTTP route |
| Served by | AcaClaw plugin (`registerHttpRoute`) | Same port, same process, zero overhead |

### Plugin Gateway Methods

AcaClaw's plugins register custom WebSocket methods that both UIs can call (though only AcaClaw's UI has panels for them):

| Method | What it does |
|---|---|
| `acaclaw.env.install` | Install discipline packages (runs `conda env create` in background) |
| `acaclaw.env.list` | List conda environments with size, active status, Python/R versions |
| `acaclaw.env.activate` | Switch active environment |
| `acaclaw.env.pip.list` | List Python packages in active env (`pip list`) |
| `acaclaw.env.pip.install` | Install a Python package via pip |
| `acaclaw.env.pip.uninstall` | Uninstall a Python package |
| `acaclaw.env.r.list` | List R packages (from conda env or system R) |
| `acaclaw.env.r.install` | Install R into conda env (`r-base`, `r-irkernel`, `r-essentials`) |
| `acaclaw.env.sys.list` | List system tools in the conda environment |
| `acaclaw.env.node.list` | List global Node.js packages |
| `acaclaw.env.cuda.list` | Detect GPU hardware and CUDA software stack |
| `acaclaw.backup.list` | List file backups with versions |
| `acaclaw.backup.restore` | Restore a file to a previous version |
| `acaclaw.workspace.info` | Get workspace metadata (discipline, size, file count) |
| `acaclaw.audit.query` | Query audit log with filters |

---

## Screen Map

```
┌───────────────────────────────────────────────────────────┐
│  AcaClaw                                          ─ □ ×   │
├──────────────┬────────────────────────────────────────────┤
│              │                                            │
│  📊 Overview │  [Active panel content area]               │
│  Today's     │                                            │
│  status      │                                            │
│              │                                            │
│  💬 Chat     │                                            │
│  Ask         │                                            │
│  questions   │                                            │
│              │                                            │
│  📈 Usage    │                                            │
│  Budget &    │                                            │
│  costs       │                                            │
│              │                                            │
│  🧩 Skills   │                                            │
│  Tools &     │                                            │
│  abilities   │                                            │
│              │                                            │
│  🔬 Environ. │                                            │
│  Python, R,  │                                            │
│  CUDA, tools │                                            │
│              │                                            │
│  💾 Backup   │                                            │
│  File        │                                            │
│  history     │                                            │
│              │                                            │
│  ⚙️ Settings │                                            │
│  Security &  │                                            │
│  connections │                                            │
│              │                                            │
├──────────────┴────────────────────────────────────────────┤
│  Gateway: ● Running   │  Agent: idle   │  ▲ 1.2K tokens  │
└───────────────────────────────────────────────────────────┘
```

### Sidebar Sections

| Tab | Purpose | Gateway methods |
|---|---|---|
| **Overview** | Health score, usage summary, active agents, recent activity | `health`, `usage.cost`, `sessions.list` |
| **Chat** | Send messages, view conversation, session history | `send`, `agent`, `sessions.preview` |
| **Usage** | Token/cost tracking, daily charts, per-model breakdown, CSV export | `usage.cost` |
| **Skills** | Browse installed, install from ClawHub, update, enable/disable | `skills.status`, `skills.install`, `skills.update` |
| **Environment** | Conda envs, Python/R/Tools/CUDA/Node.js packages, R install, GPU detection | `acaclaw.env.list`, `acaclaw.env.pip.list`, `acaclaw.env.r.list`, `acaclaw.env.cuda.list`, `acaclaw.env.node.list` |
| **Backup** | File backups, restore with diff, retention settings, trash | `acaclaw.backup.list`, `acaclaw.backup.restore` |
| **Settings** | Security tier, API keys, gateway config, workspace path, audit log | `config.set`, `config.get`, `acaclaw.audit.query` |

---

## 1. Dashboard (Home)

The first thing users see. A live overview of everything that matters.

### Layout

```
┌─────────────────────────────────────────────────────────┐
│  Dashboard                                               │
│                                                          │
│  ┌──────────────────┐  ┌──────────────────────────────┐ │
│  │  Token Usage      │  │  System Resources            │ │
│  │                   │  │                              │ │
│  │  Today: 12.4K     │  │  CPU  ████░░░░░░  38%       │ │
│  │  This week: 89K   │  │  RAM  ██████░░░░  62%       │ │
│  │  Cost: $0.42      │  │  Disk ████████░░  78%       │ │
│  │                   │  │                              │ │
│  │  [View details →] │  │  Workspace: 2.1 GB          │ │
│  └──────────────────┘  └──────────────────────────────┘ │
│                                                          │
│  ┌──────────────────┐  ┌──────────────────────────────┐ │
│  │  Agent Status     │  │  Quick Actions               │ │
│  │                   │  │                              │ │
│  │  ● Idle           │  │  [💬 New Chat]               │ │
│  │  Last active: 2m  │  │  [📊 Analyze Data]           │ │
│  │  Session: #12     │  │  [🔍 Search Papers]          │ │
│  │  Model: Claude 4  │  │  [📝 Write Document]         │ │
│  └──────────────────┘  └──────────────────────────────┘ │
│                                                          │
│  ┌──────────────────────────────────────────────────────┐│
│  │  Recent Activity                                      ││
│  │  14:32  Analyzed experiment-results.csv — 3 figures   ││
│  │  14:28  Backed up manuscript-draft.docx               ││
│  │  14:15  Installed skill: bio-tools v1.2.0             ││
│  │  13:50  Paper search: "CRISPR delivery" — 12 results  ││
│  └──────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
```

### Token Usage Card

| Metric | Source | Update frequency |
|---|---|---|
| Tokens today (input/output) | `usage.cost` grouped by day | Every message |
| Tokens this week/month | `usage.cost` date range | Every message |
| Estimated cost | `usage.cost` with model pricing | Every message |
| Cost by model | `usage.cost` grouped by model | On panel open |
| Cost by agent | `usage.cost` grouped by agent | On panel open |
| Daily trend chart | `usage.cost` 30-day history | On panel open |

**Detail view** (click "View details"):
- Bar chart: daily token usage (input vs output)
- Pie chart: cost breakdown by provider/model
- Table: per-session usage with model, tokens, cost
- Export: download usage data as CSV

### System Resources Card

| Metric | Source | Update frequency |
|---|---|---|
| CPU usage (%) | OS API (via Node.js `os.cpus()`) | Every 5 seconds |
| RAM usage (used / total) | OS API (via Node.js `os.totalmem/freemem`) | Every 5 seconds |
| Disk usage (workspace) | `fs.statfs()` on workspace path | Every 60 seconds |
| Workspace size | Recursive directory size | Every 60 seconds |
| Conda env size | Size of `~/.acaclaw/miniforge3` | On panel open |
| Backup storage used | Size of `~/.acaclaw/backups/` | On panel open |

**Alerts**:
- Disk > 90%: yellow warning banner
- Disk > 95%: red warning with "Free space" guidance
- RAM > 90% during agent run: suggestion to reduce concurrency

### Agent Status Card

| Field | Source |
|---|---|
| Status (idle / running / errored) | Gateway `health` |
| Current model | `config.get` agents.defaults.model |
| Active session | `sessions.list` + current session ID |
| Last activity timestamp | Session metadata |
| Running tool (if active) | Agent streaming events |

### Recent Activity Feed

Pulled from the audit log (`~/.acaclaw/audit/`). Shows the last 20 events:

- Tool calls (file modifications, searches, analyses)
- Backup events
- Skill installs/updates
- Configuration changes
- Security alerts

---

## 2. Agent Monitor

Watch the agent work in real time. See what tools it's calling, what files it's reading and writing, and how many tokens each operation costs.

### Layout

```
┌─────────────────────────────────────────────────────────┐
│  Agent Monitor                                           │
│                                                          │
│  Status: ● Running          Model: Claude 4 Opus         │
│  Session: #12 — "Analyze CRISPR data"                    │
│  Tokens: 4,281 input · 1,923 output · $0.08              │
│                                                          │
│  ┌──────────────────────────────────────────────────────┐│
│  │  Live Tool Calls                                      ││
│  │                                                       ││
│  │  14:32:05  ▶ read_file("data/raw/experiment.csv")     ││
│  │            ✓ 2,481 bytes read                         ││
│  │                                                       ││
│  │  14:32:08  ▶ execute_code("import pandas as pd...")   ││
│  │            ✓ DataFrame: 150 rows × 8 columns          ││
│  │            ⚙ Env: acaclaw-bio (Python 3.12)           ││
│  │                                                       ││
│  │  14:32:12  ▶ write_file("figures/crispr-compare.png") ││
│  │            ✓ 48 KB written                            ││
│  │            💾 Backup created                           ││
│  │                                                       ││
│  │  14:32:14  ▶ write_file("data/processed/results.csv") ││
│  │            ⏳ In progress...                           ││
│  └──────────────────────────────────────────────────────┘│
│                                                          │
│  [⏸ Pause]  [⏹ Stop]  [📋 Copy Log]                     │
└─────────────────────────────────────────────────────────┘
```

### What Users Can See

| Information | Source | Why it matters |
|---|---|---|
| Current agent status | Gateway agent streaming | Know if it's working or stuck |
| Each tool call in real time | Agent tool call events | Understand what the AI is doing |
| Files read and written | Tool call parameters | Track which files are touched |
| Backup confirmations | Backup plugin events | Assurance that data is safe |
| Token count (running total) | Session usage tracking | Cost awareness |
| Active Conda environment | Academic-env plugin context | Know which packages are available |
| Errors and retries | Agent error events | Diagnose failures without terminal |

### What Users Can Do

| Action | Effect | Gateway method |
|---|---|---|
| Pause agent | Suspend current task (resume later) | Agent control API |
| Stop agent | Cancel current task | Agent cancel |
| Copy log | Copy tool call history to clipboard | Local |
| Open file | Open a mentioned file in the OS file manager | Local `shell.openPath()` |
| View session history | Switch to session transcript view | `sessions.preview` |

---

## 3. Skills and Environment

Browse installed skills, install new ones from ClawHub, and view the computing environment — all without touching the terminal.

### Skills Tab

```
┌─────────────────────────────────────────────────────────┐
│  Skills & Environment                                    │
│                                                          │
│  [Installed]  [ClawHub]  [Environment]                   │
│                                                          │
│  ── Installed Skills ─────────────────────────────────── │
│                                                          │
│  ┌──────────────────────────────────────────────────────┐│
│  │  📄 paper-search                          v1.2.0     ││
│  │  Search arXiv, PubMed, Semantic Scholar, CrossRef    ││
│  │  Source: ClawHub · Category: Core Academic           ││
│  │  [Update Available: v1.3.0]  [Disable]               ││
│  ├──────────────────────────────────────────────────────┤│
│  │  📊 data-analyst                          v2.0.1     ││
│  │  Statistical analysis from natural language          ││
│  │  Source: ClawHub · Category: Core Academic           ││
│  │  ✓ Up to date  [Disable]                            ││
│  ├──────────────────────────────────────────────────────┤│
│  │  🧬 bio-tools                             v1.0.3     ││
│  │  Biopython, sequence analysis, genomics              ││
│  │  Source: ClawHub · Category: Biology                 ││
│  │  Env: acaclaw-bio  ✓ Up to date  [Disable]          ││
│  ├──────────────────────────────────────────────────────┤│
│  │  📔 nano-pdf                              (bundled)  ││
│  │  Read and extract text from PDF files                ││
│  │  Source: OpenClaw · Category: Foundation             ││
│  │  (Cannot disable — bundled with OpenClaw)            ││
│  └──────────────────────────────────────────────────────┘│
│                                                          │
│  10 skills installed · 4 core · 1 discipline · 4 bundled │
└─────────────────────────────────────────────────────────┘
```

### ClawHub Tab

```
┌─────────────────────────────────────────────────────────┐
│  [Installed]  [ClawHub]  [Environment]                   │
│                                                          │
│  Search ClawHub: [________________________] [🔍]         │
│                                                          │
│  ── Recommended by AcaClaw ──────────────────────────── │
│                                                          │
│  ┌──────────────────────────────────────────────────────┐│
│  │  🔬 gel-analyzer                    ★ 4.8 (23 users) ││
│  │  Analyze gel electrophoresis images                   ││
│  │  By @labtech · Category: Biology                     ││
│  │  🏷️ AcaClaw Recommended                              ││
│  │  [Install]                                           ││
│  ├──────────────────────────────────────────────────────┤│
│  │  📐 cad-viewer                      ★ 4.5 (12 users) ││
│  │  View and annotate CAD files for engineering papers   ││
│  │  By @mech-eng · Category: Engineering                ││
│  │  [Install]                                           ││
│  └──────────────────────────────────────────────────────┘│
│                                                          │
│  ── All ClawHub Skills ──────────────────────────────── │
│  (browse by category, rating, recency)                   │
└─────────────────────────────────────────────────────────┘
```

### Environment Tab

The Environment tab provides a detailed view of the active conda environment with five sub-tabs for different package categories.

#### Environment Info Bar

At the top of the tab, an info bar shows:

| Field | Example | Source |
|---|---|---|
| Active environment | `aca ● active` | `acaclaw.env.list` — active env from discipline detection |
| Python version | `Python 3.12.8` | `acaclaw.env.list` |
| R version | `R 4.5.2` | `acaclaw.env.r.list` |
| Environment size | `1.8 GB` | `acaclaw.env.list` — computed via `du -sk` on env path |
| Active badge | `Active` (green badge) | Shown when the displayed env is the currently active one |

#### Sub-tabs

```
┌─────────────────────────────────────────────────────────┐
│  [Installed]  [ClawHub]  [Environment]                   │
│                                                          │
│  ── aca ● active ─── Python 3.12.8 · R 4.5.2 · 1.8 GB  │
│                                                          │
│  [Python (132)] [Tools (11)] [R (457)] [CUDA (1)] [Node.js (6)] │
│                                                          │
│  Search: [________________________] [🔍]                  │
│                                                          │
│  │ Package        │ Version │ Source       │ Description │ │
│  │────────────────│─────────│─────────────│─────────────│ │
│  │ numpy          │ 1.26.4  │ pip         │             │ │
│  │ scipy          │ 1.14.1  │ pip         │             │ │
│  │ pandas         │ 2.2.3   │ pip         │             │ │
│  │ matplotlib     │ 3.9.3   │ pip         │             │ │
│  │ ...            │         │             │             │ │
│                                                          │
│  ── Other Environments ──────────────────────────────── │
│                                                          │
│  aca (base)             1.8 GB   ● Active                │
│  aca-bio                2.4 GB   ○ Available             │
│  aca-med                2.1 GB   ○ Available             │
└─────────────────────────────────────────────────────────┘
```

**Python** — Lists pip packages in the active conda environment (`pip list --format json`). Shows package name, version, and source. This intentionally uses `pip list` (not `conda list`) to display the Python-specific view.

**Tools** — System-level tools available in the conda environment (e.g., `conda`, `mamba`, `jupyter`, `git`, `curl`). Each tool shows its version and a brief description.

**R** — R packages from the active environment. AcaClaw detects R from two sources:

| Source | Display |
|---|---|
| System R (`/usr/bin/R`) | Orange banner: "Using **system R** (packages shared with the OS). [Install R into conda env]" |
| Conda R | Standard package list, no banner |
| R not installed | Card with "Install R into conda env" button |

Clicking "Install R into conda env" runs `conda install -n <env> -y -c conda-forge r-base r-irkernel r-essentials` via the `acaclaw.env.r.install` gateway method (up to 10 minutes).

**CUDA** — GPU and CUDA toolkit detection. Shows hardware and software components:

| Detection step | What it finds | Source |
|---|---|---|
| GPU hardware | GPU model (NVIDIA, Intel, AMD) | `lspci` |
| NVIDIA driver | Driver version, CUDA version | `nvidia-smi` |
| CUDA toolkit | nvcc version | `nvcc --version` |
| cuDNN | cuDNN version | Python ctypes probe in conda env |
| PyTorch CUDA | PyTorch CUDA availability | `torch.cuda.is_available()` |
| TensorFlow GPU | TensorFlow GPU devices | `tf.config.list_physical_devices('GPU')` |

On systems without NVIDIA GPUs, the tab still shows detected hardware (e.g., Intel integrated graphics).

**Node.js** — Node.js packages installed globally or in the environment. Shows packages available via `npm ls -g --json` (e.g., `openclaw`, `claude-code`, `npm`).

### Skill Actions

All actions are performed through the browser GUI. No terminal needed.

| Action | GUI element | What happens underneath |
|---|---|---|
| Install from ClawHub | "Install" button | Gateway method `skills.install` — downloads and extracts skill |
| Update skill | "Update" button (shown when update available) | Gateway method `skills.update` |
| Disable skill | "Disable" toggle | Remove from active skill list (not uninstalled) |
| View skill details | Click skill name | Show SKILL.md content, contributors, changelog |
| Install R into conda env | "Install R into conda env" button | Plugin method `acaclaw.env.r.install` — runs `conda install r-base r-irkernel r-essentials` in background |
| Add discipline packages | "Add Discipline" button in Environment tab | Plugin method `acaclaw.env.install` — creates/extends conda env with discipline packages |
| Search packages | Search box in Environment sub-tabs | Filter installed packages by name |
| Switch environment | Environment dropdown | Set active env for AI context |
| View GPU/CUDA info | CUDA sub-tab | Plugin method `acaclaw.env.cuda.list` — detects GPU hardware and CUDA software |

### How package installation works without the terminal

When a user clicks "Install" for a skill or "Add Discipline" for packages, the browser sends a WebSocket message to the gateway. The gateway (or AcaClaw plugin) runs the actual command (`clawhub install`, `conda install`, `conda env create`) in a background process. The browser shows a progress indicator. The user never sees a terminal.

```
  Browser                    Gateway                     System
  ───────                    ───────                     ──────
  [Install bio-tools] ──→  skills.install("bio-tools")  → clawhub install bio-tools
                             ↓ progress events             ↓ download + extract
  [████████░░ 80%]  ←──   WebSocket progress updates    ← done
  [✓ Installed]     ←──   success response

  [Add Chemistry]   ──→  acaclaw.env.install("chem")    → conda env create -f environment-chem.yml
                             ↓ progress events             ↓ install packages
  [████████░░ 60%]  ←──   WebSocket progress updates    ← done
  [✓ Chemistry added] ←── success response
```

---

## 4. API Keys and Providers

Configure AI providers, API keys, and model selection. Sensitive fields are masked by default.

### Layout

```
┌─────────────────────────────────────────────────────────┐
│  API Keys & Providers                                    │
│                                                          │
│  ── AI Providers ────────────────────────────────────── │
│                                                          │
│  ┌──────────────────────────────────────────────────────┐│
│  │  Anthropic                              ● Connected  ││
│  │  API Key: sk-ant-•••••••••••••••••c4    [👁] [Edit]  ││
│  │  Default model: Claude 4 Opus                        ││
│  │  Models available: Sonnet, Opus, Haiku               ││
│  │  Usage this month: $12.40                            ││
│  ├──────────────────────────────────────────────────────┤│
│  │  OpenAI                                 ○ Not set    ││
│  │  API Key: [________________________]    [Save]       ││
│  ├──────────────────────────────────────────────────────┤│
│  │  Google AI                              ○ Not set    ││
│  │  API Key: [________________________]    [Save]       ││
│  └──────────────────────────────────────────────────────┘│
│                                                          │
│  ── Default Model ───────────────────────────────────── │
│                                                          │
│  Model: [Claude 4 Opus          ▾]                       │
│  Provider: Anthropic (auto-detected)                     │
│                                                          │
│  ── Web Access ──────────────────────────────────────── │
│                                                          │
│  OpenClaw Web Login                                      │
│  Status: ● Logged in as davy@example.com                 │
│  [Log out]  [Refresh credentials]                        │
│                                                          │
│  Web provider credentials are stored at                  │
│  ~/.openclaw/credentials/ (encrypted)                    │
└─────────────────────────────────────────────────────────┘
```

### Provider Configuration

| Action | GUI element | Gateway method |
|---|---|---|
| Set API key | Text input (masked) | `config.set` models.providers.{provider}.apiKey |
| Remove API key | "Remove" button | `config.set` models.providers.{provider}.apiKey = "" |
| Select default model | Dropdown | `config.set` agents.defaults.model |
| Test connection | "Test" button | `models.list` (validates key) |
| View web login status | Status indicator | `channels.status` for web provider |
| Log in to OpenClaw Web | "Log in" button | `openclaw login` flow |
| Log out | "Log out" button | `openclaw logout` |

### Security Considerations

- API keys are masked with `•` by default; click eye icon to reveal
- Keys are never logged to the audit trail
- Keys are stored in `openclaw.json` with owner-only file permissions (`0o600`)
- The GUI never displays the full key in any log or error message

---

## 5. Gateway and Connections

Configure how the gateway runs, connect mobile apps, and manage remote access.

### Layout

```
┌─────────────────────────────────────────────────────────┐
│  Gateway & Connections                                   │
│                                                          │
│  ── Gateway Status ──────────────────────────────────── │
│                                                          │
│  Status: ● Running                                       │
│  Bind: 127.0.0.1:2090 (loopback)                        │
│  Uptime: 2h 14m                                          │
│  Connected clients: 2 (web UI, iOS app)                  │
│                                                          │
│  [Restart Gateway]  [View Logs]                          │
│                                                          │
│  ── Bind Mode ───────────────────────────────────────── │
│                                                          │
│  (●) Loopback — local only (recommended)                 │
│  ( ) Tailnet — Tailscale network                         │
│  ( ) LAN — local network (⚠ requires auth token)        │
│  ( ) Custom — specify address                            │
│                                                          │
│  Port: [2090]                                           │
│                                                          │
│  ── Mobile App Connection ───────────────────────────── │
│                                                          │
│  ┌────────────────────┐                                  │
│  │  ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄  │  Scan this QR code with the     │
│  │  █ ▄▄▄▄▄ █▄█ ▄█▄█ │  AcaClaw mobile app to connect.  │
│  │  █ █   █ █▀█▄██ █ │                                  │
│  │  █ ▀▀▀▀▀ █▀▄█▀▄ █ │  Or enter manually:              │
│  │  ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀  │  Host: 192.168.1.42              │
│  └────────────────────┘  Port: 2090                     │
│                          Token: ••••••••                  │
│                          [Show Token] [Regenerate]        │
│                                                          │
│  ── Paired Devices ──────────────────────────────────── │
│                                                          │
│  │ Device           │ Platform │ Status    │ Last seen  │ │
│  │──────────────────│──────────│───────────│────────────│ │
│  │ Davy's iPhone    │ iOS 19   │ ● Online  │ now        │ │
│  │ Lab iPad         │ iPadOS   │ ○ Offline │ 2h ago     │ │
│  │                                                       │
│  [Unpair Device]                                         │
│                                                          │
│  ── Auth Token ──────────────────────────────────────── │
│                                                          │
│  Current token: ••••••••••••  [Show] [Regenerate]        │
│  Auth mode: [Token ▾]                                    │
│                                                          │
│  ── TLS (for non-loopback) ──────────────────────────── │
│                                                          │
│  ☑ Require TLS for remote connections                    │
│  Cert: [_______________________] [Browse]                │
│  Key:  [_______________________] [Browse]                │
└─────────────────────────────────────────────────────────┘
```

### Connection Actions

| Action | GUI element | Gateway method |
|---|---|---|
| Restart gateway | Button | Kill + restart gateway process |
| Change bind mode | Radio buttons | `config.set` gateway.bind |
| Change port | Number input | `config.set` gateway.port |
| Generate pairing QR | Automatic (shown when non-loopback) | `node.pair.request` |
| Pair mobile device | QR code scan (mobile side) | `node.pair.approve` |
| Unpair device | Button per device | `node.unpair` |
| Regenerate auth token | Button | `config.set` gateway.auth.token (new random) |
| View gateway logs | Button → log viewer panel | Read gateway log file |
| Configure TLS | File selector for cert/key | `config.set` gateway.tls.* |

### Security Escalation

When the user switches from Loopback to any non-loopback mode:

1. **Warning dialog** explains the security implications
2. **Auth token required** — generated automatically if not set
3. **TLS recommended** — prompted to configure certificate
4. **Event logged** to audit trail
5. **Confirmation required** — "I understand the risks"

---

## 6. Security, Backup, and Workspace

Three related panels for data protection, security policy, and workspace management.

### Security Panel

```
┌─────────────────────────────────────────────────────────┐
│  Security                                                │
│                                                          │
│  [Security Tier]  [Rules]  [Audit Log]                   │
│                                                          │
│  ── Security Tier ───────────────────────────────────── │
│                                                          │
│  Current: Tier 1 — Local Workspace (Default)             │
│                                                          │
│  (●) Tier 1: Local Workspace                             │
│      Workspace confinement, deny-lists, backup,          │
│      credential scrubbing. No Docker required.           │
│                                                          │
│  ( ) Tier 2: Remote Access                               │
│      Tier 1 + TLS, auth tokens, scoped logging.          │
│      ⚠ Exposes gateway beyond localhost.                 │
│                                                          │
│  ( ) Tier 3: Docker Sandbox                              │
│      Full container isolation. All code runs in          │
│      a disposable Docker container.                      │
│      Requires: Docker installed and running.             │
│      [Check Docker Status]                               │
│                                                          │
│  ── Active Controls ─────────────────────────────────── │
│                                                          │
│  ✓ Workspace confinement (workspaceOnly: true)           │
│  ✓ Tool deny-list (8 tools blocked)                      │
│  ✓ Command deny-list (15 patterns blocked)               │
│  ✓ Network allowlist (academic domains only)             │
│  ✓ Credential scrubbing (12 patterns)                    │
│  ✓ Prompt injection detection (8 patterns)               │
│  ✓ Pre-modification backup                               │
│  ✓ Audit logging                                         │
└─────────────────────────────────────────────────────────┘
```

### Security Rules Tab

```
┌─────────────────────────────────────────────────────────┐
│  [Security Tier]  [Rules]  [Audit Log]                   │
│                                                          │
│  ── Tool Policy ─────────────────────────────────────── │
│                                                          │
│  Denied tools:                                           │
│  ☑ gateway        ☑ cron           ☑ sessions_spawn      │
│  ☑ plugin_manage  ☐ web_fetch      ☐ image_gen           │
│  [Add custom deny rule...]                               │
│                                                          │
│  ── Command Deny-List ───────────────────────────────── │
│                                                          │
│  ☑ rm -rf /       ☑ chmod 777      ☑ curl | sh           │
│  ☑ dd if=         ☑ mkfs           ☑ iptables            │
│  ... (15 patterns)                                       │
│  [Add custom pattern...]                                 │
│                                                          │
│  ── Network Allowlist ───────────────────────────────── │
│                                                          │
│  Allowed domains:                                        │
│  ☑ arxiv.org             ☑ api.semanticscholar.org       │
│  ☑ eutils.ncbi.nlm.nih.gov  ☑ api.crossref.org          │
│  ☑ pypi.org              ☑ github.com                    │
│  [Add domain...]                                         │
│                                                          │
│  ── Execution Approvals ─────────────────────────────── │
│                                                          │
│  Shell commands require approval: [Always ▾]             │
│  (Always / First time only / Never)                      │
└─────────────────────────────────────────────────────────┘
```

### Audit Log Tab

```
┌─────────────────────────────────────────────────────────┐
│  [Security Tier]  [Rules]  [Audit Log]                   │
│                                                          │
│  Filter: [All ▾]  Date: [Today ▾]  [Export CSV]          │
│                                                          │
│  │ Time     │ Event              │ Detail                │
│  │──────────│────────────────────│──────────────────────│
│  │ 14:32:05 │ tool_call          │ read_file(experiment │
│  │          │                    │ .csv)                │
│  │ 14:32:08 │ tool_call          │ execute_code(pandas  │
│  │          │                    │ analysis)            │
│  │ 14:32:10 │ backup_created     │ experiment.csv →     │
│  │          │                    │ backup 2026-03-14    │
│  │ 14:32:12 │ tool_call          │ write_file(crispr-   │
│  │          │                    │ compare.png)         │
│  │ 14:30:00 │ credential_scrub   │ Stripped OpenAI key  │
│  │          │                    │ from output          │
│  │ 14:28:00 │ config_change      │ gateway.port 2090   │
│  │          │                    │ → 18790              │
│                                                          │
│  Showing 42 events today                                 │
└─────────────────────────────────────────────────────────┘
```

### Backup Panel

```
┌─────────────────────────────────────────────────────────┐
│  Backup                                                  │
│                                                          │
│  [File Backups]  [Trash]  [Snapshots]  [Settings]        │
│                                                          │
│  ── File Backups ────────────────────────────────────── │
│                                                          │
│  Workspace: ~/AcaClaw/                                   │
│  Backup location: ~/.acaclaw/backups/AcaClaw-a1b2c3d4/   │
│  Total backup size: 148 MB                               │
│  Files backed up: 234                                    │
│                                                          │
│  Search: [________________________] [🔍]                  │
│                                                          │
│  ── Today (March 14) ────────────────────────────────── │
│                                                          │
│  │ Time     │ File                    │ Size  │ Action  │ │
│  │──────────│─────────────────────────│───────│─────────│ │
│  │ 14:32:10 │ data/experiment.csv     │ 24 KB │[Restore]│ │
│  │ 14:28:05 │ documents/manuscript.docx│ 1.2MB│[Restore]│ │
│  │ 13:50:22 │ references/refs.bib     │ 8 KB  │[Restore]│ │
│                                                          │
│  ── Yesterday ───────────────────────────────────────── │
│  │ 16:10:30 │ figures/plot-v2.png     │ 48 KB │[Restore]│ │
│  │ ...                                                   │
│                                                          │
│  [Restore] opens a diff view (current vs backup)         │
│  before applying the restore.                            │
└─────────────────────────────────────────────────────────┘
```

### Backup Settings Tab

```
┌─────────────────────────────────────────────────────────┐
│  [File Backups]  [Trash]  [Snapshots]  [Settings]        │
│                                                          │
│  ── Retention Policy ────────────────────────────────── │
│                                                          │
│  Keep file backups for: [30 days ▾]                      │
│  (7 days / 30 days / 90 days / Forever)                  │
│                                                          │
│  Maximum backup storage: [5 GB ▾]                        │
│  (1 GB / 5 GB / 10 GB / Unlimited)                       │
│                                                          │
│  ── Periodic Sync (Layer A3) ────────────────────────── │
│                                                          │
│  ☑ Sync workspace changes periodically                   │
│  Interval: [15 minutes ▾]                                │
│                                                          │
│  ── Workspace Snapshots (Layer B) ───────────────────── │
│                                                          │
│  ☐ Enable full workspace snapshots (off by default)      │
│  Schedule: [Daily at midnight ▾]                         │
│  Max snapshot storage: [10 GB ▾]                         │
│                                                          │
│  ── Trash ───────────────────────────────────────────── │
│                                                          │
│  Empty trash after: [30 days ▾]                          │
│  Current trash size: 12 MB                               │
│  [Empty Trash Now]                                       │
└─────────────────────────────────────────────────────────┘
```

### Workspace Panel

```
┌─────────────────────────────────────────────────────────┐
│  Workspace                                               │
│                                                          │
│  ── Current Workspace ───────────────────────────────── │
│                                                          │
│  Path: ~/AcaClaw/                       [Open in Finder] │
│  Size: 2.1 GB                                            │
│  Files: 1,842                                            │
│  Discipline: Biology                                     │
│  Created: 2026-02-15                                     │
│                                                          │
│  ── Directory Structure ─────────────────────────────── │
│                                                          │
│  📁 data/                                                │
│  ├── 📁 raw/           (328 MB, 45 files) — read-only   │
│  └── 📁 processed/     (892 MB, 120 files)               │
│  📁 documents/                                           │
│  ├── 📁 drafts/        (24 MB, 8 files)                  │
│  └── 📁 final/         (12 MB, 3 files)                  │
│  📁 figures/            (148 MB, 67 files)               │
│  📁 references/         (420 MB, 89 files)               │
│  📁 notes/              (2 MB, 15 files)                 │
│  📁 output/             (180 MB, 95 files)               │
│                                                          │
│  ── Workspace Settings ──────────────────────────────── │
│                                                          │
│  Workspace path: [~/AcaClaw/           ] [Change]        │
│  Workspace confinement: ☑ Enabled (recommended)          │
│  Git auto-init: ☑ Enabled                                │
│                                                          │
│  ── Multiple Workspaces ─────────────────────────────── │
│                                                          │
│  │ Name              │ Path          │ Discipline │      │
│  │───────────────────│───────────────│────────────│      │
│  │ AcaClaw (default) │ ~/AcaClaw/    │ Biology    │ ●    │
│  │ Grant-2026        │ ~/Grant-2026/ │ Medicine   │ ○    │
│  │                                                       │
│  [Create New Workspace]  [Switch Workspace]              │
└─────────────────────────────────────────────────────────┘
```

---

## 7. Setup Wizard (Browser-Based)

The install script (`install.sh`) handles all downloads and system setup automatically in the terminal. Once complete, it starts the OpenClaw gateway and opens a browser-based setup wizard at `http://localhost:2090/`.

### Why browser, not a native GUI installer?

A terminal script cannot safely launch a native GUI application:

- **macOS**: Gatekeeper quarantines unsigned downloaded `.app` bundles
- **Windows**: SmartScreen blocks unsigned `.exe` files
- **Linux**: Works, but display server access varies (X11/Wayland/headless)

Opening a browser page avoids all of these. The browser is already installed and trusted. The wizard runs entirely locally through the gateway — nothing is sent to the internet.

### What the terminal does (automatic, no prompts)

| Step | What | Requires user input? |
|---|---|---|
| Install OpenClaw | `npm install -g openclaw` | No |
| Install Miniforge | Downloads and installs silently | No |
| Create base Conda env | Python + R + core scientific stack | No |
| Copy AcaClaw plugins | To `~/.openclaw/plugins/` | No |
| Install academic skills | From ClawHub into `~/.openclaw/skills/` | No |
| Apply AcaClaw config | Writes `~/.openclaw/openclaw.json` with `$include` | No |
| Create workspace dirs | `~/AcaClaw/` structure | No |
| Start gateway + open browser | `openclaw gateway run` → `http://localhost:2090/` | No |

### What the browser wizard does (user choices)

```
  ┌─────────────┐     ┌─────────────┐     ┌──────────────┐
  │  Discipline │────▶│  AI Provider│────▶│  Workspace   │
  │  Selection  │     │  + API Key  │     │  Location    │
  └─────────────┘     └─────────────┘     └──────┬───────┘
                                                  │
                      ┌─────────────┐     ┌──────▼───────┐
                      │  Ready!     │◀────│  Security    │
                      │  Dashboard  │     │  Level       │
                      └─────────────┘     └──────────────┘
```

**Screen 1: Discipline Selection**

- Checkboxes for disciplines (Biology, Chemistry, Medicine, Physics, Engineering, Math, General)
- Description of what each adds (packages, tools)
- Estimated install size shown dynamically
- On submit: calls gateway API to create the discipline-specific Conda environment
- Progress bar while installing packages

**Screen 2: AI Provider Setup**

- Choose provider: Anthropic / OpenAI / Google AI / OpenClaw Web
- Enter API key (with link to "How to get an API key")
- Test connection button — verifies key works before proceeding
- Model selection dropdown
- On submit: calls `config.set` via gateway API

**Screen 3: Workspace Location**

- Default: `~/AcaClaw/` (already created by the script)
- Option to change the path
- Shows workspace structure preview

**Screen 4: Security Level**

- Radio: Standard (recommended) / Maximum (Docker)
- Clear explanation of each
- Docker status indicator (detected/not detected)
- On submit: if Maximum, calls `config.set` for sandbox settings

**Screen 5: Ready**

- Summary of all choices
- "Finish Setup" button
- Redirects to the AcaClaw dashboard

### Headless / SSH fallback

If no display server is available (e.g., headless server, SSH session), the script prints the URL and the user visits it from any browser that can reach `localhost:2090`. All wizard functionality works the same — it's just a web page.

### Future: Native installers

When AcaClaw ships signed platform packages, native installers become viable:

| Platform | Installer type | Status |
|---|---|---|
| **macOS** | `.dmg` (signed + notarized) | Future |
| **Windows** | `.exe` (signed NSIS/Inno) | Future |
| **Linux** | `.AppImage` or `.deb`/`.rpm` | Future |
| **All platforms** | Shell script + browser wizard | **Current** |

---

## What AcaClaw's UI Includes

AcaClaw ships its own standalone UI on port 2090. It is not a fork of OpenClaw's UI — it's a separate SPA that shares the same gateway WebSocket API. OpenClaw's full admin UI runs on the default gateway at port 18789 for any feature AcaClaw's UI doesn't cover.

### AcaClaw UI Views

| View | Purpose | Plugin methods used |
|---|---|---|
| **Overview** | Health score, usage summary, recent activity, quick actions | `health`, `usage.cost`, `sessions.list` |
| **Chat** | Send messages, view responses, agent interaction | (built-in gateway methods) |
| **Usage** | Token/cost charts, daily breakdown, CSV export, per-model stats | `usage.cost` |
| **Skills** | List, search, filter, enable/disable, install from ClawHub | `skills.install`, `skills.list` |
| **Environment** | Conda env viewer, package list, discipline selection, R install | `acaclaw.env.list`, `acaclaw.env.install`, `acaclaw.env.activate` |
| **Backup** | File backup list, restore with diff view, retention settings | `acaclaw.backup.list`, `acaclaw.backup.restore` |
| **Settings** | Simplified config with presets, audit log, OpenClaw tab opens `localhost:18789` dashboard | `config.get`, `config.set`, `acaclaw.audit.query` |
| **Setup wizard** | First-launch onboarding (discipline, API key, workspace, security) | `config.set`, `acaclaw.env.install` |

### Features Available on OpenClaw Dashboard (`:18789`)

These features are available to users who need them, via the OpenClaw tab in AcaClaw's Settings (opens `localhost:18789` in a new tab):

| Feature | Why scientists rarely need it |
|---|---|
| Channels (WhatsApp, Telegram, Discord, etc.) | Messaging service admin — not part of academic workflows |
| Instances | Multi-model instance management — advanced configuration |
| Cron | Scheduled task config — power-user feature |
| Nodes (device pairing) | Multi-device admin — not typical for lab use |
| Debug inspector | Developer tool for troubleshooting gateway internals |
| Full config editor | Schema-driven form with all settings (AcaClaw shows simplified presets) |
| Logs | Raw gateway log viewer |

### Platform Notes

| Platform | Interface |
|---|---|
| **macOS** | OpenClaw's native Swift app is separate. AcaClaw's UI runs in browser at `http://localhost:2090/`. Both can be used side by side. |
| **iOS / Android** | Native mobile apps connect to the same gateway via WebSocket |
| **Linux / Windows / all** | AcaClaw UI at `http://localhost:2090/`, OpenClaw admin at `http://localhost:18789/` |

---

## Implementation Approach

### Current: Browser-Based Standalone SPA

AcaClaw builds its own UI as a standalone SPA. The AcaClaw gateway's `controlUi` middleware serves the built files at `/`. OpenClaw's default gateway runs separately on port 18789 with its stock dashboard. Users access AcaClaw at `http://localhost:2090` in any browser.

| Advantage | Detail |
|---|---|
| Zero extra install | Already included — gateway serves the UI |
| Cross-platform | Works identically on macOS, Windows, Linux |
| No fork maintenance | AcaClaw's UI is independent — OpenClaw updates don't require merging |
| OpenClaw features preserved | Full dashboard at `localhost:18789` — nothing lost |
| Same build system | Vite + Lit, outputs to `dist/` |
| Fast iteration | Hot-reload with `vite dev`, no app rebuild |
| No Electron overhead | No 150+ MB Chromium bundle |

| Limitation | Detail |
|---|---|
| No system tray | Cannot show gateway status icon in OS taskbar |
| No native notifications | Browser notifications work but are less polished |
| No native file dialogs | Uses browser file picker (functional but basic) |
| Requires browser tab | User must keep a tab open |

### Source Structure

```
acaclaw/
└── ui/                             ← AcaClaw's own UI (not a fork)
    ├── package.json                ← lit, vite deps
    ├── vite.config.ts
    └── src/
        ├── main.ts                 ← 7-tab navigation, router
        ├── styles/
        │   └── base.css            ← AcaClaw color scheme (academic blue/teal)
        ├── views/
        │   ├── overview.ts         ← Dashboard (health score, usage, quick actions)
        │   ├── chat.ts             ← Chat interface (calls gateway chat methods)
        │   ├── usage.ts            ← Usage tracking (calls usage.cost)
        │   ├── skills.ts           ← Skills browser (calls skills.list, skills.install)
        │   ├── environment.ts      ← Conda env viewer (calls acaclaw.env.*)
        │   ├── backup.ts           ← Backup management (calls acaclaw.backup.*)
        │   ├── settings.ts         ← Config presets + audit log + OpenClaw tab (opens :18789)
        │   └── onboarding.ts       ← First-launch wizard
        └── controllers/
            ├── gateway.ts          ← WebSocket connection to gateway (shared methods)
            ├── backup.ts           ← calls acaclaw.backup.* gateway methods
            └── environment.ts      ← calls acaclaw.env.* gateway methods
```

### How Compatibility Works

| Factor | Detail |
|---|---|
| **No fork, no merging** | AcaClaw's UI is its own codebase. OpenClaw's UI updates are automatic — `npm install -g openclaw@latest` updates the admin UI at `localhost:18789` without touching AcaClaw. |
| **Gateway API is stable** | WebSocket JSON-RPC methods don't change between releases. If they did, OpenClaw's own UI would break. |
| **AcaClaw adds, never conflicts** | AcaClaw's panels call custom plugin methods (`acaclaw.backup.*`, `acaclaw.env.*`). These live in a separate namespace. |
| **Two independent builds** | AcaClaw builds its own `dist/`. OpenClaw builds its own. Neither affects the other. |
| **Compat-checker plugin** | `@acaclaw/compat-checker` validates OpenClaw version at startup and warns if an update is needed. |

### How Updates Flow

```
OpenClaw update (npm install -g openclaw@latest)
  └── Updates: gateway binary, built-in skills, core plugins, admin UI at :18789
  └── Does NOT touch: ~/.openclaw/, AcaClaw UI, AcaClaw plugins, AcaClaw skills

AcaClaw update (install.sh --upgrade)
  └── Updates: AcaClaw UI build at /, AcaClaw plugins, AcaClaw skills
  └── Writes to: ~/.openclaw/plugins/, ~/.openclaw/skills/
  └── Does NOT touch: ~/.openclaw/ (OpenClaw's config, plugins, sessions)
```

### Desktop Wrapper Strategy

AcaClaw uses different approaches per platform to give users a proper app window without requiring code signing or large binaries.

**macOS** uses a compiled Swift binary (~60 KB, built locally at install time by `swiftc`) that wraps `localhost:2090` in a native `WKWebView` window. Because the binary is compiled on the user's machine it is never quarantined by Gatekeeper — no Apple Developer ID or notarization required. The wrapper also manages gateway lifecycle: it probes port 2090 on launch and starts the gateway automatically if it is not running.

**Windows and Linux** use a PWA (Progressive Web App). The SPA ships a `manifest.webmanifest`, two PNG icons (192 × 192 and 512 × 512), and a Service Worker (`sw.js`). Chrome and Edge show an install button in the address bar when users visit `localhost:2090`; after installing, the app opens in a standalone window with the AcaClaw icon pinned to the Taskbar or GNOME/KDE launcher. No signing, no binary distribution, no Rust or C# toolchain required.

| | **WKWebView (Swift)** | **PWA** | **Tauri** | **Electron** |
|---|---|---|---|---|
| **macOS signing** | ✗ (compiled locally — never quarantined) | ✗ | ✓ (notarization + Developer ID) | ✓ (Gatekeeper) |
| **Windows signing** | N/A | ✗ | ✓ (Smart Screen / EV cert) | ✓ (Smart Screen) |
| **Linux** | ✗ (Swift is macOS-only) | ✓ (Chromium PWA) | ✓ (WebKitGTK — older engine, CSS quirks) | ✓ |
| **Windows** | ✗ | ✓ (Chrome / Edge — best API coverage) | ✓ (WebView2 ≈ Chromium) | ✓ |
| **Web engine** | WKWebView (locked to macOS Safari version) | User's default browser engine | WKWebView / WebView2 / WebKitGTK per platform | Bundled Chromium (pinned version) |
| **Engine consistency** | ✓ (always WebKit) | Varies by user's browser | Varies by platform | ✓ (always same Chromium) |
| **Standalone window / Dock–Taskbar icon** | ✓ (`NSWindow`, native) | ✓ (browser-managed) | ✓ (native) | ✓ (native) |
| **Gateway auto-start** | ✓ (Swift wrapper polls port 2090, runs `start.sh`) | ✗ (user must start gateway separately) | Possible (Rust sidecar, but complex) | Possible (Node child-process) |
| **Native FS / shell access** | ✗ | Partial (File System Access API — Chrome/Edge only) | ✓ (full Tauri APIs) | ✓ (Node.js built-in) |
| **Binary to ship** | None (compiled in‑place at install) | None | Yes (`.dmg` / `.msi` / `.AppImage`) | Yes (`.dmg` / `.exe` / `.deb`, ~200 MB) |
| **Binary size** | ~60 KB | 0 | ~3–10 MB | ~150–200 MB |
| **Build complexity** | `swiftc` (bundled with Xcode CLT) | None — manifest + SW only | Rust toolchain + per-platform CI matrix | Node + Electron builder + per-platform CI |
| **Auto-update** | Gateway redeploy (SPA updated automatically) | Service Worker update-on-refresh | Tauri updater (pull from update server) | Electron auto-updater |
| **App store eligible** | ✗ | ✗ | ✓ (with signing + entitlements) | ✓ (with signing + entitlements) |
| **Status in AcaClaw** | **Current** (macOS) | **Current** (Windows, Linux, macOS fallback) | Not planned | Not planned |

**Why Electron and Tauri are not planned:** PWA covers Windows and Linux with zero signing overhead and no per-platform CI matrix. The Swift wrapper covers macOS with a smaller binary than either alternative and without requiring an Apple Developer ID. Tauri or Electron would only become worth the cost if AcaClaw needed app-store distribution, deep OS integration beyond what the gateway already provides, or a bundled offline-capable installer.

#### PWA Service Worker strategy

The SW uses **network-first for `index.html`** because the gateway's HTTP handler injects an auth token into that file server-side. Caching a stale copy would break authentication. All other static assets (JS, CSS, fonts, icons) use cache-first. Gateway API paths (`/api/`, `/health`, `/ready`) bypass the SW entirely. When the gateway is unreachable, navigation requests fall back to a minimal offline page that prompts the user to start the gateway.

### Phased Rollout

#### Phase 1: Core Views + Dual-UI Config

Build AcaClaw's standalone UI with core views. AcaClaw gateway serves UI at `:2090`, OpenClaw default gateway serves dashboard at `:18789`.

| Deliverable | Detail |
|---|---|
| Standalone SPA with 7-tab navigation | Overview, Chat, Usage, Skills, Environment, Backup, Settings |
| AcaClaw color scheme | Custom `base.css` with academic-focused palette |
| Overview panel | Health score, usage summary, recent activity, quick actions |
| Plugin HTTP route | AcaClaw gateway serves `dist/` at `:2090`, OpenClaw gateway serves dashboard at `:18789` |
| OpenClaw tab | Settings page opens `localhost:18789` dashboard for channels, debug, cron |

#### Phase 2: AcaClaw-Specific Panels

Build the panels that require AcaClaw plugin backend methods.

| Panel | Plugin dependency |
|---|---|
| **Environment** (Conda viewer, package list, R install) | `@acaclaw/academic-env` |
| **Backup** (file list, restore with diff, retention) | `@acaclaw/backup` |
| **Audit log** (inside Settings, security events, CSV export) | `@acaclaw/security` |
| **Setup wizard** (first-launch onboarding) | All AcaClaw plugins |

#### Phase 3: Native Installers (Future)

When AcaClaw ships signed platform packages, replace the terminal script with native installers.

| Platform | Installer type | Status |
|---|---|---|
| macOS | `.app` with WKWebView (compiled from Swift) | **Current** — native window, Dock icon, gateway auto-start, no browser dependency |
| Windows | PWA via Chrome / Edge | **Current** — install from address bar, standalone window, Taskbar icon, no signing |
| Linux | PWA via Chrome / Chromium | **Current** — install from address bar, standalone window, app launcher entry, no signing |
| macOS | `.dmg` (signed + notarized) | Future |
| Windows | `.exe` (signed) | Future |
| Linux | `.AppImage` or `.deb`/`.rpm` | Future |
| All platforms | Shell script + browser wizard | **Current** — fallback on all platforms |

---

## Desktop Launch

AcaClaw runs as a local web app: the gateway serves the UI, and the user accesses it through a native window or browser. On macOS, `install-desktop.sh` compiles a ~60 KB Swift binary that opens a native `WKWebView` window — no browser required. On Windows and Linux, `start.sh` opens the UI in the default browser; Chrome and Edge users can install it as a PWA for a standalone window with the AcaClaw icon. For the full authentication flow, token lifecycle, and WebSocket handshake details, see [Authentication and App Launch](/en/auth-and-app-launch/).

### Scripts

| Script | Purpose |
|---|---|
| `scripts/start.sh` | Start gateway + open browser (main launcher) |
| `scripts/stop.sh` | Gracefully stop the gateway |
| `scripts/install-desktop.sh` | Install platform-specific desktop shortcut |

### Platform Behavior

| Platform | Desktop shortcut | Launch method | Notes |
|---|---|---|---|
| **Linux** | `.desktop` file in `~/.local/share/applications/` | `xdg-open` → browser; or install as PWA in Chrome/Chromium | Appears in GNOME, KDE, XFCE launchers. Chrome/Chromium users can install as PWA for a standalone window |
| **macOS** | `.app` bundle in `~/Applications/` | Native WKWebView window | Compiled Swift binary; shows AcaClaw icon in Dock, handles Dock relaunch, no browser needed. Falls back to `open URL` if `swiftc` unavailable |
| **Windows** | PWA via Chrome / Edge | `start.sh` opens browser; Chrome/Edge show install prompt | Install from address bar → standalone window pinned to Taskbar, no signing |
| **WSL2** | `.lnk` shortcut on Windows Desktop | `powershell.exe Start-Process` | Runs gateway inside WSL, opens Windows browser |
| **Headless/SSH** | N/A | Prints URL to terminal | User visits URL from any browser |

### Usage

```bash
# Launch (start gateway + open browser)
bash scripts/start.sh

# Headless (gateway only)
bash scripts/start.sh --no-browser

# Check status
bash scripts/start.sh --status

# Stop
bash scripts/stop.sh

# Install desktop shortcut (run once)
bash scripts/install-desktop.sh
```

---

## GUI-to-CLI Mapping

Every GUI action has an equivalent CLI command. Power users can use either.

| GUI Action | CLI Equivalent |
|---|---|
| View token usage | `openclaw usage` |
| View system resources | `openclaw status --deep` |
| View agent status | `openclaw status` |
| Install skill | `clawhub install <skill>` |
| Update skill | `clawhub update <skill>` |
| View installed skills | `openclaw skills list` |
| Set API key | `openclaw config set models.providers.anthropic.apiKey <key>` |
| Set default model | `openclaw config set agents.defaults.model <model>` |
| Log in to web | `openclaw login` |
| Change bind mode | `openclaw config set gateway.bind <mode>` |
| Pair mobile device | `openclaw pair` (interactive) |
| Unpair device | `openclaw unpair <device>` |
| Restart gateway | `openclaw gateway restart` |
| Change security tier | `openclaw config set agents.defaults.sandbox.mode <off\|docker>` |
| View audit log | `cat ~/.acaclaw/audit/YYYY-MM-DD.jsonl` |
| Restore file from backup | `openclaw acaclaw-backup restore <file>` |
| Change backup retention | `openclaw config set acaclaw.backup.retentionDays <N>` |
| Change workspace path | `openclaw config set agents.defaults.workspace <path>` |
| Create new workspace | `openclaw acaclaw-workspace create <name> --discipline <field>` |
| View Conda env | `conda list -n acaclaw` |
| Install R | `conda install -n acaclaw r-base r-irkernel` |

---

## Design Rules

| Rule | Rationale |
|---|---|
| **Every panel has a CLI equivalent** | Power users can always drop to terminal |
| **Sensitive fields are masked by default** | API keys, auth tokens hidden until revealed |
| **Destructive actions require confirmation** | Delete workspace, empty trash, unpair device |
| **Security escalation shows a warning** | Switching to non-loopback, disabling confinement |
| **Changes take effect immediately** | No "Apply" button — changes saved on input |
| **Undo is always possible** | Config changes backed up, file restores show diff |
| **No technical jargon in labels** | "Workspace" not "working directory", "AI Provider" not "LLM endpoint" |
| **Status is always visible** | Bottom bar shows gateway status, agent state, token count |
| **Errors show next steps** | "Gateway not running → [Start Gateway]", not just "Error: ECONNREFUSED" |
| **Responsive layout** | Panels adapt to window size (sidebar collapses on narrow) |

---
layout: page
title: Install
lang: en
permalink: /en/install/
---

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Step 1: Download and Run the Install Script](#step-1-download-and-run-the-install-script)
- [Step 2: GUI Setup Wizard (Browser)](#step-2-gui-setup-wizard-browser)
- [After Install: Adding Skills and Packages](#after-install-adding-skills-and-packages)
- [Platform-Specific Notes](#platform-specific-notes)
- [What the Installer Does](#what-the-installer-does)
- [Uninstall](#uninstall)

---

## Overview

AcaClaw installation is a two-step process:

| Step | Interface | What happens |
|---|---|---|
| **Step 1** | Terminal (one command) | Downloads and installs OpenClaw, AcaClaw plugins, Miniforge, and academic skills |
| **Step 2** | Browser (GUI wizard) | Guides you through discipline selection, AI provider setup, workspace configuration, and security level |

Step 1 requires a terminal because it installs system packages — things like Node.js packages, Conda environments, and CLI tools. This is the only time you need a terminal.

Step 2 opens automatically in your browser once installation finishes. The GUI wizard handles every interactive choice — no terminal menus, no typing config values manually.

AcaClaw does not run a separate GUI application. It serves its own browser UI on the same gateway port (`http://localhost:2090`). OpenClaw's built-in admin UI remains available at `http://localhost:2090/admin` for advanced features. One gateway, one port, two frontends.

After install, you never need the terminal again. Skills, discipline packages, configuration, and backup are all managed through the browser GUI. See [Web GUI](/en/desktop-gui/) for details.

### Platform Support

| Platform | Status | Notes |
|---|---|---|
| **Linux** (Ubuntu, Debian, Fedora, etc.) | **Phase 1 — Available now** | Full support via CLI install script |
| **macOS** (Intel & Apple Silicon) | **Phase 1 — Available now** | Full support via CLI install script |
| **Windows (WSL2)** | **Phase 2 — Coming soon** | Will be available in a future release |

---

## Prerequisites

| Requirement | Version | How to check |
|---|---|---|
| **Node.js** | 22 or newer | `node --version` |
| **npm** | (comes with Node.js) | `npm --version` |
| **Docker** (optional) | Any recent version | `docker --version` |

Docker is only needed if you want [Maximum security mode](/en/security/) (all code runs in containers).

If you don't have Node.js, install it from [nodejs.org](https://nodejs.org/).

---

## Step 1: Download and Run the Install Script

Open a terminal and run:

```bash
curl -fsSL https://acaclaw.com/install.sh | bash
```

Or download the script first and inspect it:

```bash
curl -fsSL https://acaclaw.com/install.sh -o install.sh
less install.sh          # review the script
bash install.sh
```

The script installs everything automatically:

```
[acaclaw] System: linux x86_64
[acaclaw] Node.js 22.14.0 ✓
[acaclaw] npm 10.9.2 ✓

── Step 1: OpenClaw ──
[acaclaw] Installing OpenClaw...
[acaclaw] OpenClaw installed ✓

── Step 2: Scientific Python Environment ──
[acaclaw] Installing Miniforge...
[acaclaw] Miniforge installed ✓

── Step 3: AcaClaw Plugins ──
[acaclaw] @acaclaw/workspace installed ✓
[acaclaw] @acaclaw/backup installed ✓
[acaclaw] @acaclaw/security installed ✓
[acaclaw] @acaclaw/academic-env installed ✓

── Step 4: Academic Skills ──
[acaclaw] 6 academic skills installed from ClawHub ✓

── Opening setup wizard in your browser...
```

At the end, the script starts the OpenClaw gateway and opens the setup wizard in your browser.

---

## Step 2: GUI Setup Wizard (Browser)

Once installation completes, your browser opens to `http://localhost:2090/` with the AcaClaw setup wizard.

### Why browser instead of a native app window?

A terminal install script cannot safely launch a native GUI application:

- **macOS**: Gatekeeper quarantines unsigned downloaded applications
- **Windows**: SmartScreen blocks unsigned executables
- **Linux**: No universal restriction, but display server access varies

Opening a browser page has none of these problems — the browser is already installed and trusted by the OS. The setup wizard runs locally (nothing sent to the internet) through OpenClaw's built-in web UI.

### Wizard screens

**Screen 1 — Discipline**

Choose your primary research field. This determines which scientific packages are pre-installed in your Conda environment.

| Discipline | What it adds |
|---|---|
| General | Python + R scientific stack (NumPy, SciPy, Pandas, tidyverse, ggplot2) |
| Biology | Biopython, scikit-bio, BiocManager |
| Chemistry | RDKit, molecular analysis tools |
| Medicine | lifelines (survival analysis), pydicom, R survival |
| Physics | Astropy, lmfit (curve fitting) |

You can add more disciplines later from the GUI.

**Screen 2 — AI Provider**

- Choose provider: Anthropic, OpenAI, Google AI, or OpenClaw Web
- Enter your API key (with link to "How to get an API key")
- Test connection button to verify the key works
- Select your preferred model

**Screen 3 — Workspace Location**

- Default: `~/AcaClaw/`
- Change button to pick a different directory
- Shows the workspace structure that will be created

**Screen 4 — Security Level**

| Level | What it does | Requires Docker? |
|---|---|---|
| **Standard** (recommended) | File operations restricted to workspace, command deny-lists, audit trail, automatic backup | No |
| **Maximum** | Everything above + all code runs inside Docker containers. Full isolation. | Yes |

**Screen 5 — Ready**

- Summary of all choices
- "Finish Setup" button
- Progress indicator while the Conda environment is created for your discipline

After setup, the wizard redirects to the AcaClaw dashboard. Installation is complete.

---

## After Install: Adding Skills and Packages

Everything after initial setup is done through the browser GUI — no terminal needed.

### Installing new skills

Open the **Skills** tab in the browser → click **ClawHub** → browse or search → click **Install**. The gateway calls `skills.install` over WebSocket and shows progress in the browser.

### Adding a new discipline

Open the **Environment** tab → click **Add Discipline** → select Chemistry, Biology, etc. The gateway calls `acaclaw.env.install` which runs `conda env create` in the background. A progress bar shows installation status. When done, the new environment and packages are immediately available.

### Installing individual packages

Open the **Environment** tab → click **Install Package** → type the package name. This runs `conda install` in the active environment via the gateway. No terminal.

### How it works underneath

The browser never runs commands directly. It sends WebSocket messages to the gateway, which spawns the actual process (`clawhub install`, `conda install`, `conda env create`). Progress events stream back over the WebSocket and display in the browser as a progress bar. If installation fails, the error message appears in the browser.

---

## Platform-Specific Notes

### Linux

```bash
curl -fsSL https://acaclaw.com/install.sh | bash
```

- Works on any distribution with Node.js 22+
- The browser wizard opens via `xdg-open http://localhost:2090/`
- If no display server is available (headless/SSH), the script prints the URL to visit manually
- **Desktop integration**: installs a `.desktop` file — AcaClaw appears in your app launcher and can be pinned to the dock

### macOS

```bash
curl -fsSL https://acaclaw.com/install.sh | bash
```

- Supports both Intel (x86_64) and Apple Silicon (arm64)
- Requires Xcode Command Line Tools (the script prompts you if missing)
- Gatekeeper does not interfere — the script installs CLI tools and npm packages, not unsigned `.app` bundles
- The browser wizard opens via `open http://localhost:2090/`
- **Desktop integration** — 3-layer launch guarantee:
  1. **Dock / Launchpad**: `AcaClaw.app` in `~/Applications/` — search "AcaClaw" in Spotlight or Launchpad
  2. **Desktop icon**: Finder alias on `~/Desktop/` — always visible, double-click to launch
  3. **Browser bookmark**: `http://localhost:2090/` — if layers 1 and 2 both fail, this always works

### Windows (WSL2) — Phase 2

> WSL2 support is planned for Phase 2 and is not yet available. The install script will be tested and adapted for the WSL2 environment in a future release.

---

## What the Installer Does

For transparency, here is exactly what the install script does:

| Step | Action | Location |
|---|---|---|
| 1 | Installs OpenClaw via npm | Global (`npm install -g openclaw`) |
| 2 | Installs Miniforge (Conda) | `~/.acaclaw/miniforge3/` |
| 3 | Copies AcaClaw plugins | `~/.openclaw-acaclaw/plugins/` (isolated profile) |
| 4 | Installs academic skills from ClawHub | `~/.openclaw-acaclaw/skills/` |
| 5 | Writes AcaClaw config | `~/.openclaw-acaclaw/openclaw.json` (inherits existing API keys via `$include`) |
| 6 | Starts gateway, opens browser wizard | `openclaw --profile acaclaw gateway run` → `http://localhost:2090/` |

The browser wizard then:

| Step | Action | Location |
|---|---|---|
| 7 | Creates Conda environment for your discipline | `~/.acaclaw/miniforge3/envs/acaclaw-*` |
| 8 | Saves discipline + provider config | `~/.openclaw-acaclaw/openclaw.json` (via gateway API) |
| 9 | Creates workspace directory structure | `~/AcaClaw/` |

Nothing is installed outside these directories. Nothing is sent to the internet (except npm/conda package downloads and the API key test).

**If you already have OpenClaw installed:** AcaClaw never modifies `~/.openclaw/`. Your existing config, plugins, and sessions are untouched. AcaClaw inherits your API keys read-only via `$include`. Uninstalling AcaClaw leaves OpenClaw exactly as it was.

---

## Uninstall

```bash
curl -fsSL https://acaclaw.com/uninstall.sh | bash
```

Or manually:

```bash
# Remove AcaClaw profile (plugins, skills, config, sessions)
rm -rf ~/.openclaw-acaclaw

# Remove AcaClaw data (conda, backups, audit logs)
rm -rf ~/.acaclaw

# Remove workspace (WARNING: deletes your research files)
# rm -rf ~/AcaClaw

# Remove OpenClaw (optional — only if you don't use it separately)
# npm uninstall -g openclaw
```

The uninstall script never removes `~/AcaClaw/` automatically — your research files are yours.

**OpenClaw is never affected.** Your `~/.openclaw/` directory, config, plugins, and sessions remain exactly as they were before AcaClaw was installed.

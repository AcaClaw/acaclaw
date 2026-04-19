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
  - [Windows (WSL2)](#windows-wsl2)
- [Upgrading / Re-running the Installer](#upgrading--re-running-the-installer)
- [What the Installer Does](#what-the-installer-does)
  - [Network Mirrors & Timeout Configuration](#network-mirrors--timeout-configuration)
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

AcaClaw does not run a separate GUI application. It serves its own browser UI on its gateway port (`http://localhost:2090`). OpenClaw's built-in admin dashboard remains available on the default gateway (`http://localhost:18789`). Two gateways, two ports, two frontends.

After install, you never need the terminal again. Skills, discipline packages, configuration, and backup are all managed through the browser GUI. See [Web GUI](/en/desktop-gui/) for details.

### Platform Support

| Platform | Status | Notes |
|---|---|---|
| **Linux** (Ubuntu, Debian, Fedora, etc.) | **Phase 1 — Available now** | Full support via CLI install script |
| **macOS** (Intel & Apple Silicon) | **Phase 1 — Available now** | Full support via CLI install script |
| **Windows (WSL2)** | **Phase 1 — Available now** | Installs inside WSL2 Linux, launches via Windows browser |

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

### Why a web app wizard instead of a native binary?

A terminal install script cannot safely launch a native GUI application across all OSes due to quarantines and smart screens. 

Instead, the installer attempts to launch the setup wizard as a **Standalone App Window** (a "dock app" without browser tabs or address bars) using your existing Chrome or Edge installation. If a supported browser isn't found, it gracefully falls back to opening a standard browser tab.

This provides a native app experience while remaining completely local and trusted by your OS.

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

### Windows (WSL2)

```bash
# Inside WSL2 terminal
curl -fsSL https://acaclaw.com/install.sh | bash
```

The install script auto-detects WSL2 (via `WSL_DISTRO_NAME` or `/proc/version`) and runs the standard Linux install path with four WSL2-specific additions:

#### How WSL2 differs from native Linux

| Aspect | Native Linux | WSL2 |
|---|---|---|
| Install location | `~/.openclaw/`, `~/.acaclaw/` | Same (inside WSL2 filesystem) |
| Node.js / Conda / plugins | Installed in WSL2 | Same |
| Gateway process | Runs in WSL2 | Same — `localhost:2090` auto-forwards to Windows |
| App window | PWA via Linux Chrome/Edge | Opens Windows-side browser via `cmd.exe /c start` |
| Setup wizard | Opens in Linux browser | Opens in Windows browser (API key entry on Windows side) |
| Desktop shortcut | `.desktop` file | `.lnk` on Windows Desktop (launches via `wsl.exe`) |
| Workspace symlink | N/A | Symlink on Windows Desktop → `~/AcaClaw/` |

#### 1. Standalone app window via Windows browser

WSL2 does not have a native display server. Instead of trying to open a Linux browser (which requires WSLg or an X server), the installer launches the **Windows-side browser** directly:

```bash
# Detected by install.sh when PLATFORM=wsl2
cmd.exe /c start "" "http://localhost:2090/"
```

WSL2 automatically forwards `localhost` ports to Windows, so `http://localhost:2090/` opens the AcaClaw UI in the user's default Windows browser (typically Edge or Chrome).

For the standalone app window experience (no address bar, no browser tabs), the installer attempts Chromium `--app` mode on the Windows side:

```bash
# Try Edge first (pre-installed on Windows 10/11)
"/mnt/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" \
  --app="http://localhost:2090/" --no-first-run --disable-fre &

# Fallback: Chrome
"/mnt/c/Program Files/Google/Chrome/Application/chrome.exe" \
  --app="http://localhost:2090/" --no-first-run &

# Final fallback: regular browser tab
cmd.exe /c start "" "http://localhost:2090/"
```

This gives users the same frameless app window experience as macOS (WKWebView) and native Linux (PWA), but using Windows Edge/Chrome.

#### 2. Setup wizard opens on Windows side

The setup wizard (API key entry, discipline selection, security level) opens in the **Windows browser**, not inside WSL2. This is important because:

- Users copy-paste API keys from Windows password managers / browser sessions
- Windows is the primary desktop environment; WSL2 is the compute backend
- No dependency on WSLg or X11 forwarding

The install script detects WSL2 and calls `cmd.exe /c start` instead of `xdg-open`:

```bash
case "$PLATFORM" in
  wsl2)
    # Open in Windows browser, not WSL2 Linux browser
    cmd.exe /c start "" "$SETUP_URL" 2>/dev/null || true
    ;;
esac
```

#### 3. Workspace symlink on Windows Desktop

After creating `~/AcaClaw/` inside WSL2, the installer creates a **Windows shortcut** on the user's Desktop that points to the WSL2 workspace folder:

```
Windows Desktop/
  AcaClaw Workspace.lnk  →  \\wsl$\Ubuntu\home\user\AcaClaw\
```

This lets users browse their research files from Windows Explorer without navigating the `\\wsl$\` path manually. Created via PowerShell:

```powershell
$desktop = [Environment]::GetFolderPath('Desktop')
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut("$desktop\AcaClaw Workspace.lnk")
$shortcut.TargetPath = "\\wsl$\$distro\home\$user\AcaClaw"
$shortcut.Description = "AcaClaw Research Workspace (WSL2)"
$shortcut.Save()
```

#### 4. App shortcut on Windows Desktop

A second `.lnk` shortcut is created on the Windows Desktop to **launch AcaClaw**:

```
Windows Desktop/
  AcaClaw.lnk  →  wsl.exe -d Ubuntu -- bash ~/.acaclaw/start.sh
```

Double-clicking this shortcut:
1. Starts the gateway inside WSL2 (if not already running)
2. Opens `http://localhost:2090/` in the Windows browser as a standalone app window
3. No terminal window stays open (the shortcut runs minimized)

Created via PowerShell:

```powershell
$shortcut.TargetPath = "wsl.exe"
$shortcut.Arguments = "-d $distro -- bash $HOME/.acaclaw/start.sh"
$shortcut.WindowStyle = 7  # Minimized
```

#### WSL2 desktop integration summary

After install, the Windows Desktop has two shortcuts:

| Shortcut | Target | Purpose |
|---|---|---|
| **AcaClaw** | `wsl.exe -- bash ~/.acaclaw/start.sh` | Launch the app (gateway + browser window) |
| **AcaClaw Workspace** | `\\wsl$\Ubuntu\home\user\AcaClaw\` | Open research files in Windows Explorer |

#### Prerequisites for WSL2

| Requirement | How to check | Notes |
|---|---|---|
| WSL2 installed | `wsl --version` in PowerShell | Windows 10 2004+ or Windows 11 |
| Ubuntu (or any distro) | `wsl -l -v` in PowerShell | Ubuntu 22.04+ recommended |
| `wslpath` available | `which wslpath` in WSL2 | Ships with all modern WSL2 distros |
| Edge or Chrome on Windows | Pre-installed on Windows 10/11 | For standalone app window |

Node.js, npm, and Conda are installed **inside WSL2** by the install script — no Windows-side Node.js needed.

---

## Upgrading / Re-running the Installer

The install script is idempotent — safe to re-run at any time. It detects existing components and applies the **upgrade principle**: replace app files, preserve user data.

### Upgrade principle

> **Replace app code. Keep user data.**

| Category | Examples | On upgrade |
|---|---|---|
| **App files** (replaceable) | Plugins, UI, management scripts, conda env YAMLs | **Always replaced** with latest version |
| **User data** (precious) | Skills, config (API keys, model choices), workspace files, audit logs, backups, conda envs | **Preserved** — never deleted or overwritten |
| **Infrastructure** (heavy) | Node.js, OpenClaw, Miniforge | **Skipped** if version is sufficient; upgraded if too old |

### Version tracking

The installer saves the installed version to `~/.acaclaw/config/version.txt`. On re-run:

```
No version.txt → fresh install (full setup wizard)
Version found  → upgrade (skip wizard, replace app files, keep data)
```

### Per-component behavior

| Component | If already present | Action taken |
|---|---|---|
| **Node.js** | Version ≥ 22 found | Skip |
| **Node.js** | Version < 22 found | Auto-upgrade via nvm |
| **OpenClaw** | Version ≥ minimum | Skip |
| **OpenClaw** | Version < minimum | Upgrade via npm |
| **Miniforge** | Directory exists | Skip |
| **Conda env** (`acaclaw`) | Environment exists | Skip |
| **AcaClaw plugins** | Plugin directory exists | **Replace** — always copies fresh plugin files |
| **UI assets** | `~/.openclaw/ui/` exists | **Replace** — deploys new build, removes stale chunks |
| **Management scripts** | `start.sh`, `stop.sh`, `uninstall.sh` | **Replace** — always copies latest |
| **Conda env YAMLs** | `~/.acaclaw/env/conda/` | **Replace** — copies latest environment definitions |
| **WeChat plugin** | Installed | **Replace** — reinstalls with latest patches |
| **Skills** | `~/.openclaw/skills/` has content | **Skip** — user may have installed custom skills |
| **AcaClaw config** | `~/.openclaw/openclaw.json` exists | **Merge** — preserves user settings (see below) |
| **AcaClaw config** | No existing config | Create fresh from template |
| **Workspace** (`~/AcaClaw/`) | Directory exists | **Skip** — never touches user files |
| **Desktop shortcut** | Already installed | Skip |
| **Audit logs** | `~/.acaclaw/audit/` | **Keep** |
| **Backups** | `~/.acaclaw/backups/` | **Keep** |
| **Gateway process** | Running on port 2090 | Kill and restart |
| **Setup wizard** | Setup already completed | **Skip** — goes straight to dashboard |

### Configuration merge on upgrade

When the installer detects an existing `~/.openclaw/openclaw.json`, it merges AcaClaw defaults on top while preserving your settings:

| Setting | Behavior |
|---|---|
| API keys | Preserved from existing config |
| Model selection | Preserved — your chosen model is not overwritten |
| Web / browser config | Preserved |
| Conda `pathPrepend` | Updated to current Miniforge path |
| Gateway port / mode | Set to AcaClaw defaults if not already set |
| Agent list | Replaced with AcaClaw template (model choice preserved) |
| Tool restrictions | Replaced with AcaClaw template (web config preserved) |
| Model providers | Defaults added for missing providers; existing providers untouched |

If no existing config is found, a fresh config is created from the AcaClaw template.

### Legacy cleanup

The installer automatically removes artifacts from older AcaClaw versions:

- **`openclaw-gateway-acaclaw.service`** — legacy systemd unit that used `~/.openclaw-acaclaw/` profile isolation (no longer used)
- **`acaclaw-gateway.service` with `--profile` flag** — stale service from older installs that causes 503 errors
- **Stale gateway process on port 2090** — killed via `lsof` or `ss` before starting a fresh gateway

### Running the installer again

```bash
# Upgrade to latest version — keeps all your data
curl -fsSL https://acaclaw.com/install.sh | bash

# Skip Conda if you only want to update OpenClaw/plugins
bash install.sh --no-conda
```

On upgrade, the installer:
1. Detects `~/.acaclaw/config/version.txt` → enters upgrade mode
2. Shows `Upgrading AcaClaw from X.Y.Z to A.B.C` in the banner
3. Replaces app files (plugins, UI, scripts)
4. Preserves user data (skills, config, workspace, audit, backups)
5. Skips the setup wizard (opens dashboard directly)
6. Updates `version.txt` to the new version

---

## What the Installer Does

For transparency, here is exactly what the install script does:

| Step | Action | Location |
|---|---|---|
| 1 | Installs OpenClaw via npm (auto-selects fastest registry, with timeout) | Global (`npm install -g openclaw`) |
| 2 | Installs Miniforge (Conda) (GitHub + Tsinghua/BFSU mirrors) | `~/.acaclaw/miniforge3/` |
| 3 | Copies AcaClaw plugins | `~/.openclaw/extensions/` |
| 4 | Installs academic skills from ClawHub (with mirror fallback) | `~/.openclaw/skills/` |
| 5 | Writes AcaClaw config | `~/.openclaw/openclaw.json` (copies existing API keys) |
| 6 | Registers systemd user service | `~/.config/systemd/user/acaclaw-gateway.service` |
| 7 | Starts gateway, opens browser wizard | `openclaw gateway run` → `http://localhost:2090/` |
| 7a | (WSL2 only) Opens Windows browser instead of Linux | `cmd.exe /c start` or Edge/Chrome `--app` mode |
| 7b | (WSL2 only) Creates workspace symlink on Windows Desktop | `AcaClaw Workspace.lnk` → `\\wsl$\...\AcaClaw\` |
| 7c | (WSL2 only) Creates app shortcut on Windows Desktop | `AcaClaw.lnk` → `wsl.exe -- bash start.sh` |

The browser wizard then:

| Step | Action | Location |
|---|---|---|
| 8 | Creates Conda environment for your discipline | `~/.acaclaw/miniforge3/envs/acaclaw-*` |
| 9 | Saves discipline + provider config | `~/.openclaw/openclaw.json` (via gateway API) |
| 10 | Creates workspace directory structure | `~/AcaClaw/` |

Nothing is installed outside these directories. Nothing is sent to the internet (except npm/conda package downloads and the API key test).

### Network Mirrors & Timeout Configuration

The installer automatically falls back to faster mirrors when primary sources are slow or unreachable. This is especially useful behind firewalls or in regions where GitHub/npm are throttled.

**Fallback chain per source:**

| Source | Primary | Mirror fallback(s) |
|---|---|---|
| **nvm** (Node.js installer) | `github.com/nvm-sh/nvm` | `gitee.com/mirrors/nvm` |
| **Node.js binaries** | `nodejs.org/dist/` | `npmmirror.com/mirrors/node/` |
| **Git clone** | `github.com` HTTPS | GitHub proxy (`ghproxy.com`) → SSH |
| **npm packages** | `registry.npmjs.org` | `registry.npmmirror.com` |
| **Miniforge** | `github.com` releases | Tsinghua mirror → BFSU mirror |
| **Conda channels** | `conda-forge` (official) | Tsinghua mirror → BFSU mirror |
| **ClawHub skills** | `clawhub.com` | `cn.clawhub-mirror.com` |

**Override via environment variables:**

All mirror URLs and timeouts are configurable. Set these before running the install script:

```bash
# nvm install script mirror (for China users behind GFW)
export NVM_MIRROR="https://gitee.com/mirrors/nvm/raw/master/install.sh"  # default

# Node.js binary download mirror (auto-detected, or set manually)
export NVM_NODEJS_ORG_MIRROR="https://npmmirror.com/mirrors/node/"  # default: auto-detect

# GitHub mirror proxy (for git clone when github.com is slow)
export GITHUB_MIRROR="https://ghproxy.com"          # default

# ClawHub skill registry mirror
export CLAWHUB_MIRROR="https://cn.clawhub-mirror.com"  # default

# Per-skill install timeout (seconds) before falling back to mirror
export CLAWHUB_SKILL_TIMEOUT=15                      # default

# npm install timeout (seconds) for openclaw and clawhub CLI
export NETWORK_TIMEOUT=60                            # default
```

Example: use a custom GitHub mirror and longer timeouts on a slow connection:

```bash
GITHUB_MIRROR="https://mirror.ghproxy.com" NETWORK_TIMEOUT=120 bash install.sh
```

**If you already have OpenClaw installed:** AcaClaw writes its config to `~/.openclaw/openclaw.json`, merging your existing API keys and model settings on top of AcaClaw defaults. Your API keys, model choices, and web config are preserved. See [Upgrading / Re-running the Installer](#upgrading--re-running-the-installer) for the full merge behavior. **Uninstalling AcaClaw removes both AcaClaw and OpenClaw** (`~/.acaclaw/` and `~/.openclaw/`).

---

## Uninstall

AcaClaw can be uninstalled two ways: from the browser GUI or from the terminal.

> **Note:** Uninstalling AcaClaw removes **both** AcaClaw (`~/.acaclaw/`) and OpenClaw (`~/.openclaw/`), including config, plugins, sessions, conda environments, and gateway services. Your research data (`~/AcaClaw/`) is never touched.

### Option 1: Browser GUI (Settings page)

Open AcaClaw in your browser → navigate to **Settings** → click the **Uninstall** tab.

The Uninstall tab shows:

- What will be removed and what stays untouched
- **Uninstall** — removes both AcaClaw and OpenClaw

Click a button, confirm, and the uninstall runs with a live progress log. No terminal needed.

### Option 2: Terminal

```bash
bash ~/.acaclaw/uninstall.sh
```

#### Script options

| Flag | Description |
|---|---|
| `--yes` / `-y` | Skip confirmation prompt |
| `--keep-backups` | Keep backup files in `~/.acaclaw/backups/` |

### What gets removed

| Item | Path |
|---|---|
| OpenClaw directory (config, plugins, sessions, UI) | `~/.openclaw/` |
| AcaClaw conda environments (acaclaw, acaclaw-bio, etc.) | conda env list |
| AcaClaw config and audit data | `~/.acaclaw/` |
| AcaClaw-installed Miniforge | `~/.acaclaw/miniforge3/` |
| AcaClaw desktop shortcut | App launcher / Desktop |
| AcaClaw gateway service | `acaclaw-gateway.service` |
| OpenClaw gateway service | `openclaw-gateway.service` |
| OpenClaw + ClawHub CLI | npm global packages |

### What stays untouched

| Item | Path |
|---|---|
| Your research data | `~/AcaClaw/` |
| System conda installations | `~/miniconda3/`, `~/miniforge3/`, etc. |
| Node.js itself | system install |

The uninstall scripts **never** remove `~/AcaClaw/` automatically — your research files are yours.

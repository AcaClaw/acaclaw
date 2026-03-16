---
layout: page
title: Computing Environment
lang: en
permalink: /en/computing-environment/
---

> **Design Principle**: Minimal by default. Install only what you need, when you need it. Conflicts create new environments automatically — never break a working setup.

---

## Overview

AcaClaw uses [Miniforge](https://github.com/conda-forge/miniforge) (conda-forge) to manage Python, R, and system-level scientific tools in isolated Conda environments.

**Why Miniforge?**

| Requirement | Why Miniforge wins |
|---|---|
| Python + R in one environment | Conda resolves cross-language dependencies natively |
| No licensing issues | Miniforge uses conda-forge only (100% open, unlike Anaconda) |
| Works on all platforms | Linux, macOS, Windows (x86_64 + arm64) |
| Reproducible | YAML lockfiles pin exact versions |
| Isolated from system Python/R | No conflicts with OS packages |

---

## Three-Stage Install

AcaClaw installs progressively — each stage is independent and optional beyond Stage 1.

```
Stage 1          Stage 2               Stage 3
Base Install     Discipline Packages   On-Demand Packages
─────────────    ───────────────────   ──────────────────
Miniforge        bioclaw               User requests
Python 3.12      chemclaw              "install seaborn"
bash tools       medclaw               ↓
core stack       sciclaw               Try default env
                 (R optional)          ↓ conflict?
                                       Create new env
```

---

### Stage 1: Base Install

Every AcaClaw installation starts here. This is the **default environment** (`acaclaw`).

**What gets installed:**

| Component | Details |
|---|---|
| **Miniforge** | `~/.acaclaw/miniforge3` — conda/mamba package manager |
| **Python 3.12** | Latest stable CPython |
| **Core scientific stack** | numpy, scipy, pandas, matplotlib, statsmodels, sympy |
| **Interactive computing** | JupyterLab (Python kernel) |
| **Document tools** | openpyxl, xlsxwriter |
| **Research tools** | semanticscholar, pymupdf (via pip) |

**What is NOT installed by default:**

- R (opt-in at Stage 2 or later)
- Discipline-specific packages (Stage 2)
- Deep learning frameworks
- LaTeX / TeX Live

**Conda environment name:** `acaclaw`

```bash
# Created by the installer
conda create -n acaclaw -c conda-forge python=3.12 numpy scipy pandas ...
```

This is the **primary environment** — all commands default to running here.

---

### Stage 2: Discipline Environments

After base install, users choose one or more disciplines. Each discipline adds a focused set of **must-have** packages to the base environment.

#### Available Disciplines

| Discipline | Env Add-on Name | Python Packages | R Packages (opt-in) |
|---|---|---|---|
| Biology | `bioclaw` | biopython, scikit-bio | r-biocmanager |
| Chemistry | `chemclaw` | rdkit | — |
| Medicine | `medclaw` | lifelines, pydicom | r-survival |
| Science/Physics | `sciclaw` | astropy, lmfit | — |

#### R Support

R is **not installed by default**. When a user selects any discipline, they are asked:

```
Include R language support? [y/N]
```

If yes, the following are added to the environment:

| R Component | Purpose |
|---|---|
| `r-base` (>=4.3) | R interpreter |
| `r-irkernel` (>=1.3) | R kernel for JupyterLab |
| `r-essentials` (>=4.3) | Core R packages (tidyverse, ggplot2, dplyr, tidyr, etc.) |

Plus any discipline-specific R packages (e.g., `r-biocmanager` for biology, `r-survival` for medicine).

#### Single Discipline

When a user picks one discipline, its packages are added to the base `acaclaw` environment:

```bash
# User picks "Biology" + R
conda install -n acaclaw biopython scikit-bio r-base r-irkernel r-essentials r-biocmanager
```

The environment stays named `acaclaw`. No new env is created.

#### Multiple Disciplines

When a user picks multiple disciplines (e.g., Biology + Medicine), all selected packages are merged into the base `acaclaw` environment:

```bash
# User picks Biology + Medicine + R
conda install -n acaclaw \
  biopython scikit-bio \
  lifelines pydicom \
  r-base r-irkernel r-essentials r-biocmanager r-survival
```

Conda resolves overlapping dependencies automatically. The environment remains `acaclaw` — one env, all disciplines merged.

#### "Must-Have" Package Philosophy

Each discipline includes **only** packages that are:
1. **Essential** — the discipline cannot function without them
2. **Stable** — well-maintained, compatible with the base stack
3. **Small** — minimal footprint (no 4GB frameworks in base)

Everything else is available on-demand (Stage 3).

---

### Stage 3: On-Demand Package Installation

When a user (or the AI agent) needs a package that is not in the current environment, the system follows a **cascade resolution** strategy.

#### Resolution Flow

```
User: "Install seaborn"
         │
         ▼
┌─ Step 1: Try default env (acaclaw) ───────────┐
│  conda install --dry-run -n acaclaw seaborn    │
│  ↓                                             │
│  No conflict? → Install here. Done.            │
│  Conflict?    → Go to Step 2.                  │
└────────────────────────────────────────────────┘
         │ conflict
         ▼
┌─ Step 2: Try existing auxiliary envs ─────────┐
│  For each registered aux env:                  │
│    conda install --dry-run -n <aux> seaborn    │
│    No conflict? → Install here. Done.          │
│  All conflict?  → Go to Step 3.               │
└────────────────────────────────────────────────┘
         │ all conflict
         ▼
┌─ Step 3: Ask user to create new env ──────────┐
│  "seaborn conflicts with your current envs.    │
│   Create a new environment for it?"            │
│                                                │
│  User confirms → conda create -n <name> ...    │
│  Register new env in config + manifest.        │
│  Inform LLM about new env and its purpose.     │
└────────────────────────────────────────────────┘
```

#### Why This Order?

| Step | Rationale |
|---|---|
| Try default first | Keeps everything in one place; minimizes env sprawl |
| Try aux envs next | Reuse existing overflow envs before creating new ones |
| Create new env last | Only when truly needed; user confirms the name and purpose |

#### New Environment Registration

When a new env is created, the system:

1. **Creates the Conda env** with the requested package + compatible base packages
2. **Writes to config** — updates `~/.acaclaw/config/env-manifest.json`:

```json
{
  "environments": {
    "acaclaw": {
      "type": "primary",
      "description": "Base scientific environment + Biology + Medicine",
      "pythonVersion": "3.12.8",
      "rVersion": "4.4.1"
    },
    "acaclaw-gpu": {
      "type": "auxiliary",
      "description": "GPU-accelerated computing (PyTorch, CUDA)",
      "pythonVersion": "3.12.8",
      "createdAt": "2026-03-14T10:30:00Z",
      "createdReason": "PyTorch CUDA conflicts with numpy 1.x in primary env"
    }
  },
  "defaultEnv": "acaclaw"
}
```

3. **Updates LLM context** — the `@acaclaw/academic-env` plugin reads the manifest and injects all envs into the system prompt:

```
## Computing Environments

Primary: `acaclaw` (Python 3.12, R 4.4, Biology + Medicine packages)
Auxiliary: `acaclaw-gpu` (PyTorch + CUDA — use for deep learning tasks)

Use the primary env for general tasks. Switch to acaclaw-gpu when
the user needs GPU computing or deep learning.
```

4. **Registers auto-activation rules** — the plugin prefixes commands with the correct `conda run -n <env>` based on what packages the command needs.

#### Cascade Example

```
Day 1: User installs AcaClaw
  → acaclaw env: Python, numpy, scipy, pandas, matplotlib

Day 2: User picks Biology discipline
  → acaclaw env: + biopython, scikit-bio

Day 5: User says "install seaborn"
  → Try acaclaw: no conflict → installed in acaclaw ✓

Day 8: User says "install pytorch with CUDA"
  → Try acaclaw: conflict (CUDA toolkit vs system libs)
  → No aux envs exist yet
  → Ask user: "Create new env for GPU computing?"
  → User confirms → create acaclaw-gpu
  → Register in manifest, inform LLM

Day 10: User says "install torchvision"
  → Try acaclaw: conflict
  → Try acaclaw-gpu: no conflict → installed in acaclaw-gpu ✓

Day 15: User says "install jax[cuda]"
  → Try acaclaw: conflict
  → Try acaclaw-gpu: conflict (JAX CUDA vs PyTorch CUDA)
  → Ask user: "Create new env for JAX?"
  → User confirms → create acaclaw-jax
```

---

## Environment Auto-Activation

The `@acaclaw/academic-env` plugin handles environment activation transparently.

### How It Works

1. **Default**: All `bash`/`exec` tool calls are prefixed with `conda run -n acaclaw`
2. **Routing**: If a command references a package only available in an aux env, the plugin routes it there
3. **Explicit**: Users can always specify: `conda run -n acaclaw-gpu python train.py`

### Routing Rules

| Scenario | Env Used |
|---|---|
| `python analysis.py` (uses pandas) | `acaclaw` (primary) |
| `python train.py` (uses pytorch) | `acaclaw-gpu` (auto-detected) |
| `Rscript plot.R` (uses ggplot2) | `acaclaw` (primary, if R installed) |
| `jupyter lab` | `acaclaw` (primary — all kernels visible) |

The LLM knows which packages are in which env and uses the correct one.

---

## Directory Layout

```
~/.acaclaw/
├── miniforge3/              # Miniforge installation
│   ├── bin/
│   │   ├── conda
│   │   ├── mamba
│   │   └── python           # base Python (not used directly)
│   └── envs/
│       ├── acaclaw/          # Primary environment
│       ├── acaclaw-gpu/      # Aux env (user-created)
│       └── ...
├── config/
│   ├── profile.txt           # Selected discipline(s)
│   ├── conda-prefix.txt      # Path to conda installation used
│   ├── env-manifest.json     # All envs, descriptions, metadata
│   └── security-mode.txt     # Standard or Maximum
└── backups/
    └── ...
```

---

## Conda Environment Definitions

Environment YAML files live in `env/conda/` in the AcaClaw repo. They define the **base** and **discipline add-on** packages.

| File | Purpose |
|---|---|
| `environment-base.yml` | Base `acaclaw` env — Python + core scientific stack |
| `environment-bio.yml` | Biology add-on packages (biopython, scikit-bio) |
| `environment-chem.yml` | Chemistry add-on packages (rdkit) |
| `environment-med.yml` | Medicine add-on packages (lifelines, pydicom) |
| `environment-phys.yml` | Physics add-on packages (astropy, lmfit) |
| `environment-r.yml` | R language add-on (r-base, r-irkernel, r-essentials) |

Discipline files list **only** the discipline-specific packages. The installer merges them with the base at install time.

---

## Package Conflict Detection

Before installing any package, the system runs a dry-run to detect conflicts:

```bash
conda install --dry-run -n <env> <package> 2>&1
```

| Exit Code | Meaning | Action |
|---|---|---|
| 0 | Compatible | Install in this env |
| Non-zero + "conflict" | Dependency conflict | Try next env in cascade |
| Non-zero + other | Network/other error | Retry or report error |

The system never installs a package that would break an existing environment.

---

## CLI Commands

The `@acaclaw/academic-env` plugin exposes these commands:

```bash
# Show all environments and their status
openclaw acaclaw-env status

# List packages in the primary environment
openclaw acaclaw-env packages

# List packages in a specific environment
openclaw acaclaw-env packages --env acaclaw-gpu

# List available disciplines
openclaw acaclaw-env disciplines

# Add a discipline to the primary environment
openclaw acaclaw-env add-discipline biology

# Install a package (uses cascade resolution)
openclaw acaclaw-env install <package>

# Create a new auxiliary environment
openclaw acaclaw-env create-env <name> --description "Purpose of this env"

# Show all registered environments
openclaw acaclaw-env list-envs
```

---

## Design Rationale

### Why Not Separate Envs Per Discipline?

Previous design created a separate env for each discipline (acaclaw-bio, acaclaw-chem, etc.). Problems:

| Problem | Impact |
|---|---|
| Duplicated base packages | ~800MB per env for numpy/scipy/pandas alone |
| Multi-discipline users get N envs | Confusing which env to use for a given task |
| No shared state | Installing seaborn in bio env doesn't help chem env |

New design: one primary env, discipline packages merged in. Aux envs only on conflict.

### Why Not Pre-Install R?

| Consideration | Decision |
|---|---|
| R ecosystem is ~1.5GB | Too large for users who only need Python |
| Not all disciplines need R | Chemistry/Physics rarely use R |
| Easy to add later | `openclaw acaclaw-env install r-base r-irkernel r-essentials` |

R is opt-in at discipline selection or on-demand later.

### Why Cascade Resolution?

| Alternative | Why we rejected it |
|---|---|
| Always create new env | Env sprawl — users end up with 10+ envs |
| Always install in default | Breaks existing packages on conflict |
| Ask user every time | Bad UX — most installs have no conflicts |

Cascade: try default → try aux → ask user. Best of all worlds.

### Why Miniforge Over Alternatives?

| Alternative | Why not |
|---|---|
| Anaconda | Commercial license for orgs >200 people |
| Miniconda | Uses defaults channel (Anaconda TOS) |
| venv + pip | Cannot manage R, C libs, or system tools |
| uv | Python-only, no R support |
| Nix | Steep learning curve, poor IDE integration |
| renv | R-only, no Python |
| Pixi | Promising but immature ecosystem |

Miniforge (conda-forge) is the only option that handles Python + R + C deps in a single, license-free environment manager.

---

## Integration with OpenClaw

AcaClaw runs on top of OpenClaw. Understanding how OpenClaw handles Python execution is critical to getting the environment integration right.

### How OpenClaw Executes Commands

OpenClaw can run commands in two modes:

| Mode | How Python is found | Env vars |
|---|---|---|
| **Gateway (host)** | Inherits host PATH. Runs login shell probe (`/bin/sh -lc env`) to get full PATH including conda/pyenv/nvm entries from `.bashrc`/`.zshrc` | `PYTHONHOME` and `PYTHONPATH` are **blocked** by security policy |
| **Sandbox (Docker)** | Uses container PATH (`/usr/local/bin:...`). Only system `python3` from `apt`. Host conda envs are invisible. | Only vars from `sandbox.docker.env` config are passed |

### What OpenClaw Does NOT Do

- Does not detect conda, venv, pyenv, or any Python environment manager
- Does not activate virtual environments
- Does not pass `CONDA_PREFIX`, `VIRTUAL_ENV`, or `PYENV_VERSION` to sandbox containers
- Does not manage Python packages
- Does not know which packages are installed

### How AcaClaw Bridges the Gap

AcaClaw uses three OpenClaw integration points to make Miniforge environments work transparently:

#### 1. `before_tool_call` Hook — Command Wrapping

The `@acaclaw/academic-env` plugin intercepts every `bash`/`exec` tool call and prefixes it with `conda run`:

```
User says: "Run my analysis"
LLM generates: python analysis.py
Plugin rewrites to: conda run --no-banner -n acaclaw python analysis.py
```

This works because:
- `conda run` does not require `conda activate` — no shell profile changes needed
- The conda binary is found via absolute path (`~/.acaclaw/miniforge3/bin/conda`)
- **Gateway mode only** — in sandbox mode, the host's conda binary does not exist inside the container (see [Sandbox Mode](#sandbox-mode-considerations) below)

#### 2. `tools.exec.pathPrepend` — PATH Configuration

In gateway mode, AcaClaw configures OpenClaw to prepend the Miniforge bin directory to PATH:

```json
{
  "tools": {
    "exec": {
      "pathPrepend": ["~/.acaclaw/miniforge3/bin"]
    }
  }
}
```

This ensures `conda` and `mamba` commands are always available in gateway mode, even without shell profile initialization.

> **Note:** In sandbox mode, this host path does not exist inside the container. Sandbox requires a different approach — see [Sandbox Mode](#sandbox-mode-considerations) below.

#### 3. `before_prompt_build` Hook — LLM Context

The plugin injects a "Computing Environment" section into the system prompt, telling the LLM:
- Which environments exist and what they contain
- Which packages are available (no need to install)
- When to use which environment (primary vs auxiliary)
- Not to run `pip install`, `conda install`, or `install.packages()` unless explicitly asked

### Existing Environment Detection

At startup, the `@acaclaw/academic-env` plugin probes for existing environments:

```
1. Check ~/.acaclaw/miniforge3/bin/conda (AcaClaw's own Miniforge)
2. Check ~/.acaclaw/miniforge3/condabin/conda (alternate path)
3. Check system PATH for conda (user's existing Miniforge/Anaconda/Miniconda)
4. If found: query 'conda env list --json' to discover all envs
5. Read ~/.acaclaw/config/env-manifest.json for registered AcaClaw envs
6. Merge: report all discovered envs to the LLM
```

**Reuse policy**: If the user already has a working Miniforge or conda installation, AcaClaw can use it instead of installing a second copy. The installer checks for existing conda at:

| Path | What it is |
|---|---|
| `~/.acaclaw/miniforge3` | AcaClaw's own Miniforge (preferred) |
| `~/miniforge3` | User's standalone Miniforge |
| `~/mambaforge` | User's standalone Mambaforge |
| `~/miniconda3` | User's Miniconda (conda-forge channel required) |
| `~/anaconda3` | User's Anaconda (not recommended — license) |
| System `conda` | Any conda on PATH |

If an existing conda is found, the installer asks:

```
Found existing conda at ~/miniforge3 (Miniforge 24.3.0).
  1) Use existing conda installation (recommended if compatible)
  2) Install AcaClaw's own Miniforge at ~/.acaclaw/miniforge3
```

The `acaclaw` environment is always created fresh in whichever conda is selected.

### Sandbox Mode Considerations

When OpenClaw runs in sandbox (Docker) mode, the host's Miniforge is **not accessible**. Sandbox containers are fully isolated:

- **Network**: `none` by default — no internet access, so `curl`/`wget` cannot download packages
- **Root filesystem**: read-only by default — cannot install software to `/opt`, `/usr`, etc.
- **Writable locations**: only `/tmp`, `/var/tmp`, `/run` (tmpfs) and the mounted `/workspace`
- **Host paths**: only the project workspace is mounted; `~/.acaclaw/miniforge3` is not visible
- **Env vars**: host environment is not inherited; only explicitly configured vars are passed

There are three strategies for making conda available in sandbox mode:

#### Strategy 1: Bind-mount host Miniforge (recommended)

Mount the host's Miniforge installation read-only into the container:

```json
{
  "agents": {
    "defaults": {
      "sandbox": {
        "docker": {
          "binds": [
            "~/.acaclaw/miniforge3:/opt/miniforge3:ro"
          ],
          "env": {
            "PATH": "/opt/miniforge3/envs/acaclaw/bin:/opt/miniforge3/bin:/usr/local/bin:/usr/bin:/bin"
          }
        }
      }
    }
  }
}
```

This is fast (no install step), consistent with the host environment, and works offline. Requires `dangerouslyAllowExternalBindSources: true` since the source path is outside the workspace.

#### Strategy 2: Custom Docker image with Miniforge pre-installed

Build a sandbox image that includes Miniforge and the `acaclaw` environment:

```dockerfile
FROM openclaw-sandbox:bookworm-slim
RUN curl -fsSL https://github.com/conda-forge/miniforge/releases/latest/download/Miniforge3-Linux-$(uname -m).sh -o /tmp/mf.sh \
    && bash /tmp/mf.sh -b -p /opt/miniforge3 \
    && rm /tmp/mf.sh
COPY environment.yml /tmp/environment.yml
RUN /opt/miniforge3/bin/conda env create -f /tmp/environment.yml
ENV PATH="/opt/miniforge3/envs/acaclaw/bin:/opt/miniforge3/bin:$PATH"
```

Then configure OpenClaw to use the custom image:

```json
{
  "agents": {
    "defaults": {
      "sandbox": {
        "docker": {
          "image": "acaclaw-sandbox:latest"
        }
      }
    }
  }
}
```

This is the most robust approach for teams, but requires rebuilding the image when packages change.

#### Strategy 3: `setupCommand` (requires network + writable root)

Install Miniforge inside the container at creation time. This requires overriding the default sandbox security settings:

```json
{
  "agents": {
    "defaults": {
      "sandbox": {
        "docker": {
          "network": "bridge",
          "readOnlyRoot": false,
          "setupCommand": "curl -fsSL https://github.com/conda-forge/miniforge/releases/latest/download/Miniforge3-Linux-$(uname -m).sh -o /tmp/mf.sh && bash /tmp/mf.sh -b -p /opt/miniforge3 && /opt/miniforge3/bin/conda env create -f /workspace/.acaclaw/environment.yml",
          "env": {
            "PATH": "/opt/miniforge3/envs/acaclaw/bin:/opt/miniforge3/bin:/usr/local/bin:/usr/bin:/bin"
          }
        }
      }
    }
  }
}
```

> **Warning:** This weakens sandbox security by enabling network access and a writable root filesystem. It is also slow — Miniforge download + env creation runs on every new container. Prefer Strategy 1 or 2.

### Configuration Files Written by AcaClaw

| File | Written by | Read by | Purpose |
|---|---|---|---|
| `~/.acaclaw/config/profile.txt` | Installer | Plugin | Selected discipline(s) |
| `~/.acaclaw/config/env-manifest.json` | Plugin | Plugin, LLM | All envs, packages, versions, descriptions |
| `~/.acaclaw/config/security-mode.txt` | Installer | Plugin | Standard or Maximum |
| `openclaw.json` (`tools.exec.pathPrepend`) | Installer | OpenClaw exec tool | Miniforge bin on PATH |
| `openclaw.json` (`plugins.*`) | Installer | OpenClaw plugin loader | Plugin settings |

<p align="center">
  <img src="public/logo/AcaClaw.svg" alt="AcaClaw" width="96" height="96">
</p>

# AcaClaw

<p align="center">
  <strong>Your AI Academic Assistant. One Click. Everything You Need.</strong>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge" alt="MIT License"></a>
  <a href="https://github.com/openclaw/openclaw"><img src="https://img.shields.io/badge/Powered_by-OpenClaw-red.svg?style=for-the-badge" alt="Powered by OpenClaw"></a>
</p>

---

## What Is AcaClaw?

**AcaClaw** is an AI-powered academic assistant for everyone in academia — scientists, engineers, professors, university and college students, even high school students. Terminal geek or first-time computer user, AcaClaw just works.

**One install gives you everything:**

- An AI assistant that understands your academic domain
- Paper search and literature review across all major databases
- Data analysis and publication-quality figures from your data
- Document writing, formatting, and reference management
- Automatic backup of every file it touches — your data is never at risk

Chemistry, physics, biology, medicine, engineering, mathematics, humanities — AcaClaw covers it all. Powered by [OpenClaw](https://github.com/openclaw/openclaw), the open-source AI platform. Like Ubuntu is to Linux, AcaClaw is to OpenClaw: everything you need, ready to go.

---

## How AcaClaw Relates to OpenClaw

AcaClaw is a **distribution layer** on top of OpenClaw — not a fork, not a replacement. OpenClaw provides the core AI platform (LLM handling, model routing, API key management, chat, plugins, CLI). AcaClaw adds:

| AcaClaw adds | OpenClaw provides (used as-is) |
|---|---|
| Research-focused GUI | LLM handling, model routing, streaming |
| Workspace and project system | API key storage and provider auth |
| Stricter security policies | Model discovery and provider catalogs |
| Automatic data backup | Chat sessions and message history |
| Curated academic skills | Plugin SDK, skill system, CLI |
| Discipline-specific Conda environments | WebSocket gateway and RPC |

**The golden rule:** If OpenClaw already does it, AcaClaw doesn't re-implement it. Both AcaClaw's UI and OpenClaw's UI are frontends to the same OpenClaw backend.

---

## Why AcaClaw Exists

AcaClaw exists for four reasons — each solves a real problem researchers face every day:

| # | Purpose | What it means |
|---|---------|---------------|
| **1** | **Pre-ship academic skills** | One install gives you paper search, data analysis, citation management, figure generation — all pre-configured and ready to use. No hunting for tools, no terminal commands, no configuration. |
| **2** | **Curate and contribute high-quality skills** | Every skill is built by a team (creator, tester, debugger, reviewer, maintainer), tested rigorously, and published to [ClawHub](https://clawhub.ai) — the official OpenClaw community hub. Individual contributors are credited by name and role. Quality comes from teamwork, and teamwork deserves recognition. |
| **3** | **Keep all skills environment-compatible** | Each discipline gets a self-contained Conda environment (e.g. `acaclaw-bio`) with all base packages plus discipline-specific ones. Dependencies are resolved at the distribution level. The active environment is auto-detected, injected into the AI's context, and discoverable by other packages. |
| **4** | **Keep data safe** | Every file is automatically backed up before modification. Versioned snapshots, one-click restore, configurable retention. Your research data is irreplaceable — AcaClaw treats it that way. |

These four purposes — **easy install, quality teamwork, environment compatibility, and data safety** — are the essence of AcaClaw. Everything else follows from them.

---

## Who Is This For?

| You are a... | AcaClaw helps you... |
|---|---|
| **Graduate student** | Search papers, manage references, draft manuscripts, analyze data |
| **Lab researcher** | Process experimental data, generate figures, write reports |
| **Professor / PI** | Draft grant proposals, review manuscripts, prepare course materials |
| **Medical researcher** | Search PubMed/clinical databases, summarize findings, format submissions |
| **Undergraduate / College student** | Literature review, lab reports, homework with step-by-step explanations |
| **High school student** | Research projects, math help, science report writing |
| **Engineer** | Data analysis, technical documentation, literature surveys |

Describe what you need in plain language — or drop into the CLI if that's your style. AcaClaw meets you where you are.

---

## What Problems Does AcaClaw Solve?

Each problem maps directly to one of AcaClaw's [four core purposes](#why-acaclaw-exists).

### 1. "I spend hours searching and reading papers" → *Purpose 1: Pre-ship skills*

> *"Find recent papers on CRISPR-Cas9 delivery mechanisms in cardiac tissue"*

AcaClaw searches arXiv, PubMed, Semantic Scholar, and CrossRef simultaneously. It reads PDFs, extracts key findings, and gives you structured summaries — with proper citations ready to paste. All pre-installed. No setup.

### 2. "I have data but I'm not a programmer" → *Purpose 1: Pre-ship skills*

> *"Here's my CSV of patient outcomes. Compare treatment groups and make a figure for my paper"*

AcaClaw runs the analysis (statistical tests, visualizations) behind the scenes. You describe what you want; it delivers publication-ready results. All computation happens within your workspace (`~/AcaClaw/`) — your original data in `data/raw/` is never modified. In Maximum security mode, everything runs inside a fully isolated Docker container.

### 3. "My tools keep breaking each other" → *Purpose 3: Environment compatibility*

> *"I installed a genomics package and now my plotting library crashes"*

This is the silent killer of research productivity. Individual skills are great in isolation — but when skill A needs `numpy 1.26` and skill B needs `numpy 1.24`, everything breaks. Researchers shouldn't debug Python dependency conflicts.

**AcaClaw solves this at the distribution level.** Every skill we ship is tested together in curated, discipline-specific Conda environments. We pin compatible versions, resolve conflicts before you ever see them, and guarantee that all pre-shipped skills work side-by-side. The active environment is automatically detected and injected into the AI’s context — so the AI knows what packages you have and never wastes time reinstalling.

### 4. "I'm afraid of losing my work" → *Purpose 4: Data safety*

> *"What if the AI overwrites my data?"*

**AcaClaw automatically backs up every file before modifying it.** Versioned snapshots, configurable retention, one-click restore. Your data is sacred — AcaClaw treats it that way. See [Data Safety](#data-safety).

### 5. "I don't want to install 20 different tools" → *Purpose 1: Pre-ship skills*

One install. That's it. AcaClaw includes the best tool for each job — pre-configured, pre-tested, ready to use. You never need to think about dependencies, environments, or compatibility.

---

## What's Inside

AcaClaw ships the single best tool for each task — **pre-configured** (*Purpose 1*), **team-tested** (*Purpose 2*), and **environment-compatible** (*Purpose 3*) with every other tool. No version conflicts. No broken imports. Everything works together.

### 🔍 Research & Literature

| Capability | What it does |
|---|---|
| **Paper Search** | Search across arXiv, PubMed, Semantic Scholar, CrossRef — all at once |
| **Paper Reader** | Upload a PDF → get structured summaries, key findings, methodology notes |
| **Reference Manager** | Collect, organize, and format citations in any style (APA, Vancouver, Nature, etc.) |

### 📊 Data Analysis & Visualization

| Capability | What it does |
|---|---|
| **Data Analyst** | Describe your data and question in plain language → get statistical analysis |
| **Figure Generator** | Generate publication-quality plots and charts ready for submission |
| **Math & Statistics** | Step-by-step solutions for equations, proofs, and statistical tests |

### 📝 Writing & Documents

| Capability | What it does |
|---|---|
| **Manuscript Assistant** | Draft, edit, and structure papers following journal guidelines |
| **Format Converter** | Convert between Word, PDF, and journal-specific templates |
| **Presentation Maker** | Generate slides from your research notes or paper |
| **Grant Writer** | Structure and draft grant proposals following funder templates |

### 🛡️ Safety & Security

AcaClaw ships two security levels — choose the one that fits your needs:

| Level | What it does | Requires Docker? |
|---|---|---|
| **Standard (Workspace Security)** | Operations restricted to your project folder. Command deny-lists, audit trail, automatic file backup. Works everywhere. | No |
| **Maximum (Sandbox Mode)** | Everything above + all code runs inside a disposable Docker container. Process and filesystem fully isolated from your system. | Yes |

Both levels include:

| Capability | What it does |
|---|---|
| **Automatic Backup** | Every file is backed up before modification — versioned, restorable |
| **Audit Trail** | Full log of every action for reproducibility and accountability |
| **Privacy-First** | Your data stays on your machine. No telemetry. No cloud storage. |

---

## Data Safety

> **Your research data is irreplaceable. AcaClaw is designed around this truth.**

### Workspace — Your Secure Working Directory

All AI operations happen inside a single workspace directory — `~/AcaClaw/` by default. Nothing outside is touched.

```
~/AcaClaw/                              ← All AI operations confined here
├── data/
│   ├── raw/                            ← Original data — AcaClaw never modifies these
│   └── processed/                      ← Analysis outputs, computed results
├── documents/
│   ├── drafts/                         ← Manuscript and report drafts
│   └── final/                          ← Finalized documents for submission
├── figures/                            ← Generated plots and visualizations
├── references/                         ← Papers (PDFs), bibliography files (.bib, .ris)
├── notes/                              ← Research notes, meeting minutes
├── output/                             ← AI-generated outputs (summaries, citations, etc.)
└── README.md                           ← Auto-generated workspace guide
```

- **Confinement**: AcaClaw cannot read, write, or delete files outside this directory
- **Structure**: Standard directories map to how researchers actually organize work
- **Raw data protection**: `data/raw/` is for originals — results go to `data/processed/`
- **LLM awareness**: the AI knows what files exist in your workspace and where to put results

### Automatic File Backup

Every time AcaClaw modifies a file, the original version is automatically saved — organized per workspace:

```
~/.acaclaw/backups/
├── AcaClaw-a1b2c3d4e5f6/              ← Backups for your workspace
│   └── files/
│       ├── 2026-03-12/
│       │   ├── 14-30-22.experiment-results.csv           ← before AcaClaw touched it
│       │   ├── 14-30-22.experiment-results.csv.meta.json ← what changed and why
│       │   ├── 15-10-05.manuscript-draft.docx
│       │   └── ...
│       └── 2026-03-11/
│           └── ...
```

- **Versioned**: multiple backups per file, organized by date and time
- **Automatic**: no manual action needed — backups happen before every modification
- **Restorable**: one-click restore from the GUI, or `openclaw acaclaw-backup restore <file>`
- **Workspace-scoped**: backups are organized per workspace — never mixed
- **Configurable retention**: keep 7 days, 30 days, or forever
- **Integrity checks**: backup checksums verified to prevent silent corruption

### What AcaClaw Will Never Do

- Overwrite a file without backing up the original first
- Delete any user file
- Send your data to external servers without explicit permission
- Modify files outside your designated workspace
- Touch files in `data/raw/` — processed results go to `data/processed/`

### Workspace Design — Visible by Default

> **OpenClaw hides the workspace. AcaClaw makes it visible. Here's why.**

OpenClaw stores everything — config, sessions, logs, and workspace — inside a single hidden directory at `~/.openclaw/`. The workspace lives at `~/.openclaw/workspace`. This makes sense for developers who understand dotfolder conventions, but creates a real problem when `workspaceOnly` security is enabled: the AI can only touch files inside a folder the user can't find in their file manager.

AcaClaw separates user-facing files from infrastructure:

```
~/                                     # User's home directory
│
├── AcaClaw/                           # ← WORKSPACE — visible, user-facing
│   ├── data/raw/                      #   Your original data (never modified)
│   ├── data/processed/                #   Analysis results
│   ├── documents/                     #   Manuscripts, reports
│   ├── figures/                       #   Publication-ready plots
│   ├── references/                    #   Papers, .bib files
│   └── ...                            #   Everything you create and retrieve
│
└── .acaclaw/                          # ← INFRASTRUCTURE — hidden, system-managed
    ├── backups/                       #   Versioned file backups (per workspace)
    ├── audit/                         #   Tool call audit logs
    └── miniforge3/                    #   Conda installation
```

| | OpenClaw default | AcaClaw |
|---|:-:|:-:|
| Workspace path | `~/.openclaw/workspace` (hidden) | `~/AcaClaw/` (visible) |
| Visible in file manager | No | **Yes** |
| User can drag-and-drop files | Needs "show hidden files" | **Just open the folder** |
| Config, backups, audit logs | Same hidden folder | Separate hidden folder (`~/.acaclaw/`) |
| `workspaceOnly` default | `false` (unrestricted) | `true` (confined to visible folder) |

**The workspace is the user's primary interaction point** — they put data in and take results out. It should be the easiest folder to find on their computer, not hidden behind an OS setting. Infrastructure (backups, audit logs, Conda) belongs hidden — users don't need to see it.

Users can point the workspace anywhere:

```bash
openclaw config set agents.defaults.workspace ~/my-research
```

Multiple workspaces are supported for different projects — see [docs/workspace-design.md](docs/workspace-design.md) for the full design.

---

## Getting Started

### Download & Install

Visit **[acaclaw.com](https://acaclaw.com)** and download the installer for your system.

| Platform | How to Install |
|---|---|
| **Windows** | Download installer → double-click → follow wizard |
| **macOS** | Download .dmg → drag to Applications → open |
| **Linux** | Download .AppImage → double-click (or run the one-line installer below) |

For advanced users: `curl -fsSL https://acaclaw.com/install.sh | bash`

### First Launch

1. Open AcaClaw
2. Choose your field (Chemistry, Physics, Biology, Medicine, Engineering, Math, etc.)
3. Connect your AI provider (OpenAI, Google, Anthropic — wizard guides you)
4. Start asking questions

That's it. No terminal. No configuration files. No package managers.

Your workspace is ready at `~/AcaClaw/` — all your files, data, and results live here. Drop your data files into `data/raw/`, and ask AcaClaw to analyze them.

---

## Contributing Back — Not Diverging

> **Purpose 2 in action: curate and contribute high-quality skills through teamwork.**

Every skill AcaClaw creates is published to [ClawHub](https://clawhub.ai) — the official community skills hub for OpenClaw. We don't maintain a private registry. We don't mirror. We contribute upstream so the entire OpenClaw community benefits.

### How It Works

1. **Skills are developed** in the [acaclaw-skills](https://github.com/acaclaw/acaclaw-skills) repository by individual contributors
2. **Every skill is tested** — integration tests, security review, **environment compatibility verification** against pinned OpenClaw versions — before publishing
3. **All skills are tested together** — the entire AcaClaw skill set runs in a single curated Conda environment to ensure zero conflicts between skills
4. **Skills are published to ClawHub** under the `@acaclaw` organization account, so any OpenClaw user can install them
5. **Every contributor is credited by name and role** directly in the skill's page on ClawHub (see [Contributor Attribution](#contributor-attribution))
6. **AcaClaw installs from ClawHub** during setup — the same way any OpenClaw user would

This means:
- A non-AcaClaw OpenClaw user can run `clawhub install paper-search` and get the exact same skill
- ClawHub install counts, stars, and community feedback flow back to the real contributors
- If AcaClaw disappears tomorrow, every skill lives on independently on ClawHub

### Contributor Attribution

ClawHub displays skills as `by @acaclaw` (the publishing account). But **the people who actually built each skill deserve visible credit**. AcaClaw solves this at two levels:

**On ClawHub** — every SKILL.md includes a Contributors section rendered directly on the skill's page:

```markdown
## Contributors

| Role | Name | Focus |
|------|------|-------|
| Creator | @alice | Initial design, arXiv integration |
| Author | @bob | PubMed search, MeSH term handling |
| Tester | @carol | Edge case testing, CI pipeline |
| Maintainer | @davy | Ongoing updates, compatibility |
```

**On [acaclaw.com/hub](https://acaclaw.com/hub)** — a dedicated showcase (powered by the [hub](https://github.com/acaclaw/hub) repository) that displays every AcaClaw skill with:
- Full contributor profiles with photos and links
- Role-specific credit (creator, author, tester, maintainer, debugger)
- Contribution history and changelog per person
- Direct links to the canonical ClawHub page and source repository

This is the academic model: ClawHub is the journal (publisher), contributors are the authors. The `@acaclaw` account is the editorial board — it guarantees quality, but the credit belongs to individuals.

### Recognized Roles

| Role | Description |
|------|-------------|
| **Creator** | Original author who designed and implemented the skill |
| **Author** | Wrote significant portions of the skill's functionality |
| **Tester** | Validated the skill across environments, wrote test cases |
| **Maintainer** | Keeps the skill updated and compatible with new OpenClaw releases |
| **Debugger** | Fixed critical bugs or edge cases |
| **Reviewer** | Reviewed code and provided quality feedback before publishing |
| **Documenter** | Wrote usage guides, examples, or translations |

Every role matters. A skill is only as good as the team behind it.

### Why This Matters

This section is *Purpose 2* — curate and contribute high-quality skills — made concrete. Real people create, test, debug, review, and maintain every skill. The teamwork model ensures each skill is not just functional, but **high-quality, well-tested, maintainable, and environment-compatible** (*Purpose 3*) with every other AcaClaw skill. By crediting each person's specific contribution, we:

- **Attract contributors** — people contribute when they get recognized
- **Build trust** — users can see exactly who stands behind each skill
- **Stay honest** — we never claim someone else's work as "the AcaClaw team"
- **Strengthen the ecosystem** — skills published to ClawHub benefit all OpenClaw users, not just AcaClaw
- **Guarantee compatibility** — every skill is tested together in the same environment before release (*Purpose 3*)

---

## Built on OpenClaw

AcaClaw is an academic distribution of [OpenClaw](https://github.com/openclaw/openclaw) — the open-source AI assistant platform.

| | OpenClaw | AcaClaw |
|---|---|---|
| **What** | General-purpose AI platform | Academic distribution — ready out of the box |
| **Audience** | Developers and power users | Students, researchers, and educators |
| **Setup** | Install + configure + add skills | One-click, everything included |
| **Execution safety** | Configurable | Two levels: Workspace Security (default) or Docker Sandbox |
| **Skills** | General-purpose | Curated best-in-class academic skills |
| **Environment** | User manages dependencies | Discipline-specific self-contained Conda environments — all skills guaranteed compatible, LLM-aware |
| **Data protection** | Standard | Automatic backup + integrity checks |
| **GUI** | Web UI | Dedicated academic GUI (planned) |

Upgrade OpenClaw independently — AcaClaw stays compatible through automated testing. See [docs/architecture.md](docs/architecture.md) for the technical design.

---

## License & Acknowledgments

### License

**MIT License** — free for everyone: students, teachers, researchers, universities, companies. See [LICENSE](LICENSE).

### Built With Gratitude

AcaClaw stands on the shoulders of extraordinary open-source projects:

**Foundation**
- **[OpenClaw](https://github.com/openclaw/openclaw)** — The AI assistant platform that powers AcaClaw. Created by Peter Steinberger and contributors. MIT License.
- **[ClawHub](https://clawhub.ai)** — Community skills registry. We acknowledge all ClawHub skill authors whose work benefits the academic community.

**Scientific Computing**
- [NumPy](https://numpy.org/) · [SciPy](https://scipy.org/) · [Pandas](https://pandas.pydata.org/) — BSD License
- [Matplotlib](https://matplotlib.org/) · [Plotly](https://plotly.com/python/) — MIT/BSD License
- [Scikit-learn](https://scikit-learn.org/) — BSD License
- [Jupyter](https://jupyter.org/) — BSD License
- [Conda-forge / Miniforge](https://github.com/conda-forge/miniforge) — BSD License

**Document Processing**
- [Pandoc](https://pandoc.org/) — GPL-2.0
- [Citation Style Language](https://citationstyles.org/) — MIT/CC-BY-SA
- [PyMuPDF](https://pymupdf.readthedocs.io/) — AGPL-3.0

> **License note**: GPL/AGPL tools (Pandoc, PyMuPDF) are invoked as separate processes, not linked into AcaClaw. AcaClaw's own code remains MIT. See [docs/architecture.md](docs/architecture.md) for details.

### Attribution Policy

- Every skill published to ClawHub includes a **Contributors** section naming each person and their role
- Every contributor is showcased on [acaclaw.com/hub](https://acaclaw.com/hub) with full profile and contribution history
- Git history in [acaclaw-skills](https://github.com/acaclaw/acaclaw-skills) is the canonical authorship record
- `openclaw acaclaw-backup list` displays all backup versions of a file
- `openclaw acaclaw-security audit` displays the full audit trail
- We follow [REUSE](https://reuse.software/) recommendations

---

## Contributing

AcaClaw is for the global academic community — contributions from researchers are especially welcome.

- **Create skills**: Write a skill for your field in the [acaclaw-skills](https://github.com/acaclaw/acaclaw-skills) repo. You'll be credited as **Creator** on ClawHub and on [acaclaw.com/hub](https://acaclaw.com/hub)
- **Test skills**: Run skills against real-world data in your domain. Credited as **Tester**
- **Fix bugs**: Track down and fix edge cases. Credited as **Debugger**
- **Review code**: Review PRs before skills are published. Credited as **Reviewer**
- **Write docs**: Tutorials, guides, translations. Credited as **Documenter**
- **Maintain skills**: Keep existing skills compatible with new OpenClaw releases. Credited as **Maintainer**

Every contribution is tracked, every contributor is named. See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

---

## Roadmap

- [x] Project architecture and design
- [x] Contributor attribution model (per-role credit on ClawHub + AcaClaw Hub)
- [ ] Curated academic skills published to ClawHub (paper search, citation management, data analysis)
- [ ] [AcaClaw Hub](https://github.com/acaclaw/hub) — contributor showcase website at acaclaw.com/hub
- [ ] Automatic file backup system
- [ ] One-click installers (Windows, macOS, Linux)
- [ ] Guided onboarding wizard (no terminal required)
- [ ] Security hardening plugin (workspace security + optional Docker sandbox)
- [ ] Automated compatibility test suite (nightly vs. OpenClaw releases)
- [ ] Domain profiles (chemistry, biology, medicine, physics)
- [ ] Desktop GUI for research workflows
- [ ] Classroom mode (course management for instructors)
- [ ] Offline mode (for field research without internet)
- [ ] Multilingual interface

---

## About AcaClaw

AcaClaw is open-source, MIT-licensed, and built for the global academic community.

**Four promises:**
1. **Pre-ship skills** — one install, everything you need
2. **Teamwork quality** — every skill built, tested, and credited by real people, contributed to ClawHub
3. **One compatible environment** — discipline-specific, self-contained, LLM-aware
4. **Data safety** — automatic backup of every file, always

**AI-powered research tools for every student, researcher, and educator. No barriers. No compromises.**

<p align="center">
  <strong>Academic Claw is coming.</strong>
</p>
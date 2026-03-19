---
layout: home
title: AcaClaw
lang: en
permalink: /en/
---

<div class="hero">
  <img src="{{ '/assets/logo/AcaClaw.svg' | relative_url }}" alt="AcaClaw" class="hero-logo">
  <h1>AcaClaw</h1>
    <p class="tagline">Academia Claw — Your AI Co-Scientist, One Click, Everything You Need</p>
  <div class="hero-actions">
    <a href="{{ '/en/getting-started/' | relative_url }}" class="hero-btn primary">Get Started</a>
    <a href="https://github.com/acaclaw/acaclaw" class="hero-btn secondary" target="_blank" rel="noopener">GitHub</a>
  </div>
</div>

## What Is AcaClaw?

**AcaClaw (Academia Claw)** is your dedicated AI Co-Scientist. Whether you need an AI Biologist, an AI Chemist, or a Data Scientist, AcaClaw provides a discipline-specific digital partner for everyone in academia. Terminal geek or first-time computer user, AcaClaw just works.

**AcaClaw enhances OpenClaw with the following features:**

- **User-Friendly GUI**: No terminal required. Manage everything through an intuitive graphical interface.
- **Workspace & Project System**: File modifications and deletions are restricted to the workspace by default to prevent data loss.
- **Academic Skills**: Deeply customized scientist skills tailored to your specific academic domain.
- **Computing Environment**: Discipline-specific environments that unify Python, R, CUDA, and other scientific computing tools to ensure skill compatibility.
- **Data Backup**: Automatic backup of every modified file — your data is never at risk.

Powered by [OpenClaw](https://github.com/openclaw/openclaw), the open-source AI platform. Like Ubuntu is to Linux, AcaClaw is to OpenClaw: everything you need, ready to go.

---

## Why AcaClaw Exists

AcaClaw exists for six reasons — each solves a real problem researchers face every day:

| # | Purpose | What it means |
|---|---------|---------------|
| **1** | **No-Code GUI** | AcaClaw is built for users, not just developers. Everything from environment setup to file management is handled through a clean, intuitive graphical interface. |
| **2** | **Workspace & Project System** | AcaClaw separates user-facing files from infrastructure. Your active workspace is auto-detected, and its file tree is injected into the AI's context so it always knows what you're working on. |
| **3** | **Pre-ship academic skills** | One install gives you paper search, data analysis, citation management, figure generation — all pre-configured and ready to use. |
| **4** | **Curate and contribute high-quality skills** | Every skill is built by a team (creator, tester, debugger, reviewer, maintainer), tested rigorously, and published to [ClawHub](https://clawhub.ai). Individual contributors are credited by name and role. |
| **5** | **Keep all skills environment-compatible** | One primary Conda environment with discipline packages merged in. Auxiliary envs created only on conflict. The active environment is auto-detected and injected into the AI's context. |
| **6** | **Keep data safe** | Every file is automatically backed up before modification. Versioned snapshots, one-click restore, configurable retention. |

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

---

## Key Features

<div class="features">
  <div class="feature-card">
    <h3>🖥️ User-Friendly GUI</h3>
    <p>Designed for non-coders. No terminal configuration required. Manage everything through an intuitive graphical interface.</p>
  </div>
  <div class="feature-card">
    <h3>📁 Workspace & Project System</h3>
    <p>Intelligently separates your visible files from hidden infrastructure. The AI automatically knows your project structure and actively respects your workspace boundaries.</p>
  </div>
  <div class="feature-card">
    <h3>🎓 Discipline-Based AI Co-Scientists</h3>
    <p>One-click installation for your specific field. Automatically sets up your AI Biologist, Chemist, or Data Scientist with specialized skills and computing environments.</p>
  </div>
  <div class="feature-card">
    <h3>🔍 Paper Search</h3>
    <p>Search arXiv, PubMed, Semantic Scholar, CrossRef — all at once. Read PDFs, extract findings, generate structured summaries with citations.</p>
  </div>
  <div class="feature-card">
    <h3>📊 Data Analysis</h3>
    <p>Describe your data and question in plain language. Get statistical analysis and publication-quality figures. Your raw data is never modified.</p>
  </div>
  <div class="feature-card">
    <h3>📝 Writing Tools</h3>
    <p>Draft, edit, and structure papers. Convert between formats. Generate slides from research notes. Manage citations in any style.</p>
  </div>
  <div class="feature-card">
    <h3>🛡️ Data Safety</h3>
    <p>Every file backed up before modification. Versioned snapshots, one-click restore. Your data stays on your machine — no cloud uploads.</p>
  </div>
</div>

---

## What's Inside

AcaClaw ships the single best tool for each task — pre-configured, team-tested, and environment-compatible with every other tool.

| Job | Selected Tool | Why |
|---|---|---|
| **Data analysis** | Pandas + SciPy | De facto standard in all scientific fields |
| **Visualization** | Matplotlib | Most widely used in publications |
| **Statistics** | SciPy.stats + Statsmodels | Covers most academic statistical tests |
| **PDF reading** | PyMuPDF (fitz) | Fastest, best text extraction quality |
| **Document conversion** | Pandoc | Word, PDF, journal templates — reliably |
| **Reference management** | Citation.js + CSL | 10,000+ citation styles, no server required |
| **Paper search** | Semantic Scholar API | Best free academic API |
| **Math / Symbolic** | SymPy | Pure Python, no external dependencies |

---

## AcaClaw vs OpenClaw

| | OpenClaw | AcaClaw |
|---|---|---|
| **What** | General-purpose AI platform | Academic distribution — ready out of the box |
| **Audience** | Developers and power users | Students, researchers, and educators |
| **Setup** | Install + configure + add skills | One-click GUI, workspace auto-detection |
| **Skills** | General-purpose | Curated best-in-class academic skills |
| **Environment** | User manages dependencies | Discipline-specific Conda environments |
| **Data protection** | Standard | Automatic backup + integrity checks |

---

## License

MIT License — free for everyone. See [LICENSE](https://github.com/acaclaw/acaclaw/blob/main/LICENSE).

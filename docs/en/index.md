---
layout: home
title: AcaClaw
lang: en
permalink: /en/
---

<div class="hero">
  <img src="{{ '/assets/logo/AcaClaw.svg' | relative_url }}" alt="AcaClaw" class="hero-logo">
  <h1>AcaClaw</h1>
  <p class="tagline">AI Academic Assistant — One Click, Everything You Need</p>
  <div class="hero-actions">
    <a href="{{ '/en/getting-started/' | relative_url }}" class="hero-btn primary">Get Started</a>
    <a href="https://github.com/acaclaw/acaclaw" class="hero-btn secondary" target="_blank" rel="noopener">GitHub</a>
  </div>
</div>

## What Is AcaClaw?

**AcaClaw** is an AI-powered academic assistant for everyone in academia — scientists, engineers, professors, university and college students, even high school students. Terminal geek or first-time computer user, AcaClaw just works.

**One install gives you everything:**

- An AI assistant that understands your academic domain
- Paper search and literature review across all major databases
- Data analysis and publication-quality figures from your data
- Document writing, formatting, and reference management
- Automatic backup of every file it touches — your data is never at risk

Powered by [OpenClaw](https://github.com/openclaw/openclaw), the open-source AI platform. Like Ubuntu is to Linux, AcaClaw is to OpenClaw: everything you need, ready to go.

---

## Why AcaClaw Exists

AcaClaw exists for four reasons — each solves a real problem researchers face every day:

| # | Purpose | What it means |
|---|---------|---------------|
| **1** | **Pre-ship academic skills** | One install gives you paper search, data analysis, citation management, figure generation — all pre-configured and ready to use. |
| **2** | **Curate and contribute high-quality skills** | Every skill is built by a team (creator, tester, debugger, reviewer, maintainer), tested rigorously, and published to [ClawHub](https://clawhub.ai). Individual contributors are credited by name and role. |
| **3** | **Keep all skills environment-compatible** | One primary Conda environment with discipline packages merged in. Auxiliary envs created only on conflict. The active environment is auto-detected and injected into the AI's context. |
| **4** | **Keep data safe** | Every file is automatically backed up before modification. Versioned snapshots, one-click restore, configurable retention. |

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
| **Setup** | Install + configure + add skills | One-click, everything included |
| **Skills** | General-purpose | Curated best-in-class academic skills |
| **Environment** | User manages dependencies | Discipline-specific Conda environments |
| **Data protection** | Standard | Automatic backup + integrity checks |

---

## License

MIT License — free for everyone. See [LICENSE](https://github.com/acaclaw/acaclaw/blob/main/LICENSE).

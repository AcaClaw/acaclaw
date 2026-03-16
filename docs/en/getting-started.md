---
layout: page
title: Getting Started
lang: en
permalink: /en/getting-started/
---

## First Launch

After [installing AcaClaw](/en/install/), launch it for the first time:

1. Open AcaClaw
2. Choose your field (Chemistry, Physics, Biology, Medicine, Engineering, Math, etc.)
3. Connect your AI provider (OpenAI, Google, Anthropic — wizard guides you)
4. Start asking questions

That's it. No terminal. No configuration files. No package managers.

---

## Your Workspace

Your workspace is ready at `~/AcaClaw/` — all your files, data, and results live here.

```
~/AcaClaw/
├── data/
│   ├── raw/           ← Your original data (never modified by AI)
│   └── processed/     ← Analysis outputs, computed results
├── documents/
│   ├── drafts/        ← Manuscript and report drafts
│   └── final/         ← Finalized documents for submission
├── figures/           ← Generated plots and visualizations
├── references/        ← Papers (PDFs), bibliography files (.bib, .ris)
├── notes/             ← Research notes, meeting minutes
├── output/            ← AI-generated outputs (summaries, citations)
└── README.md          ← Auto-generated workspace guide
```

### Key rules

- **Confinement**: AcaClaw cannot read, write, or delete files outside this directory
- **Raw data protection**: Files in `data/raw/` are never modified — results go to `data/processed/`
- **Automatic backup**: Every file is backed up before modification

---

## What You Can Ask

Here are some examples to try right away:

**Literature search:**
> "Find recent papers on CRISPR-Cas9 delivery mechanisms in cardiac tissue"

**Data analysis:**
> "Here's my CSV of patient outcomes. Compare treatment groups and make a figure for my paper"

**Writing:**
> "Help me draft the methods section for my paper on protein crystallography"

**Citations:**
> "Format these references in APA style"

**Math:**
> "Solve this differential equation step by step"

---

## Security Levels

AcaClaw ships two security levels — choose the one that fits:

| Level | What it does | Requires Docker? |
|---|---|---|
| **Standard (default)** | Operations restricted to workspace. Command deny-lists, audit trail, automatic backup. | No |
| **Maximum** | Everything above + all code runs inside a Docker container. Full isolation. | Yes |

Both levels include:
- Automatic file backup before every modification
- Full audit log of every action
- Privacy-first design — your data stays on your machine

---

## Multiple Workspaces

You can point AcaClaw to any directory:

```bash
openclaw config set agents.defaults.workspace ~/my-research
```

Each workspace is independent with its own backups and metadata.

---

## What's Next

- [Architecture]({{ '/en/architecture/' | relative_url }}) — How AcaClaw is built
- [Security]({{ '/en/security/' | relative_url }}) — Security architecture in detail
- [Workspace]({{ '/en/workspace/' | relative_url }}) — Workspace design deep-dive
- [Contributing]({{ '/en/contributing/' | relative_url }}) — How to contribute skills and code

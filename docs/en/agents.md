---
layout: page
title: Digital Life Agents
lang: en
permalink: /en/agents/
---

> **Multi-Agent Architecture: Academic digital life agents that work in parallel across disciplines.**

AcaClaw ships five pre-configured academic agents — each a "digital life" character with its own persona, discipline expertise, Conda environment, and skill set. They run in parallel on the same OpenClaw gateway, each with an isolated workspace and session.

---

## Table of Contents

- [Overview](#overview)
- [Agent Roster](#agent-roster)
- [Architecture](#architecture)
- [How Agents Work in Parallel](#how-agents-work-in-parallel)
- [Agent Workspace Structure](#agent-workspace-structure)
- [Identity and Persona](#identity-and-persona)
- [Skills per Agent](#skills-per-agent)
- [Starting Agents from the UI](#starting-agents-from-the-ui)
- [CLI Usage](#cli-usage)

---

## Overview

Each AcaClaw agent is a fully isolated "digital life" with:

| Property | Description |
|---|---|
| **Identity** | Unique name, emoji, persona, and behavioral guidelines |
| **Workspace** | Isolated directory with its own files and memory |
| **Environment** | Discipline-specific Conda env (bio, med, chem, phys, or general) |
| **Skills** | Curated skill set matching the agent's expertise |
| **Session** | Independent chat history and session state |

Agents share the same OpenClaw gateway but operate independently — you can chat with multiple agents simultaneously through per-agent chat tabs.

---

## Agent Roster

| Agent ID | Emoji | Name | Discipline | Conda Env | Specialty |
|---|---|---|---|---|---|
| `biologist` | 🧬 | Dr. Gene | Biology | `acaclaw-bio` | Genomics, sequence analysis, phylogenetics, Biopython |
| `medscientist` | 🏥 | Dr. Curie | Medicine | `acaclaw-med` | Clinical data, survival analysis, epidemiology, DICOM |
| `ai-researcher` | 🤖 | Dr. Turing | AI/ML | `acaclaw` | ML/DL frameworks, model training, benchmarks, arxiv |
| `data-analyst` | 📊 | Dr. Bayes | Statistics | `acaclaw` | Pandas, R/tidyverse, visualization, statistical testing |
| `cs-scientist` | 💻 | Dr. Knuth | Computer Science | `acaclaw` | Algorithm design, systems programming, code review |

---

## Architecture

```
OpenClaw Gateway (port 2090)
├── Agent: biologist    → workspace: ~/AcaClaw/agents/biologist/
│   ├── IDENTITY.md     (Dr. Gene 🧬)
│   ├── SOUL.md         (behavioral persona)
│   ├── Conda: acaclaw-bio
│   └── Session: web:main@biologist
├── Agent: medscientist → workspace: ~/AcaClaw/agents/medscientist/
│   ├── IDENTITY.md     (Dr. Curie 🏥)
│   ├── SOUL.md
│   ├── Conda: acaclaw-med
│   └── Session: web:main@medscientist
├── Agent: ai-researcher → workspace: ~/AcaClaw/agents/ai-researcher/
├── Agent: data-analyst  → workspace: ~/AcaClaw/agents/data-analyst/
└── Agent: cs-scientist  → workspace: ~/AcaClaw/agents/cs-scientist/
```

Each agent runs in its own session context:
- **Session key format**: `web:main@<agentId>` — scoped per agent
- **No cross-talk**: agents cannot read each other's sessions
- **Shared data**: the `~/AcaClaw/data/` directory is accessible to all agents for collaboration

---

## How Agents Work in Parallel

1. **Per-agent chat tabs** in the web UI let you send messages to different agents simultaneously
2. Each message is routed via the session key: `web:main@biologist`, `web:main@ai-researcher`, etc.
3. The gateway processes requests independently — one agent thinking does not block another
4. Agents stream responses in parallel through WebSocket events scoped by `runId`

### Parallel workflow example

```
You → [Dr. Gene tab]      "Analyze the RNA-seq data in data/raw/rnaseq.csv"
You → [Dr. Bayes tab]     "Run a PCA on data/processed/features.csv"
You → [Dr. Turing tab]    "Search arxiv for transformer protein models 2025-2026"

All three agents work simultaneously. Results appear in their respective tabs.
```

---

## Agent Workspace Structure

Each agent gets an isolated workspace under `~/AcaClaw/agents/<id>/`:

```
~/AcaClaw/agents/biologist/
├── IDENTITY.md          # Name, emoji, creature, vibe, theme
├── SOUL.md              # System persona and behavioral rules
├── AGENTS.md            # Workspace-specific instructions
├── memory/              # Daily memory logs
└── workspace/           # Agent's working directory
    ├── data/            # Agent-specific data
    ├── output/          # Generated results
    └── notes/           # Agent's notes
```

---

## Identity and Persona

Each agent has two key files that define its character:

### IDENTITY.md

Defines the visible identity — name, emoji, and visual theme:

```markdown
- Name: Dr. Gene
- Emoji: 🧬
- Creature: computational biologist
- Vibe: methodical, curious, precise
- Theme: nature
```

### SOUL.md

Defines behavioral guidelines — how the agent thinks, responds, and approaches problems:

```markdown
You are a computational biologist specializing in genomics and molecular biology.
Always consider biological significance alongside statistical significance.
Prefer Biopython and scikit-bio for sequence analysis.
Use R/Bioconductor for differential expression analysis.
When presenting results, include biological context and pathway implications.
```

---

## Skills per Agent

Each agent loads a skill set matching its discipline. Skills are filtered at session start.

| Agent | Key Skills |
|---|---|
| Dr. Gene | nano-pdf, xurl, coding-agent, paper-search (biology journals) |
| Dr. Curie | nano-pdf, xurl, coding-agent, clinical-data-tools |
| Dr. Turing | nano-pdf, xurl, coding-agent, arxiv-search, model-benchmarks |
| Dr. Bayes | nano-pdf, xurl, coding-agent, data-visualization |
| Dr. Knuth | nano-pdf, xurl, coding-agent, code-review, algorithm-design |

---

## Starting Agents from the UI

1. Navigate to **Agents** in the sidebar
2. Each agent card shows status (Idle / Working), persona, and discipline
3. Click **Start** on an agent card to activate it and open its chat tab
4. The chat view shows tabs for each active agent — switch between them freely
5. Send messages to different agents in parallel

---

## CLI Usage

```bash
# List all agents
openclaw agents list

# Send a message to a specific agent
openclaw message --agent biologist "Analyze the FASTA sequences in data/raw/sequences.fa"

# Check agent identity
openclaw agents identity get biologist

# Start multiple agents in parallel (separate terminals)
openclaw message --agent biologist "Run sequence alignment" &
openclaw message --agent data-analyst "Generate correlation plots" &
openclaw message --agent ai-researcher "Search for RLHF papers" &
wait
```

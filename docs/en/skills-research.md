---
layout: page
title: Research Skills
lang: en
permalink: /en/skills-research/
---

<!-- DESIGN-DOC: Cross-discipline research skills — paper search, data analysis, statistics, data visualization, and paper writing. Curated skill list and contribution guide for all researchers. -->

> **Scope**: Core research skills shared across all disciplines. Every AcaClaw agent can use these. This doc complements the discipline-specific skill docs (e.g. [Biology Skills](skills-bio.md)) and the general [Skills](skills.md) design doc.

---

## Table of Contents

- [Overview](#overview)
- [Curated Research Skills](#curated-research-skills)
- [Paper Search Comparison](#paper-search-comparison)
- [Workflows](#workflows)
- [Selection Criteria (Research-Specific)](#selection-criteria-research-specific)
- [Candidate Skills (Under Evaluation)](#candidate-skills-under-evaluation)
- [Contributing Research Skills](#contributing-research-skills)

---

## Overview

This doc collects and curates cross-discipline research skills — the foundational toolkit every researcher needs regardless of field. Discipline-specific skills live in their own docs (e.g. [Biology Skills](skills-bio.md)).

Skills listed here are available to all agents and staff members via the Staff panel.

---

## Curated Research Skills

Skills listed here must exist on [ClawHub](https://clawhub.ai) and pass the [selection criteria](#selection-criteria-research-specific). Add new skills by following [Contributing Research Skills](#contributing-research-skills).

### Paper Search & Literature

| Skill | What it does |
|---|---|
| [`literature-review`](https://clawhub.ai/weird-aftertaste/literature-review) | Multi-database academic search (Semantic Scholar, OpenAlex, Crossref, PubMed) with auto-dedup by DOI. 7.9k downloads, ⭐19, v1.2.0 |
| [`pubmed-edirect`](https://clawhub.ai/killgfat/pubmed-edirect) | Deep PubMed search via NCBI's official EDirect CLI — batch abstracts, CSV export, publication trends, cross-database linking. 2.5k downloads, ⭐4, v0.4.4 |

### Data Analysis

| Skill | What it does |
|---|---|
| *(none yet)* | |

### Statistics

| Skill | What it does |
|---|---|
| *(none yet)* | |

### Data Visualization

| Skill | What it does |
|---|---|
| *(none yet)* | |

### Paper Writing

| Skill | What it does |
|---|---|
| *(none yet)* | |

---

## Paper Search Comparison

Evaluated from [ClawHub](https://clawhub.ai) as of April 2026. We need two skills: one for **general multi-database paper search** and one for **PubMed-specific search**.

### General Paper Search

| | [`literature-review`](https://clawhub.ai/weird-aftertaste/literature-review) | [`academic-research-hub`](https://clawhub.ai/anisafifi/academic-research-hub) |
|---|---|---|
| **Author** | @weird-aftertaste | @anisafifi |
| **Downloads** | 7.9k | 5.4k |
| **Stars** | ⭐ 19 | ⭐ 7 |
| **Version** | v1.2.0 (3 releases) | v0.1.0 (1 release) |
| **License** | MIT-0 | MIT-0 |
| **Security** | Benign (medium confidence) | Benign (medium confidence) |
| **Databases** | Semantic Scholar, OpenAlex, Crossref, PubMed | arXiv, PubMed, Semantic Scholar, Google Scholar |
| **Implementation** | Python script (`lit_search.py`, 15 KB) | Python script (`research.py`, 24 KB) + pip dependencies |
| **Deduplication** | Auto-dedup by DOI across sources | No |
| **Output formats** | Structured metadata (DOI, title, year, authors, abstract, venue, citations) | Text, JSON, BibTeX, RIS, Markdown |
| **PDF download** | No | Yes |
| **Extra features** | Polite API access (OpenAlex/Crossref), abstract reconstruction from inverted index, TL;DR from S2 | Citation extraction, author search, date filtering, sort by citations |
| **Dependencies** | `USER_EMAIL` env var (optional S2/OA API keys) | `pip install arxiv scholarly pubmed-parser semanticscholar requests` |
| **Pros** | Most popular, mature (v1.2.0), auto-dedup, lightweight | Broader source coverage (arXiv + Google Scholar), PDF download, more export formats |
| **Cons** | No arXiv, no PDF download | v0.1.0 maturity, requires pip packages, requires OpenClawCLI |

### PubMed Search

| | [`pubmed-edirect`](https://clawhub.ai/killgfat/pubmed-edirect) | [`pubmed`](https://clawhub.ai/ivangdavila/pubmed) |
|---|---|---|
| **Author** | @killgfat | @ivangdavila |
| **Downloads** | 2.5k | 2.5k |
| **Stars** | ⭐ 4 | ⭐ 3 |
| **Version** | v0.4.4 (9 releases) | v1.0.0 (1 release) |
| **License** | MIT-0 | MIT-0 |
| **Security** | Benign (HIGH confidence) | Benign (HIGH confidence) |
| **Type** | CLI tool (NCBI EDirect) | Instruction-only (no scripts) |
| **Databases** | PubMed, PMC, Gene, Protein, Nucleotide, MeSH, and more NCBI databases | PubMed only |
| **Core tools** | `esearch`, `efetch`, `elink`, `efilter`, `xtract`, `einfo` | None — teaches the agent MeSH terms, PICO framework, query construction |
| **Batch processing** | Yes — batch abstract fetch, CSV export, publication trends | No |
| **Included scripts** | `batch_fetch_abstracts.sh`, `search_export_csv.sh`, `publication_trends.sh` | None |
| **Cross-DB linking** | Yes — link PubMed → Gene, Protein, Nucleotide via `elink` | No |
| **Critical appraisal** | No | Yes — study hierarchy, red flags, evidence evaluation |
| **Dependencies** | NCBI EDirect CLI (manual install from `ftp.ncbi.nlm.nih.gov`) | None |
| **Pros** | Official NCBI tools, powerful pipeline (Unix pipes), cross-database, batch processing, actively iterated (9 releases) | Zero dependencies, HIGH confidence security, teaches critical appraisal and search strategy |
| **Cons** | Requires manual EDirect installation, advanced skill | No actual search functionality — guidance only |

### Summary

These two pairs serve different roles and could complement each other:

- **`literature-review`** — best for broad multi-database discovery (4 APIs, auto-dedup, most popular)
- **`academic-research-hub`** — best for arXiv coverage and PDF download workflows
- **`pubmed-edirect`** — best for deep PubMed power users (batch processing, NCBI cross-linking)
- **`pubmed`** — best as a knowledge guide for PubMed search strategy and critical appraisal (no tools to install)

---

## Workflows

Common research workflows that combine multiple skills. Add workflow examples here as skills are curated.

*(No workflows documented yet — add examples as research skills are published to ClawHub.)*

---

## Selection Criteria (Research-Specific)

In addition to the general [selection criteria](skills.md#how-skills-are-selected), research skills must also satisfy:

| Criterion | Description |
|---|---|
| **Academic rigor** | Output must meet publication standards — proper citations, correct statistical methods, transparent methodology |
| **Source attribution** | Literature skills must always cite sources with full metadata (DOI, authors, year) |
| **Format versatility** | Writing skills must support common academic formats (LaTeX, Word, Markdown) |
| **Reproducibility** | Analysis steps, parameters, and data sources must be logged for reproducibility |
| **Database coverage** | Search skills should cover major academic databases (arXiv, PubMed, Semantic Scholar, Google Scholar) |

### What We Deliberately Exclude

| Excluded | Reason |
|---|---|
| Reference manager GUIs (Zotero, Mendeley) | AI agents operate via CLI/API; recommend as external tool |
| Full typesetting systems (LaTeX distributions) | ~4 GB; Pandoc handles conversion; available as add-on |
| Plagiarism detection services | Requires paid API; out of scope for bundled skills |
| Journal submission tools | Workflow varies per publisher; not automatable |

---

## Candidate Skills (Under Evaluation)

Skills being considered but not yet committed. Evaluation follows the [decision process](skills.md#decision-process).

| Candidate | Category | Notes |
|---|---|---|
| *(none yet)* | | |

### Evaluation Checklist

Before promoting a candidate to the curated list:

- [ ] Real user need identified (issue or request)
- [ ] No existing ClawHub skill covers it
- [ ] Dependencies resolve in the base `acaclaw` environment without conflicts
- [ ] At least one team member can test with real research tasks
- [ ] Maintainer identified

---

## Contributing Research Skills

Follow the general [contributing guide](skills.md#contributing-new-skills). Research-specific additions:

### Directory Structure (acaclaw-skills repo)

```
disciplines/research/
├── your-skill/
│   ├── SKILL.md
│   ├── your-skill.test.ts
│   └── README.md
└── ...
```

### Research-Specific Review Checklist

In addition to the standard quality gates:

- [ ] Citations include DOI and full author list where available
- [ ] Statistical outputs include effect size, confidence intervals, and p-values with correction method
- [ ] Visualizations follow publication conventions (axis labels, legends, colorblind-safe palettes)
- [ ] Writing output is free of AI-typical phrasing (tested with ai-humanizer)
- [ ] Search results are deduplicated across databases

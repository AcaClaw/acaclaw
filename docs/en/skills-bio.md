---
layout: page
title: Biology Skills
lang: en
permalink: /en/skills-bio/
---

<!-- DESIGN-DOC: Biology-specific skills — curation criteria, curated skill list, Conda environment packages, workflow examples, and contribution guide for biology researchers. -->

> **Scope**: Biology-specific skills for the Dr. Gene (🧬 Biologist) agent and any staff member working in biological research. This doc complements the cross-discipline [Skills](skills.md) design doc.

---

## Table of Contents

- [Overview](#overview)
- [Curated Biology Skills](#curated-biology-skills)
- [Workflows](#workflows)
- [Selection Criteria (Biology-Specific)](#selection-criteria-biology-specific)
- [Candidate Skills (Under Evaluation)](#candidate-skills-under-evaluation)
- [Contributing Biology Skills](#contributing-biology-skills)

---

## Overview

This doc collects and curates biology-specific skills for AcaClaw. Cross-discipline skills (literature search, citation management, data analysis) are listed in [Skills](skills.md). This doc focuses on domain skills that use bioinformatics tools and biological databases.

The Dr. Gene agent (`agents/biologist/`) is pre-configured with biology-specific skills. Other staff members can add biology skills from the Staff panel.

---

## Curated Biology Skills

Biology-specific skills curated for the Dr. Gene agent and biology researchers. Cross-discipline skills (literature-search, academic-writing, etc.) are listed in [Skills](skills.md).

Skills listed here must exist on [ClawHub](https://clawhub.ai) and pass the [selection criteria](#selection-criteria-biology-specific). Add new skills by following [Contributing Biology Skills](#contributing-biology-skills).

### Genomics & Sequence Analysis

| Skill | What it does |
|---|---|
| *(none yet)* | |

### Transcriptomics

| Skill | What it does |
|---|---|
| *(none yet)* | |

### Phylogenetics & Evolution

| Skill | What it does |
|---|---|
| *(none yet)* | |

### Structural Biology

| Skill | What it does |
|---|---|
| *(none yet)* | |

### Metagenomics & Microbiome

| Skill | What it does |
|---|---|
| *(none yet)* | |

### Single-Cell Biology

| Skill | What it does |
|---|---|
| *(none yet)* | |

### Bioinformatics Utilities

| Skill | What it does |
|---|---|
| *(none yet)* | |

---

## Workflows

Common biology workflows that combine multiple skills. Add workflow examples here as skills are curated.

*(No workflows documented yet — add examples as biology skills are published to ClawHub.)*

---

## Selection Criteria (Biology-Specific)

In addition to the general [selection criteria](skills.md#how-skills-are-selected), biology skills must also satisfy:

| Criterion | Description |
|---|---|
| **Biological accuracy** | Results must be biologically meaningful — correct gene nomenclature, proper statistical thresholds (adjusted p-value, not raw), appropriate normalization |
| **Database compatibility** | Must use standard biological databases (NCBI, UniProt, Ensembl, PDB) and handle their formats correctly |
| **Reproducibility** | All parameters, tool versions, and random seeds must be logged for reproducibility |
| **File format support** | Must handle standard bioinformatics formats (FASTA, FASTQ, BAM, VCF, GFF, BED) |
| **Scalability awareness** | Must warn or degrade gracefully with large datasets (whole-genome BAMs, bulk scRNA-seq) rather than silently consuming all memory |

### What We Deliberately Exclude from Biology Skills

| Excluded | Reason |
|---|---|
| GUI-only tools (IGV, Jalview) | AI agents operate via CLI/API; recommend as external tool |
| Full pipeline managers (Nextflow, Snakemake) | Heavyweight; agents compose individual tools instead |
| Deep learning training (model fine-tuning) | GPU-dependent; available as optional model-management install |
| Wet-lab protocol generation | Out of scope for computational skills |

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
- [ ] Dependencies resolve in `acaclaw` + `bioclaw` without conflicts
- [ ] At least one team member can test with real data
- [ ] Maintainer identified

---

## Contributing Biology Skills

Follow the general [contributing guide](skills.md#contributing-new-skills). Biology-specific additions:

### Directory Structure (acaclaw-skills repo)

```
disciplines/biology/
├── sequence-analyzer/
│   ├── SKILL.md
│   ├── sequence-analyzer.test.ts
│   └── README.md
├── blast-search/
│   ├── SKILL.md
│   ├── blast-search.test.ts
│   └── README.md
└── ...
```

### Test Data Requirements

- Use **small, synthetic datasets** for tests — never commit real patient or sequencing data
- FASTA test files: ≤10 sequences, ≤1 KB each
- BAM test files: use samtools to generate minimal synthetic alignments
- Reference test data source and license in the test file header

### Biology-Specific Review Checklist

In addition to the standard quality gates:

- [ ] Gene names follow HGNC nomenclature (human) or equivalent organism authority
- [ ] Statistical tests use multiple-testing correction where applicable
- [ ] Output includes relevant database identifiers (UniProt, NCBI Gene, Ensembl)
- [ ] Visualization follows publication conventions (log2 fold change, volcano plots, etc.)
- [ ] Memory usage tested with a medium-sized dataset (not just toy examples)

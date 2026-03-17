---
layout: page
title: Skills
lang: en
permalink: /en/skills/
---

> **Purpose 2: Curate and contribute high-quality skills through teamwork.**

AcaClaw ships a curated set of academic skills — selected, tested, and maintained as a team. Every skill is published to [ClawHub](https://clawhub.ai) so the entire OpenClaw ecosystem benefits.

---

## Table of Contents

- [Skill Categories](#skill-categories)
- [Where Skills Live](#where-skills-live)
- [How Skills Are Selected](#how-skills-are-selected)
- [Expand the Ecosystem, Don't Diverge](#expand-the-ecosystem-dont-diverge)
- [Teamwork, Not Individual Heroics](#teamwork-not-individual-heroics)
- [Managing Official Skills](#managing-official-skills)
- [Curating ClawHub Skills](#curating-clawhub-skills)
- [Acknowledging Contributors](#acknowledging-contributors)
- [Contributing New Skills](#contributing-new-skills)
- [Syncing GitHub and acaclaw.com](#syncing-github-and-acaclawcom)

---

## Skill Categories

AcaClaw organizes skills into four tiers. Each tier serves a different purpose and has different selection criteria.

### Foundation Skills (Bundled with OpenClaw)

These ship with OpenClaw itself. AcaClaw inherits them — no installation needed.

| Skill | What it does |
|---|---|
| `nano-pdf` | Read and extract text from PDF files |
| `xurl` | Fetch and parse web content |
| `coding-agent` | Write and execute code |
| `summarize` | Summarize documents and text |
| `clawhub` | Browse and install skills from ClawHub |

**Selection rule**: AcaClaw never replaces or overrides foundation skills. If OpenClaw ships it, we use it.

### Core Academic Skills (Cross-Discipline)

Recommended for every researcher regardless of discipline. Installed from ClawHub via the Staff panel.

| Skill | Category | What it does |
|---|---|---|
| `paper-search` | Literature | Search arXiv, PubMed, Semantic Scholar |
| `academic-deep-research` | Literature | Transparent, rigorous research across academic databases with audit trail |
| `citation-manager` | Writing | Format references in APA, Vancouver, Nature, etc. |
| `academic-writing` | Writing | Expert agent for scholarly papers, literature reviews, methodology |
| `ai-humanizer` | Writing | Detect and remove AI-typical writing patterns |
| `data-analyst` | Data Analysis | Data visualisation, reports, SQL, spreadsheets |
| `chart-image` | Data Analysis | Generate publication-quality chart images for papers |
| `mermaid` | Presentation | Generate diagrams (flowcharts, sequence, class) from text |

**Selection rule**: one best tool per job. If two skills do the same thing, we pick the better one and don't ship both.

### Discipline Skills

Specialized skills for specific research fields. Shown in the Staff panel when a staff member's discipline matches.

| Skill | Discipline | What it does |
|---|---|---|
| `bioskills` | Biology | 425 bioinformatics tools: RNA-seq, single-cell, variant calling, metagenomics |
| `lobster-bio-dev` | Biology | Multi-agent bioinformatics engine for collaborative genomics pipelines |
| `admet-prediction` | Biology, Chemistry, Medicine | ADMET prediction for drug/compound candidates |
| `chemistry-query` | Chemistry | PubChem API: compound info, SMILES structures, synthesis routes |
| `paramus-chemistry` | Chemistry | Hundreds of chemistry and scientific computing tools |
| `clarity-research` | Chemistry, Biology | Search protein folding research data from Clarity Protocol |
| `medical-research-toolkit` | Medicine | Query 14+ biomedical databases for drug repurposing and clinical trials |
| `medical-clinicaltrials` | Medicine | Search ClinicalTrials.gov with advanced protocol filtering |
| `pmc-harvest` | Medicine, Biology | Fetch full-text articles from PubMed Central |
| `pubmed-edirect` | Medicine, Biology | Advanced PubMed search and retrieval via NCBI EDirect CLI |
| `wolfram-alpha` | Physics, Mathematics | Complex calculations, physics simulations, unit conversions |
| `acorn-prover` | Mathematics, Physics | Verify and write formal proofs using the Acorn theorem prover |
| `arxiv-cli-tools` | Physics, Mathematics, CS | CLI tools for fetching arXiv papers |
| `agentic-paper-digest` | AI / ML | Auto-fetch and summarize recent arXiv and Hugging Face AI/ML papers |
| `arxiv-paper-reviews` | AI / ML | Fetch AI/ML papers and manage review notes via arXiv Crawler |
| `github` | Computer Science | Interact with GitHub: issues, PRs, CI runs, advanced queries |
| `docker-essentials` | Computer Science | Essential Docker commands for container management |
| `git-essentials` | Computer Science | Essential Git commands for version control |
| `geepers-data` | Earth & Environment | Fetch data from NASA, Census, climate APIs, arXiv, PubMed |
| `biodiversity-corridor-calculator` | Earth & Environment | Analyse biodiversity corridors and ecological connectivity |
| `autonomous-research` | Social Sciences | Multi-step independent research for qualitative or quantitative studies |
| `limesurvey` | Social Sciences | Automate survey creation and management for data collection |

### Community Skills (ClawHub)

Skills published by the broader OpenClaw community on ClawHub. Users install them on demand via the Staff panel or `clawhub install <skill>`.

AcaClaw does not bundle community skills, but we curate a recommended list on [acaclaw.com/hub](https://acaclaw.com/hub) — see [Curating ClawHub Skills](#curating-clawhub-skills).

---

## Where Skills Live

Skills are **shared between OpenClaw and AcaClaw**. Both use the same storage locations — there is no separate AcaClaw skill directory.

### Storage Locations

The gateway scans these directories in priority order (later overrides earlier):

| Priority | Location | Description |
|---|---|---|
| 1 (lowest) | `skills.load.extraDirs` in config | Additional skill folders |
| 2 | `<openclaw-package>/skills/` | Bundled with OpenClaw (foundation skills) |
| 3 | **`~/.openclaw/skills/`** | Managed skills — **this is where ClawHub installs go** |
| 4 | `~/.agents/skills/` | Personal agent skills |
| 5 | `<workspace>/.agents/skills/` | Per-project agent skills |
| 6 (highest) | `<workspace>/skills/` | Workspace skills (e.g. `~/AcaClaw/skills/`) |

### What This Means for AcaClaw

- **Skills installed via `clawhub install` go to `~/.openclaw/skills/`** (the managed dir)
- Both vanilla OpenClaw and AcaClaw gateways see the same managed skills
- You install a skill once; it's available everywhere
- AcaClaw's `OPENCLAW_HOME` (`~/.openclaw-acaclaw/`) controls **config and plugins**, not skills
- To override a skill for AcaClaw only, place it in `~/AcaClaw/skills/<skill>/` (workspace-level override)

### Why Share?

- **"Expand the ecosystem, don't diverge"** — skills belong to the OpenClaw ecosystem
- No duplication — install once, use from any gateway
- Switching between AcaClaw and vanilla OpenClaw is seamless
- The `OPENCLAW_STATE_DIR` env var can override `~/.openclaw` if needed

---

## How Skills Are Selected

Every skill AcaClaw ships must pass the same selection criteria:

| Criterion | Weight | Description |
|---|---|---|
| **Accuracy / Quality** | Critical | Must produce correct, publication-grade results |
| **Ease of use (for AI)** | High | The AI agent must be able to operate it reliably via tool calls |
| **License** | High | MIT/BSD/Apache preferred; GPL/AGPL acceptable as separate process |
| **Maintenance** | High | Actively maintained, responsive to bugs |
| **Environment compatibility** | Critical | Dependencies must resolve cleanly in the shared Conda env |
| **Size** | Medium | Smaller install footprint preferred |

### What We Deliberately Exclude

| Excluded | Reason |
|---|---|
| Multiple tools for the same job | One best per job; users can add alternatives from ClawHub |
| Deep learning frameworks in base | Most researchers don't need them; available as optional install |
| LaTeX in base | ~4 GB; Pandoc handles conversion; available as add-on |
| Untested community skills | Every shipped skill must pass quality gates |

### Decision Process

1. **Identify the need** — a real research task that current skills don't cover
2. **Survey existing options** — check ClawHub, existing tools, and community requests
3. **Pick the best candidate** — apply the selection criteria above
4. **Test in environment** — verify dependencies resolve cleanly with all other shipped skills
5. **Team review** — at least one reviewer, one tester, and one security check
6. **Publish and ship** — to ClawHub first, then update `skills.json`

---

## Expand the Ecosystem, Don't Diverge

This is a core principle. AcaClaw contributes to ClawHub — it never builds a parallel ecosystem.

| What we do | What we never do |
|---|---|
| Publish all skills to ClawHub | Host skills on our own servers |
| Install skills via `clawhub install` | Bypass ClawHub with a custom installer |
| File bugs and PRs upstream on OpenClaw | Fork OpenClaw or maintain patches |
| Credit every contributor by name and role | Publish under a team brand without attribution |
| Test all skills together in one environment | Ship skills with conflicting dependencies |
| Recommend community skills on acaclaw.com | Pull community skills into our repo without permission |

### Why This Matters

- **For users**: Switching between AcaClaw and vanilla OpenClaw is seamless. Skills work everywhere.
- **For contributors**: Your skill reaches the entire OpenClaw user base, not just AcaClaw users.
- **For the ecosystem**: One registry, one format, one community. No fragmentation.

### The Rule

> **If it's a skill, it goes to ClawHub. If it's a plugin, it goes to npm. If it's a config change, it goes to `openclaw.json`. AcaClaw never maintains anything that should live upstream.**

---

## Teamwork, Not Individual Heroics

AcaClaw skills are built by teams, not individuals. Every skill has multiple contributors with distinct roles.

### Why Teams?

| Individual approach | Team approach |
|---|---|
| One person writes, tests, and maintains | Separate roles: creator, tester, reviewer, maintainer |
| Quality depends on one person's bandwidth | Quality is sustained across the team |
| Bus factor = 1 | Bus factor >= 3 |
| Creator burns out, skill dies | Maintainers pick up when creators move on |
| "It works on my machine" | Tested across environments by dedicated testers |

### Team Roles

| Role | Responsibility |
|---|---|
| **Creator** | Design and implement the skill. Write the initial SKILL.md |
| **Author** | Contribute significant features or extensions to the skill |
| **Tester** | Validate across environments, write test cases, report edge cases |
| **Maintainer** | Keep the skill compatible with new OpenClaw releases and env updates |
| **Debugger** | Fix critical bugs and edge cases |
| **Reviewer** | Review code, tests, and security before publishing |
| **Documenter** | Write usage guides, examples, and translations |

### Minimum Team Size

A skill cannot be published until it has at least:

- 1 Creator
- 1 Reviewer (different person)
- 1 Tester (can be the reviewer)

This ensures no skill ships without a second pair of eyes.

---

## Managing Official Skills

Official AcaClaw skills live in [github.com/acaclaw/acaclaw-skills](https://github.com/acaclaw/acaclaw-skills). Here's how the team manages them.

### Repository Structure

```
acaclaw-skills/
├── core/
│   ├── paper-search/
│   │   ├── SKILL.md           ← Skill definition (ClawHub format)
│   │   ├── paper-search.test.ts
│   │   └── README.md          ← Usage guide, contributor table
│   ├── citation-manager/
│   ├── data-analyst/
│   ├── figure-generator/
│   └── ...
├── disciplines/
│   ├── bio-tools/
│   ├── chem-tools/
│   ├── med-tools/
│   └── physics-tools/
├── tests/
│   ├── integration/           ← Cross-skill compatibility tests
│   └── environment/           ← Conda env resolution tests
└── scripts/
    ├── publish.sh             ← Publish to ClawHub
    └── env-check.sh           ← Verify environment compatibility
```

### Testing

| Test type | What it checks | When it runs |
|---|---|---|
| **Unit tests** | Individual skill logic | Every PR |
| **Integration tests** | Skill runs correctly against pinned OpenClaw version | Every PR |
| **Environment tests** | All skill dependencies resolve cleanly in shared Conda env | Every PR + nightly |
| **Security tests** | No exfiltration, no dangerous commands, no credential leaks | Every PR |
| **Compatibility tests** | Works in both Standard and Maximum security modes | Before publishing |
| **Cross-skill tests** | Skills don't interfere with each other | Before publishing |

### Maintenance Workflow

1. **OpenClaw releases a new version** → run all tests against new version
2. **Tests fail** → maintainer files a fix PR; if upstream broke the API, file an issue on OpenClaw
3. **Conda environment updated** → re-resolve all dependencies, run env tests
4. **Bug reported** → debugger investigates, files PR with fix and regression test
5. **New skill proposed** → follow the [contributing workflow](#contributing-new-skills)

### Debugging Skills

When a skill breaks:

1. **Reproduce** — run the failing test locally with `pnpm test -- <skill>.test.ts`
2. **Isolate** — is it the skill, the environment, or OpenClaw? Run in a clean Conda env
3. **Check upstream** — did OpenClaw change an API? Check the changelog
4. **Fix and test** — file a PR with the fix and a regression test that fails before / passes after
5. **Publish** — merged PR triggers CI publish to ClawHub

### Version Pinning

`skills.json` in the main acaclaw repo pins the skill versions that ship with each AcaClaw release:

```json
{
  "skills": {
    "core": [
      { "name": "paper-search", "source": "clawhub", "version": "1.2.0" }
    ]
  }
}
```

This ensures every AcaClaw user gets the exact tested version — not whatever's latest on ClawHub.

---

## Curating ClawHub Skills

Beyond official AcaClaw skills, the community publishes skills on ClawHub. AcaClaw curates the best of them.

### What Curation Means

| We do | We don't do |
|---|---|
| Test and recommend skills on [acaclaw.com/hub](https://acaclaw.com/hub) | Copy community skills into our repo |
| Link to the original ClawHub page | Re-publish under our name |
| Credit the original author prominently | Claim curation credit |
| Report bugs upstream to the skill author | Fork and fix without contributing back |

### Curation Criteria

A community skill earns an AcaClaw recommendation when it:

| Criterion | Description |
|---|---|
| **Fills a gap** | Covers a use case no official skill addresses |
| **Environment compatible** | Installs cleanly alongside AcaClaw's Conda environment |
| **Maintained** | Author responds to issues, updates for new OpenClaw releases |
| **Secure** | Passes AcaClaw's security review (no exfiltration, no dangerous commands) |
| **Documented** | Has clear usage instructions and examples |

### Recommended Skills on acaclaw.com

[acaclaw.com/hub](https://acaclaw.com/hub) displays:

- **Official Skills** — built by the AcaClaw team, published to ClawHub
- **Recommended Skills** — community skills vetted by AcaClaw (with a "Community" badge)
- **Install instructions** — one-click or `clawhub install <skill>`
- **Author and contributor attribution** — linked to ClawHub profiles

---

## Acknowledging Contributors

Every contribution is tracked. Every contributor is named.

### Where Attribution Appears

| Surface | What's shown |
|---|---|
| **SKILL.md `## Contributors` section** | Name, role, link to profile — rendered on ClawHub skill page |
| **[acaclaw.com](https://acaclaw.com)** | Contributor showcase per skill, sortable by role |
| **GitHub acaclaw-skills repo** | Git history is the canonical authorship record |
| **CHANGELOG.md** | Contributors credited in release notes for new skills and fixes |
| **AcaClaw README** | Top contributors listed with links |

### Attribution Format

Every skill's SKILL.md or README.md includes:

```markdown
## Contributors

| Contributor | Role | Profile |
|---|---|---|
| @alice | Creator | [clawhub.ai/alice](https://clawhub.ai/alice) |
| @bob | Tester, Debugger | [clawhub.ai/bob](https://clawhub.ai/bob) |
| @carol | Reviewer | [clawhub.ai/carol](https://clawhub.ai/carol) |
| @dan | Maintainer | [clawhub.ai/dan](https://clawhub.ai/dan) |
| @eve | Documenter | [clawhub.ai/eve](https://clawhub.ai/eve) |
```

### Rules

- Every contributor gets credited — no threshold for "too small" a contribution
- Roles are additive — one person can hold multiple roles
- Git history is the source of truth — if you committed, you're credited
- Contributors are never removed, even if they stop contributing
- The Creator role can only be held by the original skill author(s)

---

## Contributing New Skills

There are two paths to contribute a new skill: via GitHub (for developers) and via acaclaw.com (for researchers who prefer a web interface).

### Path 1: GitHub (acaclaw-skills repo)

For contributors comfortable with Git and code:

1. **Check for duplicates** — search [ClawHub](https://clawhub.ai) and existing [acaclaw-skills](https://github.com/acaclaw/acaclaw-skills) issues
2. **Open an issue** — describe the skill, its target audience, and expected dependencies
3. **Fork the repo** — `github.com/acaclaw/acaclaw-skills`
4. **Create your skill**:
   ```
   disciplines/your-field/
   ├── SKILL.md              ← Follows ClawHub SKILL.md format
   ├── your-skill.test.ts    ← Tests
   └── README.md             ← Usage guide + Contributors table
   ```
5. **Declare dependencies** — only packages your skill actually imports, in the PR description and `skills.json`
6. **Run environment check** — `scripts/env-check.sh` to verify no conflicts
7. **Open a PR** — fill out the PR template; you'll be credited as **Creator**
8. **Team review** — reviewer, tester, and security check must pass
9. **Merge and publish** — CI publishes to ClawHub; `skills.json` updated

### Path 2: acaclaw.com (Web Submission)

For researchers who prefer not to use Git:

1. Go to [acaclaw.com/submit](https://acaclaw.com/submit)
2. Fill out the skill submission form:
   - **Name** — short, descriptive (e.g., `gel-analyzer`)
   - **Description** — what the skill does, who it's for
   - **Discipline** — which field(s) this serves
   - **SKILL.md content** — paste or upload your skill definition
   - **Dependencies** — Python/R packages the skill requires
   - **Your info** — name, email, ClawHub profile (for attribution)
3. An AcaClaw team member converts your submission into a PR on acaclaw-skills
4. You're credited as **Creator** in the skill's Contributors table
5. Team reviews, tests, and publishes to ClawHub

### Which Path to Choose?

| If you... | Use |
|---|---|
| Know Git and want full control | [GitHub](#path-1-github-acaclaw-skills-repo) |
| Prefer a web form over terminal | [acaclaw.com](#path-2-acaclawcom-web-submission) |
| Want to fix an existing skill | [GitHub](#path-1-github-acaclaw-skills-repo) (fork + PR) |
| Want to suggest a skill idea without building it | Open an issue on [acaclaw-skills](https://github.com/acaclaw/acaclaw-skills/issues) |

### Quality Gates

Before any skill ships, it must pass all gates:

| Gate | What it checks |
|---|---|
| **Code review** | At least one reviewer signs off |
| **Integration tests** | Skill runs correctly against pinned OpenClaw version |
| **Environment compatibility** | Dependencies resolve cleanly in shared Conda env |
| **Security review** | No data exfiltration, no dangerous commands, no credential leaks |
| **Compatibility test** | Works in both Standard and Maximum security modes |
| **Attribution check** | `## Contributors` section present and complete |

**A skill that fails any gate does not ship.** The contributor gets feedback and can revise.

---

## Syncing GitHub and acaclaw.com

The [acaclaw-skills](https://github.com/acaclaw/acaclaw-skills) GitHub repo is the single source of truth. The website reflects it — never the other way around.

### How Sync Works

```
                   ┌─────────────────────────────┐
                   │   acaclaw-skills (GitHub)    │
                   │   Source of truth for all    │
                   │   skill code and metadata    │
                   └────────────┬────────────────┘
                                │
                    PR merged → CI runs
                                │
              ┌─────────────────┼─────────────────┐
              │                 │                   │
              ▼                 ▼                   ▼
     ┌────────────────┐ ┌──────────────┐  ┌────────────────┐
     │   ClawHub       │ │ acaclaw.com  │  │ acaclaw repo   │
     │   (publish)     │ │ /hub (build) │  │ skills.json    │
     │                 │ │              │  │ (pin version)  │
     └────────────────┘ └──────────────┘  └────────────────┘
```

### Flow

| Step | What happens | Triggered by |
|---|---|---|
| 1 | Contributor opens PR on acaclaw-skills | Manual (GitHub or web submission) |
| 2 | CI runs tests (unit, integration, env, security) | PR opened/updated |
| 3 | Team reviews and merges | Manual review |
| 4 | CI publishes skill to ClawHub | Merge to main |
| 5 | CI rebuilds [acaclaw.com/hub](https://acaclaw.com/hub) with new skill data | Merge to main |
| 6 | AcaClaw team updates `skills.json` in acaclaw repo with new version | Manual PR on acaclaw |
| 7 | Next AcaClaw release ships the new skill | AcaClaw release cycle |

### Rules

- **GitHub is canonical** — all skill code, tests, and metadata live in the acaclaw-skills repo
- **Website is a view** — acaclaw.com/hub reads from GitHub; edits on the website create PRs, not direct changes
- **ClawHub is the registry** — skills are installed from ClawHub, not from GitHub or acaclaw.com
- **Version pinning is explicit** — `skills.json` in the acaclaw repo pins the exact version shipped with each release
- **No manual deploys** — CI handles publishing and website rebuilds automatically

### Web Submissions Flow

When a researcher submits a skill via [acaclaw.com/submit](https://acaclaw.com/submit):

1. Submission is stored as a draft
2. An AcaClaw team member reviews the draft
3. If accepted, the team member creates a PR on acaclaw-skills with the skill content
4. Standard PR review process applies
5. Contributor is credited as Creator
6. Skill appears on acaclaw.com/hub after merge

This keeps the GitHub repo as the single source of truth while making contribution accessible to non-developers.

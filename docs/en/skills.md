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
- [Skills UI](#skills-ui)
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

AcaClaw organizes skills into three tiers. Each tier serves a different purpose.

### Foundation Skills (Bundled with OpenClaw)

These ship with OpenClaw itself and are required by the AcaClaw agents. AcaClaw inherits them — no installation needed.

| Skill | What it does |
|---|---|
| `nano-pdf` | Read and extract text from PDF files |
| `xurl` | Fetch and parse web content |
| `summarize` | Summarize documents and text |
| `humanizer` | Humanize AI-generated text to sound natural and human |
| `clawhub` | Browse and install skills from ClawHub |

**Selection rule**: AcaClaw never replaces or overrides foundation skills. If OpenClaw ships it, we use it.

### Core Academic Skills (Cross-Discipline)

Cross-discipline skills recommended for every researcher. They are listed in the Staff panel and can be added to any staff member. All are verified and available on ClawHub.

| Skill | Category | What it does |
|---|---|---|
| `literature-search` | Literature | Search arXiv, PubMed, Semantic Scholar |
| `academic-deep-research` | Literature | Transparent, rigorous research across academic databases with audit trail |
| `literature-review` | Literature | Structured literature reviews with synthesis and gap analysis |
| `arxiv-cli-tools` | Literature | CLI tools for fetching and searching arXiv papers |
| `academic-citation-manager` | Writing | Format references in APA, Vancouver, Nature, and 9000+ styles |
| `ai-humanizer` | Writing | Detect and remove AI-typical writing patterns |
| `academic-writing` | Writing | Expert agent for scholarly papers, literature reviews, methodology |
| `autonomous-research` | Research | Multi-step independent research for qualitative or quantitative studies |
| `survey-designer` | Research | Design and manage surveys for research data collection |
| `data-analyst` | Data Analysis | Data visualisation, reports, SQL, spreadsheets |
| `mermaid` | Data Analysis | Generate diagrams (flowcharts, sequence, class) from text |
| `pandoc-convert-openclaw` | Documents | Convert between Word, PDF, LaTeX, and Markdown via Pandoc |
| `agentic-coding` | Development | Write and execute code autonomously |
| `docker-essentials` | Development | Essential Docker commands for container management |
| `git-essentials` | Development | Essential Git commands for version control |

**Selection rule**: one best tool per job. Only verified ClawHub skills are listed. If a skill is not on ClawHub, it is not in the list.

### Community Skills (ClawHub)

Skills published by the broader OpenClaw community on ClawHub. Users install them on demand via the Staff panel or `clawhub install <skill>`.

AcaClaw does not bundle community skills, but we curate a recommended list on [acaclaw.com/hub](https://acaclaw.com/hub) — see [Curating ClawHub Skills](#curating-clawhub-skills).

---

## Where Skills Live

Skills are stored in the AcaClaw gateway's working directory. The AcaClaw profile uses `~/.openclaw-acaclaw/` as its home, so managed skills (installed from ClawHub) go into:

```
~/.openclaw-acaclaw/skills/<skill-name>/
```

### Storage Locations

The gateway scans these directories in priority order (later overrides earlier):

| Priority | Location | Description |
|---|---|---|
| 1 (lowest) | `skills.load.extraDirs` in config | Additional skill folders |
| 2 | `<openclaw-package>/skills/` | Bundled with OpenClaw (foundation skills) |
| 3 | **`~/.openclaw-acaclaw/skills/`** | Managed skills — **this is where ClawHub installs go** |
| 4 | `~/.agents/skills/` | Personal agent skills |
| 5 | `<workspace>/.agents/skills/` | Per-project agent skills |
| 6 (highest) | `<workspace>/skills/` | Workspace skills |

### What This Means for AcaClaw

- **Skills installed via the Staff panel or `clawhub install` go to `~/.openclaw-acaclaw/skills/`**
- Foundation skills (bundled) are never written to disk — they are always loaded from the OpenClaw package
- To override a skill for AcaClaw only, place it in `~/AcaClaw/skills/<skill>/` (workspace-level override)

---

## Skills UI

The AcaClaw desktop UI surfaces skills in two places: the **Skills view** and the **Staff panel**.

### Skills View (`#skills`)

| Tab | What it shows |
|---|---|
| **Installed** | All installed skills — managed (ClawHub) listed first, then bundled, both alphabetically |
| **ClawHub** | Live search of [clawhub.ai](https://clawhub.ai) — type to search, click Install to pull a skill |

**Installed tab actions:**

| Action | When shown | What it does |
|---|---|---|
| **Disable** | Skill is installed and enabled | Marks the skill inactive; the agent will not use it |
| **Enable** | Skill is disabled | Re-activates the skill |

The footer shows a live count: `N installed · N bundled · N eligible`.

### Staff Panel (Skills tab)

Opened from the Staff view → click a staff card → Skills tab.

| Section | What it shows |
|---|---|
| **Assigned Skills** | Pills for each skill assigned to this staff member; count updates live |
| **Recommended** | Cross-discipline skills from ClawHub — installed ones show "+ Add", uninstalled show "Install" |

**Add vs Install:**

| Button | Meaning |
|---|---|
| **+ Add** | Skill is already installed in the gateway — assign it to this staff member |
| **Install** | Skill is not yet installed — pulls from ClawHub then assigns to this staff member |
| **×** (on pill) | Remove this skill from the staff member's assignment list |

The card in the Staff grid always shows the correct count of assigned skills, and the panel header shows how many are currently installed in the gateway.

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

AcaClaw uses verified skills from ClawHub. The current cross-discipline skill list is maintained in `skills.json` in the main acaclaw repo and `AVAILABLE_SKILLS` in the UI source.

### skills.json

`skills.json` in the root of the acaclaw repo defines which skills are agent-required (always installed and cannot be removed):

```json
{
  "agent_required": [
    { "name": "nano-pdf" },
    { "name": "xurl" },
    { "name": "summarize" },
    { "name": "humanizer" }
  ]
}
```

### Testing

All managed skills are validated with the test suite in `tests/`:

| Test file | What it checks |
|---|---|
| `tests/security.test.ts` | Security plugin, restrictive mode, credential isolation |
| `tests/backup.test.ts` | Backup/restore of workspace data including skills |

### Maintenance Workflow

1. **OpenClaw releases a new version** → run `pnpm test` against new version
2. **A ClawHub skill disappears or renames** → update `AVAILABLE_SKILLS` in `ui/src/views/staff.ts` and `CURATED_SKILLS` in `ui/src/views/skills.ts`
3. **New skill to add** → verify it exists on ClawHub, add to `AVAILABLE_SKILLS`, test with Playwright
4. **Skill name mismatch** → update `agent_required` in `skills.json` and `AGENT_REQUIRED_SKILLS` in `skills.ts`

### Version Pinning

AcaClaw always installs the latest ClawHub version of managed skills via:

```sh
clawhub --workdir ~/.openclaw-acaclaw --no-input install --force <skill>
```

The `install.sh` script pins the core skills for a fresh install:

```sh
CORE_SKILLS=("nano-pdf" "xurl" "summarize" "humanizer")
```

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

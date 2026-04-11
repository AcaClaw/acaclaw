---
layout: page
title: Contributing
lang: en
permalink: /en/contributing/
---

> **Purpose 2: Curate and contribute high-quality skills through teamwork.**

AcaClaw is for the global academic community — contributions from researchers are especially welcome.

---

## How to Contribute

### Create a Skill

Write a skill for your academic domain in the [acaclaw-skills](https://github.com/acaclaw/acaclaw-skills) repository.

1. Fork [acaclaw-skills](https://github.com/acaclaw/acaclaw-skills)
2. Create your skill following the SKILL.md format
3. Add tests that verify the skill works in the shared AcaClaw Conda environment
4. Open a PR — you'll be credited as **Creator**

### Test Skills

Run skills against real-world data in your domain. Report edge cases, write test cases.

- Credited as **Tester**

### Fix Bugs

Track down and fix edge cases in existing skills.

- Credited as **Debugger**

### Review Code

Review PRs before skills are published to ClawHub.

- Credited as **Reviewer**

### Write Documentation

Tutorials, usage guides, translations.

- Credited as **Documenter**

### Maintain Skills

Keep existing skills compatible with new OpenClaw releases and environment updates.

- Credited as **Maintainer**

---

## Recognized Roles

| Role | Description |
|------|-------------|
| **Creator** | Original author who designed and implemented the skill |
| **Author** | Wrote significant portions of the skill's functionality |
| **Tester** | Validated the skill across environments, wrote test cases |
| **Maintainer** | Keeps the skill updated and compatible with new OpenClaw releases |
| **Debugger** | Fixed critical bugs or edge cases |
| **Reviewer** | Reviewed code and provided quality feedback before publishing |
| **Documenter** | Wrote usage guides, examples, or translations |

Every contribution is tracked, every contributor is named.

---

## Quality Gates

Before a skill is published to ClawHub, it must pass:

| Gate | What it checks |
|------|----------------|
| **Code review** | At least one reviewer signs off |
| **Integration tests** | Skill runs against pinned OpenClaw version |
| **Environment compatibility** | Dependencies resolve cleanly in shared Conda env |
| **Security review** | No exfiltration, no dangerous commands |
| **Compatibility test** | Works in both Standard and Maximum security modes |
| **Attribution check** | `## Contributors` section present and complete |

---

## Environment Compatibility

All skills share a single Conda environment (`env/conda/environment-base.yml`). When adding a new skill:

1. Declare only the packages your skill actually imports in `skills.json`
2. Ensure your version requirements are compatible with the existing environment
3. Run the full test suite to verify no conflicts with other skills
4. If a conflict exists, work with maintainers to resolve it before publishing

**A skill that introduces an unresolvable dependency conflict will not be shipped.**

---

## Attribution

- Every skill includes a `## Contributors` table in its SKILL.md (rendered on ClawHub)
- Every contributor is showcased on [acaclaw.com/hub](https://acaclaw.com/hub)
- Git history is the canonical authorship record

---

## Contributing to the AcaClaw App

The sections above focus on contributing skills. The commands below are for developing the AcaClaw application and distribution itself, not the separate `acaclaw-skills` repository.

---

## Development Setup

```bash
# Clone the repo
git clone https://github.com/acaclaw/acaclaw.git
cd acaclaw

# Install dependencies
npm install

# Run tests
npx vitest run

# Type check
npx tsc --noEmit
```

### Local Development Commands

Run these commands from the repository root when working on the local app:

| Task | Command |
|------|---------|
| Start the local gateway and open the UI | `bash scripts/start.sh` |
| Start the local gateway without opening the UI automatically | `bash scripts/start.sh --no-browser` |
| Check whether the gateway is running | `bash scripts/start.sh --status` |
| Stop the local gateway | `bash scripts/stop.sh` |
| Restart the local gateway | `bash scripts/stop.sh && bash scripts/start.sh` |
| Reinstall the current checkout into your local AcaClaw profile after plugin/script/config changes | `bash scripts/install.sh` |
| Rebuild and deploy UI-only changes | `npm --prefix ui run build && npm run deploy` |

---

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

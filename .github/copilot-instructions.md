# Copilot Workspace Instructions

## Doc-First Development

AcaClaw is doc-driven: design docs are written first, then implementation follows. **Before implementing any feature or change, read the relevant design doc(s) below.** Each doc has a `<!-- DESIGN-DOC: ... -->` comment explaining its scope. Grep for `DESIGN-DOC` to find them.

| Topic | Design Doc (en) | When to Read |
|-------|----------------|---------------|
| Architecture | `docs/en/architecture.md` | System structure, plugin hooks, gateway integration |
| Agents | `docs/en/agents.md` | Adding, modifying, or configuring agents |
| Auth & App Launch | `docs/en/auth-and-app-launch.md` | Auth flow, gateway connection, app startup |
| Chat Handling | `docs/en/chat-handling.md` | Chat UI, message flow, model interaction |
| Computing Environment | `docs/en/computing-environment.md` | Conda envs, packages, environment isolation |
| Contributing | `docs/en/contributing.md` | PR workflow, coding standards, onboarding |
| Data Safety | `docs/en/data-safety.md` | File operations, backup, deletion recovery |
| Web GUI | `docs/en/desktop-gui.md` | UI pages, components, navigation |
| Getting Started | `docs/en/getting-started.md` | Onboarding flow, first-launch experience |
| Install | `docs/en/install.md` | Install scripts, dependencies, platform support |
| Logging | `docs/en/logging.md` | Logging, activity tracking, debugging |
| Providers & Models | `docs/en/providers-and-models.md` | Provider config, model selection, API keys |
| Security | `docs/en/security.md` | Security features, permissions, trust boundaries |
| Skills | `docs/en/skills.md` | Skill curation, installation, ClawHub publishing |
| Testing | `docs/en/testing.md` | Test strategy, test structure, CI |
| Workspace | `docs/en/workspace.md` | Workspace layout, file visibility, project structure |
| Model Management | `docs/en/model-management.md` | Large software/model install (Docker vs Conda), AlphaFold2, GROMACS, software registry |

Chinese translations are in `docs/zh-CN/` with the same filenames. Original design drafts are in `docs/_original/`.

## Conversation Flow
- After completing a task or conversation, **always trigger the `vscode_askQuestions` tool call** (not plain-text questions) to ask the user for follow-up instructions
- Provide 3–5 actionable option suggestions based on the current context (e.g., next logical steps, related improvements, testing ideas)
- Include `allowFreeformInput: true` so the user can also type a custom instruction
- This keeps the workflow continuous without the user needing to prompt from scratch
- **Never** end a turn with plain-text questions — always use the tool


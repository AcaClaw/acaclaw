# AcaClaw — Repository Guidelines

## Golden Rule

AcaClaw is a distribution layer on top of OpenClaw. If OpenClaw already provides a function, RPC, UI feature, config path, or CLI command — use it, never re-implement it. AcaClaw only adds: academic skills, Conda environments, workspace management, backup, and research-focused UI.

## Conversation Flow

- After completing a task, always use `vscode_askQuestions` (not plain-text questions) with 3–5 options and `allowFreeformInput: true`.Provide 3–5 actionable option suggestions based on the current context.

# Copilot Workspace Instructions

## Conversation Flow
- After completing a task or conversation, **always trigger the `vscode_askQuestions` tool call** (not plain-text questions) to ask the user for follow-up instructions
- Provide 3–5 actionable option suggestions based on the current context (e.g., next logical steps, related improvements, testing ideas)
- Include `allowFreeformInput: true` so the user can also type a custom instruction
- This keeps the workflow continuous without the user needing to prompt from scratch
- **Never** end a turn with plain-text questions — always use the tool

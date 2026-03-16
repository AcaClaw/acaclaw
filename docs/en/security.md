---
layout: page
title: Security
lang: en
permalink: /en/security/
---

> **Design Principle**: Safe by default, powerful by opt-in. Follow the VS Code workspace trust model — confine operations locally, alert on escalation, and let users unlock capabilities when they understand the implications.

---

## Philosophy

AcaClaw targets scientists who are not security experts. The security model must be:

1. **Invisible when safe** — Standard local usage should feel seamless
2. **Loud when escalating** — Any action that increases the attack surface must produce a visible alert
3. **Opt-in, never opt-out** — Dangerous capabilities are disabled by default
4. **Layered, not binary** — Security is a stack of independent controls that users can tune
5. **Follow VS Code's lead** — The Workspace Trust model is well-understood and sufficient

### Two Dimensions of Safety

| Dimension | What it protects | Examples |
|-----------|-----------------|----------|
| **Data Safety** | Files, research data, experimental results | Accidental deletion, overwrites, corruption |
| **Information Safety** | Credentials, API keys, personal info, research IP | Credential leaks, data exfiltration, session hijacking |

---

## Security Tiers

AcaClaw provides three tiers, progressing from most convenient to most isolated.

```
┌────────────────────────────────────────────────────────────────┐
│  Tier 3: Docker Sandbox (opt-in)                                │
│  Container isolation, network=none, dropped caps, seccomp      │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Tier 2: Remote Access (opt-in, alert required)          │  │
│  │  Gateway exposed beyond loopback, TLS required,          │  │
│  │  auth token mandatory                                    │  │
│  │  ┌──────────────────────────────────────────────────┐    │  │
│  │  │  Tier 1: Local Workspace (DEFAULT)               │    │  │
│  │  │  workspaceOnly, tool deny-list, backup,          │    │  │
│  │  │  credential scrubbing, audit log                 │    │  │
│  │  └──────────────────────────────────────────────────┘    │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

### Summary by Tier

| Tier | Threats Mitigated | Primary Mechanism | Residual Risk |
|------|:-:|---|---|
| **Tier 1 (Local)** | 18/26 | Workspace confinement, deny-lists, domain allowlist, credential scrubbing | Command injection, symlink edge cases, no process isolation |
| **Tier 2 (Remote)** | 20/26 | Tier 1 + TLS, auth tokens, scoped log viewer | Authorization escalation, webhook auth |
| **Tier 3 (Docker)** | 25/26 | Container isolation, `network=none`, dropped caps, read-only rootfs | Docker `no-new-privileges` compat on some kernels |

---

## Tier 1 — Local Workspace (Default)

All operations are confined to the local workspace. No network exposure. No Docker required.

### What is enforced

| Control | Mechanism |
|---------|-----------|
| Workspace confinement | `tools.fs.workspaceOnly: true` |
| Tool deny-list | `tools.deny: [gateway, cron, sessions_spawn, ...]` |
| Command deny-list | 15 dangerous patterns (rm -rf, chmod 777, curl\|sh, etc.) |
| Network allowlist | Egress restricted to academic domains |
| Pre-modification backup | Every file-modifying tool triggers backup first |
| Credential scrubbing | 12 patterns stripped from LLM output |
| Injection detection | 8 prompt injection patterns flagged |
| Audit logging | Every tool call logged to `~/.acaclaw/audit/` |
| Loopback binding | Gateway binds to `127.0.0.1` only |

### When Tier 1 is sufficient

- Writing papers, analyzing personal data, managing citations
- Student homework, coursework
- Literature search, reference management
- Any workflow where all data is trusted and the user is the sole operator

---

## Tier 2 — Remote Access (Opt-In)

Remote access means exposing the gateway beyond `127.0.0.1`. AcaClaw treats this as a significant security escalation.

### Enabling remote access

1. **Security alert displayed** explaining implications
2. **Explicit confirmation** required
3. **Event logged** to audit trail
4. **TLS enforced** — plaintext HTTP blocked for non-loopback
5. **Auth token required**

### Bind modes

| Mode | Binds to | Risk | Recommended use |
|------|----------|------|-----------------|
| `loopback` (default) | `127.0.0.1` | None | Standard local use |
| `tailnet` | Tailscale IP | Low | Secure access between own devices |
| `lan` | `0.0.0.0` | Medium | Lab/office LAN (trusted network) |
| `custom` | User-specified | High | Advanced users only |

---

## Tier 3 — Docker Sandbox (Opt-In)

Container isolation for all tool execution — the strongest security posture.

### When to use Tier 3

| Scenario | Why Docker helps |
|----------|------------------|
| Processing untrusted data | Malicious data can't escape container |
| Running code from papers/internet | Code can't access host filesystem |
| Shared/lab machines | Per-session containers provide isolation |
| Regulatory compliance (HIPAA, GDPR) | Demonstrable isolation boundary |

### Docker security hardening

| Hardening | Detail |
|-----------|--------|
| All capabilities dropped | No `CAP_NET_RAW`, `CAP_SYS_ADMIN`, etc. |
| Read-only root filesystem | Container filesystem is immutable |
| `network: none` | No network from inside the container |
| Seccomp profile | Restricts syscalls to safe subset |
| Non-root execution | Runs as `sandbox` user |
| Workspace-only mount | Only `~/AcaClaw` mounted with `rw` |
| Session-scoped lifecycle | Container destroyed when session ends |

---

## Protection Layers

### How tool calls are processed

```
AI decides to call a tool
   │
   ▼
┌─ AcaClaw Policy Layer (before_tool_call) ────────┐
│  @acaclaw/backup: copy file before modification   │
│  @acaclaw/security: check command policy           │
│  @acaclaw/security: log to audit trail             │
│  @acaclaw/security: block if policy violation      │
└──────────────────────┬───────────────────────────┘
                       │ allowed
                       ▼
┌─ OpenClaw Tool Policy Layer ─────────────────────┐
│  workspaceOnly, tool allow/deny, exec policy      │
└──────────────────────┬───────────────────────────┘
                       │ allowed
                       ▼
┌─ OpenClaw Execution Layer ───────────────────────┐
│  Standard: host (workspace-only)                  │
│  Maximum:  Docker container                       │
└──────────────────────────────────────────────────┘
```

### Credential scrubbing

12 patterns are stripped from LLM output:

- OpenAI keys (`sk-*`)
- GitHub PATs (`ghp_*`, `gho_*`)
- AWS access keys (`AKIA*`)
- JWTs (`eyJ*.eyJ*.*`)
- PEM private keys
- And 7 more patterns

### Prompt injection detection

8 patterns are flagged (not blocked) with a warning:

- "ignore all previous instructions"
- "you are now a ..."
- "override all instructions"
- And 5 more patterns

Flagged but not blocked to avoid false positives — a researcher discussing prompt injection in a security paper should not be constantly interrupted.

---

## Network Policy

### Academic domain allowlist

All outbound network requests from tools are checked against a curated list:

| Category | Domains |
|----------|---------|
| Research databases | `arxiv.org`, `api.semanticscholar.org`, `eutils.ncbi.nlm.nih.gov`, `api.crossref.org`, `doi.org` |
| Package registries | `registry.npmjs.org`, `pypi.org`, `cran.r-project.org` |
| Version control | `github.com`, `api.github.com`, `gitlab.com` |
| Documentation | `docs.python.org`, `devdocs.io` |

Users can add custom domains via config:

```jsonc
{
  "plugins": {
    "acaclaw-security": {
      "customAllowedDomains": [
        "my-university-api.edu"
      ]
    }
  }
}
```

---

## Audit & Logging

### What is logged

| Event type | Data captured |
|-----------|---------------|
| `tool_call` | Tool name, timestamp, workspace path, run ID |
| `tool_blocked` | Tool name, reason, matched pattern |
| `credential_scrubbed` | Count of patterns scrubbed (no credential values) |
| `injection_warning` | Matched pattern source (no user content) |
| `network_blocked` | Target domain, reason |

### What is NOT logged

- Message content (user-agent conversation)
- File contents (only paths)
- Credential values (only match count)
- Personal information

Logs are stored at `~/.acaclaw/audit/YYYY-MM-DD.jsonl` — outside the workspace, not exposed to AI tools. Default retention: 90 days.

---

## Comparison with OpenClaw Upstream

| Control | OpenClaw default | AcaClaw Standard | AcaClaw Maximum |
|---------|:-:|:-:|:-:|
| `workspaceOnly` | `false` | **`true`** | **`true`** |
| Tool deny-list | None | **15 tools denied** | **15 tools denied** |
| Command deny-list | None | **15 patterns** | **15 patterns** |
| Network allowlist | None | **Academic domains** | **`network: none`** |
| Pre-modification backup | None | **Automatic** | **Automatic** |
| Credential scrubbing | None | **12 patterns** | **12 patterns** |
| Audit logging | None | **Full audit** | **Full audit** |
| Docker sandbox | `off` | `off` | **`all`** |

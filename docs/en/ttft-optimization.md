---
layout: page
title: TTFT Optimization
lang: en
permalink: /en/ttft-optimization/
---

<!-- DESIGN-DOC: TTFT (Time-To-First-Token) optimization — strategies to reduce first-token latency from >10s to <5s -->

# TTFT Optimization Design

> **Goal**: Reduce perceived TTFT from **>9s** to **~1s** by streaming thinking tokens (first thinking token arrives at ~1.1s with full prompt). Separately, reduce total generation latency (first text token) to **< 5s**.
>
> **Status**: Thinking streaming implemented via AcaClaw gateway patch (`patches/openclaw-thinking-stream/apply.mjs`). Gateway now forwards `reasoning_content` deltas as `type: "thinking"` content blocks. Perceived TTFT is now the first thinking token (~533ms direct, ~3.2s gateway).
>
> Verified by `node scripts/test-ttft.mjs` (Direct API vs Gateway comparison in thinking mode).

---

## Table of Contents

- [Problem Statement](#problem-statement)
- [Current Measurements](#current-measurements)
- [Thinking Mode Impact](#thinking-mode-impact)
- [Root Cause Analysis](#root-cause-analysis)
- [System Prompt Breakdown](#system-prompt-breakdown)
- [Gateway Overhead Decomposition](#gateway-overhead-decomposition)
- [Optimization Strategies](#optimization-strategies)
  - [P0 — Prompt Trimming](#p0--prompt-trimming)
  - [P1 — Prompt Caching](#p1--prompt-caching)
  - [P2 — Lazy Tool Loading](#p2--lazy-tool-loading)
  - [P3 — Model Selection](#p3--model-selection)
  - [P4 — Streaming UX](#p4--streaming-ux)
- [Implementation Plan](#implementation-plan)
- [Success Criteria](#success-criteria)

---

## Problem Statement

Users experience **>9 seconds** of blank waiting after sending a chat message before seeing any response. The DashScope API actually returns the first thinking token in ~1.1s (with full 15K prompt), but OpenClaw does not stream thinking deltas — so the user sees nothing until text generation begins, 3–17s after thinking starts.

Two separate problems:
1. **Thinking tokens not streamed** — the #1 issue. The model's reasoning output is discarded during streaming, making the user wait for the full thinking phase to complete.
2. **High total generation latency** — 15,300-token system prompt adds ~6.2s of prefill time on every turn, compounded by non-functional prompt caching.

Current test results (qwen3.5-plus via DashScope, verified 2026-04-17):

| Test | First thinking token | First text token | Status |
|------|---------------------|-----------------|--------|
| Raw API (9 tokens, no thinking) | N/A | **522–726 ms** | **PASS** |
| Raw API (9 tokens, thinking) | **0.50–0.69s** | 2.87–4.46s | First thinking: **PASS** |
| Raw API (~15K tokens) | **0.60–0.69s** | 0.60–0.68s (no thinking) / 2.28–17.74s (thinking) | First thinking: **PASS** |
| Gateway chat (~15K tokens) | N/A (not streamed) | **8,990 ms** (median, 34 sessions) | **FAIL** |

### Thinking-mode comparison (verified 2026-04-18, `node scripts/test-ttft.mjs --runs=5`)

Direct API vs Gateway, both with `enable_thinking=true`, same prompt ("25+36=? just answer"):

| Metric | Direct API (median) | Gateway (median) | Overhead |
|--------|--------------------|-----------------|---------|
| TTFT (thinking) | **533ms** | **3.23s** | +2.70s (506%) |
| TTFT (text) | 4.59s | 3.97s | −617ms |
| Total | 4.60s | 4.04s | −566ms |

| Path | Thinking range | Text range | Total range |
|------|---------------|-----------|-------------|
| Direct API | 490ms–1.14s | 4.52s–4.85s | 4.55s–4.89s |
| Gateway | 2.57s–8.57s | 3.43s–9.30s | 3.50s–9.36s |

> **Key finding**: Gateway adds ~2.7s overhead to the first thinking token (system prompt injection + tool schema compilation + WebSocket routing). Once thinking starts, text TTFT and total time are comparable. The first gateway run consistently shows higher latency (cold start), stabilizing from run 2 onward.
>
> **Key finding**: Gateway text and total times are sometimes *faster* than direct API because the gateway's system prompt primes the model to answer more concisely, producing shorter thinking chains.

> **Key finding**: The raw DashScope API delivers the first thinking token in ~1.1s with 9,200 input tokens (0.55s with minimal prompt). Even with 15K tokens through the gateway, first thinking would arrive in ~1.4s — well within acceptable TTFT. The problem is entirely in OpenClaw's WebSocket layer not forwarding these tokens.
>
> **Key finding**: DashScope prompt caching is **NOT WORKING** — all sessions show 0 cached tokens.

---

## Current Measurements

### Token Usage (first message in fresh session)

| Token Type | Count | Source |
|------------|-------|--------|
| Input tokens | 14,997–15,433 | System prompt + user message |
| Cached tokens | **0 (always)** | DashScope caching NOT WORKING |
| Output tokens | 115–665 | Model response |

> Measured across 34 sessions. Input tokens are remarkably stable (~15,300 ± 200) because the system prompt is static.

### Latency Pipeline

```
Total TTFT: median ~8,990 ms (range 3,670–18,030 ms, 34 sessions)
├── Gateway overhead: ~260 ms (3%)  ← measured by profiler
│   ├── WS connect + message_received: ~33 ms
│   ├── Session creation + before_agent_reply: ~75 ms
│   ├── Model resolve + agent start: ~90 ms
│   └── Prompt build + llm_input: ~62 ms
│
├── DashScope API (9,200 tokens, no tools, thinking enabled):
│   ├── First thinking token: ~1,100 ms
│   └── First text token: ~2,300 ms (gap = ~1,200 ms thinking)
│
├── Tool schema overhead: ~6,200 extra tokens
│   └── Additional prefill: ~290 ms (est., 0.047 ms/token)
│
└── *** Variable thinking: ~2,450 ms (est.) ***  ← unaccounted
    └── Model thinks longer with full tool context vs raw API
    └── Highly variable: 1–17s depending on query complexity
    └── NOT streamed to user — appears as blank wait time
```

### TTFT Decomposition (measured via profiler + isolation test)

| Component | Median | Range | % of total |
|-----------|--------|-------|------------|
| Gateway overhead | 260 ms | 250–330 ms | 3% |
| DashScope first thinking token | 1,100 ms | 768–1,368 ms | 12% |
| Think → text gap (thinking gen) | 1,200 ms | 1,150–1,620 ms | 13% |
| Tool schema processing (est.) | 290 ms | — | 3% |
| Unaccounted (extra thinking + variance) | 6,140 ms | — | 68% |
| **Total (first TEXT token)** | **8,990 ms** | **3,670–18,030 ms** | |

However, thinking tokens ARE output — if they were streamed, the user would see the first thinking token in ~1.1s. See [Thinking Mode Impact](#thinking-mode-impact).

> **Key correction**: Earlier analysis attributed ~3s to "gateway overhead." Profiling revealed the gateway takes only ~260ms. The 3s difference between raw API and gateway was caused by (1) tool schemas adding ~6,200 extra input tokens, and (2) the model thinking longer with the full tool context.

> **Note**: The 160% variance in gateway TTFT at the same token count (3.67s–18.03s across 34 sessions) is primarily caused by variable-length thinking and DashScope server-side instability, not gateway processing.

### Gateway Overhead Profiling

> **Key finding**: Gateway overhead is only **~260ms** — verified by `node scripts/profile-gateway.mjs`. All hooks from `chat.send` to `llm_input` complete in 260ms. The remaining 5+ seconds is DashScope API time (prefill + thinking).

Profiler timeline (3 runs, consistent):

```
+0ms     chat.send (WebSocket)
+33ms    message_received, before_dispatch
+107ms   session.start, before_agent_reply
+200ms   before_model_resolve, before_agent_start
+260ms   before_prompt_build, llm_input (API request sent)
         ──── 5,200ms gap ──── (DashScope processing)
+5,300ms FIRST WS DELTA (first text token received)
```

| Gateway step | Time | Notes |
|---|---|---|
| WS → message dispatch | 33ms | WebSocket + routing |
| Session creation | 75ms | JSONL write, session lookup |
| Model resolve + agent start | 90ms | Config resolution |
| Prompt build + API call | 62ms | SOUL.md, workspace, skills, tool schemas |
| **Total gateway** | **~260ms** | |

The 5.2s gap is **entirely DashScope API** (prefill of ~15,400 tokens + thinking generation). Gateway adds only 3% to total TTFT.

**Implication**: There is no significant optimization opportunity in gateway code. The two priorities are:
1. **Stream thinking tokens** — perceived TTFT drops from ~5s to ~1.1s (first thinking token)
2. **Reduce input tokens** — fewer tokens = faster DashScope processing (but only ~0.047ms/token)

---

## Thinking Mode Impact

> **Key finding**: Thinking tokens are valid output and should count toward TTFT. The DashScope API returns the first thinking token in **~0.5–0.7s** even with a 15K-token prompt — excellent latency. The problem is that **OpenClaw does not stream thinking deltas via WebSocket**, so the user sees nothing until the first text token arrives 3–17s later.

### The problem

qwen3.5-plus is a reasoning model that generates "thinking" tokens before producing text. With `enable_thinking=true` (the default), the DashScope API streams two content types:

1. `reasoning_content` — thinking tokens (first one arrives in ~0.5–0.7s)
2. `content` — text tokens (arrives after thinking finishes, 2–17s later)

The DashScope API **does** stream thinking tokens — they arrive at the same low latency as text tokens (~0.5s TTFT). However, **OpenClaw silently discards them** and does not forward thinking deltas via WebSocket. The gateway only emits `chat` event deltas with `type: "text"` content, never `type: "thinking"`.

This means AcaClaw's thinking UI (collapsible block) only shows thinking content from the **final** message, not during streaming. The user waits 3–17s seeing nothing.

### AcaClaw UI fix (implemented)

Two bugs were fixed in `ui/src/views/chat.ts`:

1. **Field name mismatch**: The session stores thinking content in `{type: "thinking", thinking: "..."}` but the UI was reading `c.text` (always empty). Fixed to read `c.thinking ?? c.text`.
2. **History reload on completion**: After a `final` chat event, the UI now reloads history via `chat.history` to capture thinking content from the session. This makes thinking visible immediately after the response completes.

**Result**: Thinking content now displays correctly in the collapsible block after the response finishes.

### AcaClaw gateway patch (implemented)

Instead of waiting for an upstream OpenClaw fix, AcaClaw patches the gateway directly:

- **Patch**: `patches/openclaw-thinking-stream/apply.mjs` — adds `onReasoningStream` callback to the webchat reply handler in `gateway-cli-CWpalJNJ.js`
- **Mechanism**: The patch intercepts `reasoning_content` deltas from the LLM provider and broadcasts them as `{type: "thinking"}` content blocks via the WebSocket `chat` event
- **Throttle**: 100ms debounce to avoid flooding the WebSocket
- **Config**: `reasoningDefault: "stream"` set on all 6 agents in `config/openclaw-defaults.json`
- **UI**: `<details>` auto-opens with `?open` during streaming, collapses when done

**Result**: Full real-time thinking streaming. First thinking token visible in the UI within ~3.2s via gateway (vs ~533ms direct API). The 2.7s gap is gateway overhead (system prompt, tool schemas, WebSocket routing).

### Measured impact (raw DashScope API, `node scripts/test-thinking-comparison.mjs`)

| Metric | `enable_thinking=false` | `enable_thinking=true` |
|--------|------------------------|------------------------|
| First ANY token (TTFT if thinking is streamed) | 522–726ms | **0.49–0.69s** |
| First TEXT token (TTFT if thinking is hidden) | 522–726ms | 2.28–17.74s |
| Thinking chars generated | 0 | 158–1,148 |
| Total response time (minimal prompt) | 0.75–1.37s | 3.03–4.64s |
| Total response time (15K prompt) | 2.18–3.56s | 4.18–19.13s |

**Key insight**: The first thinking token arrives in **0.49–0.69s** — almost identical to the non-thinking TTFT. If OpenClaw streamed these tokens, users would see visible output (the thinking process) within 0.5–0.7s regardless of prompt size. The thinking output also helps users understand the model's reasoning.

The 160% TTFT variance (3.67–18.03s across 34 sessions) comes from variable thinking length (158–1,148 chars) and server-side load, but this only affects time-to-first-**text**-token. If thinking is visible, the perceived TTFT is stable at ~0.5–0.7s.

### Secondary issue: `thinkingDefault` config bug

OpenClaw's `thinkingDefault: "disabled"` setting does not actually disable thinking at the API level:

- OpenClaw records `thinkingLevel: off` in the session JSONL
- However, the stored JSONL **still contains thinking blocks** (200–350 chars) even with `thinkingLevel: off`
- The DashScope API `enable_thinking` parameter is apparently **not being forwarded**
- All 34 sessions across all time show `thinkingLevel: off` and ALL contain thinking content (158–1,148 chars)

```
Session    | thinkingLevel | Thinking chars | Output tokens | TTFT
57eb6533   | off           | 257            | 135           | 6.53s   ← config was "disabled"
162e8f4b   | off           | 217            | 111           | 3.78s   ← config was "disabled"
618ae919   | off           | 221            | 110           | 5.90s   ← config was "adaptive"
b7b02635   | off           | 536            | 302           | 5.57s   ← config was "adaptive"
```

This is a lower-priority issue: if thinking tokens are streamed (the P0 fix), thinking is actually desirable — it provides useful reasoning output. Fixing this bug is still useful for cases where users want to disable thinking to reduce total generation time and output token cost.

### TTFT with thinking streamed vs hidden

```
Current (thinking NOT streamed):
  Total TTFT (to first visible content): median ~8,990 ms
  ├── Gateway overhead: ~260 ms (dispatch, session, model resolve, prompt build)
  ├── DashScope prefill (15K tokens): ~1,100 ms
  ├── Thinking generation: ~4,560 ms (median, range 1–17s)
  └── User sees NOTHING during this entire time

With thinking streamed (upstream fix):
  TTFT (to first visible thinking token): ~1,100 ms  ← prefill + first thinking token
  ├── Gateway overhead: ~260 ms
  └── DashScope first thinking token: ~1,100 ms after request
      └── User sees thinking output while model reasons
```

Streaming thinking tokens would reduce perceived TTFT from **9.0s → ~1.1s** — an 8× improvement — without changing the model, prompt, or generation behavior.

### Thinking streaming status: IMPLEMENTED

~~**Priority: P0** — Stream thinking deltas via WebSocket~~ — **DONE** via AcaClaw gateway patch.

| Action | Perceived TTFT | Actual TTFT | Status |
|--------|---------------|-------------|--------|
| Stream thinking deltas (gateway patch) | **~3.2s** (gateway) / **~533ms** (direct) | unchanged | **✓ IMPLEMENTED** |
| Keep thinking hidden (before fix) | ~8,990 ms | ~8,990 ms | — |

The 3.2s gateway perceived TTFT (vs 533ms direct) is due to system prompt + tool schema overhead, not the patch. See [Thinking-mode comparison](#thinking-mode-comparison-verified-2026-04-18-node-scriptstest-ttftmjs---runs5).

### Secondary issue: `thinkingDefault` config bug

---

## Root Cause Analysis

The system prompt is **~15,300 tokens** (37,106 chars at 2.42 chars/token for the system prompt, plus ~6,200 tokens in tool schemas) — sent to the LLM on **every** chat turn. Gateway profiling confirms the gateway itself adds only **~260ms**. The vast majority of TTFT is DashScope API time: token prefill (~1.1s to first thinking token) plus thinking generation (1–17s, highly variable).

**The dominant factors are**:
1. **Thinking tokens not streamed** — the model starts thinking within ~1.1s, but OpenClaw only forwards text tokens. The user waits 5–18s seeing nothing. If thinking were streamed, perceived TTFT drops to ~1.1s.
2. **Variable thinking time** (~68% of TTFT) — the model's reasoning phase is unpredictable (1–17s), especially with complex prompts containing many tool schemas.
3. **DashScope caching failure** — if caching worked, token prefill would drop, reducing time-to-first-thinking-token.
4. **Token processing** (~15% of TTFT) — 15,300 tokens at ~0.047ms/token. Modest impact.
5. **Gateway overhead is negligible** (~3% of TTFT) — only 260ms. No optimization needed here.

The prompt is assembled by **OpenClaw's agent runner** (not AcaClaw) and contains:

1. **OpenClaw base** (~14,010 tokens — **92%**)
   - Tool definitions (JSON schemas for ~20+ built-in tools)
   - Skills (mandatory block: ~3,820 tokens)
   - System rules (safety, formatting, behavior)
   - Heartbeats, group chats, messaging rules
2. **AcaClaw plugins** (~1,290 tokens — **8%**)
   - Agent SOUL.md identity (~738 tokens)
   - Workspace context (~470 tokens)
   - Computing environment context (~330 tokens)
   - ⚠ SOUL.md injected twice (see below) — wastes ~450 tokens

---

## System Prompt Breakdown

### Verified token budget (~15,300 tokens total, 37,106 chars)

> Token ratio calibration: 37,106 chars ÷ 15,300 tokens = **2.42 chars/token** (Qwen tokenizer). Data from raw LLM input capture (`~/.acaclaw/logs/llm-input-YYYY-MM-DD.jsonl`).

| Component | Chars | Tokens (est.) | % of Total | Source | Can Trim? |
|-----------|-------|--------------|------------|--------|-----------|
| **Skills (mandatory)** | 9,243 | ~3,820 | **25%** | OpenClaw core | Yes — skill filter |
| **Tooling + call style** | 4,716 | ~1,949 | 13% | OpenClaw core | Yes — deny unused tools |
| **Heartbeats / groups / proactive** | 2,887 | ~1,193 | 8% | OpenClaw core | Partially (upstream) |
| **IDENTITY / USER / BOOTSTRAP** | 2,478 | ~1,024 | 7% | OpenClaw core | Partially |
| **Memory / sessions** | 1,767 | ~730 | 5% | OpenClaw core | No |
| **Reply / messaging** | 1,647 | ~681 | 4% | OpenClaw core | Partially |
| **TOOLS.md (local notes)** | 746 | ~308 | 2% | OpenClaw core | Yes — trim |
| **Other OpenClaw** (safety, docs, etc.) | 10,426 | ~4,305 | 28% | OpenClaw core | Partially |
| **SOUL.md (main agent)** | 1,786 | ~738 | 5% | AcaClaw | Partially — compress |
| **Workspace context** | 1,137 | ~470 | 3% | AcaClaw | Yes — summarize |
| **Computing environment** | 798 | ~330 | 2% | AcaClaw | Yes — omit if unused |
| **⚠ SOUL.md DUPLICATE** | ~1,098 | ~450 | 3% | AcaClaw (bug) | **Yes — remove** |
| **User message** | 141 | ~58 | <1% | User | No |
| **Session history** | 0 (fresh) | 0 | 0% | OpenClaw core | Compaction |
| **TOTAL** | **37,106** | **~15,300** | **100%** | | |

> **⚠ SOUL.md is injected TWICE**: Once in the agent personality section and again in the
> workspace files section (`/Users/.../AcaClaw/SOUL.md`). This wastes ~450 tokens.
> Removing the duplicate would save ~1.3% of input tokens.

### AcaClaw custom tools registered (8 total)

| Tool | Plugin | Can Deny? |
|------|--------|-----------|
| `workspace_info` | acaclaw-workspace | No — essential |
| `env_status` | acaclaw-academic-env | Yes |
| `backup_restore` | acaclaw-backup | Yes |
| `backup_list` | acaclaw-backup | Yes |
| `compat_check` | acaclaw-compat-checker | Yes |
| `event_log` | acaclaw-logger | Yes |
| `security_audit` | acaclaw-security | Yes |
| `security_status` | acaclaw-security | Yes |

### Key observations

1. **~92% of input tokens come from OpenClaw itself** (skills, tool schemas, system rules, heartbeats, etc.). AcaClaw only adds ~8% (~1,290 tokens).
2. **SOUL.md is injected twice** — agent personality section + workspace files. Wastes ~450 tokens.
3. **Skills mandatory block is the single largest section** — 9,243 chars, ~3,820 tokens (25% of total).
4. **DashScope prompt caching is NOT working** — 0 cached tokens across all 34 measured sessions.
5. **DashScope API has 160% TTFT variance** at the same token count (3.67s–18.03s across 34 sessions), indicating server-side instability.
6. **Denying 7 AcaClaw tools** would save ~1,400–1,750 tokens (~0.4s) but won't reach the 5s target alone.

---

## Optimization Strategies

### P0 — Prompt Trimming

**Expected reduction: 3,000–4,500 tokens → TTFT savings: ~1,350–2,025 ms**

These changes reduce token count without code changes.

#### 1. Skill-aware agent filtering

Only include skills relevant to the active agent. Currently all installed skills are included for every agent.

```json
// openclaw.json — already supported by OpenClaw
{
  "agents": {
    "list": [
      {
        "id": "main",
        "skillFilter": ["literature-review", "pubmed-edirect"]
      }
    ]
  }
}
```

**Impact**: If 6 skills × ~800 tokens each = 4,800 tokens → filter to 2 skills = 1,600 tokens. **Saves ~3,200 tokens**.

#### 2. Deny AcaClaw utility tools

Deny 7 AcaClaw-registered tools that aren't needed during chat:

```json
{
  "tools": {
    "deny": [
      "gateway", "cron", "sessions_spawn", "sessions_send",
      "mcp_install", "mcp_uninstall", "config_set",
      "backup_restore", "backup_list", "compat_check",
      "event_log", "security_audit", "security_status",
      "env_status"
    ]
  }
}
```

**Impact**: 7 AcaClaw tools × ~200–250 tokens each = **saves ~1,400–1,750 tokens** (~0.6–0.8s).

#### 3. Deny OpenClaw tools not needed for academic use

Deny OpenClaw built-in tools that academic agents rarely use:

```json
{
  "tools": {
    "deny": [
      "lsp_diagnostics", "lsp_references", "lsp_hover",
      "notebook_edit", "notebook_read"
    ]
  }
}
```

**Impact**: 5 tools × ~300–500 tokens = **saves ~1,500–2,500 tokens** (~0.7–1.1s).

#### 4. Compress agent SOUL.md

Current main SOUL.md is 1,786 chars (~447 tokens). Can be tightened:

```markdown
<!-- Before: 447 tokens -->
You are AcaClaw's main research assistant. You help researchers with 
literature review, data analysis, scientific writing, and computational 
experiments. You have deep expertise in...

<!-- After: 200 tokens -->
AcaClaw main assistant. Expertise: literature review, data analysis, 
scientific writing, computational experiments.
```

**Impact**: ~247 tokens per agent. Modest.

#### 5. Workspace context compression

Instead of sending the full directory tree, send a summary:

```
Workspace: ~/AcaClaw  (12 files, 3 dirs)
```

vs:

```
Workspace: ~/AcaClaw
├── documents/
│   ├── drafts/
│   │   └── aptamer_drugs_report.docx
│   └── papers/
│       └── ...
├── output/
│   └── aptamer_drugs_2026_review.md
└── ...
```

**Impact**: ~200–500 tokens saved.

---

### P1 — Prompt Caching

**Potential improvement: 2–4× on warm cache → TTFT ~2,500–3,500 ms**

#### DashScope (current provider) — VERIFIED NOT WORKING

DashScope (Alibaba Cloud Model Studio) claims **context caching** for Qwen models via OpenAI-compatible API. However, **testing shows 0 cached tokens across all 34 sessions**:

```
$ node scripts/test-ttft.mjs --history
  Caching: NONE — 0 cached tokens across all sessions
```

Possible reasons:
- DashScope may require explicit cache API calls (not automatic prefix matching)
- The `compatible-mode/v1` endpoint may not support caching
- System prompt may change slightly between requests (timestamps, workspace state)

**Action items:**
1. ~~Verify DashScope returns `cached_tokens` in the usage response~~ → **VERIFIED: always 0**
2. Investigate DashScope's explicit caching API (context_cache_id parameter)
3. Test with a provider that has verified prompt caching (OpenRouter, Anthropic)
4. Ensure AcaClaw sends **identical** system prompts — check for per-request variance in workspace context

#### Other providers

| Provider | Cold TTFT | Warm TTFT | Speedup |
|----------|-----------|-----------|---------|
| OpenRouter (MiniMax M2.7) | 9,579 ms | 2,247 ms | **4.3×** |
| Anthropic (Claude) | ~8,000 ms | ~2,000 ms | **4×** |
| DashScope (qwen3.5-plus) | 8,990 ms | **N/A (caching broken)** | **N/A** |

#### Deterministic session IDs (already implemented)

AcaClaw uses deterministic session IDs (`agent:main:web:main`) for default tabs, keeping the cache warm across page reloads. This only helps if the provider supports prefix caching AND the user stays on the same session.

---

### P2 — Lazy Tool Loading

**Expected reduction: 2,000–4,000 tokens → TTFT savings: ~1,500–3,000 ms**

Instead of including ALL tool schemas in the system prompt, use a two-pass approach:

#### Pass 1 — Lightweight tool index

Send only tool **names and one-line descriptions** (~50 tokens per tool instead of ~300):

```
Available tools: web_search (search the web), web_fetch (fetch a URL),
read (read a file), write (write a file), edit (edit a file),
bash (run a command), ...
```

#### Pass 2 — Full schema on demand

When the model calls a tool, include the full JSON schema for that tool in the next turn. This is a change to OpenClaw's agent runner (upstream contribution or plugin hook).

**Trade-off**: The model may make slightly worse tool-calling decisions without full schemas, especially for complex tools with many parameters.

**Alternative — categories**: Group tools into categories and include full schemas only for the category the user's query implies:

| Query mentions | Load tools |
|----------------|------------|
| "search", "find papers" | `web_search`, `web_fetch` |
| "write code", "run" | `bash`, `write`, `edit` |
| "read file", "show" | `read`, `list` |

---

### P3 — Model Selection

**Potential: 2–5× TTFT improvement**

Different models have different TTFT characteristics:

| Model | Provider | Raw TTFT (9 tokens) | Expected Gateway TTFT |
|-------|----------|--------------------|-----------------------|
| qwen3.5-plus | DashScope | 522–726 ms | 8,990 ms (measured) |
| qwen-plus | DashScope | ~1,500 ms | ~7,500 ms (est.) |
| qwen-turbo | DashScope | ~500 ms | ~3,000 ms (est.) |
| claude-3.5-haiku | Anthropic | ~300 ms | ~2,000 ms (est.) |
| gpt-4o-mini | OpenAI | ~400 ms | ~2,500 ms (est.) |

**Strategy**: Use a faster model for the **heartbeat/routing** phase, and optionally escalate to a larger model only for complex queries:

```json
{
  "agents": {
    "defaults": {
      "model": "modelstudio/qwen-turbo",
      "heartbeat": {
        "model": "modelstudio/qwen-turbo"
      }
    }
  }
}
```

**Trade-off**: Smaller/faster models may have lower reasoning quality.

---

### P4 — Streaming UX

**Perceived improvement, not actual TTFT reduction**

#### Typing indicator

Show a typing animation immediately after sending:

```
User: search aptamer drugs in recent 5 years
Assistant: ⠋ Thinking...  ← appears instantly
```

This doesn't reduce actual TTFT but reduces **perceived** wait time.

#### Stream thinking tokens — ✅ IMPLEMENTED

Thinking streaming is now implemented via AcaClaw's gateway patch (`patches/openclaw-thinking-stream/apply.mjs`). The gateway forwards `reasoning_content` deltas as `type: "thinking"` content blocks at 100ms throttle. The UI renders thinking in a collapsible `<details>` block that auto-opens during streaming.

**Measured result** (5 runs, `node scripts/test-ttft.mjs --runs=5`):
- Direct API first thinking token: **533ms** (range 490ms–1.14s)
- Gateway first thinking token: **3.23s** (range 2.57s–8.57s)
- Gateway overhead: **+2.7s** (system prompt + tool schemas + WebSocket routing)

This is the **most impactful TTFT optimization**: perceived TTFT dropped from ~9.0s (no thinking) to ~3.2s (first thinking token visible). Further reduction requires trimming the system prompt (Phase 1) or fixing prompt caching (Phase 2).

---

## Implementation Plan

### Phase 0: Stream thinking tokens — ✅ IMPLEMENTED

| Action | Perceived TTFT | Status |
|--------|---------------|--------|
| Stream thinking deltas via gateway patch | **~3.2s** (gateway) / **~533ms** (direct) | **✅ Done** |
| Fix `thinkingDefault: disabled` to pass `enable_thinking=false` | incidental fix | Open |

Perceived TTFT after Phase 0: **~3.2s** via gateway (first thinking token). Direct API achieves ~533ms.

### Phase 1: Quick wins (config changes, no code)

| Action | Token Savings | TTFT Impact |
|--------|--------------|-------------|
| Deny 7 AcaClaw utility tools | ~1,600 | −720 ms |
| Deny 5 OpenClaw unused tools (LSP, notebook) | ~2,000 | −900 ms |
| Add `skillFilter` to main agent | ~1,000 | −450 ms |
| Compress SOUL.md | ~250 | −110 ms |
| **Total** | **~4,850** | **~2,180 ms** |

Expected cold-cache TTFT after Phase 1: **~6,800 ms** (still above 5s)

> Note: These savings are modest because token processing is only ~15% of total TTFT. Gateway profiling confirmed that gateway code overhead is only ~260ms — the dominant cost is DashScope API time (prefill + thinking).
> DashScope prompt caching is NOT WORKING. Cannot rely on warm cache until fixed.

### Phase 1.5: Gateway overhead (confirmed negligible)

Gateway profiling (see [Gateway Overhead Profiling](#gateway-overhead-profiling)) confirmed that all gateway code (dispatch → session → model resolve → prompt build → llm_input) completes in **~260ms**. No code-level optimization of the gateway itself is needed — the 5.2s gap between `llm_input` and first text delta is 100% DashScope API time (token prefill + thinking generation).

**No action items for this phase.**

### Phase 2: Address DashScope variance (provider-side)

| Action | TTFT Impact | Trade-off |
|--------|------------|-----------|
| Investigate DashScope explicit cache API | −3,000–5,000 ms (warm) | May need API changes |
| Test Anthropic/OpenRouter with prompt caching | −5,000 ms (warm) | Different model |
| Use qwen-turbo for simple queries | −3,000 ms | Lower reasoning |
| **Total (switching provider)** | **−5,000 ms** | Different model/cost |

Expected TTFT with working cache: **~3,500–5,000 ms** (at or below target)

### Phase 3: Prompt compression (code changes, needs upstream)

| Action | Token Savings | TTFT Impact |
|--------|--------------|-------------|
| Lazy tool loading (upstream PR) | ~3,000 | −1,350 ms |
| Compress workspace context | ~200 | −90 ms |
| **Total** | **~3,200** | **~1,440 ms** |

Expected TTFT after Phase 1+3: **~5,360 ms** (cold cache, single provider)

### Priority assessment

**The biggest wins are (in order):**

1. ~~**Stream thinking tokens** (Phase 0)~~ — **✅ DONE.** Perceived TTFT dropped from ~9.0s to ~3.2s (gateway) via AcaClaw gateway patch. Direct API achieves ~533ms.
2. **Fix prompt caching** (Phase 2) — If DashScope caching worked, prefill time for the 15,300-token prompt would drop significantly. Currently 0 cached tokens across all sessions.
3. **Trim prompt / deny unused tools** (Phase 1) — Reduces token count by ~4,850, saving ~200–400ms of prefill time. Would also reduce gateway thinking TTFT overhead. Modest but easy wins (config-only).
4. **Lazy tool loading** (Phase 3, upstream) — Removes ~3,000 tool-schema tokens, saving ~140ms of prefill. Requires upstream PR.

> **Gateway overhead is NOT a bottleneck** (Phase 1.5) — Profiling confirmed only ~260ms. No code-level optimization needed.

---

## Success Criteria

| Metric | Threshold | Test | Current |
|--------|-----------|------|---------|
| Gateway TTFT — first thinking token | < 4,000 ms | `node scripts/test-ttft.mjs` | **3,230 ms ✓** (thinking now streamed) |
| Gateway TTFT — first text token | < 5,000 ms | Same test | **3,970 ms ✓** |
| Gateway overhead (pure) | < 500 ms | `node scripts/profile-gateway.mjs` | **260 ms ✓** |
| Direct API TTFT — first thinking token | < 1,000 ms | `node scripts/test-ttft.mjs` | **533 ms ✓** |
| Direct API TTFT — first text token | < 5,000 ms | Same test | **4,590 ms ✓** |
| Gateway thinking overhead | < 3,000 ms | `node scripts/test-ttft.mjs` (overhead) | **2,700 ms ✓** |
| Thinking streamed via WebSocket | `type: "thinking"` in deltas | Check chat event deltas | **✓ — via gateway patch** |
| Prompt caching active | cacheRead > 0 | Provider dashboard | **0 ✗** |
| Shell script TTFT | < 5,000 ms | `bash scripts/test-chat-latency.sh` | **10,000+ ms ✗** |

All TTFT tests use the **5-second threshold**. TTFT > 5s = test failure.

---

## Appendix: Measured Data

### Token usage from real session

```
Session: 15d01efe-af32-41ac-824e-12e8a54edd07
Model: modelstudio/qwen3.5-plus
Query: "search aptamer drugs in recent 5 years and write a report in word"

First response usage:
  input:      15,291 tokens
  cacheRead:  0 tokens
  cacheWrite: 0 tokens
  output:     590 tokens
```

### TTFT comparison: Direct API vs Gateway (thinking mode, 2026-04-18)

```
Direct API (enable_thinking=true, median of 5 runs):
  First thinking token:   533ms  (range 490ms–1.14s)
  First text token:     4,590ms  (range 4.52s–4.85s)
  Total:                4,600ms  (range 4.55s–4.89s)

Gateway (enable_thinking=true, median of 5 runs):
  First thinking token: 3,230ms  (range 2.57s–8.57s)
  First text token:     3,970ms  (range 3.43s–9.30s)
  Total:                4,040ms  (range 3.50s–9.36s)

Overhead (gateway − direct):
  Thinking TTFT: +2,700ms  (506% of direct)
  Text TTFT:      −617ms  (gateway text often faster — shorter thinking chains)
  Total:           −566ms  (comparable)
```

### Historical comparison: raw API vs gateway (pre-thinking-streaming)

```
Layer A — Raw API (no prompt):      679 ms  (16 tokens, median of 3 runs)
Layer B — Raw API + system prompt: 1,110 ms  (9,203 tokens, median of 3 runs)
Layer C — Gateway (full stack):    4,420 ms  (~15,400 tokens, median of 3 runs)
Gateway historical:                8,990 ms  (~15,300 tokens, median of 34 sessions)

Token overhead (B − A):   431ms for 9,187 extra tokens = 0.047ms/token
Token overhead (C − A): 3,741ms for ~15,384 extra tokens

Gateway profiling (profile-gateway.mjs, 3 runs):
  chat.send → llm_input:    ~260ms  (gateway code overhead)
  llm_input → first delta: ~5,200ms (DashScope API: prefill + thinking)
  Total gateway TTFT:      ~5,460ms

Conclusion: The apparent "3,030ms gateway overhead" from isolation test
(C − B − token processing) was a misattribution. The extra time in Layer C
vs Layer B is due to:
  1. ~6,200 additional tool-schema tokens (15,400 − 9,200)
  2. Model thinking longer with full tool context
  3. Actual gateway code overhead: only ~260ms
```

### Thinking vs non-thinking (raw DashScope API)

```
Minimal prompt (9 tokens):
  thinking=false: 0.55–0.70s first text  |  total 0.75–1.37s
  thinking=true:  2.87–4.46s first text  |  total 3.03–4.64s

Large prompt (~15K tokens):
  thinking=false: 0.60–0.68s first text  |  total 2.18–3.56s
  thinking=true:  2.28–17.74s first text |  total 4.18–19.13s
```

### Existing optimizations already in AcaClaw

- Deterministic session IDs (`agent:main:web:main`) — keeps provider cache warm
- Auth mode `"none"` — eliminates auth overhead (~5ms saved)
- Plugin load — startup only, not per-request

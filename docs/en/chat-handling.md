---
layout: page
title: Chat Handling
lang: en
permalink: /en/chat-handling/
---

> **Golden Rule**: OpenClaw owns all chat processing — message dispatch, model routing, response streaming, tool execution, and skill invocation. AcaClaw's UI is a thin WebSocket client that sends `chat.send` and renders the events it receives back.

---

## Table of Contents

- [Overview](#overview)
- [Message Flow](#message-flow)
- [Model Resolution](#model-resolution)
- [Response Streaming](#response-streaming)
- [Agentic Tool Calling](#agentic-tool-calling)
- [Skills Integration](#skills-integration)
- [Session and History](#session-and-history)
- [AcaClaw UI Integration](#acaclaw-ui-integration)
- [Chat Latency Analysis](#chat-latency-analysis)
- [Configuration Reference](#configuration-reference)

---

## Overview

When a user types a message in AcaClaw's chat, the entire processing pipeline lives inside OpenClaw's gateway. AcaClaw sends a single `chat.send` RPC over WebSocket and then listens for streaming events. The gateway handles:

1. **Input validation and sanitization** — null bytes, control characters, Unicode normalization
2. **Model resolution** — which LLM provider and model to use
3. **Media understanding** — image/link analysis if attachments are present
4. **Agent execution** — the Pi embedded runner orchestrates the LLM conversation
5. **Tool calling** — the agent can invoke tools (file ops, bash, MCP, skills) in a loop
6. **Response streaming** — tokens are emitted as WebSocket events in real time
7. **Session persistence** — the full transcript is saved for history

```
User types message
       │
       ▼
┌──────────────┐     WebSocket RPC      ┌──────────────────────┐
│  AcaClaw UI  │ ─── chat.send ───────▶ │  OpenClaw Gateway    │
│  (browser)   │                        │                      │
│              │ ◀── chat (delta) ───── │  ┌────────────────┐  │
│              │ ◀── chat (delta) ───── │  │ Agent Runner    │  │
│              │ ◀── tool events ────── │  │  ┌──────────┐  │  │
│              │ ◀── chat (final) ───── │  │  │ LLM API  │  │  │
└──────────────┘                        │  │  └──────────┘  │  │
                                        │  │  ┌──────────┐  │  │
                                        │  │  │ Tools    │  │  │
                                        │  │  └──────────┘  │  │
                                        │  │  ┌──────────┐  │  │
                                        │  │  │ Skills   │  │  │
                                        │  └──┴──────────┴──┘  │
                                        └──────────────────────┘
```

---

## Message Flow

### Step 1: Client Sends `chat.send`

AcaClaw's chat view sends a WebSocket RPC with these parameters:

```typescript
{
  sessionKey: "main:web:default",   // Agent + channel + contact
  message: "Analyze this protein structure",
  thinking?: "high",                // Optional thinking level
  deliver?: false,                  // Route to external channel?
  attachments?: [{                  // Optional files/images
    mimeType: "image/png",
    fileName: "structure.png",
    content: "base64..."
  }],
  idempotencyKey: "uuid-...",       // Deduplication
  timeoutMs?: 300000                // Override agent timeout
}
```

### Step 2: Gateway Acknowledges

The gateway immediately returns an acknowledgment with a `runId`:

```json
{ "runId": "abc123", "status": "started" }
```

This unblocks the UI — the actual processing happens asynchronously.

### Step 3: Dispatch Pipeline

The message flows through OpenClaw's dispatch pipeline:

| Stage | File | Purpose |
|---|---|---|
| **Validate and sanitize** | `server-methods/chat.ts` | Remove null bytes, normalize Unicode (NFC), parse attachments |
| **Dispatch inbound** | `auto-reply/dispatch.ts` | Route message to the correct reply handler |
| **Load session** | `auto-reply/reply/dispatch-from-config.ts` | Load session entry, trigger plugin inbound hooks |
| **Resolve model** | `agents/model-selection.ts` | Determine which LLM model to use (see [Model Resolution](#model-resolution)) |
| **Media understanding** | `media-understanding/apply.runtime.ts` | Analyze images/attachments if present |
| **Link understanding** | `link-understanding/apply.runtime.ts` | Fetch and summarize linked URLs if present |
| **Resolve directives** | `auto-reply/reply/get-reply-directives.ts` | Parse `/think`, `/model`, and other slash directives |
| **Run agent** | `agents/pi-embedded-runner/run/attempt.ts` | Execute the LLM conversation with tool loop |

### Step 4: Agent Execution

The Pi embedded runner:

1. Builds the **system prompt** (agent identity, workspace context, skill documentation)
2. Loads the **skills snapshot** (available skills for this agent and channel)
3. Creates the **tool bench** (file ops, bash, MCP tools, skill tools)
4. Calls `streamSimple()` from the Pi SDK to start LLM generation
5. Subscribes to session events (text deltas, tool calls, reasoning)
6. Enters the **tool loop** — if the LLM requests a tool call, execute it and feed the result back

### Step 5: Broadcast Response

Once the agent finishes:

- **`broadcastChatFinal()`** — sends the complete response to all connected clients
- **`broadcastChatError()`** — sends error details if the run failed
- **`broadcastSideResult()`** — sends supplementary results (e.g., "by the way" insights)

---

## Model Resolution

OpenClaw resolves the model through a priority chain. The first match wins:

| Priority | Source | Config Path | Example |
|---|---|---|---|
| 1 | **Heartbeat override** | `agents.defaults.heartbeat.model` | Lightweight model for keep-alive pings |
| 2 | **Session override** | Per-session `modelOverride` | User picked a model for this conversation |
| 3 | **Channel override** | `channels.<channel>.modelOverride` | Different model for Discord vs. web |
| 4 | **Agent default** | `agents.list[].model` | Agent-specific model |
| 5 | **Global default** | `agents.defaults.model` | Fallback for all agents |

### How AcaClaw Sets the Default Model

AcaClaw's API Keys page writes the default model to `agents.defaults.model` via the `config.set` RPC:

```typescript
// AcaClaw UI sets default model
gateway.call("config.set", {
  key: "agents.defaults.model",
  value: "openrouter/anthropic/claude-3.5-sonnet",
  baseHash: currentConfigHash
});
```

### Model Reference Format

All model references use the **`provider/model-id`** format:

```
openrouter/anthropic/claude-3.5-sonnet
anthropic/claude-opus-4-6
openai/gpt-4o
ollama/llama3
```

The provider prefix determines which API key and base URL to use.

### API Key Lookup

The gateway resolves API keys through auth profiles:

1. Check `models.providers.<provider>.apiKey` in config
2. Check environment variables (e.g., `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`)
3. Check credential store at `~/.openclaw/credentials/`

---

## Response Streaming

### Transport Protocol

OpenClaw streams responses over WebSocket using JSON frames:

```json
{
  "type": "event",
  "event": "chat",
  "payload": {
    "runId": "abc123",
    "sessionKey": "main:web:default",
    "seq": 42,
    "state": "delta",
    "message": {
      "content": [{ "type": "text", "text": "The protein structure..." }]
    }
  },
  "seq": 1337
}
```

### Event States

| State | Meaning | When |
|---|---|---|
| `"delta"` | Partial streaming token | Each token as the LLM generates it |
| `"final"` | Complete response | LLM finished generating |
| `"error"` | Run failed | API error, timeout, abort, etc. |

### Streaming Architecture

```
LLM API (Anthropic, OpenAI, etc.)
       │
       │  SSE / streaming response
       ▼
┌─────────────────────────┐
│  Pi SDK: streamSimple() │   Parses provider-specific stream format
│  @mariozechner/pi-ai    │   Normalizes to unified event model
└────────┬────────────────┘
         │
         │  session events: text_delta, text_start, text_end
         ▼
┌──────────────────────────────────────┐
│  subscribeEmbeddedPiSession()        │   Subscribes to session events
│  pi-embedded-subscribe.handlers.*.ts │   Processes deltas, reasoning, tools
└────────┬─────────────────────────────┘
         │
         │  emitAgentEvent({ stream: "assistant", data: { text, delta } })
         ▼
┌────────────────────────────┐
│  server-broadcast.ts       │   Broadcasts to all connected WS clients
│  broadcast("chat", payload)│   Scope-gated per client permissions
└────────┬───────────────────┘
         │
         │  WebSocket JSON frame
         ▼
┌─────────────────┐
│  AcaClaw UI     │   Appends delta text to the current message
│  chat.ts        │   Re-renders markdown in real time
└─────────────────┘
```

### Backpressure

The gateway checks `socket.bufferedAmount` before sending. If a client is slow:

- Events marked `dropIfSlow` are skipped (non-critical deltas)
- Critical events (final, error) are always delivered

### Side Results

During long-running agent tasks, the gateway may emit `chat.side_result` events — supplementary findings the agent discovers while working:

```json
{
  "type": "event",
  "event": "chat.side_result",
  "payload": {
    "kind": "btw",
    "runId": "abc123",
    "sessionKey": "main:web:default",
    "question": "Analyze this protein",
    "text": "By the way, this structure has an unusual beta-sheet fold...",
    "ts": 1711900000000
  }
}
```

---

## Agentic Tool Calling

### Tool Bench

When a chat run starts, OpenClaw assembles a **tool bench** — the set of tools the agent can call during this conversation turn. Tools are created by `createOpenClawCodingTools()`:

| Tool Category | Examples | Source |
|---|---|---|
| **File operations** | Read, write, edit, list, search | Built-in (sandboxed or host) |
| **Shell execution** | Bash commands with security gates | Built-in |
| **MCP tools** | Tools from Model Context Protocol servers | MCP plugin registry |
| **LSP tools** | Language Server Protocol operations | LSP plugin registry |
| **Skill tools** | Domain-specific skill functions | Skill snapshot |

### Tool Call Loop

The agent runs in a **generate-call-generate** loop:

```
┌─────────────────────────────────────────┐
│                                         │
│  1. LLM generates text                  │
│     │                                   │
│     ▼                                   │
│  2. LLM requests tool_use              │
│     { name: "bash", input: "ls -la" }  │
│     │                                   │
│     ▼                                   │
│  3. Before-tool-call hook runs          │
│     (validation, parameter adjustment)  │
│     │                                   │
│     ▼                                   │
│  4. Tool executes, returns result       │
│     │                                   │
│     ▼                                   │
│  5. Result appended to session          │
│     │                                   │
│     ▼                                   │
│  6. Session sent back to LLM           │
│     │                                   │
│     ▼                                   │
│  7. LLM continues (text or more tools) │
│     │                                   │
│     └───── Loop back to step 2 ────────┘
│              (or stop if LLM is done)
└─────────────────────────────────────────┘
```

### Tool Name Resolution

LLM providers sometimes mangle tool names (e.g., `toolsread3` instead of `functools.read`). OpenClaw has a normalization layer:

1. **`normalizeToolCallNameForDispatch()`** — maps provider-mangled names to canonical names
2. **`collectAllowedToolNames()`** — builds the allowlist of permitted tool names
3. **Fallback** — infers tool name from `toolCallId` if the name is ambiguous

### Before-Tool-Call Hook

Every tool call passes through `runBeforeToolCallHook()` before execution:

- Plugin-registered hooks can inspect and modify call parameters
- Security gates can block dangerous operations
- Parameters can be adjusted via `consumeAdjustedParamsForToolCall()`

### Tool Result Processing

After a tool returns its result:

| Processing Step | Purpose |
|---|---|
| **Truncation** | Caps oversized results to prevent context overflow |
| **Context guard** | Prevents tool results from breaking LLM parsing |
| **Transcript repair** | Fixes broken tool call/result pairing sequences |

### Tool Events on the Wire

Tool calls and results are broadcast as WebSocket events:

```json
{
  "type": "event",
  "event": "session.tool",
  "payload": {
    "runId": "abc123",
    "sessionKey": "main:web:default",
    "toolName": "bash",
    "toolCallId": "call_001",
    "input": { "command": "python analyze.py" },
    "state": "running"
  }
}
```

Then the result:

```json
{
  "type": "event",
  "event": "session.tool",
  "payload": {
    "runId": "abc123",
    "toolName": "bash",
    "toolCallId": "call_001",
    "output": "Analysis complete: 3 structures found",
    "state": "done"
  }
}
```

---

## Skills Integration

### What Are Skills?

Skills are domain-specific capabilities that extend the agent's knowledge and tool set. In AcaClaw, academic skills (literature search, citation formatting, data analysis) are pre-installed and configured.

### Skill Discovery

When a chat run starts, OpenClaw builds a **skill snapshot** — the complete set of available skills for this agent:

```
buildWorkspaceSkillSnapshot()
  → SkillSnapshot { entries: SkillEntry[] }

buildWorkspaceSkillsPrompt()
  → Formatted skill documentation for the system prompt

resolveSkillsPromptForRun(cfg, skillFilter)
  → Applied: agent + channel skill filters
```

### Skill Types

| Type | Source | Example |
|---|---|---|
| **Installed skills** | `~/.openclaw/skills/` or workspace | Literature search, citation tools |
| **Bundled skills** | Built into extensions | File analysis, web search |
| **MCP skills** | Model Context Protocol servers | External tool integrations |
| **LSP skills** | Language Server Protocol | Code intelligence |

### How Skills Are Invoked

Skills are exposed to the LLM as **tools** in the tool bench. The LLM decides when to call a skill based on the user's request and the skill documentation in the system prompt:

1. The system prompt includes skill documentation (name, description, parameters)
2. The user asks something that matches a skill's domain
3. The LLM calls the skill tool with appropriate parameters
4. The skill executes and returns results
5. The LLM incorporates the results into its response

### Skill Filtering

Not all skills are available in every context. Filtering is applied from multiple sources:

| Source | Config Path | Purpose |
|---|---|---|
| Agent config | `agents.<id>.skillFilter[]` | Restrict skills per agent |
| Channel config | `channels.<channel>.skillFilter[]` | Restrict skills per channel |
| Runtime override | Run-level `skillFilter` | Per-request filtering |

### Skill Environment

Skills can have environment-specific requirements. OpenClaw applies environment overrides:

```
applySkillEnvOverrides({ cfg, sessionKey, snapshot })
  → Sets skill-specific env vars (API keys, paths)
  → Per-skill auth without exposing to LLM prompt
```

AcaClaw's `academic-env` plugin manages Conda environments for skill dependencies (Python packages for data analysis, bioinformatics tools, etc.).

---

## Session and History

### Session Keys

Every conversation is identified by a **session key** with the format:

```
<agentId>:<channel>:<contactId>

Examples:
  main:web:default        — Default web chat with the main agent
  biologist:web:default   — Web chat with the biologist agent
  main:discord:@user123   — Discord DM with the main agent
```

### Session Storage

Sessions are persisted to disk:

```
~/.openclaw/agents/<agentId>/sessions/<sessionId>.jsonl
```

Each line in the JSONL file is a transcript entry (user message, assistant response, tool call, tool result).

### History Loading

When a chat session is opened, history is loaded with safety limits:

| Limit | Default | Purpose |
|---|---|---|
| Max messages | 200 | Prevent huge context windows |
| Hard max | 1,000 | Absolute ceiling |
| Per-message max | 128 KB | Skip oversized entries |
| Total budget | Configurable | Cap total bytes loaded |

### History Sanitization

Before sending history to the UI, OpenClaw sanitizes it:

- Strips internal directive tags (not meant for display)
- Truncates long text fields (12,000 chars per field)
- Removes inline image data (preserves metadata only)
- Validates usage tokens (must be finite numbers)
- Replaces oversized messages with placeholders

### Session Write Lock

Only one agent run can write to a session at a time. The `session-write-lock` mechanism prevents concurrent modifications with a timeout derived from the agent's configured timeout.

---

## AcaClaw UI Integration

### Sending Messages

AcaClaw's chat view (`ui/src/views/chat.ts`) sends messages through the gateway controller:

```typescript
// Send a chat message
gateway.call("chat.send", {
  sessionKey: this._currentSessionKey,
  message: userInput,
  thinking: this._thinkingLevel,
  idempotencyKey: crypto.randomUUID(),
});
```

### Receiving Streaming Events

The chat view subscribes to `chat` events on mount:

```typescript
this._cleanupChat = gateway.onNotification("chat", (data) => {
  this._handleChatEvent(data);
});
```

### Handling Event States

The `_handleChatEvent()` handler processes three states:

**Delta (streaming)** — Accumulates text into the current assistant message:

```typescript
if (d.state === "delta" && d.message) {
  const text = d.message.content
    ?.filter(c => c.type === "text")
    .map(c => c.text ?? "")
    .join("") ?? "";
  // Update the last assistant message with accumulated text
  if (last.role === "assistant") {
    last.content = text;
  }
}
```

**Final (complete)** — Replaces the streaming content with the final version:

```typescript
if (d.state === "final" && d.message) {
  // Extract final text, usage stats, model info
  // Scroll to bottom, update UI state
}
```

**Error** — Displays the error in the chat:

```typescript
if (d.state === "error") {
  // Show error message in chat bubble
}
```

### Rendering

AcaClaw renders chat messages with:

- **Markdown** — Full CommonMark rendering with syntax highlighting
- **Code blocks** — Language-aware highlighting with copy button
- **LaTeX** — KaTeX rendering for math equations
- **Tool calls** — Collapsible panels showing tool inputs and outputs
- **Thinking** — Expandable reasoning blocks (when thinking is enabled)

---

## Chat Latency Analysis

### First-Token Latency Pipeline

When a user sends a message, the time until the first visible response token (Time-To-First-Token, TTFT) is determined by a pipeline of sequential stages:

```
User sends "hi"
  │
  │  ① WebSocket roundtrip + auth
  │     (~20 ms)
  ▼
Gateway receives chat.send
  │
  │  ② Chat ACK returned to UI
  │     (~10 ms)
  ▼
Dispatch pipeline starts
  │
  │  ③ Agent startup: load session, resolve model,
  │     build system prompt, assemble tool bench
  │     (~500–1,300 ms)
  ▼
LLM API call begins
  │
  │  ④ Model processes input tokens and returns
  │     first streaming token
  │     (variable — depends on input token count)
  ▼
First delta event arrives at UI
```

### Measured Latency Breakdown

The following measurements were taken with **DeepSeek v3.1** via OpenRouter (provider: DeepInfra), on a localhost gateway with `auth.mode: "none"`.

#### Direct API Call (baseline)

Sending a bare 9-token request directly to OpenRouter, bypassing the gateway entirely:

| Metric | Value |
|---|---|
| Non-streaming TTFB | 787 ms |
| Non-streaming total | 1,597 ms |
| Streaming first SSE | 1,510 ms |
| Streaming total | 1,560 ms |

This establishes the **baseline model latency** — what the LLM takes with minimal input.

#### Gateway Chat (thinking=off)

Sending "What is 2+2?" via `chat.send` with thinking disabled:

| Stage | Duration | Cumulative |
|---|---|---|
| WS connect + auth | 22 ms | 22 ms |
| Chat ACK | 10 ms | 32 ms |
| Agent startup | 508 ms | 540 ms |
| **LLM processing (TTFT)** | **7,832 ms** | **8,372 ms** |
| Streaming + final | 208 ms | 8,580 ms |

Token usage reported by the gateway:

| Token Type | Count |
|---|---|
| New input tokens | 22 |
| Cached input tokens | 15,109 |
| Output tokens | 230 |
| **Total input** | **~15,131** |

#### Gateway Chat (adaptive thinking)

Same message with `thinkingDefault: "adaptive"`:

| Metric | Value |
|---|---|
| Total time | ~23,500 ms |
| Delta events | 0 |
| Response | Empty (model-specific issue with DeepSeek v3.1 + adaptive thinking via OpenRouter) |

### Where the Time Goes

The TTFT breakdown reveals a clear pattern:

```
Total TTFT: ~8,400 ms
  ├── Gateway overhead (WS + ACK + agent startup): ~540 ms  (6%)
  └── LLM API processing: ~7,800 ms                        (94%)
```

The **LLM API call dominates** — and the primary factor is the **~15,000 token system prompt** that OpenClaw sends with every request.

### System Prompt Composition

OpenClaw assembles a large system prompt for every chat turn. The system prompt includes:

| Component | Approximate Size | Source |
|---|---|---|
| **Agent identity** | ~200 tokens | Agent name, description, personality from `agents.list[]` |
| **Tool definitions** | ~3,000–5,000 tokens | JSON schemas for all available tools (file ops, bash, MCP, skills) |
| **Skill documentation** | ~4,000–8,000 tokens | Descriptions and parameters for installed skills |
| **Workspace context** | ~500–1,000 tokens | Current directory, environment, OS info |
| **Session history** | Variable | Previous turns in the conversation (up to 200 messages) |
| **Conversation rules** | ~500–1,000 tokens | Safety, formatting, response style directives |

With a fresh session and AcaClaw's default 6 academic skills + standard tool bench, the total system prompt is approximately **15,000 tokens**.

### Impact on TTFT

LLM providers must process the entire input (system prompt + user message) before generating the first output token. The relationship is roughly linear:

| Input Size | Expected TTFT (DeepSeek v3.1 via OpenRouter) |
|---|---|
| ~9 tokens (bare API) | ~800 ms |
| ~15,000 tokens (gateway) | ~8,000 ms |

The **10× increase in input tokens results in a ~10× increase in TTFT**. Provider-side **prompt caching** (shown as 15,109 cached tokens) helps reduce cost but has a limited effect on latency for the first request in a cache window.

### Gateway Overhead Breakdown

The non-LLM overhead within the gateway is relatively small:

| Component | Time | Notes |
|---|---|---|
| WebSocket connect | ~15 ms | Localhost, includes `connect.challenge` + `connect` handshake |
| Auth check | ~5 ms | `auth.mode: "none"` — minimal |
| Chat ACK | ~10 ms | Immediate acknowledgment returned to UI |
| Session load | ~50–100 ms | Load JSONL history from disk |
| Model resolution | ~5 ms | Walk the priority chain |
| System prompt assembly | ~200–500 ms | Build prompt, skill docs, tool bench |
| Skill snapshot | ~100–200 ms | Resolve available skills for this agent |
| **Total gateway overhead** | **~500–1,300 ms** | Varies by session size and skill count |

### Plugin Load Overhead

During gateway startup (not per-request), AcaClaw's 6 plugins are loaded. In testing, plugins were loaded **4+ times redundantly** during gateway initialization. This does not affect per-message latency but adds to cold-start time.

Observed startup timings:

| RPC | Duration |
|---|---|
| `config.get` | ~1,400 ms |
| `chat.history` | ~765 ms |
| `models.list` | ~750 ms |

### Optimization Strategies

To reduce TTFT, consider these approaches:

| Strategy | Expected Impact | Implementation |
|---|---|---|
| **Use a faster model** | High | Switch to a model with lower TTFT (e.g., Anthropic Haiku, GPT-4o-mini) |
| **Reduce skill count** | Medium | Use `agents.<id>.skillFilter[]` to limit skills per agent |
| **Minimize tool bench** | Medium | Disable unused tool categories (MCP servers, LSP) |
| **Use provider caching** | Medium | Anthropic and OpenAI support system prompt caching natively |
| **Shorter system prompt** | Medium | Trim agent description, reduce conversation rules |
| **Local model** | Variable | Ollama/vLLM eliminates network round-trip but depends on hardware |

---

## Configuration Reference

### Chat Behavior

```json
{
  "agents": {
    "defaults": {
      "model": "openrouter/anthropic/claude-3.5-sonnet",
      "thinkingDefault": "adaptive",
      "sandbox": { "mode": "off" },
      "heartbeat": {
        "model": "anthropic/claude-haiku"
      }
    }
  }
}
```

| Key | Type | Description |
|---|---|---|
| `agents.defaults.model` | string | Default LLM model for all agents |
| `agents.defaults.thinkingDefault` | string | Default thinking level: `"off"`, `"low"`, `"adaptive"`, `"high"` |
| `agents.defaults.sandbox.mode` | string | Sandbox mode: `"off"`, `"docker"`, `"podman"` |
| `agents.defaults.heartbeat.model` | string | Lightweight model for heartbeat/keep-alive |
| `agents.list[].model` | string | Per-agent model override |
| `channels.<channel>.modelOverride` | string | Per-channel model override |

### Session Configuration

| Key | Type | Description |
|---|---|---|
| Session store path | `~/.openclaw/agents/<id>/sessions/` | Where transcripts are saved |
| Max history messages | 200 (default) | Messages loaded per session |
| Typing interval | 6 seconds (default) | Typing indicator throttle |

### Streaming Limits

| Limit | Value | Purpose |
|---|---|---|
| Max buffered bytes | Per-client threshold | Backpressure control |
| Drop-if-slow | Boolean per event | Skip non-critical events for slow clients |
| Agent timeout | Configurable per agent | Maximum run duration |

---

## Related Documentation

- [Architecture](/en/architecture/) — System design and responsibility boundaries
- [Providers & Models](/en/providers-and-models/) — Provider configuration, model catalog, API keys
- [Skills](/en/skills/) — Academic skill catalog and installation
- [Web GUI](/en/desktop-gui/) — UI overview and navigation

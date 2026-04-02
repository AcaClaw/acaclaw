---
layout: page
title: Logging System
lang: en
permalink: /en/logging/
---

> AcaClaw's logging system — built entirely on OpenClaw's plugin hook API and logger infrastructure. Useful for both production activity tracking and development debugging. No re-implementation needed.

---

## Table of Contents

- [Overview](#overview)
- [What OpenClaw Already Provides](#what-openclaw-already-provides)
- [What AcaClaw Adds](#what-acaclaw-adds)
- [Architecture](#architecture)
- [OpenClaw Plugin Hooks Used](#openclaw-plugin-hooks-used)
- [Event Catalog](#event-catalog)
- [Log Format](#log-format)
- [Log Storage](#log-storage)
- [Log Rotation and Retention](#log-rotation-and-retention)
- [Configuration](#configuration)
- [UI Log Forwarding](#ui-log-forwarding)
- [Correlation and Tracing](#correlation-and-tracing)
- [Querying Logs](#querying-logs)
- [Log Access Points](#log-access-points)
- [Sensitive Data Handling](#sensitive-data-handling)
- [Implementation Plan](#implementation-plan)

---

## Overview

AcaClaw's logging is built on top of OpenClaw's existing infrastructure. OpenClaw already provides:

- A full `tslog`-based logging framework with daily rolling JSONL files
- 27 plugin hook events covering tool calls, chat messages, sessions, LLM I/O, model selection, and gateway lifecycle
- A `logs.tail` RPC for reading logs from the UI and CLI
- Sensitive data redaction (15 regex patterns for tokens, API keys, PEM blocks)
- Plugin logger API (`api.logger`) with subsystem tagging

AcaClaw adds one thin plugin (`acaclaw-logger`) that subscribes to OpenClaw's hooks via `api.on()` and writes structured JSONL event entries to `~/.acaclaw/logs/`. These logs serve two audiences:

- **Development**: debug plugin hook flows, trace RPC round-trips, inspect tool call timing, and reproduce issues during local development
- **Production**: track research activity, audit who used which model/tool, and provide post-hoc diagnostics

For UI-only events (connection lifecycle, API key changes), a browser-side `EventLogger` forwards entries to the gateway via RPC.

```
┌───────────────────────────────────────────────────────────────────┐
│  What OpenClaw provides (DO NOT re-implement)                     │
│                                                                   │
│  ├── tslog core logger ──────────────► /tmp/openclaw/openclaw-*.log│
│  │   (JSON, daily rolling, 500 MB cap, 24h prune)                │
│  ├── api.logger (plugin API) ────────► same gateway log file      │
│  ├── api.on() (27 hook events) ──────► tool, chat, session, LLM  │
│  ├── logs.tail RPC ──────────────────► query logs from UI/CLI     │
│  └── Redaction engine ───────────────► masks tokens, keys, PEM    │
│                                                                   │
│  What AcaClaw adds (thin layer)                                   │
│                                                                   │
│  ├── acaclaw-logger plugin ──────────► ~/.acaclaw/logs/events-*.jsonl│
│  │   (subscribes to api.on() hooks, writes JSONL)                │
│  ├── UI EventLogger ─────────────────► log.forward RPC to gateway │
│  │   (connection, auth, API key events from browser)             │
│  └── Security audit ─────────────────► ~/.acaclaw/security-audit/ │
│      (existing, unchanged)                                        │
└───────────────────────────────────────────────────────────────────┘
```

---

## What OpenClaw Already Provides

OpenClaw's gateway ships a complete logging stack. AcaClaw uses all of it — none of these need re-implementation.

### Core Logger (tslog)

| Aspect | Detail |
|---|---|
| Framework | `tslog` (TypeScript) |
| Levels | `fatal` → `error` → `warn` → `info` → `debug` → `trace` |
| File output | JSONL to `/tmp/openclaw/openclaw-YYYY-MM-DD.log` |
| Console output | TTY-aware colored, compact, or JSON modes |
| Size cap | 500 MB per file (configurable via `logging.maxFileBytes`) |
| Retention | 24h rolling prune |
| Config keys | `logging.level`, `logging.consoleLevel`, `logging.consoleStyle`, `logging.maxFileBytes` |
| Env override | `OPENCLAW_LOG_LEVEL=debug openclaw gateway run` |

### Plugin Logger API

Plugins receive `api.logger` at registration:

```typescript
type PluginLogger = {
  debug?: (message: string) => void;
  info:   (message: string) => void;
  warn:   (message: string) => void;
  error:  (message: string) => void;
};
```

Output goes to the same gateway log file, auto-prefixed with the plugin ID as subsystem.

### 27 Plugin Hook Events (api.on)

OpenClaw exposes a rich event subscription API to plugins. AcaClaw's logger plugin subscribes to these hooks — no custom event interception needed.

| Category | Hooks | What They Provide |
|---|---|---|
| **Tool calls** | `before_tool_call`, `after_tool_call`, `tool_result_persist` | Tool name, params, result, error, duration |
| **Chat/messages** | `message_received`, `message_sending`, `message_sent`, `before_dispatch` | Content, destination, success/error, cancel ability |
| **LLM I/O** | `llm_input`, `llm_output` | Provider, model, prompt, tokens, usage, thinking |
| **Model selection** | `before_model_resolve` | Prompt text, override ability |
| **Sessions** | `session_start`, `session_end`, `before_reset` | Session key, message count, duration |
| **Agent lifecycle** | `agent_end` | Success/error, duration |
| **Subagents** | `subagent_spawning`, `subagent_spawned`, `subagent_ended` | Run ID, reason, outcome |
| **Gateway** | `gateway_start`, `gateway_stop` | Port, shutdown signal |
| **Messages** | `before_message_write`, `inbound_claim` | Pre-write interception, inbound routing |
| **Compaction** | `before_compaction`, `after_compaction` | Token savings |
| **Prompt** | `before_prompt_build`, `before_agent_start` | System prompt injection |

Registration example:

```typescript
api.on("after_tool_call", async (event) => {
  await writeEvent({
    ts: new Date().toISOString(),
    event: "tool.complete",
    level: "info",
    source: "plugin",
    toolName: event.toolName,
    toolCallId: event.toolCallId,
    durationMs: event.durationMs,
    success: !event.error,
    error: event.error,
  });
});
```

### Log Query API

| Feature | Detail |
|---|---|
| RPC method | `logs.tail` — returns parsed log entries with level, subsystem, message, metadata |
| Parameters | `lines` (1–5000), `cursor` (byte offset), `maxBytes` (1–1 MB) |
| CLI | `openclaw logs --follow`, `openclaw logs --json`, `openclaw logs --plain` |
| Control UI | Logs tab polls `logs.tail` every 5s with level filtering, search, auto-follow |

### Sensitive Data Redaction

| Feature | Detail |
|---|---|
| Config | `logging.redactSensitive` (`off` or `tools`), `logging.redactPatterns` |
| Default patterns | 15 regex: Bearer headers, `sk-*`, `ghp_*`, `xox*`, `AIza*`, PEM blocks, ENV-style `KEY=value` |
| Masking | Keep first 6 + last 4 chars (≥18 length), else `***` |

---

## What AcaClaw Adds

Following the golden rule (*if OpenClaw provides it, use it*), AcaClaw adds only what's missing:

1. **Event journal writer** — A thin `acaclaw-logger` plugin that subscribes to OpenClaw hooks via `api.on()` and appends JSONL entries to `~/.acaclaw/logs/events-YYYY-MM-DD.jsonl`
2. **UI log forwarding** — A browser-side `EventLogger` that buffers UI-only events (connection, auth, API key changes) and forwards them to the gateway via `log.forward` RPC
3. **Event journal pruning** — Daily file cleanup (30-day default retention)
4. **Event journal query tool** — An agent tool for querying event journal files (extends the security audit pattern)

The security audit log (`~/.acaclaw/security-audit/`) remains unchanged.

---

## Architecture

The `acaclaw-logger` plugin is a pure observer — it subscribes to OpenClaw's existing hooks and writes entries. No new event systems, no custom interceptors.

```
┌──────────────────────────────────────────────────────────────────┐
│  OpenClaw Gateway Process                                        │
│                                                                  │
│  Core hooks fire automatically:                                  │
│  ├── before_tool_call ──┐                                        │
│  ├── after_tool_call ───┤                                        │
│  ├── llm_input ─────────┤                                        │
│  ├── llm_output ────────┤       acaclaw-logger plugin            │
│  ├── session_start ─────┼──────► api.on() subscriptions          │
│  ├── session_end ───────┤       └── writeEvent() ───────────────►│
│  ├── message_sent ──────┤            │                           │
│  ├── gateway_start ─────┤            ▼                           │
│  └── ... (27 hooks) ────┘   ~/.acaclaw/logs/events-*.jsonl       │
│                                                                  │
│  log.forward RPC ◄──── AcaClaw UI (browser)                     │
│  └── writeEvent() ─────► same JSONL file                         │
│      (connection, auth, API key events from browser)             │
└──────────────────────────────────────────────────────────────────┘
```

### Plugin Registration

```typescript
export default function register(api: OpenClawPluginApi) {
  const journal = new EventJournal(api);

  // Tool events — via OpenClaw hooks
  api.on("before_tool_call", (event) => journal.write("tool.invoke", "info", {
    toolName: event.toolName, toolCallId: event.toolCallId,
  }));
  api.on("after_tool_call", (event) => journal.write("tool.complete", "info", {
    toolName: event.toolName, toolCallId: event.toolCallId,
    durationMs: event.durationMs, success: !event.error, error: event.error,
  }));

  // LLM events — via OpenClaw hooks
  api.on("llm_input", (event) => journal.write("chat.stream_start", "info", {
    model: event.model, provider: event.provider,
  }));
  api.on("llm_output", (event) => journal.write("chat.stream_end", "info", {
    model: event.model, durationMs: event.durationMs,
    tokenCount: event.usage?.totalTokens,
  }));

  // Session events — via OpenClaw hooks
  api.on("session_start", (event) => journal.write("session.start", "info", {
    sessionKey: event.sessionKey, agentId: event.agentId,
  }));
  api.on("session_end", (event) => journal.write("session.end", "info", {
    sessionKey: event.sessionKey, durationMs: event.durationMs,
    messageCount: event.messageCount,
  }));

  // Gateway lifecycle — via OpenClaw hooks
  api.on("gateway_start", () => journal.write("gateway.start", "info", {}));
  api.on("gateway_stop", () => journal.write("gateway.stop", "info", {}));

  // Model selection — via OpenClaw hooks
  api.on("before_model_resolve", (event, ctx) =>
    journal.write("model.resolve", "info", { prompt: undefined }),
  );

  // UI-forwarded events (connection, auth, API keys)
  api.registerGatewayMethod("log.forward", async (params) => {
    const { entries } = params as { entries: EventEntry[] };
    for (const entry of entries.slice(0, 100)) {
      if (!entry.ts || !entry.event) continue;
      entry.source = "ui"; // Force — never trust client
      await journal.writeRaw(entry);
    }
    return { ok: true };
  });

  // Prune old logs on startup
  journal.pruneOldFiles();
}
```

---

## OpenClaw Plugin Hooks Used

The acaclaw-logger plugin subscribes to these OpenClaw hooks. No custom event infrastructure needed — OpenClaw fires these automatically.

### Server-Side Events (from api.on hooks)

| OpenClaw Hook | AcaClaw Event | What Gets Logged |
|---|---|---|
| `before_tool_call` | `tool.invoke` | Tool name, params summary, tool call ID |
| `after_tool_call` | `tool.complete` / `tool.error` | Tool name, duration, success/error |
| `llm_input` | `chat.stream_start` | Provider, model name |
| `llm_output` | `chat.stream_end` | Model, duration, token count |
| `before_model_resolve` | `model.resolve` | Prompt context (no content) |
| `session_start` | `session.start` | Session key, agent ID |
| `session_end` | `session.end` | Session key, duration, message count |
| `message_sent` | `chat.delivered` | Destination, success/error |
| `agent_end` | `agent.end` | Success/error, duration |
| `gateway_start` | `gateway.start` | Port |
| `gateway_stop` | `gateway.stop` | — |
| `subagent_spawned` | `subagent.start` | Run ID, agent ID |
| `subagent_ended` | `subagent.end` | Run ID, outcome |

### Client-Side Events (from UI via log.forward RPC)

These events happen only in the browser and must be forwarded:

| AcaClaw Event | UI Trigger | What Gets Logged |
|---|---|---|
| `connection.open` | WebSocket opens | Connection ID |
| `connection.connected` | Handshake succeeds | Connection ID, latency |
| `connection.failed` | Handshake fails | Connection ID, reason |
| `connection.disconnected` | WebSocket closes | Connection ID, code, duration |
| `connection.reconnect` | Auto-reconnect | Attempt number, backoff |
| `auth.success` | Auth accepted | Auth mode |
| `auth.failure` | Auth rejected | Auth mode, reason |
| `chat.send` | User sends message | Agent ID, message length |
| `model.selected` | User picks model | Model, provider, previous |
| `agent.switch` | User switches agent | From/to agent |
| `apikey.added` | Key configured | Provider name (never the key) |
| `apikey.removed` | Key removed | Provider name |
| `skill.install` | Skill installed | Skill name, source |
| `config.change` | Setting changed | Config key (never values) |

---

## Event Catalog

### Connection Events

| Event | Trigger | Fields |
|---|---|---|
| `connection.open` | WebSocket opens | `connId` |
| `connection.challenge` | Gateway sends challenge | `connId`, `nonce` |
| `connection.connected` | Handshake succeeds | `connId`, `latencyMs` |
| `connection.failed` | Handshake fails | `connId`, `reason` |
| `connection.disconnected` | WebSocket closes | `connId`, `code`, `reason`, `durationMs` |
| `connection.reconnect` | Auto-reconnect attempt | `attempt`, `backoffMs` |

### Authentication Events

| Event | Trigger | Fields |
|---|---|---|
| `auth.success` | Auth mode accepts connection | `mode`, `connId` |
| `auth.failure` | Auth mode rejects connection | `mode`, `connId`, `reason` |
| `auth.rate_limited` | Too many failures | `connId`, `lockoutMs` |

### Chat Events

| Event | Trigger | Fields |
|---|---|---|
| `chat.send` | User sends message | `agentId`, `sessionKey`, `messageLength`, `hasAttachments` |
| `chat.stream_start` | Streaming response begins | `agentId`, `sessionKey`, `model` |
| `chat.stream_end` | Streaming response completes | `agentId`, `sessionKey`, `model`, `durationMs`, `tokenCount` |
| `chat.error` | Chat request fails | `agentId`, `sessionKey`, `error` |

### Model Events

| Event | Trigger | Fields |
|---|---|---|
| `model.selected` | User picks a model | `agentId`, `model`, `provider`, `previousModel` |
| `model.fallback` | Fallback model activated | `agentId`, `failedModel`, `fallbackModel`, `reason` |

### Agent & Tool Events

| Event | Trigger | Fields |
|---|---|---|
| `tool.invoke` | Tool call starts | `agentId`, `sessionKey`, `toolName`, `toolCallId` |
| `tool.complete` | Tool call finishes | `agentId`, `toolCallId`, `toolName`, `durationMs`, `success` |
| `tool.error` | Tool call fails | `agentId`, `toolCallId`, `toolName`, `error` |
| `agent.switch` | User switches active agent | `fromAgent`, `toAgent` |

### Skill Events

| Event | Trigger | Fields |
|---|---|---|
| `skill.install` | Skill installation starts | `skillName`, `source` |
| `skill.installed` | Skill installation completes | `skillName`, `source`, `success` |
| `skill.activate` | Skill enabled for agent | `skillName`, `agentId` |
| `skill.deactivate` | Skill disabled for agent | `skillName`, `agentId` |

### Config Events

| Event | Trigger | Fields |
|---|---|---|
| `config.change` | Config value modified | `key`, `source` |
| `config.reload` | Gateway hot-reloads config | `changedKeys`, `mode` |
| `config.restart` | Gateway restarts for config | `changedKeys` |

### API Key Events

| Event | Trigger | Fields |
|---|---|---|
| `apikey.added` | API key configured | `provider` |
| `apikey.removed` | API key removed | `provider` |
| `apikey.validated` | API key test succeeds | `provider`, `latencyMs` |
| `apikey.invalid` | API key test fails | `provider`, `error` |

### Workspace Events

| Event | Trigger | Fields |
|---|---|---|
| `workspace.create` | Workspace initialized | `path` |
| `workspace.open` | Workspace opened in UI | `path` |
| `workspace.file.upload` | File uploaded to workspace | `filename`, `sizeBytes` |

### Backup Events

| Event | Trigger | Fields |
|---|---|---|
| `backup.create` | Backup snapshot created | `backupId`, `sizeBytes`, `fileCount` |
| `backup.restore` | Backup restored | `backupId`, `targetPath` |

### Session Events

| Event | Trigger | Fields |
|---|---|---|
| `session.start` | New chat session created | `sessionKey`, `agentId` |
| `session.end` | Chat session closed | `sessionKey`, `agentId`, `durationMs`, `messageCount` |

---

## Log Format

Every event journal entry is a single-line JSON object (JSONL):

```json
{
  "ts": "2026-04-01T14:23:45.678Z",
  "event": "chat.send",
  "level": "info",
  "source": "ui",
  "traceId": "a1b2c3d4",
  "agentId": "main",
  "sessionKey": "agent:main:web:session-xyz",
  "messageLength": 142,
  "hasAttachments": false
}
```

### Required Fields

| Field | Type | Description |
|---|---|---|
| `ts` | string (ISO 8601) | Event timestamp |
| `event` | string | Event name from the catalog (e.g., `chat.send`) |
| `level` | string | Severity: `debug`, `info`, `warn`, `error` |
| `source` | string | Where the event originated: `ui`, `plugin`, `gateway`, `script` |

### Optional Fields

| Field | Type | Description |
|---|---|---|
| `traceId` | string | Correlation ID linking related events across a user action |
| `agentId` | string | Agent involved (e.g., `main`, `biologist`) |
| `sessionKey` | string | Chat session identifier |
| `connId` | string | WebSocket connection identifier |
| `durationMs` | number | Operation duration in milliseconds |
| `error` | string | Error message (for failure events) |
| `...` | varies | Event-specific fields from the catalog above |

### Level Assignment

| Level | Used For |
|---|---|
| `debug` | Heartbeat pongs, reconnect attempts, config reload details |
| `info` | Connection established, chat sent/received, tool invoked, model selected |
| `warn` | Auth failure, tool error, fallback model activated, rate limiting |
| `error` | Connection failed, chat error, tool crash, config invalid |

---

## Log Storage

### Directory Layout

```
~/.acaclaw/
├── logs/
│   ├── events-2026-04-01.jsonl    ← Event journal (today)
│   ├── events-2026-03-31.jsonl    ← Event journal (yesterday)
│   └── events-2026-03-30.jsonl    ← Event journal (2 days ago)
│
├── security-audit/                ← Existing security plugin
│   ├── 2026-04-01.jsonl
│   └── 2026-03-31.jsonl
│
├── gateway.log                    ← Gateway stdout/stderr (existing)
└── startup-timing.log             ← Startup milestones (existing)
```

### Write Pattern

```typescript
import { appendFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";

const LOG_DIR = join(homedir(), ".acaclaw", "logs");

async function writeEvent(entry: EventEntry): Promise<void> {
  const date = entry.ts.slice(0, 10); // YYYY-MM-DD
  const logPath = join(LOG_DIR, `events-${date}.jsonl`);
  await mkdir(dirname(logPath), { recursive: true });
  await appendFile(logPath, JSON.stringify(entry) + "\n", "utf-8");
}
```

This mirrors the existing `writeAuditEntry` pattern from the security plugin.

---

## Log Rotation and Retention

| Parameter | Default | Config Key |
|---|---|---|
| Rotation | Daily (file-per-day, automatic) | — |
| Event journal retention | 30 days | `logging.eventRetentionDays` |
| Security audit retention | 90 days | `logging.securityRetentionDays` |
| Max file size | 100 MB per day file | `logging.maxEventFileMB` |
| Prune schedule | On gateway startup + daily at midnight | — |

### Pruning Logic

```
On gateway startup:
  1. List files in ~/.acaclaw/logs/ matching events-*.jsonl
  2. Parse date from filename
  3. Delete files older than retentionDays
  4. Log pruned count to api.logger.info
```

### Size Cap Behavior

If a daily file exceeds `maxEventFileMB`:
1. Log a warning to `api.logger.warn`
2. Stop appending to the current file
3. Resume logging at the next date rollover

---

## Configuration

Add a `logging` section to the AcaClaw config template (`config/openclaw-defaults.json`):

```json
{
  "logging": {
    "eventJournal": {
      "enabled": true,
      "level": "info",
      "retentionDays": 30,
      "maxEventFileMB": 100,
      "forwardFromUi": true
    }
  }
}
```

| Key | Type | Default | Description |
|---|---|---|---|
| `eventJournal.enabled` | boolean | `true` | Enable/disable the event journal |
| `eventJournal.level` | string | `"info"` | Minimum level written to journal (`debug`, `info`, `warn`, `error`) |
| `eventJournal.retentionDays` | number | `30` | Days to keep event log files |
| `eventJournal.maxEventFileMB` | number | `100` | Max size per daily file in MB |
| `eventJournal.forwardFromUi` | boolean | `true` | Accept log.forward RPC from UI clients |

### OpenClaw Gateway Logging (Unchanged)

OpenClaw's own logging config remains respected:

```json
{
  "logging": {
    "level": "info",
    "consoleLevel": "info",
    "consoleStyle": "pretty",
    "maxFileBytes": 500000000
  }
}
```

AcaClaw does not override these — they control the operational log at `~/.openclaw/tmp/openclaw.log`.

---

## UI Log Forwarding

The AcaClaw UI runs in the browser where files cannot be written directly. UI events are forwarded to the gateway via WebSocket RPC.

### Client-Side: EventLogger

```typescript
class EventLogger {
  private _buffer: EventEntry[] = [];
  private _flushTimer: ReturnType<typeof setInterval>;
  private _gateway: GatewayController;

  constructor(gateway: GatewayController) {
    this._gateway = gateway;
    // Flush every 5 seconds or when buffer reaches 50 events
    this._flushTimer = setInterval(() => this._flush(), 5_000);
  }

  log(event: string, level: string, fields: Record<string, unknown>) {
    this._buffer.push({
      ts: new Date().toISOString(),
      event,
      level,
      source: "ui",
      ...fields,
    });
    if (this._buffer.length >= 50) this._flush();
  }

  private async _flush() {
    if (this._buffer.length === 0) return;
    const batch = this._buffer.splice(0);
    try {
      await this._gateway.call("log.forward", { entries: batch });
    } catch {
      // Re-queue on failure (will retry next interval)
      this._buffer.unshift(...batch);
    }
  }

  dispose() {
    clearInterval(this._flushTimer);
    this._flush(); // Best-effort final flush
  }
}
```

### Server-Side: log.forward RPC Handler

Register via plugin API:

```typescript
api.registerMethod("log.forward", async (params) => {
  const { entries } = params as { entries: EventEntry[] };
  for (const entry of entries) {
    // Validate and sanitize before writing
    if (!entry.ts || !entry.event) continue;
    entry.source = "ui"; // Force — never trust client source claim
    await writeEvent(entry);
  }
  return { ok: true, accepted: entries.length };
});
```

### Security Constraints

| Rule | Reason |
|---|---|
| `source` field is always overwritten to `"ui"` | Prevent spoofing plugin/gateway events |
| Max batch size: 100 entries | Prevent memory exhaustion |
| Max entry size: 4 KB | Prevent log injection with huge payloads |
| Rate limit: 200 entries/minute per connection | Prevent log flooding |
| No sensitive fields forwarded | API keys, tokens never included |

---

## Correlation and Tracing

### Trace IDs

A trace ID links related events across a single user action. For example, when a user sends a chat message:

```
traceId: "t-a1b2c3d4"

chat.send          (source: ui)       ← User clicks send
chat.stream_start  (source: plugin)   ← Gateway starts streaming
tool.invoke        (source: plugin)   ← Model calls a tool
tool.complete      (source: plugin)   ← Tool returns result
chat.stream_end    (source: plugin)   ← Response complete
```

### Trace ID Generation

- UI generates `traceId` with `crypto.randomUUID().slice(0, 8)` (8 chars)
- Passed to gateway via the chat RPC params
- Gateway propagates to tool hooks and streaming events

### Connection ID

- `connId` is assigned by the gateway on WebSocket upgrade
- Included in all connection lifecycle events
- Useful for correlating connect → auth → chat within one session

---

## Querying Logs

### Command Line

```bash
# Today's events
cat ~/.acaclaw/logs/events-$(date +%Y-%m-%d).jsonl | jq .

# All chat events today
cat ~/.acaclaw/logs/events-$(date +%Y-%m-%d).jsonl | jq 'select(.event | startswith("chat."))'

# Failed auth attempts
grep '"auth.failure"' ~/.acaclaw/logs/events-*.jsonl | jq .

# Tool invocations for a specific agent
cat ~/.acaclaw/logs/events-*.jsonl | jq 'select(.event == "tool.invoke" and .agentId == "biologist")'

# Events in a trace
cat ~/.acaclaw/logs/events-$(date +%Y-%m-%d).jsonl | jq 'select(.traceId == "a1b2c3d4")'

# Connection durations
cat ~/.acaclaw/logs/events-*.jsonl | jq 'select(.event == "connection.disconnected") | {ts, durationMs}'
```

### Agent Tool

Extend the existing `security_audit` tool pattern to a general `event_log` tool:

```
Tool: event_log
Parameters:
  date: "2026-04-01"          (optional, default: today)
  event: "chat.*"             (optional, glob filter)
  level: "warn"               (optional, minimum level)
  agentId: "main"             (optional, agent filter)
  limit: 100                  (optional, max results)
```

### UI Log Viewer

The existing **Settings → Logs** tab in AcaClaw already renders gateway logs. Extend it to also display event journal entries with filtering by event type, level, and agent.

---

## Log Access Points

There are four places to view logs. The OpenClaw Control UI is accessed from inside the AcaClaw GUI — there is no separate app to install.

### Access Map

```
AcaClaw UI (http://localhost:2090/)
│
├── Settings → Logs tab              ← AcaClaw event journal + gateway log viewer
│
├── Settings → OpenClaw tab           ← Opens OpenClaw Control UI in new tab
│       │
│       └── http://localhost:2090/openclaw/
│           └── Logs tab              ← OpenClaw gateway operational logs
│               (polls logs.tail RPC, level filtering, search, auto-follow)
│
└── Command palette (Ctrl+K)          ← No shortcut for OpenClaw Control UI
```

### 1. AcaClaw Settings → Logs Tab

| What | AcaClaw event journal entries + gateway log tail |
|---|---|
| Path | Open AcaClaw UI → click **Settings** in the sidebar → click **Logs** tab |
| Data source | Reads `~/.acaclaw/logs/events-*.jsonl` (event journal) and `logs.tail` RPC (gateway log) |
| Features | Filter by event type, level, agent; search; auto-follow |

### 2. OpenClaw Control UI → Logs Tab

The OpenClaw Control UI is the full gateway admin panel. AcaClaw provides access to it from the Settings page:

| What | OpenClaw gateway operational logs |
|---|---|
| Path | Open AcaClaw UI → click **Settings** in the sidebar → click **OpenClaw** tab |
| Behavior | The OpenClaw tab does **not** render inline — it opens `http://localhost:2090/openclaw/` in a new browser tab via `window.open` |
| Then | In the Control UI, click the **Logs** tab to view gateway logs |
| Data source | `logs.tail` RPC (same gateway log file at `/tmp/openclaw/openclaw-*.log`) |
| Features | Level filtering, full-text search, auto-follow, 5-second poll interval |

The mechanism (`_openOpenClawUI()` in `ui/src/views/settings.ts`):

```typescript
// When the user clicks the "OpenClaw" settings tab:
if (tab === "openclaw") {
  this._openOpenClawUI();  // opens new window instead of rendering a panel
}

private _openOpenClawUI() {
  window.open(`${location.origin}/openclaw/`, "_blank", "noopener");
}
```

`noopener` prevents the new tab from accessing the AcaClaw window object.

### 3. Command Line

See [Querying Logs → Command Line](#command-line) above for `jq` examples.

### 4. Agent Tool

See [Querying Logs → Agent Tool](#agent-tool) above for the `event_log` tool.

> For the full explanation of how AcaClaw launches the OpenClaw GUI, see [App Launch and Gateway Connection → Launching the OpenClaw GUI from AcaClaw](/en/auth-and-app-launch/#launching-the-openclaw-gui-from-acaclaw).

---

## Sensitive Data Handling

### Never Log

| Data | Treatment |
|---|---|
| API keys / tokens | Never included in event entries |
| Passwords | Never included |
| Chat message content | Not logged (only `messageLength`) |
| Tool output content | Not logged (only `success`/`error` and `durationMs`) |
| File contents | Not logged (only filenames and sizes) |
| Session secrets | Never included |

### Redaction

If an event field might contain sensitive data (e.g., error messages from API providers), apply OpenClaw's redaction patterns before writing:

```typescript
import { redactSensitive } from "openclaw/plugin-sdk/logging";

entry.error = redactSensitive(rawErrorMessage);
```

### API Key Events

When logging `apikey.added` or `apikey.removed`, only the `provider` name is recorded — never the key value:

```json
{"ts": "...", "event": "apikey.added", "level": "info", "source": "plugin", "provider": "anthropic"}
```

---

## Implementation Plan

Since OpenClaw provides hooks, logger, rotation, query, and redaction — AcaClaw's implementation is minimal.

### Phase 1: Logger Plugin + Journal Writer

| Task | File | Description |
|---|---|---|
| Create plugin skeleton | `plugins/logger/index.ts` | Register hooks, `log.forward` RPC, prune on startup |
| EventJournal class | `plugins/logger/journal.ts` | `writeEvent()` (JSONL appendFile), `pruneOldFiles()` |
| Subscribe to OpenClaw hooks | `plugins/logger/index.ts` | `api.on("after_tool_call", ...)`, `api.on("llm_output", ...)`, etc. |
| Config section | `config/openclaw-defaults.json` | `logging.eventJournal` block |

This covers: tool calls, LLM I/O, sessions, gateway lifecycle, subagents, messages — all via `api.on()`.

### Phase 2: UI Event Forwarding

| Task | File | Description |
|---|---|---|
| EventLogger class | `ui/src/controllers/event-logger.ts` | Buffer + flush via `log.forward` RPC |
| Instrument gateway.ts | `ui/src/controllers/gateway.ts` | `connection.*`, `auth.*` events |
| Instrument chat/settings/staff | Various UI views | `chat.send`, `model.selected`, `config.change`, `skill.*` |

### Phase 3: Query + Display

| Task | File | Description |
|---|---|---|
| `event_log` agent tool | `plugins/logger/index.ts` | Query JSONL files (extends security audit pattern) |
| Extend Logs tab | `ui/src/views/logs.ts` | Show event journal alongside gateway logs |

---

## Related Documentation

- [Architecture](/en/architecture/) — System design and responsibility boundaries
- [Security](/en/security/) — Security policies, audit logging, sandbox configuration
- [App Launch and Gateway Connection](/en/auth-and-app-launch/) — Gateway lifecycle and connection flow
- [Chat Handling](/en/chat-handling/) — Message flow, streaming, tool and skill calling

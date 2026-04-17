#!/usr/bin/env bash
# AcaClaw Performance & Availability Test Suite
# Tests dock app start time, first chat response, web search latency,
# conda/R environments, and skills availability.
#
# Usage:
#   bash scripts/test-performance.sh              # Full suite
#   bash scripts/test-performance.sh --perf        # Performance tests only
#   bash scripts/test-performance.sh --avail       # Availability tests only
#   bash scripts/test-performance.sh --json        # Output JSON report
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

ACACLAW_PORT="${ACACLAW_PORT:-2090}"
OPENCLAW_PORT="${OPENCLAW_PORT:-18789}"
OPENCLAW_DIR="${HOME}/.openclaw"
ACACALAW_DATA_DIR="${HOME}/.acaclaw"
ACACALAW_CONFIG="${OPENCLAW_DIR}/openclaw.json"

# --- Results storage ---
declare -a RESULTS=()
PASS_COUNT=0
FAIL_COUNT=0
WARN_COUNT=0
SKIP_COUNT=0

# --- Timing helpers ---
_now_ms() {
    python3 -c "import time; print(int(time.time() * 1000))"
}

_elapsed() {
    local start=$1 end=$2
    echo "$(( end - start ))"
}

_fmt_ms() {
    local ms=$1
    if [[ $ms -ge 1000 ]]; then
        echo "$(echo "scale=2; $ms / 1000" | bc)s"
    else
        echo "${ms}ms"
    fi
}

# --- Result recording ---
_pass() {
    local label=$1 detail=${2:-""}
    PASS_COUNT=$((PASS_COUNT + 1))
    echo -e "  ${GREEN}✓ PASS${NC}  ${label}${detail:+  ${DIM}${detail}${NC}}"
    RESULTS+=("{\"test\": \"${label}\", \"status\": \"pass\", \"detail\": \"${detail}\"}")
}

_fail() {
    local label=$1 detail=${2:-""}
    FAIL_COUNT=$((FAIL_COUNT + 1))
    echo -e "  ${RED}✗ FAIL${NC}  ${label}${detail:+  ${DIM}${detail}${NC}}"
    RESULTS+=("{\"test\": \"${label}\", \"status\": \"fail\", \"detail\": \"${detail}\"}")
}

_warn() {
    local label=$1 detail=${2:-""}
    WARN_COUNT=$((WARN_COUNT + 1))
    echo -e "  ${YELLOW}⚠ WARN${NC}  ${label}${detail:+  ${DIM}${detail}${NC}}"
    RESULTS+=("{\"test\": \"${label}\", \"status\": \"warn\", \"detail\": \"${detail}\"}")
}

_skip() {
    local label=$1 detail=${2:-""}
    SKIP_COUNT=$((SKIP_COUNT + 1))
    echo -e "  ${DIM}– SKIP${NC}  ${label}${detail:+  ${DIM}${detail}${NC}}"
    RESULTS+=("{\"test\": \"${label}\", \"status\": \"skip\", \"detail\": \"${detail}\"}")
}

_perf() {
    local label=$1 ms=$2 threshold_ok=$3 threshold_warn=$4
    local formatted
    formatted="$(_fmt_ms "$ms")"
    if [[ $ms -le $threshold_ok ]]; then
        _pass "$label" "${formatted}"
    elif [[ $ms -le $threshold_warn ]]; then
        _warn "$label" "${formatted} (threshold: $(_fmt_ms "$threshold_ok"))"
    else
        _fail "$label" "${formatted} (threshold: $(_fmt_ms "$threshold_warn"))"
    fi
}

# --- Node.js WebSocket helper (shared) ---
# Runs a Node.js script that connects to the gateway, optionally calls a method,
# and returns JSON result with timing info. Payload is written to a temp file
# to avoid stdout truncation for large responses (e.g. models.list ~114KB).
_ws_call() {
    local method=$1 params=${2:-"{}"}
    local payload_file
    payload_file="$(mktemp /tmp/ws_payload_XXXXXX.json)"

    ACACLAW_PORT="${ACACLAW_PORT}" WS_METHOD="${method}" WS_PARAMS="${params}" WS_PAYLOAD_FILE="${payload_file}" node -e '
const WebSocket = require("ws");
const {randomUUID} = require("crypto");
const fs = require("fs");
const port = process.env.ACACLAW_PORT || 2090;
const METHOD = process.env.WS_METHOD;
const PARAMS = JSON.parse(process.env.WS_PARAMS || "{}");
const PAYLOAD_FILE = process.env.WS_PAYLOAD_FILE;
const t0 = Date.now();
let t_connected;
const ws = new WebSocket("ws://localhost:" + port + "/", { origin: "http://localhost:" + port });
ws.on("open", () => {});
ws.on("message", (data) => {
    const msg = JSON.parse(data);
    if (msg.type === "event" && msg.event === "connect.challenge") {
        ws.send(JSON.stringify({
            type: "req", id: randomUUID(), method: "connect",
            params: {
                minProtocol: 3, maxProtocol: 3,
                client: { id: "openclaw-control-ui", version: "acaclaw-1.0.0", platform: "linux", mode: "ui" },
                role: "operator",
                scopes: ["operator.admin","operator.read","operator.write","operator.approvals","operator.pairing"]
            }
        }));
    } else if (msg.type === "res" && !t_connected) {
        t_connected = Date.now();
        if (msg.ok === false) {
            fs.writeFileSync(PAYLOAD_FILE, JSON.stringify(msg.error || {}));
            console.log(JSON.stringify({ ok: false, error: "auth_failed", connect_ms: t_connected - t0 }));
            ws.close(); process.exit(1);
        }
        const callId = randomUUID();
        ws.send(JSON.stringify({
            type: "req", id: callId, method: METHOD, params: PARAMS
        }));
    } else if (msg.type === "res" && t_connected) {
        const t_done = Date.now();
        const payload = msg.ok ? msg.payload : (msg.error || msg.payload);
        fs.writeFileSync(PAYLOAD_FILE, JSON.stringify(payload));
        console.log(JSON.stringify({
            ok: !!msg.ok,
            connect_ms: t_connected - t0,
            call_ms: t_done - t_connected,
            total_ms: t_done - t0,
            payload_file: PAYLOAD_FILE
        }));
        ws.close(); process.exit(0);
    }
});
ws.on("error", (e) => { console.log(JSON.stringify({error: e.message})); process.exit(1); });
setTimeout(() => { console.log(JSON.stringify({error: "timeout"})); process.exit(1); }, 30000);
' 2>/dev/null
}

# --- Get payload file path from _ws_call result ---
_ws_payload_file() {
    echo "$1" | python3 -c "import json,sys; print(json.load(sys.stdin).get('payload_file',''))" 2>/dev/null
}

# --- Chat call with streaming (waits for final response) ---
_ws_chat() {
    local message=$1 session_key=${2:-"perf-test"}

    ACACLAW_PORT="${ACACLAW_PORT}" WS_MESSAGE="${message}" WS_SESSION="${session_key}" node -e '
const WebSocket = require("ws");
const {randomUUID} = require("crypto");
const port = process.env.ACACLAW_PORT || 2090;
const MESSAGE = process.env.WS_MESSAGE;
const SESSION_KEY = process.env.WS_SESSION;
const t0 = Date.now();
let t_connected, t_first_token, t_final;
let responseText = "";
let targetRunId = null;
const ws = new WebSocket("ws://localhost:" + port + "/", { origin: "http://localhost:" + port });
ws.on("open", () => {});
ws.on("message", (data) => {
    const msg = JSON.parse(data);
    if (msg.type === "event" && msg.event === "connect.challenge") {
        ws.send(JSON.stringify({
            type: "req", id: randomUUID(), method: "connect",
            params: {
                minProtocol: 3, maxProtocol: 3,
                client: { id: "openclaw-control-ui", version: "acaclaw-1.0.0", platform: "linux", mode: "ui" },
                role: "operator",
                scopes: ["operator.admin","operator.read","operator.write","operator.approvals","operator.pairing"]
            }
        }));
    } else if (msg.type === "res" && !t_connected) {
        t_connected = Date.now();
        if (msg.ok === false) {
            console.log(JSON.stringify({ error: "auth_failed" }));
            ws.close(); process.exit(1);
        }
        const callId = randomUUID();
        ws.send(JSON.stringify({
            type: "req", id: callId, method: "chat.send",
            params: { sessionKey: SESSION_KEY, message: MESSAGE, idempotencyKey: randomUUID() }
        }));
    } else if (msg.type === "res" && t_connected && !targetRunId) {
        if (msg.ok && msg.payload && msg.payload.runId) {
            targetRunId = msg.payload.runId;
        } else {
            console.log(JSON.stringify({ error: "chat.send failed", payload: msg.payload || msg.error }));
            ws.close(); process.exit(1);
        }
    } else if (msg.type === "event" && msg.event === "chat") {
        const d = msg.payload || {};
        if (d.runId !== targetRunId) return;
        if (d.state === "delta" && d.message) {
            if (!t_first_token) t_first_token = Date.now();
            const text = (d.message.content || []).filter(c => c.type === "text").map(c => c.text || "").join("");
            if (text) responseText = text;
        } else if (d.state === "final" && d.message) {
            t_final = Date.now();
            const text = (d.message.content || []).filter(c => c.type === "text").map(c => c.text || "").join("");
            if (text) responseText = text;
            console.log(JSON.stringify({
                ok: true,
                connect_ms: t_connected - t0,
                first_token_ms: t_first_token ? t_first_token - t_connected : null,
                total_ms: t_final - t_connected,
                response_length: responseText.length,
                response_preview: responseText.substring(0, 200)
            }));
            ws.close(); process.exit(0);
        } else if (d.state === "error") {
            t_final = Date.now();
            console.log(JSON.stringify({
                error: d.errorMessage || "agent_error",
                connect_ms: t_connected - t0,
                total_ms: t_final - t_connected
            }));
            ws.close(); process.exit(1);
        }
    }
});
ws.on("error", (e) => { console.log(JSON.stringify({error: e.message})); process.exit(1); });
setTimeout(() => {
    console.log(JSON.stringify({error: "timeout (120s)", connect_ms: t_connected ? t_connected - t0 : null, first_token_ms: t_first_token ? t_first_token - t_connected : null}));
    ws.close(); process.exit(1);
}, 120000);
' 2>/dev/null
}

# ═══════════════════════════════════════════
# PERFORMANCE TESTS
# ═══════════════════════════════════════════

perf_dock_app_start() {
    echo -e "\n${BOLD}${CYAN}[PERF] Dock App Start Time${NC}"

    # Check if gateway is already running
    if curl -sf --noproxy 127.0.0.1 --max-time 2 "http://127.0.0.1:${ACACLAW_PORT}/" &>/dev/null; then
        echo -e "  ${DIM}Gateway already running — measuring warm responsiveness${NC}"

        local start end
        start=$(_now_ms)
        curl -sf --noproxy 127.0.0.1 --max-time 5 "http://127.0.0.1:${ACACLAW_PORT}/" -o /dev/null
        end=$(_now_ms)
        _perf "HTTP root response (warm)" "$(_elapsed "$start" "$end")" 200 1000

        start=$(_now_ms)
        curl -sf --noproxy 127.0.0.1 --max-time 5 "http://127.0.0.1:${ACACLAW_PORT}/health" -o /dev/null
        end=$(_now_ms)
        _perf "Health endpoint (warm)" "$(_elapsed "$start" "$end")" 100 500

        # JS bundle
        local js_file
        js_file="$(curl -sf --noproxy 127.0.0.1 "http://127.0.0.1:${ACACLAW_PORT}/" | grep -oP 'src="/assets/[^"]*\.js"' | head -1 | tr -d '"' | sed 's/src=//')" || true
        if [[ -n "$js_file" ]]; then
            start=$(_now_ms)
            local js_size
            js_size="$(curl -sf --noproxy 127.0.0.1 --max-time 10 "http://127.0.0.1:${ACACLAW_PORT}${js_file}" -o /dev/null -w '%{size_download}')"
            end=$(_now_ms)
            local js_kb
            js_kb="$(echo "scale=1; $js_size / 1024" | bc)KB"
            _perf "JS bundle load (${js_kb})" "$(_elapsed "$start" "$end")" 200 1000
        fi
    else
        _fail "Gateway not running" "Cannot test dock app start — gateway on :${ACACLAW_PORT} not responding"
    fi
}

perf_ws_connect() {
    echo -e "\n${BOLD}${CYAN}[PERF] WebSocket Connect + Auth${NC}"

    if ! curl -sf --noproxy 127.0.0.1 --max-time 2 "http://127.0.0.1:${ACACLAW_PORT}/" &>/dev/null; then
        _skip "WebSocket connect" "Gateway not running"
        return
    fi

    local result
    result="$(ACACLAW_PORT="${ACACLAW_PORT}" node -e '
const WebSocket = require("ws");
const {randomUUID} = require("crypto");
const port = process.env.ACACLAW_PORT || 2090;
const t0 = Date.now();
let t_open, t_challenge, t_connected;
const ws = new WebSocket("ws://localhost:" + port + "/", { origin: "http://localhost:" + port });
ws.on("open", () => { t_open = Date.now(); });
ws.on("message", (data) => {
    const msg = JSON.parse(data);
    if (msg.type === "event" && msg.event === "connect.challenge") {
        t_challenge = Date.now();
        ws.send(JSON.stringify({
            type: "req", id: randomUUID(), method: "connect",
            params: {
                minProtocol: 3, maxProtocol: 3,
                client: { id: "openclaw-control-ui", version: "acaclaw-1.0.0", platform: "linux", mode: "ui" },
                role: "operator",
                scopes: ["operator.admin","operator.read","operator.write","operator.approvals","operator.pairing"]
            }
        }));
    } else if (msg.type === "res") {
        t_connected = Date.now();
        console.log(JSON.stringify({
            ok: !!msg.ok,
            ws_open: t_open - t0,
            challenge: t_challenge - t0,
            connected: t_connected - t0
        }));
        ws.close(); process.exit(0);
    }
});
ws.on("error", (e) => { console.log(JSON.stringify({error: e.message})); process.exit(1); });
setTimeout(() => { console.log(JSON.stringify({error: "timeout"})); process.exit(1); }, 10000);
' 2>/dev/null)" || true

    if [[ -z "$result" ]]; then
        _fail "WebSocket connect" "No response from WS test"
        return
    fi

    local ws_open challenge connected auth_ok
    ws_open="$(echo "$result" | python3 -c "import json,sys; print(json.load(sys.stdin).get('ws_open', -1))" 2>/dev/null)" || ws_open=-1
    challenge="$(echo "$result" | python3 -c "import json,sys; print(json.load(sys.stdin).get('challenge', -1))" 2>/dev/null)" || challenge=-1
    connected="$(echo "$result" | python3 -c "import json,sys; print(json.load(sys.stdin).get('connected', -1))" 2>/dev/null)" || connected=-1
    auth_ok="$(echo "$result" | python3 -c "import json,sys; print(json.load(sys.stdin).get('ok', False))" 2>/dev/null)" || auth_ok="False"

    if [[ "$ws_open" == "-1" ]]; then
        local err
        err="$(echo "$result" | python3 -c "import json,sys; print(json.load(sys.stdin).get('error', 'unknown'))" 2>/dev/null)" || err="unknown"
        _fail "WebSocket connect" "$err"
        return
    fi

    _perf "WS open" "$ws_open" 100 500
    _perf "WS challenge received" "$((challenge - ws_open))" 50 200
    _perf "WS handshake" "$((connected - challenge))" 100 500
    _perf "WS total connect" "$connected" 200 1000

    if [[ "$auth_ok" == "True" ]]; then
        _pass "WS connect accepted"
    else
        _fail "WS connect rejected" "Connect handshake failed"
    fi
}

perf_first_chat_response() {
    echo -e "\n${BOLD}${CYAN}[PERF] First Chat Response${NC}"

    if ! curl -sf --noproxy 127.0.0.1 --max-time 2 "http://127.0.0.1:${ACACLAW_PORT}/" &>/dev/null; then
        _skip "First chat response" "Gateway not running"
        return
    fi

    echo -e "  ${DIM}Sending: \"What is 2+2? Reply with just the number.\"${NC}"
    local result
    result="$(_ws_chat "What is 2+2? Reply with just the number." "perf-test-$(date +%s)")" || true

    if [[ -z "$result" ]]; then
        _fail "First chat response" "No response received"
        return
    fi

    local err
    err="$(echo "$result" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('error',''))" 2>/dev/null)" || err=""
    if [[ -n "$err" ]]; then
        _fail "First chat response" "Error: $err"
        return
    fi

    local first_token total_ms response_len preview
    first_token="$(echo "$result" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('first_token_ms',''))" 2>/dev/null)" || first_token=""
    total_ms="$(echo "$result" | python3 -c "import json,sys; print(json.load(sys.stdin).get('total_ms',0))" 2>/dev/null)" || total_ms=0
    response_len="$(echo "$result" | python3 -c "import json,sys; print(json.load(sys.stdin).get('response_length',0))" 2>/dev/null)" || response_len=0
    preview="$(echo "$result" | python3 -c "import json,sys; print(json.load(sys.stdin).get('response_preview','')[:80])" 2>/dev/null)" || preview=""

    if [[ -n "$first_token" && "$first_token" != "None" ]]; then
        _perf "Time to first token" "$first_token" 5000 10000
    else
        _warn "Time to first token" "Not measured (no delta events)"
    fi
    _perf "Total response time" "$total_ms" 30000 60000
    _pass "Response received" "${response_len} chars: \"${preview}...\""
}

perf_web_search() {
    echo -e "\n${BOLD}${CYAN}[PERF] Web Search Latency${NC}"

    if ! curl -sf --noproxy 127.0.0.1 --max-time 2 "http://127.0.0.1:${ACACLAW_PORT}/" &>/dev/null; then
        _skip "Web search latency" "Gateway not running"
        return
    fi

    echo -e "  ${DIM}Sending: \"Search the web for the current weather in London. Be brief.\"${NC}"
    local result
    result="$(_ws_chat "Search the web for the current weather in London. Be brief." "perf-websearch-$(date +%s)")" || true

    if [[ -z "$result" ]]; then
        _fail "Web search response" "No response received"
        return
    fi

    local err
    err="$(echo "$result" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('error',''))" 2>/dev/null)" || err=""
    if [[ -n "$err" ]]; then
        _fail "Web search response" "Error: $err"
        return
    fi

    local first_token total_ms response_len preview
    first_token="$(echo "$result" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('first_token_ms',''))" 2>/dev/null)" || first_token=""
    total_ms="$(echo "$result" | python3 -c "import json,sys; print(json.load(sys.stdin).get('total_ms',0))" 2>/dev/null)" || total_ms=0
    response_len="$(echo "$result" | python3 -c "import json,sys; print(json.load(sys.stdin).get('response_length',0))" 2>/dev/null)" || response_len=0
    preview="$(echo "$result" | python3 -c "import json,sys; print(json.load(sys.stdin).get('response_preview','')[:80])" 2>/dev/null)" || preview=""

    if [[ -n "$first_token" && "$first_token" != "None" ]]; then
        _perf "Time to first token (web search)" "$first_token" 5000 10000
    else
        _warn "Time to first token (web search)" "Not measured"
    fi
    _perf "Total web search time" "$total_ms" 60000 120000
    _pass "Web search response" "${response_len} chars: \"${preview}...\""
}

perf_api_calls() {
    echo -e "\n${BOLD}${CYAN}[PERF] API Call Latency${NC}"

    if ! curl -sf --noproxy 127.0.0.1 --max-time 2 "http://127.0.0.1:${ACACLAW_PORT}/" &>/dev/null; then
        _skip "API calls" "Gateway not running"
        return
    fi

    local result pf

    # health
    result="$(_ws_call "health" "{}")" || true
    pf="$(_ws_payload_file "$result")"; rm -f "$pf" 2>/dev/null
    if [[ -n "$result" ]]; then
        local call_ms
        call_ms="$(echo "$result" | python3 -c "import json,sys; print(json.load(sys.stdin).get('call_ms',0))" 2>/dev/null)" || call_ms=0
        _perf "health RPC" "$call_ms" 50 200
    else
        _fail "health RPC" "No response"
    fi

    # sessions.list
    result="$(_ws_call "sessions.list" "{}")" || true
    pf="$(_ws_payload_file "$result")"; rm -f "$pf" 2>/dev/null
    if [[ -n "$result" ]]; then
        local call_ms
        call_ms="$(echo "$result" | python3 -c "import json,sys; print(json.load(sys.stdin).get('call_ms',0))" 2>/dev/null)" || call_ms=0
        _perf "sessions.list RPC" "$call_ms" 100 500
    else
        _fail "sessions.list RPC" "No response"
    fi

    # skills.status
    result="$(_ws_call "skills.status" "{}")" || true
    pf="$(_ws_payload_file "$result")"; rm -f "$pf" 2>/dev/null
    if [[ -n "$result" ]]; then
        local call_ms
        call_ms="$(echo "$result" | python3 -c "import json,sys; print(json.load(sys.stdin).get('call_ms',0))" 2>/dev/null)" || call_ms=0
        _perf "skills.status RPC" "$call_ms" 100 500
    else
        _fail "skills.status RPC" "No response"
    fi

    # config.get
    result="$(_ws_call "config.get" "{}")" || true
    pf="$(_ws_payload_file "$result")"; rm -f "$pf" 2>/dev/null
    if [[ -n "$result" ]]; then
        local call_ms
        call_ms="$(echo "$result" | python3 -c "import json,sys; print(json.load(sys.stdin).get('call_ms',0))" 2>/dev/null)" || call_ms=0
        _perf "config.get RPC" "$call_ms" 100 500
    else
        _fail "config.get RPC" "No response"
    fi

    # models.list
    result="$(_ws_call "models.list" "{}")" || true
    pf="$(_ws_payload_file "$result")"; rm -f "$pf" 2>/dev/null
    if [[ -n "$result" ]]; then
        local call_ms
        call_ms="$(echo "$result" | python3 -c "import json,sys; print(json.load(sys.stdin).get('call_ms',0))" 2>/dev/null)" || call_ms=0
        _perf "models.list RPC" "$call_ms" 200 1000
    else
        _fail "models.list RPC" "No response"
    fi
}

# ═══════════════════════════════════════════
# AVAILABILITY TESTS
# ═══════════════════════════════════════════

avail_gateway() {
    echo -e "\n${BOLD}${CYAN}[AVAIL] Gateway Services${NC}"

    # AcaClaw gateway (port 2090)
    if curl -sf --noproxy 127.0.0.1 --max-time 3 "http://127.0.0.1:${ACACLAW_PORT}/" &>/dev/null; then
        _pass "AcaClaw gateway (:${ACACLAW_PORT})"
    else
        _fail "AcaClaw gateway (:${ACACLAW_PORT})" "Not responding"
    fi

    # AcaClaw health
    local health
    health="$(curl -sf --noproxy 127.0.0.1 --max-time 3 "http://127.0.0.1:${ACACLAW_PORT}/health" 2>/dev/null)" || health=""
    if [[ -n "$health" ]]; then
        _pass "AcaClaw health endpoint" "$health"
    else
        _fail "AcaClaw health endpoint" "No response"
    fi

    # OpenClaw gateway (port 18789)
    if curl -sf --noproxy 127.0.0.1 --max-time 3 "http://127.0.0.1:${OPENCLAW_PORT}/" &>/dev/null; then
        _pass "OpenClaw gateway (:${OPENCLAW_PORT})"
    else
        _warn "OpenClaw gateway (:${OPENCLAW_PORT})" "Not responding (optional)"
    fi

    # Systemd services
    if command -v systemctl &>/dev/null; then
        if systemctl --user is-active acaclaw-gateway.service &>/dev/null 2>&1; then
            _pass "systemd: acaclaw-gateway.service" "active"
        else
            _warn "systemd: acaclaw-gateway.service" "not active"
        fi
        if systemctl --user is-active openclaw-gateway.service &>/dev/null 2>&1; then
            _pass "systemd: openclaw-gateway.service" "active"
        else
            _warn "systemd: openclaw-gateway.service" "not active (optional)"
        fi
    fi
}

avail_conda_envs() {
    echo -e "\n${BOLD}${CYAN}[AVAIL] Conda Environments${NC}"

    # Check conda is available
    if ! command -v conda &>/dev/null; then
        _fail "conda command" "conda not found in PATH"
        return
    fi
    _pass "conda command" "$(conda --version 2>/dev/null)"

    # Expected environments
    local expected_envs=("acaclaw" "acaclaw-bio" "acaclaw-chem" "acaclaw-med" "acaclaw-phys")
    local installed_envs
    installed_envs="$(conda env list --json 2>/dev/null | python3 -c "
import json, sys, os
data = json.load(sys.stdin)
for p in data.get('envs', []):
    print(os.path.basename(p))
" 2>/dev/null)" || installed_envs=""

    for env_name in "${expected_envs[@]}"; do
        if echo "$installed_envs" | grep -qx "$env_name"; then
            _pass "Conda env: ${env_name}"

            # Validate the env can activate and has Python
            local py_version
            py_version="$(conda run -n "$env_name" python3 --version 2>/dev/null)" || py_version=""
            if [[ -n "$py_version" ]]; then
                _pass "  Python in ${env_name}" "$py_version"
            else
                _warn "  Python in ${env_name}" "python3 not working"
            fi

            # Check key packages
            local has_numpy
            has_numpy="$(conda run -n "$env_name" python3 -c "import numpy; print(numpy.__version__)" 2>/dev/null)" || has_numpy=""
            if [[ -n "$has_numpy" ]]; then
                _pass "  numpy in ${env_name}" "v${has_numpy}"
            else
                _warn "  numpy in ${env_name}" "not importable"
            fi
        else
            _warn "Conda env: ${env_name}" "not installed"
        fi
    done

    # Also check via gateway API
    if curl -sf --noproxy 127.0.0.1 --max-time 2 "http://127.0.0.1:${ACACLAW_PORT}/" &>/dev/null; then
        local result
        result="$(_ws_call "acaclaw.env.list" "{}")" || true
        if [[ -n "$result" ]]; then
            local pf
            pf="$(_ws_payload_file "$result")"
            local env_count=0
            if [[ -f "$pf" ]]; then
                env_count="$(python3 -c "
import json, sys
with open('$pf') as f:
    p = json.load(f)
envs = p.get('environments', p.get('envs', []))
print(len(envs) if isinstance(envs, list) else 0)
" 2>/dev/null)" || env_count=0
                rm -f "$pf"
            fi
            _pass "Gateway acaclaw.env.list" "${env_count} environment(s) returned"
        else
            _warn "Gateway acaclaw.env.list" "No response"
        fi
    fi
}

avail_r_env() {
    echo -e "\n${BOLD}${CYAN}[AVAIL] R Environment${NC}"

    # Check if R is available globally
    if command -v R &>/dev/null; then
        local r_version
        r_version="$(R --version 2>/dev/null | head -1)" || r_version=""
        _pass "R (global)" "$r_version"
    else
        _warn "R (global)" "Not found in PATH"
    fi

    # Check R inside conda envs
    local conda_envs=("acaclaw" "acaclaw-bio" "acaclaw-med")
    for env_name in "${conda_envs[@]}"; do
        if conda env list --json 2>/dev/null | python3 -c "
import json, sys, os
data = json.load(sys.stdin)
names = [os.path.basename(p) for p in data.get('envs', [])]
sys.exit(0 if '$env_name' in names else 1)
" 2>/dev/null; then
            local r_ver
            r_ver="$(conda run -n "$env_name" R --version 2>/dev/null | head -1)" || r_ver=""
            if [[ -n "$r_ver" ]]; then
                _pass "R in ${env_name}" "$r_ver"
            else
                _warn "R in ${env_name}" "Not installed"
            fi
        fi
    done

    # Check IRkernel (Jupyter R kernel)
    if command -v jupyter &>/dev/null; then
        local kernels
        kernels="$(jupyter kernelspec list 2>/dev/null)" || kernels=""
        if echo "$kernels" | grep -qi "ir\b\|r\b"; then
            _pass "Jupyter R kernel (IRkernel)" "installed"
        else
            _warn "Jupyter R kernel (IRkernel)" "not found"
        fi
    fi
}

avail_skills() {
    echo -e "\n${BOLD}${CYAN}[AVAIL] Skills${NC}"

    if ! curl -sf --noproxy 127.0.0.1 --max-time 2 "http://127.0.0.1:${ACACLAW_PORT}/" &>/dev/null; then
        _skip "Skills check" "Gateway not running"
        return
    fi

    local result
    result="$(_ws_call "skills.status" "{}")" || true

    if [[ -z "$result" ]]; then
        _fail "skills.status" "No response from gateway"
        return
    fi

    local err
    err="$(echo "$result" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('error',''))" 2>/dev/null)" || err=""
    if [[ -n "$err" ]]; then
        _fail "skills.status" "$err"
        return
    fi

    # Parse skills from the payload file
    local pf
    pf="$(_ws_payload_file "$result")"
    if [[ ! -f "$pf" ]]; then
        _warn "skills.status" "No payload file"
        return
    fi

    local skills_info
    skills_info="$(python3 -c "
import json, sys
with open('$pf') as f:
    p = json.load(f)
skills = p.get('skills', [])
eligible = [s for s in skills if s.get('eligible', False)]
bundled = [s for s in skills if s.get('source') == 'openclaw-bundled']
managed = [s for s in skills if s.get('source') == 'openclaw-managed']
eligible_names = {s.get('name') for s in eligible}

print(f'total={len(skills)}')
print(f'eligible={len(eligible)}')
print(f'bundled={len(bundled)}')
print(f'managed={len(managed)}')

for s in managed:
    name = s.get('name', 'unknown')
    ok = 'eligible' if s.get('eligible') else 'not-eligible'
    print(f'managed|{name}|{ok}')

for s in eligible:
    if s.get('source') != 'openclaw-managed':
        name = s.get('name', 'unknown')
        print(f'bundled-eligible|{name}')

# Report agent-required skills status
required = ['nano-pdf', 'xurl', 'coding-agent', 'summarize']
for r in required:
    match = [s for s in skills if s.get('name') == r]
    if match:
        s = match[0]
        missing = s.get('missing', {})
        bins = missing.get('bins', [])
        env_m = missing.get('env', [])
        cfg = missing.get('config', [])
        reason_parts = []
        if bins: reason_parts.append('bins=' + ','.join(bins))
        if env_m: reason_parts.append('env=' + ','.join(env_m))
        if cfg: reason_parts.append('config=' + ','.join(cfg))
        reason = ' | '.join(reason_parts) if reason_parts else ''
        ok = 'eligible' if s.get('eligible') else 'not-eligible'
        print(f'required|{r}|{ok}|{reason}')
    else:
        print(f'required|{r}|not-found|')
" 2>/dev/null)" || skills_info=""
    rm -f "$pf"

    if [[ -z "$skills_info" ]]; then
        _warn "skills.status" "Could not parse response"
        return
    fi

    local total_skills eligible_count bundled_count managed_count
    total_skills="$(echo "$skills_info" | grep '^total=' | cut -d= -f2)"
    eligible_count="$(echo "$skills_info" | grep '^eligible=' | cut -d= -f2)"
    bundled_count="$(echo "$skills_info" | grep '^bundled=' | cut -d= -f2)"
    managed_count="$(echo "$skills_info" | grep '^managed=' | cut -d= -f2)"

    echo -e "  ${DIM}Gateway knows ${total_skills} skills (${bundled_count} bundled, ${managed_count} user-installed)${NC}"
    _pass "Eligible skills" "${eligible_count} out of ${total_skills} have all dependencies met"

    # Show user-installed (managed) skills
    if [[ "$managed_count" -gt 0 ]]; then
        while IFS='|' read -r _ name status; do
            if [[ "$status" == "eligible" ]]; then
                _pass "Installed: ${name}" "ready"
            else
                _warn "Installed: ${name}" "not eligible"
            fi
        done < <(echo "$skills_info" | grep '^managed|')
    fi

    # Check agent-required skills (from skills.json)
    echo -e "  ${DIM}Agent-required skills (from skills.json):${NC}"
    while IFS='|' read -r _ name status reason; do
        if [[ "$status" == "eligible" ]]; then
            _pass "Required: ${name}" "ready"
        elif [[ "$status" == "not-eligible" ]]; then
            _fail "Required: ${name}" "missing: ${reason}"
        else
            _fail "Required: ${name}" "not found in gateway"
        fi
    done < <(echo "$skills_info" | grep '^required|')
}

avail_models() {
    echo -e "\n${BOLD}${CYAN}[AVAIL] LLM Models${NC}"

    if ! curl -sf --noproxy 127.0.0.1 --max-time 2 "http://127.0.0.1:${ACACLAW_PORT}/" &>/dev/null; then
        _skip "Models check" "Gateway not running"
        return
    fi

    local result
    result="$(_ws_call "models.list" "{}")" || true

    if [[ -z "$result" ]]; then
        _fail "models.list" "No response"
        return
    fi

    local pf
    pf="$(_ws_payload_file "$result")"
    if [[ ! -f "$pf" ]]; then
        _warn "models.list" "No payload file"
        return
    fi

    local models_info
    models_info="$(python3 -c "
import json, sys
with open('$pf') as f:
    p = json.load(f)
models = p.get('models', p.get('data', []))
if isinstance(models, list):
    for m in models:
        name = m.get('name', m.get('id', 'unknown'))
        provider = m.get('provider', '')
        print(f'{name}|{provider}')
    if not models:
        print('_empty_')
else:
    print('_unknown_')
" 2>/dev/null)" || models_info="_error_"
    rm -f "$pf"

    if [[ "$models_info" == "_error_" || "$models_info" == "_empty_" || "$models_info" == "_unknown_" ]]; then
        _warn "models.list" "No models returned or parse error"
        return
    fi

    local count=0
    while IFS='|' read -r name provider; do
        [[ -z "$name" ]] && continue
        count=$((count + 1))
        if [[ $count -le 5 ]]; then
            if [[ -n "$provider" ]]; then
                _pass "Model: ${name}" "${provider}"
            else
                _pass "Model: ${name}"
            fi
        fi
    done <<< "$models_info"

    if [[ $count -gt 5 ]]; then
        echo -e "  ${DIM}... and $((count - 5)) more models${NC}"
    fi
    echo -e "  ${DIM}Total: ${count} models available${NC}"
}

avail_openclaw_dashboard() {
    echo -e "\n${BOLD}${CYAN}[AVAIL] OpenClaw Dashboard${NC}"

    if curl -sf --noproxy 127.0.0.1 --max-time 3 "http://127.0.0.1:${OPENCLAW_PORT}/" &>/dev/null; then
        _pass "OpenClaw dashboard (:${OPENCLAW_PORT})" "responding"

        # Check it serves the control UI (look for title)
        local title
        title="$(curl -sf --noproxy 127.0.0.1 --max-time 5 "http://127.0.0.1:${OPENCLAW_PORT}/" | grep -oP '(?<=<title>)[^<]+' | head -1)" || title=""
        if [[ -n "$title" ]]; then
            _pass "Dashboard title" "$title"
        fi
    else
        _warn "OpenClaw dashboard (:${OPENCLAW_PORT})" "Not responding (optional)"
    fi
}

# ═══════════════════════════════════════════
# SUMMARY
# ═══════════════════════════════════════════

print_summary() {
    local total_ms=$1
    local total_tests=$((PASS_COUNT + FAIL_COUNT + WARN_COUNT + SKIP_COUNT))

    echo -e "\n${BOLD}═══════════════════════════════════════════════════${NC}"
    echo -e "${BOLD}  Test Results Summary${NC}"
    echo -e "${BOLD}═══════════════════════════════════════════════════${NC}"
    echo -e "  ${GREEN}Passed:  ${PASS_COUNT}${NC}"
    echo -e "  ${RED}Failed:  ${FAIL_COUNT}${NC}"
    echo -e "  ${YELLOW}Warnings: ${WARN_COUNT}${NC}"
    echo -e "  ${DIM}Skipped: ${SKIP_COUNT}${NC}"
    echo -e "  Total:   ${total_tests}"
    echo -e "  Duration: $(_fmt_ms "$total_ms")"
    echo -e "${BOLD}═══════════════════════════════════════════════════${NC}"

    if [[ $FAIL_COUNT -gt 0 ]]; then
        echo -e "\n  ${RED}${BOLD}RESULT: FAIL${NC} (${FAIL_COUNT} failure(s))"
        return 1
    elif [[ $WARN_COUNT -gt 0 ]]; then
        echo -e "\n  ${YELLOW}${BOLD}RESULT: WARN${NC} (${WARN_COUNT} warning(s))"
        return 0
    else
        echo -e "\n  ${GREEN}${BOLD}RESULT: ALL PASS${NC}"
        return 0
    fi
}

print_json_report() {
    echo "["
    local first=true
    for r in "${RESULTS[@]}"; do
        if [[ "$first" == "true" ]]; then
            first=false
        else
            echo ","
        fi
        echo -n "  $r"
    done
    echo ""
    echo "]"
}

# ═══════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════

MODE="${1:---all}"
JSON_OUTPUT=false

if [[ "$MODE" == "--json" ]]; then
    JSON_OUTPUT=true
    MODE="--all"
fi

echo -e "${BOLD}╔═══════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║   AcaClaw Performance & Availability Test Suite   ║${NC}"
echo -e "${BOLD}╚═══════════════════════════════════════════════════╝${NC}"
echo -e "${DIM}AcaClaw:  :${ACACLAW_PORT} | OpenClaw: :${OPENCLAW_PORT}${NC}"
echo -e "${DIM}Config:   ${ACACLAW_CONFIG}${NC}"
echo -e "${DIM}Mode:     ${MODE}${NC}"
echo -e "${DIM}Date:     $(date)${NC}"

TOTAL_START=$(_now_ms)

case "$MODE" in
    --all)
        # Performance
        perf_dock_app_start
        perf_ws_connect
        perf_api_calls
        perf_first_chat_response
        perf_web_search

        # Availability
        avail_gateway
        avail_conda_envs
        avail_r_env
        avail_skills
        avail_models
        avail_openclaw_dashboard
        ;;
    --perf)
        perf_dock_app_start
        perf_ws_connect
        perf_api_calls
        perf_first_chat_response
        perf_web_search
        ;;
    --avail)
        avail_gateway
        avail_conda_envs
        avail_r_env
        avail_skills
        avail_models
        avail_openclaw_dashboard
        ;;
    *)
        echo "Usage: $0 [--all|--perf|--avail|--json]"
        exit 1
        ;;
esac

TOTAL_END=$(_now_ms)

if [[ "$JSON_OUTPUT" == "true" ]]; then
    print_json_report
else
    print_summary "$(_elapsed "$TOTAL_START" "$TOTAL_END")" || true
fi

#!/usr/bin/env bash
# AcaClaw vs OpenClaw Chat Latency Comparison
# Tests TTFT (time-to-first-token) and total response time on both gateways.
#
# Usage:
#   bash tests/test-chat-latency.sh                # Full comparison
#   bash tests/test-chat-latency.sh --acaclaw      # AcaClaw only
#   bash tests/test-chat-latency.sh --openclaw     # OpenClaw only
#   bash tests/test-chat-latency.sh --rounds 5     # Run 5 rounds (default: 3)
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
ROUNDS=3
MODE="both"  # both | acaclaw | openclaw

while [[ $# -gt 0 ]]; do
    case $1 in
        --acaclaw)  MODE="acaclaw"; shift ;;
        --openclaw) MODE="openclaw"; shift ;;
        --rounds)   ROUNDS="$2"; shift 2 ;;
        *)          echo "Unknown option: $1"; exit 1 ;;
    esac
done

echo -e "${BOLD}${CYAN}════════════════════════════════════════${NC}"
echo -e "${BOLD}${CYAN}  AcaClaw vs OpenClaw Chat Latency Test ${NC}"
echo -e "${BOLD}${CYAN}════════════════════════════════════════${NC}"
echo ""

# ── WebSocket chat call that returns JSON with timing ──
# Args: port, message, session_suffix, label
_ws_chat_timed() {
    local port=$1 message=$2 session_suffix=$3 label=$4

    PORT="${port}" WS_MESSAGE="${message}" WS_SESSION="agent:main:web:latency-${session_suffix}" node --no-warnings -e '
const WebSocket = require("ws");
const {randomUUID} = require("crypto");
const port = process.env.PORT;
const MESSAGE = process.env.WS_MESSAGE;
const SESSION_KEY = process.env.WS_SESSION;

const t0 = Date.now();
let t_connected, t_ack, t_first_delta, t_final;
let responseText = "";
let deltaCount = 0;
let targetRunId = null;
let inputTokens = null;
let outputTokens = null;

const ws = new WebSocket("ws://localhost:" + port + "/", { origin: "http://localhost:" + port });

ws.on("open", () => {});

ws.on("message", (data) => {
    const msg = JSON.parse(data);

    if (msg.type === "event" && msg.event === "connect.challenge") {
        ws.send(JSON.stringify({
            type: "req", id: randomUUID(), method: "connect",
            params: {
                minProtocol: 3, maxProtocol: 3,
                client: { id: "openclaw-control-ui", version: "latency-test-1.0", platform: "linux", mode: "ui" },
                role: "operator",
                scopes: ["operator.admin","operator.read","operator.write","operator.approvals","operator.pairing"]
            }
        }));
    } else if (msg.type === "res" && !t_connected) {
        t_connected = Date.now();
        if (msg.ok === false) {
            console.log(JSON.stringify({ error: "connect_failed", detail: msg.payload || msg.error }));
            ws.close(); process.exit(1);
        }
        // Send chat
        const callId = randomUUID();
        ws.send(JSON.stringify({
            type: "req", id: callId, method: "chat.send",
            params: { sessionKey: SESSION_KEY, message: MESSAGE, idempotencyKey: randomUUID() }
        }));
    } else if (msg.type === "res" && t_connected && !targetRunId) {
        t_ack = Date.now();
        if (msg.ok && msg.payload && msg.payload.runId) {
            targetRunId = msg.payload.runId;
        } else {
            console.log(JSON.stringify({
                error: "chat_send_failed",
                detail: msg.payload || msg.error,
                connect_ms: t_connected - t0,
                ack_ms: t_ack ? t_ack - t_connected : null
            }));
            ws.close(); process.exit(1);
        }
    } else if (msg.type === "event" && msg.event === "chat") {
        const d = msg.payload || {};
        if (d.runId !== targetRunId) return;

        if (d.state === "delta" && d.message) {
            deltaCount++;
            if (!t_first_delta) t_first_delta = Date.now();
            const text = (d.message.content || []).filter(c => c.type === "text").map(c => c.text || "").join("");
            if (text) responseText = text;
        } else if (d.state === "final" && d.message) {
            t_final = Date.now();
            const text = (d.message.content || []).filter(c => c.type === "text").map(c => c.text || "").join("");
            if (text) responseText = text;

            // Try to extract token usage from final
            if (d.usage) {
                inputTokens = d.usage.inputTokens || d.usage.input_tokens || null;
                outputTokens = d.usage.outputTokens || d.usage.output_tokens || null;
            }

            console.log(JSON.stringify({
                ok: true,
                connect_ms: t_connected - t0,
                ack_ms: t_ack - t_connected,
                ttft_ms: t_first_delta ? t_first_delta - t_connected : null,
                total_ms: t_final - t_connected,
                stream_ms: t_final - (t_first_delta || t_connected),
                delta_count: deltaCount,
                response_length: responseText.length,
                response_preview: responseText.substring(0, 120),
                input_tokens: inputTokens,
                output_tokens: outputTokens
            }));
            ws.close(); process.exit(0);
        } else if (d.state === "error") {
            t_final = Date.now();
            console.log(JSON.stringify({
                error: d.errorMessage || "agent_error",
                connect_ms: t_connected - t0,
                ack_ms: t_ack ? t_ack - t_connected : null,
                ttft_ms: t_first_delta ? t_first_delta - t_connected : null,
                total_ms: t_final - t_connected
            }));
            ws.close(); process.exit(1);
        }
    }
});

ws.on("error", (e) => { console.log(JSON.stringify({error: e.message})); process.exit(1); });

setTimeout(() => {
    console.log(JSON.stringify({
        error: "timeout_120s",
        connect_ms: t_connected ? t_connected - t0 : null,
        ack_ms: t_ack ? t_ack - t_connected : null,
        ttft_ms: t_first_delta ? t_first_delta - t_connected : null
    }));
    ws.close(); process.exit(1);
}, 120000);
' 2>/dev/null
}

# ── Query config to get the default model for a gateway ──
_get_default_model() {
    local port=$1
    PORT="${port}" node --no-warnings -e '
const WebSocket = require("ws");
const {randomUUID} = require("crypto");
const port = process.env.PORT;
const ws = new WebSocket("ws://localhost:" + port + "/", { origin: "http://localhost:" + port });
let configCallId = null;
ws.on("message", (data) => {
    const msg = JSON.parse(data);
    if (msg.type === "event" && msg.event === "connect.challenge") {
        ws.send(JSON.stringify({
            type: "req", id: randomUUID(), method: "connect",
            params: {
                minProtocol: 3, maxProtocol: 3,
                client: { id: "openclaw-control-ui", version: "latency-test-1.0", platform: "linux", mode: "ui" },
                role: "operator",
                scopes: ["operator.admin","operator.read","operator.write"]
            }
        }));
    } else if (msg.type === "res" && !configCallId) {
        if (msg.ok === false) {
            console.log(JSON.stringify({error: "connect_failed"}));
            ws.close(); process.exit(1);
        }
        configCallId = randomUUID();
        ws.send(JSON.stringify({ type: "req", id: configCallId, method: "config.get", params: {} }));
    } else if (msg.type === "res" && msg.id === configCallId) {
        try {
            let raw = msg.payload;
            if (typeof raw === "string") raw = JSON.parse(raw);
            // Handle { config: { raw: "{...}", hash: "..." } } format
            if (raw && raw.config) {
                let cfg = raw.config;
                if (typeof cfg === "string") cfg = JSON.parse(cfg);
                if (cfg.raw) cfg = JSON.parse(cfg.raw);
                raw = cfg;
            }
            // Handle { raw: "{...}", hash: "..." } format
            if (raw && raw.raw) raw = JSON.parse(raw.raw);
            const defaultModel = raw?.agents?.defaults?.model || "unknown";
            const thinkingDefault = raw?.agents?.defaults?.thinkingDefault || "off";
            const agentCount = Array.isArray(raw?.agents?.list) ? raw.agents.list.length : 0;
            console.log(JSON.stringify({
                defaultModel,
                thinkingDefault,
                agentCount
            }));
        } catch (e) {
            console.log(JSON.stringify({error: "parse_config", detail: e.message}));
        }
        ws.close(); process.exit(0);
    }
});
ws.on("error", (e) => { console.log(JSON.stringify({error: e.message})); process.exit(1); });
setTimeout(() => { console.log(JSON.stringify({error: "timeout"})); ws.close(); process.exit(1); }, 10000);
' 2>/dev/null
}

# ── Formatting helpers ──
_fmt_ms() {
    local ms=$1
    if [[ $ms -ge 1000 ]]; then
        echo "$(echo "scale=1; $ms / 1000" | bc)s"
    else
        echo "${ms}ms"
    fi
}

_color_ttft() {
    local ms=$1 label=$2
    if [[ $ms -ge 10000 ]]; then
        echo -e "  ${RED}✗ ${label}: $(_fmt_ms "$ms")${NC}"
    elif [[ $ms -ge 3000 ]]; then
        echo -e "  ${YELLOW}⚠ ${label}: $(_fmt_ms "$ms")${NC}"
    else
        echo -e "  ${GREEN}✓ ${label}: $(_fmt_ms "$ms")${NC}"
    fi
}

# ── Check gateway availability ──
ACACLAW_UP=false
OPENCLAW_UP=false

if [[ "$MODE" == "both" || "$MODE" == "acaclaw" ]]; then
    if curl -sf --noproxy 127.0.0.1 --max-time 2 "http://127.0.0.1:${ACACLAW_PORT}/" &>/dev/null; then
        ACACLAW_UP=true
        echo -e "${GREEN}✓${NC} AcaClaw gateway running on port ${ACACLAW_PORT}"
    else
        echo -e "${RED}✗${NC} AcaClaw gateway not running on port ${ACACLAW_PORT}"
    fi
fi

if [[ "$MODE" == "both" || "$MODE" == "openclaw" ]]; then
    if curl -sf --noproxy 127.0.0.1 --max-time 2 "http://127.0.0.1:${OPENCLAW_PORT}/" &>/dev/null; then
        OPENCLAW_UP=true
        echo -e "${GREEN}✓${NC} OpenClaw gateway running on port ${OPENCLAW_PORT}"
    else
        echo -e "${YELLOW}⚠${NC} OpenClaw gateway not running on port ${OPENCLAW_PORT}"
        if [[ "$MODE" == "both" ]]; then
            echo -e "  ${DIM}Will only test AcaClaw${NC}"
        fi
    fi
fi

if [[ "$ACACLAW_UP" == "false" && "$OPENCLAW_UP" == "false" ]]; then
    echo -e "\n${RED}No gateway available. Start at least one gateway first.${NC}"
    exit 1
fi

# ── Gather config info ──
echo -e "\n${BOLD}Configuration${NC}"
echo -e "${DIM}────────────────────────────────${NC}"

if [[ "$ACACLAW_UP" == "true" ]]; then
    ac_cfg=$(_get_default_model "$ACACLAW_PORT") || ac_cfg='{"error":"failed"}'
    ac_model=$(echo "$ac_cfg" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('defaultModel','?'))" 2>/dev/null || echo "?")
    ac_thinking=$(echo "$ac_cfg" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('thinkingDefault','?'))" 2>/dev/null || echo "?")
    ac_agents=$(echo "$ac_cfg" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('agentCount',0))" 2>/dev/null || echo "?")
    echo -e "  AcaClaw  │ model: ${CYAN}${ac_model}${NC}  thinking: ${ac_thinking}  agents: ${ac_agents}"
fi

if [[ "$OPENCLAW_UP" == "true" ]]; then
    oc_cfg=$(_get_default_model "$OPENCLAW_PORT") || oc_cfg='{"error":"failed"}'
    oc_model=$(echo "$oc_cfg" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('defaultModel','?'))" 2>/dev/null || echo "?")
    oc_thinking=$(echo "$oc_cfg" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('thinkingDefault','?'))" 2>/dev/null || echo "?")
    oc_agents=$(echo "$oc_cfg" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('agentCount',0))" 2>/dev/null || echo "?")
    echo -e "  OpenClaw │ model: ${CYAN}${oc_model}${NC}  thinking: ${oc_thinking}  agents: ${oc_agents}"
fi

# ── Simple test message ──
TEST_MSG="What is 2+2? Reply with just the number."

echo -e "\n${BOLD}Latency Test (${ROUNDS} rounds)${NC}"
echo -e "${DIM}Message: \"${TEST_MSG}\"${NC}"
echo -e "${DIM}────────────────────────────────${NC}"

# Storage for results
declare -a AC_TTFT=() AC_TOTAL=() AC_ACK=()
declare -a OC_TTFT=() OC_TOTAL=() OC_ACK=()

for i in $(seq 1 "$ROUNDS"); do
    echo -e "\n${BOLD}Round ${i}/${ROUNDS}${NC}"

    if [[ "$ACACLAW_UP" == "true" ]]; then
        echo -e "  ${BLUE}AcaClaw${NC} (port ${ACACLAW_PORT})..."
        result=$(_ws_chat_timed "$ACACLAW_PORT" "$TEST_MSG" "ac-r${i}-$(date +%s)" "acaclaw") || result='{"error":"ws_failed"}'

        if echo "$result" | python3 -c "import sys,json; d=json.load(sys.stdin); exit(0 if d.get('ok') else 1)" 2>/dev/null; then
            ttft=$(echo "$result" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('ttft_ms', 'null'))" 2>/dev/null)
            total=$(echo "$result" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('total_ms', 'null'))" 2>/dev/null)
            ack=$(echo "$result" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('ack_ms', 'null'))" 2>/dev/null)
            deltas=$(echo "$result" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('delta_count', 0))" 2>/dev/null)
            preview=$(echo "$result" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('response_preview','')[:60])" 2>/dev/null)

            if [[ "$ttft" != "null" && "$ttft" != "None" ]]; then
                _color_ttft "$ttft" "TTFT"
                AC_TTFT+=("$ttft")
            else
                echo -e "  ${YELLOW}⚠ TTFT: no deltas received (non-streaming?)${NC}"
            fi
            echo -e "  ${DIM}  ACK: ${ack}ms  Total: $(_fmt_ms "$total")  Deltas: ${deltas}  «${preview}»${NC}"
            AC_TOTAL+=("$total")
            AC_ACK+=("$ack")
        else
            err=$(echo "$result" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('error','unknown'))" 2>/dev/null || echo "parse_error")
            echo -e "  ${RED}✗ AcaClaw error: ${err}${NC}"
        fi
    fi

    if [[ "$OPENCLAW_UP" == "true" ]]; then
        echo -e "  ${BLUE}OpenClaw${NC} (port ${OPENCLAW_PORT})..."
        result=$(_ws_chat_timed "$OPENCLAW_PORT" "$TEST_MSG" "oc-r${i}-$(date +%s)" "openclaw") || result='{"error":"ws_failed"}'

        if echo "$result" | python3 -c "import sys,json; d=json.load(sys.stdin); exit(0 if d.get('ok') else 1)" 2>/dev/null; then
            ttft=$(echo "$result" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('ttft_ms', 'null'))" 2>/dev/null)
            total=$(echo "$result" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('total_ms', 'null'))" 2>/dev/null)
            ack=$(echo "$result" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('ack_ms', 'null'))" 2>/dev/null)
            deltas=$(echo "$result" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('delta_count', 0))" 2>/dev/null)
            preview=$(echo "$result" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('response_preview','')[:60])" 2>/dev/null)

            if [[ "$ttft" != "null" && "$ttft" != "None" ]]; then
                _color_ttft "$ttft" "TTFT"
                OC_TTFT+=("$ttft")
            else
                echo -e "  ${YELLOW}⚠ TTFT: no deltas received (non-streaming?)${NC}"
            fi
            echo -e "  ${DIM}  ACK: ${ack}ms  Total: $(_fmt_ms "$total")  Deltas: ${deltas}  «${preview}»${NC}"
            OC_TOTAL+=("$total")
            OC_ACK+=("$ack")
        else
            err=$(echo "$result" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('error','unknown'))" 2>/dev/null || echo "parse_error")
            echo -e "  ${RED}✗ OpenClaw error: ${err}${NC}"
        fi
    fi
done

# ── Summary ──
echo -e "\n${BOLD}${CYAN}════════════════════════════════════════${NC}"
echo -e "${BOLD}${CYAN}  Summary${NC}"
echo -e "${BOLD}${CYAN}════════════════════════════════════════${NC}"

_avg() {
    local -n arr=$1
    if [[ ${#arr[@]} -eq 0 ]]; then echo "N/A"; return; fi
    local sum=0
    for v in "${arr[@]}"; do sum=$((sum + v)); done
    echo "$((sum / ${#arr[@]}))"
}

_min() {
    local -n arr=$1
    if [[ ${#arr[@]} -eq 0 ]]; then echo "N/A"; return; fi
    local m=${arr[0]}
    for v in "${arr[@]}"; do [[ $v -lt $m ]] && m=$v; done
    echo "$m"
}

_max() {
    local -n arr=$1
    if [[ ${#arr[@]} -eq 0 ]]; then echo "N/A"; return; fi
    local m=${arr[0]}
    for v in "${arr[@]}"; do [[ $v -gt $m ]] && m=$v; done
    echo "$m"
}

echo ""
printf "  ${BOLD}%-12s │ %10s %10s %10s │ %10s %10s %10s │ %8s${NC}\n" \
    "" "TTFT avg" "TTFT min" "TTFT max" "Total avg" "Total min" "Total max" "ACK avg"

if [[ ${#AC_TTFT[@]} -gt 0 ]]; then
    ac_ttft_avg=$(_avg AC_TTFT)
    ac_ttft_min=$(_min AC_TTFT)
    ac_ttft_max=$(_max AC_TTFT)
    ac_total_avg=$(_avg AC_TOTAL)
    ac_total_min=$(_min AC_TOTAL)
    ac_total_max=$(_max AC_TOTAL)
    ac_ack_avg=$(_avg AC_ACK)
    printf "  ${BLUE}%-12s${NC} │ %10s %10s %10s │ %10s %10s %10s │ %8s\n" \
        "AcaClaw" "$(_fmt_ms "$ac_ttft_avg")" "$(_fmt_ms "$ac_ttft_min")" "$(_fmt_ms "$ac_ttft_max")" \
        "$(_fmt_ms "$ac_total_avg")" "$(_fmt_ms "$ac_total_min")" "$(_fmt_ms "$ac_total_max")" \
        "$(_fmt_ms "$ac_ack_avg")"
fi

if [[ ${#OC_TTFT[@]} -gt 0 ]]; then
    oc_ttft_avg=$(_avg OC_TTFT)
    oc_ttft_min=$(_min OC_TTFT)
    oc_ttft_max=$(_max OC_TTFT)
    oc_total_avg=$(_avg OC_TOTAL)
    oc_total_min=$(_min OC_TOTAL)
    oc_total_max=$(_max OC_TOTAL)
    oc_ack_avg=$(_avg OC_ACK)
    printf "  ${BLUE}%-12s${NC} │ %10s %10s %10s │ %10s %10s %10s │ %8s\n" \
        "OpenClaw" "$(_fmt_ms "$oc_ttft_avg")" "$(_fmt_ms "$oc_ttft_min")" "$(_fmt_ms "$oc_ttft_max")" \
        "$(_fmt_ms "$oc_total_avg")" "$(_fmt_ms "$oc_total_min")" "$(_fmt_ms "$oc_total_max")" \
        "$(_fmt_ms "$oc_ack_avg")"
fi

# ── Comparison verdict ──
if [[ ${#AC_TTFT[@]} -gt 0 && ${#OC_TTFT[@]} -gt 0 ]]; then
    echo ""
    ac_avg=$(_avg AC_TTFT)
    oc_avg=$(_avg OC_TTFT)

    if [[ $ac_avg -gt 0 && $oc_avg -gt 0 ]]; then
        ratio=$(echo "scale=2; $ac_avg / $oc_avg" | bc)
        diff=$((ac_avg - oc_avg))

        if [[ $diff -gt 2000 ]]; then
            echo -e "  ${RED}⚠ AcaClaw TTFT is $(_fmt_ms "$diff") slower (${ratio}x)${NC}"
            echo -e "  ${DIM}  Likely cause: larger system prompt (more skills/tools) or different model${NC}"
        elif [[ $diff -gt 500 ]]; then
            echo -e "  ${YELLOW}△ AcaClaw TTFT is $(_fmt_ms "$diff") slower (${ratio}x)${NC}"
        elif [[ $diff -lt -500 ]]; then
            echo -e "  ${GREEN}△ AcaClaw TTFT is $(_fmt_ms "$((-diff))") faster${NC}"
        else
            echo -e "  ${GREEN}✓ TTFT difference is negligible ($(_fmt_ms "$diff"))${NC}"
        fi
    fi

    ac_ack=$(_avg AC_ACK)
    oc_ack=$(_avg OC_ACK)
    ack_diff=$((ac_ack - oc_ack))
    if [[ $ack_diff -gt 100 ]]; then
        echo -e "  ${YELLOW}△ AcaClaw ACK is ${ack_diff}ms slower — check gateway processing overhead${NC}"
    fi
fi

echo ""
echo -e "${DIM}TTFT = time from chat.send to first streaming delta${NC}"
echo -e "${DIM}ACK  = time from connect to chat.send acknowledgment${NC}"
echo -e "${DIM}Total = time from chat.send ACK to final response${NC}"

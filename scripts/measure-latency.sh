#!/usr/bin/env bash
# AcaClaw Startup Latency Monitor
# Measures each phase of the dock app startup sequence.
#
# Usage:
#   bash scripts/measure-latency.sh              # Full benchmark
#   bash scripts/measure-latency.sh --cold       # Cold start (stops gateway first)
#   bash scripts/measure-latency.sh --warm       # Warm start only (gateway running)
#   bash scripts/measure-latency.sh --browser    # Browser-only (page load timing)
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

ACACLAW_PORT="${ACACLAW_PORT:-2090}"
ACACLAW_STATE_DIR="${HOME}/.openclaw-acaclaw"
ACACLAW_CONFIG="${ACACLAW_STATE_DIR}/openclaw.json"
ACACLAW_DATA_DIR="${HOME}/.acaclaw"

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

_color_ms() {
    local ms=$1 label=$2
    local formatted
    formatted="$(_fmt_ms "$ms")"
    if [[ $ms -ge 5000 ]]; then
        echo -e "  ${RED}✗ ${label}: ${formatted}${NC}"
    elif [[ $ms -ge 1000 ]]; then
        echo -e "  ${YELLOW}⚠ ${label}: ${formatted}${NC}"
    else
        echo -e "  ${GREEN}✓ ${label}: ${formatted}${NC}"
    fi
}

# --- Phase 1: PATH bootstrap ---
measure_path_bootstrap() {
    echo -e "\n${BOLD}Phase 1: PATH Bootstrap${NC}"

    local start end

    start=$(_now_ms)
    # Simulate what start.sh does
    command -v openclaw &>/dev/null 2>&1 || true
    end=$(_now_ms)
    _color_ms "$(_elapsed "$start" "$end")" "Check openclaw in PATH"

    # fnm bootstrap
    FNM_PATH="${HOME}/.local/share/fnm"
    if [[ -d "$FNM_PATH" ]]; then
        start=$(_now_ms)
        eval "$(${FNM_PATH}/fnm env 2>/dev/null)" 2>/dev/null || true
        end=$(_now_ms)
        _color_ms "$(_elapsed "$start" "$end")" "fnm env eval"
    fi

    # nvm bootstrap (only if present)
    if [[ -s "${HOME}/.nvm/nvm.sh" ]]; then
        start=$(_now_ms)
        # Don't actually source nvm if fnm already provides openclaw
        if ! command -v openclaw &>/dev/null; then
            source "${HOME}/.nvm/nvm.sh" 2>/dev/null || true
        fi
        end=$(_now_ms)
        _color_ms "$(_elapsed "$start" "$end")" "nvm source (skipped if fnm ok)"
    fi
}

# --- Phase 2: Gateway startup ---
measure_gateway_startup() {
    echo -e "\n${BOLD}Phase 2: Gateway Status${NC}"

    local start end

    # Check if already running
    start=$(_now_ms)
    local running=false
    if curl -sf --max-time 2 "http://127.0.0.1:${ACACLAW_PORT}/" &>/dev/null; then
        running=true
    fi
    end=$(_now_ms)

    if [[ "$running" == "true" ]]; then
        _color_ms "$(_elapsed "$start" "$end")" "Gateway already running on :${ACACLAW_PORT}"
    else
        echo -e "  ${YELLOW}⚠ Gateway not responding on port ${ACACLAW_PORT}${NC}"
    fi

    # Health check
    start=$(_now_ms)
    local health
    health="$(curl -sf --max-time 5 "http://127.0.0.1:${ACACLAW_PORT}/health" 2>/dev/null || echo "failed")"
    end=$(_now_ms)
    _color_ms "$(_elapsed "$start" "$end")" "Health endpoint"
}

# --- Phase 3: Browser page load ---
measure_page_load() {
    echo -e "\n${BOLD}Phase 3: Page Load (curl timing)${NC}"

    if ! curl -sf --max-time 2 "http://127.0.0.1:${ACACLAW_PORT}/" &>/dev/null; then
        echo -e "  ${RED}✗ Gateway not running — skipping page load test${NC}"
        return
    fi

    local start end

    # HTML document
    start=$(_now_ms)
    curl -sf --max-time 10 "http://127.0.0.1:${ACACLAW_PORT}/" -o /dev/null
    end=$(_now_ms)
    _color_ms "$(_elapsed "$start" "$end")" "HTML document"

    # CSS
    local css_file
    css_file="$(curl -sf "http://127.0.0.1:${ACACLAW_PORT}/" | grep -oP 'href="/assets/[^"]*\.css"' | head -1 | tr -d '"' | sed 's/href=//')"
    if [[ -n "$css_file" ]]; then
        start=$(_now_ms)
        curl -sf --max-time 10 "http://127.0.0.1:${ACACLAW_PORT}${css_file}" -o /dev/null
        end=$(_now_ms)
        _color_ms "$(_elapsed "$start" "$end")" "CSS bundle ($(basename "$css_file"))"
    fi

    # JS bundle
    local js_file
    js_file="$(curl -sf "http://127.0.0.1:${ACACLAW_PORT}/" | grep -oP 'src="/assets/[^"]*\.js"' | head -1 | tr -d '"' | sed 's/src=//')"
    if [[ -n "$js_file" ]]; then
        start=$(_now_ms)
        local js_tmp
        js_tmp="$(mktemp)"
        curl -sf --max-time 10 "http://127.0.0.1:${ACACLAW_PORT}${js_file}" -o "$js_tmp"
        end=$(_now_ms)
        local js_size
        js_size="$(wc -c < "$js_tmp")"
        rm -f "$js_tmp"
        local js_kb
        js_kb="$(echo "scale=1; $js_size / 1024" | bc)KB"
        _color_ms "$(_elapsed "$start" "$end")" "JS bundle ($(basename "$js_file"), ${js_kb})"
    fi

    # Font CSS (self-hosted)
    start=$(_now_ms)
    local fonts_ok=true
    curl -sf --max-time 5 "http://127.0.0.1:${ACACLAW_PORT}/fonts/inter.css" -o /dev/null 2>/dev/null || fonts_ok=false
    end=$(_now_ms)
    if [[ "$fonts_ok" == "true" ]]; then
        _color_ms "$(_elapsed "$start" "$end")" "Font CSS (self-hosted)"
    else
        echo -e "  ${YELLOW}⚠ Font CSS not found at /fonts/inter.css${NC}"
    fi

    # Compare: Google Fonts CDN (for reference)
    start=$(_now_ms)
    local cdn_ok=true
    curl -sf --max-time 10 "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" -o /dev/null 2>/dev/null || cdn_ok=false
    end=$(_now_ms)
    if [[ "$cdn_ok" == "true" ]]; then
        _color_ms "$(_elapsed "$start" "$end")" "Google Fonts CDN (reference, not used)"
    else
        echo -e "  ${DIM}  Google Fonts CDN unreachable (not needed — self-hosted)${NC}"
    fi

    # Logo
    start=$(_now_ms)
    curl -sf --max-time 5 "http://127.0.0.1:${ACACLAW_PORT}/logo/AcaClaw.svg" -o /dev/null 2>/dev/null || true
    end=$(_now_ms)
    _color_ms "$(_elapsed "$start" "$end")" "Logo SVG"
}

# --- Phase 4: WebSocket handshake timing ---
measure_ws_handshake() {
    echo -e "\n${BOLD}Phase 4: WebSocket Handshake${NC}"

    if ! curl -sf --max-time 2 "http://127.0.0.1:${ACACLAW_PORT}/" &>/dev/null; then
        echo -e "  ${RED}✗ Gateway not running — skipping WS test${NC}"
        return
    fi

    # Extract auth token before node call to avoid quoting issues
    local auth_token=""
    if [[ -f "${ACACLAW_STATE_DIR}/ui/index.html" ]]; then
        auth_token="$(grep -oP '(?<=oc-token" content=")[^"]+' "${ACACLAW_STATE_DIR}/ui/index.html" | head -1)" || true
    fi

    local start end
    start=$(_now_ms)

    # Use node to measure WS handshake
    local ws_result
    ws_result="$(ACACLAW_PORT="${ACACLAW_PORT}" OC_TOKEN="${auth_token}" node -e '
const WebSocket = require("ws");
const {randomUUID} = require("crypto");
const port = process.env.ACACLAW_PORT || 2090;
const token = process.env.OC_TOKEN || "";
const t0 = Date.now();
const ws = new WebSocket("ws://localhost:" + port + "/");
let t_open, t_challenge, t_connected;
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
                scopes: ["operator.admin","operator.read","operator.write","operator.approvals","operator.pairing"],
                auth: token ? { token } : undefined
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
        ws.close();
        process.exit(0);
    }
});
ws.on("error", (e) => { console.log(JSON.stringify({error: e.message})); process.exit(1); });
setTimeout(() => { console.log(JSON.stringify({error: "timeout"})); process.exit(1); }, 10000);
' 2>/dev/null)" || true

    end=$(_now_ms)

    if [[ -n "$ws_result" ]] && echo "$ws_result" | python3 -c "import json,sys; json.load(sys.stdin)" 2>/dev/null; then
        local ws_open challenge connected
        ws_open="$(echo "$ws_result" | python3 -c "import json,sys; print(json.load(sys.stdin).get('ws_open', -1))")"
        challenge="$(echo "$ws_result" | python3 -c "import json,sys; print(json.load(sys.stdin).get('challenge', -1))")"
        connected="$(echo "$ws_result" | python3 -c "import json,sys; print(json.load(sys.stdin).get('connected', -1))")"

        if [[ "$ws_open" != "-1" ]]; then
            _color_ms "$ws_open" "WebSocket open"
            _color_ms "$((challenge - ws_open))" "Challenge received"
            _color_ms "$((connected - challenge))" "Connect handshake"
            _color_ms "$connected" "Total WS → connected"
            local ws_ok
            ws_ok="$(echo "$ws_result" | python3 -c "import json,sys; print(json.load(sys.stdin).get('ok', False))")"
            if [[ "$ws_ok" != "True" ]]; then
                echo -e "  ${YELLOW}⚠ Auth rejected (connect ok=false) — timing still valid${NC}"
            fi
        else
            local err
            err="$(echo "$ws_result" | python3 -c "import json,sys; print(json.load(sys.stdin).get('error', 'unknown'))")"
            echo -e "  ${RED}✗ WebSocket error: ${err}${NC}"
        fi
    else
        echo -e "  ${RED}✗ WebSocket test failed${NC}"
    fi
}

# --- Phase 5: Cold start (gateway from scratch) ---
measure_cold_start() {
    echo -e "\n${BOLD}Phase 5: Gateway Cold Start${NC}"

    # Stop the gateway
    echo -e "  ${DIM}Stopping gateway...${NC}"
    if command -v systemctl &>/dev/null && systemctl --user is-active acaclaw-gateway.service &>/dev/null 2>&1; then
        systemctl --user stop acaclaw-gateway.service 2>/dev/null || true
    fi
    # Also kill any direct processes
    pkill -f "openclaw.*--profile acaclaw.*gateway" 2>/dev/null || true
    sleep 2

    # Make sure port is free
    if curl -sf --max-time 1 "http://127.0.0.1:${ACACLAW_PORT}/" &>/dev/null; then
        echo -e "  ${RED}✗ Port ${ACACLAW_PORT} still in use after stop${NC}"
        return
    fi

    echo -e "  ${DIM}Starting gateway...${NC}"
    local start end

    start=$(_now_ms)
    if command -v systemctl &>/dev/null && [[ -f "${HOME}/.config/systemd/user/acaclaw-gateway.service" ]]; then
        systemctl --user start acaclaw-gateway.service 2>/dev/null || true
    else
        nohup openclaw --profile acaclaw gateway run \
            --bind loopback --port "$ACACLAW_PORT" --force \
            >> "${ACACLAW_DATA_DIR}/gateway.log" 2>&1 &
    fi

    # Wait for port to respond
    local waited=0
    while [[ $waited -lt 120 ]]; do
        if curl -sf --max-time 1 "http://127.0.0.1:${ACACLAW_PORT}/" &>/dev/null; then
            end=$(_now_ms)
            _color_ms "$(_elapsed "$start" "$end")" "Gateway cold start → port responding"
            return
        fi
        sleep 1
        waited=$((waited + 1))
        echo -ne "\r  ${DIM}Waiting... ${waited}s${NC}  "
    done
    end=$(_now_ms)
    echo ""
    echo -e "  ${RED}✗ Gateway did not respond after 120s ($(_fmt_ms "$(_elapsed "$start" "$end")")${NC}"
}

# --- Summary ---
print_summary() {
    local total=$1
    echo -e "\n${BOLD}═══════════════════════════════════════════${NC}"
    echo -e "${BOLD}Total measured time: $(_fmt_ms "$total")${NC}"
    echo -e "${BOLD}═══════════════════════════════════════════${NC}"

    echo -e "\n${BOLD}Recommendations:${NC}"
    echo -e "  • If font CSS > 50ms: check self-hosted fonts in /fonts/"
    echo -e "  • If fnm env > 200ms: cache the PATH in ~/.acaclaw/path.cache"
    echo -e "  • If cold start > 30s: keep gateway running via systemd"
    echo -e "  • If WS handshake > 200ms: check gateway load / plugin count"
}

# --- Main ---

MODE="${1:---warm}"

echo -e "${BOLD}╔═══════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║     AcaClaw Startup Latency Monitor       ║${NC}"
echo -e "${BOLD}╚═══════════════════════════════════════════╝${NC}"
echo -e "${DIM}Port: ${ACACLAW_PORT} | Config: ${ACACLAW_CONFIG}${NC}"
echo -e "${DIM}Mode: ${MODE}${NC}"

TOTAL_START=$(_now_ms)

case "$MODE" in
    --cold)
        measure_path_bootstrap
        measure_cold_start
        measure_page_load
        measure_ws_handshake
        ;;
    --warm)
        measure_path_bootstrap
        measure_gateway_startup
        measure_page_load
        measure_ws_handshake
        ;;
    --browser)
        measure_page_load
        measure_ws_handshake
        ;;
    *)
        echo "Usage: $0 [--cold|--warm|--browser]"
        exit 1
        ;;
esac

TOTAL_END=$(_now_ms)
print_summary "$(_elapsed "$TOTAL_START" "$TOTAL_END")"

#!/usr/bin/env bash
# AcaClaw Desktop Launcher
# Starts the gateway (if not running) and opens the browser UI.
# Works on: Linux (native), macOS, WSL2
#
# Usage:
#   bash start.sh              # Start gateway + open browser
#   bash start.sh --no-browser # Start gateway only (headless/SSH)
#   bash start.sh --status     # Check if gateway is running
set -euo pipefail

ACACLAW_PORT="${ACACLAW_PORT:-2090}"
ACACLAW_STATE_DIR="${HOME}/.openclaw-acaclaw"
ACACLAW_CONFIG="${ACACLAW_STATE_DIR}/openclaw.json"
ACACLAW_DATA_DIR="${HOME}/.acaclaw"
ACACLAW_PID_FILE="${ACACLAW_DATA_DIR}/gateway.pid"
ACACLAW_LOG_FILE="${ACACLAW_DATA_DIR}/gateway.log"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

log()   { echo -e "${GREEN}[acaclaw]${NC} $*"; }
warn()  { echo -e "${YELLOW}[acaclaw]${NC} $*"; }
error() { echo -e "${RED}[acaclaw]${NC} $*" >&2; }

# --- Platform detection ---

detect_platform() {
    if [[ -n "${WSL_DISTRO_NAME:-}" ]] || grep -qi microsoft /proc/version 2>/dev/null; then
        echo "wsl2"
    elif [[ "$(uname -s)" == "Darwin" ]]; then
        echo "macos"
    elif [[ "$(uname -s)" == "Linux" ]]; then
        echo "linux"
    else
        echo "unknown"
    fi
}

PLATFORM="$(detect_platform)"

# --- Arguments ---

NO_BROWSER=false
STATUS_ONLY=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --no-browser) NO_BROWSER=true; shift ;;
        --status)     STATUS_ONLY=true; shift ;;
        --help|-h)
            echo "AcaClaw Desktop Launcher"
            echo ""
            echo "Usage: start.sh [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --no-browser   Start gateway only (no browser)"
            echo "  --status       Check gateway status and exit"
            echo "  -h, --help     Show this help"
            exit 0
            ;;
        *) error "Unknown option: $1"; exit 1 ;;
    esac
done

# --- Prerequisite checks ---

if [[ ! -f "$ACACLAW_CONFIG" ]]; then
    error "AcaClaw is not installed (config not found at $ACACLAW_CONFIG)"
    error "Run the install script first: bash scripts/install.sh"
    exit 1
fi

if ! command -v openclaw &>/dev/null; then
    error "openclaw command not found. Install OpenClaw first:"
    error "  npm install -g openclaw"
    exit 1
fi

# --- Gateway management ---

gateway_pid() {
    # Check PID file first
    if [[ -f "$ACACLAW_PID_FILE" ]]; then
        local pid
        pid="$(cat "$ACACLAW_PID_FILE" 2>/dev/null)"
        if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
            echo "$pid"
            return 0
        fi
        # Stale PID file — clean up
        rm -f "$ACACLAW_PID_FILE"
    fi

    # Fallback: search for the process by pattern
    local pid
    pid="$(pgrep -f "openclaw.*--profile acaclaw.*gateway" 2>/dev/null | head -1)" || true
    if [[ -n "$pid" ]]; then
        echo "$pid"
        return 0
    fi
    return 1
}

is_gateway_running() {
    gateway_pid &>/dev/null
}

is_port_responding() {
    # Check if the gateway HTTP endpoint is actually responding
    if command -v curl &>/dev/null; then
        curl -sf --max-time 2 "http://127.0.0.1:${ACACLAW_PORT}/health" &>/dev/null
    else
        # Fallback: just check the port
        (echo > "/dev/tcp/127.0.0.1/${ACACLAW_PORT}") 2>/dev/null
    fi
}

wait_for_gateway() {
    local max_wait=15
    local waited=0
    while [[ $waited -lt $max_wait ]]; do
        if is_port_responding; then
            return 0
        fi
        sleep 1
        waited=$((waited + 1))
    done
    return 1
}

# --- Status command ---

if [[ "$STATUS_ONLY" == "true" ]]; then
    if is_gateway_running; then
        pid="$(gateway_pid)"
        if is_port_responding; then
            log "Gateway is running (PID $pid, port $ACACLAW_PORT) — healthy"
        else
            warn "Gateway process exists (PID $pid) but port $ACACLAW_PORT is not responding"
        fi
    else
        log "Gateway is not running"
    fi
    exit 0
fi

# --- Start gateway ---

mkdir -p "$ACACLAW_DATA_DIR"

# --- Ensure auth token is baked into the UI HTML ---
# The built-in control-UI server serves static HTML as-is (no runtime injection).
# After UI rebuilds the token meta tag may be missing. Re-inject if needed.
ensure_token_in_html() {
    local ui_index="${ACACLAW_STATE_DIR}/ui/index.html"
    [[ -f "$ui_index" ]] || return 0
    if ! grep -q 'name="oc-token"' "$ui_index"; then
        local token
        token="$(python3 -c "
import json
try:
    with open('${ACACLAW_CONFIG}') as f:
        c = json.load(f)
    print(c.get('gateway', {}).get('auth', {}).get('token', ''))
except Exception:
    pass
" 2>/dev/null)" || true
        if [[ -n "$token" ]]; then
            sed -i "s|</head>|  <meta name=\"oc-token\" content=\"${token}\" />\n  </head>|" "$ui_index"
            log "Auth token injected into UI"
        fi
    fi
}
ensure_token_in_html

if is_gateway_running; then
    pid="$(gateway_pid)"
    log "Gateway already running (PID $pid)"
else
    log "Starting AcaClaw gateway on port ${ACACLAW_PORT}..."

    # Start gateway in background using AcaClaw's isolated profile
    nohup openclaw --profile acaclaw gateway run \
        --bind loopback --port "$ACACLAW_PORT" --force \
        >> "$ACACLAW_LOG_FILE" 2>&1 &
    GATEWAY_PID=$!

    # Save PID for later management
    echo "$GATEWAY_PID" > "$ACACLAW_PID_FILE"

    log "Gateway starting (PID $GATEWAY_PID)..."

    if wait_for_gateway; then
        log "Gateway ready on port ${ACACLAW_PORT} ✓"
    else
        warn "Gateway started but not yet responding on port ${ACACLAW_PORT}"
        warn "Check logs: tail -f $ACACLAW_LOG_FILE"
    fi
fi

# --- Open browser ---

if [[ "$NO_BROWSER" == "true" ]]; then
    log "Browser launch skipped (--no-browser)"
    log "Visit: ${BOLD}http://localhost:${ACACLAW_PORT}/${NC}"
    exit 0
fi

# The auth token is baked into the UI HTML via the oc-token meta tag
# (injected by ensure_token_in_html above). No need for URL hash tokens.
URL="http://localhost:${ACACLAW_PORT}/"

open_browser() {
    case "$PLATFORM" in
        macos)
            open "$URL" 2>/dev/null
            ;;
        wsl2)
            # WSL2: use Windows browser via powershell.exe or cmd.exe
            if command -v powershell.exe &>/dev/null; then
                powershell.exe -NoProfile -Command "Start-Process '${URL}'" 2>/dev/null
            elif command -v cmd.exe &>/dev/null; then
                cmd.exe /c start "" "${URL}" 2>/dev/null
            elif command -v wslview &>/dev/null; then
                wslview "$URL" 2>/dev/null
            else
                return 1
            fi
            ;;
        linux)
            if [[ -n "${DISPLAY:-}" ]] || [[ -n "${WAYLAND_DISPLAY:-}" ]]; then
                # Graphical session available
                if command -v xdg-open &>/dev/null; then
                    xdg-open "$URL" 2>/dev/null
                elif command -v sensible-browser &>/dev/null; then
                    sensible-browser "$URL" 2>/dev/null
                elif command -v gnome-open &>/dev/null; then
                    gnome-open "$URL" 2>/dev/null
                else
                    return 1
                fi
            else
                # Headless — no display server
                return 1
            fi
            ;;
        *)
            return 1
            ;;
    esac
}

if open_browser; then
    log "Browser opened: ${BOLD}${URL}${NC}"
else
    log "Could not open browser automatically."
    log "Open this URL in your browser:"
    echo ""
    echo -e "  ${BOLD}${URL}${NC}"
    echo ""
fi

log "To stop: bash $(dirname "$0")/stop.sh"

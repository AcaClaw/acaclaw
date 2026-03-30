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

# --- Startup timing log (helps diagnose slow launches) ---
_STARTUP_LOG="${HOME}/.acaclaw/startup-timing.log"
_T0=$(date +%s%N 2>/dev/null || python3 -c "import time; print(int(time.time()*1e9))")
_tlog() {
    local now
    now=$(date +%s%N 2>/dev/null || python3 -c "import time; print(int(time.time()*1e9))")
    local elapsed_ms=$(( (now - _T0) / 1000000 ))
    echo "${elapsed_ms}ms $*" >> "$_STARTUP_LOG"
}
mkdir -p "$(dirname "$_STARTUP_LOG")"
echo "=== $(date) ===" > "$_STARTUP_LOG"
_tlog "start"

# --- PATH bootstrap (desktop launchers don't source .bashrc) ---
# When launched from a .desktop file / dock / Launchpad, the shell has a
# minimal system PATH.  We need node/openclaw, so set up fnm/nvm if present.
# Important: stop as soon as openclaw is found to avoid later tools (nvm)
# overriding the correct Node version set by earlier tools (fnm).
_try_bootstrap() {
    command -v openclaw &>/dev/null && return 0

    # fnm (preferred — respects .node-version / default alias)
    FNM_PATH="${HOME}/.local/share/fnm"
    if [[ -d "$FNM_PATH" ]]; then
        export PATH="${FNM_PATH}:${PATH}"
        eval "$(${FNM_PATH}/fnm env 2>/dev/null)" 2>/dev/null || true
    fi
    command -v openclaw &>/dev/null && return 0

    # nvm (only if fnm didn't provide openclaw)
    export NVM_DIR="${HOME}/.nvm"
    if [[ -s "${NVM_DIR}/nvm.sh" ]]; then
        source "${NVM_DIR}/nvm.sh" 2>/dev/null || true
    fi
    command -v openclaw &>/dev/null && return 0

    # Homebrew (macOS)
    if [[ -x "/opt/homebrew/bin/brew" ]]; then
        eval "$(/opt/homebrew/bin/brew shellenv 2>/dev/null)" 2>/dev/null || true
    elif [[ -x "/usr/local/bin/brew" ]]; then
        eval "$(/usr/local/bin/brew shellenv 2>/dev/null)" 2>/dev/null || true
    fi
    command -v openclaw &>/dev/null && return 0

    # fnm via Homebrew (fnm is on PATH after brew shellenv but fnm env not yet loaded)
    if command -v fnm &>/dev/null; then
        eval "$(fnm env 2>/dev/null)" 2>/dev/null || true
    fi
    command -v openclaw &>/dev/null && return 0

    # Common additional paths
    for d in "${HOME}/.npm-global/bin" "${HOME}/.cargo/bin" "${HOME}/.acaclaw/miniforge3/bin"; do
        [[ -d "$d" ]] && export PATH="${d}:${PATH}"
    done
    return 0
}
_try_bootstrap
_tlog "PATH bootstrap done"

# --- Proxy bootstrap (desktop launchers don't inherit proxy env) ---
# Source proxy vars from the system proxy config if not already set.
_load_proxy() {
    [[ -n "${HTTP_PROXY:-}" ]] && return 0
    # Check common proxy config locations
    for f in "${HOME}/.proxy_env" "${HOME}/.config/proxy.env"; do
        if [[ -f "$f" ]]; then
            # shellcheck disable=SC1090
            source "$f"
            return 0
        fi
    done
    # Fallback: try to read from systemd unit env (if openclaw-gateway.service exists)
    if command -v systemctl &>/dev/null; then
        local env_line
        env_line="$(systemctl --user show openclaw-gateway.service -p Environment 2>/dev/null || true)"
        if [[ "$env_line" == *"HTTP_PROXY="* ]]; then
            local proxy_val
            proxy_val="$(echo "$env_line" | grep -oP 'HTTP_PROXY=\S+' | head -1 | cut -d= -f2)"
            if [[ -n "$proxy_val" ]]; then
                export HTTP_PROXY="$proxy_val" HTTPS_PROXY="$proxy_val"
                export http_proxy="$proxy_val" https_proxy="$proxy_val"
                local no_proxy_val
                no_proxy_val="$(echo "$env_line" | grep -oP 'NO_PROXY=\S+' | head -1 | cut -d= -f2)"
                [[ -n "$no_proxy_val" ]] && export NO_PROXY="$no_proxy_val" no_proxy="$no_proxy_val"
                local all_proxy_val
                all_proxy_val="$(echo "$env_line" | grep -oP 'ALL_PROXY=\S+' | head -1 | cut -d= -f2)"
                [[ -n "$all_proxy_val" ]] && export ALL_PROXY="$all_proxy_val" all_proxy="$all_proxy_val"
            fi
        fi
    fi
}
_load_proxy
_tlog "proxy loaded"

ACACLAW_PORT="${ACACLAW_PORT:-2090}"
OPENCLAW_DIR="${HOME}/.openclaw"
ACACALAW_CONFIG="${OPENCLAW_DIR}/openclaw.json"
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
    # Node.js may rewrite the process title, so try multiple patterns
    local pid
    pid="$(pgrep -f "openclaw.*gateway.*--port ${ACACLAW_PORT}" 2>/dev/null | head -1)" || true
    if [[ -n "$pid" ]]; then
        echo "$pid"
        return 0
    fi

    # Fallback: check if systemd service is running (Node.js rewrites process titles)
    if command -v systemctl &>/dev/null; then
        for _unit in "openclaw-gateway-acaclaw.service" "acaclaw-gateway.service"; do
            if systemctl --user is-active "$_unit" &>/dev/null 2>&1; then
                pid="$(systemctl --user show "$_unit" --property=MainPID --value 2>/dev/null)" || true
                if [[ -n "$pid" && "$pid" != "0" ]]; then
                    echo "$pid"
                    return 0
                fi
            fi
        done
    fi

    return 1
}

is_gateway_running() {
    gateway_pid &>/dev/null
}

is_port_responding() {
    if command -v curl &>/dev/null; then
        # --noproxy: system curl 7.81 doesn't support CIDR in NO_PROXY,
        # so localhost gets routed through the HTTP proxy and fails.
        curl -sf --max-time 2 --noproxy 127.0.0.1 "http://127.0.0.1:${ACACLAW_PORT}/" &>/dev/null
    else
        (echo > "/dev/tcp/127.0.0.1/${ACACLAW_PORT}") 2>/dev/null
    fi
}

wait_for_gateway() {
    local max_wait="${1:-45}"
    local waited=0
    while [[ $waited -lt $max_wait ]]; do
        if is_port_responding; then
            return 0
        fi
        sleep 0.5
        waited=$((waited + 1))
        # Show progress every 5 iterations (every ~2.5s)
        if (( waited % 5 == 0 )); then
            local secs
            secs="$(echo "scale=0; $waited / 2" | bc)"
            echo -ne "\r${BLUE}[acaclaw]${NC} Waiting for gateway... ${secs}s  "
        fi
    done
    [[ $waited -ge 10 ]] && echo ""  # newline after progress
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

# --- Stale lock cleanup (non-fatal) ---
if [[ -f "$ACACLAW_PID_FILE" ]]; then
    stale_pid="$(cat "$ACACLAW_PID_FILE" 2>/dev/null)" || true
    if [[ -n "$stale_pid" ]] && ! kill -0 "$stale_pid" 2>/dev/null; then
        rm -f "$ACACLAW_PID_FILE"
    fi
fi

# --- Service detection ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Detect the actual gateway service (skip legacy --profile services)
detect_gateway_service() {
    if command -v systemctl &>/dev/null; then
        for unit in "acaclaw-gateway.service" "openclaw-gateway-acaclaw.service"; do
            local unit_path="${HOME}/.config/systemd/user/${unit}"
            # Skip service files with --profile (causes wrong config dir)
            [[ -f "$unit_path" ]] && grep -q -- "--profile" "$unit_path" 2>/dev/null && continue
            if systemctl --user is-active "$unit" &>/dev/null 2>&1 || \
               [[ -f "$unit_path" ]]; then
                echo "$unit"
                return 0
            fi
        done
    fi
    return 1
}
GATEWAY_SERVICE="$(detect_gateway_service 2>/dev/null)" || GATEWAY_SERVICE=""
SYSTEMD_UNIT="${HOME}/.config/systemd/user/${GATEWAY_SERVICE:-acaclaw-gateway.service}"
USE_SERVICE=false
if [[ -n "$GATEWAY_SERVICE" ]] && [[ -f "$SYSTEMD_UNIT" ]] && command -v systemctl &>/dev/null; then
    USE_SERVICE=true
fi
_tlog "service detection done"

# --- Start gateway ---
_tlog "gateway check start"
if is_gateway_running && is_port_responding; then
    pid="$(gateway_pid)"
    log "Gateway already running (PID $pid)"
elif is_gateway_running; then
    pid="$(gateway_pid)"
    log "Gateway already running (PID $pid)"
elif [[ "$USE_SERVICE" == "true" ]]; then
    log "Starting AcaClaw gateway via systemd service..."
    if systemctl --user start "${GATEWAY_SERVICE}" 2>/dev/null; then
        if wait_for_gateway 90; then
            log "Gateway ready on port ${ACACLAW_PORT} ✓ (managed by systemd)"
        elif systemctl --user is-active "${GATEWAY_SERVICE}" &>/dev/null; then
            log "Gateway service is starting (managed by systemd) — may need a moment"
        else
            warn "systemd service stopped unexpectedly — falling back to direct start"
            nohup openclaw gateway run \
                --bind loopback --port "$ACACLAW_PORT" --force \
                >> "$ACACLAW_LOG_FILE" 2>&1 &
            echo "$!" > "$ACACLAW_PID_FILE"
            log "Gateway starting (PID $!)..."
        fi
    else
        warn "systemd start failed — falling back to direct start"
        nohup openclaw gateway run \
            --bind loopback --port "$ACACLAW_PORT" --force \
            >> "$ACACLAW_LOG_FILE" 2>&1 &
        echo "$!" > "$ACACLAW_PID_FILE"
        log "Gateway starting (PID $!)..."
    fi
else
    log "Starting AcaClaw gateway on port ${ACACLAW_PORT}..."

    nohup openclaw gateway run \
        --bind loopback --port "$ACACLAW_PORT" --force \
        >> "$ACACLAW_LOG_FILE" 2>&1 &
    GATEWAY_PID=$!

    echo "$GATEWAY_PID" > "$ACACLAW_PID_FILE"

    log "Gateway starting (PID $GATEWAY_PID)..."

    if wait_for_gateway; then
        log "Gateway ready on port ${ACACLAW_PORT} ✓"
    else
        warn "Gateway started but not yet responding on port ${ACACLAW_PORT}"
        warn "Check logs: tail -f $ACACLAW_LOG_FILE"
    fi
fi

# --- Clean browser profile (reduce cold start time) ---
_clean_browser_profile() {
    local profile="${ACACLAW_DATA_DIR}/browser-app"
    [[ -d "$profile" ]] || return 0

    # Remove stale singleton locks (leftover from crashed/killed Edge)
    if [[ -L "$profile/SingletonLock" ]]; then
        local lock_target
        lock_target="$(readlink "$profile/SingletonLock" 2>/dev/null)" || true
        local lock_pid="${lock_target##*-}"
        if [[ -n "$lock_pid" ]] && ! kill -0 "$lock_pid" 2>/dev/null; then
            rm -f "$profile/SingletonLock" "$profile/SingletonCookie" "$profile/SingletonSocket"
        fi
    fi

    rm -rf \
        "$profile/BrowserMetrics" \
        "$profile/WidevineCdm" \
        "$profile/Edge Wallet" \
        "$profile/Edge Shopping" \
        "$profile/Speech Recognition" \
        "$profile/component_crx_cache" \
        "$profile/GrShaderCache" \
        "$profile/ShaderCache" \
        "$profile/Default/Service Worker" \
        "$profile/Default/Cache" \
        "$profile/Default/Code Cache" \
        "$profile/Default/GPUCache" \
        2>/dev/null || true
}
_clean_browser_profile
_tlog "browser profile cleaned"

# --- Open browser ---

if [[ "$NO_BROWSER" == "true" ]]; then
    log "Browser launch skipped (--no-browser)"
    log "Visit: ${BOLD}http://localhost:${ACACLAW_PORT}/${NC}"
    exit 0
fi

# Wait briefly if gateway is still initializing (should be rare after above waits)
if ! is_port_responding; then
    _tlog "gateway not responding - waiting"
    log "Waiting for gateway to be ready..."
    wait_for_gateway 30 || warn "Gateway not responding yet — opening browser anyway"
    _tlog "gateway wait done"
fi

_tlog "pre-browser"

URL="http://localhost:${ACACLAW_PORT}/"

open_app_window() {
    # Open AcaClaw as a standalone app window (no address bar, no tabs).
    # Must use the real browser binary (not the wrapper) with --profile-directory
    # and --app=URL, matching how Edge/Chrome create their own web app launchers.
    case "$PLATFORM" in
        macos)
            if [[ -d "/Applications/Microsoft Edge.app" ]]; then
                open -na "Microsoft Edge" --args --app="$URL" 2>/dev/null
            elif [[ -d "/Applications/Google Chrome.app" ]]; then
                open -na "Google Chrome" --args --app="$URL" 2>/dev/null
            else
                open "$URL" 2>/dev/null
            fi
            ;;
        wsl2)
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
            if [[ -z "${DISPLAY:-}" ]] && [[ -z "${WAYLAND_DISPLAY:-}" ]]; then
                return 1
            fi
            # Use --user-data-dir to force a NEW browser instance so --app=URL
            # is honoured. Without it, the IPC handoff to the existing browser
            # silently drops the --app flag and opens a regular tab.
            local app_profile="${ACACLAW_DATA_DIR}/browser-app"

            # Disable heavy Edge/Chrome features for faster app-window startup
            # Note: this is an --app=localhost window with no external navigation,
            # so browser security features (SmartScreen, phishing) aren't needed.
            local -a app_flags=(
                --user-data-dir="$app_profile"
                --app="$URL"
                --no-first-run
                --no-default-browser-check
                --disable-background-networking
                --disable-component-update
                --disable-sync
                --disable-translate
                --disable-default-apps
                --disable-extensions
                --disable-features=TranslateUI,OptimizationHints,MediaRouter,EdgeCollections,EdgeDiscoverWidget,msEdgeShopping,EdgeWallet,msEdgeOnRamp
                --password-store=basic
            )

            if [[ -x "/opt/microsoft/msedge/microsoft-edge" ]]; then
                /opt/microsoft/msedge/microsoft-edge "${app_flags[@]}" &
            elif [[ -x "/opt/google/chrome/google-chrome" ]]; then
                /opt/google/chrome/google-chrome "${app_flags[@]}" &
            elif command -v chromium-browser &>/dev/null; then
                chromium-browser "${app_flags[@]}" &
            elif command -v xdg-open &>/dev/null; then
                xdg-open "$URL" 2>/dev/null
            else
                return 1
            fi
            ;;
        *)
            return 1
            ;;
    esac
}

if open_app_window; then
    _tlog "browser launched"
    log "AcaClaw opened: ${BOLD}${URL}${NC}"
else
    _tlog "browser launch failed"
    log "Could not open AcaClaw automatically."
    log "Open this URL in your browser:"
    echo ""
    echo -e "  ${BOLD}${URL}${NC}"
    echo ""
fi

_tlog "script done"

log "To stop: bash $(dirname "$0")/stop.sh"

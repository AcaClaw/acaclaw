#!/usr/bin/env bash
# AcaClaw Gateway Stop
# Gracefully stops the AcaClaw gateway process.
# If managed by systemd, stops the service (prevents auto-restart).
set -euo pipefail

ACACLAW_DATA_DIR="${HOME}/.acaclaw"
ACACLAW_PID_FILE="${ACACLAW_DATA_DIR}/gateway.pid"
SYSTEMD_UNIT="acaclaw-gateway.service"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log()   { echo -e "${GREEN}[acaclaw]${NC} $*"; }
warn()  { echo -e "${YELLOW}[acaclaw]${NC} $*"; }
error() { echo -e "${RED}[acaclaw]${NC} $*" >&2; }

# --- Stop systemd service first (if active) ---
if command -v systemctl &>/dev/null; then
    if systemctl --user is-active "${SYSTEMD_UNIT}" &>/dev/null; then
        log "Stopping systemd service..."
        systemctl --user stop "${SYSTEMD_UNIT}" 2>/dev/null || true
        rm -f "$ACACLAW_PID_FILE"
        log "Gateway stopped ✓ (systemd service stopped)"
        exit 0
    fi
fi

# --- Fallback: manual process stop ---

find_gateway_pid() {
    if [[ -f "$ACACLAW_PID_FILE" ]]; then
        local pid
        pid="$(cat "$ACACLAW_PID_FILE" 2>/dev/null)"
        if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
            echo "$pid"
            return 0
        fi
        rm -f "$ACACLAW_PID_FILE"
    fi

    local pid
    pid="$(pgrep -f "openclaw.*gateway.*--port 2090" 2>/dev/null | head -1)" || true
    if [[ -n "$pid" ]]; then
        echo "$pid"
        return 0
    fi

    # Fallback: check systemd MainPID
    if command -v systemctl &>/dev/null && systemctl --user is-active "${SYSTEMD_UNIT}" &>/dev/null 2>&1; then
        pid="$(systemctl --user show "${SYSTEMD_UNIT}" --property=MainPID --value 2>/dev/null)" || true
        if [[ -n "$pid" && "$pid" != "0" ]]; then
            echo "$pid"
            return 0
        fi
    fi

    return 1
}

if ! pid="$(find_gateway_pid)"; then
    log "Gateway is not running"
    rm -f "$ACACLAW_PID_FILE"
    exit 0
fi

log "Stopping gateway (PID $pid)..."

# Graceful shutdown (SIGTERM), then force (SIGKILL) after timeout
kill "$pid" 2>/dev/null || true

# Wait up to 5 seconds for graceful shutdown
waited=0
while [[ $waited -lt 5 ]] && kill -0 "$pid" 2>/dev/null; do
    sleep 1
    waited=$((waited + 1))
done

if kill -0 "$pid" 2>/dev/null; then
    warn "Gateway did not stop gracefully, sending SIGKILL..."
    kill -9 "$pid" 2>/dev/null || true
fi

rm -f "$ACACLAW_PID_FILE"
log "Gateway stopped ✓"

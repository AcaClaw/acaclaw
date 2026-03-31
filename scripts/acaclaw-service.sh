#!/usr/bin/env bash
# AcaClaw Gateway Service Manager
# Thin wrapper around OpenClaw's native daemon management.
# Delegates to `openclaw daemon install/uninstall/start/stop/restart/status`
# which handles systemd (Linux) and launchd (macOS) natively.
#
# Usage:
#   bash acaclaw-service.sh install   # Install and enable the service
#   bash acaclaw-service.sh remove    # Disable and remove the service
#   bash acaclaw-service.sh status    # Check service status
#   bash acaclaw-service.sh start     # Start the service
#   bash acaclaw-service.sh stop      # Stop the service
set -euo pipefail

ACACLAW_PORT="${ACACLAW_PORT:-2090}"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log()   { echo -e "${GREEN}[acaclaw]${NC} $*"; }
warn()  { echo -e "${YELLOW}[acaclaw]${NC} $*"; }
error() { echo -e "${RED}[acaclaw]${NC} $*" >&2; }

# --- Ensure openclaw is available ---

if ! command -v openclaw &>/dev/null; then
    error "openclaw binary not found in PATH"
    exit 1
fi

# --- Legacy cleanup ---
# Remove old AcaClaw-specific service files that predated delegation to OpenClaw.
# These are safe to remove since we now use openclaw daemon install.

_cleanup_legacy() {
    # Linux: remove old acaclaw-gateway.service and openclaw-gateway-acaclaw.service
    local systemd_dir="${HOME}/.config/systemd/user"
    for unit in "acaclaw-gateway.service" "openclaw-gateway-acaclaw.service"; do
        if [[ -f "${systemd_dir}/${unit}" ]]; then
            systemctl --user stop "${unit}" 2>/dev/null || true
            systemctl --user disable "${unit}" 2>/dev/null || true
            rm -f "${systemd_dir}/${unit}"
            log "Removed legacy service: ${unit}"
        fi
    done
    [[ -d "$systemd_dir" ]] && systemctl --user daemon-reload 2>/dev/null || true

    # macOS: remove old com.acaclaw.gateway plist
    local plist="${HOME}/Library/LaunchAgents/com.acaclaw.gateway.plist"
    if [[ -f "$plist" ]]; then
        launchctl bootout "gui/$(id -u)/com.acaclaw.gateway" 2>/dev/null || true
        rm -f "$plist"
        log "Removed legacy launchd agent: com.acaclaw.gateway"
    fi
}

# --- Dispatch to openclaw daemon commands ---

ACTION="${1:-status}"

case "$ACTION" in
    install)
        _cleanup_legacy
        log "Installing gateway service via OpenClaw daemon..."
        openclaw daemon install --port "${ACACLAW_PORT}" --force
        # Linux: enable lingering so the service runs without GUI login
        if [[ "$(uname -s)" == "Linux" ]]; then
            loginctl enable-linger "$(whoami)" 2>/dev/null || true
        fi
        log "Gateway service installed ✓"
        ;;
    remove)
        log "Removing gateway service..."
        openclaw daemon uninstall 2>/dev/null || true
        _cleanup_legacy
        log "Gateway service removed ✓"
        ;;
    status)
        openclaw daemon status 2>/dev/null || log "Gateway service not installed"
        ;;
    start)
        openclaw daemon start 2>/dev/null || {
            warn "Service start failed — is the service installed?"
            warn "Run: bash $0 install"
            exit 1
        }
        ;;
    stop)
        openclaw daemon stop 2>/dev/null || true
        ;;
    *)
        error "Unknown action: $ACTION (use: install, remove, status, start, stop)"
        exit 1
        ;;
esac

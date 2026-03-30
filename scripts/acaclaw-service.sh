#!/usr/bin/env bash
# AcaClaw Gateway Service Manager
# Installs/removes a systemd user service that auto-restarts the gateway on crash.
# On macOS, installs a launchd user agent instead.
#
# Usage:
#   bash acaclaw-service.sh install   # Install and enable the service
#   bash acaclaw-service.sh remove    # Disable and remove the service
#   bash acaclaw-service.sh status    # Check service status
set -euo pipefail

ACACLAW_PORT="${ACACLAW_PORT:-2090}"
OPENCLAW_DIR="${HOME}/.openclaw"
ACACLAW_DATA_DIR="${HOME}/.acaclaw"
ACACLAW_LOG_FILE="${ACACLAW_DATA_DIR}/gateway.log"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
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

# Find openclaw binary path (resolve to a stable, session-independent location)
# fnm uses ephemeral /run/user/.../fnm_multishells/... symlinks that vanish between sessions.
# We follow those to get the real path under ~/.local/share/fnm/node-versions/.../bin/
OPENCLAW_BIN=""
OPENCLAW_BIN_DIR=""
if command -v openclaw &>/dev/null; then
    OPENCLAW_BIN="$(command -v openclaw)"
    _orig_dir="$(dirname "$OPENCLAW_BIN")"

    if [[ "$_orig_dir" == *"fnm_multishells"* ]] && command -v readlink &>/dev/null; then
        _resolved="$(readlink -f "$OPENCLAW_BIN" 2>/dev/null)" || true
        if [[ -n "${_resolved:-}" && -x "${_resolved:-}" ]]; then
            _install_root="$(dirname "$_resolved")"
            while [[ "$_install_root" != "/" ]]; do
                if [[ -x "${_install_root}/bin/node" ]]; then
                    OPENCLAW_BIN="${_install_root}/bin/openclaw"
                    OPENCLAW_BIN_DIR="${_install_root}/bin"
                    break
                fi
                _install_root="$(dirname "$_install_root")"
            done
        fi
    fi

    if [[ -z "$OPENCLAW_BIN_DIR" ]]; then
        OPENCLAW_BIN_DIR="$(dirname "$OPENCLAW_BIN")"
    fi
fi

# --- Linux: systemd user service ---

SYSTEMD_DIR="${HOME}/.config/systemd/user"
SYSTEMD_UNIT="acaclaw-gateway.service"
# If OpenClaw's own profile service exists, use that instead
OC_PROFILE_UNIT="openclaw-gateway-acaclaw.service"
if [[ -f "${SYSTEMD_DIR}/${OC_PROFILE_UNIT}" ]]; then
    SYSTEMD_UNIT="${OC_PROFILE_UNIT}"
fi

install_systemd() {
    if [[ -z "$OPENCLAW_BIN" ]]; then
        error "openclaw binary not found in PATH"
        exit 1
    fi

    mkdir -p "$SYSTEMD_DIR"

    # Write a small helper script for stale lock cleanup (ExecStartPre)
    local cleanup_script="${ACACLAW_DATA_DIR}/cleanup-locks.sh"
    mkdir -p "$ACACLAW_DATA_DIR"
    cat > "$cleanup_script" <<'CLEANUP'
#!/usr/bin/env bash
# Remove stale OpenClaw gateway lock files left by crashed processes
LOCK_DIR="/tmp/openclaw-$(id -u)"
[ -d "$LOCK_DIR" ] || exit 0
for lockfile in "$LOCK_DIR"/gateway.*.lock; do
    [ -f "$lockfile" ] || continue
    pid=$(python3 -c "import json; print(json.load(open('$lockfile')).get('pid',0))" 2>/dev/null) || true
    [ -n "$pid" ] && [ "$pid" != "0" ] && ! kill -0 "$pid" 2>/dev/null && rm -f "$lockfile"
done
exit 0
CLEANUP
    chmod +x "$cleanup_script"

    # Build a sanitized PATH for systemd:
    #  - skip dirs with spaces (systemd can't parse them in Environment=)
    #  - skip ephemeral fnm multishell dirs (they vanish between sessions)
    #  - include the resolved binary's parent dir to ensure node/openclaw are found
    local safe_path=""
    if [[ -d "$OPENCLAW_BIN_DIR" && "$OPENCLAW_BIN_DIR" != *"fnm_multishells"* ]]; then
        safe_path="$OPENCLAW_BIN_DIR"
    fi

    local IFS=':'
    for dir in $PATH; do
        [[ -d "$dir" ]] || continue
        [[ "$dir" == *" "* ]] && continue
        [[ "$dir" == *"fnm_multishells"* ]] && continue
        [[ "$safe_path" == *"$dir"* ]] && continue
        safe_path="${safe_path:+${safe_path}:}${dir}"
    done

    cat > "${SYSTEMD_DIR}/${SYSTEMD_UNIT}" <<UNIT
[Unit]
Description=AcaClaw Gateway
After=network.target
StartLimitIntervalSec=60
StartLimitBurst=5

[Service]
Type=simple
ExecStartPre=-${cleanup_script}
ExecStart=${OPENCLAW_BIN} gateway run --bind loopback --port ${ACACLAW_PORT} --force
Restart=always
RestartSec=3
StandardOutput=append:${ACACLAW_LOG_FILE}
StandardError=append:${ACACLAW_LOG_FILE}
Environment=HOME=${HOME}
Environment="PATH=${safe_path}"
Environment=NODE_OPTIONS=--max-old-space-size=512

[Install]
WantedBy=default.target
UNIT

    # Reload, enable, and start
    systemctl --user daemon-reload
    systemctl --user enable "${SYSTEMD_UNIT}" 2>/dev/null
    # Enable lingering so the service runs even when user is not logged in via GUI
    # (important for headless/SSH scenarios)
    loginctl enable-linger "$(whoami)" 2>/dev/null || true

    log "systemd user service installed and enabled"
    log "Gateway will auto-restart on crash (max 5 restarts per 60s)"
}

remove_systemd() {
    if [[ -f "${SYSTEMD_DIR}/${SYSTEMD_UNIT}" ]]; then
        systemctl --user stop "${SYSTEMD_UNIT}" 2>/dev/null || true
        systemctl --user disable "${SYSTEMD_UNIT}" 2>/dev/null || true
        rm -f "${SYSTEMD_DIR}/${SYSTEMD_UNIT}"
        systemctl --user daemon-reload
        log "systemd user service removed"
    else
        log "No systemd service found"
    fi
}

status_systemd() {
    if [[ -f "${SYSTEMD_DIR}/${SYSTEMD_UNIT}" ]]; then
        systemctl --user status "${SYSTEMD_UNIT}" --no-pager 2>/dev/null || true
    else
        log "systemd service not installed"
    fi
}

start_systemd() {
    if [[ -f "${SYSTEMD_DIR}/${SYSTEMD_UNIT}" ]]; then
        systemctl --user start "${SYSTEMD_UNIT}"
    else
        warn "systemd service not installed — run: bash $0 install"
        return 1
    fi
}

stop_systemd() {
    if [[ -f "${SYSTEMD_DIR}/${SYSTEMD_UNIT}" ]]; then
        systemctl --user stop "${SYSTEMD_UNIT}" 2>/dev/null || true
    fi
}

# --- macOS: launchd user agent ---

LAUNCHD_DIR="${HOME}/Library/LaunchAgents"
LAUNCHD_LABEL="com.acaclaw.gateway"
LAUNCHD_PLIST="${LAUNCHD_DIR}/${LAUNCHD_LABEL}.plist"

install_launchd() {
    if [[ -z "$OPENCLAW_BIN" ]]; then
        error "openclaw binary not found in PATH"
        exit 1
    fi

    mkdir -p "$LAUNCHD_DIR" "${ACACLAW_DATA_DIR}"

    cat > "$LAUNCHD_PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${LAUNCHD_LABEL}</string>
    <key>ProgramArguments</key>
    <array>
        <string>${OPENCLAW_BIN}</string>
        <string>gateway</string>
        <string>run</string>
        <string>--bind</string>
        <string>loopback</string>
        <string>--port</string>
        <string>${ACACLAW_PORT}</string>
        <string>--force</string>
    </array>
    <key>RunAtLoad</key>
    <false/>
    <key>KeepAlive</key>
    <dict>
        <key>SuccessfulExit</key>
        <false/>
    </dict>
    <key>ThrottleInterval</key>
    <integer>5</integer>
    <key>StandardOutPath</key>
    <string>${ACACLAW_LOG_FILE}</string>
    <key>StandardErrorPath</key>
    <string>${ACACLAW_LOG_FILE}</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>${PATH}</string>
    </dict>
</dict>
</plist>
PLIST

    log "launchd user agent installed"
    log "Gateway will auto-restart on crash"
}

remove_launchd() {
    if [[ -f "$LAUNCHD_PLIST" ]]; then
        launchctl bootout "gui/$(id -u)/${LAUNCHD_LABEL}" 2>/dev/null || true
        rm -f "$LAUNCHD_PLIST"
        log "launchd user agent removed"
    else
        log "No launchd agent found"
    fi
}

status_launchd() {
    if launchctl print "gui/$(id -u)/${LAUNCHD_LABEL}" &>/dev/null; then
        launchctl print "gui/$(id -u)/${LAUNCHD_LABEL}" 2>/dev/null | head -15
    else
        log "launchd agent not loaded"
    fi
}

start_launchd() {
    if [[ -f "$LAUNCHD_PLIST" ]]; then
        launchctl bootstrap "gui/$(id -u)" "$LAUNCHD_PLIST" 2>/dev/null || \
            launchctl kickstart "gui/$(id -u)/${LAUNCHD_LABEL}" 2>/dev/null || true
    else
        warn "launchd agent not installed — run: bash $0 install"
        return 1
    fi
}

stop_launchd() {
    launchctl bootout "gui/$(id -u)/${LAUNCHD_LABEL}" 2>/dev/null || true
}

# --- Dispatch by platform ---

ACTION="${1:-status}"

case "$PLATFORM" in
    linux|wsl2)
        if ! command -v systemctl &>/dev/null; then
            error "systemctl not available — systemd user services not supported on this system"
            exit 1
        fi
        case "$ACTION" in
            install) install_systemd ;;
            remove)  remove_systemd ;;
            status)  status_systemd ;;
            start)   start_systemd ;;
            stop)    stop_systemd ;;
            *) error "Unknown action: $ACTION (use: install, remove, status, start, stop)"; exit 1 ;;
        esac
        ;;
    macos)
        case "$ACTION" in
            install) install_launchd ;;
            remove)  remove_launchd ;;
            status)  status_launchd ;;
            start)   start_launchd ;;
            stop)    stop_launchd ;;
            *) error "Unknown action: $ACTION (use: install, remove, status, start, stop)"; exit 1 ;;
        esac
        ;;
    *)
        error "Unsupported platform: $PLATFORM"
        exit 1
        ;;
esac

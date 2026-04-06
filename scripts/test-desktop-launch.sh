#!/usr/bin/env bash
# AcaClaw Desktop Launch Diagnostic
# Launches AcaClaw.app and records what happens: timing, processes, Dock state.
# Reports PASS/FAIL for each criterion.
#
# Usage:
#   bash scripts/test-desktop-launch.sh
#   bash scripts/test-desktop-launch.sh --verbose
set -euo pipefail

VERBOSE=false
[[ "${1:-}" == "--verbose" ]] && VERBOSE=true

APP_BUNDLE="${HOME}/Applications/AcaClaw.app"
LOG_DIR="${HOME}/.acaclaw/desktop-launch-diag"
LOG_FILE="${LOG_DIR}/$(date +%Y%m%d-%H%M%S).log"
STARTUP_LOG="${HOME}/.acaclaw/startup-timing.log"
PORT=2090

mkdir -p "$LOG_DIR"

# --- Helpers ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'
PASS_COUNT=0
FAIL_COUNT=0
WARN_COUNT=0

_log() { echo "$*" >> "$LOG_FILE"; $VERBOSE && echo "$*" || true; }
_pass() { echo -e "${GREEN}  PASS${NC} $*"; ((PASS_COUNT++)); _log "PASS: $*"; }
_fail() { echo -e "${RED}  FAIL${NC} $*"; ((FAIL_COUNT++)); _log "FAIL: $*"; }
_warn() { echo -e "${YELLOW}  WARN${NC} $*"; ((WARN_COUNT++)); _log "WARN: $*"; }
_info() { echo -e "  ${BOLD}INFO${NC} $*"; _log "INFO: $*"; }

# --- Pre-flight: kill existing AcaClaw/Edge-app processes ---
echo ""
echo -e "${BOLD}=== AcaClaw Desktop Launch Diagnostic ===${NC}"
echo ""

echo -e "${BOLD}Phase 0: Pre-flight cleanup${NC}"

# Record any existing Edge processes before we start
EDGE_PIDS_BEFORE=$(pgrep -f "Microsoft Edge" 2>/dev/null | sort || true)
_log "Edge PIDs before launch: ${EDGE_PIDS_BEFORE:-none}"

# Check for existing AcaClaw app processes
ACACLAW_PIDS_BEFORE=$(pgrep -f "AcaClaw" 2>/dev/null | sort || true)
if [[ -n "$ACACLAW_PIDS_BEFORE" ]]; then
    _warn "Existing AcaClaw processes found: $ACACLAW_PIDS_BEFORE"
    _info "Kill them first for a clean test: pkill -f AcaClaw"
    echo ""
    echo "Existing AcaClaw processes detected. Kill them and retry? (y/N)"
    read -r REPLY
    if [[ "$REPLY" =~ ^[Yy]$ ]]; then
        pkill -f "AcaClaw" 2>/dev/null || true
        sleep 1
    else
        echo "Aborting."
        exit 1
    fi
fi

# Check gateway state
GATEWAY_RUNNING=false
if curl -sf "http://localhost:${PORT}/health" &>/dev/null; then
    GATEWAY_RUNNING=true
    _info "Gateway already running on port ${PORT}"
else
    _info "Gateway not running (will be started by .app)"
fi

# --- Phase 1: .app bundle validation ---
echo ""
echo -e "${BOLD}Phase 1: .app bundle validation${NC}"

if [[ -d "$APP_BUNDLE" ]]; then
    _pass ".app bundle exists at ${APP_BUNDLE}"
else
    _fail ".app bundle not found at ${APP_BUNDLE}"
    echo ""
    echo "Run 'bash scripts/install-desktop.sh' first."
    exit 1
fi

# Check what the applet runs
APPLET_SCRIPT=$(defaults read "${APP_BUNDLE}/Contents/Info" CFBundleExecutable 2>/dev/null || echo "unknown")
_info "CFBundleExecutable: ${APPLET_SCRIPT}"

PLIST_FILE="${APP_BUNDLE}/Contents/Info.plist"
if [[ -f "$PLIST_FILE" ]]; then
    _log "--- Info.plist ---"
    cat "$PLIST_FILE" >> "$LOG_FILE"
    _log "--- end Info.plist ---"
fi

# --- Phase 2: Launch .app and time it ---
echo ""
echo -e "${BOLD}Phase 2: Launch timing${NC}"

# Clear startup timing log
echo "" > "$STARTUP_LOG" 2>/dev/null || true

T_START=$(date +%s)
_log "Launching .app at $(date)"

# Launch the .app
open -a "AcaClaw" 2>&1 | tee -a "$LOG_FILE" &
OPEN_PID=$!

# Monitor every second for 60 seconds
MAX_WAIT=60
BROWSER_DETECTED_AT=""
GATEWAY_READY_AT=""
APPLET_EXITED_AT=""
STALL_DETECTED=false

for i in $(seq 1 $MAX_WAIT); do
    sleep 1
    ELAPSED=$(($(date +%s) - T_START))

    # Check if gateway is now responding
    if [[ -z "$GATEWAY_READY_AT" ]] && curl -sf "http://localhost:${PORT}/health" &>/dev/null; then
        GATEWAY_READY_AT="${ELAPSED}"
        _log "Gateway ready at ${ELAPSED}s"
    fi

    # Check for new Edge processes (not in the "before" list)
    EDGE_PIDS_NOW=$(pgrep -f "Microsoft Edge" 2>/dev/null | sort || true)
    if [[ -z "$BROWSER_DETECTED_AT" ]] && [[ "$EDGE_PIDS_NOW" != "$EDGE_PIDS_BEFORE" ]]; then
        # Find the new PIDs
        NEW_EDGE_PIDS=$(comm -13 <(echo "$EDGE_PIDS_BEFORE") <(echo "$EDGE_PIDS_NOW") 2>/dev/null || true)
        if [[ -n "$NEW_EDGE_PIDS" ]]; then
            BROWSER_DETECTED_AT="${ELAPSED}"
            _log "New Edge process(es) detected at ${ELAPSED}s: ${NEW_EDGE_PIDS}"

            # Record Edge command line for diagnosis
            for pid in $NEW_EDGE_PIDS; do
                local_cmd=$(ps -p "$pid" -o args= 2>/dev/null || echo "N/A")
                _log "  Edge PID ${pid} cmd: ${local_cmd}"
            done
        fi
    fi

    # Check if osacompile applet is still running
    APPLET_RUNNING=$(pgrep -f "applet" 2>/dev/null || pgrep -f "AcaClaw.app" 2>/dev/null || true)
    if [[ -z "$APPLET_EXITED_AT" ]] && [[ -z "$APPLET_RUNNING" ]] && [[ $ELAPSED -gt 2 ]]; then
        APPLET_EXITED_AT="${ELAPSED}"
        _log "Applet process exited at ${ELAPSED}s"
    fi

    # Check for stall: applet still running after 10s = likely stalled
    if [[ -n "$APPLET_RUNNING" ]] && [[ $ELAPSED -ge 10 ]]; then
        STALL_DETECTED=true
        _log "Applet still running at ${ELAPSED}s (stall detected)"
    fi

    # Stop early if both browser and gateway are detected
    if [[ -n "$BROWSER_DETECTED_AT" ]] && [[ -n "$GATEWAY_READY_AT" ]]; then
        _log "Both browser and gateway detected — stopping monitor at ${ELAPSED}s"
        break
    fi

    # Progress indicator
    if $VERBOSE; then
        printf "\r  Monitoring... %ds " "$ELAPSED"
    fi
done
$VERBOSE && echo "" || true

wait $OPEN_PID 2>/dev/null || true

# --- Phase 3: Results ---
echo ""
echo -e "${BOLD}Phase 3: Launch results${NC}"

# Gateway readiness
if [[ -n "$GATEWAY_READY_AT" ]]; then
    if [[ "$GATEWAY_RUNNING" == "true" ]]; then
        _pass "Gateway was already running"
    elif [[ "$GATEWAY_READY_AT" -le 15 ]]; then
        _pass "Gateway became ready in ${GATEWAY_READY_AT}s"
    elif [[ "$GATEWAY_READY_AT" -le 30 ]]; then
        _warn "Gateway took ${GATEWAY_READY_AT}s to start (slow but OK)"
    else
        _fail "Gateway took ${GATEWAY_READY_AT}s to start (too slow)"
    fi
else
    _fail "Gateway never became ready within ${MAX_WAIT}s"
fi

# Browser launch — the design doc says "browser-based SPA", so Edge opening is expected.
# The .app is a launcher shortcut, not a native window wrapper.
# We just check that it launched within a reasonable time.
if [[ -n "$BROWSER_DETECTED_AT" ]]; then
    if [[ "$BROWSER_DETECTED_AT" -le 15 ]]; then
        _pass "Browser opened in ${BROWSER_DETECTED_AT}s"
    else
        _warn "Browser took ${BROWSER_DETECTED_AT}s to open (slow)"
    fi
else
    _warn "No browser process detected within ${MAX_WAIT}s (may have opened in existing Edge)"
fi

# Applet stall
if [[ "$STALL_DETECTED" == "true" ]]; then
    _fail "Applet stalled (still running after 10s)"
    if [[ -n "$APPLET_EXITED_AT" ]]; then
        _info "Applet eventually exited at ${APPLET_EXITED_AT}s"
    else
        _info "Applet may still be running"
    fi
else
    if [[ -n "$APPLET_EXITED_AT" ]]; then
        if [[ "$APPLET_EXITED_AT" -le 5 ]]; then
            _pass "Applet exited quickly (${APPLET_EXITED_AT}s)"
        else
            _warn "Applet took ${APPLET_EXITED_AT}s to exit"
        fi
    else
        _pass "Applet exited within expected window"
    fi
fi

# --- Phase 4: Process snapshot ---
echo ""
echo -e "${BOLD}Phase 4: Process snapshot${NC}"

_log "--- Process snapshot ---"

# Current Edge processes
EDGE_PIDS_AFTER=$(pgrep -f "Microsoft Edge" 2>/dev/null || true)
EDGE_COUNT_BEFORE=$(echo "$EDGE_PIDS_BEFORE" | grep -c '[0-9]' 2>/dev/null || echo 0)
EDGE_COUNT_AFTER=$(echo "$EDGE_PIDS_AFTER" | grep -c '[0-9]' 2>/dev/null || echo 0)
_info "Edge processes: ${EDGE_COUNT_BEFORE} before → ${EDGE_COUNT_AFTER} after"

# Dock state via AppleScript
DOCK_APPS=$(osascript -e 'tell application "System Events" to get name of every process whose visible is true' 2>/dev/null || echo "N/A")
_info "Visible Dock apps: ${DOCK_APPS}"
_log "Dock apps: ${DOCK_APPS}"

if echo "$DOCK_APPS" | grep -q "Microsoft Edge"; then
    _info "Microsoft Edge visible in Dock (expected — browser-based SPA per design doc)"
fi

# Port ownership
PORT_OWNER=$(lsof -ti ":${PORT}" 2>/dev/null | head -1 || echo "none")
_info "Port ${PORT} owned by PID: ${PORT_OWNER}"

# --- Phase 5: start.sh timing log ---
echo ""
echo -e "${BOLD}Phase 5: start.sh timing log${NC}"

if [[ -f "$STARTUP_LOG" ]] && [[ -s "$STARTUP_LOG" ]]; then
    _info "start.sh timing log:"
    while IFS= read -r line; do
        [[ -n "$line" ]] && _info "  $line"
    done < "$STARTUP_LOG"
    cat "$STARTUP_LOG" >> "$LOG_FILE"
else
    _warn "No startup timing log found (start.sh may not have run)"
fi

# --- Summary ---
echo ""
echo -e "${BOLD}=== Summary ===${NC}"
echo -e "  ${GREEN}PASS: ${PASS_COUNT}${NC}  ${RED}FAIL: ${FAIL_COUNT}${NC}  ${YELLOW}WARN: ${WARN_COUNT}${NC}"
echo -e "  Full log: ${LOG_FILE}"
echo ""

if [[ $FAIL_COUNT -gt 0 ]]; then
    echo -e "${RED}Desktop launch has issues. See FAIL items above.${NC}"
    exit 1
else
    echo -e "${GREEN}Desktop launch OK.${NC}"
    exit 0
fi

#!/usr/bin/env bash
# AcaClaw macOS Desktop App Smoke Test
#
# Validates that the installed AcaClaw.app bundle is structurally correct,
# the launcher script can bootstrap PATH and reach the gateway, and
# the UI is accessible.
#
# Usage:
#   bash scripts/test-desktop-app.sh           # Full smoke test
#   bash scripts/test-desktop-app.sh --json    # JSON output
#   bash scripts/test-desktop-app.sh --no-launch  # Skip actual launch test
#
# Prerequisites:
#   - macOS with AcaClaw installed (bash scripts/install-desktop.sh)
#   - Gateway running on port 2090 (or will attempt to start)
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

PORT="${ACACLAW_PORT:-2090}"
APP_BUNDLE="${HOME}/Applications/AcaClaw.app"

# --- Parse arguments ---
JSON_OUTPUT=false
SKIP_LAUNCH=false
for arg in "$@"; do
    case "$arg" in
        --json)      JSON_OUTPUT=true ;;
        --no-launch) SKIP_LAUNCH=true ;;
    esac
done

# --- Results tracking ---
PASS_COUNT=0
FAIL_COUNT=0
WARN_COUNT=0
declare -a RESULTS=()

_pass() {
    local label=$1 detail=${2:-""}
    PASS_COUNT=$((PASS_COUNT + 1))
    $JSON_OUTPUT || echo -e "  ${GREEN}✓ PASS${NC}  ${label}${detail:+  ${DIM}${detail}${NC}}"
    RESULTS+=("{\"test\": \"${label}\", \"status\": \"pass\", \"detail\": \"${detail}\"}")
}

_fail() {
    local label=$1 detail=${2:-""}
    FAIL_COUNT=$((FAIL_COUNT + 1))
    $JSON_OUTPUT || echo -e "  ${RED}✗ FAIL${NC}  ${label}${detail:+  ${DIM}${detail}${NC}}"
    RESULTS+=("{\"test\": \"${label}\", \"status\": \"fail\", \"detail\": \"${detail}\"}")
}

_warn() {
    local label=$1 detail=${2:-""}
    WARN_COUNT=$((WARN_COUNT + 1))
    $JSON_OUTPUT || echo -e "  ${YELLOW}⚠ WARN${NC}  ${label}${detail:+  ${DIM}${detail}${NC}}"
    RESULTS+=("{\"test\": \"${label}\", \"status\": \"warn\", \"detail\": \"${detail}\"}")
}

_header() {
    $JSON_OUTPUT || echo -e "\n${BLUE}${BOLD}── $1 ──${NC}"
}

# ════════════════════════════════════════════════════════════════════
# 0. Platform check
# ════════════════════════════════════════════════════════════════════
if [[ "$(uname -s)" != "Darwin" ]]; then
    echo "This test is macOS-only. Skipping."
    exit 0
fi

# ════════════════════════════════════════════════════════════════════
# 1. Bundle structure
# ════════════════════════════════════════════════════════════════════
_header "Bundle structure"

if [[ -d "$APP_BUNDLE" ]]; then
    _pass "AcaClaw.app exists" "$APP_BUNDLE"
else
    _fail "AcaClaw.app not found" "$APP_BUNDLE"
    echo -e "\n  ${RED}Cannot continue — run: bash scripts/install-desktop.sh${NC}"
    exit 1
fi

# Info.plist
PLIST="${APP_BUNDLE}/Contents/Info.plist"
if [[ -f "$PLIST" ]]; then
    _pass "Info.plist exists"

    # Verify required keys
    for key in CFBundleName CFBundleIdentifier CFBundleExecutable CFBundleIconFile; do
        if /usr/libexec/PlistBuddy -c "Print :${key}" "$PLIST" &>/dev/null; then
            val=$(/usr/libexec/PlistBuddy -c "Print :${key}" "$PLIST")
            _pass "Info.plist: ${key}" "$val"
        else
            _fail "Info.plist missing key: ${key}"
        fi
    done

    # Verify bundle identifier
    bundle_id=$(/usr/libexec/PlistBuddy -c "Print :CFBundleIdentifier" "$PLIST" 2>/dev/null || echo "")
    if [[ "$bundle_id" == "com.acaclaw.app" ]]; then
        _pass "Bundle identifier is correct" "$bundle_id"
    else
        _fail "Bundle identifier mismatch" "expected com.acaclaw.app, got $bundle_id"
    fi

    # Verify CFBundleExecutable points to the right binary
    exe_name=$(/usr/libexec/PlistBuddy -c "Print :CFBundleExecutable" "$PLIST" 2>/dev/null || echo "")
    if [[ "$exe_name" == "AcaClaw" ]]; then
        _pass "CFBundleExecutable is 'AcaClaw'" "(not 'applet')"
    else
        _warn "CFBundleExecutable unexpected" "expected 'AcaClaw', got '${exe_name}'"
    fi
else
    _fail "Info.plist missing" "$PLIST"
fi

# Main executable
LAUNCHER="${APP_BUNDLE}/Contents/MacOS/AcaClaw"
if [[ -f "$LAUNCHER" ]]; then
    _pass "Launcher script exists" "$LAUNCHER"
    if [[ -x "$LAUNCHER" ]]; then
        _pass "Launcher script is executable"
    else
        _fail "Launcher script not executable" "run: chmod +x ${LAUNCHER}"
    fi
else
    _fail "Launcher script missing" "$LAUNCHER"
fi

# Icon (optional but expected)
ICNS="${APP_BUNDLE}/Contents/Resources/AcaClaw.icns"
if [[ -f "$ICNS" ]]; then
    local_size=$(stat -f%z "$ICNS" 2>/dev/null || stat -c%s "$ICNS" 2>/dev/null || echo 0)
    if [[ "$local_size" -gt 1000 ]]; then
        _pass "App icon exists" "$(( local_size / 1024 ))KB"
    else
        _warn "App icon suspiciously small" "${local_size} bytes"
    fi
else
    _warn "App icon missing" "Expected ${ICNS}"
fi

# ════════════════════════════════════════════════════════════════════
# 2. Launcher script content validation
# ════════════════════════════════════════════════════════════════════
_header "Launcher script validation"

if [[ -f "$LAUNCHER" ]]; then
    # Check shebang
    if head -1 "$LAUNCHER" | grep -q "bash"; then
        _pass "Launcher has bash shebang"
    else
        _fail "Launcher missing bash shebang"
    fi

    # Check PATH bootstrap
    if grep -q "PATH bootstrap" "$LAUNCHER"; then
        _pass "PATH bootstrap section present"
    else
        _fail "PATH bootstrap missing" "App will fail in .app context"
    fi

    # Check Homebrew bootstrap
    if grep -q "homebrew\|/opt/homebrew" "$LAUNCHER"; then
        _pass "Homebrew PATH bootstrap present"
    else
        _warn "No Homebrew bootstrap" "May fail if Node installed via brew"
    fi

    # Check fnm support
    if grep -q "fnm" "$LAUNCHER"; then
        _pass "fnm support present"
    else
        _warn "No fnm support"
    fi

    # Check nvm fallback
    if grep -q "nvm" "$LAUNCHER"; then
        _pass "nvm fallback present"
    else
        _warn "No nvm fallback"
    fi

    # Check gateway startup
    if grep -q "_port_ok\|gateway" "$LAUNCHER"; then
        _pass "Gateway startup logic present"
    else
        _fail "No gateway startup logic"
    fi

    # Check browser exec
    if grep -q 'BROWSER_PID.*\$!' "$LAUNCHER"; then
        _pass "Browser launched as child process" "Dock relaunch will work correctly"
    elif grep -q 'exec.*Edge\|exec.*Chrome' "$LAUNCHER"; then
        _warn "Browser launched via exec" "Second Dock click will open regular Edge window"
    else
        _fail "No browser launch logic"
    fi

    # Check single-instance lock
    if grep -q "LOCK_FILE\|app-lock" "$LAUNCHER"; then
        _pass "Single-instance lock present" "Prevents duplicate windows on Dock click"
    else
        _warn "No single-instance lock" "Second Dock click may open duplicate window"
    fi

    # Check app profile isolation
    if grep -q "user-data-dir\|browser-app" "$LAUNCHER"; then
        _pass "Browser profile isolation" "Won't interfere with user's Edge/Chrome"
    else
        _warn "No browser profile isolation"
    fi

    # Check launch log
    if grep -q "LAUNCH_LOG\|app-launch.log" "$LAUNCHER"; then
        _pass "Launch logging present" "~/.acaclaw/app-launch.log"
    else
        _warn "No launch logging"
    fi
else
    _fail "Cannot validate launcher" "File not found"
fi

# ════════════════════════════════════════════════════════════════════
# 3. Launcher dry-run (no browser exec)
# ════════════════════════════════════════════════════════════════════
if [[ "$SKIP_LAUNCH" != "true" ]]; then
    _header "Launcher dry-run"

    # Run the launcher script up to (but not including) the exec line
    # by replacing exec with echo in a subshell
    DRY_LOG=$(mktemp)
    DRY_RESULT=$(bash -c '
        # Source the launcher but intercept exec
        exec() { echo "EXEC_INTERCEPTED: $*"; exit 0; }
        export -f exec
        source "'"$LAUNCHER"'"
    ' 2>"$DRY_LOG" || true)

    if echo "$DRY_RESULT" | grep -q "EXEC_INTERCEPTED"; then
        browser_cmd=$(echo "$DRY_RESULT" | grep "EXEC_INTERCEPTED" | head -1)
        _pass "Launcher reaches browser exec" "${browser_cmd#EXEC_INTERCEPTED: }"
    else
        _warn "Launcher dry-run did not reach exec" "$(cat "$DRY_LOG" | tail -3)"
    fi

    # Check if the launch log was written
    LAUNCH_LOG="${HOME}/.acaclaw/app-launch.log"
    if [[ -f "$LAUNCH_LOG" ]]; then
        log_age=$(( $(date +%s) - $(stat -f%m "$LAUNCH_LOG" 2>/dev/null || stat -c%Y "$LAUNCH_LOG" 2>/dev/null || echo 0) ))
        if [[ $log_age -lt 60 ]]; then
            _pass "Launch log recently written" "${log_age}s ago"

            # Check if PATH was bootstrapped
            if grep -q "PATH=" "$LAUNCH_LOG"; then
                _pass "PATH logged in launch log"
            fi

            # Check gateway status
            if grep -q "port responding: yes" "$LAUNCH_LOG"; then
                _pass "Gateway confirmed running via launch log"
            elif grep -q "port responding: no" "$LAUNCH_LOG"; then
                _warn "Gateway was not running when launcher checked"
            fi
        else
            _warn "Launch log is stale" "${log_age}s old"
        fi
    fi
    rm -f "$DRY_LOG"
fi

# ════════════════════════════════════════════════════════════════════
# 4. Gateway connectivity (if running)
# ════════════════════════════════════════════════════════════════════
_header "Gateway connectivity"

if curl -sf --max-time 3 --noproxy 127.0.0.1 "http://127.0.0.1:${PORT}/" &>/dev/null; then
    _pass "Gateway responding on port ${PORT}"

    # Check health endpoint
    http_code=$(curl -sf --max-time 3 --noproxy 127.0.0.1 -o /dev/null -w "%{http_code}" "http://127.0.0.1:${PORT}/health" 2>/dev/null || echo "000")
    if [[ "$http_code" == "200" ]]; then
        _pass "Health endpoint returns 200"
    else
        _warn "Health endpoint returned ${http_code}"
    fi

    # Check UI routes
    for route in "/" "/chat" "/api-keys" "/settings"; do
        route_code=$(curl -sf --max-time 3 --noproxy 127.0.0.1 -o /dev/null -w "%{http_code}" "http://127.0.0.1:${PORT}${route}" 2>/dev/null || echo "000")
        if [[ "$route_code" == "200" ]]; then
            _pass "UI route ${route}" "HTTP ${route_code}"
        else
            _fail "UI route ${route}" "HTTP ${route_code}"
        fi
    done
else
    _warn "Gateway not responding" "port ${PORT} — start gateway first for full test"
fi

# ════════════════════════════════════════════════════════════════════
# 5. LaunchServices registration
# ════════════════════════════════════════════════════════════════════
_header "LaunchServices registration"

# Check if macOS knows about the bundle
if mdls -name kMDItemCFBundleIdentifier "$APP_BUNDLE" 2>/dev/null | grep -q "com.acaclaw.app"; then
    _pass "Spotlight indexed" "kMDItemCFBundleIdentifier = com.acaclaw.app"
else
    _warn "Not yet indexed by Spotlight" "May take a moment after install"
fi

# Check if 'open -a AcaClaw' would resolve (without actually opening)
if mdfind "kMDItemCFBundleIdentifier == com.acaclaw.app" 2>/dev/null | grep -q "AcaClaw"; then
    _pass "Findable via Spotlight" "'open -a AcaClaw' should work"
else
    _warn "Not findable via Spotlight yet" "Run: /System/Library/Frameworks/CoreServices.framework/Versions/A/Frameworks/LaunchServices.framework/Versions/A/Support/lsregister -f ${APP_BUNDLE}"
fi

# ════════════════════════════════════════════════════════════════════
# Summary
# ════════════════════════════════════════════════════════════════════
if $JSON_OUTPUT; then
    echo "{"
    echo "  \"passed\": ${PASS_COUNT},"
    echo "  \"failed\": ${FAIL_COUNT},"
    echo "  \"warnings\": ${WARN_COUNT},"
    echo "  \"results\": ["
    for i in "${!RESULTS[@]}"; do
        echo -n "    ${RESULTS[$i]}"
        [[ $i -lt $((${#RESULTS[@]} - 1)) ]] && echo "," || echo ""
    done
    echo "  ]"
    echo "}"
else
    TOTAL=$((PASS_COUNT + FAIL_COUNT + WARN_COUNT))
    echo ""
    echo -e "${BOLD}════════════════════════════════════════════${NC}"
    echo -e "${BOLD}  Desktop App Smoke Test Summary${NC}"
    echo -e "${BOLD}════════════════════════════════════════════${NC}"
    echo -e "  ${GREEN}✓ Passed:${NC}   ${PASS_COUNT}"
    echo -e "  ${RED}✗ Failed:${NC}   ${FAIL_COUNT}"
    echo -e "  ${YELLOW}⚠ Warnings:${NC} ${WARN_COUNT}"
    echo -e "  Total:     ${TOTAL}"
    echo ""

    if [[ $FAIL_COUNT -gt 0 ]]; then
        echo -e "  ${RED}${BOLD}RESULT: FAIL${NC}"
        echo -e "  ${DIM}Run: bash scripts/install-desktop.sh${NC}"
        echo ""
        exit 1
    elif [[ $WARN_COUNT -gt 0 ]]; then
        echo -e "  ${YELLOW}${BOLD}RESULT: PASS with warnings${NC}"
        echo ""
        exit 0
    else
        echo -e "  ${GREEN}${BOLD}RESULT: ALL PASS${NC}"
        echo ""
        exit 0
    fi
fi

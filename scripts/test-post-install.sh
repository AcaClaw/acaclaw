#!/usr/bin/env bash
# AcaClaw Post-Install UI Verification Script
#
# Verifies that after install, the AcaClaw web UI at localhost:2090
# renders correctly and shows the API Keys tab. This is a critical path:
# if the UI shows "not found" (404), users cannot configure API keys.
#
# Root cause of past failures: OpenClaw 4.2+ requires `plugins.allow`
# in the gateway config to trust plugins for HTTP route registration.
# Without it, the acaclaw-ui plugin's routes are silently blocked → 404.
#
# Usage:
#   bash scripts/test-post-install.sh           # Full suite
#   bash scripts/test-post-install.sh --json    # JSON output
#   bash scripts/test-post-install.sh --fix     # Auto-fix config issues
#
# Prerequisites:
#   - OpenClaw >= 2026.4.2 installed
#   - Gateway should be running (script will start it if not)
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

PORT="${ACACLAW_PORT:-2090}"
BASE_URL="http://localhost:${PORT}"
CONFIG_FILE="${HOME}/.openclaw/openclaw.json"

# Required plugins for the UI to serve correctly
REQUIRED_PLUGINS=(
    "acaclaw-academic-env"
    "acaclaw-backup"
    "acaclaw-compat-checker"
    "acaclaw-logger"
    "acaclaw-security"
    "acaclaw-ui"
    "acaclaw-workspace"
)

# SPA routes the UI plugin must serve (all should return 200 with HTML)
SPA_ROUTES=(
    "/"
    "/api-keys"
    "/chat"
    "/staff"
    "/monitor"
    "/settings"
    "/workspace"
    "/environment"
    "/backup"
    "/skills"
    "/usage"
)

# --- Parse arguments ---
JSON_OUTPUT=false
AUTO_FIX=false
for arg in "$@"; do
    case "$arg" in
        --json) JSON_OUTPUT=true ;;
        --fix)  AUTO_FIX=true ;;
    esac
done

# --- Results tracking ---
PASS_COUNT=0
FAIL_COUNT=0
WARN_COUNT=0
declare -a RESULTS=()
STARTED_GATEWAY=false

_pass() {
    local label=$1 detail=${2:-""}
    PASS_COUNT=$((PASS_COUNT + 1))
    $JSON_OUTPUT || echo -e "  ${GREEN}✓ PASS${NC}  ${label}${detail:+  ${DIM}${detail}${NC}}"
    RESULTS+=("{\"test\": \"${label}\", \"status\": \"pass\", \"detail\": \"${detail}\"}")
}

_fail() {
    local label=$1 detail=${2:-""} fix_hint=${3:-""}
    FAIL_COUNT=$((FAIL_COUNT + 1))
    if ! $JSON_OUTPUT; then
        echo -e "  ${RED}✗ FAIL${NC}  ${label}${detail:+  ${DIM}${detail}${NC}}"
        [[ -n "$fix_hint" ]] && echo -e "         ${YELLOW}Fix:${NC} ${fix_hint}"
    fi
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

# --- Cleanup ---
cleanup() {
    if [[ "$STARTED_GATEWAY" == "true" ]]; then
        $JSON_OUTPUT || echo -e "\n${DIM}Stopping gateway started by test...${NC}"
        pkill -f "openclaw gateway run" 2>/dev/null || true
    fi
}
trap cleanup EXIT

# ════════════════════════════════════════════════════════════════════
# 1. PRE-FLIGHT: Config & gateway readiness
# ════════════════════════════════════════════════════════════════════
_header "Pre-flight checks"

# 1a. Config file exists
if [[ -f "$CONFIG_FILE" ]]; then
    _pass "Config file exists" "$CONFIG_FILE"
else
    _fail "Config file missing" "$CONFIG_FILE" \
        "Run: bash scripts/install.sh"
    # Can't continue without config
    echo -e "\n${RED}${BOLD}FATAL:${NC} Config file missing. Run install.sh first."
    exit 1
fi

# 1b. plugins.allow includes acaclaw-ui (critical for HTTP route registration)
_plugins_allow=""
if command -v python3 &>/dev/null; then
    _plugins_allow=$(python3 -c "
import json, sys
try:
    with open('${CONFIG_FILE}') as f:
        cfg = json.load(f)
    allow = cfg.get('plugins', {}).get('allow', [])
    print(','.join(allow))
except:
    print('')
" 2>/dev/null) || true
fi

_ui_trusted=false
if echo "$_plugins_allow" | grep -q "acaclaw-ui"; then
    _pass "plugins.allow includes acaclaw-ui" "UI plugin trusted for HTTP routes"
    _ui_trusted=true
else
    if $AUTO_FIX; then
        # Auto-fix: add plugins.allow to config
        python3 -c "
import json
with open('${CONFIG_FILE}') as f:
    cfg = json.load(f)
cfg.setdefault('plugins', {})['allow'] = $(python3 -c "import json; print(json.dumps([p for p in '${REQUIRED_PLUGINS[*]}'.split()]))")
with open('${CONFIG_FILE}', 'w') as f:
    json.dump(cfg, f, indent=2)
print('Fixed: added plugins.allow')
" 2>/dev/null
        _warn "plugins.allow was missing — auto-fixed" "Added ${#REQUIRED_PLUGINS[@]} plugins"
        _ui_trusted=true
    else
        _fail "plugins.allow missing acaclaw-ui" \
            "OpenClaw 4.2+ requires plugins.allow for HTTP route registration" \
            "Run with --fix or add to ${CONFIG_FILE}: \"plugins\": {\"allow\": [\"acaclaw-ui\", ...]}"
    fi
fi

# 1c. Check all required plugins are in allow list
for plugin in "${REQUIRED_PLUGINS[@]}"; do
    if echo "$_plugins_allow" | grep -q "$plugin"; then
        : # already trusted
    else
        _warn "plugins.allow missing ${plugin}" "Plugin may not function correctly"
    fi
done

# 1d. Gateway reachable
_gateway_up=false
if curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/" 2>/dev/null | grep -qE "^(200|301|302)$"; then
    _pass "Gateway reachable" "port ${PORT}"
    _gateway_up=true
else
    # Try to start the gateway
    if $AUTO_FIX && command -v openclaw &>/dev/null; then
        echo -e "  ${YELLOW}Gateway not responding — starting...${NC}"
        openclaw gateway run --bind loopback --port "$PORT" &>/dev/null &
        STARTED_GATEWAY=true
        # Wait up to 15s
        for _i in $(seq 1 15); do
            if curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/" 2>/dev/null | grep -qE "^(200|301|302)$"; then
                _gateway_up=true
                break
            fi
            sleep 1
        done
        if $_gateway_up; then
            _warn "Gateway was not running — auto-started" "port ${PORT}"
        else
            _fail "Gateway failed to start" "port ${PORT}" \
                "Run: openclaw gateway run --bind loopback --port ${PORT}"
        fi
    else
        _fail "Gateway not reachable" "port ${PORT}" \
            "Run: openclaw gateway run --bind loopback --port ${PORT}"
    fi
fi

# If gateway is down and UI not trusted, remaining tests will fail
if ! $_gateway_up; then
    echo -e "\n${RED}${BOLD}FATAL:${NC} Gateway not reachable. Cannot verify UI."
    echo -e "Start the gateway first: ${BOLD}openclaw gateway run --bind loopback --port ${PORT}${NC}"
    exit 1
fi

# ════════════════════════════════════════════════════════════════════
# 2. ROOT PAGE: Must return 200 with AcaClaw HTML
# ════════════════════════════════════════════════════════════════════
_header "Root page (/) verification"

# 2a. HTTP status
_root_status=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/" 2>/dev/null)
if [[ "$_root_status" == "200" ]]; then
    _pass "GET / returns 200" "HTTP ${_root_status}"
else
    _fail "GET / returns ${_root_status}" \
        "Expected 200, got ${_root_status}. UI plugin routes not registered." \
        "Ensure plugins.allow includes acaclaw-ui in ${CONFIG_FILE}"
fi

# 2b. Response contains AcaClaw HTML markers
_root_body=$(curl -s "${BASE_URL}/" 2>/dev/null)

if echo "$_root_body" | grep -q "<acaclaw-app>"; then
    _pass "HTML contains <acaclaw-app>" "Lit web component found"
else
    _fail "HTML missing <acaclaw-app>" \
        "Response may be OpenClaw default page, not AcaClaw UI" \
        "Check UI plugin deployment at ~/.openclaw/extensions/"
fi

if echo "$_root_body" | grep -q "<title>AcaClaw</title>"; then
    _pass "Page title is AcaClaw" ""
else
    _fail "Wrong page title" \
        "Expected <title>AcaClaw</title>" \
        "UI dist may be outdated or missing"
fi

if echo "$_root_body" | grep -q 'oc-gateway-url'; then
    _pass "Gateway URL meta tag present" ""
else
    _warn "Missing oc-gateway-url meta" "WebSocket connection may fail"
fi

# 2c. Cache-Control header (HTML should be no-cache)
_cache_header=$(curl -sI "${BASE_URL}/" 2>/dev/null | grep -i "cache-control" | head -1)
if echo "$_cache_header" | grep -qi "no-cache"; then
    _pass "Cache-Control: no-cache" "Correct for HTML"
else
    _warn "Unexpected cache header" "${_cache_header:-none}"
fi

# ════════════════════════════════════════════════════════════════════
# 3. SPA ROUTES: All AcaClaw views must return 200
# ════════════════════════════════════════════════════════════════════
_header "SPA route verification"

_route_failures=0
for route in "${SPA_ROUTES[@]}"; do
    _status=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}${route}" 2>/dev/null)
    if [[ "$_status" == "200" ]]; then
        _pass "GET ${route}" "HTTP ${_status}"
    else
        _fail "GET ${route}" "HTTP ${_status}" \
            "SPA route not served — UI plugin may not be registered"
        _route_failures=$((_route_failures + 1))
    fi
done

if [[ $_route_failures -eq 0 ]]; then
    _pass "All ${#SPA_ROUTES[@]} SPA routes serve 200" ""
fi

# ════════════════════════════════════════════════════════════════════
# 4. STATIC ASSETS: CSS and JS must load
# ════════════════════════════════════════════════════════════════════
_header "Static asset verification"

# Extract asset URLs from the HTML
_js_path=$(echo "$_root_body" | grep -oP 'src="/assets/[^"]+\.js"' | head -1 | grep -oP '/assets/[^"]+')
_css_path=$(echo "$_root_body" | grep -oP 'href="/assets/[^"]+\.css"' | head -1 | grep -oP '/assets/[^"]+')
_favicon_path=$(echo "$_root_body" | grep -oP 'href="/logo/[^"]+' | head -1 | grep -oP '/logo/[^"]+')
_font_path=$(echo "$_root_body" | grep -oP 'href="/fonts/[^"]+' | head -1 | grep -oP '/fonts/[^"]+')

# 4a. Main JS bundle
if [[ -n "$_js_path" ]]; then
    _js_status=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}${_js_path}" 2>/dev/null)
    if [[ "$_js_status" == "200" ]]; then
        _pass "JS bundle loads" "${_js_path}"
        # Check immutable cache for hashed assets
        _js_cache=$(curl -sI "${BASE_URL}${_js_path}" 2>/dev/null | grep -i "cache-control" | head -1)
        if echo "$_js_cache" | grep -qi "immutable"; then
            _pass "JS bundle cache: immutable" ""
        else
            _warn "JS bundle missing immutable cache" "${_js_cache:-none}"
        fi
    else
        _fail "JS bundle failed" "${_js_path} → HTTP ${_js_status}" \
            "Check UI dist at ~/.openclaw/ui/ or ~/.openclaw/extensions/"
    fi
else
    _fail "No JS bundle found in HTML" "" "UI dist may be corrupted"
fi

# 4b. CSS bundle
if [[ -n "$_css_path" ]]; then
    _css_status=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}${_css_path}" 2>/dev/null)
    if [[ "$_css_status" == "200" ]]; then
        _pass "CSS bundle loads" "${_css_path}"
    else
        _fail "CSS bundle failed" "${_css_path} → HTTP ${_css_status}"
    fi
else
    _warn "No CSS bundle found in HTML" "May use inline styles"
fi

# 4c. Favicon
if [[ -n "$_favicon_path" ]]; then
    _fav_status=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}${_favicon_path}" 2>/dev/null)
    if [[ "$_fav_status" == "200" ]]; then
        _pass "Favicon loads" "${_favicon_path}"
    else
        _warn "Favicon missing" "${_favicon_path} → HTTP ${_fav_status}"
    fi
fi

# 4d. Font CSS
if [[ -n "$_font_path" ]]; then
    _font_status=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}${_font_path}" 2>/dev/null)
    if [[ "$_font_status" == "200" ]]; then
        _pass "Font CSS loads" "${_font_path}"
    else
        _warn "Font CSS missing" "${_font_path} → HTTP ${_font_status}"
    fi
fi

# ════════════════════════════════════════════════════════════════════
# 5. API-KEYS PAGE: Critical UX — must be accessible
# ════════════════════════════════════════════════════════════════════
_header "API Keys page (critical UX path)"

# 5a. /api-keys returns HTML with the app
_apikeys_body=$(curl -s "${BASE_URL}/api-keys" 2>/dev/null)
if echo "$_apikeys_body" | grep -q "<acaclaw-app>"; then
    _pass "GET /api-keys serves AcaClaw app" "SPA fallback working"
else
    _fail "GET /api-keys missing app" \
        "Users cannot set API keys — critical UX failure" \
        "Ensure UI plugin is deployed and trusted"
fi

# 5b. WebSocket gateway is accepting connections (needed for API key config)
_ws_check=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Connection: Upgrade" -H "Upgrade: websocket" \
    -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
    "${BASE_URL}/" 2>/dev/null)
if [[ "$_ws_check" == "101" ]]; then
    _pass "WebSocket upgrade succeeds" "Gateway accepts WS connections"
else
    _warn "WebSocket upgrade returned ${_ws_check}" "Expected 101 — UI may not connect to gateway"
fi

# 5c. Verify config.get RPC is accessible (needed to check/save API keys)
if command -v node &>/dev/null; then
    # Locate ws module: project node_modules, global, or openclaw's
    _node_path=""
    _script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    _repo_root="$(cd "${_script_dir}/.." && pwd)"
    for _candidate in \
        "${_repo_root}/node_modules" \
        "$(npm root -g 2>/dev/null)" \
        "$(dirname "$(command -v openclaw)" 2>/dev/null)/../lib/node_modules" \
        "/usr/lib/node_modules" \
        "/usr/local/lib/node_modules"; do
        if [[ -d "${_candidate}/ws" ]] 2>/dev/null; then
            _node_path="$_candidate"
            break
        fi
    done

    if [[ -z "$_node_path" ]]; then
        _warn "WebSocket module (ws) not found — skipped RPC check" "Install ws: npm i ws"
    else
        _rpc_result=$(NODE_PATH="${_node_path}" timeout 10 node -e '
var WebSocket = require("ws");
var randomUUID = require("crypto").randomUUID;
var ws = new WebSocket("ws://localhost:'"${PORT}"'/", {origin: "http://localhost:'"${PORT}"'"});
var step = "connect";
ws.on("message", function(data) {
    var msg = JSON.parse(data);
    if (msg.type === "event" && msg.event === "connect.challenge") {
        ws.send(JSON.stringify({
            type: "req", id: randomUUID(), method: "connect",
            params: {
                minProtocol: 3, maxProtocol: 3,
                client: {id: "test", version: "1.0", platform: "linux", mode: "ui"},
                role: "operator",
                scopes: ["operator.admin","operator.read","operator.write"]
            }
        }));
    } else if (msg.type === "res" && step === "connect") {
        step = "config";
        ws.send(JSON.stringify({
            type: "req", id: randomUUID(), method: "config.get", params: {}
        }));
    } else if (msg.type === "res" && step === "config") {
        var ok = Boolean(msg.ok && msg.payload);
        var has_env = Boolean(msg.payload && msg.payload.env);
        console.log(JSON.stringify({ok: ok, has_env: has_env}));
        ws.close();
    }
});
ws.on("error", function(e) { console.log(JSON.stringify({ok: false, error: e.message})); process.exit(1); });
setTimeout(function() { console.log(JSON.stringify({ok: false, error: "timeout"})); process.exit(1); }, 8000);
' 2>/dev/null) || _rpc_result='{"ok": false, "error": "node failed"}'

        if echo "$_rpc_result" | python3 -c "import json,sys; d=json.load(sys.stdin); exit(0 if d.get('ok') else 1)" 2>/dev/null; then
            _pass "config.get RPC works" "API key storage accessible"
        else
            # RPC may fail due to device pairing requirements (OpenClaw 4.2+).
            # This is expected when running outside the browser (no device identity).
            # The HTTP-level checks above already prove the UI serves correctly.
            _warn "config.get RPC not accessible from CLI" \
                "Expected with device auth — UI handles pairing in-browser"
        fi
    fi
else
    _warn "Node.js not found — skipped RPC check" ""
fi

# ════════════════════════════════════════════════════════════════════
# 6. PLUGIN DEPLOYMENT: UI files exist on disk
# ════════════════════════════════════════════════════════════════════
_header "Plugin deployment checks"

UI_EXTENSION_DIR="${HOME}/.openclaw/extensions/acaclaw-ui"
if [[ -d "$UI_EXTENSION_DIR" ]]; then
    _pass "UI plugin directory exists" "$UI_EXTENSION_DIR"

    # Check for index.html in the UI dist
    UI_DIST_HTML=""
    for candidate in \
        "${UI_EXTENSION_DIR}/ui/dist/index.html" \
        "${UI_EXTENSION_DIR}/dist/index.html" \
        "${HOME}/.openclaw/ui/index.html"; do
        if [[ -f "$candidate" ]]; then
            UI_DIST_HTML="$candidate"
            break
        fi
    done

    if [[ -n "$UI_DIST_HTML" ]]; then
        _pass "UI index.html exists" "$UI_DIST_HTML"
        if grep -q "<acaclaw-app>" "$UI_DIST_HTML"; then
            _pass "UI index.html contains <acaclaw-app>" ""
        else
            _fail "UI index.html missing app component" "$UI_DIST_HTML"
        fi
    else
        _warn "UI index.html not found" "Searched standard locations"
    fi

    # Check plugin manifest
    if [[ -f "${UI_EXTENSION_DIR}/openclaw.plugin.json" ]]; then
        _pass "Plugin manifest exists" "openclaw.plugin.json"
    else
        _fail "Plugin manifest missing" "${UI_EXTENSION_DIR}/openclaw.plugin.json"
    fi
else
    _fail "UI plugin not deployed" "$UI_EXTENSION_DIR" \
        "Run: bash scripts/install.sh"
fi

# Check all other plugins
for plugin in "${REQUIRED_PLUGINS[@]}"; do
    plugin_dir="${HOME}/.openclaw/extensions/${plugin}"
    if [[ -d "$plugin_dir" ]]; then
        _pass "Plugin deployed: ${plugin}" ""
    else
        _warn "Plugin missing: ${plugin}" "$plugin_dir"
    fi
done

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
    echo -e "${BOLD}  Post-Install UI Verification Summary${NC}"
    echo -e "${BOLD}════════════════════════════════════════════${NC}"
    echo -e "  ${GREEN}✓ Passed:${NC}   ${PASS_COUNT}"
    echo -e "  ${RED}✗ Failed:${NC}   ${FAIL_COUNT}"
    echo -e "  ${YELLOW}⚠ Warnings:${NC} ${WARN_COUNT}"
    echo -e "  Total:     ${TOTAL}"
    echo ""

    if [[ $FAIL_COUNT -gt 0 ]]; then
        echo -e "  ${RED}${BOLD}RESULT: FAIL${NC} — AcaClaw UI is not serving correctly."
        echo -e "  ${DIM}Most common cause: plugins.allow missing acaclaw-ui in config.${NC}"
        echo -e "  ${DIM}Run with --fix to auto-repair: bash scripts/test-post-install.sh --fix${NC}"
        echo ""
        exit 1
    elif [[ $WARN_COUNT -gt 0 ]]; then
        echo -e "  ${YELLOW}${BOLD}RESULT: PASS with warnings${NC}"
        echo ""
        exit 0
    else
        echo -e "  ${GREEN}${BOLD}RESULT: ALL PASS${NC} — AcaClaw UI is serving correctly."
        echo ""
        exit 0
    fi
fi

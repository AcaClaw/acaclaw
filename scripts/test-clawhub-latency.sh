#!/usr/bin/env bash
# AcaClaw ClawHub & Mirror Latency Test
# Measures DNS, TCP connect, TLS handshake, and skill-install latency
# against the primary ClawHub registry and its CN mirror.
# Designed to diagnose the "install stalls at installing skills" issue.
#
# Usage:
#   bash scripts/test-clawhub-latency.sh                # Full test
#   bash scripts/test-clawhub-latency.sh --json         # JSON output
#   bash scripts/test-clawhub-latency.sh --rounds 5     # Multiple rounds
#   bash scripts/test-clawhub-latency.sh --install       # Actually install skills (destructive)
#   bash scripts/test-clawhub-latency.sh --mirror-only   # Skip primary, test mirrors only
#   bash scripts/test-clawhub-latency.sh --primary-only  # Skip mirrors, test primary only
#
# Environment variables:
#   CLAWHUB_MIRROR          Override mirror URL (default: https://cn.clawhub-mirror.com)
#   CLAWHUB_SKILL_TIMEOUT   Per-skill timeout in seconds (default: 15)
#   CLAWHUB_PRIMARY         Override primary URL (default: https://clawhub.ai)
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

CLAWHUB_PRIMARY="${CLAWHUB_PRIMARY:-https://clawhub.ai}"
CLAWHUB_MIRROR="${CLAWHUB_MIRROR:-https://cn.clawhub-mirror.com}"
CLAWHUB_SKILL_TIMEOUT="${CLAWHUB_SKILL_TIMEOUT:-15}"
OPENCLAW_DIR="${HOME}/.openclaw"
CORE_SKILLS=("nano-pdf" "xurl" "summarize" "humanizer")

# --- Parse arguments ---
JSON_OUTPUT=false
ROUNDS=1
DO_INSTALL=false
MIRROR_ONLY=false
PRIMARY_ONLY=false

for arg in "$@"; do
    case "$arg" in
        --json)          JSON_OUTPUT=true ;;
        --install)       DO_INSTALL=true ;;
        --mirror-only)   MIRROR_ONLY=true ;;
        --primary-only)  PRIMARY_ONLY=true ;;
        --rounds)        :;; # value handled below
        --rounds=*)      ROUNDS="${arg#*=}" ;;
        [0-9]*)
            # Positional number after --rounds
            if [[ "${prev_arg:-}" == "--rounds" ]]; then
                ROUNDS="$arg"
            fi
            ;;
    esac
    prev_arg="$arg"
done

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
    local ms=$1 label=$2 ok=${3:-2000} warn=${4:-5000}
    local formatted
    formatted="$(_fmt_ms "$ms")"
    if [[ $ms -le $ok ]]; then
        echo -e "  ${GREEN}✓${NC} ${label}: ${GREEN}${formatted}${NC}"
    elif [[ $ms -le $warn ]]; then
        echo -e "  ${YELLOW}⚠${NC} ${label}: ${YELLOW}${formatted}${NC}"
    else
        echo -e "  ${RED}✗${NC} ${label}: ${RED}${formatted}${NC}"
    fi
}

# --- Results storage ---
declare -a RESULTS=()
PASS_COUNT=0
FAIL_COUNT=0
WARN_COUNT=0
TIMEOUT_COUNT=0

_pass() {
    local label=$1 detail=${2:-""}
    PASS_COUNT=$((PASS_COUNT + 1))
    $JSON_OUTPUT || echo -e "  ${GREEN}✓ PASS${NC}  ${label}${detail:+  ${DIM}${detail}${NC}}"
    RESULTS+=("{\"test\":\"${label}\",\"status\":\"pass\",\"detail\":\"${detail}\"}")
}

_fail() {
    local label=$1 detail=${2:-""}
    FAIL_COUNT=$((FAIL_COUNT + 1))
    $JSON_OUTPUT || echo -e "  ${RED}✗ FAIL${NC}  ${label}${detail:+  ${DIM}${detail}${NC}}"
    RESULTS+=("{\"test\":\"${label}\",\"status\":\"fail\",\"detail\":\"${detail}\"}")
}

_warn_result() {
    local label=$1 detail=${2:-""}
    WARN_COUNT=$((WARN_COUNT + 1))
    $JSON_OUTPUT || echo -e "  ${YELLOW}⚠ WARN${NC}  ${label}${detail:+  ${DIM}${detail}${NC}}"
    RESULTS+=("{\"test\":\"${label}\",\"status\":\"warn\",\"detail\":\"${detail}\"}")
}

_timeout_result() {
    local label=$1 detail=${2:-""}
    TIMEOUT_COUNT=$((TIMEOUT_COUNT + 1))
    $JSON_OUTPUT || echo -e "  ${RED}⏱ TIMEOUT${NC}  ${label}${detail:+  ${DIM}${detail}${NC}}"
    RESULTS+=("{\"test\":\"${label}\",\"status\":\"timeout\",\"detail\":\"${detail}\"}")
}

_perf() {
    local label=$1 ms=$2 ok=$3 warn=$4
    if [[ $ms -le $ok ]]; then
        _pass "$label" "$(_fmt_ms "$ms")"
    elif [[ $ms -le $warn ]]; then
        _warn_result "$label" "$(_fmt_ms "$ms") (threshold: $(_fmt_ms "$ok"))"
    else
        _fail "$label" "$(_fmt_ms "$ms") (threshold: $(_fmt_ms "$warn"))"
    fi
}

# --- Portable timeout wrapper (macOS lacks GNU timeout) ---
if ! command -v timeout &>/dev/null; then
    timeout() {
        local _secs="$1"; shift
        "$@" &
        local _cmd_pid=$!
        ( sleep "$_secs" && kill "$_cmd_pid" 2>/dev/null ) &
        local _dog_pid=$!
        disown "$_dog_pid" 2>/dev/null || true
        local _rc=0
        wait "$_cmd_pid" 2>/dev/null || _rc=$?
        kill "$_dog_pid" 2>/dev/null || true
        return "$_rc"
    }
fi

# ============================================================
#  Section 1: Network reachability & TLS handshake
# ============================================================
test_endpoint_latency() {
    local label=$1 url=$2
    local host port

    # Extract host from URL
    host="$(echo "$url" | sed -E 's|https?://([^/:]+).*|\1|')"

    $JSON_OUTPUT || echo -e "\n${BOLD}${BLUE}Endpoint: ${label}${NC} ${DIM}(${url})${NC}"

    # --- DNS resolution ---
    local dns_start dns_end dns_ms
    dns_start="$(_now_ms)"
    if ! host "$host" &>/dev/null && ! nslookup "$host" &>/dev/null 2>&1; then
        dns_end="$(_now_ms)"
        dns_ms="$(_elapsed "$dns_start" "$dns_end")"
        _fail "${label} DNS" "cannot resolve ${host} (${dns_ms}ms)"
        return 1
    fi
    dns_end="$(_now_ms)"
    dns_ms="$(_elapsed "$dns_start" "$dns_end")"
    _perf "${label} DNS resolution" "$dns_ms" 200 1000

    # --- curl timing (TCP connect + TLS + TTFB) ---
    local curl_out curl_rc=0
    curl_out=$(curl -sS -o /dev/null -w \
        "dns:%{time_namelookup} tcp:%{time_connect} tls:%{time_appconnect} ttfb:%{time_starttransfer} total:%{time_total} http:%{http_code}" \
        --connect-timeout 10 --max-time 15 \
        "${url}/" 2>/dev/null) || curl_rc=$?

    if [[ $curl_rc -ne 0 ]]; then
        _fail "${label} HTTP reachability" "curl exit ${curl_rc}"
        return 1
    fi

    local http_code
    http_code="$(echo "$curl_out" | grep -oP 'http:\K[0-9]+')"

    # Parse timings (seconds → ms)
    local tcp_s tls_s ttfb_s total_s
    tcp_s="$(echo "$curl_out" | grep -oP 'tcp:\K[0-9.]+')"
    tls_s="$(echo "$curl_out" | grep -oP 'tls:\K[0-9.]+')"
    ttfb_s="$(echo "$curl_out" | grep -oP 'ttfb:\K[0-9.]+')"
    total_s="$(echo "$curl_out" | grep -oP 'total:\K[0-9.]+')"

    local tcp_ms tls_ms ttfb_ms total_ms
    tcp_ms="$(echo "$tcp_s * 1000 / 1" | bc)"
    tls_ms="$(echo "$tls_s * 1000 / 1" | bc)"
    ttfb_ms="$(echo "$ttfb_s * 1000 / 1" | bc)"
    total_ms="$(echo "$total_s * 1000 / 1" | bc)"

    _perf "${label} TCP connect" "$tcp_ms" 500 2000
    _perf "${label} TLS handshake" "$tls_ms" 1000 3000
    _perf "${label} TTFB" "$ttfb_ms" 2000 5000
    _perf "${label} total roundtrip" "$total_ms" 3000 8000

    if [[ "$http_code" -ge 200 && "$http_code" -lt 400 ]]; then
        _pass "${label} HTTP status" "${http_code}"
    elif [[ "$http_code" -ge 400 && "$http_code" -lt 500 ]]; then
        # 4xx from skill registries can be normal (no index page)
        _warn_result "${label} HTTP status" "${http_code} (may be expected)"
    else
        _fail "${label} HTTP status" "${http_code}"
    fi
}

# ============================================================
#  Section 2: clawhub CLI dry-run probe
# ============================================================
test_clawhub_cli() {
    $JSON_OUTPUT || echo -e "\n${BOLD}${BLUE}ClawHub CLI${NC}"

    if ! command -v clawhub &>/dev/null; then
        _fail "clawhub binary" "not found in PATH"
        return 1
    fi
    _pass "clawhub binary" "$(command -v clawhub)"

    local ver_start ver_end ver_ms ver_out
    ver_start="$(_now_ms)"
    ver_out="$(clawhub --version 2>/dev/null || echo 'unknown')"
    ver_end="$(_now_ms)"
    ver_ms="$(_elapsed "$ver_start" "$ver_end")"
    _perf "clawhub --version" "$ver_ms" 500 2000
    $JSON_OUTPUT || echo -e "    ${DIM}version: ${ver_out}${NC}"
}

# ============================================================
#  Section 3: Skill registry lookup latency (no install)
# ============================================================
test_skill_lookup() {
    local registry_label=$1 registry_flag=$2
    local skill=$3

    $JSON_OUTPUT || echo -e "\n  ${CYAN}Lookup: ${skill}${NC} via ${registry_label}" >&2

    local lookup_start lookup_end lookup_ms lookup_rc=0
    lookup_start="$(_now_ms)"

    if [[ -n "$registry_flag" ]]; then
        timeout "$CLAWHUB_SKILL_TIMEOUT" \
            clawhub --workdir "${OPENCLAW_DIR}" --registry "$registry_flag" \
            info "$skill" &>/dev/null || lookup_rc=$?
    else
        timeout "$CLAWHUB_SKILL_TIMEOUT" \
            clawhub --workdir "${OPENCLAW_DIR}" \
            info "$skill" &>/dev/null || lookup_rc=$?
    fi

    lookup_end="$(_now_ms)"
    lookup_ms="$(_elapsed "$lookup_start" "$lookup_end")"

    if [[ $lookup_rc -eq 0 ]]; then
        _perf "${registry_label} lookup ${skill}" "$lookup_ms" 3000 8000 >&2
    elif [[ $lookup_rc -eq 124 ]]; then
        _timeout_result "${registry_label} lookup ${skill}" "timed out after ${CLAWHUB_SKILL_TIMEOUT}s" >&2
    else
        # clawhub info may not exist; fall back to install with --force as probe
        _warn_result "${registry_label} lookup ${skill}" "exit ${lookup_rc} (${lookup_ms}ms) — info subcommand may not exist" >&2
    fi

    echo "$lookup_ms"
}

# ============================================================
#  Section 4: Actual skill install latency (--install flag)
# ============================================================
test_skill_install() {
    local registry_label=$1 registry_flag=$2
    local skill=$3

    $JSON_OUTPUT || echo -e "\n  ${CYAN}Install: ${skill}${NC} via ${registry_label}" >&2

    local install_start install_end install_ms install_rc=0
    install_start="$(_now_ms)"

    if [[ -n "$registry_flag" ]]; then
        timeout "$CLAWHUB_SKILL_TIMEOUT" \
            clawhub --workdir "${OPENCLAW_DIR}" --registry "$registry_flag" \
            install "$skill" --force 2>/dev/null || install_rc=$?
    else
        timeout "$CLAWHUB_SKILL_TIMEOUT" \
            clawhub --workdir "${OPENCLAW_DIR}" \
            install "$skill" --force 2>/dev/null || install_rc=$?
    fi

    install_end="$(_now_ms)"
    install_ms="$(_elapsed "$install_start" "$install_end")"

    if [[ $install_rc -eq 0 ]]; then
        _perf "${registry_label} install ${skill}" "$install_ms" 5000 12000 >&2
    elif [[ $install_rc -eq 124 ]]; then
        _timeout_result "${registry_label} install ${skill}" "timed out after ${CLAWHUB_SKILL_TIMEOUT}s" >&2
    else
        _fail "${registry_label} install ${skill}" "exit ${install_rc} (${install_ms}ms)" >&2
    fi

    echo "$install_ms"
}

# ============================================================
#  Section 5: npm registry latency (skills come from npm)
# ============================================================
test_npm_registry() {
    local label=$1 registry=$2

    $JSON_OUTPUT || echo -e "\n${BOLD}${BLUE}npm Registry: ${label}${NC} ${DIM}(${registry})${NC}"

    # Ping test
    local ping_start ping_end ping_ms ping_rc=0
    ping_start="$(_now_ms)"
    curl -sS --connect-timeout 5 --max-time 10 \
        "${registry}/-/ping" -o /dev/null || ping_rc=$?
    ping_end="$(_now_ms)"
    ping_ms="$(_elapsed "$ping_start" "$ping_end")"

    if [[ $ping_rc -eq 0 ]]; then
        _perf "${label} npm ping" "$ping_ms" 500 2000
    else
        _fail "${label} npm ping" "curl exit ${ping_rc} (${ping_ms}ms)"
    fi

    # Package metadata fetch (simulate what npm install does)
    local meta_start meta_end meta_ms meta_rc=0
    meta_start="$(_now_ms)"
    curl -sS --connect-timeout 5 --max-time 15 \
        "${registry}/clawhub" -o /dev/null || meta_rc=$?
    meta_end="$(_now_ms)"
    meta_ms="$(_elapsed "$meta_start" "$meta_end")"

    if [[ $meta_rc -eq 0 ]]; then
        _perf "${label} npm metadata (clawhub)" "$meta_ms" 1000 5000
    else
        _warn_result "${label} npm metadata" "curl exit ${meta_rc} (${meta_ms}ms)"
    fi
}

# ============================================================
#  Section 6: Parallel vs sequential install simulation
# ============================================================
test_sequential_install_time() {
    local registry_label=$1 registry_flag=$2
    local total_ms=0

    $JSON_OUTPUT || echo -e "\n${BOLD}${BLUE}Sequential Install Simulation: ${registry_label}${NC}" >&2
    $JSON_OUTPUT || echo -e "  ${DIM}Skills: ${CORE_SKILLS[*]}${NC}" >&2
    $JSON_OUTPUT || echo -e "  ${DIM}Timeout per skill: ${CLAWHUB_SKILL_TIMEOUT}s${NC}" >&2

    local all_start all_end
    all_start="$(_now_ms)"

    local installed=0 timed_out=0 failed=0

    for skill in "${CORE_SKILLS[@]}"; do
        local ms
        if $DO_INSTALL; then
            ms="$(test_skill_install "$registry_label" "$registry_flag" "$skill")"
        else
            ms="$(test_skill_lookup "$registry_label" "$registry_flag" "$skill")"
        fi
        total_ms=$((total_ms + ms))
    done

    all_end="$(_now_ms)"
    local wall_ms
    wall_ms="$(_elapsed "$all_start" "$all_end")"

    $JSON_OUTPUT || echo "" >&2
    $JSON_OUTPUT || _color_ms "$wall_ms" "${registry_label} total wall time (${#CORE_SKILLS[@]} skills)" 10000 30000 >&2

    # Estimate worst-case: if all skills timeout
    local worst_case_ms=$(( ${#CORE_SKILLS[@]} * CLAWHUB_SKILL_TIMEOUT * 1000 ))
    if [[ $wall_ms -ge $worst_case_ms ]]; then
        _fail "${registry_label} stall detection" "wall time ${wall_ms}ms ≥ worst case ${worst_case_ms}ms — all skills likely timed out" >&2
    elif [[ $wall_ms -ge $((worst_case_ms / 2)) ]]; then
        _warn_result "${registry_label} stall detection" "wall time ${wall_ms}ms ≥ 50% of worst case — partial stalls detected" >&2
    fi

    echo "$wall_ms"
}

# ============================================================
#  Main
# ============================================================
main() {
    $JSON_OUTPUT || echo -e "${BOLD}╔══════════════════════════════════════════════════════════════╗${NC}"
    $JSON_OUTPUT || echo -e "${BOLD}║       AcaClaw ClawHub & Mirror Latency Test                 ║${NC}"
    $JSON_OUTPUT || echo -e "${BOLD}╚══════════════════════════════════════════════════════════════╝${NC}"
    $JSON_OUTPUT || echo -e "${DIM}Primary:  ${CLAWHUB_PRIMARY}${NC}"
    $JSON_OUTPUT || echo -e "${DIM}Mirror:   ${CLAWHUB_MIRROR}${NC}"
    $JSON_OUTPUT || echo -e "${DIM}Timeout:  ${CLAWHUB_SKILL_TIMEOUT}s/skill | Rounds: ${ROUNDS}${NC}"
    $JSON_OUTPUT || echo -e "${DIM}Mode:     $($DO_INSTALL && echo "install (real)" || echo "lookup (non-destructive)")${NC}"
    $JSON_OUTPUT || echo ""

    for round in $(seq 1 "$ROUNDS"); do
        if [[ $ROUNDS -gt 1 ]]; then
            $JSON_OUTPUT || echo -e "\n${BOLD}═══ Round ${round}/${ROUNDS} ═══${NC}"
        fi

        # --- Endpoint reachability ---
        $JSON_OUTPUT || echo -e "\n${BOLD}${BLUE}── Network Reachability ──${NC}"

        if ! $MIRROR_ONLY; then
            test_endpoint_latency "Primary" "$CLAWHUB_PRIMARY"
        fi
        if ! $PRIMARY_ONLY; then
            test_endpoint_latency "Mirror" "$CLAWHUB_MIRROR"
        fi

        # --- npm registries (skills are npm packages) ---
        $JSON_OUTPUT || echo -e "\n${BOLD}${BLUE}── npm Registry Latency ──${NC}"

        if ! $MIRROR_ONLY; then
            test_npm_registry "Primary" "https://registry.npmjs.org"
        fi
        if ! $PRIMARY_ONLY; then
            test_npm_registry "CN Mirror" "https://registry.npmmirror.com"
        fi

        # --- clawhub CLI ---
        test_clawhub_cli

        # --- Skill install / lookup ---
        $JSON_OUTPUT || echo -e "\n${BOLD}${BLUE}── Skill $($DO_INSTALL && echo "Install" || echo "Lookup") Latency ──${NC}"

        local primary_total=0 mirror_total=0

        if ! $MIRROR_ONLY; then
            primary_total="$(test_sequential_install_time "Primary" "")"
        fi
        if ! $PRIMARY_ONLY; then
            mirror_total="$(test_sequential_install_time "Mirror" "$CLAWHUB_MIRROR")"
        fi

        # --- Comparison ---
        if ! $MIRROR_ONLY && ! $PRIMARY_ONLY && [[ $primary_total -gt 0 && $mirror_total -gt 0 ]]; then
            $JSON_OUTPUT || echo -e "\n${BOLD}${BLUE}── Comparison ──${NC}"
            local diff_ms faster
            if [[ $primary_total -le $mirror_total ]]; then
                diff_ms=$((mirror_total - primary_total))
                faster="Primary"
            else
                diff_ms=$((primary_total - mirror_total))
                faster="Mirror"
            fi
            $JSON_OUTPUT || echo -e "  Primary: $(_fmt_ms "$primary_total") | Mirror: $(_fmt_ms "$mirror_total")"
            $JSON_OUTPUT || echo -e "  ${BOLD}${faster} is faster by $(_fmt_ms "$diff_ms")${NC}"

            if [[ "$faster" == "Mirror" && $diff_ms -gt 5000 ]]; then
                $JSON_OUTPUT || echo -e "\n  ${YELLOW}💡 Recommendation: Set CLAWHUB_MIRROR=${CLAWHUB_MIRROR} during install${NC}"
                $JSON_OUTPUT || echo -e "  ${DIM}   or increase CLAWHUB_SKILL_TIMEOUT beyond ${CLAWHUB_SKILL_TIMEOUT}s${NC}"
            fi
        fi
    done

    # --- Diagnostics ---
    $JSON_OUTPUT || echo -e "\n${BOLD}${BLUE}── Diagnostics ──${NC}"

    # Check if skills dir exists
    local skills_dir="${OPENCLAW_DIR}/skills"
    if [[ -d "$skills_dir" ]]; then
        local installed_count
        installed_count="$(find "$skills_dir" -maxdepth 1 -mindepth 1 -type d 2>/dev/null | wc -l)"
        _pass "Skills directory" "${skills_dir} (${installed_count} installed)"
    else
        _warn_result "Skills directory" "${skills_dir} does not exist"
    fi

    # Check DNS resolver
    local resolv_ns
    resolv_ns="$(grep '^nameserver' /etc/resolv.conf 2>/dev/null | head -1 | awk '{print $2}' || echo 'unknown')"
    $JSON_OUTPUT || echo -e "  ${DIM}DNS nameserver: ${resolv_ns}${NC}"

    # Check if behind proxy
    if [[ -n "${HTTP_PROXY:-}${HTTPS_PROXY:-}${http_proxy:-}${https_proxy:-}" ]]; then
        $JSON_OUTPUT || echo -e "  ${YELLOW}⚠ HTTP proxy detected: ${HTTP_PROXY:-${http_proxy:-}}${NC}"
    fi

    # --- Summary ---
    local total=$((PASS_COUNT + FAIL_COUNT + WARN_COUNT + TIMEOUT_COUNT))
    $JSON_OUTPUT || echo -e "\n${BOLD}── Summary ──${NC}"
    $JSON_OUTPUT || echo -e "  ${GREEN}${PASS_COUNT} pass${NC}  ${RED}${FAIL_COUNT} fail${NC}  ${YELLOW}${WARN_COUNT} warn${NC}  ${RED}${TIMEOUT_COUNT} timeout${NC}  (${total} checks)"

    if [[ $TIMEOUT_COUNT -gt 0 ]]; then
        $JSON_OUTPUT || echo -e "\n  ${YELLOW}${BOLD}⚠ Stall diagnosis:${NC}"
        $JSON_OUTPUT || echo -e "  ${DIM}${TIMEOUT_COUNT} operations timed out. Common causes:${NC}"
        $JSON_OUTPUT || echo -e "  ${DIM}  1. clawhub.ai unreachable from your network (firewall/GFW)${NC}"
        $JSON_OUTPUT || echo -e "  ${DIM}  2. DNS resolution slow (try: CLAWHUB_MIRROR=https://cn.clawhub-mirror.com)${NC}"
        $JSON_OUTPUT || echo -e "  ${DIM}  3. npm registry blocked (try: npm config set registry https://registry.npmmirror.com)${NC}"
        $JSON_OUTPUT || echo -e "  ${DIM}  4. CLAWHUB_SKILL_TIMEOUT=${CLAWHUB_SKILL_TIMEOUT}s too short for your connection${NC}"
    fi

    if [[ $FAIL_COUNT -gt 0 ]]; then
        $JSON_OUTPUT || echo ""
        $JSON_OUTPUT || echo -e "  ${RED}${BOLD}✗ ${FAIL_COUNT} check(s) failed.${NC}"
        $JSON_OUTPUT || echo -e "  ${DIM}Try: CLAWHUB_MIRROR=https://cn.clawhub-mirror.com CLAWHUB_SKILL_TIMEOUT=30 bash scripts/install.sh${NC}"
    fi

    # --- JSON output ---
    if $JSON_OUTPUT; then
        echo "{"
        echo "  \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\","
        echo "  \"primary\": \"${CLAWHUB_PRIMARY}\","
        echo "  \"mirror\": \"${CLAWHUB_MIRROR}\","
        echo "  \"timeout_per_skill\": ${CLAWHUB_SKILL_TIMEOUT},"
        echo "  \"rounds\": ${ROUNDS},"
        echo "  \"mode\": \"$($DO_INSTALL && echo "install" || echo "lookup")\","
        echo "  \"summary\": {\"pass\": ${PASS_COUNT}, \"fail\": ${FAIL_COUNT}, \"warn\": ${WARN_COUNT}, \"timeout\": ${TIMEOUT_COUNT}},"
        echo "  \"results\": ["
        local first=true
        for r in "${RESULTS[@]}"; do
            $first || echo ","
            echo -n "    $r"
            first=false
        done
        echo ""
        echo "  ]"
        echo "}"
    fi

    # Exit with failure if any timeouts or failures
    [[ $FAIL_COUNT -eq 0 && $TIMEOUT_COUNT -eq 0 ]]
}

main

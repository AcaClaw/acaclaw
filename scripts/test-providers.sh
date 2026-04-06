#!/usr/bin/env bash
# AcaClaw Provider API Latency Test
# Tests each configured provider's API directly (bypasses gateway).
# Only tests providers whose API key is set — skips the rest.
#
# Usage:
#   bash scripts/test-providers.sh                    # Test all configured providers
#   bash scripts/test-providers.sh --provider dashscope  # Test one provider only
#   bash scripts/test-providers.sh --json             # Output JSON report
#   bash scripts/test-providers.sh --rounds 5         # Run 5 rounds (default: 3)
#
# Env overrides (optional):
#   MODELSTUDIO_API_KEY   — Aliyun DashScope / Bailian (qwen-plus)
#   OPENROUTER_API_KEY    — OpenRouter (anthropic/claude-sonnet-4)
#   MOONSHOT_API_KEY      — Moonshot / Kimi (kimi-k2.5)
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

ROUNDS=3
ONLY_PROVIDER=""
JSON_OUT=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --provider)  ONLY_PROVIDER="$2"; shift 2 ;;
        --json)      JSON_OUT=true; shift ;;
        --rounds)    ROUNDS="$2"; shift 2 ;;
        -h|--help)
            echo "Usage: bash scripts/test-providers.sh [--provider <name>] [--rounds N] [--json]"
            echo "Providers: dashscope, openrouter, moonshot"
            exit 0 ;;
        *)           echo "Unknown option: $1"; exit 1 ;;
    esac
done

OPENCLAW_CONFIG="${HOME}/.openclaw/openclaw.json"

# ── Read API key from env var or openclaw.json config ──
_resolve_key() {
    local env_var=$1
    # Check env first
    local val="${!env_var:-}"
    if [[ -n "$val" ]]; then
        echo "$val"
        return
    fi
    # Fall back to openclaw.json → env.<VAR>
    if [[ -f "$OPENCLAW_CONFIG" ]]; then
        val=$(python3 -c "
import json, sys
try:
    d = json.load(open('$OPENCLAW_CONFIG'))
    print(d.get('env', {}).get('$env_var', ''))
except: pass
" 2>/dev/null)
        echo "$val"
    fi
}

# ── Timing helper (ms) ──
_now_ms() {
    python3 -c "import time; print(int(time.time() * 1000))"
}

# ── Generic OpenAI-compatible streaming latency test ──
# Args: base_url, api_key, model, display_name
# Returns JSON with ttft_ms, total_ms, tokens, response_preview
_test_openai_stream() {
    local base_url=$1 api_key=$2 model=$3 display_name=$4
    local prompt="Reply with exactly one word: hello"

    PROVIDER_BASE_URL="$base_url" \
    PROVIDER_API_KEY="$api_key" \
    PROVIDER_MODEL="$model" \
    PROVIDER_PROMPT="$prompt" \
    python3 -c '
import os, json, time, urllib.request, urllib.error, ssl

base_url = os.environ["PROVIDER_BASE_URL"].rstrip("/")
api_key  = os.environ["PROVIDER_API_KEY"]
model    = os.environ["PROVIDER_MODEL"]
prompt   = os.environ["PROVIDER_PROMPT"]

url = base_url + "/chat/completions"
body = json.dumps({
    "model": model,
    "messages": [{"role": "user", "content": prompt}],
    "stream": True,
    "max_tokens": 64,
    "temperature": 0
}).encode()

headers = {
    "Content-Type": "application/json",
    "Authorization": f"Bearer {api_key}"
}
req = urllib.request.Request(url, data=body, headers=headers, method="POST")

# Allow self-signed certs for internal mirrors
ctx = ssl.create_default_context()

t0 = time.time()
t_first = None
full_text = ""
input_tokens = None
output_tokens = None

try:
    with urllib.request.urlopen(req, context=ctx, timeout=60) as resp:
        for raw_line in resp:
            line = raw_line.decode("utf-8", errors="replace").strip()
            if not line.startswith("data: "):
                continue
            data = line[6:]
            if data == "[DONE]":
                break
            try:
                chunk = json.loads(data)
            except json.JSONDecodeError:
                continue

            # TTFT: first chunk with content
            choices = chunk.get("choices", [])
            if choices:
                delta = choices[0].get("delta", {})
                content = delta.get("content", "")
                if content and t_first is None:
                    t_first = time.time()
                if content:
                    full_text += content

            # Token usage (some providers send it in the last chunk)
            usage = chunk.get("usage")
            if usage:
                input_tokens = usage.get("prompt_tokens") or usage.get("input_tokens")
                output_tokens = usage.get("completion_tokens") or usage.get("output_tokens")

    t_end = time.time()
    result = {
        "ok": True,
        "ttft_ms": int((t_first - t0) * 1000) if t_first else None,
        "total_ms": int((t_end - t0) * 1000),
        "stream_ms": int((t_end - t_first) * 1000) if t_first else None,
        "response_length": len(full_text),
        "response_preview": full_text[:120].strip(),
        "input_tokens": input_tokens,
        "output_tokens": output_tokens
    }
    print(json.dumps(result))

except urllib.error.HTTPError as e:
    t_end = time.time()
    error_body = ""
    try:
        error_body = e.read().decode("utf-8", errors="replace")[:200]
    except: pass
    print(json.dumps({
        "ok": False,
        "error": f"HTTP {e.code}",
        "detail": error_body,
        "total_ms": int((t_end - t0) * 1000)
    }))

except Exception as e:
    t_end = time.time()
    print(json.dumps({
        "ok": False,
        "error": str(e),
        "total_ms": int((t_end - t0) * 1000)
    }))
' 2>/dev/null
}

# ── Result formatting ──
PASS_COUNT=0
FAIL_COUNT=0
SKIP_COUNT=0
declare -a JSON_RESULTS=()

_fmt_ms() {
    local ms=$1
    if [[ $ms -ge 1000 ]]; then
        echo "$(echo "scale=1; $ms / 1000" | bc)s"
    else
        echo "${ms}ms"
    fi
}

_print_result() {
    local provider=$1 round=$2 json_str=$3
    local ok ttft total preview error detail

    ok=$(echo "$json_str" | python3 -c "import json,sys; print(json.load(sys.stdin).get('ok', False))" 2>/dev/null)

    if [[ "$ok" == "True" ]]; then
        ttft=$(echo "$json_str" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('ttft_ms','?'))" 2>/dev/null)
        total=$(echo "$json_str" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('total_ms','?'))" 2>/dev/null)
        preview=$(echo "$json_str" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('response_preview','')[:60])" 2>/dev/null)

        if [[ "$ttft" != "?" && "$ttft" != "None" ]]; then
            local ttft_fmt
            ttft_fmt=$(_fmt_ms "$ttft")
            local total_fmt
            total_fmt=$(_fmt_ms "$total")
            echo -e "    ${GREEN}✓${NC} Round ${round}: TTFT=${BOLD}${ttft_fmt}${NC}  Total=${BOLD}${total_fmt}${NC}  ${DIM}\"${preview}\"${NC}"
        else
            local total_fmt
            total_fmt=$(_fmt_ms "$total")
            echo -e "    ${GREEN}✓${NC} Round ${round}: Total=${BOLD}${total_fmt}${NC}  ${DIM}\"${preview}\"${NC}"
        fi
        PASS_COUNT=$((PASS_COUNT + 1))
    else
        error=$(echo "$json_str" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('error','unknown'))" 2>/dev/null)
        detail=$(echo "$json_str" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('detail','')[:80])" 2>/dev/null)
        echo -e "    ${RED}✗${NC} Round ${round}: ${RED}${error}${NC}  ${DIM}${detail}${NC}"
        FAIL_COUNT=$((FAIL_COUNT + 1))
    fi

    JSON_RESULTS+=("$json_str")
}

# ══════════════════════════════════════════
# Provider Definitions
# ══════════════════════════════════════════

_test_dashscope() {
    local api_key
    api_key=$(_resolve_key "MODELSTUDIO_API_KEY")
    if [[ -z "$api_key" ]]; then
        echo -e "  ${DIM}– SKIP${NC}  DashScope (Aliyun Bailian): no MODELSTUDIO_API_KEY"
        SKIP_COUNT=$((SKIP_COUNT + 1))
        return
    fi

    # Use Standard China endpoint (dashscope.aliyuncs.com) for Bailian keys
    local base_url="https://dashscope.aliyuncs.com/compatible-mode/v1"
    local model="qwen-plus"

    echo -e "  ${CYAN}▸ DashScope (Aliyun Bailian)${NC}  model=${BOLD}${model}${NC}  url=${DIM}${base_url}${NC}"

    for i in $(seq 1 "$ROUNDS"); do
        local result
        result=$(_test_openai_stream "$base_url" "$api_key" "$model" "DashScope")
        _print_result "dashscope" "$i" "$result"
    done
    echo ""
}

_test_openrouter() {
    local api_key
    api_key=$(_resolve_key "OPENROUTER_API_KEY")
    if [[ -z "$api_key" ]]; then
        echo -e "  ${DIM}– SKIP${NC}  OpenRouter: no OPENROUTER_API_KEY"
        SKIP_COUNT=$((SKIP_COUNT + 1))
        return
    fi

    local base_url="https://openrouter.ai/api/v1"
    local model="anthropic/claude-sonnet-4"

    echo -e "  ${CYAN}▸ OpenRouter${NC}  model=${BOLD}${model}${NC}  url=${DIM}${base_url}${NC}"

    for i in $(seq 1 "$ROUNDS"); do
        local result
        result=$(_test_openai_stream "$base_url" "$api_key" "$model" "OpenRouter")
        _print_result "openrouter" "$i" "$result"
    done
    echo ""
}

_test_moonshot() {
    local api_key
    api_key=$(_resolve_key "MOONSHOT_API_KEY")
    if [[ -z "$api_key" ]]; then
        echo -e "  ${DIM}– SKIP${NC}  Moonshot (Kimi): no MOONSHOT_API_KEY"
        SKIP_COUNT=$((SKIP_COUNT + 1))
        return
    fi

    # Detect region from config base URL, default to CN for Chinese users
    local base_url="https://api.moonshot.cn/v1"
    if [[ -f "$OPENCLAW_CONFIG" ]]; then
        local cfg_url
        cfg_url=$(python3 -c "
import json
try:
    d = json.load(open('$OPENCLAW_CONFIG'))
    u = d.get('models',{}).get('providers',{}).get('moonshot',{}).get('baseUrl','')
    print(u)
except: pass
" 2>/dev/null)
        if [[ -n "$cfg_url" ]]; then
            base_url="$cfg_url"
        fi
    fi

    local model="kimi-k2.5"

    echo -e "  ${CYAN}▸ Moonshot (Kimi)${NC}  model=${BOLD}${model}${NC}  url=${DIM}${base_url}${NC}"

    for i in $(seq 1 "$ROUNDS"); do
        local result
        result=$(_test_openai_stream "$base_url" "$api_key" "$model" "Moonshot")
        _print_result "moonshot" "$i" "$result"
    done
    echo ""
}

# ══════════════════════════════════════════
# Main
# ══════════════════════════════════════════

echo -e ""
echo -e "${BOLD}${CYAN}══════════════════════════════════════════${NC}"
echo -e "${BOLD}${CYAN}  AcaClaw Provider API Latency Test      ${NC}"
echo -e "${BOLD}${CYAN}══════════════════════════════════════════${NC}"
echo -e "  Rounds: ${BOLD}${ROUNDS}${NC}  |  Only configured providers are tested"
echo -e ""

if [[ -n "$ONLY_PROVIDER" ]]; then
    case "$ONLY_PROVIDER" in
        dashscope|modelstudio|qwen|aliyun|bailian) _test_dashscope ;;
        openrouter) _test_openrouter ;;
        moonshot|kimi) _test_moonshot ;;
        *) echo -e "  ${RED}Unknown provider: ${ONLY_PROVIDER}${NC}"; exit 1 ;;
    esac
else
    _test_dashscope
    _test_openrouter
    _test_moonshot
fi

# ── Summary ──
TOTAL=$((PASS_COUNT + FAIL_COUNT))
echo -e "${BOLD}════════════════════════════════════════${NC}"
if [[ $FAIL_COUNT -eq 0 && $TOTAL -gt 0 ]]; then
    echo -e "  ${GREEN}${BOLD}All ${TOTAL} requests succeeded${NC}  (${SKIP_COUNT} provider(s) skipped)"
elif [[ $TOTAL -eq 0 ]]; then
    echo -e "  ${YELLOW}No providers configured.${NC} Set API keys in the AcaClaw UI (API Keys page) or via env vars."
    echo -e "  Supported: MODELSTUDIO_API_KEY, OPENROUTER_API_KEY, MOONSHOT_API_KEY"
else
    echo -e "  ${YELLOW}${PASS_COUNT}/${TOTAL} passed${NC}, ${RED}${FAIL_COUNT} failed${NC}  (${SKIP_COUNT} provider(s) skipped)"
fi
echo -e "${BOLD}════════════════════════════════════════${NC}"

# ── JSON output ──
if $JSON_OUT; then
    echo ""
    echo "["
    local first=true
    for r in "${JSON_RESULTS[@]}"; do
        if $first; then first=false; else echo ","; fi
        echo "  $r"
    done
    echo "]"
fi

exit $FAIL_COUNT

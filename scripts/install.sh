#!/usr/bin/env bash
# AcaClaw Installer — Academic distribution of OpenClaw
# Usage: curl -fsSL https://acaclaw.com/install.sh | bash
# Or:    bash install.sh [--no-conda]
#
# This script is fully non-interactive. It installs all components
# automatically, then opens a browser-based setup wizard for user
# choices (discipline, AI provider, security level, workspace).
#
# AcaClaw uses OpenClaw's default directory (~/.openclaw/).
# If an existing OpenClaw instance is found, AcaClaw merges
# its configuration on top.
# AcaClaw copies auth credentials
# and model config from the user's existing OpenClaw config on install.
# Uninstalling AcaClaw leaves OpenClaw completely untouched.
set -euo pipefail

ACACLAW_VERSION="dev"
ACACLAW_DIR="${ACACLAW_DIR:-$HOME/.acaclaw}"
OPENCLAW_MIN_VERSION="2026.4.2"
NODE_MIN_VERSION="22"
ACACLAW_NPM_PACKAGE="@acaclaw/acaclaw"
CLAWHUB_MIRROR="${CLAWHUB_MIRROR:-https://cn.clawhub-mirror.com}"
CLAWHUB_SKILL_TIMEOUT="${CLAWHUB_SKILL_TIMEOUT:-15}"
NETWORK_TIMEOUT="${NETWORK_TIMEOUT:-60}"
NPM_INSTALL_TIMEOUT="${NPM_INSTALL_TIMEOUT:-600}"

# nvm mirror for China users (gitee mirror)
NVM_MIRROR="${NVM_MIRROR:-https://gitee.com/mirrors/nvm/raw/master/install.sh}"
NVM_GITHUB_URL="${NVM_GITHUB_URL:-https://github.com/nvm-sh/nvm.git}"
# Node.js binary mirror (npmmirror for China)
NVM_NODEJS_ORG_MIRROR="${NVM_NODEJS_ORG_MIRROR:-}"
# npm registry mirror (set automatically if China mirror is faster)
NPM_REGISTRY_MIRROR="${NPM_REGISTRY_MIRROR:-https://registry.npmmirror.com}"

# Install log — verbose command output goes here instead of terminal
INSTALL_LOG="${TMPDIR:-/tmp}/acaclaw-install-$(date +%s).log"
: > "$INSTALL_LOG"

# AcaClaw runs using the default OpenClaw directory
OPENCLAW_DIR="${HOME}/.openclaw"

# Colors & styles
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
DIM='\033[2m'
BOLD='\033[1m'
NC='\033[0m'

# Unicode symbols (with ASCII fallbacks for non-UTF8 terminals)
if [[ "${LANG:-}" == *UTF-8* ]] || [[ "${LC_ALL:-}" == *UTF-8* ]] || locale charmap 2>/dev/null | grep -qi utf 2>/dev/null; then
	SYM_CHECK="✔"
	SYM_CROSS="✖"
	SYM_WARN="⚠"
	SYM_ARROW="→"
	SYM_DOT="●"
	SYM_CIRCLE="○"
	SYM_PACKAGE="📦"
	SYM_GEAR="⚙"
	SYM_SHIELD="🛡"
	SYM_ROCKET="🚀"
	SYM_SPARKLE="✨"
	SYM_FOLDER="📁"
	SYM_PLUG="🔌"
	SYM_BRAIN="🧠"
	SYM_MICROSCOPE="🔬"
	BAR_FILLED="━"
	BAR_EMPTY="─"
	SPINNER_CHARS=( "⠋" "⠙" "⠹" "⠸" "⠼" "⠴" "⠦" "⠧" "⠇" "⠏" )
else
	SYM_CHECK="[OK]"
	SYM_CROSS="[X]"
	SYM_WARN="[!]"
	SYM_ARROW="->"
	SYM_DOT="*"
	SYM_CIRCLE="o"
	SYM_PACKAGE="[PKG]"
	SYM_GEAR="[CFG]"
	SYM_SHIELD="[SEC]"
	SYM_ROCKET="[GO]"
	SYM_SPARKLE="[*]"
	SYM_FOLDER="[DIR]"
	SYM_PLUG="[PLG]"
	SYM_BRAIN="[AI]"
	SYM_MICROSCOPE="[SCI]"
	BAR_FILLED="#"
	BAR_EMPTY="-"
	SPINNER_CHARS=( "|" "/" "-" "\\" )
fi

# --- Step tracking ---
TOTAL_STEPS=7
CURRENT_STEP=0

# Get terminal width (default 60 for piped/non-interactive)
_term_width() {
	local w
	w=$(tput cols 2>/dev/null) || w=60
	[[ $w -lt 40 ]] && w=60
	echo "$w"
}

# Repeat a (possibly multi-byte UTF-8) character N times.
# tr only handles single-byte chars; this helper works with ─ ━ etc.
_repeat_char() {
	local ch="$1" n="$2" out=""
	for (( _rc_i=0; _rc_i<n; _rc_i++ )); do out+="$ch"; done
	printf '%s' "$out"
}

# --- Pretty logging ---
log()     { echo -e "  ${GREEN}${SYM_CHECK}${NC} $*"; }
warn()    { echo -e "  ${YELLOW}${SYM_WARN}${NC} $*"; }
error()   { echo -e "  ${RED}${SYM_CROSS}${NC} $*" >&2; }
info()    { echo -e "  ${CYAN}${SYM_ARROW}${NC} $*"; }
dimlog()  { echo -e "  ${DIM}$*${NC}"; }

# Section header with step counter and progress dots
header() {
	CURRENT_STEP=$((CURRENT_STEP + 1))
	local title="$1"
	local icon="${2:-$SYM_DOT}"
	local w
	w=$(_term_width)

	echo ""
	# Top border
	printf "  ${BLUE}"
	_repeat_char '─' $((w - 4))
	printf "${NC}\n"

	# Step line with icon
	printf "  ${BOLD}${BLUE}${icon}  Step %d of %d: %s${NC}\n" "$CURRENT_STEP" "$TOTAL_STEPS" "$title"

	# Step dots: ● = completed, ◉ = current, ○ = pending
	printf "  "
	for (( s=1; s<=TOTAL_STEPS; s++ )); do
		if [[ $s -lt $CURRENT_STEP ]]; then
			printf "${GREEN}●${NC} "
		elif [[ $s -eq $CURRENT_STEP ]]; then
			printf "${CYAN}◉${NC} "
		else
			printf "${DIM}○${NC} "
		fi
	done
	printf "\n"

	# Bottom border
	printf "  ${BLUE}"
	_repeat_char '─' $((w - 4))
	printf "${NC}\n"
	echo ""
}

# Show a banner header (used once at the start)
show_banner() {
	local w
	w=$(_term_width)
	echo ""
	echo -e "${BOLD}${CYAN}"
	cat <<'BANNER'
      _                 ____ _
     / \   ___ __ _  / ___| | __ ___      __
    / _ \ / __/ _` || |   | |/ _` \ \ /\ / /
   / ___ \ (_| (_| || |___| | (_| |\ V  V /
  /_/   \_\___\__,_| \____|_|\__,_| \_/\_/
BANNER
	echo -e "${NC}"
	printf "  ${DIM}Academic AI Research Assistant${NC}  ${BOLD}v${ACACLAW_VERSION}${NC}\n"
	if [[ "${IS_UPGRADE:-false}" == "true" ]]; then
		printf "  ${YELLOW}${SYM_ARROW} Upgrading from v${INSTALLED_VERSION:-unknown}${NC}\n"
	fi
	printf "  ${DIM}$(date '+%B %d, %Y at %H:%M')${NC}\n"
	echo ""

	# System info box
	local os_display arch_display
	case "$PLATFORM" in
		wsl2)    os_display="WSL2 (Linux)" ;;
		linux)   os_display="Linux" ;;
		macos)   os_display="macOS" ;;
		windows) os_display="Windows" ;;
		*) os_display="$OS" ;;
	esac
	case "$ARCH" in
		x86_64)  arch_display="x86_64 (64-bit)" ;;
		aarch64) arch_display="ARM64" ;;
		*) arch_display="$ARCH" ;;
	esac
	printf "  ${BLUE}┌──────────────────────────────────────┐${NC}\n"
	printf "  ${BLUE}│${NC}  ${SYM_GEAR}  System: %-25s ${BLUE}│${NC}\n" "${os_display} ${arch_display}"
	printf "  ${BLUE}│${NC}  ${SYM_FOLDER}  Target: %-25s ${BLUE}│${NC}\n" "~/.acaclaw"
	printf "  ${BLUE}└──────────────────────────────────────┘${NC}\n"
	echo ""
}

# Animated spinner — runs in background, call stop_spinner to end
_SPINNER_PID=""
start_spinner() {
	local msg="${1:-Working...}"
	local status_file="${2:-}"  # optional: path to file with live status updates
	# Don't start a spinner if stdout is not a terminal
	if [[ ! -t 1 ]]; then
		echo -e "  ${CYAN}${SYM_ARROW}${NC} ${msg}"
		return
	fi
	(
		local i=0 _status _display _elapsed _start_ts
		_start_ts=$(date +%s)
		while true; do
			if [[ -n "$status_file" && -f "$status_file" ]]; then
				_status="$(cat "$status_file" 2>/dev/null || true)"
				_elapsed=$(( $(date +%s) - _start_ts ))
				if [[ -n "$_status" ]]; then
					if [[ $_elapsed -ge 10 ]]; then
						_display="${msg}  ${DIM}— ${_status} (${_elapsed}s)${NC}"
					else
						_display="${msg}  ${DIM}— ${_status}${NC}"
					fi
				else
					_display="$msg"
				fi
			else
				_display="$msg"
			fi
			printf "\r\033[2K  ${CYAN}%s${NC} %b" "${SPINNER_CHARS[$((i % ${#SPINNER_CHARS[@]}))]}" "$_display"
			i=$((i + 1))
			sleep 0.1
		done
	) &
	_SPINNER_PID=$!
	disown "$_SPINNER_PID" 2>/dev/null || true
}

stop_spinner() {
	local result="${1:-done}"
	local color="${2:-$GREEN}"
	if [[ -n "$_SPINNER_PID" ]] && kill -0 "$_SPINNER_PID" 2>/dev/null; then
		kill "$_SPINNER_PID" 2>/dev/null || true
		wait "$_SPINNER_PID" 2>/dev/null || true
		_SPINNER_PID=""
	fi
	# Clear the spinner line (only if terminal)
	if [[ -t 1 ]]; then
		printf "\r\033[K"
	fi
	echo -e "  ${color}${SYM_CHECK}${NC} ${result}"
}

stop_spinner_warn() {
	local result="${1:-warning}"
	if [[ -n "$_SPINNER_PID" ]] && kill -0 "$_SPINNER_PID" 2>/dev/null; then
		kill "$_SPINNER_PID" 2>/dev/null || true
		wait "$_SPINNER_PID" 2>/dev/null || true
		_SPINNER_PID=""
	fi
	if [[ -t 1 ]]; then
		printf "\r\033[K"
	fi
	echo -e "  ${YELLOW}${SYM_WARN}${NC} ${result}"
}

stop_spinner_fail() {
	local result="${1:-failed}"
	if [[ -n "$_SPINNER_PID" ]] && kill -0 "$_SPINNER_PID" 2>/dev/null; then
		kill "$_SPINNER_PID" 2>/dev/null || true
		wait "$_SPINNER_PID" 2>/dev/null || true
		_SPINNER_PID=""
	fi
	if [[ -t 1 ]]; then
		printf "\r\033[K"
	fi
	echo -e "  ${RED}${SYM_CROSS}${NC} ${result}"
}

# Mini progress bar for counted items (e.g. 3/7 plugins installed)
show_item_progress() {
	local current="$1"
	local total="$2"
	local label="${3:-}"
	local bar_len=20
	local filled=$(( bar_len * current / total ))
	local empty=$(( bar_len - filled ))

	# Clear entire line first to avoid leftover text from longer previous labels
	printf "\r\033[2K  "
	printf "${GREEN}"
	for (( i=0; i<filled; i++ )); do printf '%s' "$BAR_FILLED"; done
	printf "${DIM}"
	for (( i=0; i<empty; i++ )); do printf '%s' "$BAR_EMPTY"; done
	printf " ${NC}%d/%d" "$current" "$total"
	[[ -n "$label" ]] && printf " %s" "$label"
	[[ $current -eq $total ]] && printf "\n"
	return 0
}

# Info box for important messages
info_box() {
	local msg="$1"
	local icon="${2:-$SYM_ARROW}"
	local w
	w=$(_term_width)
	local inner_w=$((w - 8))
	[[ $inner_w -gt 60 ]] && inner_w=60

	printf "  ${MAGENTA}┌"
	_repeat_char '─' "$inner_w"
	printf "┐${NC}\n"
	printf "  ${MAGENTA}│${NC} ${icon}  %-$(( inner_w - 5 ))s ${MAGENTA}│${NC}\n" "$msg"
	printf "  ${MAGENTA}└"
	_repeat_char '─' "$inner_w"
	printf "┘${NC}\n"
}

# --- Portable timeout wrapper (macOS lacks GNU timeout) ---
if ! command -v timeout &>/dev/null; then
	timeout() {
		local _secs="$1"; shift
		# Run command in background with a watchdog timer.
		"$@" &
		local _cmd_pid=$!
		# Watchdog: kill the command if it exceeds the deadline
		( sleep "$_secs" && kill "$_cmd_pid" 2>/dev/null ) &
		local _dog_pid=$!
		disown "$_dog_pid" 2>/dev/null || true
		# Wait for the command (ignore errors from wait itself under set -e)
		local _rc=0
		wait "$_cmd_pid" 2>/dev/null || _rc=$?
		# Kill the watchdog if it's still sleeping
		kill "$_dog_pid" 2>/dev/null || true
		return "$_rc"
	}
fi

# --- Handle --help and unknown flags before cloning (avoids network delay) ---
case "${1:-}" in
	--help|-h)
		echo "AcaClaw Installer v${ACACLAW_VERSION}"
		echo ""
		echo "Usage: bash install.sh [OPTIONS]"
		echo ""
		echo "Options:"
		echo "  --no-conda                 Skip Miniforge/Conda installation"
		echo "  -h, --help                 Show this help"
		exit 0
		;;
	--no-conda|"")
		# Valid option or no args — continue to resolve source
		;;
	*)
		echo "Error: Unknown option: $1" >&2
		echo "Run 'bash install.sh --help' for usage." >&2
		exit 1
		;;
esac

# --- npm registry detection (used by both source download and package installs) ---

# npm registry speed test — download a small metadata payload to measure real latency.
# Returns the fastest registry URL (or empty to let npm use its default).
_pick_npm_registry() {
	local _registries=(
		"https://registry.npmjs.org"
		"https://registry.npmmirror.com"
	)
	local _best_reg="" _best_ms=999999
	local _test_url _ms _start _end

	for _reg in "${_registries[@]}"; do
		_test_url="${_reg}/@acaclaw%2facaclaw"
		_start=$(date +%s%N 2>/dev/null || echo 0)
		if curl -fsSL --max-time 8 -o /dev/null "$_test_url" 2>/dev/null; then
			_end=$(date +%s%N 2>/dev/null || echo 0)
			_ms=$(( (_end - _start) / 1000000 ))
			echo "  ${_reg##*/}: ${_ms}ms" >> "$INSTALL_LOG"
			if [[ $_ms -lt $_best_ms ]]; then
				_best_ms=$_ms
				_best_reg="$_reg"
			fi
		else
			echo "  ${_reg##*/}: unreachable" >> "$INSTALL_LOG"
		fi
	done

	if [[ -n "$_best_reg" ]]; then
		echo "$_best_reg"
	else
		echo ""
	fi
}

# Cached registry URL — set once and reused for all npm operations
_CACHED_NPM_REGISTRY=""

# --- Resolve REPO_ROOT ---
# When run locally from a git clone: SCRIPT_DIR/../ is the repo root.
# When piped via curl: download the npm package, then use it as root.

_resolve_repo_root() {
	# Explicit REPO_ROOT override (dev/CI)
	if [[ -n "${REPO_ROOT:-}" && -f "${REPO_ROOT}/scripts/install.sh" ]]; then
		log "Using local source at ${REPO_ROOT} (REPO_ROOT set)"
		return
	fi

	# Detect local checkout — prefer it when running directly from a git clone.
	# Only download via npm when piped via curl (BASH_SOURCE is empty or
	# /dev/stdin), so `bash scripts/install.sh` always uses the local files.
	local _local_root=""
	local _script_path
	_script_path="$(cd "$(dirname "${BASH_SOURCE[0]:-}")" 2>/dev/null && pwd)" || true
	if [[ -n "$_script_path" && -f "${_script_path}/install.sh" && -f "${_script_path}/../package.json" ]]; then
		_local_root="$(cd "${_script_path}/.." && pwd)"
	fi

	# Use local checkout directly — no download needed.
	if [[ -n "$_local_root" ]]; then
		REPO_ROOT="$_local_root"
		return
	fi

	# Reached only via curl | bash — download from npm registry.
	if ! command -v npm &>/dev/null; then
		error "npm is required for remote install. Install Node.js >= ${NODE_MIN_VERSION} and try again."
		exit 1
	fi

	# Pick the fastest npm registry
	_CACHED_NPM_REGISTRY="$(_pick_npm_registry)"
	local _reg_flag=()
	if [[ -n "$_CACHED_NPM_REGISTRY" ]]; then
		_reg_flag=(--registry="$_CACHED_NPM_REGISTRY")
		if [[ "$_CACHED_NPM_REGISTRY" != "https://registry.npmjs.org" ]]; then
			echo -e "  ${CYAN}${SYM_ARROW}${NC} Using npm mirror: ${_CACHED_NPM_REGISTRY##*/}"
		fi
	fi

	ACACLAW_CLONE_DIR="$(mktemp -d)"
	echo -e "  ${CYAN}${SYM_ARROW}${NC} Downloading AcaClaw from npm..."
	if npm install "@acaclaw/acaclaw@latest" \
		--prefix="$ACACLAW_CLONE_DIR" --no-save --ignore-scripts \
		"${_reg_flag[@]}" >> "$INSTALL_LOG" 2>&1; then
		REPO_ROOT="${ACACLAW_CLONE_DIR}/node_modules/@acaclaw/acaclaw"
		return
	fi

	# If mirror failed, try official registry as fallback
	if [[ -n "$_CACHED_NPM_REGISTRY" && "$_CACHED_NPM_REGISTRY" != "https://registry.npmjs.org" ]]; then
		echo -e "  ${YELLOW}${SYM_WARN}${NC} npm mirror failed, trying official registry..."
		rm -rf "$ACACLAW_CLONE_DIR"
		ACACLAW_CLONE_DIR="$(mktemp -d)"
		if npm install "@acaclaw/acaclaw@latest" \
			--prefix="$ACACLAW_CLONE_DIR" --no-save --ignore-scripts \
			--registry=https://registry.npmjs.org >> "$INSTALL_LOG" 2>&1; then
			REPO_ROOT="${ACACLAW_CLONE_DIR}/node_modules/@acaclaw/acaclaw"
			return
		fi
	fi

	rm -rf "$ACACLAW_CLONE_DIR"
	ACACLAW_CLONE_DIR=""

	error "Could not download AcaClaw from npm."
	error "Check your network connection and try again."
	error "Or install manually: npm install -g @acaclaw/acaclaw"
	exit 1
}

_resolve_repo_root
SCRIPT_DIR="${REPO_ROOT}/scripts"

# Read actual version from package.json (replaces hardcoded ACACLAW_VERSION)
if [[ -f "${REPO_ROOT}/package.json" ]]; then
	ACACLAW_VERSION="$(node -e "console.log(require('${REPO_ROOT}/package.json').version)" 2>/dev/null || echo "$ACACLAW_VERSION")"
fi

# --- Upgrade detection ---
# If a previous version is installed, this is an upgrade.
# Upgrade principle: replace app files, preserve user data.
IS_UPGRADE=false
INSTALLED_VERSION=""
VERSION_FILE="${ACACLAW_DIR}/config/version.txt"
if [[ -f "$VERSION_FILE" ]]; then
	INSTALLED_VERSION="$(cat "$VERSION_FILE" 2>/dev/null || echo "")"
	if [[ -n "$INSTALLED_VERSION" ]]; then
		IS_UPGRADE=true
	fi
fi

# Clean up temp dir on exit if we downloaded from npm
_cleanup_clone() {
	if [[ -n "${ACACLAW_CLONE_DIR:-}" && -d "${ACACLAW_CLONE_DIR:-}" ]]; then
		rm -rf "$ACACLAW_CLONE_DIR"
	fi
}
trap '_cleanup_clone' EXIT

# --- Parse arguments ---

SKIP_CONDA=false

while [[ $# -gt 0 ]]; do
	case "$1" in
		--no-conda)
			SKIP_CONDA=true
			shift
			;;
		--help|-h)
			echo "AcaClaw Installer v${ACACLAW_VERSION}"
			echo ""
			echo "Usage: bash install.sh [OPTIONS]"
			echo ""
			echo "Options:"
			echo "  --no-conda                 Skip Miniforge/Conda installation"
			echo "  -h, --help                 Show this help"
			exit 0
			;;
		*)
			error "Unknown option: $1"
			exit 1
			;;
	esac
done

# --- OS detection ---

detect_os() {
	case "$(uname -s)" in
		Linux*)  echo "linux" ;;
		Darwin*) echo "macos" ;;
		MINGW*|MSYS*|CYGWIN*) echo "windows" ;;
		*) error "Unsupported OS: $(uname -s)"; exit 1 ;;
	esac
}

detect_arch() {
	case "$(uname -m)" in
		x86_64|amd64) echo "x86_64" ;;
		aarch64|arm64) echo "aarch64" ;;
		*) error "Unsupported architecture: $(uname -m)"; exit 1 ;;
	esac
}

OS="$(detect_os)"
ARCH="$(detect_arch)"

# Platform: distinguish WSL2 from native Linux
# OS stays "linux" for WSL2 (same packages, same install path)
# PLATFORM is used for browser launch and desktop integration
detect_platform() {
	if [[ -n "${WSL_DISTRO_NAME:-}" ]] || grep -qi microsoft /proc/version 2>/dev/null; then
		echo "wsl2"
	else
		echo "$OS"
	fi
}
PLATFORM="$(detect_platform)"

# --- Prerequisite checks ---

check_command() {
	command -v "$1" &>/dev/null
}

version_ge() {
	# Returns 0 if $1 >= $2 (semver-ish comparison)
	printf '%s\n%s' "$2" "$1" | sort -V | head -n1 | grep -qFx "$2"
}

show_banner

header "Checking Prerequisites" "$SYM_GEAR"

# Check Node.js — auto-install if missing or too old
_need_node_install=false
start_spinner "Checking Node.js..."
if check_command node; then
	NODE_VERSION="$(node --version | sed 's/^v//')"
	NODE_MAJOR="${NODE_VERSION%%.*}"
	if [[ "$NODE_MAJOR" -ge "$NODE_MIN_VERSION" ]]; then
		stop_spinner "Node.js ${NODE_VERSION} found"
	else
		stop_spinner_fail "Node.js ${NODE_MIN_VERSION}+ required (found ${NODE_VERSION})"
		_need_node_install=true
	fi
else
	stop_spinner_fail "Node.js is not installed"
	_need_node_install=true
fi

if [[ "$_need_node_install" == "true" ]]; then
	info "Auto-installing Node.js ${NODE_MIN_VERSION} via nvm (no root required)..."

	export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"

	# --- Install nvm if not present ---
	if [[ ! -s "$NVM_DIR/nvm.sh" ]]; then
		info "Installing nvm..."

		# Determine nvm install script URL.
		# Try the GitHub origin first; fall back to the Gitee mirror (faster in China).
		_nvm_install_url="https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh"
		_nvm_install_ok=false

		_try_nvm_install() {
			local _url="$1"
			if check_command curl; then
				curl -fsSL --max-time "$NETWORK_TIMEOUT" "$_url" 2>>"$INSTALL_LOG" | PROFILE=/dev/null bash >> "$INSTALL_LOG" 2>&1
			elif check_command wget; then
				wget -qO- --timeout="$NETWORK_TIMEOUT" "$_url" 2>>"$INSTALL_LOG" | PROFILE=/dev/null bash >> "$INSTALL_LOG" 2>&1
			else
				error "Cannot download nvm: neither curl nor wget found"
				exit 1
			fi
		}

		# Try GitHub first
		if _try_nvm_install "$_nvm_install_url" 2>/dev/null && [[ -s "$NVM_DIR/nvm.sh" ]]; then
			_nvm_install_ok=true
		fi

		# Fall back to Gitee mirror (for China users behind GFW)
		if [[ "$_nvm_install_ok" != "true" ]]; then
			warn "GitHub nvm install failed, trying Gitee mirror..."
			_nvm_gitee_url="${NVM_MIRROR}"
			if _try_nvm_install "$_nvm_gitee_url" 2>/dev/null && [[ -s "$NVM_DIR/nvm.sh" ]]; then
				_nvm_install_ok=true
			fi
		fi

		if [[ "$_nvm_install_ok" != "true" ]]; then
			error "Failed to install nvm from GitHub and Gitee mirror."
			info_box "Install nvm manually: https://github.com/nvm-sh/nvm" "$SYM_ARROW"
			info_box "China users: ${NVM_MIRROR}" "$SYM_ARROW"
			exit 1
		fi
		log "nvm installed"
	else
		dimlog "nvm already installed at ${NVM_DIR}"
	fi

	# Load nvm into current shell
	# shellcheck disable=SC1091
	source "$NVM_DIR/nvm.sh"

	# --- Set Node.js binary mirror for China users ---
	# If NVM_NODEJS_ORG_MIRROR is already set, use it.
	# Otherwise, auto-detect: test npmmirror vs official and pick the faster one.
	if [[ -z "${NVM_NODEJS_ORG_MIRROR:-}" ]]; then
		_node_mirror_official="https://nodejs.org/dist/"
		_node_mirror_china="https://npmmirror.com/mirrors/node/"
		_off_ms=999999
		_cn_ms=999999

		_start=$(date +%s%N 2>/dev/null || echo 0)
		if curl -fsSL --max-time 5 -o /dev/null "${_node_mirror_official}" 2>/dev/null; then
			_end=$(date +%s%N 2>/dev/null || echo 0)
			_off_ms=$(( (_end - _start) / 1000000 ))
		fi
		_start=$(date +%s%N 2>/dev/null || echo 0)
		if curl -fsSL --max-time 5 -o /dev/null "${_node_mirror_china}" 2>/dev/null; then
			_end=$(date +%s%N 2>/dev/null || echo 0)
			_cn_ms=$(( (_end - _start) / 1000000 ))
		fi

		if [[ $_cn_ms -lt $_off_ms ]]; then
			export NVM_NODEJS_ORG_MIRROR="$_node_mirror_china"
			dimlog "Using Node.js mirror: npmmirror.com (${_cn_ms}ms vs ${_off_ms}ms)"
		fi
	else
		export NVM_NODEJS_ORG_MIRROR
		dimlog "Using Node.js mirror: ${NVM_NODEJS_ORG_MIRROR}"
	fi

	# --- Install Node.js via nvm ---
	info "Installing Node.js ${NODE_MIN_VERSION} via nvm..."
	if ! nvm install "$NODE_MIN_VERSION" >> "$INSTALL_LOG" 2>&1; then
		error "nvm install ${NODE_MIN_VERSION} failed. Check ${INSTALL_LOG} for details."
		exit 1
	fi
	nvm use "$NODE_MIN_VERSION" >> "$INSTALL_LOG" 2>&1

	# Verify
	if check_command node; then
		NODE_VERSION="$(node --version | sed 's/^v//')"
		NODE_MAJOR="${NODE_VERSION%%.*}"
		if [[ "$NODE_MAJOR" -ge "$NODE_MIN_VERSION" ]]; then
			log "Node.js ${NODE_VERSION} installed via nvm"
		else
			error "Installed Node.js ${NODE_VERSION} but ${NODE_MIN_VERSION}+ is required"
			exit 1
		fi
	else
		error "Node.js installation via nvm failed. Check ${INSTALL_LOG} for details."
		info_box "Install Node.js ${NODE_MIN_VERSION}+ manually from https://nodejs.org/" "$SYM_ARROW"
		exit 1
	fi

	# --- Configure npm registry mirror ---
	# Pick fastest npm registry (official vs npmmirror)
	if [[ -z "${_CACHED_NPM_REGISTRY:-}" ]]; then
		_CACHED_NPM_REGISTRY="$(_pick_npm_registry)"
	fi
	if [[ -n "$_CACHED_NPM_REGISTRY" && "$_CACHED_NPM_REGISTRY" != "https://registry.npmjs.org" ]]; then
		npm config set registry "$_CACHED_NPM_REGISTRY" >> "$INSTALL_LOG" 2>&1
		dimlog "npm registry set to ${_CACHED_NPM_REGISTRY}"
	fi
fi

# Check npm
start_spinner "Checking npm..."
if ! check_command npm; then
	stop_spinner_fail "npm is not installed (it should come with Node.js)"
	exit 1
fi
stop_spinner "npm $(npm --version) found"

# --- Install OpenClaw ---

header "Installing OpenClaw" "$SYM_PACKAGE"

# Stream npm progress lines (http fetch, reify) from the install log
# so the user sees what npm is doing instead of a frozen spinner.
# Writes status updates on the SAME line the spinner occupies by using
# a shared temp file that the spinner reads.
_NPM_PROGRESS_PID=""
_NPM_STALL_PID=""
_NPM_STATUS_FILE=""

_start_npm_progress() {
	_NPM_STATUS_FILE="$(mktemp)"
	# Track last-update timestamp for stall detection
	local _ts_file="${_NPM_STATUS_FILE}.ts"
	date +%s > "$_ts_file"
	(
		# Phase tracking: prevent earlier phases from overwriting later ones
		# 0=fetch, 1=resolve, 2=extract, 3=link, 4=compile, 5=postinstall
		_phase=0
		tail -f "$INSTALL_LOG" 2>/dev/null | while IFS= read -r _line; do
			date +%s > "$_ts_file"
			case "$_line" in
				*"build:run:postinstall:"*"Completed"*|*"build:run:install:"*"Completed"*)
					# A native module or postinstall finished
					if [[ $_phase -lt 4 ]]; then
						_phase=4
					fi
					local _mod="${_line##*node_modules/}"
					_mod="${_mod%% *}"
					[[ ${#_mod} -gt 35 ]] && _mod="${_mod:0:32}..."
					echo "Compiled: ${_mod}" > "$_NPM_STATUS_FILE"
					;;
				*"build:run:postinstall"*|*"build:run:install"*)
					# Postinstall phase started (before any Completed lines)
					[[ $_phase -lt 4 ]] && { _phase=4; echo "Running postinstall scripts..." > "$_NPM_STATUS_FILE"; }
					;;
				*"build:link:"*)
					[[ $_phase -lt 3 ]] && { _phase=3; echo "Linking binaries..." > "$_NPM_STATUS_FILE"; }
					;;
				*"reify:unpack"*|*"reifyNode"*)
					[[ $_phase -lt 2 ]] && { _phase=2; echo "Extracting packages..." > "$_NPM_STATUS_FILE"; }
					;;
				*"idealTree"*)
					[[ $_phase -lt 1 ]] && { _phase=1; echo "Building package tree..." > "$_NPM_STATUS_FILE"; }
					;;
				*"http fetch GET"*200*)
					if [[ $_phase -lt 2 ]]; then
						local _url="${_line##*GET }"
						_url="${_url%% *}"
						local _seg="${_url##*/}"
						_seg="${_seg%%[-_][0-9]*}"
						[[ -n "$_seg" ]] && echo "Fetching: ${_seg:0:40}" > "$_NPM_STATUS_FILE"
					fi
					;;
				*"npm timing npm:load"*)
					# New npm invocation (e.g. fallback retry) — reset phases
					_phase=0
					;;
			esac
		done
	) &
	_NPM_PROGRESS_PID=$!

	# Stall detector: if no log activity for 15s, show reassuring messages
	(
		while kill -0 "$_NPM_PROGRESS_PID" 2>/dev/null; do
			sleep 5
			if [[ -f "$_ts_file" ]]; then
				_last=$(cat "$_ts_file" 2>/dev/null || echo 0)
				_now=$(date +%s)
				_gap=$(( _now - _last ))
				if [[ $_gap -ge 60 ]]; then
					echo "Still working, this may take a few minutes..." > "$_NPM_STATUS_FILE"
				elif [[ $_gap -ge 15 ]]; then
					echo "Compiling native modules..." > "$_NPM_STATUS_FILE"
				fi
			fi
		done
	) &
	_NPM_STALL_PID=$!
}

_stop_npm_progress() {
	if [[ -n "${_NPM_PROGRESS_PID:-}" ]]; then
		kill "$_NPM_PROGRESS_PID" 2>/dev/null || true
		wait "$_NPM_PROGRESS_PID" 2>/dev/null || true
		_NPM_PROGRESS_PID=""
	fi
	if [[ -n "${_NPM_STALL_PID:-}" ]]; then
		kill "$_NPM_STALL_PID" 2>/dev/null || true
		wait "$_NPM_STALL_PID" 2>/dev/null || true
		_NPM_STALL_PID=""
	fi
	[[ -n "${_NPM_STATUS_FILE:-}" ]] && rm -f "$_NPM_STATUS_FILE" "${_NPM_STATUS_FILE}.ts"
	_NPM_STATUS_FILE=""
}

_npm_install_with_mirror() {
	local _pkg="$1"
	local _registry="${_CACHED_NPM_REGISTRY}"
	local _timeout="${NPM_INSTALL_TIMEOUT}"

	# Enable npm timing+progress logging so we can show real-time feedback
	local _npm_flags=(--loglevel=http --timing)

	if [[ -n "$_registry" && "$_registry" != "https://registry.npmjs.org" ]]; then
		local _rc=0
		timeout "$_timeout" npm install -g "$_pkg" --registry="$_registry" "${_npm_flags[@]}" >> "$INSTALL_LOG" 2>&1 || _rc=$?
		if [[ $_rc -eq 0 ]]; then
			return 0
		elif [[ $_rc -eq 124 ]]; then
			# timeout killed the process — don't retry, it's not a mirror issue
			return $_rc
		fi
		warn "npm mirror install failed, trying official registry..."
	fi

	timeout "$_timeout" npm install -g "$_pkg" "${_npm_flags[@]}" >> "$INSTALL_LOG" 2>&1
}

_npm_install_openclaw() {
	_npm_install_with_mirror "openclaw@${OPENCLAW_MIN_VERSION}"
}

start_spinner "Checking OpenClaw..."
if check_command openclaw; then
	OC_VERSION="$(openclaw --version 2>/dev/null | head -1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' || echo "unknown")"
	if version_ge "$OC_VERSION" "$OPENCLAW_MIN_VERSION"; then
		stop_spinner "OpenClaw ${OC_VERSION} already installed"
	else
		stop_spinner "OpenClaw ${OC_VERSION} found — upgrade needed"
		if [[ -z "$_CACHED_NPM_REGISTRY" ]]; then
			start_spinner "Checking npm registries..."
			_CACHED_NPM_REGISTRY="$(_pick_npm_registry)"
			if [[ -n "$_CACHED_NPM_REGISTRY" && "$_CACHED_NPM_REGISTRY" != "https://registry.npmjs.org" ]]; then
				stop_spinner "Using mirror: ${_CACHED_NPM_REGISTRY##*/}"
			else
				stop_spinner "Using official registry"
			fi
		fi
		_start_npm_progress
		start_spinner "Downloading OpenClaw ${OPENCLAW_MIN_VERSION}..." "$_NPM_STATUS_FILE"
		if _npm_install_openclaw; then
			_stop_npm_progress
			stop_spinner "OpenClaw ${OPENCLAW_MIN_VERSION} installed"
		else
			_stop_npm_progress
			stop_spinner_fail "Upgrade failed"
			info_box "npm install -g openclaw@${OPENCLAW_MIN_VERSION} failed.\nSee log: ${INSTALL_LOG}"
			exit 1
		fi
	fi
else
	stop_spinner_warn "OpenClaw not found"
	if [[ -z "$_CACHED_NPM_REGISTRY" ]]; then
		start_spinner "Checking npm registries..."
		_CACHED_NPM_REGISTRY="$(_pick_npm_registry)"
		if [[ -n "$_CACHED_NPM_REGISTRY" && "$_CACHED_NPM_REGISTRY" != "https://registry.npmjs.org" ]]; then
			stop_spinner "Using mirror: ${_CACHED_NPM_REGISTRY##*/}"
		else
			stop_spinner "Using official registry"
		fi
	fi
	_start_npm_progress
	start_spinner "Downloading OpenClaw ${OPENCLAW_MIN_VERSION}..." "$_NPM_STATUS_FILE"
	if _npm_install_openclaw; then
		_stop_npm_progress
		stop_spinner "OpenClaw ${OPENCLAW_MIN_VERSION} installed"
	else
		_stop_npm_progress
		stop_spinner_fail "OpenClaw install failed"
		info_box "npm install -g openclaw@${OPENCLAW_MIN_VERSION} failed.\nSee log: ${INSTALL_LOG}\nYou may need to run: sudo npm install -g openclaw@${OPENCLAW_MIN_VERSION}"
		exit 1
	fi
fi

# --- Install Miniforge + Scientific Python ---

header "Setting Up Conda" "$SYM_MICROSCOPE"

if [[ "$SKIP_CONDA" == "true" ]]; then
	warn "Skipping Conda installation (--no-conda)"
else
	MINIFORGE_DIR="${ACACLAW_DIR}/miniforge3"

	# AcaClaw always uses its own Miniforge installation for reproducibility.
	# System conda/miniconda may be too old or have incompatible package caches.
	if [[ -d "$MINIFORGE_DIR" ]]; then
		log "Miniforge already installed"
	fi

	if [[ ! -d "$MINIFORGE_DIR" ]]; then
		info "Miniforge is a lightweight package manager for scientific software"

		case "${OS}-${ARCH}" in
			linux-x86_64)   MINIFORGE_FILE="Miniforge3-Linux-x86_64.sh" ;;
			linux-aarch64)  MINIFORGE_FILE="Miniforge3-Linux-aarch64.sh" ;;
			macos-x86_64)   MINIFORGE_FILE="Miniforge3-MacOSX-x86_64.sh" ;;
			macos-aarch64)  MINIFORGE_FILE="Miniforge3-MacOSX-arm64.sh" ;;
			*) error "No Miniforge build for ${OS}-${ARCH}"; exit 1 ;;
		esac

		# Download sources — try Chinese edu mirrors first (faster in-region), GitHub last
		MINIFORGE_URLS=(
			"https://mirrors.bfsu.edu.cn/github-release/conda-forge/miniforge/LatestRelease"
			"https://mirrors.tuna.tsinghua.edu.cn/github-release/conda-forge/miniforge/LatestRelease"
			"https://github.com/conda-forge/miniforge/releases/latest/download"
		)

		# Pick fastest mirror by testing HEAD latency
		_pick_miniforge_mirror() {
			local _best_url="" _best_ms=999999
			for _mf_url in "${MINIFORGE_URLS[@]}"; do
				local _test_url="${_mf_url}/${MINIFORGE_FILE}"
				local _start_ns _end_ns _ms
				_start_ns=$(date +%s%N)
				if curl -fsSI --connect-timeout 5 --max-time 8 "$_test_url" >/dev/null 2>&1; then
					_end_ns=$(date +%s%N)
					_ms=$(( (_end_ns - _start_ns) / 1000000 ))
					if [[ $_ms -lt $_best_ms ]]; then
						_best_ms=$_ms
						_best_url="$_mf_url"
					fi
				fi
			done
			if [[ -n "$_best_url" ]]; then
				echo "$_best_url"
			else
				echo "${MINIFORGE_URLS[0]}"
			fi
		}

		# Miniforge installer checks that $0 ends with .sh
		INSTALLER_PATH="$(mktemp)"
		mv "$INSTALLER_PATH" "${INSTALLER_PATH}.sh"
		INSTALLER_PATH="${INSTALLER_PATH}.sh"

		start_spinner "Checking download mirrors..."
		MINIFORGE_CHOSEN_URL="$(_pick_miniforge_mirror)"
		stop_spinner "Using: ${MINIFORGE_CHOSEN_URL%%/github*}..."

		# Download with visible progress bar (curl -# shows a progress bar)
		echo -e "  ${CYAN}${SYM_ARROW}${NC} Downloading Miniforge..."
		if curl -fSL -# --connect-timeout 15 --max-time 600 \
			"${MINIFORGE_CHOSEN_URL}/${MINIFORGE_FILE}" -o "$INSTALLER_PATH" 2>&1; then
			echo -e "  ${GREEN}${SYM_CHECK}${NC} Downloaded Miniforge"
		else
			warn "Primary mirror failed, trying fallback..."
			DOWNLOAD_OK=false
			for url in "${MINIFORGE_URLS[@]}"; do
				[[ "$url" == "$MINIFORGE_CHOSEN_URL" ]] && continue
				echo -e "  ${CYAN}${SYM_ARROW}${NC} Trying ${url%%/github*}..."
				if curl -fSL -# --connect-timeout 15 --max-time 600 \
					"${url}/${MINIFORGE_FILE}" -o "$INSTALLER_PATH" 2>&1; then
					DOWNLOAD_OK=true
					echo -e "  ${GREEN}${SYM_CHECK}${NC} Downloaded Miniforge"
					break
				fi
			done
			if [[ "$DOWNLOAD_OK" != "true" ]]; then
				rm -f "$INSTALLER_PATH"
				error "Could not download Miniforge from any source."
				error "Check your internet connection and try again."
				exit 1
			fi
		fi

		echo -e "  ${CYAN}${SYM_ARROW}${NC} Installing Miniforge (this takes a minute)..."
		# Log everything, show only key progress to terminal
		_mf_extract_count=0
		_mf_link_count=0
		bash "$INSTALLER_PATH" -b -p "$MINIFORGE_DIR" 2>&1 | while IFS= read -r _mf_line; do
			echo "$_mf_line" >> "$INSTALL_LOG"
			case "$_mf_line" in
				"Extracting "*)
					_mf_extract_count=$((_mf_extract_count + 1))
					printf "\r\033[2K  ${DIM}Extracting packages... (%d)${NC}" "$_mf_extract_count"
					;;
				"Linking "*)
					_mf_link_count=$((_mf_link_count + 1))
					printf "\r\033[2K  ${DIM}Linking packages... (%d)${NC}" "$_mf_link_count"
					;;
				"Transaction finished"*)
					printf "\r\033[2K"
					;;
				"PREFIX="*|"Unpacking"*|"installation finished"*)
					printf "\r\033[2K  ${DIM}%s${NC}" "$_mf_line"
					;;
			esac
		done
		printf "\r\033[2K"
		rm -f "$INSTALLER_PATH"
		echo -e "  ${GREEN}${SYM_CHECK}${NC} Miniforge installed"
	fi

	export PATH="${MINIFORGE_DIR}/bin:$PATH"

	# Determine the conda channel source.
	# Conda reads configs from multiple locations (~/miniconda3/.condarc, ~/.condarc, etc.)
	# and a broken user ~/.condarc can cause SSL failures. We temporarily set aside any
	# user .condarc during install, write our own tested config, and restore it afterward.
	# Mirror test uses conda's own Python SSL stack (not curl) to match conda's behavior.
	_CONDARC_BAK=""
	if [[ -f "$HOME/.condarc" ]]; then
		_CONDARC_BAK="$HOME/.condarc.acaclaw-bak.$$"
		cp "$HOME/.condarc" "$_CONDARC_BAK"
		rm -f "$HOME/.condarc"
	fi
	# Restore user .condarc on exit (normal or error)
	_restore_condarc() {
		if [[ -n "$_CONDARC_BAK" && -f "$_CONDARC_BAK" ]]; then
			mv "$_CONDARC_BAK" "$HOME/.condarc"
			_CONDARC_BAK=""
		fi
	}
	# Extend cleanup: restore condarc + clone dir removal
	trap '_restore_condarc; _cleanup_clone' EXIT

	MIRROR_URLS=(
		"https://mirrors.nju.edu.cn/anaconda/cloud"   # NJU — conda-forge + .zst ✓
		"https://mirror.sjtu.edu.cn/anaconda/cloud"   # SJTU — conda-forge .json ✓
		"https://mirrors.bfsu.edu.cn/anaconda/cloud"  # BFSU — fallback (SSL unreliable)
		"https://mirrors.tuna.tsinghua.edu.cn/anaconda/cloud" # TUNA — fallback
	)
	MIRROR_SET="false"
	start_spinner "Finding fastest package mirror..."
	for mirror_url in "${MIRROR_URLS[@]}"; do
		# Test using conda's own Python + ssl module to match what conda will use.
		# Use .json (not .zst) so SJTU's noarch 403 on .zst doesn't block it.
		TEST_URL="${mirror_url}/conda-forge/noarch/repodata.json"
		if "${MINIFORGE_DIR}/bin/python3" -c "
import urllib.request, ssl, sys
try:
    req = urllib.request.urlopen('${TEST_URL}', timeout=8)
    req.read(1024); req.close(); sys.exit(0)
except Exception: sys.exit(1)
" 2>/dev/null; then
			# Write working mirror config to Miniforge's .condarc
			cat > "${MINIFORGE_DIR}/.condarc" <<CONDARC_EOF
channels:
  - conda-forge
show_channel_urls: true
notify_updates: false
channel_alias: ${mirror_url}
custom_channels:
  conda-forge: ${mirror_url}
CONDARC_EOF
			stop_spinner "Conda mirror configured"
			MIRROR_SET="true"
			break
		else
			: # Try next mirror silently
		fi
	done
	if [[ "$MIRROR_SET" == "false" ]]; then
		# Write official conda-forge config (no mirror)
		cat > "${MINIFORGE_DIR}/.condarc" <<'CONDARC_EOF'
channels:
  - conda-forge
show_channel_urls: true
notify_updates: false
CONDARC_EOF
		stop_spinner "Using official conda-forge channel"
	fi

	# Create the base AcaClaw conda environment with scientific packages.
	# All skills and tools depend on this env existing (conda run -n acaclaw).
	# Discipline-specific envs (bio, med, chem, phys) are created later via
	# the UI Environment tab or onboarding wizard.
	ACACLAW_ENV_YML="${SCRIPT_DIR}/../env/conda/environment-base.yml"
	ACACLAW_ENV_NAME="acaclaw"

	# Check if the env already exists
	if conda env list --json 2>/dev/null | python3 -c "
import json, sys
envs = json.load(sys.stdin).get('envs', [])
sys.exit(0 if any(e.endswith('/envs/${ACACLAW_ENV_NAME}') or e.endswith('/${ACACLAW_ENV_NAME}') for e in envs) else 1)
" 2>/dev/null; then
		log "Conda env '${ACACLAW_ENV_NAME}' already exists"
	elif [[ -f "$ACACLAW_ENV_YML" ]]; then
		info "Creating science environment (Python, NumPy, SciPy, Pandas, JupyterLab)..."
		info "This may take several minutes on first install"
		echo -e "  ${CYAN}${SYM_ARROW}${NC} Installing scientific packages..."
		# Log everything, show condensed progress to terminal
		if conda env create -f "$ACACLAW_ENV_YML" 2>&1 | {
			_conda_pkg_count=0
			while IFS= read -r _conda_line; do
				echo "$_conda_line" >> "$INSTALL_LOG"
				case "$_conda_line" in
					*"Collecting package metadata"*|*"Solving environment"*|*"Preparing transaction"*|*"Verifying transaction"*)
						printf "\r\033[2K  ${DIM}%s${NC}" "$_conda_line"
						;;
					*"Downloading "*)
						_conda_pkg_count=$((_conda_pkg_count + 1))
						printf "\r\033[2K  ${DIM}Downloading packages... (%d)${NC}" "$_conda_pkg_count"
						;;
					*"Executing transaction"*)
						printf "\r\033[2K  ${DIM}Installing packages...${NC}"
						;;
					*"Installing pip dependencies"*|*"Pip subprocess"*|*"Installing collected packages"*|*"Successfully installed"*)
						printf "\r\033[2K  ${DIM}%s${NC}" "${_conda_line:0:80}"
						;;
					*"done"*)
						printf "\r\033[2K"
						;;
				esac
			done
		}; then
			echo -e "  ${GREEN}${SYM_CHECK}${NC} Science environment created"
		else
			# If we were using a mirror, retry with official conda-forge
			if [[ "$MIRROR_SET" == "true" ]]; then
				warn "Conda env creation failed with mirror. Retrying with official conda-forge..."
				cat > "${MINIFORGE_DIR}/.condarc" <<'CONDARC_EOF'
channels:
  - conda-forge
show_channel_urls: true
notify_updates: false
CONDARC_EOF
				if conda env create -f "$ACACLAW_ENV_YML" 2>&1 | {
					_conda_pkg_count=0
					while IFS= read -r _conda_line; do
						echo "$_conda_line" >> "$INSTALL_LOG"
						case "$_conda_line" in
							*"Collecting package metadata"*|*"Solving environment"*|*"Preparing transaction"*|*"Verifying transaction"*)
								printf "\r\033[2K  ${DIM}%s${NC}" "$_conda_line"
								;;
							*"Downloading "*)
								_conda_pkg_count=$((_conda_pkg_count + 1))
								printf "\r\033[2K  ${DIM}Downloading packages... (%d)${NC}" "$_conda_pkg_count"
								;;
							*"Executing transaction"*)
								printf "\r\033[2K  ${DIM}Installing packages...${NC}"
								;;
							*"done"*)
								printf "\r\033[2K"
								;;
						esac
					done
				}; then
					echo -e "  ${GREEN}${SYM_CHECK}${NC} Science environment created (official channel)"
				else
					warn "Env creation failed — you can create it later from the UI"
				fi
			else
				warn "Env creation failed — you can create it later from the UI"
			fi
		fi
	else
		warn "Environment YAML not found at ${ACACLAW_ENV_YML} — skipping env creation"
		warn "You can create the env later from the Environment tab in the UI."
	fi

	# Save conda prefix for plugins to find at runtime
	mkdir -p "${ACACLAW_DIR}/config"
	echo "${MINIFORGE_DIR}" > "${ACACLAW_DIR}/config/conda-prefix.txt"
	log "Conda prefix saved"
fi

# --- Install AcaClaw plugins ---

header "Installing Plugins" "$SYM_PLUG"

mkdir -p "${ACACLAW_DIR}"

# Install plugins to AcaClaw's own profile directory — NOT ~/.openclaw/extensions/
# OpenClaw auto-discovers plugins from <configDir>/extensions/
ACACLAW_PLUGINS_DIR="${OPENCLAW_DIR}/extensions"
mkdir -p "$ACACLAW_PLUGINS_DIR"

REPO_PLUGINS_DIR="${SCRIPT_DIR}/../plugins"

# Plugin list: (source_dir  dest_name  display_name)
_PLUGIN_LIST=(
	"workspace:acaclaw-workspace:Workspace Manager"
	"backup:acaclaw-backup:Backup & Recovery"
	"security:acaclaw-security:Security Guard"
	"academic-env:acaclaw-academic-env:Academic Environment"
	"compat-checker:acaclaw-compat-checker:Compatibility Checker"
	"logger:acaclaw-logger:Activity Logger"
	"ui:acaclaw-ui:UI Plugin"
)

_plugin_total=${#_PLUGIN_LIST[@]}
_plugin_done=0

for _entry in "${_PLUGIN_LIST[@]}"; do
	IFS=':' read -r _src _dest _display <<< "$_entry"
	_plugin_done=$((_plugin_done + 1))
	if [[ -d "${REPO_PLUGINS_DIR}/${_src}" ]]; then
		cp -r "${REPO_PLUGINS_DIR}/${_src}" "${ACACLAW_PLUGINS_DIR}/${_dest}"
		show_item_progress "$_plugin_done" "$_plugin_total" "${_display}"
	else
		show_item_progress "$_plugin_done" "$_plugin_total" "${_display} (skipped)"
	fi
done
echo ""
log "${_plugin_done} plugins installed"

# --- WeChat (openclaw-weixin) channel plugin ---
# Optional plugin — failure here must never block the rest of install.
# Runs in a subshell so set -e cannot propagate.
(
	_install_weixin() {
		local ext_dir="${ACACLAW_PLUGINS_DIR}/openclaw-weixin"
		local patches_dir="${SCRIPT_DIR}/../patches/openclaw-weixin"

		log "Installing WeChat channel plugin (openclaw-weixin)..."
		dimlog "patches dir: $patches_dir (exists: $(test -d "$patches_dir" && echo yes || echo no))"

		# Download latest via npm pack (non-interactive, no QR prompt)
		# Use the cached registry mirror if available (critical for CN users)
		local _reg_args=()
		if [[ -n "${_CACHED_NPM_REGISTRY:-}" ]]; then
			_reg_args=(--registry="$_CACHED_NPM_REGISTRY")
		fi
		local tgz
		tgz=$(cd /tmp && npm pack @tencent-weixin/openclaw-weixin@latest "${_reg_args[@]}" 2>/dev/null) || {
			warn "WeChat plugin download failed (npm pack — check network)"
			return 1
		}
		mkdir -p "$ext_dir"
		tar xzf "/tmp/$tgz" -C "$ext_dir" --strip-components=1 || {
			warn "WeChat plugin extract failed"
			return 1
		}
		rm -f "/tmp/$tgz"

		# Runtime dependencies
		(cd "$ext_dir" && npm install --omit=dev --ignore-scripts "${_reg_args[@]}" >> "$INSTALL_LOG" 2>&1) || true
		(cd "$ext_dir" && npm install --save qrcode "${_reg_args[@]}" >> "$INSTALL_LOG" 2>&1) || true

		# Apply AcaClaw patches (gatewayMethods, accountToSession, QR data URI)
		if [[ -d "$patches_dir" ]]; then
			[[ -f "$patches_dir/channel.ts" ]] && \
				command cp -f "$patches_dir/channel.ts" "$ext_dir/src/channel.ts"
			[[ -f "$patches_dir/login-qr.ts" ]] && \
				command cp -f "$patches_dir/login-qr.ts" "$ext_dir/src/auth/login-qr.ts"
			log "WeChat patches applied"
		else
			warn "patches/openclaw-weixin not found at $patches_dir"
			warn "WeChat web QR login will not work"
		fi

		log "WeChat plugin installed"
	}
	_install_weixin || warn "WeChat plugin skipped (optional, non-fatal)"
) || true

start_spinner "Setting up AcaClaw UI..."
ACAC_UI_SRC="${SCRIPT_DIR}/../ui"
ACAC_UI_DEST="${OPENCLAW_DIR}/ui"

# Rebuild if src/ is newer than dist/ (prevents deploying stale builds)
_ui_needs_rebuild() {
	[[ ! -d "${ACAC_UI_SRC}/dist" ]] && return 0
	[[ ! -d "${ACAC_UI_SRC}/src" ]] && return 1
	local newest_src newest_dist
	newest_src="$(find "${ACAC_UI_SRC}/src" -type f -newer "${ACAC_UI_SRC}/dist" -print -quit 2>/dev/null)"
	[[ -n "$newest_src" ]]
}

# Deploy helper: clean stale hashed assets before copying new build.
# Without this, old chunk files accumulate and cached index.html may
# reference missing hashes after a rebuild, causing blank pages on refresh.
_deploy_ui() {
	mkdir -p "${ACAC_UI_DEST}"
	# Remove old hashed assets (js/css chunks) but keep non-asset files
	rm -rf "${ACAC_UI_DEST}/assets" 2>/dev/null || true
	cp -r "${ACAC_UI_SRC}/dist/"* "${ACAC_UI_DEST}/"
}

if _ui_needs_rebuild && [[ -d "${ACAC_UI_SRC}/src" ]] && check_command npm; then
	(cd "${ACAC_UI_SRC}" && npm install --no-audit --no-fund 2>/dev/null && npm run build 2>/dev/null)
	if [[ -d "${ACAC_UI_SRC}/dist" ]]; then
		_deploy_ui
		stop_spinner "UI built and installed"
	else
		stop_spinner_warn "UI build failed"
	fi
elif [[ -d "${ACAC_UI_SRC}/dist" ]]; then
	_deploy_ui
	stop_spinner "UI installed"
else
	stop_spinner_warn "UI: no dist found and no source to build"
fi

# --- Install essential skills from ClawHub ---

header "Installing Skills" "$SYM_BRAIN"

# Install clawhub CLI if not present
if ! check_command clawhub; then
	# Reuse cached registry if already tested, otherwise test now
	if [[ -z "$_CACHED_NPM_REGISTRY" ]]; then
		start_spinner "Checking npm registries..."
		_CACHED_NPM_REGISTRY="$(_pick_npm_registry)"
		stop_spinner "Registry selected"
	fi
	start_spinner "Installing ClawHub CLI..."
	_npm_install_with_mirror clawhub
	stop_spinner "ClawHub CLI installed"
else
	log "ClawHub CLI ready"
fi

# Install uv (Python package manager) for skill binary dependencies.
# Skills like nano-pdf use uv to install their CLI binaries.
if ! command -v uv &>/dev/null && [[ -n "${MINIFORGE_DIR:-}" ]] && [[ -x "${MINIFORGE_DIR}/bin/pip" ]]; then
	log "Installing uv (Python package manager)..."
	"${MINIFORGE_DIR}/bin/pip" install uv -q 2>/dev/null && log "uv installed ✓" || warn "Failed to install uv"
elif command -v uv &>/dev/null; then
	log "uv ✓"
fi

# Install a single skill from ClawHub with timeout and mirror fallback.
# Usage: _clawhub_install <skill_name>

# Auto-select the fastest ClawHub registry by racing primary vs mirror.
# Caches the result in CLAWHUB_BEST_REGISTRY for subsequent calls.
CLAWHUB_BEST_REGISTRY=""
_CLAWHUB_PROBED=false
_pick_clawhub_registry() {
	# Already probed — return cached result (may be empty = primary)
	if $_CLAWHUB_PROBED; then
		echo "$CLAWHUB_BEST_REGISTRY"
		return 0
	fi
	_CLAWHUB_PROBED=true

	local _primary="https://clawhub.ai"
	local _mirror="${CLAWHUB_MIRROR}"
	local _probe_timeout=5

	# Race both endpoints (TTFB). First to respond wins.
	local _primary_ms _mirror_ms _primary_ok=false _mirror_ok=false

	# Probe primary
	_primary_ms=$(curl -sS -o /dev/null -w "%{time_starttransfer}" \
		--connect-timeout "$_probe_timeout" --max-time "$_probe_timeout" \
		"${_primary}/" 2>/dev/null) && _primary_ok=true || true
	# Probe mirror
	_mirror_ms=$(curl -sS -o /dev/null -w "%{time_starttransfer}" \
		--connect-timeout "$_probe_timeout" --max-time "$_probe_timeout" \
		"${_mirror}/" 2>/dev/null) && _mirror_ok=true || true

	# Convert to integer ms for comparison
	local _p_int _m_int
	_p_int=$(echo "${_primary_ms:-999} * 1000 / 1" | bc 2>/dev/null) || _p_int=99999
	_m_int=$(echo "${_mirror_ms:-999} * 1000 / 1" | bc 2>/dev/null) || _m_int=99999

	if $_primary_ok && $_mirror_ok; then
		if [[ $_p_int -le $_m_int ]]; then
			log "ClawHub primary faster (${_p_int}ms vs mirror ${_m_int}ms)" >&2
			CLAWHUB_BEST_REGISTRY=""
		else
			log "ClawHub mirror faster (${_m_int}ms vs primary ${_p_int}ms) — using ${_mirror}" >&2
			CLAWHUB_BEST_REGISTRY="$_mirror"
		fi
	elif $_mirror_ok; then
		warn "ClawHub primary unreachable — using mirror ${_mirror}" >&2
		CLAWHUB_BEST_REGISTRY="$_mirror"
	else
		# Primary available or both down — use primary (default)
		CLAWHUB_BEST_REGISTRY=""
	fi

	echo "$CLAWHUB_BEST_REGISTRY"
}

_clawhub_install() {
	local _skill="$1"
	local _timeout="${CLAWHUB_SKILL_TIMEOUT}"
	local _best_registry="${CLAWHUB_BEST_REGISTRY}"

	# --no-input prevents interactive prompts; < /dev/null prevents
	# SIGTTIN when the Node.js CLI tries to read terminal state from
	# a backgrounded subshell (the root cause of the install stall).

	# Try the auto-selected best registry first
	if [[ -n "$_best_registry" ]]; then
		if timeout "$_timeout" clawhub --workdir "${OPENCLAW_DIR}" --registry "$_best_registry" \
			--no-input install "$_skill" --force < /dev/null 2>/dev/null; then
			return 0
		fi
		# Best registry failed — fall back to default primary
		warn "${_skill}: mirror ${_best_registry} failed, falling back to primary..."
		if timeout "$_timeout" clawhub --workdir "${OPENCLAW_DIR}" \
			--no-input install "$_skill" --force < /dev/null 2>/dev/null; then
			return 0
		fi
	else
		# Primary is best (or no mirror preferred)
		if timeout "$_timeout" clawhub --workdir "${OPENCLAW_DIR}" \
			--no-input install "$_skill" --force < /dev/null 2>/dev/null; then
			return 0
		fi
		# Primary failed — try mirror as fallback
		warn "${_skill}: primary ClawHub slow/unavailable, trying mirror (${CLAWHUB_MIRROR})..."
		if timeout "$_timeout" clawhub --workdir "${OPENCLAW_DIR}" --registry "${CLAWHUB_MIRROR}" \
			--no-input install "$_skill" --force < /dev/null 2>/dev/null; then
			return 0
		fi
	fi

	return 1
}

# Install agent-required skills from ClawHub into the AcaClaw profile.
# These skills are defined in skills.json and needed by all agents.
# Runs in the background so config/gateway setup proceeds in parallel.
# On upgrade: skip — user may have installed/removed custom skills.
CORE_SKILLS=("nano-pdf" "xurl" "summarize" "humanizer")

_SKILL_RESULT_FILE="$(mktemp)"
_SKILL_INSTALL_PID=""

if [[ "$IS_UPGRADE" == "true" ]] && [[ -d "${OPENCLAW_DIR}/skills" ]] && [[ -n "$(ls -A "${OPENCLAW_DIR}/skills" 2>/dev/null)" ]]; then
	log "Skills preserved from previous install (upgrade mode)"
	dimlog "Manage skills from the browser UI or: clawhub install <skill-name>"
else
	(
		# Probe once before the loop (avoids re-probing per skill due to subshell)
		CLAWHUB_BEST_REGISTRY="$(_pick_clawhub_registry)"

		_count=0
		_success=0
		for skill_name in "${CORE_SKILLS[@]}"; do
			_count=$((_count + 1))
			echo "  ${SYM_ARROW} Installing skill ${_count}/${#CORE_SKILLS[@]}: ${skill_name}..."
			if _clawhub_install "$skill_name"; then
				_success=$((_success + 1))
			else
				echo "  ${SYM_WARN} ${skill_name}: install failed (tried primary + mirror)"
			fi
		done
		echo "$_success" > "$_SKILL_RESULT_FILE"
	) >> "$INSTALL_LOG" 2>&1 &
	_SKILL_INSTALL_PID=$!

	info "Skills installing in background (${#CORE_SKILLS[@]} skills: nano-pdf, xurl, summarize, humanizer)"
fi

# --- Security defaults ---

header "Security Configuration" "$SYM_SHIELD"

# Apply standard security by default.
# The browser setup wizard allows upgrading to Maximum mode.
SECURITY_MODE="standard"

# Detect Docker availability for the wizard to show Maximum option
DOCKER_AVAILABLE=false
if check_command docker && docker info &>/dev/null 2>&1; then
	DOCKER_AVAILABLE=true
	log "Docker detected — Maximum security mode available in setup wizard"
else
	dimlog "Docker not detected (Standard mode only — this is fine for most users)"
fi

log "Default security mode: ${BOLD}Standard${NC}"

# --- Apply configuration ---

header "Applying Configuration" "$SYM_GEAR"

CONFIG_SOURCE="${SCRIPT_DIR}/../config"
if [[ ! -d "$CONFIG_SOURCE" ]]; then
	CONFIG_SOURCE="./config"
fi

if [[ "$SECURITY_MODE" == "maximum" ]]; then
	CONFIG_TEMPLATE="${CONFIG_SOURCE}/openclaw-maximum.json"
else
	CONFIG_TEMPLATE="${CONFIG_SOURCE}/openclaw-defaults.json"
fi

# Create AcaClaw's isolated config by merging API keys from existing OpenClaw.
# OpenClaw's $include blocks paths outside the profile dir, so we copy keys instead.
# This means:
#   - If user has API keys in ~/.openclaw/openclaw.json → AcaClaw copies them
#   - AcaClaw's overrides (workspace, security, plugins) layer on top
#   - ~/.openclaw/openclaw.json is NEVER modified
#   - Uninstalling AcaClaw removes its config from ~/.openclaw/
mkdir -p "${OPENCLAW_DIR}"

OPENCLAW_BASE_CONFIG="${HOME}/.openclaw/openclaw.json"
ACACLAW_CONFIG="${OPENCLAW_DIR}/openclaw.json"

if [[ -f "$OPENCLAW_BASE_CONFIG" ]]; then
	# Existing config found — preserve user settings, only overlay AcaClaw defaults
	start_spinner "Merging with existing OpenClaw configuration..."

	# Back up the existing config before merging (same-file read/write)
	cp -f "$OPENCLAW_BASE_CONFIG" "${OPENCLAW_BASE_CONFIG}.bak"

	python3 -c "
import json, copy

# Load existing config as the base — preserve ALL user settings
with open('${OPENCLAW_BASE_CONFIG}') as f:
    cfg = json.load(f)

# Load AcaClaw template for defaults only
with open('${CONFIG_TEMPLATE}') as f:
    tpl = json.load(f)

# --- Overlay AcaClaw-required settings (don't clobber user data) ---

# Gateway settings
gw = cfg.setdefault('gateway', {})
gw.setdefault('port', tpl['gateway']['port'])
gw.setdefault('mode', tpl['gateway']['mode'])
gw.setdefault('auth', {})['mode'] = 'none'

# Agent list and workspace defaults (from template, but preserve user model choice)
user_model = cfg.get('agents', {}).get('defaults', {}).get('model')
cfg['agents'] = copy.deepcopy(tpl.get('agents', {}))
if user_model:
    cfg['agents'].setdefault('defaults', {})['model'] = user_model

# Tool restrictions (from template, but preserve user pathPrepend/web config)
user_web = cfg.get('tools', {}).get('web')
user_path = cfg.get('tools', {}).get('exec', {}).get('pathPrepend')
cfg['tools'] = copy.deepcopy(tpl.get('tools', {}))
if user_web:
    cfg['tools']['web'] = user_web

# Model providers: set defaults from template, preserve user overrides
tpl_providers = tpl.get('models', {}).get('providers', {})
if tpl_providers:
    models_sec = cfg.setdefault('models', {})
    providers = models_sec.setdefault('providers', {})
    for pid, prov_cfg in tpl_providers.items():
        prov = providers.setdefault(pid, {})
        prov.setdefault('baseUrl', prov_cfg.get('baseUrl', ''))
        # Ensure 'models' array is always present (validator requires it)
        if 'models' not in prov:
            prov['models'] = prov_cfg.get('models', [])

# Update conda path if available
miniforge = '${MINIFORGE_DIR:-}'
if miniforge:
    cfg.setdefault('tools', {}).setdefault('exec', {})['pathPrepend'] = [miniforge + '/bin']
elif user_path:
    cfg.setdefault('tools', {}).setdefault('exec', {})['pathPrepend'] = user_path

with open('${ACACLAW_CONFIG}', 'w') as f:
    json.dump(cfg, f, indent=2)
    f.write('\n')
"
	if [[ $? -ne 0 ]]; then
		stop_spinner_fail "Failed to create config file"
		exit 1
	fi

	stop_spinner "Configuration merged — user API keys and settings preserved"
else
	# No existing OpenClaw install — standalone config
	start_spinner "Creating fresh AcaClaw configuration..."

	python3 -c "
import json

with open('${CONFIG_TEMPLATE}') as f:
    cfg = json.load(f)

# Auth mode: none (gateway binds loopback only, external access impossible)
cfg['gateway'].setdefault('auth', {})['mode'] = 'none'

miniforge = '${MINIFORGE_DIR:-}'
if miniforge:
    cfg.setdefault('tools', {}).setdefault('exec', {})['pathPrepend'] = [miniforge + '/bin']

with open('${ACACLAW_CONFIG}', 'w') as f:
    json.dump(cfg, f, indent=2)
    f.write('\n')
"
	if [[ $? -ne 0 ]]; then
		stop_spinner_fail "Failed to create config file"
		exit 1
	fi

	stop_spinner "Fresh configuration created"
fi

# Apply required overrides (controlUi basePath, plugins.allow).
# This is a function so it can be called again after `openclaw daemon install`,
# which rewrites the gateway section and would otherwise erase these fields.
_apply_config_overrides() {
	python3 -c "
import json
with open('${ACACLAW_CONFIG}') as f:
    cfg = json.load(f)
gw = cfg.setdefault('gateway', {})
# Auth: none — gateway binds loopback only; no token needed from WKWebView or tests
gw.setdefault('auth', {})['mode'] = 'none'
gw['auth'].pop('token', None)
cui = gw.setdefault('controlUi', {})
cui['enabled'] = True
cui.pop('root', None)
cui['basePath'] = '/openclaw'
cui.setdefault('dangerouslyDisableDeviceAuth', True)
# Trust AcaClaw plugins so the gateway grants full HTTP route registration
plugins = cfg.setdefault('plugins', {})
plugins['allow'] = [
    'acaclaw-academic-env',
    'acaclaw-backup',
    'acaclaw-compat-checker',
    'acaclaw-logger',
    'acaclaw-security',
    'acaclaw-ui',
    'acaclaw-workspace',
    'openclaw-weixin'
]
# WeChat channel: only configure if the plugin was actually installed.
# hasMeaningfulChannelConfig() requires at least one key besides 'enabled'.
import os
if os.path.isfile(os.path.expanduser('~/.openclaw/extensions/openclaw-weixin/index.ts')):
    channels = cfg.setdefault('channels', {})
    weixin = channels.setdefault('openclaw-weixin', {})
    weixin.setdefault('enabled', True)
    weixin.setdefault('accounts', {}).setdefault('default', {}).setdefault('enabled', True)
    bindings = cfg.setdefault('bindings', [])
    has_weixin_binding = any(
        b.get('match', {}).get('channel') == 'openclaw-weixin'
        for b in bindings if isinstance(b, dict)
    )
    if not has_weixin_binding:
        bindings.append({'agentId': 'main', 'match': {'channel': 'openclaw-weixin'}})
# Normalize every provider entry: validator requires models to be an array.
# This is independent of which providers are configured — the app launch
# must never fail because a provider is missing a field.
for prov in cfg.get('models', {}).get('providers', {}).values():
    if isinstance(prov, dict) and not isinstance(prov.get('models'), list):
        prov['models'] = []
with open('${ACACLAW_CONFIG}', 'w') as f:
    json.dump(cfg, f, indent=2)
    f.write('\n')
"
}
_apply_config_overrides

if [[ ! -f "${ACACLAW_CONFIG}" ]]; then
	error "Config file was not created at ${ACACLAW_CONFIG}"
	exit 1
fi

log "Configuration applied"
dimlog "Config: ${ACACLAW_CONFIG}"
dimlog "OpenClaw's own config: untouched"

# --- Create directory structure ---

mkdir -p "${ACACLAW_DIR}/backups/files"
mkdir -p "${ACACLAW_DIR}/audit"
mkdir -p "${ACACLAW_DIR}/config"

# --- Create workspace ---

WORKSPACE_DIR="${HOME}/AcaClaw"

if [[ ! -d "$WORKSPACE_DIR" ]]; then
	log "Creating workspace at ${WORKSPACE_DIR}..."
	mkdir -p "${WORKSPACE_DIR}/data/raw"
	mkdir -p "${WORKSPACE_DIR}/data/processed"
	mkdir -p "${WORKSPACE_DIR}/documents/drafts"
	mkdir -p "${WORKSPACE_DIR}/documents/final"
	mkdir -p "${WORKSPACE_DIR}/figures"
	mkdir -p "${WORKSPACE_DIR}/references"
	mkdir -p "${WORKSPACE_DIR}/notes"
	mkdir -p "${WORKSPACE_DIR}/output"
	mkdir -p "${WORKSPACE_DIR}/.acaclaw"

	# Write workspace metadata
	cat > "${WORKSPACE_DIR}/.acaclaw/workspace.json" <<WSJSON
{
  "name": "AcaClaw",
	"discipline": "general",
  "createdAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "workspaceId": "AcaClaw-$(echo -n "${WORKSPACE_DIR}" | shasum -a 256 2>/dev/null | head -c 12 || sha256sum 2>/dev/null | head -c 12)"
}
WSJSON

	# Write workspace README
	cat > "${WORKSPACE_DIR}/README.md" <<WSREADME
# AcaClaw

AcaClaw research workspace.

## Directory Structure

| Folder | Contents |
|--------|----------|
| \`data/raw/\` | Original data files — AcaClaw never modifies these |
| \`data/processed/\` | Analysis outputs and processed data |
| \`documents/drafts/\` | Manuscript and report drafts |
| \`documents/final/\` | Finalized documents ready for submission |
| \`figures/\` | Generated plots and visualizations |
| \`references/\` | Papers (PDFs), bibliography files (.bib, .ris) |
| \`notes/\` | Research notes, meeting minutes, lab notebooks |
| \`output/\` | AcaClaw-generated outputs (citations, summaries, etc.) |

## Data Safety

Every file is automatically backed up before AcaClaw modifies it.
Backups are stored at \`~/.acaclaw/backups/\` — outside this workspace.

To restore a file: \`openclaw acaclaw-backup restore <file>\`
To list versions:  \`openclaw acaclaw-backup list <file>\`
WSREADME

	log "Workspace created at ~/AcaClaw"
fi

# --- Sync agent identity files ---
# Copy IDENTITY.md + SOUL.md from the repo into the runtime workspace for each agent.
AGENTS_SOURCE="${SCRIPT_DIR}/../agents"
if [[ -d "$AGENTS_SOURCE" ]]; then
	for agent_dir in "${AGENTS_SOURCE}"/*/; do
		agent_name="$(basename "$agent_dir")"
		dest="${WORKSPACE_DIR}/agents/${agent_name}"
		mkdir -p "$dest"
		for f in IDENTITY.md SOUL.md; do
			if [[ -f "${agent_dir}${f}" ]]; then
				cp "${agent_dir}${f}" "${dest}/${f}"
			fi
		done
	done
	log "Agent identity files synced ✓"
else
	log "Warning: agents source directory not found — skipping identity sync"
fi

# Save installed mode (preserve user choice on upgrade)
if [[ "$IS_UPGRADE" == "true" ]] && [[ -f "${ACACLAW_DIR}/config/security-mode.txt" ]]; then
	SECURITY_MODE="$(cat "${ACACLAW_DIR}/config/security-mode.txt" 2>/dev/null || echo "$SECURITY_MODE")"
	dimlog "Preserved security mode: ${SECURITY_MODE}"
else
	echo "$SECURITY_MODE" > "${ACACLAW_DIR}/config/security-mode.txt"
fi

# Create AcaClaw plugin config (separate from OpenClaw's validated config)
_PLUGINS_JSON="${ACACLAW_DIR}/config/plugins.json"
_PLUGINS_TEMPLATE=$(cat <<PLUGINJSON
{
  "acaclaw-workspace": {
    "defaultRoot": "${WORKSPACE_DIR}",
    "scaffold": true,
    "injectTreeContext": true,
    "maxTreeDepth": 2
  },
  "acaclaw-backup": {
    "backupDir": "${ACACLAW_DIR}/backups",
    "retentionDays": 30,
    "maxStorageGB": 10,
    "checksumAlgorithm": "sha256",
    "excludePatterns": ["*.tmp", "node_modules/", ".git/", "__pycache__/"],
    "snapshotBeforeBatch": true
  },
  "acaclaw-security": {
    "mode": "${SECURITY_MODE}",
    "auditLogDir": "${ACACLAW_DIR}/audit",
    "enableNetworkPolicy": true,
    "enableCredentialScrubbing": true,
    "enableInjectionDetection": true,
    "customDenyCommands": [],
    "customAllowedDomains": []
  },
  "acaclaw-academic-env": {
    "discipline": "general",
    "autoActivate": true
  },
  "acaclaw-compat-checker": {
    "minOpenClawVersion": "${OPENCLAW_MIN_VERSION}",
    "checkOnStartup": true
  }
}
PLUGINJSON
)

if [[ "$IS_UPGRADE" == "true" ]] && [[ -f "$_PLUGINS_JSON" ]]; then
	# Merge: keep user-customized values, add new defaults
	python3 -c "
import json
tpl = json.loads('''${_PLUGINS_TEMPLATE}''')
with open('${_PLUGINS_JSON}') as f:
    old = json.load(f)
# For each plugin, keep user overrides on top of new defaults
for plugin, defaults in tpl.items():
    if plugin in old and isinstance(old[plugin], dict):
        merged = {**defaults, **old[plugin]}
        tpl[plugin] = merged
with open('${_PLUGINS_JSON}', 'w') as f:
    json.dump(tpl, f, indent=2)
    f.write('\n')
" 2>/dev/null || echo "$_PLUGINS_TEMPLATE" > "$_PLUGINS_JSON"
	dimlog "Plugin config merged — user customizations preserved"
else
	echo "$_PLUGINS_TEMPLATE" > "$_PLUGINS_JSON"
fi
log "AcaClaw plugin config saved"
dimlog "Plugin config: ${ACACLAW_DIR}/config/plugins.json"

# --- Environment verification ---

if [[ "$SKIP_CONDA" != "true" ]]; then
	echo ""
	echo -e "  ${BOLD}${CYAN}Verifying environment...${NC}"

	if conda --version &>/dev/null; then
		log "conda $(conda --version 2>&1 | awk '{print $2}') found"
	else
		warn "conda not responding"
	fi

	if python3 --version &>/dev/null; then
		log "Python $(python3 --version 2>&1 | awk '{print $2}') found"
	else
		log "Python available in conda base"
	fi

	dimlog "Scientific packages will be installed during setup wizard"
fi

# --- Clear stale caches on upgrade ---
# The browser-app profile caches the control UI (including Service Worker).
# After an upgrade the gateway serves new UI assets, but stale SW/browser caches
# can keep serving the old version — causing features like WeChat QR login to
# appear missing even though the plugin is correctly patched.
if [[ "${IS_UPGRADE:-false}" == "true" ]]; then
	_browser_cache="${ACACLAW_DIR}/browser-app"
	if [[ -d "$_browser_cache" ]]; then
		rm -rf "$_browser_cache"
		log "Cleared stale browser cache"
	fi
fi

# --- Copy management scripts to persistent location ---
# Do this BEFORE the gateway/browser launch section — those steps can fail
# on WSL2 (systemd quirks, missing Windows-side browser, etc.) and with
# set -e the script would exit before reaching a later copy step.
for _script in start.sh stop.sh uninstall.sh; do
	if [[ -f "${SCRIPT_DIR}/${_script}" ]]; then
		cp -f "${SCRIPT_DIR}/${_script}" "${ACACLAW_DIR}/${_script}"
		chmod +x "${ACACLAW_DIR}/${_script}"
	fi
done

# --- Copy conda env YAML files to persistent location ---
CONDA_SRC="${SCRIPT_DIR}/../env/conda"
CONDA_DST="${ACACLAW_DIR}/env/conda"
if [[ -d "$CONDA_SRC" ]]; then
	mkdir -p "$CONDA_DST"
	cp -f "$CONDA_SRC"/environment-*.yml "$CONDA_DST/" 2>/dev/null || true
fi

# --- Save installed version ---
mkdir -p "${ACACLAW_DIR}/config"
echo "${ACACLAW_VERSION}" > "${ACACLAW_DIR}/config/version.txt"

# --- Install desktop shortcut ---
# Do this BEFORE the gateway start — start.sh is already copied above,
# and the shortcut just needs the file path, not a running gateway.
echo ""
echo -e "  ${BOLD}${CYAN}Desktop Integration${NC}"

DESKTOP_SCRIPT="${SCRIPT_DIR}/install-desktop.sh"
if [[ "${DESKTOP_INSTALLED:-false}" == "true" ]]; then
	log "Desktop shortcut already installed"
elif [[ -f "$DESKTOP_SCRIPT" ]]; then
	start_spinner "Installing desktop shortcut..."
	bash "$DESKTOP_SCRIPT" >> "$INSTALL_LOG" 2>&1 && stop_spinner "Desktop shortcut installed" || stop_spinner_warn "Desktop shortcut skipped (non-fatal)"
else
	dimlog "Desktop shortcut: not available for this platform"
fi

# --- Install auto-restart service and start gateway ---

echo ""
printf "  ${BLUE}"
_repeat_char '─' "$(( $(_term_width) - 4 ))"
printf "${NC}\n"
printf "  ${BOLD}${BLUE}${SYM_ROCKET}  Launching AcaClaw${NC}\n"
printf "  ${BLUE}"
_repeat_char '─' "$(( $(_term_width) - 4 ))"
printf "${NC}\n"
echo ""

# Remove legacy --profile service files that used ~/.openclaw-acaclaw/ isolation.
# AcaClaw now uses ~/.openclaw/ directly; stale profile services cause the gateway
# to read the wrong config and serve 503s.
_cleanup_legacy_services() {
	local systemd_dir="${HOME}/.config/systemd/user"
	local legacy_unit="openclaw-gateway-acaclaw.service"
	if [[ -f "${systemd_dir}/${legacy_unit}" ]]; then
		systemctl --user stop "${legacy_unit}" 2>/dev/null || true
		systemctl --user disable "${legacy_unit}" 2>/dev/null || true
		rm -f "${systemd_dir}/${legacy_unit}"
		log "Removed legacy service: ${legacy_unit}"
	fi
	# Also nuke any acaclaw-gateway.service that has --profile (from older installs)
	local current_unit="${systemd_dir}/acaclaw-gateway.service"
	if [[ -f "$current_unit" ]] && grep -q -- "--profile" "$current_unit" 2>/dev/null; then
		systemctl --user stop acaclaw-gateway.service 2>/dev/null || true
		rm -f "$current_unit"
		log "Removed stale service with --profile flag"
	fi
}
_cleanup_legacy_services

start_spinner "Starting OpenClaw gateway..."
GATEWAY_STARTED=false
if check_command openclaw; then
	if [[ ! -f "${ACACLAW_CONFIG}" ]]; then
		stop_spinner_fail "Config file missing"
		error "Cannot start gateway — config file missing at ${ACACLAW_CONFIG}"
		error "Run the installer again or create the config manually."
		exit 1
	fi

	# Stop the systemd service first (if running from a previous install)
	if systemctl --user is-active acaclaw-gateway.service &>/dev/null; then
		systemctl --user stop acaclaw-gateway.service 2>/dev/null || true
		sleep 1
	fi

	# Kill any stale process on the port
	_existing_pid=""
	if command -v lsof &>/dev/null; then
		_existing_pid="$(lsof -ti :2090 2>/dev/null | head -1)" || true
	elif command -v ss &>/dev/null; then
		_existing_pid="$(ss -tlnp sport = :2090 2>/dev/null | grep -oP 'pid=\K[0-9]+' | head -1)" || true
	fi
	if [[ -n "$_existing_pid" ]] && kill -0 "$_existing_pid" 2>/dev/null; then
		kill "$_existing_pid" 2>/dev/null || true
		sleep 1
		kill -0 "$_existing_pid" 2>/dev/null && kill -9 "$_existing_pid" 2>/dev/null || true
		sleep 0.5
	fi

	# Install auto-restart service and start gateway through OpenClaw's native daemon
	SERVICE_SCRIPT="${SCRIPT_DIR}/acaclaw-service.sh"
	if [[ -f "$SERVICE_SCRIPT" ]]; then
		if bash "$SERVICE_SCRIPT" install >> "$INSTALL_LOG" 2>&1; then
			# openclaw daemon install rewrites the gateway config section;
			# re-apply AcaClaw overrides so controlUi/plugins.allow are not lost.
			_apply_config_overrides || warn "Config override re-apply failed (non-fatal)"
			openclaw daemon start >> "$INSTALL_LOG" 2>&1 || true
			GATEWAY_STARTED=true
		else
			warn "Service install failed — starting gateway directly"
		fi
	fi

	# Fallback: start gateway directly if systemd failed
	if [[ "$GATEWAY_STARTED" == "false" ]]; then
		# Also re-apply in the fallback path (daemon install may have partially run).
		_apply_config_overrides || warn "Config override re-apply failed (non-fatal)"
		openclaw gateway run --bind loopback --port 2090 >> "$INSTALL_LOG" 2>&1 &
		GATEWAY_STARTED=true
	fi

	# Wait for gateway to be ready before opening the browser
	if [[ "$GATEWAY_STARTED" == "true" ]]; then
		stop_spinner "Gateway started"
		start_spinner "Waiting for gateway to respond..."
		_ready=false
		for _i in $(seq 1 30); do
			if curl -s -o /dev/null -w '' http://localhost:2090/ 2>/dev/null; then
				_ready=true
				break
			fi
			sleep 1
		done
		if [[ "$_ready" == "true" ]]; then
			stop_spinner "Gateway is ready"
		else
			stop_spinner_warn "Gateway may still be starting — try refreshing the browser"
		fi
	fi

	# Save setup state for the wizard to read.
	# On upgrade: mark setup as complete so the wizard is skipped.
	if [[ "$IS_UPGRADE" == "true" ]]; then
		cat > "${ACACLAW_DIR}/config/setup-pending.json" <<SETUPJSON
{
  "version": "${ACACLAW_VERSION}",
  "condaPrefix": "${MINIFORGE_DIR:-}",
  "dockerAvailable": ${DOCKER_AVAILABLE},
  "securityMode": "${SECURITY_MODE}",
  "workspaceDir": "${WORKSPACE_DIR}",
  "envFilesDir": "${SCRIPT_DIR}/../env/conda",
  "setupComplete": true
}
SETUPJSON
	else
		cat > "${ACACLAW_DIR}/config/setup-pending.json" <<SETUPJSON
{
  "version": "${ACACLAW_VERSION}",
  "condaPrefix": "${MINIFORGE_DIR:-}",
  "dockerAvailable": ${DOCKER_AVAILABLE},
  "securityMode": "${SECURITY_MODE}",
  "workspaceDir": "${WORKSPACE_DIR}",
  "envFilesDir": "${SCRIPT_DIR}/../env/conda",
  "setupComplete": false
}
SETUPJSON
	fi

	SETUP_URL="http://localhost:2090/"

	# On macOS: compile AcaClaw.app now so it can be used as the launch target.
	# (Desktop Integration step runs after this section, but we need the binary now.)
	if [[ "$OS" == "macos" ]] && [[ -f "${SCRIPT_DIR}/install-desktop.sh" ]]; then
		bash "${SCRIPT_DIR}/install-desktop.sh" 2>/dev/null || true
		DESKTOP_INSTALLED="true"
	fi

	# Try to open as a standalone app window (dock app) first.
	# This gives a native-app feel (no address bar, no tabs).
	# Falls back to a regular browser tab if no Chromium-based browser is found.
	_open_app_window() {
		local _app_profile="${ACACLAW_DIR}/browser-app"

		# Pre-create the profile directory with a "First Run" sentinel file.
		# Without this, Chrome/Edge show their First Run Experience (welcome page),
		# which overrides --app mode and opens a normal browser window instead.
		mkdir -p "$_app_profile"
		touch "$_app_profile/First Run"

		# Use --user-data-dir to force a NEW browser instance so --app=URL
		# is honoured. Without it, the IPC handoff to the existing browser
		# silently drops the --app flag and opens a regular tab.
		local -a _app_flags=(
			--user-data-dir="$_app_profile"
			--app="$SETUP_URL"
			--no-first-run
			--no-default-browser-check
			--disable-fre
			--disable-background-networking
			--disable-component-update
			--disable-sync
			--disable-translate
			--disable-default-apps
			--disable-extensions
			--disable-features=TranslateUI,OptimizationHints,MediaRouter,EdgeCollections,EdgeDiscoverWidget,msEdgeShopping,EdgeWallet,msEdgeOnRamp
			--suppress-message-center-popups
			--password-store=basic
		)

		case "$PLATFORM" in
			macos)
				# Prefer the native WKWebView wrapper (compiled at install time, no signing needed)
				if [[ -d "${HOME}/Applications/AcaClaw.app" ]]; then
					open -a "${HOME}/Applications/AcaClaw.app" 2>/dev/null && return 0
				fi
				if [[ -d "/Applications/Microsoft Edge.app" ]]; then
					open -na "Microsoft Edge" --args "${_app_flags[@]}" 2>/dev/null && return 0
				elif [[ -d "/Applications/Google Chrome.app" ]]; then
					open -na "Google Chrome" --args "${_app_flags[@]}" 2>/dev/null && return 0
				fi
				;;
			wsl2)
				# WSL2: open Windows-side browser for the app window experience
				# Edge is pre-installed on Windows 10/11
				# NOTE: Use -f not -x — WSL2 may not set execute bits on /mnt/c/ files
				local _edge_paths=(
					"/mnt/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
					"/mnt/c/Program Files/Microsoft/Edge/Application/msedge.exe"
				)
				local _chrome_paths=(
					"/mnt/c/Program Files/Google/Chrome/Application/chrome.exe"
					"/mnt/c/Program Files (x86)/Google/Chrome/Application/chrome.exe"
				)

				# Convert user-data-dir to Windows-native path for the Windows browser.
				# Use %LOCALAPPDATA%\AcaClaw\browser-app so Edge can properly cache
				# PWA manifest icons (\\wsl$\ paths cause icon instability).
				local _win_profile
				_win_profile="$(powershell.exe -NoProfile -Command "
					\$d = Join-Path \$env:LOCALAPPDATA 'AcaClaw\browser-app'
					if (-not (Test-Path \$d)) { New-Item -ItemType Directory -Path \$d -Force | Out-Null }
					\$frun = Join-Path \$d 'First Run'
					if (-not (Test-Path \$frun)) { New-Item -ItemType File -Path \$frun -Force | Out-Null }
					Write-Output \$d
				" 2>/dev/null | tr -d '\r')" || true
				# Fallback to WSL-side UNC path if PowerShell failed
				if [[ -z "$_win_profile" ]]; then
					if command -v wslpath &>/dev/null; then
						_win_profile="$(wslpath -w "$_app_profile")"
					else
						_win_profile="\\\\wsl\$\\${WSL_DISTRO_NAME:-Ubuntu}${_app_profile}"
					fi
				fi
				local -a _win_flags=()
				for _flag in "${_app_flags[@]}"; do
					if [[ "$_flag" == --user-data-dir=* ]]; then
						_win_flags+=("--user-data-dir=${_win_profile}")
					else
						_win_flags+=("$_flag")
					fi
				done

				local _found_browser=""
				for _edge in "${_edge_paths[@]}"; do
					if [[ -f "$_edge" ]]; then
						"$_edge" "${_win_flags[@]}" &>/dev/null &
						_found_browser="edge"
						break
					fi
				done
				if [[ -z "$_found_browser" ]]; then
					for _chrome in "${_chrome_paths[@]}"; do
						if [[ -f "$_chrome" ]]; then
							"$_chrome" "${_win_flags[@]}" &>/dev/null &
							_found_browser="chrome"
							break
						fi
					done
				fi
				[[ -n "$_found_browser" ]] && return 0
				;;
			linux)
				if [[ -z "${DISPLAY:-}" ]] && [[ -z "${WAYLAND_DISPLAY:-}" ]]; then
					return 1
				fi
				if [[ -x "/opt/microsoft/msedge/microsoft-edge" ]]; then
					/opt/microsoft/msedge/microsoft-edge "${_app_flags[@]}" &>/dev/null &
					return 0
				elif [[ -x "/opt/google/chrome/google-chrome" ]]; then
					/opt/google/chrome/google-chrome "${_app_flags[@]}" &>/dev/null &
					return 0
				elif command -v chromium-browser &>/dev/null; then
					chromium-browser "${_app_flags[@]}" &>/dev/null &
					return 0
				fi
				;;
		esac
		return 1
	}

	if _open_app_window; then
		log "AcaClaw app opened — complete setup there"
	else
		# Fallback: open a regular browser tab
		case "$PLATFORM" in
			macos)   open "$SETUP_URL" 2>/dev/null || true ;;
			wsl2)    cmd.exe /c start "" "$SETUP_URL" 2>/dev/null || true ;;
			linux)   xdg-open "$SETUP_URL" 2>/dev/null || true ;;
			windows) start "$SETUP_URL" 2>/dev/null || true ;;
		esac
		log "Setup wizard opened in browser"
	fi

	log "Setup wizard: ${BOLD}${SETUP_URL}${NC}"
	log "If nothing opened, visit the URL above manually."
else
	stop_spinner_warn "OpenClaw command not found"
	warn "Start the gateway manually:"
	warn "  openclaw gateway run --bind loopback --port 2090"
	warn "Then visit http://localhost:2090/"
fi

# --- Collect background skill install results ---
if [[ -n "${_SKILL_INSTALL_PID:-}" ]]; then
	wait "$_SKILL_INSTALL_PID" 2>/dev/null || true
	SKILL_COUNT=0
	if [[ -f "$_SKILL_RESULT_FILE" ]]; then
		SKILL_COUNT="$(cat "$_SKILL_RESULT_FILE" 2>/dev/null || echo 0)"
		rm -f "$_SKILL_RESULT_FILE"
	fi
	log "${SKILL_COUNT}/${#CORE_SKILLS[@]} skills installed"
	dimlog "Bundled with OpenClaw: coding-agent, clawhub, and more"
	dimlog "Install more skills anytime: clawhub install <skill-name>"
fi

# ─── Final Summary Dashboard ───────────────────────────────────────────
_w=$(_term_width)
_box_w=$(( _w - 4 ))
[[ $_box_w -gt 64 ]] && _box_w=64

echo ""
echo ""
printf "  ${GREEN}"
_repeat_char '━' "$_box_w"
printf "${NC}\n"
echo ""
if [[ "$IS_UPGRADE" == "true" ]]; then
	echo -e "  ${SYM_SPARKLE}  ${BOLD}${GREEN}AcaClaw upgraded to v${ACACLAW_VERSION} (from v${INSTALLED_VERSION})!${NC}  ${SYM_SPARKLE}"
else
	echo -e "  ${SYM_SPARKLE}  ${BOLD}${GREEN}AcaClaw v${ACACLAW_VERSION} installed successfully!${NC}  ${SYM_SPARKLE}"
fi
echo ""
printf "  ${GREEN}"
_repeat_char '━' "$_box_w"
printf "${NC}\n"
echo ""

# What's next box
printf "  ${CYAN}┌"
_repeat_char '─' $((_box_w - 2))
printf "┐${NC}\n"

if [[ "$IS_UPGRADE" == "true" ]]; then
	printf "  ${CYAN}│${NC}  ${BOLD}Upgrade Complete${NC}%*s${CYAN}│${NC}\n" $((_box_w - 20)) ''
	printf "  ${CYAN}│${NC}%*s${CYAN}│${NC}\n" $((_box_w - 2)) ''
	printf "  ${CYAN}│${NC}  Your data is preserved:                         ${CYAN}│${NC}\n"
	printf "  ${CYAN}│${NC}    ${SYM_CHECK} Skills, config, API keys%*s${CYAN}│${NC}\n" $((_box_w - 31)) ''
	printf "  ${CYAN}│${NC}    ${SYM_CHECK} Workspace files (~/AcaClaw/)%*s${CYAN}│${NC}\n" $((_box_w - 35)) ''
	printf "  ${CYAN}│${NC}    ${SYM_CHECK} Audit logs and backups%*s${CYAN}│${NC}\n" $((_box_w - 29)) ''
	printf "  ${CYAN}│${NC}    ${SYM_CHECK} Conda environments%*s${CYAN}│${NC}\n" $((_box_w - 26)) ''
	printf "  ${CYAN}│${NC}%*s${CYAN}│${NC}\n" $((_box_w - 2)) ''
	printf "  ${CYAN}│${NC}  Open the dashboard:                             ${CYAN}│${NC}\n"
	printf "  ${CYAN}│${NC}  ${BOLD}${BLUE}http://localhost:2090/${NC}%*s${CYAN}│${NC}\n" $((_box_w - 25)) ''
else
	printf "  ${CYAN}│${NC}  ${BOLD}What's Next?${NC}%*s${CYAN}│${NC}\n" $((_box_w - 16)) ''
	printf "  ${CYAN}│${NC}%*s${CYAN}│${NC}\n" $((_box_w - 2)) ''
	printf "  ${CYAN}│${NC}  Complete setup in your browser:                 ${CYAN}│${NC}\n"
	printf "  ${CYAN}│${NC}  ${BOLD}${BLUE}http://localhost:2090/${NC}%*s${CYAN}│${NC}\n" $((_box_w - 25)) ''
	printf "  ${CYAN}│${NC}%*s${CYAN}│${NC}\n" $((_box_w - 2)) ''
	printf "  ${CYAN}│${NC}  The wizard will guide you through:              ${CYAN}│${NC}\n"
	printf "  ${CYAN}│${NC}    ${SYM_DOT} Choose your research discipline%*s${CYAN}│${NC}\n" $((_box_w - 36)) ''
	printf "  ${CYAN}│${NC}    ${SYM_DOT} Connect your AI provider (API key)%*s${CYAN}│${NC}\n" $((_box_w - 40)) ''
	printf "  ${CYAN}│${NC}    ${SYM_DOT} Configure workspace location%*s${CYAN}│${NC}\n" $((_box_w - 33)) ''
	printf "  ${CYAN}│${NC}    ${SYM_DOT} Choose security level%*s${CYAN}│${NC}\n" $((_box_w - 26)) ''
fi
printf "  ${CYAN}│${NC}%*s${CYAN}│${NC}\n" $((_box_w - 2)) ''
printf "  ${CYAN}└"
_repeat_char '─' $((_box_w - 2))
printf "┘${NC}\n"
echo ""

# Quick reference
echo -e "  ${BOLD}Quick Reference:${NC}"
echo -e "    ${SYM_ARROW} Launch: ${BOLD}bash ~/.acaclaw/start.sh${NC}"
echo -e "    ${SYM_ARROW} Stop:   ${BOLD}bash ~/.acaclaw/stop.sh${NC}"
echo -e "    ${SYM_ARROW} Web UI: ${BOLD}http://localhost:2090/${NC}"
echo -e "    ${SYM_ARROW} Log:    ${DIM}${INSTALL_LOG}${NC}"
echo ""
echo -e "  ${DIM}${SYM_MICROSCOPE} Happy researching!${NC}"
echo ""

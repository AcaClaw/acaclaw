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

ACACLAW_VERSION="0.1.0"
ACACLAW_DIR="${ACACLAW_DIR:-$HOME/.acaclaw}"
OPENCLAW_MIN_VERSION="2026.3.24"
NODE_MIN_VERSION="22"
ACACLAW_GITHUB_REPO="acaclaw/acaclaw"

# AcaClaw runs using the default OpenClaw directory
OPENCLAW_DIR="${HOME}/.openclaw"

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
header() { echo -e "\n${BOLD}${BLUE}$*${NC}\n"; }

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
		# Valid option or no args — continue to clone/resolve
		;;
	*)
		echo "Error: Unknown option: $1" >&2
		echo "Run 'bash install.sh --help' for usage." >&2
		exit 1
		;;
esac

# --- Resolve REPO_ROOT ---
# When run locally from a git clone: SCRIPT_DIR/../ is the repo root.
# When piped via curl: clone the repo first, then use the clone as root.

_resolve_repo_root() {
	# If REPO_ROOT is already set and valid, use it (local dev / CI)
	if [[ -n "${REPO_ROOT:-}" && -f "${REPO_ROOT}/scripts/install.sh" ]]; then
		return
	fi

	# Clone the latest release from GitHub
	if ! command -v git &>/dev/null; then
		error "git is required for remote install. Install git and try again."
		error "Or clone manually: git clone https://github.com/${ACACLAW_GITHUB_REPO}.git && bash acaclaw/scripts/install.sh"
		exit 1
	fi
	log "Downloading AcaClaw from GitHub..."
	ACACLAW_CLONE_DIR="$(mktemp -d)"
	# Try HTTPS first (works for most users), then SSH fallback (for corporate proxies / SSH-configured users)
	if GIT_TERMINAL_PROMPT=0 git clone --depth 1 "https://github.com/${ACACLAW_GITHUB_REPO}.git" "$ACACLAW_CLONE_DIR" 2>/dev/null; then
		REPO_ROOT="$ACACLAW_CLONE_DIR"
		return
	fi
	rm -rf "$ACACLAW_CLONE_DIR"
	ACACLAW_CLONE_DIR="$(mktemp -d)"
	if git clone --depth 1 "git@github.com:${ACACLAW_GITHUB_REPO}.git" "$ACACLAW_CLONE_DIR" 2>/dev/null; then
		REPO_ROOT="$ACACLAW_CLONE_DIR"
		return
	fi

	error "Could not find AcaClaw source files."
	error "Install via: npm install -g github:acaclaw/acaclaw && acaclaw-install"
	error "Or clone manually: git clone https://github.com/${ACACLAW_GITHUB_REPO}.git && bash acaclaw/scripts/install.sh"
	exit 1
}

_resolve_repo_root
SCRIPT_DIR="${REPO_ROOT}/scripts"

# Clean up clone dir on exit if we downloaded from GitHub
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

# --- Prerequisite checks ---

check_command() {
	command -v "$1" &>/dev/null
}

version_ge() {
	# Returns 0 if $1 >= $2 (semver-ish comparison)
	printf '%s\n%s' "$2" "$1" | sort -V | head -n1 | grep -qFx "$2"
}

header "AcaClaw Installer v${ACACLAW_VERSION}"
log "System: ${OS} ${ARCH}"

# Check Node.js
if check_command node; then
	NODE_VERSION="$(node --version | sed 's/^v//')"
	NODE_MAJOR="${NODE_VERSION%%.*}"
	if [[ "$NODE_MAJOR" -ge "$NODE_MIN_VERSION" ]]; then
		log "Node.js ${NODE_VERSION} ✓"
	else
		error "Node.js ${NODE_MIN_VERSION}+ required (found ${NODE_VERSION})"
		error "Install from https://nodejs.org/"
		exit 1
	fi
else
	error "Node.js is not installed. Install Node.js ${NODE_MIN_VERSION}+ from https://nodejs.org/"
	exit 1
fi

# Check npm
if ! check_command npm; then
	error "npm is not installed. It should come with Node.js."
	exit 1
fi
log "npm $(npm --version) ✓"

# --- Install OpenClaw ---

header "Step 1: OpenClaw"

if check_command openclaw; then
	OC_VERSION="$(openclaw --version 2>/dev/null | head -1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' || echo "unknown")"
	if version_ge "$OC_VERSION" "$OPENCLAW_MIN_VERSION"; then
		log "OpenClaw ${OC_VERSION} ✓"
	else
		log "Upgrading OpenClaw to ${OPENCLAW_MIN_VERSION}..."
		npm install -g "openclaw@${OPENCLAW_MIN_VERSION}"
		log "OpenClaw ${OPENCLAW_MIN_VERSION} installed ✓"
	fi
else
	log "Installing OpenClaw ${OPENCLAW_MIN_VERSION}..."
	npm install -g "openclaw@${OPENCLAW_MIN_VERSION}"
	log "OpenClaw ${OPENCLAW_MIN_VERSION} installed ✓"
fi

# --- Install Miniforge + Scientific Python ---

header "Step 2: Conda (Package Manager)"

if [[ "$SKIP_CONDA" == "true" ]]; then
	warn "Skipping Conda installation (--no-conda)"
else
	MINIFORGE_DIR="${ACACLAW_DIR}/miniforge3"

	# AcaClaw always uses its own Miniforge installation for reproducibility.
	# System conda/miniconda may be too old or have incompatible package caches.
	if [[ -d "$MINIFORGE_DIR" ]]; then
		log "Miniforge already installed at ${MINIFORGE_DIR} ✓"
	fi

	if [[ ! -d "$MINIFORGE_DIR" ]]; then
		log "Installing Miniforge..."

		case "${OS}-${ARCH}" in
			linux-x86_64)   MINIFORGE_FILE="Miniforge3-Linux-x86_64.sh" ;;
			linux-aarch64)  MINIFORGE_FILE="Miniforge3-Linux-aarch64.sh" ;;
			macos-x86_64)   MINIFORGE_FILE="Miniforge3-MacOSX-x86_64.sh" ;;
			macos-aarch64)  MINIFORGE_FILE="Miniforge3-MacOSX-arm64.sh" ;;
			*) error "No Miniforge build for ${OS}-${ARCH}"; exit 1 ;;
		esac

		# Download sources — try GitHub first, fall back to mirrors
		MINIFORGE_URLS=(
			"https://github.com/conda-forge/miniforge/releases/latest/download"
			"https://mirrors.tuna.tsinghua.edu.cn/github-release/conda-forge/miniforge/LatestRelease"
			"https://mirrors.bfsu.edu.cn/github-release/conda-forge/miniforge/LatestRelease"
		)

		# Miniforge installer checks that $0 ends with .sh
		INSTALLER_PATH="$(mktemp)"
		mv "$INSTALLER_PATH" "${INSTALLER_PATH}.sh"
		INSTALLER_PATH="${INSTALLER_PATH}.sh"
		DOWNLOAD_OK=false
		for url in "${MINIFORGE_URLS[@]}"; do
			log "Trying ${url}..."
			if curl -fSL --connect-timeout 15 --max-time 300 \
				"${url}/${MINIFORGE_FILE}" -o "$INSTALLER_PATH" 2>/dev/null; then
				DOWNLOAD_OK=true
				log "Downloaded from ${url} ✓"
				break
			else
				warn "Failed to download from ${url}, trying next mirror..."
			fi
		done

		if [[ "$DOWNLOAD_OK" != "true" ]]; then
			rm -f "$INSTALLER_PATH"
			error "Could not download Miniforge from any source."
			error "Check your internet connection and try again."
			exit 1
		fi

		bash "$INSTALLER_PATH" -b -p "$MINIFORGE_DIR"
		rm -f "$INSTALLER_PATH"
		log "Miniforge installed ✓"
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
		"https://mirrors.tuna.tsinghua.edu.cn/anaconda/cloud"
		"https://mirrors.bfsu.edu.cn/anaconda/cloud"
	)
	MIRROR_SET="false"
	for mirror_url in "${MIRROR_URLS[@]}"; do
		# Test using conda's own Python + ssl module to match what conda will use
		TEST_URL="${mirror_url}/conda-forge/noarch/repodata.json.zst"
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
channel_alias: ${mirror_url}
custom_channels:
  conda-forge: ${mirror_url}
CONDARC_EOF
			log "Conda mirror configured (${mirror_url}) ✓"
			MIRROR_SET="true"
			break
		else
			warn "Mirror SSL test failed: ${mirror_url}, trying next..."
		fi
	done
	if [[ "$MIRROR_SET" == "false" ]]; then
		# Write official conda-forge config (no mirror)
		cat > "${MINIFORGE_DIR}/.condarc" <<'CONDARC_EOF'
channels:
  - conda-forge
show_channel_urls: true
CONDARC_EOF
		log "Using official conda-forge channel (no working mirror found) ✓"
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
		log "Conda env '${ACACLAW_ENV_NAME}' already exists ✓"
	elif [[ -f "$ACACLAW_ENV_YML" ]]; then
		log "Creating base AcaClaw conda environment..."
		log "This installs Python, NumPy, SciPy, Pandas, JupyterLab, and more."
		log "This may take a few minutes on first install."
		if conda env create -f "$ACACLAW_ENV_YML"; then
			log "Conda env '${ACACLAW_ENV_NAME}' created ✓"
		else
			# If we were using a mirror, retry with official conda-forge
			if [[ "$MIRROR_SET" == "true" ]]; then
				warn "Conda env creation failed with mirror. Retrying with official conda-forge..."
				cat > "${MINIFORGE_DIR}/.condarc" <<'CONDARC_EOF'
channels:
  - conda-forge
show_channel_urls: true
CONDARC_EOF
				if conda env create -f "$ACACLAW_ENV_YML"; then
					log "Conda env '${ACACLAW_ENV_NAME}' created (official channel) ✓"
				else
					warn "Failed to create conda env '${ACACLAW_ENV_NAME}'. You can create it later from the Environment tab."
				fi
			else
				warn "Failed to create conda env '${ACACLAW_ENV_NAME}'. You can create it later from the Environment tab."
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

header "Step 3: AcaClaw Plugins"

mkdir -p "${ACACLAW_DIR}"

# Install plugins to AcaClaw's own profile directory — NOT ~/.openclaw/extensions/
# OpenClaw auto-discovers plugins from <configDir>/extensions/
ACACLAW_PLUGINS_DIR="${OPENCLAW_DIR}/extensions"
mkdir -p "$ACACLAW_PLUGINS_DIR"

REPO_PLUGINS_DIR="${SCRIPT_DIR}/../plugins"

log "Installing @acaclaw/workspace..."
if [[ -d "${REPO_PLUGINS_DIR}/workspace" ]]; then
	cp -r "${REPO_PLUGINS_DIR}/workspace" "${ACACLAW_PLUGINS_DIR}/acaclaw-workspace"
	log "@acaclaw/workspace installed ✓"
else
	warn "@acaclaw/workspace: npm package not yet published (install from source)"
fi

log "Installing @acaclaw/backup..."
if [[ -d "${REPO_PLUGINS_DIR}/backup" ]]; then
	cp -r "${REPO_PLUGINS_DIR}/backup" "${ACACLAW_PLUGINS_DIR}/acaclaw-backup"
	log "@acaclaw/backup installed ✓"
else
	warn "@acaclaw/backup: npm package not yet published (install from source)"
fi

log "Installing @acaclaw/security..."
if [[ -d "${REPO_PLUGINS_DIR}/security" ]]; then
	cp -r "${REPO_PLUGINS_DIR}/security" "${ACACLAW_PLUGINS_DIR}/acaclaw-security"
	log "@acaclaw/security installed ✓"
else
	warn "@acaclaw/security: npm package not yet published (install from source)"
fi

log "Installing @acaclaw/academic-env..."
if [[ -d "${REPO_PLUGINS_DIR}/academic-env" ]]; then
	cp -r "${REPO_PLUGINS_DIR}/academic-env" "${ACACLAW_PLUGINS_DIR}/acaclaw-academic-env"
	log "@acaclaw/academic-env installed ✓"
else
	warn "@acaclaw/academic-env: npm package not yet published (install from source)"
fi

log "Installing @acaclaw/compat-checker..."
if [[ -d "${REPO_PLUGINS_DIR}/compat-checker" ]]; then
	cp -r "${REPO_PLUGINS_DIR}/compat-checker" "${ACACLAW_PLUGINS_DIR}/acaclaw-compat-checker"
	log "@acaclaw/compat-checker installed ✓"
else
	warn "@acaclaw/compat-checker: npm package not yet published (install from source)"
fi

log "Installing @acaclaw/ui (plugin)..."
if [[ -d "${REPO_PLUGINS_DIR}/ui" ]]; then
	cp -r "${REPO_PLUGINS_DIR}/ui" "${ACACLAW_PLUGINS_DIR}/acaclaw-ui"
	log "@acaclaw/ui (plugin) installed ✓"
else
	warn "@acaclaw/ui plugin: not found at ${REPO_PLUGINS_DIR}/ui"
fi

log "Installing @acaclaw/ui..."
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

if _ui_needs_rebuild && [[ -d "${ACAC_UI_SRC}/src" ]] && check_command npm; then
	log "Building AcaClaw UI (source is newer than dist)..."
	(cd "${ACAC_UI_SRC}" && npm install --no-audit --no-fund 2>/dev/null && npm run build 2>/dev/null)
	if [[ -d "${ACAC_UI_SRC}/dist" ]]; then
		mkdir -p "${ACAC_UI_DEST}"
		cp -r "${ACAC_UI_SRC}/dist/"* "${ACAC_UI_DEST}/"
		log "@acaclaw/ui built and installed ✓"
	else
		warn "@acaclaw/ui: build failed"
	fi
elif [[ -d "${ACAC_UI_SRC}/dist" ]]; then
	mkdir -p "${ACAC_UI_DEST}"
	cp -r "${ACAC_UI_SRC}/dist/"* "${ACAC_UI_DEST}/"
	log "@acaclaw/ui installed ✓"
else
	warn "@acaclaw/ui: dist not found and no source to build"
fi

# --- Install essential skills from ClawHub ---

header "Step 4: Essential Skills"

# Install clawhub CLI if not present
if ! check_command clawhub; then
	log "Installing ClawHub CLI..."
	npm install -g clawhub
	log "ClawHub CLI installed ✓"
else
	log "ClawHub CLI ✓"
fi

# Install uv (Python package manager) for skill binary dependencies.
# Skills like nano-pdf use uv to install their CLI binaries.
if ! command -v uv &>/dev/null && [[ -n "${MINIFORGE_DIR:-}" ]] && [[ -x "${MINIFORGE_DIR}/bin/pip" ]]; then
	log "Installing uv (Python package manager)..."
	"${MINIFORGE_DIR}/bin/pip" install uv -q 2>/dev/null && log "uv installed ✓" || warn "Failed to install uv"
elif command -v uv &>/dev/null; then
	log "uv ✓"
fi

# Install agent-required skills from ClawHub into the AcaClaw profile.
# These skills are defined in skills.json and needed by all agents.
CORE_SKILLS=("nano-pdf" "xurl" "summarize" "humanizer")
SKILL_COUNT=0

for skill_name in "${CORE_SKILLS[@]}"; do
	log "Installing skill: ${skill_name}..."
	if clawhub install "$skill_name" --workdir "${OPENCLAW_DIR}" --force 2>/dev/null; then
		SKILL_COUNT=$((SKILL_COUNT + 1))
	else
		warn "Failed to install ${skill_name}"
	fi
done

log "${SKILL_COUNT}/${#CORE_SKILLS[@]} skills installed ✓"
log "Bundled with OpenClaw: coding-agent, clawhub, and more"
log "Install more skills anytime: clawhub install <skill-name> --workdir ${OPENCLAW_DIR}"

# --- Security defaults ---

header "Step 5: Security Configuration"

# Apply standard security by default.
# The browser setup wizard allows upgrading to Maximum mode.
SECURITY_MODE="standard"

# Detect Docker availability for the wizard to show Maximum option
DOCKER_AVAILABLE=false
if check_command docker && docker info &>/dev/null 2>&1; then
	DOCKER_AVAILABLE=true
	log "Docker detected ✓ (Maximum mode available in setup wizard)"
else
	log "Docker not detected (Standard mode only)"
fi

log "Default security mode: ${SECURITY_MODE}"

# --- Apply configuration ---

header "Step 6: Applying Configuration"

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
	# Existing OpenClaw install found — copy auth + model config into AcaClaw profile
	log "Found existing OpenClaw config — copying auth and model settings"

	python3 -c "
import json, sys, secrets

# Load AcaClaw defaults template
with open('${CONFIG_TEMPLATE}') as f:
    cfg = json.load(f)

# Load existing OpenClaw config and copy auth + models sections
try:
    with open('${OPENCLAW_BASE_CONFIG}') as f:
        oc = json.load(f)
    # Copy auth profiles (API credentials)
    if 'auth' in oc:
        cfg['auth'] = oc['auth']
    # Copy model provider config
    if 'models' in oc:
        cfg['models'] = oc['models']
    # Copy browser/search API keys (tools.web.search)
    if 'tools' in oc and 'web' in oc.get('tools', {}):
        web_cfg = oc['tools']['web']
        cfg.setdefault('tools', {})['web'] = web_cfg
    # Copy existing gateway auth token if present
    oc_token = oc.get('gateway', {}).get('auth', {}).get('token', '')
    if oc_token:
        cfg['gateway'].setdefault('auth', {})['token'] = oc_token
except Exception:
    pass

# Auth mode: none (gateway binds loopback only, external access impossible)
cfg['gateway'].setdefault('auth', {})['mode'] = 'none'

# Update conda path if available
miniforge = '${MINIFORGE_DIR:-}'
if miniforge:
    cfg.setdefault('tools', {}).setdefault('exec', {})['pathPrepend'] = [miniforge + '/bin']

with open('${ACACLAW_CONFIG}', 'w') as f:
    json.dump(cfg, f, indent=2)
    f.write('\n')
" 2>/dev/null

	log "AcaClaw config created with auth from existing OpenClaw ✓"

	# Copy auth-profiles.json (contains actual API key values)
	OPENCLAW_AUTH_PROFILES="${HOME}/.openclaw/agents/main/agent/auth-profiles.json"
	ACACALAW_AUTH_DIR="${OPENCLAW_DIR}/agents/main/agent"
	if [[ -f "$OPENCLAW_AUTH_PROFILES" ]]; then
		mkdir -p "$ACACLAW_AUTH_DIR"
		cp "$OPENCLAW_AUTH_PROFILES" "$ACACLAW_AUTH_DIR/auth-profiles.json"
		log "Copied API key credentials from existing OpenClaw ✓"
	fi
else
	# No existing OpenClaw install — standalone config
	log "No existing OpenClaw config found — creating standalone config"

	python3 -c "
import json, secrets

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
" 2>/dev/null

	log "AcaClaw standalone config created ✓"
fi

log "Config location: ${ACACLAW_CONFIG}"
log "OpenClaw's own config: untouched ✓"

# Inject gateway auth token into the deployed UI index.html
ACAC_UI_INDEX="${OPENCLAW_DIR}/ui/index.html"
if [[ -f "$ACAC_UI_INDEX" ]] && [[ -f "$ACACLAW_CONFIG" ]]; then
	GATEWAY_TOKEN=$(python3 -c "
import json
with open('${ACACLAW_CONFIG}') as f:
    c = json.load(f)
t = c.get('gateway', {}).get('auth', {}).get('token', '')
print(t)
" 2>/dev/null)
	if [[ -n "$GATEWAY_TOKEN" ]]; then
		# Remove any existing oc-token meta tag before injecting the correct one
		if [[ "$OS" == "macos" ]]; then
			sed -i '' '/<meta name="oc-token"/d' "$ACAC_UI_INDEX"
			sed -i '' "s|</head>|<meta name=\"oc-token\" content=\"${GATEWAY_TOKEN}\" />\\
  </head>|" "$ACAC_UI_INDEX"
		else
			sed -i '/<meta name="oc-token"/d' "$ACAC_UI_INDEX"
			sed -i "s|</head>|<meta name=\"oc-token\" content=\"${GATEWAY_TOKEN}\" />\n  </head>|" "$ACAC_UI_INDEX"
		fi
		log "Gateway token injected into UI ✓"
	fi
fi
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

	log "Workspace created ✓"
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

# Save installed mode
echo "$SECURITY_MODE" > "${ACACLAW_DIR}/config/security-mode.txt"

# Create AcaClaw plugin config (separate from OpenClaw's validated config)
cat > "${ACACLAW_DIR}/config/plugins.json" <<PLUGINJSON
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
log "AcaClaw plugin config saved ✓"
log "Plugin config: ${ACACLAW_DIR}/config/plugins.json"

# --- Environment verification ---

if [[ "$SKIP_CONDA" != "true" ]]; then
	header "Verifying Environment"

	if conda --version &>/dev/null; then
		log "conda $(conda --version 2>&1 | awk '{print $2}') ✓"
	else
		warn "conda not working"
	fi

	if python3 --version &>/dev/null; then
		log "Python $(python3 --version 2>&1 | awk '{print $2}') ✓"
	else
		log "Python available in conda base ✓"
	fi

	log "Scientific packages will be installed during setup wizard"
fi

# --- Start gateway and open browser setup wizard ---

header "Opening Setup Wizard"

log "Starting OpenClaw gateway..."
if check_command openclaw; then
	# Start gateway for AcaClaw
	openclaw gateway run --bind loopback --port 2090 &>/dev/null &
	GATEWAY_PID=$!
	sleep 2

	# Save setup state for the wizard to read
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

	SETUP_URL="http://localhost:2090/"

	# Open browser based on OS
	case "$OS" in
		macos)  open "$SETUP_URL" 2>/dev/null || true ;;
		linux)  xdg-open "$SETUP_URL" 2>/dev/null || true ;;
		windows) start "$SETUP_URL" 2>/dev/null || true ;;
	esac

	log "Setup wizard opened at: ${BOLD}${SETUP_URL}${NC}"
	log "If the browser didn't open, visit the URL above manually."
else
	warn "OpenClaw not found — start the gateway manually:"
	warn "  openclaw gateway run --bind loopback --port 2090"
	warn "Then visit http://localhost:2090/"
fi

# --- Install auto-restart service ---

header "Auto-Restart Service"

SERVICE_SCRIPT="${SCRIPT_DIR}/acaclaw-service.sh"
if [[ -f "$SERVICE_SCRIPT" ]]; then
	log "Installing gateway auto-restart service..."
	bash "$SERVICE_SCRIPT" install 2>/dev/null || warn "Service install failed (non-fatal — gateway still works, just won't auto-restart)"
else
	log "Service script not found — skipping"
fi

# --- Install desktop shortcut ---

header "Desktop Integration"

DESKTOP_SCRIPT="${SCRIPT_DIR}/install-desktop.sh"
if [[ -f "$DESKTOP_SCRIPT" ]]; then
	log "Installing desktop shortcut..."
	bash "$DESKTOP_SCRIPT" 2>/dev/null || warn "Desktop shortcut install failed (non-fatal)"
else
	log "Desktop shortcut script not found — skipping"
fi

# --- Copy management scripts to persistent location ---
for _script in start.sh stop.sh uninstall.sh; do
	if [[ -f "${SCRIPT_DIR}/${_script}" ]]; then
		cp -f "${SCRIPT_DIR}/${_script}" "${ACACLAW_DIR}/${_script}"
		chmod +x "${ACACLAW_DIR}/${_script}"
	fi
done

echo ""
echo -e "${GREEN}AcaClaw v${ACACLAW_VERSION} installed successfully.${NC}"
echo ""
echo "  Complete setup in your browser: ${BOLD}http://localhost:2090/${NC}"
echo ""
echo "  The wizard will guide you through:"
echo "    1. Choose your research discipline"
echo "    2. Connect your AI provider (API key)"
echo "    3. Configure workspace location"
echo "    4. Choose security level"
echo ""
echo "  After setup, launch AcaClaw anytime:"
echo "    • From your app launcher (desktop shortcut installed)"
echo "    • Or run: ${BOLD}bash ${ACACLAW_DIR}/start.sh${NC}"
echo "    • Stop:  ${BOLD}bash ${ACACLAW_DIR}/stop.sh${NC}"
echo ""
log "Happy researching!"

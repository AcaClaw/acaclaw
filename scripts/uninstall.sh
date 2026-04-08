#!/usr/bin/env bash
# AcaClaw Uninstaller — removes AcaClaw, OpenClaw, and computing environment
# Usage: bash uninstall.sh [--keep-backups] [--yes]
#
# What this removes:
#   - OpenClaw directory (~/.openclaw/) — config, plugins, sessions, UI
#   - AcaClaw data (~/.acaclaw/) — conda envs, miniforge, audit, scripts
#   - OpenClaw gateway service (systemd/launchd)
#   - OpenClaw + ClawHub CLI (npm global packages)
#
# What this does NOT touch:
#   - User data (~/AcaClaw/) — your research files stay
#   - System conda (miniconda3, mambaforge, etc.) — only AcaClaw's own miniforge
#   - Node.js itself
set -euo pipefail

ACACLAW_DIR="${ACACLAW_DIR:-$HOME/.acaclaw}"
OPENCLAW_DIR="${HOME}/.openclaw"
ACACLAW_MINIFORGE="${ACACLAW_DIR}/miniforge3"

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

# --- Parse arguments ---

KEEP_BACKUPS=false
AUTO_YES=false

while [[ $# -gt 0 ]]; do
	case "$1" in
		--keep-backups)
			KEEP_BACKUPS=true
			shift
			;;
		--yes|-y)
			AUTO_YES=true
			shift
			;;
		--help|-h)
			echo "AcaClaw Uninstaller"
			echo ""
			echo "Usage: bash uninstall.sh [OPTIONS]"
			echo ""
			echo "Removes AcaClaw and OpenClaw completely: config, plugins,"
			echo "conda envs, gateway service, and CLI packages."
			echo "Your research data (~/AcaClaw/) is NOT touched."
			echo ""
			echo "Options:"
			echo "  --keep-backups   Keep backup files in ~/.acaclaw/backups/"
			echo "  --yes, -y        Skip confirmation prompts"
			echo "  -h, --help       Show this help"
			exit 0
			;;
		*)
			error "Unknown option: $1"
			exit 1
			;;
	esac
done

# --- Confirmation ---

header "AcaClaw Uninstaller"

echo -e "${RED}${BOLD}This will remove AcaClaw and OpenClaw completely.${NC}"
echo ""
echo "Will be removed:"
echo "  - OpenClaw directory  ${OPENCLAW_DIR}/"
echo "    (config, plugins, skills, sessions, UI)"
echo "  - AcaClaw data        ${ACACLAW_DIR}/"
if [[ -d "$ACACLAW_MINIFORGE" ]]; then
	echo "  - AcaClaw Miniforge   ${ACACLAW_MINIFORGE}/"
fi
echo "  - Gateway service     (systemd/launchd)"
echo "  - OpenClaw CLI        (npm global package)"
if [[ "$KEEP_BACKUPS" == "true" ]]; then
	echo -e "    ${GREEN}(keeping backups)${NC}"
fi
echo ""
echo -e "  ${GREEN}NOT touched:${NC}"
echo -e "    ${GREEN}✓ Research data  ${HOME}/AcaClaw/${NC}"
echo -e "    ${GREEN}✓ Node.js${NC}"
echo -e "    ${GREEN}✓ Conda environments${NC}"
echo ""

if [[ "$AUTO_YES" == "false" ]]; then
	read -rp "Continue? [y/N]: " confirm
	confirm_lower=$(echo "$confirm" | tr '[:upper:]' '[:lower:]')
	if [[ "$confirm_lower" != "y" && "$confirm_lower" != "yes" ]]; then
		log "Uninstall cancelled."
		exit 0
	fi
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# NOTE: Gateway stop is deferred to the end of the script.
# When run via the gateway itself, stopping the gateway mid-script breaks
# the stdout pipe (SIGPIPE) and kills this script before cleanup completes.

# --- Remove desktop shortcut ---

DESKTOP_SCRIPT="${SCRIPT_DIR}/install-desktop.sh"
if [[ -f "$DESKTOP_SCRIPT" ]]; then
	bash "$DESKTOP_SCRIPT" --remove 2>/dev/null || true
fi

# Direct cleanup in case install-desktop.sh is missing
rm -f "${HOME}/.local/share/applications/acaclaw.desktop" 2>/dev/null || true
rm -f "${HOME}/.local/share/icons/hicolor/256x256/apps/acaclaw.png" 2>/dev/null || true
rm -f "${HOME}/.local/share/icons/hicolor/scalable/apps/acaclaw.svg" 2>/dev/null || true
rm -f "${HOME}/Desktop/acaclaw.desktop" 2>/dev/null || true
if command -v update-desktop-database &>/dev/null; then
	update-desktop-database "${HOME}/.local/share/applications" 2>/dev/null || true
fi

# --- Remove deployed UI assets (prevents stale UI on reinstall) ---

header "Removing Deployed UI"

if [[ -d "${OPENCLAW_DIR}/ui" ]]; then
	rm -rf "${OPENCLAW_DIR}/ui"
	log "Removed deployed UI ✓"
fi

# --- Remove AcaClaw profile (plugins, skills, config, sessions) ---

header "Removing AcaClaw Profile"

if [[ -d "${OPENCLAW_DIR}" ]]; then
	rm -rf "${OPENCLAW_DIR}"
	log "Removed ${OPENCLAW_DIR}/ ✓"
else
	log "AcaClaw profile not found (already removed)"
fi

# --- Conda environment removal ---

header "Removing AcaClaw Conda Environments"

# Find conda — prefer system conda over AcaClaw's miniforge (since we're about to delete miniforge)
CONDA_CMD=""
for candidate in \
	"${HOME}/miniconda3/bin/conda" \
	"${HOME}/miniforge3/bin/conda" \
	"${HOME}/mambaforge/bin/conda"; do
	if [[ -x "$candidate" ]]; then
		CONDA_CMD="$candidate"
		break
	fi
done
if [[ -z "$CONDA_CMD" ]] && command -v conda &>/dev/null; then
	CONDA_CMD="$(command -v conda)"
fi
# Fallback to AcaClaw's own miniforge
if [[ -z "$CONDA_CMD" && -x "${ACACLAW_MINIFORGE}/bin/conda" ]]; then
	CONDA_CMD="${ACACLAW_MINIFORGE}/bin/conda"
fi

if [[ -n "$CONDA_CMD" ]]; then
	ACACLAW_ENVS=$("$CONDA_CMD" env list 2>/dev/null | grep -oE 'acaclaw(-[a-zA-Z0-9_]+)?' | sort -u || true)

	if [[ -n "$ACACLAW_ENVS" ]]; then
		while IFS= read -r env_name; do
			log "Removing conda env '${env_name}'..."
			"$CONDA_CMD" env remove -n "$env_name" -y 2>/dev/null || \
				warn "Could not remove '${env_name}' — remove manually: conda env remove -n ${env_name}"
		done <<< "$ACACLAW_ENVS"
		log "Conda environments removed ✓"
	else
		log "No AcaClaw conda environments found"
	fi
else
	log "No conda found — nothing to remove"
fi

# Remove AcaClaw-installed Miniforge (only the one AcaClaw put in ~/.acaclaw/miniforge3)
if [[ -d "$ACACLAW_MINIFORGE" ]]; then
	rm -rf "$ACACLAW_MINIFORGE"
	log "Removed AcaClaw Miniforge at ${ACACLAW_MINIFORGE}/ ✓"
fi

# --- Remove AcaClaw data (config, audit — not user research data) ---

header "Removing AcaClaw Data"

if [[ "$KEEP_BACKUPS" == "true" ]]; then
	log "Keeping backups at ${ACACLAW_DIR}/backups/"
fi

if [[ "$KEEP_BACKUPS" == "true" && -d "${ACACLAW_DIR}/backups" ]]; then
	# Move backups to a temp location, wipe dir, restore
	local_bak="$(mktemp -d)"
	mv "${ACACLAW_DIR}/backups" "${local_bak}/backups"
	rm -rf "${ACACLAW_DIR}"
	mkdir -p "${ACACLAW_DIR}"
	mv "${local_bak}/backups" "${ACACLAW_DIR}/backups"
	rmdir "${local_bak}" 2>/dev/null || true
else
	rm -rf "${ACACLAW_DIR}"
fi
log "AcaClaw data removed ✓"

# --- Remove OpenClaw CLI ---

header "Removing OpenClaw CLI"

if command -v openclaw &>/dev/null; then
	log "Removing OpenClaw CLI..."
	npm rm -g openclaw 2>/dev/null || true
	hash -r 2>/dev/null || true
	if command -v openclaw &>/dev/null; then
		warn "openclaw still found at $(command -v openclaw) after npm rm"
		warn "Attempting direct removal..."
		rm -f "$(command -v openclaw)" 2>/dev/null || true
		hash -r 2>/dev/null || true
		if command -v openclaw &>/dev/null; then
			warn "Could not remove openclaw — remove manually: npm rm -g openclaw"
		else
			log "OpenClaw CLI removed ✓"
		fi
	else
		log "OpenClaw CLI removed ✓"
	fi
else
	log "OpenClaw CLI not found (already removed)"
fi

# Also remove clawhub CLI if present
if command -v clawhub &>/dev/null; then
	log "Removing ClawHub CLI..."
	npm rm -g clawhub 2>/dev/null || true
	hash -r 2>/dev/null || true
	if command -v clawhub &>/dev/null; then
		warn "clawhub still found after npm rm — remove manually: npm rm -g clawhub"
	else
		log "ClawHub CLI removed ✓"
	fi
fi

# --- Remove macOS app (if present) ---

if [[ "$(uname -s)" == "Darwin" && -d "/Applications/OpenClaw.app" ]]; then
	rm -rf "/Applications/OpenClaw.app"
	log "Removed /Applications/OpenClaw.app ✓"
fi

# --- Summary ---

header "Uninstall Complete"

echo "AcaClaw and OpenClaw have been removed."
echo ""
echo -e "  ${GREEN}✓${NC} Your research data at ~/AcaClaw/ is preserved"
echo ""
if [[ "$KEEP_BACKUPS" == "true" ]]; then
	echo "  Backups preserved at: ${ACACLAW_DIR}/backups/"
	echo ""
fi
echo "To reinstall: bash install.sh"
echo ""

# =========================================================
# Stop gateway services (MUST be last)
# =========================================================
# When this script is run via the gateway, stopping the gateway breaks the
# stdout pipe, killing the script. By deferring to the very end, all file
# removals are guaranteed to complete first.

# Remove AcaClaw gateway service (delegates to openclaw daemon uninstall + legacy cleanup)
SERVICE_SCRIPT="${SCRIPT_DIR}/acaclaw-service.sh"
if [[ -f "$SERVICE_SCRIPT" ]]; then
	bash "$SERVICE_SCRIPT" remove 2>/dev/null || true
fi

# Also try openclaw daemon uninstall directly (in case acaclaw-service.sh is missing)
if command -v openclaw &>/dev/null; then
	openclaw daemon uninstall 2>/dev/null || true
fi

# Clean up any remaining legacy service files not handled by the above
for _legacy_unit in "acaclaw-gateway.service" "openclaw-gateway-acaclaw.service"; do
	_legacy_path="${HOME}/.config/systemd/user/${_legacy_unit}"
	if [[ -f "$_legacy_path" ]] && command -v systemctl &>/dev/null; then
		systemctl --user stop "${_legacy_unit}" 2>/dev/null || true
		systemctl --user disable "${_legacy_unit}" 2>/dev/null || true
		rm -f "$_legacy_path"
	fi
done
command -v systemctl &>/dev/null && systemctl --user daemon-reload 2>/dev/null || true

# macOS: clean up legacy com.acaclaw.gateway plist
if [[ -f "${HOME}/Library/LaunchAgents/com.acaclaw.gateway.plist" ]]; then
	launchctl bootout "gui/$(id -u)/com.acaclaw.gateway" 2>/dev/null || true
	rm -f "${HOME}/Library/LaunchAgents/com.acaclaw.gateway.plist"
fi

bash "${SCRIPT_DIR}/stop.sh" 2>/dev/null || true

# Kill any remaining openclaw processes
if command -v pkill &>/dev/null; then
	pkill -u "$(id -u)" -f "openclaw.*gateway" 2>/dev/null || true
	pkill -u "$(id -u)" -x "openclaw" 2>/dev/null || true
fi

log "Done."

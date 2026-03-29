#!/usr/bin/env bash
# AcaClaw + OpenClaw Full Uninstaller
# Usage: bash uninstall-all.sh [--keep-backups] [--keep-data] [--yes]
#
# This removes EVERYTHING:
#   1. AcaClaw config, plugins, miniforge (if installed by AcaClaw)
#   2. OpenClaw gateway service, config, plugins, sessions
#   3. OpenClaw CLI (npm global package)
#
# What this does NOT remove by default:
#   - ~/AcaClaw/ research data (use --keep-data=false is default, data preserved)
#   - System Node.js
#   - Conda environments and system conda
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
			echo "AcaClaw + OpenClaw Full Uninstaller"
			echo ""
			echo "Usage: bash uninstall-all.sh [OPTIONS]"
			echo ""
			echo "Removes AcaClaw AND OpenClaw completely."
			echo "Your research data (~/AcaClaw/) is preserved."
			echo ""
			echo "Options:"
			echo "  --keep-backups   Keep backup files in ~/.acaclaw/backups/"
			echo "  --yes, -y        Skip confirmation prompts"
			echo "  -h, --help       Show this help"
			echo ""
			echo "To remove only AcaClaw (keep OpenClaw): bash uninstall.sh"
			exit 0
			;;
		*)
			error "Unknown option: $1"
			exit 1
			;;
	esac
done

# --- Confirmation ---

header "AcaClaw + OpenClaw Full Uninstaller"

echo -e "${RED}${BOLD}This will remove BOTH AcaClaw and OpenClaw.${NC}"
echo ""
echo "Will be removed:"
echo "  - OpenClaw directory  ${OPENCLAW_DIR}/"
echo "  - AcaClaw data        ${ACACLAW_DIR}/"
if [[ -d "$ACACLAW_MINIFORGE" ]]; then
	echo "  - AcaClaw Miniforge   ${ACACLAW_MINIFORGE}/"
fi
echo "  - OpenClaw service    (gateway)"
echo "  - OpenClaw CLI        (npm global package)"
echo ""
echo -e "  ${GREEN}NOT touched:${NC}"
echo -e "    ${GREEN}✓ Research data   ~/AcaClaw/${NC}"
echo -e "    ${GREEN}✓ Node.js${NC}"
echo -e "    ${GREEN}✓ Conda environments${NC}"
echo ""

if [[ "$AUTO_YES" == "false" ]]; then
	read -rp "Are you sure? This cannot be undone. [y/N]: " confirm
	if [[ "${confirm,,}" != "y" && "${confirm,,}" != "yes" ]]; then
		log "Uninstall cancelled."
		exit 0
	fi
fi

# =========================================================
# Part 1: Remove AcaClaw
# =========================================================

header "Part 1: Removing AcaClaw"

# --- AcaClaw profile ---

if [[ -d "${OPENCLAW_DIR}" ]]; then
	rm -rf "${OPENCLAW_DIR}"
	log "Removed AcaClaw profile ✓"
else
	log "AcaClaw profile not found (already removed)"
fi

# Remove AcaClaw-installed Miniforge only — conda environments are left alone
if [[ -d "$ACACLAW_MINIFORGE" ]]; then
	rm -rf "$ACACLAW_MINIFORGE"
	log "Removed AcaClaw Miniforge ✓"
fi

# --- AcaClaw data ---

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

# --- Remove AcaClaw desktop shortcut ---

DESKTOP_SCRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/install-desktop.sh"
if [[ -f "$DESKTOP_SCRIPT" ]]; then
	bash "$DESKTOP_SCRIPT" --remove 2>/dev/null || true
fi

# NOTE: Gateway stop is deferred to the very end of the script.
# When run via the gateway itself, stopping the gateway mid-script breaks
# the stdout pipe (SIGPIPE) and kills this script before Part 2 runs.

# =========================================================
# Part 2: Remove OpenClaw
# =========================================================

header "Part 2: Removing OpenClaw"

# Service stop is deferred to Part 3 to avoid killing this script.
# Here we only remove files and CLI packages.

# --- Remove OpenClaw systemd unit file (disable only, don't stop yet) ---

case "$(uname -s)" in
	Linux*)
		OC_UNIT="${HOME}/.config/systemd/user/openclaw-gateway.service"
		if [[ -f "$OC_UNIT" ]] && command -v systemctl &>/dev/null; then
			systemctl --user disable openclaw-gateway.service 2>/dev/null || true
			rm -f "$OC_UNIT"
			systemctl --user daemon-reload 2>/dev/null || true
			log "Disabled OpenClaw systemd unit ✓"
		fi
		;;
	Darwin*)
		if [[ -f "${HOME}/Library/LaunchAgents/ai.openclaw.gateway.plist" ]]; then
			rm -f "${HOME}/Library/LaunchAgents/ai.openclaw.gateway.plist"
			log "Removed OpenClaw launchd plist ✓"
		fi
		;;
esac

# --- Remove OpenClaw workspace dirs (agent workspaces from config) ---

OC_CONFIG="${OPENCLAW_CONFIG_PATH:-${OPENCLAW_DIR}/openclaw.json}"
if [[ -f "$OC_CONFIG" ]] && command -v python3 &>/dev/null; then
	# Extract workspace paths from config before we delete the state dir
	WORKSPACE_DIRS=$(python3 -c "
import json, os, sys
try:
    cfg = json.load(open('$OC_CONFIG'))
    dirs = set()
    defaults = cfg.get('agents', {}).get('defaults', {})
    if defaults.get('workspace'):
        dirs.add(os.path.expanduser(defaults['workspace']))
    for agent in cfg.get('agents', {}).get('list', []):
        ws = agent.get('workspace', '')
        if ws:
            dirs.add(os.path.expanduser(ws))
    for d in dirs:
        print(d)
except: pass
" 2>/dev/null || true)

	if [[ -n "$WORKSPACE_DIRS" ]]; then
		while IFS= read -r ws_dir; do
			if [[ -d "$ws_dir" ]]; then
				rm -rf "$ws_dir"
				log "Removed workspace $ws_dir ✓"
			fi
		done <<< "$WORKSPACE_DIRS"
	fi
fi

# --- Remove OpenClaw state directory ---

if [[ -d "${OPENCLAW_DIR}" ]]; then
	rm -rf "${OPENCLAW_DIR}"
	log "Removed ${OPENCLAW_DIR}/ ✓"
else
	log "OpenClaw state dir not found"
fi

# --- Remove custom config / oauth dirs if outside state dir ---

if [[ -n "${OPENCLAW_CONFIG_PATH:-}" && -f "${OPENCLAW_CONFIG_PATH}" ]]; then
	rm -f "${OPENCLAW_CONFIG_PATH}"
	log "Removed custom config ${OPENCLAW_CONFIG_PATH} ✓"
fi

OC_OAUTH_DIR="${OPENCLAW_OAUTH_DIR:-${OPENCLAW_DIR}/identity}"
if [[ -d "$OC_OAUTH_DIR" && "$OC_OAUTH_DIR" != "${OPENCLAW_DIR}"* ]]; then
	rm -rf "$OC_OAUTH_DIR"
	log "Removed OAuth dir ${OC_OAUTH_DIR} ✓"
fi

# --- Remove OpenClaw CLI ---

if command -v openclaw &>/dev/null; then
	log "Removing OpenClaw CLI..."
	npm rm -g openclaw 2>/dev/null || true
	log "OpenClaw CLI removed ✓"
else
	log "OpenClaw CLI not found (already removed)"
fi

# Also remove clawhub CLI if present
if command -v clawhub &>/dev/null; then
	log "Removing ClawHub CLI..."
	npm rm -g clawhub 2>/dev/null || true
	log "ClawHub CLI removed ✓"
fi

# --- Remove macOS app (if present) ---

if [[ "$(uname -s)" == "Darwin" && -d "/Applications/OpenClaw.app" ]]; then
	rm -rf "/Applications/OpenClaw.app"
	log "Removed /Applications/OpenClaw.app ✓"
fi

# --- Summary ---

header "Full Uninstall Complete"

echo "AcaClaw and OpenClaw have been removed."
echo ""
echo -e "  ${GREEN}✓${NC} Your research data at ~/AcaClaw/ is preserved"
echo ""
if [[ "$KEEP_BACKUPS" == "true" ]]; then
	echo "  Backups preserved at: ${ACACLAW_DIR}/backups/"
	echo ""
fi

# =========================================================
# Part 3: Stop gateway services (MUST be last)
# =========================================================
# When this script is run via the gateway, stopping the gateway breaks the
# stdout pipe, killing the script. By deferring to the very end, all file
# removals are guaranteed to complete first.

SCRIPTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

ACACLAW_SVC_SCRIPT="${SCRIPTS_DIR}/acaclaw-service.sh"
if [[ -f "$ACACLAW_SVC_SCRIPT" ]]; then
	bash "$ACACLAW_SVC_SCRIPT" remove 2>/dev/null || true
else
	SYSTEMD_UNIT="${HOME}/.config/systemd/user/acaclaw-gateway.service"
	if [[ -f "$SYSTEMD_UNIT" ]] && command -v systemctl &>/dev/null; then
		systemctl --user stop acaclaw-gateway.service 2>/dev/null || true
		systemctl --user disable acaclaw-gateway.service 2>/dev/null || true
		rm -f "$SYSTEMD_UNIT"
		systemctl --user daemon-reload 2>/dev/null || true
	fi
fi
bash "${SCRIPTS_DIR}/stop.sh" 2>/dev/null || true

# --- Kill any remaining openclaw processes ---
# stop.sh only targets AcaClaw-profile gateways. Vanilla openclaw processes
# (started outside AcaClaw) can survive and recreate ~/.openclaw/.
if command -v pkill &>/dev/null; then
	pkill -u "$(id -u)" -f "openclaw-gateway" 2>/dev/null || true
	pkill -u "$(id -u)" -x "openclaw" 2>/dev/null || true
fi

# Final cleanup: remove state dir again if a dying process recreated it
sleep 1
if [[ -d "${OPENCLAW_DIR}" ]]; then
	rm -rf "${OPENCLAW_DIR}"
fi

log "Done."

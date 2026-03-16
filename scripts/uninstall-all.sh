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
ACACLAW_STATE_DIR="${HOME}/.openclaw-acaclaw"
ACACLAW_MINIFORGE="${ACACLAW_DIR}/miniforge3"
OPENCLAW_STATE_DIR="${HOME}/.openclaw"

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
echo "  - AcaClaw profile     ${ACACLAW_STATE_DIR}/"
echo "  - AcaClaw data        ${ACACLAW_DIR}/"
if [[ -d "$ACACLAW_MINIFORGE" ]]; then
	echo "  - AcaClaw Miniforge   ${ACACLAW_MINIFORGE}/"
fi
echo "  - OpenClaw config     ${OPENCLAW_STATE_DIR}/"
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

if [[ -d "${ACACLAW_STATE_DIR}" ]]; then
	rm -rf "${ACACLAW_STATE_DIR}"
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

for subdir in config audit; do
	if [[ -d "${ACACLAW_DIR}/${subdir}" ]]; then
		rm -rf "${ACACLAW_DIR}/${subdir}"
	fi
done

if [[ "$KEEP_BACKUPS" == "false" && -d "${ACACLAW_DIR}/backups" ]]; then
	rm -rf "${ACACLAW_DIR}/backups"
fi

if [[ -d "$ACACLAW_DIR" ]]; then
	if [[ -z "$(ls -A "$ACACLAW_DIR" 2>/dev/null)" ]]; then
		rmdir "$ACACLAW_DIR"
	fi
fi
log "AcaClaw data removed ✓"

# =========================================================
# Part 2: Remove OpenClaw
# =========================================================

header "Part 2: Removing OpenClaw"

# --- Stop gateway service ---

if command -v openclaw &>/dev/null; then
	# Use OpenClaw's own uninstall to cleanly stop services
	log "Stopping OpenClaw gateway..."
	openclaw uninstall --all --yes --non-interactive 2>/dev/null || true
	log "OpenClaw service stopped ✓"
else
	# Manual service cleanup if CLI is already gone
	case "$(uname -s)" in
		Linux*)
			if systemctl --user is-active openclaw-gateway.service &>/dev/null; then
				systemctl --user disable --now openclaw-gateway.service 2>/dev/null || true
				rm -f "${HOME}/.config/systemd/user/openclaw-gateway.service"
				systemctl --user daemon-reload 2>/dev/null || true
				log "Stopped systemd service ✓"
			fi
			;;
		Darwin*)
			if launchctl list 2>/dev/null | grep -q openclaw; then
				launchctl bootout "gui/$(id -u)/ai.openclaw.gateway" 2>/dev/null || true
				rm -f "${HOME}/Library/LaunchAgents/ai.openclaw.gateway.plist"
				log "Stopped launchd service ✓"
			fi
			;;
	esac
fi

# --- Remove OpenClaw state directory ---

if [[ -d "${OPENCLAW_STATE_DIR}" ]]; then
	rm -rf "${OPENCLAW_STATE_DIR}"
	log "Removed ${OPENCLAW_STATE_DIR}/ ✓"
else
	log "OpenClaw state dir not found"
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
log "Done."

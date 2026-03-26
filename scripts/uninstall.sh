#!/usr/bin/env bash
# AcaClaw Uninstaller — removes AcaClaw config and computing environment
# Usage: bash uninstall.sh [--keep-backups] [--yes]
#
# What this removes:
#   - AcaClaw OpenClaw profile (~/.openclaw-acaclaw/)
#   - AcaClaw conda environments (acaclaw, acaclaw-bio, etc.)
#   - AcaClaw-installed Miniforge (only if AcaClaw installed it)
#   - AcaClaw config and audit data (~/.acaclaw/)
#
# What this does NOT touch:
#   - OpenClaw itself (~/.openclaw/) — completely untouched
#   - User data (~/AcaClaw/) — your research files stay
#   - System conda (miniconda3, mambaforge, etc.) — only AcaClaw's own miniforge
set -euo pipefail

ACACLAW_DIR="${ACACLAW_DIR:-$HOME/.acaclaw}"
ACACLAW_STATE_DIR="${HOME}/.openclaw-acaclaw"
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
			echo "Removes AcaClaw config, plugins, conda envs, and computing environment."
			echo "OpenClaw and your research data (~/AcaClaw/) are NOT touched."
			echo ""
			echo "Options:"
			echo "  --keep-backups   Keep backup files in ~/.acaclaw/backups/"
			echo "  --yes, -y        Skip confirmation prompts"
			echo "  -h, --help       Show this help"
			echo ""
			echo "To also remove OpenClaw, use: bash uninstall-all.sh"
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

echo "This will remove:"
echo "  - AcaClaw profile   ${ACACLAW_STATE_DIR}/"
echo "    (plugins, skills, sessions, config)"
if [[ -d "$ACACLAW_MINIFORGE" ]]; then
	echo "  - AcaClaw Miniforge  ${ACACLAW_MINIFORGE}/"
fi
echo "  - AcaClaw data      ${ACACLAW_DIR}/"
if [[ "$KEEP_BACKUPS" == "true" ]]; then
	echo -e "    ${GREEN}(keeping backups)${NC}"
fi
echo ""
echo -e "  ${GREEN}NOT touched:${NC}"
echo -e "    ${GREEN}✓ OpenClaw       ${HOME}/.openclaw/${NC}"
echo -e "    ${GREEN}✓ Research data  ${HOME}/AcaClaw/${NC}"
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

# --- Stop gateway FIRST (before removing files it serves) ---

header "Stopping Gateway"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_SCRIPT="${SCRIPT_DIR}/acaclaw-service.sh"
if [[ -f "$SERVICE_SCRIPT" ]]; then
	bash "$SERVICE_SCRIPT" remove 2>/dev/null || true
else
	SYSTEMD_UNIT="${HOME}/.config/systemd/user/acaclaw-gateway.service"
	if [[ -f "$SYSTEMD_UNIT" ]] && command -v systemctl &>/dev/null; then
		systemctl --user stop acaclaw-gateway.service 2>/dev/null || true
		systemctl --user disable acaclaw-gateway.service 2>/dev/null || true
		rm -f "$SYSTEMD_UNIT"
		systemctl --user daemon-reload 2>/dev/null || true
		log "systemd service removed ✓"
	fi
fi
bash "${SCRIPT_DIR}/stop.sh" 2>/dev/null || true

# Clean up stale PID file
ACACLAW_PID_FILE="${ACACLAW_DIR}/gateway.pid"
rm -f "$ACACLAW_PID_FILE" 2>/dev/null || true
log "Gateway stopped ✓"

# --- Remove desktop shortcut ---

DESKTOP_SCRIPT="${SCRIPT_DIR}/install-desktop.sh"
if [[ -f "$DESKTOP_SCRIPT" ]]; then
	bash "$DESKTOP_SCRIPT" --remove 2>/dev/null || true
fi

# --- Remove deployed UI assets (prevents stale UI on reinstall) ---

header "Removing Deployed UI"

if [[ -d "${ACACLAW_STATE_DIR}/ui" ]]; then
	rm -rf "${ACACLAW_STATE_DIR}/ui"
	log "Removed deployed UI ✓"
fi

# --- Remove AcaClaw profile (plugins, skills, config, sessions) ---

header "Removing AcaClaw Profile"

if [[ -d "${ACACLAW_STATE_DIR}" ]]; then
	rm -rf "${ACACLAW_STATE_DIR}"
	log "Removed ${ACACLAW_STATE_DIR}/ ✓"
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

for subdir in config audit; do
	if [[ -d "${ACACLAW_DIR}/${subdir}" ]]; then
		rm -rf "${ACACLAW_DIR}/${subdir}"
		log "Removed ${subdir}/ ✓"
	fi
done

if [[ "$KEEP_BACKUPS" == "false" && -d "${ACACLAW_DIR}/backups" ]]; then
	rm -rf "${ACACLAW_DIR}/backups"
	log "Removed backups/ ✓"
fi

# Remove acaclaw dir if empty
if [[ -d "$ACACLAW_DIR" ]]; then
	if [[ -z "$(ls -A "$ACACLAW_DIR" 2>/dev/null)" ]]; then
		rmdir "$ACACLAW_DIR"
		log "Removed empty ${ACACLAW_DIR}/ ✓"
	else
		log "Kept ${ACACLAW_DIR}/ (contains remaining files)"
	fi
fi

# --- Summary ---

header "Uninstall Complete"

echo "AcaClaw has been removed."
echo ""
echo -e "  ${GREEN}✓${NC} OpenClaw is still installed and untouched"
echo -e "  ${GREEN}✓${NC} Your research data at ~/AcaClaw/ is preserved"
echo ""
if [[ "$KEEP_BACKUPS" == "true" ]]; then
	echo "  Backups preserved at: ${ACACLAW_DIR}/backups/"
	echo ""
fi
echo "To also remove OpenClaw: bash uninstall-all.sh"
echo ""
log "Done."

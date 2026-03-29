#!/usr/bin/env bash
# AcaClaw + OpenClaw Full Uninstaller (backward-compat wrapper)
# All functionality now lives in uninstall.sh — this just delegates.
# Usage: bash uninstall-all.sh [--keep-backups] [--yes]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec bash "${SCRIPT_DIR}/uninstall.sh" "$@"

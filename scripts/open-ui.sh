#!/usr/bin/env bash
# AcaClaw UI Launcher — delegates to start.sh
# Kept for backward compatibility: start.sh starts the gateway (if needed) and opens the browser.
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec bash "${SCRIPT_DIR}/start.sh" "$@"

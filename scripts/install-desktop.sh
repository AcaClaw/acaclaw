#!/usr/bin/env bash
# AcaClaw Desktop Integration Installer
# Creates platform-specific desktop shortcuts so users can launch
# AcaClaw from their application launcher / dock / Start menu.
#
# Platforms:
#   Linux:  .desktop file in ~/.local/share/applications/
#   macOS:  .command wrapper in ~/Applications/ (or Dock alias)
#   WSL2:   Windows shortcut on Desktop via powershell.exe
#
# Usage:
#   bash install-desktop.sh          # Install desktop shortcut
#   bash install-desktop.sh --remove # Remove desktop shortcut
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ACACLAW_DATA_DIR="${HOME}/.acaclaw"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'

log()   { echo -e "${GREEN}[acaclaw]${NC} $*"; }
warn()  { echo -e "${YELLOW}[acaclaw]${NC} $*"; }
error() { echo -e "${RED}[acaclaw]${NC} $*" >&2; }

REMOVE=false
[[ "${1:-}" == "--remove" ]] && REMOVE=true

# --- Platform detection ---

detect_platform() {
    if [[ -n "${WSL_DISTRO_NAME:-}" ]] || grep -qi microsoft /proc/version 2>/dev/null; then
        echo "wsl2"
    elif [[ "$(uname -s)" == "Darwin" ]]; then
        echo "macos"
    elif [[ "$(uname -s)" == "Linux" ]]; then
        echo "linux"
    else
        echo "unknown"
    fi
}

PLATFORM="$(detect_platform)"

# --- Find the logo ---

find_icon() {
    local candidates=(
        "${SCRIPT_DIR}/../public/logo/acaclaw-logo.png"
        "${SCRIPT_DIR}/../ui/src/logo/acaclaw-logo.png"
        "${SCRIPT_DIR}/../public/logo/acaclaw-logo.svg"
    )
    for c in "${candidates[@]}"; do
        if [[ -f "$c" ]]; then
            echo "$(cd "$(dirname "$c")" && pwd)/$(basename "$c")"
            return 0
        fi
    done
    return 1
}

# ===================================================================
# Linux: .desktop file
# ===================================================================

install_linux() {
    local desktop_dir="${HOME}/.local/share/applications"
    local desktop_file="${desktop_dir}/acaclaw.desktop"
    local icon_dir="${HOME}/.local/share/icons/hicolor/256x256/apps"

    if [[ "$REMOVE" == "true" ]]; then
        rm -f "$desktop_file"
        rm -f "${icon_dir}/acaclaw.png"
        log "Desktop shortcut removed"
        return
    fi

    mkdir -p "$desktop_dir"

    # Copy icon if available
    local icon_path=""
    if icon_src="$(find_icon)"; then
        mkdir -p "$icon_dir"
        cp "$icon_src" "${icon_dir}/acaclaw.png" 2>/dev/null || true
        icon_path="acaclaw"
    fi

    cat > "$desktop_file" <<DESKTOP
[Desktop Entry]
Type=Application
Name=AcaClaw
Comment=AI-powered academic research assistant
Exec=bash ${SCRIPT_DIR}/start.sh
Icon=${icon_path:-utilities-terminal}
Terminal=false
Categories=Science;Education;Development;
Keywords=research;ai;academic;science;
StartupWMClass=AcaClaw
StartupNotify=true
DESKTOP

    chmod +x "$desktop_file"

    # Update desktop database if available
    if command -v update-desktop-database &>/dev/null; then
        update-desktop-database "$desktop_dir" 2>/dev/null || true
    fi

    log "Desktop shortcut installed: ${BOLD}${desktop_file}${NC}"
    log "AcaClaw should now appear in your application launcher"
}

# ===================================================================
# macOS: .command script in ~/Applications/
# ===================================================================

install_macos() {
    local app_dir="${HOME}/Applications"
    local command_file="${app_dir}/AcaClaw.command"

    if [[ "$REMOVE" == "true" ]]; then
        rm -f "$command_file"
        log "Desktop shortcut removed"
        return
    fi

    mkdir -p "$app_dir"

    cat > "$command_file" <<COMMAND
#!/usr/bin/env bash
# AcaClaw Desktop Launcher
# Double-click this file in Finder to start AcaClaw
exec bash "${SCRIPT_DIR}/start.sh"
COMMAND

    chmod +x "$command_file"

    # Set a custom icon if iconutil is available and we have a source icon
    if icon_src="$(find_icon)" && command -v sips &>/dev/null; then
        local iconset_dir
        iconset_dir="$(mktemp -d)/AcaClaw.iconset"
        mkdir -p "$iconset_dir"
        # Generate required sizes from the source PNG
        for size in 16 32 64 128 256 512; do
            sips -z "$size" "$size" "$icon_src" --out "${iconset_dir}/icon_${size}x${size}.png" &>/dev/null || true
        done
        if command -v iconutil &>/dev/null; then
            local icns_file="${ACACLAW_DATA_DIR}/AcaClaw.icns"
            mkdir -p "$ACACLAW_DATA_DIR"
            iconutil -c icns "$iconset_dir" -o "$icns_file" 2>/dev/null || true
            if [[ -f "$icns_file" ]]; then
                # Apply custom icon to the .command file via Finder metadata
                python3 -c "
import subprocess, sys
icns = '${icns_file}'
target = '${command_file}'
# Use osascript (AppleScript) to set custom icon — works without extra deps
subprocess.run([
    'osascript', '-e',
    'use framework \"AppKit\"',
    '-e', 'set iconImage to (current application\\'s NSImage\\'s alloc()\\'s initWithContentsOfFile:\"' + icns + '\")',
    '-e', '(current application\\'s NSWorkspace\\'s sharedWorkspace()\\'s setIcon:iconImage forFile:\"' + target + '\" options:0)',
], capture_output=True)
" 2>/dev/null || true
            fi
        fi
        rm -rf "$(dirname "$iconset_dir")"
    fi

    log "Desktop shortcut installed: ${BOLD}${command_file}${NC}"
    log "Double-click AcaClaw.command in Finder, or add it to the Dock"
}

# ===================================================================
# WSL2: Creates a Windows shortcut on Desktop
# ===================================================================

install_wsl2() {
    if [[ "$REMOVE" == "true" ]]; then
        if command -v powershell.exe &>/dev/null; then
            powershell.exe -NoProfile -Command "
                \$desktop = [Environment]::GetFolderPath('Desktop')
                \$shortcut = Join-Path \$desktop 'AcaClaw.lnk'
                if (Test-Path \$shortcut) { Remove-Item \$shortcut -Force }
            " 2>/dev/null || true
        fi
        log "Windows desktop shortcut removed"
        return
    fi

    if ! command -v powershell.exe &>/dev/null; then
        error "powershell.exe not available — cannot create Windows shortcut"
        warn "You can still start AcaClaw manually: bash ${SCRIPT_DIR}/start.sh"
        exit 1
    fi

    # Convert WSL path to Windows path for the script
    local wsl_script="${SCRIPT_DIR}/start.sh"
    local win_script
    if command -v wslpath &>/dev/null; then
        win_script="$(wslpath -w "$wsl_script")"
    else
        # Fallback: manual conversion
        win_script="\\\\wsl\$\\${WSL_DISTRO_NAME:-Ubuntu}${wsl_script}"
    fi

    powershell.exe -NoProfile -Command "
        \$desktop = [Environment]::GetFolderPath('Desktop')
        \$shortcut_path = Join-Path \$desktop 'AcaClaw.lnk'
        \$shell = New-Object -ComObject WScript.Shell
        \$shortcut = \$shell.CreateShortcut(\$shortcut_path)
        \$shortcut.TargetPath = 'wsl.exe'
        \$shortcut.Arguments = '-d ${WSL_DISTRO_NAME:-Ubuntu} -- bash ${wsl_script}'
        \$shortcut.Description = 'AcaClaw - AI Academic Research Assistant'
        \$shortcut.WorkingDirectory = '%USERPROFILE%'
        \$shortcut.Save()
    " 2>/dev/null

    if [[ $? -eq 0 ]]; then
        log "Windows desktop shortcut created ✓"
        log "Double-click 'AcaClaw' on your Windows Desktop to launch"
    else
        error "Failed to create Windows shortcut"
        warn "Start manually: bash ${SCRIPT_DIR}/start.sh"
    fi
}

# --- Dispatch ---

case "$PLATFORM" in
    linux)  install_linux ;;
    macos)  install_macos ;;
    wsl2)   install_wsl2 ;;
    *)
        error "Unsupported platform: $(uname -s)"
        error "Supported: Linux, macOS, WSL2"
        exit 1
        ;;
esac

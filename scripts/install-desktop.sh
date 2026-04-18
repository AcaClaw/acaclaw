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
        "${SCRIPT_DIR}/../public/logo/AcaClaw.png"
        "${SCRIPT_DIR}/../ui/dist/logo/icon-512.png"
        "${SCRIPT_DIR}/../ui/src/logo/AcaClaw.png"
        "${SCRIPT_DIR}/../ui/public/logo/AcaClaw.png"
        "${SCRIPT_DIR}/../docs/assets/logo/AcaClaw.png"
        "${SCRIPT_DIR}/../public/logo/AcaClaw.svg"
        "${SCRIPT_DIR}/../ui/dist/logo/AcaClaw.svg"
        "${SCRIPT_DIR}/../ui/src/logo/AcaClaw.svg"
        "${SCRIPT_DIR}/../ui/public/logo/AcaClaw.svg"
        "${SCRIPT_DIR}/../ui/src/public/logo/AcaClaw.svg"
        "${SCRIPT_DIR}/../docs/assets/logo/AcaClaw.svg"
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
        rm -f "${HOME}/Desktop/acaclaw.desktop"
        # Also remove scalable icon if present
        rm -f "${HOME}/.local/share/icons/hicolor/scalable/apps/acaclaw.svg"
        if command -v update-desktop-database &>/dev/null; then
            update-desktop-database "$desktop_dir" 2>/dev/null || true
        fi
        log "Desktop shortcut removed"
        return
    fi

    mkdir -p "$desktop_dir"

    local icon_path=""
    if icon_src="$(find_icon)"; then
        mkdir -p "$icon_dir"
        if [[ "$icon_src" == *.svg ]]; then
            if command -v rsvg-convert &>/dev/null; then
                rsvg-convert -w 256 -h 256 "$icon_src" -o "${icon_dir}/acaclaw.png" 2>/dev/null && icon_path="acaclaw"
            elif command -v inkscape &>/dev/null; then
                inkscape -w 256 -h 256 "$icon_src" -o "${icon_dir}/acaclaw.png" 2>/dev/null && icon_path="acaclaw"
            elif command -v convert &>/dev/null; then
                convert -background none -resize 256x256 "$icon_src" "${icon_dir}/acaclaw.png" 2>/dev/null && icon_path="acaclaw"
            fi
            if [[ -z "$icon_path" ]]; then
                local svg_icon_dir="${HOME}/.local/share/icons/hicolor/scalable/apps"
                mkdir -p "$svg_icon_dir"
                cp "$icon_src" "${svg_icon_dir}/acaclaw.svg" 2>/dev/null && icon_path="acaclaw"
            fi
        else
            cp "$icon_src" "${icon_dir}/acaclaw.png" 2>/dev/null || true
            icon_path="acaclaw"
        fi
    fi

    cat > "$desktop_file" <<DESKTOP
[Desktop Entry]
Type=Application
Name=AcaClaw
Comment=AI Co-Scientist — your dedicated AI research partner
Exec=bash ${ACACLAW_DATA_DIR}/start.sh
Icon=${icon_path:-utilities-terminal}
Terminal=false
Categories=Science;Education;Development;
Keywords=research;ai;academic;science;
StartupWMClass=localhost
StartupNotify=false
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
# macOS: 3-layer launch guarantee
#   Layer 1: .app with native WKWebView window (or open-in-browser fallback)
#   Layer 2: Desktop shortcut (Finder alias or .command fallback)
#   Layer 3: Browser URL (always works)
# ===================================================================

# Fallback launcher when swiftc is unavailable — opens URL in default browser.
_macos_fallback_launcher() {
    local macos_dir="$1" start_script="$2"
    cat > "${macos_dir}/AcaClaw" << FALLBACK
#!/usr/bin/env bash
for d in /opt/homebrew/bin /usr/local/bin "\$HOME/.local/share/fnm" "\$HOME/Library/pnpm"; do
    [[ -d "\$d" ]] && export PATH="\$d:\$PATH"
done
[[ -x "\$(command -v fnm)" ]] && eval "\$(fnm env 2>/dev/null)" 2>/dev/null
if ! lsof -iTCP:2090 -sTCP:LISTEN -P &>/dev/null; then
    bash "${start_script}" --no-browser &>/dev/null &
    for i in \$(seq 1 30); do lsof -iTCP:2090 -sTCP:LISTEN -P &>/dev/null && break; sleep 1; done
fi
open "http://localhost:2090/"
FALLBACK
    chmod +x "${macos_dir}/AcaClaw"
}

install_macos() {
    local app_dir="${HOME}/Applications"
    local app_bundle="${app_dir}/AcaClaw.app"
    local start_script="${ACACLAW_DATA_DIR}/start.sh"
    local acaclaw_url="http://localhost:2090/"

    if [[ "$REMOVE" == "true" ]]; then
        rm -rf "$app_bundle"
        osascript -e 'tell application "Finder" to try' -e 'delete alias file "AcaClaw" of desktop' -e 'end try' 2>/dev/null || true
        rm -f "${HOME}/Desktop/AcaClaw.command" 2>/dev/null || true
        log "AcaClaw.app and Desktop shortcut removed"
        return
    fi

    mkdir -p "$app_dir"

    # Layer 1: .app bundle with native macOS window (WKWebView).
    #
    # How it works:
    #   1. Compile scripts/AcaClaw.swift into Contents/MacOS/AcaClaw
    #   2. The binary opens a native NSWindow with WKWebView at localhost:2090
    #   3. Single Dock icon (AcaClaw's), no separate browser process
    #   4. Dock relaunch brings existing window to front (applicationShouldHandleReopen)
    #   5. Close window → app quits → Dock icon disappears
    #
    # Falls back to open-in-browser if swiftc is unavailable.
    log "Layer 1: Creating AcaClaw.app..."
    [[ -d "$app_bundle" ]] && rm -rf "$app_bundle"

    local macos_dir="${app_bundle}/Contents/MacOS"
    local resources_dir="${app_bundle}/Contents/Resources"
    mkdir -p "$macos_dir" "$resources_dir"

    # --- Info.plist ---
    cat > "${app_bundle}/Contents/Info.plist" << 'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleName</key>
    <string>AcaClaw</string>
    <key>CFBundleDisplayName</key>
    <string>AcaClaw</string>
    <key>CFBundleIdentifier</key>
    <string>com.acaclaw.app</string>
    <key>CFBundleVersion</key>
    <string>1.0</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0</string>
    <key>CFBundleExecutable</key>
    <string>AcaClaw</string>
    <key>CFBundleIconFile</key>
    <string>AcaClaw</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>NSHighResolutionCapable</key>
    <true/>
</dict>
</plist>
PLIST

    # --- Main executable (compiled Swift binary or bash fallback) ---
    local swift_src="${SCRIPT_DIR}/AcaClaw.swift"
    if [[ -f "$swift_src" ]] && command -v swiftc &>/dev/null; then
        log "  Compiling native window (swiftc)..."
        if swiftc -O -o "${macos_dir}/AcaClaw" \
            -framework Cocoa -framework WebKit \
            "$swift_src" 2>/dev/null; then
            log "  ✓ Native WKWebView window compiled"
        else
            warn "  swiftc failed, falling back to open-in-browser"
            _macos_fallback_launcher "$macos_dir" "$start_script"
        fi
    else
        warn "  swiftc not found, falling back to open-in-browser"
        _macos_fallback_launcher "$macos_dir" "$start_script"
    fi

    # --- Icon ---
    if icon_src="$(find_icon)" && command -v sips &>/dev/null && command -v iconutil &>/dev/null; then
        local iconset_dir
        iconset_dir="$(mktemp -d)/AcaClaw.iconset"
        mkdir -p "$iconset_dir"
        for size in 16 32 128 256 512; do
            sips -z "$size" "$size" "$icon_src" --out "${iconset_dir}/icon_${size}x${size}.png" &>/dev/null || true
            local retina=$((size * 2))
            if [[ $retina -le 1024 ]]; then
                sips -z "$retina" "$retina" "$icon_src" --out "${iconset_dir}/icon_${size}x${size}@2x.png" &>/dev/null || true
            fi
        done
        iconutil -c icns "$iconset_dir" -o "${resources_dir}/AcaClaw.icns" 2>/dev/null || true
        rm -rf "$(dirname "$iconset_dir")"
    fi
    # Flush macOS icon cache so the Dock picks up the new icon immediately
    if [[ -f "${resources_dir}/AcaClaw.icns" ]]; then
        /System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$app_bundle" 2>/dev/null || true
    fi
    touch "$app_bundle"
    log "  ✓ ~/Applications/AcaClaw.app (Launchpad, Spotlight, drag to Dock)"

    # Layer 2: Desktop shortcut
    log "Layer 2: Creating Desktop shortcut..."
    if [[ -d "$app_bundle" ]]; then
        osascript -e "
            tell application \"Finder\"
                try
                    delete alias file \"AcaClaw\" of desktop
                end try
                make new alias file at desktop to POSIX file \"${app_bundle}\" with properties {name:\"AcaClaw\"}
            end tell
        " 2>/dev/null
        if [[ $? -eq 0 ]]; then
            log "  ✓ ~/Desktop/AcaClaw (double-click to launch)"
        else
            local command_file="${HOME}/Desktop/AcaClaw.command"
            printf '#!/usr/bin/env bash\nbash "%s"\n' "${start_script}" > "$command_file"
            chmod +x "$command_file"
            log "  ✓ ~/Desktop/AcaClaw.command (double-click to launch)"
        fi
    else
        local command_file="${HOME}/Desktop/AcaClaw.command"
        printf '#!/usr/bin/env bash\nbash "%s"\n' "${start_script}" > "$command_file"
        chmod +x "$command_file"
        log "  ✓ ~/Desktop/AcaClaw.command (double-click to launch)"
    fi

    # Layer 3: Browser URL
    log "Layer 3: Browser bookmark"
    log "  ✓ ${acaclaw_url} (bookmark this URL — always works)"

    echo ""
    log "How to open AcaClaw:"
    log "  1. Launchpad / Spotlight → search 'AcaClaw'"
    log "  2. Double-click AcaClaw on your Desktop"
    log "  3. Open ${BOLD}${acaclaw_url}${NC} in any browser"
}

# ===================================================================
# WSL2: Creates a Windows shortcut on Desktop
# ===================================================================

install_wsl2() {
    local _distro="${WSL_DISTRO_NAME:-Ubuntu}"
    local _wsl_user
    _wsl_user="$(whoami)"

    if [[ "$REMOVE" == "true" ]]; then
        if command -v powershell.exe &>/dev/null; then
            powershell.exe -NoProfile -Command "
                \$desktop = [Environment]::GetFolderPath('Desktop')
                \$app = Join-Path \$desktop 'AcaClaw.lnk'
                \$ws = Join-Path \$desktop 'AcaClaw Workspace.lnk'
                if (Test-Path \$app) { Remove-Item \$app -Force }
                if (Test-Path \$ws) { Remove-Item \$ws -Force }
            " 2>/dev/null || true
        fi
        log "Windows desktop shortcuts removed"
        return
    fi

    if ! command -v powershell.exe &>/dev/null; then
        error "powershell.exe not available — cannot create Windows shortcuts"
        warn "You can still start AcaClaw manually: bash ${ACACLAW_DATA_DIR}/start.sh"
        exit 1
    fi

    # Convert WSL path to Windows path for the script
    local wsl_script="${ACACLAW_DATA_DIR}/start.sh"
    local win_script
    if command -v wslpath &>/dev/null; then
        win_script="$(wslpath -w "$wsl_script")"
    else
        # Fallback: manual conversion
        win_script="\\\\wsl\$\\${_distro}${wsl_script}"
    fi

    # --- App shortcut: launches gateway + opens browser ---
    powershell.exe -NoProfile -Command "
        \$desktop = [Environment]::GetFolderPath('Desktop')
        \$shortcut_path = Join-Path \$desktop 'AcaClaw.lnk'
        \$shell = New-Object -ComObject WScript.Shell
        \$shortcut = \$shell.CreateShortcut(\$shortcut_path)
        \$shortcut.TargetPath = 'wsl.exe'
        \$shortcut.Arguments = '-d ${_distro} -- bash ${wsl_script}'
        \$shortcut.Description = 'AcaClaw - AI Academic Research Assistant'
        \$shortcut.WorkingDirectory = '%USERPROFILE%'
        \$shortcut.WindowStyle = 7
        \$shortcut.Save()
    " 2>/dev/null

    if [[ $? -eq 0 ]]; then
        log "Windows Desktop: app shortcut created ✓"
    else
        error "Failed to create app shortcut"
        warn "Start manually: bash ${ACACLAW_DATA_DIR}/start.sh"
    fi

    # --- Workspace shortcut: opens ~/AcaClaw in Windows Explorer ---
    local _workspace_dir="${HOME}/AcaClaw"
    local _win_workspace
    if command -v wslpath &>/dev/null; then
        _win_workspace="$(wslpath -w "$_workspace_dir" 2>/dev/null || echo "\\\\wsl\$\\${_distro}\\home\\${_wsl_user}\\AcaClaw")"
    else
        _win_workspace="\\\\wsl\$\\${_distro}\\home\\${_wsl_user}\\AcaClaw"
    fi

    powershell.exe -NoProfile -Command "
        \$desktop = [Environment]::GetFolderPath('Desktop')
        \$shortcut_path = Join-Path \$desktop 'AcaClaw Workspace.lnk'
        \$shell = New-Object -ComObject WScript.Shell
        \$shortcut = \$shell.CreateShortcut(\$shortcut_path)
        \$shortcut.TargetPath = '${_win_workspace}'
        \$shortcut.Description = 'AcaClaw Research Workspace (WSL2)'
        \$shortcut.Save()
    " 2>/dev/null

    if [[ $? -eq 0 ]]; then
        log "Windows Desktop: workspace shortcut created ✓"
    else
        warn "Workspace shortcut skipped (non-fatal)"
    fi

    log "Double-click 'AcaClaw' on your Windows Desktop to launch"
    log "Double-click 'AcaClaw Workspace' to open research files in Explorer"
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

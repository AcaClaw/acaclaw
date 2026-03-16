#!/usr/bin/env bash
# Gets the current token and opens browser
set -e
CONFIG_PATH="$HOME/.openclaw-acaclaw/openclaw.json"

if [ ! -f "$CONFIG_PATH" ]; then
    echo "Error: AcaClaw config not found at $CONFIG_PATH"
    echo "Please ensure the gateway is installed and running."
    exit 1
fi

# Extract the token securely using grep/sed (no external deps like jq needed for basic strings)
TOKEN=$(grep -o '"token": "[^"]*"' "$CONFIG_PATH" | head -1 | cut -d '"' -f 4)

if [ -z "$TOKEN" ]; then
    echo "Error: Could not find gateway token in config."
    exit 1
fi

URL="http://localhost:2090/#token=$TOKEN"
echo "Opening AcaClaw UI at $URL"

if command -v xdg-open > /dev/null; then
  xdg-open "$URL"
elif command -v open > /dev/null; then
  open "$URL"
else
  echo "Could not detect web browser launcher."
  echo "Please open this URL manually in your browser:"
  echo "$URL"
fi

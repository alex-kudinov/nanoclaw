#!/usr/bin/env bash
# Start a dedicated Chrome instance for procurement scraping.
# Chrome runs with remote debugging; socat forwards to the container network.
# Managed by launchd: com.nanoclaw.procurement-browser
set -euo pipefail
export PATH="/opt/homebrew/bin:$PATH"

# Chrome for Testing installed by agent-browser
CHROME_BASE="$HOME/.agent-browser/browsers"
CHROME_DIR=$(ls -d "$CHROME_BASE"/chrome-* 2>/dev/null | sort -V | tail -1)
if [ -z "$CHROME_DIR" ]; then
  echo "ERROR: No Chrome found in $CHROME_BASE" >&2
  exit 1
fi
# macOS: the binary is inside the .app bundle
CHROME="$CHROME_DIR/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"
if [ ! -f "$CHROME" ]; then
  # Fallback: direct binary (Linux-style)
  CHROME="$CHROME_DIR/chrome"
fi
PROFILE_DIR="$HOME/Library/Application Support/Google/Chrome/NanoClaw-Procurement"
CDP_PORT=9250
BRIDGE_IP="192.168.64.1"

# Ensure profile directory exists
mkdir -p "$PROFILE_DIR"

# Kill any existing socat on this port
pkill -f "socat.*${CDP_PORT}.*${BRIDGE_IP}" 2>/dev/null || true
sleep 1

# Start Chrome with remote debugging.
# NOT headless — headless Chrome exposes "HeadlessChrome" in User-Agent
# which Cloudflare detects. Running headed but with no display is fine
# on a Mac Mini (windowserver runs even without a monitor).
# Dedicated profile keeps this isolated from personal Chrome.
"$CHROME" \
  --remote-debugging-port="$CDP_PORT" \
  --user-data-dir="$PROFILE_DIR" \
  --no-first-run \
  --no-default-browser-check \
  --disable-sync \
  --disable-blink-features=AutomationControlled \
  --disable-features=AutomationControlled \
  --window-size=1920,1080 \
  &
CHROME_PID=$!
echo "Chrome started (PID $CHROME_PID) on port $CDP_PORT"

# Wait for Chrome to start listening
for i in $(seq 1 30); do
  if curl -s "http://127.0.0.1:${CDP_PORT}/json/version" >/dev/null 2>&1; then
    echo "Chrome ready on port $CDP_PORT"
    break
  fi
  sleep 1
done

# Forward CDP port to container bridge network
# Only accessible from Apple Container VMs (192.168.64.0/24), not LAN/internet
socat "TCP-LISTEN:${CDP_PORT},bind=${BRIDGE_IP},fork,reuseaddr" "TCP:127.0.0.1:${CDP_PORT}" &
SOCAT_PID=$!
echo "socat bridge started (PID $SOCAT_PID) — ${BRIDGE_IP}:${CDP_PORT} → 127.0.0.1:${CDP_PORT}"

# Wait for either process to exit
wait $CHROME_PID $SOCAT_PID

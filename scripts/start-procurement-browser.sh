#!/usr/bin/env bash
# Start a dedicated Chrome instance for procurement scraping.
# Chrome exposes remote debugging on host loopback only. The deterministic host
# collector connects locally; containers must not reach this browser.
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

# Ensure profile directory exists
mkdir -p "$PROFILE_DIR"

# Start Chrome with remote debugging.
# NOT headless — headless Chrome exposes "HeadlessChrome" in User-Agent
# which Cloudflare detects. Running headed but with no display is fine
# on a Mac Mini (windowserver runs even without a monitor).
# Dedicated profile keeps this isolated from personal Chrome.
"$CHROME" \
  --remote-debugging-address=127.0.0.1 \
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

# On exit, take down Chrome so launchd gets a clean restart.
cleanup() {
  kill "$CHROME_PID" 2>/dev/null || true
}
trap cleanup EXIT

# Wait for Chrome to start listening
for i in $(seq 1 30); do
  if curl -s "http://127.0.0.1:${CDP_PORT}/json/version" >/dev/null 2>&1; then
    echo "Chrome ready on port $CDP_PORT"
    break
  fi
  sleep 1
done

# Chrome is the supervised child. Its exit becomes this script's exit and
# launchd KeepAlive starts a clean replacement.
wait "$CHROME_PID"

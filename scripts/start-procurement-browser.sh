#!/usr/bin/env bash
# Start a dedicated Chrome instance for procurement scraping.
# Chrome runs with remote debugging; socat forwards to the container network.
# Managed by launchd: com.nanoclaw.procurement-browser
#
# Two failure modes this script must survive (see incident 2026-05-31):
#   1. Boot race: the Apple Container vmnet bridge IP (192.168.64.1) does not
#      exist until the container runtime is up. socat must NOT bind before then.
#   2. Silent bridge death: if socat dies but Chrome lives, the old `wait` on
#      both PIDs blocked forever and launchd KeepAlive never fired. We now
#      supervise socat in a loop and exit (for a clean launchd restart) only
#      when Chrome itself dies.
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
SOCAT_MATCH="socat.*${CDP_PORT}.*bind=${BRIDGE_IP}"

# Ensure profile directory exists
mkdir -p "$PROFILE_DIR"

# Kill any existing socat on this port
pkill -f "$SOCAT_MATCH" 2>/dev/null || true
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

# On exit (Chrome death or launchd SIGTERM), take down both so launchd gets a
# clean slate on restart.
cleanup() {
  pkill -f "$SOCAT_MATCH" 2>/dev/null || true
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

# Supervisor loop. Forward CDP port to the container bridge network, but only
# once the bridge IP is actually assigned, and respawn socat if it dies. The
# bridge is only reachable from Apple Container VMs (192.168.64.0/24).
while true; do
  # If Chrome died, exit non-zero so launchd KeepAlive restarts the whole job.
  if ! kill -0 "$CHROME_PID" 2>/dev/null; then
    echo "Chrome (PID $CHROME_PID) exited — leaving for launchd restart" >&2
    exit 1
  fi

  # Bridge interface up yet? The Apple Container vmnet gateway 192.168.64.1 only
  # exists while >=1 container runs, and is torn down when the host goes idle.
  # socat cannot bind to it when it is absent, so wait rather than thrash.
  if ! ifconfig 2>/dev/null | grep -q "inet ${BRIDGE_IP} "; then
    sleep 3
    continue
  fi

  # Health check the bridge FUNCTIONALLY, not by process existence. A socat that
  # was bound to a since-removed IP stays in the process table but serves
  # nothing — pgrep would call it healthy. curl is the real signal. Also collapse
  # any duplicate socats (two listeners on the same port with reuseaddr cause
  # intermittent connection failures, which break the host's single-shot CDP
  # fetch at container spawn).
  N=$(pgrep -f "$SOCAT_MATCH" | wc -l | tr -d ' ')
  if ! curl -sf --max-time 3 "http://${BRIDGE_IP}:${CDP_PORT}/json/version" >/dev/null 2>&1 || [ "$N" -ne 1 ]; then
    pkill -f "$SOCAT_MATCH" 2>/dev/null || true
    sleep 1
    socat "TCP-LISTEN:${CDP_PORT},bind=${BRIDGE_IP},fork,reuseaddr" "TCP:127.0.0.1:${CDP_PORT}" &
    echo "socat bridge (re)started (PID $!) — ${BRIDGE_IP}:${CDP_PORT} → 127.0.0.1:${CDP_PORT} [had ${N} socat, health-driven]"
  fi

  sleep 5
done

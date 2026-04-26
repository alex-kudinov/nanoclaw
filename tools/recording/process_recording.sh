#!/usr/bin/env bash
# process_recording.sh — Process a single Teams MP4 recording through
# ElevenLabs Scribe v2, convert to Alter format, deposit in Intake/Alter/.
# Usage: process_recording.sh <file.mp4>
set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

# Argument parsing
mp4="${1:?Usage: process_recording.sh <file.mp4>}"
[[ -f "$mp4" ]] || { echo "File not found: $mp4" >&2; exit 1; }

VAULT_ROOT="${HOME}/Vaults/My Notes"
INTAKE_DIR="${VAULT_ROOT}/Intake/Alter"
MANIFEST="${VAULT_ROOT}/meta/recording-manifest.json"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONVERTER="${SCRIPT_DIR}/convert_el_to_alter.py"
VENV="${HOME}/dev/NanoClaw/.venv/bin/python3"
LOG="${HOME}/.local/log/recording-processor.log"
SLACK_CHANNEL="C0ANF38B91R"

mkdir -p "$(dirname "$LOG")" "$INTAKE_DIR"

# Load env vars individually (source breaks on unquoted values with spaces)
ENV_FILE="${HOME}/dev/NanoClaw/.env"
if [ -f "$ENV_FILE" ]; then
  export ELEVENLABS_API_KEY=$(grep '^ELEVENLABS_API_KEY=' "$ENV_FILE" | cut -d= -f2- || true)
  SLACK_BOT_TOKEN=$(grep '^SLACK_BOT_TOKEN=' "$ENV_FILE" | cut -d= -f2- || true)
fi

# Source response.sh (provides fail() used by el_upload internally)
source "${TOOLBOX_LIB:-${HOME}/dev/toolbox/lib}/response.sh"
# Source ElevenLabs API helpers
source "${HOME}/dev/toolbox/shared/elevenlabs/lib/elevenlabs-api.sh"

# NanoClaw-style file logger — defined AFTER sources to override response.sh's log()
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] [recording:$(basename "$mp4")] $*" >> "$LOG"; }

slack() {
  [ -z "${SLACK_BOT_TOKEN:-}" ] && return 0
  local encoded
  encoded=$(echo "$1" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))' 2>/dev/null) || return 0
  curl -s -X POST https://slack.com/api/chat.postMessage \
    -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"channel\":\"$SLACK_CHANNEL\",\"text\":$encoded}" \
    >/dev/null 2>&1 || true
}

filename=$(basename "$mp4")

# Step 1: Manifest check — skip if already processed
if [ -f "$MANIFEST" ]; then
  if python3 -c "
import json, sys
with open(sys.argv[1]) as f:
    m = json.load(f)
if sys.argv[2] in m:
    sys.exit(0)
sys.exit(1)
" "$MANIFEST" "$filename" 2>/dev/null; then
    log "SKIP: already processed (manifest)"
    exit 0
  fi
fi

log "START: $filename"
slack "[RECORDING] Processing: $filename"

# Step 2: File stability check — skip if still syncing
size1=$(stat -f%z "$mp4" 2>/dev/null || stat -c%s "$mp4" 2>/dev/null)
sleep 5
size2=$(stat -f%z "$mp4" 2>/dev/null || stat -c%s "$mp4" 2>/dev/null)
if [ "$size1" != "$size2" ]; then
  log "SKIP: file still syncing ($size1 -> $size2 bytes)"
  exit 0
fi

# Step 3: Extract audio to temp dir
tmpdir=$(mktemp -d)
trap 'rm -r "$tmpdir"' EXIT INT TERM

log "Extracting audio..."
if ! ffmpeg -i "$mp4" -vn -ac 1 -ar 16000 -c:a libopus -b:a 48k \
  "$tmpdir/audio.ogg" -y -loglevel error 2>>"$LOG"; then
  log "FAIL: ffmpeg extraction failed"
  slack "[RECORDING] FAILED ffmpeg: $filename"
  exit 1
fi

ogg_size=$(stat -f%z "$tmpdir/audio.ogg" 2>/dev/null || stat -c%s "$tmpdir/audio.ogg" 2>/dev/null)
log "Audio extracted: ${ogg_size} bytes"

# Step 4: Transcribe via ElevenLabs Scribe v2
log "Uploading to ElevenLabs Scribe v2..."
if ! result=$(el_upload "/v1/speech-to-text" \
  -F "file=@${tmpdir}/audio.ogg" \
  -F "model_id=scribe_v2" \
  -F "diarize=true" \
  -F "remove_filler_words=true" \
  -F "language_code=en" \
  -F "timestamps_granularity=word" \
  -F "tag_audio_events=true" \
  --max-time 1800); then
  log "FAIL: ElevenLabs upload failed: $result"
  slack "[RECORDING] FAILED ElevenLabs: $filename"
  exit 1
fi
echo "$result" > "${tmpdir}/response.json"

# Validate response has words
word_count=$(python3 -c "import json; d=json.load(open('${tmpdir}/response.json')); print(len(d.get('words',[])))" 2>/dev/null || echo "0")
if [ "$word_count" = "0" ]; then
  log "FAIL: ElevenLabs returned no words"
  slack "[RECORDING] FAILED: no words in transcription for $filename"
  exit 1
fi
log "Transcription received: $word_count words"

# Step 5: Convert to Alter format
log "Converting to Alter format..."
if ! convert_result=$("$VENV" "$CONVERTER" \
  --input "${tmpdir}/response.json" \
  --recording-name "$filename" \
  --output-dir "$INTAKE_DIR" 2>>"$LOG"); then
  log "FAIL: converter failed: $convert_result"
  slack "[RECORDING] FAILED converter: $filename"
  exit 1
fi
log "Converter output: $convert_result"

# Step 6: Verify output
output_file=$(echo "$convert_result" | python3 -c "import json,sys; print(json.load(sys.stdin)['output_file'])" 2>/dev/null)
if [ -z "$output_file" ] || [ ! -s "$output_file" ]; then
  log "FAIL: output file missing or empty"
  slack "[RECORDING] FAILED: output missing for $filename"
  exit 1
fi
log "Output verified: $(basename "$output_file")"

# Step 7: Update manifest
python3 -c "
import json, sys
from datetime import datetime
from pathlib import Path

manifest_path = sys.argv[1]
key = sys.argv[2]
transcript_path = sys.argv[3]

manifest = {}
p = Path(manifest_path)
if p.exists():
    with open(p) as f:
        manifest = json.load(f)

manifest[key] = {
    'processed_date': datetime.now().strftime('%Y-%m-%dT%H:%M:%S'),
    'transcript_path': transcript_path,
}

with open(p, 'w') as f:
    json.dump(manifest, f, indent=2)
" "$MANIFEST" "$filename" "$output_file"

log "Manifest updated"
slack "[RECORDING] Done: $filename -> $(basename "$output_file")"
log "DONE: $filename"

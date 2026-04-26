#!/usr/bin/env python3
"""Convert ElevenLabs Scribe v2 JSON to Alter-compatible transcript format.

Reads raw ElevenLabs API response, extracts diarized segments, and writes
an Alter-format .md file that process_one.py can consume.

Output filename: YYYY-MM-DD-HH-MM-SS-{slug}.md
"""

import argparse
import json
import re
import sys
from datetime import datetime
from pathlib import Path


def parse_recording_name(name: str) -> dict:
    """Extract date, time, and subject from Teams recording filename.

    Handles variants:
      {Subject}-{YYYYMMDD}_{HHMMSS}UTC-Meeting Recording.mp4
      {Subject}-{YYYYMMDD}_{HHMMSS}-Meeting Recording.mp4
      {Subject}-{YYYYMMDD}_{HHMMSS}-Grabación de la reunión.mp4
    """
    match = re.search(r"-(\d{8})_(\d{6})(UTC)?-", name)
    if not match:
        print(f"ERROR: Cannot parse date from filename: {name}", file=sys.stderr)
        sys.exit(1)

    date_str = match.group(1)
    time_str = match.group(2)

    # Validate date
    try:
        dt = datetime.strptime(f"{date_str}{time_str}", "%Y%m%d%H%M%S")
    except ValueError:
        print(f"ERROR: Invalid date/time in filename: {date_str}_{time_str}", file=sys.stderr)
        sys.exit(1)

    subject = name[: match.start()].strip()
    # Collapse multiple spaces/hyphens for slug
    slug = re.sub(r"[\s]+", "-", subject.lower())
    slug = re.sub(r"-{2,}", "-", slug)
    slug = re.sub(r"[^a-z0-9-]", "", slug)
    slug = slug.strip("-")

    return {
        "datetime": dt,
        "date_str": dt.strftime("%Y-%m-%d"),
        "time_str": dt.strftime("%H:%M:%S"),
        "iso_datetime": dt.strftime("%Y-%m-%d %H:%M:%S"),
        "subject": subject,
        "slug": slug,
        "filename_prefix": dt.strftime("%Y-%m-%d-%H-%M-%S"),
    }


def format_timestamp(seconds: float) -> str:
    """Convert seconds to MM:SS format."""
    mins = int(seconds) // 60
    secs = int(seconds) % 60
    return f"{mins:02d}:{secs:02d}"


def build_segments(words: list) -> list:
    """Group consecutive words by speaker_id into segments.

    Passes through ElevenLabs segmentation as-is — no custom gap merging.
    Audio events (e.g. [laughter]) are included inline.
    """
    if not words:
        return []

    segments = []
    current_speaker = None
    current_words = []
    current_start = 0.0
    current_end = 0.0

    for word in words:
        speaker = word.get("speaker_id", "unknown")
        word_type = word.get("type", "word")
        text = word.get("text", "")
        start = word.get("start", 0.0)
        end = word.get("end", 0.0)

        # Audio events get bracketed inline
        if word_type == "audio_event":
            text = f"[{text}]"

        if speaker != current_speaker and current_words:
            # Flush current segment
            segments.append({
                "speaker": current_speaker,
                "start": current_start,
                "end": current_end,
                "text": " ".join(w for w in current_words if w),
            })
            current_words = []

        if not current_words:
            current_speaker = speaker
            current_start = start

        current_words.append(text.strip())
        current_end = end

    # Flush final segment
    if current_words:
        segments.append({
            "speaker": current_speaker,
            "start": current_start,
            "end": current_end,
            "text": " ".join(w for w in current_words if w),
        })

    return segments


def speaker_label(speaker_id: str) -> str:
    """Map speaker_0 -> Speaker 0, etc."""
    match = re.match(r"speaker_(\d+)", speaker_id or "")
    if match:
        return f"Speaker {match.group(1)}"
    return speaker_id or "Unknown"


def main():
    parser = argparse.ArgumentParser(description="Convert ElevenLabs JSON to Alter format")
    parser.add_argument("--input", required=True, help="ElevenLabs JSON response file")
    parser.add_argument("--recording-name", required=True, help="Original MP4 filename")
    parser.add_argument("--output-dir", required=True, help="Output directory for .md file")
    args = parser.parse_args()

    # Parse recording filename
    meta = parse_recording_name(args.recording_name)

    # Read ElevenLabs response
    input_path = Path(args.input)
    if not input_path.exists():
        print(f"ERROR: Input file not found: {args.input}", file=sys.stderr)
        sys.exit(1)

    with open(input_path) as f:
        data = json.load(f)

    words = data.get("words", [])
    if not words:
        print("ERROR: No words found in ElevenLabs response", file=sys.stderr)
        sys.exit(1)

    # Build segments
    segments = build_segments(words)

    # Calculate duration from last word
    last_end = max(w.get("end", 0) for w in words) if words else 0
    duration_mins = int(last_end) // 60
    duration_secs = int(last_end) % 60
    duration_str = f"{duration_mins}m {duration_secs}s"

    # Build output
    lines = []
    # Header (Alter-compatible metadata)
    lines.append(f"Date: {meta['iso_datetime']}")
    lines.append(f"Summary: Transcription of {meta['subject']}")
    lines.append(f"Duration: {duration_str}")
    lines.append("Source: teams-recording")
    lines.append(f"Recording-Subject: {meta['subject']}")
    lines.append(f"Recording-Datetime: {meta['iso_datetime']}")
    lines.append("")

    # Transcript segments
    for seg in segments:
        ts_start = format_timestamp(seg["start"])
        ts_end = format_timestamp(seg["end"])
        label = speaker_label(seg["speaker"])
        lines.append(f"[{ts_start}-{ts_end}] {label}: {seg['text']}")

    # Write output file
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    output_name = f"{meta['filename_prefix']}-{meta['slug']}.md"
    output_path = output_dir / output_name

    with open(output_path, "w") as f:
        f.write("\n".join(lines) + "\n")

    print(json.dumps({
        "output_file": str(output_path),
        "filename": output_name,
        "subject": meta["subject"],
        "date": meta["date_str"],
        "segments": len(segments),
        "duration": duration_str,
        "speakers": len(set(s["speaker"] for s in segments)),
    }))


if __name__ == "__main__":
    main()

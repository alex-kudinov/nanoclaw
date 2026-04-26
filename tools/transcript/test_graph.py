#!/usr/bin/env python3
"""Quick test: authenticate and look up a known meeting's transcripts."""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from graph_client import GraphClient

THREAD_ID = "19:meeting_ZTFiMWFiYjgtMWMxZS00NmZmLWFhMjEtMmZiODU2YzM2ZmNm@thread.v2"


def main():
    print("Authenticating...", file=sys.stderr)
    client = GraphClient()
    print("Authenticated.\n", file=sys.stderr)

    # Step 1: Look up meeting by thread ID
    print(f"Looking up meeting by thread ID...")
    meeting = client.get_meeting_by_thread(THREAD_ID)
    if not meeting:
        print("No meeting found for that thread ID.")
        return

    meeting_id = meeting["id"]
    print(f"Meeting: {meeting.get('subject', '(no subject)')}")
    print(f"Meeting ID: {meeting_id}")
    print(f"Start: {meeting.get('startDateTime')}")
    print(f"End: {meeting.get('endDateTime')}")
    print()

    # Step 2: List transcripts
    print("Listing transcripts...")
    transcripts = client.list_transcripts(meeting_id)
    if not transcripts:
        print("No transcripts found for this meeting.")
    else:
        for t in transcripts:
            print(f"  Transcript: {t['id']}")
            print(f"  Created: {t.get('createdDateTime')}")
            print()

        # Step 3: Download first transcript as VTT
        tid = transcripts[0]["id"]
        print(f"Downloading transcript {tid} as VTT...")
        vtt = client.get_transcript_content(meeting_id, tid)
        print(f"Got {len(vtt)} chars of VTT content.")
        print()
        # Show first 2000 chars
        print("--- VTT Preview (first 2000 chars) ---")
        print(vtt[:2000])

    # Step 3b: List recordings
    print("\nListing recordings...")
    try:
        recordings = client.list_recordings(meeting_id)
        if not recordings:
            print("No recordings found.")
        else:
            for r in recordings:
                print(f"  Recording: {r['id']}")
                print(f"  Created: {r.get('createdDateTime')}")
    except Exception as e:
        print(f"Recordings error: {e}")


if __name__ == "__main__":
    main()

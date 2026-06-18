#!/usr/bin/env python3
"""Tests for copy_email.safe_name — runnable standalone: python3 test_copy_email.py

Regression guard for `[Errno 63] File name too long` that jammed 612 emails in
the drop. The shortened name must stay byte-safe AND keep the trailing
__<GraphID> that process_email.py parses.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import copy_email as ce  # noqa: E402

# A real stuck filename: timestamp + huge subject + __<GraphID>.eml
LONG = (
    "20260316-213558-RE_-_EXT_Re_--Solera-Holdings,-LLC-Past-Due-Invoice-"
    "0146571---Service-Hold-Pending-and-Lots-More-Subject-Text-To-Overflow"
    "__AAMkADM1MWNlZTA1LWI2MWUtNDZkMC05YzgyLTZkN2IyMzVjZmUxNQBGAAAAAACkD0V8"
    "zCP2SY4uXNuyQ2eUBwA4NGcfvhiNSrifBHh2AZ_yAASUg5KAAAA=.eml"
)
GID = "AAMkADM1MWNlZTA1LWI2MWUtNDZkMC05YzgyLTZkN2IyMzVjZmUxNQBGAAAAAACkD0V8zCP2SY4uXNuyQ2eUBwA4NGcfvhiNSrifBHh2AZ_yAASUg5KAAAA="


def test_short_name_unchanged():
    n = "20260601-120000-Hi__ABC123.eml"
    assert ce.safe_name(n) == n
    print("PASS: short name unchanged")


def test_long_name_fits_with_tmp_suffix():
    out = ce.safe_name(LONG)
    # Must fit under 255 even after copy_email appends ".tmp".
    assert len((out + ".tmp").encode("utf-8")) <= 255, len((out + ".tmp").encode())
    assert out.endswith(".eml")
    print(f"PASS: long name fits ({len(out.encode())} bytes): {out[:40]}...")


def test_graph_id_preserved():
    out = ce.safe_name(LONG)
    stem = out[:-4]  # drop .eml — mirrors process_email's path.stem
    assert "__" in stem, "must keep the __ boundary"
    assert stem.split("__", 1)[1] == GID, "GraphID must survive shortening"
    print("PASS: GraphID preserved through shortening")


def test_timestamp_preserved():
    out = ce.safe_name(LONG)
    assert out.startswith("20260316-213558-"), out[:20]
    print("PASS: leading timestamp preserved")


def test_no_graph_id_still_byte_safe():
    n = "20260316-213558-" + ("x" * 400) + ".eml"  # no __ tail
    out = ce.safe_name(n)
    assert len((out + ".tmp").encode("utf-8")) <= 255
    assert out.endswith(".eml")
    print("PASS: name without GraphID still byte-safe")


if __name__ == "__main__":
    test_short_name_unchanged()
    test_long_name_fits_with_tmp_suffix()
    test_graph_id_preserved()
    test_timestamp_preserved()
    test_no_graph_id_still_byte_safe()
    print("\nAll tests passed.")

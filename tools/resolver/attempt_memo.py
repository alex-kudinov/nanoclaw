"""Remember which speaker-resolution inputs the AI has already seen.

resolve_speakers.py re-scans every transcript each run and, before this memo,
asked the model again about every speaker it had left unresolved. Unresolved is a
deliberate answer ("honest uncertainty beats wrong attribution"), so the same
~230 transcripts were re-sent every 2-3 hours: about 1,300 Sonnet calls a day on
the bridge (measured 2026-09-24) for answers that could not change.

The key covers everything the AI prompt depends on that can change between
runs: the anonymous speakers, the calendar attendees, and the utterance count.
A new recording, a corrected calendar match, or a hand edit changes the key and
earns a fresh attempt.
"""
import hashlib
import re

FIELD = "speaker-resolution-key"
_FIELD_RE = re.compile(rf"^{FIELD}:\s*(\S+)\s*$", re.MULTILINE)


def attempt_key(anonymous_speakers, attendees, utterance_count):
    """Stable 16-hex fingerprint of the inputs one AI attempt saw."""
    basis = "|".join([
        ",".join(sorted(anonymous_speakers)),
        ",".join(sorted(attendees)),
        str(utterance_count),
    ])
    return hashlib.sha1(basis.encode("utf-8")).hexdigest()[:16]


def _frontmatter_bounds(text):
    """(start, end) of the frontmatter body, or None when the note has none."""
    if not text.startswith("---"):
        return None
    end = text.find("\n---", 3)
    return (4, end) if end >= 0 else None


def read_key(text):
    """The key recorded in the note's frontmatter, or None."""
    bounds = _frontmatter_bounds(text)
    if not bounds:
        return None
    match = _FIELD_RE.search(text[bounds[0]:bounds[1]])
    return match.group(1) if match else None


def write_key(text, key):
    """Return text with the key set in its frontmatter (added or replaced).

    A note without frontmatter is returned unchanged: the resolver always
    writes frontmatter before calling this.
    """
    bounds = _frontmatter_bounds(text)
    if not bounds:
        return text
    start, end = bounds
    block = text[start:end]
    line = f"{FIELD}: {key}"
    if _FIELD_RE.search(block):
        block = _FIELD_RE.sub(line, block)
    else:
        block = f"{block}\n{line}"
    return text[:start] + block + text[end:]

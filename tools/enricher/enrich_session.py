#!/usr/bin/env python3
"""Post-process a coaching class transcript into enrichment outputs.

Extractions:
  1. Student recap (clean, student-facing summary)
  2. Practitioner wisdom (quotable insights, metaphors, principles)
  3. Coaching question bank (questions demonstrated or discussed)
  4. Article cross-references (matched to tandemweb articles)
  5. Free course recommendations (matched to free ICF competencies course)

Uses Claude Print Bridge (subscription-based, zero marginal cost).
Runs automatically for Tandem coaching class transcripts via transcript-worker.sh.
"""

import argparse
import json
import os
import sys
import urllib.request
import urllib.error
from pathlib import Path
from datetime import datetime

SCRIPT_DIR = Path(__file__).parent
BRIDGE_URL = os.environ.get("CLAUDE_BRIDGE_URL", "http://100.115.115.206:40960/v1/print")
ARTICLE_INDEX = SCRIPT_DIR / "article-index.json"
FREE_COURSE = Path.home() / "dev/courses/community/icf/free-icf-competencies/course.json"

# Bridge payload limit — truncate transcript if needed
MAX_TRANSCRIPT_CHARS = 40000


def load_bridge_key():
    key = os.environ.get("CLAUDE_BRIDGE_KEY", "")
    if key:
        return key
    for env_file in [Path.home() / "dev/.env.shared", Path.home() / "dev/NanoClaw/.env"]:
        if env_file.exists():
            for line in env_file.read_text().splitlines():
                if line.startswith("CLAUDE_BRIDGE_KEY="):
                    return line.split("=", 1)[1].strip().strip("'\"")
    raise RuntimeError("CLAUDE_BRIDGE_KEY not found")


def bridge_call(system_prompt: str, user_msg: str, model: str = "sonnet", timeout: int = 300) -> str:
    """Call Print Bridge, return raw text result."""
    key = load_bridge_key()
    body = {
        "prompt": user_msg,
        "model": model,
        "system_prompt": system_prompt,
        "max_turns": 1,
    }
    req = urllib.request.Request(
        BRIDGE_URL,
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json", "X-Bridge-Key": key},
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        result = json.loads(resp.read())
    if not result.get("ok"):
        raise RuntimeError(f"Bridge error: {result.get('error', 'unknown')}")
    return result["data"]["result"]


def load_article_index():
    if ARTICLE_INDEX.exists():
        return json.loads(ARTICLE_INDEX.read_text())
    return []


def load_free_course_structure():
    if FREE_COURSE.exists():
        course = json.loads(FREE_COURSE.read_text())
        lines = []
        for mod in course["modules"]:
            lines.append(f"Module {mod['number']}: {mod['title']}")
            for lesson in mod["lessons"]:
                lines.append(f"  {lesson['lesson_id']}: {lesson['title']}")
        return "\n".join(lines)
    return ""


def find_summary(transcript_path: Path, vault: Path) -> Path | None:
    """Find the meeting summary for a transcript by scanning recent Tandem Meetings."""
    meetings_dir = vault / "Tandem" / "Meetings"
    if not meetings_dir.exists():
        return None
    stem = transcript_path.stem
    date_part = "-".join(stem.split("-")[:3])
    for md in sorted(meetings_dir.glob(f"{date_part}*.md"), reverse=True):
        content = md.read_text(errors="replace")
        if stem in content:
            return md
    return None


# ── Extraction prompts ─────────────────────────────────────────────

STUDENT_RECAP_PROMPT = """You are creating a student-facing session recap for a coaching class.
Given the transcript, produce a clean, encouraging recap that includes:

1. **Session Title** — what was covered
2. **Key Concepts** (3-5 bullet points) — the main ideas taught, in plain language
3. **Instructor Highlights** — 2-3 memorable moments, metaphors, or demonstrations
4. **Optional Ways to Go Deeper** — 2-3 invitations for self-directed exploration between sessions. Frame as optional, not required. Students' success in the next class does NOT depend on doing these. Use language like "if you'd like to keep exploring" — never "you should" or "make sure to."
5. **Reflection Questions** — 2-3 questions for students to journal on (also framed as optional invitations)

CRITICAL GROUNDING RULES:
- Every claim must be traceable to something explicitly said in the transcript. If the instructor said it, attribute it to the instructor. If a student said it, attribute it to the student. Do NOT attribute ideas to organizations (ICF, etc.) unless the speaker explicitly made that attribution in their words.
- Use the instructor's own language and phrasing where possible. Do not embellish, extrapolate, or add context that was not stated.
- Do NOT invent terminology the instructor did not use. If the instructor said "different types of groups," do not upgrade that to "typologies" or "framework."
- Do NOT add counts ("five types", "three principles") unless the instructor explicitly counted them.
- If something was discussed but the source/authority was not stated, present it as "what was covered in class" — not as an industry standard or organizational position.

Tone: warm, professional, motivating. Write as if addressing the students directly.
Do NOT include internal notes, action items about portal onboarding, or administrative details.
Do NOT frame anything as homework or required preparation. Everything between sessions is optional enrichment.
Output as clean markdown."""

WISDOM_PROMPT = """You are extracting practitioner coaching wisdom from a live coaching class transcript.
Find quotable insights, metaphors, principles, and teaching moments from the instructor.

For each item, output a JSON array of objects with:
- "quote": the insight or principle (paraphrased if needed for clarity, but preserve the instructor's voice)
- "speaker": who said it
- "topic": what coaching concept it relates to
- "competency": which ICF competency area (e.g., "Coaching Presence", "Evoking Awareness", "Active Listening")
- "context": 1-sentence description of when/why this came up
- "type": one of "metaphor", "principle", "technique", "personal_story", "calibration" (ACC/PCC/MCC distinction)

Return ONLY a JSON array. No markdown fences, no explanation."""

QUESTION_BANK_PROMPT = """You are building a coaching question bank from a live coaching class.
Extract coaching questions that were demonstrated, practiced, or discussed.

For each question, output a JSON array of objects with:
- "question": the coaching question
- "type": "transformational", "transactional" (contrast example), or "reflective"
- "context": when/how it was used (1 sentence)
- "competency": which ICF competency
- "phase": coaching arc phase ("agreement", "exploring", "clarity", "closing")
- "source": "demo" (from live coaching), "exercise" (student practice), or "teaching" (presented by instructor)
- "level_note": ACC/PCC/MCC calibration note, or null

Return ONLY a JSON array. No markdown fences, no explanation."""

ARTICLE_XREF_PROMPT = """You are cross-referencing a coaching class transcript with a library of published articles.
Given the transcript and the article index, identify which articles are most relevant to what was taught.

For each match, output a JSON array of objects with:
- "slug": the article slug from the index
- "title": the article title
- "relevance": why this article connects to the session content (1-2 sentences)
- "transcript_topic": which part of the session it relates to
- "student_framing": how to present this to students (e.g., "Want to go deeper on coaching presence? Read this.")

Rank by relevance. Include exactly 3 matches — the 3 strongest. Quality over quantity.
Return ONLY a JSON array. No markdown fences, no explanation."""

FREE_COURSE_PROMPT = """You are recommending specific lessons from a free online coaching course based on what was covered in today's live class session.

Given the transcript of the live class and the full structure of the free course, identify which free course units/lessons would be most valuable for students to review or preview based on today's session content.

CRITICAL: You MUST only use lesson_id and title values that appear EXACTLY in the "Free Course Structure" section below. Do NOT invent, abbreviate, or modify lesson IDs or titles. If the course structure is empty or missing, return an empty array [].

For each recommendation, output a JSON array of objects with:
- "lesson_id": the EXACT unit ID from the course structure (e.g., "U4.1" — must match verbatim)
- "title": the EXACT lesson title from the course structure (must match verbatim)
- "relevance": why this lesson connects to today's session (1-2 sentences)
- "timing": "review" (covers today's content from a different angle) or "preview" (covers what's coming next)
- "student_framing": how to present this to students (e.g., "Karen talked about coaching presence today — this unit explores it in depth.")

Include exactly 3 recommendations — the 3 most valuable. Quality over quantity.
Return ONLY a JSON array. No markdown fences, no explanation."""


def parse_json_response(raw: str) -> list | dict:
    """Parse JSON from bridge response, stripping markdown fences if present."""
    clean = raw.strip()
    if clean.startswith("```"):
        clean = clean.split("\n", 1)[1] if "\n" in clean else clean[3:]
        last_fence = clean.rfind("```")
        if last_fence != -1:
            clean = clean[:last_fence]
        clean = clean.strip()
    return json.loads(clean)


def build_user_msg(transcript_text: str, summary_text: str | None, extra_context: str = "") -> str:
    """Build user message with summary + truncated transcript to stay within bridge limits."""
    parts = []
    if summary_text:
        parts.append(f"## Meeting Summary\n\n{summary_text}")
    if extra_context:
        parts.append(extra_context)
    # Use full transcript if small enough, otherwise truncate
    if len(transcript_text) <= MAX_TRANSCRIPT_CHARS:
        parts.append(f"## Transcript\n\n{transcript_text}")
    else:
        parts.append(f"## Transcript (first {MAX_TRANSCRIPT_CHARS} chars of {len(transcript_text)})\n\n{transcript_text[:MAX_TRANSCRIPT_CHARS]}")
    return "\n\n".join(parts)


def main():
    p = argparse.ArgumentParser(description="Enrich a coaching class transcript")
    p.add_argument("transcript", help="Path to raw transcript file (in Transcripts/)")
    p.add_argument("--summary", help="Path to meeting summary file (optional, auto-detected)")
    p.add_argument("--output-dir", help="Output directory (default: vault Tandem/Enrichment/)")
    p.add_argument("--model", default="opus", help="Model for extraction (default: opus)")
    p.add_argument("--dry-run", action="store_true", help="Show what would be done without calling bridge")
    p.add_argument("--only", help="Run only one extraction: recap, wisdom, questions, articles, free-course")
    p.add_argument("--session-type", choices=["class", "orientation"], default="class",
                   help="Session type: 'orientation' skips free-course and omits Optional Deeper from recap")
    args = p.parse_args()

    transcript_path = Path(args.transcript)
    if not transcript_path.exists():
        print(f"ERROR: Transcript not found: {transcript_path}", file=sys.stderr)
        sys.exit(1)

    transcript_text = transcript_path.read_text(errors="replace")
    vault = Path.home() / "Vaults/My Notes"

    # Find or load summary
    summary_text = None
    summary_path = Path(args.summary) if args.summary else find_summary(transcript_path, vault)
    if summary_path and summary_path.exists():
        summary_text = summary_path.read_text(errors="replace")
        print(f"Using summary: {summary_path.name}", file=sys.stderr)

    # Output dir — use date + time to avoid collisions when multiple classes on same day
    if args.output_dir:
        output_dir = Path(args.output_dir)
    else:
        stem = transcript_path.stem
        parts = stem.split("-")
        if len(parts) >= 6:
            # Full timestamp: YYYY-MM-DD-HH-MM-SS-slug → YYYY-MM-DD-HHMM
            dir_name = f"{parts[0]}-{parts[1]}-{parts[2]}-{parts[3]}{parts[4]}"
        elif len(parts) >= 3:
            dir_name = f"{parts[0]}-{parts[1]}-{parts[2]}"
        else:
            dir_name = datetime.now().strftime("%Y-%m-%d-%H%M")
        output_dir = vault / "Tandem" / "Enrichment" / dir_name
    output_dir.mkdir(parents=True, exist_ok=True)

    # Load context
    articles = load_article_index()
    free_course_structure = load_free_course_structure()

    # Build user messages — questions uses summary+truncated transcript,
    # others use full transcript (recap/wisdom can handle it, articles/free-course
    # add their own context so also use truncated)
    full_msg = build_user_msg(transcript_text, summary_text)
    compact_msg = build_user_msg(transcript_text, summary_text)  # auto-truncates if >40K

    extractions = {
        "wisdom": ("Practitioner Wisdom", WISDOM_PROMPT, full_msg, True),
        "questions": ("Question Bank", QUESTION_BANK_PROMPT, compact_msg, True),
        "articles": (
            "Article Cross-References",
            ARTICLE_XREF_PROMPT,
            build_user_msg(transcript_text, summary_text, f"## Article Index\n\n{json.dumps(articles, indent=2)}"),
            True,
        ),
    }
    if args.session_type == "class":
        extractions["recap"] = ("Student Recap", STUDENT_RECAP_PROMPT, full_msg, False)
        extractions["free-course"] = (
            "Free Course Recommendations",
            FREE_COURSE_PROMPT,
            build_user_msg(transcript_text, summary_text, f"## Free Course Structure\n\n{free_course_structure}"),
            True,
        )

    targets = [args.only] if args.only else list(extractions.keys())
    succeeded = 0
    failed = 0

    for key in targets:
        if key not in extractions:
            print(f"ERROR: Unknown extraction: {key}", file=sys.stderr)
            sys.exit(1)

        label, system_prompt, user_msg, is_json = extractions[key]
        print(f"  [{label}] {len(user_msg)} chars...", file=sys.stderr, end=" ", flush=True)

        if args.dry_run:
            print("[DRY-RUN]", file=sys.stderr)
            continue

        try:
            raw = bridge_call(system_prompt, user_msg, model=args.model)
            if is_json:
                parsed = parse_json_response(raw)
                out_file = output_dir / f"{key}.json"
                out_file.write_text(json.dumps(parsed, indent=2, ensure_ascii=False) + "\n")
                count = len(parsed) if isinstance(parsed, list) else 1
                print(f"{count} items", file=sys.stderr)
            else:
                out_file = output_dir / f"{key}.md"
                out_file.write_text(raw.strip() + "\n")
                print("done", file=sys.stderr)
            succeeded += 1
        except Exception as e:
            print(f"FAILED: {e}", file=sys.stderr)
            failed += 1

    # Write metadata
    if not args.dry_run:
        meta = {
            "transcript": str(transcript_path),
            "summary": str(summary_path) if summary_path else None,
            "enriched_at": datetime.now().isoformat(),
            "model": args.model,
            "session_type": args.session_type,
            "extractions": targets,
            "succeeded": succeeded,
            "failed": failed,
            "output_dir": str(output_dir),
        }
        (output_dir / "meta.json").write_text(json.dumps(meta, indent=2) + "\n")

    # JSON report for caller
    report = {"output_dir": str(output_dir), "succeeded": succeeded, "failed": failed}
    print(json.dumps(report))


if __name__ == "__main__":
    main()

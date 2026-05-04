#!/usr/bin/env python3
"""Distribute a coaching class session recap to students via email.

Reads enrichment output (recap, articles, free-course), matches attendees
to Heartbeat profiles for emails, resolves instructor, renders HTML email,
sends via toolbox email/send-email.

Runs as the final step in the transcript-worker pipeline.
"""

import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from lib.heartbeat import load_heartbeat_key, get_heartbeat_users, match_attendees

SCRIPT_DIR = Path(__file__).parent
TANDEMWEB = Path.home() / "dev/tandemweb"
INSTRUCTORS_DIR = Path(os.environ.get("INSTRUCTORS_DIR", str(TANDEMWEB / "data/instructors")))
TOOLBOX_ROOT = Path(os.environ.get("TOOLBOX_ROOT", str(Path.home() / "dev/toolbox")))
EMAIL_TOOL = Path(os.environ.get("EMAIL_TOOL", str(TOOLBOX_ROOT / "shared/email/tools/email/send-email.sh")))
TEMPLATE_FILE = SCRIPT_DIR / "email-template.html"
FREE_COURSE_JSON = Path.home() / "dev/courses/community/icf/free-icf-competencies/course.json"


# Free course permalink (static — not derived from course.json)
FREE_COURSE_URL = "https://community.tandemcoaching.academy/courses/c/efc96468-1156-45a7-bfaa-c990edf57897"

# Always BCC
BCC_ADDRESS = "info@tandemcoach.co"

# Skip these attendees (instructors, admins)
SKIP_NAMES = {"alex kudinov", "cherie silas"}  # mutable — instructor added at runtime




def load_valid_lesson_ids() -> dict[str, str]:
    """Load lesson_id→title map from course.json or static fallback. Returns empty dict if unavailable."""
    # Try canonical course.json (available on host)
    if FREE_COURSE_JSON.exists():
        try:
            course = json.loads(FREE_COURSE_JSON.read_text())
            return {
                lesson["lesson_id"]: lesson["title"]
                for mod in course["modules"]
                for lesson in mod["lessons"]
            }
        except (json.JSONDecodeError, KeyError):
            pass
    # Fallback: static snapshot (available in container via enricher mount)
    static = SCRIPT_DIR / "valid-lesson-ids.json"
    if static.exists():
        try:
            return json.loads(static.read_text())
        except (json.JSONDecodeError, KeyError):
            pass
    return {}


def validate_free_course(entries: list, valid_ids: dict[str, str]) -> list:
    """Drop free-course entries whose lesson_id doesn't exist in the actual course.
    Also fix title mismatches — use the canonical title from course.json."""
    if not valid_ids:
        print("  WARN: Could not load course.json — skipping free course validation", file=sys.stderr)
        return entries
    validated = []
    for entry in entries:
        lid = entry.get("lesson_id", "")
        if lid in valid_ids:
            entry["title"] = valid_ids[lid]  # canonical title, no hallucination
            validated.append(entry)
        else:
            print(f"  REJECTED free-course entry: {lid} ({entry.get('title', '?')}) — not in course.json", file=sys.stderr)
    return validated


def resolve_instructor(attendee_names: list[str]) -> dict | None:
    """Find the instructor from attendees by matching against instructor JSON files."""
    if not INSTRUCTORS_DIR.exists():
        return None
    instructors = []
    for f in INSTRUCTORS_DIR.glob("*.json"):
        if f.name.startswith("_"):
            continue
        instructors.append(json.loads(f.read_text()))

    # Check if any attendee name matches an instructor
    # Also check for "(Tandem Instructor)" or similar markers
    for name in attendee_names:
        if "instructor" in name.lower():
            # Try to match by first name against instructor files
            for inst in instructors:
                inst_first = inst["name"].split()[0].lower()
                if inst_first in name.lower():
                    return inst

    # Fallback: match any attendee name against instructor names
    for name in attendee_names:
        clean = re.sub(r'\s*\([^)]*\)', '', name).strip().lower()
        for inst in instructors:
            if clean == inst["name"].lower() or clean in inst["name"].lower():
                return inst

    return None


def render_email(template: str, recap_md: str, articles: list, free_course: list, instructor: dict | None) -> str:
    """Replace placeholders in HTML template with content."""
    # Recap content — extract sections from markdown
    sections = {}
    current_section = None
    current_lines = []

    for line in recap_md.splitlines():
        if line.startswith("## "):
            if current_section:
                sections[current_section] = "\n".join(current_lines)
            current_section = line[3:].strip()
            current_lines = []
        elif current_section:
            current_lines.append(line)
    if current_section:
        sections[current_section] = "\n".join(current_lines)

    # Append UTM parameters to article links and free course URL
    # Extract session metadata for campaign slug
    level = "unknown"
    module = "unknown"
    session = "unknown"
    for line in recap_md.splitlines():
        if line.startswith("# "):
            title = line[2:].strip()
            # Parse "Level N" from title
            lm = re.search(r'Level\s+(\d+)', title, re.IGNORECASE)
            if lm:
                level = lm.group(1)
            # Parse "Module N" or "Session N"
            mm = re.search(r'Module\s+(\d+)', title, re.IGNORECASE)
            if mm:
                module = mm.group(1)
            sm = re.search(r'Session\s+(\d+)', title, re.IGNORECASE)
            if sm:
                session = sm.group(1)
            break

    utm_suffix = f"?utm_source=session-recap&utm_medium=email&utm_campaign={level}-{module}-{session}"
    free_course_url_with_utm = FREE_COURSE_URL + utm_suffix

    # Build key concepts HTML
    concepts_html = ""
    key_concepts = sections.get("Key Concepts", "")
    for block in re.split(r'\n\n', key_concepts.strip()):
        block = block.strip()
        if not block or block.startswith("---"):
            continue
        # Parse "- **Title** — Description", "- **Title.** Description", or "- **Title**: Description"
        m = re.match(r'-?\s*\*\*(.+?)\*\*\s*[:—–-]?\s*(.*)', block, re.DOTALL)
        if m:
            title, desc = m.group(1).rstrip('.'), m.group(2).strip()
            desc = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', desc)
            desc = re.sub(r'\*(.+?)\*', r'<em>\1</em>', desc)
            concepts_html += f'''<p style="margin:0 0 16px; font-size:15px; line-height:1.7; color:#2b3e4f;">
    <strong style="color:#135740;">{title}</strong><br>
    {desc}
  </p>\n'''

    # Build highlights HTML
    highlights_html = ""
    highlights = sections.get("Instructor Highlights", "")
    for block in re.split(r'\n\n', highlights.strip()):
        block = block.strip()
        if not block or block.startswith("---"):
            continue
        m = re.match(r'-?\s*\*\*(.+?)\*\*\s*[:—–-]?\s*\n?(.*)', block, re.DOTALL)
        if m:
            title, desc = m.group(1), m.group(2).strip()
            desc = re.sub(r'\*(.+?)\*', r'<em>\1</em>', desc)
            highlights_html += f'''<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px; background:#f8faf9; border-radius:6px; border-left:4px solid #fca602;">
  <tr><td style="padding:16px 20px;">
    <p style="margin:0 0 6px; font-size:14px; font-weight:bold; color:#135740; font-family:Helvetica,Arial,sans-serif;">{title}</p>
    <p style="margin:0; font-size:14px; line-height:1.65; color:#2b3e4f;">{desc}</p>
  </td></tr>
  </table>\n'''

    # Build optional deeper section
    optional_html = ""
    optional = sections.get("Optional Ways to Go Deeper", sections.get("Practice Assignment", ""))
    for line in optional.strip().splitlines():
        line = line.strip()
        if not line or line.startswith("---"):
            continue
        line = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', line)
        line = re.sub(r'\*(.+?)\*', r'<em>\1</em>', line)
        if line.startswith("-") or line.startswith("*"):
            line = line.lstrip("-* ")
            optional_html += f'<p style="margin:0 0 8px; font-size:14px; line-height:1.65; color:rgba(255,255,255,0.9);">&bull; &nbsp;{line}</p>\n'
        else:
            optional_html += f'<p style="margin:0 0 12px; font-size:15px; line-height:1.7; color:#ffffff;">{line}</p>\n'

    # Build reflection questions HTML
    reflections_html = ""
    reflections = sections.get("Reflection Questions", "")
    i = 0
    for line in reflections.strip().splitlines():
        line = line.strip()
        if not line or line.startswith("---"):
            continue
        # Match numbered "1. question" or bulleted "- question"
        m = re.match(r'(?:\d+\.\s*|-\s*)(.*)', line)
        if m:
            i += 1
            q = m.group(1).strip()
            q = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', q)
            q = re.sub(r'\*(.+?)\*', r'<em>\1</em>', q)
            reflections_html += f'''<p style="margin:0 0 12px; font-size:15px; line-height:1.7; color:#2b3e4f;">
    <span style="display:inline-block; width:24px; height:24px; line-height:24px; text-align:center; background:#135740; color:#fff; border-radius:50%; font-size:13px; font-family:Helvetica,Arial,sans-serif; margin-right:8px; vertical-align:middle;">{i}</span>
    {q}
  </p>\n'''

    # Build articles HTML
    articles_html = ""
    for j, art in enumerate(articles[:3]):
        border = ' border-bottom:1px solid #e8eeeb;' if j < min(len(articles), 3) - 1 else ''
        slug = art["slug"]
        title = art["title"]
        framing = art.get("student_framing", "")
        articles_html += f'''<tr><td style="padding:8px 0;{border}">
      <a href="https://tandemcoach.co/{slug}/{utm_suffix}" style="font-size:14px; color:#135740; text-decoration:none; font-weight:bold;">{title}</a>
      <p style="margin:4px 0 0; font-size:13px; color:#6b7c8a; line-height:1.5;">{framing}</p>
    </td></tr>\n'''

    # Build free course HTML
    free_course_html = ""
    for j, unit in enumerate(free_course[:3]):
        border = ' border-bottom:1px solid #e8eeeb;' if j < min(len(free_course), 3) - 1 else ''
        lid = unit["lesson_id"]
        title = unit["title"]
        timing = unit.get("timing", "review")
        framing = unit.get("student_framing", "")
        free_course_html += f'''<tr><td style="padding:8px 0;{border}">
      <p style="margin:0; font-size:14px; color:#2b3e4f;"><strong style="color:#fca602;">{lid}</strong> &nbsp;{title} <span style="font-size:12px; color:#6b7c8a; background:#e8eeeb; padding:2px 6px; border-radius:3px; margin-left:4px;">{timing}</span></p>
      <p style="margin:4px 0 0; font-size:13px; color:#6b7c8a; line-height:1.5;">{framing}</p>
    </td></tr>\n'''

    # Instructor HTML
    instructor_html = ""
    if instructor:
        name = instructor["name"]
        cred = instructor.get("display_credential", "")
        photo = instructor.get("photo", "")
        bio = instructor.get("bio", "")
        linkedin = instructor.get("linkedin", "")
        linkedin_html = f'<p style="margin:8px 0 0;"><a href="{linkedin}" style="font-size:12px; color:#135740; text-decoration:none; font-family:Helvetica,Arial,sans-serif;">LinkedIn &rarr;</a></p>' if linkedin else ""
        instructor_html = f'''<tr><td style="padding:0 40px 32px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8faf9; border-radius:8px; overflow:hidden;">
  <tr>
    <td style="padding:20px; width:80px; vertical-align:top;">
      <img src="{photo}" alt="{name}" width="72" height="72" style="border-radius:50%; display:block;">
    </td>
    <td style="padding:20px 20px 20px 0; vertical-align:top;">
      <p style="margin:0 0 2px; font-size:11px; letter-spacing:1.2px; text-transform:uppercase; color:#6b7c8a; font-family:Helvetica,Arial,sans-serif;">Your Instructor Today</p>
      <p style="margin:0 0 6px; font-size:16px; color:#135740; font-weight:bold; font-family:Helvetica,Arial,sans-serif;">{name}, {cred}</p>
      <p style="margin:0; font-size:13px; line-height:1.6; color:#2b3e4f;">{bio}</p>
      {linkedin_html}
    </td>
  </tr>
  </table>
</td></tr>'''

    # Extract session title from recap
    title_line = ""
    for line in recap_md.splitlines():
        if line.startswith("# "):
            title_line = line[2:].strip().replace("Session Recap — ", "")
            break

    # Replace template placeholders
    html = template
    html = html.replace("{{SESSION_TITLE}}", title_line)
    html = html.replace("{{CONCEPTS}}", concepts_html)
    html = html.replace("{{HIGHLIGHTS}}", highlights_html)
    html = html.replace("{{OPTIONAL_DEEPER}}", optional_html)
    html = html.replace("{{REFLECTIONS}}", reflections_html)
    html = html.replace("{{ARTICLES}}", articles_html)
    html = html.replace("{{FREE_COURSE_UNITS}}", free_course_html)
    html = html.replace("{{FREE_COURSE_URL}}", free_course_url_with_utm)
    html = html.replace("{{INSTRUCTOR}}", instructor_html)

    return html


def validate_email(html: str, recap_md: str) -> list[str]:
    """Run all quality checks on rendered email. Returns list of failure messages (empty = pass)."""
    failures = []

    # ── 1. No unreplaced template placeholders ──
    placeholders = re.findall(r'\{\{[A-Z_]+\}\}', html)
    if placeholders:
        failures.append(f"Unreplaced placeholders: {', '.join(set(placeholders))}")

    # ── 2. Required sections exist and have content ──
    section_markers = [
        ("Key Concepts", "Key Concepts</h2>", "Instructor Highlights</h2>"),
        ("Instructor Highlights", "Instructor Highlights</h2>", "Optional Ways to Go Deeper"),
        ("Optional Ways to Go Deeper", "Optional Ways to Go Deeper", "Reflection Questions</h2>"),
        ("Reflection Questions", "Reflection Questions</h2>", "Go Deeper: Recommended Reading</h2>"),
    ]
    for name, start, end in section_markers:
        s = html.find(start)
        e = html.find(end)
        if s < 0:
            failures.append(f"Section missing entirely: {name}")
            continue
        if e < 0:
            e = len(html)
        text = re.sub(r'<[^>]+>', '', html[s + len(start):e]).strip()
        if len(text) < 20:
            failures.append(f"Section empty: {name}")

    # ── 3. No raw markdown in rendered HTML ──
    # Check for ** (bold markers) that weren't converted — skip inside <style> or HTML attributes
    body_start = html.find('<body')
    body_text = re.sub(r'<[^>]+>', '', html[body_start:]) if body_start >= 0 else re.sub(r'<[^>]+>', '', html)
    raw_bold = re.findall(r'\*\*[^*]+\*\*', body_text)
    if raw_bold:
        failures.append(f"Raw markdown bold in email: {raw_bold[0][:60]}")

    raw_italic = re.findall(r'(?<!\*)\*(?!\*)[^*]+\*(?!\*)', body_text)
    # Filter out intentional asterisks (e.g., bullet points)
    real_italic = [m for m in raw_italic if not m.strip().startswith('*')]
    if real_italic:
        failures.append(f"Raw markdown italic in email: {real_italic[0][:60]}")

    raw_bullets = re.findall(r'^\s*[-*]\s+\S', body_text, re.MULTILINE)
    if raw_bullets:
        failures.append(f"Raw markdown bullet in email (should be &bull; or <li>)")

    raw_headers = re.findall(r'^#{1,3}\s+', body_text, re.MULTILINE)
    if raw_headers:
        failures.append(f"Raw markdown headers in email")

    # ── 4. Key Concepts: count matches recap ──
    recap_concepts = len(re.findall(r'^-\s*\*\*', recap_md, re.MULTILINE))
    html_concepts = html.count('color:#135740;">') - 2  # subtract header uses
    # More reliable: count concept <p> blocks between markers
    kc_s = html.find("Key Concepts</h2>")
    kc_e = html.find("Instructor Highlights</h2>")
    if kc_s >= 0 and kc_e > kc_s:
        kc_html = html[kc_s:kc_e]
        rendered_concepts = kc_html.count('<strong style="color:#135740;">')
        # Count concepts in recap's Key Concepts section
        in_kc = False
        recap_kc_count = 0
        for line in recap_md.splitlines():
            if line.startswith("## Key Concepts"):
                in_kc = True
                continue
            if line.startswith("## ") and in_kc:
                break
            if in_kc and re.match(r'-?\s*\*\*', line):
                recap_kc_count += 1
        if recap_kc_count > 0 and rendered_concepts < recap_kc_count:
            failures.append(f"Key Concepts: recap has {recap_kc_count}, email rendered {rendered_concepts}")

    # ── 5. Instructor Highlights: count matches recap ──
    in_hl = False
    recap_hl_count = 0
    for line in recap_md.splitlines():
        if line.startswith("## Instructor Highlights"):
            in_hl = True
            continue
        if line.startswith("## ") and in_hl:
            break
        if in_hl and re.match(r'-?\s*\*\*', line):
            recap_hl_count += 1
    hl_s = html.find("Instructor Highlights</h2>")
    hl_e = html.find("Optional Ways to Go Deeper")
    if hl_s >= 0 and hl_e > hl_s:
        hl_html = html[hl_s:hl_e]
        rendered_hl = hl_html.count('border-left:4px solid #fca602')
        if recap_hl_count > 0 and rendered_hl < recap_hl_count:
            failures.append(f"Instructor Highlights: recap has {recap_hl_count}, email rendered {rendered_hl}")

    # ── 6. Reflection Questions: at least 2 rendered ──
    rq_count = html.count('border-radius:50%')
    if rq_count < 2:
        failures.append(f"Reflection Questions: only {rq_count} rendered (need at least 2)")

    # ── 7. Articles section: URLs are valid ──
    article_urls = re.findall(r'href="(https://tandemcoach\.co/[^"]+)"', html)
    for url in article_urls:
        if 'utm_source' not in url:
            failures.append(f"Article link missing UTM params: {url[:80]}")

    # ── 8. No broken HTML: unclosed tags in content sections ──
    open_strongs = html.count('<strong')
    close_strongs = html.count('</strong>')
    if open_strongs != close_strongs:
        failures.append(f"Mismatched <strong> tags: {open_strongs} open, {close_strongs} close")

    open_ems = html.count('<em>')
    close_ems = html.count('</em>')
    if open_ems != close_ems:
        failures.append(f"Mismatched <em> tags: {open_ems} open, {close_ems} close")

    # ── 9. Session title is present and reasonable ──
    title_match = re.search(r'<h1[^>]*>(.+?)</h1>', html, re.DOTALL)
    if not title_match:
        failures.append("No <h1> session title found")
    elif len(title_match.group(1).strip()) < 10:
        failures.append(f"Session title too short: '{title_match.group(1).strip()}'")

    # ── 10. Free course section has content (if free-course.json had entries) ──
    fc_s = html.find("Free Course")
    if fc_s >= 0:
        fc_html = html[fc_s:]
        fc_units = fc_html.count('color:#fca602')
        if fc_units == 0:
            failures.append("Free Course section header present but no units rendered")

    return failures


def send_email(to_emails: list[str], subject: str, html_file: Path, extra_bcc: list[str] | None = None):
    """Send via toolbox email/send-email."""
    if not EMAIL_TOOL.exists():
        print(f"  ERROR: email tool not found: {EMAIL_TOOL}", file=sys.stderr)
        return False

    to_str = ",".join(to_emails)
    env = os.environ.copy()
    env["TOOLBOX_LIB"] = str(TOOLBOX_ROOT / "lib")
    env["TOOLBOX_PROJECT_ROOT"] = str(TOOLBOX_ROOT)
    env["TOOLBOX_JSON"] = "1"

    # Load email credentials from available env files
    for env_path in [Path("/tmp/.nanoclaw-env"), Path.home() / "dev/.env.shared"]:
        if env_path.exists():
            for line in env_path.read_text().splitlines():
                line = line.strip()
                if line.startswith("#") or "=" not in line:
                    continue
                key, val = line.split("=", 1)
                if key.startswith("EMAIL_") and key not in env:
                    env[key] = val.strip().strip("'\"")

    # Send TO info@ (visible), BCC all recipients (protects their emails)
    bcc_list = to_str
    if extra_bcc:
        bcc_list = f"{to_str},{','.join(extra_bcc)}" if to_str else ",".join(extra_bcc)
    cmd = [
        "bash", str(EMAIL_TOOL),
        "--to", BCC_ADDRESS,
        "--subject", subject,
        "--body-file", str(html_file),
        "--html",
        "--bcc", bcc_list,
        "--from", "Tandem Coaching <info@tandemcoach.co>",
    ]

    # Run from /tmp to prevent send-email.sh from sourcing NanoClaw's .env
    # (it contains unquoted values like ASSISTANT_NAME=Mr Gru that break bash source)
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=60, env=env, cwd="/tmp")
    if result.returncode == 0:
        return True
    print(f"  ERROR sending email: {result.stderr[:500]}", file=sys.stderr)
    return False


def main():
    p = argparse.ArgumentParser(description="Distribute session recap email to students")
    p.add_argument("enrichment_dir", nargs="?", default=None, help="Path to enrichment output dir (e.g., Tandem/Enrichment/2026-04-06)")
    p.add_argument("--summary", help="Path to meeting summary file (for attendee list)")
    p.add_argument("--dry-run", action="store_true", help="Render email but don't send")
    p.add_argument("--preview", action="store_true", help="Send preview only to info@tandemcoach.co")
    p.add_argument("--subject-override", help="Override email subject line")
    p.add_argument("--exclude", action="append", default=[], help="Exclude recipient by name (case-insensitive substring, repeatable)")
    p.add_argument("--enrich-dir", help="Path to enrichment output dir (alternative to positional)")
    args = p.parse_args()

    enrich_dir_str = args.enrichment_dir or args.enrich_dir
    if not enrich_dir_str:
        p.error("enrichment_dir or --enrich-dir is required")
    enrich_dir = Path(enrich_dir_str)

    if not enrich_dir.exists():
        print(f"ERROR: Enrichment dir not found: {enrich_dir}", file=sys.stderr)
        sys.exit(1)

    # Load enrichment files
    recap_file = enrich_dir / "recap.md"
    articles_file = enrich_dir / "articles.json"
    free_course_file = enrich_dir / "free-course.json"

    if not recap_file.exists():
        report = {
            "preview_sent": False,
            "final_sent": False,
            "recipient_count": 0,
            "rendered_email_path": "",
            "subject": "",
            "excluded": [],
            "error": "recap.md not found in enrichment dir"
        }
        print(json.dumps(report))
        print("ERROR: recap.md not found in enrichment dir", file=sys.stderr)
        return

    recap_md = recap_file.read_text()
    articles = json.loads(articles_file.read_text()) if articles_file.exists() else []
    free_course_raw = json.loads(free_course_file.read_text()) if free_course_file.exists() else []
    valid_ids = load_valid_lesson_ids()
    free_course = validate_free_course(free_course_raw, valid_ids)
    if len(free_course) < len(free_course_raw):
        print(f"  WARN: {len(free_course_raw) - len(free_course)} free-course entries rejected as hallucinated", file=sys.stderr)

    # Find summary for attendees
    summary_path = Path(args.summary) if args.summary else None
    if not summary_path:
        meta_file = enrich_dir / "meta.json"
        if meta_file.exists():
            meta = json.loads(meta_file.read_text())
            if meta.get("summary"):
                summary_path = Path(meta["summary"])

    if not summary_path or not summary_path.exists():
        report = {
            "preview_sent": False,
            "final_sent": False,
            "recipient_count": 0,
            "rendered_email_path": "",
            "subject": "",
            "excluded": [],
            "error": "No meeting summary found (needed for attendee list)"
        }
        print(json.dumps(report))
        print("ERROR: No meeting summary found", file=sys.stderr)
        return

    # Parse attendees from summary frontmatter
    attendee_names = []
    for line in summary_path.read_text().splitlines():
        if line.startswith("attendees:"):
            raw = line.split(":", 1)[1].strip().strip("[]")
            attendee_names = [n.strip() for n in raw.split(",")]
            break

    # Resolve instructor
    instructor = resolve_instructor(attendee_names)
    if instructor:
        print(f"  Instructor: {instructor['name']}, {instructor.get('display_credential', '')}", file=sys.stderr)
        # Auto-skip instructor from student recipient list
        inst_name = instructor["name"].lower()
        if inst_name not in SKIP_NAMES:
            SKIP_NAMES.add(inst_name)

    # Match attendees to Heartbeat emails
    print(f"  Matching {len(attendee_names)} attendees to Heartbeat...", file=sys.stderr)
    hb_users = get_heartbeat_users()
    recipients = match_attendees(attendee_names, hb_users, skip_names=SKIP_NAMES)
    print(f"  Matched {len(recipients)} students:", file=sys.stderr)
    for r in recipients:
        print(f"    {r['name']} <{r['email']}>", file=sys.stderr)

    # Resolve instructor email for BCC
    instructor_email = None
    if instructor and instructor.get("email"):
        instructor_email = instructor["email"]
    elif instructor:
        # Try matching instructor name in Heartbeat
        inst_matches = match_attendees([instructor["name"]], hb_users, skip_names=set())
        if inst_matches:
            instructor_email = inst_matches[0]["email"]
    if instructor_email:
        print(f"  Instructor BCC: {instructor_email}", file=sys.stderr)

    # Apply exclusions
    excluded_names = []
    if args.exclude:
        filtered = []
        for r in recipients:
            if any(ex.lower() in r["name"].lower() for ex in args.exclude):
                excluded_names.append(r["name"])
            else:
                filtered.append(r)
        recipients = filtered
        if excluded_names:
            print(f"  Excluded: {', '.join(excluded_names)}", file=sys.stderr)

    # Load and render template
    if not TEMPLATE_FILE.exists():
        print(f"ERROR: Email template not found: {TEMPLATE_FILE}", file=sys.stderr)
        sys.exit(1)

    template = TEMPLATE_FILE.read_text()
    html = render_email(template, recap_md, articles, free_course, instructor)

    # ── Pre-send validation ──────────────────────────────────────────
    # One retry: re-read recap and re-render if first pass fails
    failures = validate_email(html, recap_md)
    if failures:
        print(f"  WARN: {len(failures)} validation failure(s), re-reading recap and re-rendering", file=sys.stderr)
        recap_md = recap_file.read_text()
        html = render_email(template, recap_md, articles, free_course, instructor)
        failures = validate_email(html, recap_md)

    if failures:
        for f in failures:
            print(f"  FAIL: {f}", file=sys.stderr)
        report = {
            "preview_sent": False,
            "final_sent": False,
            "recipient_count": 0,
            "rendered_email_path": "",
            "subject": "",
            "excluded": [],
            "error": f"{len(failures)} email validation failure(s): {'; '.join(failures)}"
        }
        print(json.dumps(report))
        return

    # Write rendered email
    rendered_file = enrich_dir / "email.html"
    rendered_file.write_text(html)
    print(f"  Rendered: {rendered_file}", file=sys.stderr)

    # Extract subject from recap
    subject = "Session Recap"
    for line in recap_md.splitlines():
        if line.startswith("# "):
            subject = line[2:].strip()
            break

    if args.subject_override:
        subject = args.subject_override

    # Handle zero recipients
    if not recipients:
        report = {
            "preview_sent": False,
            "final_sent": False,
            "recipient_count": 0,
            "rendered_email_path": str(rendered_file),
            "subject": subject,
            "excluded": excluded_names
        }
        print("  WARN: No recipients after matching + exclusions", file=sys.stderr)
        print(json.dumps(report))
        return

    if args.preview:
        # Preview mode: send only to info@tandemcoach.co
        preview_subject = f"[PREVIEW] {subject}"
        if not args.dry_run:
            ok = send_email([BCC_ADDRESS], preview_subject, rendered_file)
        else:
            ok = True
            print(f"  [DRY-RUN] Would send preview to {BCC_ADDRESS}", file=sys.stderr)
        report = {
            "preview_sent": ok if not args.dry_run else False,
            "final_sent": False,
            "recipient_count": len(recipients),
            "rendered_email_path": str(rendered_file),
            "subject": subject,
            "excluded": excluded_names
        }
        print(json.dumps(report))
        return

    if args.dry_run:
        print(f"  [DRY-RUN] Would send to {len(recipients)} students, BCC {BCC_ADDRESS}", file=sys.stderr)
        print(f"  Subject: {subject}", file=sys.stderr)
        report = {
            "preview_sent": False,
            "final_sent": False,
            "recipient_count": len(recipients),
            "rendered_email_path": str(rendered_file),
            "subject": subject,
            "excluded": excluded_names
        }
        print(json.dumps(report))
        return

    # Final send
    to_emails = [r["email"] for r in recipients]
    extra_bcc = [instructor_email] if instructor_email else []
    bcc_desc = f", instructor: {instructor_email}" if instructor_email else ""
    print(f"  Sending to {len(to_emails)} students (BCC: {BCC_ADDRESS}{bcc_desc})...", file=sys.stderr)
    ok = send_email(to_emails, subject, rendered_file, extra_bcc=extra_bcc)

    report = {
        "preview_sent": False,
        "final_sent": ok,
        "recipient_count": len(to_emails),
        "rendered_email_path": str(rendered_file),
        "subject": subject,
        "excluded": excluded_names
    }
    print(json.dumps(report))


if __name__ == "__main__":
    main()

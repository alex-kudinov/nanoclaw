#!/usr/bin/env python3
"""
refresh-schedule.py — regenerate the sales/inbox/booking SCHEDULE.md from the
authoritative program calendars.

Source of truth: the WordPress endpoint `GET {WP_SITE_URL}/wp-json/tandem/v1/
calendar-debug?program=X` (header `X-Tandem-Key: $TANDEM_API_KEY`), which is the
SAME parser (class-program-calendar.php) that renders the public program pages.
We consume its already-computed structures instead of re-deriving cohort logic:

  - sequential (ACC): modules["1"].future_cohorts  — Module-1 starts only, since
    a new ACC student MUST begin at Module 1.
  - flexible (PCC/ACTC): upcoming_modules          — every module is an entry
    point; students may join at any module.
  - cohort (mentor/mcs-practicum/supervision): cohorts — single group, no
    modules; a student joins the next cohort of the weekday/time slot they pick.

Every cohort is emitted under its own timezone track — US & Europe (start hour
< 14:00 ET) vs US & Asia-Pacific (>= 14:00 ET) — with the date and time kept
together, so a date can never be blended with the other track's time (the Marius
Braun failure, 2026-04-27). Orientation events are already split out server-side.

Creds come from ~/dev/tandemweb/.env (TANDEM_API_KEY, WP_SITE_URL). Writes
knowledge/shared/SCHEDULE.md then copies to knowledge/agents/{sales,inbox,booking}/.
Fail-closed: if any program fetch fails, nothing is written (a partial file that
silently drops a program is worse than a slightly stale one).

CLI:  python tools/refresh-schedule.py [--dry-run]
Exit: 0 = wrote (or dry-run ok), 1 = failure (no write)
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
import tempfile
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
SHARED_MD = PROJECT_ROOT / "knowledge" / "shared" / "SCHEDULE.md"
AGENTS = ["sales", "inbox", "booking"]
TANDEMWEB_ENV = Path(os.path.expanduser("~/dev/tandemweb/.env"))

# key, type, full name, program page, free-intro invite (None if no free module)
PROGRAMS = [
    ("acc", "sequential", "ACC — Associate Certified Coach (ICF Level 1)",
     "https://tandemcoach.co/icf/acc-coach-certification-training/",
     "https://community.tandemcoaching.academy/invitation?code=8JB28E"),
    ("pcc", "flexible", "PCC — Professional Certified Coach (ICF Level 2)",
     "https://tandemcoach.co/icf/pcc-professional-coach-certification/",
     "https://community.tandemcoaching.academy/invitation?code=G48B8E"),
    ("actc", "flexible", "ACTC — Advanced Certified Team Coach",
     "https://tandemcoach.co/icf/actc-team-coaching-training/",
     "https://community.tandemcoaching.academy/invitation?code=G48B8E"),
    ("mentor", "cohort", "ICF Mentor Coaching (Standalone)",
     "https://tandemcoach.co/icf/mentor-coaching-acc-pcc-mcc/", None),
    ("mcs-practicum", "cohort",
     "MCS — Mentor Coach Training (Standard Path Practicum)",
     "https://tandemcoach.co/mcs/advanced-accreditation-mentor-coaching/", None),
    ("supervision", "cohort",
     "Coaching Supervision Mastery (Supervisor Training)",
     "https://tandemcoach.co/coaching-supervisor-training/", None),
]


def log(msg: str) -> None:
    print(msg, file=sys.stderr)


def load_creds() -> tuple[str, str]:
    """Return (wp_site_url, api_key) from tandemweb/.env."""
    if not TANDEMWEB_ENV.exists():
        raise SystemExit(f"ERROR: {TANDEMWEB_ENV} not found — cannot reach calendar API")
    vals: dict[str, str] = {}
    for line in TANDEMWEB_ENV.read_text().splitlines():
        if line.startswith(("TANDEM_API_KEY=", "WP_SITE_URL=")):
            k, _, v = line.partition("=")
            vals[k] = v.strip().strip('"').strip("'")
    wp, key = vals.get("WP_SITE_URL", ""), vals.get("TANDEM_API_KEY", "")
    if not wp or not key:
        raise SystemExit("ERROR: TANDEM_API_KEY / WP_SITE_URL missing from tandemweb/.env")
    return wp.rstrip("/"), key


def fetch_debug(wp: str, key: str, program: str) -> dict:
    """Fetch the calendar-debug payload for one program."""
    url = f"{wp}/wp-json/tandem/v1/calendar-debug?program={urllib.parse.quote(program)}"
    # A real User-Agent is required — Cloudflare's WAF 403s the default
    # Python-urllib UA (curl works because of its own UA).
    req = urllib.request.Request(url, headers={
        "X-Tandem-Key": key,
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                      "AppleWebKit/537.36 (KHTML, like Gecko) "
                      "Chrome/126.0 Safari/537.36",
    })
    with urllib.request.urlopen(req, timeout=20) as resp:
        payload = json.loads(resp.read().decode())
    if not payload.get("success") or "debug" not in payload:
        raise ValueError(f"{program}: unexpected payload {str(payload)[:120]}")
    return payload["debug"]


# ── rendering helpers ──────────────────────────────────────────────────────

def _track(dt: datetime) -> str:
    """US & Europe (morning ET) vs US & Asia-Pacific (evening ET) by hour < 14."""
    return "US & Europe" if dt.hour < 14 else "US & Asia-Pacific"


def _parse(iso: str) -> datetime:
    return datetime.fromisoformat(iso)


def _fmt_date(dt: datetime) -> str:
    return dt.strftime("%B %-d, %Y")


def _fmt_time(dt: datetime) -> str:
    return dt.strftime("%-I:%M %p") + " ET"


def _future(cohorts: list[dict], key: str, today) -> list[tuple[datetime, dict]]:
    out = []
    for c in cohorts:
        iso = c.get(key)
        if not iso:
            continue
        dt = _parse(iso)
        if dt.date() >= today:
            out.append((dt, c))
    out.sort(key=lambda x: x[0])
    return out


def _track_lines(items: list[tuple[datetime, str]]) -> list[str]:
    """Group (dt, suffix) rows into the two track buckets, each a bullet line."""
    lines: list[str] = []
    for label in ("US & Europe", "US & Asia-Pacific"):
        rows = [(dt, sfx) for dt, sfx in items if _track(dt) == label]
        if not rows:
            continue
        parts = [f"{_fmt_date(dt)} ({_fmt_time(dt)}){sfx}" for dt, sfx in rows]
        lines.append(f"  - **{label}:** " + " · ".join(parts))
    return lines


def render_program(meta: tuple, debug: dict, today) -> list[str]:
    key, ptype, name, page, free = meta
    out = [f"## {name}"]
    if ptype == "sequential":
        out.append("_Sequential — a new student must start at **Module 1**. "
                    "Only these Module-1 dates are entry points._")
        fc = debug.get("modules", {}).get("1", {}).get("future_cohorts", [])
        items = [(dt, "") for dt, _ in _future(fc, "start", today)]
        body = _track_lines(items)
    elif ptype == "flexible":
        out.append("_Flexible — modules are independent; a student may join at "
                    "the start of **any** module._")
        um = _future(debug.get("upcoming_modules", []), "start_date", today)
        items = [(dt, f" — Module {c.get('module')}") for dt, c in um]
        body = _track_lines(items)
    else:  # cohort
        out.append("_Single cohort (no modules) — join the next cohort of the "
                    "weekday/time slot that fits._")
        co = _future(debug.get("cohorts", []), "start", today)
        items = [(dt, f" — {dt.strftime('%A')}s, {c.get('lessons','?')} weekly sessions")
                 for dt, c in co]
        body = _track_lines(items)
    out.append("- **Upcoming cohort start dates** (weekly, 2 hours per session):"
               if body else "- No upcoming dates in the calendar — check the program page.")
    out.extend(body)
    out.append(f"- **Program page:** {page}")
    if free:
        out.append(f"- **Free intro module:** {free}")
    out.append("")
    return out


def build_markdown(debugs: dict[str, dict], generated: datetime, today) -> str:
    lines = [
        "# Tandem Coaching — Upcoming Cohort Schedule",
        f"_Auto-generated from the program calendars every day. Last updated: "
        f"{generated.strftime('%A %B %-d, %Y')} CT. DO NOT hand-edit — the "
        f"`schedule-refresh` job overwrites this file._",
        "",
        "**Quoting rules (read before citing any date):** every program runs two "
        "timezone tracks — **US & Europe** (morning ET) and **US & Asia-Pacific** "
        "(evening ET). Each cohort belongs to ONE track. NEVER pair a date from one "
        "track with the time of the other (Marius Braun, 2026-04-27). Match the "
        "lead's timezone, then quote the soonest start **on that track**, with its "
        "time and \"weekly, 2 hours per session.\"",
        "",
    ]
    for meta in PROGRAMS:
        key = meta[0]
        if key in debugs:
            lines.extend(render_program(meta, debugs[key], today))
    lines.append("## Professional Coach Program — ACC + PCC + ACTC (ICF Level 2)")
    lines.append("_Combined Level 2 track: Phase 1 is the ACC cohort (sequential, "
                 "start at Module 1), then PCC + ACTC modules run flexibly. Quote "
                 "the ACC start for the lead's track (above), then PCC/ACTC._")
    lines.append("- **Program page:** https://tandemcoach.co/icf/acc-pcc-certification/")
    lines.append("- **Free intro module:** https://community.tandemcoaching.academy/invitation?code=79F646")
    lines.append("")
    return "\n".join(lines)


def write_all(md: str) -> None:
    SHARED_MD.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=str(SHARED_MD.parent), suffix=".tmp")
    with os.fdopen(fd, "w") as f:
        f.write(md)
    os.replace(tmp, str(SHARED_MD))
    os.chmod(str(SHARED_MD), 0o600)
    log(f"  wrote {SHARED_MD}")
    for agent in AGENTS:
        d = SHARED_MD.parent.parent / "agents" / agent
        if d.exists():
            dest = d / "SCHEDULE.md"
            shutil.copy2(str(SHARED_MD), str(dest))
            os.chmod(str(dest), 0o600)
            log(f"  copied to agents/{agent}/")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="print, do not write")
    args = ap.parse_args()

    wp, key = load_creds()
    now = datetime.now(timezone.utc).astimezone()
    today = now.date()

    debugs: dict[str, dict] = {}
    for meta in PROGRAMS:
        prog = meta[0]
        try:
            debugs[prog] = fetch_debug(wp, key, prog)
        except Exception as exc:  # noqa: BLE001
            log(f"ERROR fetching {prog}: {exc}")
    if len(debugs) != len(PROGRAMS):
        log(f"FAIL: only {len(debugs)}/{len(PROGRAMS)} programs fetched — not writing")
        return 1

    md = build_markdown(debugs, now, today)
    if args.dry_run:
        print(md)
        return 0
    write_all(md)
    log("OK schedule refreshed")
    return 0


if __name__ == "__main__":
    sys.exit(main())

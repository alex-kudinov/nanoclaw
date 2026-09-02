#!/usr/bin/env python3
"""Pin canonical domain fact exports and inject them into every minion KB."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = Path(
    os.environ.get(
        "PRACTITIONER_FACTS_EXPORT_DIR",
        Path.home() / "dev" / "practitioner-series" / "program-facts" / "exports",
    )
)
LOCAL_DIR = ROOT / "facts" / "catalogs"
LOCAL_WEB = LOCAL_DIR / "practitioner-series.web.json"
LOCAL_PACK = LOCAL_DIR / "practitioner-series.minion.md"
BEGIN = "<!-- BEGIN CANONICAL PROGRAM FACTS: practitioner-series -->"
END = "<!-- END CANONICAL PROGRAM FACTS: practitioner-series -->"
MCS_CATALOG = LOCAL_DIR / "mcs-foundations-locales.json"
MCS_PACK = LOCAL_DIR / "mcs-foundations-locales.minion.md"
MCS_BEGIN = "<!-- BEGIN CANONICAL PROGRAM FACTS: mcs-foundations-locales -->"
MCS_END = "<!-- END CANONICAL PROGRAM FACTS: mcs-foundations-locales -->"
AACS_CATALOG = LOCAL_DIR / "coaching-supervision-mastery.json"
AACS_PACK = LOCAL_DIR / "coaching-supervision-mastery.minion.md"
AACS_BEGIN = "<!-- BEGIN CANONICAL PROGRAM FACTS: coaching-supervision-mastery -->"
AACS_END = "<!-- END CANONICAL PROGRAM FACTS: coaching-supervision-mastery -->"


def expected_block(pack: str) -> str:
    return f"{BEGIN}\n{pack.strip()}\n{END}"


def expected_mcs_block(pack: str) -> str:
    return f"{MCS_BEGIN}\n{pack.strip()}\n{MCS_END}"


def expected_aacs_block(pack: str) -> str:
    return f"{AACS_BEGIN}\n{pack.strip()}\n{AACS_END}"


def repair_legacy_practitioner_copy(text: str) -> str:
    text = text.replace(
        "For the **3 approved** courses the certificate carries the **ICF CCE-Approved Program badge** and shows the accredited hour count now. For courses still in review the CC/RD split displays once accreditation lands, and the certificate is reissued with the badge.",
        "For all **6 approved** CCE courses, the certificate carries the **ICF CCE-Approved Program badge** and the approved hour count. Setting Up Your Coaching Practice carries no CCE claim.",
    )
    return text.replace(
        "(incl. 3 mandatory ethics hours)",
        "(3 ethics-instruction hours documented inside Core; not separately ICF-designated)",
    )


def inject(text: str, pack: str) -> str:
    block = expected_block(pack)
    marker_pattern = re.compile(rf"{re.escape(BEGIN)}.*?{re.escape(END)}", re.DOTALL)
    if marker_pattern.search(text):
        result = marker_pattern.sub(block, text, count=1)
    else:
        heading = re.search(r"^## Practitioner Series\b", text, re.MULTILINE)
        if heading:
            result = text[: heading.start()] + block + "\n\n" + text[heading.start() :]
        else:
            result = text.rstrip() + "\n\n" + block + "\n"
    return repair_legacy_practitioner_copy(result)


def inject_mcs_locales(text: str, pack: str) -> str:
    block = expected_mcs_block(pack)
    marker_pattern = re.compile(
        rf"{re.escape(MCS_BEGIN)}.*?{re.escape(MCS_END)}", re.DOTALL
    )
    if marker_pattern.search(text):
        return marker_pattern.sub(block, text, count=1)
    heading = re.search(r"^## Other Services\b", text, re.MULTILINE)
    if heading:
        return text[: heading.start()] + block + "\n\n" + text[heading.start() :]
    return text.rstrip() + "\n\n" + block + "\n"


def remove_legacy_aacs_section(text: str) -> str:
    """Remove the superseded hand-written CSS section before canonical injection."""
    heading = re.search(
        r'^## Coaching Supervisor Specialization \(CSS\) & "Coaching Supervision Mastery"\s*$',
        text,
        re.MULTILINE,
    )
    if not heading:
        return text
    remainder = text[heading.end() :]
    next_boundaries = [
        match.start()
        for pattern in (r"^## (?!#)", r"^<!-- BEGIN CANONICAL PROGRAM FACTS:")
        for match in [re.search(pattern, remainder, re.MULTILINE)]
        if match
    ]
    end = heading.end() + min(next_boundaries) if next_boundaries else len(text)
    return (text[: heading.start()].rstrip() + "\n\n" + text[end:].lstrip()).rstrip() + "\n"


def inject_aacs(text: str, pack: str) -> str:
    text = remove_legacy_aacs_section(text)
    block = expected_aacs_block(pack)
    marker_pattern = re.compile(
        rf"{re.escape(AACS_BEGIN)}.*?{re.escape(AACS_END)}", re.DOTALL
    )
    if marker_pattern.search(text):
        return marker_pattern.sub(block, text, count=1)
    heading = re.search(r"^## Other Services\b", text, re.MULTILINE)
    if heading:
        return text[: heading.start()] + block + "\n\n" + text[heading.start() :]
    return text.rstrip() + "\n\n" + block + "\n"


def knowledge_paths(target_root: Path = ROOT) -> list[Path]:
    paths = [target_root / "knowledge" / "shared" / "KNOWLEDGE.md"]
    paths.extend(
        sorted((target_root / "knowledge" / "agents").glob("*/KNOWLEDGE.md"))
    )
    return paths


def validate_exports(web_path: Path, pack_path: Path) -> list[str]:
    errors: list[str] = []
    if not web_path.exists():
        errors.append(f"missing web export: {web_path}")
        return errors
    if not pack_path.exists():
        errors.append(f"missing minion export: {pack_path}")
        return errors
    web = json.loads(web_path.read_text(encoding="utf-8"))
    digest = web.get("catalog_sha256", "")
    pack = pack_path.read_text(encoding="utf-8")
    marker = re.search(
        r"program-facts: practitioner-series revision=(\d+) sha256=([a-f0-9]{64})",
        pack,
    )
    if not marker:
        errors.append("minion export lacks catalog revision/hash marker")
    else:
        if marker.group(2) != digest:
            errors.append("web and minion exports have different catalog hashes")
        if int(marker.group(1)) != web.get("catalog_revision"):
            errors.append("web and minion exports have different catalog revisions")
    return errors


def validate_mcs_locales(catalog_path: Path, pack_path: Path) -> list[str]:
    errors: list[str] = []
    if not catalog_path.exists():
        return [f"missing MCS locales catalog: {catalog_path}"]
    if not pack_path.exists():
        return [f"missing MCS locales minion pack: {pack_path}"]
    catalog_bytes = catalog_path.read_bytes()
    try:
        catalog = json.loads(catalog_bytes)
    except (json.JSONDecodeError, UnicodeDecodeError):
        return ["MCS locales catalog is not valid UTF-8 JSON"]
    if not isinstance(catalog, dict):
        return ["MCS locales catalog root must be an object"]
    if catalog.get("catalog_id") != "mcs-foundations-locales":
        errors.append("MCS locales catalog has an invalid catalog_id")
    revision = catalog.get("catalog_revision")
    if not isinstance(revision, int) or revision < 1:
        errors.append("MCS locales catalog has an invalid revision")
    digest = hashlib.sha256(catalog_bytes).hexdigest()
    pack = pack_path.read_text(encoding="utf-8")
    marker = re.search(
        r"program-facts: mcs-foundations-locales revision=(\d+) sha256=([a-f0-9]{64})",
        pack,
    )
    if not marker:
        errors.append("MCS locales minion pack lacks catalog revision/hash marker")
    elif int(marker.group(1)) != revision or marker.group(2) != digest:
        errors.append("MCS locales catalog and minion pack revision/hash do not agree")
    locales = catalog.get("locales")
    if not isinstance(locales, list) or any(
        not isinstance(entry, dict) for entry in locales
    ):
        errors.append("MCS locales catalog has an invalid locales collection")
        languages = []
    else:
        languages = [entry.get("language") for entry in locales]
    if languages != ["English", "French", "Japanese", "Spanish"]:
        errors.append("MCS locales catalog does not contain the exact verified language set")
    return errors


def validate_aacs(catalog_path: Path, pack_path: Path) -> list[str]:
    errors: list[str] = []
    if not catalog_path.exists():
        return [f"missing Coaching Supervision Mastery catalog: {catalog_path}"]
    if not pack_path.exists():
        return [f"missing Coaching Supervision Mastery minion pack: {pack_path}"]
    catalog_bytes = catalog_path.read_bytes()
    try:
        catalog = json.loads(catalog_bytes)
    except (json.JSONDecodeError, UnicodeDecodeError):
        return ["Coaching Supervision Mastery catalog is not valid UTF-8 JSON"]
    if not isinstance(catalog, dict):
        return ["Coaching Supervision Mastery catalog root must be an object"]
    if catalog.get("catalog_id") != "coaching-supervision-mastery":
        errors.append("Coaching Supervision Mastery catalog has an invalid catalog_id")
    revision = catalog.get("catalog_revision")
    if not isinstance(revision, int) or revision < 1:
        errors.append("Coaching Supervision Mastery catalog has an invalid revision")
    program = catalog.get("program")
    if not isinstance(program, dict) or program.get("status") != "live_enrolling":
        errors.append("Coaching Supervision Mastery catalog is not live_enrolling")
    accreditation = catalog.get("accreditation")
    if (
        not isinstance(accreditation, dict)
        or accreditation.get("program_level")
        != "ICF Advanced Accreditation in Coaching Supervision (AACS)"
    ):
        errors.append("Coaching Supervision Mastery catalog lacks exact AACS authority")
    expectations = catalog.get("checkout_expectations")
    expected_products = [
        ("supervision-inaugural", 399600, True),
        ("supervision-regular", 479600, False),
    ]
    actual_products = (
        [
            (item.get("product"), item.get("price_cents"), item.get("active"))
            for item in expectations
        ]
        if isinstance(expectations, list)
        and all(isinstance(item, dict) for item in expectations)
        else []
    )
    if actual_products != expected_products:
        errors.append("Coaching Supervision Mastery checkout expectations are invalid")
    stale_claims = catalog.get("stale_claims")
    if not isinstance(stale_claims, list) or len(stale_claims) < 4 or any(
        not isinstance(claim, str) or not claim for claim in stale_claims
    ):
        errors.append("Coaching Supervision Mastery stale-claim set is invalid")
    digest = hashlib.sha256(catalog_bytes).hexdigest()
    pack = pack_path.read_text(encoding="utf-8")
    marker = re.search(
        r"program-facts: coaching-supervision-mastery revision=(\d+) sha256=([a-f0-9]{64})",
        pack,
    )
    if not marker:
        errors.append("Coaching Supervision Mastery minion pack lacks catalog revision/hash marker")
    elif int(marker.group(1)) != revision or marker.group(2) != digest:
        errors.append("Coaching Supervision Mastery catalog and minion pack revision/hash do not agree")
    return errors


def inject_local(target_root: Path = ROOT) -> list[str]:
    errors = validate_exports(LOCAL_WEB, LOCAL_PACK)
    errors.extend(validate_mcs_locales(MCS_CATALOG, MCS_PACK))
    errors.extend(validate_aacs(AACS_CATALOG, AACS_PACK))
    if errors:
        return errors
    pack = LOCAL_PACK.read_text(encoding="utf-8")
    mcs_pack = MCS_PACK.read_text(encoding="utf-8")
    aacs_pack = AACS_PACK.read_text(encoding="utf-8")
    for target in knowledge_paths(target_root):
        text = inject(target.read_text(encoding="utf-8"), pack)
        text = inject_mcs_locales(text, mcs_pack)
        target.write_text(inject_aacs(text, aacs_pack), encoding="utf-8")
    return []


def sync(source: Path, target_root: Path = ROOT) -> list[str]:
    source_web = source / "practitioner-series.web.json"
    source_pack = source / "practitioner-series.minion.md"
    errors = validate_exports(source_web, source_pack)
    if errors:
        return errors
    LOCAL_DIR.mkdir(parents=True, exist_ok=True)
    LOCAL_WEB.write_bytes(source_web.read_bytes())
    LOCAL_PACK.write_bytes(source_pack.read_bytes())
    return inject_local(target_root)


def check(source: Path | None = None, target_root: Path = ROOT) -> list[str]:
    errors = validate_exports(LOCAL_WEB, LOCAL_PACK)
    errors.extend(validate_mcs_locales(MCS_CATALOG, MCS_PACK))
    errors.extend(validate_aacs(AACS_CATALOG, AACS_PACK))
    if errors:
        return errors
    if source and source.exists():
        for name, local in (
            ("practitioner-series.web.json", LOCAL_WEB),
            ("practitioner-series.minion.md", LOCAL_PACK),
        ):
            upstream = source / name
            if not upstream.exists() or upstream.read_bytes() != local.read_bytes():
                errors.append(f"local snapshot differs from authority export: {name}")
    web = json.loads(LOCAL_WEB.read_text(encoding="utf-8"))
    superseded_claims = [
        item["claim"]
        for program in web.get("programs", [])
        for item in program.get("superseded_claims", [])
        if isinstance(item.get("claim"), str)
    ]
    pack = LOCAL_PACK.read_text(encoding="utf-8")
    block = expected_block(pack)
    mcs_pack = MCS_PACK.read_text(encoding="utf-8")
    mcs_block = expected_mcs_block(mcs_pack)
    aacs_pack = AACS_PACK.read_text(encoding="utf-8")
    aacs_block = expected_aacs_block(aacs_pack)
    aacs_catalog = json.loads(AACS_CATALOG.read_text(encoding="utf-8"))
    aacs_stale_claims = aacs_catalog.get("stale_claims", [])
    for target in knowledge_paths(target_root):
        text = target.read_text(encoding="utf-8")
        if block not in text:
            errors.append(
                f"missing/stale canonical block: {target.relative_to(target_root)}"
            )
        if re.search(r"For the \*\*3 approved\*\* courses|courses still in review", text):
            errors.append(
                f"legacy Practitioner approval prose remains: {target.relative_to(target_root)}"
            )
        stale_count = sum(claim in text for claim in superseded_claims)
        if stale_count:
            errors.append(
                f"{stale_count} superseded Practitioner claim(s) remain: {target.relative_to(target_root)}"
            )
        if mcs_block not in text:
            errors.append(
                f"missing/stale MCS locales block: {target.relative_to(target_root)}"
            )
        if aacs_block not in text:
            errors.append(
                f"missing/stale Coaching Supervision Mastery block: {target.relative_to(target_root)}"
            )
        stale_aacs_count = sum(claim in text for claim in aacs_stale_claims)
        if stale_aacs_count:
            errors.append(
                f"{stale_aacs_count} stale Coaching Supervision Mastery claim(s) remain: {target.relative_to(target_root)}"
            )
    return errors


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=("sync", "inject", "check"))
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--target-root", type=Path, default=ROOT)
    args = parser.parse_args()
    target_root = args.target_root.resolve()
    if args.command == "sync":
        errors = sync(args.source, target_root)
    elif args.command == "inject":
        errors = inject_local(target_root)
    else:
        errors = check(args.source, target_root)
    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        return 1
    print(
        "VALID: Practitioner, MCS locale, and Coaching Supervision Mastery facts "
        f"pinned and present in {len(knowledge_paths(target_root))} knowledge files"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

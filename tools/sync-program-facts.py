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


def expected_block(pack: str) -> str:
    return f"{BEGIN}\n{pack.strip()}\n{END}"


def expected_mcs_block(pack: str) -> str:
    return f"{MCS_BEGIN}\n{pack.strip()}\n{MCS_END}"


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


def knowledge_paths() -> list[Path]:
    paths = [ROOT / "knowledge" / "shared" / "KNOWLEDGE.md"]
    paths.extend(sorted((ROOT / "knowledge" / "agents").glob("*/KNOWLEDGE.md")))
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


def inject_local() -> list[str]:
    errors = validate_exports(LOCAL_WEB, LOCAL_PACK)
    errors.extend(validate_mcs_locales(MCS_CATALOG, MCS_PACK))
    if errors:
        return errors
    pack = LOCAL_PACK.read_text(encoding="utf-8")
    mcs_pack = MCS_PACK.read_text(encoding="utf-8")
    for target in knowledge_paths():
        text = inject(target.read_text(encoding="utf-8"), pack)
        target.write_text(inject_mcs_locales(text, mcs_pack), encoding="utf-8")
    return []


def sync(source: Path) -> list[str]:
    source_web = source / "practitioner-series.web.json"
    source_pack = source / "practitioner-series.minion.md"
    errors = validate_exports(source_web, source_pack)
    if errors:
        return errors
    LOCAL_DIR.mkdir(parents=True, exist_ok=True)
    LOCAL_WEB.write_bytes(source_web.read_bytes())
    LOCAL_PACK.write_bytes(source_pack.read_bytes())
    return inject_local()


def check(source: Path | None = None) -> list[str]:
    errors = validate_exports(LOCAL_WEB, LOCAL_PACK)
    errors.extend(validate_mcs_locales(MCS_CATALOG, MCS_PACK))
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
    for target in knowledge_paths():
        text = target.read_text(encoding="utf-8")
        if block not in text:
            errors.append(f"missing/stale canonical block: {target.relative_to(ROOT)}")
        if re.search(r"For the \*\*3 approved\*\* courses|courses still in review", text):
            errors.append(
                f"legacy Practitioner approval prose remains: {target.relative_to(ROOT)}"
            )
        stale_count = sum(claim in text for claim in superseded_claims)
        if stale_count:
            errors.append(
                f"{stale_count} superseded Practitioner claim(s) remain: {target.relative_to(ROOT)}"
            )
        if mcs_block not in text:
            errors.append(
                f"missing/stale MCS locales block: {target.relative_to(ROOT)}"
            )
    return errors


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=("sync", "inject", "check"))
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    args = parser.parse_args()
    if args.command == "sync":
        errors = sync(args.source)
    elif args.command == "inject":
        errors = inject_local()
    else:
        errors = check(args.source)
    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        return 1
    print(
        f"VALID: Practitioner and MCS locale facts pinned and present in {len(knowledge_paths())} knowledge files"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

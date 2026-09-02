import importlib.util
import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "sync-program-facts.py"
SPEC = importlib.util.spec_from_file_location("sync_program_facts", SCRIPT)
sync_program_facts = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
sys.modules[SPEC.name] = sync_program_facts
SPEC.loader.exec_module(sync_program_facts)


class SyncProgramFactsTests(unittest.TestCase):
    def test_inject_is_idempotent_and_repairs_known_legacy_copy(self):
        source = """# KB

## Practitioner Series (self-paced CCE specialization courses)

For the **3 approved** courses the certificate carries the **ICF CCE-Approved Program badge** and shows the accredited hour count now. For courses still in review the CC/RD split displays once accreditation lands, and the certificate is reissued with the badge.
"""
        pack = "## Canonical Practitioner Series Facts\n\nCurrent truth."
        once = sync_program_facts.inject(source, pack)
        twice = sync_program_facts.inject(once, pack)
        self.assertEqual(once, twice)
        self.assertIn("For all **6 approved** CCE courses", once)
        self.assertNotIn("courses still in review", once)

    def test_inject_replaces_an_existing_block(self):
        old = f"# KB\n\n{sync_program_facts.BEGIN}\nold\n{sync_program_facts.END}\n"
        result = sync_program_facts.inject(old, "new")
        self.assertIn("\nnew\n", result)
        self.assertNotIn("\nold\n", result)

    def test_mcs_locale_inject_is_idempotent_and_replaces_existing_block(self):
        source = "# KB\n\n## Other Services\n\nExisting services.\n"
        pack = "## Canonical Mentor Coaching Foundations Language Availability\n\nCurrent truth."
        once = sync_program_facts.inject_mcs_locales(source, pack)
        twice = sync_program_facts.inject_mcs_locales(once, pack)
        self.assertEqual(once, twice)
        self.assertLess(once.index(sync_program_facts.MCS_BEGIN), once.index("## Other Services"))
        old = (
            f"# KB\n\n{sync_program_facts.MCS_BEGIN}\nold\n"
            f"{sync_program_facts.MCS_END}\n"
        )
        replaced = sync_program_facts.inject_mcs_locales(old, pack)
        self.assertIn("\nCurrent truth.\n", replaced)
        self.assertNotIn("\nold\n", replaced)

    def test_mcs_locale_catalog_and_pack_are_exactly_hash_bound(self):
        catalog = {
            "schema_version": "1.0",
            "catalog_id": "mcs-foundations-locales",
            "catalog_revision": 1,
            "locales": [
                {"language": "English"},
                {"language": "French"},
                {"language": "Japanese"},
                {"language": "Spanish"},
            ],
        }
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            catalog_path = root / "catalog.json"
            pack_path = root / "pack.md"
            catalog_path.write_text(json.dumps(catalog), encoding="utf-8")
            digest = hashlib.sha256(catalog_path.read_bytes()).hexdigest()
            pack_path.write_text(
                "<!-- program-facts: mcs-foundations-locales "
                f"revision=1 sha256={digest} -->\n",
                encoding="utf-8",
            )
            self.assertEqual(
                sync_program_facts.validate_mcs_locales(catalog_path, pack_path),
                [],
            )
            pack_path.write_text(
                "<!-- program-facts: mcs-foundations-locales "
                f"revision=1 sha256={'0' * 64} -->\n",
                encoding="utf-8",
            )
            self.assertIn(
                "MCS locales catalog and minion pack revision/hash do not agree",
                sync_program_facts.validate_mcs_locales(catalog_path, pack_path),
            )
            catalog_path.write_text("not-json", encoding="utf-8")
            self.assertEqual(
                sync_program_facts.validate_mcs_locales(catalog_path, pack_path),
                ["MCS locales catalog is not valid UTF-8 JSON"],
            )
            catalog_path.write_text("[]", encoding="utf-8")
            self.assertEqual(
                sync_program_facts.validate_mcs_locales(catalog_path, pack_path),
                ["MCS locales catalog root must be an object"],
            )

    def test_mcs_locale_catalog_rejects_every_malformed_shape(self):
        valid = {
            "schema_version": "1.0",
            "catalog_id": "mcs-foundations-locales",
            "catalog_revision": 1,
            "locales": [
                {"language": "English"},
                {"language": "French"},
                {"language": "Japanese"},
                {"language": "Spanish"},
            ],
        }
        malformed = [
            ({**valid, "catalog_id": "wrong"}, "invalid catalog_id"),
            ({**valid, "catalog_revision": "1"}, "invalid revision"),
            ({**valid, "locales": {"French": True}}, "invalid locales collection"),
            ({**valid, "locales": [None, "French"]}, "invalid locales collection"),
            (
                {**valid, "locales": valid["locales"][:-1]},
                "does not contain the exact verified language set",
            ),
        ]
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            catalog_path = root / "catalog.json"
            pack_path = root / "pack.md"
            for catalog, expected in malformed:
                catalog_path.write_text(json.dumps(catalog), encoding="utf-8")
                digest = hashlib.sha256(catalog_path.read_bytes()).hexdigest()
                pack_path.write_text(
                    "<!-- program-facts: mcs-foundations-locales "
                    f"revision=1 sha256={digest} -->\n",
                    encoding="utf-8",
                )
                errors = sync_program_facts.validate_mcs_locales(
                    catalog_path, pack_path
                )
                self.assertTrue(
                    any(expected in error for error in errors),
                    msg=f"expected {expected!r} in {errors!r}",
                )

    def test_aacs_inject_removes_superseded_section_and_is_idempotent(self):
        source = """# KB

## Coaching Supervisor Specialization (CSS) & "Coaching Supervision Mastery"

The program is PRE-LAUNCH / in development — a founding cohort is forming.

<!-- BEGIN CANONICAL PROGRAM FACTS: practitioner-series -->
## Canonical Practitioner Series Facts
<!-- END CANONICAL PROGRAM FACTS: practitioner-series -->
"""
        pack = "## Canonical Coaching Supervision Mastery Facts\n\nLive and enrolling."
        once = sync_program_facts.inject_aacs(source, pack)
        twice = sync_program_facts.inject_aacs(once, pack)
        self.assertEqual(once, twice)
        self.assertNotIn("PRE-LAUNCH", once)
        self.assertIn(sync_program_facts.AACS_BEGIN, once)
        self.assertIn(sync_program_facts.BEGIN, once)

    def test_aacs_catalog_and_pack_are_exactly_hash_bound(self):
        catalog = {
            "catalog_id": "coaching-supervision-mastery",
            "catalog_revision": 1,
            "program": {"status": "live_enrolling"},
            "accreditation": {
                "program_level": "ICF Advanced Accreditation in Coaching Supervision (AACS)"
            },
            "checkout_expectations": [
                {
                    "product": "supervision-inaugural",
                    "price_cents": 399600,
                    "active": True,
                },
                {
                    "product": "supervision-regular",
                    "price_cents": 479600,
                    "active": False,
                },
            ],
            "stale_claims": ["one", "two", "three", "four"],
        }
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            catalog_path = root / "catalog.json"
            pack_path = root / "pack.md"
            catalog_path.write_text(json.dumps(catalog), encoding="utf-8")
            digest = hashlib.sha256(catalog_path.read_bytes()).hexdigest()
            pack_path.write_text(
                "<!-- program-facts: coaching-supervision-mastery "
                f"revision=1 sha256={digest} -->\n",
                encoding="utf-8",
            )
            self.assertEqual(
                sync_program_facts.validate_aacs(catalog_path, pack_path), []
            )
            pack_path.write_text(
                "<!-- program-facts: coaching-supervision-mastery "
                f"revision=1 sha256={'0' * 64} -->\n",
                encoding="utf-8",
            )
            self.assertIn(
                "Coaching Supervision Mastery catalog and minion pack revision/hash do not agree",
                sync_program_facts.validate_aacs(catalog_path, pack_path),
            )

    def test_inject_and_check_support_a_separate_operational_target(self):
        with tempfile.TemporaryDirectory() as tmp:
            target_root = Path(tmp)
            shared = target_root / "knowledge" / "shared" / "KNOWLEDGE.md"
            sales = target_root / "knowledge" / "agents" / "sales" / "KNOWLEDGE.md"
            shared.parent.mkdir(parents=True)
            sales.parent.mkdir(parents=True)
            shared.write_text("# Shared\n", encoding="utf-8")
            sales.write_text("# Sales\n", encoding="utf-8")
            self.assertEqual(sync_program_facts.inject_local(target_root), [])
            self.assertEqual(
                sync_program_facts.check(Path("/nonexistent"), target_root), []
            )
            self.assertIn(
                sync_program_facts.AACS_BEGIN,
                sales.read_text(encoding="utf-8"),
            )


if __name__ == "__main__":
    unittest.main()

import importlib.util
import sys
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


if __name__ == "__main__":
    unittest.main()

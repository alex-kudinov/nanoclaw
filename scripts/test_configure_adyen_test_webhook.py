import importlib.util
import io
import os
import stat
import tempfile
import unittest
from unittest import mock
from pathlib import Path

SCRIPT = Path(__file__).with_name("configure-adyen-test-webhook.py")
SPEC = importlib.util.spec_from_file_location("adyen_installer", SCRIPT)
installer = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(installer)


class ConfigureAdyenTestWebhookTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.env = self.root / ".env"
        self.backups = self.root / "backups"
        self.original = b"KEEP=this byte-for-byte\nNO_FINAL_NEWLINE=preserved"
        self.env.write_bytes(self.original)
        self.env.chmod(0o600)
        self.args = dict(
            env_file=str(self.env),
            confirm_host="fixture-host",
            actual_host="fixture-host",
            backup_root=str(self.backups),
            allowed_paths={str(self.env)},
            uid=os.getuid(),
        )

    def tearDown(self):
        self.temp.cleanup()

    def test_dry_run_never_prompts_or_changes_files(self):
        prompted = False

        def prompt():
            nonlocal prompted
            prompted = True
            return "a" * 64

        status, changed = installer.configure(**self.args, apply=False, prompt=prompt)
        self.assertEqual(status, "dry-run")
        self.assertEqual(changed[0], installer.HMAC_NAME)
        self.assertFalse(prompted)
        self.assertEqual(self.env.read_bytes(), self.original)
        self.assertFalse(self.backups.exists())

    def test_apply_preserves_original_bytes_and_creates_private_backup(self):
        status, changed = installer.configure(
            **self.args, apply=True, prompt=lambda: "A1" * 32
        )
        self.assertEqual(status, "applied")
        self.assertEqual(changed, [installer.HMAC_NAME, *(name for name, _ in installer.FIXED)])
        updated = self.env.read_bytes()
        self.assertTrue(updated.startswith(self.original + b"\n"))
        self.assertNotIn(b"\nKEEP=", updated[len(self.original):])
        self.assertEqual(stat.S_IMODE(self.env.stat().st_mode), 0o600)
        directories = [p for p in self.backups.iterdir() if p.is_dir()]
        self.assertEqual(len(directories), 1)
        self.assertEqual(stat.S_IMODE(directories[0].stat().st_mode), 0o700)
        backup = next(directories[0].iterdir())
        self.assertEqual(backup.read_bytes(), self.original)
        self.assertEqual(stat.S_IMODE(backup.stat().st_mode), 0o600)

    def test_matching_quoted_fixed_values_are_preserved(self):
        original = (
            b'TANDEM_ADYEN_TEST_MERCHANT_ACCOUNT="SoleraMerchantServicesECOM"\n'
            b"TANDEM_ADYEN_TEST_STORE_REFERENCE='tandem_test_ecom_v1'\n"
        )
        self.env.write_bytes(original)
        status, changed = installer.configure(
            **self.args, apply=True, prompt=lambda: "c" * 64
        )
        self.assertEqual(status, "applied")
        self.assertNotIn("TANDEM_ADYEN_TEST_MERCHANT_ACCOUNT", changed)
        self.assertNotIn("TANDEM_ADYEN_TEST_STORE_REFERENCE", changed)
        self.assertTrue(self.env.read_bytes().startswith(original))

    def test_refuses_existing_key_conflicts_duplicates_and_bad_secret(self):
        cases = (
            (b"TANDEM_ADYEN_TEST_HMAC_KEYS=00\n", "credential_exists"),
            (b"TANDEM_ADYEN_TEST_HMAC_KEY=00\n", "credential_exists"),
            (b"TANDEM_ADYEN_TEST_STORE_REFERENCE=wrong\n", "configuration_conflict"),
            (b"TANDEM_ADYEN_TEST_EVENT_CODES=AUTHORISATION\nexport TANDEM_ADYEN_TEST_EVENT_CODES=AUTHORISATION\n", "ambiguous_assignment"),
        )
        for content, code in cases:
            with self.subTest(code=code):
                self.env.write_bytes(content)
                with self.assertRaisesRegex(installer.InstallError, f"^{code}$"):
                    installer.configure(**self.args, apply=False)
        with self.assertRaisesRegex(installer.InstallError, "^invalid_credential$"):
            installer.build_update(b"", "not-a-key")

    def test_refuses_wrong_host_insecure_file_symlink_and_unallowlisted_path(self):
        with self.assertRaisesRegex(installer.InstallError, "^host_mismatch$"):
            installer.configure(**{**self.args, "actual_host": "other"}, apply=True)
        self.env.chmod(0o644)
        with self.assertRaisesRegex(installer.InstallError, "^unsafe_permissions$"):
            installer.configure(**self.args, apply=False)
        self.env.unlink()
        target = self.root / "target"
        target.write_bytes(b"safe\n")
        target.chmod(0o600)
        self.env.symlink_to(target)
        with self.assertRaisesRegex(installer.InstallError, "^unsafe_target$"):
            installer.configure(**self.args, apply=False)
        with self.assertRaisesRegex(installer.InstallError, "^env_file_not_allowed$"):
            installer.configure(**{**self.args, "allowed_paths": set()}, apply=False)

    def test_compare_and_swap_refuses_racing_change(self):
        def race():
            self.env.write_bytes(self.original + b"\nRACE=1\n")
            self.env.chmod(0o600)

        with self.assertRaisesRegex(installer.InstallError, "^target_changed$"):
            installer.configure(
                **self.args, apply=True, prompt=lambda: "b" * 64, before_cas=race
            )
        self.assertEqual(self.env.read_bytes(), self.original + b"\nRACE=1\n")

    def test_failed_temporary_write_leaves_no_secret_file(self):
        original_write = installer._write_exclusive

        def fail_temporary(path, data, mode=0o600):
            if Path(path).parent == self.root:
                Path(path).write_bytes(data[:40])
                raise installer.InstallError("filesystem_error")
            original_write(path, data, mode)

        with mock.patch.object(installer, "_write_exclusive", side_effect=fail_temporary):
            with self.assertRaisesRegex(installer.InstallError, "^filesystem_error$"):
                installer.configure(**self.args, apply=True, prompt=lambda: "d" * 64)
        self.assertEqual(self.env.read_bytes(), self.original)
        self.assertEqual(sorted(p.name for p in self.root.iterdir()), [".env", "backups"])

    def test_backup_directories_are_synced_before_replacement(self):
        with mock.patch.object(installer, "_fsync_directory", wraps=installer._fsync_directory) as sync:
            installer.configure(**self.args, apply=True, prompt=lambda: "e" * 64)
        paths = [Path(call.args[0]) for call in sync.call_args_list]
        self.assertEqual(paths[-1], self.root)
        self.assertIn(self.backups, paths[:-1])
        self.assertTrue(any(p.parent == self.backups for p in paths[:-1]))

    def test_stdin_mode_selection_and_validation_order(self):
        with mock.patch.object(installer, "_terminal_secret", return_value="a" * 64) as terminal:
            with mock.patch.object(installer, "_stdin_secret", return_value="f" * 64) as read:
                installer.configure(**self.args, apply=True)
                terminal.assert_called_once_with()
                read.assert_not_called()
        self.env.write_bytes(self.original)
        with mock.patch.object(installer, "_stdin_secret", return_value="f" * 64) as read:
            installer.configure(**self.args, apply=False, key_stdin=True)
            with self.assertRaisesRegex(installer.InstallError, "^host_mismatch$"):
                installer.configure(
                    **{**self.args, "actual_host": "other"}, apply=True, key_stdin=True
                )
            with self.assertRaisesRegex(installer.InstallError, "^env_file_not_allowed$"):
                installer.configure(
                    **{**self.args, "allowed_paths": set()}, apply=True, key_stdin=True
                )
            read.assert_not_called()

    def test_stdin_secret_accepts_only_bounded_hex_and_optional_newline(self):
        class Stdin:
            def __init__(self, data, tty=False):
                self.buffer = io.BytesIO(data)
                self.tty = tty

            def isatty(self):
                return self.tty

        for suffix in (b"", b"\n", b"\r\n"):
            self.assertEqual(installer._stdin_secret(Stdin(b"a1" * 32 + suffix)), "a1" * 32)
        invalid = (b"a" * 63, b"a" * 64 + b"\r", b"a" * 63 + b"\0", b"a" * 63 + b"\xff", b"a" * 67)
        for raw in invalid:
            with self.subTest(length=len(raw)):
                with self.assertRaisesRegex(installer.InstallError, "^invalid_credential$"):
                    installer._stdin_secret(Stdin(raw))
        with self.assertRaisesRegex(installer.InstallError, "^piped_stdin_required$"):
            installer._stdin_secret(Stdin(b"a" * 64, tty=True))


if __name__ == "__main__":
    unittest.main()

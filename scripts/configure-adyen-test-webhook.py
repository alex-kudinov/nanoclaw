#!/usr/bin/env python3
"""Safely add the fixed Adyen TEST webhook configuration to one host env."""

import argparse
import fcntl
import getpass
import os
import re
import secrets
import stat
import sys
import warnings
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Iterable, Optional

ALLOWED_ENV_FILES = {
    "/Users/xbohdpukc/dev/peri/.env",
    "/Users/xbohdpukc/dev/NanoClaw/.env",
}
HMAC_NAME = "TANDEM_ADYEN_TEST_HMAC_KEYS"
LEGACY_HMAC_NAME = "TANDEM_ADYEN_TEST_HMAC_KEY"
FIXED = (
    ("TANDEM_ADYEN_TEST_MERCHANT_ACCOUNT", "SoleraMerchantServicesECOM"),
    ("TANDEM_ADYEN_TEST_STORE_REFERENCE", "tandem_test_ecom_v1"),
    ("TANDEM_ADYEN_TEST_REFERENCE_PREFIX", "tandem-poc-tsv1-"),
    ("TANDEM_ADYEN_TEST_EVENT_CODES", "AUTHORISATION"),
    ("TANDEM_ADYEN_TEST_SHARED_FEED_FILTER_ENABLED", "1"),
)


class InstallError(Exception):
    """A deliberately content-free operator error."""


def _fail(code: str) -> None:
    raise InstallError(code)


def _assignments(data: bytes, name: str) -> list[tuple[bool, bytes]]:
    pattern = re.compile(
        rb"(?m)^[ \t]*(?:(export)[ \t]+)?"
        + re.escape(name.encode("ascii"))
        + rb"[ \t]*=([^\r\n]*)\r?$"
    )
    return [
        (match.group(1) is not None, match.group(2).strip(b" \t\r"))
        for match in pattern.finditer(data)
    ]


def _literal_value(raw: bytes) -> bytes:
    if len(raw) >= 2 and raw[:1] == raw[-1:] and raw[:1] in (b"'", b'"'):
        return raw[1:-1]
    return raw


def inspect_config(data: bytes) -> list[tuple[str, str]]:
    """Return fixed assignments still needed; never accepts an existing key."""
    if _assignments(data, HMAC_NAME) or _assignments(data, LEGACY_HMAC_NAME):
        _fail("credential_exists")
    missing: list[tuple[str, str]] = []
    for name, expected in FIXED:
        found = _assignments(data, name)
        if len(found) > 1:
            _fail("ambiguous_assignment")
        if found and (found[0][0] or _literal_value(found[0][1]) != expected.encode("ascii")):
            _fail("configuration_conflict")
        if not found:
            missing.append((name, expected))
    return missing


def build_update(data: bytes, secret: str) -> tuple[bytes, list[str]]:
    if re.fullmatch(r"[0-9A-Fa-f]{64}", secret) is None:
        _fail("invalid_credential")
    missing = inspect_config(data)
    newline = b"\r\n" if b"\r\n" in data else b"\n"
    prefix = b"" if not data or data.endswith((b"\n", b"\r")) else newline
    additions = [(HMAC_NAME, secret), *missing]
    encoded = newline.join(f"{k}={v}".encode("ascii") for k, v in additions)
    return data + prefix + encoded + newline, [name for name, _ in additions]


def _read_secure(path: str, uid: int) -> tuple[bytes, tuple[int, ...]]:
    try:
        before = os.lstat(path)
        if stat.S_ISLNK(before.st_mode) or not stat.S_ISREG(before.st_mode):
            _fail("unsafe_target")
        if (
            before.st_uid != uid
            or before.st_nlink != 1
            or stat.S_IMODE(before.st_mode) != 0o600
        ):
            _fail("unsafe_permissions")
        flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
        fd = os.open(path, flags)
        try:
            current = os.fstat(fd)
            if (current.st_dev, current.st_ino) != (before.st_dev, before.st_ino):
                _fail("target_changed")
            data = b""
            while True:
                chunk = os.read(fd, 131072)
                if not chunk:
                    break
                data += chunk
        finally:
            os.close(fd)
    except InstallError:
        raise
    except OSError:
        _fail("filesystem_error")
    signature = (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns)
    return data, signature


def _private_dir(path: str, uid: int) -> None:
    try:
        os.makedirs(path, mode=0o700, exist_ok=True)
        info = os.lstat(path)
        if not stat.S_ISDIR(info.st_mode) or stat.S_ISLNK(info.st_mode):
            _fail("unsafe_backup_location")
        if info.st_uid != uid or stat.S_IMODE(info.st_mode) != 0o700:
            _fail("unsafe_backup_permissions")
    except InstallError:
        raise
    except OSError:
        _fail("filesystem_error")


def _write_exclusive(path: str, data: bytes, mode: int = 0o600) -> None:
    try:
        flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0)
        fd = os.open(path, flags, mode)
        try:
            os.fchmod(fd, mode)
            view = memoryview(data)
            while view:
                view = view[os.write(fd, view):]
            os.fsync(fd)
        finally:
            os.close(fd)
    except OSError:
        _fail("filesystem_error")


def _fsync_directory(directory: str) -> None:
    fd = os.open(directory, os.O_RDONLY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def _backup(root: str, env_file: str, data: bytes, uid: int) -> None:
    _private_dir(root, uid)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    try:
        directory = os.path.join(root, f"adyen-test-{stamp}-{os.getpid()}-{secrets.token_hex(4)}")
        os.mkdir(directory, 0o700)
        os.chmod(directory, 0o700)
        _write_exclusive(os.path.join(directory, Path(env_file).parent.name + ".env.before"), data)
        _fsync_directory(directory)
        _fsync_directory(root)
        directory_fd = os.open(directory, os.O_RDONLY)
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)
    except InstallError:
        raise
    except OSError:
        _fail("filesystem_error")


def configure(
    env_file: str,
    *,
    apply: bool,
    confirm_host: Optional[str],
    actual_host: str,
    backup_root: str,
    allowed_paths: Iterable[str] = ALLOWED_ENV_FILES,
    uid: Optional[int] = None,
    prompt: Optional[Callable[[], str]] = None,
    before_cas: Optional[Callable[[], None]] = None,
) -> tuple[str, list[str]]:
    if env_file not in set(allowed_paths):
        _fail("env_file_not_allowed")
    if confirm_host is not None and confirm_host != actual_host:
        _fail("host_mismatch")
    if apply and confirm_host != actual_host:
        _fail("host_confirmation_required")
    owner = os.getuid() if uid is None else uid
    if not apply:
        data, _ = _read_secure(env_file, owner)
        missing = inspect_config(data)
        return "dry-run", [HMAC_NAME, *(name for name, _ in missing)]

    _private_dir(backup_root, owner)
    lock_path = os.path.join(backup_root, ".configure-adyen-test-webhook.lock")
    try:
        lock_fd = os.open(
            lock_path,
            os.O_RDWR | os.O_CREAT | getattr(os, "O_NOFOLLOW", 0),
            0o600,
        )
        lock_info = os.fstat(lock_fd)
        if (
            not stat.S_ISREG(lock_info.st_mode)
            or lock_info.st_uid != owner
            or lock_info.st_nlink != 1
            or stat.S_IMODE(lock_info.st_mode) != 0o600
        ):
            _fail("unsafe_lock")
        try:
            fcntl.flock(lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            _fail("lock_busy")
        original, signature = _read_secure(env_file, owner)
        inspect_config(original)
        secret = (prompt or _terminal_secret)()
        updated, changed = build_update(original, secret)
        _backup(backup_root, env_file, original, owner)
        if before_cas:
            before_cas()
        temporary = os.path.join(os.path.dirname(env_file), f".tmp-adyen-env-{os.getpid()}-{secrets.token_hex(6)}")
        try:
            _write_exclusive(temporary, updated)
            current, current_signature = _read_secure(env_file, owner)
            if current != original or current_signature != signature:
                _fail("target_changed")
            # A non-cooperating editor can still race this syscall; the private
            # lock plus immediate byte-and-identity CAS makes that window tiny.
            os.replace(temporary, env_file)
            _fsync_directory(os.path.dirname(env_file))
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)
        return "applied", changed
    except InstallError:
        raise
    except (EOFError, KeyboardInterrupt):
        _fail("input_unavailable")
    except OSError:
        _fail("filesystem_error")
    finally:
        if "lock_fd" in locals():
            os.close(lock_fd)


def _terminal_secret() -> str:
    if not sys.stdin.isatty():
        _fail("tty_required")
    try:
        tty_fd = os.open("/dev/tty", os.O_RDWR)
        os.close(tty_fd)
    except OSError:
        _fail("tty_required")
    with warnings.catch_warnings():
        warnings.simplefilter("error", getpass.GetPassWarning)
        try:
            return getpass.getpass("Adyen TEST HMAC key (hidden): ")
        except getpass.GetPassWarning:
            _fail("tty_required")


def main() -> int:
    parser = argparse.ArgumentParser(description="Install Adyen TEST webhook configuration safely")
    parser.add_argument("--env-file", required=True)
    parser.add_argument("--confirm-host")
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    backup_root = os.path.expanduser("~/.local/share/nanoclaw-deploy-backups")
    try:
        status, changed = configure(
            args.env_file,
            apply=args.apply,
            confirm_host=args.confirm_host,
            actual_host=os.uname().nodename,
            backup_root=backup_root,
        )
    except InstallError as error:
        print(f"refused: {error}", file=sys.stderr)
        return 2
    print(f"status={status} changed={','.join(changed)} mode=0600")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

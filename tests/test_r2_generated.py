import hashlib
import json
import os

import pytest

import r2


def test_generated_downloads_missing_and_outdated_copies_and_keeps_local_builds(tmp_path, monkeypatch):
    monkeypatch.setattr(r2, "GENERATED", tmp_path.resolve())
    monkeypatch.setattr(r2, "SHIPPED", tmp_path.resolve() / "on_r2.json")
    sha = hashlib.sha256(b"shipped").hexdigest()
    r2.SHIPPED.write_text(json.dumps({"a.npz": sha}))
    store = {f"generated/{sha}/a.npz": b"shipped"}
    monkeypatch.setattr(r2, "fetch", lambda key: store[key])
    path = tmp_path / "a.npz"

    assert r2.generated(path).read_bytes() == b"shipped"  # missing
    path.write_bytes(b"old")
    os.utime(path, (0, 0))  # older than on_r2.json: an outdated copy
    assert r2.generated(path).read_bytes() == b"shipped"
    path.write_bytes(b"rebuilt")
    os.utime(r2.SHIPPED, (0, 0))  # newer than on_r2.json: a local build not pushed yet
    assert r2.generated(path).read_bytes() == b"rebuilt"

    path.unlink()
    store[f"generated/{sha}/a.npz"] = b"tampered"
    with pytest.raises(ValueError):
        r2.generated(path)
    assert not path.exists()
    assert r2.generated(tmp_path / "other.json") == tmp_path / "other.json"  # not shipped: untouched


def test_local_builds_are_pushed():
    """A file rebuilt in backend/generated but not pushed would ship nothing new."""
    shipped = json.loads(r2.SHIPPED.read_text(encoding="utf-8"))
    unpushed = [name for name, sha in shipped.items()
                if (r2.GENERATED / name).exists()
                and (r2.GENERATED / name).stat().st_mtime > r2.SHIPPED.stat().st_mtime
                and r2._sha256(r2.GENERATED / name) != sha]
    assert not unpushed, f"python backend/r2.py push {' '.join(unpushed)}"

"""Authenticated R2 access.

data.fung.es serves only what the browser needs (map tiles and the BioCLIP models);
everything else on the bucket is read here with the R2_* credentials: .env.secret
locally, repository secrets in CI. Paths may be full data.fung.es URLs, as .env lists
them, or bare keys.
"""

import hashlib
import json
import os
import tempfile
from pathlib import Path
from urllib.parse import urlparse

import boto3

_SECRET = Path(__file__).resolve().parents[1] / ".env.secret"
GENERATED = Path(__file__).resolve().parent / "generated"
# The built and fitted files in backend/generated live on R2, not in git; this lists each
# one's name and the sha256 of the shipped copy, at generated/<sha256>/<name>.
SHIPPED = GENERATED / "on_r2.json"


def _load_secret():
    if not _SECRET.exists():
        return
    for line in _SECRET.read_text(encoding="utf-8").splitlines():
        name, sep, value = line.partition("=")
        if sep and not name.lstrip().startswith("#"):
            os.environ.setdefault(name.strip(), value.strip().strip("\"'"))


def client():
    _load_secret()
    return boto3.client(
        "s3",
        endpoint_url=os.environ["R2_ENDPOINT_URL"],
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
    )


def key(path):
    return urlparse(str(path)).path.lstrip("/")


def fetch(path):
    """The object's bytes."""
    return client().get_object(Bucket=os.environ["R2_BUCKET_NAME"], Key=key(path))["Body"].read()


def download(path, dest):
    """Stream the object to `dest` without holding it in memory."""
    client().download_file(os.environ["R2_BUCKET_NAME"], key(path), str(dest))


def download_to_temp(path, suffix=""):
    """A temporary local copy (the caller deletes it)."""
    fd, name = tempfile.mkstemp(suffix=suffix)
    os.close(fd)
    try:
        download(path, name)
    except BaseException:
        os.unlink(name)  # a broken download would leave up to GBs in /tmp
        raise
    return name


def _sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def _shipped():
    return json.loads(SHIPPED.read_text(encoding="utf-8")) if SHIPPED.exists() else {}


def generated(path):
    """`path`, first downloaded from R2 when it is a shipped backend/generated file that is
    missing or older than the shipped copy. Any other path comes back as it is."""
    path = Path(path)
    sha = _shipped().get(path.name)
    if sha is None or path.resolve().parent != GENERATED:
        return path
    if path.exists():
        if _sha256(path) == sha:
            return path
        # ponytail: newer than on_r2.json = a local build not pushed yet; a branch switch
        # before the push still overwrites it.
        if path.stat().st_mtime > SHIPPED.stat().st_mtime:
            print(f"[warn] {path.name} differs from the shipped copy; ship it with: python backend/r2.py push {path.name}")
            return path
    data = fetch(f"generated/{sha}/{path.name}")
    if hashlib.sha256(data).hexdigest() != sha:
        raise ValueError(f"{path.name}: the R2 copy fails its checksum")
    part = path.with_name(f"{path.name}.{os.getpid()}.part")  # regions may fetch at once
    part.write_bytes(data)
    part.replace(path)
    return path


def push(name):
    """Upload backend/generated/<name> and record it in on_r2.json (commit that file)."""
    sha = _sha256(GENERATED / name)
    client().upload_file(str(GENERATED / name), os.environ["R2_BUCKET_NAME"], f"generated/{sha}/{name}")
    shipped = {**_shipped(), name: sha}
    SHIPPED.write_text(json.dumps(dict(sorted(shipped.items())), indent=2) + "\n", encoding="utf-8", newline="\n")


if __name__ == "__main__":
    # python backend/r2.py <key-or-url> <dest>: CI pulls the private scores this way.
    # python backend/r2.py push <name>...: ship backend/generated files after a build.
    # python backend/r2.py sync: download every shipped backend/generated file.
    import sys

    if sys.argv[1] == "push":
        for name in sys.argv[2:]:
            push(name)
    elif sys.argv[1] == "sync":
        for name in _shipped():
            generated(GENERATED / name)
    else:
        download(sys.argv[1], sys.argv[2])

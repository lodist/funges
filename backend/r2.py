"""Authenticated R2 access.

data.fung.es serves only what the browser needs (map tiles and the BioCLIP models);
everything else on the bucket is read here with the R2_* credentials: .env.secret
locally, repository secrets in CI. Paths may be full data.fung.es URLs, as .env lists
them, or bare keys.
"""

import os
import tempfile
from pathlib import Path
from urllib.parse import urlparse

import boto3

_SECRET = Path(__file__).resolve().parents[1] / ".env.secret"


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


if __name__ == "__main__":
    # python backend/r2.py <key-or-url> <dest>: CI pulls the private scores this way.
    import sys

    download(sys.argv[1], sys.argv[2])

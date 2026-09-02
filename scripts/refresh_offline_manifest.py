#!/usr/bin/env python3
"""Refresh mutable forecast metadata without rebuilding stable basemaps."""

from __future__ import annotations

import argparse
import hashlib
import json
import urllib.request
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path


def head(url: str) -> tuple[int, str, str]:
    request = urllib.request.Request(
        url,
        method="HEAD",
        headers={"User-Agent": "FungesOfflineManifest/1.0"},
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        size = int(response.headers["Content-Length"])
        etag = response.headers.get("ETag", "").strip('"')
        modified = response.headers.get("Last-Modified", "")
    return size, etag, modified


def iso_date(http_date: str) -> str:
    if not http_date:
        return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    return parsedate_to_datetime(http_date).astimezone(timezone.utc).isoformat().replace(
        "+00:00", "Z"
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--manifest", type=Path, default=Path("public/offline-packages.json")
    )
    args = parser.parse_args()
    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    changed = False

    for package in manifest["packages"]:
        newest = package["updatedAt"]
        for resource in package["resources"]:
            if resource["kind"] != "forecast":
                continue
            size, etag, modified = head(
                resource.get("downloadUrl", resource["sourceUrl"])
            )
            version = etag or f"{size}-{modified}"
            next_values = {
                "sizeBytes": size,
                "version": version,
                **({"etag": etag} if etag else {}),
            }
            for key, value in next_values.items():
                if resource.get(key) != value:
                    resource[key] = value
                    changed = True
            newest = max(newest, iso_date(modified))

        versions = "|".join(
            resource.get("version", package["version"])
            for resource in package["resources"]
        )
        package_version = hashlib.sha256(versions.encode()).hexdigest()[:12]
        if package["version"] != package_version:
            package["version"] = package_version
            changed = True
        if package["updatedAt"] != newest:
            package["updatedAt"] = newest
            changed = True

    if changed:
        manifest["generatedAt"] = datetime.now(timezone.utc).isoformat().replace(
            "+00:00", "Z"
        )
        args.manifest.write_text(
            json.dumps(manifest, indent=2) + "\n", encoding="utf-8"
        )


if __name__ == "__main__":
    main()

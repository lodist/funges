#!/usr/bin/env python3
"""Build immutable regional PMTiles archives and their client manifest.

Requires the official `pmtiles` CLI on PATH. This script intentionally does
not upload or deploy anything; publishing R2 artifacts remains a separate,
explicit release operation.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path

WORLD_SOURCE_URL = (
    "https://data.fung.es/basemap/world_z12_20260619.pmtiles"
)

def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def run(*args: str) -> None:
    subprocess.run(args, check=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    # The pmtiles CLI reads a local path or an HTTP archive, and the world
    # archive is 17 GB, so keep this a plain string: Path() mangles a URL.
    parser.add_argument("--world", required=True)
    parser.add_argument("--version", required=True)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument(
        "--public-base-url",
        default="https://data.fung.es/basemap",
    )
    parser.add_argument(
        "--definitions",
        type=Path,
        default=Path(__file__).with_name("offline_package_regions.json"),
    )
    parser.add_argument(
        "--manifest",
        type=Path,
        default=Path("public/offline-packages.json"),
    )
    parser.add_argument(
        "--forecast-manifest",
        type=Path,
        default=Path("public/offline-packages.json"),
        help="Current catalog used as the source of mutable forecast metadata",
    )
    args = parser.parse_args()

    definitions = json.loads(args.definitions.read_text(encoding="utf-8"))
    current_manifest = json.loads(
        args.forecast_manifest.read_text(encoding="utf-8")
    )
    forecasts = {
        package["continent"]: [
            resource.copy()
            for resource in package["resources"]
            if resource["kind"] == "forecast"
        ]
        for package in current_manifest["packages"]
    }
    args.output_dir.mkdir(parents=True, exist_ok=True)
    generated_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    packages = []

    for definition in definitions:
        artifact_name = definition.get("artifactName", definition["id"])
        release_tag = args.version.replace("-", "")
        filename = (
            f"{artifact_name}_z{definition['maxZoom']}_{release_tag}.pmtiles"
        )
        output = args.output_dir / filename
        bbox = ",".join(str(value) for value in definition["bounds"])
        run(
            "pmtiles",
            "extract",
            str(args.world),
            str(output),
            f"--bbox={bbox}",
            f"--maxzoom={definition['maxZoom']}",
            "--overfetch=0",
        )
        run("pmtiles", "verify", str(output))
        artifact_sha = sha256(output)

        resources = [
            {
                "id": "basemap",
                "kind": "basemap",
                "version": artifact_sha,
                "sourceUrl": WORLD_SOURCE_URL,
                "downloadUrl": (
                    f"{args.public_base_url.rstrip('/')}/{filename}"
                ),
                "sizeBytes": output.stat().st_size,
                "sha256": artifact_sha,
            },
            *forecasts[definition["continent"]],
        ]
        package_definition = {
            key: value
            for key, value in definition.items()
            if key != "artifactName"
        }
        packages.append(
            {
                **package_definition,
                "version": args.version,
                "updatedAt": generated_at,
                "published": True,
                "resources": resources,
            }
        )

    manifest = {
        "schemaVersion": 1,
        "generatedAt": generated_at,
        "packages": packages,
    }
    args.manifest.write_text(
        json.dumps(manifest, indent=2) + "\n", encoding="utf-8"
    )


if __name__ == "__main__":
    main()

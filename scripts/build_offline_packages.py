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

FORECASTS = {
    "eu": [
        {
            "id": "ne-forecast",
            "kind": "forecast",
            "version": "2026-08-20-c657be10",
            "sourceUrl": "https://data.fung.es/EU/NE/ne_forecast.pmtiles",
            "sizeBytes": 6834690,
        },
        {
            "id": "se-forecast",
            "kind": "forecast",
            "version": "2026-08-20-4e518f5c",
            "sourceUrl": "https://data.fung.es/EU/SE/se_forecast.pmtiles",
            "sizeBytes": 6695058,
        },
    ],
    "us": [
        {
            "id": "use-forecast",
            "kind": "forecast",
            "version": "2026-08-20-2be83449",
            "sourceUrl": "https://data.fung.es/USA/USE/use_forecast.pmtiles",
            "sizeBytes": 4753711,
        },
        {
            "id": "usw-forecast",
            "kind": "forecast",
            "version": "2026-08-20-67b203c8",
            "sourceUrl": "https://data.fung.es/USA/USW/usw_forecast.pmtiles",
            "sizeBytes": 5058555,
        },
    ],
}


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
    parser.add_argument("--world", required=True, type=Path)
    parser.add_argument("--version", required=True)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument(
        "--public-base-url",
        default="https://data.fung.es/offline",
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
    args = parser.parse_args()

    definitions = json.loads(args.definitions.read_text(encoding="utf-8"))
    args.output_dir.mkdir(parents=True, exist_ok=True)
    generated_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    packages = []

    for definition in definitions:
        filename = f"{definition['id']}-basemap-z12-{args.version}.pmtiles"
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

        resources = [
            {
                "id": "basemap",
                "kind": "basemap",
                "version": args.version,
                "sourceUrl": WORLD_SOURCE_URL,
                "downloadUrl": (
                    f"{args.public_base_url.rstrip('/')}/{args.version}/{filename}"
                ),
                "sizeBytes": output.stat().st_size,
                "sha256": sha256(output),
            },
            *FORECASTS[definition["continent"]],
        ]
        packages.append(
            {
                **definition,
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

"""Fetch GBIF season ground truth: monthly climatology + complete 2026 records + daily effort.

Deliberately avoids the offset-sampling used by the other QA scripts. Monthly and
daily volumes come from GBIF `count` responses (exact, unbiased); per-record
coordinates come from complete pagination of the target taxa, which are small
enough to enumerate fully.
"""

from __future__ import annotations

import argparse
import json
import time
from datetime import date, timedelta
from pathlib import Path
from urllib.parse import urlencode

import requests

GBIF = "https://api.gbif.org/v1"
# (west, south, east, north) -- same extents as the production score regions.
REGION_BOXES = {
    "NE": (-25, 47, 45, 72),
    "SE": (-25, 34, 45, 47),
    "USE": (-100, 24, -60, 72),
    "USW": (-170, 24, -100, 72),
}
# Fungal targets only: these are the species with empirical season curves.
FUNGI_TAXA = {
    "mushroom": 8287374,      # Boletus (genus)
    "chant": 9623860,         # Cantharellus (genus)
    "black_chant": 2554662,   # Craterellus cornucopioides
    "parasol": 8914748,       # Macrolepiota procera
    "morel": 2594601,         # Morchella (genus)
    "st_george": 8936224,     # Calocybe gambosa
    "truffle_b": 5258468,     # Tuber melanosporum
    "truffle_aestivum": 5258469,  # Tuber aestivum -- the actual Burgundy truffle
}
FUNGI_KINGDOM = 5
MAX_UNCERTAINTY_M = 20_000
CLIMATOLOGY_YEARS = (2021, 2022, 2023, 2024, 2025)


def gbif(session: requests.Session, params: dict) -> dict:
    url = f"{GBIF}/occurrence/search?{urlencode(params)}"
    for attempt in range(7):
        response = session.get(url, timeout=90)
        if response.status_code == 429 or response.status_code >= 500:
            time.sleep(2**attempt)
            continue
        response.raise_for_status()
        return response.json()
    raise RuntimeError(f"GBIF repeatedly failed: {url}")


def region_filter(region: str) -> dict:
    west, south, east, north = REGION_BOXES[region]
    return {
        "decimalLatitude": f"{south},{north}",
        "decimalLongitude": f"{west},{east}",
        "hasCoordinate": "true",
        "hasGeospatialIssue": "false",
        "occurrenceStatus": "PRESENT",
        "basisOfRecord": "HUMAN_OBSERVATION",
    }


def monthly_counts(session: requests.Session, region: str, taxon_key: int, year: int) -> dict[int, int]:
    payload = gbif(session, {
        **region_filter(region), "taxonKey": taxon_key, "year": year,
        "facet": "month", "facetLimit": 12, "limit": 0,
    })
    counts = {month: 0 for month in range(1, 13)}
    for facet in payload.get("facets", []):
        if facet.get("field") != "MONTH":
            continue
        for bucket in facet.get("counts", []):
            counts[int(bucket["name"])] = int(bucket["count"])
    return counts


def daily_counts(session: requests.Session, region: str, taxon_key: int,
                 start: str, end: str, label: str) -> dict[str, int]:
    counts, current, last = {}, date.fromisoformat(start), date.fromisoformat(end)
    while current <= last:
        day = current.isoformat()
        payload = gbif(session, {
            **region_filter(region), "taxonKey": taxon_key, "eventDate": day, "limit": 0,
        })
        counts[day] = int(payload["count"])
        if current.day == 1:
            print(f"  {label} {region} {day}", flush=True)
        current += timedelta(days=1)
    return counts


def enumerate_records(session: requests.Session, region: str, species_id: str,
                      taxon_key: int, start: str, end: str) -> list[dict]:
    base = {**region_filter(region), "taxonKey": taxon_key, "eventDate": f"{start},{end}"}
    total = int(gbif(session, {**base, "limit": 0})["count"])
    rows, offset = [], 0
    while offset < min(total, 100_000):
        payload = gbif(session, {**base, "limit": 300, "offset": offset})
        for row in payload.get("results", []):
            lat, lon = row.get("decimalLatitude"), row.get("decimalLongitude")
            year, month, day = row.get("year"), row.get("month"), row.get("day")
            if None in (lat, lon, year, month, day):
                continue
            try:
                observed = date(int(year), int(month), int(day)).isoformat()
            except ValueError:
                continue
            uncertainty = row.get("coordinateUncertaintyInMeters")
            if uncertainty is not None and float(uncertainty) > MAX_UNCERTAINTY_M:
                continue
            rows.append({
                "date": observed, "region": region, "species_id": species_id,
                "lat": float(lat), "lon": float(lon), "gbif_key": row.get("key"),
                "coordinate_uncertainty_m": uncertainty,
            })
        offset += 300
        if payload.get("endOfRecords"):
            break
    print(f"  records {species_id} {region}: kept {len(rows)} of {total}", flush=True)
    return rows


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--start", default="2026-01-01", help="record enumeration start")
    parser.add_argument("--end", default="2026-08-20", help="record enumeration end")
    parser.add_argument("--effort-start", default="2026-04-12", help="daily effort window start")
    parser.add_argument("--effort-end", default="2026-08-20")
    parser.add_argument("--output", default="docs/qa/season-truth-2026")
    args = parser.parse_args()
    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)
    cache = output / "gbif-season-truth.json"
    if cache.exists():
        print(f"cache present: {cache}")
        return

    session = requests.Session()
    session.headers["User-Agent"] = "fung.es season-timing QA (https://fung.es)"

    print("monthly climatology facets", flush=True)
    climatology: dict = {}
    for region in REGION_BOXES:
        climatology[region] = {}
        for species_id, taxon_key in FUNGI_TAXA.items():
            climatology[region][species_id] = {
                str(year): monthly_counts(session, region, taxon_key, year)
                for year in (*CLIMATOLOGY_YEARS, 2026)
            }
        climatology[region]["_all_fungi"] = {
            str(year): monthly_counts(session, region, FUNGI_KINGDOM, year)
            for year in (*CLIMATOLOGY_YEARS, 2026)
        }
        print(f"  {region} done", flush=True)

    print("daily effort (all fungi)", flush=True)
    effort = {
        region: daily_counts(session, region, FUNGI_KINGDOM,
                             args.effort_start, args.effort_end, "effort")
        for region in REGION_BOXES
    }

    print("record enumeration", flush=True)
    records = []
    for region in REGION_BOXES:
        for species_id, taxon_key in FUNGI_TAXA.items():
            records.extend(
                enumerate_records(session, region, species_id, taxon_key, args.start, args.end)
            )

    cache.write_text(json.dumps({
        "period": [args.start, args.end],
        "effort_period": [args.effort_start, args.effort_end],
        "region_boxes": REGION_BOXES,
        "taxa": FUNGI_TAXA,
        "max_coordinate_uncertainty_m": MAX_UNCERTAINTY_M,
        "basis_of_record": "HUMAN_OBSERVATION",
        "climatology_monthly": climatology,
        "effort_daily": effort,
        "records": records,
    }), encoding="utf-8")
    print(f"wrote {cache} ({len(records)} records)")


if __name__ == "__main__":
    main()

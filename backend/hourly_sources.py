"""The free model runs hourly_weather reads, and which of their fields it takes.

Europe: DWD's ICON-EU (0.0625°, about 7 km; hourly to 78 h, then 3-hourly to 120 h) and,
beyond it and north of its 70.5° N edge, ECMWF's IFS (0.25°; 3-hourly to 144 h, then
6-hourly), from ECMWF's own server or its AWS mirror. US: NOAA's National Blend of Models (2.5 km), the
01/07/13/19z runs, whose rain is hourly all the way out and the rest hourly to 48 h, then
3-hourly. Probed 15-16 Oct 2026: docs/superpowers/plans/2026-10-16-hourly-weather.md.

ICON-EU and ECMWF pack their fields with CCSDS, which the rasterio wheels cannot unpack;
ecCodes reads all three (hourly_weather.decode).

Credit owed wherever this is shown: "Source: Deutscher Wetterdienst" (CC BY 4.0); "© ECMWF,
CC BY 4.0"; NOAA's NBM is public domain, but no NOAA endorsement may be implied.
"""
from __future__ import annotations

import json
import re
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from typing import Callable

import numpy as np
import requests

K = 273.15
WORKERS = 8


@dataclass(frozen=True)
class Source:
    name: str
    cycles: tuple    # UTC run hours that reach far enough ahead
    probe: Callable  # run start -> URLs that answer once that run is complete
    files: Callable  # (session, run start, last lead hour) -> [(field, url, (first, last byte) or None)]
    vars: dict       # our variable -> (kind, fields, convert); kinds as in hourly_weather.to_hours


def _map(fn, items):
    with ThreadPoolExecutor(WORKERS) as pool:
        return list(pool.map(fn, items))


ICON_EU_URL = ("https://opendata.dwd.de/weather/nwp/icon-eu/grib/{init:%H}/{field}/"
               "icon-eu_europe_regular-lat-lon_single-level_{init:%Y%m%d%H}_{step:03d}_{FIELD}.grib2.bz2")
ICON_EU_STEPS = (*range(0, 79), *range(81, 121, 3))
ICON_EU_FIELDS = ("t_2m", "td_2m", "tot_prec", "u_10m", "v_10m", "aswdir_s", "aswdifd_s", "clct")


def icon_eu_url(init, field, step):
    return ICON_EU_URL.format(init=init, field=field, step=step, FIELD=field.upper())


ICON_EU = Source(
    name="icon_eu",
    cycles=(0, 6, 12, 18),  # the 03/09/15/21z runs stop at 48 h
    # DWD keeps one run per cycle hour, about a day, and writes a new one over ~45 minutes.
    probe=lambda init: [icon_eu_url(init, field, 120) for field in ICON_EU_FIELDS],
    files=lambda session, init, last: [(field, icon_eu_url(init, field, step), None)
                                       for field in ICON_EU_FIELDS
                                       for step in ICON_EU_STEPS if step <= last],
    vars={
        "t2m_c": ("state", ("t_2m",), lambda t: t - K),
        "td2m_c": ("state", ("td_2m",), lambda t: t - K),
        "precip_mm": ("accum", ("tot_prec",), lambda p: p),
        "wind10_kmh": ("state", ("u_10m", "v_10m"), lambda u, v: np.hypot(u, v) * 3.6),
        "swdown_wm2": ("mean", ("aswdir_s", "aswdifd_s"), lambda direct, diffuse: direct + diffuse),
        "cloud_pct": ("state", ("clct",), lambda c: c),
    },
)

# ECMWF's own server first: its AWS mirror answered "SlowDown" (HTTP 503) even to single
# requests on the night of 15-16 Oct 2026, when data.ecmwf.int served them.
ECMWF_HOSTS = ("https://data.ecmwf.int/forecasts", "https://ecmwf-forecasts.s3.eu-central-1.amazonaws.com")
ECMWF_STEPS = (*range(0, 145, 3), *range(150, 361, 6))
ECMWF_FIELDS = ("2t", "2d", "tp", "10u", "10v", "ssrd", "tcc")


def ecmwf_url(host, init, step):
    return f"{host}/{init:%Y%m%d}/{init:%H}z/ifs/0p25/oper/{init:%Y%m%d%H}0000-{step}h-oper-fc"


def ecmwf_messages(index_text):
    """(param, first byte, last byte) of our surface fields in one step's .index."""
    out = []
    for line in index_text.splitlines():
        entry = json.loads(line)
        if entry.get("levtype") == "sfc" and entry["param"] in ECMWF_FIELDS:
            out.append((entry["param"], entry["_offset"], entry["_offset"] + entry["_length"] - 1))
    return out


def _ecmwf_files(session, init, last):
    def step_files(step):
        """The step's messages from the first host that serves its index; none if no host
        does (a missing step is bridged by its neighbours)."""
        for host in ECMWF_HOSTS:
            url = ecmwf_url(host, init, step)
            try:
                response = session.get(url + ".index", timeout=60)
                response.raise_for_status()
            except requests.RequestException as e:
                print(f"Hourly weather: ECMWF {url}.index failed: {e!r}")
                continue
            return [(param, url + ".grib2", (first, end)) for param, first, end in ecmwf_messages(response.text)]
        return []
    return [f for files in _map(step_files, [s for s in ECMWF_STEPS if s <= last]) for f in files]


ECMWF = Source(
    name="ecmwf_ifs",
    cycles=(0, 12),  # the 06/18z runs stop at 144 h
    probe=lambda init: [ecmwf_url(ECMWF_HOSTS[0], init, 180) + ".index"],
    files=_ecmwf_files,
    vars={
        "t2m_c": ("state", ("2t",), lambda t: t - K),
        "td2m_c": ("state", ("2d",), lambda t: t - K),
        "precip_mm": ("accum", ("tp",), lambda p: p * 1000),      # metres
        "wind10_kmh": ("state", ("10u", "10v"), lambda u, v: np.hypot(u, v) * 3.6),
        "swdown_wm2": ("accum", ("ssrd",), lambda r: r / 3600),    # J/m² -> W/m² over an hour
        "cloud_pct": ("state", ("tcc",), lambda c: c * 100),       # a 0-1 fraction
    },
)

NBM_URL = ("https://noaa-nbm-grib2-pds.s3.amazonaws.com/blend.{init:%Y%m%d}/{init:%H}/core/"
           "blend.t{init:%H}z.core.f{step:03d}.co.grib2")
# A message's .idx text after "d=<run>:". Matched whole: each field also has ensemble-spread,
# probability and percentile messages, and TCDC has four more at cloud layers.
NBM_FIELDS = {
    "TMP": re.compile(r"TMP:2 m above ground:\d+ hour fcst:"),
    "DPT": re.compile(r"DPT:2 m above ground:\d+ hour fcst:"),
    "APCP": re.compile(r"APCP:surface:(\d+)-(\d+) hour acc fcst:"),
    "WIND": re.compile(r"WIND:10 m above ground:\d+ hour fcst:"),
    "DSWRF": re.compile(r"DSWRF:surface:\d+ hour fcst:"),
    "TCDC": re.compile(r"TCDC:surface:\d+ hour fcst:"),
}


def nbm_messages(idx_text):
    """(field, first byte, last byte or None for the file's end) of our fields in one .idx;
    rain only as its 1-hour total (a 6-hour total sits beside it every 6 h)."""
    lines = [line.split(":", 3) for line in idx_text.splitlines() if line.strip()]
    starts = [int(line[1]) for line in lines]
    out = []
    for k, (_, first, _, text) in enumerate(lines):
        for field, pattern in NBM_FIELDS.items():
            match = pattern.fullmatch(text)
            if match and (field != "APCP" or int(match[2]) - int(match[1]) == 1):
                out.append((field, int(first), starts[k + 1] - 1 if k + 1 < len(lines) else None))
    return out


def _nbm_files(session, init, last):
    def step_files(step):
        url = NBM_URL.format(init=init, step=step)
        response = session.get(url + ".idx", timeout=60)
        if response.status_code == 404:
            return []
        response.raise_for_status()
        return [(field, url, (first, end)) for field, first, end in nbm_messages(response.text)]
    return [f for files in _map(step_files, range(1, last + 1)) for f in files]


NBM = Source(
    name="nbm",
    cycles=(1, 7, 13, 19),  # the runs with hourly rain all the way out
    probe=lambda init: [NBM_URL.format(init=init, step=174) + ".idx"],
    files=_nbm_files,
    vars={
        "t2m_c": ("state", ("TMP",), lambda t: t - K),
        "td2m_c": ("state", ("DPT",), lambda t: t - K),
        "precip_mm": ("hourly", ("APCP",), lambda p: p),
        "wind10_kmh": ("state", ("WIND",), lambda w: w * 3.6),
        "swdown_wm2": ("state", ("DSWRF",), lambda r: r),
        "cloud_pct": ("state", ("TCDC",), lambda c: c),
    },
)

SOURCES = {"EU": (ICON_EU, ECMWF), "US": (NBM,)}

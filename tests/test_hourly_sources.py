"""Where the free model files are, and which of their messages we read."""
import pandas as pd

import hourly_sources as hs

INIT = pd.Timestamp("2026-10-15 12:00", tz="UTC")

NBM_IDX = """\
35:37649540:d=2026101412:DPT:2 m above ground:1 hour fcst:
36:39558236:d=2026101412:DPT:2 m above ground:1 hour fcst:ens std dev
37:41610845:d=2026101412:DSWRF:surface:1 hour fcst:
38:42000000:d=2026101412:APCP:surface:0-1 hour acc fcst:prob >0.254:prob fcst 255/255
39:43000000:d=2026101412:APCP:surface:0-1 hour acc fcst:
40:44000000:d=2026101412:APCP:surface:0-6 hour acc fcst:
41:45000000:d=2026101412:TMP:2 m above ground:1 hour fcst:
"""


def test_nbm_messages_take_our_fields_not_their_spread_or_probabilities():
    assert hs.nbm_messages(NBM_IDX) == [
        ("DPT", 37649540, 39558235),
        ("DSWRF", 41610845, 41999999),
        ("APCP", 43000000, 43999999),   # the 1-hour total, not the 6-hour one
        ("TMP", 45000000, None),         # the file's last message runs to its end
    ]


def test_ecmwf_messages_take_our_surface_fields():
    text = "\n".join([
        '{"levtype": "sfc", "param": "tp", "_offset": 0, "_length": 10}',
        '{"levtype": "sfc", "param": "sp", "_offset": 10, "_length": 5}',
        '{"levtype": "sol", "param": "sot", "levelist": "1", "_offset": 15, "_length": 5}',
        '{"levtype": "sfc", "param": "2t", "_offset": 20, "_length": 5}',
    ])
    assert hs.ecmwf_messages(text) == [("tp", 0, 9), ("2t", 20, 24)]


def test_icon_eu_url():
    assert hs.icon_eu_url(INIT, "td_2m", 7) == (
        "https://opendata.dwd.de/weather/nwp/icon-eu/grib/12/td_2m/"
        "icon-eu_europe_regular-lat-lon_single-level_2026101512_007_TD_2M.grib2.bz2")


def test_icon_eu_lists_every_field_at_every_step_it_has():
    files = hs.ICON_EU.files(None, INIT, 174)
    assert len(files) == 8 * 93
    assert files[0] == ("t_2m", hs.icon_eu_url(INIT, "t_2m", 0), None)
    assert len(hs.ICON_EU.files(None, INIT, 2)) == 8 * 3

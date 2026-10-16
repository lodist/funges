"""Where the free model files are, and which of their messages we read."""
import pandas as pd
import requests

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


class _Hosts:
    """A session that answers from the hosts in `ok` (one .index line to a GET, 200 to a
    HEAD); the others fail as a throttled server does once its retries run out."""
    def __init__(self, ok):
        self.ok = ok

    def _check(self, url):
        if not any(url.startswith(host) for host in self.ok):
            raise requests.exceptions.RetryError("too many 503 error responses")

    def get(self, url, timeout):
        self._check(url)
        text = '{"levtype": "sfc", "param": "2t", "_offset": 0, "_length": 5}'
        return type("Response", (), {"text": text, "raise_for_status": lambda self: None})()

    def head(self, url, timeout):
        self._check(url)
        return type("Response", (), {"status_code": 200})()


def test_ecmwf_falls_back_to_its_other_host():
    data, aws = hs.ECMWF_HOSTS
    files = hs.ECMWF.files(_Hosts({aws}), INIT, 3)
    assert [url for _, url, _ in files] == [hs.ecmwf_url(aws, INIT, 0) + ".grib2",
                                            hs.ecmwf_url(aws, INIT, 3) + ".grib2"]


def test_a_step_no_host_serves_comes_back_as_failed_fields():
    # url None: read_source counts each as a failed file, so a night of throttled servers
    # fails the model instead of passing with empty hours.
    assert hs.ECMWF.files(_Hosts(set()), INIT, 3) == [(p, None, None) for p in hs.ECMWF_FIELDS] * 2
    assert hs.NBM.files(_Hosts(set()), INIT, 2) == [(f, None, None) for f in hs.NBM_FIELDS] * 2


def test_a_run_is_ready_when_any_ecmwf_host_has_it_and_a_failing_server_means_not_ready():
    data, aws = hs.ECMWF_HOSTS
    assert hs.ECMWF.ready(_Hosts({aws}), INIT)
    assert not hs.ECMWF.ready(_Hosts(set()), INIT)
    assert not hs.ICON_EU.ready(_Hosts(set()), INIT)

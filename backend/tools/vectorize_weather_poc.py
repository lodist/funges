"""PROOF OF CONCEPT: vectorize the rain sub-score (`_weather_row`).

Goal: show a vectorized implementation produces output IDENTICAL (within float
tolerance) to the current per-row `df.apply(_weather_row, axis=1)`, and measure
the speedup. This does NOT touch the production scorer — it is a verification
harness only. If this proves out, the vectorized body can replace the apply.

Run: python backend/tools/vectorize_weather_poc.py
"""
import math
import time

import numpy as np
import pandas as pd

LAG_DAYS = 21
MIN_P = 1.5
PRECIP_COLS = [f"TotalPrecipitation_mm_{d}days_ago" for d in range(1, LAG_DAYS + 1)]


def _derive_params(params):
    """Replicate the per-species parameter derivation from calculate_mushroom_score."""
    baseline_days = float(max(LAG_DAYS, 1))
    cum_thr = float(params.get("min_cumulative_rain", 20.0))
    rain_first = bool(params.get("weather_preference", {}).get("rain_first", False))
    _ct = max(0.0, min(cum_thr, 80.0))
    return dict(
        baseline_days=baseline_days,
        min_p=MIN_P,
        cum_thr=cum_thr,
        rain_first=rain_first,
        drought_k=4.0 + 0.06 * _ct,
        drought_mid=min(0.85, 0.65 + 0.0025 * _ct),
        drought_floor=max(0.08, 0.18 - 0.0015 * _ct),
        no_wet_penalty=max(0.50, 0.70 - 0.002 * _ct),
        weather_eps=1e-5,
        cum_gamma=1.5,
        dl_start_pct=min(0.85, 0.72 + 0.001 * _ct),
        dl_floor=0.05,
        dl_gamma=2.0,
        max_wet_eff=int(np.clip(np.ceil(cum_thr / max(np.clip(12.0 - 0.2 * cum_thr, 4.5, 12.0), 1e-9)),
                                1, max(1, int(0.55 * baseline_days)))),
        min_dry_eff=int(np.clip(np.round(0.5 * (baseline_days - int(np.clip(np.ceil(
            cum_thr / max(np.clip(12.0 - 0.2 * cum_thr, 4.5, 12.0), 1e-9)),
            1, max(1, int(0.55 * baseline_days)))))),
            1, max(1, int(0.6 * baseline_days)))),
    )


# ---------------------------------------------------------------------------
# REFERENCE: verbatim copy of the production `_weather_row` + apply.
# ---------------------------------------------------------------------------
def weather_score_apply(df, params):
    p = _derive_params(params)
    precip_hist_cols = PRECIP_COLS
    lag_days = len(precip_hist_cols)
    baseline_days = p["baseline_days"]
    min_p, cum_thr, rain_first = p["min_p"], p["cum_thr"], p["rain_first"]
    drought_k, drought_mid, drought_floor = p["drought_k"], p["drought_mid"], p["drought_floor"]
    no_wet_penalty, weather_eps, cum_gamma = p["no_wet_penalty"], p["weather_eps"], p["cum_gamma"]
    dl_start_pct, dl_floor, dl_gamma = p["dl_start_pct"], p["dl_floor"], p["dl_gamma"]
    max_wet_eff, min_dry_eff = p["max_wet_eff"], p["min_dry_eff"]

    def _weather_row(r):
        if lag_days == 0:
            hist = np.empty(0, dtype=float)
        else:
            arr = r[precip_hist_cols].to_numpy(float)
            hist = np.where(np.isfinite(arr), np.clip(arr, 0.0, None), 0.0)

        hist_days = hist.size
        wet_mask = (hist >= min_p)
        wet_count = int(wet_mask.sum())
        dry_count = int(hist_days - wet_count)
        req_dry = (min_dry_eff if hist_days >= baseline_days else math.ceil(min_dry_eff * (hist_days / baseline_days)))

        today_p = r["TotalPrecipitation_mm"]
        day_ok = 1.0 if (np.isfinite(today_p) and (today_p >= min_p)) else 0.0

        if cum_thr <= 0:
            cum_frac = 1.0
        else:
            scale = (hist_days / baseline_days) if hist_days > 0 else 0.0
            adj_thr = max(cum_thr * scale, 1e-9)
            cum_frac = float(min(1.0, (float(hist.sum()) if hist_days else 0.0) / adj_thr))

        if wet_count == 0:
            wet_factor = 0.0
        elif wet_count <= max_wet_eff:
            wet_factor = 1.0
        else:
            wet_factor = max(0.0, 1.0 - 0.15 * (wet_count - max_wet_eff))

        cum_mm = float(hist.sum()) if hist_days else 0.0
        scale = (hist_days / baseline_days) if hist_days else 0.0
        adj_thr = max(cum_thr * scale, 1e-9)
        cum_frac = min(1.0, cum_mm / adj_thr)
        cum_frac_eff = cum_frac ** cum_gamma

        ratio = cum_mm / adj_thr
        flood_pen = 1.0 if ratio <= 4 else 1.0 / (1.0 + 1.25 * (ratio - 4))

        raw = (
            0.20 * wet_factor +
            0.15 * (dry_count >= req_dry) +
            0.05 * day_ok +
            0.60 * (cum_frac_eff * flood_pen)
        )

        if rain_first:
            if hist_days >= 10:
                wet_early = (hist[6:10] >= min_p).mean()
                dry_recent = (hist[0:4] < min_p).mean()
            elif hist_days >= 4:
                wet_early = (hist[-4:] >= min_p).mean()
                dry_recent = (hist[0:4] < min_p).mean()
            else:
                wet_early = dry_recent = 0.0
            raw = min(1.0, raw + 0.25 * float(wet_early * dry_recent))

        if hist_days:
            days_since_wet = (int(np.where(wet_mask)[0][0]) + 1) if wet_mask.any() else (hist_days + 1)
        else:
            days_since_wet = 0
        if not (np.isfinite(today_p) and today_p >= min_p):
            days_since_wet += 1

        pos = min(1.0, float(days_since_wet) / baseline_days)
        if pos > dl_start_pct:
            t = (pos - dl_start_pct) / max(1e-9, (1.0 - dl_start_pct))
            raw *= (1.0 - (1.0 - dl_floor) * (t ** dl_gamma))
        raw = min(1.0, raw)

        sig = 1.0 / (1.0 + np.exp(-drought_k * (cum_frac_eff - drought_mid)))
        drought_mult = drought_floor + (1.0 - drought_floor) * sig
        if wet_count == 0:
            drought_mult *= no_wet_penalty

        return float(np.clip(raw * drought_mult, weather_eps, 1.0))

    return df.apply(_weather_row, axis=1).to_numpy()


# ---------------------------------------------------------------------------
# VECTORIZED twin (operates on the whole (N, 21) matrix at once).
# ---------------------------------------------------------------------------
def weather_score_vectorized(df, params):
    p = _derive_params(params)
    baseline_days = p["baseline_days"]
    min_p, cum_thr, rain_first = p["min_p"], p["cum_thr"], p["rain_first"]
    drought_k, drought_mid, drought_floor = p["drought_k"], p["drought_mid"], p["drought_floor"]
    no_wet_penalty, weather_eps, cum_gamma = p["no_wet_penalty"], p["weather_eps"], p["cum_gamma"]
    dl_start_pct, dl_floor, dl_gamma = p["dl_start_pct"], p["dl_floor"], p["dl_gamma"]
    max_wet_eff, min_dry_eff = p["max_wet_eff"], p["min_dry_eff"]

    H = df[PRECIP_COLS].to_numpy(float)                       # (N, 21)
    H = np.where(np.isfinite(H), np.clip(H, 0.0, None), 0.0)
    hist_days = H.shape[1]                                     # 21 (constant)

    wet_mask = H >= min_p                                      # (N, 21)
    wet_count = wet_mask.sum(axis=1)                           # (N,)
    dry_count = hist_days - wet_count
    req_dry = (min_dry_eff if hist_days >= baseline_days
               else math.ceil(min_dry_eff * (hist_days / baseline_days)))

    today_p = df["TotalPrecipitation_mm"].to_numpy(float)     # (N,)
    today_ok = np.isfinite(today_p) & (today_p >= min_p)      # (N,) bool
    day_ok = today_ok.astype(float)

    cum_mm = H.sum(axis=1)                                     # (N,)
    scale = (hist_days / baseline_days)                        # scalar
    adj_thr = max(cum_thr * scale, 1e-9)                       # scalar
    cum_frac = np.minimum(1.0, cum_mm / adj_thr)
    cum_frac_eff = cum_frac ** cum_gamma

    ratio = cum_mm / adj_thr
    flood_pen = np.where(ratio <= 4, 1.0, 1.0 / (1.0 + 1.25 * (ratio - 4)))

    wet_factor = np.where(
        wet_count == 0, 0.0,
        np.where(wet_count <= max_wet_eff, 1.0,
                 np.maximum(0.0, 1.0 - 0.15 * (wet_count - max_wet_eff))))

    raw = (0.20 * wet_factor
           + 0.15 * (dry_count >= req_dry).astype(float)
           + 0.05 * day_ok
           + 0.60 * (cum_frac_eff * flood_pen))

    if rain_first:
        # hist_days == 21 >= 10 branch
        wet_early = (H[:, 6:10] >= min_p).mean(axis=1)
        dry_recent = (H[:, 0:4] < min_p).mean(axis=1)
        raw = np.minimum(1.0, raw + 0.25 * (wet_early * dry_recent))

    any_wet = wet_mask.any(axis=1)
    first_wet = np.argmax(wet_mask, axis=1)                    # first True index (0 if none)
    days_since_wet = np.where(any_wet, first_wet + 1, hist_days + 1).astype(float)
    days_since_wet = days_since_wet + (~today_ok).astype(float)

    pos = np.minimum(1.0, days_since_wet / baseline_days)
    t = (pos - dl_start_pct) / max(1e-9, (1.0 - dl_start_pct))
    decay = 1.0 - (1.0 - dl_floor) * (t ** dl_gamma)
    raw = np.where(pos > dl_start_pct, raw * decay, raw)
    raw = np.minimum(1.0, raw)

    sig = 1.0 / (1.0 + np.exp(-drought_k * (cum_frac_eff - drought_mid)))
    drought_mult = drought_floor + (1.0 - drought_floor) * sig
    drought_mult = np.where(wet_count == 0, drought_mult * no_wet_penalty, drought_mult)

    return np.clip(raw * drought_mult, weather_eps, 1.0)


def make_sample(n, seed):
    rng = np.random.default_rng(seed)
    # Mixed regimes: dry spells, wet spells, NaNs, and zero rows.
    H = rng.gamma(shape=0.4, scale=6.0, size=(n, LAG_DAYS))
    H[rng.random((n, LAG_DAYS)) < 0.45] = 0.0                 # many dry days
    H[rng.random((n, LAG_DAYS)) < 0.05] = np.nan              # sprinkle NaNs
    today = rng.gamma(shape=0.4, scale=6.0, size=n)
    today[rng.random(n) < 0.4] = 0.0
    today[rng.random(n) < 0.05] = np.nan
    df = pd.DataFrame(H, columns=PRECIP_COLS)
    df["TotalPrecipitation_mm"] = today
    return df


def main():
    regimes = {
        "cum_thr=5,  rain_first=False":  {"min_cumulative_rain": 5.0},
        "cum_thr=20, rain_first=False":  {"min_cumulative_rain": 20.0},
        "cum_thr=60, rain_first=False":  {"min_cumulative_rain": 60.0},
        "cum_thr=20, rain_first=True":   {"min_cumulative_rain": 20.0, "weather_preference": {"rain_first": True}},
        "cum_thr=0,  rain_first=False":  {"min_cumulative_rain": 0.0},
    }
    N = 30000
    df = make_sample(N, seed=12345)

    print(f"Sample: {N} rows x {LAG_DAYS} precip-lag cols (with NaNs / dry / wet mix)\n"
          + "=" * 78)
    all_ok = True
    for name, params in regimes.items():
        t0 = time.perf_counter(); ref = weather_score_apply(df, params); t_apply = time.perf_counter() - t0
        t0 = time.perf_counter(); vec = weather_score_vectorized(df, params); t_vec = time.perf_counter() - t0

        max_abs = float(np.nanmax(np.abs(ref - vec)))
        exact = np.array_equal(ref, vec)
        close = np.allclose(ref, vec, rtol=0, atol=1e-9, equal_nan=True)
        all_ok &= close
        print(f"{name}")
        print(f"   apply: {t_apply*1000:8.1f} ms   vectorized: {t_vec*1000:7.1f} ms   "
              f"speedup: {t_apply/max(t_vec,1e-9):6.1f}x")
        print(f"   max|diff|={max_abs:.2e}   exact_equal={exact}   allclose(atol=1e-9)={close}\n")

    print("=" * 78)
    print("RESULT:", "VECTORIZED MATCHES REFERENCE for all regimes." if all_ok
          else "MISMATCH — do NOT adopt; investigate.")


if __name__ == "__main__":
    main()

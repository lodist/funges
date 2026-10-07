# Weather timing skill, with an outing placebo

Finds from **14 June to 11 September 2026**, scored with the current code. Step 1 of #291.

## Verdict

**For most soil fungi, the weather side now has timing skill**, after subtracting the outing bias. Porcini, chanterelle and parasol use parameters set before the 2026 season, so their results are out of sample. Rain carries much of the skill: rain is episodic, so its signal cannot be the calendar in disguise.

**Wood-decay fungi run backwards.** Chicken of the woods, oyster and hen of the woods score their find days *below* their control days. Hen of the woods' temperature term alone is −0.227.

**Cleaner weather inputs show more skill.** On identical cases, ERA5 weather beats the stored weather, which is each day's day-0 forecast. #290 makes the same change in production.

The August test (`ae75c729`) found no weather skill. It ran before the 25 August switch to one-sided humidity (`a9323e85`), which stopped penalising the wettest days, and it covered early summer only.

## Results, pooled across regions

Net = percentile on find days minus the same species' percentile on bracket find days (0 = no skill), with 95% CI. The rain column is the moisture component alone.

| Species | n | Net, whole weather part | Net, rain only | Parameters fitted on 2026 sightings? |
| --- | ---: | --- | ---: | --- |
| Parasol | 417 | **+0.200** (0.168–0.230) | +0.156 | no |
| Eastern King Bolete | 80 | +0.184 (0.118–0.251) | +0.020 | yes (#276) |
| Matsutake | 31 | +0.175 (0.077–0.274) | −0.002 | yes (#282) |
| Porcini | 810 | **+0.172** (0.147–0.196) | +0.105 | no |
| Summer bolete | 218 | +0.169 (0.124–0.212) | +0.146 | split in #266 |
| Pine bolete | 99 | +0.157 (0.096–0.216) | +0.041 | split in #266 |
| Giant puffball | 403 | +0.135 (0.099–0.170) | +0.107 | yes (#282) |
| Shaggy mane | 440 | +0.119 (0.089–0.148) | +0.103 | yes (#282) |
| Pacific chanterelle | 28 | +0.116 (0.021–0.207) | +0.124 | split in #266 |
| Saffron milk cap | 260 | +0.104 (0.062–0.144) | +0.027 | yes (#282) |
| Chanterelle | 838 | **+0.063** (0.038–0.089) | +0.064 | no |
| Hedgehog | 262 | +0.059 (0.015–0.102) | −0.009 | yes (#282) |
| Rocky Mountain King | 63 | +0.056 (−0.045–0.149) | +0.043 | yes (#276) |
| Lion's mane | 57 | +0.037 (−0.070–0.147) | +0.062 | yes (#279) |
| Smooth chanterelle / Black chanterelle / Morel / Winter chanterelle | 51 / 225 / 27 / 117 | +0.017 / +0.013 / +0.016 / −0.007 (all n.s.) | | |
| **Oyster** | 1,883 | **−0.032** (−0.051 to −0.015) | +0.035 | yes (#277) |
| **Chicken of the woods** | 4,826 | **−0.042** (−0.058 to −0.027) | −0.021 | yes (#277) |
| **Hen of the woods** | 60 | **−0.103** (−0.192 to −0.011) | +0.094 | yes (#279) |

Four other species are not testable (fewer than 20 finds): St George's, bronze bolete, truffle and morel outside spring.

**Per region**, see `weather-skill-stored-2026-06-14_2026-09-11.json`. One result stands out: **USW porcini is inverted**, at −0.049 with rain −0.123 (n = 68). That is the western inversion from the August report, and it persists.

## Stored weather vs ERA5, same cases

A fixed 700-location sample, scored twice: with the stored WeatherAPI weather and with ERA5 at the same points.

| Pooled | Stored: net / rain | ERA5: net / rain |
| --- | --- | --- |
| Porcini (n = 73) | +0.120 / +0.021 | +0.140 / **+0.087** |
| Chanterelle (n = 66) | +0.008 / −0.015 | +0.050 / **+0.045** |
| Parasol (n = 35) | +0.210 / +0.215 | +0.257 / +0.181 |
| All species (n = 900) | +0.017 (−0.008–0.042) | **+0.037 (0.010–0.063)** |

The samples are small, but the direction is the one the rain-input check in #290 predicts.

## Method

- **Finds:** GBIF human observations, ≤5 km coordinate uncertainty. Each is matched (≤10 km) to the nearest base point across NE ∪ SE or USE ∪ USW, and deduplicated per species, location and day.
- **Controls:** the same location 14 and 21 days before and after the find. They share its weekday, sit outside its 7-day moisture window, and are symmetric, so a linear seasonal trend cancels. A find needs at least one usable control on each side.
- **Placebo:** perennial brackets, found by the same people on the same walks: *Fomes fomentarius*, *Fomitopsis pinicola*, *Ganoderma applanatum*, *F. mounceae*. Each species' weather part is scored on bracket find days too. The brackets came out at 0.44–0.56, so outings alone produce up to about +0.06.
- **Components:**
  - temp, humidity and rain (moisture) are the weather part's components, each ranked on its own;
  - static (altitude, pH, water) must come out at 0.5;
  - season is the calendar factor, reported for attribution only.

## Caveats

- **GBIF lags.** Many summer 2026 iNaturalist records are not in GBIF yet. Re-run in mid-November, when the autumn is in.
- **In-sample species.** Species whose parameters were fitted on 2026 sightings are partly in-sample; see the table.
- **Temperature and the season.** A temperature optimum peaks wherever the season does, and symmetric controls cannot cancel a peak. So the temperature component may partly be the calendar. The rain component has no such issue.
- **Static not exactly 0.5 (0.48–0.52).** On 15 June 2026, 52% of base points were remapped to a different fetch coordinate. Their static fields, and their weather source, change on that date. Finds whose control window straddles 15 June see the change.
- **Licensing.** ERA5 comes from the Open-Meteo archive, which is free for non-commercial use only.

## Re-run

```bash
python scripts/qa_weather_skill.py --cache <dir>                              # all locations, stored weather
python scripts/qa_weather_skill.py --cache <dir> --max-locations 700          # sample, stored weather
python scripts/qa_weather_skill.py --cache <dir> --max-locations 700 --weather era5
```

Two limits on the dates:
- `--end` must be at least 21 days before the newest stored day, and for ERA5 about 26 days before today.
- `--start` must be at least 63 days after the oldest stored day (12 April 2026).

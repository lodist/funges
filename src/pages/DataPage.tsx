import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Download, MapPin } from 'lucide-react';
import {
  loadForagingDataset,
  formatZoneLabel,
  type ForagingDataset,
  type ForagingRow,
  type RegionId,
} from '@/lib/data';
import { useSpeciesData } from '@/data/species';
import SEO from '@/components/SEO';
import { Route as DataRoute } from '@/routes/data';
import { cn } from '@/lib/utils';

const ZoneMap = lazy(() => import('@/components/ZoneMap'));

const REGIONS: { id: RegionId; label: string }[] = [
  { id: 'NE', label: 'North Europe' },
  { id: 'SE', label: 'South Europe' },
  { id: 'USW', label: 'US West' },
  { id: 'USE', label: 'US East' },
];

const DAY_OPTIONS = [7, 14, 30, 90, 365] as const;

function dayLabel(d: number): string {
  return d === 365 ? '1y' : `${d}d`;
}

const R2 = 'https://data.fung.es';

const REGION_FILES: Record<RegionId, { label: string; url: string }[]> = {
  NE: [
    {
      label: 'Weather data (.parquet)',
      url: `${R2}/EU/NE/NE_weather_data.parquet`,
    },
    { label: 'Base data (.csv)', url: `${R2}/EU/NE/NE_base.csv` },
    {
      label: 'Boundaries (.geojson)',
      url: `${R2}/EU/NE/NE_boundaries.geojson`,
    },
    {
      label: 'Wilderness triangles (.gpkg)',
      url: `${R2}/EU/NE/NE_clipped_triangles_wilderness.gpkg`,
    },
    {
      label: 'Species params (.txt)',
      url: `${R2}/EU/NE/NE_species_params.txt`,
    },
    {
      label: 'Unique coordinates (.json)',
      url: `${R2}/EU/NE/NE_unique_coordinates.json`,
    },
    {
      label: 'Wilderness data (.geojson)',
      url: `${R2}/EU/NE/NE_wilderness_data.geojson`,
    },
    {
      label: 'Forecast tiles (.mbtiles)',
      url: `${R2}/EU/NE/ne_forecast.mbtiles`,
    },
    { label: 'EU static info (.csv)', url: `${R2}/EU/EU_static_info.csv` },
  ],
  SE: [
    {
      label: 'Weather data (.parquet)',
      url: `${R2}/EU/SE/SE_weather_data.parquet`,
    },
    { label: 'Base data (.csv)', url: `${R2}/EU/SE/SE_base.csv` },
    {
      label: 'Boundaries (.geojson)',
      url: `${R2}/EU/SE/SE_boundaries.geojson`,
    },
    {
      label: 'Wilderness triangles (.gpkg)',
      url: `${R2}/EU/SE/SE_clipped_triangles_wilderness.gpkg`,
    },
    {
      label: 'Species params (.txt)',
      url: `${R2}/EU/SE/SE_species_params.txt`,
    },
    {
      label: 'Unique coordinates (.json)',
      url: `${R2}/EU/SE/SE_unique_coordinates.json`,
    },
    {
      label: 'Wilderness data (.geojson)',
      url: `${R2}/EU/SE/SE_wilderness_data.geojson`,
    },
    {
      label: 'Forecast tiles (.mbtiles)',
      url: `${R2}/EU/SE/se_forecast.mbtiles`,
    },
    { label: 'EU static info (.csv)', url: `${R2}/EU/EU_static_info.csv` },
  ],
  USE: [
    {
      label: 'Weather data (.parquet)',
      url: `${R2}/USA/USE/USE_weather_data.parquet`,
    },
    { label: 'Base data (.csv)', url: `${R2}/USA/USE/USE_base.csv` },
    {
      label: 'Boundaries (.geojson)',
      url: `${R2}/USA/USE/USE_boundaries.geojson`,
    },
    {
      label: 'Wilderness triangles (.gpkg)',
      url: `${R2}/USA/USE/USE_clipped_triangles_wilderness.gpkg`,
    },
    {
      label: 'Species params (.txt)',
      url: `${R2}/USA/USE/USE_species_params.txt`,
    },
    {
      label: 'Unique coordinates (.json)',
      url: `${R2}/USA/USE/USE_unique_coordinates.json`,
    },
    {
      label: 'Wilderness data (.geojson)',
      url: `${R2}/USA/USE/USE_wilderness_data.geojson`,
    },
    {
      label: 'Forecast tiles (.mbtiles)',
      url: `${R2}/USA/USE/use_forecast.mbtiles`,
    },
    { label: 'US static info (.csv)', url: `${R2}/USA/US_static_info.csv` },
  ],
  USW: [
    {
      label: 'Weather data (.parquet)',
      url: `${R2}/USA/USW/USW_weather_data.parquet`,
    },
    { label: 'Base data (.csv)', url: `${R2}/USA/USW/USW_base.csv` },
    {
      label: 'Boundaries (.geojson)',
      url: `${R2}/USA/USW/USW_boundaries.geojson`,
    },
    {
      label: 'Wilderness triangles (.gpkg)',
      url: `${R2}/USA/USW/USW_clipped_triangles_wilderness.gpkg`,
    },
    {
      label: 'Species params (.txt)',
      url: `${R2}/USA/USW/USW_species_params.txt`,
    },
    {
      label: 'Unique coordinates (.json)',
      url: `${R2}/USA/USW/USW_unique_coordinates.json`,
    },
    {
      label: 'Wilderness data (.geojson)',
      url: `${R2}/USA/USW/USW_wilderness_data.geojson`,
    },
    {
      label: 'Forecast tiles (.mbtiles)',
      url: `${R2}/USA/USW/usw_forecast.mbtiles`,
    },
    { label: 'US static info (.csv)', url: `${R2}/USA/US_static_info.csv` },
  ],
};

function formatDate(iso: string) {
  return iso.slice(5).replace('-', '/');
}

function tickInterval(days: number): number {
  if (days <= 7) return 0;
  if (days <= 14) return 1;
  if (days <= 30) return 4;
  if (days <= 90) return 9;
  return 29;
}

const TOOLTIP_STYLE = {
  borderRadius: 8,
  fontSize: 12,
  border: '1px solid rgba(128,128,128,0.2)',
  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
  padding: '6px 10px',
} as const;

function PillLegend({
  payload,
}: {
  payload?: Array<{ color: string; value: string }>;
}) {
  if (!payload?.length) return null;
  return (
    <div className='flex flex-wrap gap-2 justify-center mt-1'>
      {payload.map(entry => (
        <span
          key={entry.value}
          className='flex items-center gap-1.5 text-xs text-muted-foreground'
        >
          <span
            className='inline-block w-2 h-2 rounded-full flex-shrink-0'
            style={{ backgroundColor: entry.color }}
          />
          {entry.value}
        </span>
      ))}
    </div>
  );
}

function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className='inline-flex items-center gap-0.5 rounded-full bg-muted/60 p-1'>
      {options.map(option => {
        const isActive = option.value === value;
        return (
          <button
            key={option.value}
            type='button'
            onClick={() => onChange(option.value)}
            aria-pressed={isActive}
            className={cn(
              'rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors',
              isActive
                ? 'bg-card text-foreground shadow-[0_1px_4px_rgba(0,0,0,0.1)]'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

interface ChartCardProps {
  title: string;
  children: React.ReactNode;
}

function ChartCard({ title, children }: ChartCardProps) {
  return (
    <Card className='py-6 shadow-sm hover:shadow-md transition-shadow duration-200'>
      <CardHeader className='pb-2'>
        <CardTitle className='text-sm font-medium text-muted-foreground'>
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className='pt-0'>{children}</CardContent>
    </Card>
  );
}

export default function DataPage() {
  const { t } = useTranslation(['sidebar', 'common']);
  const speciesData = useSpeciesData();
  const { region: regionParam } = DataRoute.useSearch();

  const [dataset, setDataset] = useState<ForagingDataset | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [region, setRegion] = useState<RegionId>(regionParam ?? 'NE');
  const [zone, setZone] = useState<string>('');
  const [days, setDays] = useState<7 | 14 | 30 | 90 | 365>(7);
  const [selectedSpecies, setSelectedSpecies] = useState<string>('');

  // Load once on mount — zone init is handled by the zones effect below
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setLoadError(null);
    loadForagingDataset()
      .then(data => {
        if (cancelled) return;
        setDataset(data);
      })
      .catch(err => {
        if (cancelled) return;
        setLoadError(
          err instanceof Error ? err.message : 'Failed to load data'
        );
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const regionLabel = t(`common:data.regions.${region}`, {
    defaultValue: REGIONS.find(r => r.id === region)?.label ?? region,
  });

  const zones = useMemo(
    () => dataset?.regions[region]?.zones ?? [],
    [dataset, region]
  );

  // Reset to "all zones" when region changes
  useEffect(() => {
    if (zone !== '' && zones.length > 0 && !zones.includes(zone)) {
      setZone('');
    }
  }, [region, zones, zone]);

  const zoneData = useMemo(() => {
    if (!dataset) return [];
    const regionData = dataset.regions[region].data;
    // The dataset now extends 6 days into the future (rolling forecast window).
    // The data page is retrospective — charts, narrative and "latest scores" all
    // read the tail — so drop forward-dated rows and end the window at today.
    const today = new Date().toLocaleDateString('en-CA'); // local YYYY-MM-DD

    if (zone) {
      return regionData
        .filter(row => row.zone === zone && row.date <= today)
        .slice(-days);
    }

    // Aggregate all zones: group by date and average
    const byDate = new Map<string, ForagingRow[]>();
    for (const row of regionData) {
      if (row.date > today) continue;
      const rows = byDate.get(row.date) ?? [];
      rows.push(row);
      byDate.set(row.date, rows);
    }

    const weatherKeys = [
      'precip_mm',
      'temp_avg',
      'temp_min',
      'temp_max',
      'humidity',
      'wind_ms',
      'pressure_hpa',
    ] as const;

    const aggregated: ForagingRow[] = [];
    for (const [date, rows] of byDate) {
      const entry: ForagingRow = { date, zone: '' };
      for (const key of weatherKeys) {
        const vals = rows
          .map(r => r[key])
          .filter((v): v is number => v != null);
        if (vals.length)
          entry[key] =
            Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) /
            10;
      }
      const scoreKeys = new Set(rows.flatMap(r => Object.keys(r.scores ?? {})));
      if (scoreKeys.size) {
        entry.scores = {};
        for (const sk of scoreKeys) {
          const vals = rows
            .map(r => r.scores?.[sk])
            .filter((v): v is number => v != null);
          if (vals.length)
            entry.scores[sk] =
              Math.round(
                (vals.reduce((a, b) => a + b, 0) / vals.length) * 100
              ) / 100;
        }
      }
      aggregated.push(entry);
    }

    return aggregated.sort((a, b) => a.date.localeCompare(b.date)).slice(-days);
  }, [dataset, region, zone, days]);

  const speciesMap = useMemo(
    () => new Map(speciesData.map(s => [s.id, s.name])),
    [speciesData]
  );

  const speciesCategoryMap = useMemo(
    () => new Map(speciesData.map(s => [s.id, s.category])),
    [speciesData]
  );

  const CATEGORY_COLORS: Record<string, string> = {
    plant: '#5a8a3c',
    mushroom: '#8b5e3c',
    berry: '#7a2d6e',
    flower: '#d4789a',
    nut: '#b8860b',
  };

  const availableSpecies = useMemo(() => {
    const ids = new Set<string>();
    for (const row of zoneData) {
      for (const id of Object.keys(row.scores ?? {})) ids.add(id);
    }
    return Array.from(ids)
      .map(id => ({ id, name: speciesMap.get(id) ?? id }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [zoneData, speciesMap]);

  const resolvedSpecies = selectedSpecies || availableSpecies[0]?.id || '';

  const speciesLineColor =
    CATEGORY_COLORS[speciesCategoryMap.get(resolvedSpecies) ?? ''] ?? '#96be9a';

  const speciesOverTime = useMemo(
    () =>
      zoneData
        .map(row => ({
          date: row.date,
          score: row.scores?.[resolvedSpecies] ?? null,
        }))
        .filter((r): r is { date: string; score: number } => r.score != null),
    [zoneData, resolvedSpecies]
  );

  const topSpeciesToday = useMemo(() => {
    const latest = zoneData[zoneData.length - 1];
    if (!latest?.scores) return [];
    return Object.entries(latest.scores)
      .map(([id, score]) => ({ id, name: speciesMap.get(id) ?? id, score }))
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
  }, [zoneData, speciesMap]);

  const narrativeInsight = useMemo(() => {
    if (zoneData.length === 0) return null;

    const regionLabel = t(`common:data.regions.${region}`, {
      defaultValue: REGIONS.find(r => r.id === region)?.label ?? region,
    });
    const zoneLabel = zone
      ? (t(`common:data.zones.${zone}` as Parameters<typeof t>[0], {
          defaultValue: formatZoneLabel(zone),
        }) as unknown as string)
      : null;
    // daysLabel is computed below alongside other translated sub-parts
    const location = zoneLabel ? `${zoneLabel} (${regionLabel})` : regionLabel;

    const avg = (vals: number[]) =>
      vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;

    // Weather stats
    const rainVals = zoneData.map(r => r.precip_mm ?? 0);
    const totalRain = rainVals.reduce((s, v) => s + v, 0);
    const rainyDays = rainVals.filter(v => v > 1).length;
    const tempVals = zoneData
      .map(r => r.temp_avg)
      .filter((v): v is number => v != null);
    const avgTemp = avg(tempVals);
    const humidVals = zoneData
      .map(r => r.humidity)
      .filter((v): v is number => v != null);
    const avgHumidity = avg(humidVals);
    const windVals = zoneData
      .map(r => r.wind_ms)
      .filter((v): v is number => v != null);
    const avgWind = avg(windVals);

    // Pressure trend
    const pressureVals = zoneData
      .map(r => r.pressure_hpa)
      .filter((v): v is number => v != null);
    const pHalf = Math.max(1, Math.floor(pressureVals.length / 2));
    const pressureTrend =
      pressureVals.length >= 4
        ? (avg(pressureVals.slice(pHalf)) ?? 0) -
            (avg(pressureVals.slice(0, pHalf)) ?? 0) >
          2
          ? 'rising'
          : (avg(pressureVals.slice(pHalf)) ?? 0) -
                (avg(pressureVals.slice(0, pHalf)) ?? 0) <
              -2
            ? 'falling'
            : null
        : null;

    // Temp trend
    const tHalf = Math.max(1, Math.floor(tempVals.length / 2));
    const tempTrend =
      tempVals.length >= 4
        ? (avg(tempVals.slice(tHalf)) ?? 0) -
            (avg(tempVals.slice(0, tHalf)) ?? 0) >
          1.5
          ? 'warming'
          : (avg(tempVals.slice(tHalf)) ?? 0) -
                (avg(tempVals.slice(0, tHalf)) ?? 0) <
              -1.5
            ? 'cooling'
            : null
        : null;

    // Last significant rain — kept for the chip display only
    const reversedData = [...zoneData].reverse();
    const lastRainIdx = reversedData.findIndex(r => (r.precip_mm ?? 0) >= 8);
    const daysSinceRain = lastRainIdx === -1 ? null : lastRainIdx;

    // Rain-first flush pattern — mirrors the algorithm's rain_first bonus:
    // wet days 7–10 ago (hist[6:10]) + dry last 4 days (hist[0:4]) = fruiting conditions
    const minPrecip = 1.5;
    const days7to10ago = zoneData.length >= 10 ? zoneData.slice(-11, -7) : [];
    const days1to4ago = zoneData.length >= 5 ? zoneData.slice(-5, -1) : [];
    const wetEarlyFrac = days7to10ago.length
      ? days7to10ago.filter(r => (r.precip_mm ?? 0) >= minPrecip).length /
        days7to10ago.length
      : 0;
    const dryRecentFrac = days1to4ago.length
      ? days1to4ago.filter(r => (r.precip_mm ?? 0) < minPrecip).length /
        days1to4ago.length
      : 0;
    const rainFirstPattern = wetEarlyFrac >= 0.5 && dryRecentFrac >= 0.75;

    // Cumulative rain vs ~20mm species baseline (algorithm default for min_cumulative_rain)
    // measured over last 14 days — the typical historical window the algorithm uses
    const last14 = zoneData.slice(-Math.min(14, zoneData.length));
    const cumRain14 = last14.reduce((s, r) => s + (r.precip_mm ?? 0), 0);
    const rainSufficient = cumRain14 >= 20;
    const rainScarce = cumRain14 < 8;

    const flushTempOk = avgTemp != null && avgTemp >= 6 && avgTemp <= 22;
    const flushHumidOk = avgHumidity != null && avgHumidity >= 65;

    // Score stats
    const topScore = topSpeciesToday[0]?.score ?? 0;
    const topSpeciesName = topSpeciesToday[0]?.name ?? null;
    const latestScores = Object.values(
      zoneData[zoneData.length - 1]?.scores ?? {}
    );
    const scoringAbove5 = latestScores.filter(s => s >= 5).length;
    const scoringAbove3 = latestScores.filter(s => s >= 3).length;

    // Score peak within selected period
    const scoreByDay = zoneData.map(row => ({
      date: row.date,
      mean: avg(Object.values(row.scores ?? {})) ?? 0,
    }));
    const peakDay = scoreByDay.reduce(
      (best, cur) => (cur.mean > best.mean ? cur : best),
      scoreByDay[0]
    );
    const peakDaysAgo = peakDay
      ? zoneData.length - 1 - zoneData.findIndex(r => r.date === peakDay.date)
      : 0;
    const currentMeanScore = scoreByDay[scoreByDay.length - 1]?.mean ?? 0;

    // Score momentum: last 3 days vs prior 3
    const recentRows = zoneData.slice(-3);
    const priorRows = zoneData.slice(-6, -3);
    const avgScoreRecent = avg(
      recentRows.flatMap(r => Object.values(r.scores ?? {}))
    );
    const avgScorePrior = avg(
      priorRows.flatMap(r => Object.values(r.scores ?? {}))
    );
    const scoreMomentum =
      avgScoreRecent != null && avgScorePrior != null && priorRows.length > 0
        ? avgScoreRecent - avgScorePrior > 0.3
          ? 'improving'
          : avgScoreRecent - avgScorePrior < -0.3
            ? 'declining'
            : null
        : null;

    // Category breakdown of top 5
    const top5 = topSpeciesToday.slice(0, 5);
    const categoryCounts: Record<string, number> = {};
    for (const s of top5) {
      const cat = speciesCategoryMap.get(s.id) ?? 'other';
      categoryCounts[cat] = (categoryCounts[cat] ?? 0) + 1;
    }
    const dominantCategory =
      Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ??
      null;
    // Translate category label
    const catKey = dominantCategory
      ? `cat${dominantCategory.charAt(0).toUpperCase()}${dominantCategory.slice(1)}`
      : null;
    const catLabel = catKey
      ? t(`common:data.narrative.${catKey}` as Parameters<typeof t>[0], {
          defaultValue: dominantCategory ?? '',
        })
      : null;

    // Shorthand for narrative keys
    const tn = (key: string, opts?: Record<string, unknown>): string =>
      t(
        `common:data.narrative.${key}` as Parameters<typeof t>[0],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        opts as any
      ) as unknown as string;

    // Translated sub-parts
    const daysLabel =
      days === 365
        ? tn('yearLabel', { defaultValue: 'the past year' })
        : tn('daysLabel', {
            count: days,
            defaultValue: `the past ${days} days`,
          });

    const catSuffixEsp = catLabel
      ? tn('catSuffixEspecially', {
          catLabel,
          defaultValue: `, especially for ${catLabel}`,
        })
      : '';
    const catSuffixLead = catLabel
      ? tn('catSuffixLeading', {
          catLabel,
          defaultValue: `, with ${catLabel} leading`,
        })
      : '';
    const catSuffixWay = catLabel
      ? tn('catSuffixLeadingWay', {
          catLabel,
          defaultValue: `, with ${catLabel} leading the way`,
        })
      : '';

    const tempDescT =
      avgTemp == null
        ? ''
        : avgTemp > 22
          ? tn('tempWarm', { defaultValue: 'warm' })
          : avgTemp > 12
            ? tn('tempMild', { defaultValue: 'mild' })
            : avgTemp > 3
              ? tn('tempCool', { defaultValue: 'cool' })
              : tn('tempCold', { defaultValue: 'cold' });

    const trendSuffixT = tempTrend
      ? tn('trendSuffix', {
          trend:
            tempTrend === 'warming'
              ? tn('trendWarming', { defaultValue: 'warming' })
              : tn('trendCooling', { defaultValue: 'cooling' }),
          defaultValue: `, ${tempTrend} recently`,
        })
      : '';

    const humidSuffixT =
      avgHumidity != null
        ? tn('humidSuffix', {
            humidity: avgHumidity.toFixed(0),
            defaultValue: `, humidity averaging ${avgHumidity.toFixed(0)}%`,
          })
        : '';

    const rainyDaysStr = tn('rainyDays', {
      count: rainyDays,
      defaultValue: `${rainyDays} day${rainyDays !== 1 ? 's' : ''}`,
    });

    const rainDescT =
      totalRain > 50
        ? tn('rainHeavy', { defaultValue: 'heavy' })
        : totalRain > 15
          ? tn('rainModerate', { defaultValue: 'moderate' })
          : tn('rainLight', { defaultValue: 'light' });

    const sentences: string[] = [];

    // === SENTENCE 1: VERDICT ===
    if (avgTemp != null && avgTemp < 3) {
      sentences.push(tn('freezing', { location }));
    } else if (avgTemp != null && avgTemp > 25) {
      sentences.push(tn('tooWarm', { location }));
    } else if (flushTempOk && rainFirstPattern && flushHumidOk) {
      sentences.push(
        tn('flushPattern', {
          location,
          temp: avgTemp?.toFixed(0),
          humidity: avgHumidity?.toFixed(0),
          catSuffix: catSuffixEsp,
        })
      );
    } else if (flushTempOk && rainSufficient && flushHumidOk) {
      sentences.push(
        tn('wellAligned', {
          location,
          cumRain: cumRain14.toFixed(0),
          temp: avgTemp?.toFixed(0),
          catSuffix: catSuffixLead,
        })
      );
    } else if (flushTempOk && rainScarce) {
      sentences.push(
        tn('rainScarce', { location, cumRain: cumRain14.toFixed(0) })
      );
    } else if (!flushTempOk && rainSufficient) {
      sentences.push(
        tn('rainOkTempWrong', {
          location,
          cumRain: cumRain14.toFixed(0),
          temp: avgTemp?.toFixed(0),
        })
      );
    } else if (flushTempOk && rainSufficient && !flushHumidOk) {
      sentences.push(
        tn('rainOkHumidLow', { location, humidity: avgHumidity?.toFixed(0) })
      );
    } else if (topScore >= 7) {
      sentences.push(
        tn('goodConditions', {
          location,
          catSuffix: catSuffixLead,
          topSpecies: topSpeciesName ?? '',
          topScore: topScore.toFixed(1),
        })
      );
    } else {
      const missingParts: string[] = [];
      if (rainScarce)
        missingParts.push(tn('missingRain', { cumRain: cumRain14.toFixed(0) }));
      if (avgTemp != null && !flushTempOk)
        missingParts.push(tn('missingTemp', { temp: avgTemp.toFixed(0) }));
      if (avgHumidity != null && !flushHumidOk)
        missingParts.push(
          tn('missingHumidity', { humidity: avgHumidity.toFixed(0) })
        );
      sentences.push(
        missingParts.length > 0
          ? tn('slowMissing', { location, missing: missingParts.join(', ') })
          : tn('slowSeasonal', { location })
      );
    }

    // === SENTENCE 2: RAIN + TEMP CONTEXT ===
    sentences.push(
      totalRain > 3
        ? tn('rainGood', {
            totalRain: totalRain.toFixed(1),
            rainDesc: rainDescT,
            rainyDaysStr,
            daysLabel,
          })
        : tn('rainBare', { daysLabel, totalRain: totalRain.toFixed(1) })
    );
    if (avgTemp != null) {
      sentences.push(
        tn('tempContext', {
          temp: avgTemp.toFixed(1),
          tempDesc: tempDescT,
          trendSuffix: trendSuffixT,
          humidSuffix: humidSuffixT,
        })
      );
    }

    // === SENTENCE 3: SCORE PEAK + MOMENTUM ===
    if (peakDaysAgo === 0 && topScore > 3) {
      const climbSuffix =
        scoreMomentum === 'improving' ? tn('climbSuffix') : '';
      sentences.push(tn('scorePeakNow', { daysLabel, climbSuffix }));
    } else if (peakDaysAgo > 0 && peakDay.mean > currentMeanScore + 0.4) {
      const peakStr =
        peakDaysAgo === 1
          ? tn('yesterday')
          : tn('daysAgo', { count: peakDaysAgo });
      sentences.push(
        scoreMomentum === 'declining'
          ? tn('scorePeakFalling', { peakStr })
          : tn('scorePeakPast', { peakStr })
      );
    } else if (scoreMomentum === 'improving') {
      sentences.push(tn('scoreMomentumUp'));
    }

    // === SENTENCE 4: WIND ===
    if (avgWind != null && avgWind > 8)
      sentences.push(tn('windStrong', { wind: avgWind.toFixed(1) }));
    else if (avgWind != null && avgWind > 4)
      sentences.push(tn('windModerate', { wind: avgWind.toFixed(1) }));

    // === SENTENCE 5: PRESSURE ===
    if (pressureTrend === 'falling') sentences.push(tn('pressureFalling'));
    else if (pressureTrend === 'rising') sentences.push(tn('pressureRising'));

    // === SENTENCE 6: DIVERSITY ===
    if (top5.length > 0) {
      const diversityKey =
        scoringAbove5 >= 6
          ? 'diversityWide'
          : scoringAbove5 >= 3
            ? 'diversityGood'
            : scoringAbove3 >= 2
              ? 'diversityFew'
              : 'diversitySlim';
      sentences.push(tn(diversityKey, { catSuffix: catSuffixWay }));
    }

    const statChips = [
      { label: tn('chipRain'), value: `${totalRain.toFixed(1)} mm` },
      ...(daysSinceRain != null && daysSinceRain <= 14
        ? [
            {
              label: tn('chipLastRain'),
              value:
                daysSinceRain === 0 ? tn('today') : `${daysSinceRain}d ago`,
            },
          ]
        : []),
      ...(avgTemp != null
        ? [{ label: tn('chipTemp'), value: `${avgTemp.toFixed(1)}°C` }]
        : []),
      ...(avgHumidity != null
        ? [{ label: tn('chipHumidity'), value: `${avgHumidity.toFixed(0)}%` }]
        : []),
      ...(topScore > 0
        ? [{ label: tn('chipTopScore'), value: `${topScore.toFixed(1)} / 10` }]
        : []),
      ...(pressureTrend
        ? [
            {
              label: tn('chipPressure'),
              value:
                pressureTrend === 'falling'
                  ? tn('pressureFallingShort')
                  : tn('pressureRisingShort'),
            },
          ]
        : []),
    ];

    return { sentences, statChips };
  }, [zoneData, topSpeciesToday, speciesCategoryMap, region, zone, days, t]);

  if (isLoading) {
    return (
      <div className='flex h-full items-center justify-center p-8'>
        <Loader2 className='h-6 w-6 animate-spin text-muted-foreground' />
      </div>
    );
  }

  if (loadError || !dataset) {
    return (
      <div className='flex h-full items-center justify-center p-8 text-center'>
        <p className='text-sm text-muted-foreground'>
          {loadError ??
            t('common:error.loadFailed', {
              defaultValue: 'Unable to load data.',
            })}
        </p>
      </div>
    );
  }

  return (
    <div className='flex flex-col gap-6 p-4 md:p-6'>
      <SEO title={t('sidebar:data', { defaultValue: 'Data' })} />

      {/* Header */}
      <div className='text-center'>
        <h1 className='mb-2 text-4xl font-bold text-foreground'>
          {t('sidebar:data', { defaultValue: 'Data' })}
        </h1>
        <p className='text-sm text-muted-foreground'>
          {t('common:data.subtitle', {
            defaultValue:
              'Explore the data behind the foraging recommendations.',
          })}
        </p>
      </div>

      {/* Controls */}
      <div className='flex flex-wrap items-end justify-between gap-4'>
        <div className='flex flex-wrap items-end gap-4'>
          {/* Europe regions */}
          <div className='flex flex-col gap-1.5'>
            <span className='text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wide px-1'>
              {t('common:data.europe', { defaultValue: 'Europe' })}
            </span>
            <SegmentedControl
              options={REGIONS.filter(r => r.id === 'NE' || r.id === 'SE').map(
                r => ({
                  value: r.id,
                  label: t(`common:data.regions.${r.id}`, {
                    defaultValue: r.label,
                  }),
                })
              )}
              value={region}
              onChange={setRegion}
            />
          </div>

          {/* US regions */}
          <div className='flex flex-col gap-1.5'>
            <span className='text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wide px-1'>
              {t('common:data.unitedStates', {
                defaultValue: 'United States',
              })}
            </span>
            <SegmentedControl
              options={REGIONS.filter(
                r => r.id === 'USE' || r.id === 'USW'
              ).map(r => ({
                value: r.id,
                label: t(`common:data.regions.${r.id}`, {
                  defaultValue: r.label,
                }),
              }))}
              value={region}
              onChange={setRegion}
            />
          </div>

          {/* Time range */}
          <div className='flex flex-col gap-1.5'>
            <span className='text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wide px-1'>
              {t('common:data.timeRange', { defaultValue: 'Time range' })}
            </span>
            <SegmentedControl
              options={DAY_OPTIONS.map(d => ({
                value: d,
                label: dayLabel(d),
              }))}
              value={days}
              onChange={setDays}
            />
          </div>
        </div>

        {/* Download current region's data */}
        <Button asChild variant='outline' size='sm' className='gap-1.5'>
          <a
            href={REGION_FILES[region][0].url}
            target='_blank'
            rel='noreferrer'
            aria-label={`${t('common:common.download', { defaultValue: 'Download' })}: ${regionLabel}`}
          >
            <Download className='h-3.5 w-3.5' />
            {t('common:common.download', { defaultValue: 'Download' })}
          </a>
        </Button>
      </div>

      {/* Zone map */}
      <div className='flex flex-col gap-1.5'>
        <div
          className={cn(
            'inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
            zone
              ? 'bg-[var(--happy-100)] text-[var(--happy-900)]'
              : 'bg-muted text-muted-foreground'
          )}
        >
          <MapPin className='h-3 w-3 shrink-0' />
          {zone
            ? t('common:data.selectedZone', {
                defaultValue: 'Selected: {{zone}} — click again to show all',
                zone: t(
                  `common:data.zones.${zone}` as Parameters<typeof t>[0],
                  { defaultValue: formatZoneLabel(zone) }
                ),
              })
            : t('common:data.clickZone', {
                defaultValue: 'Showing all zones — click one to filter',
              })}
        </div>
        <Suspense
          fallback={
            <div className='flex items-center justify-center h-[280px] rounded-lg border bg-muted/30'>
              <Loader2 className='h-5 w-5 animate-spin text-muted-foreground' />
            </div>
          }
        >
          <ZoneMap
            zonesGeo={dataset.regions[region].zones_geo}
            selectedZone={zone}
            onZoneSelect={z => setZone(prev => (prev === z ? '' : z))}
            region={region}
            zoneLabelFn={z =>
              t(`common:data.zones.${z}` as Parameters<typeof t>[0], {
                defaultValue: formatZoneLabel(z),
              }) as unknown as string
            }
          />
        </Suspense>
      </div>

      {/* Dynamic narrative */}
      {narrativeInsight && (
        <div className='rounded-lg border bg-muted/20 px-4 py-3 space-y-2.5'>
          <div className='flex flex-wrap gap-2'>
            {narrativeInsight.statChips.map(chip => (
              <div
                key={chip.label}
                className='flex flex-col items-center rounded-md border bg-background px-3 py-1.5 text-center min-w-[72px]'
              >
                <span className='text-[10px] uppercase tracking-wide text-muted-foreground/60 leading-none mb-0.5'>
                  {chip.label}
                </span>
                <span className='text-sm font-medium leading-tight'>
                  {chip.value}
                </span>
              </div>
            ))}
          </div>
          <div className='space-y-1'>
            {narrativeInsight.sentences.map((s, i) => (
              // eslint-disable-next-line react/no-array-index-key
              <p key={i} className='text-sm text-muted-foreground leading-snug'>
                {s}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Charts — row 1: rainfall + temperature */}
      <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
        {/* Rainfall */}
        <ChartCard
          title={t('common:data.charts.rainfall', {
            defaultValue: 'Rainfall (mm)',
          })}
        >
          <ResponsiveContainer width='100%' height={220}>
            <BarChart
              data={zoneData}
              margin={{ top: 4, right: 8, left: -16, bottom: 0 }}
            >
              <defs>
                <linearGradient id='rainGrad' x1='0' y1='0' x2='0' y2='1'>
                  <stop offset='0%' stopColor='#7aace0' stopOpacity={0.95} />
                  <stop offset='100%' stopColor='#7aace0' stopOpacity={0.25} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray='2 4'
                vertical={false}
                stroke='rgba(128,128,128,0.15)'
              />
              <XAxis
                dataKey='date'
                tickFormatter={formatDate}
                tick={{ fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                interval={tickInterval(days)}
              />
              <YAxis
                unit='mm'
                tick={{ fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                formatter={(v: unknown) => [
                  `${v} mm`,
                  t('common:data.charts.rainfall', {
                    defaultValue: 'Rainfall',
                  }),
                ]}
                labelFormatter={(l: unknown) => formatDate(String(l))}
                contentStyle={TOOLTIP_STYLE}
              />
              <ReferenceLine
                y={20}
                stroke='#7aace0'
                strokeDasharray='3 3'
                strokeOpacity={0.5}
                label={{
                  value: '20mm',
                  position: 'insideTopRight',
                  fontSize: 10,
                  fill: '#7aace0',
                  opacity: 0.7,
                }}
              />
              <Bar
                dataKey='precip_mm'
                fill='url(#rainGrad)'
                radius={[4, 4, 0, 0]}
                name={t('common:data.charts.rainfall', {
                  defaultValue: 'Rainfall',
                })}
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Temperature */}
        <ChartCard
          title={t('common:data.charts.temperature', {
            defaultValue: 'Temperature (°C)',
          })}
        >
          <ResponsiveContainer width='100%' height={220}>
            <LineChart
              data={zoneData}
              margin={{ top: 4, right: 8, left: -16, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray='2 4'
                vertical={false}
                stroke='rgba(128,128,128,0.15)'
              />
              <XAxis
                dataKey='date'
                tickFormatter={formatDate}
                tick={{ fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                interval={tickInterval(days)}
              />
              <YAxis
                unit='°'
                tick={{ fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                labelFormatter={(l: unknown) => formatDate(String(l))}
                contentStyle={TOOLTIP_STYLE}
              />
              <Legend
                content={p => (
                  <PillLegend
                    payload={
                      (p.payload ?? []) as Array<{
                        color: string;
                        value: string;
                      }>
                    }
                  />
                )}
              />
              <Line
                type='monotone'
                dataKey='temp_max'
                stroke='#c4909c'
                dot={false}
                strokeWidth={1.5}
                activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }}
                name={t('common:data.tempMax', { defaultValue: 'Max' })}
              />
              <Line
                type='monotone'
                dataKey='temp_avg'
                stroke='#d4a870'
                dot={false}
                strokeWidth={2.5}
                activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }}
                name={t('common:data.tempAvg', { defaultValue: 'Avg' })}
              />
              <Line
                type='monotone'
                dataKey='temp_min'
                stroke='#96be9a'
                dot={false}
                strokeWidth={1.5}
                strokeDasharray='4 2'
                activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }}
                name={t('common:data.tempMin', { defaultValue: 'Min' })}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Charts — row 2: humidity + wind & pressure */}
      <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
        {/* Humidity */}
        <ChartCard
          title={t('common:data.charts.humidity', {
            defaultValue: 'Humidity (%)',
          })}
        >
          <ResponsiveContainer width='100%' height={220}>
            <AreaChart
              data={zoneData}
              margin={{ top: 4, right: 8, left: -16, bottom: 0 }}
            >
              <defs>
                <linearGradient id='humidGrad' x1='0' y1='0' x2='0' y2='1'>
                  <stop offset='0%' stopColor='#d4a870' stopOpacity={0.35} />
                  <stop offset='100%' stopColor='#d4a870' stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray='2 4'
                vertical={false}
                stroke='rgba(128,128,128,0.15)'
              />
              <XAxis
                dataKey='date'
                tickFormatter={formatDate}
                tick={{ fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                interval={tickInterval(days)}
              />
              <YAxis
                unit='%'
                domain={[0, 100]}
                tick={{ fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                formatter={(v: unknown) => [
                  `${v}%`,
                  t('common:data.charts.humidity', {
                    defaultValue: 'Humidity',
                  }),
                ]}
                labelFormatter={(l: unknown) => formatDate(String(l))}
                contentStyle={TOOLTIP_STYLE}
              />
              <Area
                type='monotone'
                dataKey='humidity'
                stroke='#d4a870'
                strokeWidth={2}
                fill='url(#humidGrad)'
                dot={false}
                activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }}
                name={t('common:data.charts.humidity', {
                  defaultValue: 'Humidity',
                })}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Wind & Pressure */}
        <ChartCard
          title={t('common:data.charts.windPressure', {
            defaultValue: 'Wind & Pressure',
          })}
        >
          <ResponsiveContainer width='100%' height={220}>
            <ComposedChart
              data={zoneData}
              margin={{ top: 4, right: 0, left: -16, bottom: 0 }}
            >
              <defs>
                <linearGradient id='windGrad' x1='0' y1='0' x2='0' y2='1'>
                  <stop offset='0%' stopColor='#b07080' stopOpacity={0.9} />
                  <stop offset='100%' stopColor='#b07080' stopOpacity={0.25} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray='2 4'
                vertical={false}
                stroke='rgba(128,128,128,0.15)'
              />
              <XAxis
                dataKey='date'
                tickFormatter={formatDate}
                tick={{ fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                interval={tickInterval(days)}
              />
              <YAxis
                yAxisId='wind'
                unit=' m/s'
                tick={{ fontSize: 11 }}
                width={52}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                yAxisId='pressure'
                orientation='right'
                unit=' hPa'
                tick={{ fontSize: 11 }}
                width={60}
                domain={['auto', 'auto']}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                labelFormatter={(l: unknown) => formatDate(String(l))}
                contentStyle={TOOLTIP_STYLE}
              />
              <Legend
                content={p => (
                  <PillLegend
                    payload={
                      (p.payload ?? []) as Array<{
                        color: string;
                        value: string;
                      }>
                    }
                  />
                )}
              />
              <Bar
                yAxisId='wind'
                dataKey='wind_ms'
                fill='url(#windGrad)'
                radius={[3, 3, 0, 0]}
                name={t('common:data.charts.wind', {
                  defaultValue: 'Wind (m/s)',
                })}
              />
              <Line
                type='monotone'
                yAxisId='pressure'
                dataKey='pressure_hpa'
                stroke='#c9a227'
                dot={false}
                strokeWidth={2}
                activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }}
                name={t('common:data.charts.pressure', {
                  defaultValue: 'Pressure (hPa)',
                })}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Charts — row 3: score over time + top species */}
      <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
        {/* Score over time */}
        {availableSpecies.length > 0 && (
          <ChartCard
            title={t('common:data.charts.speciesScore', {
              defaultValue: 'Score Over Time',
            })}
          >
            <div className='flex flex-wrap items-center gap-2 mb-3'>
              <span className='text-xs font-medium uppercase tracking-wide text-muted-foreground/60 shrink-0'>
                {t('common:data.species', { defaultValue: 'Species' })}
              </span>
              <Select
                value={resolvedSpecies}
                onValueChange={setSelectedSpecies}
              >
                <SelectTrigger size='sm' className='max-w-[180px]'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableSpecies.map(s => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {speciesOverTime.length === 0 ? (
              <div className='flex items-center justify-center h-[180px] text-sm text-muted-foreground'>
                {t('common:data.noData', {
                  defaultValue: 'No data for selected zone',
                })}
              </div>
            ) : (
              <ResponsiveContainer width='100%' height={180}>
                <AreaChart
                  data={speciesOverTime}
                  margin={{ top: 4, right: 8, left: -16, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray='2 4'
                    vertical={false}
                    stroke='rgba(128,128,128,0.15)'
                  />
                  <XAxis
                    dataKey='date'
                    tickFormatter={formatDate}
                    tick={{ fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    interval={tickInterval(days)}
                  />
                  <YAxis
                    domain={[0, 10]}
                    tick={{ fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    formatter={(v: unknown) => [
                      (v as number).toFixed(2),
                      t('common:data.score', { defaultValue: 'Score' }),
                    ]}
                    labelFormatter={(l: unknown) => formatDate(String(l))}
                    contentStyle={TOOLTIP_STYLE}
                  />
                  <Area
                    type='monotone'
                    dataKey='score'
                    stroke={speciesLineColor}
                    strokeWidth={2.5}
                    fill={speciesLineColor}
                    fillOpacity={0.12}
                    dot={false}
                    activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }}
                    name={t('common:data.score', { defaultValue: 'Score' })}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        )}

        {/* Top species */}
        <ChartCard
          title={t('common:data.charts.topSpecies', {
            defaultValue: 'Top Foraging Species — Latest Scores',
          })}
        >
          {topSpeciesToday.length === 0 ? (
            <div className='flex items-center justify-center h-[220px] text-sm text-muted-foreground'>
              {t('common:data.noData', {
                defaultValue: 'No data for selected zone',
              })}
            </div>
          ) : (
            <ResponsiveContainer width='100%' height={220}>
              <BarChart
                data={topSpeciesToday}
                layout='vertical'
                margin={{ top: 4, right: 24, left: 4, bottom: 0 }}
              >
                <defs>
                  <linearGradient id='topSpecGrad' x1='0' y1='0' x2='1' y2='0'>
                    <stop offset='0%' stopColor='#96be9a' stopOpacity={0.45} />
                    <stop
                      offset='100%'
                      stopColor='#96be9a'
                      stopOpacity={0.95}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray='2 4'
                  horizontal={false}
                  stroke='rgba(128,128,128,0.15)'
                />
                <XAxis
                  type='number'
                  domain={[0, 10]}
                  ticks={[0, 2, 4, 6, 8, 10]}
                  tick={{ fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type='category'
                  dataKey='name'
                  tick={{ fontSize: 11 }}
                  width={90}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  formatter={(v: unknown) => [
                    (v as number).toFixed(1),
                    t('common:data.score', { defaultValue: 'Score' }),
                  ]}
                  contentStyle={TOOLTIP_STYLE}
                />
                <ReferenceLine
                  x={5}
                  stroke='rgba(128,128,128,0.25)'
                  strokeDasharray='3 3'
                />
                <Bar
                  dataKey='score'
                  fill='url(#topSpecGrad)'
                  radius={[0, 4, 4, 0]}
                  name={t('common:data.score', { defaultValue: 'Score' })}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>
    </div>
  );
}

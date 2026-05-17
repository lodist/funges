import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Download } from 'lucide-react';
import {
  loadDataNerdDataset,
  formatZoneLabel,
  type DataNerdDataset,
  type DataNerdRow,
  type RegionId,
} from '@/lib/data-nerd';
import { useSpeciesData } from '@/data/species';
import SEO from '@/components/SEO';

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

const R2 = 'https://pub-9988c4492e7945f0a2ff14e35232acdf.r2.dev';

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
      label: 'Mushroom tiles (.mbtiles)',
      url: `${R2}/EU/NE/ne_mushroom_data.mbtiles`,
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
      label: 'Mushroom tiles (.mbtiles)',
      url: `${R2}/EU/SE/se_mushroom_data.mbtiles`,
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
      label: 'Mushroom tiles (.mbtiles)',
      url: `${R2}/USA/USE/use_mushroom_data.mbtiles`,
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
      label: 'Mushroom tiles (.mbtiles)',
      url: `${R2}/USA/USW/usw_mushroom_data.mbtiles`,
    },
    { label: 'US static info (.csv)', url: `${R2}/USA/US_static_info.csv` },
  ],
};

function formatDate(iso: string) {
  return iso.slice(5).replace('-', '/');
}

interface ChartCardProps {
  title: string;
  children: React.ReactNode;
}

function ChartCard({ title, children }: ChartCardProps) {
  return (
    <Card>
      <CardHeader className='pb-2'>
        <CardTitle className='text-sm font-medium text-muted-foreground'>
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className='pt-0'>{children}</CardContent>
    </Card>
  );
}

export default function DataNerdPage() {
  const { t } = useTranslation(['sidebar', 'common']);
  const speciesData = useSpeciesData();

  const [dataset, setDataset] = useState<DataNerdDataset | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [region, setRegion] = useState<RegionId>('NE');
  const [zone, setZone] = useState<string>('');
  const [days, setDays] = useState<7 | 14 | 30 | 90 | 365>(7);

  // Load once on mount — zone init is handled by the zones effect below
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setLoadError(null);
    loadDataNerdDataset()
      .then(data => {
        if (cancelled) return;
        setDataset(data);
      })
      .catch(err => {
        if (cancelled) return;
        setLoadError(
          err instanceof Error
            ? err.message
            : t('common:error.loadFailed', {
                defaultValue: 'Failed to load data',
              })
        );
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

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

    if (zone) {
      return regionData.filter(row => row.zone === zone).slice(-days);
    }

    // Aggregate all zones: group by date and average
    const byDate = new Map<string, DataNerdRow[]>();
    for (const row of regionData) {
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

    const aggregated: DataNerdRow[] = [];
    for (const [date, rows] of byDate) {
      const entry: DataNerdRow = { date, zone: '' };
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

  const topSpeciesToday = useMemo(() => {
    const latest = zoneData[zoneData.length - 1];
    if (!latest?.scores) return [];
    return Object.entries(latest.scores)
      .map(([id, score]) => ({ id, name: speciesMap.get(id) ?? id, score }))
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
  }, [zoneData, speciesMap]);

  if (isLoading) {
    return (
      <div className='flex h-full items-center justify-center'>
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
      <SEO title={t('sidebar:dataNerd', { defaultValue: 'Data' })} />

      {/* Header */}
      <h1 className='text-2xl font-bold tracking-tight'>
        {t('sidebar:dataNerd', { defaultValue: 'Data' })}
      </h1>

      {/* Controls */}
      <div className='flex flex-wrap gap-3 items-end'>
        {/* Europe regions */}
        <div className='flex flex-col gap-0.5'>
          <span className='text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wide px-1'>
            {t('common:dataNerd.europe', { defaultValue: 'Europe' })}
          </span>
          <div className='flex gap-1'>
            {REGIONS.filter(r => r.id === 'NE' || r.id === 'SE').map(r => (
              <div key={r.id} className='flex flex-col gap-1'>
                <button
                  onClick={() => setRegion(r.id)}
                  className={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${
                    region === r.id
                      ? 'bg-primary text-primary-foreground font-medium'
                      : 'hover:bg-muted text-muted-foreground'
                  }`}
                >
                  {r.label}
                </button>
                <a
                  href={REGION_FILES[r.id][0].url}
                  target='_blank'
                  rel='noreferrer'
                  className='flex items-center justify-center py-1 rounded-md border hover:bg-muted transition-colors text-muted-foreground'
                >
                  <Download className='h-3.5 w-3.5' />
                </a>
              </div>
            ))}
          </div>
        </div>

        {/* US regions */}
        <div className='flex flex-col gap-0.5'>
          <span className='text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wide px-1'>
            {t('common:dataNerd.unitedStates', {
              defaultValue: 'United States',
            })}
          </span>
          <div className='flex gap-1'>
            {REGIONS.filter(r => r.id === 'USE' || r.id === 'USW').map(r => (
              <div key={r.id} className='flex flex-col gap-1'>
                <button
                  onClick={() => setRegion(r.id)}
                  className={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${
                    region === r.id
                      ? 'bg-primary text-primary-foreground font-medium'
                      : 'hover:bg-muted text-muted-foreground'
                  }`}
                >
                  {r.label}
                </button>
                <a
                  href={REGION_FILES[r.id][0].url}
                  target='_blank'
                  rel='noreferrer'
                  className='flex items-center justify-center py-1 rounded-md border hover:bg-muted transition-colors text-muted-foreground'
                >
                  <Download className='h-3.5 w-3.5' />
                </a>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Zone map */}
      <div className='flex flex-col gap-1'>
        <p className='text-xs text-muted-foreground'>
          {zone
            ? t('common:dataNerd.selectedZone', {
                defaultValue: 'Selected: {{zone}} — click again to show all',
                zone: formatZoneLabel(zone),
              })
            : t('common:dataNerd.clickZone', {
                defaultValue: 'Showing all zones — click one to filter',
              })}
        </p>
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
          />
        </Suspense>
      </div>

      {/* Days filter — below the map, above the charts */}
      <div className='flex rounded-lg border overflow-hidden w-fit text-sm'>
        {DAY_OPTIONS.map(d => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={`px-3 py-1.5 transition-colors ${
              days === d
                ? 'bg-primary text-primary-foreground font-medium'
                : 'hover:bg-muted text-muted-foreground'
            }`}
          >
            {dayLabel(d)}
          </button>
        ))}
      </div>

      {/* Charts grid */}
      <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
        {/* Rainfall */}
        <ChartCard
          title={t('common:dataNerd.charts.rainfall', {
            defaultValue: 'Rainfall (mm)',
          })}
        >
          <ResponsiveContainer width='100%' height={220}>
            <BarChart
              data={zoneData}
              margin={{ top: 4, right: 8, left: -16, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray='3 3' vertical={false} />
              <XAxis
                dataKey='date'
                tickFormatter={formatDate}
                tick={{ fontSize: 11 }}
              />
              <YAxis unit='mm' tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(v: number) => [
                  `${v} mm`,
                  t('common:dataNerd.charts.rainfall', {
                    defaultValue: 'Rainfall',
                  }),
                ]}
                labelFormatter={formatDate}
              />
              <Bar
                dataKey='precip_mm'
                fill='#7aace0'
                radius={[3, 3, 0, 0]}
                name={t('common:dataNerd.charts.rainfall', {
                  defaultValue: 'Rainfall',
                })}
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Temperature */}
        <ChartCard
          title={t('common:dataNerd.charts.temperature', {
            defaultValue: 'Temperature (°C)',
          })}
        >
          <ResponsiveContainer width='100%' height={220}>
            <LineChart
              data={zoneData}
              margin={{ top: 4, right: 8, left: -16, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray='3 3' vertical={false} />
              <XAxis
                dataKey='date'
                tickFormatter={formatDate}
                tick={{ fontSize: 11 }}
              />
              <YAxis unit='°' tick={{ fontSize: 11 }} />
              <Tooltip labelFormatter={formatDate} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line
                dataKey='temp_max'
                stroke='#c4909c'
                dot={false}
                strokeWidth={1.5}
                name={t('common:dataNerd.tempMax', { defaultValue: 'Max' })}
              />
              <Line
                dataKey='temp_avg'
                stroke='#d4a870'
                dot={false}
                strokeWidth={2}
                name={t('common:dataNerd.tempAvg', { defaultValue: 'Avg' })}
              />
              <Line
                dataKey='temp_min'
                stroke='#96be9a'
                dot={false}
                strokeWidth={1.5}
                name={t('common:dataNerd.tempMin', { defaultValue: 'Min' })}
                strokeDasharray='4 2'
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Humidity */}
        <ChartCard
          title={t('common:dataNerd.charts.humidity', {
            defaultValue: 'Humidity (%)',
          })}
        >
          <ResponsiveContainer width='100%' height={220}>
            <LineChart
              data={zoneData}
              margin={{ top: 4, right: 8, left: -16, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray='3 3' vertical={false} />
              <XAxis
                dataKey='date'
                tickFormatter={formatDate}
                tick={{ fontSize: 11 }}
              />
              <YAxis unit='%' domain={[0, 100]} tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(v: number) => [
                  `${v}%`,
                  t('common:dataNerd.charts.humidity', {
                    defaultValue: 'Humidity',
                  }),
                ]}
                labelFormatter={formatDate}
              />
              <Line
                dataKey='humidity'
                stroke='#d4a870'
                dot={false}
                strokeWidth={2}
                name={t('common:dataNerd.charts.humidity', {
                  defaultValue: 'Humidity',
                })}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Top species today */}
        <ChartCard
          title={t('common:dataNerd.charts.topSpecies', {
            defaultValue: 'Top Foraging Species — Latest Scores',
          })}
        >
          {topSpeciesToday.length === 0 ? (
            <div className='flex items-center justify-center h-[220px] text-sm text-muted-foreground'>
              {t('common:dataNerd.noData', {
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
                <CartesianGrid strokeDasharray='3 3' horizontal={false} />
                <XAxis type='number' domain={[0, 10]} tick={{ fontSize: 11 }} />
                <YAxis
                  type='category'
                  dataKey='name'
                  tick={{ fontSize: 11 }}
                  width={90}
                />
                <Tooltip
                  formatter={(v: number) => [
                    v.toFixed(1),
                    t('common:dataNerd.score', { defaultValue: 'Score' }),
                  ]}
                />
                <Bar
                  dataKey='score'
                  fill='#96be9a'
                  radius={[0, 3, 3, 0]}
                  name={t('common:dataNerd.score', { defaultValue: 'Score' })}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>
    </div>
  );
}

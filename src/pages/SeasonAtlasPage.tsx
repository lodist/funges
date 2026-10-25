import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import SEO from '@/components/SEO';
import { DataTabs } from '@/components/DataTabs';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton';
import { Slider } from '@/components/ui/slider';
import { useSpeciesData } from '@/data/species';
import { ArrowRight, Pause, Play } from '@/lib/icons';
import {
  ATLAS_BASE,
  ATLAS_RAMP,
  type AtlasIndex,
  type AtlasPlace,
  type AtlasPlaceSummary,
  blendMonths,
  curveAt,
  dayOfYear,
  projection,
  seasonWindows,
} from '@/lib/season-atlas';
import { monthRange } from '@/lib/seasons';
import { cn } from '@/lib/utils';
import { Route } from '@/routes/data_.seasons.$place.$species';

/** The species a place opens on when the one in the URL has no curve there. */
const PREFERRED = ['mushroom', 'morel', 'chant'];
/** A month counts as in season from half its place's peak. */
const IN_SEASON = 0.5;
/** Between this and IN_SEASON a season is starting or winding down, not over:
 *  a country's curve averages places that are still going. */
const SHOULDER = 0.2;
/** Local records from which a place's curve is its own (the season grid's shipping bar);
 *  below it the curve leans on similar climates, and under RARE the species is hardly seen. */
const SOLID_RECORDS = 150;
const RARE_RECORDS = 10;

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${ATLAS_BASE}${path}`);
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  return (await response.json()) as T;
}

/** The ramp stop for a value, as on the map: the band's deep green for nothing, mint at the peak. */
function rampColour(value: number) {
  return ATLAS_RAMP[
    Math.round(Math.min(Math.max(value, 0), 1) * (ATLAS_RAMP.length - 1))
  ];
}

function useImage(src: string) {
  const [loaded, setLoaded] = useState<{
    src: string;
    image: HTMLImageElement;
  }>();
  useEffect(() => {
    let live = true;
    const image = new Image();
    image.onload = () => live && setLoaded({ src, image });
    image.src = src;
    return () => {
      live = false;
    };
  }, [src]);
  return loaded?.src === src ? loaded.image : null;
}

function usePlaceName() {
  const { t, i18n } = useTranslation('common');
  const regions = useMemo(() => {
    try {
      return new Intl.DisplayNames([i18n.language], { type: 'region' });
    } catch {
      return null;
    }
  }, [i18n.language]);
  return (
    place: Pick<AtlasPlaceSummary, 'kind' | 'iso' | 'name' | 'continent'>
  ) => {
    if (place.kind === 'continent')
      return t(place.continent === 'EU' ? 'data.europe' : 'data.unitedStates');
    if (place.kind === 'country' && place.iso) {
      try {
        return regions?.of(place.iso) ?? place.name;
      } catch {
        return place.name;
      }
    }
    return place.name;
  };
}

function AtlasMap({
  place,
  speciesKey,
  day,
  label,
}: {
  place: AtlasPlace;
  speciesKey: string;
  day: number;
  label: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);
  const image = useImage(`${ATLAS_BASE}${place.id}/${speciesKey}.webp`);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(entry.contentRect.width)
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const map = useMemo(() => {
    if (!width) return null;
    const proj = projection(
      place.extent,
      width,
      Math.min(640, window.innerHeight * 0.7)
    );
    const land = new Path2D();
    for (const ring of place.land) {
      ring.forEach(([lon, lat], i) =>
        i
          ? land.lineTo(proj.x(lon), proj.y(lat))
          : land.moveTo(proj.x(lon), proj.y(lat))
      );
      land.closePath();
    }
    return { proj, land };
  }, [place, width]);

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext('2d');
    if (!el || !ctx || !map) return;
    const { proj, land } = map;
    const dpr = window.devicePixelRatio || 1;
    el.width = Math.round(proj.width * dpr);
    el.height = Math.round(proj.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, proj.width, proj.height);
    // The ramp's "nothing" until the frames load, so the place never flashes empty.
    ctx.fillStyle = ATLAS_RAMP[0];
    ctx.fill(land, 'nonzero');
    if (image) {
      // The day between its two month mids: the earlier frame, the later one over it.
      const [a, b, f] = blendMonths(day);
      const [fw, fh] = place.frame;
      ctx.save();
      // Outer rings only (enclaves are filled), so any winding is land.
      ctx.clip(land, 'nonzero');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(image, 0, a * fh, fw, fh, 0, 0, proj.width, proj.height);
      if (f > 0) {
        ctx.globalAlpha = f;
        ctx.drawImage(image, 0, b * fh, fw, fh, 0, 0, proj.width, proj.height);
      }
      ctx.restore();
    }
    // Mid-ramp borders: they show on deep green, on lit land and against the page.
    ctx.lineWidth = 0.75;
    ctx.strokeStyle = 'rgba(71, 200, 110, 0.6)';
    ctx.stroke(land);
  }, [map, image, day, place]);

  return (
    <div ref={wrap} className='w-full'>
      {map ? (
        <canvas
          ref={canvas}
          role='img'
          aria-label={label}
          style={{ width: map.proj.width, height: map.proj.height }}
        />
      ) : (
        <SkeletonGroup>
          <Skeleton className='h-80 w-full rounded-xl' />
        </SkeletonGroup>
      )}
    </div>
  );
}

export default function SeasonAtlasPage() {
  const { t, i18n } = useTranslation(['common', 'sidebar']);
  const { place: placeId, species: speciesSlug } = Route.useParams();
  const navigate = useNavigate();
  const placeName = usePlaceName();
  const speciesData = useSpeciesData();
  const speciesName = (key: string) =>
    speciesData.find(s => s.id === key)?.name ?? key;

  const index = useQuery({
    queryKey: ['season-atlas', 'index'],
    queryFn: () => fetchJson<AtlasIndex>('index.json'),
    staleTime: Infinity,
  });
  const summary = index.data?.places.find(p => p.id === placeId);
  const place = useQuery({
    queryKey: ['season-atlas', placeId],
    queryFn: () => fetchJson<AtlasPlace>(`${placeId}.json`),
    enabled: Boolean(summary),
    staleTime: Infinity,
  });
  const slugs = useMemo(() => index.data?.slugs ?? {}, [index.data]);
  const speciesKey = Object.keys(slugs).find(k => slugs[k] === speciesSlug);

  const open = (
    to: AtlasPlaceSummary,
    key: string | undefined,
    replace = false
  ) => {
    const pick =
      (key && to.species.includes(key) ? key : undefined) ??
      PREFERRED.find(k => to.species.includes(k)) ??
      to.species[0];
    navigate({
      to: '/data/seasons/$place/$species',
      params: { place: to.id, species: slugs[pick] ?? pick },
      replace,
    });
  };

  // A species this place has no curve for: the place's usual one instead.
  const missing =
    summary && !(speciesKey && summary.species.includes(speciesKey));
  useEffect(() => {
    if (missing && summary) open(summary, speciesKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missing, summary, speciesKey]);

  const today = dayOfYear(new Date());
  const [day, setDay] = useState(today);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(
      () => setDay(d => ((d + 2) % 365) + 1),
      80
    );
    return () => window.clearInterval(timer);
  }, [playing]);

  const language = i18n.language;
  const monthLong = new Intl.DateTimeFormat(language, { month: 'long' });
  const monthName = (m: number) => monthLong.format(new Date(2026, m, 15));
  const monthLetter = new Intl.DateTimeFormat(language, { month: 'narrow' });
  const dayLabel = (d: number) =>
    new Intl.DateTimeFormat(language, {
      day: 'numeric',
      month: 'short',
    }).format(new Date(2026, 0, d));

  const pName = summary ? placeName(summary) : '';
  const sName = speciesKey ? speciesName(speciesKey) : '';
  const curve = speciesKey ? place.data?.species[speciesKey] : undefined;
  const title =
    summary && speciesKey
      ? t('data.atlas.title', { species: sName, place: pName })
      : t('data.tabs.seasons');

  const sentences = useMemo(() => {
    if (!curve) return [];
    const values = curve.curve;
    const span = ([a, b]: [number, number]) =>
      a === b ? monthName(a) : monthRange([a, b], language);
    const windows = seasonWindows(values, IN_SEASON);
    const lines = [
      t('data.atlas.peak', {
        month: monthName(values.indexOf(Math.max(...values))),
      }),
    ];
    if (windows.length === 1 && windows[0][0] === 0 && windows[0][1] === 11)
      lines.push(t('data.atlas.allYear'));
    else if (windows.length === 1)
      lines.push(t('data.atlas.window', { months: span(windows[0]) }));
    else if (windows.length > 1)
      lines.push(
        t('data.atlas.windows', {
          first: windows.slice(0, -1).map(span).join(', '),
          last: span(windows[windows.length - 1]),
        })
      );
    const now = curveAt(values, today);
    if (now >= IN_SEASON) lines.push(t('data.atlas.now'));
    else if (now >= SHOULDER)
      lines.push(
        curveAt(values, ((today + 14) % 365) + 1) > now
          ? t('data.atlas.starting')
          : t('data.atlas.ending')
      );
    else {
      const month = new Date().getMonth();
      const next = windows
        .map(w => w[0])
        .sort((p, q) => ((p - month + 12) % 12) - ((q - month + 12) % 12))[0];
      if (next !== undefined)
        lines.push(t('data.atlas.next', { month: monthName(next) }));
    }
    return lines;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curve, language, today, t]);

  const [a, b, f] = blendMonths(day);
  const dayMonth = f < 0.5 ? a : b;

  const byName = (list: AtlasPlaceSummary[]) =>
    list
      .map(p => ({ ...p, label: placeName(p) }))
      .sort((p, q) => p.label.localeCompare(q.label, language));
  const places = index.data?.places ?? [];
  const groups = [
    {
      id: 'continents',
      items: byName(places.filter(p => p.kind === 'continent')),
    },
    {
      id: 'countries',
      items: byName(places.filter(p => p.kind === 'country')),
    },
    { id: 'states', items: byName(places.filter(p => p.kind === 'state')) },
  ];
  const speciesOptions = (summary?.species ?? [])
    .map(key => ({ key, label: speciesName(key) }))
    .sort((p, q) => p.label.localeCompare(q.label, language));

  return (
    <div className='container mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8'>
      <SEO title={title} description={t('data.atlas.subtitle')} />

      <div>
        <h1 className='text-3xl leading-tight font-semibold text-balance text-foreground sm:text-4xl'>
          {t('sidebar:data', { defaultValue: 'Data' })}
        </h1>
        <p className='mt-3 text-lg text-muted-foreground'>
          {t('data.atlas.subtitle')}
        </p>
      </div>

      <DataTabs active='seasons' />

      {index.isError || (index.data && !summary) ? (
        <div className='flex flex-col items-start gap-4'>
          <p className='text-muted-foreground'>
            {index.isError
              ? t('data.atlas.unavailable')
              : t('data.atlas.notFound')}
          </p>
          {index.data ? (
            <Button asChild variant='outline'>
              <Link
                to='/data/seasons/$place/$species'
                params={{
                  place: 'europe',
                  species: slugs.mushroom ?? 'porcini',
                }}
              >
                {t('data.atlas.openEurope')}
              </Link>
            </Button>
          ) : null}
        </div>
      ) : (
        <>
          <div className='flex flex-wrap items-end gap-4'>
            <div className='flex flex-col gap-1.5'>
              <span className='type-micro px-1 text-muted-foreground'>
                {t('data.atlas.place')}
              </span>
              <Select
                value={summary?.id}
                onValueChange={id => {
                  const to = places.find(p => p.id === id);
                  if (to) open(to, speciesKey);
                }}
              >
                <SelectTrigger
                  className='min-w-56'
                  aria-label={t('data.atlas.place')}
                >
                  <SelectValue placeholder={t('data.atlas.place')} />
                </SelectTrigger>
                <SelectContent>
                  {groups.map(group =>
                    group.items.length ? (
                      <SelectGroup key={group.id}>
                        <SelectLabel>
                          {t(`data.atlas.groups.${group.id}`)}
                        </SelectLabel>
                        {group.items.map(p => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ) : null
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className='flex flex-col gap-1.5'>
              <span className='type-micro px-1 text-muted-foreground'>
                {t('data.atlas.species')}
              </span>
              <Select
                value={speciesKey}
                onValueChange={key => summary && open(summary, key)}
              >
                <SelectTrigger
                  className='min-w-56'
                  aria-label={t('data.atlas.species')}
                >
                  <SelectValue placeholder={t('data.atlas.species')} />
                </SelectTrigger>
                <SelectContent>
                  {speciesOptions.map(s => (
                    <SelectItem key={s.key} value={s.key}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <h2 className='text-xl font-semibold text-balance text-foreground'>
            {title}
          </h2>

          <section className='grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]'>
            <div className='flex min-w-0 flex-col gap-4'>
              {/* The day sits above the map, so it stays in view with it. */}
              <div className='flex items-center gap-4'>
                <Button
                  variant='outline'
                  aria-pressed={playing}
                  onClick={() => setPlaying(p => !p)}
                >
                  {playing ? <Pause /> : <Play />}
                  {playing ? t('data.atlas.pause') : t('data.atlas.play')}
                </Button>
                <Slider
                  className='flex-1'
                  min={1}
                  max={365}
                  step={1}
                  value={[day]}
                  onValueChange={([d]) => {
                    setPlaying(false);
                    setDay(d);
                  }}
                  aria-label={t('data.atlas.day')}
                  formatValue={dayLabel}
                />
                <span className='min-w-16 shrink-0 text-right text-base font-semibold whitespace-nowrap text-foreground tabular-nums'>
                  {dayLabel(day)}
                </span>
              </div>

              {place.data && speciesKey && !missing ? (
                <AtlasMap
                  place={place.data}
                  speciesKey={speciesKey}
                  day={day}
                  label={t('data.atlas.mapLabel', {
                    species: sName,
                    place: pName,
                    date: dayLabel(day),
                  })}
                />
              ) : (
                <SkeletonGroup>
                  <Skeleton className='h-80 w-full rounded-xl' />
                </SkeletonGroup>
              )}

              <div className='flex items-center gap-2 text-sm text-muted-foreground'>
                <span>{t('data.atlas.legendLow')}</span>
                <span
                  aria-hidden='true'
                  className='h-2.5 w-40 rounded-full ring-1 ring-border'
                  style={{
                    background: `linear-gradient(90deg, ${ATLAS_RAMP.join(', ')})`,
                  }}
                />
                <span>{t('data.atlas.legendHigh')}</span>
              </div>
            </div>

            <div className='flex flex-col gap-5'>
              {curve ? (
                <>
                  <div className='flex flex-col gap-2'>
                    <p className='type-micro text-muted-foreground'>
                      {t('data.atlas.curveLabel')}
                    </p>
                    <ol
                      aria-hidden='true'
                      // On the map's "nothing", so a near-white peak still reads on paper.
                      className='grid h-28 grid-cols-12 gap-1 rounded-lg p-1.5'
                      style={{ backgroundColor: ATLAS_RAMP[0] }}
                    >
                      {Array.from({ length: 12 }, (_, m) => (
                        <li
                          key={m}
                          className='flex items-end overflow-hidden rounded-sm'
                          // The slider's month framed in the ramp's lightest step.
                          style={
                            m === dayMonth
                              ? {
                                  boxShadow: `inset 0 0 0 1.5px ${ATLAS_RAMP[ATLAS_RAMP.length - 1]}`,
                                }
                              : undefined
                          }
                        >
                          <span
                            className='w-full'
                            style={{
                              height: `${Math.max(curve.curve[m] * 100, 4)}%`,
                              backgroundColor: rampColour(curve.curve[m]),
                            }}
                          />
                        </li>
                      ))}
                    </ol>
                    <ol aria-hidden='true' className='grid grid-cols-12 gap-1'>
                      {Array.from({ length: 12 }, (_, m) => (
                        <li
                          key={m}
                          className={cn(
                            'text-center text-xs',
                            m === dayMonth
                              ? 'font-semibold text-foreground'
                              : 'text-muted-foreground'
                          )}
                        >
                          {monthLetter.format(new Date(2026, m, 15))}
                        </li>
                      ))}
                    </ol>
                  </div>

                  <p className='leading-relaxed text-foreground'>
                    {sentences.join(' ')}
                  </p>
                  <p className='text-sm leading-relaxed text-muted-foreground'>
                    {t('data.atlas.note', { species: sName })}{' '}
                    {curve.records >= SOLID_RECORDS
                      ? t('data.atlas.records', {
                          formatted: curve.records.toLocaleString(language),
                        })
                      : curve.records >= RARE_RECORDS
                        ? t('data.atlas.fewRecords', {
                            formatted: curve.records.toLocaleString(language),
                          })
                        : t('data.atlas.rareRecords')}
                  </p>
                  {speciesKey ? (
                    <Button asChild variant='outline' className='self-start'>
                      <Link to='/map' search={{ species: speciesKey }}>
                        {t('data.atlas.forecast')}
                        <ArrowRight />
                      </Link>
                    </Button>
                  ) : null}
                </>
              ) : (
                <SkeletonGroup>
                  <Skeleton className='h-48 w-full rounded-xl' />
                </SkeletonGroup>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

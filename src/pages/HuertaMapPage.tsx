import { useEffect, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { HuertaCropPicker } from '@/components/HuertaCropPicker';
import { HuertaWeek } from '@/components/HuertaWeek';
import SEO from '@/components/SEO';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  BAND_ACTIVE_CLASS,
  BAND_GHOST_CLASS,
  BAND_SURFACE_CLASS,
} from '@/lib/band-surface';
import {
  bands,
  grid,
  monthCodes,
  PALETTES,
  shapes,
  type MapLayer,
  type MapSource,
  type Shapes,
} from '@/lib/garden-map';
import { CROPS, statusGroup, type PlaceAdvice } from '@/lib/huerta';
import {
  fetchAdvice,
  fetchMapLayer,
  fetchMapNight,
  huertaApiConfigured,
  MAP_REGIONS,
  saveMapView,
  savedMapView,
  savedPlace,
  savePlace,
  type MapRegion,
  type MapView,
  type Place,
} from '@/lib/huerta-api';
import {
  Droplets,
  MapPinned,
  Snowflake,
  Sprout,
  Thermometer,
  X,
} from '@/lib/icons';
import { ONLINE_MAX_ZOOM } from '@/lib/offline-packages';
import { protocol } from '@/lib/pmtiles-protocol';
import { cn } from '@/lib/utils';
import { HILLSHADE_LAYER_ID, useMapStore } from '@/store/mapStore';
import MapThemeSelector from '@/components/MapThemeSelector';

maplibregl.setWorkerUrl(maplibreWorkerUrl);
maplibregl.addProtocol('pmtiles', protocol.tile);

type Continent = keyof typeof MAP_REGIONS;
const LAYERS: MapLayer[] = ['crop', 'frost', 'soil', 'water'];
const LAYER_ICON: Record<MapLayer, typeof Sprout> = {
  crop: Sprout,
  frost: Snowflake,
  soil: Thermometer,
  water: Droplets,
};
/** Roughly where each continent's places are: its layer loads once in view. */
const BOX: Record<Continent, [number, number, number, number]> = {
  eu: [-25, 34, 45, 72],
  us: [-125, 24, -66, 50],
};
const inView = (m: maplibregl.Map) => {
  const b = m.getBounds();
  return (Object.keys(BOX) as Continent[]).filter(c => {
    const [w, s, e, n] = BOX[c];
    return (
      b.getWest() < e && b.getEast() > w && b.getSouth() < n && b.getNorth() > s
    );
  });
};

/** The spot's card and its margin, from the map's left edge (desktop). */
const CARD_PX = 480;

/** Where the map opens: where it was left, else the garden, else where
 *  Terra's map was left. */
function startView(): MapView {
  const saved = savedMapView();
  if (saved) return saved;
  const home = savedPlace();
  if (home) return { center: [home.lon, home.lat], zoom: 6 };
  const { center, zoom } = useMapStore.getState();
  return { center, zoom };
}
/** Terra's basemap style without its species layers, its sprite and glyph
 *  paths made absolute (the files give them relative to the site). */
async function basemapStyle(
  path: string
): Promise<maplibregl.StyleSpecification> {
  const base = new URL(import.meta.env.BASE_URL, window.location.origin);
  // The style picked in Terra's map picker (the store keeps it, shared).
  const file = path.replace(/^\//, '');
  const style = (await (
    await fetch(new URL(file, base))
  ).json()) as maplibregl.StyleSpecification;
  if (typeof style.sprite === 'string')
    style.sprite = new URL(style.sprite, base).href;
  if (style.glyphs) style.glyphs = decodeURI(new URL(style.glyphs, base).href);
  // Terra's species layers stay with Terra.
  const terra = (source: unknown) => String(source).startsWith('overlay-');
  style.layers = style.layers.filter(l => !('source' in l) || !terra(l.source));
  for (const id of Object.keys(style.sources))
    if (terra(id)) delete style.sources[id];
  return style;
}

/** The relief layer on or off, if the style has one. */
const relief = (m: maplibregl.Map, on: boolean) => {
  if (m.getLayer(HILLSHADE_LAYER_ID))
    m.setLayoutProperty(
      HILLSHADE_LAYER_ID,
      'visibility',
      on ? 'visible' : 'none'
    );
};

const HATCH = 'huerta-hatch';
/** The too-late hatching: thin diagonal lines in the palette's line colour,
 *  a tile that joins up with its neighbours. */
function hatch(m: maplibregl.Map, dark: boolean) {
  if (m.hasImage(HATCH)) return;
  const size = 16;
  const tile = document.createElement('canvas');
  tile.width = tile.height = size;
  const pen = tile.getContext('2d')!;
  pen.strokeStyle = PALETTES[dark ? 'dark' : 'light'].line;
  pen.lineWidth = 2;
  pen.beginPath();
  for (const shift of [-size, 0, size]) {
    pen.moveTo(shift, size);
    pen.lineTo(shift + size, 0);
  }
  pen.stroke();
  m.addImage(HATCH, pen.getImageData(0, 0, size, size), { pixelRatio: 2 });
}

/** A continent's shapes on the map, under the basemap's labels: the
 *  colours, the hatching, and the line where the forecast ends. */
function show(
  m: maplibregl.Map,
  continent: Continent,
  data: Shapes,
  dark: boolean
) {
  const id = `garden-${continent}`;
  const source = m.getSource(id) as maplibregl.GeoJSONSource | undefined;
  if (source) return source.setData(data);
  hatch(m, dark);
  // Unsimplified: a band's holes share edges with its outline, and zoomed
  // out each ring was simplified on its own, so they crossed and the map
  // drew wedges across the sea.
  m.addSource(id, { type: 'geojson', data, tolerance: 0 });
  const firstLabel = m.getStyle().layers.find(l => l.type === 'symbol')?.id;
  // Fainter close in: the places are about 7 km apart, and there the
  // streets show where a garden is.
  const fade = (opacity: maplibregl.ExpressionSpecification | number) =>
    [
      'interpolate',
      ['linear'],
      ['zoom'],
      6,
      opacity,
      9,
      ['*', opacity, 0.75],
      12,
      ['*', opacity, 0.4],
    ] as maplibregl.ExpressionSpecification;
  m.addLayer(
    {
      id,
      type: 'fill',
      source: id,
      filter: ['has', 'fill'],
      paint: {
        'fill-color': ['get', 'fill'],
        'fill-opacity': fade(['get', 'opacity']),
      },
    },
    firstLabel
  );
  m.addLayer(
    {
      id: `${id}-hatch`,
      type: 'fill',
      source: id,
      filter: ['has', 'hatch'],
      paint: { 'fill-pattern': HATCH, 'fill-opacity': fade(1) },
    },
    firstLabel
  );
  m.addLayer(
    {
      id: `${id}-edge`,
      type: 'line',
      source: id,
      filter: ['has', 'edge'],
      paint: {
        'line-color': PALETTES[dark ? 'dark' : 'light'].line,
        'line-width': ['interpolate', ['linear'], ['zoom'], 3, 1, 9, 2],
      },
    },
    firstLabel
  );
}

/** What a layer is drawn from: frost from the week's coldest hour and
 *  water from its balance where the night's files carry them, else the old
 *  codes. */
const sourceOf = (layer: MapLayer, layers: string[]): MapSource =>
  layer === 'frost' && layers.includes('cold')
    ? 'cold'
    : layer === 'water' && layers.includes('balance')
      ? 'balance'
      : layer;

/** A continent's layer as shapes, its regions' places together: where two
 *  regions meet, one shape runs on across. The crop layer in `month` (1-12)
 *  is that month of a typical year; 0, this week. `months`: the night's
 *  files carry the crop's months (nights before them did not). */
async function drawContinent(
  continent: Continent,
  layer: MapLayer,
  crop: string,
  dark: boolean,
  month: number
): Promise<{ data: Shapes; source: MapSource; months: boolean }> {
  const year = [`${crop}_jan_aug`, `${crop}_sep_dec`];
  const load = async (region: MapRegion, again: boolean) => {
    const night = await fetchMapNight(region, again);
    const source = sourceOf(layer, night.layers);
    const months = year.every(name => night.layers.includes(name));
    const read = (name: string) => fetchMapLayer(region, night.day, name);
    const [janAug, sepDec] =
      layer === 'crop' && month && months
        ? await Promise.all(year.map(read))
        : [];
    return {
      source,
      months,
      places: night.places,
      values:
        janAug && sepDec
          ? monthCodes(janAug, sepDec, month)
          : await read(layer === 'crop' ? crop : source),
    };
  };
  // A 409 means the night run moved on since the index was read.
  const parts = await Promise.all(
    MAP_REGIONS[continent].map(region =>
      load(region, false).catch(() => load(region, true))
    )
  );
  const places = new Int16Array(parts.reduce((n, p) => n + p.places.length, 0));
  const values = new Uint8Array(places.length / 2);
  let at = 0;
  for (const part of parts) {
    places.set(part.places, 2 * at);
    values.set(part.values, at);
    at += part.values.length;
  }
  // ponytail: both regions are written by one night's code; the first says
  // which source the continent is drawn from.
  const source = parts[0].source;
  return {
    data: shapes(grid(places), source, values, dark),
    source,
    months: parts.every(p => p.months),
  };
}

/** The calendar month (1-12) `ahead` months from this one. */
const monthAhead = (ahead: number) =>
  ((new Date().getMonth() + ahead) % 12) + 1;

export default function HuertaMapPage() {
  const { t } = useTranslation('huerta');
  const isMobile = useIsMobile();
  const phone = useRef(isMobile);
  phone.current = isMobile;
  const open = useRef(false);
  const navigate = useNavigate();
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const marker = useRef<maplibregl.Marker | null>(null);
  // The continents looked at so far: their layers stay drawn.
  const [shown, setShown] = useState<Continent[]>([]);
  // Per continent, the drawing asked for last (layer:crop) and the one on show.
  const wanted = useRef(new Map<Continent, string>());
  // The advice at the map's centre, for the crop panel's status filter.
  const [centre, setCentre] = useState<PlaceAdvice | null | undefined>();
  const [crop, setCrop] = useState('garlic');
  const mapStyle = useMapStore(state => state.mapStyle);
  // The dark basemaps take the palette turned round.
  const dark = /dark/.test(mapStyle);
  const hillshadeVisible = useMapStore(state => state.hillshadeVisible);
  const [layer, setLayer] = useState<MapLayer>('crop');
  // What each layer was last drawn from, for its legend.
  const [sources, setSources] = useState<Partial<Record<MapLayer, MapSource>>>(
    {}
  );
  // The timeline: how many months ahead the crop layer shows (0: this week),
  // and the one drawn, once the slider rests (a drawing takes a moment).
  const [ahead, setAhead] = useState(0);
  const [drawnAhead, setDrawnAhead] = useState(0);
  useEffect(() => {
    const rest = window.setTimeout(() => setDrawnAhead(ahead), 250);
    return () => window.clearTimeout(rest);
  }, [ahead]);
  const month = layer === 'crop' && drawnAhead ? monthAhead(drawnAhead) : 0;
  // Whether the night's files carry the crop's months, for the timeline.
  const [months, setMonths] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  // advice: undefined while it loads, null where Huerta has no place.
  const [picked, setPicked] = useState<{
    place: Place;
    advice?: PlaceAdvice | null;
  } | null>(null);

  // The map itself, on Terra's basemap in the style picked there; a new
  // style makes a new map (as Terra's does), which draws its layers anew.
  useEffect(() => {
    let live = true;
    let m: maplibregl.Map | null = null;
    const drawn = wanted.current;
    basemapStyle(mapStyle)
      .then(style => {
        if (!live || !container.current) return;
        m = new maplibregl.Map({
          container: container.current,
          style,
          ...startView(),
          minZoom: 2.5,
          maxZoom: ONLINE_MAX_ZOOM, // as Terra's: down to a street
          attributionControl: false,
        });
        m.dragRotate.disable();
        m.touchZoomRotate.disableRotation();
        const look = () => {
          const here = m!.getCenter();
          saveMapView({ center: [here.lng, here.lat], zoom: m!.getZoom() });
          const seen = inView(m!);
          setShown(prev =>
            seen.every(c => prev.includes(c))
              ? prev
              : [...new Set([...prev, ...seen])]
          );
        };
        m.on('load', () => {
          relief(m!, useMapStore.getState().hillshadeVisible);
          setReady(true);
          look();
        });
        m.on('moveend', look);
        m.on('click', event => {
          // With a card open, a click elsewhere only closes it.
          if (open.current) return setPicked(null);
          setPicked({
            place: { lat: event.lngLat.lat, lon: event.lngLat.lng },
          });
          // The card opens bottom left (the lower half, on a phone): a spot it
          // would hide moves into the open part of the map.
          const { x, y } = event.point;
          const h = m!.getContainer().clientHeight;
          const hidden = phone.current
            ? y > h * 0.4
            : x < CARD_PX && y > h - 520;
          if (hidden)
            m!.easeTo({
              center: event.lngLat,
              offset: phone.current ? [0, -h / 4] : [CARD_PX / 2, 0],
            });
        });
        map.current = m;
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
      m?.remove();
      map.current = null;
      drawn.clear();
      setReady(false);
      setPicked(null);
    };
  }, [mapStyle]);

  // Relief shading, switched in the picker as on Terra's map.
  useEffect(() => {
    if (ready && map.current) relief(map.current, hillshadeVisible);
  }, [ready, hillshadeVisible]);

  // The chosen layer, drawn for every continent looked at; one already
  // showing it is left alone.
  useEffect(() => {
    const m = map.current;
    if (!ready || !m || !huertaApiConfigured) return;
    const key = `${layer}:${crop}:${month}`;
    setFailed(false);
    for (const continent of shown) {
      if (wanted.current.get(continent) === key) continue;
      wanted.current.set(continent, key);
      drawContinent(continent, layer, crop, dark, month)
        .then(({ data, source, months }) => {
          if (wanted.current.get(continent) !== key || map.current !== m)
            return;
          show(m, continent, data, dark);
          setSources(prev => ({ ...prev, [layer]: source }));
          if (layer === 'crop') setMonths(months);
        })
        .catch(() => {
          if (wanted.current.get(continent) !== key) return;
          wanted.current.delete(continent); // the next change tries again
          setFailed(true);
        });
    }
  }, [ready, shown, layer, crop, dark, month]);

  // The place tapped: a marker, and its own advice for the card.
  useEffect(() => {
    open.current = picked !== null;
    const m = map.current;
    marker.current?.remove();
    if (!picked || !m) return;
    marker.current = new maplibregl.Marker({ color: '#782c0c' })
      .setLngLat([picked.place.lon, picked.place.lat])
      .addTo(m);
    if (picked.advice !== undefined || !huertaApiConfigured) return;
    let live = true;
    fetchAdvice(picked.place, false)
      .then(advice => live && setPicked(p => (p ? { ...p, advice } : p)))
      .catch(() => live && setPicked(p => (p ? { ...p, advice: null } : p)));
    return () => {
      live = false;
    };
  }, [picked]);

  const layerName = (l: MapLayer) => t(`map.layers.${l}`);

  // The crop panel opened: its status filter is for the spot picked, else
  // for the map's centre.
  const lookAround = () => {
    const m = map.current;
    if (picked || !m || !huertaApiConfigured) return;
    const { lat, lng } = m.getCenter();
    setCentre(undefined);
    fetchAdvice({ lat, lon: lng }, false)
      .then(setCentre)
      .catch(() => setCentre(null));
  };

  return (
    <>
      <SEO
        title={t('map.title')}
        description={t('map.description')}
        canonicalUrl={`${import.meta.env.BASE_URL}huerta/map`}
      />
      <div className={cn('relative', isMobile ? 'h-full' : '-m-4 h-screen')}>
        <div ref={container} className='h-full w-full' />
        <div className='pointer-events-none absolute inset-x-0 top-0 flex flex-col gap-2 p-3 sm:p-4'>
          <div className='pointer-events-auto self-start'>
            <HuertaCropPicker
              crop={crop}
              // The map stays on the layer being looked at (frost, soil,
              // water); the crop layer shows the new crop.
              onPick={setCrop}
              advice={picked ? picked.advice : centre}
              onOpen={lookAround}
            />
          </div>
        </div>
        {/* The layers as Terra's tool rail: one band-coloured column, top right.
            On a phone it steps aside while a spot's card is open. */}
        <div
          hidden={isMobile && picked !== null}
          role='group'
          aria-label={t('map.layer')}
          className={cn(
            'absolute top-2 right-4 z-20 flex flex-col gap-1 rounded-full p-1 elevation-raised',
            BAND_SURFACE_CLASS
          )}
        >
          {LAYERS.map(l => (
            <Button
              key={l}
              type='button'
              variant='ghost'
              size='icon'
              aria-pressed={layer === l}
              aria-label={layerName(l)}
              title={layerName(l)}
              onClick={() => setLayer(l)}
              className={layer === l ? BAND_ACTIVE_CLASS : BAND_GHOST_CLASS}
            >
              {(() => {
                const Icon = LAYER_ICON[l];
                return <Icon className='h-4 w-4' />;
              })()}
            </Button>
          ))}
          <MapThemeSelector onBand />
        </div>
        <div
          className={cn(
            'pointer-events-none absolute inset-x-0 flex flex-col items-start gap-2 p-3 sm:p-4',
            isMobile ? 'bottom-28' : 'bottom-0'
          )}
        >
          {picked ? (
            <PlaceCard
              compact={isMobile}
              advice={picked.advice}
              crop={crop}
              onUse={() => {
                savePlace(picked.place);
                navigate({ to: '/huerta/planner' });
              }}
              onClose={() => setPicked(null)}
            />
          ) : null}
          {picked && isMobile ? null : (
            <Legend
              source={sources[layer] ?? layer}
              title={layerName(layer)}
              failed={failed}
              dark={dark}
              ahead={layer === 'crop' && months ? ahead : null}
              onAhead={setAhead}
            />
          )}
        </div>
      </div>
    </>
  );
}

/** A palette colour as CSS, without the map's transparency. */
const css = ([r, g, b]: readonly number[]) => `rgb(${r},${g},${b})`;

function Legend({
  source,
  title,
  failed,
  dark,
  ahead,
  onAhead,
}: {
  /** What the layer on show is drawn from. */
  source: MapSource;
  /** The layer's name: the rail shows only its icon. */
  title: string;
  failed: boolean;
  /** The basemap is a dark one: its palette. */
  dark: boolean;
  /** Months ahead on the timeline; null: no timeline (another layer, or a
   *  night without the crop's months). */
  ahead: number | null;
  onAhead: (ahead: number) => void;
}) {
  const { t } = useTranslation('huerta');
  const palette = PALETTES[dark ? 'dark' : 'light'];
  // The hatching over its wash, in the legend's own ink (its card follows
  // the app's theme, not the basemap's).
  const hatched = `repeating-linear-gradient(135deg, var(--color-muted-foreground) 0 1.5px, transparent 1.5px 4px), ${css(palette.wash)}`;
  const keys: [string, string][] =
    source === 'crop'
      ? [
          [
            css(palette.crop.now),
            t(ahead ? 'map.legend.month' : 'map.legend.now'),
          ],
          [css(palette.crop.wait), t('map.legend.wait')],
          [hatched, t('map.legend.over')],
        ]
      : source === 'frost'
        ? [
            [css(palette.frost[2]), t('map.legend.frost')],
            [css(palette.frost[1]), t('map.legend.ground')],
            [css(palette.frost[0]), t('map.legend.later')],
          ]
        : [];
  // A ramp's bands, as the map draws them.
  const steps = bands(source, dark).fills.filter(
    (fill): fill is Exclude<typeof fill, 'over' | null> =>
      fill !== null && fill !== 'over'
  );
  const what =
    source === 'cold' || source === 'balance'
      ? t(`map.legend.${source}`)
      : null;
  const timed = ahead !== null;
  return (
    // On the band, as Terra's map dock.
    <div
      className={cn(
        'pointer-events-auto rounded-card p-3 text-sm elevation-raised',
        BAND_SURFACE_CLASS,
        timed && 'flex w-full max-w-sm flex-col gap-3'
      )}
    >
      {timed ? <Timeline ahead={ahead} onAhead={onAhead} /> : null}
      {failed || source === 'crop' ? null : (
        // The crop layer's rows already say it: sow or plant now, not yet, too late.
        <p className='font-semibold text-happy-50'>{title}</p>
      )}
      {what && !failed ? (
        <p className='text-xs text-happy-100'>{what}</p>
      ) : null}
      {failed || source === 'crop' ? null : <span className='block h-2' />}
      {failed ? (
        <p className='text-happy-100'>{t('map.failed')}</p>
      ) : keys.length > 0 ? (
        <ul
          className={cn(
            'flex gap-1.5',
            // Under the timeline, a row: the map keeps more of the screen.
            timed ? 'flex-wrap gap-x-4' : 'flex-col'
          )}
        >
          {keys.map(([fill, label]) => (
            <li key={label} className='flex items-center gap-2 text-happy-50'>
              <span
                className='size-3.5 shrink-0 rounded-sm border border-happy-50/60'
                style={{ background: fill }}
              />
              {label}
            </li>
          ))}
        </ul>
      ) : (
        <div className='flex w-48 flex-col gap-1'>
          <span className='flex h-3 overflow-hidden rounded-sm border border-happy-50/60'>
            {steps.map(fill => (
              <span
                key={css(fill)}
                className='flex-1'
                style={{ background: css(fill) }}
              />
            ))}
          </span>
          <span className='flex justify-between text-xs text-happy-100'>
            <span>{t(`map.legend.${source}Low`)}</span>
            <span>{t(`map.legend.${source}High`)}</span>
          </span>
        </div>
      )}
      {timed ? (
        <p className='text-xs text-happy-100'>{t('map.year.note')}</p>
      ) : null}
    </div>
  );
}

/** A slider from this week to a year ahead, a month a step, on the band as
 *  Terra's map dock draws its days. The forecast reaches a week; the months
 *  after it are a typical year, from the sowing windows. */
function Timeline({
  ahead,
  onAhead,
}: {
  ahead: number;
  onAhead: (ahead: number) => void;
}) {
  const { t, i18n } = useTranslation('huerta');
  const name = (months: number, month: 'long' | 'short') => {
    const day = new Date();
    day.setDate(1);
    day.setMonth(day.getMonth() + months);
    return new Intl.DateTimeFormat(i18n.language, { month }).format(day);
  };
  const label = (months: number) =>
    months
      ? t('map.year.month', { month: name(months, 'long') })
      : t('planner.timeline.now');
  return (
    <div>
      <div className='mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1'>
        <p className='font-semibold text-happy-50'>{label(ahead)}</p>
        {ahead ? (
          <Button
            variant='link'
            className='h-auto p-0 text-sm text-happy-100 hover:text-happy-50'
            onClick={() => onAhead(0)}
          >
            {t('planner.timeline.back')}
          </Button>
        ) : (
          <span className='text-happy-100'>{t('map.year.hint')}</span>
        )}
      </div>
      {/* The slider draws in --foreground on --background: the band re-points
          both, as the map dock's, a fine light line instead of ink. */}
      <div className='[--background:var(--happy-900)] [--foreground:var(--happy-300)]'>
        <Slider
          min={0}
          max={12}
          step={1}
          value={[ahead]}
          onValueChange={([next]) => onAhead(next)}
          formatValue={label}
          aria-label={t('map.year.label')}
          showTicks
        />
      </div>
      <div className='mt-1 flex justify-between text-xs text-happy-100'>
        <span>{t('planner.timeline.now')}</span>
        <span>{name(6, 'short')}</span>
        <span>{name(12, 'short')}</span>
      </div>
    </div>
  );
}

/** The spot tapped: its week on the band, as on the garden page, and the
 *  crop's status there; making it the garden is an option under that. */
function PlaceCard({
  compact,
  advice,
  crop,
  onUse,
  onClose,
}: {
  /** A phone: the short card, so the map stays in view. */
  compact: boolean;
  advice?: PlaceAdvice | null;
  crop: string;
  onUse: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation('huerta');
  const how = CROPS.find(c => c.id === crop)?.how ?? 'sow';
  const status = advice?.crops[crop];
  const close = (
    <Button
      variant='ghost'
      size='icon'
      onClick={onClose}
      aria-label={t('map.close')}
      className={cn('-mr-2 -mt-2 shrink-0', BAND_GHOST_CLASS)}
    >
      <X className='size-5' />
    </Button>
  );
  if (!advice)
    return (
      <div
        className={cn(
          'pointer-events-auto flex w-full max-w-md items-start justify-between gap-3 rounded-card p-4 elevation-raised',
          BAND_SURFACE_CLASS
        )}
      >
        <p className='pt-1 text-sm text-happy-100'>
          {advice === null ? t('map.noPlace') : t('map.loadingPlace')}
        </p>
        {close}
      </div>
    );
  return (
    <HuertaWeek
      advice={advice}
      tone='card'
      compact={compact}
      className='pointer-events-auto w-full max-w-md elevation-raised'
      title={
        <div
          className={cn(
            'flex items-start justify-between gap-3',
            compact ? 'mb-1' : 'mb-3'
          )}
        >
          <p className={cn('pt-1 font-semibold', compact && 'text-sm')}>
            {t('map.place', { place: advice.place })}
          </p>
          {close}
        </div>
      }
    >
      <div
        className={cn(
          'border-t border-border',
          compact
            ? 'mt-3 flex items-center justify-between gap-2 pt-2'
            : 'mt-4 pt-4'
        )}
      >
        <p className='flex items-center gap-2 text-sm'>
          <span
            aria-hidden='true'
            className='size-3 shrink-0 rounded-full'
            style={{
              background:
                statusGroup(status) === 'over'
                  ? PALETTES.light.line
                  : css(
                      PALETTES.light.crop[statusGroup(status) as 'now' | 'wait']
                    ),
            }}
          />
          <span>
            <span className='font-semibold'>{t(`crops.${crop}`)}:</span>{' '}
            {status === 'now'
              ? t(`sheet.${how}Now`)
              : status
                ? t(`status.${status}`)
                : '–'}
          </span>
        </p>
        <Button
          variant='outline'
          onClick={onUse}
          className={compact ? 'shrink-0 px-3' : 'mt-3'}
          aria-label={t('map.use')}
        >
          <MapPinned className='size-4' />
          {compact ? t('map.useShort') : t('map.use')}
        </Button>
      </div>
    </HuertaWeek>
  );
}

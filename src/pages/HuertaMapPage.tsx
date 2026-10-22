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
import { useIsMobile } from '@/hooks/use-mobile';
import { BAND_GHOST_CLASS, BAND_SURFACE_CLASS } from '@/lib/band-surface';
import { grid, paint, type MapLayer } from '@/lib/garden-map';
import { CROPS, type PlaceAdvice } from '@/lib/huerta';
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
import { MapPinned, X } from '@/lib/icons';
import { protocol } from '@/lib/pmtiles-protocol';
import { cn } from '@/lib/utils';
import { useMapStore } from '@/store/mapStore';

maplibregl.setWorkerUrl(maplibreWorkerUrl);
maplibregl.addProtocol('pmtiles', protocol.tile);

type Continent = keyof typeof MAP_REGIONS;
const LAYERS: MapLayer[] = ['crop', 'frost', 'soil', 'water'];
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
async function basemapStyle(): Promise<maplibregl.StyleSpecification> {
  const base = new URL(import.meta.env.BASE_URL, window.location.origin);
  const file = document.documentElement.classList.contains('dark')
    ? 'funges_style_darkmatter.json'
    : 'funges_style_positron.json';
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

/** A continent's drawing on the map, under the basemap's labels. */
function show(
  m: maplibregl.Map,
  continent: Continent,
  url: string,
  [w, s, e, n]: [number, number, number, number]
) {
  const coordinates: [
    [number, number],
    [number, number],
    [number, number],
    [number, number],
  ] = [
    [w, n],
    [e, n],
    [e, s],
    [w, s],
  ];
  const id = `garden-${continent}`;
  const source = m.getSource(id) as maplibregl.ImageSource | undefined;
  if (source) return source.updateImage({ url, coordinates });
  m.addSource(id, { type: 'image', url, coordinates });
  const firstLabel = m.getStyle().layers.find(l => l.type === 'symbol')?.id;
  m.addLayer(
    {
      id,
      type: 'raster',
      source: id,
      paint: { 'raster-opacity': 0.85, 'raster-resampling': 'nearest' },
    },
    firstLabel
  );
}

/** The canvas a region's layer is drawn on, as a URL MapLibre can show. */
async function drawContinent(
  continent: Continent,
  layer: MapLayer,
  crop: string
): Promise<{ url: string; bounds: [number, number, number, number] }> {
  const load = async (region: MapRegion, again: boolean) => {
    const night = await fetchMapNight(region, again);
    return {
      places: night.places,
      values: await fetchMapLayer(
        region,
        night.day,
        layer === 'crop' ? crop : layer
      ),
    };
  };
  // A 409 means the night run moved on since the index was read.
  const parts = await Promise.all(
    MAP_REGIONS[continent].map(region =>
      load(region, false).catch(() => load(region, true))
    )
  );
  // One canvas for the continent's regions: where they meet, a cell replaces
  // its neighbour's instead of darkening it.
  const places = new Int16Array(parts.reduce((n, p) => n + p.places.length, 0));
  const values = new Uint8Array(places.length / 2);
  let at = 0;
  for (const part of parts) {
    places.set(part.places, 2 * at);
    values.set(part.values, at);
    at += part.values.length;
  }
  const area = grid(places);
  const canvas = document.createElement('canvas');
  canvas.width = area.width;
  canvas.height = area.height;
  canvas
    .getContext('2d')!
    .putImageData(
      new ImageData(paint(area, layer, values), area.width, area.height),
      0,
      0
    );
  const blob = await new Promise<Blob>(resolve =>
    canvas.toBlob(b => resolve(b!), 'image/png')
  );
  return { url: URL.createObjectURL(blob), bounds: area.bounds };
}

export default function HuertaMapPage() {
  const { t } = useTranslation('huerta');
  const isMobile = useIsMobile();
  const phone = useRef(isMobile);
  phone.current = isMobile;
  const navigate = useNavigate();
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const marker = useRef<maplibregl.Marker | null>(null);
  // The continents looked at so far: their layers stay drawn.
  const [shown, setShown] = useState<Continent[]>([]);
  // Per continent, the drawing asked for last (layer:crop) and the one on show.
  const wanted = useRef(new Map<Continent, string>());
  const urls = useRef(new Map<Continent, string>());
  // The advice at the map's centre, for the crop panel's status filter.
  const [centre, setCentre] = useState<PlaceAdvice | null | undefined>();
  const [crop, setCrop] = useState('garlic');
  const [layer, setLayer] = useState<MapLayer>('crop');
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  // advice: undefined while it loads, null where Huerta has no place.
  const [picked, setPicked] = useState<{
    place: Place;
    advice?: PlaceAdvice | null;
  } | null>(null);

  // The map itself, once, on Terra's basemap.
  useEffect(() => {
    let live = true;
    let m: maplibregl.Map | null = null;
    const drawings = urls.current;
    basemapStyle()
      .then(style => {
        if (!live || !container.current) return;
        m = new maplibregl.Map({
          container: container.current,
          style,
          ...startView(),
          minZoom: 2.5,
          maxZoom: 12,
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
          setReady(true);
          look();
        });
        m.on('moveend', look);
        m.on('click', event => {
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
      drawings.forEach(url => URL.revokeObjectURL(url));
    };
  }, []);

  // The chosen layer, drawn for every continent looked at; one already
  // showing it is left alone.
  useEffect(() => {
    const m = map.current;
    if (!ready || !m || !huertaApiConfigured) return;
    const key = `${layer}:${crop}`;
    setFailed(false);
    for (const continent of shown) {
      if (wanted.current.get(continent) === key) continue;
      wanted.current.set(continent, key);
      drawContinent(continent, layer, crop)
        .then(({ url, bounds }) => {
          if (wanted.current.get(continent) !== key || map.current !== m)
            return URL.revokeObjectURL(url);
          show(m, continent, url, bounds);
          const old = urls.current.get(continent);
          urls.current.set(continent, url);
          // Let MapLibre finish reading the old image before it goes.
          if (old) setTimeout(() => URL.revokeObjectURL(old), 5000);
        })
        .catch(() => {
          if (wanted.current.get(continent) !== key) return;
          wanted.current.delete(continent); // the next change tries again
          setFailed(true);
        });
    }
  }, [ready, shown, layer, crop]);

  // The place tapped: a marker, and its own advice for the card.
  useEffect(() => {
    const m = map.current;
    marker.current?.remove();
    if (!picked || !m) return;
    marker.current = new maplibregl.Marker({ color: '#9a3f1f' })
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
              onPick={value => {
                setCrop(value);
                setLayer('crop');
              }}
              advice={picked ? picked.advice : centre}
              onOpen={lookAround}
            />
          </div>
          <div
            role='group'
            aria-label={t('map.layer')}
            className='pointer-events-auto -mx-3 flex gap-2 overflow-x-auto px-3 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0'
          >
            {LAYERS.map(l => (
              <Button
                key={l}
                type='button'
                variant='ghost'
                aria-pressed={layer === l}
                onClick={() => setLayer(l)}
                className={cn(chipClass(layer === l), 'shrink-0')}
              >
                {l === 'crop'
                  ? t('map.layers.crop', { crop: t(`crops.${crop}`) })
                  : t(`map.layers.${l}`)}
              </Button>
            ))}
          </div>
        </div>
        <div
          className={cn(
            'pointer-events-none absolute inset-x-0 flex flex-col items-start gap-2 p-3 sm:p-4',
            isMobile ? 'bottom-24' : 'bottom-0'
          )}
        >
          {picked ? (
            <PlaceCard
              advice={picked.advice}
              crop={crop}
              onUse={() => {
                savePlace(picked.place);
                navigate({ to: '/huerta' });
              }}
              onClose={() => setPicked(null)}
            />
          ) : null}
          {picked && isMobile ? null : <Legend layer={layer} failed={failed} />}
        </div>
      </div>
    </>
  );
}

/** The filter chips' look over the map (CategoryChips, glass tone). */
const chipClass = (selected: boolean) =>
  cn(
    'px-4 text-foreground backdrop-blur-sm hover:bg-card hover:text-foreground dark:hover:bg-card dark:hover:text-foreground',
    selected
      ? 'bg-card font-semibold shadow-[0_1px_4px_rgba(0,0,0,0.08)]'
      : 'bg-card/90 font-medium'
  );

function Legend({ layer, failed }: { layer: MapLayer; failed: boolean }) {
  const { t } = useTranslation('huerta');
  const keys: [string, string][] =
    layer === 'crop'
      ? [
          ['rgb(201,96,58)', t('map.legend.now')],
          ['rgb(245,174,144)', t('map.legend.wait')],
          ['rgb(207,198,189)', t('map.legend.over')],
        ]
      : layer === 'frost'
        ? [
            ['rgb(63,107,154)', t('map.legend.frost')],
            ['rgb(169,193,220)', t('map.legend.ground')],
            ['rgb(214,224,236)', t('map.legend.later')],
          ]
        : [];
  return (
    <div className='pointer-events-auto rounded-card bg-card/95 p-3 text-sm shadow-sm backdrop-blur-sm'>
      {failed ? (
        <p className='text-muted-foreground'>{t('map.failed')}</p>
      ) : keys.length > 0 ? (
        <ul className='flex flex-col gap-1.5'>
          {keys.map(([fill, label]) => (
            <li key={label} className='flex items-center gap-2'>
              <span
                className='size-3.5 shrink-0 rounded-sm'
                style={{ background: fill }}
              />
              {label}
            </li>
          ))}
        </ul>
      ) : (
        <div className='flex w-48 flex-col gap-1'>
          <span
            className='h-3 rounded-sm'
            style={{
              background:
                layer === 'soil'
                  ? 'linear-gradient(90deg, rgb(220,230,239), rgb(243,220,203), rgb(224,144,106), rgb(154,63,31))'
                  : 'linear-gradient(90deg, rgb(222,236,246), rgb(130,177,214), rgb(47,101,150))',
            }}
          />
          <span className='flex justify-between text-xs text-muted-foreground'>
            <span>{t(`map.legend.${layer}Low`)}</span>
            <span>{t(`map.legend.${layer}High`)}</span>
          </span>
        </div>
      )}
    </div>
  );
}

/** The spot tapped: its week on the band, as on the garden page, and the
 *  crop's status there; making it the garden is an option under that. */
function PlaceCard({
  advice,
  crop,
  onUse,
  onClose,
}: {
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
      className='pointer-events-auto w-full max-w-md p-4 elevation-raised sm:p-5'
      title={
        <div className='mb-3 flex items-start justify-between gap-3'>
          <p className='pt-1 font-semibold'>
            {t('map.place', { place: advice.place })}
          </p>
          {close}
        </div>
      }
    >
      <div className='mt-4 border-t border-happy-100/25 pt-4'>
        <p className='text-sm'>
          <span className='font-semibold'>{t(`crops.${crop}`)}:</span>{' '}
          {status === 'now'
            ? t(`sheet.${how}Now`)
            : status
              ? t(`status.${status}`)
              : '–'}
        </p>
        <Button
          variant='ghost'
          onClick={onUse}
          className={cn('-ml-4 mt-1', BAND_GHOST_CLASS)}
        >
          <MapPinned className='size-4' />
          {t('map.use')}
        </Button>
      </div>
    </HuertaWeek>
  );
}

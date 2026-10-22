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
import {
  BAND_ACTIVE_CLASS,
  BAND_GHOST_CLASS,
  BAND_SURFACE_CLASS,
} from '@/lib/band-surface';
import { grid, paint, STATUS_RGB, type MapLayer } from '@/lib/garden-map';
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
      paint: {
        // Fainter close in, where the streets show where a garden is.
        'raster-opacity': [
          'interpolate',
          ['linear'],
          ['zoom'],
          11,
          0.85,
          15,
          0.3,
        ],
        'raster-resampling': 'nearest',
      },
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
  const open = useRef(false);
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
  const mapStyle = useMapStore(state => state.mapStyle);
  const hillshadeVisible = useMapStore(state => state.hillshadeVisible);
  const [layer, setLayer] = useState<MapLayer>('crop');
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
    const drawings = urls.current;
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
      drawings.forEach(url => URL.revokeObjectURL(url));
      drawings.clear();
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
    open.current = picked !== null;
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
              onPick={value => {
                setCrop(value);
                setLayer('crop');
              }}
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
                navigate({ to: '/huerta' });
              }}
              onClose={() => setPicked(null)}
            />
          ) : null}
          {picked && isMobile ? null : (
            <Legend layer={layer} title={layerName(layer)} failed={failed} />
          )}
        </div>
      </div>
    </>
  );
}

function Legend({
  layer,
  title,
  failed,
}: {
  layer: MapLayer;
  /** The layer's name: the rail shows only its icon. */
  title: string;
  failed: boolean;
}) {
  const { t } = useTranslation('huerta');
  const keys: [string, string][] =
    layer === 'crop'
      ? [
          [`rgb(${STATUS_RGB.now})`, t('map.legend.now')],
          [`rgb(${STATUS_RGB.wait})`, t('map.legend.wait')],
          [`rgb(${STATUS_RGB.over})`, t('map.legend.over')],
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
      {failed || layer === 'crop' ? null : (
        // The crop layer's rows already say it: sow or plant now, not yet, too late.
        <p className='mb-2 font-semibold text-foreground'>{title}</p>
      )}
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
            style={{ background: `rgb(${STATUS_RGB[statusGroup(status)]})` }}
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

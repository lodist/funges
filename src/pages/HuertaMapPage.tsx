import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import SEO from '@/components/SEO';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useIsMobile } from '@/hooks/use-mobile';
import { grid, paint, type MapLayer } from '@/lib/garden-map';
import { CROPS, type PlaceAdvice } from '@/lib/huerta';
import {
  fetchAdvice,
  fetchMapLayer,
  fetchMapNight,
  huertaApiConfigured,
  MAP_REGIONS,
  savedPlace,
  savePlace,
  type MapRegion,
  type Place,
} from '@/lib/huerta-api';
import { protocol } from '@/lib/pmtiles-protocol';
import { cn } from '@/lib/utils';

maplibregl.setWorkerUrl(maplibreWorkerUrl);
maplibregl.addProtocol('pmtiles', protocol.tile);

type Continent = keyof typeof MAP_REGIONS;
const LAYERS: MapLayer[] = ['crop', 'frost', 'soil', 'water'];
const VIEW: Record<Continent, { center: [number, number]; zoom: number }> = {
  eu: { center: [8, 48], zoom: 3.3 },
  us: { center: [-97, 39], zoom: 3.2 },
};
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

/** The canvas a region's layer is drawn on, as a URL MapLibre can show. */
async function drawRegion(
  region: MapRegion,
  layer: MapLayer,
  crop: string
): Promise<{ url: string; bounds: [number, number, number, number] }> {
  const load = async (again: boolean) => {
    const night = await fetchMapNight(region, again);
    return {
      night,
      values: await fetchMapLayer(
        region,
        night.day,
        layer === 'crop' ? crop : layer
      ),
    };
  };
  // A 409 means the night run moved on since the index was read.
  const { night, values } = await load(false).catch(() => load(true));
  const area = grid(night.places);
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
  const navigate = useNavigate();
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const marker = useRef<maplibregl.Marker | null>(null);
  const home = useMemo(() => savedPlace(), []);
  const [continent, setContinent] = useState<Continent>(
    home && home.lon < -25 ? 'us' : 'eu'
  );
  const [crop, setCrop] = useState('garlic');
  const [layer, setLayer] = useState<MapLayer>('crop');
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  // advice: undefined while it loads, null where Huerta has no place.
  const [picked, setPicked] = useState<{
    place: Place;
    advice?: PlaceAdvice | null;
  } | null>(null);
  const crops = useMemo(
    () =>
      [...CROPS].sort((a, b) =>
        t(`crops.${a.id}`).localeCompare(t(`crops.${b.id}`))
      ),
    [t]
  );

  // The map itself, once, on Terra's basemap.
  useEffect(() => {
    let live = true;
    let m: maplibregl.Map | null = null;
    const view = home
      ? { center: [home.lon, home.lat] as [number, number], zoom: 6 }
      : VIEW[continent];
    basemapStyle()
      .then(style => {
        if (!live || !container.current) return;
        m = new maplibregl.Map({
          container: container.current,
          style,
          ...view,
          minZoom: 2.5,
          maxZoom: 12,
          attributionControl: false,
        });
        m.dragRotate.disable();
        m.touchZoomRotate.disableRotation();
        m.on('load', () => setReady(true));
        m.on('click', event =>
          setPicked({
            place: { lat: event.lngLat.lat, lon: event.lngLat.lng },
          })
        );
        map.current = m;
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
      m?.remove();
      map.current = null;
    };
    // The view only seeds the map; later choices move it themselves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The chosen layer, drawn for every region of the continent.
  useEffect(() => {
    const m = map.current;
    if (!ready || !m || !huertaApiConfigured) return;
    let live = true;
    const urls: string[] = [];
    setFailed(false);
    Promise.all(
      MAP_REGIONS[continent].map(async region => {
        const { url, bounds } = await drawRegion(region, layer, crop);
        urls.push(url);
        if (!live) return;
        const [w, s, e, n] = bounds;
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
        const id = `garden-${region}`;
        const source = m.getSource(id) as maplibregl.ImageSource | undefined;
        if (source) source.updateImage({ url, coordinates });
        else {
          m.addSource(id, { type: 'image', url, coordinates });
          const firstLabel = m
            .getStyle()
            .layers.find(l => l.type === 'symbol')?.id;
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
      })
    ).catch(() => live && setFailed(true));
    return () => {
      live = false;
      // Let MapLibre finish reading the images before they go.
      setTimeout(() => urls.forEach(url => URL.revokeObjectURL(url)), 5000);
    };
  }, [ready, continent, layer, crop]);

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
    fetchAdvice(picked.place)
      .then(advice => live && setPicked(p => (p ? { ...p, advice } : p)))
      .catch(() => live && setPicked(p => (p ? { ...p, advice: null } : p)));
    return () => {
      live = false;
    };
  }, [picked]);

  const moveTo = (next: Continent) => {
    setContinent(next);
    setPicked(null);
    map.current?.flyTo({ ...VIEW[next], essential: true });
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
          <div className='pointer-events-auto flex flex-wrap items-center gap-2'>
            <Select
              value={crop}
              onValueChange={value => {
                setCrop(value);
                setLayer('crop');
              }}
            >
              <SelectTrigger
                aria-label={t('map.crop')}
                className='w-44 bg-card sm:w-56'
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {crops.map(c => (
                  <SelectItem key={c.id} value={c.id}>
                    {t(`crops.${c.id}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(['eu', 'us'] as Continent[]).map(c => (
              <Button
                key={c}
                type='button'
                variant='ghost'
                aria-pressed={continent === c}
                onClick={() => moveTo(c)}
                className={chipClass(continent === c)}
              >
                {t(`map.continents.${c}`)}
              </Button>
            ))}
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
          <Legend layer={layer} failed={failed} />
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
  return (
    <div className='pointer-events-auto flex w-full max-w-sm flex-col gap-3 rounded-card bg-card p-4 shadow-md'>
      {advice === null ? (
        <p className='text-sm text-muted-foreground'>{t('map.noPlace')}</p>
      ) : advice ? (
        <>
          <div>
            <p className='font-semibold text-foreground'>
              {t('map.place', { place: advice.place })}
            </p>
            <p className='text-sm text-muted-foreground'>
              {t(`crops.${crop}`)}:{' '}
              {status === 'now'
                ? t(`sheet.${how}Now`)
                : status
                  ? t(`status.${status}`)
                  : '–'}
            </p>
          </div>
          <div className='flex gap-2'>
            <Button onClick={onUse}>{t('map.use')}</Button>
            <Button variant='ghost' onClick={onClose}>
              {t('map.close')}
            </Button>
          </div>
        </>
      ) : (
        <p className='text-sm text-muted-foreground'>{t('map.loadingPlace')}</p>
      )}
    </div>
  );
}

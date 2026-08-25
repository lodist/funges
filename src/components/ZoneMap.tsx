import 'leaflet/dist/leaflet.css';
import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, GeoJSON, useMap } from 'react-leaflet';
import { useTranslation } from 'react-i18next';
import type { Layer, PathOptions } from 'leaflet';
import { formatZoneLabel } from '@/lib/data';

// Leaflet bounds type: [[south, west], [north, east]]
type LatLngBounds = [[number, number], [number, number]];

const REGION_BOUNDS: Record<string, LatLngBounds> = {
  NE: [
    [46, -30],
    [75, 36],
  ],
  SE: [
    [32, -33],
    [52, 40],
  ],
  USE: [
    [22, -102],
    [52, -62],
  ],
  USW: [
    [22, -128],
    [52, -97],
  ],
};

interface FitBoundsProps {
  region: string;
}

function FitBounds({ region }: FitBoundsProps) {
  const map = useMap();
  useEffect(() => {
    const bounds = REGION_BOUNDS[region];
    if (bounds) map.fitBounds(bounds, { animate: true });
  }, [map, region]);
  return null;
}

interface ZoneMapProps {
  zonesGeo: GeoJSON.FeatureCollection;
  selectedZone: string;
  onZoneSelect: (zone: string) => void;
  region: string;
  zoneLabelFn?: (zone: string) => string;
}

const SFUMATO_STYLE = `
.leaflet-zone-map .leaflet-overlay-pane path {
  filter: blur(14px);
  transition: filter 0.25s ease;
  outline: none;
}
.leaflet-zone-map .leaflet-overlay-pane path:hover {
  filter: blur(10px);
}
.leaflet-zone-map .leaflet-overlay-pane path.zone-selected {
  filter: blur(12px);
}
`;

export default function ZoneMap({
  zonesGeo,
  selectedZone,
  onZoneSelect,
  region,
  zoneLabelFn,
}: ZoneMapProps) {
  const { i18n } = useTranslation();
  const geoJsonRef = useRef<L.GeoJSON | null>(null);
  // Updated synchronously every render so event-handler closures always read the latest value
  const getRestoreStyle = useRef<(zone: string, color: string) => PathOptions>(
    null!
  );
  getRestoreStyle.current = (zone: string, color: string) =>
    styleFeature(color, zone === selectedZone);

  useEffect(() => {
    geoJsonRef.current?.setStyle(feature => {
      const zone = feature?.properties?.zone as string;
      return styleFeature(
        feature?.properties?.color as string,
        zone === selectedZone
      );
    });

    // Apply/remove selected class on SVG paths
    const container = document.querySelector(
      '.leaflet-zone-map .leaflet-overlay-pane'
    );
    if (!container) return;
    container.querySelectorAll('path').forEach(path => {
      const zone = (path as SVGPathElement).getAttribute('data-zone');
      if (zone === selectedZone) {
        path.classList.add('zone-selected');
      } else {
        path.classList.remove('zone-selected');
      }
    });
  }, [selectedZone]);

  function styleFeature(color: string, selected: boolean): PathOptions {
    return {
      color: 'transparent',
      weight: 0,
      // Stone (--muted-foreground) as a literal: Leaflet needs a resolved colour,
      // and the previous fallback was Tailwind gray-500, a cool grey.
      fillColor: color ?? '#6f6a61',
      fillOpacity: selected ? 0.7 : 0.45,
    };
  }

  function onEachFeature(feature: GeoJSON.Feature, layer: Layer) {
    const zone = feature.properties?.zone as string;
    const label =
      zoneLabelFn?.(zone) ??
      (feature.properties?.label as string) ??
      formatZoneLabel(zone);
    const color = feature.properties?.color as string;

    layer.bindTooltip(label, { sticky: true, className: 'zone-tooltip' });

    layer.on({
      click: () => onZoneSelect(zone),
      mouseover: e => {
        e.target.setStyle({ fillOpacity: 0.55 });
      },
      mouseout: e => {
        e.target.setStyle(getRestoreStyle.current(zone, color));
      },
    });
  }

  return (
    <>
      <style>{SFUMATO_STYLE}</style>
      <div style={{ isolation: 'isolate' }}>
        <MapContainer
          className='leaflet-zone-map'
          bounds={REGION_BOUNDS[region] ?? REGION_BOUNDS.NE}
          style={{ height: '320px', width: '100%', borderRadius: '0.5rem' }}
          zoomControl={true}
          attributionControl={false}
          scrollWheelZoom={true}
          minZoom={2}
        >
          <TileLayer
            url='https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          />
          <GeoJSON
            key={`${region}-${i18n.language}`}
            ref={geoJsonRef}
            data={zonesGeo}
            style={feature =>
              styleFeature(
                feature?.properties?.color as string,
                feature?.properties?.zone === selectedZone
              )
            }
            onEachFeature={onEachFeature}
          />
          <FitBounds region={region} />
        </MapContainer>
      </div>
    </>
  );
}

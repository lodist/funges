import type { CropNeeds, PlaceAdvice } from '@/lib/huerta';
import type { Garden } from '@/lib/planner';

/** How a garden's soil drains and warms: light and sandy, loam, or heavy clay. */
export type Texture = 'sandy' | 'loam' | 'clay';
export type Acidity = 'acid' | 'neutral' | 'alkaline';
export const TEXTURES: Texture[] = ['sandy', 'loam', 'clay'];
export const ACIDITIES: Acidity[] = ['acid', 'neutral', 'alkaline'];

/** The soil map's topsoil at a place (SoilGrids, 1 km): pH in water, and the
 *  shares of clay and sand in %. It describes the land around, not a garden. */
export interface MapSoil {
  ph: number;
  clay: number;
  sand: number;
}

// ponytail: the gardener's three classes from the texture triangle's corners
// (from 30% clay a soil gardens heavy, as clay loams do); the USDA classes if a
// crop ever needs finer ones.
export const textureOf = ({ clay, sand }: MapSoil): Texture =>
  clay >= 30 ? 'clay' : sand >= 60 ? 'sandy' : 'loam';
export const acidityOf = ({ ph }: MapSoil): Acidity =>
  ph < 6 ? 'acid' : ph >= 7.5 ? 'alkaline' : 'neutral';

/** The garden's soil: as the gardener set it; else, for beds in the ground,
 *  the map's; raised beds are filled with bought loam. */
export function gardenSoil(
  garden: Garden | undefined,
  map?: MapSoil | null
): { texture: Texture; acidity: Acidity } {
  const ground = map && (garden?.ground ?? 'raised') !== 'raised' ? map : null;
  return {
    texture: garden?.soil ?? (ground ? textureOf(ground) : 'loam'),
    acidity: garden?.acidity ?? (ground ? acidityOf(ground) : 'neutral'),
  };
}

/** How much sooner light soil warms in spring than loam, and heavy clay later,
 *  at sowing depth (°C). */
const WARMS: Record<Texture, number> = { sandy: 1.5, loam: 0, clay: -1.5 };

/** This week's statuses for a garden's soil. In spring a crop waiting for
 *  warmer soil goes into sand a little sooner, and one going in now waits a
 *  little longer in clay; the rest of the year, as the place's. */
export function forSoil(
  advice: PlaceAdvice,
  needs: Record<string, CropNeeds>,
  texture: Texture,
  today: string
): PlaceAdvice {
  const shift = WARMS[texture];
  if (!shift || advice.soil === null || Number(today.slice(5, 7)) > 6)
    return advice;
  const soil = advice.soil + shift;
  const crops = { ...advice.crops };
  for (const [id, status] of Object.entries(advice.crops)) {
    const [min, max] = needs[id]?.soil ?? [null, null];
    if (!min) continue;
    if (status === 'wait_soil' && soil >= min && (!max || soil <= max))
      crops[id] = 'now';
    else if (status === 'now' && soil < min) crops[id] = 'wait_soil';
  }
  return { ...advice, crops };
}

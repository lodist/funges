import i18n from '@/i18n';
import NAMES from '@/data/place-names.json';

/** Huerta's place names that a city has another name for in an app language,
 *  from Natural Earth (data_tools/build_place_names.py): the city's position
 *  and its names. The place lists spell in ASCII after GeoNames, so big cities
 *  show in English (Rome) and others lose their accents (Almeria). */
const OWN = NAMES as unknown as Record<
  string,
  [number, number, Record<string, string>][]
>;

/** A place's name in the reader's language where its city has one (Rome:
 *  Roma, Rom; Almeria: Almería), else as the place list spells it. Its
 *  position tells Rome, Italy from Rome, Georgia; without one it stays. */
export function shownPlace({
  place,
  lat,
  lon,
}: {
  place: string;
  lat?: number;
  lon?: number;
}) {
  if (lat === undefined || lon === undefined) return place;
  const city = OWN[place]?.find(
    ([la, lo]) => Math.abs(la - lat) < 0.2 && Math.abs(lo - lon) < 0.2
  );
  const lang = (i18n.resolvedLanguage ?? i18n.language ?? 'en').split('-')[0];
  return city?.[2][lang] ?? place;
}

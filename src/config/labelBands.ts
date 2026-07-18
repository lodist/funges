import raw from './label-bands.json';

export interface PopulationStep {
  zoom: number;
  population: number;
}

export interface ZoomBand {
  minzoom: number;
  maxzoom: number;
}

export interface PopulationBand extends ZoomBand {
  populationSteps: PopulationStep[];
  populationCeiling?: number;
}

export interface LabelBandsConfig {
  country: ZoomBand;
  region: ZoomBand;
  city: PopulationBand;
  settlement: PopulationBand;
  settlementSmall: ZoomBand;
}

// Single shared source of truth for place-label zoom-band/population thresholds,
// read by both this app and scripts/make_carto_styles.py (which loads the same
// label-bands.json) and scripts/apply_label_bands.py (which patches the
// hand-authored funges_style*.json files from it).
export const LABEL_BANDS: LabelBandsConfig = raw as LabelBandsConfig;

// Builds a MapLibre `step` expression selecting a population threshold by zoom,
// matching the shape already used by the hand-authored place-label filters:
// ["step", ["zoom"], [">=", population, s0], z1, [">=", population, s1], ...]
export function populationStepExpression(steps: PopulationStep[]): unknown[] {
  const sorted = [...steps].sort((a, b) => a.zoom - b.zoom);
  const [first, ...rest] = sorted;
  const expr: unknown[] = [
    'step',
    ['zoom'],
    ['>=', ['get', 'population'], first.population],
  ];
  for (const step of rest) {
    expr.push(step.zoom, ['>=', ['get', 'population'], step.population]);
  }
  return expr;
}

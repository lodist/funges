# Fung.es

Foraging forecasts for Europe and the US. Fung.es shows where and when wild
mushrooms, plants, berries, nuts and flowers are worth looking for, and what to
cook with them.

Live at [www.fung.es](https://www.fung.es) and on
[Google Play](https://play.google.com/store/apps/details?id=es.fung.app).

## What's in the app

- **Map**: a daily forecast score for each species across northern and
  southern Europe and the eastern and western US. Tap a place to see what is
  worth looking for there.
- **Worth Foraging Now**: the species in season near you today.
- **Species**: 59 species (28 mushrooms, 12 plants, 12 berries, 4 flowers,
  3 nuts) with season, habitat, identification and safety notes.
- **Recipes**: 44 recipes built on wild ingredients, with a route past the
  places where they grow.
- **Identify**: photo identification that runs in the browser. It suggests
  candidates and never says whether something is safe to eat.
- **Seasonal spectacles**: cherry blossom, bluebells, desert superbloom,
  heather and autumn foliage, on the map like the species.
- **Data**: the forecast scorecard and a season atlas for each place and
  species.
- **Offline maps**: basemap packages to download before you lose signal.
- Installable as a PWA, light and dark themes, and six languages (English,
  German, Spanish, French, Italian, Portuguese).

## Tech stack

React 19 and TypeScript on Vite 6 · TanStack Router (file-based routes) and
TanStack Query · Zustand · Tailwind CSS 4 with SCSS modules · MapLibre GL with
PMTiles · i18next · vite-plugin-pwa · ONNX Runtime Web for photo ID · Vitest,
Playwright and Storybook.

## Getting started

You need Node.js 22 (CI and local work use 22.16.0).

```bash
git clone https://github.com/lodist/funges.git
cd funges
npm install
npm run dev
```

The app opens at `http://localhost:3000`. It needs no environment setup: map
tiles, scores and the photo-ID model load from the public data host
`data.fung.es`.

## Commands

| Command                               | What it does                                               |
| ------------------------------------- | ---------------------------------------------------------- |
| `npm run dev`                         | Dev server on port 3000                                    |
| `npm run dev:mobile`                  | Dev server on your network, to test on a phone             |
| `npm run build` / `npm run preview`   | Production build, and a local server for it                |
| `npm run check`                       | Prettier, ESLint (zero warnings) and the type check        |
| `npm run lint:fix` / `npm run format` | Fix lint issues / format the code                          |
| `npx vitest run --project unit`       | Unit tests                                                 |
| `npx vitest run --project storybook`  | Render every story in a browser and fail on axe violations |
| `npm run test:e2e`                    | Playwright end-to-end tests                                |
| `npm run storybook`                   | Storybook on port 6006                                     |
| `task ci-check`                       | Everything CI runs, from a clean `npm ci`                  |

The Storybook project needs a browser once: `npx playwright install chromium`.

## Project structure

```text
content/species/   one manifest per species, the source of the catalog
src/
├── components/    app components; ui/ holds the primitives and their stories
├── foundations/   design tokens, documented in Storybook
├── patterns/      composed patterns, documented in Storybook
├── pages/         page components
├── routes/        TanStack Router file routes
├── data/          recipes, toxic look-alikes, photo-ID vocabulary
├── generated/     built from content/species; do not edit by hand
├── lib/ hooks/ store/ contexts/
├── i18n/          translations
└── workers/       the photo-ID worker
public/            static files, icons and published site data
scripts/           data, tile and QA scripts
e2e/               Playwright tests
docs/              decision records and how-tos
backend/           the forecasting engine (proprietary, see below)
```

## Contributing

Read [AGENTS.md](AGENTS.md) first. It covers code style, how to write a
story, image size limits and the checks to run before a PR. In short:

- Storybook is the design-system documentation. Look there before building a
  component, and document new primitives there.
- Run `npm run check` and the unit tests before you open a PR.
- To add or change a species, follow
  [content/species/README.md](content/species/README.md).

## Forecast engine

`backend/` holds the Python pipeline that builds the nightly forecast scores
and map tiles and publishes them to Cloudflare R2. It is proprietary (see
[License](#license)). Running it needs R2 and weather credentials in
`.env.secret` (copy `.env.secret.example`). Its built files live on R2, not in
git: `python backend/r2.py sync` fetches them.

## Deployment

Every push to `main` builds and deploys the site to GitHub Pages
([deploy.yml](.github/workflows/deploy.yml)). The build needs the repository
variables `VITE_BASE_URL` and `VITE_HOSTNAME`. A scheduled workflow refreshes
the site data in `public/data/` after each nightly scoring run.

## License

The app is open source under the MIT License. The forecasting engine
(`backend/`), the species calibrations, the models and all forecast data are
proprietary, all rights reserved. See [LICENSE](LICENSE) for exactly which
parts.

## Safety notice

**Always check with local experts before eating anything wild.** Fung.es is
for education and planning, not a sole source for identification. Many wild
mushrooms and plants have poisonous look-alikes. When in doubt, leave it out.

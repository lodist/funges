# Fung.es

A modern foraging webapp built with React 19, TanStack Router, and Vite that helps users discover wild mushrooms, edible plants, and berries in their area. Features an interactive MapLibre map with real-time foraging data, comprehensive species database, and curated wild food recipes.

## 🌟 Features

### 🗺️ Interactive Foraging Map

- **Real-time MapLibre + PMTiles integration** with custom GeoJSON overlays
- **Dynamic species filtering** by category (mushrooms, plants, berries, nuts, flowers)
- **Geolocation support** with user location detection and navigation
- **Responsive design** optimized for both desktop and mobile devices
- **Dark/light theme support** with system preference detection

### 🍄 Species Database

- **Comprehensive catalog** of 30+ wild edibles including:
  - Mushrooms (Chanterelles, Morels, Porcini, etc.)
  - Edible plants (Nettles, Dandelions, Wild Garlic, etc.)
  - Berries (Blackberries, Elderberries, Wild Strawberries, etc.)
  - Nuts (Hazelnuts, Walnuts, Chestnuts)
- **Scientific names** and detailed descriptions
- **Seasonal information** and habitat details
- **Safety notes** and identification tips
- **Multi-language support** (English, German, Spanish, French, Italian, Portuguese)

### 🍽️ Wild Food Recipes

- **Curated recipe collection** featuring wild ingredients
- **Difficulty levels** (Easy, Medium, Hard) with prep/cook times
- **Safety warnings** and preparation tips
- **Filterable by ingredient type** and dietary preferences
- **Step-by-step instructions** with cooking tips
- **Beautiful recipe images** and nutritional information

### 📱 Progressive Web App (PWA)

- **Full offline support** with service worker caching
- **Installable** on mobile and desktop devices
- **Splash screens** for native app-like experience
- **Offline map functionality** with cached data
- **Push notifications** support (configurable)

### 🌍 Internationalization

- **6 language support** with automatic detection
- **Localized content** for species, recipes, and UI
- **RTL language support** ready
- **Cultural adaptations** for regional foraging practices

## 🏗️ Architecture

### Tech Stack

- **Frontend**: React 19 with TypeScript
- **Routing**: TanStack Router with file-based routing
- **State Management**: Zustand stores
- **Styling**: Tailwind CSS 4 + SCSS
- **Maps**: MapLibre GL JS + PMTiles (self-hosted on R2)
- **Build Tool**: Vite 6
- **Testing**: Vitest + Testing Library
- **PWA**: Vite PWA plugin

### Project Structure

```shell
src/
├── assets/             # Static assets
├── components/         # Reusable UI components
│   ├── ui/             # shadcn/ui components
│   ├── Mobile/         # Mobile-specific components
│   └── Sidebar/        # Navigation components
├── contexts/           # React context providers
├── data/               # Static data (species, recipes)
├── hooks/              # Custom React hooks
├── i18n/               # Internationalization
├── lib/                # Utilities and API layer
├── pages/              # Page components
├── routes/             # TanStack Router file-based routes
├── store/              # Zustand state stores
├── stories/            # Storybook stories
├── styles/             # Global styles and design tokens
├── test/               # Test files
└── types/              # TypeScript type definitions
```

### Key Components

- **AdvancedMap**: Interactive MapLibre map with foraging data
- **SpeciesSelector**: Filter and browse wild edibles
- **RecipeModal**: Detailed recipe viewer with instructions
- **RouteToDishPanel**: Route-to-dish feature panel
- **AppSidebar**: Navigation and species filtering

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- npm, yarn, or bun

### Installation

1. **Clone the repository**

```bash
git clone https://github.com/lodist/funges.git
cd funges
```

2. **Install dependencies**

```bash
npm install
```

3. **Environment setup**

```bash
cp .env.secret.example .env.secret
```

Fill in your credentials in `.env.secret`. Public config (R2 data URLs) is already committed in `.env`.

4. **Start development server**

```bash
npm run dev
```

The app will be available at `http://localhost:3000`

## 🛠️ Development

### Available Scripts

- `npm run dev` - Start Vite dev server
- `npm run dev:mobile` - Start with mobile-optimized settings
- `npm run build` - Build production bundle
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Fix ESLint issues
- `npm run format` - Run Prettier
- `npm run type-check` - TypeScript type checking
- `npm run test` - Run Vitest tests
- `npm run test:ui` - Interactive test UI
- `npm run test:coverage` - Test coverage report
- `npm run storybook` - Start Storybook

### Code Quality

- **ESLint** with TypeScript and React rules
- **Prettier** for code formatting
- **TypeScript** strict mode enabled

## 📱 PWA Features

### Installation

- **Add to home screen** on mobile devices
- **Desktop app** installation on supported browsers
- **Automatic updates** with background sync
- **Native app-like** user experience

## 🌍 Internationalization

### Supported Languages

- **English** (en) - Default
- **German** (de) - Deutsch
- **Spanish** (es) - Español
- **French** (fr) - Français
- **Italian** (it) - Italiano
- **Portuguese** (pt) - Português

### Localization Features

- **Automatic language detection** based on browser settings
- **Persistent language preference** stored locally

## ⚙️ Backend Scripts

Python scripts that generate foraging scores and map tiles, running on a schedule and writing to Cloudflare R2.

```
backend/
├── EU/
│   ├── North_Europe/   NE_Scoring.py, NE_MapLayer.py
│   └── South_Europe/   SE_Scoring.py, SE_MapLayer.py
├── US/
│   ├── USE/            USE_Scoring.py, USE_MapLayer.py
│   └── USW/            USW_Scoring.py, USW_MapLayer.py
├── tools/
│   └── build_season_curves.py
└── requirements.txt
```

- **Scoring** — fetch weather from R2, compute species scores, write Parquet back to R2
- **MapLayer** — scores + GeoJSON → Delaunay triangulation → MBTiles + PMTiles via tippecanoe → R2
- **`build_season_curves.py`** — queries GBIF for monthly fungi sightings per region, builds a target-group ratio curve (cancels observer-effort bias), uploads to `<REGION>_SEASON_CURVES` in R2. Run once before the first scoring run, then monthly.

```bash
pip install -r backend/requirements.txt
cp .env.secret.example .env.secret  # fill in R2, WeatherAPI credentials

python backend/tools/build_season_curves.py        # publish season curves to R2
python backend/EU/North_Europe/NE_Scoring.py       # then run scoring
python backend/EU/North_Europe/NE_MapLayer.py
```

## 🔧 Configuration

### Environment Variables

| Variable                     | Where         | Description                        |
| ---------------------------- | ------------- | ---------------------------------- |
| `VITE_VISITOR_LIMIT`         | `.env.secret` | Visitor count before the map falls back to a static view |
| `R2_ACCESS_KEY_ID`           | `.env.secret` | Cloudflare R2 credentials          |
| `R2_SECRET_ACCESS_KEY`       | `.env.secret` | Cloudflare R2 credentials          |
| `R2_BUCKET_NAME`             | `.env.secret` | Cloudflare R2 bucket name          |
| `R2_ENDPOINT_URL`            | `.env.secret` | Cloudflare R2 endpoint             |
| `WEATHERAPI_KEY`             | `.env.secret` | WeatherAPI.com key                 |
| R2 data URLs (NE/SE/USE/USW) | `.env`        | Public CDN URLs — already set      |

## 🚀 Deployment

### Build

```bash
npm run build
```

### PWA Deployment

- **HTTPS required** for service worker functionality
- **Manifest generation** automatic
- **Icon generation** for all device sizes
- **Splash screen** creation for native feel

## 🤝 Contributing

### Development Workflow

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass
6. Submit a pull request

### Code Standards

- **TypeScript** for type safety
- **ESLint** for code quality
- **Prettier** for formatting
- **Conventional commits** for commit messages

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## ⚠️ Safety Notice

**Always consult with local experts before consuming wild edibles.** This app provides educational information but should not be the sole source for identification. Many wild mushrooms and plants have poisonous look-alikes. When in doubt, leave it out.

---

**Happy foraging! 🍄🌿🫐**

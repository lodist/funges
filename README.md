# Fung.es

A modern foraging webapp built with React 19, TanStack Router, and Vite that helps users discover wild mushrooms, edible plants, and berries in their area. Features an interactive Mapbox map with real-time foraging data, comprehensive species database, and curated wild food recipes.

## 🌟 Features

### 🗺️ Interactive Foraging Map

- **Real-time Mapbox integration** with custom GeoJSON overlays
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
- **Maps**: Mapbox GL JS
- **Build Tool**: Vite 6
- **Testing**: Vitest + Testing Library
- **PWA**: Vite PWA plugin

### Project Structure

```shell
src/
├── components/         # Reusable UI components
│   ├── ui/             # shadcn/ui components
│   ├── MapComponent/   # Map-related components
│   └── Sidebar/        # Navigation components
├── pages/              # Page components
├── routes/             # TanStack Router file-based routes
├── store/              # Zustand state stores
├── data/               # Static data (species, recipes)
├── hooks/              # Custom React hooks
├── i18n/               # Internationalization
├── lib/                # Utilities and API layer
└── styles/             # Global styles and design tokens
```

### Key Components

- **AdvancedMap**: Interactive Mapbox map with foraging data
- **SpeciesSelector**: Filter and browse wild edibles
- **RecipeModal**: Detailed recipe viewer with instructions
- **AppSidebar**: Navigation and species filtering
- **MobileNavbar**: Mobile-optimized navigation

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- npm, yarn, or bun

### Installation

1. **Clone the repository**

```bash
git clone https://github.com/your-username/funges.git
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

## 🔧 Configuration

### Environment Variables

| Variable                   | Where            | Description                        |
| -------------------------- | ---------------- | ---------------------------------- |
| `VITE_MAPBOX_ACCESS_TOKEN` | `.env.secret`    | Mapbox API access token (required) |
| `VITE_MAPBOX_STYLE`        | `.env.secret`    | Mapbox style URL                   |
| `VITE_VISITOR_LIMIT`       | `.env.secret`    | Mapbox usage limit                 |
| `MAPBOX_USERNAME`          | `.env.secret`    | Mapbox account username            |
| `R2_ACCESS_KEY_ID`         | `.env.secret`    | Cloudflare R2 credentials          |
| `R2_SECRET_ACCESS_KEY`     | `.env.secret`    | Cloudflare R2 credentials          |
| `R2_BUCKET_NAME`           | `.env.secret`    | Cloudflare R2 bucket name          |
| `R2_ENDPOINT_URL`          | `.env.secret`    | Cloudflare R2 endpoint             |
| `WEATHERAPI_KEY`           | `.env.secret`    | WeatherAPI.com key                 |
| R2 data URLs (NE/SE/USE/USW) | `.env`         | Public CDN URLs — already set      |

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

## ⚙️ Backend Scripts

The `backend/` folder contains the Python scripts that generate the foraging scores and map tiles served by the app. They run on a schedule and write results to Cloudflare R2.

### Structure

```
backend/
├── EU/
│   ├── North_Europe/   NE_Scoring.py, NE_MapLayer.py
│   └── South_Europe/   SE_Scoring.py, SE_MapLayer.py
├── US/
│   ├── USE/            USE_Scoring.py, USE_MapLayer.py
│   └── USW/            USW_Scoring.py, USW_MapLayer.py
└── requirements.txt
```

- **Scoring scripts** — fetch weather data from R2, compute foraging scores per species and location, write results back to R2 as Parquet
- **MapLayer scripts** — load scores + wilderness GeoJSON, run Delaunay triangulation, assign scores to triangles, generate MBTiles via tippecanoe, upload to R2 and publish to Mapbox Tilesets

### Setup

**Requirements:** Python 3.10+, [tippecanoe](https://github.com/mapbox/tippecanoe) (for MapLayer scripts)

```bash
pip install -r backend/requirements.txt
cp .env.secret.example .env.secret
# fill in .env.secret with your credentials
```

### Running a script

```bash
python backend/EU/North_Europe/NE_Scoring.py
python backend/EU/North_Europe/NE_MapLayer.py
```

All credentials are loaded from `.env.secret` at the repo root. Public data URLs are in `.env`.

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

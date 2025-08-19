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
cp .env.example .env
```

Configure your `.env` file:

```env
VITE_MAPBOX_ACCESS_TOKEN=your_mapbox_token_here
VITE_MAPBOX_STYLE=your_mapbox_style_here
VITE_BASE_URL=/
VITE_HOSTNAME=https://www.fung.es
VITE_VISITOR_LIMIT=45000
```

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

| Variable                   | Description             | Default                               |
| -------------------------- | ----------------------- | ------------------------------------- |
| `VITE_MAPBOX_ACCESS_TOKEN` | Mapbox API access token | Required                              |
| `VITE_MAPBOX_STYLE`        | Mapbox style URL        | `mapbox://styles/mapbox/outdoors-v12` |
| `VITE_BASE_URL`            | Base URL for the app    | `/`                                   |
| `VITE_HOSTNAME`            | Hostname for sitemap    | `https://www.fung.es`                 |
| `VITE_VISITOR_LIMIT`       | Mapbox usage limit      | `45000`                               |

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

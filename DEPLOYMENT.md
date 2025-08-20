# GitHub Pages Deployment

## Setup

1. **Enable GitHub Pages** in your repository settings:
   - Go to Settings → Pages
   - Source: "GitHub Actions"

2. **Add repository secrets** (Settings → Secrets and variables → Actions):
   - `VITE_MAPBOX_ACCESS_TOKEN` - Your Mapbox token
   - `VITE_MAPBOX_STYLE` - Mapbox style URL
   - `VITE_BASE_URL` - Base path for your site

## Base URL Configuration

- **Custom domain**: Set `VITE_BASE_URL=/` (for https://fung.es)
- **GitHub Pages**: Set `VITE_BASE_URL=/funges/` (for https://your-username.github.io/funges/)
- **Subdirectory**: Set `VITE_BASE_URL=/your-subdir/`

## How It Works

- Automatically deploys on push to `main`/`master` branch
- Builds with your environment variables
- Deploys to GitHub Pages
- Base URL is configurable via `VITE_BASE_URL` secret


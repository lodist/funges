# GitHub Pages Deployment

## Setup

1. **Enable GitHub Pages** in your repository settings:
   - Go to Settings → Pages
   - Source: "GitHub Actions"

2. **Add repository secrets** (Settings → Secrets and variables → Actions):
   - `VITE_BASE_URL` - Base path for your site

## Base URL Configuration

- **Custom domain**: Set `VITE_BASE_URL=/` (for https://fung.es)
- **GitHub Pages**: Set `VITE_BASE_URL=/funges/` (for https://your-username.github.io/funges/)

## How It Works

- Automatically deploys on push to `main`/`master` branch
- Builds with your environment variables
- Deploys to GitHub Pages
- Base URL is configurable via `VITE_BASE_URL` secret

## Cloudflare settings (not in this repo)

GitHub Pages sends fixed headers and the apex domain is redirected at the edge,
so these three cost real load time and can only be fixed in the Cloudflare
dashboard for `fung.es`:

1. **Apex redirect** — `https://fung.es` 301s to `https://www.fung.es`, worth
   ~770 ms on a throttled mobile connection. Serve the apex directly (or point
   marketing/QR links at `www.` so nobody pays the hop).
2. **Browser Cache TTL** — assets under `/assets/` come back with
   `max-age=86400` even though their filenames are content-hashed. A cache rule
   on `/assets/*` setting `max-age=31536000, immutable` removes ~370 KB of
   revalidation per repeat visit.
3. **Rocket Loader** — off is best. The build now emits `data-cfasync="false"`
   on the entry script (see `cfasyncOptOut` in `vite.config.ts`), which opts the
   one script that matters out of it, but the feature buys a Vite/React app
   nothing.

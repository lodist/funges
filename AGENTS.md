# AGENTS

This repository is a modern React 19 + Vite rewrite of the original Fung.es foraging app. Use this file as a reference when working in the repo.

## Tech Stack

- Node.js 22.16.0
- React 19 with TypeScript
- Vite build tool
- TailwindCSS with SCSS modules
- Zustand for state management
- TanStack Router and TanStack Query
- i18next for localization
- Vitest for unit tests and Storybook for component docs

## Project Structure

```
src/
├── components/   # reusable UI components
├── pages/        # page components
├── routes/       # router definitions
├── store/        # Zustand stores
├── lib/          # utilities and API layer
├── hooks/        # custom React hooks
├── i18n/         # translation files
├── styles/       # global styles and design tokens
└── data/         # static data for species and recipes
```

## Environment

- Copy `.env.example` to `.env` and set required variables.
- Important variables: `VITE_BASE_URL`, `VITE_VISITOR_LIMIT`, and the `R2_*` credentials.

## Common Commands

- `npm run dev` / `make dev` – start development server
- `npm run build` / `make build` – build for production
- `npm run lint` / `make lint` – run ESLint (with Prettier)
- `npm run format` / `make format` – run Prettier formatting
- `npm run test` / `make test` – run Vitest unit tests
- `npm run storybook` / `make storybook` – start Storybook
- `make i18n-check` – validate translation files
- `make deploy` – deploy to GitHub Pages

## Style and Linting

- ESLint flat config with Prettier integration.
- Unused imports/variables are disallowed (`unused-imports` plugin).
- `i18next/no-literal-string` warns against untranslated JSX strings.
- Use TypeScript, React 19 features, Tailwind utilities, and SCSS modules for component styles.

## Testing and Checks

Before committing code:

1. Run `npm run lint`.
2. Run `npm run test`.

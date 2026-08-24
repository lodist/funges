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

## Images

Everything under `src/assets/**` and `public/icons/**` is precached by the
service worker, so an oversized image is downloaded by every visitor whether
they see it or not. Before committing one: species ≤ 512px, recipes ≤ 768px,
icons at the size the manifest declares, WebP quality ~75.

## Environment

- Copy `.env.example` to `.env` and set required variables.
- Important variables: `VITE_BASE_URL` and the `R2_*` credentials.

## Common Commands

- `npm run dev` / `make dev` – start development server
- `npm run build` / `make build` – build for production
- `npm run lint` / `make lint` – run ESLint (with Prettier)
- `npm run format` / `make format` – run Prettier formatting
- `npm run test` / `make test` – run Vitest unit tests
- `npm run storybook` / `make storybook` – start Storybook
- `npx vitest run --project unit` – unit tests only
- `npx vitest run --project storybook` – render every story in a browser and
  gate it on axe (needs `npx playwright install chromium` once)
- `make i18n-check` – validate translation files
- `make deploy` – deploy to GitHub Pages

## Style and Linting

- ESLint flat config with Prettier integration.
- Unused imports/variables are disallowed (`unused-imports` plugin).
- `i18next/no-literal-string` warns against untranslated JSX strings. It runs
  project-wide and `lint:check` treats warnings as errors, so **literal text in
  a story must be wrapped in an expression** — `{'Save'}`, not `Save`. That is
  the escape hatch the existing stories already use; there is no story-specific
  rule exemption to reach for.
- Use TypeScript, React 19 features, Tailwind utilities, and SCSS modules for component styles.

## Testing and Checks

Before committing code:

1. Run `npm run lint`.
2. Run `npm run test`.

`make ci-check` mirrors CI, which runs **both** Vitest projects. The Storybook
project is not an extra test suite bolted onto the docs — the stories _are_ the
design-system documentation and its test at once, so a story that cannot render
is a failing build, and the a11y addon is configured to fail on axe violations.

### Writing a story

- Storybook is the canonical design-system documentation (`#205`, `#206`). Look
  there before building a component, and document a new primitive there.
- The atomic tier lives in the story **title** — `Foundations/…`, `Atoms/…`,
  `Molecules/…` — not in the directory layout. See CONTEXT.md's glossary for
  what belongs in which tier; the molecule boundary is a checkable rule, not a
  matter of taste.
- Primitive stories sit beside their component in `src/components/ui/`, so
  renaming or deleting a component surfaces its documentation in the same diff.
- Shared decorators live in `src/storybook/decorators.tsx`. `withI18n` and
  `withTheme` are applied globally; add `withRouter` or `withSidebar` to a
  story's own `decorators` when it needs them.
- Per-primitive bar: a `Default` story, one story per meaningful variant, size
  or state, `argTypes` with descriptions, `tags: ['autodocs']`, and one matrix
  story rendering every variant together.

## Agent skills

### Issue tracker

Issues and specs live as GitHub issues in `lodist/funges`, using the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five canonical labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout — `CONTEXT.md` + `docs/adr/` at the repo root (neither exists yet; created lazily by `/domain-modeling`). See `docs/agents/domain.md`.

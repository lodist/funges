# Fung.es Project Makefile
# Common development and deployment commands

.PHONY: help dev build lint format test test-watch storybook storybook-build i18n-check analyze deploy clean install install-ci generate-splash type-check preview generate-routes watch-routes dev-setup prod-setup dev-cycle quick-start

# Default target
help:
	@echo "Fung.es Project - Available Commands:"
	@echo ""
	@echo "Development:"
	@echo "  make dev          - Start development server"
	@echo "  make build        - Build app for production"
	@echo "  make clean        - Clean build artifacts"
	@echo ""
	@echo "Code Quality:"
	@echo "  make lint         - Run ESLint"
	@echo "  make format       - Run Prettier format"
	@echo "  make test         - Run Vitest tests"
	@echo "  make test-watch   - Run tests in watch mode"
	@echo "  make type-check   - Run TypeScript type check"
	@echo ""
	@echo "Documentation & Tools:"
	@echo "  make storybook    - Start Storybook"
	@echo "  make i18n-check   - Validate translation files"
	@echo "  make analyze      - Run bundle analyzer"
	@echo "  make generate-splash - Generate PWA splash screen images"
	@echo ""
	@echo "Deployment:"
	@echo "  make deploy       - Build and deploy to GitHub Pages"
	@echo "  make preview      - Start preview server"
	@echo ""
	@echo "Dependencies:"
	@echo "  make install      - Install dependencies"
	@echo "  make install-ci   - Install dependencies for CI"
	@echo ""
	@echo "Workflows:"
	@echo "  make dev-setup    - Setup development environment"
	@echo "  make prod-setup   - Setup production environment"
	@echo "  make dev-cycle    - Run full development cycle"
	@echo "  make quick-start  - Quick start for new developers"

# Development
dev:
	@echo "Starting development server..."
	npm run dev

build:
	@echo "Building for production..."
	npm run build

clean:
	@echo "Cleaning build artifacts..."
	rm -rf dist
	rm -rf node_modules/.vite
	rm -rf .turbo

# Code Quality
lint:
	@echo "Running ESLint..."
	npm run lint

format:
	@echo "Running Prettier format..."
	npm run format

test:
	@echo "Running tests..."
	npm run test

test-watch:
	@echo "Running tests in watch mode..."
	npm run test:watch

type-check:
	@echo "Running TypeScript type check..."
	npx tsc --noEmit

# Documentation & Tools
storybook:
	@echo "Starting Storybook..."
	npm run storybook

storybook-build:
	@echo "Building Storybook..."
	npm run build-storybook

i18n-check:
	@echo "Validating translation files..."
	@if [ -f "src/i18n/locales/en.json" ] && [ -f "src/i18n/locales/it.json" ]; then \
		echo "✓ Translation files found"; \
		echo "Checking for missing keys..."; \
		node -e " \
			const en = require('./src/i18n/locales/en.json'); \
			const it = require('./src/i18n/locales/it.json'); \
			const enKeys = Object.keys(en); \
			const itKeys = Object.keys(it); \
			const missingInIt = enKeys.filter(k => !itKeys.includes(k)); \
			const missingInEn = itKeys.filter(k => !enKeys.includes(k)); \
			if (missingInIt.length > 0) console.log('Missing in Italian:', missingInIt); \
			if (missingInEn.length > 0) console.log('Missing in English:', missingInEn); \
			if (missingInIt.length === 0 && missingInEn.length === 0) console.log('✓ All translation keys are synchronized'); \
		"; \
	else \
		echo "✗ Translation files not found"; \
		exit 1; \
	fi

analyze:
	@echo "Running bundle analyzer..."
	npm run build
	npx vite-bundle-analyzer dist

generate-splash:
	@echo "Generating PWA splash screen images..."
	@if [ ! -f "node_modules/canvas/package.json" ]; then \
		echo "Installing canvas dependency..."; \
		npm install canvas; \
	fi
	@node scripts/generate-splash-screens.js
	@echo "Splash screen images generated successfully!"

# Deployment
deploy:
        @echo "Generating scores metadata..."
        python scripts/generate_scores_metadata.py
        @echo "Building and deploying to GitHub Pages..."
        npm run build
        @if command -v gh-pages >/dev/null 2>&1; then \
                gh-pages -d dist; \
        else \
                echo "Installing gh-pages..."; \
                npm install -g gh-pages; \
		gh-pages -d dist; \
	fi

preview:
	@echo "Starting preview server..."
	npm run preview

# Dependencies
install:
	@echo "Installing dependencies..."
	npm install

install-ci:
	@echo "Installing dependencies for CI..."
	npm ci

# Route management
generate-routes:
	@echo "Generating route tree..."
	npx tsr generate

watch-routes:
	@echo "Watching for route changes..."
	npx tsr watch

# Development workflow
dev-setup: install
	@echo "Setting up development environment..."
	@if [ ! -f ".env" ]; then \
		echo "Creating .env file from template..."; \
		cp .env.example .env 2>/dev/null || echo "No .env.example found, please create .env manually"; \
	fi
	@echo "Development setup complete!"

# Production workflow
prod-setup: install-ci build
	@echo "Production setup complete!"

# Full development cycle
dev-cycle: lint format test build
	@echo "Development cycle complete!"

# Quick start for new developers
quick-start: dev-setup dev
	@echo "Quick start complete! Development server should be running."
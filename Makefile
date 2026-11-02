# The only build and test entry point. Run `make help` to list commands.
# Every agent uses these targets, so builds behave the same for everyone.

SIM_DEVICE ?= iPhone 15 Pro Max
DEV_URL ?= http://localhost:5173
export DEVELOPER_DIR := /Applications/Xcode.app/Contents/Developer

.PHONY: help install dev test format lint typecheck build verify preview deploy sim-safari screenshot icon import-report bench

help: ## List commands
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  make %-14s %s\n", $$1, $$2}'

install: ## Install dependencies (run after cloning or when package.json changes)
	npm install

dev: ## Run the app locally with live reload at http://localhost:5173 (also reachable from the phone on the same Wi-Fi)
	npm run dev

test: ## WorkoutCore unit tests (fast, in Node)
	npx vitest run

format: ## Format every source file with Prettier (run before committing)
	npx prettier --write .

lint: ## Formatting check + ESLint, including the layer rules (core never imports app; app never touches SQLite)
	npx prettier --check .
	npx eslint .

typecheck: ## TypeScript strict checks for core (no DOM), app and tools
	npx tsc -b

build: ## Production build into dist/, with offline support
	npx vite build

verify: lint typecheck test build ## Everything above. Must pass before any task is marked done

preview: build ## Serve the production build (offline support works here, not in `make dev`)
	npx vite preview --host --port 4173

deploy: ## Publish main to https://bader-almutlaq.github.io/workout-tracker/ (pushes main, then runs the Deploy workflow)
	git push origin main
	gh workflow run deploy.yml --ref main
	@echo "Deploy started: gh run watch \$$(gh run list --workflow deploy.yml --limit 1 --json databaseId --jq '.[0].databaseId')"

sim-safari: ## Open the running dev server in Safari on the iPhone simulator
	xcrun simctl boot "$(SIM_DEVICE)" 2>/dev/null || true
	xcrun simctl openurl "$(SIM_DEVICE)" "$(DEV_URL)"

screenshot: ## Save a simulator screenshot to build/screenshots/<timestamp>.png
	mkdir -p build/screenshots
	xcrun simctl io "$(SIM_DEVICE)" screenshot "build/screenshots/$$(date +%Y%m%d-%H%M%S).png"

icon: ## Render design/app-icon.svg into the home-screen icons in public/
	swift tools/render-svg.swift design/app-icon.svg public/icon-512.png 512
	swift tools/render-svg.swift design/app-icon.svg public/icon-192.png 192
	swift tools/render-svg.swift design/app-icon.svg public/apple-touch-icon.png 180

import-report: ## Dry-run the Strong importer on export_data/ and print totals (available from milestone W1)
	npx tsx tools/import-report.ts

bench: ## Time the analytics calls on a synthetic 4-year history, cold and warm (not part of verify)
	npx tsx tools/bench-analytics.ts

# =====================================================================
# PitchMic — Single-entry orchestration (per engineering standards)
# Fail-fast: every target uses set -e ; no || true masking
# =====================================================================
SHELL := /bin/bash
.SHELLFLAGS := -euo pipefail -c
.ONESHELL:

# ---- Environment defaults (override via .env or shell) ----
POSTGRES_USER ?= pitchmic
POSTGRES_DB ?= pitchmic
POSTGRES_PASSWORD ?= pitchmic_dev

.PHONY: help dev up down build migrate test lint typecheck ci clean reset-db

COMPOSE := docker compose
BACKEND := $(COMPOSE) exec -T backend
FRONTEND := $(COMPOSE) exec -T frontend

help: ## Show this help
	@awk -F':.*##' '/^[a-zA-Z_-]+:.*##/ { printf "\033[36m%-18s\033[0m %s\n", $$1, $$2 }' $(MAKEFILE_LIST)

# ---------------------------------------------------------------------
# Day-to-day
# ---------------------------------------------------------------------
dev: build migrate up ## Full local stack: build → migrate → up

up: ## Start containers (foreground logs)
	$(COMPOSE) up

down: ## Stop and remove containers
	$(COMPOSE) down

build: ## Build images (no cache prune — explicit via clean target)
	$(COMPOSE) build

# ---------------------------------------------------------------------
# DB & migrations
# ---------------------------------------------------------------------
migrate: ## Run Django migrations (creates migrations then applies)
	@$(COMPOSE) up -d postgres
	@sleep 2
	$(BACKEND) python manage.py makemigrations --noinput
	$(BACKEND) python manage.py migrate --noinput

reset-db: ## ⚠️  Drop & recreate DB + migrations (dev only)
	$(COMPOSE) stop backend || true
	$(COMPOSE) exec -T postgres psql -U $(POSTGRES_USER) -c "DROP DATABASE IF EXISTS $(POSTGRES_DB);" || true
	$(COMPOSE) exec -T postgres psql -U $(POSTGRES_USER) -c "CREATE DATABASE $(POSTGRES_DB);" || true
	$(MAKE) migrate

# ---------------------------------------------------------------------
# Quality gates (fail-fast order: lint → type → test → build)
# ---------------------------------------------------------------------
lint: ## ruff + eslint — warnings treated as errors
	$(BACKEND) ruff check .
	$(BACKEND) ruff format --check .
	$(FRONTEND) npx eslint --max-warnings=0 .

typecheck: ## mypy + tsc (noEmit)
	$(BACKEND) mypy .
	$(FRONTEND) npx tsc --noEmit

test: ## pytest + vitest — coverage enforced (85%)
	$(BACKEND) pytest --cov=. --cov-report=term-missing --cov-fail-under=85
	$(FRONTEND) npx vitest run --coverage

ci: lint typecheck test ## The full CI gate — must pass before deploy
	@echo "✅ All CI gates passed."

# ---------------------------------------------------------------------
# Utility
# ---------------------------------------------------------------------
clean: ## Prune build caches and containers
	$(COMPOSE) down -v --rmi local
	rm -rf backend/.mypy_cache backend/.pytest_cache backend/staticfiles
	rm -rf frontend/.next frontend/node_modules

#!/usr/bin/env bash
# One-command deploy for Ubuntu/Debian VPS.
# Run from the project directory:  ./deploy.sh
set -euo pipefail
cd "$(dirname "$0")"

say() { printf "\n\033[1;32m→ %s\033[0m\n" "$1"; }
warn() { printf "\n\033[1;33m! %s\033[0m\n" "$1"; }

# 1. Docker + compose plugin
if ! command -v docker >/dev/null 2>&1; then
  say "Устанавливаю Docker..."
  curl -fsSL https://get.docker.com | sh
fi
if ! docker compose version >/dev/null 2>&1; then
  warn "Docker Compose plugin не найден. Установите 'docker-compose-plugin' и повторите."
  exit 1
fi

# 2. .env
if [ ! -f .env ]; then
  cp .env.example .env
  warn "Создан .env из шаблона. Откройте его (nano .env) и задайте: DOMAIN, APP_PASSWORD, CMC_API_KEY."
fi

# 3. Auto-generate strong secrets if still placeholders
gen() { openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | cut -c1-48; }
if ! grep -q '^AUTH_SECRET=' .env || grep -q 'change-me' <(grep '^AUTH_SECRET=' .env); then
  sed -i '/^AUTH_SECRET=/d' .env; echo "AUTH_SECRET=\"$(gen)\"" >> .env; say "Сгенерирован AUTH_SECRET"
fi
if ! grep -q '^CRON_SECRET=' .env || grep -q 'change-me' <(grep '^CRON_SECRET=' .env); then
  sed -i '/^CRON_SECRET=/d' .env; echo "CRON_SECRET=\"$(gen)\"" >> .env; say "Сгенерирован CRON_SECRET"
fi

# 4. Sanity checks
grep -q '^DOMAIN=' .env || { warn "В .env нет DOMAIN — добавьте строку DOMAIN=\"ваш.домен\""; exit 1; }
[ -f secrets/google-service-account.json ] || warn "Нет secrets/google-service-account.json — расходы из Sheets не будут синхронизироваться, пока не добавите ключ."

# 5. Build & start
say "Сборка и запуск (app + db + worker + caddy с авто-HTTPS)..."
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

say "Готово. Контейнеры:"
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
DOMAIN_VAL=$(grep '^DOMAIN=' .env | cut -d= -f2- | tr -d '"')
say "Откройте https://${DOMAIN_VAL} (после того как DNS A-запись указывает на этот сервер и сертификат выпущен)."

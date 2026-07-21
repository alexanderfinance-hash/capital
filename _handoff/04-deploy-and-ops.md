# 04 — Деплой и эксплуатация

Полная инструкция с нуля — `DEPLOY.md`. Здесь — сжатая операционная памятка.

## Как устроен деплой

- Код в GitHub. Прод-версия живёт в ветке **`claude/dreamy-johnson-pUcCJ`**.
- При пуше в эту ветку срабатывает GitHub Actions (`.github/workflows/deploy.yml`):
  раннер заходит на VPS по SSH и выполняет `git pull --ff-only` + `./deploy.sh`.
- `deploy.sh` ставит Docker (если надо), генерит недостающие секреты, собирает и
  поднимает контейнеры, применяет миграции, гоняет
  `prisma/import-company-wallets.ts` (идемпотентный импорт адресов компании).
- Авто-деплой включается переменной `DEPLOY_ENABLED=true`. Изменения только в
  `.github/**` и `*.md` деплой не запускают (`paths-ignore`).
- Запуск вручную: **Actions → Deploy to VPS → Run workflow**.

## Текущий сервер и режим (важно!)

- **Сервер: `159.89.6.214`** (DigitalOcean, FRA1, hostname `ubuntu-s-2vcpu-2gb-fra1-01`).
  Пользователь деплоя — **`sasha`** (секрет `VPS_USER`). Репозиторий — в **`/opt/capital`**.
- Это **общий сервер на несколько проектов**: на нём хостовый **системный Caddy**
  (`/etc/caddy/Caddyfile`, служба `caddy`), который держит 80/443 и проксирует
  домены: `alex-finance.pro → 127.0.0.1:3001`, `finance-company.online → :3000`,
  `tgsm.…nip.io → :8080`. Его конфиг и порты трогать нельзя.
- Поэтому наш стек работает в режиме **«за внешним reverse-proxy»**
  (`EXTERNAL_PROXY=true` в `.env`): свой Caddy НЕ поднимаем, отдаём приложение на
  **`127.0.0.1:3001`** (`docker-compose.proxy.yml`), куда проксирует хостовый Caddy.
- **БД — контейнерная** (`capital-db-1`, volume `pgdata`). При переезде реальные
  данные были перенесены из старого хостового Postgres в контейнер (pg_dump →
  pg_restore). `DATABASE_URL` в `.env` (localhost:5432) относится к СТАРОЙ хостовой
  БД — приложение её НЕ использует (в контейнере DATABASE_URL=`db:5432`).
- Мелочи на сервере, которые стоит выключить (наследие ручного переезда): старый
  хостовый Postgres на 5432 и `capital-worker.service` — они больше не нужны.
- **2 ГБ RAM** — при сборке `next build` нужен swap (есть) + лимит кучи
  `NODE_OPTIONS=--max-old-space-size=4096` (задан в Dockerfile).

## Контейнеры (docker-compose)

4 сервиса: `app` (Next.js), `db` (Postgres), `worker` (cron-синки), `caddy`
(авто-HTTPS). Наружу открыты только 80/443 (Caddy); Postgres (5432) и app (3000)
слушают localhost.

```bash
# на сервере, в ~/capital
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps        # статус
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f app
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f worker
git pull && ./deploy.sh                                                    # обновить
```

## Диагностика

- **Workflow «Verify server config»** (`.github/workflows/verify-server.yml`) —
  по SSH проверяет, какие ключи в `.env` на сервере заданы (выводит «задан / не
  задан», без значений). Запуск вручную из вкладки Actions.
- **`GET /api/health`** — проверка связи с БД (его же поллит воркер на старте).
- **`GET /api/sync/tonnums`** (под сессией) — что распозналось по курсу TON-номера;
  **`?probe=1`** — какие внешние хосты доступны с сервера (диагностика egress).
- Прочие синки тоже имеют `POST /api/sync/<name>` — их дёргает воркер с `CRON_SECRET`.

## Воркер (cron)

`src/worker/index.ts`: на старте ждёт готовности app (поллинг `/api/health` до 2
мин), затем по расписанию дёргает синк-эндпоинты с `CRON_SECRET` и бэкоффом (до 3
попыток). Это лечит ложную «синхронизация недоступна» сразу после деплоя
(гонка старта). Расписания — в `.env` (`SYNC_*_CRON`).

## Прочие workflow

- `configure-telegram.yml` — помощь в настройке Telegram-бота.
- `configure-wireguard.yml` — настройка ванильного WireGuard split-tunnel (устарел,
  оставлен для справки).
- `configure-amneziawg.yml` — **актуальный** способ поднять туннель к Telegram.
  Провайдер выдаёт AmneziaWG-конфиг (параметры `Jc/Jmin/Jmax/S1/S2/H1–H4` — обход
  DPI), которые ванильный `wg-quick` не парсит (`Line unrecognized: Jc=8`). Workflow
  ставит `amneziawg` (PPA `amnezia/ppa`, awg-quick + модуль ядра DKMS), кладёт конфиг
  из секрета `WG_CONFIG` в `/etc/amnezia/amneziawg/tgwg.conf` (split-tunnel только на
  подсети Telegram), поднимает `tgwg` через `awg-quick` и возвращает бота на поллинг.
  **Если туннель отвалился / балансы агентств замерли** — обнови `WG_CONFIG` свежим
  рабочим конфигом и запусти этот workflow. Проверка в логах: `host → api.telegram.org`
  должно быть `200/404/302` (не `000/fail`).

## Песочница vs прод (важно при отладке)

Среда разработки (песочница) имеет **ограниченный исходящий сетевой доступ**:
часть внешних API режется egress-фильтром (исторически — `api.getgems.io` отдавал
403; зато `nums888.io` доступен). Поэтому синки, тянущие внешние данные, могут «не
видеть» источник из песочницы, но работать на VPS с открытой сетью. Не считай это
багом кода без проверки на проде — используй диагностические эндпоинты и
«Verify server config».

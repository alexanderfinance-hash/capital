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

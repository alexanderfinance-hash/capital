# 03 — Аккаунт, репозиторий, секреты (что перевезти)

## Репозиторий и аккаунт

- **GitHub-репозиторий:** `alexanderfinance-hash/capital`
  (`https://github.com/alexanderfinance-hash/capital`).
- На новом аккаунте Claude нужно, чтобы этот репозиторий был **в скоупе сессии**
  (GitHub MCP). Если репозитория не видно — проверить доступ/добавить через
  механизм добавления репозиториев на новом аккаунте.
- GitHub-операции делаются через MCP-инструменты `mcp__github__*` (нет `gh` CLI).

## Ветки

- **Прод-ветка (деплой) = `claude/dreamy-johnson-pUcCJ`** — ветка по умолчанию
  репозитория. Пуш сюда → авто-деплой на VPS. Сюда попадают только слитые PR.
- Разработка — feature-ветки `claude/<имя>`. Прошлые рабочие ветки в репозитории
  накапливаются (это нормально, по одной на задачу).
- Авторы коммитов: `Claude <noreply@anthropic.com>` и
  `alexanderfinance-hash <alexander_finance@bestcompany.pro>`.

## MCP-серверы, подключённые в сессии

- **GitHub** — PR, issues, файлы, CI. Скоуп: только `alexanderfinance-hash/capital`.
- **Google Drive** — доступ к файлам (таблицы расходов/ДДС лежат в Google Sheets).
- **Figma** — дизайн (дашборд воспроизводит дизайн-прототип).

Если на новом аккаунте этих серверов нет — переподключить их там, иначе часть
возможностей (чтение Sheets через Drive, дизайн-контекст из Figma) будет недоступна.

## ⚠️ Секреты — их НЕТ в репозитории, перевозить отдельно

Реальные значения секретов намеренно не в git (только `.env.example` с
плейсхолдерами). При переезде их надо перенести **из защищённого места**
(сервер `.env`, GitHub Secrets), а не из этого репозитория. Ниже — полный
инвентарь: что нужно и откуда берётся.

### На сервере: файл `.env` (рядом с проектом в `~/capital`)

| Переменная | Назначение | Где взять |
|-----------|-----------|-----------|
| `DATABASE_URL` | Postgres приложения | задаётся compose/деплоем |
| `AUTH_SECRET` | подпись JWT сессии | генерится `deploy.sh`, иначе `openssl rand -base64 48` |
| `APP_PASSWORD` | пароль входа в дашборд | задаёт заказчик |
| `CMC_API_KEY` | котировки CoinMarketCap | аккаунт CoinMarketCap |
| `TRONGRID_API_KEY` | стабильный сбор Tron | аккаунт TronGrid |
| `GOOGLE_SHEETS_ID` | таблица расходов | уже в `.env.example` (id листа) |
| `GOOGLE_APPLICATION_CREDENTIALS` / `GOOGLE_SERVICE_ACCOUNT_JSON` | сервис-аккаунт Google для Sheets | JSON-ключ сервис-аккаунта (файл `secrets/google-service-account.json`) |
| `GOOGLE_SHEETS_DDS_ID` | таблица ДДС (доходы) | id листа ДДС |
| `TELEGRAM_BOT_TOKEN` | бот остатков агентств | @BotFather (см. `TELEGRAM.md`) |
| `TELEGRAM_CHAT_ID` | id рабочего чата | из getUpdates (отрицательное число) |
| `TELEGRAM_WEBHOOK_SECRET` | если webhook вместо polling | любая длинная строка |
| `COINLINK_DATABASE_URL` | внешняя read-only БД кредиторки | строка подключения (host/user известны, **пароль** — у заказчика) |
| `CRON_SECRET` | воркер → синк-эндпоинты | генерится `deploy.sh` |

> `AUTH_SECRET` и `CRON_SECRET` `deploy.sh` создаёт сам, если их нет.
> Полные пояснения по каждой переменной (дефолты, опции, регэкспы) — в `.env.example`.

### Файл ключа Google: `secrets/google-service-account.json`

JSON-ключ сервис-аккаунта, у которого есть доступ (read-only) к таблицам расходов
и ДДС. Лежит только на сервере в `secrets/`. При переезде сервера — перенести файл
(и желательно **перевыпустить ключ**, т.к. старый мог светиться в переписке).
Сервис-аккаунт должен быть добавлен как читатель в обе Google-таблицы.

### GitHub Secrets (для авто-деплоя, Settings → Secrets and variables → Actions)

| Имя | Назначение |
|-----|-----------|
| `VPS_HOST` | IP/домен сервера |
| `VPS_USER` | SSH-пользователь (напр. `root`) |
| `VPS_SSH_KEY` | приватный SSH-ключ деплоя (полное содержимое) |
| `VPS_PORT` | (опц.) нестандартный SSH-порт |

GitHub **Variables**: `DEPLOY_ENABLED=true` — включает авто-деплой (без неё
workflow тихо пропускается).

## Чек-лист переезда секретов

- [ ] Доступ к репозиторию `alexanderfinance-hash/capital` на новом аккаунте.
- [ ] Перенести `.env` сервера (или пересоздать из `.env.example` + значения).
- [ ] Перенести/перевыпустить `secrets/google-service-account.json`, выдать
      сервис-аккаунту доступ к Google-таблицам.
- [ ] Перезавести GitHub Secrets (`VPS_*`) и Variable `DEPLOY_ENABLED` на новом
      аккаунте/репозитории, если меняется владелец CI.
- [ ] Проверить ключи: `CMC_API_KEY`, `TRONGRID_API_KEY`, `TELEGRAM_BOT_TOKEN`,
      пароль `COINLINK_DATABASE_URL`.
- [ ] Прогнать workflow «Verify server config» — покажет, какие ключи на сервере
      заданы (без значений).

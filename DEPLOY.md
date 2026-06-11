# Развёртывание на VPS (с нуля, для новичка)

Дашборд запускается одной командой через Docker: поднимаются 4 контейнера —
приложение, база Postgres, фоновый воркер (синхронизация) и Caddy
(автоматический HTTPS). Ниже — весь путь от заказа сервера до рабочего адреса.

> ⚠️ Я (ассистент) не имею доступа к вашему серверу. Все команды на VPS
> запускаете вы — они собраны ниже копипастой.

---

## Шаг 1. Заказать VPS

Возьмите VPS с **Ubuntu 24.04 LTS**. Минимум: **2 vCPU, 2–4 ГБ RAM, 40 ГБ SSD**.

Провайдеры (любой подойдёт):
- **Hetzner Cloud** (Германия, дёшево, ~€4–5/мес) — hetzner.com/cloud
- **Timeweb Cloud** / **Selectel** / **Beget** (РФ, оплата картой РФ)

При заказе:
- ОС: **Ubuntu 24.04**;
- запишите **IP-адрес** сервера и **root-пароль** (или загрузите SSH-ключ).

## Шаг 2. Купить домен и направить на сервер

1. Купите домен у регистратора: **reg.ru**, **Namecheap**, **Cloudflare**.
2. В настройках DNS добавьте **A-запись**:
   - Хост/имя: `@` (или поддомен, напр. `capital`);
   - Значение: **IP вашего VPS**;
   - TTL: по умолчанию.
3. Подождите 10–60 минут (распространение DNS). Итоговый адрес, напр.
   `capital.ваш-домен.ru`.

## Шаг 3. Зайти на сервер

С Windows проще всего через встроенный SSH в PowerShell:
```powershell
ssh root@IP_ВАШЕГО_СЕРВЕРА
```
Введите пароль (или подтвердите ключ). Вы окажетесь в консоли сервера.

## Шаг 4. Установить git и скачать проект

```bash
apt-get update && apt-get install -y git
git clone https://github.com/alexanderfinance-hash/capital.git
cd capital
git checkout claude/dreamy-johnson-pUcCJ
```
(git попросит логин/токен GitHub — введите доступ к репозиторию.)

## Шаг 5. Настроить секреты

1. Создайте файл окружения:
   ```bash
   cp .env.example .env
   nano .env
   ```
   Заполните как минимум:
   - `DOMAIN="capital.ваш-домен.ru"` — ваш домен из шага 2;
   - `APP_PASSWORD="..."` — пароль для входа в дашборд;
   - `CMC_API_KEY="..."` — ключ CoinMarketCap.
   `AUTH_SECRET` и `CRON_SECRET` генерировать не нужно — скрипт сделает сам.
   Сохранить в nano: `Ctrl+O`, `Enter`, выйти `Ctrl+X`.

2. Положите ключ сервис-аккаунта Google (для расходов из Sheets):
   ```bash
   mkdir -p secrets
   nano secrets/google-service-account.json
   ```
   Вставьте содержимое JSON-ключа, сохраните (`Ctrl+O`, `Enter`, `Ctrl+X`).
   > Доступ к таблице у сервис-аккаунта уже выдан. Рекомендуется **перевыпустить
   > ключ** (старый засветился в переписке) и вставить новый.

## Шаг 6. Запустить одной командой

```bash
./deploy.sh
```
Скрипт сам установит Docker (если нужно), сгенерирует секреты, соберёт и
запустит всё. Первый запуск займёт несколько минут (сборка образа).

## Шаг 7. Открыть дашборд

Откройте в браузере: `https://capital.ваш-домен.ru`
Caddy автоматически выпустит SSL-сертификат (может занять до минуты при
первом заходе). Войдите паролем из `APP_PASSWORD`.

Внутри: нажмите «обновить» в разделе «Инвестиции» — подтянутся реальные
балансы по адресам и курсы; расходы синхронизируются с Google Sheets
(воркер делает это автоматически: крипта каждые 10 мин, расходы раз в час).

---

## Обновление до новой версии
```bash
cd capital
git pull
./deploy.sh
```

## Полезные команды
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps      # статус
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f app    # логи приложения
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f worker # логи синхронизаций
docker compose -f docker-compose.yml -f docker-compose.prod.yml down    # остановить
```

## Смена пароля входа

Пароль входа хранится в базе (bcrypt-хэш), поэтому правка `APP_PASSWORD` в
`.env` сама по себе пароль уже работающего дашборда **не меняет**.

**Без захода на сервер (рекомендуется):**
1. Репозиторий → **Settings → Secrets and variables → Actions → New repository
   secret**: имя `NEW_APP_PASSWORD`, значение — новый пароль.
2. Вкладка **Actions → Change password → Run workflow**.
3. Готово — вход сразу по новому паролю. Секрет после смены можно удалить.

Workflow обновляет хэш в БД (`prisma/set-password.ts`) и синхронизирует
`APP_PASSWORD` в `.env` на сервере; данные дашборда не затрагиваются.
Предусловия те же, что у авто-деплоя: секреты `VPS_*` и `DEPLOY_ENABLED=true`.

**Вручную по SSH (альтернатива):**
```bash
cd capital
docker exec capital-app-1 npx tsx prisma/set-password.ts "НовыйПароль"
```

## Безопасность
- Порты Postgres (5432) и приложения (3000) слушают только localhost —
  наружу открыты лишь 80/443 (Caddy, HTTPS).
- Секреты (`.env`, `secrets/`) в git не попадают.
- Рекомендуется включить файрвол: `ufw allow 22,80,443/tcp && ufw enable`.

---

## Авто-деплой (CI/CD)

Чтобы больше не заходить на сервер вручную при каждом изменении кода: настроен
GitHub Actions (`.github/workflows/deploy.yml`). После пуша в прод-ветку
(`claude/dreamy-johnson-pUcCJ`) CI сам заходит на сервер по SSH и выполняет
`git pull && ./deploy.sh`. Секреты приложения (`.env`, `secrets/`) при этом
остаются на сервере — CI к ним не прикасается, ему нужен только SSH-доступ.

### Настройка (один раз)

**1. Создайте отдельный SSH-ключ для деплоя** (на своём компьютере или сервере):
```bash
ssh-keygen -t ed25519 -f deploy_key -N "" -C "github-actions-deploy"
```
Получатся два файла: `deploy_key` (приватный) и `deploy_key.pub` (публичный).

**2. Разрешите этому ключу заходить на сервер** — добавьте публичный ключ в
`~/.ssh/authorized_keys` на VPS:
```bash
cat deploy_key.pub | ssh root@IP_ВАШЕГО_СЕРВЕРА 'mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys'
```

**3. Заведите секреты в GitHub** — репозиторий → **Settings → Secrets and
variables → Actions → New repository secret**:
| Имя | Значение |
|-----|----------|
| `VPS_HOST` | IP или домен сервера |
| `VPS_USER` | пользователь SSH (например, `root`) |
| `VPS_SSH_KEY` | **полное содержимое приватного файла** `deploy_key` |

**4. Включите деплой** — там же, вкладка **Variables → New repository variable**:
| Имя | Значение |
|-----|----------|
| `DEPLOY_ENABLED` | `true` |

Пока этой переменной нет, workflow тихо пропускается (не падает с ошибкой).

### Как это работает дальше
- Любой пуш в `claude/dreamy-johnson-pUcCJ` запускает деплой автоматически.
- Можно запустить вручную: вкладка **Actions → Deploy to VPS → Run workflow**.
- Прогресс/логи деплоя видны во вкладке **Actions**.

### Предусловия на сервере
- Репозиторий склонирован в `~/capital` (как в шаге 4 выше).
- Сервер умеет делать `git pull` без ввода пароля. Если репозиторий приватный и
  клонирован по HTTPS — настройте сохранение токена
  (`git config --global credential.helper store` и один ручной `git pull`),
  либо переключите remote на SSH-доступ к GitHub.
- Нестандартный SSH-порт? Добавьте секрет `VPS_PORT` и строку
  `port: ${{ secrets.VPS_PORT }}` в `deploy.yml`.


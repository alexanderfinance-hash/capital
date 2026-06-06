# Capital Dashboard

Дашборд личного и корпоративного капитала. Next.js (App Router, TypeScript) +
Postgres (далее по плану). Пиксель-в-пиксель воспроизводит дизайн-прототип из
`design_handoff_capital_dashboard/`.

## Статус по этапам

- [x] **Этап 1** — стек и архитектура (Next.js + Postgres, Docker/VPS).
- [x] **Этап 2** — каркас фронта на mock-данных: оба контура, все разделы,
      3 вкладки компании, светлая/тёмная темы, адаптив сайдбара в нижний таб-бар.
- [x] **Этап 3** — Postgres + Prisma, схема БД по контрактам, сидер,
      аутентификация (вход по паролю, JWT-cookie), Docker-инфраструктура.
- [ ] **Этап 4** — ручной ввод → БД (дивиденды, активы, агентства, резервы).
- [x] **Этап 5** — Google Sheets → расходы (лист «Отчёт», ₽→$ по курсу ЦБ).
- [x] **Этап 6** — блокчейн-адаптеры (BTC/ETH/TRX/TON), котировки CMC, cron-воркер.

## Синхронизация данных (этапы 5–6)
- **Расходы:** `POST /api/sync/expenses` — читает лист «Отчёт», конвертирует
  ₽→$ (ЦБ РФ, `src/lib/fx.ts`), пишет `ExpenseMonth`/`ExpenseCategory`.
- **Крипта:** `POST /api/sync/crypto` — читает адреса из `Wallet` (scope=personal),
  тянет балансы (BTC/EVM/TRON/TON), оценивает по CoinMarketCap, пишет
  по-монетные `Asset` + `CoinAllocation` + снапшот капитала.
- **Воркер** (`src/worker/index.ts`, контейнер `worker` в compose) дёргает эти
  эндпоинты по cron (крипта каждые 10 мин, расходы раз в час) с `CRON_SECRET`.
- Кнопка «обновить» в личном контуре запускает синхронизацию крипты.

> ⚠️ Внешние API (ЦБ, CoinMarketCap, блокчейн-эксплореры) требуют сетевого
> доступа. В песочнице с закрытой сетью используются запасной курс и кэш;
> живые данные подтягиваются в окружении с открытой сетью (ваш VPS).
> Секреты (ключ сервис-аккаунта Google, CMC, пароли) — только в `.env`/`secrets/`,
> в репозиторий не коммитятся.

## Запуск

### Вариант A — локально, без базы (быстрый просмотр UI)
```bash
copy .env.example .env      # Windows (PowerShell);  на macOS/Linux: cp .env.example .env
npm install
npm run dev                 # http://localhost:3000
```
Вход по паролю из `.env` (`APP_PASSWORD`, по умолчанию `capital123`). Данные — mock.
Без запущенного Postgres вне продакшна вход работает по паролю из окружения.

### Вариант B — всё в Docker (как на проде/VPS)
```bash
cp .env.example .env        # задайте свой AUTH_SECRET и APP_PASSWORD
docker compose up --build   # поднимет Postgres + приложение, применит миграции и сид
# http://localhost:3000
```

### Работа с БД напрямую (Prisma)
```bash
npm run db:migrate          # создать/применить миграции (dev)
npm run db:seed             # заполнить таблицы mock-данными
npx prisma studio           # визуальный просмотр БД
```

## Аутентификация
Вход по одному паролю (один пользователь). Пароль хранится в БД как bcrypt-хеш
(сидится из `APP_PASSWORD`). Сессия — подписанный JWT в httpOnly-cookie (`jose`).
Все страницы закрыты middleware; публичны только `/login` и `/api/auth/*`.
Чтобы сменить пароль: поменяйте `APP_PASSWORD` в `.env` и выполните `npm run db:seed`.

## Структура

```
src/
  app/
    layout.tsx            корневой layout: шрифты, провайдеры, инициализация темы
    globals.css           дизайн-токены + темы + оболочка (порт dashboard-styles.css)
    (dash)/               группа маршрутов с сайдбаром
      page.tsx            Обзор
      investments/        Инвестиции
      expenses/           Расходы
      dividends/          Дивиденды
      assets/             Активы
      company/            Баланс компании (3 вкладки)
  components/
    Shell.tsx             сайдбар + мобильный таб-бар
    Icon.tsx              инлайн-SVG иконки
    ui.tsx, cards.tsx     общие элементы
    Toast.tsx, *Modal.tsx модалки и тосты
    views/                экраны разделов
    middleware.ts         защита маршрутов (проверка сессии)
    app/login/            страница входа
    app/api/auth/         login / logout
    app/api/health/       проверка связи с БД
  lib/
    types.ts              доменные типы (контракт для схемы БД)
    mockData.ts           mock-данные (STORE/CHARTS/WALLETS/AGENCIES/HISTORY)
    chart.tsx             SVG-графики, пончик, водопад, бейджи/чипы
    store.tsx             состояние приложения (React Context)
    prisma.ts             singleton Prisma-клиента
    session.ts            подпись/проверка JWT (edge-safe, jose)
    auth-server.ts        getSession / проверка пароля (bcrypt + Prisma)
    format.ts, theme.ts   форматирование чисел, переключение темы
prisma/
    schema.prisma         схема БД (контракт по mock-данным)
    seed.ts               сидер (mock → БД)
    migrations/           SQL-миграции
Dockerfile, docker-compose.yml, docker-entrypoint.sh
```

> Все числа сейчас — mock. Реальные интеграции (блокчейн, Google Sheets, БД)
> добавляются на этапах 3–6. Поля mock-данных служат контрактом для схемы БД.

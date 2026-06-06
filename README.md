# Capital Dashboard

Дашборд личного и корпоративного капитала. Next.js (App Router, TypeScript) +
Postgres (далее по плану). Пиксель-в-пиксель воспроизводит дизайн-прототип из
`design_handoff_capital_dashboard/`.

## Статус по этапам

- [x] **Этап 1** — стек и архитектура (Next.js + Postgres, Docker/VPS, Auth.js).
- [x] **Этап 2** — каркас фронта на mock-данных: оба контура, все разделы,
      3 вкладки компании, светлая/тёмная темы, адаптив сайдбара в нижний таб-бар.
- [ ] **Этап 3** — бэкенд + Postgres + аутентификация + схема БД.
- [ ] **Этап 4** — ручной ввод → БД (дивиденды, активы, агентства, резервы).
- [ ] **Этап 5** — Google Sheets → расходы.
- [ ] **Этап 6** — блокчейн-адаптеры (BTC/ETH/TRX/TON), котировки, cron-снапшоты.

## Запуск (dev)

```bash
npm install
npm run dev
# http://localhost:3000
```

## Сборка

```bash
npm run build && npm run start
```

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
  lib/
    types.ts              доменные типы (контракт для схемы БД)
    mockData.ts           mock-данные (STORE/CHARTS/WALLETS/AGENCIES/HISTORY)
    chart.tsx             SVG-графики, пончик, водопад, бейджи/чипы
    store.tsx             состояние приложения (React Context)
    format.ts, theme.ts   форматирование чисел, переключение темы
```

> Все числа сейчас — mock. Реальные интеграции (блокчейн, Google Sheets, БД)
> добавляются на этапах 3–6. Поля mock-данных служат контрактом для схемы БД.

-- Weekly personal income (net profit «Всего чистая прибыль») from the
-- «Отчет Общий» report, USD per week (keyed by the week's Sunday).
CREATE TABLE "WeeklyIncome" (
    "weekEnd" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "usd" DECIMAL(18,2) NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'profit',
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WeeklyIncome_pkey" PRIMARY KEY ("weekEnd")
);

-- The monthly income line now comes from the net-profit report, not the ДДС
-- dividends. New rows default to source 'profit'.
ALTER TABLE "MonthlyIncome" ALTER COLUMN "source" SET DEFAULT 'profit';

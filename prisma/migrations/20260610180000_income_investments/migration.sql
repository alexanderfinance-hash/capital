-- Monthly personal income (dividends from the ДДС sheet ledger), USD per period.
CREATE TABLE "MonthlyIncome" (
    "period" TEXT NOT NULL,
    "usd" DECIMAL(18,2) NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'dds',
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MonthlyIncome_pkey" PRIMARY KEY ("period")
);

-- Expense rows reclassified as investments (education etc.), USD per period.
CREATE TABLE "OtherInvestment" (
    "id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "parent" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "value" DECIMAL(18,2) NOT NULL,
    CONSTRAINT "OtherInvestment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OtherInvestment_period_parent_name_key" ON "OtherInvestment"("period", "parent", "name");

-- Individual personal-expense payments from the ДДС ledger (for drill-down)
CREATE TABLE "ExpenseTransaction" (
    "id"      TEXT NOT NULL,
    "period"  TEXT NOT NULL,
    "parent"  TEXT NOT NULL,
    "sub"     TEXT NOT NULL,
    "date"    TEXT NOT NULL,
    "comment" TEXT NOT NULL,
    "value"   DECIMAL(18,2) NOT NULL,
    CONSTRAINT "ExpenseTransaction_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ExpenseTransaction_period_parent_sub_idx" ON "ExpenseTransaction"("period", "parent", "sub");

CREATE TABLE "ExpenseWeekTransaction" (
    "id"      TEXT NOT NULL,
    "weekEnd" TEXT NOT NULL,
    "parent"  TEXT NOT NULL,
    "sub"     TEXT NOT NULL,
    "date"    TEXT NOT NULL,
    "comment" TEXT NOT NULL,
    "value"   DECIMAL(18,2) NOT NULL,
    CONSTRAINT "ExpenseWeekTransaction_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ExpenseWeekTransaction_weekEnd_parent_sub_idx" ON "ExpenseWeekTransaction"("weekEnd", "parent", "sub");

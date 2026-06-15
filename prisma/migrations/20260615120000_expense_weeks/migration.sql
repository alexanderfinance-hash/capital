-- Weekly expense totals (last ~12 weeks, from Google Sheets)
CREATE TABLE "ExpenseWeek" (
    "id"      TEXT NOT NULL,
    "label"   TEXT NOT NULL,          -- "01.06–07.06"
    "weekEnd" TEXT NOT NULL,          -- "YYYY-MM-DD"
    "value"   DECIMAL(18,2) NOT NULL,
    CONSTRAINT "ExpenseWeek_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ExpenseWeek_weekEnd_key" ON "ExpenseWeek"("weekEnd");

-- Category breakdown per week
CREATE TABLE "ExpenseWeekCategory" (
    "id"      TEXT NOT NULL,
    "weekEnd" TEXT NOT NULL,
    "name"    TEXT NOT NULL,
    "value"   DECIMAL(18,2) NOT NULL,
    CONSTRAINT "ExpenseWeekCategory_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ExpenseWeekCategory_weekEnd_name_key" ON "ExpenseWeekCategory"("weekEnd", "name");

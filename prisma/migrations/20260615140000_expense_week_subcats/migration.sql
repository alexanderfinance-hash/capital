-- Weekly expense subcategory breakdown (for the expandable tree in weekly mode)
CREATE TABLE "ExpenseWeekSubcategory" (
    "id"      TEXT NOT NULL,
    "weekEnd" TEXT NOT NULL,
    "parent"  TEXT NOT NULL,
    "name"    TEXT NOT NULL,
    "value"   DECIMAL(18,2) NOT NULL,
    CONSTRAINT "ExpenseWeekSubcategory_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ExpenseWeekSubcategory_weekEnd_parent_name_key" ON "ExpenseWeekSubcategory"("weekEnd", "parent", "name");
CREATE INDEX "ExpenseWeekSubcategory_weekEnd_parent_idx" ON "ExpenseWeekSubcategory"("weekEnd", "parent");

-- AlterTable
ALTER TABLE "Wallet" ADD COLUMN     "holdingsJson" JSONB;

-- CreateTable
CREATE TABLE "ExpenseSubcategory" (
    "id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "parent" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "value" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "ExpenseSubcategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExpenseSubcategory_period_parent_idx" ON "ExpenseSubcategory"("period", "parent");

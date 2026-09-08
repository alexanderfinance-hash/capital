-- Секретные личные расходы Алекса (из отдельной Google-таблицы).
-- CreateTable
CREATE TABLE "SecretExpenseTxn" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "parent" TEXT NOT NULL,
    "sub" TEXT NOT NULL,
    "comment" TEXT NOT NULL,
    "value" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "SecretExpenseTxn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SecretExpenseTxn_date_idx" ON "SecretExpenseTxn"("date");

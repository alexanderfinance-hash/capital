-- Посуточный снимок холдингов личного кошелька (для журнала движений по монетам).
-- CreateTable
CREATE TABLE "WalletDailySnapshot" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "chain" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "amount" DECIMAL(30,8) NOT NULL,
    "usd" DECIMAL(18,2) NOT NULL,
    "day" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WalletDailySnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WalletDailySnapshot_walletId_symbol_day_key" ON "WalletDailySnapshot"("walletId", "symbol", "day");

-- CreateIndex
CREATE INDEX "WalletDailySnapshot_day_idx" ON "WalletDailySnapshot"("day");

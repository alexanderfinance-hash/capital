-- CreateTable
CREATE TABLE "FxRate" (
    "date" TEXT NOT NULL,
    "usdRub" DECIMAL(18,6) NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'cbr',
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FxRate_pkey" PRIMARY KEY ("date")
);

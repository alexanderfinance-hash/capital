-- CreateTable
CREATE TABLE "CoinlinkPayable" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "totalUsdt" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "partners" JSONB,
    "periodFrom" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3),
    "ok" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "CoinlinkPayable_pkey" PRIMARY KEY ("id")
);

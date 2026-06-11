-- Per-asset flag: whether it's tracked on the Инвестиции tab.
ALTER TABLE "Asset" ADD COLUMN "investment" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: TON numbers and crypto holdings are investments by default.
UPDATE "Asset" SET "investment" = true WHERE "symbol" = 'TONNUM' OR "bucket" = 'crypto';

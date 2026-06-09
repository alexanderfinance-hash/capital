-- Add the "Резерв на рекламные агентства" what-if reserve to the singleton.
ALTER TABLE "Reserve" ADD COLUMN "agencyReserve" INTEGER NOT NULL DEFAULT 0;

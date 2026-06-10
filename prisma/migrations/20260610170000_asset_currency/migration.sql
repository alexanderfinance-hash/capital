-- Currency of the entered asset value. RUB assets store the original amount in
-- "nativeValue" and are displayed in USD at the current CBR rate.
ALTER TABLE "Asset" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'USD';
ALTER TABLE "Asset" ADD COLUMN "nativeValue" DECIMAL(18,2);

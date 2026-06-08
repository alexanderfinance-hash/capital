-- Add BSC (BNB Smart Chain) to the Chain enum for company USDT-BEP20 wallets.
-- Placed right after ETH to mirror the Prisma schema ordering.
ALTER TYPE "Chain" ADD VALUE 'BSC' AFTER 'ETH';

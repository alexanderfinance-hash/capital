-- Add `crypto` to SnapshotScope so the investments (crypto-portfolio) chart can
-- be built from real daily snapshots (PRD §6), not hardcoded mock data.
-- Placed after `personal` to mirror the Prisma schema ordering.
ALTER TYPE "SnapshotScope" ADD VALUE 'crypto' AFTER 'personal';

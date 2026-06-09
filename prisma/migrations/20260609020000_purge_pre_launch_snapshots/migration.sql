-- Remove the "drawn" pre-launch capital snapshots. Everything before 2026-06-08
-- was placeholder data (not real wallet/asset history) and made the charts show
-- a fictional curve. Real history starts on the launch day, so drop all earlier
-- points across every scope (personal, crypto, company). Idempotent: re-running
-- finds nothing left to delete.
DELETE FROM "CapitalSnapshot" WHERE "capturedAt" < '2026-06-08 00:00:00';

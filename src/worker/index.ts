/* Background sync worker. Triggers the app's sync endpoints on a schedule via
 * HTTP (with the internal cron key) — decoupled from the app internals.
 * Runs as its own container in docker-compose. */
import cron from "node-cron";

const APP_URL = process.env.APP_URL || "http://localhost:3000";
const CRON_SECRET = process.env.CRON_SECRET || "";
const CRYPTO_CRON = process.env.SYNC_CRYPTO_CRON || "*/10 * * * *"; // every 10 min
const EXPENSES_CRON = process.env.SYNC_EXPENSES_CRON || "0 * * * *"; // hourly
const TELEGRAM_CRON = process.env.SYNC_TELEGRAM_CRON || "*/15 * * * *"; // every 15 min
const COINLINK_CRON = process.env.SYNC_COINLINK_CRON || "*/30 * * * *"; // every 30 min
const TONNUMS_CRON = process.env.SYNC_TONNUMS_CRON || "30 * * * *"; // hourly (TON-number rate)

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// POST a sync endpoint, retrying transient failures (e.g. the app not being
// ready yet right after a deploy) with a short backoff. Stops on a 2xx, or
// after `attempts` tries — the next scheduled run will pick it up regardless.
async function trigger(path: string, attempts = 3) {
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch(`${APP_URL}${path}`, { method: "POST", headers: { "x-cron-key": CRON_SECRET } });
      const body = await res.text();
      console.log(new Date().toISOString(), path, res.status, body.slice(0, 200));
      if (res.ok) return;
    } catch (e) {
      console.error(new Date().toISOString(), path, `attempt ${i}/${attempts}`, String(e));
    }
    if (i < attempts) await sleep(Math.min(3000 * i, 15000));
  }
}

// Wait until the app answers /api/health (DB up, ready to serve) so the first
// post-boot sync doesn't race the app's startup and fail with "fetch failed".
async function waitForApp(maxMs = 120000) {
  const start = Date.now();
  for (let i = 0; Date.now() - start < maxMs; i++) {
    try {
      const res = await fetch(`${APP_URL}/api/health`);
      if (res.ok) {
        console.log(new Date().toISOString(), "app ready after", Math.round((Date.now() - start) / 1000) + "s");
        return true;
      }
    } catch {
      /* not up yet */
    }
    await sleep(3000);
  }
  console.error(new Date().toISOString(), "app not ready after", Math.round(maxMs / 1000) + "s — kicking anyway");
  return false;
}

cron.schedule(CRYPTO_CRON, () => trigger("/api/sync/crypto"));
cron.schedule(EXPENSES_CRON, () => trigger("/api/sync/expenses"));
cron.schedule(TELEGRAM_CRON, () => trigger("/api/sync/telegram"));
cron.schedule(COINLINK_CRON, () => trigger("/api/sync/coinlink"));
cron.schedule(TONNUMS_CRON, () => trigger("/api/sync/tonnums"));

console.log(`worker started · crypto="${CRYPTO_CRON}" expenses="${EXPENSES_CRON}" telegram="${TELEGRAM_CRON}" coinlink="${COINLINK_CRON}" tonnums="${TONNUMS_CRON}" app=${APP_URL}`);

// Kick once on boot — but only after the app is actually reachable.
(async () => {
  await waitForApp();
  await trigger("/api/sync/crypto");
  await trigger("/api/sync/expenses");
  await trigger("/api/sync/telegram");
  await trigger("/api/sync/coinlink");
  await trigger("/api/sync/tonnums");
})();

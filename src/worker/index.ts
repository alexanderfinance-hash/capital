/* Background sync worker. Triggers the app's sync endpoints on a schedule via
 * HTTP (with the internal cron key) — decoupled from the app internals.
 * Runs as its own container in docker-compose. */
import cron from "node-cron";

const APP_URL = process.env.APP_URL || "http://localhost:3000";
const CRON_SECRET = process.env.CRON_SECRET || "";
const CRYPTO_CRON = process.env.SYNC_CRYPTO_CRON || "*/10 * * * *"; // every 10 min
const EXPENSES_CRON = process.env.SYNC_EXPENSES_CRON || "0 * * * *"; // hourly

async function trigger(path: string) {
  try {
    const res = await fetch(`${APP_URL}${path}`, { method: "POST", headers: { "x-cron-key": CRON_SECRET } });
    const body = await res.text();
    console.log(new Date().toISOString(), path, res.status, body.slice(0, 200));
  } catch (e) {
    console.error(new Date().toISOString(), path, "ERROR", String(e));
  }
}

cron.schedule(CRYPTO_CRON, () => trigger("/api/sync/crypto"));
cron.schedule(EXPENSES_CRON, () => trigger("/api/sync/expenses"));

console.log(`worker started · crypto="${CRYPTO_CRON}" expenses="${EXPENSES_CRON}" app=${APP_URL}`);

// Kick once on boot.
trigger("/api/sync/crypto");
trigger("/api/sync/expenses");

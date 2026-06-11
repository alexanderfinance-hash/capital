/* Tiny in-memory rate limiter for login brute-force protection.
 *
 * The app runs as a single container, so an in-process store is sufficient —
 * no Redis needed. Keyed by client IP; uses a fixed window. Counters are kept
 * in a Map and lazily evicted, so memory stays bounded under normal traffic.
 *
 * Not a defense against a large distributed botnet, but it turns online
 * password guessing from "millions of tries/sec" into a few per minute. */

interface Bucket {
  count: number;
  resetAt: number; // epoch ms when the window rolls over
}

const buckets = new Map<string, Bucket>();

// Periodically drop expired buckets so the Map doesn't grow unbounded.
let lastSweep = 0;
function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(key);
  }
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number; // seconds until the window resets (0 when allowed)
}

/** Record an attempt for `key` and report whether it is within the limit.
 *  @param limit   max attempts per window
 *  @param windowMs window length in milliseconds */
export function rateLimit(key: string, limit = 8, windowMs = 60_000): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfterSec: 0 };
  }

  b.count += 1;
  if (b.count > limit) {
    return { allowed: false, remaining: 0, retryAfterSec: Math.ceil((b.resetAt - now) / 1000) };
  }
  return { allowed: true, remaining: limit - b.count, retryAfterSec: 0 };
}

/** Clear a key's counter — call on a successful login so a legitimate user is
 *  never locked out by their own earlier typos. */
export function rateLimitReset(key: string) {
  buckets.delete(key);
}

/** Best-effort client IP from proxy headers (Caddy sets X-Forwarded-For). */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

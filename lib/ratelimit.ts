/* In-memory fixed-window rate limiter for the crawl endpoint. Swap the Map for
 * a shared store (Redis) behind the same interface for multi-instance. */

const buckets = new Map<string, number[]>();

export interface RateResult {
  ok: boolean;
  retryAfter: number; // seconds
  remaining: number;
}

export function rateLimit(key: string, limit: number, windowMs: number): RateResult {
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);

  if (hits.length >= limit) {
    const retryAfter = Math.max(1, Math.ceil((windowMs - (now - hits[0])) / 1000));
    buckets.set(key, hits);
    return { ok: false, retryAfter, remaining: 0 };
  }

  hits.push(now);
  buckets.set(key, hits);

  // opportunistic cleanup to bound the Map
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) {
      if (v.every((t) => now - t >= windowMs)) buckets.delete(k);
    }
  }
  return { ok: true, retryAfter: 0, remaining: limit - hits.length };
}

/** Client identifier. SECURITY: prefer trusted edge headers (real TCP peer)
 * over the client-settable X-Forwarded-For, which an attacker could forge to
 * reset per-IP limits. */
export function clientKey(req: Request): string {
  const h = req.headers;
  const trusted =
    h.get("cf-connecting-ip") || // Cloudflare
    h.get("fly-client-ip") || // Fly.io
    h.get("x-nf-client-connection-ip") || // Netlify
    h.get("true-client-ip") ||
    h.get("x-real-ip");
  if (trusted) return trusted.trim();
  const fwd = h.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return "local";
}

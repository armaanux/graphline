/* Time-boxed fetch helpers. Every call swallows its own errors so a single
 * dead source can't fail an investigation. */

import { lookup } from "dns/promises";

const UA =
  "GraphlineBot/0.1 (+https://graphline.local; public-OSINT research)";

/* SSRF guard: hosts are user-/crawler-controlled, so only allow http(s) on
 * standard ports resolving to public IPs (blocks internal services + metadata). */

function isPrivateIPv4(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  return (
    a === 0 || a === 10 || a === 127 || // this-net, private, loopback
    (a === 169 && b === 254) || // link-local (incl. 169.254.169.254 metadata)
    (a === 172 && b >= 16 && b <= 31) || // private
    (a === 192 && b === 168) || // private
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    a >= 224 // multicast / reserved
  );
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return true;
  // link-local (fe80::/10), unique-local (fc00::/7), deprecated site-local (fec0::)
  if (/^fe[89ab]/.test(lower) || lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fec0"))
    return true;
  // IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible (::a.b.c.d)
  const mapped = lower.match(/(?:::ffff:|::)(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  // NAT64 well-known prefix 64:ff9b::/96 — embeds an IPv4 that could be private
  if (lower.startsWith("64:ff9b:")) return true;
  return false;
}

async function isUrlSafe(rawUrl: string): Promise<boolean> {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return false;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  if (u.port && !["", "80", "443"].includes(u.port)) return false;
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal"))
    return false;
  try {
    const addrs = await lookup(host, { all: true });
    if (!addrs.length) return false;
    return addrs.every((a) =>
      a.family === 6 ? !isPrivateIPv6(a.address) : !isPrivateIPv4(a.address)
    );
  } catch {
    return false;
  }
}

export interface FetchResult {
  ok: boolean;
  status: number;
  text: string;
  finalUrl: string;
  contentType: string;
}

export async function fetchText(
  url: string,
  opts: {
    timeoutMs?: number;
    headers?: Record<string, string>;
    method?: string;
    body?: string;
  } = {}
): Promise<FetchResult | null> {
  if (!(await isUrlSafe(url))) return null;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 8000);
  try {
    // Follow redirects manually so every hop is re-validated by the SSRF guard.
    let current = url;
    let method = opts.method ?? (opts.body ? "POST" : "GET");
    let body = opts.body;
    let res: Response | null = null;

    for (let hop = 0; hop <= 5; hop++) {
      res = await fetch(current, {
        method,
        redirect: "manual",
        signal: ctrl.signal,
        body,
        headers: { "user-agent": UA, accept: "*/*", ...opts.headers },
      });
      if (![301, 302, 303, 307, 308].includes(res.status)) break;
      const loc = res.headers.get("location");
      if (!loc) break;
      const next = new URL(loc, current).href;
      if (!(await isUrlSafe(next))) return null;
      await res.body?.cancel().catch(() => {});
      current = next;
      // 301/302/303 downgrade to GET without a body
      if (res.status !== 307 && res.status !== 308) {
        method = "GET";
        body = undefined;
      }
    }
    if (!res) return null;

    const contentType = res.headers.get("content-type") ?? "";
    const raw = await res.text();
    const text = raw.length > 600_000 ? raw.slice(0, 600_000) : raw;
    return { ok: res.ok, status: res.status, text, finalUrl: current, contentType };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export async function fetchJSON<T = unknown>(
  url: string,
  opts: { timeoutMs?: number; headers?: Record<string, string> } = {}
): Promise<{ status: number; data: T } | null> {
  const r = await fetchText(url, {
    ...opts,
    headers: { accept: "application/json", ...opts.headers },
  });
  if (!r) return null;
  try {
    return { status: r.status, data: JSON.parse(r.text) as T };
  } catch {
    return null;
  }
}

/** Probe whether a URL resolves to an existing resource (handle presence). */
export async function probe(
  url: string,
  timeoutMs = 7000
): Promise<{ status: number; finalUrl: string } | null> {
  const r = await fetchText(url, { timeoutMs });
  if (!r) return null;
  return { status: r.status, finalUrl: r.finalUrl };
}

import { fetchText } from "./http";
import { searchKeys } from "./searchctx";

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  host: string;
}

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";

function strip(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function b64urlDecode(s: string): string | null {
  try {
    const norm = s.replace(/-/g, "+").replace(/_/g, "/");
    const pad = norm + "=".repeat((4 - (norm.length % 4)) % 4);
    return Buffer.from(pad, "base64").toString("utf8");
  } catch {
    return null;
  }
}

/** Bing wraps result URLs in a /ck/a redirect with the real URL base64'd in `u=a1…`. */
function resolveBing(url: string): string {
  const m = url.match(/[?&]u=a1([^&]+)/);
  if (m) {
    const decoded = b64urlDecode(m[1]);
    if (decoded && /^https?:\/\//.test(decoded)) return decoded;
  }
  return url;
}

type Provider = "serper" | "brave" | "bing" | "duckduckgo";

function activeProvider(): Provider {
  const { serper, brave } = searchKeys();
  if (serper) return "serper";
  if (brave) return "brave";
  return "bing";
}

export function providerLabel(): string {
  return { serper: "Google", brave: "Brave", bing: "Bing", duckduckgo: "DuckDuckGo" }[
    activeProvider()
  ];
}

/**
 * Uses a real search API (Serper/Brave) when a key is present — this unlocks
 * `site:` queries against platforms that block scraping — and falls back to
 * keyless Bing/DuckDuckGo scraping so it works with no configuration.
 */
export async function webSearch(query: string): Promise<SearchResult[]> {
  const { serper, brave } = searchKeys();
  if (serper) {
    const r = await searchSerper(query, serper);
    if (r.length) return r;
  }
  if (brave) {
    const r = await searchBrave(query, brave);
    if (r.length) return r;
  }
  const bing = await searchBing(query);
  if (bing.length) return bing;
  return searchDuck(query);
}

async function searchSerper(query: string, key: string): Promise<SearchResult[]> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    const res = await fetch("https://google.serper.dev/search", {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "X-API-KEY": key,
        "content-type": "application/json",
      },
      body: JSON.stringify({ q: query, num: 20 }),
    });
    clearTimeout(t);
    if (!res.ok) return [];
    const data = (await res.json()) as {
      organic?: { title: string; link: string; snippet?: string }[];
    };
    return (data.organic ?? [])
      .filter((o) => o.link && /^https?:\/\//.test(o.link))
      .map((o) => ({
        title: strip(o.title ?? ""),
        url: o.link,
        snippet: strip(o.snippet ?? ""),
        host: hostOf(o.link),
      }));
  } catch {
    return [];
  }
}

async function searchBrave(query: string, key: string): Promise<SearchResult[]> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    const res = await fetch(
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(
        query
      )}&count=20`,
      {
        signal: ctrl.signal,
        headers: {
          "X-Subscription-Token": key,
          accept: "application/json",
        },
      }
    );
    clearTimeout(t);
    if (!res.ok) return [];
    const data = (await res.json()) as {
      web?: { results?: { title: string; url: string; description?: string }[] };
    };
    return (data.web?.results ?? [])
      .filter((o) => o.url && /^https?:\/\//.test(o.url))
      .map((o) => ({
        title: strip(o.title ?? ""),
        url: o.url,
        snippet: strip(o.description ?? ""),
        host: hostOf(o.url),
      }));
  } catch {
    return [];
  }
}

async function searchBing(query: string): Promise<SearchResult[]> {
  const res = await fetchText(
    `https://www.bing.com/search?q=${encodeURIComponent(query)}&setlang=en&count=20`,
    {
      timeoutMs: 10000,
      headers: {
        "user-agent": BROWSER_UA,
        "accept-language": "en-US,en;q=0.9",
        accept: "text/html,application/xhtml+xml",
      },
    }
  );
  if (!res || !res.ok) return [];
  const html = res.text;
  const segments = html.split('class="b_algo"').slice(1);
  const results: SearchResult[] = [];
  const seen = new Set<string>();

  for (const seg of segments) {
    // first anchor in the block is the result link
    const a = seg.match(/<a[^>]+href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!a) continue;
    const url = resolveBing(a[1].replace(/&amp;/g, "&"));
    const host = hostOf(url);
    if (!host || /bing\.com|microsoft\.com\/en-us\/bing/.test(host)) continue;
    const key = url.replace(/[#?].*$/, "");
    if (seen.has(key)) continue;
    seen.add(key);
    const title = strip(a[2]);
    const p = seg.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    const snippet = p ? strip(p[1]).replace(/^[A-Z]{3}\s\d{1,2},\s\d{4}\s*·?\s*/, "") : "";
    if (title) results.push({ title, url, snippet, host });
    if (results.length >= 16) break;
  }
  return results;
}

async function searchDuck(query: string): Promise<SearchResult[]> {
  const res = await fetchText("https://lite.duckduckgo.com/lite/", {
    method: "POST",
    body: new URLSearchParams({ q: query }).toString(),
    timeoutMs: 9000,
    headers: {
      "user-agent": BROWSER_UA,
      "content-type": "application/x-www-form-urlencoded",
      accept: "text/html,application/xhtml+xml",
      "accept-language": "en-US,en;q=0.9",
    },
  });
  if (!res || !res.ok) return [];
  const linkRe =
    /<a[^>]+href="([^"]+)"[^>]+class=['"]result-link['"][^>]*>([\s\S]*?)<\/a>/gi;
  const snipRe = /class=['"]result-snippet['"][^>]*>([\s\S]*?)<\/td>/gi;
  const links: { url: string; title: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(res.text))) {
    if (/^https?:\/\//.test(m[1])) links.push({ url: m[1], title: strip(m[2]) });
  }
  const snippets: string[] = [];
  while ((m = snipRe.exec(res.text))) snippets.push(strip(m[1]));
  const results: SearchResult[] = [];
  const seen = new Set<string>();
  links.forEach((l, i) => {
    const host = hostOf(l.url);
    if (!host || /duckduckgo\.com|w3\.org/.test(host)) return;
    const key = l.url.replace(/[#?].*$/, "");
    if (seen.has(key)) return;
    seen.add(key);
    results.push({ title: l.title, url: l.url, snippet: snippets[i] ?? "", host });
  });
  return results;
}

// Expands shortened URLs by issuing a HEAD-only request to the shortener
// service itself, then reading the Location redirect header.
//
// Security contract: only whitelisted, known shortener hosts are ever contacted.
// The final destination URL is never fetched — only analysed as a string.
// This is the single documented exception to the no-outbound-fetch contract in
// app/api/check/route.ts. Scammer infrastructure is never reached.

const EXPAND_TIMEOUT_MS = 3_000;
const MAX_HOPS = 3;
const CACHE_TTL_MS = 60 * 60 * 1_000; // 1 hour

export const SHORTENER_HOSTS = new Set([
  "bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly", "short.io",
  "rb.gy", "cutt.ly", "is.gd", "v.gd", "tiny.cc", "shorte.st",
  "buff.ly", "dlvr.it", "j.mp", "lnkd.in", "youtu.be", "fb.me",
  "snip.ly", "bl.ink", "soo.gd", "clck.ru", "x.co",
]);

export interface ExpandResult {
  expandedUrl: string | null;
  hops: string[];
}

const cache = new Map<string, { result: ExpandResult; expiresAt: number }>();

export function isShortened(url: string): boolean {
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return SHORTENER_HOSTS.has(u.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export async function expandUrl(shortUrl: string): Promise<ExpandResult> {
  const cacheKey = shortUrl.toLowerCase();
  const hit = cache.get(cacheKey);
  if (hit && Date.now() < hit.expiresAt) return hit.result;

  const result = await followRedirects(shortUrl, MAX_HOPS);
  cache.set(cacheKey, { result, expiresAt: Date.now() + CACHE_TTL_MS });
  return result;
}

async function followRedirects(url: string, remainingHops: number): Promise<ExpandResult> {
  if (remainingHops === 0) return { expandedUrl: null, hops: [] };

  try {
    const res = await fetch(url, {
      method: "HEAD",
      redirect: "manual",
      signal: AbortSignal.timeout(EXPAND_TIMEOUT_MS),
      headers: { "User-Agent": "justcheckingmate/1.0 (scam-detection tool)" },
    });

    const location = res.headers.get("location");
    if (!location) return { expandedUrl: null, hops: [] };

    const dest = new URL(location, url).toString();

    // Recursively follow if the destination is also a known shortener,
    // but only while hops remain — prevents infinite chains.
    if (isShortened(dest) && remainingHops > 1) {
      const inner = await followRedirects(dest, remainingHops - 1);
      return {
        expandedUrl: inner.expandedUrl ?? dest,
        hops: [dest, ...inner.hops],
      };
    }

    return { expandedUrl: dest, hops: [dest] };
  } catch {
    return { expandedUrl: null, hops: [] };
  }
}

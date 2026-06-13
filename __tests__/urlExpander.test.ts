import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { isShortened, expandUrl, SHORTENER_HOSTS } from "@/lib/urlExpander";

// ── Feature: isShortened ──────────────────────────────────────────────────────

describe("Feature: isShortened — identifying known shortener hostnames", () => {
  it("recognises bit.ly as a shortener", () => {
    expect(isShortened("https://bit.ly/abc123")).toBe(true);
  });

  it("recognises tinyurl.com as a shortener", () => {
    expect(isShortened("https://tinyurl.com/xyz")).toBe(true);
  });

  it("recognises every host declared in SHORTENER_HOSTS", () => {
    for (const host of SHORTENER_HOSTS) {
      expect(isShortened(`https://${host}/x`), `${host} should be detected`).toBe(true);
    }
  });

  it("returns false for a legitimate non-shortener domain", () => {
    expect(isShortened("https://commbank.com.au/login")).toBe(false);
  });

  it("returns false when the hostname only partially matches a shortener name", () => {
    // 'bit.ly' must match the whole hostname, not a substring
    expect(isShortened("https://notbit.ly.evil.com/path")).toBe(false);
  });

  it("handles a URL supplied without a scheme", () => {
    expect(isShortened("bit.ly/abc")).toBe(true);
  });

  it("returns false for an unparseable string rather than throwing", () => {
    expect(isShortened("not a url %%")).toBe(false);
  });
});

// ── Feature: expandUrl ────────────────────────────────────────────────────────

describe("Feature: expandUrl — following redirects to reveal the real destination", () => {
  const fetchSpy = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchSpy);
    fetchSpy.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the Location header as expandedUrl on a 301 redirect", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(null, { status: 301, headers: { location: "https://evil-phishing.tk/steal" } }),
    );

    const result = await expandUrl("https://bit.ly/xp-301-unique");
    expect(result.expandedUrl).toBe("https://evil-phishing.tk/steal");
    expect(result.hops).toEqual(["https://evil-phishing.tk/steal"]);
  });

  it("returns the Location header as expandedUrl on a 302 redirect", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(null, { status: 302, headers: { location: "https://real-destination.com/page" } }),
    );

    const result = await expandUrl("https://tinyurl.com/xp-302-unique");
    expect(result.expandedUrl).toBe("https://real-destination.com/page");
    expect(result.hops).toEqual(["https://real-destination.com/page"]);
  });

  it("returns null expandedUrl and empty hops when no Location header is present", async () => {
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 200 }));

    const result = await expandUrl("https://bit.ly/xp-noloc-unique");
    expect(result.expandedUrl).toBeNull();
    expect(result.hops).toEqual([]);
  });

  it("returns null expandedUrl gracefully when fetch throws a network error", async () => {
    fetchSpy.mockRejectedValueOnce(new Error("network failure"));

    const result = await expandUrl("https://bit.ly/xp-neterr-unique");
    expect(result.expandedUrl).toBeNull();
    expect(result.hops).toEqual([]);
  });

  it("returns null expandedUrl gracefully when fetch times out", async () => {
    fetchSpy.mockRejectedValueOnce(new DOMException("The operation was aborted", "AbortError"));

    const result = await expandUrl("https://bit.ly/xp-timeout-unique");
    expect(result.expandedUrl).toBeNull();
    expect(result.hops).toEqual([]);
  });

  it("follows a chain of shorteners and returns the final non-shortener destination", async () => {
    // bit.ly → tinyurl.com → final destination
    fetchSpy
      .mockResolvedValueOnce(
        new Response(null, { status: 301, headers: { location: "https://tinyurl.com/hop2" } }),
      )
      .mockResolvedValueOnce(
        new Response(null, { status: 301, headers: { location: "https://final-scam.tk/phish" } }),
      );

    const result = await expandUrl("https://bit.ly/xp-chain-unique");
    expect(result.expandedUrl).toBe("https://final-scam.tk/phish");
    expect(result.hops).toContain("https://tinyurl.com/hop2");
    expect(result.hops).toContain("https://final-scam.tk/phish");
    expect(result.hops.length).toBe(2);
  });

  it("stops expanding after MAX_HOPS and returns the last resolved URL, making no further requests", async () => {
    // bit.ly → tinyurl.com → rb.gy → is.gd: four-hop chain but MAX_HOPS = 3,
    // so exactly 3 fetches are issued and the 4th shortener is never contacted.
    fetchSpy
      .mockResolvedValueOnce(
        new Response(null, { status: 301, headers: { location: "https://tinyurl.com/h2" } }),
      )
      .mockResolvedValueOnce(
        new Response(null, { status: 301, headers: { location: "https://rb.gy/h3" } }),
      )
      .mockResolvedValueOnce(
        new Response(null, { status: 301, headers: { location: "https://is.gd/h4" } }),
      );

    const result = await expandUrl("https://bit.ly/xp-maxhops-unique");
    expect(result.expandedUrl).not.toBeNull();
    // Exactly MAX_HOPS (3) fetch calls — the chain is cut there
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it("caches the result so a second call with the same URL does not issue a second fetch", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(null, { status: 301, headers: { location: "https://destination.com/page" } }),
    );

    const url = "https://bit.ly/xp-cache-unique";
    const first = await expandUrl(url);
    const second = await expandUrl(url);

    expect(first).toEqual(second);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("sends a HEAD request to the shortener, never a GET, to avoid downloading scam payloads", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(null, { status: 301, headers: { location: "https://evil.tk/x" } }),
    );

    await expandUrl("https://bit.ly/xp-method-unique");
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ method: "HEAD" }),
    );
  });

  it("sends redirect: 'manual' so the fetch layer does not follow redirects on its own", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(null, { status: 301, headers: { location: "https://evil.tk/x" } }),
    );

    await expandUrl("https://bit.ly/xp-redirect-mode-unique");
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ redirect: "manual" }),
    );
  });
});

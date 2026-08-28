import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { analyzeContent, checkUrl, checkSms, checkEmail, checkCustom } from "@/lib/scamDetector";
import { SHORTENER_HOSTS } from "@/lib/urlExpander";

// The app's core promise to users is that submitting a suspicious link does not
// visit it. Fetching a scam URL tells the scammer's infrastructure their link is
// live and under investigation, and can burn a victim's one chance at a takedown
// — so this is a safety property, not a nicety.
//
// Until now it was enforced by a comment in app/api/check/route.ts and a CSP
// header, with nothing asserting it. These tests execute the real engine over
// real scam inputs with the network intercepted, so a future change that adds a
// fetch on a user-supplied host fails here rather than in production.
//
// Two outbound calls ARE legitimate and must keep working:
//   · the URLhaus blocklist, to a fixed abuse.ch endpoint
//   · urlExpander, to allowlisted shortener hosts only (never the destination)
// Both are to hosts we chose, never to a host that arrived in user input.

/** Hosts that appear in the fixtures below and must never be contacted. */
const USER_SUPPLIED_HOSTS = [
  "commbank-secure-login.tk",
  "ato-refund-portal.xyz",
  "mygov-verify.monster",
  "paypal-resolution-centre.shop",
  "192.168.44.7",
  "evil-final.tk",
  "nab-alert.duckdns.org",
];

/** Realistic submissions, each carrying at least one hostile host above. */
const HOSTILE_INPUTS = [
  "ATO: your refund of $842.10 is pending. Confirm at http://ato-refund-portal.xyz/claim",
  "CommBank: unusual sign-in blocked. Verify now https://commbank-secure-login.tk/auth",
  "Your myGov account is locked — unlock at https://mygov-verify.monster/unlock",
  "PayPal: resolve the dispute at https://paypal-resolution-centre.shop/case/8812",
  "Package held. Pay $2.99 duty: http://192.168.44.7/aupost",
  "NAB security alert https://nab-alert.duckdns.org/verify?id=99",
  [
    "From: service@paypal-resolution-centre.shop",
    "Reply-To: collect@evil-final.tk",
    "Subject: Action required on your account",
    "",
    "Confirm your details at https://paypal-resolution-centre.shop/verify",
  ].join("\n"),
];

/**
 * Replace every network primitive with a recorder. Anything the engine tries to
 * contact is captured rather than dialled, so a violation is observable instead
 * of being a silent real request during the test run.
 */
function interceptNetwork() {
  const contacted: string[] = [];
  const record = (input: unknown): never => {
    const url =
      typeof input === "string" ? input
      : input instanceof URL ? input.toString()
      : typeof input === "object" && input !== null && "url" in input
        ? String((input as { url: unknown }).url)
        : String(input);
    contacted.push(url);
    throw new Error(`network call intercepted: ${url}`);
  };
  vi.stubGlobal("fetch", vi.fn(record));
  return contacted;
}

function hostsIn(urls: string[]): string[] {
  return urls.map((u) => {
    try {
      return new URL(u).hostname.toLowerCase();
    } catch {
      return u.toLowerCase();
    }
  });
}

describe("Privacy invariant — a submitted URL is never visited", () => {
  let contacted: string[];

  beforeEach(() => {
    contacted = interceptNetwork();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("contacts nothing at all when analysing hostile input with no transport", async () => {
    // The default path: analyzeContent without a fetcher does no network work
    // whatsoever, so there is nothing to leak.
    for (const input of HOSTILE_INPUTS) {
      await analyzeContent(input);
    }
    expect(contacted).toEqual([]);
  });

  it("never contacts a host that came from user input", async () => {
    // Even with a transport supplied, expansion may only reach allowlisted
    // shorteners — never a host the submission named.
    for (const input of HOSTILE_INPUTS) {
      await analyzeContent(input, undefined, undefined, { fetcher: fetch as never });
    }

    const reached = hostsIn(contacted);
    for (const hostile of USER_SUPPLIED_HOSTS) {
      expect(reached, `contacted user-supplied host ${hostile}`).not.toContain(hostile);
    }
  });

  it("only ever contacts allowlisted shortener hosts, even when told to expand", async () => {
    await analyzeContent(
      "Urgent: confirm at https://bit.ly/xyz and https://commbank-secure-login.tk/auth",
      undefined,
      undefined,
      { fetcher: fetch as never },
    );

    for (const host of hostsIn(contacted)) {
      expect(SHORTENER_HOSTS.has(host), `contacted non-shortener ${host}`).toBe(true);
    }
  });

  it("makes no network call from any synchronous checker", () => {
    // checkUrl/checkSms/checkEmail/checkCustom are pure string analysis. They
    // are synchronous, so they *cannot* await a fetch — but a fire-and-forget
    // call would still leak, and that is what this catches.
    for (const input of HOSTILE_INPUTS) {
      checkUrl(input);
      checkSms(input);
      checkEmail(input);
      checkCustom(input);
    }
    expect(contacted).toEqual([]);
  });

  it("does not resolve or contact a defanged or obfuscated host", async () => {
    // Obfuscated forms must be normalised for *analysis* only — normalising a
    // host must never turn into visiting it.
    await analyzeContent("hxxp://commbank-secure-login[.]tk/auth", undefined, undefined, {
      fetcher: fetch as never,
    });
    await analyzeContent("commbank-secure-login%2Etk/auth", undefined, undefined, {
      fetcher: fetch as never,
    });

    expect(hostsIn(contacted)).not.toContain("commbank-secure-login.tk");
  });

  it("still produces a verdict for every hostile input, with nothing contacted", async () => {
    // A trivially safe way to satisfy this invariant would be to stop analysing.
    // Assert the engine still does its job.
    for (const input of HOSTILE_INPUTS) {
      const cards = await analyzeContent(input);
      expect(cards.length, `no verdict for: ${input.slice(0, 40)}`).toBeGreaterThan(0);
    }
    expect(contacted).toEqual([]);
  });
});

describe("Privacy invariant — the route contract stays declared", () => {
  // The behavioural tests above cover the engine. The route is where the
  // contract is written down, and a future edit that quietly deletes it should
  // be visible in review.
  const routeSource = readFileSync(
    path.join(process.cwd(), "app/api/check/route.ts"),
    "utf8",
  );

  it("keeps the no-outbound-request contract documented on the check route", () => {
    expect(routeSource).toMatch(/must NEVER make an outbound HTTP request/i);
  });

  it("keeps connect-src 'self' in the CSP, the browser-layer half of the guarantee", () => {
    const config = readFileSync(path.join(process.cwd(), "next.config.ts"), "utf8");
    expect(config).toContain("connect-src 'self'");
  });
});

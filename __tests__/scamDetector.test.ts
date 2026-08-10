import { describe, it, expect, vi } from "vitest";
import {
  checkUrl,
  checkSms,
  checkEmail,
  checkPhone,
  checkCustom,
  analyzeContent,
} from "@/lib/scamDetector";
import { expandUrl } from "@/lib/urlExpander";

// Keep isShortened from the real module so shortener-detection tests stay valid.
// Replace expandUrl with a controllable spy that returns null by default so
// existing tests are unaffected by network I/O.
vi.mock("@/lib/urlExpander", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/urlExpander")>();
  return { ...actual, expandUrl: vi.fn().mockResolvedValue({ expandedUrl: null, hops: [] }) };
});

// ── checkUrl ──────────────────────────────────────────────────────────────────

describe("checkUrl", () => {
  it("rates a verified AU government domain as safe", () => {
    const result = checkUrl("https://ato.gov.au");
    expect(result.verdict).toBe("safe");
    expect(result.score).toBeLessThan(20);
  });

  it("rates a subdomain of a verified AU gov domain as safe", () => {
    const result = checkUrl("https://www.servicesaustralia.gov.au/medicare");
    expect(result.verdict).toBe("safe");
  });

  it("penalises a known URL shortener", () => {
    const result = checkUrl("https://bit.ly/abc123");
    expect(result.score).toBeGreaterThanOrEqual(40);
    expect(result.flags.some((f) => f.includes("shortener"))).toBe(true);
  });

  it("penalises a suspicious TLD", () => {
    const result = checkUrl("https://login-portal.tk/verify");
    expect(result.score).toBeGreaterThan(20);
    expect(result.flags.some((f) => f.includes(".tk"))).toBe(true);
  });

  it("penalises an IP address used as hostname", () => {
    const result = checkUrl("http://1.2.3.4/phish");
    expect(result.score).toBeGreaterThanOrEqual(35);
    expect(result.flags.some((f) => f.includes("IP address"))).toBe(true);
  });

  it("penalises typosquatting of AU brands", () => {
    const result = checkUrl("https://commbank-secure.net/login");
    expect(result.score).toBeGreaterThanOrEqual(45);
    expect(result.flags.some((f) => f.includes("commbank"))).toBe(true);
  });

  it("penalises excessive hyphens (3+)", () => {
    const result = checkUrl("https://my-secure-bank-login.com");
    expect(result.flags.some((f) => f.includes("hyphens"))).toBe(true);
  });

  it("penalises HTTP (no HTTPS)", () => {
    const result = checkUrl("http://example.com");
    expect(result.flags.some((f) => f.includes("HTTPS"))).toBe(true);
  });

  it("penalises a very long URL (> 200 chars)", () => {
    const long = "https://example.com/" + "a".repeat(200);
    const result = checkUrl(long);
    expect(result.flags.some((f) => f.includes("long URL"))).toBe(true);
  });

  it("penalises too many subdomain levels (> 5 parts)", () => {
    const result = checkUrl("https://a.b.c.d.e.f.evil.com");
    expect(result.flags.some((f) => f.includes("subdomain"))).toBe(true);
  });

  it("penalises login/verify/secure keywords", () => {
    const result = checkUrl("https://example.com/verify-account");
    expect(result.flags.some((f) => f.includes("login/verify"))).toBe(true);
  });

  it("caps score at 100", () => {
    const result = checkUrl("http://1.2.3.4/mybank-secure-login-verify.tk");
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("returns suspicious verdict (score 60) for an unparseable URL", () => {
    const result = checkUrl("not-a-valid-url %%");
    expect(result.verdict).toBe("suspicious");
    expect(result.score).toBe(60);
  });

  it("prepends https when no protocol is given", () => {
    const result = checkUrl("ato.gov.au");
    expect(result.verdict).toBe("safe");
  });

  it("returns category 'URL'", () => {
    const result = checkUrl("https://example.com");
    expect(result.category).toBe("URL");
  });

  // Free-tier cloud dev platforms abused as phishing hosting (#63)
  it("flags Cloudflare Workers/Pages hosting (+35)", () => {
    const result = checkUrl("https://ato-verify-abc123.workers.dev");
    expect(result.score).toBeGreaterThanOrEqual(35);
    expect(result.flags.some((f) => f.includes("workers.dev"))).toBe(true);
  });

  it("flags a trycloudflare.com tunnel", () => {
    const result = checkUrl("https://willing-bones-random.trycloudflare.com/login");
    expect(result.flags.some((f) => f.includes("trycloudflare.com"))).toBe(true);
  });

  it("scores vercel.app/railway.app lower than Cloudflare hosting (+25)", () => {
    const vercel = checkUrl("https://my-preview.vercel.app");
    expect(vercel.flags.some((f) => f.includes("vercel.app"))).toBe(true);
    // pages.dev (+35) should outscore vercel.app (+25) with all else equal
    const pages = checkUrl("https://mygov-login.pages.dev");
    expect(pages.score).toBeGreaterThan(vercel.score);
  });
});

// ── checkSms ──────────────────────────────────────────────────────────────────

describe("checkSms", () => {
  it("rates a benign message as safe", () => {
    const result = checkSms("Hey mate, want to grab lunch tomorrow?");
    expect(result.verdict).toBe("safe");
    expect(result.score).toBeLessThan(20);
  });

  it("penalises urgency language", () => {
    const result = checkSms("URGENT: Your account has been suspended. Act now.");
    expect(result.score).toBeGreaterThan(20);
    expect(result.flags.some((f) => f.includes("Urgency"))).toBe(true);
  });

  it("penalises reward/prize language", () => {
    const result = checkSms("Congratulations! You have won a $1000 prize. Claim now.");
    expect(result.score).toBeGreaterThan(20);
    expect(result.flags.some((f) => f.includes("Prize"))).toBe(true);
  });

  it("penalises requests for sensitive info", () => {
    const result = checkSms("Please confirm your bank details and TFN to proceed.");
    expect(result.score).toBeGreaterThanOrEqual(30);
    expect(result.flags.some((f) => f.includes("sensitive"))).toBe(true);
  });

  it("penalises an embedded URL", () => {
    const result = checkSms("Your package is ready. Track it: https://example.com/track");
    expect(result.flags.some((f) => f.includes("Contains link"))).toBe(true);
  });

  it("adds extra penalty when the embedded URL itself looks dodgy", () => {
    const clean = checkSms("Click: https://example.com");
    const dodgy = checkSms("Click: http://bit.ly/scam");
    expect(dodgy.score).toBeGreaterThan(clean.score);
  });

  it("penalises government agency impersonation", () => {
    const result = checkSms("This is the ATO. Your return is overdue.");
    expect(result.flags.some((f) => f.includes("government agency"))).toBe(true);
  });

  it("penalises 'call back' requests", () => {
    const result = checkSms("Important message. Please call back now on 0411 222 333.");
    expect(result.flags.some((f) => f.includes("call"))).toBe(true);
  });

  it("penalises scam grammar patterns", () => {
    const result = checkSms("Pls kindly recieve ur account details via this link");
    expect(result.flags.some((f) => f.includes("Spelling"))).toBe(true);
  });

  it("caps score at 100", () => {
    const result = checkSms(
      "URGENT: Congratulations! Your ATO account is suspended. " +
        "Verify your TFN, bank details and medicare now. " +
        "Call back immediately. Pls click http://bit.ly/scam"
    );
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("returns category 'SMS'", () => {
    expect(checkSms("hello").category).toBe("SMS");
  });

  // AI voice-clone bail/kidnap/stranded escalation (#68)
  it("flags a bail-money escalation script", () => {
    const result = checkSms(
      "Gran it's me, I've been arrested. I need bail money and please don't call the police.",
    );
    expect(result.verdict).toBe("likely_scam");
    expect(result.flags.some((f) => f.toLowerCase().includes("bail money"))).toBe(true);
  });

  it("flags a stranded-overseas emergency transfer", () => {
    const result = checkSms("Mum I'm stuck overseas, wallet was stolen, I need an emergency transfer");
    expect(result.score).toBeGreaterThanOrEqual(20);
  });

  // NBN disconnection-threat smishing + NBN Co impersonation (#67)
  it("flags NBN Co disconnection-threat smishing", () => {
    const result = checkSms(
      "NBN Co: Your internet will be disconnected within 24 hours unless you verify your account.",
    );
    expect(result.verdict).toBe("likely_scam");
    expect(result.flags.some((f) => f.includes("well-known company"))).toBe(true);
  });

  // Food delivery platform impersonation (#66)
  it("flags food delivery platform impersonation with a non-gov wording", () => {
    const result = checkSms("UberEats: Your recent order was cancelled. Click here to claim your $14.90 refund.");
    expect(result.flags.some((f) => f.includes("well-known company"))).toBe(true);
    expect(result.flags.some((f) => f.includes("government agency"))).toBe(false);
  });

  // ACCC / Scamwatch impersonation (#65)
  it("flags ACCC / Scamwatch impersonation as a government agency", () => {
    const result = checkSms("Scamwatch: Your account has been flagged for investigation. Do not discuss with others.");
    expect(result.flags.some((f) => f.includes("government agency"))).toBe(true);
  });

  // Superannuation SMSF / early-access phishing (#64)
  it("flags superannuation early-access phishing", () => {
    const result = checkSms("AustralianSuper: Secure your super before June 1. Access your super early via SMSF setup. Click here: http://au-super-verify.cyou");
    expect(result.verdict).toBe("likely_scam");
    expect(result.flags.some((f) => f.toLowerCase().includes("smsf"))).toBe(true);
  });

  // Guard: a bare brand mention without any other signal stays low (compound model)
  it("does not over-score a bare NBN mention with no other signal", () => {
    const result = checkSms("My nbn connection has been great this month.");
    expect(result.verdict).not.toBe("likely_scam");
  });
});

// ── checkEmail ────────────────────────────────────────────────────────────────

describe("checkEmail", () => {
  it("rates a clean email as safe", () => {
    const result = checkEmail("Hi Sarah, just confirming our 3pm meeting tomorrow.");
    expect(result.verdict).toBe("safe");
  });

  it("penalises a generic greeting", () => {
    const result = checkEmail("Dear Customer, please verify your account.");
    expect(result.flags.some((f) => f.includes("Generic greeting"))).toBe(true);
  });

  it("penalises attachment prompts", () => {
    const result = checkEmail(
      "Please open the attached invoice to complete your verification."
    );
    expect(result.flags.some((f) => f.includes("attachment"))).toBe(true);
  });

  it("penalises a dodgy sender TLD", () => {
    const result = checkEmail(
      "From: noreply@refund-ato.tk\nDear Customer, your tax refund is ready."
    );
    expect(result.flags.some((f) => f.includes("dodgy domain"))).toBe(true);
  });

  it("penalises impersonation when sender domain does not match the claimed org", () => {
    const result = checkEmail(
      "From: support@myg0v-helpdesk.net\nYour mygov account requires verification."
    );
    expect(result.flags.some((f) => f.includes("impersonation"))).toBe(true);
  });

  it("flags a From/Reply-To mismatch (sender spoofing)", () => {
    const result = checkEmail(
      'From: "myGov" <noreply@evil.tk>\nReply-To: scammer@other-domain.ru\nSubject: Account suspended\n\nVerify now.'
    );
    expect(result.flags.some((f) => /reply-to/i.test(f))).toBe(true);
  });

  it("flags display-name masking (brand name over a mismatched domain)", () => {
    const result = checkEmail('From: "myGov" <noreply@evil.tk>\n\nClick here.');
    expect(result.flags.some((f) => /masking|display name/i.test(f))).toBe(true);
  });

  it("scores lower than equivalent SMS (0.7 lenience modifier)", () => {
    const sms = checkSms("URGENT: Your ATO account is suspended. Verify now.");
    const email = checkEmail("URGENT: Your ATO account is suspended. Verify now.");
    expect(email.score).toBeLessThanOrEqual(sms.score);
  });

  it("returns category 'Email'", () => {
    expect(checkEmail("Hi there").category).toBe("Email");
  });
});

// ── checkPhone ────────────────────────────────────────────────────────────────

describe("checkPhone", () => {
  it("rates a normal AU mobile as safe (default warning only)", () => {
    const result = checkPhone("+61 412 345 678");
    expect(result.score).toBeLessThanOrEqual(20);
    // The one flag added when no other signals are found
    expect(result.flags.length).toBe(1);
  });

  it("penalises a 190x premium-rate number", () => {
    // Must start with 0 or 61 so the AU number branch runs
    const result = checkPhone("01900 123 456");
    expect(result.score).toBeGreaterThanOrEqual(50);
    expect(result.flags.some((f) => f.toLowerCase().includes("premium rate"))).toBe(true);
  });

  it("penalises repetitive-digit patterns (spoofed number)", () => {
    // "111111111" — 9 identical digits, fully matches /^(\d)\1{5,}$/
    const result = checkPhone("111111111");
    expect(result.flags.some((f) => f.toLowerCase().includes("repetitive"))).toBe(true);
  });

  it("penalises very short numbers (caller ID spoofing)", () => {
    const result = checkPhone("12345");
    expect(result.flags.some((f) => f.toLowerCase().includes("too short"))).toBe(true);
  });

  it("penalises an international prefix from a known scam region", () => {
    // 234 = Nigeria
    const result = checkPhone("+234 80 1234 5678");
    expect(result.flags.some((f) => f.toLowerCase().includes("nigeria"))).toBe(true);
  });

  it("strips formatting characters before analysis", () => {
    // Same number with different formatting should give consistent result
    const r1 = checkPhone("0412345678");
    const r2 = checkPhone("0412 345 678");
    const r3 = checkPhone("+61 412 345 678");
    expect(r1.score).toBe(r2.score);
    // r3 has +61 prefix (not a risky prefix), should also give same result
    expect(r3.score).toBe(r1.score);
  });

  it("caps score at 100", () => {
    const result = checkPhone("190000000000");
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("returns category 'Phone Number'", () => {
    expect(checkPhone("0412 345 678").category).toBe("Phone Number");
  });
});

// ── checkCustom ───────────────────────────────────────────────────────────────

describe("checkCustom", () => {
  it("returns score 10 and a 'no signals' flag for benign text", () => {
    const result = checkCustom("What is the weather like today?");
    expect(result.score).toBe(10);
    expect(result.flags.some((f) => f.includes("No obvious"))).toBe(true);
  });

  it("penalises urgency + reward + request keywords", () => {
    const result = checkCustom(
      "Urgent: You have won a free gift card. Provide your bank details now."
    );
    expect(result.score).toBeGreaterThan(30);
    expect(result.flags.some((f) => f.includes("Suspicious keywords"))).toBe(true);
  });

  it("penalises embedded URLs and scores the worst one", () => {
    const result = checkCustom(
      "Check this out: http://bit.ly/scam — looks legit right?"
    );
    expect(result.flags.some((f) => f.includes("link"))).toBe(true);
    expect(result.score).toBeGreaterThan(10);
  });

  it("caps score at 100", () => {
    const text = Array(20)
      .fill("urgent winner bank details bitcoin gift card tfn medicare")
      .join(" ");
    expect(checkCustom(text).score).toBeLessThanOrEqual(100);
  });

  it("returns category 'Custom'", () => {
    expect(checkCustom("test").category).toBe("Custom");
  });
});

// ── verdict thresholds (via scoreToResult indirectly) ─────────────────────────

describe("verdict thresholds", () => {
  it("score < 20 → safe", () => {
    expect(checkUrl("https://ato.gov.au").verdict).toBe("safe");
  });

  it("score 20–44 → suspicious", () => {
    // A URL with only HTTP (score ~15) should still be suspicious if combined
    // Use a shortener which alone gives score 40 → suspicious
    const result = checkUrl("https://bit.ly/safe");
    expect(result.verdict).toBe("suspicious");
  });

  it("score 45–69 → likely_scam", () => {
    // typosquatting alone adds 45 points
    const result = checkUrl("https://commbank-phish.net");
    expect(result.verdict).toBe("likely_scam");
  });

  it("score ≥ 70 → likely_scam with 'Crikey' details", () => {
    const result = checkUrl("http://commbank-secure-login.tk/verify");
    expect(result.verdict).toBe("likely_scam");
    expect(result.details).toMatch(/Crikey/);
  });
});

// ── analyzeContent (per-identifier orchestration) ─────────────────────────────

describe("analyzeContent", () => {
  it("returns an empty array for blank input", async () => {
    expect(await analyzeContent("   ")).toEqual([]);
  });

  it("returns a single url card for a bare URL", async () => {
    const cards = await analyzeContent("https://bit.ly/scam");
    expect(cards).toHaveLength(1);
    expect(cards[0].kind).toBe("url");
  });

  it("produces separate cards for the sender and an embedded link in an email", async () => {
    const cards = await analyzeContent(
      'From: "myGov" <noreply@evil.tk>\nReply-To: scam@other.ru\n\nVerify at https://fake-ato.xyz/login now',
    );
    const kinds = cards.map((c) => c.kind);
    expect(kinds).toContain("email");
    expect(kinds).toContain("url");
  });

  it("de-duplicates repeated URLs", async () => {
    const cards = await analyzeContent("see https://bit.ly/x and again https://bit.ly/x");
    const urlCards = cards.filter((c) => c.kind === "url" && c.value === "https://bit.ly/x");
    expect(urlCards).toHaveLength(1);
  });

  it("sorts cards by risk score, highest first", async () => {
    const cards = await analyzeContent(
      "Hi, click https://commbank-secure-login.tk/verify and also https://ato.gov.au",
    );
    for (let i = 1; i < cards.length; i++) {
      expect(cards[i - 1].result.score).toBeGreaterThanOrEqual(cards[i].result.score);
    }
  });

  it("always returns at least one card for non-empty input", async () => {
    expect((await analyzeContent("just some harmless words")).length).toBeGreaterThanOrEqual(1);
  });

  it("caps the number of cards", async () => {
    const many = "https://a.tk https://b.tk https://c.tk https://d.tk https://e.tk https://f.tk";
    expect((await analyzeContent(many)).length).toBeLessThanOrEqual(5);
  });

  it("returns a phone card when the whole input is a number", async () => {
    const cards = await analyzeContent("+61 412 345 678");
    expect(cards[0].kind).toBe("phone");
  });
});

// ── analyzeContent — shortened URL expansion ──────────────────────────────────

describe("analyzeContent — shortened URL expansion", () => {
  it("expands a shortener and includes the real destination in the result", async () => {
    vi.mocked(expandUrl).mockResolvedValueOnce({
      expandedUrl: "https://commbank-phishing.tk/steal",
      hops: ["https://commbank-phishing.tk/steal"],
    });

    const cards = await analyzeContent("https://bit.ly/scam-exp");
    const urlCard = cards.find((c) => c.kind === "url");
    expect(urlCard?.result.expandedUrl).toBeTruthy();
    expect(urlCard?.result.flags.some((f) => f.includes("expanded"))).toBe(true);
  });

  it("raises the score to at least the destination score when destination is riskier than the short URL alone", async () => {
    vi.mocked(expandUrl).mockResolvedValueOnce({
      expandedUrl: "http://1.2.3.4/phish",
      hops: ["http://1.2.3.4/phish"],
    });

    const cards = await analyzeContent("https://bit.ly/scam-score");
    const urlCard = cards.find((c) => c.kind === "url");
    // IP-address destination adds ≥35; combined with shortener (40) → ≥40
    expect(urlCard?.result.score).toBeGreaterThanOrEqual(40);
  });

  it("raises the score to at least the shortener score when the destination is safer", async () => {
    vi.mocked(expandUrl).mockResolvedValueOnce({
      expandedUrl: "https://example.com/landing",
      hops: ["https://example.com/landing"],
    });

    // bit.ly alone scores 40; example.com scores ~0; merged must stay ≥ 40
    const cards = await analyzeContent("https://bit.ly/scam-min-score");
    const urlCard = cards.find((c) => c.kind === "url");
    expect(urlCard?.result.score).toBeGreaterThanOrEqual(40);
  });

  it("adds a multi-hop flag when the chain has more than one redirect", async () => {
    vi.mocked(expandUrl).mockResolvedValueOnce({
      expandedUrl: "https://evil-final.tk/phish",
      hops: ["https://tinyurl.com/hop2", "https://evil-final.tk/phish"],
    });

    const cards = await analyzeContent("https://bit.ly/multi-hop");
    const urlCard = cards.find((c) => c.kind === "url");
    expect(urlCard?.result.flags.some((f) => f.includes("Multi-hop"))).toBe(true);
  });

  it("does NOT add a multi-hop flag for a single-hop expansion", async () => {
    vi.mocked(expandUrl).mockResolvedValueOnce({
      expandedUrl: "https://evil.tk/phish",
      hops: ["https://evil.tk/phish"],
    });

    const cards = await analyzeContent("https://bit.ly/single-hop");
    const urlCard = cards.find((c) => c.kind === "url");
    expect(urlCard?.result.flags.some((f) => f.includes("Multi-hop"))).toBe(false);
  });

  it("falls back gracefully to the shortener result when expansion returns null", async () => {
    vi.mocked(expandUrl).mockResolvedValueOnce({ expandedUrl: null, hops: [] });

    const cards = await analyzeContent("https://bit.ly/unexpandable");
    const urlCard = cards.find((c) => c.kind === "url");
    expect(urlCard?.result.flags.some((f) => f.includes("shortener"))).toBe(true);
    expect(urlCard?.result.expandedUrl).toBeUndefined();
  });

  it("defangs the expanded URL stored in expandedUrl so it is never a live link", async () => {
    vi.mocked(expandUrl).mockResolvedValueOnce({
      expandedUrl: "https://phishing-site.tk/steal",
      hops: ["https://phishing-site.tk/steal"],
    });

    const cards = await analyzeContent("https://bit.ly/defang-check");
    const urlCard = cards.find((c) => c.kind === "url");
    // A defanged URL contains [.] instead of dots and hxxps instead of https
    expect(urlCard?.result.expandedUrl).toContain("[.]");
    expect(urlCard?.result.expandedUrl).not.toMatch(/^https?:\/\//);
  });

  it("expands shortened URLs embedded inside an SMS message", async () => {
    vi.mocked(expandUrl).mockResolvedValueOnce({
      expandedUrl: "https://commbank-phishing.tk/login",
      hops: ["https://commbank-phishing.tk/login"],
    });

    const cards = await analyzeContent(
      "Your package is ready. Track: https://bit.ly/sms-embed-exp",
    );
    const urlCard = cards.find((c) => c.kind === "url");
    expect(urlCard?.result.expandedUrl).toBeTruthy();
    expect(urlCard?.result.flags.some((f) => f.includes("expanded"))).toBe(true);
  });
});

// ── 2026-06-21 threat-intel roadmap rules ───────────────────────────────────

describe("threat-intel roadmap — URL rules", () => {
  it("flags IPFS gateway hosts (D9 / #56)", () => {
    const result = checkUrl("https://cloudflare-ipfs.com/ipfs/QmXoYPVK8v3BhKmXNqr2Xf5jK9WbV2TzLpRqt6cCdYz3A/");
    expect(result.flags.some((f) => f.includes("IPFS"))).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(40);
  });

  it("flags the /ipfs/<CID> path on any host (D9 / #56)", () => {
    const result = checkUrl("https://random-host.example/ipfs/bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi");
    expect(result.flags.some((f) => f.includes("IPFS"))).toBe(true);
  });

  it("flags newly-abused TLDs like .cyou and .icu (D4 / #50, #58)", () => {
    for (const host of ["https://claim-points.cyou", "https://toll-pay.icu"]) {
      const result = checkUrl(host);
      expect(result.flags.some((f) => f.includes("top-level domain"))).toBe(true);
    }
  });

  it("flags a trusted host carrying a nested redirect URL (D16)", () => {
    const result = checkUrl("https://example.com/click?url=https://evil.example/login");
    expect(result.flags.some((f) => f.includes("redirect"))).toBe(true);
  });
});

describe("threat-intel roadmap — SMS rules", () => {
  it("detects the 'Reply Y to activate' bypass (D3 / #54)", () => {
    const result = checkSms("Reply Y to activate your link and claim your Qantas points");
    expect(result.flags.some((f) => f.includes("Reply Y"))).toBe(true);
  });

  it("detects the 'copy link into your browser' variant (D3 / #54)", () => {
    const result = checkSms("Copy this link into your browser to pay your toll: example.com");
    expect(result.flags.some((f) => f.includes("Reply Y"))).toBe(true);
  });

  it("detects toll-road urgency language (D2 / #53)", () => {
    const result = checkSms("Linkt: you have an unpaid toll of $12.40. Pay now to avoid a fine.");
    expect(result.flags.some((f) => f.includes("Urgency"))).toBe(true);
    expect(result.flags.some((f) => f.includes("government agency"))).toBe(true);
  });

  it("detects QR quishing prompts (D11)", () => {
    const result = checkSms("Scan the QR code to verify your myGov account");
    expect(result.flags.some((f) => f.includes("QR code"))).toBe(true);
  });

  it("flags fake-job recruitment only with 2+ signals (D13 / #51)", () => {
    const hit = checkSms("Earn $500/day with simple tasks, work from home, no experience required");
    expect(hit.flags.some((f) => f.includes("recruitment"))).toBe(true);
    // A single signal should NOT trip the composite.
    const miss = checkSms("We have a flexible work from home opportunity at our Sydney office.");
    expect(miss.flags.some((f) => f.includes("recruitment"))).toBe(false);
  });

  it("detects loyalty points-expiry phishing language (D6 / #57)", () => {
    const result = checkSms("Flybuys: your 4,300 loyalty points will expire in 3 days. Claim them now: example.com");
    expect(result.flags.some((f) => f.includes("reward language"))).toBe(true);
  });

  it("detects remote-access-tool scam requests (D8 / #55)", () => {
    const result = checkSms("This is the ACSC. Download AnyDesk so we can fix the malware on your device.");
    expect(result.flags.some((f) => f.includes("sensitive info"))).toBe(true);
    expect(result.flags.some((f) => f.includes("government agency"))).toBe(true);
  });

  it("detects the bank 'safe account' tag-team scam (#47)", () => {
    const result = checkSms("This is CommBank security. Move your funds to a safe account immediately to protect your money.");
    expect(result.flags.some((f) => f.includes("sensitive info"))).toBe(true);
  });
});

describe("threat-intel roadmap — phone rules (D15 / #49)", () => {
  it("flags elevated-volume origins (India) without overstating risk", () => {
    const result = checkPhone("+91 98765 43210");
    // Surfaced as a caution, with explicit acknowledgement of legit callers,
    // and capped at a moderate score — never the very_high reserved for fakes.
    expect(result.flags.some((f) => /India/.test(f))).toBe(true);
    expect(result.flags.some((f) => /perfectly legitimate/.test(f))).toBe(true);
    expect(result.phoneIntel?.spoofingRisk).toBe("medium");
  });

  it("still rates a known high-scam origin (Nigeria) as high, not medium", () => {
    const result = checkPhone("+234 800 123 4567");
    expect(result.phoneIntel?.spoofingRisk).toBe("high");
  });
});

describe("threat-intel roadmap 2026-07-05 (#73-#78)", () => {
  it("detects tax-time cost-of-living lure language (D1 / #73)", () => {
    const result = checkSms("A $750 cost of living payment is waiting for you.");
    expect(result.flags.some((f) => f.includes("cost of living payment"))).toBe(true);
  });

  it("treats myID as a government-agency mention (D2 / #73)", () => {
    const result = checkSms("myID: verify your digital identity to keep your account active.");
    expect(result.flags.some((f) => f.includes("government agency"))).toBe(true);
  });

  it("warns that gov bodies don't put links in unsolicited SMS (D1 / #73)", () => {
    const result = checkSms("myGov: your tax has been recalculated. Confirm here: https://mygov-refund.xyz");
    expect(result.flags.some((f) => f.includes("removed links from their unsolicited SMS"))).toBe(true);
  });

  it("does not add the no-link warning for a toll operator that does use links (#73)", () => {
    const result = checkSms("Linkt: pay your outstanding toll at https://linkt-pay.example");
    expect(result.flags.some((f) => f.includes("removed links from their unsolicited SMS"))).toBe(false);
  });

  it("detects ClickFix 'press Win+R' social engineering in SMS (D3 / #74)", () => {
    const result = checkSms("Verify you are human: press Win+R, paste this command and hit enter.");
    expect(result.flags.some((f) => f.includes("Press Win+R"))).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(50);
  });

  it("detects ClickFix instructions in free-text / pasted page content (D3 / #74)", () => {
    const result = checkCustom("To confirm you're human, press Windows+R and paste the following command.");
    expect(result.flags.some((f) => f.includes("Press Win+R"))).toBe(true);
  });

  // ── AU customs / import-duty parcel lures (D2 / #142 / ABF 6 Aug 2026) ─────

  it("detects customs-clearance parcel lures in AU (D2 / #142)", () => {
    const result = checkSms(
      "AusPost: your parcel is held at customs. Pay the outstanding import duty to release your parcel: http://auspost-clearance.cyou/pay",
      undefined,
      "AU",
    );
    expect(result.flags.some((f) => f.toLowerCase().includes("urgency"))).toBe(true);
    expect(result.verdict).toBe("likely_scam");
  });

  it.each(["customs fee", "customs charge", "clearance fee", "held by customs", "held at border"])(
    "flags the AU customs phrase %p (D2 / #142)",
    (phrase) => {
      const result = checkSms(`Your delivery is on hold. A ${phrase} is payable.`, undefined, "AU");
      expect(result.flags.join(" | ").toLowerCase()).toContain("urgency");
    },
  );

  it("detects device-code / OAuth phishing language in email (D4 / #75)", () => {
    const result = checkEmail(
      "From: security@micros0ft-verify.com\n\nMicrosoft: enter this device code at microsoft.com/devicelogin to verify your new device.",
    );
    expect(result.flags.some((f) => f.includes("Device code phishing"))).toBe(true);
  });

  it("detects WhatsApp investment-group recruitment with 2+ signals (D5 / #76)", () => {
    const result = checkSms("Join our crypto group — exclusive trading tips. I'll add you to our WhatsApp.");
    expect(result.flags.some((f) => f.includes("Investment group recruitment"))).toBe(true);
  });

  it("does not trip the investment-group composite on a single benign signal (#76)", () => {
    const result = checkSms("Join our investment group for our free weekly newsletter.");
    expect(result.flags.some((f) => f.includes("Investment group recruitment"))).toBe(false);
  });

  it("flags .zip, .mov and .lat TLDs (D6 / #77)", () => {
    for (const host of ["https://invoice-download.zip", "https://voicemail.mov", "https://claim-now.lat"]) {
      const result = checkUrl(host);
      expect(result.flags.some((f) => f.includes("top-level domain"))).toBe(true);
    }
  });

  it("detects the ACMA 'Unverified' label override tactic (D7 / #78)", () => {
    const result = checkSms("NAB: this message may appear as Unverified due to a carrier update — it is genuine.");
    expect(result.flags.some((f) => f.includes("'Unverified' label override"))).toBe(true);
  });
});

describe("threat-intel roadmap 2026-07-12 (#80-#85)", () => {
  it("detects fake product-recall SMS lure language (D1 / #80)", () => {
    const result = checkSms("This is a product recall notice for your recent order.");
    expect(result.flags.some((f) => f.includes("product recall"))).toBe(true);
  });

  it("flags Qantas and Velocity URL typosquats (D2 / #81)", () => {
    for (const host of ["https://qantas-points-verify.xyz/login", "https://velocity-rewards.site"]) {
      const result = checkUrl(host);
      expect(result.score).toBeGreaterThanOrEqual(45);
      expect(result.flags.some((f) => f.includes("impersonating"))).toBe(true);
    }
  });

  it("does not flag the real qantas.com.au domain (#81)", () => {
    const result = checkUrl("https://www.qantas.com.au/frequent-flyer");
    expect(result.flags.some((f) => f.includes("impersonating"))).toBe(false);
  });

  it("flags Amazon and YouTube fake-recruiter SMS brand mentions (D3 / #82)", () => {
    const amazon = checkSms("Amazon is hiring product testers, flexible hours. Reply to apply.");
    expect(amazon.flags.some((f) => f.includes("well-known company"))).toBe(true);
    const youtube = checkSms("YouTube Content Team: earn cash rating videos. Message us to join.");
    expect(youtube.flags.some((f) => f.includes("well-known company"))).toBe(true);
  });

  it("flags Cloudflare R2 (r2.dev) phishing hosting (D4 / #83)", () => {
    const result = checkUrl("https://pub-abc123.r2.dev/mygov-login.html");
    expect(result.flags.some((f) => f.includes("r2.dev"))).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(25);
  });

  it("flags ngrok ephemeral tunnels as phishing hosting (D1 / #119)", () => {
    // Bare tunnel: hosting signal alone (+35) lands in "suspicious".
    const bare = checkUrl("https://abc123.ngrok-free.app");
    expect(bare.flags.some((f) => f.includes("ngrok-free.app"))).toBe(true);
    expect(bare.verdict).toBe("suspicious");

    const tunnel = checkUrl("https://random.ngrok.io/ato");
    expect(tunnel.flags.some((f) => f.includes("ngrok.io"))).toBe(true);
    expect(tunnel.verdict).toBe("suspicious");

    // Compounding with a credential-harvest path escalates past suspicious.
    const login = checkUrl("https://abc123.ngrok-free.app/login");
    expect(login.verdict).toBe("likely_scam");
  });

  it("flags github.io / netlify.app static-site phishing hosting (D2 / #120)", () => {
    const gh = checkUrl("https://ato-verify.github.io/login");
    expect(gh.flags.some((f) => f.includes("github.io"))).toBe(true);
    expect(gh.score).toBeGreaterThanOrEqual(25);

    const netlify = checkUrl("https://mygov-login.netlify.app");
    expect(netlify.flags.some((f) => f.includes("netlify.app"))).toBe(true);
    expect(netlify.score).toBeGreaterThanOrEqual(25);
  });

  it("does not flag a bare github.io project site as suspicious (#120 FP guard)", () => {
    const result = checkUrl("https://username.github.io");
    expect(result.verdict).toBe("safe");
  });

  it("still treats real AU government domains as safe (#119 regression)", () => {
    expect(checkUrl("https://ato.gov.au").verdict).toBe("safe");
  });

  it("detects ATO tax debt / audit coercion language (D7 / #124)", () => {
    const debt = checkSms("URGENT: The ATO has identified an outstanding tax debt of $4,219. Your TFN will be suspended in 24 hours. Call 1300 555 111.");
    expect(debt.verdict).toBe("likely_scam");

    const audit = checkSms("You have been selected for a tax audit. Failure to respond in 48 hours will result in legal action will be taken. ATO Compliance.");
    expect(audit.verdict).toBe("likely_scam");
  });

  it("still scores ATO refund lures correctly (#124 regression)", () => {
    const refund = checkSms("Your tax refund waiting to be claimed via myGov.");
    expect(refund.verdict).toBe("likely_scam");
  });

  it("detects energy retailer impersonation (D3 / #121)", () => {
    const origin = checkSms("Origin Energy: We detected a billing error. Claim your $150 refund: http://originenergy-billing.xyz");
    expect(origin.verdict).toBe("likely_scam");

    const agl = checkSms("AGL: A credit of $86.50 has been applied to your account. Verify bank details now.");
    expect(agl.flags.some((f) => f.includes("well-known company"))).toBe(true);

    expect(checkUrl("https://originenergy-billing.xyz").verdict).toBe("likely_scam");
  });

  it("does not flag 'agl' inside ordinary words (#121 FP guard)", () => {
    const result = checkSms("Your bagel order from the eagle cafe is ready for pickup.");
    expect(result.flags.some((f) => f.includes("well-known company"))).toBe(false);
    expect(result.verdict).toBe("safe");
    // Same collision via the URL checker's substring match.
    expect(checkUrl("https://eagle.org").verdict).toBe("safe");
    expect(checkUrl("https://flagler.com").verdict).toBe("safe");
  });

  it("detects AU crypto exchange impersonation (D6 / #123)", () => {
    const url = checkUrl("https://coinspot-login.pages.dev");
    expect(url.verdict).toBe("likely_scam");
    expect(url.flags.some((f) => f.includes("coinspot"))).toBe(true);
  });

  it("detects crypto-exchange TOAD callback lures (D6 / #123)", () => {
    const coinspot = checkSms("Your CoinSpot account has been suspended. Call 1800 555 222 immediately.");
    expect(coinspot.verdict).toBe("likely_scam");
    expect(coinspot.flags.some((f) => f.includes("never ring customers"))).toBe(true);

    const swyftx = checkSms("Swyftx security: suspicious login detected. Contact support on 1300 111 222.");
    expect(swyftx.verdict).toBe("likely_scam");
  });

  it("does not fire crypto TOAD without a callback number (#123 FP guard)", () => {
    const result = checkSms("Your CoinSpot deposit of $50 has cleared.");
    expect(result.flags.some((f) => f.includes("never ring customers"))).toBe(false);
  });

  it("detects fake voicemail notification lures (D5 / #122)", () => {
    const withUrl = checkSms("You have 1 new voicemail. Listen here: https://abc.ngrok-free.app/vm");
    expect(withUrl.flags.some((f) => f.includes("Fake voicemail"))).toBe(true);
    expect(withUrl.verdict).toBe("likely_scam");

    // No URL — the lure still registers on its own.
    const noUrl = checkSms("You have 2 unheard voicemails. Tap to listen.");
    expect(noUrl.flags.some((f) => f.includes("Fake voicemail"))).toBe(true);

    const missedCall = checkSms("Missed call notification: click to listen to your voicemail");
    expect(missedCall.flags.some((f) => f.includes("Fake voicemail"))).toBe(true);

    // checkEmail inherits the signal via its checkSms delegation.
    const email = checkEmail("You have a new voicemail message waiting. Listen: https://vm-portal.xyz");
    expect(email.flags.some((f) => f.includes("Fake voicemail"))).toBe(true);
  });

  it("does not flag conversational voicemail mentions (#122 FP guard)", () => {
    for (const text of [
      "I left you a voicemail, let me know if you got it",
      "Sorry I missed your call, I left a voicemail",
      "Your voicemail box is full",
      "Can you check voicemail when you get a sec?",
    ]) {
      const result = checkSms(text);
      expect(result.flags.some((f) => f.includes("Fake voicemail"))).toBe(false);
      expect(result.verdict).toBe("safe");
    }
  });

  it("detects PDF-embedded QR 'Scanception' phrasing (D7 / #113)", () => {
    for (const text of [
      "The attachment contains a QR code — scan it to confirm delivery.",
      "See attached invoice. The attachment contains a QR code.",
      "The attached PDF contains a QR code.",
      "This attachment includes a QR code to scan.",
      "The attached document has a QR code.",
    ]) {
      expect(checkSms(text).flags.some((f) => f.includes("quishing"))).toBe(true);
    }

    // checkEmail inherits the signal via its checkSms delegation.
    const email = checkEmail("See attached invoice. The attachment contains a QR code.");
    expect(email.flags.some((f) => f.includes("quishing"))).toBe(true);
  });

  it("still catches the original 'scan the QR code' phrasings (#113 regression)", () => {
    for (const text of [
      "Please scan the QR code in the attached PDF to verify your invoice.",
      "Please find attached. Scan the QR code in the attachment.",
    ]) {
      expect(checkSms(text).flags.some((f) => f.includes("quishing"))).toBe(true);
    }
  });

  it("does not flag legitimate attached-QR mentions (#113 FP guard)", () => {
    for (const text of [
      "I've attached the conference poster, the QR code links to the schedule.",
      "The QR code on the attached flyer goes to our booking page.",
      "The attachment contains a summary of last quarter.",
    ]) {
      const result = checkSms(text);
      expect(result.flags.some((f) => f.includes("quishing"))).toBe(false);
      expect(result.verdict).toBe("safe");
    }
  });

  it("detects Operation Road Trap rego/toll vocabulary (D5 / #84)", () => {
    const result = checkSms("Your vehicle registration suspended due to rego restrictions.");
    expect(result.flags.some((f) => f.includes("rego restrictions"))).toBe(true);
  });

  it("detects celebrity/ASIC-claim investment bait keywords (D6 / #85)", () => {
    const result = checkSms("Exclusive investment opportunity: guaranteed returns, verified by ASIC. Double your money.");
    expect(result.flags.some((f) => f.includes("reward language"))).toBe(true);
    expect(result.flags.some((f) => f.includes("guaranteed returns"))).toBe(true);
  });
});

describe("threat-intel roadmap 2026-07-26 (#102, #104, #106)", () => {
  // ── #104: named fraudulent AI trading platforms ─────────────────────────────
  it("flags a named fraudulent investment platform in an SMS (D4 / #104)", () => {
    const result = checkSms("Join Quantum AI now — automated trading, sign up in 2 minutes.");
    expect(result.flags.some((f) => f.includes("fraudulent investment platform"))).toBe(true);
    expect(result.flags.some((f) => f.includes("quantum ai"))).toBe(true);
    expect(result.verdict).toBe("likely_scam");
  });

  it("flags each ASIC-named platform variant (D4 / #104)", () => {
    for (const name of ["Immediate Edge", "Immediate X3", "Bitcoin Era", "Quantum Trade Wave"]) {
      const result = checkSms(`I made $8000 with ${name} last week, want in?`);
      expect(result.flags.some((f) => f.includes("fraudulent investment platform"))).toBe(true);
    }
  });

  it("flags a named platform in pasted free text (D4 / #104)", () => {
    const result = checkCustom("Advertisement: Immediate Connect — the AI that trades crypto for you.");
    expect(result.flags.some((f) => f.includes("fraudulent investment platform"))).toBe(true);
  });

  it("does not flag ordinary text that merely mentions AI or bitcoin (D4 / #104)", () => {
    const result = checkSms("Our team is building an AI feature and researching bitcoin fees.");
    expect(result.flags.some((f) => f.includes("fraudulent investment platform"))).toBe(false);
  });

  // ── #106: myID forced re-registration phishing ──────────────────────────────
  it("flags a myID digital-identity re-registration lure (D6 / #106)", () => {
    const result = checkSms("Your digital identity verification has expired. Re-verify now to keep your myGov access.");
    expect(result.flags.some((f) => f.includes("re-registration lure"))).toBe(true);
  });

  it("flags a suspended-myID variant that omits an agency name (D6 / #106)", () => {
    const result = checkSms("Notice: myID has been suspended. Complete your identity verification to restore access.");
    expect(result.flags.some((f) => f.includes("re-registration lure"))).toBe(true);
  });

  it("does not flag an incidental mention of identity in ordinary copy (D6 / #106)", () => {
    const result = checkSms("Thanks for updating your profile — your details are saved.");
    expect(result.flags.some((f) => f.includes("re-registration lure"))).toBe(false);
  });

  // ── #102: TOAD / callback phishing email ────────────────────────────────────
  it("flags a Norton fake-invoice callback email with a charge and no link (D2 / #102)", () => {
    const email = "Your Norton Antivirus subscription has been renewed and $349.99 has been charged to your account. Call 1-800-555-0142 to cancel this charge or dispute the payment.";
    const result = checkEmail(email);
    expect(result.flags.some((f) => f.includes("Fake subscription callback scam"))).toBe(true);
    expect(result.verdict).toBe("likely_scam");
  });

  it("flags a McAfee dispute variant just over the amount threshold (D2 / #102)", () => {
    const email = "McAfee invoice INV-0024819: you have been billed $299 for your annual plan. To dispute this charge, call our billing team immediately.";
    const result = checkEmail(email);
    expect(result.flags.some((f) => f.includes("Fake subscription callback scam"))).toBe(true);
  });

  it("does not flag a genuine Norton renewal email that links back to the vendor (D2 / #102)", () => {
    const email = "Your Norton subscription renews for $349.99. Manage or cancel your plan anytime at https://my.norton.com/account.";
    const result = checkEmail(email);
    expect(result.flags.some((f) => f.includes("Fake subscription callback scam"))).toBe(false);
  });

  it("falls back to the softer flag for two brands without an amount (D2 / #102)", () => {
    const email = "Notice regarding your McAfee and Norton subscriptions. To cancel this subscription, call the number below.";
    const result = checkEmail(email);
    expect(result.flags.some((f) => f.includes("Possible fake invoice callback scam"))).toBe(true);
  });
});

describe("threat-intel roadmap 2026-07-26 (#101, #103, #105)", () => {
  // ── #101: high-abuse TLDs promoted from watchlist ───────────────────────────
  it("flags each newly promoted high-abuse TLD (D1 / #101)", () => {
    for (const host of [
      "auspost-track.shop", "card-checkout.store", "invest-au.vip",
      "verify-now.lol", "secure-login.monster",
    ]) {
      const result = checkUrl(`https://${host}/login`);
      expect(result.flags.some((f) => f.includes("Dodgy top-level domain"))).toBe(true);
    }
  });

  it("reaches a scam verdict when a promoted TLD compounds with other signals (D1 / #101)", () => {
    const result = checkSms("URGENT: your AusPost parcel is held. Confirm identity at https://auspost-track.shop/verify");
    expect(result.verdict).toBe("likely_scam");
  });

  it("does not flag an ordinary .com.au retailer (D1 / #101)", () => {
    const result = checkUrl("https://www.woolworths.com.au/shop/browse/specials");
    expect(result.flags.some((f) => f.includes("Dodgy top-level domain"))).toBe(false);
  });

  // ── #103: foreign authority impersonation ───────────────────────────────────
  it("flags a Chinese police impersonation SMS (D3 / #103)", () => {
    const result = checkSms(
      "This is the Beijing police. You are subject to a money laundering investigation and an arrest warrant has been issued. Do not tell anyone. Call us immediately."
    );
    expect(result.flags.some((f) => f.includes("foreign police or government authority"))).toBe(true);
    expect(result.verdict).toBe("likely_scam");
  });

  it("flags each foreign-authority variant (D3 / #103)", () => {
    for (const authority of [
      "Chinese police", "Shanghai police", "Chinese consulate",
      "Embassy of China", "Chinese customs", "Chinese authorities",
    ]) {
      const result = checkSms(`Notice from the ${authority}: your case requires a security deposit.`);
      expect(result.flags.some((f) => f.includes("foreign police or government authority"))).toBe(true);
    }
  });

  it("flags foreign-authority threat language as urgency (D3 / #103)", () => {
    const result = checkSms("Final notice: a deportation notice has been filed and your visa will be cancelled.");
    expect(result.flags.some((f) => f.includes("Urgency language"))).toBe(true);
  });

  it("flags a consulate impersonation targeting a student visa holder (D3 / #103)", () => {
    const result = checkSms(
      "Chinese consulate: you are involved in criminal activity in China. Transfer a security deposit via bitcoin or face detention."
    );
    expect(result.verdict).toBe("likely_scam");
  });

  it("does not flag ordinary travel or news copy mentioning China (D3 / #103)", () => {
    const result = checkSms("Our flight to Shanghai is booked and the visa paperwork is done.");
    expect(result.flags.some((f) => f.includes("foreign police or government authority"))).toBe(false);
  });

  // ── #105: rental/property bond redirect fraud ───────────────────────────────
  it("flags an agency 'updated bank details' bond redirect (D5 / #105)", () => {
    const result = checkSms(
      "Hi, please note our agency has updated bank details for rental bond collection. New BSB: 062-111 Acc: 12345678. Please transfer your $4,200 bond today."
    );
    expect(result.flags.some((f) => f.includes("Property bond fraud pattern"))).toBe(true);
    expect(result.verdict).toBe("likely_scam");
  });

  it("flags a holding-deposit variant with a changed account (D5 / #105)", () => {
    const result = checkSms(
      "Your tenancy application was approved. Please pay the holding deposit $500 to our new account details (BSB changed last week): BSB 012-345 Acc 987654321."
    );
    expect(result.flags.some((f) => f.includes("Property bond fraud pattern"))).toBe(true);
  });

  it("does not fire the composite on rental context alone (D5 / #105)", () => {
    const result = checkSms("Reminder: your lease agreement is due for renewal next month.");
    expect(result.flags.some((f) => f.includes("Property bond fraud pattern"))).toBe(false);
  });

  it("does not fire the composite on a bank-detail mention alone (D5 / #105)", () => {
    const result = checkSms("Your account number ending 4821 has been updated in our system.");
    expect(result.flags.some((f) => f.includes("Property bond fraud pattern"))).toBe(false);
  });

  // ── Changed-payment-details signal ──────────────────────────────────────────
  // "updated bank details" used to sit in requestWords, where it overlapped the
  // plain "bank details" entry and double-scored one phrase. Removing the
  // overlap dropped two genuine bond-redirect messages from likely_scam to
  // suspicious, so the qualifier is now scored as its own signal — which also
  // catches invoice/BEC redirect fraud that had no rental context and
  // previously scored nothing at all.
  const redirectFlag = (r: { flags: string[] }) =>
    r.flags.some((f) => f.includes("presented as recently changed"));

  it.each([
    "Property manager: lease agreement finalised, updated bank details attached, pay today.",
    "Your agent has updated bank details — please transfer the holding deposit now.",
    "Invoice #4021: our bank details have been updated, please remit to the new account number.",
    "Accounts: we have changed bank account, please update the account number on file.",
  ])("flags payment details presented as changed: %s", (msg) => {
    const result = checkSms(msg);
    expect(redirectFlag(result)).toBe(true);
    expect(result.verdict).toBe("likely_scam");
  });

  it.each([
    "We updated your address in our records.",
    "Your new account has been created, welcome aboard.",
    "Updated delivery details: your parcel arrives Tuesday.",
    "We have updated our privacy policy.",
    "Your account number ending 4821 has been updated in our system.",
  ])("does not fire the changed-details signal on %s", (msg) => {
    expect(redirectFlag(checkSms(msg))).toBe(false);
  });

  it("scores identical phrasings identically (no substring double-count)", () => {
    // The overlap was invisible in the flag text — both phrases were listed,
    // reading as two findings — but doubled the score.
    const withQualifier = checkSms("Please send your bank details today.");
    expect(withQualifier.flags.some((f) => f.includes('"bank details", "updated bank details"'))).toBe(false);
  });

  it("does not change verdict on the myGovID/myGov spelling alone", () => {
    // "mygovid" contained "mygov" in requestWords, so the same message scored
    // 55 (likely_scam) or 40 (suspicious) purely on which spelling was used.
    const withId = checkSms("Confirm your myGovID now.");
    const without = checkSms("Confirm your myGov now.");
    expect(withId.score).toBe(without.score);
    expect(withId.verdict).toBe(without.verdict);
  });

  it("still detects the real myGovID re-registration lures", () => {
    // The rebrand lures are carried by identityRereg and authorityMentions, not
    // by the double-count that was removed.
    for (const msg of [
      "myGovID verification required. Confirm your identity at http://mygovid-verify.top",
      "myGovID has been suspended. Re-verify your digital identity immediately.",
      "ATO: confirm your myGovID and tax file number to release your refund.",
    ]) {
      expect(checkSms(msg).verdict).toBe("likely_scam");
    }
  });
});

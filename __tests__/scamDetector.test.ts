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

import { describe, it, expect } from "vitest";
import { analyzeContent } from "@/lib/scamDetector";

// Scam SMS routinely omits the scheme — "Login at commbank-secure-login.tk/auth".
// URL_GLOBAL requires http(s)://, so those produced no URL card at all and the
// link went unanalysed. detectType already treated a leading "www." as a URL,
// so the same host scored 85 with the prefix and 0 without it.
//
// The risk in fixing this is false positives: "report.docx", "README.md" and
// "node.js" all look like hostnames. A missed scam URL still gets message-level
// analysis; a false positive puts a scary URL card on an innocent message, so
// these tests weight heavily toward the negative cases.

async function urlCards(text: string) {
  return (await analyzeContent(text)).filter((c) => c.kind === "url");
}

describe("schemeless scam hostnames are analysed", () => {
  it("scores a bare host on an abuse-prone TLD", async () => {
    const cards = await urlCards("commbank-secure-login.tk");
    expect(cards).toHaveLength(1);
    expect(cards[0].result.score).toBeGreaterThan(50);
  });

  it("scores a bare host with a path", async () => {
    const cards = await urlCards("commbank-secure-login.tk/auth");
    expect(cards).toHaveLength(1);
    expect(cards[0].result.score).toBeGreaterThan(50);
  });

  it("finds a schemeless host embedded in a message", async () => {
    // The realistic shape of a scam SMS.
    const cards = await urlCards("Your parcel is held. Pay now at auspost-redelivery.tk/fee");
    expect(cards).toHaveLength(1);
    // The abuse-prone TLD alone is worth flagging; the score depends on which
    // other rules the host trips, so assert it is not the silent 0 it used to be.
    expect(cards[0].result.score).toBeGreaterThan(0);
    expect(cards[0].result.verdict).not.toBe("safe");
  });

  it("gives the same verdict with or without a www. prefix", async () => {
    // The inconsistency that motivated this: www. was already treated as a URL.
    const withWww = await urlCards("www.commbank-secure-login.tk/auth");
    const without = await urlCards("commbank-secure-login.tk/auth");
    expect(without[0].result.score).toBe(withWww[0].result.score);
  });

  it("still analyses a legitimate host when it carries a path", async () => {
    const cards = await urlCards("auspost.com.au/track");
    expect(cards).toHaveLength(1);
    expect(cards[0].result.verdict).toBe("safe");
  });
});

describe("ordinary text does not become a URL card", () => {
  // Each of these would raise a spurious "URL" result for a user who is not
  // reporting a link at all.
  const innocuous = [
    "Send me the report.docx when you can",
    "It's in README.md at the top",
    "We use node.js and vue.js here",
    "The archive.zip is on the drive",
    "Please review invoice.mov before Friday",
    "My file is C:\\Users\\me\\docs.pdf",
    "Reply to sales@auspost.com.au please",
    "Contact: 1.800.555.0199",
    "Mr. Smith went home",
    "e.g. this and i.e. that",
    "version 2.0 released today",
    "Send me the notes.org file",
    "Our teams are dev.io and ops.io",
    "the domain is example.com",
  ];

  for (const text of innocuous) {
    it(`produces no URL card for: ${text.slice(0, 40)}`, async () => {
      expect(await urlCards(text)).toHaveLength(0);
    });
  }
});

describe("bare-host extraction does not disturb scheme'd URLs", () => {
  it("does not double-count a URL that already has a scheme", async () => {
    const cards = await urlCards("Track at https://auspost.com.au/track");
    expect(cards).toHaveLength(1);
  });

  it("does not double-count a defanged URL once refanged", async () => {
    const cards = await urlCards("Someone sent hxxps://commbank-secure-login[.]tk/auth");
    expect(cards).toHaveLength(1);
  });

  it("handles a scheme'd and a bare host in one message", async () => {
    const cards = await urlCards("First https://real-site.com/a then evil-second.tk/b");
    expect(cards).toHaveLength(2);
  });
});

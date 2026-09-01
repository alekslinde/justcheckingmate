import { describe, expect, it } from "vitest";
import { checkSms } from "@justcheckingmate/engine/scamDetector";

// The "Hi Mum" script (D2 / #251). Before this rule every message below scored
// zero and rendered as "Looks pretty right to us" — the worst possible answer
// for the most-reported scam text in AU.
describe("family impersonation (Hi Mum)", () => {
  const scams = [
    "mum send me 400 my phone broke, send it as quick as you can",
    "Hi Mum, this is my new number, my phone broke. Can you send $400?",
    "Hi Dad I dropped my phone, text me on this number. I need you to transfer 1200 today please",
    "Hello mum, lost my phone. Could you please send me money urgently",
    "Hi Mum, using my friend's phone. Can you transfer $850 to this account today?",
  ];

  it.each(scams)("flags the script: %s", (text) => {
    const r = checkSms(text);
    expect(r.score).toBeGreaterThanOrEqual(45);
    expect(r.verdict).toBe("likely_scam");
  });

  it("names the pretext in the advice, not just the verdict", () => {
    const r = checkSms("Hi Mum, this is my new number, my phone broke. Can you send $400?");
    const evidence = (r.signals ?? []).map((s) => s.text).join(" ");
    expect(evidence).toMatch(/new number|broken-phone/i);
    // The advice has to give the reader the out-of-band check, since that is
    // the only thing that actually defeats this scam.
    expect(evidence).toMatch(/usual number|number you already have/i);
  });

  // Each half is ordinary family texting. The composite only fires on all of
  // them at once, and these guard that it stays that way.
  const legit = [
    "Mum can you pick me up at 5",
    "Hi Mum, happy birthday! Love you",
    "Dad my phone broke, I'll call you from the landline later",
    "Mum I'll send you the 40 dollars I owe you tomorrow",
    "Hey mate, send me 400 for the tickets when you can",
    "Mum, dinner at 7? I'll pay for the 200 dollar booking",
    "I'll ask mum about the weekend and send you 50 for petrol",
  ];

  it.each(legit)("leaves ordinary family texts alone: %s", (text) => {
    expect(checkSms(text).verdict).toBe("safe");
  });
});

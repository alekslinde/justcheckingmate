import { describe, expect, it } from "vitest";
import { checkEmail, checkSms } from "@justcheckingmate/engine/scamDetector";

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

  // The script runs by email as readily as by SMS, and the email path very
  // nearly missed it twice: the anchor was testing the "From:" line rather than
  // the body, and the blanket 0.7 email discount then demoted a 45 to a 31.
  describe("over email", () => {
    const body = "Hi Mum, this is my new number, my phone broke. Can you send $400?";
    const withHeaders = `From: Sarah <sarah.j.9912@gmail.com>\nSubject: hi\n\n${body}`;

    it("fires through the header block, not just on a bare body", () => {
      expect(checkEmail(withHeaders).verdict).toBe("likely_scam");
    });

    it("does not let the email discount demote the script to 'suspicious'", () => {
      const r = checkEmail(withHeaders);
      expect(r.score).toBeGreaterThanOrEqual(45);
      // Same conclusion the SMS path reaches for the same words.
      expect(r.verdict).toBe(checkSms(body).verdict);
    });

    it("keeps the evidence adding up to the score it shows", () => {
      const r = checkEmail(withHeaders);
      const summed = (r.signals ?? []).reduce((n, s) => n + s.points, 0);
      expect(summed).toBe(r.score);
      // The floor must not reach the score by padding in a blank row.
      expect((r.flags ?? []).every((f) => f.trim().length > 0)).toBe(true);
    });

    it("a body that merely contains a blank line is not treated as headers", () => {
      expect(checkEmail(`Hi Mum\n\n${body}`).verdict).toBe("likely_scam");
    });

    it("leaves an ordinary family email alone", () => {
      const r = checkEmail(
        "From: Sarah <sarah@work.com>\nSubject: dinner\n\nHi Mum, dinner at 7 tomorrow? I'll pay for the booking.",
      );
      expect(r.verdict).toBe("safe");
    });
  });

  // The gate briefly accepted "any other signal present" instead of requiring
  // the pretext, which let a single urgency word open a +45. These are the
  // messages a real family member sends.
  describe("requires the pretext, not merely another signal", () => {
    const innocentButUrgent = [
      "Mum, don't forget to pay the school fees of 250 before Friday, it's urgent!",
      "Mum can you pay the 300 rego before Friday, urgent!",
      "Dad, urgent — can you transfer $200 for the flights today?",
    ];

    it.each(innocentButUrgent)("does not call a real family member a scammer: %s", (text) => {
      expect(checkSms(text).verdict).not.toBe("likely_scam");
    });
  });
});

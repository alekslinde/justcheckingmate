import { describe, it, expect } from "vitest";
import { checkSms } from "@justcheckingmate/engine/scamDetector";

// Three signals fired on the SUBJECT of a message rather than on anything wrong
// with it, and together they scored every genuine AU sender template as
// suspicious or worse. Found by eval/corpus/au-benign-senders.jsonl, which is
// sourced from what the impersonated organisations publish about their own mail.
//
// AU FPR was 41.4% before these; it is 3.4% after, with recall unchanged.

const sms = (t: string) => checkSms(t, undefined, "AU");

describe("naming an agency is not, alone, evidence", () => {
  it.each([
    ["AusPost: your parcel is on board for delivery today. No action needed."],
    ["AusPost: your parcel has been delivered. Track your deliveries in the AusPost app."],
    ["You have a new message in your myGov Inbox. Sign in to myGov to read it."],
    ["The ATO has sent you a message. Sign in to myGov to read it. We will never send you a link to log on."],
    ["Medicare: your claim has been processed. Your benefit will be paid to your nominated bank account within 3 business days."],
    ["Linkt: your account balance is low. Top up in the Linkt app or at a service centre."],
  ])("leaves a genuine sender notification alone: %s", (text) => {
    expect(sms(text).verdict).toBe("safe");
  });

  it("still says what it noticed, rather than going silent", () => {
    // Dropping the row entirely would read as "nothing here", which is not the
    // conclusion — the agency name WAS seen and judged unremarkable.
    const r = sms("You have a new message in your myGov Inbox. Sign in to myGov to read it.");
    expect((r.flags ?? []).join(" ")).toMatch(/names a government agency/i);
  });

  it("scores the mention once something corroborates it", () => {
    // A link, a callback number, urgency or an ask is what separates the scam.
    const withLink = sms("myGov: your account is suspended. Restore access at https://mygov-restore.tk/verify");
    expect(withLink.verdict).toBe("likely_scam");
    expect((withLink.flags ?? []).join(" ")).toMatch(/claims to be from a government agency/i);
  });
});

describe("naming a service is not asking for anything", () => {
  it("does not claim an ask that is not in the text", () => {
    const r = sms("You have a new message in your myGov Inbox. Sign in to myGov to read it.");
    expect((r.flags ?? []).join(" ")).not.toMatch(/asks for sensitive info/i);
  });

  it("still fires, and still reaches likely_scam, on a real ask", () => {
    // The service name is not dropped — paired with a genuine ask it is the
    // scam's whole shape, so it still adds weight.
    const r = sms("ATO: confirm your myGovID and tax file number to release your refund");
    expect(r.verdict).toBe("likely_scam");
    expect((r.flags ?? []).join(" ")).toMatch(/asks for sensitive info/i);
  });
});

describe("'claim' as a noun is not prize language", () => {
  it.each([
    "Medicare: your claim has been processed. Your benefit will be paid within 3 business days.",
    "Your claim was approved. The payment is on its way.",
    "The claim has been assessed and no further action is needed.",
  ])("does not read an insurance or Medicare claim as a prize: %s", (text) => {
    expect((sms(text).flags ?? []).join(" ")).not.toMatch(/prize\/reward language/i);
  });

  it.each([
    "Congratulations! Claim your $1000 prize now at http://free-money.tk/win",
    "You have been selected. Claim your reward before it expires.",
  ])("still reads the verb sense as prize language: %s", (text) => {
    expect((sms(text).flags ?? []).join(" ")).toMatch(/prize\/reward language/i);
  });
});

describe("phrase lists match through whitespace variation", () => {
  it("scores the myID re-registration lure the same however it is spaced", () => {
    // These matchers used a raw includes(), bypassing mentions() and its
    // whitespace handling — the same defect fixed there, in a rule that did not
    // use the fixed function.
    const single = "Your digital identity verification has expired. Re-verify now to keep your myGov access.";
    const doubled = single.replace(/ /g, "  ");
    expect(sms(single).verdict).toBe("likely_scam");
    expect(sms(doubled).verdict).toBe(sms(single).verdict);
    expect(sms(doubled).score).toBe(sms(single).score);
  });
});

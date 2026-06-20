import { describe, it, expect } from "vitest";
import { unwrapForwarded } from "@/lib/forwardedEmail";
import { parseEmailHeaders } from "@/lib/emailHeaders";

// The victim's own forward wrapper — every fixture is wrapped in headers that
// look like THIS, and the whole point is that we must NOT report these.
const FORWARDER = "victim@gmail.com";

// ── Apple Mail "Forward as Attachment" → message/rfc822 part ──
const APPLE_ATTACHMENT = [
  `From: ${FORWARDER}`,
  "To: check@justcheckingmate.app",
  "Subject: Fwd: Your account",
  'Content-Type: multipart/mixed; boundary="APPLE-BOUND"',
  "",
  "--APPLE-BOUND",
  "Content-Type: text/plain",
  "",
  "Sending this on, looks dodgy.",
  "",
  "--APPLE-BOUND",
  "Content-Type: message/rfc822",
  "",
  "From: myGov <noreply@scam-evil.tk>",
  "Reply-To: collect@elsewhere.ru",
  "Subject: Your payment is pending",
  "Authentication-Results: mx.google.com; spf=fail; dmarc=fail",
  "",
  "Click here to verify.",
  "--APPLE-BOUND--",
].join("\n");

// ── Gmail inline forward ──
const GMAIL_INLINE = [
  `From: ${FORWARDER}`,
  "To: check@justcheckingmate.app",
  "Subject: Fwd: Refund waiting",
  "",
  "Is this real??",
  "",
  "---------- Forwarded message ---------",
  "From: ATO <refunds@ato-refund.xyz>",
  "Date: Mon, 1 Jan 2026 at 09:00",
  "Subject: Refund waiting",
  "Reply-To: get@payme.cc",
  "To: <victim@gmail.com>",
  "",
  "You are owed $450. Confirm details.",
].join("\n");

// ── Outlook inline forward (>-quoted) ──
const OUTLOOK_INLINE = [
  `From: ${FORWARDER}`,
  "Subject: FW: Parcel held",
  "",
  "see below",
  "",
  "> -----Original Message-----",
  "> From: AusPost <delivery@aus-post.top>",
  "> Sent: Monday, 1 January 2026",
  "> Reply-To: pay@parcel-fee.info",
  "> Subject: Parcel held",
  ">",
  "> Pay the fee to release your parcel.",
].join("\n");

describe("unwrapForwarded", () => {
  it("recovers the original from an Apple message/rfc822 attachment", () => {
    const { raw, source } = unwrapForwarded(APPLE_ATTACHMENT);
    expect(source).toBe("attachment");
    const h = parseEmailHeaders(raw);
    expect(h.fromAddress).toBe("noreply@scam-evil.tk");
    expect(h.replyTo).toBe("collect@elsewhere.ru");
    // Attachment fidelity: authentication verdicts survive too.
    expect(h.spf).toBe("fail");
    expect(h.dmarc).toBe("fail");
    expect(h.fromAddress).not.toBe(FORWARDER);
  });

  it("recovers the original from a Gmail inline forward", () => {
    const { raw, source } = unwrapForwarded(GMAIL_INLINE);
    expect(source).toBe("inline");
    const h = parseEmailHeaders(raw);
    expect(h.fromAddress).toBe("refunds@ato-refund.xyz");
    expect(h.replyTo).toBe("get@payme.cc");
    expect(h.fromAddress).not.toBe(FORWARDER);
    // The quoted body must be preserved (not just the headers) so tracking
    // analysis can run on inline forwards.
    expect(raw).toContain("You are owed $450");
  });

  it("recovers the original from an Outlook quoted forward", () => {
    const { raw, source } = unwrapForwarded(OUTLOOK_INLINE);
    expect(source).toBe("inline");
    const h = parseEmailHeaders(raw);
    expect(h.fromAddress).toBe("delivery@aus-post.top");
    expect(h.replyTo).toBe("pay@parcel-fee.info");
  });

  it("treats a bare exported .eml (no forward wrapper) as the original", () => {
    const raw = [
      "From: scammer@bad.tk",
      "Reply-To: scammer@bad.tk",
      "Subject: hi",
      "",
      "body",
    ].join("\n");
    const out = unwrapForwarded(raw);
    expect(out.source).toBe("toplevel");
    expect(parseEmailHeaders(out.raw).fromAddress).toBe("scammer@bad.tk");
  });

  it("preserves quoted headers and body so tracking fires on inline forwards", () => {
    const forward = [
      `From: ${FORWARDER}`,
      "Subject: Fwd: alert",
      "",
      "look at this",
      "",
      "---------- Forwarded message ---------",
      "From: Bank <noreply@bank-evil.tk>",
      "Reply-To: collect@bank-evil.tk",
      "Disposition-Notification-To: spy@bank-evil.tk",
      "Subject: alert",
      "",
      '<img src="https://trk.bank-evil.tk/pixel/1" width="1" height="1">',
    ].join("\n");
    const { raw, source } = unwrapForwarded(forward);
    expect(source).toBe("inline");
    // Read-receipt header from the quote survives.
    expect(raw).toMatch(/Disposition-Notification-To:/i);
    // Body (pixel) survives.
    expect(raw).toContain("trk.bank-evil.tk/pixel/1");
  });

  it("does not crash on empty or junk input", () => {
    expect(unwrapForwarded("").source).toBe("toplevel");
    expect(unwrapForwarded("just some text\nno headers").source).toBe("toplevel");
  });
});

// Email header parsing and sender-identity analysis.
//
// Scammers spoof the visible From with a friendly display-name alias while the
// real address — and especially the Reply-To — give the game away. This module
// extracts those identities from raw email source (or a pasted/forwarded blob)
// and flags the two strongest signals: display-name masking and From≠Reply-To.
//
// Pure string logic only. The raw email is parsed client-side; only the
// extracted scammer identities are ever submitted (see ReportForm).

export interface EmailHeaders {
  fromDisplay: string; // display name shown to the user, e.g. "myGov"
  fromAddress: string; // real address behind the From, e.g. x@evil.tk
  replyTo: string; // Reply-To address, if present
  returnPath: string; // Return-Path / envelope sender, if present
  sender: string; // Sender header address, if present
}

// Brand/identity words that, when they appear in a display name but not in the
// actual sending domain, indicate impersonation. Mirrors the lists used in
// scamDetector (kept local here to avoid a circular import).
const IMPERSONATED_BRANDS = [
  "ato", "mygov", "centrelink", "medicare", "services australia",
  "commbank", "commonwealth bank", "westpac", "anz", "nab", "paypal",
  "auspost", "australia post", "telstra", "optus", "amazon", "netflix",
  "apple", "microsoft", "google", "linkt", "etoll",
];

// Domain of an email address: lowercased, everything after the last '@'.
export function domainOf(address: string): string {
  const at = address.lastIndexOf("@");
  if (at === -1) return "";
  return address.slice(at + 1).trim().toLowerCase().replace(/[>)\].,;:]+$/, "");
}

// Pull the first email address out of a header value.
function addressIn(value: string): string {
  const m = value.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
  return m ? m[0] : "";
}

// Pull the display name out of a `Display Name <addr@dom>` header value.
// Returns "" when the value is a bare address (no angle-bracketed address).
function displayNameIn(value: string): string {
  const v = value.trim();
  if (!v.includes("<")) return ""; // bare address — no separate display name
  const name = v.slice(0, v.indexOf("<")).trim().replace(/^["']|["']$/g, "").trim();
  return name;
}

// Parse the header block of an email. Accepts raw source, an .eml's text, or a
// forwarded/pasted blob. Unfolds RFC822 continuation lines (a header value
// continued on the next line that starts with whitespace), then reads the
// headers we care about. The first occurrence of each header wins.
export function parseEmailHeaders(raw: string): EmailHeaders {
  // Header section ends at the first blank line; if there's no blank line treat
  // the whole input as headers (covers header-only pastes).
  const headerBlock = raw.split(/\r?\n\r?\n/, 1)[0] ?? "";

  // Unfold: join continuation lines (those beginning with space/tab) onto the
  // previous line.
  const unfolded = headerBlock.replace(/\r?\n[ \t]+/g, " ");
  const lines = unfolded.split(/\r?\n/);

  const get = (name: string): string => {
    const re = new RegExp(`^${name}\\s*:\\s*(.*)$`, "i");
    for (const line of lines) {
      const m = line.match(re);
      if (m) return m[1].trim();
    }
    return "";
  };

  const fromRaw = get("from");
  const replyToRaw = get("reply-to");
  const returnPathRaw = get("return-path");
  const senderRaw = get("sender");

  return {
    fromDisplay: displayNameIn(fromRaw),
    fromAddress: addressIn(fromRaw),
    replyTo: addressIn(replyToRaw),
    returnPath: addressIn(returnPathRaw),
    sender: addressIn(senderRaw),
  };
}

export interface IdentityAnalysis {
  flags: string[];
  score: number;
}

// Analyse parsed identities for spoofing signals. Conservative: only flags when
// both sides of a comparison are present, so missing headers never raise a
// false positive.
export function analyseEmailIdentities(h: Partial<EmailHeaders>): IdentityAnalysis {
  const flags: string[] = [];
  let score = 0;

  const fromAddress = (h.fromAddress ?? "").toLowerCase();
  const fromDisplay = (h.fromDisplay ?? "").toLowerCase();
  const replyTo = (h.replyTo ?? "").toLowerCase();
  const returnPath = (h.returnPath ?? "").toLowerCase();

  const fromDom = domainOf(fromAddress);
  const replyDom = domainOf(replyTo);
  const returnDom = domainOf(returnPath);

  // 1. From ≠ Reply-To (different domains) — replies route elsewhere.
  if (fromDom && replyDom && fromDom !== replyDom) {
    flags.push(
      `Reply-To address (${replyTo}) goes to a different domain than the sender (${fromAddress}) — replies would secretly go to the scammer`,
    );
    score += 40;
  }

  // 2. Display-name masking — the visible name names a brand the actual sending
  //    domain doesn't belong to.
  if (fromDisplay && fromDom) {
    const brand = IMPERSONATED_BRANDS.find((b) => fromDisplay.includes(b));
    const govLike = fromDom.endsWith(".gov.au") || fromDom.endsWith(".com.au");
    if (brand && !fromDom.includes(brand.replace(/\s+/g, "")) && !govLike) {
      flags.push(
        `Sender name claims to be "${h.fromDisplay}" but the real address is ${fromAddress} — the display name is masking the true sender`,
      );
      score += 40;
    }
    // Display name itself contains an email address whose domain differs from
    // the real one (e.g. "service@paypal.com" <noreply@evil.tk>).
    const nameAddr = fromDisplay.match(/[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}/);
    if (nameAddr && domainOf(nameAddr[0]) !== fromDom) {
      flags.push(
        `Display name shows an address (${nameAddr[0]}) that doesn't match the real sender (${fromAddress})`,
      );
      score += 35;
    }
  }

  // 3. Return-Path / envelope sender ≠ From — moderate signal.
  if (fromDom && returnDom && fromDom !== returnDom) {
    flags.push(
      `Return-Path (${returnPath}) doesn't match the From domain — common in spoofed mail`,
    );
    score += 20;
  }

  return { flags, score };
}

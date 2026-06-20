// Single entry point for analysing a pasted/forwarded email's source.
//
// Three surfaces analyse email source — the Check page, the report form, and the
// inbound forward-to-us webhook. They must agree, so the chain lives here once:
//
//   unwrapForwarded → parseEmailHeaders → analyseEmailIdentities → analyseEmailTracking
//
// Every caller goes through analyseEmailSource so they can't drift (e.g. one
// forgetting to unwrap a forwarded email and analysing the forwarder instead of
// the original scammer). Pure string work — no I/O, no fetching of any URL.

import { parseEmailHeaders, analyseEmailIdentities, EmailHeaders } from "@/lib/emailHeaders";
import { analyseEmailTracking, EmailTrackingReport } from "@/lib/emailTracking";
import { unwrapForwarded, ForwardSource } from "@/lib/forwardedEmail";

export interface EmailSourceAnalysis {
  // How the original was located inside the (possibly forwarded) input.
  source: ForwardSource;
  // The unwrapped original message source (headers + body), fed to every step.
  original: string;
  // Parsed headers of the original (From/Reply-To/auth/…).
  headers: EmailHeaders;
  // Sender-spoofing flags (display-name masking, From≠Reply-To, auth fails, …).
  // Empty when there's no From address to analyse.
  identityFlags: string[];
  // Broad tracking surface (pixels, click redirects, CSS beacons, read receipts…).
  tracking: EmailTrackingReport;
}

export function analyseEmailSource(raw: string): EmailSourceAnalysis {
  const { raw: original, source } = unwrapForwarded(raw);
  const headers = parseEmailHeaders(original);
  const identityFlags = headers.fromAddress ? analyseEmailIdentities(headers).flags : [];
  const tracking = analyseEmailTracking(original);
  return { source, original, headers, identityFlags, tracking };
}

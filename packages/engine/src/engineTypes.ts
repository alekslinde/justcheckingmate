// Shared value types for the detection engine.
//
// These live apart from scamDetector.ts to break a dependency cycle: the
// scorer imports detectType to classify input, and detectType needs ScamType
// to describe its return. With both in scamDetector.ts the two modules import
// each other, which bundlers tolerate only by accident of evaluation order and
// which blocks extracting the engine into its own package.
//
// Types only — no logic, no imports. Anything with behaviour belongs in the
// module that owns it.

import type { PhoneIntel } from "./phoneIntel";
import type { RegionCoverage } from "./regions";

/** What kind of thing the user submitted. */
export type ScamType = "url" | "sms" | "email" | "phone" | "qr" | "custom";

/** A single analysed identifier — one verdict for one URL, number or message. */
export interface CheckResult {
  verdict: "safe" | "suspicious" | "likely_scam" | "unknown";
  score: number; // 0-100, higher = more scammy
  flags: string[];
  details: string;
  category?: string;
  phoneIntel?: PhoneIntel;
  expandedUrl?: string; // defanged real destination when the input was a shortened URL
  // Detection coverage of the region pack that produced this result. Present on
  // every result; consumers must not render a confident "safe" when this is
  // "partial" or "none" — a low score there can mean "no rules matched" rather
  // than "nothing wrong". See downgradeForCoverage.
  coverage?: RegionCoverage;
}

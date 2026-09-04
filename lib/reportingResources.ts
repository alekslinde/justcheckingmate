// Region-aware "where to report this" advice for the UI.
//
// The engine packs own the data (RegionDefinition.reportingUrl); this module
// owns the presentation rule: how a body name + optional URL becomes the link
// (or plain text) the verdict steps and report-success footer render.
//
// The label rule: bodies that already name their host ("the FTC
// (reportfraud.ftc.gov)") link as-is; bodies that don't ("Scamwatch") gain
// the host in parens, matching the long-standing "Name (host)" pattern. A
// pack with no URL (rest-of-world) renders its generic body as plain text
// rather than linking nowhere.

import { resolveRegionPack, type RegionInput } from "@veriguard/engine/regions";

export interface ReportingLink {
  /** Pack's reporting body, e.g. "Scamwatch". */
  body: string;
  /** Report-a-scam URL, or null where the pack carries none. */
  url: string | null;
  /** What to render: the body, plus the host where the body doesn't name it. */
  label: string;
}

export function reportingFor(region?: RegionInput): ReportingLink {
  const pack = resolveRegionPack(region);
  const url = pack.reportingUrl ?? null;
  let label = pack.reportingBody;
  if (url) {
    // Display host without a www prefix, matching the long-standing "Name
    // (host)" pattern ("Scamwatch (scamwatch.gov.au)"). The href keeps the
    // full URL.
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (!pack.reportingBody.includes(host)) label = `${pack.reportingBody} (${host})`;
  }
  return { body: pack.reportingBody, url, label };
}

/** Whether this region has a victim-support helpline we can name. Only AU:
 * IDCARE on 1800 595 160. Other regions get the reporting link alone —
 * inventing helplines would be worse than omitting one. */
export function victimHelpline(region?: RegionInput): { number: string; label: string } | null {
  const pack = resolveRegionPack(region);
  if (pack.code !== "AU") return null;
  return { number: "1800595160", label: "IDCARE on 1800 595 160" };
}

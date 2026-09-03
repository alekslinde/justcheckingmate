import { describe, it, expect } from "vitest";
import { reportingFor, victimHelpline } from "@/lib/reportingResources";

describe("reportingFor", () => {
  it("links AU to Scamwatch with the host appended", () => {
    const r = reportingFor("AU");
    expect(r.body).toBe("Scamwatch");
    expect(r.url).toBe("https://www.scamwatch.gov.au");
    expect(r.label).toBe("Scamwatch (scamwatch.gov.au)");
  });

  it("leaves bodies that already name their host untouched", () => {
    // GB and US packs embed the URL in the body; appending it again would
    // read "Report Fraud (reportfraud.police.uk) (reportfraud.police.uk)".
    expect(reportingFor("GB").label).toBe("Report Fraud (reportfraud.police.uk)");
    expect(reportingFor("US").label).toBe("the FTC (reportfraud.ftc.gov)");
  });

  it("links every covered region to an https URL, none to a shortener", () => {
    for (const code of ["AU", "GB", "US", "NZ", "CA", "IE"] as const) {
      const r = reportingFor(code);
      expect(r.url, code).toMatch(/^https:\/\//);
      expect(r.url, code).not.toMatch(/bit\.ly|tinyurl|t\.co\b/);
    }
  });

  it("renders rest-of-world as plain text with no URL", () => {
    const r = reportingFor("ZZ");
    expect(r.url).toBeNull();
    expect(r.label).toBe(r.body);
  });

  it("falls back to AU for anything unrecognised, matching pack resolution", () => {
    expect(reportingFor("XX")).toEqual(reportingFor("AU"));
    expect(reportingFor(undefined)).toEqual(reportingFor("AU"));
  });
});

describe("victimHelpline", () => {
  it("names IDCARE for AU only", () => {
    expect(victimHelpline("AU")).toEqual({ number: "1800595160", label: "IDCARE on 1800 595 160" });
    for (const code of ["GB", "US", "NZ", "CA", "IE", "ZZ"] as const) {
      expect(victimHelpline(code), code).toBeNull();
    }
  });
});

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { translate, type LangMode, type MessageKey } from "@/lib/i18n";

// Feedback during a check, and the one place there was none.
//
// The region re-check fires from the coverage notice on the *result* step,
// while every piece of progress feedback the flow owns — the pipeline panel,
// the submit spinner, the checkError block — renders on the *input* step. So it
// used to run with nothing on screen, swap the results underneath the reader,
// and on failure set a checkError that nothing rendered: the previous region's
// verdict stayed up as though the correction had been applied. The rate limit
// (30/window) makes that reachable rather than theoretical, because stepping
// through regions to find your own is exactly what spends it.
//
// The property worth protecting is not "a spinner exists". It is that a
// re-check can never fail silently — that the failure is reported next to the
// control that caused it, and says the verdict on screen is still the old one.

const FLOW = readFileSync(path.join(process.cwd(), "components/CheckFlow.tsx"), "utf8");
const NOTICE = readFileSync(path.join(process.cwd(), "components/CoverageNotice.tsx"), "utf8");
const ROUTE = readFileSync(path.join(process.cwd(), "app/api/check/route.ts"), "utf8");
const NORMAL: LangMode = { locale: "en", tone: "normal" };
const REGIONAL: LangMode = { locale: "en", tone: "regional" };

const say = (mode: LangMode, k: MessageKey, vars?: Record<string, string | number>) =>
  translate(mode, k, vars);

// runCheck's own body. Slicing from the file's first `catch` finds
// handleImageUpload's, which is a different function with a different contract.
const RUN_CHECK = FLOW.slice(
  FLOW.indexOf("async function runCheck"),
  FLOW.indexOf("async function shareResults"),
);
const RUN_CATCH = RUN_CHECK.slice(RUN_CHECK.indexOf("} catch (err) {"), RUN_CHECK.indexOf("} finally {"));

describe("region re-check — never fails silently", () => {
  it("routes the re-check's error to the notice, not to the input step's block", () => {
    // The distinguishing branch: `isRecheck` picks which surface reports the
    // failure. Without it both paths land in setCheckError, which is the bug.
    expect(FLOW).toMatch(/const isRecheck = !!overrideRegion/);
    expect(RUN_CATCH).toMatch(/if \(isRecheck\)/);
    expect(RUN_CATCH).toMatch(/setRecheck\(\{\s*state: "error"/);
    expect(RUN_CATCH).toMatch(/setCheckError\(/);
  });

  it("hands the notice the state it needs to report both outcomes", () => {
    expect(FLOW).toMatch(/recheck=\{recheck\}/);
    expect(NOTICE).toMatch(/state: "loading"/);
    expect(NOTICE).toMatch(/state: "error"/);
  });

  it("announces the wait and the failure to assistive tech", () => {
    // The verdict below changes underneath the reader on success and
    // conspicuously does not on failure; neither is discoverable by sighted
    // scanning alone, so both are announced.
    expect(NOTICE).toMatch(/aria-live="polite"/);
    expect(NOTICE).toMatch(/role="alert"/);
  });

  it("says the verdict on screen is still the old one", () => {
    // The sentence that stops silence reading as success. Both re-check error
    // strings have to carry it, in both tones.
    for (const mode of [NORMAL, REGIONAL]) {
      for (const k of ["verdict.coverage.recheckError", "verdict.coverage.recheckRateLimited"] as const) {
        expect(say(mode, k), `${k} must say the old verdict still stands`).toMatch(
          /still (the one from before|the old verdict)/i,
        );
      }
    }
  });

  it("blocks a second re-check while one is in flight", () => {
    // Two in-flight re-checks race, and the loser's results would land last.
    expect(NOTICE).toMatch(/disabled=\{busy\}/);
  });

  it("does not tear down the input step's panel from a re-check", () => {
    // A re-check never raises the pipeline panel, and clearing it here would
    // take down a panel the re-check did not put up.
    expect(RUN_CHECK.slice(RUN_CHECK.indexOf("} finally {"))).toMatch(/if \(!isRecheck\) \{/);
  });
});

describe("rate limit — the one failure with different advice", () => {
  it("is machine-readable on the wire, not matched on prose", () => {
    // Matching the message text would break on a reword or a translation.
    expect(ROUTE).toMatch(/code: "rate_limited"/);
    expect(FLOW).toMatch(/body\.code === "rate_limited"/);
  });

  it("tells the reader to wait rather than to retry", () => {
    // "Try again" against a rate limit walks them into the same wall. Every
    // rate-limit string must ask for time; none of the generic ones do.
    const waits = /minute|give it|steady on/i;
    for (const mode of [NORMAL, REGIONAL]) {
      expect(say(mode, "check.rateLimited")).toMatch(waits);
      expect(say(mode, "verdict.coverage.recheckRateLimited")).toMatch(waits);
    }
  });

  it("does not file a bug report for a working rate limiter", () => {
    // reportFailure is for faults. A 429 is the service behaving as designed,
    // and reporting it would bury real failures in noise.
    expect(RUN_CATCH).toMatch(/if \(!limited\) reportFailure\("check", err\)/);
  });
});

describe("image path — reading is not checking", () => {
  it("keeps the handover on screen past the closing tick", () => {
    // The 900ms "Checked" frame reports the *read* and then vanishes. The
    // banner is separate state so it survives to be acted on.
    expect(FLOW).toMatch(/const \[imageRead, setImageRead\] = useState<"qr" \| "ocr" \| null>/);
    expect(FLOW).toMatch(/setImageRead\("qr"\)/);
    expect(FLOW).toMatch(/setImageRead\("ocr"\)/);
  });

  it("retires the handover once the question is settled", () => {
    // Editing the text or running the check both answer it; a banner that
    // outlived either would be telling the reader to do what they just did.
    expect(FLOW).toMatch(/setContent\(e\.target\.value\); setImageRead\(null\)/);
    expect(RUN_CHECK).toMatch(/setImageRead\(null\)/);
  });

  it("asks for the check in words, in both tones", () => {
    for (const mode of [NORMAL, REGIONAL]) {
      for (const k of ["check.ocr.readTitle", "check.qr.readTitle"] as const) {
        expect(say(mode, k), `${k} must name the step left to take`).toMatch(/check it/i);
      }
    }
  });

  it("warns that a decoded QR is an address, not a destination", () => {
    // The one thing a reader might do with a decoded QR that they must not.
    for (const mode of [NORMAL, REGIONAL]) {
      expect(say(mode, "check.qr.readBody")).toMatch(/opened|near it/i);
    }
  });

  it("leaves the button live through the confirmation frame", () => {
    // It was disabled on pipelineDone, so it went inert for 900ms at exactly
    // the moment the reader's hand arrived at it.
    expect(FLOW).toMatch(/disabled=\{busy \|\| !content\.trim\(\)\}/);
  });
});

describe("one narrator per wait", () => {
  it("drops the button's own spinner and label while the panel is up", () => {
    // Two spinners for one wait, the vaguer of them on the louder element. The
    // panel names the actual stage, so the button stops competing.
    expect(FLOW).not.toMatch(/check\.analysing/);
    const btn = FLOW.slice(FLOW.indexOf("onClick={() => runCheck()}"));
    expect(btn.slice(0, 1600)).not.toMatch(/animate-spin/);
  });

  it("retires the string rather than leaving it to drift", () => {
    // An unused key is a future contributor's trap.
    expect(translate(NORMAL, "check.analysing" as MessageKey)).toBe("check.analysing");
  });
});

describe("a dead end is not an answer", () => {
  it("says what was missing and what to try instead", () => {
    // "Nothing to analyse." reads as a rejection and gives nowhere to go. It
    // fires when someone pasted prose with no identifier in it.
    for (const mode of [NORMAL, REGIONAL]) {
      const s = say(mode, "check.nothing");
      expect(s, "must name what we looked for").toMatch(/link|phone number|email address/i);
      expect(s, "must offer a next move").toMatch(/paste/i);
      expect(s.length).toBeGreaterThan(60);
    }
  });
});

describe("coverage notice — our limits, in the colour reserved for them", () => {
  it("uses the caution token rather than a third hue", () => {
    // VerdictBadge's rule: red is the verdict's, amber is for statements about
    // our own coverage. This is that statement. Sky-blue appeared nowhere else.
    expect(NOTICE).toMatch(/var\(--caution\)/);
    expect(NOTICE).not.toMatch(/sky-\d/);
  });

  it("carries no emoji, for the reason the verdict header carries none", () => {
    expect(NOTICE).not.toMatch(/🌏/);
  });

  it("sits below the verdict headline it qualifies", () => {
    // As the first thing on the page it was the loudest element on screen — a
    // caveat where the answer should be. It belongs in the supporting band.
    const supporting = FLOW.indexOf("supporting={");
    const notice = FLOW.indexOf("<CoverageNotice");
    expect(supporting).toBeGreaterThan(-1);
    expect(notice).toBeGreaterThan(supporting);
  });
});

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { translate, type LangMode, type MessageKey } from "@/lib/i18n";

// The check panel narrates what the check is doing while it runs. Its value is
// entirely in being true: a step list that pads a fast check, or names work the
// code does not do, is worse than no list — it trains people to trust a
// progress display that means nothing.
//
// Two properties are worth holding onto, and neither is visible by reading the
// component in isolation:
//
//   1. Every stage the panel can show maps onto a branch the code really takes,
//      and none of them is advanced by a timer.
//   2. The privacy line follows the path the run actually took. The image path
//      can fall through to the server, and a closing frame that still claimed
//      "on your device" would be a false statement about where a user's
//      screenshot went — the one claim this product cannot get wrong.
//
// Property 2 is a regression test: the closing frame derived the OCR path from
// the live stage, which is cleared by the time that frame renders, so a
// server-OCR run confirmed itself as having stayed on the device.

const SRC = readFileSync(path.join(process.cwd(), "components/CheckFlow.tsx"), "utf8");
const NORMAL: LangMode = { locale: "en", tone: "normal" };

describe("check pipeline stages", () => {
  it("declares exactly the paste stages the check performs", () => {
    const m = SRC.match(/const PASTE_STAGES = \[(.*?)\] as const/s);
    expect(m).not.toBeNull();
    expect(m![1].match(/"[a-z-]+"/g)).toEqual(['"reading"', '"extracting"', '"scoring"']);
  });

  it("declares exactly the image stages the upload performs", () => {
    const m = SRC.match(/const IMAGE_STAGES = \[(.*?)\] as const/s);
    expect(m).not.toBeNull();
    expect(m![1].match(/"[a-z-]+"/g)).toEqual(['"qr"', '"ocr-local"', '"ocr-server"']);
  });

  it("gives every stage a real label in the message bundle", () => {
    const keys = [...SRC.matchAll(/"(check\.stage\.[A-Za-z]+)"/g)].map((m) => m[1]);
    expect(keys.length).toBeGreaterThan(0);
    for (const k of new Set(keys)) {
      const s = translate(NORMAL, k as MessageKey);
      expect(s, `${k} should resolve to copy`).toBeTruthy();
      expect(s, `${k} should not fall through to its own key`).not.toBe(k);
    }
  });

  it("sets each paste stage next to the work it names, not on a timer", () => {
    // The stage markers must sit alongside the calls they describe. A stage
    // advanced by setTimeout is a simulation of work, which is the exact thing
    // this panel must not be.
    const run = SRC.slice(SRC.indexOf("async function runCheck"));
    const body = run.slice(0, run.indexOf("\n  }\n"));
    expect(body).toMatch(/setStage\("extracting"\)[\s\S]{0,200}extractIdentifiers\(/);
    expect(body).toMatch(/setStage\("scoring"\)[\s\S]{0,120}fetch\("\/api\/check"/);
    expect(body).not.toMatch(/setTimeout/);
  });

  it("never pads the run: the only yield between stages is a single frame", () => {
    expect(SRC).toMatch(/function nextFrame\(\)[\s\S]{0,220}requestAnimationFrame/);
    // No sleep helper, and no timer-driven stage advance anywhere in the flow.
    expect(SRC).not.toMatch(/setStage\([^)]*\)[^;]*;\s*await new Promise/);
  });
});

describe("check pipeline privacy claim", () => {
  it("remembers which OCR path ran rather than reading a cleared stage", () => {
    // The regression: `stage` is null during the closing frame, so anything
    // deriving the path from it silently reports the local (reassuring) branch.
    expect(SRC).toMatch(/setOcrPath\("server"\)/);
    expect(SRC).toMatch(/onDevice=\{[^}]*ocrPath === "local"[^}]*\}/);
    expect(SRC).not.toMatch(/onDevice=\{stage !== "ocr-server"\}/);
  });

  it("states plainly that server OCR leaves the device", () => {
    const uploaded = translate(NORMAL, "check.stage.uploaded");
    expect(uploaded).toMatch(/server/i);
    expect(uploaded).not.toMatch(/your device/i);
  });

  it("claims nothing was uploaded only where nothing was", () => {
    expect(translate(NORMAL, "check.stage.onDeviceLead")).toMatch(/your device/i);
    expect(translate(NORMAL, "check.stage.finished")).toMatch(/your device/i);
    expect(translate(NORMAL, "check.stage.finishedNote")).toMatch(/nothing was uploaded/i);
  });
});

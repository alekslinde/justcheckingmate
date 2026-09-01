import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { translate, type LangMode, type MessageKey } from "@/lib/i18n";
import { privacyClaimFor } from "@/components/CheckFlow";

// The check panel narrates what the check is doing while it runs. Its value is
// entirely in being true: a step list that pads a fast check, or names work the
// code does not do, is worse than no list — it trains people to trust a
// progress display that means nothing.
//
// The claim that matters most is where the content *is*. Both pipelines cross
// that line partway through — the paste path scores on the server, the image
// path falls through to server OCR when the local reader can't run — so a
// footer derived from anything but the current phase will eventually promise
// "nothing has been uploaded" during an upload. That has happened twice:
//
//   · the image path's closing frame read a `stage` that was already cleared,
//     so a server-OCR run confirmed itself as having stayed on the device;
//   · the paste path passed an `onDevice` boolean that was always true, so the
//     footer claimed nothing had been uploaded during the very POST that
//     uploads the pasted text.
//
// Both were shipped behind tests that asserted on this file's source text,
// which is why the claim is now derived by an exported function and tested
// through its behaviour instead.

const SRC = readFileSync(path.join(process.cwd(), "components/CheckFlow.tsx"), "utf8");
const NORMAL: LangMode = { locale: "en", tone: "normal" };

/** The copy a claim actually renders, so assertions read as what a user sees. */
const CLAIM_COPY: Record<string, MessageKey[]> = {
  "on-device":      ["check.stage.onDeviceLead", "check.stage.onDeviceNote"],
  "on-device-done": ["check.stage.finished", "check.stage.finishedNote"],
  "sending":        ["check.stage.sending", "check.stage.sendingNote"],
  "sent":           ["check.stage.scored", "check.stage.scoredNote"],
  "server-ocr":     ["check.stage.uploaded"],
};

const copyFor = (claim: string) => CLAIM_COPY[claim].map((k) => translate(NORMAL, k)).join(" ");

/** Phrases that assert the content never left the machine. */
const NOTHING_LEFT = /nothing (has been|was) uploaded|on your device/i;

describe("privacy claim — paste path", () => {
  const paste = (stage: Parameters<typeof privacyClaimFor>[0]["stage"], done = false) =>
    privacyClaimFor({ pipeline: "paste", stage, ocrPath: "local", done });

  it("claims the local pass is local, because it is", () => {
    expect(paste("reading")).toBe("on-device");
    expect(copyFor(paste("reading"))).toMatch(/your device/i);
  });

  it("never claims nothing was uploaded once scoring has started", () => {
    // The regression: this is the phase that POSTs the pasted content.
    expect(paste("scoring")).toBe("sending");
    expect(copyFor(paste("scoring"))).not.toMatch(NOTHING_LEFT);
    expect(copyFor(paste("scoring"))).toMatch(/server/i);
  });

  it("never claims nothing was uploaded in the closing frame either", () => {
    // `stage` is null once the run finishes — the shape that fooled the image
    // path's first fix. After a POST, no later frame may deny it.
    expect(paste(null, true)).toBe("sent");
    expect(copyFor(paste(null, true))).not.toMatch(NOTHING_LEFT);
  });

  it("makes no on-device claim in any phase that has sent the content", () => {
    for (const [stage, done] of [["scoring", false], [null, true], [null, false]] as const) {
      expect(copyFor(paste(stage, done)), `stage=${stage} done=${done}`).not.toMatch(NOTHING_LEFT);
    }
  });
});

describe("privacy claim — image path", () => {
  const img = (ocrPath: "local" | "server", stage: Parameters<typeof privacyClaimFor>[0]["stage"], done = false) =>
    privacyClaimFor({ pipeline: "image", stage, ocrPath, done });

  it("claims the device only while the read really is on the device", () => {
    expect(img("local", "ocr-local")).toBe("on-device");
    expect(img("local", null, true)).toBe("on-device-done");
    expect(copyFor(img("local", null, true))).toMatch(/nothing was uploaded/i);
  });

  it("keeps saying the image went to the server in the closing frame", () => {
    // The original regression: `stage` is null here, so deriving the path from
    // it reported the local branch and the frame claimed the image never left.
    expect(img("server", null, true)).toBe("server-ocr");
    expect(copyFor(img("server", null, true))).not.toMatch(NOTHING_LEFT);
    expect(copyFor(img("server", null, true))).toMatch(/server/i);
  });

  it("makes no on-device claim in any server-OCR phase", () => {
    for (const [stage, done] of [["ocr-server", false], [null, true], [null, false]] as const) {
      expect(copyFor(img("server", stage, done)), `stage=${stage} done=${done}`).not.toMatch(NOTHING_LEFT);
    }
  });
});

describe("the card's standing privacy badge", () => {
  // The badge sits at the top of the same card whose footer now says the
  // content was sent to be scored. It read "Checked on your device", which the
  // paste path — every paste path — contradicts: scoring happens on the server.
  // The claim was invisible until the footer beneath it started telling the
  // truth, and a card that contradicts itself teaches people to read neither
  // line. What is true of every check is what the hero copy already says.
  it("does not claim checks happen on the device", () => {
    expect(translate(NORMAL, "check.onDevice")).not.toMatch(/on your device/i);
  });

  it("claims only what holds for every path", () => {
    const badge = translate(NORMAL, "check.onDevice");
    expect(badge).toMatch(/never/i);
    // The two promises the product actually keeps on every route.
    expect(translate(NORMAL, "home.subtitle")).toMatch(/isn't stored/i);
    expect(translate(NORMAL, "home.subtitle")).toMatch(/never open/i);
  });
});

describe("check pipeline stages", () => {
  it("declares exactly the paste stages the check performs", () => {
    const m = SRC.match(/const PASTE_STAGES = \[(.*?)\] as const/s);
    expect(m).not.toBeNull();
    // Two, not three: an earlier version split the local pass into "reading"
    // and "extracting" over a trim() and a discarded call. Rows must name work
    // whose output the reader goes on to see.
    expect(m![1].match(/"[a-z-]+"/g)).toEqual(['"reading"', '"scoring"']);
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
    const run = SRC.slice(SRC.indexOf("async function runCheck"));
    const body = run.slice(0, run.indexOf("\n  }\n"));
    // The local row must sit against work whose product the result displays.
    expect(body).toMatch(/setStage\("reading"\)[\s\S]{0,400}analyseEmailSource\(/);
    expect(body).toMatch(/setStage\("scoring"\)[\s\S]{0,200}fetch\("\/api\/check"/);
    expect(body).not.toMatch(/setTimeout/);
  });

  it("never pads the run: the only yield between stages is a single frame", () => {
    expect(SRC).toMatch(/function nextFrame\(\)[\s\S]{0,220}requestAnimationFrame/);
    expect(SRC).not.toMatch(/setStage\([^)]*\)[^;]*;\s*await new Promise/);
  });
});

describe("the panel never latches", () => {
  // `pipeline` gates both the panel and the textarea's visibility, so a path
  // that sets it without clearing it hides the primary input behind a stuck
  // panel with no route back but a reload — after precisely the failure that
  // makes someone want to retry.
  const bodyOf = (name: string) => {
    const fn = SRC.slice(SRC.indexOf(`async function ${name}`));
    return fn.slice(0, fn.indexOf("\n  }\n"));
  };

  it.each(["runCheck", "handleImageUpload"])("%s clears the panel on every exit", (name) => {
    const body = bodyOf(name);
    expect(body).toMatch(/setPipeline\("(paste|image)"\)/);
    const fin = body.slice(body.lastIndexOf("} finally {"));
    expect(fin, `${name}'s finally must release the panel`).toMatch(/setPipeline\(/);
  });

  it("runCheck releases the panel unconditionally, including after an error", () => {
    const fin = bodyOf("runCheck");
    const tail = fin.slice(fin.lastIndexOf("} finally {"));
    expect(tail).toMatch(/setPipeline\(null\)/);
    expect(tail).toMatch(/setPipelineDone\(false\)/);
  });

  it("confirms every successful image read, including a decoded QR", () => {
    // The QR branch returns early. It is the most on-device outcome there is,
    // so skipping the closing frame there inverted the reassurance: the server
    // path confirmed itself while the local one stayed silent.
    const qr = SRC.slice(SRC.indexOf("if (qrData)"));
    expect(qr.slice(0, qr.indexOf("return;"))).toMatch(/setPipelineDone\(true\)/);
  });
});

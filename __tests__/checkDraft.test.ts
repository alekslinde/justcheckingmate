import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { saveCheckDraft, readCheckDraft, clearCheckDraft } from "@/lib/checkDraft";

// The draft exists to carry a checked message across one browser Back, which in
// Next 16.3 reloads the document and destroys every piece of React state. It
// holds a scam message someone has pasted — which may quote their name, their
// address, or an amount they were about to pay — so its lifetime is part of the
// contract, not an implementation detail.

const KEY = "jcm:check-draft";

/** A minimal Storage, so these tests exercise the real module against real calls. */
function fakeStorage(): Storage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() { return map.size; },
  } as Storage & { map: Map<string, string> };
}

let store: ReturnType<typeof fakeStorage>;

beforeEach(() => {
  store = fakeStorage();
  vi.stubGlobal("window", { sessionStorage: store });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("check draft", () => {
  it("carries a checked message across a reload", () => {
    saveCheckDraft("Click https://ato-refund-verify.xyz now");
    expect(readCheckDraft()).toBe("Click https://ato-refund-verify.xyz now");
  });

  it("reads without consuming, so a re-run of the same render still sees it", () => {
    // React re-runs a lazy useState initialiser during hydration and again
    // under Strict Mode. A read that cleared left the second run with nothing
    // and the box came back empty — the exact bug this module fixes, one layer
    // down. Renders must be pure; only the effect may destroy state.
    saveCheckDraft("scam text");
    expect(readCheckDraft()).toBe("scam text");
    expect(readCheckDraft()).toBe("scam text");
    expect(readCheckDraft()).toBe("scam text");
  });

  it("is gone once cleared, and clearing twice is harmless", () => {
    saveCheckDraft("scam text");
    clearCheckDraft();
    expect(readCheckDraft()).toBe("");
    expect(() => clearCheckDraft()).not.toThrow();
  });

  it("stores nothing when there is nothing worth storing", () => {
    saveCheckDraft("   ");
    expect(store.map.has(KEY)).toBe(false);
  });

  it("replaces a previous draft rather than accumulating them", () => {
    saveCheckDraft("first message");
    saveCheckDraft("second message");
    expect(readCheckDraft()).toBe("second message");
    expect(store.map.size).toBe(1);
  });

  it("clears the stored draft when handed an empty one", () => {
    saveCheckDraft("scam text");
    saveCheckDraft("");
    expect(store.map.has(KEY)).toBe(false);
  });
});

describe("check draft — where it may live", () => {
  it("never touches localStorage, which would outlive the tab", () => {
    const local = fakeStorage();
    vi.stubGlobal("window", { sessionStorage: store, localStorage: local });
    saveCheckDraft("scam text");
    expect(local.map.size).toBe(0);
    expect(store.map.size).toBe(1);
  });

  it("survives storage being unavailable, rather than taking the check down", () => {
    // Safari's private mode and blocked site data both throw on access. Losing
    // a draft degrades to the old behaviour; throwing would break the check.
    const throwing = new Proxy({}, { get() { throw new Error("blocked"); } }) as Storage;
    vi.stubGlobal("window", { sessionStorage: throwing });
    expect(() => saveCheckDraft("scam text")).not.toThrow();
    expect(readCheckDraft()).toBe("");
    expect(() => clearCheckDraft()).not.toThrow();
  });

  it("reads empty on the server, so SSR and the first client render agree", () => {
    vi.stubGlobal("window", undefined);
    expect(readCheckDraft()).toBe("");
    expect(() => saveCheckDraft("scam text")).not.toThrow();
  });
});

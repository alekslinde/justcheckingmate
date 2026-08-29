"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { buildShareContent, parseSharePayload } from "@/lib/sharePrefill";
import CheckFlow from "./CheckFlow";

/**
 * Thin client wrapper for the share target: reads the shared payload out of the
 * query string and seeds the normal check flow with it.
 *
 * Kept separate from app/share/page.tsx so the page stays a server component
 * and only this (Suspense-wrapped) subtree opts into useSearchParams — the same
 * split ReportPrefillForm uses.
 *
 * The payload is untrusted input like any other: `buildShareContent` bounds its
 * length, and it is only ever placed in the check box, never executed, never
 * rendered as markup, and never sent anywhere the typed path would not send it.
 */
export default function ShareTargetSeed() {
  const params = useSearchParams();

  // Read once, on mount. The URL is rewritten immediately below, so re-reading
  // on a later render would return an empty payload and blank the box.
  const [seed] = useState(() => buildShareContent(parseSharePayload(params)));

  useEffect(() => {
    // Strip the shared content out of the address bar.
    //
    // Whatever someone shares here is, by definition, something they think may
    // be a scam — and it lands in a URL. Left alone that URL sits in browser
    // history, in the tab title, in any screenshot of the address bar, and in
    // whatever a shared/synced browser session carries to the person's other
    // devices. replaceState (not push) drops it without adding a history entry,
    // so Back still leaves the app rather than restoring the payload.
    //
    // The seed is already in React state by this point, so the box keeps its
    // content across the rewrite.
    window.history.replaceState(window.history.state, "", "/share");
  }, []);

  return (
    <>
      {seed.truncated && (
        <p
          role="status"
          className="text-sm text-amber-300/90 bg-amber-950/40 border border-amber-900/60 rounded-xl px-4 py-3"
        >
          That message was too long to check in full, so the end of it was cut.
          Check anything that&apos;s missing separately — scam links often sit at
          the bottom of a long email.
        </p>
      )}
      <CheckFlow initialContent={seed.content} surface="share" />
    </>
  );
}

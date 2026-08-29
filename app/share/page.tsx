import type { Metadata } from "next";
import { Suspense } from "react";
import ShareTargetSeed from "@/components/ShareTargetSeed";
import CheckFlow from "@/components/CheckFlow";

export const metadata: Metadata = {
  title: "Check a shared message — Just Checking, Mate",
  description: "Check a link, text or email you've shared from another app.",
  // A share-sheet landing target, not a content page. Keep it out of search
  // results and out of the sitemap, for the same reason /report is excluded.
  robots: { index: false, follow: true },
};

// The shared payload arrives in the query string, so this page reads
// searchParams and cannot be prerendered.
export const dynamic = "force-dynamic";

/**
 * Web Share Target landing page.
 *
 * Registered in app/manifest.ts as `share_target`, which puts this app in the
 * Android/iOS share sheet. Sharing a message from any app opens this page with
 * the content already in the check box.
 *
 * Deliberately the SAME CheckFlow as the home page rather than a share-specific
 * variant: a shared message is checked identically to a pasted one, so there is
 * one detection path, one set of behaviours and nothing extra to keep in sync.
 */
export default function SharePage() {
  return (
    <main className="max-w-2xl mx-auto px-4 py-8 space-y-5">
      <div>
        <h1 className="text-2xl font-black text-emerald-400 tracking-tight mb-1">
          Shared with Just Checking, Mate
        </h1>
        <p className="text-sm text-gray-400">
          Here&apos;s what you shared — have a look it&apos;s all there, then
          check it.
        </p>
      </div>

      {/* Fallback renders an empty check box rather than a spinner: if the
          payload is slow or missing, an empty box someone can paste into is
          more useful than a loading state. */}
      <Suspense fallback={<CheckFlow />}>
        <ShareTargetSeed />
      </Suspense>
    </main>
  );
}

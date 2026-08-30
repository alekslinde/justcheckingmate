import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import ReportPrefillForm from "@/components/ReportPrefillForm";

export const metadata: Metadata = {
  title: "Report a scam — Just Checking, Mate",
  description: "Lodge a scam in the public database so other people can look it up.",
  // A form target reached from a link we emailed, not a content page — keep it
  // out of search results (and out of the sitemap for the same reason).
  robots: { index: false, follow: true },
};

// Prefill arrives in the query string, so this reads searchParams and is
// therefore dynamic. See lib/reportPrefill.ts for what the params may carry and
// why the email body itself is never among them.
export default function ReportPage() {
  return (
    <main className="max-w-[1180px] mx-auto px-5 sm:px-8 py-8 sm:py-10 space-y-6">
      <div>
        <h1 className="text-2xl font-black text-emerald-400 tracking-tight mb-1">
          Report a scam
        </h1>
        <p className="text-sm text-gray-400">
          Lodge it in the public database so the next person who searches for it
          finds a warning. Check anything else first on the{" "}
          <Link href="/" className="text-emerald-400/90 hover:text-emerald-300 underline underline-offset-2">
            home page
          </Link>
          .
        </p>
      </div>

      {/* The container matches every other page, but the form does not fill it:
          a text input stretched to 1180px gives a 1100px-long line to type into,
          which is harder to use, not easier. Same reasoning as the home page,
          which constrains its check card to the wider track of a grid rather
          than spanning the full width. */}
      <div className="max-w-[760px] bg-[var(--ink-2)] border border-[var(--rule)] rounded-2xl p-6">
        <Suspense>
          <ReportPrefillForm />
        </Suspense>
      </div>
    </main>
  );
}

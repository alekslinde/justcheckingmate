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
    <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
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

      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
        <Suspense>
          <ReportPrefillForm />
        </Suspense>
      </div>
    </main>
  );
}

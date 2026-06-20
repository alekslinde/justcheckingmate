"use client";

import Link from "next/link";

// Branded error boundary. Deliberately keeps no dependencies on app providers
// (i18n, bug reporting) — if rendering broke, the less this page needs, the
// more reliably it shows.
export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="max-w-2xl mx-auto px-4 py-16 text-center space-y-4">
      <h1 className="text-2xl font-black text-emerald-400 tracking-tight">
        Something went wrong on our end
      </h1>
      <p className="text-gray-300 text-sm">
        Not your fault — give it another go. If it keeps happening, the
        &ldquo;Report a bug&rdquo; button helps us fix it.
      </p>
      <div className="flex flex-wrap justify-center gap-3 pt-2">
        <button
          onClick={reset}
          className="px-4 py-2.5 min-h-[44px] bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm rounded-lg transition-colors"
        >
          Try again
        </button>
        <Link
          href="/"
          className="px-4 py-2.5 min-h-[44px] flex items-center bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg transition-colors"
        >
          Back to the checker
        </Link>
      </div>
    </main>
  );
}

import Link from "next/link";

export default function NotFound() {
  return (
    <main className="max-w-2xl mx-auto px-4 py-16 text-center space-y-4">
      <div className="text-5xl" aria-hidden="true">🦘</div>
      <h1 className="text-2xl font-black text-emerald-400 tracking-tight">
        Page not found
      </h1>
      <p className="text-gray-300 text-sm">
        That page doesn&apos;t exist — but if a link or message sent you here, that itself
        might be worth checking.
      </p>
      <div className="flex flex-wrap justify-center gap-3 pt-2">
        <Link
          href="/"
          className="px-4 py-2.5 min-h-[44px] flex items-center bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm rounded-lg transition-colors"
        >
          Check a suspicious message
        </Link>
        <Link
          href="/submissions"
          className="px-4 py-2.5 min-h-[44px] flex items-center bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg transition-colors"
        >
          Browse reported scams
        </Link>
      </div>
    </main>
  );
}

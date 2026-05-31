import Link from "next/link";
import LangToggle from "./LangToggle";

// Shared top nav: logo · Learn · Reports · language toggle.
export default function SiteHeader() {
  return (
    <header className="border-b border-gray-800 bg-gray-900">
      <div className="max-w-2xl mx-auto px-4 h-12 flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-1.5 font-black text-emerald-400 tracking-tight">
          <span className="text-lg" aria-hidden="true">🦘</span>
          <span className="hidden sm:inline">Just Checking, Mate</span>
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/learn" className="text-gray-400 hover:text-emerald-400 transition-colors">Learn</Link>
          <Link href="/submissions" className="text-gray-400 hover:text-emerald-400 transition-colors">Reports</Link>
          <LangToggle />
        </nav>
      </div>
    </header>
  );
}

import Link from "next/link";
import LangToggle from "./LangToggle";

export default function SiteHeader() {
  return (
    <header className="border-b border-gray-800 bg-gray-900">
      <div className="max-w-2xl mx-auto px-4 flex items-center justify-between gap-4"
           style={{ minHeight: "52px" }}>
        <Link
          href="/"
          className="flex items-center gap-1.5 font-black text-emerald-400 tracking-tight py-3 text-sm"
        >
          <span>Just Checking, Mate</span>
        </Link>
        <nav className="flex items-center gap-1">
          {/* Min 44px tap target on each nav item */}
          <Link
            href="/learn"
            className="min-h-[44px] flex items-center px-3 text-sm text-gray-400 hover:text-emerald-400 transition-colors rounded-lg"
          >
            Learn
          </Link>
          <Link
            href="/submissions"
            className="min-h-[44px] flex items-center px-3 text-sm text-gray-400 hover:text-emerald-400 transition-colors rounded-lg"
          >
            Reports
          </Link>
          <LangToggle />
        </nav>
      </div>
    </header>
  );
}

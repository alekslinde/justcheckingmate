"use client";

import Link from "next/link";
import { useLang } from "@/lib/lang";
import LangToggle from "./LangToggle";

export default function SiteHeader() {
  const { t } = useLang();
  return (
    <header className="border-b border-gray-800 bg-gray-900">
      <div className="max-w-2xl mx-auto px-4 flex items-center justify-between gap-4"
           style={{ minHeight: "52px" }}>
        <Link
          href="/"
          className="flex items-center gap-1.5 font-black text-emerald-400 tracking-tight py-3 text-sm shrink-0 min-w-0"
        >
          {/* Single brand mark — the kangaroo lives here and nowhere else */}
          <span aria-hidden="true">🦘</span>
          {/* Abbreviate on very small screens so nav links aren't squeezed out */}
          <span className="hidden xs:inline">Just Checking, Mate</span>
          <span className="xs:hidden">JCM</span>
        </Link>
        <nav className="flex items-center gap-0.5 min-w-0">
          {/* Min 44px tap target on each nav item */}
          <Link
            href="/submissions"
            className="min-h-[44px] flex items-center px-2 sm:px-3 text-sm text-gray-400 hover:text-emerald-400 transition-colors rounded-lg"
          >
            {t("nav.reports")}
          </Link>
          <Link
            href="/learn"
            className="min-h-[44px] flex items-center px-2 sm:px-3 text-sm text-gray-400 hover:text-emerald-400 transition-colors rounded-lg"
          >
            {t("nav.learn")}
          </Link>
          <Link
            href="/about"
            className="min-h-[44px] flex items-center px-2 sm:px-3 text-sm text-gray-400 hover:text-emerald-400 transition-colors rounded-lg"
          >
            {t("nav.about")}
          </Link>
          <LangToggle />
        </nav>
      </div>
    </header>
  );
}

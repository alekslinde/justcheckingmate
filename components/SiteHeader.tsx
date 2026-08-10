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
          {/* Hidden on the narrowest screens: the header abbreviates the brand
              to "JCM" below `xs` precisely because space is tight, and a fifth
              item there would squeeze the rest. The calendar is still reachable
              on mobile via the home teaser and the Learn card. */}
          <Link
            href="/calendar"
            className="hidden sm:flex min-h-[44px] items-center px-2 sm:px-3 text-sm text-gray-400 hover:text-emerald-400 transition-colors rounded-lg"
          >
            {t("nav.calendar")}
          </Link>
          {/* One breakpoint stricter than the calendar. This is the sixth item
              and the header is already at its limit at `sm` — showing both there
              re-creates the squeeze the line above exists to avoid. Reachable on
              mobile via the home teaser, same as the calendar. */}
          <Link
            href="/radar"
            className="hidden md:flex min-h-[44px] items-center px-2 sm:px-3 text-sm text-gray-400 hover:text-emerald-400 transition-colors rounded-lg"
          >
            {t("nav.radar")}
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

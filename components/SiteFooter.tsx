"use client";

import Link from "next/link";
import { useLang } from "@/lib/lang";

export default function SiteFooter() {
  const { t } = useLang();
  return (
    <footer
      className="border-t border-[var(--rule)] bg-[var(--ink)] mt-auto"
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
    >
      <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-3 pb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-[var(--text-dim)] leading-relaxed">
        <span className="text-[var(--foreground)]">
          {t("footer.built")}{" "}
          <a
            href="https://alekslinde.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--clear)] font-semibold hover:underline underline-offset-2"
          >
            Aleks Linde<span className="sr-only"> ({t("a11y.newTab")})</span>
            <span aria-hidden="true"> ↗</span>
          </a>
        </span>
        <span aria-hidden="true" className="hidden sm:inline text-[var(--ink-3)]">
          ·
        </span>
        {/* The reach claim, stated honestly: universal checks everywhere, full
            rule packs only where the groundwork exists. */}
        <span className="hidden sm:inline text-[var(--faint)]">{t("footer.scope")}</span>
        <span aria-hidden="true" className="hidden sm:inline text-[var(--ink-3)]">
          ·
        </span>
        <Link
          href="/about"
          className="underline underline-offset-2 hover:text-[var(--foreground)] transition-colors"
        >
          {t("footer.about")}
        </Link>
      </div>
    </footer>
  );
}

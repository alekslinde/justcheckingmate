"use client";

import Link from "next/link";
import { useLang } from "@/lib/lang";

export default function SiteFooter() {
  const { t } = useLang();
  return (
    <footer
      className="border-t border-gray-700 bg-gray-950 mt-auto"
      style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
    >
      <div className="max-w-2xl mx-auto px-4 pt-6 pb-0 text-center text-sm text-gray-300 space-y-2">
        <p>
          {t("footer.built")}{" "}
          <span aria-hidden="true">🦘</span>{" "}
          {t("footer.by")}{" "}
          <a
            href="https://alekslinde.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-400 font-semibold underline underline-offset-2 hover:text-emerald-300"
          >
            Aleks Linde<span className="sr-only"> ({t("a11y.newTab")})</span><span aria-hidden="true"> ↗</span>
          </a>
          {" "}{t("footer.tagline")}
        </p>
        <p className="text-xs text-gray-500">
          <Link href="/about" className="underline underline-offset-2 hover:text-gray-300">
            {t("footer.about")}
          </Link>
        </p>
      </div>
    </footer>
  );
}

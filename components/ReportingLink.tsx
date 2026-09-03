"use client";

import { useLang } from "@/lib/lang";
import type { ReportingLink as ReportingLinkData } from "@/lib/reportingResources";

/**
 * A reporting-body reference: linked where the pack carries a URL, plain
 * text where it doesn't (rest-of-world). The new-tab note matches every
 * other external link in the app.
 */
export default function ReportingLink({ link }: { link: ReportingLinkData }) {
  const { t } = useLang();
  if (!link.url) return <>{link.label}</>;
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      className="text-[var(--clear)] underline underline-offset-2 hover:opacity-80"
    >
      {link.label}
      <span className="sr-only"> ({t("a11y.newTab")})</span>
      <span aria-hidden="true"> ↗</span>
    </a>
  );
}

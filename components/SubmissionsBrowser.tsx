"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PublicReport, SortOption } from "@/lib/reportStore";
import { timeAgo, truncate } from "@/lib/formatters";
import { useLang, MessageKey } from "@/lib/lang";
import SafeDisplay from "@/components/SafeDisplay";

function CopyId({ id }: { id: string }) {
  const { t } = useLang();
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(id).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }
  return (
    <button
      onClick={copy}
      className="flex items-center gap-1 text-xs text-gray-600 hover:text-gray-400 transition-colors font-mono py-1"
      title={t("subs.copyId")}
    >
      {copied ? `✓ ${t("subs.copied")}` : id}
    </button>
  );
}

type ViewMode = "grouped" | "individual";

const TYPE_OPTIONS: { value: string; labelKey: MessageKey; icon: string }[] = [
  { value: "all",    labelKey: "subs.type.all",    icon: "🔍" },
  { value: "url",    labelKey: "subs.type.url",    icon: "🔗" },
  { value: "sms",    labelKey: "subs.type.sms",    icon: "📱" },
  { value: "email",  labelKey: "subs.type.email",  icon: "📧" },
  { value: "phone",  labelKey: "subs.type.phone",  icon: "📞" },
  { value: "qr",     labelKey: "subs.type.qr",     icon: "📷" },
  { value: "custom", labelKey: "subs.type.custom", icon: "🤔" },
];

const PERIOD_OPTIONS: { value: string; labelKey: MessageKey }[] = [
  { value: "0",  labelKey: "subs.period.all"   },
  { value: "1",  labelKey: "subs.period.today" },
  { value: "7",  labelKey: "subs.period.week"  },
  { value: "30", labelKey: "subs.period.month" },
];

const SORT_OPTIONS: { value: SortOption; labelKey: MessageKey }[] = [
  { value: "desc",  labelKey: "subs.sort.newest" },
  { value: "asc",   labelKey: "subs.sort.oldest" },
  { value: "most",  labelKey: "subs.sort.most"   },
  { value: "least", labelKey: "subs.sort.least"  },
];

const PAGE_SIZE = 25;
const SORT_VALUES = ["desc", "asc", "most", "least"] as const;
const SEARCH_INPUT_ID = "subs-search";

function pageNumbers(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | "…")[] = [1];
  if (current > 3)          pages.push("…");
  for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p++) pages.push(p);
  if (current < total - 2)  pages.push("…");
  pages.push(total);
  return pages;
}

function SkeletonList() {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden" aria-hidden="true">
      <ul className="divide-y divide-gray-800">
        {[0, 1, 2, 3].map((i) => (
          <li key={i} className="px-5 py-4 space-y-3 animate-pulse">
            <div className="flex items-center justify-between">
              <div className="h-4 w-32 bg-gray-800 rounded" />
              <div className="h-3 w-16 bg-gray-800 rounded" />
            </div>
            <div className="h-4 w-3/4 bg-gray-800 rounded" />
            <div className="h-3 w-1/2 bg-gray-800 rounded" />
          </li>
        ))}
      </ul>
    </div>
  );
}

// All filter/search/page state is URL-driven: shareable, survives refresh, and
// browser Back/Forward steps through filter changes. Discrete filter changes
// push a history entry; live search typing replaces (so each keystroke doesn't
// pollute history).
export default function SubmissionsBrowser() {
  const { t } = useLang();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const typeRaw = params.get("type") ?? "all";
  const type = TYPE_OPTIONS.some((o) => o.value === typeRaw) ? typeRaw : "all";
  const sortRaw = params.get("sort") ?? "desc";
  const sort: SortOption = (SORT_VALUES as readonly string[]).includes(sortRaw) ? (sortRaw as SortOption) : "desc";
  const view: ViewMode = params.get("view") === "individual" ? "individual" : "grouped";
  const periodDays = ["0", "1", "7", "30"].includes(params.get("days") ?? "0") ? (params.get("days") ?? "0") : "0";
  const page = Math.max(1, parseInt(params.get("page") ?? "1", 10) || 1);
  const search = (params.get("q") ?? "").trim();

  const [reports, setReports] = useState<PublicReport[]>([]);
  const [total, setTotal] = useState(0);
  const [searchInput, setSearchInput] = useState(search);
  const searchRef = useRef<HTMLInputElement>(null);

  // Loading is derived: we're loading whenever the current filter signature
  // hasn't been fetched yet (no setState-in-effect needed to flip a flag).
  const filterSig = JSON.stringify([type, sort, view, periodDays, page, search]);
  const [settledSig, setSettledSig] = useState<string | null>(null);
  const loading = filterSig !== settledSig;

  // Keep the input in sync when q changes via navigation (Back/Forward, links)
  // — adjusted during render, and never clobbering what the user is actively
  // typing in the field.
  const [syncedSearch, setSyncedSearch] = useState(search);
  if (search !== syncedSearch) {
    setSyncedSearch(search);
    // Identified by id (not ref) — refs can't be read during render.
    if (typeof document === "undefined" || document.activeElement?.id !== SEARCH_INPUT_ID) {
      setSearchInput(search);
    }
  }

  // Defaults are omitted from the URL so the bare /submissions stays canonical.
  const DEFAULTS: Record<string, string> = { type: "all", sort: "desc", view: "grouped", days: "0", page: "1", q: "" };

  function update(changes: Record<string, string>, replace = false) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (!value || value === DEFAULTS[key]) next.delete(key);
      else next.set(key, value);
    }
    const qs = next.toString();
    const url = qs ? `${pathname}?${qs}` : pathname;
    if (replace) router.replace(url, { scroll: false });
    else router.push(url, { scroll: false });
  }

  // Debounce search input into the URL; reset to page 1 on a new term.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput.trim() !== search) update({ q: searchInput.trim(), page: "" }, true);
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput, search]);

  // Fetch whenever any URL-driven filter changes
  useEffect(() => {
    let cancelled = false;

    const offset = (page - 1) * PAGE_SIZE;
    const since  = periodDays !== "0"
      ? Date.now() - parseInt(periodDays, 10) * 24 * 60 * 60 * 1000
      : undefined;

    const fetchParams = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset), sort });
    if (view === "grouped") fetchParams.set("grouped", "true");
    if (type !== "all") fetchParams.set("type", type);
    if (since)          fetchParams.set("since", String(since));
    if (search)         fetchParams.set("search", search);

    const sig = JSON.stringify([type, sort, view, periodDays, page, search]);
    fetch(`/api/reports?${fetchParams}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setReports(data.reports ?? []);
        setTotal(data.total ?? 0);
        setSettledSig(sig);
      })
      .catch(() => { if (!cancelled) setSettledSig(sig); });

    return () => { cancelled = true; };
  }, [type, sort, view, periodDays, page, search]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function goTo(p: number) {
    update({ page: String(Math.max(1, Math.min(p, totalPages))) });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function clearSearch() { setSearchInput(""); searchRef.current?.focus(); }

  return (
    <main>
      {/* Header */}
      <div className="bg-gradient-to-b from-gray-900 to-gray-950 border-b border-gray-800">
        <div className="max-w-2xl mx-auto px-4 py-8">
          <div className="flex items-center gap-3">
            <span className="text-3xl" aria-hidden="true">📋</span>
            <div>
              <h1 className="text-2xl font-black text-emerald-400 tracking-tight">
                {t("subs.title")}
              </h1>
              <p className="text-sm text-gray-400">{t("subs.subtitle")}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">

        {/* Search */}
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" aria-hidden="true">🔍</span>
          <input
            ref={searchRef}
            id={SEARCH_INPUT_ID}
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={t("subs.search.placeholder")}
            aria-label={t("subs.search.label")}
            className="w-full bg-gray-900 border border-gray-700 rounded-xl pl-9 pr-11 py-2.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 [&::-webkit-search-cancel-button]:hidden"
          />
          {searchInput && (
            <button
              onClick={clearSearch}
              aria-label={t("subs.search.clear")}
              className="absolute right-1 top-1/2 -translate-y-1/2 min-w-[40px] min-h-[40px] flex items-center justify-center text-gray-500 hover:text-gray-300 transition-colors text-lg leading-none"
            >
              ×
            </button>
          )}
        </div>

        {/* Filter panel */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">

          {/* ── Top bar: view toggle + result count ─────────────────────────── */}
          <div className="flex items-center justify-between gap-3 px-4 pt-3 pb-2 border-b border-gray-800">
            <div className="flex rounded-lg overflow-hidden border border-gray-700 shrink-0 text-sm" role="group" aria-label={t("subs.view.label")}>
              <button
                onClick={() => update({ view: "grouped", page: "" })}
                aria-pressed={view === "grouped"}
                className={`px-3 py-1.5 min-h-[36px] font-medium transition-colors ${
                  view === "grouped"
                    ? "bg-emerald-600 text-white"
                    : "bg-transparent text-gray-400 hover:text-gray-200"
                }`}
              >
                {t("subs.view.grouped")}
              </button>
              <button
                onClick={() => update({ view: "individual", page: "" })}
                aria-pressed={view === "individual"}
                className={`px-3 py-1.5 min-h-[36px] font-medium transition-colors border-l border-gray-700 ${
                  view === "individual"
                    ? "bg-emerald-600 text-white"
                    : "bg-transparent text-gray-400 hover:text-gray-200"
                }`}
              >
                {t("subs.view.individual")}
              </button>
            </div>

            {/* Result count — or loading pulse placeholder */}
            <span
              aria-live="polite"
              className={`text-sm font-semibold tabular-nums shrink-0 transition-colors ${
                loading ? "text-gray-700" : "text-emerald-400"
              }`}
            >
              {loading
                ? "—"
                : total > 0
                  ? (view === "grouped"
                      ? t(total === 1 ? "subs.count.source" : "subs.count.sources", { n: total.toLocaleString() })
                      : t(total === 1 ? "subs.count.report" : "subs.count.reports", { n: total.toLocaleString() }))
                  : null}
            </span>
          </div>

          {/* ── Filter grid ─────────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-gray-800">

            {/* Type */}
            <div className="bg-gray-900 px-4 py-3 space-y-1">
              <label htmlFor="subs-filter-type" className="block text-[10px] font-semibold uppercase tracking-widest text-gray-500">
                {t("subs.type.label")}
              </label>
              <select
                id="subs-filter-type"
                value={type}
                onChange={(e) => update({ type: e.target.value, page: "" })}
                className="w-full bg-transparent text-sm text-gray-200 focus:outline-none cursor-pointer"
              >
                {TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.icon} {t(opt.labelKey)}</option>
                ))}
              </select>
            </div>

            {/* Period */}
            <div className="bg-gray-900 px-4 py-3 space-y-1">
              <label htmlFor="subs-filter-period" className="block text-[10px] font-semibold uppercase tracking-widest text-gray-500">
                {t("subs.period.label")}
              </label>
              <select
                id="subs-filter-period"
                value={periodDays}
                onChange={(e) => update({ days: e.target.value, page: "" })}
                className="w-full bg-transparent text-sm text-gray-200 focus:outline-none cursor-pointer"
              >
                {PERIOD_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{t(opt.labelKey)}</option>
                ))}
              </select>
            </div>

            {/* Sort */}
            <div className="bg-gray-900 px-4 py-3 space-y-1">
              <label htmlFor="subs-filter-sort" className="block text-[10px] font-semibold uppercase tracking-widest text-gray-500">
                {t("subs.sort.label")}
              </label>
              <select
                id="subs-filter-sort"
                value={sort}
                onChange={(e) => update({ sort: e.target.value, page: "" })}
                className="w-full bg-transparent text-sm text-gray-200 focus:outline-none cursor-pointer"
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{t(opt.labelKey)}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Results */}
        {loading && reports.length === 0 ? (
          <>
            <p role="status" className="sr-only">{t("subs.loading")}</p>
            <SkeletonList />
          </>
        ) : reports.length === 0 ? (
          <div className="text-center py-16 space-y-2">
            <div className="text-4xl" aria-hidden="true">🦘</div>
            <p className="text-gray-300 font-medium">{t("subs.empty.title")}</p>
            <p className="text-sm text-gray-400">
              {search ? t("subs.empty.searchHint") : t("subs.empty.filterHint")}
            </p>
          </div>
        ) : (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
            <ul className="divide-y divide-gray-800">
              {reports.map((r) => {
                const opt = TYPE_OPTIONS.find((o) => o.value === r.type) ?? TYPE_OPTIONS[TYPE_OPTIONS.length - 1];
                const isGrouped = view === "grouped";

                // For email reports in individual view, the content is raw headers — show subject or a short excerpt instead.
                const displayContent = (() => {
                  if (r.type === "email" && !isGrouped) {
                    const subjectMatch = r.content.match(/^Subject:\s*(.+)$/im);
                    if (subjectMatch) return `Subject: ${subjectMatch[1].trim()}`;
                    return truncate(r.content.replace(/\S+:\s*.+\n?/g, "").trim() || r.content, 120);
                  }
                  return truncate(r.content, 200);
                })();

                // Primary identifier — what's most useful to show at a glance.
                const primaryId = r.scamUrl || r.scamPhone || r.scamEmail;

                return (
                  <li key={r.id} className="px-5 py-4 space-y-3">
                    {/* Header row: type + badge + timestamp */}
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <span aria-hidden="true" className="shrink-0 text-base">{opt.icon}</span>
                        <span className="text-sm font-semibold text-gray-300">{t(opt.labelKey)}</span>
                        {r.matchCount > 1 && (
                          <span className={`shrink-0 border text-xs font-semibold px-2 py-1 rounded-full ${
                            isGrouped
                              ? "bg-red-900/70 text-red-200 border-red-700"
                              : "bg-red-900/50 text-red-300 border-red-700/50"
                          }`}>
                            {isGrouped
                              ? t("subs.badge.reports", { n: r.matchCount })
                              : `${r.matchCount}×`}
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-gray-400 shrink-0">
                        {isGrouped ? `${t("subs.lastSeen")} ` : ""}{timeAgo(r.submittedAt)}
                      </span>
                    </div>

                    {/* Primary identifier */}
                    {primaryId && (
                      <SafeDisplay value={primaryId} className="font-mono text-sm text-amber-300 break-all" />
                    )}

                    {/* Secondary identifiers */}
                    {(r.scamReplyTo || r.emailAuth || (!primaryId && (r.scamUrl || r.scamPhone || r.scamEmail))) && (
                      <div className="grid gap-1.5 text-xs text-gray-400 pl-3 border-l border-gray-700">
                        {!primaryId && r.scamUrl && (
                          <span className="flex items-center gap-2">
                            <span aria-hidden="true" className="shrink-0">🔗</span>
                            <SafeDisplay value={r.scamUrl} className="font-mono text-amber-300 break-all" />
                          </span>
                        )}
                        {!primaryId && r.scamPhone && (
                          <span className="flex items-center gap-2">
                            <span aria-hidden="true" className="shrink-0">📞</span>
                            <SafeDisplay value={r.scamPhone} className="font-mono text-amber-300" />
                          </span>
                        )}
                        {!primaryId && r.scamEmail && (
                          <span className="flex items-center gap-2">
                            <span aria-hidden="true" className="shrink-0">📧</span>
                            <SafeDisplay value={r.scamEmail} className="font-mono text-amber-300 break-all" />
                          </span>
                        )}
                        {r.scamReplyTo && (
                          <span className="flex items-center gap-2">
                            <span aria-hidden="true" className="shrink-0">↩️</span>
                            <span className="text-gray-500 shrink-0">{t("subs.repliesTo")}</span>
                            <SafeDisplay value={r.scamReplyTo} className="font-mono text-amber-300 break-all" />
                          </span>
                        )}
                        {r.emailAuth && (
                          <span className="flex items-center gap-2">
                            <span aria-hidden="true" className="shrink-0">🔐</span>
                            <span className="text-gray-500 shrink-0">{t("subs.auth")}</span>
                            <SafeDisplay value={r.emailAuth} className="font-mono text-gray-400 break-all" />
                          </span>
                        )}
                      </div>
                    )}

                    {/* Coarse submission location — the only geographic data a
                        report carries (see /about). Never an IP, never a city. */}
                    {r.location && (
                      <p className="text-xs text-gray-500">
                        <span aria-hidden="true">📍 </span>
                        {t("subs.reportedFrom", { location: r.location })}
                      </p>
                    )}

                    {/* Content and description — individual view only */}
                    {!isGrouped && (
                      <div className="space-y-2">
                        {displayContent && (
                          <SafeDisplay
                            value={displayContent}
                            className="block text-xs text-gray-400 break-all"
                          />
                        )}
                        {r.description && (
                          <p className="text-xs text-gray-400 italic">{truncate(r.description, 200)}</p>
                        )}
                        <CopyId id={r.id} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <nav className="flex items-center justify-center gap-1" aria-label={t("subs.pagination.label")}>
            <button
              onClick={() => goTo(page - 1)}
              disabled={page === 1 || loading}
              className="px-4 py-2.5 min-h-[44px] text-sm rounded-lg bg-gray-900 border border-gray-700 text-gray-300 hover:border-gray-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              ← {t("subs.pagination.prev")}
            </button>

            {/* Page number buttons — hidden on small screens to prevent overflow */}
            <div className="hidden sm:contents">
              {pageNumbers(page, totalPages).map((p, i) =>
                p === "…" ? (
                  <span key={`ellipsis-${i}`} className="px-2 text-gray-500 text-sm select-none">…</span>
                ) : (
                  <button
                    key={p}
                    onClick={() => goTo(p)}
                    disabled={loading}
                    aria-current={p === page ? "page" : undefined}
                    className={`min-w-[44px] min-h-[44px] py-2.5 text-sm rounded-lg border transition-colors ${
                      p === page
                        ? "bg-emerald-500 border-emerald-400 text-gray-900 font-semibold"
                        : "bg-gray-900 border-gray-700 text-gray-300 hover:border-gray-500"
                    }`}
                  >
                    {p}
                  </button>
                )
              )}
            </div>

            {/* Compact page indicator for mobile */}
            <span className="sm:hidden text-sm text-gray-400 px-3 py-2.5 min-h-[44px] flex items-center" aria-live="polite">
              {page} / {totalPages}
            </span>

            <button
              onClick={() => goTo(page + 1)}
              disabled={page === totalPages || loading}
              className="px-4 py-2.5 min-h-[44px] text-sm rounded-lg bg-gray-900 border border-gray-700 text-gray-300 hover:border-gray-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {t("subs.pagination.next")} →
            </button>
          </nav>
        )}

        <p className="text-center text-sm text-gray-400 pb-4">
          {t("subs.footer.note")}{" "}
          <Link href="/" className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2 font-medium">
            {t("subs.footer.cta")}
          </Link>
        </p>
      </div>
    </main>
  );
}

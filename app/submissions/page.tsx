"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { PublicReport, SortOption } from "@/lib/reportStore";
import { timeAgo, truncate } from "@/lib/formatters";
import SafeDisplay from "@/components/SafeDisplay";

const TYPE_OPTIONS = [
  { value: "all",    label: "All",            icon: "🔍" },
  { value: "url",    label: "Dodgy Link",     icon: "🔗" },
  { value: "sms",    label: "Scam SMS",       icon: "📱" },
  { value: "email",  label: "Phishing Email", icon: "📧" },
  { value: "phone",  label: "Scam Number",    icon: "📞" },
  { value: "qr",     label: "QR Code",        icon: "📷" },
  { value: "custom", label: "Other",          icon: "🤔" },
];

const PERIOD_OPTIONS = [
  { value: "0",  label: "All time"   },
  { value: "1",  label: "Today"      },
  { value: "7",  label: "This week"  },
  { value: "30", label: "This month" },
];

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "desc",  label: "Newest"         },
  { value: "asc",   label: "Oldest"         },
  { value: "most",  label: "Most reported"  },
  { value: "least", label: "Least reported" },
];

const SEARCH_PLACEHOLDERS = [
  "Search by keyword or scam content…",
  "Search by phone number…",
  "Search by email address…",
  "Search by URL or domain…",
];

const PAGE_SIZE = 25;
const SORT_KEY  = "submissions_sort";

function savedSort(): SortOption {
  if (typeof window === "undefined") return "desc";
  const v = localStorage.getItem(SORT_KEY);
  return (["desc", "asc", "most", "least"] as const).includes(v as SortOption)
    ? (v as SortOption)
    : "desc";
}

function pageNumbers(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | "…")[] = [1];
  if (current > 3)          pages.push("…");
  for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p++) pages.push(p);
  if (current < total - 2)  pages.push("…");
  pages.push(total);
  return pages;
}

export default function SubmissionsPage() {
  const [reports, setReports]           = useState<PublicReport[]>([]);
  const [total, setTotal]               = useState(0);
  const [loading, setLoading]           = useState(true);
  const [type, setType]                 = useState("all");
  const [sort, setSort]                 = useState<SortOption>(savedSort);
  const [periodDays, setPeriodDays]     = useState("0");
  const [page, setPage]                 = useState(1);
  const [searchInput, setSearchInput]   = useState("");
  const [search, setSearch]             = useState("");
  const [phIdx, setPhIdx]               = useState(0);
  const searchRef                       = useRef<HTMLInputElement>(null);

  // Persist sort
  useEffect(() => { localStorage.setItem(SORT_KEY, sort); }, [sort]);

  // Rotate search placeholder every 2.5 s
  useEffect(() => {
    const t = setInterval(() => setPhIdx((i) => (i + 1) % SEARCH_PLACEHOLDERS.length), 2500);
    return () => clearInterval(t);
  }, []);

  // Debounce the search input before firing a fetch
  useEffect(() => {
    const t = setTimeout(() => {
      setLoading(true);
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Fetch whenever any filter changes
  useEffect(() => {
    let cancelled = false;

    const offset = (page - 1) * PAGE_SIZE;
    const since  = periodDays !== "0"
      ? Date.now() - parseInt(periodDays, 10) * 24 * 60 * 60 * 1000
      : undefined;

    const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset), sort });
    if (type !== "all") params.set("type", type);
    if (since)          params.set("since", String(since));
    if (search)         params.set("search", search);

    fetch(`/api/reports?${params}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setReports(data.reports ?? []);
        setTotal(data.total ?? 0);
        setLoading(false);
      })
      .catch(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [type, sort, periodDays, page, search]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function changeType(val: string)       { setLoading(true); setType(val);       setPage(1); }
  function changeSort(val: SortOption)   { setLoading(true); setSort(val);       setPage(1); }
  function changePeriod(val: string)     { setLoading(true); setPeriodDays(val); setPage(1); }
  function clearSearch()                 { setSearchInput(""); searchRef.current?.focus(); }
  function goTo(p: number) {
    setLoading(true);
    setPage(Math.max(1, Math.min(p, totalPages)));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <main className="min-h-screen bg-gray-950 text-gray-100">
      {/* Header */}
      <div className="bg-gradient-to-b from-gray-900 to-gray-950 border-b border-gray-800">
        <div className="max-w-2xl mx-auto px-4 py-8">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-emerald-400 transition-colors mb-4"
          >
            ← Back
          </Link>
          <div className="flex items-center gap-3">
            <span className="text-3xl" aria-hidden="true">📋</span>
            <div>
              <h1 className="text-2xl font-black text-emerald-400 tracking-tight">
                Community Submissions
              </h1>
              <p className="text-sm text-gray-400">
                Scams reported by Australians — unverified, anonymised
              </p>
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
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={SEARCH_PLACEHOLDERS[phIdx]}
            aria-label="Search reports"
            className="w-full bg-gray-900 border border-gray-700 rounded-xl pl-9 pr-9 py-2.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
          />
          {searchInput && (
            <button
              onClick={clearSearch}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors text-lg leading-none"
            >
              ×
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 items-center">
          {/* Sort */}
          <div className="flex rounded-lg border border-gray-700 overflow-hidden text-sm">
            {SORT_OPTIONS.map((opt, i) => (
              <button
                key={opt.value}
                onClick={() => changeSort(opt.value)}
                className={`px-3 py-1.5 transition-colors ${i > 0 ? "border-l border-gray-700" : ""} ${
                  sort === opt.value
                    ? "bg-gray-700 text-gray-100"
                    : "bg-gray-900 text-gray-400 hover:text-gray-200"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <select
            value={type}
            onChange={(e) => changeType(e.target.value)}
            className="bg-gray-900 border border-gray-700 text-sm text-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:border-emerald-500"
          >
            {TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.icon} {opt.label}</option>
            ))}
          </select>

          <select
            value={periodDays}
            onChange={(e) => changePeriod(e.target.value)}
            className="bg-gray-900 border border-gray-700 text-sm text-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:border-emerald-500"
          >
            {PERIOD_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>

          {!loading && total > 0 && (
            <span className="text-sm text-gray-500 ml-auto">
              {total.toLocaleString()} {total === 1 ? "report" : "reports"}
            </span>
          )}
        </div>

        {/* Results */}
        {loading && reports.length === 0 ? (
          <div className="text-center py-16 text-gray-400">Loading…</div>
        ) : reports.length === 0 ? (
          <div className="text-center py-16 space-y-2">
            <div className="text-4xl" aria-hidden="true">🦘</div>
            <p className="text-gray-300 font-medium">No reports match these filters</p>
            <p className="text-sm text-gray-400">
              {search ? "Try a different search term" : "Try a different type or time period"}
            </p>
          </div>
        ) : (
          <div className={`bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden transition-opacity ${loading ? "opacity-50" : ""}`}>
            <ul className="divide-y divide-gray-800">
              {reports.map((r) => {
                const opt = TYPE_OPTIONS.find((o) => o.value === r.type) ?? TYPE_OPTIONS[TYPE_OPTIONS.length - 1];
                return (
                  <li key={r.id} className="px-5 py-4 space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex items-center gap-2 text-sm font-semibold text-gray-300 min-w-0">
                        <span aria-hidden="true" className="shrink-0">{opt.icon}</span>
                        <span>{opt.label}</span>
                        {r.matchCount > 1 && (
                          <span className="shrink-0 bg-red-900/40 text-red-400 border border-red-800/60 text-xs font-semibold px-2 py-0.5 rounded-full">
                            {r.matchCount}× reported
                          </span>
                        )}
                      </span>
                      <span className="text-sm text-gray-500 shrink-0">{timeAgo(r.submittedAt)}</span>
                    </div>

                    <SafeDisplay
                      value={truncate(r.content, 200)}
                      className="block text-sm font-mono text-gray-200 break-all"
                    />

                    {(r.scamUrl || r.scamPhone || r.scamEmail) && (
                      <div className="flex flex-col gap-1 pl-2 border-l-2 border-gray-700">
                        {r.scamUrl && (
                          <span className="flex items-center gap-1.5 text-xs text-gray-400">
                            <span aria-hidden="true" className="shrink-0">🔗</span>
                            <SafeDisplay value={r.scamUrl} className="font-mono text-amber-400/90 break-all" />
                          </span>
                        )}
                        {r.scamPhone && (
                          <span className="flex items-center gap-1.5 text-xs text-gray-400">
                            <span aria-hidden="true" className="shrink-0">📞</span>
                            <SafeDisplay value={r.scamPhone} className="font-mono text-amber-400/90" />
                          </span>
                        )}
                        {r.scamEmail && (
                          <span className="flex items-center gap-1.5 text-xs text-gray-400">
                            <span aria-hidden="true" className="shrink-0">📧</span>
                            <SafeDisplay value={r.scamEmail} className="font-mono text-amber-400/90 break-all" />
                          </span>
                        )}
                      </div>
                    )}

                    {r.description && (
                      <p className="text-sm text-gray-400 italic">{truncate(r.description, 200)}</p>
                    )}
                    <p className="text-xs text-gray-600 font-mono">{r.id}</p>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-1">
            <button
              onClick={() => goTo(page - 1)}
              disabled={page === 1 || loading}
              className="px-3 py-1.5 text-sm rounded-lg bg-gray-900 border border-gray-700 text-gray-300 hover:border-gray-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              ← Prev
            </button>
            {pageNumbers(page, totalPages).map((p, i) =>
              p === "…" ? (
                <span key={`ellipsis-${i}`} className="px-2 text-gray-600 text-sm select-none">…</span>
              ) : (
                <button
                  key={p}
                  onClick={() => goTo(p)}
                  disabled={loading}
                  className={`w-9 py-1.5 text-sm rounded-lg border transition-colors ${
                    p === page
                      ? "bg-emerald-500 border-emerald-400 text-gray-900 font-semibold"
                      : "bg-gray-900 border-gray-700 text-gray-300 hover:border-gray-500"
                  }`}
                >
                  {p}
                </button>
              )
            )}
            <button
              onClick={() => goTo(page + 1)}
              disabled={page === totalPages || loading}
              className="px-3 py-1.5 text-sm rounded-lg bg-gray-900 border border-gray-700 text-gray-300 hover:border-gray-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next →
            </button>
          </div>
        )}

        <p className="text-center text-sm text-gray-500 pb-4">
          Reports are community-submitted and unverified.{" "}
          <Link href="/" className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2">
            Check or report a scam →
          </Link>
        </p>
      </div>
    </main>
  );
}

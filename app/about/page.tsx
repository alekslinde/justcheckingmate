import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About & Privacy — Just Checking, Mate 🦘",
  description:
    "What Just Checking, Mate stores, what it never stores (your IP, your uploads), and how the checker and report system work.",
};

// This page is the canonical record of the project's privacy behaviour, so it
// is deliberately kept in plain English in both language modes — slang
// variants could blur the meaning of a promise.

const SECTION = "bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-3";
const H2 = "font-bold text-emerald-400 text-sm uppercase tracking-wider";

export default function AboutPage() {
  return (
    <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-black text-emerald-400 tracking-tight mb-1">
          About &amp; Privacy
        </h1>
        <p className="text-sm text-gray-400">
          What this site does, what it stores, and — more importantly — what it never stores.
        </p>
      </div>

      <section className={SECTION}>
        <h2 className={H2}>What this is</h2>
        <p className="text-sm text-gray-300">
          Just Checking, Mate is a free scam checker built for Australians. Paste a suspicious
          link, text, email or phone number and get an instant best-effort verdict — no account,
          no tracking, no data sold. It&apos;s an independent project by{" "}
          <a
            href="https://alekslinde.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-400 underline underline-offset-2 hover:text-emerald-300"
          >
            Aleks Linde<span className="sr-only"> (opens in a new tab)</span>
            <span aria-hidden="true"> ↗</span>
          </a>
          , not a government service.
        </p>
        <p className="text-sm text-gray-300">
          It gives a best-effort check only — <strong className="text-gray-100">it can&apos;t
          guarantee it catches every scam</strong>. For official reporting, use Scamwatch
          (scamwatch.gov.au) and ReportCyber (cyber.gov.au/report).
        </p>
      </section>

      <section className={SECTION}>
        <h2 className={H2}>When you check something</h2>
        <ul className="space-y-2 text-sm text-gray-300 list-none">
          <li className="flex items-start gap-2">
            <span className="text-emerald-400 mt-0.5 shrink-0" aria-hidden="true">✓</span>
            <span>
              <strong className="text-gray-100">Nothing you paste is stored.</strong> The content
              is analysed in memory and discarded; we only count that <em>a</em> check happened.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-emerald-400 mt-0.5 shrink-0" aria-hidden="true">✓</span>
            <span>
              <strong className="text-gray-100">Uploads aren&apos;t kept.</strong> Screenshots and
              .eml files are processed in memory (QR decoding happens entirely on your device) and
              never written to disk.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-emerald-400 mt-0.5 shrink-0" aria-hidden="true">✓</span>
            <span>
              <strong className="text-gray-100">We never open the links you check.</strong> The
              analysis is pure pattern-matching — no request is ever made to a scammer&apos;s
              site, so they can&apos;t tell their link is being investigated. Our security policy
              blocks the browser from contacting any outside server.
            </span>
          </li>
        </ul>
      </section>

      <section className={SECTION}>
        <h2 className={H2}>When you report a scam</h2>
        <p className="text-sm text-gray-300">A report stores exactly these things, and nothing else:</p>
        <ul className="space-y-2 text-sm text-gray-300 list-none">
          <li className="flex items-start gap-2">
            <span className="text-gray-500 mt-0.5 shrink-0" aria-hidden="true">·</span>
            <span>
              The scam content and identifiers you submit — with tracking parameters stripped,
              your own email headers removed, and personal details (emails, phone numbers, tax
              file numbers and the like) automatically scrubbed before storage. Everything shown
              publicly is also &ldquo;defanged&rdquo; so it can&apos;t be clicked or dialled by accident.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-gray-500 mt-0.5 shrink-0" aria-hidden="true">·</span>
            <span>
              <strong className="text-gray-100">A coarse location, never your IP address.</strong>{" "}
              At submission time we derive a region from the connection — state level for
              Australia (e.g. &ldquo;NSW, Australia&rdquo;), country level elsewhere — and store only that
              string. It&apos;s shown on the public report so people can see where a scam is
              circulating. Your IP is used in memory for rate limiting while the request is
              processed and is never stored by the application; city-level detail is
              deliberately not used.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-gray-500 mt-0.5 shrink-0" aria-hidden="true">·</span>
            <span>
              <strong className="text-gray-100">Your email, only if you choose to give it.</strong>{" "}
              It&apos;s used solely to follow up on your report. It is never published, never
              shared with anyone, and never used for anything else.
            </span>
          </li>
        </ul>
        <p className="text-sm text-gray-400">
          Public reports are community-submitted and unverified. Want one removed or have a
          question about your data? Use the &ldquo;Report a bug&rdquo; button (bottom-right) with your
          report reference and your email — we&apos;ll sort it out.
        </p>
      </section>

      <section className={SECTION}>
        <h2 className={H2}>Bug reports</h2>
        <p className="text-sm text-gray-300">
          If something breaks we may offer to send diagnostics, but{" "}
          <strong className="text-gray-100">nothing is ever sent without your explicit
          consent</strong> — you see the exact details (page, browser, error message) before
          deciding. The scam content you pasted and any files you uploaded are never included.
        </p>
      </section>

      <section className={SECTION}>
        <h2 className={H2}>No tracking</h2>
        <p className="text-sm text-gray-300">
          No analytics scripts, no advertising pixels, no cookies for tracking. Your language
          preference and view settings live in your own browser&apos;s storage and never leave it.
          The site&apos;s security policy prevents pages from talking to any third-party server at
          all.
        </p>
      </section>

      <p className="text-center text-sm text-gray-400 pb-4">
        <Link href="/" className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2 font-medium">
          Check or report a scam →
        </Link>
      </p>
    </main>
  );
}

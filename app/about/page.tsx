import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About & Privacy — Just Checking, Mate",
  description:
    "What Just Checking, Mate stores, what it never stores (your IP, your uploads), how the checker works, and which countries it covers. Step-by-step guides for blocking and reporting spam live on the Learn page.",
};

// This page is the canonical record of the project's privacy behaviour, so it
// is deliberately kept in plain English in both language modes — slang
// variants could blur the meaning of a promise.

// The card wraps the prose rather than the container: capping the paragraphs at
// a readable measure inside a full-width card would leave the card's right half
// permanently empty. The container still matches every other page.
const CARD =
  "max-w-[820px] bg-[var(--ink-2)] border border-[var(--rule)] rounded-2xl p-6 space-y-8";
const H2 = "font-bold text-emerald-400 text-sm uppercase tracking-wider";
const P = "text-sm text-gray-300 leading-relaxed";

export default function AboutPage() {
  return (
    <main className="max-w-[1180px] mx-auto px-5 sm:px-8 py-8 sm:py-10 space-y-6">
      <div>
        <h1 className="text-2xl font-black text-emerald-400 tracking-tight mb-1">
          About &amp; Privacy
        </h1>
        <p className="text-sm text-gray-400">
          What this site does, what it stores, and what it never stores.
        </p>
      </div>

      <article className={CARD}>
        <section className="space-y-3">
          <h2 className={H2}>What this is</h2>
          <p className={P}>
            Just Checking, Mate is a free scam checker built for Australians, with local coverage
            for the UK, US, New Zealand and Ireland as well. Paste a suspicious link, text, email
            or phone number and get an instant best-effort verdict — no account, no tracking, no
            data sold. It&apos;s an independent project by{" "}
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
          <p className={P}>
            It gives a best-effort check only — <strong className="text-gray-100">it can&apos;t
            guarantee it catches every scam</strong>. For official reporting, use Scamwatch
            (scamwatch.gov.au) and ReportCyber (cyber.gov.au/report).
          </p>
        </section>

        <section className="space-y-3">
          <h2 className={H2}>When you check something</h2>
          <p className={P}>
            <strong className="text-gray-100">Nothing you paste is stored.</strong> The content is
            analysed in memory and discarded; we only count that <em>a</em> check happened.
            Screenshots and .eml files are processed in memory (QR decoding happens entirely on your
            device) and never written to disk.
          </p>
          <p className={P}>
            <strong className="text-gray-100">We never open the links you check.</strong> The
            analysis is pure pattern-matching — no request is ever made to a scammer&apos;s site, so
            they can&apos;t tell their link is being investigated. Our security policy blocks the
            browser from contacting any outside server.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className={H2}>Where we think you are</h2>
          <p className={P}>
            Scams are local, so the checks are too — the agencies, banks, brands and phone-number
            rules we match against are the ones for your country. We cover Australia, the UK, the
            US, New Zealand and Ireland in full, Canada in part, and fall back to
            country-neutral checks everywhere else.
          </p>
          <p className={P}>
            To pick the right set we use{" "}
            <strong className="text-gray-100">a two-letter country code, and nothing finer</strong>{" "}
            — derived from your connection by the network, never read from your IP address by us,
            and not stored when you run a check. If it guesses wrong, because you&apos;re
            travelling or on a VPN, you can change the region yourself and check again.
          </p>
          <p className={P}>
            <strong className="text-gray-100">We tell you when we haven&apos;t checked much.</strong>{" "}
            Outside the countries we cover properly, &ldquo;nothing found&rdquo; can just mean
            &ldquo;we have no local rules to find it with&rdquo; — so instead of showing a
            confident all-clear, we say the coverage is limited and show you what to look for
            yourself.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className={H2}>Threat radar &amp; scam calendar</h2>
          <p className={P}>
            The <Link href="/radar" className="text-emerald-400 underline underline-offset-2 hover:text-emerald-300">threat radar</Link>{" "}
            lists campaigns doing the rounds in the last few weeks, and the{" "}
            <Link href="/calendar" className="text-emerald-400 underline underline-offset-2 hover:text-emerald-300">scam calendar</Link>{" "}
            shows when scams spike through the year — tax time, Black Friday, the Christmas parcel
            rush. Both are hand-written from published threat intelligence and{" "}
            <strong className="text-gray-100">read nothing about you</strong>; they&apos;re the same
            pages for everyone in your country.
          </p>
          <p className={P}>
            Both are there to teach, and{" "}
            <strong className="text-gray-100">neither changes a verdict</strong>. The date is never
            part of the score: a tax scam in March is still a scam, and a genuine ATO email in July
            is still genuine. The radar also says plainly which campaigns we catch and which we
            don&apos;t yet.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className={H2}>When you report a scam</h2>
          <p className={P}>A report stores exactly these things, and nothing else:</p>
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

        <section className="space-y-3">
          <h2 className={H2}>Bug reports &amp; tracking</h2>
          <p className={P}>
            If something breaks we may offer to send diagnostics, but{" "}
            <strong className="text-gray-100">nothing is ever sent without your explicit
            consent</strong> — you see the exact details (page, browser, error message) before
            deciding. The scam content you pasted and any files you uploaded are never included.
          </p>
          <p className={P}>
            No analytics scripts, no advertising pixels, no cookies for tracking. Your language
            preference and view settings live in your own browser&apos;s storage and never leave it.
            The site&apos;s security policy prevents pages from talking to any third-party server at
            all.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className={H2}>Blocking &amp; reporting spam</h2>
          <p className={P}>
            Step-by-step guides for blocking and reporting spam — in Gmail, Outlook, Apple Mail and
            Yahoo, and on iPhone, Android and messaging apps — now live on the{" "}
            <Link
              href="/learn#block-email"
              className="text-emerald-400 underline underline-offset-2 hover:text-emerald-300"
            >
              Learn page
            </Link>
            .
          </p>
        </section>
      </article>

      <p className="text-center text-sm text-gray-400 pb-4">
        <Link href="/" className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2 font-medium">
          Check or report a scam →
        </Link>
      </p>
    </main>
  );
}

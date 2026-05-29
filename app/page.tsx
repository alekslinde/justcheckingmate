import type { ReactNode } from "react";
import Link from "next/link";
import TabView from "@/components/TabView";
import StatsBar from "@/components/StatsBar";

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-950 text-gray-100">
      {/* Nav */}
      <nav className="border-b border-gray-800 bg-gray-900">
        <div className="max-w-2xl mx-auto px-4 h-11 flex items-center justify-end">
          <Link href="/submissions" className="text-sm text-gray-400 hover:text-amber-400 transition-colors">
            Community submissions
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <div className="bg-gradient-to-b from-gray-900 to-gray-950 border-b border-gray-800">
        <div className="max-w-2xl mx-auto px-4 py-10 text-center">
          <div className="text-5xl mb-3" aria-hidden="true">🦘</div>
          <h1 className="text-4xl font-black text-amber-400 tracking-tight mb-2">
            Just Checking, Mate
          </h1>
          <p className="text-gray-300 text-lg mb-1">
            Australia&apos;s no-nonsense scam detector
          </p>
          <p className="text-gray-400 text-sm mb-5">
            Suspicious link? Dodgy text? Shifty call? Chuck it in and we&apos;ll have a squiz.
          </p>
          <StatsBar />
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        {/* Tabbed main content */}
        <TabView />

        {/* Common red flags */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-3">
          <h2 className="font-bold text-amber-400 text-sm uppercase tracking-wider">
            Common Scam Red Flags
          </h2>
          <ul className="grid sm:grid-cols-2 gap-2 text-sm text-gray-300 list-none">
            {([
              ["🏦", <>Asks for bank, <abbr title="Tax File Number">TFN</abbr> or Medicare details</>],
              ["⏰", "Creates urgent pressure to act right now"],
              ["🎁", "Promises prizes, refunds or unclaimed money"],
              ["🔗", "Link doesn't match the organisation it claims to be"],
              ["📱", "Unsolicited texts from random numbers"],
              ["💳", "Asks for payment by gift card or crypto"],
              ["📞", "Automated robocall from an unexpected number"],
              ["📎", "Email asks you to open a suspicious attachment"],
            ] as [string, ReactNode][]).map(([icon, text]) => (
              <li key={String(text)} className="flex items-start gap-2">
                <span className="shrink-0" aria-hidden="true">{icon}</span>
                <span>{text}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Disclaimer */}
        <div className="bg-amber-950/30 border border-amber-900/50 rounded-2xl p-5 space-y-3">
          <div className="flex items-start gap-3">
            <span className="text-2xl shrink-0" aria-hidden="true">🇦🇺</span>
            <div className="space-y-2 text-sm">
              <p className="font-semibold text-amber-400">Fair dinkum disclaimer, mate.</p>
              <p className="text-gray-300">
                This tool gives you a best-effort check — it&apos;s not infallible, and scammers are crafty buggers who constantly change their tricks.{" "}
                <strong className="text-gray-100">It does not guarantee 100% detection of every scam.</strong>
              </p>
              <p className="text-gray-300">
                If you&apos;ve been targeted, always report it to{" "}
                <a
                  href="https://www.scamwatch.gov.au"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-amber-400 font-semibold underline underline-offset-2 hover:text-amber-300"
                >
                  Scamwatch
                </a>{" "}
                (run by the{" "}
                <abbr title="Australian Competition and Consumer Commission">ACCC</abbr>
                ) or your relevant government agency. When in doubt — don&apos;t click, don&apos;t call back, don&apos;t share.
              </p>
              <div className="grid sm:grid-cols-2 gap-2 pt-1">
                {[
                  { name: "Scamwatch (ACCC)", abbr: null, site: "scamwatch.gov.au", href: "https://www.scamwatch.gov.au" },
                  { name: "ReportCyber", abbr: "Australian Signals Directorate", site: "cyber.gov.au/report", href: "https://www.cyber.gov.au/report" },
                  { name: "IDCARE (ID theft)", abbr: null, site: "idcare.org", href: "https://www.idcare.org" },
                  { name: "ACSC", abbr: "Australian Cyber Security Centre", site: "cyber.gov.au", href: "https://www.cyber.gov.au" },
                ].map(({ name, abbr: abbrTitle, site, href }) => (
                  <a
                    key={site}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-gray-900/60 rounded-lg px-3 py-2 hover:bg-gray-900 transition-colors block"
                  >
                    <div className="text-sm text-gray-200 font-semibold">
                      {abbrTitle ? <abbr title={abbrTitle}>{name}</abbr> : name}
                    </div>
                    <div className="text-sm text-amber-400 font-mono">{site}</div>
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>

        <p className="text-center text-sm text-gray-400 pb-4">
          Built for Australians
          {" "}<span aria-hidden="true">🦘</span>{" "} 
          by {" "}
          <a
            href="https://alekslinde.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-amber-400 font-semibold underline underline-offset-2 hover:text-amber-300"
          >
            Aleks Linde
          </a>
          {" "}
          Always exercise caution with unexpected messages
        </p>
      </div>
    </main>
  );
}

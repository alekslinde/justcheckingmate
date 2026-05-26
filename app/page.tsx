import TabView from "@/components/TabView";

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-950 text-gray-100">
      {/* Hero */}
      <div className="bg-gradient-to-b from-gray-900 to-gray-950 border-b border-gray-800">
        <div className="max-w-2xl mx-auto px-4 py-10 text-center">
          <div className="text-5xl mb-3">🦘</div>
          <h1 className="text-4xl font-black text-amber-400 tracking-tight mb-2">
            Just Checking, Mate
          </h1>
          <p className="text-gray-400 text-lg mb-1">
            Australia&apos;s no-nonsense scam detector
          </p>
          <p className="text-gray-500 text-sm">
            Suspicious link? Dodgy text? Shifty call? Chuck it in and we&apos;ll have a squiz.
          </p>
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
          <div className="grid sm:grid-cols-2 gap-2 text-sm text-gray-400">
            {[
              ["🏦", "Asks for bank, TFN or Medicare details"],
              ["⏰", "Creates urgent pressure to act right now"],
              ["🎁", "Promises prizes, refunds or unclaimed money"],
              ["🔗", "Link doesn't match the organisation it claims to be"],
              ["📱", "Unsolicited texts from random numbers"],
              ["💳", "Asks for payment by gift card or crypto"],
              ["📞", "Automated robocall from an unexpected number"],
              ["📎", "Email asks you to open a suspicious attachment"],
            ].map(([icon, text]) => (
              <div key={String(text)} className="flex items-start gap-2">
                <span className="shrink-0">{icon}</span>
                <span>{text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Disclaimer */}
        <div className="bg-amber-950/30 border border-amber-900/50 rounded-2xl p-5 space-y-3">
          <div className="flex items-start gap-3">
            <span className="text-2xl shrink-0">🇦🇺</span>
            <div className="space-y-2 text-sm">
              <p className="font-semibold text-amber-400">Fair dinkum disclaimer, mate.</p>
              <p className="text-gray-400">
                This tool gives you a best-effort check — it&apos;s not infallible, and scammers are crafty buggers who constantly change their tricks.{" "}
                <strong className="text-gray-200">It does not guarantee 100% detection of every scam.</strong>
              </p>
              <p className="text-gray-400">
                If you&apos;ve been targeted, always report it to{" "}
                <span className="text-amber-400 font-semibold">Scamwatch</span> (run by the ACCC) or your relevant government agency. When in doubt — don&apos;t click, don&apos;t call back, don&apos;t share.
              </p>
              <div className="grid sm:grid-cols-2 gap-2 pt-1">
                {[
                  ["Scamwatch (ACCC)", "scamwatch.gov.au"],
                  ["ReportCyber (ASD)", "cyber.gov.au/report"],
                  ["IDCARE (ID theft)", "idcare.org"],
                  ["ACSC", "cyber.gov.au"],
                ].map(([name, site]) => (
                  <div key={site} className="bg-gray-900/60 rounded-lg px-3 py-2">
                    <div className="text-xs text-gray-300 font-semibold">{name}</div>
                    <div className="text-xs text-amber-600 font-mono">{site}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-gray-700 pb-4">
          Built for Australians 🦘 · Always exercise caution with unexpected messages
        </p>
      </div>
    </main>
  );
}

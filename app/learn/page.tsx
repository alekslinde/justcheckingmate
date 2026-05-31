import type { ReactNode } from "react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Learn — Just Checking, Mate 🦘",
  description: "Understand how scammers work, where scams come from, how to handle one, and what to do if you've already clicked or shared details.",
};

const SCAM_TYPES: { icon: string; label: string; desc: string }[] = [
  { icon: "🔗", label: "Links & URLs",  desc: "Fake sites & phishing URLs" },
  { icon: "📱", label: "SMS & texts",   desc: "Impersonation & delivery scams" },
  { icon: "📧", label: "Emails",        desc: "Phishing & fake invoices" },
  { icon: "📞", label: "Phone numbers", desc: "Robocalls & scam callers" },
  { icon: "📷", label: "QR codes",      desc: "Malicious codes in emails & flyers" },
];

// How scammers manipulate you — the psychological playbook.
const TACTICS: { icon: string; title: string; desc: string }[] = [
  { icon: "⏰", title: "Urgency & fear", desc: "“Your account is suspended”, “act within 24 hours” — pressure stops you thinking clearly." },
  { icon: "🎭", title: "Impersonation", desc: "They pose as your bank, the ATO, myGov, police, a courier — even a family member (“Hi Mum, my phone broke”)." },
  { icon: "🎁", title: "Too good to be true", desc: "Surprise prizes, refunds, unexpected inheritances, or crypto/investment returns that can't lose." },
  { icon: "🔐", title: "Borrowed authority", desc: "Official logos, spoofed sender names and faked caller ID make a message look legitimate." },
  { icon: "💸", title: "Unusual payment", desc: "Demands for gift cards, crypto, or a transfer to a “safe account” — or asking you to install software." },
  { icon: "❤️", title: "Building rapport", desc: "Romance and friendship scams invest weeks earning trust before they ever ask for money." },
];

// Where scams actually reach people.
const SOURCES: { icon: string; title: string; desc: string }[] = [
  { icon: "📱", title: "Text messages", desc: "Fake delivery, toll, bank or myGov texts with a link to tap." },
  { icon: "📧", title: "Email", desc: "Phishing, fake invoices and “verify your account” messages." },
  { icon: "📞", title: "Phone calls", desc: "Robocalls, “tech support”, and fake bank or government callers." },
  { icon: "🛒", title: "Marketplaces & social media", desc: "Fake sellers and buyers, giveaway and investment ads, hacked friends' accounts." },
  { icon: "🔎", title: "Search results & ads", desc: "Sponsored links and look-alike sites for banks, logins and support numbers." },
  { icon: "💬", title: "Messaging & dating apps", desc: "WhatsApp “family emergencies”, romance scams, and investment “mentors”." },
];

const RED_FLAGS: [string, ReactNode][] = [
  ["🏦", <>Asks for bank, <abbr title="Tax File Number">TFN</abbr> or Medicare details</>],
  ["⏰", "Creates urgent pressure to act right now"],
  ["🎁", "Promises prizes, refunds or unclaimed money"],
  ["🔗", "Link doesn't match the organisation it claims to be"],
  ["📱", "Unsolicited texts from random numbers"],
  ["💳", "Asks for payment by gift card or crypto"],
  ["📞", "Automated robocall from an unexpected number"],
  ["📎", "Email asks you to open a suspicious attachment"],
];

// Calm, correct handling of something that looks off.
const HANDLE: ReactNode[] = [
  <><strong className="text-gray-100">Slow down.</strong> Genuine organisations never mind you taking time to check.</>,
  <><strong className="text-gray-100">Don’t engage.</strong> Don’t tap links, scan the QR, call the number back, or reply.</>,
  <><strong className="text-gray-100">Verify independently.</strong> Find the official number or website yourself — never use the contact details in the message.</>,
  <><strong className="text-gray-100">Never pay unusually.</strong> No gift cards, crypto, or transfers to a “safe account”, and never install apps or grant remote access on request.</>,
  <><strong className="text-gray-100">Block &amp; delete</strong> the sender once you’re sure.</>,
  <><strong className="text-gray-100">Report it</strong> (below) — it helps protect others.</>,
];

// If you've already engaged — what to do, by what was exposed.
const IF_CAUGHT: { situation: ReactNode; action: ReactNode }[] = [
  {
    situation: "You clicked a link or entered a login",
    action: <>Change that password now, and anywhere you reused it. Turn on two-factor authentication and watch the account for activity you don’t recognise.</>,
  },
  {
    situation: "You gave bank or card details, or paid",
    action: <>Call your bank <strong className="text-gray-100">immediately</strong> (use the number on your card) to freeze cards and stop transfers — recent payments can sometimes be recalled.</>,
  },
  {
    situation: <>You shared ID — <abbr title="Tax File Number">TFN</abbr>, Medicare, licence or passport</>,
    action: <>Contact <strong className="text-gray-100">IDCARE on 1800 595 160</strong> for a free response plan, and consider a credit ban with Equifax, illion and Experian to stop accounts being opened in your name.</>,
  },
  {
    situation: "You installed an app or gave remote access",
    action: <>Disconnect from the internet, uninstall it, run a security scan, and change important passwords from a different, trusted device.</>,
  },
];

const AGENCIES = [
  { name: "Scamwatch (ACCC)", abbr: null, site: "scamwatch.gov.au", href: "https://www.scamwatch.gov.au" },
  { name: "ReportCyber", abbr: "Australian Signals Directorate", site: "cyber.gov.au/report", href: "https://www.cyber.gov.au/report" },
  { name: "IDCARE (ID theft)", abbr: null, site: "idcare.org", href: "https://www.idcare.org" },
  { name: "ACSC", abbr: "Australian Cyber Security Centre", site: "cyber.gov.au", href: "https://www.cyber.gov.au" },
];

const SECTION = "bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-3";
const H2 = "font-bold text-emerald-400 text-sm uppercase tracking-wider";

export default function LearnPage() {
  return (
    <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-black text-emerald-400 tracking-tight mb-1">Learn</h1>
        <p className="text-sm text-gray-400">
          How scammers work, where scams come from, how to handle one — and what to do if you&apos;ve already been caught.
        </p>
      </div>

      {/* What this tool checks */}
      <section className={SECTION}>
        <h2 className={H2}>Common Scam Types We Check</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {SCAM_TYPES.map(({ icon, label, desc }) => (
            <div key={label} className="bg-gray-800/60 border border-gray-700/50 rounded-lg p-2.5">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span aria-hidden="true">{icon}</span>
                <span className="text-sm font-medium text-gray-200">{label}</span>
              </div>
              <p className="text-xs text-gray-500">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How scammers operate */}
      <section className={SECTION}>
        <h2 className={H2}>How Scammers Operate</h2>
        <p className="text-sm text-gray-400">
          Almost every scam leans on the same handful of psychological tricks. Recognise the tactic and the spell breaks.
        </p>
        <div className="space-y-2">
          {TACTICS.map(({ icon, title, desc }) => (
            <div key={title} className="flex items-start gap-3">
              <span className="text-lg shrink-0" aria-hidden="true">{icon}</span>
              <p className="text-sm text-gray-300">
                <span className="font-semibold text-gray-100">{title}.</span> {desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Where scams come from */}
      <section className={SECTION}>
        <h2 className={H2}>Where Scams Come From</h2>
        <div className="grid sm:grid-cols-2 gap-2">
          {SOURCES.map(({ icon, title, desc }) => (
            <div key={title} className="flex items-start gap-2.5">
              <span className="text-lg shrink-0" aria-hidden="true">{icon}</span>
              <p className="text-sm text-gray-300">
                <span className="font-medium text-gray-100">{title}.</span>{" "}
                <span className="text-gray-400">{desc}</span>
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Red flags */}
      <section className={SECTION}>
        <h2 className={H2}>Common Scam Red Flags</h2>
        <ul className="grid sm:grid-cols-2 gap-2 text-sm text-gray-300 list-none">
          {RED_FLAGS.map(([icon, text]) => (
            <li key={String(text)} className="flex items-start gap-2">
              <span className="shrink-0" aria-hidden="true">{icon}</span>
              <span>{text}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* How to handle it */}
      <section className={SECTION}>
        <h2 className={H2}>If Something Seems Off</h2>
        <ul className="space-y-2 text-sm text-gray-300 list-none">
          {HANDLE.map((item, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="text-emerald-400 mt-0.5 shrink-0" aria-hidden="true">✓</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* If you've already been caught */}
      <section className="bg-red-950/30 border border-red-900/50 rounded-2xl p-5 space-y-3">
        <div>
          <h2 className="font-bold text-red-300 text-sm uppercase tracking-wider">
            If You&apos;ve Already Clicked or Shared Details
          </h2>
          <p className="text-sm text-gray-300 mt-1">
            Don&apos;t panic, and don&apos;t feel embarrassed — this happens to careful people too. Act quickly, based on what you shared.
          </p>
        </div>
        <div className="space-y-2.5">
          {IF_CAUGHT.map(({ situation, action }, i) => (
            <div key={i} className="bg-gray-900/60 border border-gray-800 rounded-lg p-3">
              <p className="text-sm font-semibold text-gray-100">{situation}</p>
              <p className="text-sm text-gray-300 mt-0.5">{action}</p>
            </div>
          ))}
        </div>
        <p className="text-sm text-gray-400">
          Then report it to <strong className="text-gray-200">Scamwatch</strong> and <strong className="text-gray-200">ReportCyber</strong>, and tell your bank. If you&apos;re unsure where to start, IDCARE can walk you through it.
        </p>
      </section>

      {/* Where to report + disclaimer */}
      <section className="bg-emerald-950/30 border border-emerald-900/50 rounded-2xl p-5">
        <div className="flex items-start gap-3">
          <span className="text-2xl shrink-0" aria-hidden="true">🇦🇺</span>
          <div className="space-y-2 text-sm">
            <p className="font-semibold text-emerald-400">Where to report a scam</p>
            <p className="text-gray-300">
              Reporting helps authorities warn others and disrupt scammers. This tool gives a best-effort check only —{" "}
              <strong className="text-gray-100">it can&apos;t guarantee it catches every scam</strong>, so trust your instincts too.
            </p>
            <div className="grid sm:grid-cols-2 gap-2 pt-1">
              {AGENCIES.map(({ name, abbr: abbrTitle, site, href }) => (
                <a key={site} href={href} target="_blank" rel="noopener noreferrer"
                  className="bg-gray-900/60 rounded-lg px-3 py-2 hover:bg-gray-900 transition-colors block">
                  <div className="text-sm text-gray-200 font-semibold">
                    {abbrTitle ? <abbr title={abbrTitle}>{name}</abbr> : name}
                  </div>
                  <div className="text-sm text-emerald-400 font-mono">{site}</div>
                </a>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

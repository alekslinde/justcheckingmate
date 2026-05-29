"use client";

import { useState, useCallback } from "react";
import { PoisonProfile } from "@/lib/poisonGenerator";

type Field = {
  label: string;
  key: keyof PoisonProfile;
  sensitive?: boolean;
};

const FIELD_GROUPS: { title: string; fields: Field[] }[] = [
  {
    title: "Identity",
    fields: [
      { label: "Full Name", key: "fullName" },
      { label: "Date of Birth", key: "dateOfBirth" },
      { label: "Email", key: "email" },
      { label: "Mobile", key: "phone" },
      { label: "Password", key: "password", sensitive: true },
    ],
  },
  {
    title: "Address",
    fields: [
      { label: "Street", key: "address" },
      { label: "Suburb", key: "suburb" },
      { label: "State", key: "state" },
      { label: "Postcode", key: "postcode" },
    ],
  },
  {
    title: "Bank Details",
    fields: [
      { label: "Bank", key: "bankName" },
      { label: "BSB", key: "bsb", sensitive: true },
      { label: "Account No.", key: "accountNumber", sensitive: true },
    ],
  },
  {
    title: "Government IDs",
    fields: [
      { label: "TFN", key: "tfn", sensitive: true },
      { label: "Medicare No.", key: "medicareNumber", sensitive: true },
    ],
  },
  {
    title: "Card Details",
    fields: [
      { label: "Card Number", key: "creditCardNumber", sensitive: true },
      { label: "Expiry", key: "creditCardExpiry", sensitive: true },
      { label: "CVV", key: "creditCardCvv", sensitive: true },
    ],
  },
  {
    title: "Tech Fingerprint",
    fields: [
      { label: "IP Address", key: "ipAddress" },
      { label: "Device ID", key: "deviceId" },
    ],
  },
];

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [value]);

  return (
    <button
      onClick={handleCopy}
      aria-label={copied ? "Copied to clipboard" : "Copy to clipboard"}
      className="px-2 py-0.5 text-sm rounded bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-gray-100 transition-all shrink-0"
    >
      <span aria-hidden="true">{copied ? "Copied!" : "Copy"}</span>
      {/* Announced to screen readers via aria-label change; visual label is decorative */}
    </button>
  );
}

export default function PoisonPanel() {
  const [profile, setProfile] = useState<PoisonProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [revealSensitive, setRevealSensitive] = useState(false);

  async function fetchPoison() {
    setLoading(true);
    try {
      const res = await fetch("/api/poison");
      const data: PoisonProfile = await res.json();
      setProfile(data);
    } finally {
      setLoading(false);
    }
  }

  function copyAll() {
    if (!profile) return;
    const lines = FIELD_GROUPS.flatMap((g) =>
      g.fields.map((f) => `${f.label}: ${profile[f.key]}`)
    ).join("\n");
    navigator.clipboard.writeText(lines);
  }

  return (
    <div className="bg-gray-950 border border-amber-800/40 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="bg-amber-900/20 border-b border-amber-800/40 px-5 py-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xl" aria-hidden="true">💉</span>
          <h2 className="font-bold text-amber-400 text-base">Poison Data Generator</h2>
        </div>
        <p className="text-sm text-gray-300">
          All of this is <span className="text-amber-400 font-semibold">100% fabricated</span>. Names, numbers, cards — completely made up but formatted to look real. Feed it back to the scammers to waste their time and corrupt their stolen data.
        </p>
      </div>

      <div className="p-5 space-y-4">
        {!profile ? (
          <button
            onClick={fetchPoison}
            disabled={loading}
            aria-busy={loading}
            className="w-full py-3 bg-amber-600/20 hover:bg-amber-600/30 border border-amber-600/50 text-amber-400 font-bold rounded-lg transition-all"
          >
            {loading ? "Cooking up a fake identity..." : <><span aria-hidden="true">🎲</span>{" "}Generate a Fake Aussie Profile</>}
          </button>
        ) : (
          <>
            {/* Note */}
            <div className="bg-amber-950/40 border border-amber-800/30 rounded-lg px-4 py-2 text-sm text-amber-300 italic">
              &ldquo;{profile.notes}&rdquo;
            </div>

            {/* Controls */}
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={fetchPoison}
                className="px-3 py-1.5 text-sm bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 rounded-lg transition-all"
              >
                <span aria-hidden="true">🔄</span>{" "}Regenerate
              </button>
              <button
                onClick={() => setRevealSensitive(!revealSensitive)}
                aria-pressed={revealSensitive}
                className="px-3 py-1.5 text-sm bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 rounded-lg transition-all"
              >
                <span aria-hidden="true">{revealSensitive ? "🙈" : "👁"}</span>
                {" "}{revealSensitive ? "Hide Sensitive" : "Show All Fields"}
              </button>
              <button
                onClick={copyAll}
                className="px-3 py-1.5 text-sm bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 rounded-lg transition-all"
              >
                <span aria-hidden="true">📋</span>{" "}Copy All
              </button>
            </div>

            {/* Fields */}
            <div className="grid sm:grid-cols-2 gap-4">
              {FIELD_GROUPS.map((group) => (
                <div key={group.title} className="space-y-2">
                  <h4 className="text-sm font-semibold text-amber-400 uppercase tracking-wider">{group.title}</h4>
                  {group.fields.map((field) => {
                    const value = String(profile[field.key]);
                    const hidden = field.sensitive && !revealSensitive;
                    return (
                      <div key={field.key} className="flex items-center gap-2 bg-gray-900 rounded-lg px-3 py-2">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-gray-300">{field.label}</div>
                          <div className="text-sm text-gray-100 font-mono truncate">
                            {hidden ? <span aria-label="Hidden">••••••••••</span> : value}
                          </div>
                        </div>
                        {!hidden && <CopyButton value={value} />}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            <p className="text-sm text-gray-400 text-center pt-1">
              <span aria-hidden="true">⚠</span>{" "}Never use generated data on real systems. This is strictly for poisoning scammers&apos; databases.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

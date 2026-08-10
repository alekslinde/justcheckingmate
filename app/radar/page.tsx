import type { Metadata } from "next";
import { headers } from "next/headers";
import ThreatRadar from "@/components/ThreatRadar";
import { resolveRegion } from "@/lib/regionResolver";

export const metadata: Metadata = {
  title: "Threat radar — Just Checking, Mate",
  description:
    "Scam campaigns circulating in Australia right now — the texts, emails and calls doing the rounds, what they look like, and whether we catch them yet.",
};

// Region comes from request headers, so this can't be prerendered at build time
// — a statically cached page would serve one region's radar to everyone. The
// radar content itself is static data and carries no date logic (see
// components/ThreatRadar.tsx), so this is the only reason.
export const dynamic = "force-dynamic";

export default async function RadarPage() {
  const region = resolveRegion(await headers());

  return (
    <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <ThreatRadar region={region} standalone />
    </main>
  );
}

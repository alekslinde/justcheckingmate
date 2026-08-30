import { headers } from "next/headers";
import CheckFlow from "@/components/CheckFlow";
import HomeHero from "@/components/HomeHero";
import RadarTeaser from "@/components/RadarTeaser";
import ForwardPanel from "@/components/ForwardPanel";
import { resolveRegion } from "@/lib/regionResolver";

// Region comes from request headers, so this page is per-request regardless.
// The check flow is client-side and the stats bar fetches at runtime, so little
// was being served statically here in any case.
export const dynamic = "force-dynamic";

export default async function Home() {
  const region = resolveRegion(await headers());

  return (
    <main className="max-w-[1180px] mx-auto px-5 sm:px-8 py-8 sm:py-10 space-y-6">
      <HomeHero />

      {/* The fold holds exactly two things: paste it here, or forward it from
          your mail app. They are alternatives, so they sit side by side rather
          than stacked — the old single 672px column pushed the radar strip below
          the fold on a laptop and left the bottom of the page empty.

          The check box takes the wider track: it is the primary action, and the
          textarea needs the room. Forwarding is a narrow panel because it is
          three lines and an address. */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:items-start">
        <CheckFlow />
        <ForwardPanel />
      </div>

      {/* Below the fold on purpose: someone arriving mid-panic with a dodgy SMS
          needs the paste field first, and background information pushing it down
          the page would trade their urgent need for ours. */}
      <RadarTeaser region={region} />
    </main>
  );
}

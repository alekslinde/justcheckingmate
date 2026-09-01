import { headers } from "next/headers";
import CheckStage from "@/components/CheckStage";
import HomeHero from "@/components/HomeHero";
import RadarTeaser from "@/components/RadarTeaser";
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
          than stacked. Once a check has run the stage collapses to one column
          and the verdict takes the page — see CheckStage for why that lives
          there rather than inside the flow. */}
      {/* Below the fold on purpose: someone arriving mid-panic with a dodgy SMS
          needs the paste field first, and background information pushing it down
          the page would trade their urgent need for ours. Handed to the stage
          rather than placed after it so it retires when the verdict arrives —
          "what's circulating" is context for the question, not the answer. */}
      <CheckStage belowFold={<RadarTeaser region={region} />} />
    </main>
  );
}

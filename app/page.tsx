import { headers } from "next/headers";
import CheckFlow from "@/components/CheckFlow";
import HomeHero from "@/components/HomeHero";
import SeasonTeaser from "@/components/SeasonTeaser";
import RadarTeaser from "@/components/RadarTeaser";
import ForwardPanel from "@/components/ForwardPanel";
import { resolveRegion } from "@/lib/regionResolver";
import { regionToday } from "@/lib/scamCalendar";

// The season teaser reads today's date, so this page can no longer be
// prerendered at build time — a static page would freeze on the build date and
// eventually claim the wrong season is active. The check flow is already
// client-side and the stats bar fetches at runtime, so little was being served
// statically here in practice.
export const dynamic = "force-dynamic";

export default async function Home() {
  const region = resolveRegion(await headers());
  const today = regionToday(region);

  return (
    <main className="max-w-[1180px] mx-auto px-5 sm:px-8 py-8 sm:py-10 space-y-6">
      <HomeHero />

      {/* The fold holds exactly two things: paste it here, or forward it from
          your mail app. They are alternatives, so they sit side by side rather
          than stacked — the old single 672px column pushed the teasers below
          the fold on a laptop and left the bottom of the page empty.

          The check box takes the wider track: it is the primary action, and the
          textarea needs the room. Forwarding is a narrow panel because it is
          three lines and an address. */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:items-start">
        <CheckFlow />
        <ForwardPanel />
      </div>

      {/* Both below the fold on purpose — see SeasonTeaser's header comment.
          Now single-line strips rather than cards, so they stack: two of them
          side by side would leave one short line floating beside another. The
          radar sits second because the season teaser only renders inside its
          window, making it the rarer and more timely of the two. */}
      <div className="space-y-2.5">
        <SeasonTeaser region={region} today={today} />
        <RadarTeaser region={region} />
      </div>
    </main>
  );
}

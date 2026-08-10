import { headers } from "next/headers";
import CheckFlow from "@/components/CheckFlow";
import HomeHero from "@/components/HomeHero";
import SeasonTeaser from "@/components/SeasonTeaser";
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
    <main className="max-w-2xl mx-auto px-4 py-8 space-y-5">
      <HomeHero />
      <CheckFlow />
      {/* Below the check box on purpose — see SeasonTeaser's header comment. */}
      <SeasonTeaser region={region} today={today} />
    </main>
  );
}

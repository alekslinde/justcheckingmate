import type { Metadata } from "next";
import { headers } from "next/headers";
import ScamCalendar from "@/components/ScamCalendar";
import { resolveRegion } from "@/lib/regionResolver";
import { regionToday } from "@/lib/scamCalendar";

export const metadata: Metadata = {
  title: "Scam calendar — Just Checking, Mate",
  description:
    "When scams peak through the year — tax season, Black Friday, the Christmas parcel rush — and the lures to expect in each window, for your region.",
};

// Reads today's date, so it can't be prerendered at build time: a statically
// cached page would freeze on the build date and show the wrong season.
export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const region = resolveRegion(await headers());
  // Resolved here rather than in the component: the component is a client
  // component (it needs the tone preference), and the browser clock reflects the
  // device's timezone rather than the user's region.
  const today = regionToday(region);

  return (
    <main className="max-w-[1180px] mx-auto px-5 sm:px-8 py-8 sm:py-10 space-y-6">
      <ScamCalendar region={region} today={today} standalone />
    </main>
  );
}

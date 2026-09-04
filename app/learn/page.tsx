import type { Metadata } from "next";
import { headers } from "next/headers";
import LearnContent from "@/components/LearnContent";
import { resolveRegion } from "@/lib/regionResolver";
import { regionToday, activeSeasons } from "@/lib/scamCalendar";

export const metadata: Metadata = {
  title: "How scammers work — Veriguard",
  description: "Understand how scammers work, where scams come from, how to handle one, and what to do if you've already clicked or shared details — plus how to capture a scam so we can check it.",
};

// The calendar link card names the seasons that are active today, so this can't
// be prerendered at build time without eventually naming the wrong ones.
export const dynamic = "force-dynamic";

export default async function LearnPage() {
  const region = resolveRegion(await headers());
  // Resolved server-side: the browser clock reflects the device's timezone
  // rather than the user's region.
  const today = regionToday(region);

  return (
    <LearnContent activeSeasons={activeSeasons(region, today).map((s) => s.title)} />
  );
}

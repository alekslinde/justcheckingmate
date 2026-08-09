import type { Metadata } from "next";
import { headers } from "next/headers";
import LearnContent from "@/components/LearnContent";
import ScamCalendar from "@/components/ScamCalendar";
import { resolveRegion } from "@/lib/regionResolver";

export const metadata: Metadata = {
  title: "Learn — Just Checking, Mate",
  description: "Understand how scammers work, where scams come from, how to handle one, and what to do if you've already clicked or shared details — plus how to capture a scam so we can check it.",
};

// The calendar reads today's date, so the page can't be statically cached at
// build time — it would freeze on the build date and show the wrong season.
export const dynamic = "force-dynamic";

export default async function LearnPage() {
  const region = resolveRegion(await headers());

  return (
    <>
      <LearnContent />
      <div className="max-w-2xl mx-auto px-4 pb-8">
        <ScamCalendar region={region} />
      </div>
    </>
  );
}

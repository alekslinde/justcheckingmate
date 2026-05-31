import CheckFlow from "@/components/CheckFlow";
import StatsBar from "@/components/StatsBar";

export default function Home() {
  return (
    <main className="max-w-2xl mx-auto px-4 py-8 space-y-5">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-black text-emerald-400 tracking-tight">
          Check a scam in seconds
        </h1>
        <p className="text-sm text-gray-400">
          Paste a link, text, email or number — or upload a screenshot — and we&apos;ll analyse it.
        </p>
        <StatsBar />
      </div>

      <CheckFlow />
    </main>
  );
}

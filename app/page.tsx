import CheckFlow from "@/components/CheckFlow";
import StatsBar from "@/components/StatsBar";

export default function Home() {
  return (
    <main className="max-w-2xl mx-auto px-4 py-8 space-y-5">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-black text-emerald-400 tracking-tight">
          Got a suspicious message or call?
        </h1>
        <p className="text-base text-gray-300">
          Paste it below and we&apos;ll check it for you — links, texts, emails, and phone numbers.
        </p>
        <StatsBar />
      </div>

      <CheckFlow />
    </main>
  );
}

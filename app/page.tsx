import CheckFlow from "@/components/CheckFlow";
import HomeHero from "@/components/HomeHero";

export default function Home() {
  return (
    <main className="max-w-2xl mx-auto px-4 py-8 space-y-5">
      <HomeHero />
      <CheckFlow />
    </main>
  );
}

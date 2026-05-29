"use client";

import { useLang } from "@/lib/lang";

export default function HeroText() {
  const { t } = useLang();
  return (
    <>
      <p className="text-gray-300 text-lg mb-1">
        {t("Australia's trusted scam checker", "Australia's no-nonsense scam detector")}
      </p>
      <p className="text-gray-400 text-sm mb-5">
        {t(
          "Something feel off? You're right to check before you act. Paste it below — we'll analyse it in seconds.",
          "Suspicious link? Dodgy text? Shifty call? Chuck it in and we'll have a squiz."
        )}
      </p>
    </>
  );
}

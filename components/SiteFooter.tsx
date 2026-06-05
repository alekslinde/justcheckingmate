export default function SiteFooter() {
  return (
    <footer
      className="border-t border-gray-800 mt-auto"
      style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
    >
      <p className="max-w-2xl mx-auto px-4 pt-6 pb-0 text-center text-sm text-gray-400">
        Built for Australians{" "}
        <span aria-hidden="true">🦘</span>{" "}
        by{" "}
        <a
          href="https://alekslinde.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-emerald-400 font-semibold underline underline-offset-2 hover:text-emerald-300"
        >
          Aleks Linde{" "}<span aria-label="opens in a new tab" aria-hidden="true">↗</span>
        </a>
        {" "}— always check before you act.
      </p>
    </footer>
  );
}

import type { MetadataRoute } from "next";

// Installability decision (see scripts/generate-icons.mjs for the icon set):
// the app is deliberately online-only — checking uses a live blocklist and
// reporting writes to the shared database, and OCR runs server-side — so there
// is no service worker / offline mode. The PWA value here is the home-screen
// icon and standalone window for people who check messages often.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Just Checking, Mate",
    short_name: "JCM",
    description: "Australia's scam detector. Check links, texts, emails and calls before you act.",
    start_url: "/",
    display: "standalone",
    background_color: "#030712",
    theme_color: "#030712",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}

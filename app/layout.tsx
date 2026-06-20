import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { LangProvider } from "@/lib/lang";
import { BugReportProvider } from "@/components/BugReportProvider";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Production URL for absolute OG/Twitter URLs: explicit override first, then
// the Vercel-provided production domain, then localhost for dev.
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000");

const TITLE = "Just Checking, Mate — Aussie Scam Detector";
const DESCRIPTION =
  "Australia's no-nonsense scam detector. Check links, texts, emails and calls before you act.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  applicationName: "Just Checking, Mate",
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "/",
    siteName: "Just Checking, Mate",
    locale: "en_AU",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)",  color: "#030712" },
    { media: "(prefers-color-scheme: light)", color: "#f9fafb" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-gray-950 text-gray-100">
        <LangProvider>
          <BugReportProvider>
            <SiteHeader />
            <div className="flex-1 bg-gradient-to-b from-gray-900 to-gray-950">{children}</div>
            <SiteFooter />
          </BugReportProvider>
        </LangProvider>
      </body>
    </html>
  );
}

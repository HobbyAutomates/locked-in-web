import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Fraunces, Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import "@/lib/motion.css";
import { APP_VERSION } from "@/lib/version";
import { SquadPostHint } from "@/components/SquadPostHint";
import ScreenTracker from "@/components/ScreenTracker";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist", weight: ["400", "500", "600", "700", "800"] });
// Brand v1 type: Bricolage (display, optical size on), Fraunces italic (one accent phrase), Geist Mono (labels).
const bricolage = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-bricolage", weight: "variable", axes: ["opsz"] });
const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces", style: "italic", weight: "variable", axes: ["opsz"] });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", weight: ["400", "500", "600"] });

export const metadata: Metadata = {
  title: "Locked In",
  description: "Workouts, meals by voice, streaks.",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Locked In" },
  icons: { icon: "/icon.svg", apple: "/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f1ea" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0b0c" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

/** Applies the stored theme before first paint so there is no flash of the wrong palette. */
const THEME_BOOT = `try{var m=localStorage.getItem("lockedin-theme");if(m==="light"||m==="dark")document.documentElement.setAttribute("data-theme",m)}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${bricolage.variable} ${fraunces.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <head>
        <Script id="theme-boot" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
        <meta name="app-version" content={APP_VERSION} />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Locked In" />
        <meta name="mobile-web-app-capable" content="yes" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
      </head>
      <body>
        {children}
        <SquadPostHint />
        <ScreenTracker />
      </body>
    </html>
  );
}

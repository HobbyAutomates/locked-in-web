import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist", weight: ["400", "500", "600", "700", "800"] });

export const metadata: Metadata = {
  title: "Locked In",
  description: "Workouts, meals by voice, streaks.",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Locked In" },
  icons: { icon: "/icon.svg", apple: "/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f4f6" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
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
    <html lang="en" className={geist.variable} suppressHydrationWarning>
      <head>
        <Script id="theme-boot" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Locked In" />
        <meta name="mobile-web-app-capable" content="yes" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
      </head>
      <body>{children}</body>
    </html>
  );
}

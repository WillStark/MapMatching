import type { Metadata } from "next";
import {
  Bricolage_Grotesque,
  IBM_Plex_Mono,
  Instrument_Sans,
} from "next/font/google";

import { getMetadataBase } from "@/lib/share/compare-metadata";

import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";

const displayFont = Bricolage_Grotesque({
  variable: "--font-display",
  subsets: ["latin"],
});

const bodyFont = Instrument_Sans({
  variable: "--font-body",
  subsets: ["latin"],
});

const monoFont = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  metadataBase: getMetadataBase(),
  title: "MapMatching",
  description:
    "Search and compare two cities at the same real-world scale with shareable URLs and server-backed restore.",
  openGraph: {
    description:
      "Search and compare two cities at the same real-world scale with shareable URLs and server-backed restore.",
    siteName: "MapMatching",
    title: "MapMatching",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    description:
      "Search and compare two cities at the same real-world scale with shareable URLs and server-backed restore.",
    title: "MapMatching",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${displayFont.variable} ${bodyFont.variable} ${monoFont.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col font-sans text-ink">{children}</body>
    </html>
  );
}

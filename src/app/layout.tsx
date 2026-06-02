import type { Metadata } from "next";
import { Cormorant_Garamond, Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import { Analytics } from '@vercel/analytics/react';
import "./globals.css";

const GA_MEASUREMENT_ID = "G-CDHVQKNXDL";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/** Editorial serif for premium hero titles */
const displaySerif = Cormorant_Garamond({
  variable: "--font-display-serif",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const siteDescription =
  "Know before you go. Real-time wait times and court info for NYC public tennis courts.";

const metadataBase = new URL(
  process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000"),
);

export const metadata: Metadata = {
  metadataBase,
  applicationName: "SmartCourt NYC",
  title: {
    default: "SmartCourt NYC",
    template: "%s · SmartCourt NYC",
  },
  description: siteDescription,
  openGraph: {
    type: "website",
    siteName: "SmartCourt NYC",
    title: "SmartCourt NYC",
    description: siteDescription,
    images: [
      {
        url: "/smartcourtnyc-og.png",
        alt: "SmartCourt NYC",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "SmartCourt NYC",
    description: siteDescription,
    images: ["/smartcourtnyc-og.png"],
  },
  viewport: "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <Script
          async
          src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
          strategy="afterInteractive"
        />
        <Script id="gtag-init" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GA_MEASUREMENT_ID}');
          `}
        </Script>
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${displaySerif.variable} antialiased`}
      >
        {children}
        <Analytics />
      </body>
    </html>
  );
}

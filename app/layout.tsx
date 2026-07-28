import { AppProviders } from "@/components/providers/app-providers";
import { PresenceTracker } from "@/components/presence/presence-tracker";
import { RegisterServiceWorker } from "@/components/pwa/register-sw";
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin", "latin-ext"],
  variable: "--font-inter",
  display: "swap",
});

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
const defaultOgImage = "/fs.png";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "FasoStock",
    template: "%s · FasoStock",
  },
  description:
    "Logiciel de gestion de stock, ventes et caisse pour commerces au Burkina Faso (Ouagadougou, Bobo-Dioulasso) — FasoStock Web.",
  applicationName: "FasoStock",
  keywords: [
    "gestion de stock Burkina Faso",
    "logiciel caisse Burkina Faso",
    "POS Ouagadougou",
    "application ventes boutique",
    "FasoStock",
  ],
  alternates: {
    canonical: "/",
    languages: {
      "fr-BF": "/",
      fr: "/",
    },
  },
  openGraph: {
    type: "website",
    locale: "fr_BF",
    url: "/",
    siteName: "FasoStock",
    title: "FasoStock — Gestion de stock et ventes au Burkina Faso",
    description:
      "Pilotez stock, caisse et crédit client pour votre commerce au Burkina Faso avec FasoStock.",
    images: [
      {
        url: defaultOgImage,
        width: 512,
        height: 512,
        alt: "FasoStock",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "FasoStock — Gestion de stock et ventes au Burkina Faso",
    description:
      "Stock, ventes, caisse et crédit client pour commerces au Burkina Faso.",
    images: [defaultOgImage],
  },
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  /**
   * Icônes globales de l'app (`public/fs.png`).
   */
  icons: {
    icon: [{ url: "/fs.png", type: "image/png" }],
    apple: "/fs.png",
    shortcut: "/fs.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "FasoStock",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#E85D2C",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const organizationJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "FasoStock",
    url: siteUrl,
    logo: `${siteUrl}/fs.png`,
    areaServed: {
      "@type": "Country",
      name: "Burkina Faso",
    },
  };
  const softwareJsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "FasoStock",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url: siteUrl,
    inLanguage: "fr-BF",
    areaServed: {
      "@type": "Country",
      name: "Burkina Faso",
    },
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "XOF",
    },
  };

  return (
    <html lang="fr" className={`${inter.variable} h-full`} suppressHydrationWarning>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareJsonLd) }}
        />
      </head>
      <body className="min-h-dvh bg-fs-surface font-sans text-fs-text antialiased">
        <AppProviders>
          {children}
          {/* Présence temps réel (page Admin › Live) — visiteurs anonymes compris. */}
          <PresenceTracker />
          <RegisterServiceWorker />
        </AppProviders>
      </body>
    </html>
  );
}

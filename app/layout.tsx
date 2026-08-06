import { AppProviders } from "@/components/providers/app-providers";
import { PresenceTracker } from "@/components/presence/presence-tracker";
import { RegisterServiceWorker } from "@/components/pwa/register-sw";
import { SITE_URL } from "@/lib/seo/site-url";
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin", "latin-ext"],
  variable: "--font-inter",
  display: "swap",
});

const siteUrl = SITE_URL;
const defaultOgImage = "/fs.png";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "FasoStock",
    template: "%s · FasoStock",
  },
  description:
    "FasoStock, logiciel de gestion commerciale au Burkina Faso : ventes, stock, caisse, facturation et crédits clients pour les commerces de Ouagadougou, Bobo-Dioulasso et de tout le pays.",
  applicationName: "FasoStock",
  keywords: [
    "logiciel de gestion commerciale Burkina Faso",
    "logiciel gestion commerciale Ouagadougou",
    "gestion de stock Burkina Faso",
    "logiciel caisse Burkina Faso",
    "logiciel de facturation Burkina Faso",
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
    title: "FasoStock — Logiciel de gestion commerciale au Burkina Faso",
    description:
      "Pilotez ventes, stock, caisse, factures et crédits clients pour votre commerce au Burkina Faso avec FasoStock.",
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
    title: "FasoStock — Logiciel de gestion commerciale au Burkina Faso",
    description:
      "Ventes, stock, caisse, facturation et crédit client pour les commerces du Burkina Faso.",
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
    description:
      "Éditeur de FasoStock, logiciel de gestion commerciale pour les commerçants et PME du Burkina Faso.",
    email: "contact@fasostock.com",
    telephone: "+22664712044",
    address: {
      "@type": "PostalAddress",
      addressLocality: "Ouagadougou",
      addressCountry: "BF",
    },
    contactPoint: [
      {
        "@type": "ContactPoint",
        telephone: "+22664712044",
        contactType: "customer support",
        areaServed: "BF",
        availableLanguage: ["fr"],
      },
    ],
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
    applicationSubCategory: "Logiciel de gestion commerciale",
    operatingSystem: "Web, Android, iOS, Windows, macOS",
    url: siteUrl,
    inLanguage: "fr-BF",
    description:
      "Logiciel de gestion commerciale au Burkina Faso : ventes, stock, caisse, facturation, crédits clients et rapports, sur mobile et PC.",
    areaServed: {
      "@type": "Country",
      name: "Burkina Faso",
    },
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "XOF",
      description: "Essai gratuit sans carte bancaire",
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

import { AppProviders } from "@/components/providers/app-providers";
import { RegisterServiceWorker } from "@/components/pwa/register-sw";
import type { Metadata, Viewport } from "next";
import { Roboto } from "next/font/google";
import "./globals.css";

const roboto = Roboto({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-roboto",
  display: "swap",
});

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "FasoStock",
    template: "%s · FasoStock",
  },
  description:
    "Gestion de stock, ventes et dépôt — FasoStock Web (offline-first).",
  applicationName: "FasoStock",
  /**
   * Favicon / icônes : fichiers `app/icon.png` et `app/apple-icon.png` (même logo que `public/fasostocklogo.png`).
   * La convention App Router injecte les bons `<link rel="icon">` — évite l’icône Next par défaut.
   */
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
  return (
    <html lang="fr" className={`${roboto.variable} h-full`} suppressHydrationWarning>
      <body className="min-h-dvh bg-fs-surface font-sans text-fs-text antialiased">
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var k='fs_theme_mode';var m=localStorage.getItem(k);var d=document.documentElement;var dark=false;if(m==='dark'){dark=true;}else if(m==='light'){dark=false;}else{if(m==='system'||m===null){dark=window.matchMedia('(prefers-color-scheme: dark)').matches;}else{dark=false;}}if(dark){d.classList.add('dark');}else{d.classList.remove('dark');}d.setAttribute('data-theme',m||'system');d.style.colorScheme=dark?'dark':'light';}catch(e){}})();`,
          }}
        />
        <AppProviders>
          {children}
          <RegisterServiceWorker />
        </AppProviders>
      </body>
    </html>
  );
}

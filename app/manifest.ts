import type { MetadataRoute } from "next";

/**
 * Icônes PWA : utiliser `app/icon.png` (convention Next.js → route `/icon.png`).
 * Chrome utilise surtout ces entrées pour le dialogue « Installer l’appli » ; éviter
 * un seul PNG déclaré en deux tailles si l’URL ne résout pas (fallback icône générique).
 */
const ICON = "/icon.png";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "FasoStock",
    short_name: "FasoStock",
    description: "Gestion de stock et ventes — mode hors ligne",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#F8F7F5",
    theme_color: "#E85D2C",
    orientation: "portrait-primary",
    lang: "fr",
    icons: [
      {
        src: ICON,
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: ICON,
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: ICON,
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}

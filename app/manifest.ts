import type { MetadataRoute } from "next";

/** Même fichier que le favicon (`public/logo2.png`) — installation PWA. */
const ICON = "/logo2.png";

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

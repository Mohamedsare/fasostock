import type { MetadataRoute } from "next";

const ICON_192 = "/pwa-192.png";
const ICON_512 = "/pwa-512.png";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "FasoStock",
    short_name: "FasoStock",
    description: "Gestion de stock et ventes — même en faible connexion",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#F8F7F5",
    theme_color: "#E85D2C",
    orientation: "portrait-primary",
    lang: "fr",
    icons: [
      {
        src: ICON_192,
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: ICON_512,
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: ICON_512,
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}

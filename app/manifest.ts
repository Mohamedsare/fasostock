import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FasoStock",
    short_name: "FasoStock",
    description: "Gestion de stock et ventes — mode hors ligne",
    start_url: "/",
    display: "standalone",
    background_color: "#F8F7F5",
    theme_color: "#E85D2C",
    orientation: "portrait-primary",
    lang: "fr",
  };
}

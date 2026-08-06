/**
 * Pages SEO publiques indexables.
 *
 * Source unique utilisée par le maillage interne (footer de l'accueil, bloc
 * « Découvrir aussi » des pages SEO) et par le `sitemap.xml`. Ajouter une page
 * ici suffit pour qu'elle soit liée partout et soumise à Google.
 *
 * L'ordre reflète la priorité commerciale : la page pilier en premier.
 */
export type SeoLandingLink = {
  href: string;
  /** Libellé du lien — porte le mot-clé (texte d'ancre optimisé). */
  label: string;
  /** Priorité `sitemap.xml` (0 → 1). */
  priority: number;
};

export const SEO_LANDING_LINKS: SeoLandingLink[] = [
  {
    href: "/logiciel-gestion-commerciale-burkina-faso",
    label: "Logiciel de gestion commerciale au Burkina Faso",
    priority: 0.95,
  },
  {
    href: "/logiciel-gestion-stock-burkina-faso",
    label: "Logiciel de gestion de stock au Burkina Faso",
    priority: 0.9,
  },
  {
    href: "/logiciel-caisse-ouagadougou",
    label: "Logiciel de caisse à Ouagadougou",
    priority: 0.85,
  },
  {
    href: "/application-gestion-boutique-burkina",
    label: "Application de gestion de boutique",
    priority: 0.85,
  },
  {
    href: "/logiciel-inventaire-pme-burkina",
    label: "Logiciel d'inventaire pour PME",
    priority: 0.8,
  },
  {
    href: "/gestion-stock-afrique-ouest",
    label: "Gestion de stock en Afrique de l'Ouest",
    priority: 0.8,
  },
  {
    href: "/offre-complete",
    label: "Offre complète : matériel + logiciel",
    priority: 0.8,
  },
];

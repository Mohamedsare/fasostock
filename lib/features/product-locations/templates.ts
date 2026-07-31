import type { LocationLevel } from "./types";

/**
 * Gabarits de rangement proposés au démarrage. Ils ne sont QUE des points de
 * départ : chaque boutique renomme, ajoute ou retire des niveaux avant de valider.
 * L'ordre des libellés compte — il devient la profondeur de l'arbre.
 */
export type LocationTemplate = {
  slug: string;
  label: string;
  /** À qui ça parle, en une ligne. */
  description: string;
  levels: string[];
  /** Exemple concret affiché sous les niveaux (rassure : « ah oui, c'est ça chez moi »). */
  example: string;
};

export const LOCATION_TEMPLATES: LocationTemplate[] = [
  {
    slug: "supermarche",
    label: "Supermarché / alimentation",
    description: "Grandes surfaces de vente organisées en rayons et allées.",
    levels: ["Rayon", "Allée", "Étagère", "Niveau"],
    example: "Boissons › Allée 2 › Étagère B › Niveau 3",
  },
  {
    slug: "boutique",
    label: "Boutique / prêt-à-porter",
    description: "Surface de vente avec zones, portants et casiers.",
    levels: ["Zone", "Meuble", "Casier"],
    example: "Femmes › Portant 4 › Casier haut",
  },
  {
    slug: "quincaillerie",
    label: "Quincaillerie / pièces",
    description: "Travées et bacs numérotés, beaucoup de petites références.",
    levels: ["Travée", "Rack", "Bac"],
    example: "Travée C › Rack 3 › Bac 12",
  },
  {
    slug: "pharmacie",
    label: "Pharmacie",
    description: "Rangement par zone thérapeutique, meubles et tiroirs.",
    levels: ["Zone", "Meuble", "Tiroir"],
    example: "Antibiotiques › Meuble 2 › Tiroir 5",
  },
  {
    slug: "depot",
    label: "Dépôt / entrepôt",
    description: "Stockage en hauteur avec allées et niveaux de rack.",
    levels: ["Zone", "Allée", "Rack", "Niveau"],
    example: "Zone Nord › Allée 1 › Rack B › Niveau 2",
  },
  {
    slug: "simple",
    label: "Simple",
    description: "Deux niveaux suffisent pour la plupart des petites boutiques.",
    levels: ["Rayon", "Étagère"],
    example: "Cosmétiques › Étagère 3",
  },
];

/** Nombre maximal de niveaux — aligné sur la contrainte SQL (`depth <= 4`). */
export const MAX_LOCATION_LEVELS = 5;

export function templateLevels(slug: string): LocationLevel[] {
  const t = LOCATION_TEMPLATES.find((x) => x.slug === slug);
  return (t?.levels ?? ["Emplacement"]).map((name) => ({ name }));
}

/** Libellé du niveau `depth` (« Étagère »), avec repli lisible si le modèle est plus court. */
export function levelLabel(levels: LocationLevel[], depth: number): string {
  const raw = levels[depth]?.name?.trim();
  return raw && raw.length > 0 ? raw : `Niveau ${depth + 1}`;
}

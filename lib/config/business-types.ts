import type { LucideIcon } from "lucide-react";
import {
  Building2,
  Hammer,
  MoreHorizontal,
  Package,
  Pill,
  Shirt,
  Smartphone,
  Store,
  Truck,
  UtensilsCrossed,
  Wrench,
} from "lucide-react";

/**
 * Types d’activité — slugs stables pour l’URL (`?businessType=`) et futures persistance / personnalisation.
 * Icônes et descriptions : faciles à faire évoluer sans toucher au layout.
 */
export type BusinessTypeOption = {
  slug: string;
  label: string;
  /** Sous-texte court sous le libellé (SaaS premium). */
  description: string;
  icon: LucideIcon;
  /**
   * Mot utilisé dans le placeholder d’inscription : « Nom de votre {storeNamePlaceholderNoun} ».
   * Minuscules, accord français (ex. pharmacie, quincaillerie).
   */
  storeNamePlaceholderNoun: string;
};

export const BUSINESS_TYPES: readonly BusinessTypeOption[] = [
  {
    slug: "supermarche-alimentation",
    label: "Supermarché / Alimentation",
    description: "Épicerie, produits frais et grande distribution.",
    icon: Store,
    storeNamePlaceholderNoun: "supermarché",
  },
  {
    slug: "boutique-vetements",
    label: "Boutique de vêtements",
    description: "Prêt-à-porter, chaussures et accessoires mode.",
    icon: Shirt,
    storeNamePlaceholderNoun: "boutique",
  },
  {
    slug: "telephones-accessoires",
    label: "Téléphones / Accessoires",
    description: "Mobile, coques, chargeurs et high-tech.",
    icon: Smartphone,
    storeNamePlaceholderNoun: "boutique",
  },
  {
    slug: "pharmacie",
    label: "Pharmacie / Parapharmacie",
    description: "Médicaments, soins et bien-être.",
    icon: Pill,
    storeNamePlaceholderNoun: "pharmacie",
  },
  {
    slug: "pieces-moto",
    label: "Pièces moto",
    description: "Deux-roues, équipement et entretien.",
    icon: Wrench,
    storeNamePlaceholderNoun: "magasin",
  },
  {
    slug: "pieces-auto",
    label: "Pièces auto",
    description: "Pièces détachées et entretien véhicules.",
    icon: Package,
    storeNamePlaceholderNoun: "magasin",
  },
  {
    slug: "quincaillerie",
    label: "Quincaillerie",
    description: "Outillage, bricolage et fournitures.",
    icon: Hammer,
    storeNamePlaceholderNoun: "quincaillerie",
  },
  {
    slug: "materiaux-construction",
    label: "Matériaux de construction",
    description: "Ciment, fer, bois et gros œuvre.",
    icon: Building2,
    storeNamePlaceholderNoun: "magasin",
  },
  {
    slug: "restaurant-fast-food",
    label: "Restaurant / Fast-food",
    description: "Restauration sur place ou à emporter.",
    icon: UtensilsCrossed,
    storeNamePlaceholderNoun: "restaurant",
  },
  {
    slug: "grossiste-distribution",
    label: "Grossiste / Distribution",
    description: "Vente en volume et réseaux B2B.",
    icon: Truck,
    storeNamePlaceholderNoun: "plateforme",
  },
  {
    slug: "autre-commerce",
    label: "Autre commerce",
    description: "Une activité qui ne figure pas dans la liste.",
    icon: MoreHorizontal,
    storeNamePlaceholderNoun: "commerce",
  },
] as const;

export function getBusinessTypeBySlug(slug: string | null | undefined): BusinessTypeOption | undefined {
  if (!slug || typeof slug !== "string") return undefined;
  return BUSINESS_TYPES.find((b) => b.slug === slug);
}

export function isValidBusinessTypeSlug(slug: string | null | undefined): boolean {
  if (slug == null || typeof slug !== "string" || slug.trim() === "") return false;
  return BUSINESS_TYPES.some((b) => b.slug === slug.trim());
}

/** Placeholder du champ « nom du premier point de vente » selon l’activité. */
export function getFirstStoreNamePlaceholder(businessType: BusinessTypeOption | undefined): string {
  if (!businessType) return "Nom de la première boutique *";
  return `Nom de votre ${businessType.storeNamePlaceholderNoun} *`;
}

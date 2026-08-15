import type { LucideIcon } from "lucide-react";
import {
  Banknote,
  Beef,
  Beer,
  BedDouble,
  BookOpen,
  Building2,
  Bus,
  Car,
  Cog,
  Croissant,
  CupSoda,
  Footprints,
  Fuel,
  Gem,
  Glasses,
  Hammer,
  KeyRound,
  Laptop,
  Layers,
  MoreHorizontal,
  Package,
  Paintbrush,
  Pill,
  Plug,
  Printer,
  Ruler,
  Scissors,
  Shirt,
  ShoppingBasket,
  Smartphone,
  Sofa,
  Sparkles,
  Sprout,
  Stethoscope,
  Store,
  Sun,
  Truck,
  UtensilsCrossed,
  WashingMachine,
  Wheat,
  Wrench,
} from "lucide-react";

/**
 * Types d’activité — slugs stables pour l’URL (`?businessType=`), la colonne
 * `companies.business_type_slug` et la personnalisation métier
 * (`lib/features/activity/*`).
 *
 * ⚠️ Ne jamais renommer un slug existant : des entreprises sont déjà enregistrées
 * avec. Ajouter à la suite dans la bonne catégorie. Un slug inconnu des profils
 * métier retombe automatiquement sur le comportement générique.
 */

/** Grande famille d’activités — sert au regroupement et au filtre de la page de choix. */
export type BusinessCategoryId =
  | "commerce"
  | "restauration"
  | "mode-beaute"
  | "sante"
  | "tech"
  | "auto-moto"
  | "construction"
  | "agri"
  | "services"
  | "autre";

export type BusinessCategory = {
  id: BusinessCategoryId;
  /** Libellé complet (titre de section). */
  label: string;
  /** Libellé court (puce de filtre, tient sur mobile). */
  shortLabel: string;
};

/** Ordre d’affichage des sections. `autre` est traité à part (carte de repli). */
export const BUSINESS_CATEGORIES: readonly BusinessCategory[] = [
  { id: "commerce", label: "Commerce & distribution", shortLabel: "Commerce" },
  { id: "restauration", label: "Restauration & hôtellerie", shortLabel: "Restauration" },
  { id: "mode-beaute", label: "Mode & beauté", shortLabel: "Mode" },
  { id: "sante", label: "Santé & bien-être", shortLabel: "Santé" },
  { id: "tech", label: "Technologie & maison", shortLabel: "Tech" },
  { id: "auto-moto", label: "Auto, moto & engins", shortLabel: "Auto / Moto" },
  { id: "construction", label: "Construction & habitat", shortLabel: "Construction" },
  { id: "agri", label: "Agriculture & élevage", shortLabel: "Agriculture" },
  { id: "services", label: "Services", shortLabel: "Services" },
] as const;

export type BusinessTypeOption = {
  slug: string;
  label: string;
  /** Sous-texte court sous le libellé (SaaS premium). */
  description: string;
  icon: LucideIcon;
  category: BusinessCategoryId;
  /**
   * Mot utilisé dans le placeholder d’inscription : « Nom de votre {storeNamePlaceholderNoun} ».
   * Minuscules, accord français (ex. pharmacie, quincaillerie).
   */
  storeNamePlaceholderNoun: string;
  /**
   * Synonymes et vocabulaire local pour la recherche (« maquis », « cyber »,
   * « fripe »…). Jamais affichés : uniquement indexés.
   */
  keywords?: readonly string[];
  /** Mis en avant (badge « Populaire ») — activités les plus fréquentes. */
  popular?: boolean;
};

export const BUSINESS_TYPES: readonly BusinessTypeOption[] = [
  // ── Commerce & distribution ────────────────────────────────────────────────
  {
    slug: "supermarche-alimentation",
    label: "Supermarché / Alimentation",
    description: "Épicerie, produits frais et grande distribution.",
    icon: Store,
    category: "commerce",
    storeNamePlaceholderNoun: "supermarché",
    keywords: ["superette", "grande surface", "provisions", "libre service", "rayon"],
    popular: true,
  },
  {
    slug: "alimentation-generale",
    label: "Alimentation générale",
    description: "Boutique de quartier, vivres et produits du quotidien.",
    icon: ShoppingBasket,
    category: "commerce",
    storeNamePlaceholderNoun: "boutique",
    keywords: ["boutique de quartier", "epicerie", "kiosque", "vivres", "detail"],
    popular: true,
  },
  {
    slug: "grossiste-distribution",
    label: "Grossiste / Distribution",
    description: "Vente en volume et réseaux B2B.",
    icon: Truck,
    category: "commerce",
    storeNamePlaceholderNoun: "plateforme",
    keywords: ["demi-gros", "depot", "revendeur", "importateur", "b2b"],
  },
  {
    slug: "depot-boissons",
    label: "Dépôt de boissons",
    description: "Casiers, sucreries, eau et boissons en gros.",
    icon: CupSoda,
    category: "commerce",
    storeNamePlaceholderNoun: "dépôt",
    keywords: ["brasserie", "biere", "sucrerie", "casier", "eau minerale", "consigne"],
  },

  // ── Restauration & hôtellerie ──────────────────────────────────────────────
  {
    slug: "restaurant-fast-food",
    label: "Restaurant / Fast-food",
    description: "Restauration sur place ou à emporter.",
    icon: UtensilsCrossed,
    category: "restauration",
    storeNamePlaceholderNoun: "restaurant",
    keywords: ["resto", "gargote", "plats", "cuisine", "livraison", "traiteur"],
    popular: true,
  },
  {
    slug: "boulangerie-patisserie",
    label: "Boulangerie / Pâtisserie",
    description: "Pain, viennoiseries et gâteaux.",
    icon: Croissant,
    category: "restauration",
    storeNamePlaceholderNoun: "boulangerie",
    keywords: ["four", "baguette", "gateau", "viennoiserie", "petrin"],
  },
  {
    slug: "bar-maquis",
    label: "Bar / Maquis / Café",
    description: "Buvette, terrasse et service en salle.",
    icon: Beer,
    category: "restauration",
    storeNamePlaceholderNoun: "maquis",
    keywords: ["buvette", "dolo", "cabaret", "cafe", "terrasse", "boite"],
  },
  {
    slug: "boucherie-poissonnerie",
    label: "Boucherie / Poissonnerie",
    description: "Viande, volaille et poisson au détail.",
    icon: Beef,
    category: "restauration",
    storeNamePlaceholderNoun: "boucherie",
    keywords: ["viande", "poisson", "poulet", "charcuterie", "brochette", "abattage"],
  },
  {
    slug: "hotel-auberge",
    label: "Hôtel / Auberge",
    description: "Chambres, restauration et hébergement.",
    icon: BedDouble,
    category: "restauration",
    storeNamePlaceholderNoun: "hôtel",
    keywords: ["chambre", "hebergement", "motel", "nuitee", "reception", "auberge"],
  },

  // ── Mode & beauté ──────────────────────────────────────────────────────────
  {
    slug: "boutique-vetements",
    label: "Boutique de vêtements",
    description: "Prêt-à-porter, chaussures et accessoires mode.",
    icon: Shirt,
    category: "mode-beaute",
    storeNamePlaceholderNoun: "boutique",
    keywords: ["pret a porter", "friperie", "fripe", "habits", "mode", "enfant"],
    popular: true,
  },
  {
    slug: "chaussures-maroquinerie",
    label: "Chaussures / Maroquinerie",
    description: "Sacs, sandales, valises et articles en cuir.",
    icon: Footprints,
    category: "mode-beaute",
    storeNamePlaceholderNoun: "boutique",
    keywords: ["sac", "sandale", "cuir", "valise", "ceinture", "basket"],
  },
  {
    slug: "tissus-pagnes",
    label: "Tissus / Pagnes",
    description: "Wax, bazin, Faso Dan Fani et couture.",
    icon: Layers,
    category: "mode-beaute",
    storeNamePlaceholderNoun: "boutique",
    keywords: ["wax", "bazin", "faso dan fani", "couture", "tailleur", "metre", "atelier"],
  },
  {
    slug: "bijouterie-horlogerie",
    label: "Bijouterie / Horlogerie",
    description: "Or, argent, montres et alliances.",
    icon: Gem,
    category: "mode-beaute",
    storeNamePlaceholderNoun: "bijouterie",
    keywords: ["or", "argent", "montre", "bijou", "alliance", "orfevre"],
  },
  {
    slug: "cosmetiques",
    label: "Cosmétiques",
    description: "Beauté, parfums, soins et maquillage.",
    icon: Sparkles,
    category: "mode-beaute",
    storeNamePlaceholderNoun: "boutique",
    keywords: ["parfum", "creme", "maquillage", "soin", "cheveux", "meche"],
  },
  {
    slug: "salon-beaute",
    label: "Salon de coiffure / Beauté",
    description: "Coiffure, esthétique, onglerie et barbier.",
    icon: Scissors,
    category: "mode-beaute",
    storeNamePlaceholderNoun: "salon",
    keywords: ["coiffure", "tresse", "barbier", "esthetique", "onglerie", "spa", "institut"],
  },

  // ── Santé & bien-être ──────────────────────────────────────────────────────
  {
    slug: "pharmacie",
    label: "Pharmacie / Parapharmacie",
    description: "Médicaments, soins et bien-être.",
    icon: Pill,
    category: "sante",
    storeNamePlaceholderNoun: "pharmacie",
    keywords: ["officine", "medicament", "ordonnance", "depot pharmaceutique", "dci"],
    popular: true,
  },
  {
    slug: "optique-lunetterie",
    label: "Optique / Lunetterie",
    description: "Lunettes, verres correcteurs et montures.",
    icon: Glasses,
    category: "sante",
    storeNamePlaceholderNoun: "boutique",
    keywords: ["lunette", "verre", "vue", "opticien", "monture", "solaire"],
  },
  {
    slug: "clinique-cabinet",
    label: "Clinique / Cabinet de soins",
    description: "Consultations, laboratoire et consommables.",
    icon: Stethoscope,
    category: "sante",
    storeNamePlaceholderNoun: "établissement",
    keywords: ["cabinet medical", "consultation", "infirmerie", "laboratoire", "dentaire", "soins"],
  },

  // ── Technologie & maison ───────────────────────────────────────────────────
  {
    slug: "telephones-accessoires",
    label: "Téléphones / Accessoires",
    description: "Mobile, coques, chargeurs et high-tech.",
    icon: Smartphone,
    category: "tech",
    storeNamePlaceholderNoun: "boutique",
    keywords: ["gsm", "coque", "chargeur", "ecouteur", "reparation", "puce", "smartphone"],
    popular: true,
  },
  {
    slug: "informatique-bureautique",
    label: "Informatique / Bureautique",
    description: "Ordinateurs, imprimantes et consommables.",
    icon: Laptop,
    category: "tech",
    storeNamePlaceholderNoun: "boutique",
    keywords: ["ordinateur", "pc", "imprimante", "cartouche", "cyber", "reseau", "toner"],
  },
  {
    slug: "electromenager",
    label: "Électroménager",
    description: "Frigos, téléviseurs, climatiseurs et petit électro.",
    icon: WashingMachine,
    category: "tech",
    storeNamePlaceholderNoun: "magasin",
    keywords: ["frigo", "congelateur", "tele", "ventilateur", "climatiseur", "machine a laver"],
  },
  {
    slug: "papeterie-librairie",
    label: "Librairie / Papeterie",
    description: "Fournitures scolaires, livres et bureautique.",
    icon: BookOpen,
    category: "tech",
    storeNamePlaceholderNoun: "librairie",
    keywords: ["fourniture scolaire", "cahier", "stylo", "livre", "rentree", "photocopie"],
  },
  {
    slug: "energie-solaire-gaz",
    label: "Énergie solaire / Gaz",
    description: "Panneaux, batteries, groupes et bouteilles de gaz.",
    icon: Sun,
    category: "tech",
    storeNamePlaceholderNoun: "magasin",
    keywords: ["panneau solaire", "batterie", "groupe electrogene", "butane", "bonbonne", "onduleur"],
  },

  // ── Auto, moto & engins ────────────────────────────────────────────────────
  {
    slug: "pieces-moto",
    label: "Pièces moto",
    description: "Deux-roues, équipement et entretien.",
    icon: Wrench,
    category: "auto-moto",
    storeNamePlaceholderNoun: "magasin",
    keywords: ["deux roues", "scooter", "chaine", "plaquette", "pneu", "jakarta", "tricycle"],
    popular: true,
  },
  {
    slug: "pieces-auto",
    label: "Pièces auto",
    description: "Pièces détachées et entretien véhicules.",
    icon: Package,
    category: "auto-moto",
    storeNamePlaceholderNoun: "magasin",
    keywords: ["voiture", "filtre", "batterie", "huile", "piece detachee", "amortisseur"],
  },
  {
    slug: "vente-engins",
    label: "Ventes d'engins",
    description: "Motos, voitures et engins motorisés.",
    icon: Car,
    category: "auto-moto",
    storeNamePlaceholderNoun: "magasin",
    keywords: ["moto", "tricycle", "concession", "immatriculation", "carte grise", "ww"],
  },
  {
    slug: "garage-mecanique",
    label: "Garage / Atelier mécanique",
    description: "Réparation, vidange, diagnostic et tôlerie.",
    icon: Cog,
    category: "auto-moto",
    storeNamePlaceholderNoun: "garage",
    keywords: ["mecanicien", "vidange", "diagnostic", "tolerie", "peinture auto", "reparation"],
  },
  {
    slug: "station-service",
    label: "Station-service / Carburant",
    description: "Essence, gasoil, lubrifiants et boutique.",
    icon: Fuel,
    category: "auto-moto",
    storeNamePlaceholderNoun: "station",
    keywords: ["essence", "gasoil", "pompe", "lubrifiant", "carburant", "petrole"],
  },

  // ── Construction & habitat ─────────────────────────────────────────────────
  {
    slug: "quincaillerie",
    label: "Quincaillerie",
    description: "Outillage, bricolage et fournitures.",
    icon: Hammer,
    category: "construction",
    storeNamePlaceholderNoun: "quincaillerie",
    keywords: ["outillage", "vis", "clou", "bricolage", "cadenas", "serrure"],
    popular: true,
  },
  {
    slug: "materiaux-construction",
    label: "Matériaux de construction",
    description: "Ciment, fer, bois et gros œuvre.",
    icon: Building2,
    category: "construction",
    storeNamePlaceholderNoun: "magasin",
    keywords: ["ciment", "fer", "brique", "sable", "gravier", "tole", "agglo"],
  },
  {
    slug: "electricite-plomberie",
    label: "Électricité / Plomberie",
    description: "Câbles, disjoncteurs, tuyaux et sanitaires.",
    icon: Plug,
    category: "construction",
    storeNamePlaceholderNoun: "magasin",
    keywords: ["cable", "disjoncteur", "tuyau", "robinet", "sanitaire", "pvc", "ampoule"],
  },
  {
    slug: "peinture-decoration",
    label: "Peinture / Décoration",
    description: "Peinture, enduits, carrelage et finitions.",
    icon: Paintbrush,
    category: "construction",
    storeNamePlaceholderNoun: "magasin",
    keywords: ["peinture", "enduit", "carrelage", "faux plafond", "deco", "vernis"],
  },
  {
    slug: "meubles-ameublement",
    label: "Meubles / Ameublement",
    description: "Salons, matelas, lits et mobilier de bureau.",
    icon: Sofa,
    category: "construction",
    storeNamePlaceholderNoun: "magasin",
    keywords: ["salon", "matelas", "lit", "table", "chaise", "mobilier", "armoire"],
  },
  {
    slug: "menuiserie-metallerie",
    label: "Menuiserie / Métallerie",
    description: "Bois, soudure, portes et fenêtres sur mesure.",
    icon: Ruler,
    category: "construction",
    storeNamePlaceholderNoun: "atelier",
    keywords: ["bois", "soudure", "ferronnerie", "porte", "fenetre", "aluminium", "vitrerie"],
  },

  // ── Agriculture & élevage ──────────────────────────────────────────────────
  {
    slug: "produits-agricoles",
    label: "Céréales / Produits agricoles",
    description: "Mil, maïs, riz, sésame et achat de récoltes.",
    icon: Wheat,
    category: "agri",
    storeNamePlaceholderNoun: "magasin",
    keywords: ["mil", "mais", "riz", "sesame", "arachide", "niebe", "sac", "recolte", "moulin"],
  },
  {
    slug: "intrants-elevage",
    label: "Intrants agricoles / Élevage",
    description: "Engrais, semences, aliments bétail et vétérinaire.",
    icon: Sprout,
    category: "agri",
    storeNamePlaceholderNoun: "magasin",
    keywords: ["engrais", "semence", "pesticide", "aliment betail", "volaille", "veterinaire", "ferme"],
  },

  // ── Services ───────────────────────────────────────────────────────────────
  {
    slug: "imprimerie-serigraphie",
    label: "Imprimerie / Sérigraphie",
    description: "Impression, banderoles, flocage et infographie.",
    icon: Printer,
    category: "services",
    storeNamePlaceholderNoun: "imprimerie",
    keywords: ["impression", "flyer", "banderole", "serigraphie", "infographie", "flocage", "plastification"],
  },
  {
    slug: "transport-logistique",
    label: "Transport / Logistique",
    description: "Colis, fret, livraison et déménagement.",
    icon: Bus,
    category: "services",
    storeNamePlaceholderNoun: "société",
    keywords: ["colis", "fret", "livraison", "car", "camion", "demenagement", "coursier"],
  },
  {
    slug: "immobilier-location",
    label: "Immobilier / Location",
    description: "Baux, loyers, quittances et gérance de biens.",
    icon: KeyRound,
    category: "services",
    storeNamePlaceholderNoun: "agence",
    keywords: ["loyer", "bail", "quittance", "maison", "appartement", "gerance", "location"],
  },
  {
    slug: "mobile-money-transfert",
    label: "Mobile money / Transfert",
    description: "Dépôts, retraits, transferts et cybercafé.",
    icon: Banknote,
    category: "services",
    storeNamePlaceholderNoun: "kiosque",
    keywords: ["orange money", "moov", "wave", "transfert", "cyber", "depot", "retrait", "commission"],
  },

  // ── Repli ──────────────────────────────────────────────────────────────────
  {
    slug: "autre-commerce",
    label: "Autre commerce",
    description: "Une activité qui ne figure pas dans la liste.",
    icon: MoreHorizontal,
    category: "autre",
    storeNamePlaceholderNoun: "commerce",
    keywords: ["autre", "divers", "je ne trouve pas"],
  },
] as const;

/** Slug du repli « je ne trouve pas mon activité ». */
export const OTHER_BUSINESS_TYPE_SLUG = "autre-commerce";

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

/** Minuscules sans accents ni ponctuation — pour comparer « Pâtisserie » et « patisserie ». */
export function normalizeForSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Index de recherche pré-calculé (libellé + description + synonymes). */
const SEARCH_INDEX: ReadonlyMap<string, string> = new Map(
  BUSINESS_TYPES.map((b) => [
    b.slug,
    normalizeForSearch(
      [b.label, b.description, ...(b.keywords ?? []), b.slug.replace(/-/g, " ")].join(" "),
    ),
  ]),
);

/**
 * Recherche tolérante : chaque mot saisi doit apparaître dans l’index d’une
 * activité (libellé, description ou synonymes). Requête vide = toute la liste.
 */
export function searchBusinessTypes(query: string): BusinessTypeOption[] {
  const terms = normalizeForSearch(query).split(" ").filter(Boolean);
  if (terms.length === 0) return [...BUSINESS_TYPES];
  return BUSINESS_TYPES.filter((b) => {
    const haystack = SEARCH_INDEX.get(b.slug) ?? "";
    return terms.every((t) => haystack.includes(t));
  });
}

/** Regroupe une liste d’activités par catégorie, dans l’ordre de `BUSINESS_CATEGORIES`. */
export function groupByCategory(
  options: readonly BusinessTypeOption[],
): { category: BusinessCategory; options: BusinessTypeOption[] }[] {
  return BUSINESS_CATEGORIES.map((category) => ({
    category,
    options: options.filter((o) => o.category === category.id),
  })).filter((group) => group.options.length > 0);
}

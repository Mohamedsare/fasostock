/**
 * « Motos identifiées » — un engin PHYSIQUE et son identité gravée.
 *
 * Le produit du catalogue reste le MODÈLE (« Sanili 110 », son prix, son stock) ;
 * une `EngineUnit` est UN exemplaire : son numéro de châssis, son numéro de moteur,
 * sa couleur, et son état (en cour ou déjà facturé, et à quelle vente).
 *
 * Ce fichier ne contient que des types et des fonctions pures : le formulaire produit
 * et l'écran de vente s'en servent sans rien interroger.
 */

/** État d'un engin. `sold` = sorti par une vente (facture éditée). */
export type EngineUnitStatus = "in_stock" | "sold";

/** Un engin tel que lu en base (table `engine_units`). */
export type EngineUnit = {
  id: string;
  companyId: string;
  productId: string;
  storeId: string | null;
  chassisNumber: string;
  engineNumber: string | null;
  color: string | null;
  status: EngineUnitStatus;
  saleId: string | null;
  soldAt: string | null;
  notes: string | null;
};

/**
 * Un engin saisi dans le formulaire produit. `id` présent = ligne existante
 * (mise à jour) ; absent = nouvel engin (insertion).
 */
export type EngineUnitDraft = {
  id?: string;
  chassisNumber: string;
  engineNumber: string;
  color: string;
};

/** Longueur retenue pour un châssis / un moteur (bien au-delà des 17 caractères d'un VIN). */
export const ENGINE_UNIT_FIELD_MAX_LENGTH = 60;

/**
 * Met un numéro gravé sous sa forme de référence : majuscules, sans espace.
 *
 * Le châssis se relève sur un cadre poussiéreux, souvent recopié d'un cahier :
 * « lc4b 12 34 » et « LC4B1234 » désignent le MÊME engin. On range donc toujours
 * la même forme — identique à celle du trigger SQL, pour que le doublon soit vu
 * dans le formulaire avant même d'atteindre la base.
 */
export function normalizeEngineIdentifier(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/\s+/g, "")
    .toUpperCase()
    .slice(0, ENGINE_UNIT_FIELD_MAX_LENGTH);
}

/** Couleur : simple libellé, on retire seulement les espaces superflus. */
export function normalizeEngineColor(value: string | null | undefined): string {
  return (value ?? "").trim().slice(0, ENGINE_UNIT_FIELD_MAX_LENGTH);
}

/**
 * Nettoie les lignes du formulaire comme le fera la base : lignes vides retirées,
 * numéros normalisés. Ne dédoublonne pas — c'est une ERREUR à montrer, pas quelque
 * chose à corriger en silence (voir `findDuplicateChassis`).
 */
export function normalizeEngineUnitDrafts(
  drafts: readonly EngineUnitDraft[],
): EngineUnitDraft[] {
  const out: EngineUnitDraft[] = [];
  for (const d of drafts) {
    const chassisNumber = normalizeEngineIdentifier(d.chassisNumber);
    if (!chassisNumber) continue;
    out.push({
      ...(d.id ? { id: d.id } : {}),
      chassisNumber,
      engineNumber: normalizeEngineIdentifier(d.engineNumber),
      color: normalizeEngineColor(d.color),
    });
  }
  return out;
}

/** Premier châssis saisi deux fois dans la même liste, ou `null`. */
export function findDuplicateChassis(
  drafts: readonly EngineUnitDraft[],
): string | null {
  const seen = new Set<string>();
  for (const d of drafts) {
    const key = normalizeEngineIdentifier(d.chassisNumber);
    if (!key) continue;
    if (seen.has(key)) return key;
    seen.add(key);
  }
  return null;
}

/** Libellé d'un engin dans une liste déroulante : « LC4B1234 · Rouge · moteur 1P39 ». */
export function engineUnitLabel(unit: EngineUnit): string {
  const parts = [unit.chassisNumber];
  if (unit.color) parts.push(unit.color);
  if (unit.engineNumber) parts.push(`moteur ${unit.engineNumber}`);
  return parts.join(" · ");
}

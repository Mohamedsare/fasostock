/**
 * « Autres noms » d'un produit — alias de RECHERCHE.
 *
 * Un même article s'appelle rarement pareil chez tout le monde : « Omo » ou
 * « savon en poudre », « Maggi » ou « cube ». Le catalogue garde UN nom affiché
 * (`ProductItem.name`, celui des tickets et des factures) ; les alias servent
 * seulement à retrouver le produit quand on le cherche autrement.
 *
 * Fonctions pures : aucune requête, aucun état — utilisables partout (caisse,
 * catalogue, codes-barres) sans surcoût.
 */

import type { ProductItem } from "./types";

/** Nombre d'alias en plus du nom principal (21 noms en tout). Aligné sur la contrainte SQL. */
export const MAX_SEARCH_ALIASES = 20;

/** Longueur d'un alias, alignée sur la troncature du trigger SQL. */
export const SEARCH_ALIAS_MAX_LENGTH = 120;

/**
 * Nettoie une saisie d'alias comme le fait la base : vides retirés, doublons
 * (insensibles à la casse) retirés, alias identique au nom principal retiré,
 * troncature, puis plafond. Le formulaire s'en sert pour envoyer exactement ce
 * que la base gardera — donc pour afficher, après enregistrement, ce que
 * l'utilisateur a vu.
 */
export function normalizeSearchAliases(
  aliases: readonly string[] | null | undefined,
  mainName: string,
): string[] {
  if (!aliases || aliases.length === 0) return [];
  const main = mainName.trim().toLowerCase();
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of aliases) {
    const value = (raw ?? "").trim().slice(0, SEARCH_ALIAS_MAX_LENGTH);
    if (!value) continue;
    const key = value.toLowerCase();
    if (key === main || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
    if (out.length >= MAX_SEARCH_ALIASES) break;
  }
  return out;
}

/** Alias d'un produit tels que lus en base, robustes à une valeur inattendue. */
export function productSearchAliases(
  product: Pick<ProductItem, "search_aliases">,
): string[] {
  const raw = product.search_aliases;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((a) => (typeof a === "string" ? a.trim() : ""))
    .filter((a) => a.length > 0);
}

/**
 * Le produit correspond-il à la recherche par son nom OU par l'un de ses autres noms ?
 *
 * `enabled` reflète le réglage du propriétaire : à false, la recherche se comporte
 * exactement comme avant (nom principal seul), même si des alias existent en base.
 *
 * @param query requête DÉJÀ passée en minuscules (les appelants la préparent une fois).
 */
export function productNameMatches(
  product: Pick<ProductItem, "name" | "search_aliases">,
  query: string,
  enabled: boolean,
): boolean {
  if (product.name.toLowerCase().includes(query)) return true;
  if (!enabled) return false;
  return productSearchAliases(product).some((a) =>
    a.toLowerCase().includes(query),
  );
}

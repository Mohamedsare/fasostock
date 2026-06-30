/**
 * Génération de SKU automatique, propre à chaque entreprise (tenant).
 *
 * - Préfixe dérivé du nom de l'entreprise → format différent par tenant.
 * - Numéro séquentiel zéro-paddé, calculé à partir des SKU existants.
 * - Évite toute collision avec un SKU déjà utilisé (contrainte UNIQUE(company_id, sku)).
 *
 * 100 % additif : ne sert qu'à **suggérer** un SKU à la création d'un produit ;
 * les produits et entreprises existants ne sont jamais modifiés.
 */

/** Préfixe SKU (2–4 lettres MAJ) dérivé du nom de l'entreprise. */
export function skuPrefixFromCompany(companyName: string | null | undefined): string {
  const cleaned = (companyName ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .trim();
  const words = cleaned.split(/\s+/).filter(Boolean);

  let prefix = "";
  if (words.length >= 2) {
    prefix = words.slice(0, 3).map((w) => w[0]).join("");
  } else if (words.length === 1) {
    prefix = words[0]!.slice(0, 4);
  }
  if (prefix.length < 2) prefix = `${prefix}PRD`.slice(0, 3);
  return prefix;
}

/** Échappe les caractères spéciaux regex (par sécurité, le préfixe est déjà A-Z0-9). */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Prochain SKU disponible pour l'entreprise : `{PREFIXE}-{NNNN}`.
 * `existingSkus` = SKU déjà présents (les valeurs nulles/vides sont ignorées).
 */
export function suggestNextSku(
  companyName: string | null | undefined,
  existingSkus: Array<string | null | undefined>,
): string {
  const prefix = skuPrefixFromCompany(companyName);
  const used = new Set(
    existingSkus
      .map((s) => (s ?? "").trim())
      .filter((s) => s.length > 0),
  );

  const re = new RegExp(`^${escapeRegex(prefix)}-(\\d+)$`);
  let max = 0;
  for (const s of used) {
    const m = re.exec(s);
    if (m) max = Math.max(max, parseInt(m[1]!, 10));
  }

  let n = max + 1;
  let candidate = `${prefix}-${String(n).padStart(4, "0")}`;
  // Garde-fou anti-collision (SKU manuels qui tomberaient sur la même valeur).
  while (used.has(candidate)) {
    n += 1;
    candidate = `${prefix}-${String(n).padStart(4, "0")}`;
  }
  return candidate;
}

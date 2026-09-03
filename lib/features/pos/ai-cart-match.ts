/**
 * Rapprochement « ce que le client a écrit » ↔ « ce que la boutique vend ».
 *
 * Volontairement déterministe et hors IA : le modèle lit la photo et propose des
 * libellés, mais c'est ce fichier qui décide quels PRODUITS RÉELS peuvent
 * correspondre. Un modèle qui inventerait « Sucre Bio 2 kg » ne peut donc jamais
 * faire entrer une ligne fantôme dans le panier — au pire il ne trouve rien.
 */

export type MatchCandidate = {
  id: string;
  name: string;
  unit: string;
  salePrice: number;
  stock: number;
  /** 0 → 1. Au-dessus de `MATCH_SURE`, la ligne est présélectionnée sans confirmation. */
  score: number;
};

export type MatchableProduct = {
  id: string;
  name: string;
  sku?: string | null;
  barcode?: string | null;
  unit?: string | null;
  salePrice?: number | null;
  aliases?: string[] | null;
  stock?: number | null;
};

/** Au-dessus : on considère la ligne résolue (le caissier peut toujours la changer). */
export const MATCH_SURE = 0.62;

const STOP_WORDS = new Set([
  "de", "du", "des", "la", "le", "les", "un", "une", "et", "en", "au", "aux",
  "pour", "avec", "sur", "sans", "d", "l",
]);

export function normalizeText(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokenize(raw: string): string[] {
  return normalizeText(raw)
    .split(" ")
    .filter((t) => t.length > 0 && !STOP_WORDS.has(t));
}

/** Similarité 0→1 entre deux mots : égalité, préfixe, puis distance d'édition bornée. */
function wordScore(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length >= 3 && b.startsWith(a)) return 0.9;
  if (b.length >= 3 && a.startsWith(b)) return 0.9;
  const d = boundedLevenshtein(a, b, 2);
  if (d < 0) return 0;
  const longest = Math.max(a.length, b.length);
  if (longest <= 3) return d === 0 ? 1 : 0;
  return Math.max(0, 1 - d / longest) * 0.85;
}

/** Levenshtein arrêté dès que la distance dépasse `max` (renvoie -1). */
function boundedLevenshtein(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return -1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const v = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
      row.push(v);
      if (v < best) best = v;
    }
    if (best > max) return -1;
    prev = row;
  }
  const d = prev[b.length];
  return d > max ? -1 : d;
}

/**
 * Score d'une requête contre un libellé produit : chaque mot cherché va chercher
 * son meilleur équivalent dans le nom du produit. Les mots trouvés comptent, les
 * mots en trop dans le nom du produit pénalisent à peine (« Sucre » doit pouvoir
 * matcher « Sucre en morceaux 1 kg »).
 */
function labelScore(queryTokens: string[], target: string): number {
  const targetTokens = tokenize(target);
  if (queryTokens.length === 0 || targetTokens.length === 0) return 0;
  let sum = 0;
  let headBest = 0;
  for (let i = 0; i < queryTokens.length; i += 1) {
    const q = queryTokens[i];
    let best = 0;
    for (const t of targetTokens) {
      const s = wordScore(q, t);
      if (s > best) best = s;
      if (best === 1) break;
    }
    if (i === 0) headBest = best;
    sum += best;
  }
  const coverage = sum / queryTokens.length;
  // Léger bonus quand le produit n'a pas beaucoup de mots en trop : entre deux
  // produits qui couvrent la demande, le plus proche l'emporte.
  const extra = Math.max(0, targetTokens.length - queryTokens.length);
  const tightness = 1 - Math.min(0.25, extra * 0.04);
  const score = coverage * tightness;

  /*
   * Le PREMIER mot dit la NATURE de l'article (« disque », « amortisseur »,
   * « pile », « savon ») ; le reste dit le modèle. Sans ce garde-fou, une pièce
   * absente du catalogue passait pour une autre au seul motif qu'elles partagent
   * leur compatibilité : « CHATAU VIDE 115 FINN SIRIUS » était donné pour sûr
   * contre « Pompe complète 115 Sirius Finn » (0,67) — deux pièces différentes,
   * facturées l'une pour l'autre. Nature non retrouvée : la ligne reste
   * proposée, mais jamais présélectionnée — le modèle puis le caissier tranchent.
   */
  if (headBest < 0.6) return Math.min(score, MATCH_SURE - 0.01);
  return score;
}

/**
 * Meilleurs candidats du catalogue pour un libellé lu sur la photo.
 * Les produits hors stock restent proposés, mais en fin de liste : le caissier
 * doit voir que l'article demandé existe et qu'il est en rupture.
 */
export function matchCandidates(
  label: string,
  products: MatchableProduct[],
  limit = 5,
): MatchCandidate[] {
  const q = tokenize(label);
  if (q.length === 0) return [];
  const raw = normalizeText(label);

  const scored: MatchCandidate[] = [];
  for (const p of products) {
    let score = labelScore(q, p.name);
    for (const alias of p.aliases ?? []) {
      const s = labelScore(q, alias);
      if (s > score) score = s;
    }
    // Un code exact (SKU / code-barres) écrit sur la liste ne se discute pas.
    const sku = (p.sku ?? "").trim().toLowerCase();
    const barcode = (p.barcode ?? "").trim().toLowerCase();
    if ((sku && raw === sku) || (barcode && raw === barcode)) score = 1;
    if (score < 0.3) continue;
    const stock = Math.max(0, Math.floor(p.stock ?? 0));
    scored.push({
      id: p.id,
      name: p.name,
      unit: (p.unit ?? "u") || "u",
      salePrice: Math.max(0, Math.round(p.salePrice ?? 0)),
      stock,
      // La rupture ne dégrade pas la pertinence, seulement l'ordre d'affichage.
      score: Number(score.toFixed(3)),
    });
  }

  scored.sort((a, b) => {
    if (a.stock > 0 !== b.stock > 0) return a.stock > 0 ? -1 : 1;
    return b.score - a.score;
  });
  return scored.slice(0, limit);
}

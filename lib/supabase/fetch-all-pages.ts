/**
 * Lecture complète d'une table malgré le plafond de lignes de PostgREST.
 *
 * PostgREST refuse de renvoyer plus de `max_rows` lignes par réponse (1000 sur ce
 * projet, cf. `supabase/config.toml`). Au-delà, la réponse est **tronquée en silence** :
 * pas d'erreur, pas d'en-tête à vérifier dans le code appelant, pas le moindre indice
 * dans les données. Une requête sans pagination ne « plante » donc jamais — elle ment.
 *
 * C'est le pire des deux mondes pour un logiciel de gestion : une caisse qui ne trouve
 * plus le 1001ᵉ produit, un chiffre d'affaires mensuel amputé sans que personne ne le
 * voie. D'où ce helper, à utiliser pour **toute** lecture dont le volume dépend des
 * données du client (produits, ventes, clients, mouvements…) plutôt que d'une constante.
 *
 * Les lectures naturellement bornées (une entreprise, les rôles, les catégories d'un
 * formulaire) n'en ont pas besoin.
 */

/** Plafond de lignes renvoyées par réponse — doit rester aligné sur `max_rows` (config.toml). */
export const POSTGREST_MAX_ROWS = 1000;

/**
 * Garde-fou : au-delà, on préfère s'arrêter plutôt que de continuer à empiler des pages.
 * Une lecture qui atteint ce seuil trahit presque toujours un filtre oublié, et vider la
 * base dans l'onglet d'un commerçant le ferait tomber pour de bon. 200 000 lignes laissent
 * une marge très large au-dessus des plus gros clients actuels.
 */
export const FETCH_ALL_PAGES_HARD_LIMIT = 200_000;

/** Forme d'une réponse PostgREST — volontairement permissive pour accepter tous les builders. */
type PageResponse<TRow, TError> = {
  data: TRow[] | null;
  error: TError | null;
};

/**
 * Enchaîne les pages `.range(from, to)` jusqu'à en voir la fin, et renvoie la même forme
 * `{ data, error }` qu'une requête Supabase — les appelants gardent donc leur gestion
 * d'erreur existante (`if (error) throw mapSupabaseError(error)`) sans rien changer.
 *
 * ⚠️ **L'ordre doit être total.** Deux lignes que le tri ne départage pas peuvent changer
 * de place entre deux requêtes : la même ligne serait alors lue deux fois, et une autre
 * jamais. Chaque appelant doit donc terminer ses `.order(...)` par une clé unique —
 * `.order("id")` — même quand le tri métier semble suffire (deux produits peuvent porter
 * le même nom, deux ventes la même milliseconde).
 *
 * @example
 * const { data, error } = await fetchAllPages((from, to) =>
 *   supabase
 *     .from("products")
 *     .select(fields)
 *     .eq("company_id", companyId)
 *     .order("name", { ascending: true })
 *     .order("id", { ascending: true }) // départage les homonymes
 *     .range(from, to),
 * );
 */
export async function fetchAllPages<TRow, TError>(
  page: (from: number, to: number) => PromiseLike<PageResponse<TRow, TError>>,
): Promise<{ data: TRow[]; error: null } | { data: null; error: TError }> {
  const rows: TRow[] = [];

  for (let from = 0; ; from += POSTGREST_MAX_ROWS) {
    const { data, error } = await page(from, from + POSTGREST_MAX_ROWS - 1);
    if (error) return { data: null, error };

    const batch = data ?? [];
    for (const row of batch) rows.push(row);

    // Page incomplète = dernière page. Évite un aller-retour de plus dans le cas courant
    // (la très grande majorité des lectures tient dans une seule page).
    if (batch.length < POSTGREST_MAX_ROWS) return { data: rows, error: null };
    if (rows.length >= FETCH_ALL_PAGES_HARD_LIMIT) return { data: rows, error: null };
  }
}

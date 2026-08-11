import { POSTGREST_MAX_ROWS } from "./fetch-all-pages";

/**
 * Lecture par lots d'identifiants — l'indispensable compagnon de `fetchAllPages`.
 *
 * Un filtre `.in("id", [...])` voyage dans l'URL de la requête, et PostgREST la refuse
 * au-delà de quelques kilo-octets. À 800 identifiants l'URL dépassait 29 ko : le tableau
 * de bord tombait en erreur dès qu'une entreprise passait 800 ventes sur la période —
 * c'est-à-dire précisément chez les clients qui marchent bien.
 *
 * Deux plafonds se combinent ici, et il faut les traiter tous les deux :
 * — la **taille de l'URL** en entrée, réglée en découpant la liste d'identifiants ;
 * — le **nombre de lignes** en sortie, réglé en paginant chaque lot. Un seul lot de
 *   120 ventes peut largement dépasser 1000 `sale_items` ; sans pagination, le coût
 *   d'achat manquant gonflait la marge affichée.
 */

/** 120 identifiants ≈ 4,5 ko d'URL — large marge sous la limite, et déjà la valeur retenue ailleurs. */
export const IN_FILTER_CHUNK_SIZE = 120;

/**
 * Lots exécutés de front. Le découpage plus fin multiplie les allers-retours : les
 * paralléliser garde les écrans aussi rapides qu'avant, sans inonder la base.
 */
const CHUNK_CONCURRENCY = 4;

/**
 * Exécute `run` sur chaque lot d'identifiants, pagine chaque lot jusqu'à sa dernière
 * ligne, et concatène le tout.
 *
 * Une erreur sur un lot fait échouer l'ensemble : un résultat partiel afficherait des
 * chiffres faux, ce qui est pire qu'un écran en erreur.
 *
 * ⚠️ `run` reçoit une fenêtre `[from, to]` à passer à `.range()`, et **doit** trier sur
 * une clé unique (`.order("id")`) : sans ordre total, deux pages successives peuvent
 * répéter ou omettre des lignes.
 */
export async function fetchByChunks<T>(
  ids: readonly string[],
  run: (chunk: string[], from: number, to: number) => Promise<T[]>,
): Promise<T[]> {
  if (ids.length === 0) return [];

  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += IN_FILTER_CHUNK_SIZE) {
    chunks.push(ids.slice(i, i + IN_FILTER_CHUNK_SIZE));
  }

  const readChunkFully = async (chunk: string[]): Promise<T[]> => {
    const rows: T[] = [];
    for (let from = 0; ; from += POSTGREST_MAX_ROWS) {
      const page = await run(chunk, from, from + POSTGREST_MAX_ROWS - 1);
      for (const row of page) rows.push(row);
      // Page incomplète = dernière page.
      if (page.length < POSTGREST_MAX_ROWS) return rows;
    }
  };

  const out: T[] = [];
  for (let i = 0; i < chunks.length; i += CHUNK_CONCURRENCY) {
    const batch = chunks.slice(i, i + CHUNK_CONCURRENCY);
    const settled = await Promise.all(batch.map(readChunkFully));
    for (const rows of settled) {
      for (const row of rows) out.push(row);
    }
  }
  return out;
}

/**
 * Réclamer, de façon optimiste, une colonne dont la migration n'est peut-être pas encore
 * jouée.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE PROBLÈME QUE ÇA RÉSOUT
 * ─────────────────────────────────────────────────────────────────────────────
 * Le code part en production avant que la migration ne soit passée. Réclamer une colonne
 * absente fait échouer la requête ENTIÈRE — et quand cette requête est celle du contexte
 * applicatif, il ne reste ni menu, ni droits, ni application, pour TOUS les clients et
 * pas seulement pour ceux qui utiliseraient la nouveauté.
 *
 * La parade : rejouer sans la colonne à la première erreur « colonne inconnue », et s'en
 * souvenir pour ne pas repayer un aller-retour à chaque lecture.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE SOUVENIR DOIT EXPIRER
 * ─────────────────────────────────────────────────────────────────────────────
 * Parce que « colonne absente » n'est pas toujours un verdict durable. PostgREST sert ses
 * requêtes à partir d'un cache du schéma : pendant les quelques secondes qui suivent un
 * `db push`, il refuse encore la colonne qui vient pourtant d'être créée.
 *
 * Une seule requête tombée dans cette fenêtre suffisait à graver « absente ». Côté
 * serveur, où la variable est partagée par tout le processus Next, le module restait
 * alors éteint pour TOUTES les entreprises — migration appliquée ou non — jusqu'au
 * prochain redémarrage. Rien ne remettait jamais le drapeau à l'endroit.
 *
 * On DATE donc le constat au lieu de le graver. Passé le délai, la colonne retente sa
 * chance : si elle est là, tout repart de soi-même ; sinon le constat est simplement
 * redaté, au prix d'un aller-retour perdu toutes les cinq minutes.
 */

/**
 * Assez court pour qu'un `db push` se rattrape tout seul pendant que l'équipe déploie,
 * assez long pour que le cas « migration vraiment pas jouée » ne coûte presque rien.
 */
const DEFAULT_RECHECK_MS = 5 * 60_000;

export type OptimisticColumn = {
  /**
   * Faut-il réclamer la colonne dans la prochaine requête ?
   *
   * À lire UNE fois par requête, et à conserver : c'est cette même valeur qui dira, en
   * cas d'échec, si l'erreur peut être imputée à la colonne optionnelle.
   */
  available(): boolean;
  /** La lecture a échoué faute de colonne : on s'en souvient, pour un temps seulement. */
  markMissing(): void;
};

export function createOptimisticColumn(
  recheckMs: number = DEFAULT_RECHECK_MS,
): OptimisticColumn {
  let missingSince: number | null = null;

  return {
    available(): boolean {
      if (missingSince === null) return true;
      if (Date.now() - missingSince < recheckMs) return false;
      // Fenêtre écoulée : on redonne sa chance à la colonne. Si elle manque toujours,
      // `markMissing()` redatera le constat et l'on repartira pour un tour.
      missingSince = null;
      return true;
    },
    markMissing(): void {
      missingSince = Date.now();
    },
  };
}

/**
 * Vrai si l'erreur dit « cette colonne n'existe pas ».
 *
 * `42703` = `undefined_column`, verdict de Postgres lui-même.
 * `PGRST204` = refus de PostgREST sur la foi de son cache de schéma — donc possiblement
 * transitoire, ce qui est exactement la raison d'être de l'expiration ci-dessus.
 *
 * Le repli sur le message couvre les variantes de formulation ; il est volontairement
 * étroit (le nom de la colonne doit y figurer) pour ne jamais confondre une panne réseau
 * ou un jeton expiré avec une migration manquante.
 */
export function isUndefinedColumnError(error: unknown, columnName: string): boolean {
  const e = error as { code?: string; message?: string } | null;
  if (!e) return false;
  if (e.code === "42703" || e.code === "PGRST204") return true;
  return typeof e.message === "string" && e.message.includes(columnName);
}

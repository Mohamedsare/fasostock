import { toUserMessage, UserFriendlyError } from "@/lib/errors/app-error-mapper";
import { formatUnknownErrorMessage } from "@/lib/utils/format-unknown-error";

/**
 * Traduit une erreur technique (Postgres, PostgREST, réseau) en message
 * COMPRÉHENSIBLE par un commerçant. Aucun jargon ne doit atteindre l'écran :
 * « canceling statement due to statement timeout » ne veut rien dire pour
 * l'utilisateur et ne lui indique pas quoi faire.
 *
 * `technical` reste disponible pour un bloc « Détails techniques » replié et
 * pour les logs — on masque, on ne perd pas l'information.
 */
export type FriendlyError = {
  /** Phrase courte : ce qui s'est passé. */
  title: string;
  /** Ce que l'utilisateur peut faire maintenant. */
  hint: string;
  /** Un nouvel essai a une chance d'aboutir. */
  retryable: boolean;
  /** Message d'origine (jamais affiché en clair sans être replié). */
  technical: string;
};

/** Codes Postgres / PostgREST rencontrés côté client. */
function codeOf(error: unknown): string {
  if (error && typeof error === "object") {
    const c = (error as { code?: unknown }).code;
    if (typeof c === "string") return c;
    if (typeof c === "number") return String(c);
  }
  return "";
}

export function toFriendlyError(
  error: unknown,
  fallbackTitle = "Chargement impossible",
): FriendlyError {
  const technical = formatUnknownErrorMessage(error, fallbackTitle);
  const code = codeOf(error);
  const low = technical.toLowerCase();

  // Message déjà rédigé pour l'utilisateur par la couche métier.
  if (error instanceof UserFriendlyError) {
    return { title: error.message, hint: "", retryable: true, technical };
  }

  // 57014 — requête annulée côté serveur (statement_timeout). Cas typique :
  // historique très volumineux demandé d'un seul coup.
  if (code === "57014" || low.includes("statement timeout") || low.includes("timeout")) {
    return {
      title: "Le chargement a pris trop de temps",
      hint: "Il y a beaucoup de données à afficher. Filtrez par produit ou réessayez : les données sont intactes.",
      retryable: true,
      technical,
    };
  }

  // Hors ligne / coupure réseau (fetch échoué avant réponse serveur).
  if (
    low.includes("failed to fetch") ||
    low.includes("networkerror") ||
    low.includes("network request failed") ||
    low.includes("load failed")
  ) {
    return {
      title: "Connexion internet instable",
      hint: "Vérifiez votre connexion, puis réessayez.",
      retryable: true,
      technical,
    };
  }

  // Session expirée / jeton invalide.
  if (
    code === "PGRST301" ||
    code === "401" ||
    low.includes("jwt") ||
    low.includes("token is expired") ||
    low.includes("not authenticated") ||
    low.includes("non authentifié")
  ) {
    return {
      title: "Session expirée",
      hint: "Reconnectez-vous pour continuer.",
      retryable: false,
      technical,
    };
  }

  // 42501 — RLS / droits insuffisants.
  if (code === "42501" || low.includes("row-level security") || low.includes("permission denied")) {
    return {
      title: "Accès non autorisé",
      hint: "Votre compte n'a pas les droits sur ces données. Contactez le propriétaire.",
      retryable: false,
      technical,
    };
  }

  // 23505 doublon, 23503 clé étrangère — surtout en écriture.
  if (code === "23505" || low.includes("duplicate key")) {
    return {
      title: "Cet enregistrement existe déjà",
      hint: "Modifiez la valeur en doublon puis réessayez.",
      retryable: false,
      technical,
    };
  }
  if (code === "23503" || low.includes("foreign key")) {
    return {
      title: "Donnée liée manquante",
      hint: "Un élément rattaché a été supprimé ou n'existe pas encore.",
      retryable: false,
      technical,
    };
  }

  // 40001 / 40P01 — conflit de transaction : un simple nouvel essai suffit.
  if (code === "40001" || code === "40P01" || low.includes("deadlock")) {
    return {
      title: "Conflit momentané",
      hint: "Une autre opération était en cours. Réessayez.",
      retryable: true,
      technical,
    };
  }

  // 53300 / 08006 — serveur saturé ou connexion perdue.
  if (code === "53300" || code === "08006" || low.includes("too many connections")) {
    return {
      title: "Service momentanément saturé",
      hint: "Patientez quelques secondes puis réessayez.",
      retryable: true,
      technical,
    };
  }

  /*
   * Reste des cas : on délègue au mapper métier déjà en place (`toUserMessage`,
   * aligné sur l'app Flutter) — il traduit les messages connus (stock
   * insuffisant, identifiants…) et renvoie une chaîne vide s'il ne reconnaît
   * rien. Une seule source de vérité, et surtout : jamais le texte brut.
   */
  const mapped = toUserMessage(error, "").trim();
  if (mapped) {
    return { title: mapped, hint: "", retryable: true, technical };
  }

  return {
    title: fallbackTitle,
    hint: "Réessayez dans un instant. Si le problème persiste, contactez le support.",
    retryable: true,
    technical,
  };
}

/** Version une ligne — pour les toasts (pas de place pour un bloc détaillé). */
export function friendlyErrorMessage(error: unknown, fallbackTitle?: string): string {
  const f = toFriendlyError(error, fallbackTitle);
  return f.hint ? `${f.title} — ${f.hint}` : f.title;
}

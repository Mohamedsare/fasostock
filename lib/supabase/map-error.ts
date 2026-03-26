import { formatUnknownErrorMessage } from "@/lib/utils/format-unknown-error";

/**
 * Rend les erreurs PostgREST / Supabase lisibles côté UI (tables manquantes, mauvais projet, etc.).
 */
export function mapSupabaseError(err: unknown): Error {
  const msg = formatUnknownErrorMessage(err);
  const lower = msg.toLowerCase();

  if (
    lower.includes("schema cache") ||
    lower.includes("could not find") ||
    (lower.includes("relation") && lower.includes("does not exist")) ||
    lower.includes("does not exist")
  ) {
    return new Error(
      "Schéma Supabase incomplet : la base liée à .env.local n’a pas les tables attendues (ex. user_company_roles, companies). Même schéma que l’app Flutter : appliquez les migrations du dépôt (supabase db push) ou vérifiez URL / clé anon du projet provisionné.",
    );
  }

  if (err instanceof Error && err.message?.trim() && err.message !== "[object Object]") {
    return err;
  }
  return new Error(msg);
}

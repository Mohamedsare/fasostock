/** URL projet Supabase sans slash final — évite des comportements bizarres côté Auth / fetch. */
export function normalizeSupabaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

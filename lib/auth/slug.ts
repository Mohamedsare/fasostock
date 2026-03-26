/** Même logique que `AuthService._slugFromName` / `RegisterPage._slugFromName` (Dart). */
export function slugFromName(name: string): string {
  if (!name.trim()) return "";
  const n = name.toLowerCase().trim();
  const withoutAccents = n
    .replaceAll("é", "e")
    .replaceAll("è", "e")
    .replaceAll("ê", "e")
    .replaceAll("à", "a")
    .replaceAll("â", "a")
    .replaceAll("ù", "u")
    .replaceAll("ô", "o")
    .replaceAll("î", "i")
    .replaceAll("ï", "i")
    .replaceAll("û", "u")
    .replaceAll("ç", "c");
  return withoutAccents
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function defaultSlugFromCompanyName(name: string): string {
  const s = slugFromName(name);
  return s || "entreprise";
}

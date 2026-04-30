/** Messages utilisateur (FR) — proches de `ErrorMessages` / `AppErrorHandler` Flutter. */
export function authErrorToMessage(err: { message?: string } | null): string {
  const raw = (err?.message ?? "").toLowerCase();
  if (
    raw.includes("failed to fetch") ||
    raw.includes("networkerror") ||
    raw.includes("network request failed") ||
    raw.includes("err_network") ||
    raw.includes("load failed")
  ) {
    return "Erreur de connexion. Vérifiez votre connexion internet.";
  }
  if (raw.includes("invalid login") || raw.includes("invalid_credentials")) {
    return "Email ou mot de passe incorrect.";
  }
  if (raw.includes("email not confirmed")) {
    return "Veuillez confirmer votre email avant de vous connecter.";
  }
  if (raw.includes("too many requests")) {
    return "Trop de tentatives. Réessayez plus tard.";
  }
  return "Une erreur s'est produite. Réessayez.";
}

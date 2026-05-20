function extractErrorFields(err: unknown): { message: string; code: string; status?: number } {
  if (err == null || typeof err !== "object") {
    return { message: "", code: "" };
  }
  const o = err as Record<string, unknown>;
  return {
    message: String(o.message ?? ""),
    code: String(o.code ?? ""),
    status: typeof o.status === "number" ? o.status : undefined,
  };
}

/** Messages inscription — toasts UX (jamais le générique « Une erreur s'est produite »). */
export function registerErrorToMessage(err: unknown): string {
  const { message, code, status } = extractErrorFields(err);
  const raw = message.toLowerCase();

  if (
    status === 401 ||
    code === "42501" ||
    raw.includes("row-level security") ||
    raw.includes("jwt") ||
    raw.includes("not authenticated")
  ) {
    return "Vérifiez votre boîte mail : ouvrez le lien de confirmation FasoStock, puis connectez-vous pour finaliser votre entreprise.";
  }

  if (raw.includes("user already registered") || raw.includes("already been registered")) {
    return "Un compte existe déjà avec cet email. Connectez-vous ou utilisez « Mot de passe oublié ».";
  }

  if (raw.includes("password") && (raw.includes("weak") || raw.includes("short"))) {
    return "Mot de passe trop faible : utilisez au moins 8 caractères.";
  }

  if (raw.includes("invalid email") || raw.includes("unable to validate email")) {
    return "Adresse email invalide. Vérifiez l’orthographe (ex. nom@domaine.com).";
  }

  if (raw.includes("signup is disabled")) {
    return "Les inscriptions sont temporairement fermées. Réessayez plus tard.";
  }

  if (raw.includes("rate limit") || raw.includes("too many requests")) {
    return "Trop de tentatives. Patientez quelques minutes avant de réessayer.";
  }

  const mapped = authErrorToMessage({ message });
  if (mapped !== "Une erreur s'est produite. Réessayez.") {
    return mapped;
  }

  return "Inscription impossible pour le moment. Vérifiez votre connexion et réessayez.";
}

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
    return "Confirmez votre adresse email via le lien reçu par mail avant de vous connecter.";
  }
  if (raw.includes("user already registered") || raw.includes("already been registered")) {
    return "Un compte existe déjà avec cet email.";
  }
  if (raw.includes("signup is disabled")) {
    return "Les inscriptions sont temporairement désactivées.";
  }
  if (raw.includes("too many requests")) {
    return "Trop de tentatives. Réessayez plus tard.";
  }
  return "Une erreur s'est produite. Réessayez.";
}

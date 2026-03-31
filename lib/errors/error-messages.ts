/**
 * Traduction des messages d’erreur (auth Supabase, API) — aligné `error_messages.dart` (Flutter).
 */
const AUTH_MESSAGES: Record<string, string> = {
  "Invalid login credentials": "Identifiants incorrects.",
  invalid_login_credentials: "Identifiants incorrects.",
  invalid_credentials: "Identifiants incorrects.",
  "Invalid credentials": "Identifiants incorrects.",
  "Email not confirmed": "Adresse email non confirmée.",
  "User already registered": "Un compte existe déjà avec cet email.",
  "Signup disabled": "Inscription désactivée.",
  "Sign up disabled": "Inscription désactivée.",
  "Password should be at least 6 characters":
    "Le mot de passe doit contenir au moins 6 caractères.",
  "New password should be different from the old password":
    "Le nouveau mot de passe doit être différent de l'ancien.",
  "Token has expired or is invalid":
    "Le lien a expiré ou est invalide. Demandez un nouveau lien.",
  "Password recovery requires a valid email": "Veuillez entrer une adresse email valide.",
  "User not found": "Utilisateur introuvable.",
  "User already exists": "Un compte existe déjà avec cet email.",
  "A user with this email already exists": "Un compte existe déjà avec cet email.",
  "Email rate limit exceeded": "Trop de tentatives. Réessayez plus tard.",
  Forbidden: "Accès refusé.",
  "Invalid request": "Requête invalide.",
  "Session expired": "Session expirée. Reconnectez-vous.",
  "Unable to validate email address: invalid format": "Adresse email invalide.",
  "Signup requires a valid password":
    "Le mot de passe doit contenir au moins 6 caractères.",
};

const API_MESSAGES: Record<string, string> = {
  "new row violates row-level security policy":
    "Vous n'avez pas les droits pour effectuer cette action.",
  "duplicate key value violates unique constraint": "Cette valeur existe déjà.",
  "foreign key violation": "Référence invalide.",
  "JWT expired": "Session expirée. Reconnectez-vous.",
  "Invalid JWT": "Session expirée. Reconnectez-vous.",
  "Permission denied": "Accès refusé.",
  "Le rôle super admin ne peut pas être attribué":
    "Ce type d'utilisateur ne peut pas être créé ici.",
  "Rôle invalide ou inconnu": "Type d'utilisateur inconnu. Réessayez.",
  "Session absente": "Session expirée. Déconnectez-vous puis reconnectez-vous.",
  "Seul le propriétaire peut consulter les droits":
    "Seul le propriétaire peut consulter les droits d'un utilisateur.",
  "Seul le propriétaire peut modifier les droits":
    "Seul le propriétaire peut modifier les droits d'un utilisateur.",
  "Seul le propriétaire peut enregistrer une entrée magasin.":
    "Seul le propriétaire peut enregistrer une entrée au dépôt.",
  "Seul le propriétaire peut définir les seuils magasin.":
    "Seul le propriétaire peut définir les seuils du dépôt.",
  "Vous ne pouvez pas modifier vos propres droits":
    "Vous ne pouvez pas modifier vos propres droits ici.",
  "Permission inconnue": "Droit inconnu. Veuillez réessayer.",
  "n'est pas membre de cette entreprise":
    "Cet utilisateur n'est pas membre de cette entreprise.",
  "Membre introuvable": "Membre introuvable.",
  "Non authentifié": "Session expirée. Reconnectez-vous.",
  "Quantité invalide": "Quantité invalide.",
  "Prix d'achat unitaire invalide": "Prix d'achat unitaire invalide.",
  "Produit introuvable pour cette entreprise":
    "Produit introuvable pour cette entreprise.",
  "Produit réservé aux boutiques : pas d'entrée au dépôt magasin.":
    "Ce produit est réservé aux boutiques (pas d'entrée au dépôt).",
  "Seuil invalide": "Seuil invalide.",
  "Produit réservé aux boutiques : pas de seuil dépôt.":
    "Ce produit est réservé aux boutiques (pas de seuil dépôt).",
  "produit réservé au dépôt magasin":
    "Ce produit est réservé au dépôt (vente en boutique impossible).",
};

export const ERROR_MESSAGES_GENERIC = "Une erreur s'est produite.";

function authMessageForCode(code: string | undefined): string | null {
  if (!code) return null;
  return AUTH_MESSAGES[code] ?? null;
}

/**
 * Message utilisateur sûr — ne renvoie pas de détail technique (stack, code brut).
 */
export function translateErrorMessage(message: string | null | undefined, code?: string | null): string {
  if (message == null || message === "") return ERROR_MESSAGES_GENERIC;
  const normalized = message.trim();
  const fromCode = authMessageForCode(code ?? undefined);
  if (fromCode) return fromCode;
  if (AUTH_MESSAGES[normalized]) return AUTH_MESSAGES[normalized]!;
  const lower = normalized.toLowerCase();
  for (const [k, v] of Object.entries(AUTH_MESSAGES)) {
    if (lower.includes(k.toLowerCase())) return v;
  }
  for (const [k, v] of Object.entries(API_MESSAGES)) {
    if (lower.includes(k.toLowerCase())) return v;
  }
  const looksFrench = /[\u00C0-\u024F]/i.test(normalized);
  const looksTechnical =
    normalized.includes("Exception") ||
    normalized.includes("Error") ||
    /^[A-Za-z_]+\.(dart|ts|js|tsx?)/.test(normalized) ||
    normalized.length > 120;
  if (looksFrench && !looksTechnical && normalized.length <= 100) return normalized;
  return ERROR_MESSAGES_GENERIC;
}

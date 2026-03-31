import { translateErrorMessage, ERROR_MESSAGES_GENERIC } from "@/lib/errors/error-messages";
import { formatUnknownErrorMessage } from "@/lib/utils/format-unknown-error";

/** Message déjà rédigé pour l’UI — aligné `UserFriendlyError` (Flutter). */
export class UserFriendlyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserFriendlyError";
  }
}

const NETWORK_MSG =
  "Connexion internet indisponible. Vérifiez votre connexion.";
const AUTH_MSG = "Email ou mot de passe incorrect.";
const PERMISSION_MSG = "Vous n'avez pas l'autorisation d'effectuer cette action.";
const UNEXPECTED_MSG = "Une erreur inattendue s'est produite. Veuillez réessayer.";

function rawErrorText(error: unknown): string {
  if (error instanceof UserFriendlyError) return error.message;
  return formatUnknownErrorMessage(error, "").trim();
}

function isNetworkErrorString(str: string, lower: string): boolean {
  return (
    str.includes("SocketException") ||
    str.includes("Failed to fetch") ||
    str.includes("NetworkError") ||
    str.includes("Network request failed") ||
    str.includes("Connection refused") ||
    str.includes("Connection reset") ||
    str.includes("Failed host lookup") ||
    str.includes("Network is unreachable") ||
    str.includes("Connection timed out") ||
    lower.includes("no internet") ||
    lower.includes("networkerror when attempting to fetch") ||
    lower.includes("err_network") ||
    (lower.includes("load failed") && lower.includes("fetch"))
  );
}

function isNetworkError(_error: unknown, str: string, lower: string): boolean {
  if (str && isNetworkErrorString(str, lower)) return true;
  return false;
}

/** PGRST / fetch 401 — aligné `_isSessionOrJwtExpired` (Flutter). */
export function isSessionOrJwtExpiredMessage(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.includes("jwt expired") ||
    lower.includes("invalid jwt") ||
    lower.includes("pgrst303") ||
    text.includes("401")
  );
}

/**
 * Indique si l’erreur est réseau / timeout — ex. bascule pending POS (Flutter `ErrorMapper.isNetworkError`).
 */
export function isNetworkErrorPublic(error: unknown): boolean {
  if (error == null) return false;
  const str = rawErrorText(error);
  const lower = str.toLowerCase();
  if (isNetworkError(error, str, lower)) return true;
  if (lower.includes("timeout") || lower.includes("timed out")) return true;
  return false;
}

/**
 * Message pour toast / UI — jamais de stack ni détail technique brut (Flutter `ErrorMapper.toMessage`).
 */
export function toUserMessage(error: unknown, fallback?: string): string {
  if (error == null) return fallback ?? UNEXPECTED_MSG;
  if (error instanceof UserFriendlyError) return error.message;

  const str = rawErrorText(error);
  const lower = str.toLowerCase();

  if (isNetworkError(error, str, lower)) return NETWORK_MSG;
  if (lower.includes("timeout") || lower.includes("timed out")) return NETWORK_MSG;

  const errName =
    typeof error === "object" && error !== null && "name" in error
      ? String((error as { name: unknown }).name)
      : "";
  const looksAuthErr =
    errName === "AuthApiError" ||
    errName === "AuthError" ||
    lower.includes("invalid login credentials") ||
    lower.includes("invalid_credentials");

  if (looksAuthErr) {
    const msg =
      typeof (error as { message?: string }).message === "string"
        ? String((error as { message: string }).message)
        : str;
    const status = (error as { status?: number }).status;
    const code = typeof status === "number" ? String(status) : undefined;
    const t = translateErrorMessage(msg, code);
    if (t !== ERROR_MESSAGES_GENERIC) return t;
    return AUTH_MSG;
  }

  if (
    lower.includes("row-level security") ||
    lower.includes("permission denied") ||
    lower.includes("forbidden") ||
    (lower.includes("policy") && lower.includes("violates"))
  ) {
    return PERMISSION_MSG;
  }

  if (
    lower.includes("invalid jwt") ||
    lower.includes("jwt expired") ||
    str.includes("401") ||
    lower.includes("unauthorized")
  ) {
    return "Session expirée. Reconnectez-vous.";
  }

  if (lower.includes("stock insuffisant")) {
    const start = lower.indexOf("stock insuffisant");
    let end = str.length;
    for (const sep of [", code:", "\n", "Details:", "details:", " (see "]) {
      const i = str.indexOf(sep, start);
      if (i !== -1 && i < end) end = i;
    }
    let msg = str.slice(start, end).trim();
    msg = msg.replace(/\s*\(référence:[^)]+\)/gi, "");
    if (msg.length > 320) msg = `${msg.slice(0, 317)}…`;
    return msg;
  }

  const translated = translateErrorMessage(str, null);
  if (translated !== ERROR_MESSAGES_GENERIC) return translated;

  return fallback ?? UNEXPECTED_MSG;
}

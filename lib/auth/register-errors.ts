/** Toast inscription — email déjà enregistré. */
export const REGISTER_EMAIL_ALREADY_USED_MESSAGE =
  "Cet email est déjà utilisé. Choisissez-en un autre pour créer votre compte.";

export class RegisterEmailAlreadyUsedError extends Error {
  constructor(message = REGISTER_EMAIL_ALREADY_USED_MESSAGE) {
    super(message);
    this.name = "RegisterEmailAlreadyUsedError";
  }
}

export function isRegisterEmailAlreadyUsedError(err: unknown): boolean {
  if (err instanceof RegisterEmailAlreadyUsedError) return true;
  if (err == null || typeof err !== "object") return false;
  const o = err as Record<string, unknown>;
  const code = String(o.code ?? "").toLowerCase();
  const msg = String(o.message ?? "").toLowerCase();
  return (
    code === "email_exists" ||
    code === "user_already_registered" ||
    msg.includes("already registered") ||
    msg.includes("already exists") ||
    msg.includes("user already registered") ||
    msg.includes("email address is already registered")
  );
}

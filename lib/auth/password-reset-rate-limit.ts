import type { SupabaseClient } from "@supabase/supabase-js";

export type PasswordResetRateStatus = {
  allowed: boolean;
  attempts: number;
  remainingAttempts: number;
  blockedUntil: string | null;
};

function parseRateRow(data: unknown): PasswordResetRateStatus | null {
  if (!Array.isArray(data) || data.length === 0) return null;
  const row = data[0] as Record<string, unknown>;
  return {
    allowed: row.allowed === true,
    attempts: typeof row.attempts === "number" ? row.attempts : Number(row.attempts) || 0,
    remainingAttempts:
      typeof row.remaining_attempts === "number"
        ? row.remaining_attempts
        : Number(row.remaining_attempts) || 0,
    blockedUntil:
      typeof row.blocked_until === "string"
        ? row.blocked_until
        : row.blocked_until == null
          ? null
          : String(row.blocked_until),
  };
}

export async function consumePasswordResetAttempt(
  supabase: SupabaseClient,
  email: string,
): Promise<PasswordResetRateStatus | null> {
  try {
    const { data, error } = await supabase.rpc("consume_password_reset_attempt", {
      p_email: email,
    });
    if (error) return null;
    return parseRateRow(data);
  } catch {
    return null;
  }
}

export function formatPasswordResetBlockedMessage(blockedUntil: string): string {
  const ms = new Date(blockedUntil).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) {
    return "Trop de demandes. Réessayez demain.";
  }
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  if (minutes >= 24 * 60) {
    const days = Math.ceil(minutes / (24 * 60));
    return `Trop de demandes de réinitialisation. Réessayez dans ${days} jour${days > 1 ? "s" : ""}.`;
  }
  if (minutes >= 60) {
    const hours = Math.ceil(minutes / 60);
    return `Trop de demandes de réinitialisation. Réessayez dans ${hours} heure${hours > 1 ? "s" : ""}.`;
  }
  return `Trop de demandes de réinitialisation. Réessayez dans ${minutes} minute${minutes > 1 ? "s" : ""}.`;
}

import type { SupabaseClient } from "@supabase/supabase-js";

export type ParsedLockStatus = {
  locked: boolean;
  failedAttempts: number;
};

/** Réponse RPC `get_login_lock_status` — liste d’un objet ou vide. */
export function parseLockStatus(data: unknown): ParsedLockStatus {
  if (!Array.isArray(data) || data.length === 0) {
    return { locked: false, failedAttempts: 0 };
  }
  const row = data[0] as Record<string, unknown>;
  const locked = row.locked === true;
  const failed = row.failed_attempts;
  const failedAttempts =
    typeof failed === "number" ? failed : Number(failed) || 0;
  return { locked, failedAttempts };
}

export async function getLoginLockStatus(
  supabase: SupabaseClient,
  email: string,
): Promise<ParsedLockStatus | null> {
  try {
    const { data, error } = await supabase.rpc("get_login_lock_status", {
      p_email: email,
    });
    if (error) return null;
    return parseLockStatus(data);
  } catch {
    return null;
  }
}

export async function recordFailedLogin(
  supabase: SupabaseClient,
  email: string,
): Promise<void> {
  try {
    await supabase.rpc("record_failed_login", { p_email: email });
  } catch {
    /* best effort */
  }
}

export async function resetLoginAttempts(supabase: SupabaseClient): Promise<void> {
  try {
    await supabase.rpc("reset_login_attempts");
  } catch {
    /* best effort */
  }
}

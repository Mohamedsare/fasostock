"use client";

import { createClient } from "@/lib/supabase/client";
import { mapSupabaseError } from "@/lib/supabase/map-error";

/** Intervention de dépannage en cours (super admin « entré » chez un client). */
export type SupportSession = {
  id: string;
  companyId: string;
  companyName: string;
  reason: string;
  startedAt: string;
  expiresAt: string;
};

function mapRow(row: Record<string, unknown>): SupportSession {
  return {
    id: String(row.id ?? ""),
    companyId: String(row.company_id ?? ""),
    companyName: String(row.company_name ?? "Entreprise"),
    reason: String(row.reason ?? ""),
    startedAt: String(row.started_at ?? ""),
    expiresAt: String(row.expires_at ?? ""),
  };
}

/**
 * Session active de l'utilisateur courant, ou `null`.
 *
 * Ne jette jamais : le contexte applicatif l'appelle à chaque chargement et une
 * base pas encore migrée (RPC absente) ne doit pas bloquer l'accès à l'app.
 */
export async function getCurrentSupportSession(): Promise<SupportSession | null> {
  const supabase = createClient();
  try {
    const { data, error } = await supabase.rpc("current_support_session");
    if (error) return null;
    const rows = Array.isArray(data) ? data : data ? [data] : [];
    const first = rows[0] as Record<string, unknown> | undefined;
    if (!first?.company_id) return null;
    return mapRow(first);
  } catch {
    return null;
  }
}

/** Ouvre une intervention. Le motif est obligatoire (contrôlé aussi côté base). */
export async function startSupportSession(params: {
  companyId: string;
  reason: string;
  minutes?: number;
}): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("start_support_session", {
    p_company_id: params.companyId,
    p_reason: params.reason.trim(),
    p_minutes: params.minutes ?? 60,
  });
  if (error) throw mapSupabaseError(error);
  return String(data ?? "");
}

/** Referme l'intervention en cours (trace la durée dans le journal du client). */
export async function endSupportSession(): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("end_support_session");
  if (error) throw mapSupabaseError(error);
}

/** Temps restant lisible (« 42 min »), ou `null` si la session est expirée. */
export function remainingLabel(expiresAt: string, now: number = Date.now()): string | null {
  const end = new Date(expiresAt).getTime();
  if (!Number.isFinite(end)) return null;
  const ms = end - now;
  if (ms <= 0) return null;
  const totalMin = Math.ceil(ms / 60_000);
  if (totalMin < 60) return `${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? `${h} h` : `${h} h ${m}`;
}

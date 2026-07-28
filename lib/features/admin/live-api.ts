import { createClient } from "@/lib/supabase/client";
import { mapSupabaseError } from "@/lib/supabase/map-error";

/** Une session d'onglet/appareil vue par la page Live. */
export type LivePresenceSession = {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  companyId: string | null;
  companyName: string | null;
  storeId: string | null;
  storeName: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  secondsSinceSeen: number;
  isOnline: boolean;
  pathname: string | null;
  activity: string | null;
  pageViews: number;
  ip: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  deviceKind: string | null;
  clientKind: string;
};

/** Agrégat par ville — la vue « prospection » : où l'app est déjà utilisée. */
export type PresenceCity = {
  city: string;
  region: string | null;
  country: string | null;
  usersCount: number;
  companiesCount: number;
  sessionsCount: number;
  lastSeenAt: string;
};

function str(v: unknown): string {
  return v != null ? String(v) : "";
}
function strOrNull(v: unknown): string | null {
  return v != null && String(v).trim() !== "" ? String(v) : null;
}
function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Sessions des 24 dernières heures, la plus récente d'abord (`isOnline` = active maintenant). */
export async function adminListLivePresence(params?: {
  windowSeconds?: number;
  limit?: number;
}): Promise<LivePresenceSession[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("admin_live_presence", {
    p_window_seconds: params?.windowSeconds ?? 90,
    p_limit: params?.limit ?? 500,
  });
  if (error) throw mapSupabaseError(error);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: str(r.id),
    userId: str(r.user_id),
    fullName: str(r.full_name) || "Utilisateur",
    email: str(r.email),
    companyId: strOrNull(r.company_id),
    companyName: strOrNull(r.company_name),
    storeId: strOrNull(r.store_id),
    storeName: strOrNull(r.store_name),
    firstSeenAt: str(r.first_seen_at),
    lastSeenAt: str(r.last_seen_at),
    secondsSinceSeen: num(r.seconds_since_seen),
    isOnline: r.is_online === true,
    pathname: strOrNull(r.pathname),
    activity: strOrNull(r.activity),
    pageViews: num(r.page_views),
    ip: strOrNull(r.ip),
    city: strOrNull(r.city),
    region: strOrNull(r.region),
    country: strOrNull(r.country),
    deviceKind: strOrNull(r.device_kind),
    clientKind: str(r.client_kind) || "web",
  }));
}

export async function adminListPresenceCities(days = 30): Promise<PresenceCity[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("admin_presence_cities", { p_days: days });
  if (error) throw mapSupabaseError(error);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    city: str(r.city) || "Ville inconnue",
    region: strOrNull(r.region),
    country: strOrNull(r.country),
    usersCount: num(r.users_count),
    companiesCount: num(r.companies_count),
    sessionsCount: num(r.sessions_count),
    lastSeenAt: str(r.last_seen_at),
  }));
}

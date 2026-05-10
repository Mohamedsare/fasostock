/** Canal Realtime Presence partagé (web app ⇄ tableau super-admin). */
export const APP_WEB_PRESENCE_CHANNEL = "app_web_presence_v1";

export type AppWebPresencePayload = {
  surface: "web";
  user_id: string;
  email: string | null;
  company_id: string;
  company_name: string;
  path: string;
  lat: number | null;
  lng: number | null;
  accuracy_m: number | null;
  geolocation: "unknown" | "denied" | "unavailable" | "ok";
  ts: number;
};

/** Aplatit l’état `presenceState()` sans dépendre des types génériques internes Supabase. */
export function flattenAppWebPresence(state: Record<string, unknown>): AppWebPresencePayload[] {
  const out: AppWebPresencePayload[] = [];
  for (const metasUnknown of Object.values(state)) {
    if (!Array.isArray(metasUnknown)) continue;
    for (const meta of metasUnknown) {
      if (!meta || typeof meta !== "object") continue;
      const m = meta as Record<string, unknown>;
      if (m.surface !== "web") continue;
      if (typeof m.user_id !== "string" || !m.user_id) continue;
      out.push({
        surface: "web",
        user_id: m.user_id,
        email: typeof m.email === "string" ? m.email : m.email == null ? null : String(m.email),
        company_id: typeof m.company_id === "string" ? m.company_id : "",
        company_name: typeof m.company_name === "string" ? m.company_name : "",
        path: typeof m.path === "string" ? m.path : "",
        lat: typeof m.lat === "number" && Number.isFinite(m.lat) ? m.lat : null,
        lng: typeof m.lng === "number" && Number.isFinite(m.lng) ? m.lng : null,
        accuracy_m:
          typeof m.accuracy_m === "number" && Number.isFinite(m.accuracy_m) ? m.accuracy_m : null,
        geolocation:
          m.geolocation === "denied" ||
          m.geolocation === "unavailable" ||
          m.geolocation === "ok" ||
          m.geolocation === "unknown"
            ? m.geolocation
            : "unknown",
        ts: typeof m.ts === "number" && Number.isFinite(m.ts) ? m.ts : 0,
      });
    }
  }
  return out;
}

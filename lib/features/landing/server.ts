import "server-only";

import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";

import { normalizeSupabaseUrl } from "@/lib/supabase/normalize-url";

export type LandingPartner = { id: string; name: string; logoUrl: string };
export type LandingSupportImage = { imageUrl: string };
export type LandingSettings = Record<string, string>;

const PUBLIC_REVALIDATE_SECONDS = 60;
/**
 * Limite de taille pour une valeur de setting cachable. Au-delà, on ignore (probable Data URL — doit être migré vers Supabase Storage).
 * Le cache Next.js a une limite stricte de 2MB par item.
 */
const MAX_CACHEABLE_SETTING_BYTES = 256 * 1024; // 256KB
const MAX_INLINE_IMAGE_BYTES = 256 * 1024;

function isSafeImageUrl(value: string): boolean {
  if (!value) return false;
  if (value.startsWith("data:")) return value.length <= MAX_INLINE_IMAGE_BYTES;
  return /^https?:\/\//i.test(value) || value.startsWith("/");
}

/** Client Supabase anonyme sans cookies — utilisable dans `unstable_cache`. */
function publicClient(): SupabaseClient {
  const urlRaw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!urlRaw || !key) {
    throw new Error("Variables NEXT_PUBLIC_SUPABASE_URL/ANON manquantes.");
  }
  return createSupabaseClient(normalizeSupabaseUrl(urlRaw), key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export const getCachedLandingPartners = unstable_cache(
  async (): Promise<LandingPartner[]> => {
    const supabase = publicClient();
    const { data, error } = await supabase
      .from("public_partners")
      .select("id, name, logo_url, sort_order")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });
    if (error) {
      console.warn("[landing] partners load error", error.message);
      return [];
    }
    return ((data ?? []) as Record<string, unknown>[]).map((p) => {
      const logo = String(p.logo_url ?? "");
      return {
        id: String(p.id ?? ""),
        name: String(p.name ?? "Partenaire"),
        logoUrl: isSafeImageUrl(logo) ? logo : "/fs.png",
      };
    });
  },
  ["landing", "partners", "v2"],
  { revalidate: PUBLIC_REVALIDATE_SECONDS, tags: ["landing-partners"] },
);

export const getCachedLandingSupportImage = unstable_cache(
  async (): Promise<LandingSupportImage> => {
    const supabase = publicClient();
    const { data, error } = await supabase
      .from("public_landing_media")
      .select("image_url")
      .eq("key", "support_section_image")
      .maybeSingle();
    if (error) {
      console.warn("[landing] support image load error", error.message);
      return { imageUrl: "" };
    }
    const url = String((data as { image_url?: string } | null)?.image_url ?? "").trim();
    return { imageUrl: isSafeImageUrl(url) ? url : "" };
  },
  ["landing", "support-image", "v2"],
  { revalidate: PUBLIC_REVALIDATE_SECONDS, tags: ["landing-media"] },
);

/**
 * Lecture des settings de la landing page.
 * - Les valeurs trop grosses (data:URL > 256KB notamment) sont remplacées par "" pour éviter
 *   d'exploser le cache Next.js (limite 2MB) et le poids HTML.
 * - Pour gérer une image bannière, l'admin doit privilégier une URL HTTP/HTTPS (Supabase Storage).
 */
export const getCachedLandingSettings = unstable_cache(
  async (): Promise<LandingSettings> => {
    const supabase = publicClient();
    const { data, error } = await supabase
      .from("public_landing_settings")
      .select("key, value");
    if (error) {
      console.warn("[landing] settings load error", error.message);
      return {};
    }
    const out: Record<string, string> = {};
    for (const row of (data ?? []) as Record<string, unknown>[]) {
      const key = String(row.key ?? "");
      const value = String(row.value ?? "");
      if (!key) continue;
      if (Buffer.byteLength(value, "utf8") > MAX_CACHEABLE_SETTING_BYTES) {
        // Image trop volumineuse pour la landing — ignorée (à migrer vers Storage).
        if (process.env.NODE_ENV !== "production") {
          console.warn(
            `[landing] setting "${key}" (${Buffer.byteLength(value, "utf8")} bytes) ignoré — utilisez une URL plutôt qu'une Data URL.`,
          );
        }
        continue;
      }
      out[key] = value;
    }
    return out;
  },
  ["landing", "settings", "v2"],
  { revalidate: PUBLIC_REVALIDATE_SECONDS, tags: ["landing-settings"] },
);

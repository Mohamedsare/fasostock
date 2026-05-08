import "server-only";

import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";

import { normalizeSupabaseUrl } from "@/lib/supabase/normalize-url";

export type LandingPartner = { id: string; name: string; logoUrl: string };
export type LandingSupportImage = { imageUrl: string };
export type LandingSettings = Record<string, string>;

const PUBLIC_REVALIDATE_SECONDS = 60;

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
    return ((data ?? []) as Record<string, unknown>[]).map((p) => ({
      id: String(p.id ?? ""),
      name: String(p.name ?? "Partenaire"),
      logoUrl: String(p.logo_url ?? "/fs.png"),
    }));
  },
  ["landing", "partners", "v1"],
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
    return { imageUrl: url };
  },
  ["landing", "support-image", "v1"],
  { revalidate: PUBLIC_REVALIDATE_SECONDS, tags: ["landing-media"] },
);

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
    return Object.fromEntries(
      ((data ?? []) as Record<string, unknown>[]).map((row) => [
        String(row.key ?? ""),
        String(row.value ?? ""),
      ]),
    );
  },
  ["landing", "settings", "v1"],
  { revalidate: PUBLIC_REVALIDATE_SECONDS, tags: ["landing-settings"] },
);

"use server";

import { revalidateTag } from "next/cache";

/**
 * Invalide le cache `unstable_cache` de la landing page après une mise à jour admin.
 * À appeler depuis le client dès qu'une mutation a été enregistrée avec succès.
 */
const LANDING_CACHE_TAGS = [
  "landing-partners",
  "landing-media",
  "landing-settings",
] as const;

export async function revalidateLandingCache(): Promise<void> {
  const immediate = { expire: 0 } as const;
  for (const tag of LANDING_CACHE_TAGS) {
    revalidateTag(tag, immediate);
  }
}

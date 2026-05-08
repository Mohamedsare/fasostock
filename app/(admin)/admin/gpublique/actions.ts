"use server";

import { revalidateTag } from "next/cache";

/**
 * Invalide le cache `unstable_cache` de la landing page après une mise à jour admin.
 * À appeler depuis le client dès qu'une mutation a été enregistrée avec succès.
 */
export async function revalidateLandingCache(): Promise<void> {
  revalidateTag("landing-partners");
  revalidateTag("landing-media");
  revalidateTag("landing-settings");
}

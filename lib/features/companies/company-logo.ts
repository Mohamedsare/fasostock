"use client";

import { createClient } from "@/lib/supabase/client";
import { compressImageForUpload } from "@/lib/utils/image-compress";
import { safeImageExtension } from "@/lib/utils/image-file";

/** Même bucket et convention de chemin que `CompanyRepository.uploadCompanyLogo` (Flutter). */
export async function uploadCompanyLogo(companyId: string, file: File): Promise<string> {
  const supabase = createClient();
  // Le logo part sur les tickets, les factures et l'en-tête : il doit être léger.
  // La transparence est préservée (voir `compressImageForUpload`).
  const optimized = await compressImageForUpload(file, "logo");
  const ext = safeImageExtension(optimized.name);
  const path = `company/${companyId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("store-logos").upload(path, optimized, {
    contentType: optimized.type || "image/jpeg",
    upsert: false,
  });
  if (error) throw error;
  const { data } = supabase.storage.from("store-logos").getPublicUrl(path);
  return data.publicUrl;
}

export async function updateCompanyLogoUrl(
  companyId: string,
  logoUrl: string | null,
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("companies")
    .update({ logo_url: logoUrl })
    .eq("id", companyId);
  if (error) throw error;
}

"use client";

import { createClient } from "@/lib/supabase/client";

/** Même bucket et convention de chemin que `CompanyRepository.uploadCompanyLogo` (Flutter). */
export async function uploadCompanyLogo(companyId: string, file: File): Promise<string> {
  const supabase = createClient();
  const ext = file.name.includes(".") ? file.name.split(".").pop() || "jpg" : "jpg";
  const path = `company/${companyId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("store-logos").upload(path, file, {
    contentType: file.type || "image/jpeg",
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

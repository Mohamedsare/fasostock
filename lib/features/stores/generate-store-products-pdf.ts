"use client";

import { fetchStoreProductsPdfBlob } from "@/lib/features/pdf/pdf-api-client";

export type StoreProductsPdfItem = {
  name: string;
  imageUrl: string | null;
};

export async function generateStoreProductsPdfBlob(params: {
  companyName: string;
  companyLogoUrl?: string | null;
  storeName: string;
  items: StoreProductsPdfItem[];
}): Promise<Blob> {
  return fetchStoreProductsPdfBlob({
    companyName: params.companyName,
    companyLogoUrl: params.companyLogoUrl ?? null,
    storeName: params.storeName,
    generatedAtIso: new Date().toISOString(),
    items: params.items,
  });
}

export async function downloadStoreProductsPdf(params: {
  companyName: string;
  companyLogoUrl?: string | null;
  storeName: string;
  items: StoreProductsPdfItem[];
}): Promise<void> {
  const blob = await generateStoreProductsPdfBlob(params);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `produits-${params.storeName || "magasin"}.pdf`;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

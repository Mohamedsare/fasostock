"use client";

export type PromoAdInput = {
  companyId: string;
  productId: string;
  imageUrl: string;
  shopName: string;
  productName: string;
  oldPrice: number;
  newPrice: number;
  discountPercent: number;
  periodLabel: string | null;
};

export type PromoAd = {
  /** data:image/png;base64,… — affiche carrée générée par l'IA. */
  dataUrl: string;
  headline: string;
};

async function errorMessageFromResponse(res: Response): Promise<string> {
  const t = await res.text();
  try {
    const j = JSON.parse(t) as { error?: string };
    if (j.error) return j.error;
  } catch {
    /* texte brut */
  }
  return t || `Erreur ${res.status}`;
}

/**
 * Génère une AFFICHE PUBLICITAIRE carrée avec l'IA (OpenAI gpt-image-1) à partir de la
 * vraie photo du produit + les infos promo (nom, prix, -%, boutique, dates). ChatGPT écrit l'accroche.
 */
export async function generatePromoAd(input: PromoAdInput): Promise<PromoAd> {
  const res = await fetch("/api/ai/promo-ad", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await errorMessageFromResponse(res));
  const j = (await res.json()) as { imageBase64?: string; mime?: string; headline?: string };
  if (!j.imageBase64) throw new Error("Affiche non générée.");
  return {
    dataUrl: `data:${j.mime ?? "image/png"};base64,${j.imageBase64}`,
    headline: String(j.headline ?? ""),
  };
}

/** Télécharge directement l'affiche (data URL) en PNG. */
export function downloadImageDataUrl(dataUrl: string, fileName: string): void {
  const base = fileName.replace(/[^\w.\-]/g, "_");
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = base.endsWith(".png") ? base : `${base}.png`;
  a.click();
}

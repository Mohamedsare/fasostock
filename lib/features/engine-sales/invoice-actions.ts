"use client";

/** URL de la route PDF de la facture engin. */
export function engineInvoiceUrl(saleId: string): string {
  return `/api/pdf/engine-invoice?saleId=${encodeURIComponent(saleId)}`;
}

async function fetchInvoiceBlob(saleId: string): Promise<Blob> {
  const res = await fetch(engineInvoiceUrl(saleId), { credentials: "same-origin" });
  if (!res.ok) {
    let msg = "Génération de la facture impossible.";
    try {
      const j = (await res.json()) as { error?: string };
      if (j?.error) msg = j.error;
    } catch {
      /* réponse non JSON */
    }
    throw new Error(msg);
  }
  return res.blob();
}

/**
 * Impression directe : récupère le PDF (blob même origine), l'insère dans un
 * iframe caché et déclenche l'impression dès qu'il est chargé.
 */
export async function printEngineInvoice(saleId: string): Promise<void> {
  const blob = await fetchInvoiceBlob(saleId);
  const url = URL.createObjectURL(blob);
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.src = url;
  iframe.onload = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch {
      /* certains navigateurs bloquent l'impression scriptée du PDF */
    }
    // Nettoyage différé (laisse le temps à la boîte d'impression).
    window.setTimeout(() => {
      URL.revokeObjectURL(url);
      iframe.remove();
    }, 60_000);
  };
  document.body.appendChild(iframe);
}

/**
 * Téléchargement automatique et asynchrone du PDF sur l'appareil.
 */
export async function downloadEngineInvoice(saleId: string, fileLabel: string): Promise<void> {
  const blob = await fetchInvoiceBlob(saleId);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `facture-engin-${fileLabel}.pdf`.replace(/[\\/:*?"<>|]+/g, "-");
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

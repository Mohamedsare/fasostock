"use client";

import type { InvoiceA4Data } from "./invoice-a4-types";
import { fetchInvoicePdfBlob } from "@/lib/features/pdf/pdf-api-client";

export async function fetchLogoBytes(
  url: string | null | undefined,
): Promise<Uint8Array | null> {
  if (!url?.trim()) return null;
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const ab = await r.arrayBuffer();
    return new Uint8Array(ab);
  } catch {
    return null;
  }
}

export async function generateInvoicePdfBlob(data: InvoiceA4Data): Promise<Blob> {
  return fetchInvoicePdfBlob(data);
}

export function downloadInvoicePdf(blob: Blob, saleNumber: string): void {
  const name = `facture_${saleNumber.replace(/[^\w.\-]/g, "_")}.pdf`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function openInvoicePdfInNewTab(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
  setTimeout(() => URL.revokeObjectURL(url), 120_000);
}

export function printInvoicePdf(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    URL.revokeObjectURL(url);
  };
  const fallbackPrintInNewTab = () => {
    try {
      const popup = window.open(url, "_blank", "noopener,noreferrer");
      if (!popup) return;
      const tryPrint = () => {
        try {
          popup.focus();
          popup.print();
        } catch {
          // L'utilisateur peut imprimer manuellement (Ctrl/Cmd+P) si le navigateur bloque.
        }
      };
      popup.addEventListener(
        "load",
        () => {
          window.setTimeout(tryPrint, 180);
          // Ne pas fermer automatiquement: on laisse l'utilisateur gérer l'onglet.
          // On nettoie l'URL blob quand l'onglet est fermé.
          popup.addEventListener("beforeunload", cleanup, { once: true });
        },
        { once: true },
      );
      window.setTimeout(tryPrint, 1200);
      window.setTimeout(cleanup, 10 * 60_000);
    } catch {
      window.setTimeout(cleanup, 2_000);
    }
  };
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "none";
  iframe.src = url;
  document.body.appendChild(iframe);
  let iframeLoaded = false;
  const fallbackTimer = window.setTimeout(() => {
    if (!iframeLoaded) {
      try {
        document.body.removeChild(iframe);
      } catch {}
      fallbackPrintInNewTab();
    }
  }, 2500);
  iframe.onload = () => {
    iframeLoaded = true;
    window.clearTimeout(fallbackTimer);
    const win = iframe.contentWindow;
    if (!win) {
      fallbackPrintInNewTab();
      return;
    }
    const cleanupIframe = () => {
      try {
        document.body.removeChild(iframe);
      } catch {}
      cleanup();
    };
    // Nettoyage après impression réelle (plus fiable que délai fixe).
    win.addEventListener("afterprint", cleanupIframe, { once: true });
    // Filet de sécurité si `afterprint` n'est pas déclenché.
    window.setTimeout(cleanupIframe, 10 * 60_000);
    try {
      win.focus();
      win.print();
    } catch {
      try {
        document.body.removeChild(iframe);
      } catch {}
      fallbackPrintInNewTab();
    }
  };
  iframe.onerror = () => {
    window.clearTimeout(fallbackTimer);
    try {
      document.body.removeChild(iframe);
    } catch {}
    fallbackPrintInNewTab();
  };
}

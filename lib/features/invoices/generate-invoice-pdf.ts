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
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "none";
  iframe.src = url;
  document.body.appendChild(iframe);
  iframe.onload = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } finally {
      setTimeout(() => {
        document.body.removeChild(iframe);
        URL.revokeObjectURL(url);
      }, 2000);
    }
  };
}

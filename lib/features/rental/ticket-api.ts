"use client";

import { createClient } from "@/lib/supabase/client";
import { mapRentalReceiptRow, type RentalReceiptData } from "./ticket-types";

/** Données du ticket pour l'aperçu à l'écran (même source que le PDF serveur). */
export async function fetchRentalReceiptData(
  paymentId: string,
): Promise<RentalReceiptData> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("rental_receipt_data", {
    p_payment_id: paymentId,
  });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
  if (!row) throw new Error("Quittance introuvable.");
  return mapRentalReceiptRow(row);
}

/**
 * PDF du ticket thermique (58 / 80 mm). Le serveur relit tout depuis la base :
 * seul l'identifiant de l'encaissement est transmis.
 */
export async function generateRentalReceiptPdfBlob(
  paymentId: string,
  opts?: { paperWidthMm?: 58 | 80 },
): Promise<Blob> {
  const res = await fetch("/api/pdf/rental-receipt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({
      paymentId,
      paperWidthMm: opts?.paperWidthMm === 58 ? 58 : opts?.paperWidthMm === 80 ? 80 : null,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    let msg = t;
    try {
      const j = JSON.parse(t) as { error?: string };
      if (j.error) msg = j.error;
    } catch {
      /* texte brut */
    }
    throw new Error(msg || `Échec PDF (${res.status})`);
  }
  return res.blob();
}

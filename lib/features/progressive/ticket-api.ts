"use client";

import { createClient } from "@/lib/supabase/client";
import { mapProgressiveTicketRow, type ProgressiveTicketData } from "./ticket-types";

/** Données du ticket pour l'aperçu à l'écran (même source que le PDF serveur). */
export async function fetchProgressiveTicketData(
  ledgerId: string,
): Promise<ProgressiveTicketData> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("progressive_ticket_data", {
    p_ledger_id: ledgerId,
  });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
  if (!row) throw new Error("Ticket introuvable.");
  return mapProgressiveTicketRow(row);
}

/**
 * PDF du ticket thermique (58 / 80 mm). Le serveur relit tout depuis la base :
 * seul l'identifiant du mouvement est transmis.
 */
export async function generateProgressiveTicketPdfBlob(
  ledgerId: string,
  opts?: { paperWidthMm?: 58 | 80 },
): Promise<Blob> {
  const res = await fetch("/api/pdf/progressive-ticket", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({
      ledgerId,
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

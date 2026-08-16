"use client";

import { createClient } from "@/lib/supabase/client";
import {
  activeCurrencyForQuote,
  mapProgressiveQuoteRow,
  type ProgressiveQuoteData,
} from "./quote-types";

/** Données de la facture proforma pour l'aperçu (même source que le PDF serveur). */
export async function fetchProgressiveQuoteData(
  planId: string,
): Promise<ProgressiveQuoteData> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("progressive_quote_data", {
    p_plan_id: planId,
  });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
  if (!row) throw new Error("Dossier introuvable.");
  return mapProgressiveQuoteRow(row, { currencyCode: activeCurrencyForQuote() });
}

/**
 * PDF A4 de la facture proforma. Le serveur relit tout depuis la base : seul
 * l'identifiant du dossier (et la devise d'affichage) est transmis.
 */
export async function generateProgressiveQuotePdfBlob(planId: string): Promise<Blob> {
  const res = await fetch("/api/pdf/progressive-quote", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ planId, currencyCode: activeCurrencyForQuote() }),
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

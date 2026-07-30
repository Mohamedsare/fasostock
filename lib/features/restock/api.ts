"use client";

import { createClient } from "@/lib/supabase/client";
import { mapSupabaseError } from "@/lib/supabase/map-error";
import { mapRestockRow } from "./map-row";
import type { RestockAdvice, RestockAdviceItem, RestockCandidate } from "./types";

function toNum(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function toStr(v: unknown): string {
  return v == null ? "" : String(v);
}

/**
 * Produits qui se vendent et dont le stock descend, avec la quantité conseillée
 * calculée sur l'historique de ventes (`days`) pour couvrir `coverDays` jours.
 */
export async function listRestockCandidates(params: {
  companyId: string;
  storeId: string | null;
  days: number;
  coverDays: number;
}): Promise<RestockCandidate[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("restock_candidates", {
    p_company_id: params.companyId,
    p_store_id: params.storeId,
    p_days: params.days,
    p_cover_days: params.coverDays,
    p_limit: 100,
  });
  if (error) throw mapSupabaseError(error);
  return ((data ?? []) as Record<string, unknown>[]).map(mapRestockRow);
}

/**
 * Demande à l'IA d'affiner les quantités et d'expliquer ses choix.
 * Le calcul statistique reste la référence si l'IA n'est pas configurée : l'appelant
 * doit traiter l'échec comme « pas d'avis », jamais comme « page en erreur ».
 */
export async function fetchRestockAdvice(params: {
  companyId: string;
  storeId: string | null;
  days: number;
  coverDays: number;
}): Promise<RestockAdvice> {
  const res = await fetch("/api/ai/restock", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(params),
  });
  const raw = await res.text();
  let parsed: {
    error?: string;
    items?: { productId?: string; quantity?: number; priority?: string; reason?: string }[];
    summary?: string;
  } = {};
  try {
    parsed = JSON.parse(raw) as typeof parsed;
  } catch {
    /* réponse non JSON : on retombe sur le texte brut ci-dessous */
  }
  if (!res.ok) throw new Error(parsed.error || raw || `Erreur API ${res.status}`);

  return {
    items: (parsed.items ?? [])
      .map(
        (i): RestockAdviceItem => ({
          productId: toStr(i.productId),
          quantity: Math.max(0, Math.round(toNum(i.quantity))),
          priority:
            i.priority === "high" || i.priority === "low" ? i.priority : "medium",
          reason: toStr(i.reason).trim(),
        }),
      )
      .filter((i) => i.productId !== ""),
    summary: toStr(parsed.summary).trim(),
    generatedAt: new Date().toISOString(),
  };
}

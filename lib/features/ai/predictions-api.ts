"use client";

import { fetchPredictionContext } from "@/lib/features/dashboard/api";
import { createClient } from "@/lib/supabase/client";
import { parseStructuredFromDeepseekJson } from "@/lib/features/ai/deepseek-parse";
import type {
  ContextSummary,
  LastPredictionPayload,
  PredictionContext,
  PredictionStructured,
} from "@/lib/features/ai/prediction-types";

const LAST_PREDICTION_TYPE = "last_prediction";

export async function getLastPrediction(
  companyId: string,
  storeId: string | null,
): Promise<LastPredictionPayload | null> {
  const supabase = createClient();
  const { data: rows, error } = await supabase
    .from("ai_insights_cache")
    .select("payload, created_at, store_id")
    .eq("company_id", companyId)
    .eq("insight_type", LAST_PREDICTION_TYPE)
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) throw error;
  const list = (rows ?? []) as Array<{ payload?: unknown; store_id?: string | null }>;
  const match = list.find((r) => {
    if (storeId == null) return r.store_id == null;
    return r.store_id === storeId;
  });
  if (!match?.payload || typeof match.payload !== "object") return null;
  const p = match.payload as Record<string, unknown>;
  const raw = p.structured as Record<string, unknown> | undefined;
  if (!raw) return null;
  const structured = parseStructuredFromDeepseekJson(raw);
  const cs = p.contextSummary as Record<string, unknown> | undefined;
  if (!cs) return null;
  return {
    structured,
    text: String(p.text ?? structured.commentary ?? ""),
    contextSummary: {
      period: String(cs.period ?? ""),
      salesSummaryTotalAmount: Number(cs.salesSummaryTotalAmount ?? 0),
    },
  };
}

export async function saveLastPrediction(
  companyId: string,
  storeId: string | null,
  payload: LastPredictionPayload,
): Promise<void> {
  const supabase = createClient();
  const expiresAt = new Date();
  expiresAt.setFullYear(expiresAt.getFullYear() + 10);
  const map = {
    structured: {
      forecast_week_ca: payload.structured.forecastWeekCa,
      forecast_month_ca: payload.structured.forecastMonthCa,
      trend: payload.structured.trend,
      trend_reason: payload.structured.trendReason,
      restock_priorities: payload.structured.restockPriorities.map((r) => ({
        product_name: r.productName,
        quantity_suggested: r.quantitySuggested,
        priority: r.priority,
      })),
      alerts: payload.structured.alerts.map((a) => ({ type: a.type, message: a.message })),
      recommendations: payload.structured.recommendations.map((r) => ({ action: r.action })),
      commentary: payload.structured.commentary,
    },
    text: payload.text,
    contextSummary: {
      period: payload.contextSummary.period,
      salesSummaryTotalAmount: payload.contextSummary.salesSummaryTotalAmount,
    },
  };
  const { error } = await supabase.from("ai_insights_cache").insert({
    company_id: companyId,
    store_id: storeId,
    insight_type: LAST_PREDICTION_TYPE,
    payload: map,
    expires_at: expiresAt.toISOString(),
  });
  if (error) throw error;
}

export async function fetchDeepseekConfigured(): Promise<boolean> {
  try {
    const res = await fetch("/api/ai/config", { cache: "no-store", credentials: "same-origin" });
    if (!res.ok) return false;
    const j = (await res.json()) as { deepseekConfigured?: boolean };
    return j.deepseekConfigured === true;
  } catch {
    return false;
  }
}

export async function runPredictionGeneration(params: {
  companyId: string;
  companyName: string;
  storeId: string | null;
  storeName: string | null;
}): Promise<{ structured: PredictionStructured; text: string; context: PredictionContext }> {
  const ctx = await fetchPredictionContext(params);
  const res = await fetch("/api/ai/predictions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({
      companyId: params.companyId,
      storeId: params.storeId,
      companyName: params.companyName,
      storeName: params.storeName,
    }),
  });
  const rawText = await res.text();
  if (!res.ok) {
    let msg = rawText;
    try {
      const j = JSON.parse(rawText) as { error?: string };
      if (j.error) msg = j.error;
    } catch {
      /* */
    }
    throw new Error(msg || `Erreur API ${res.status}`);
  }
  let data: { structured: PredictionStructured; text: string };
  try {
    data = JSON.parse(rawText) as { structured: PredictionStructured; text: string };
  } catch {
    throw new Error("Réponse IA invalide");
  }
  return { structured: data.structured, text: data.text, context: ctx };
}

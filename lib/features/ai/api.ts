"use client";

import { createClient } from "@/lib/supabase/client";
import type { AiInsightsData } from "./types";

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - Math.max(0, days));
  return d.toISOString();
}

export async function fetchAiInsightsData(params: {
  companyId: string;
  storeId: string | null;
  days: number;
}): Promise<AiInsightsData> {
  const supabase = createClient();
  const fromIso = isoDaysAgo(params.days);

  let insightsQ = supabase
    .from("ai_insights_cache")
    .select("id, insight_type, payload, created_at, expires_at")
    .eq("company_id", params.companyId)
    .gte("created_at", fromIso)
    .order("created_at", { ascending: false })
    .limit(20);
  if (params.storeId) insightsQ = insightsQ.eq("store_id", params.storeId);

  let forecastsQ = supabase
    .from("forecast_snapshots")
    .select("id, product_id, snapshot_date, payload, created_at")
    .eq("company_id", params.companyId)
    .gte("created_at", fromIso)
    .order("created_at", { ascending: false })
    .limit(20);
  if (params.storeId) forecastsQ = forecastsQ.eq("store_id", params.storeId);

  let requestsQ = supabase
    .from("ai_requests")
    .select("id, type, input_summary, output_summary, tokens_used, created_at")
    .eq("company_id", params.companyId)
    .gte("created_at", fromIso)
    .order("created_at", { ascending: false })
    .limit(30);
  if (params.storeId) requestsQ = requestsQ.eq("store_id", params.storeId);

  const [{ data: insightsRaw, error: iErr }, { data: forecastsRaw, error: fErr }, { data: requestsRaw, error: rErr }] =
    await Promise.all([insightsQ, forecastsQ, requestsQ]);

  if (iErr) throw iErr;
  if (fErr) throw fErr;
  if (rErr) throw rErr;

  const insights = (insightsRaw ?? []).map((r) => ({
    id: String((r as { id: string }).id),
    insightType: String((r as { insight_type: string }).insight_type),
    payload: (r as { payload: unknown }).payload,
    createdAt: String((r as { created_at: string }).created_at),
    expiresAt: String((r as { expires_at: string }).expires_at),
  }));

  const forecasts = (forecastsRaw ?? []).map((r) => ({
    id: String((r as { id: string }).id),
    productId: ((r as { product_id?: string | null }).product_id ?? null) as string | null,
    snapshotDate: String((r as { snapshot_date: string }).snapshot_date),
    payload: (r as { payload: unknown }).payload,
    createdAt: String((r as { created_at: string }).created_at),
  }));

  const requests = (requestsRaw ?? []).map((r) => ({
    id: String((r as { id: string }).id),
    type: String((r as { type: string }).type),
    inputSummary: ((r as { input_summary?: string | null }).input_summary ?? null) as string | null,
    outputSummary: ((r as { output_summary?: string | null }).output_summary ?? null) as string | null,
    tokensUsed:
      (r as { tokens_used?: number | null }).tokens_used != null
        ? Number((r as { tokens_used?: number | null }).tokens_used)
        : null,
    createdAt: String((r as { created_at: string }).created_at),
  }));

  const totalTokens = requests.reduce((acc, r) => acc + (r.tokensUsed ?? 0), 0);

  return { insights, forecasts, requests, totalTokens };
}


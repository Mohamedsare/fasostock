"use client";

import { FsPullToRefresh } from "@/components/ui/fs-pull-to-refresh";
import {
  FsCard,
  FsPage,
  FsScreenHeader,
} from "@/components/ui/fs-screen-primitives";
import { ROUTES } from "@/lib/config/routes";
import { P } from "@/lib/constants/permissions";
import { useAppContext } from "@/lib/features/common/app-context";
import {
  fetchDeepseekConfigured,
  getLastPrediction,
  runPredictionGeneration,
  saveLastPrediction,
} from "@/lib/features/ai/predictions-api";
import type { PredictionContext, PredictionStructured } from "@/lib/features/ai/prediction-types";
import { usePermissions } from "@/lib/features/permissions/use-permissions";
import { useMediaQuery } from "@/lib/hooks/use-media-query";
import { messageFromUnknownError, toast } from "@/lib/toast";
import { formatCurrency } from "@/lib/utils/currency";
import { cn } from "@/lib/utils/cn";
import { createClient } from "@/lib/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  MdAutoAwesome,
  MdErrorOutline,
  MdInfoOutline,
  MdInventory2,
  MdLightbulbOutline,
  MdLockOutline,
  MdSettings,
  MdTrendingUp,
  MdWarningAmber,
} from "react-icons/md";

function trendLabel(t: string): string {
  if (t === "up") return "Hausse";
  if (t === "down") return "Baisse";
  return "Stable";
}

function priorityStyle(p: string): { label: string; className: string } {
  if (p === "high") return { label: "Priorité haute", className: "bg-red-500/12 text-red-600 dark:text-red-400" };
  if (p === "medium") return { label: "Moyenne", className: "bg-amber-500/12 text-amber-700 dark:text-amber-400" };
  return { label: "Basse", className: "bg-neutral-500/12 text-neutral-600 dark:text-neutral-400" };
}

function BarChartBlock({
  ctx,
  structured,
}: {
  ctx: PredictionContext;
  structured: PredictionStructured;
}) {
  const data: [number, string][] = [
    [ctx.salesSummary.totalAmount, "CA mois actuel"],
    [structured.forecastMonthCa, "CA prévu (mois)"],
    [structured.forecastWeekCa, "CA prévu (sem.)"],
  ];
  const maxY = Math.max(...data.map((d) => d[0]), 1) * 1.15;
  const barMaxPx = 160;
  const fmtAxis = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toFixed(0));

  return (
    <FsCard padding="p-5">
      <div className="flex items-center gap-2.5">
        <MdTrendingUp className="h-[22px] w-[22px] text-fs-accent" aria-hidden />
        <h2 className="text-base font-semibold text-fs-text">CA réel vs prévision</h2>
      </div>
      <div className="mt-5 flex h-[220px] items-end justify-around gap-2 border-b border-black/[0.08] pb-2 sm:gap-4">
        {data.map(([value, label], i) => {
          const barH = Math.max(6, (value / maxY) * barMaxPx);
          return (
            <div key={i} className="flex min-w-0 flex-1 flex-col items-center">
              <span className="mb-1 text-[10px] font-semibold text-fs-text sm:text-xs">{formatCurrency(value)}</span>
              <div className="flex h-[160px] w-full max-w-[36px] flex-col justify-end">
                <div
                  className="w-full rounded-t-md bg-fs-accent"
                  style={{ height: `${barH}px` }}
                  title={formatCurrency(value)}
                />
              </div>
              <p className="mt-2 line-clamp-2 min-h-[2.5rem] max-w-full text-center text-[10px] leading-tight text-neutral-600 sm:text-xs">
                {label}
              </p>
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-neutral-500">
        <span>0</span>
        <span>{fmtAxis(maxY)}</span>
      </div>
    </FsCard>
  );
}

export function AiScreen() {
  const router = useRouter();
  const ctxQ = useAppContext();
  const { data: ctx, hasPermission, helpers, isLoading: permLoading } = usePermissions();

  const companyId = ctx?.companyId ?? "";
  const companyName = ctx?.companyName ?? "";
  const stores = ctx?.stores ?? [];
  const storeId = ctx?.storeId ?? null;
  const storeLabel = storeId ? stores.find((s) => s.id === storeId)?.name ?? null : null;

  const isWide = useMediaQuery("(min-width: 900px)");
  const narrowHeader = useMediaQuery("(max-width: 559px)");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [structured, setStructured] = useState<PredictionStructured | null>(null);
  const [predContext, setPredContext] = useState<PredictionContext | null>(null);
  const [predictionsText, setPredictionsText] = useState<string | null>(null);

  const configQ = useQuery({
    queryKey: ["ai-deepseek-config"] as const,
    queryFn: fetchDeepseekConfigured,
    staleTime: 60_000,
  });
  const deepseekConfigured = configQ.data === true;

  const companyAiQ = useQuery({
    queryKey: ["company-ai-enabled", companyId] as const,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error: e } = await supabase
        .from("companies")
        .select("ai_predictions_enabled")
        .eq("id", companyId)
        .maybeSingle();
      if (e) throw e;
      return (data as { ai_predictions_enabled?: boolean } | null)?.ai_predictions_enabled === true;
    },
    enabled: Boolean(companyId),
    staleTime: 60_000,
  });

  const canAi = hasPermission(P.aiInsightsView);

  const resetState = useCallback(() => {
    setStructured(null);
    setPredContext(null);
    setPredictionsText(null);
    setError(null);
  }, []);

  const loadLast = useCallback(async () => {
    if (!companyId || !deepseekConfigured) return;
    resetState();
    try {
      const last = await getLastPrediction(companyId, storeId);
      if (!last) return;
      setStructured(last.structured);
      setPredictionsText(last.text);
      setPredContext({
        companyName,
        storeName: storeLabel,
        period: last.contextSummary.period,
        salesSummary: {
          totalAmount: last.contextSummary.salesSummaryTotalAmount,
          count: 0,
          itemsSold: 0,
          margin: 0,
        },
        previousMonthSummary: null,
        salesByDay: [],
        topProducts: [],
        purchasesSummary: { totalAmount: 0, count: 0 },
        stockValue: 0,
        lowStockCount: 0,
        marginRatePercent: 0,
      });
    } catch {
      /* cache optionnel */
    }
  }, [companyId, storeId, companyName, storeLabel, deepseekConfigured, resetState]);

  useEffect(() => {
    if (permLoading) return;
    if (helpers?.isCashier) {
      router.replace(ROUTES.sales);
    }
  }, [permLoading, helpers?.isCashier, router]);

  useEffect(() => {
    if (!configQ.isFetched) return;
    if (!companyId || !deepseekConfigured) return;
    void loadLast();
  }, [companyId, storeId, deepseekConfigured, configQ.isFetched, loadLast]);

  const description = useMemo(() => {
    if (!companyName) return "Insights et recommandations";
    return storeLabel
      ? `Insights pour ${companyName} · ${storeLabel}`
      : `Insights pour ${companyName}`;
  }, [companyName, storeLabel]);

  const handlePullRefresh = useCallback(async () => {
    await Promise.all([configQ.refetch(), companyAiQ.refetch()]);
    await loadLast();
  }, [configQ.refetch, companyAiQ.refetch, loadLast]);

  async function onGenerate() {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    setStructured(null);
    setPredContext(null);
    setPredictionsText(null);
    try {
      const { structured: s, text, context } = await runPredictionGeneration({
        companyId,
        companyName,
        storeId,
        storeName: storeLabel,
      });
      setStructured(s);
      setPredContext(context);
      setPredictionsText(text);
      await saveLastPrediction(companyId, storeId, {
        structured: s,
        text,
        contextSummary: {
          period: context.period,
          salesSummaryTotalAmount: context.salesSummary.totalAmount,
        },
      });
    } catch (e) {
      const msg = messageFromUnknownError(e);
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  const headerActions =
    companyId && canAi && companyAiQ.data !== false && deepseekConfigured && !companyAiQ.isLoading ? (
      narrowHeader ? (
        <button
          type="button"
          onClick={() => void onGenerate()}
          disabled={loading}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-[10px] bg-fs-accent px-4 py-3 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
        >
          {loading ? (
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
          ) : (
            <MdAutoAwesome className="h-5 w-5 text-white" aria-hidden />
          )}
          {loading ? "Analyse…" : "Générer les prédictions"}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => void onGenerate()}
          disabled={loading}
          className="inline-flex shrink-0 items-center gap-2 rounded-[10px] bg-fs-accent px-4 py-2.5 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
        >
          {loading ? (
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
          ) : (
            <MdAutoAwesome className="h-5 w-5 text-white" aria-hidden />
          )}
          {loading ? "Analyse…" : "Générer les prédictions"}
        </button>
      )
    ) : null;

  if (ctxQ.isLoading && !ctx) {
    return (
      <FsPage className="min-[900px]:px-8 min-[900px]:py-7">
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className="h-9 w-9 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" aria-hidden />
        </div>
      </FsPage>
    );
  }

  if (ctxQ.isError && !companyId) {
    return (
      <FsPage>
        <FsScreenHeader title="Prédictions IA" subtitle="Insights et recommandations" />
        <FsCard padding="p-8">
          <div className="flex flex-col items-center gap-4 text-center">
            <MdErrorOutline className="h-12 w-12 text-red-600" aria-hidden />
            <p className="text-sm text-red-700">{messageFromUnknownError(ctxQ.error)}</p>
          </div>
        </FsCard>
      </FsPage>
    );
  }

  if (helpers?.isCashier) {
    return null;
  }

  if (companyId && !canAi) {
    return (
      <FsPage className="min-[900px]:px-8 min-[900px]:py-7">
        <FsScreenHeader title="Prédictions IA" subtitle="Insights et recommandations" />
        <FsCard padding="p-8">
          <div className="flex flex-col items-center gap-4 text-center">
            <MdLockOutline className="h-12 w-12 text-neutral-500" aria-hidden />
            <p className="text-sm font-medium text-neutral-600">Vous n&apos;avez pas accès à cette section.</p>
          </div>
        </FsCard>
      </FsPage>
    );
  }

  if (!companyId) {
    return (
      <FsPage className="min-[900px]:px-8 min-[900px]:py-7">
        <FsScreenHeader title="Prédictions IA" subtitle="Insights et recommandations" />
        <FsCard padding="p-8">
          <p className="text-center text-sm text-neutral-600">
            Sélectionnez une entreprise pour afficher les prédictions.
          </p>
        </FsCard>
      </FsPage>
    );
  }

  if (companyAiQ.isLoading) {
    return (
      <FsPage className="min-[900px]:px-8 min-[900px]:py-7">
        <div className="flex min-h-[30vh] items-center justify-center">
          <div className="h-9 w-9 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" aria-hidden />
        </div>
      </FsPage>
    );
  }

  if (companyAiQ.data === false) {
    return (
      <FsPage className="min-[900px]:px-8 min-[900px]:py-7">
        <FsScreenHeader title="Prédictions IA" subtitle="Insights et recommandations" />
        <FsCard padding="p-8">
          <div className="flex flex-col items-center text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-amber-500/15">
              <MdInfoOutline className="h-10 w-10 text-amber-700" aria-hidden />
            </div>
            <h2 className="mt-5 text-lg font-semibold text-fs-text">Prédictions IA désactivées</h2>
            <p className="mt-2 max-w-md text-sm text-neutral-600">
              L&apos;accès aux prédictions IA est désactivé pour votre entreprise. Contactez l&apos;administrateur de la
              plateforme pour plus d&apos;informations.
            </p>
          </div>
        </FsCard>
      </FsPage>
    );
  }

  if (configQ.isLoading) {
    return (
      <FsPage className="min-[900px]:px-8 min-[900px]:py-7">
        <div className="flex min-h-[30vh] items-center justify-center">
          <div className="h-9 w-9 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" aria-hidden />
        </div>
      </FsPage>
    );
  }

  if (!deepseekConfigured) {
    return (
      <FsPage className="min-[900px]:px-8 min-[900px]:py-7">
        <FsScreenHeader title="Prédictions IA" subtitle="Insights et recommandations" />
        <FsCard padding="p-8">
          <div className="flex flex-col items-center text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-amber-500/15">
              <MdSettings className="h-10 w-10 text-amber-700" aria-hidden />
            </div>
            <h2 className="mt-5 text-lg font-semibold text-fs-text">API DeepSeek non configurée</h2>
            <p className="mt-3 max-w-md text-sm text-neutral-600">
              Ajoutez la clé API DeepSeek (variable d&apos;environnement <code className="rounded bg-fs-surface-container px-1">DEEPSEEK_API_KEY</code> côté serveur) pour activer les prédictions.
            </p>
          </div>
        </FsCard>
      </FsPage>
    );
  }

  const mainBody = (
    <div className="space-y-6">
      {error ? (
        <FsCard className="border border-red-300/50 bg-red-50/40 dark:bg-red-950/20" padding="p-4">
          <div className="flex gap-3">
            <MdErrorOutline className="mt-0.5 h-6 w-6 shrink-0 text-red-600" aria-hidden />
            <p className="min-w-0 text-sm text-red-900 dark:text-red-200">{error}</p>
          </div>
        </FsCard>
      ) : null}

      {structured != null && predContext != null ? (
        <>
          <div
            className={cn(
              "grid gap-4",
              isWide ? "grid-cols-4" : "grid-cols-2",
            )}
          >
            <FsCard
              className="border-2 border-fs-accent/50"
              padding="p-4"
            >
              <p className="text-xs font-medium text-neutral-600">CA prévu (semaine)</p>
              <p className="mt-1.5 truncate text-base font-bold text-fs-text">{formatCurrency(structured.forecastWeekCa)}</p>
            </FsCard>
            <FsCard padding="p-4">
              <p className="text-xs font-medium text-neutral-600">CA prévu (mois)</p>
              <p className="mt-1.5 truncate text-base font-bold text-fs-text">{formatCurrency(structured.forecastMonthCa)}</p>
            </FsCard>
            <FsCard padding="p-4">
              <p className="text-xs font-medium text-neutral-600">Tendance</p>
              <p className="mt-1.5 text-base font-bold text-fs-text">{trendLabel(structured.trend)}</p>
              {structured.trendReason ? (
                <p className="mt-1 line-clamp-2 text-xs text-neutral-600">{structured.trendReason}</p>
              ) : null}
            </FsCard>
            <FsCard padding="p-4">
              <p className="text-xs font-medium text-neutral-600">CA mois actuel</p>
              <p className="mt-1.5 truncate text-base font-bold text-fs-text">
                {formatCurrency(predContext.salesSummary.totalAmount)}
              </p>
            </FsCard>
          </div>

          <BarChartBlock ctx={predContext} structured={structured} />

          <div className={cn(isWide ? "grid grid-cols-2 gap-6" : "flex flex-col gap-6")}>
            <FsCard padding="p-0">
              <div className="border-b border-black/[0.06] px-5 py-4">
                <div className="flex items-center gap-2.5">
                  <MdInventory2 className="h-[22px] w-[22px] text-fs-accent" aria-hidden />
                  <h2 className="text-base font-semibold text-fs-text">Réapprovisionnement prioritaire</h2>
                </div>
              </div>
              {structured.restockPriorities.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-neutral-600">Aucun produit à réapprovisionner</p>
              ) : (
                <ul className="divide-y divide-black/[0.06]">
                  {structured.restockPriorities.map((r, idx) => {
                    const pr = priorityStyle(r.priority);
                    return (
                      <li key={`${r.productName}-${idx}`} className="flex items-start justify-between gap-3 px-5 py-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-fs-text">{r.productName}</p>
                          {r.quantitySuggested ? (
                            <p className="truncate text-xs text-neutral-600">{r.quantitySuggested}</p>
                          ) : null}
                        </div>
                        <span
                          className={cn(
                            "shrink-0 rounded-xl px-2.5 py-1 text-[11px] font-semibold",
                            pr.className,
                          )}
                        >
                          {pr.label}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </FsCard>

            <FsCard padding="p-0">
              <div className="border-b border-black/[0.06] px-5 py-4">
                <div className="flex items-center gap-2.5">
                  <MdWarningAmber className="h-[22px] w-[22px] text-amber-700" aria-hidden />
                  <h2 className="text-base font-semibold text-fs-text">Alertes et risques</h2>
                </div>
              </div>
              {structured.alerts.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-neutral-600">Aucune alerte</p>
              ) : (
                <ul className="divide-y divide-black/[0.06]">
                  {structured.alerts.map((a, idx) => (
                    <li key={idx} className="px-5 py-3">
                      {a.type ? (
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{a.type}</p>
                      ) : null}
                      <p className="mt-0.5 text-sm text-fs-text">{a.message}</p>
                    </li>
                  ))}
                </ul>
              )}
            </FsCard>
          </div>

          {structured.recommendations.length > 0 ? (
            <FsCard padding="p-5">
              <div className="flex items-center gap-2.5">
                <MdLightbulbOutline className="h-[22px] w-[22px] text-fs-accent" aria-hidden />
                <h2 className="text-base font-semibold text-fs-text">Recommandations stratégiques</h2>
              </div>
              <ul className="mt-4 space-y-2">
                {structured.recommendations.map((r, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-fs-accent" aria-hidden />
                    <p className="text-sm leading-relaxed text-fs-text">{r.action}</p>
                  </li>
                ))}
              </ul>
            </FsCard>
          ) : null}

          {predictionsText != null && predictionsText.trim() !== "" ? (
            <FsCard padding="p-5">
              <div className="flex items-center gap-2.5">
                <MdAutoAwesome className="h-[22px] w-[22px] text-fs-accent" aria-hidden />
                <h2 className="text-base font-semibold text-fs-text">Résumé et analyse</h2>
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-fs-text">{predictionsText}</p>
            </FsCard>
          ) : null}
        </>
      ) : null}

      {structured == null && !loading ? (
        <FsCard padding="p-8">
          <p className="text-center text-sm text-neutral-600">
            Cliquez sur « Générer les prédictions » pour afficher statistiques, graphiques et recommandations.
          </p>
        </FsCard>
      ) : null}
    </div>
  );

  return (
    <FsPage className="min-[900px]:px-8 min-[900px]:py-7">
      <FsPullToRefresh onRefresh={handlePullRefresh}>
        <div
          className={cn(
            narrowHeader ? "flex flex-col" : "flex flex-row flex-wrap items-start justify-between gap-4",
          )}
        >
          <FsScreenHeader
            title="Prédictions IA"
            subtitle={description}
            className={cn("mb-0 min-w-0", !narrowHeader && "flex-1")}
            titleClassName="min-[900px]:text-2xl min-[900px]:font-bold min-[900px]:tracking-tight"
          />
          {!narrowHeader ? headerActions : null}
        </div>
        {narrowHeader ? headerActions : null}

        <div className="mt-6">{mainBody}</div>
      </FsPullToRefresh>
    </FsPage>
  );
}

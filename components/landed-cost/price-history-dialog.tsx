"use client";

import { useQuery } from "@tanstack/react-query";
import { MdClose, MdHistory, MdUndo } from "react-icons/md";
import { FsQueryErrorPanel } from "@/components/ui/fs-screen-primitives";
import { LcCard } from "./ui";
import { fetchPriceHistory } from "@/lib/features/landed-cost/api";
import { formatCost, formatQuantity } from "@/lib/features/landed-cost/format";
import { queryKeys } from "@/lib/query/query-keys";

function formatMoment(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * « Pourquoi ce produit coûte-t-il plus cher qu'avant ? »
 *
 * Chaque changement garde l'ancien prix, le nouveau, l'arrivage qui l'a provoqué et le
 * stock détenu ce jour-là. C'est ce dernier chiffre qui permet, des mois plus tard, de
 * relire une marge sans confondre l'ancien stock et le nouveau.
 */
export function PriceHistoryDialog({
  productId,
  productName,
  onClose,
}: {
  productId: string;
  productName: string;
  onClose: () => void;
}) {
  const q = useQuery({
    queryKey: queryKeys.productPriceHistory(productId),
    queryFn: () => fetchPriceHistory(productId),
    enabled: Boolean(productId),
    staleTime: 30_000,
  });

  const rows = q.data ?? [];

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Historique des prix de ${productName}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <LcCard
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-b-none shadow-xl sm:rounded-md"
        padding="p-4 sm:p-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold text-fs-text">{productName}</h2>
            <p className="mt-0.5 text-xs text-neutral-600">Historique des prix</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="fs-touch-target -mr-1 -mt-1 rounded-md p-1 text-neutral-500 hover:bg-black/5"
          >
            <MdClose className="h-5 w-5" />
          </button>
        </div>

        {q.isError ? (
          <FsQueryErrorPanel error={q.error} onRetry={() => void q.refetch()} className="mt-4" />
        ) : q.isLoading ? (
          <p className="mt-6 text-center text-sm text-neutral-500">Chargement…</p>
        ) : rows.length === 0 ? (
          <div className="mt-6 text-center">
            <MdHistory className="mx-auto h-8 w-8 text-neutral-300" aria-hidden />
            <p className="mt-2 text-sm font-semibold text-fs-text">Aucun changement enregistré</p>
            <p className="mt-1 text-xs leading-relaxed text-neutral-600">
              L&apos;historique se remplit dès qu&apos;un arrivage met à jour les prix de ce
              produit.
            </p>
          </div>
        ) : (
          <ol className="mt-4 space-y-2.5">
            {rows.map((r) => (
              <li
                key={r.id}
                className="rounded-md border border-black/[0.06] bg-fs-surface-container/60 p-3 dark:bg-white/4"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-xs font-semibold text-fs-text">
                    {formatMoment(r.createdAt)}
                  </span>
                  {r.source === "cost_batch_revert" ? (
                    <span className="inline-flex items-center gap-1 rounded-sm bg-neutral-500/12 px-1.5 py-0.5 text-[11px] font-semibold text-neutral-700 dark:text-neutral-300">
                      <MdUndo className="h-3 w-3" aria-hidden />
                      Retour en arrière
                    </span>
                  ) : null}
                </div>

                {r.batchLabel ? (
                  <p className="mt-1 truncate text-[11px] text-neutral-600">
                    Arrivage « {r.batchLabel} »
                  </p>
                ) : null}

                <dl className="mt-2 space-y-1 text-xs">
                  <div className="flex items-baseline justify-between gap-2">
                    <dt className="text-neutral-500">Prix d&apos;achat</dt>
                    <dd className="tabular-nums">
                      <span className="text-neutral-500 line-through">
                        {formatCost(r.oldPurchasePrice ?? 0)}
                      </span>{" "}
                      <span className="font-semibold text-fs-text">
                        {formatCost(r.newPurchasePrice ?? 0)}
                      </span>
                    </dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-2">
                    <dt className="text-neutral-500">Prix de vente</dt>
                    <dd className="tabular-nums">
                      <span className="text-neutral-500 line-through">
                        {formatCost(r.oldSalePrice ?? 0)}
                      </span>{" "}
                      <span className="font-semibold text-fs-text">
                        {formatCost(r.newSalePrice ?? 0)}
                      </span>
                    </dd>
                  </div>
                  {r.stockAtChange != null ? (
                    <div className="flex items-baseline justify-between gap-2">
                      <dt className="text-neutral-500">Stock ce jour-là</dt>
                      <dd className="tabular-nums text-neutral-700">
                        {formatQuantity(r.stockAtChange)}
                      </dd>
                    </div>
                  ) : null}
                </dl>

                {r.authorName ? (
                  <p className="mt-2 text-[11px] text-neutral-500">Par {r.authorName}</p>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </LcCard>
    </div>
  );
}

"use client";

import {
  MdArrowForward,
  MdEdit,
  MdHistory,
  MdInventory2,
  MdTrendingDown,
  MdTrendingUp,
  MdWarningAmber,
} from "react-icons/md";
import { FsCard } from "@/components/ui/fs-screen-primitives";
import {
  formatCost,
  formatPercent,
  formatQuantity,
  variationPercent,
} from "@/lib/features/landed-cost/format";
import type { ComputedLine, CostBatch } from "@/lib/features/landed-cost/types";
import { cn } from "@/lib/utils/cn";

/**
 * Ce qu'il faut voir sur une ligne, dans cet ordre : combien elle revient VRAIMENT,
 * ce qu'il reste de l'ancien stock (payé à un autre prix), et le prix de vente qui en
 * découle. Le reste est du détail.
 */

/** Alerte métier d'une ligne — calculée ici pour être identique en carte et en tableau. */
export type LineFlag = {
  tone: "danger" | "warning" | "info";
  label: string;
  detail: string;
};

export function lineFlag(l: ComputedLine): LineFlag | null {
  // Le pire cas : le prix de vente en vigueur ne couvre plus le coût de revient et la
  // ligne refuse la mise à jour du prix. Personne ne s'en apercevrait sans ce message.
  if (!l.applySalePrice && l.currentSalePrice > 0 && l.currentSalePrice < l.retainedCost) {
    return {
      tone: "danger",
      label: "Vente à perte",
      detail: `Vendu ${formatCost(l.currentSalePrice)} alors que l'article revient à ${formatCost(
        l.retainedCost,
      )}. Activez la mise à jour du prix ou remontez-le à la main.`,
    };
  }
  if (l.applySalePrice && l.suggestedSalePrice > 0 && l.suggestedSalePrice <= l.retainedCost) {
    return {
      tone: "danger",
      label: "Marge nulle ou négative",
      detail: `Le prix conseillé (${formatCost(
        l.suggestedSalePrice,
      )}) ne couvre pas le coût de revient. Revoyez la marge de cette ligne.`,
    };
  }
  const saleJump = variationPercent(l.currentSalePrice, l.suggestedSalePrice);
  if (l.applySalePrice && saleJump != null && saleJump >= 15) {
    return {
      tone: "warning",
      label: `Prix +${formatPercent(saleJump, 0)}`,
      detail:
        "Hausse forte : prévenez vos clients réguliers, ou étalez l'augmentation en réduisant " +
        "la marge sur cet arrivage.",
    };
  }
  if (l.stockBefore > 0 && l.currentPurchasePrice > 0) {
    const costJump = variationPercent(l.currentPurchasePrice, l.unitLandedCost);
    if (costJump != null && Math.abs(costJump) >= 10) {
      return {
        tone: "info",
        label: `Coût ${costJump > 0 ? "+" : ""}${formatPercent(costJump, 0)}`,
        detail: `Il reste ${formatQuantity(l.stockBefore)} article(s) achetés à ${formatCost(
          l.currentPurchasePrice,
        )}. ${
          l.retainedCost === l.weightedCost
            ? "La moyenne pondérée en tient compte."
            : "Le coût retenu ignore cet ancien stock."
        }`,
      };
    }
  }
  return null;
}

const FLAG_STYLES: Record<LineFlag["tone"], string> = {
  danger: "bg-red-500/12 text-red-700 dark:text-red-300",
  warning: "bg-amber-500/14 text-amber-700 dark:text-amber-300",
  info: "bg-sky-500/12 text-sky-800 dark:text-sky-200",
};

function FlagBadge({ flag }: { flag: LineFlag }) {
  const Icon =
    flag.tone === "danger" ? MdWarningAmber : flag.tone === "warning" ? MdTrendingUp : MdInventory2;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold",
        FLAG_STYLES[flag.tone],
      )}
      title={flag.detail}
    >
      <Icon className="h-3 w-3 shrink-0" aria-hidden />
      {flag.label}
    </span>
  );
}

/** Ancien prix → nouveau prix, avec la variation. Le cœur du « avant / après ». */
function PriceShift({
  before,
  after,
  muted,
}: {
  before: number;
  after: number;
  /** Le prix ne sera pas appliqué : on montre le conseil en grisé. */
  muted?: boolean;
}) {
  const delta = variationPercent(before, after);
  const same = Math.abs(after - before) < 0.5;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <span className={cn("text-neutral-500", !same && "line-through")}>
        {before > 0 ? formatCost(before) : "—"}
      </span>
      {same ? null : (
        <>
          <MdArrowForward className="h-3 w-3 shrink-0 text-neutral-400" aria-hidden />
          <span className={cn("font-bold", muted ? "text-neutral-400" : "text-fs-text")}>
            {formatCost(after)}
          </span>
          {delta != null ? (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 text-[11px] font-semibold",
                delta > 0 ? "text-amber-700 dark:text-amber-300" : "text-emerald-700 dark:text-emerald-300",
              )}
            >
              {delta > 0 ? (
                <MdTrendingUp className="h-3 w-3" aria-hidden />
              ) : (
                <MdTrendingDown className="h-3 w-3" aria-hidden />
              )}
              {delta > 0 ? "+" : ""}
              {formatPercent(delta, 1)}
            </span>
          ) : null}
        </>
      )}
    </span>
  );
}

export function ResultTable({
  lines,
  batch,
  editable,
  onEdit,
  onToggleApplySale,
  onShowHistory,
}: {
  lines: ComputedLine[];
  batch: CostBatch;
  /** Un arrivage appliqué se consulte, ne se modifie plus. */
  editable: boolean;
  onEdit: (line: ComputedLine) => void;
  onToggleApplySale: (line: ComputedLine, next: boolean) => void;
  onShowHistory: (line: ComputedLine) => void;
}) {
  if (lines.length === 0) return null;

  return (
    <>
      {/* Mobile : une carte par ligne — un tableau à dix colonnes est illisible au doigt. */}
      <div className="space-y-2 min-[1100px]:hidden">
        {lines.map((l) => {
          const flag = lineFlag(l);
          return (
            <FsCard key={l.itemId} padding="p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-fs-text">{l.productName}</p>
                  <p className="mt-0.5 text-[11px] text-neutral-500">
                    {formatQuantity(l.quantity)} {l.unit} × {formatCost(l.unitPrice)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onShowHistory(l)}
                    aria-label={`Historique des prix de ${l.productName}`}
                    className="fs-touch-target rounded-lg p-1.5 text-neutral-500 hover:bg-black/5"
                  >
                    <MdHistory className="h-4 w-4" />
                  </button>
                  {editable ? (
                    <button
                      type="button"
                      onClick={() => onEdit(l)}
                      aria-label={`Modifier ${l.productName}`}
                      className="fs-touch-target rounded-lg p-1.5 text-neutral-500 hover:bg-black/5"
                    >
                      <MdEdit className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="mt-2.5 rounded-lg bg-fs-surface-container/70 p-2.5 dark:bg-white/4">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                    Revient à
                  </span>
                  <span className="text-base font-bold text-fs-text">
                    {formatCost(l.unitLandedCost)}
                  </span>
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-neutral-600">
                  {formatCost(l.unitPrice)} de marchandise + {formatCost(
                    l.quantity > 0 ? l.allocatedCharges / l.quantity : 0,
                  )}{" "}
                  de frais
                  {l.landedTotal > 0 ? (
                    <> ({formatPercent((l.allocatedCharges / l.landedTotal) * 100, 0)} du coût)</>
                  ) : null}
                </p>
              </div>

              {l.stockBefore > 0 ? (
                <p className="mt-2 text-[11px] leading-relaxed text-neutral-600">
                  <span className="font-semibold text-fs-text">
                    {formatQuantity(l.stockBefore)} en stock
                  </span>{" "}
                  à {formatCost(l.currentPurchasePrice)} ·{" "}
                  {batch.costingMethod === "weighted_average" ? (
                    <>
                      coût moyen retenu{" "}
                      <span className="font-semibold text-fs-text">
                        {formatCost(l.retainedCost)}
                      </span>
                    </>
                  ) : (
                    <>coût de l&apos;arrivage retenu</>
                  )}
                </p>
              ) : null}

              <dl className="mt-2.5 space-y-1.5 text-xs">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <dt className="text-neutral-500">Prix d&apos;achat</dt>
                  <dd>
                    <PriceShift before={l.currentPurchasePrice} after={l.retainedCost} />
                  </dd>
                </div>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <dt className="text-neutral-500">Prix de vente</dt>
                  <dd>
                    <PriceShift
                      before={l.currentSalePrice}
                      after={l.applySalePrice ? l.suggestedSalePrice : l.currentSalePrice}
                      muted={!l.applySalePrice}
                    />
                  </dd>
                </div>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <dt className="text-neutral-500">Marge unitaire</dt>
                  <dd className="font-semibold text-fs-text">
                    {formatCost(l.marginAmount)}{" "}
                    <span className="text-neutral-500">({formatPercent(l.marginRate)})</span>
                  </dd>
                </div>
              </dl>

              {flag ? (
                <div className="mt-2.5 space-y-1">
                  <FlagBadge flag={flag} />
                  <p className="text-[11px] leading-relaxed text-neutral-600">{flag.detail}</p>
                </div>
              ) : null}

              {editable ? (
                <label className="mt-2.5 flex cursor-pointer items-center justify-between gap-2 border-t border-black/[0.06] pt-2.5">
                  <span className="text-xs text-neutral-600">
                    Appliquer le nouveau prix de vente
                  </span>
                  <input
                    type="checkbox"
                    role="switch"
                    className="h-5 w-9 shrink-0 cursor-pointer accent-fs-accent"
                    checked={l.applySalePrice}
                    onChange={(e) => onToggleApplySale(l, e.target.checked)}
                  />
                </label>
              ) : null}
            </FsCard>
          );
        })}
      </div>

      {/* Desktop : tableau dense, première colonne figée au défilement horizontal. */}
      <div className="hidden min-[1100px]:block">
        <FsCard padding="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1040px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-black/[0.06] text-left text-[11px] uppercase tracking-wide text-neutral-500">
                  <th className="sticky left-0 z-10 bg-fs-card px-3 py-2.5 font-semibold">
                    Produit
                  </th>
                  <th className="px-3 py-2.5 text-right font-semibold">Qté</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Achat u.</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Frais u.</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Revient u.</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Stock actuel</th>
                  <th className="px-3 py-2.5 font-semibold">Prix d&apos;achat</th>
                  <th className="px-3 py-2.5 font-semibold">Prix de vente</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Marge</th>
                  <th className="px-3 py-2.5 text-center font-semibold">Appliquer</th>
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => {
                  const flag = lineFlag(l);
                  const unitCharges = l.quantity > 0 ? l.allocatedCharges / l.quantity : 0;
                  return (
                    <tr
                      key={l.itemId}
                      className="border-b border-black/[0.04] last:border-0 hover:bg-black/[0.015] dark:hover:bg-white/[0.02]"
                    >
                      <td className="sticky left-0 z-10 max-w-[220px] bg-fs-card px-3 py-2.5">
                        <span className="block truncate font-semibold text-fs-text">
                          {l.productName}
                        </span>
                        {flag ? (
                          <span className="mt-1 block">
                            <FlagBadge flag={flag} />
                          </span>
                        ) : null}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-neutral-700">
                        {formatQuantity(l.quantity)} {l.unit}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-neutral-700">
                        {formatCost(l.unitPrice)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-neutral-700">
                        + {formatCost(unitCharges)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums font-bold text-fs-text">
                        {formatCost(l.unitLandedCost)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-neutral-700">
                        {l.stockBefore > 0 ? (
                          <>
                            {formatQuantity(l.stockBefore)}
                            <span className="block text-[11px] text-neutral-500">
                              à {formatCost(l.currentPurchasePrice)}
                            </span>
                          </>
                        ) : (
                          <span className="text-neutral-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-xs">
                        <PriceShift before={l.currentPurchasePrice} after={l.retainedCost} />
                      </td>
                      <td className="px-3 py-2.5 text-xs">
                        <PriceShift
                          before={l.currentSalePrice}
                          after={l.applySalePrice ? l.suggestedSalePrice : l.currentSalePrice}
                          muted={!l.applySalePrice}
                        />
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                        <span className="font-semibold text-fs-text">
                          {formatCost(l.marginAmount)}
                        </span>
                        <span className="block text-[11px] text-neutral-500">
                          {formatPercent(l.marginRate)}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <input
                          type="checkbox"
                          role="switch"
                          aria-label={`Appliquer le nouveau prix de vente de ${l.productName}`}
                          className="h-5 w-9 cursor-pointer accent-fs-accent disabled:cursor-default disabled:opacity-50"
                          checked={l.applySalePrice}
                          disabled={!editable}
                          onChange={(e) => onToggleApplySale(l, e.target.checked)}
                        />
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => onShowHistory(l)}
                          aria-label={`Historique des prix de ${l.productName}`}
                          className="rounded-lg p-1.5 text-neutral-500 hover:bg-black/5"
                        >
                          <MdHistory className="h-4 w-4" />
                        </button>
                        {editable ? (
                          <button
                            type="button"
                            onClick={() => onEdit(l)}
                            aria-label={`Modifier ${l.productName}`}
                            className="rounded-lg p-1.5 text-neutral-500 hover:bg-black/5"
                          >
                            <MdEdit className="h-4 w-4" />
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </FsCard>
      </div>
    </>
  );
}

"use client";

import { FsCard, fsInputClass } from "@/components/ui/fs-screen-primitives";
import { cn } from "@/lib/utils/cn";
import { useEffect, useMemo, useState } from "react";
import { MdAddCircleOutline, MdChecklist, MdClose, MdInventory2 } from "react-icons/md";

const MIN_TOUCH = 48;

export type AdjustStockDialogProps = {
  open: boolean;
  onClose: () => void;
  productName: string;
  imageUrl?: string | null;
  /** Unité affichée comme Flutter (`Stock actuel: X ${unit}`). */
  unit?: string;
  currentQty: number;
  onConfirm: (payload: { delta: number; reason: string }) => Promise<void> | void;
};

/**
 * Aligné sur `adjust_stock_dialog.dart` (Flutter) : AlertDialog,
 * Variation (+/-) | Inventaire, libellés et raisons par défaut identiques.
 */
export function AdjustStockDialog({
  open,
  onClose,
  productName,
  imageUrl,
  unit = "pce",
  currentQty,
  onConfirm,
}: AdjustStockDialogProps) {
  const [mode, setMode] = useState<"delta" | "inventory">("delta");
  const [deltaDirection, setDeltaDirection] = useState<"add" | "remove">("add");
  const [deltaQty, setDeltaQty] = useState("");
  const [counted, setCounted] = useState(String(currentQty));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setMode("delta");
    setDeltaDirection("add");
    setDeltaQty("");
    setCounted(String(currentQty));
    setReason("");
    setBusy(false);
    setError(null);
  }, [open, currentQty]);

  const computedDelta = useMemo(() => {
    if (mode === "inventory") {
      const c = Number.parseInt(counted, 10);
      if (!Number.isFinite(c) || c < 0) return 0;
      return c - currentQty;
    }
    const q = Number.parseInt(deltaQty, 10);
    if (!Number.isFinite(q) || q <= 0) return 0;
    const abs = Math.abs(Math.trunc(q));
    return deltaDirection === "add" ? abs : -abs;
  }, [mode, deltaQty, deltaDirection, counted, currentQty]);

  const needsAdjust = computedDelta !== 0;

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 pb-[calc(72px+var(--fs-safe-bottom,0px))] sm:items-center sm:pb-3"
      role="dialog"
      aria-modal="true"
      aria-labelledby="adjust-stock-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <FsCard
        padding="p-0"
        className="flex max-h-[min(82dvh,700px)] w-full max-w-md flex-col overflow-hidden"
      >
        <div className="flex items-center justify-between border-b border-black/6 px-4 py-3 sm:px-5">
          <h2 id="adjust-stock-title" className="text-lg font-semibold leading-tight text-fs-text">
            Ajuster le stock
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-black/8 bg-white text-neutral-700"
            aria-label="Fermer"
            disabled={busy}
          >
            <MdClose className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          {/* En-tête produit — surfaceContainer + bordure, icône 48×48 (Flutter). */}
          <div className="rounded-xl border border-black/8 bg-neutral-100/80 p-3 dark:bg-fs-surface-container/80">
            <div className="flex gap-3">
              <div
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[10px] bg-fs-surface-container ring-1 ring-black/6"
                aria-hidden
              >
                {imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={imageUrl}
                    alt={productName}
                    className="h-12 w-12 rounded-[10px] object-cover"
                  />
                ) : (
                  <MdInventory2 className="h-6 w-6 text-neutral-600" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-base font-semibold leading-snug text-fs-text line-clamp-2">
                  {productName}
                </p>
                <p className="mt-0.5 text-sm text-neutral-600">
                  Stock actuel: {currentQty} {unit}
                </p>
              </div>
            </div>
          </div>

          {/* SegmentedButton — Variation | Inventaire */}
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setMode("delta")}
              style={{ minHeight: MIN_TOUCH }}
              className={cn(
                "inline-flex items-center justify-center gap-1.5 rounded-xl border px-2 text-xs font-semibold sm:text-sm",
                mode === "delta"
                  ? "border-fs-accent/40 bg-fs-accent/15 text-fs-accent"
                  : "border-black/8 bg-fs-surface-container text-neutral-700",
              )}
            >
              <MdAddCircleOutline className="h-[18px] w-[18px] shrink-0" aria-hidden />
              Variation (+/-)
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("inventory");
                setCounted(String(currentQty));
                setReason("Inventaire");
              }}
              style={{ minHeight: MIN_TOUCH }}
              className={cn(
                "inline-flex items-center justify-center gap-1.5 rounded-xl border px-2 text-xs font-semibold sm:text-sm",
                mode === "inventory"
                  ? "border-fs-accent/40 bg-fs-accent/15 text-fs-accent"
                  : "border-black/8 bg-fs-surface-container text-neutral-700",
              )}
            >
              <MdChecklist className="h-[18px] w-[18px] shrink-0" aria-hidden />
              Inventaire
            </button>
          </div>

          <div className="mt-4">
            {mode === "delta" ? (
              <>
                <div className="mb-2 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setDeltaDirection("add")}
                  className={cn(
                    "inline-flex min-h-[38px] items-center justify-center rounded-xl border px-3 text-sm font-semibold",
                      deltaDirection === "add"
                        ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                  : "border-black/8 bg-fs-surface-container text-neutral-700",
                    )}
                  >
                    Ajouter
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeltaDirection("remove")}
                  className={cn(
                    "inline-flex min-h-[38px] items-center justify-center rounded-xl border px-3 text-sm font-semibold",
                      deltaDirection === "remove"
                        ? "border-red-400 bg-red-50 text-red-700"
                        : "border-black/8 bg-fs-surface-container text-neutral-700",
                    )}
                  >
                    Diminuer
                  </button>
                </div>
                <label
                  htmlFor="adjust-delta"
                  className="block text-sm font-medium text-neutral-800"
                >
                  Quantité de variation
                </label>
                <input
                  id="adjust-delta"
                  inputMode="numeric"
                  className={cn(fsInputClass(), "mt-1.5 h-10")}
                  value={deltaQty}
                  onChange={(e) => setDeltaQty(e.target.value)}
                  placeholder="Ex: 10"
                  autoComplete="off"
                />
              </>
            ) : (
              <>
                <label
                  htmlFor="adjust-counted"
                  className="block text-sm font-medium text-neutral-800"
                >
                  Quantité comptée (inventaire physique)
                </label>
                <input
                  id="adjust-counted"
                  inputMode="numeric"
                  className={cn(fsInputClass(), "mt-1.5 h-10")}
                  value={counted}
                  onChange={(e) => setCounted(e.target.value)}
                  placeholder={String(currentQty)}
                  autoComplete="off"
                />
                {computedDelta !== 0 ? (
                  <p className="mt-1.5 text-sm text-neutral-600">
                    Correction : {computedDelta > 0 ? "+" : ""}
                    {computedDelta} {unit}
                  </p>
                ) : null}
              </>
            )}
          </div>

          <div className="mt-3">
            <label htmlFor="adjust-reason" className="block text-sm font-medium text-neutral-800">
              Raison
            </label>
            <input
              id="adjust-reason"
              className={cn(fsInputClass(), "mt-1.5 h-10")}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={
                mode === "inventory" ? "Inventaire" : "Ex: Correction, perte"
              }
            />
          </div>

          {error ? (
            <p className="mt-3 text-sm text-red-600">{error}</p>
          ) : null}
        </div>

        <div className="flex justify-center border-t border-black/6 bg-fs-card px-4 py-3 sm:px-5">
          <button
            type="button"
            onClick={async () => {
              setError(null);
              if (!needsAdjust) {
                setError(
                  mode === "inventory"
                    ? "Quantité comptée identique au stock actuel."
                    : "Indiquez une variation ou une quantité comptée.",
                );
                return;
              }
              const reasonFinal =
                reason.trim() ||
                (mode === "inventory" ? "Inventaire" : "Ajustement manuel");
              try {
                setBusy(true);
                await onConfirm({ delta: computedDelta, reason: reasonFinal });
                onClose();
              } catch (e) {
                setError(e instanceof Error ? e.message : "Ajustement impossible.");
              } finally {
                setBusy(false);
              }
            }}
            disabled={busy || !needsAdjust}
            className="inline-flex min-h-[40px] w-full max-w-[220px] items-center justify-center rounded-lg bg-fs-accent px-4 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? "Enregistrement…" : "Valider"}
          </button>
        </div>
      </FsCard>
    </div>
  );
}

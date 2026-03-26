"use client";

import { ProductListThumbnail } from "@/components/products/product-list-thumbnail";
import { FsCard, FsSectionLabel, fsInputClass } from "@/components/ui/fs-screen-primitives";
import { cn } from "@/lib/utils/cn";
import { useEffect, useMemo, useState } from "react";
import { MdClose, MdEdit } from "react-icons/md";

export type AdjustStockDialogProps = {
  open: boolean;
  onClose: () => void;
  productName: string;
  /** Première image produit (liste stock). */
  imageUrl?: string | null;
  currentQty: number;
  onConfirm: (payload: { delta: number; reason: string }) => Promise<void> | void;
};

export function AdjustStockDialog({
  open,
  onClose,
  productName,
  imageUrl = null,
  currentQty,
  onConfirm,
}: AdjustStockDialogProps) {
  const [mode, setMode] = useState<"delta" | "set">("delta");
  const [delta, setDelta] = useState<string>("0");
  const [target, setTarget] = useState<string>(String(currentQty));
  const [reason, setReason] = useState<string>("Ajustement manuel");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setMode("delta");
    setDelta("0");
    setTarget(String(currentQty));
    setReason("Ajustement manuel");
    setBusy(false);
    setError(null);
  }, [open, currentQty]);

  const computedDelta = useMemo(() => {
    const d = Number(delta);
    const t = Number(target);
    if (mode === "delta") return Number.isFinite(d) ? Math.trunc(d) : 0;
    if (!Number.isFinite(t)) return 0;
    return Math.trunc(t - currentQty);
  }, [mode, delta, target, currentQty]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Ajuster stock"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <FsCard className="w-full max-w-md" padding="p-3 sm:p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <ProductListThumbnail imageUrl={imageUrl ?? null} className="h-12 w-12 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-neutral-600">Ajuster stock</p>
              <p className="mt-0.5 truncate text-sm font-bold text-fs-text">
                {productName}
              </p>
              <p className="mt-0.5 text-xs text-neutral-600">
                Stock actuel: <span className="font-semibold">{currentQty}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-black/8 bg-fs-card text-neutral-700"
            aria-label="Fermer"
          >
            <MdClose className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="mt-3">
          <FsSectionLabel>Mode</FsSectionLabel>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => setMode("delta")}
              className={cn(
                "flex-1 rounded-[10px] border px-3 py-2 text-xs font-semibold sm:text-sm",
                mode === "delta"
                  ? "border-fs-accent/30 bg-[color-mix(in_srgb,var(--fs-accent)_20%,transparent)] text-fs-accent"
                  : "border-black/8 bg-fs-surface-container text-neutral-700",
              )}
            >
              Variation (+/-)
            </button>
            <button
              type="button"
              onClick={() => setMode("set")}
              className={cn(
                "flex-1 rounded-[10px] border px-3 py-2 text-xs font-semibold sm:text-sm",
                mode === "set"
                  ? "border-fs-accent/30 bg-[color-mix(in_srgb,var(--fs-accent)_20%,transparent)] text-fs-accent"
                  : "border-black/8 bg-fs-surface-container text-neutral-700",
              )}
            >
              Fixer quantité
            </button>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-1">
            <FsSectionLabel>{mode === "delta" ? "Delta" : "Nouvelle quantité"}</FsSectionLabel>
            <input
              inputMode="numeric"
              className={fsInputClass()}
              value={mode === "delta" ? delta : target}
              onChange={(e) => (mode === "delta" ? setDelta(e.target.value) : setTarget(e.target.value))}
              placeholder={mode === "delta" ? "ex: 5 ou -2" : "ex: 12"}
            />
          </div>
          <div className="sm:col-span-1">
            <FsSectionLabel>Delta calculé</FsSectionLabel>
            <div className="flex h-[42px] items-center rounded-[10px] border border-black/6 bg-fs-surface-container px-3 text-xs font-semibold text-neutral-800 sm:h-[46px] sm:text-sm">
              {computedDelta >= 0 ? `+${computedDelta}` : String(computedDelta)}
            </div>
          </div>
        </div>

        <div className="mt-3">
          <FsSectionLabel>Motif</FsSectionLabel>
          <input
            className={fsInputClass()}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="ex: casse, inventaire, correction…"
          />
        </div>

        {error ? (
          <p className="mt-2 text-xs font-semibold text-red-600">{error}</p>
        ) : null}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-[10px] border border-black/8 bg-fs-card px-3 py-2.5 text-xs font-semibold text-neutral-700 sm:text-sm"
            disabled={busy}
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={async () => {
              setError(null);
              if (!reason.trim()) {
                setError("Motif requis.");
                return;
              }
              if (!computedDelta || computedDelta === 0) {
                setError("Delta nul.");
                return;
              }
              try {
                setBusy(true);
                await onConfirm({ delta: computedDelta, reason: reason.trim() });
                onClose();
              } catch (e) {
                setError(e instanceof Error ? e.message : "Ajustement impossible.");
              } finally {
                setBusy(false);
              }
            }}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-[10px] bg-fs-accent px-3 py-2.5 text-xs font-semibold text-white shadow-sm active:scale-[0.99] sm:text-sm"
            disabled={busy}
          >
            <MdEdit className="h-4 w-4" aria-hidden />
            Valider
          </button>
        </div>
      </FsCard>
    </div>
  );
}


"use client";

import { ProductListThumbnail } from "@/components/products/product-list-thumbnail";
import { FsCard, fsInputClass } from "@/components/ui/fs-screen-primitives";
import { cn } from "@/lib/utils/cn";
import { useEffect, useMemo, useState } from "react";
import { MdAddCircleOutline, MdChecklist, MdClose, MdWarningAmber } from "react-icons/md";

export type BulkStockTarget = {
  productId: string;
  name: string;
  unit: string;
  currentQty: number;
  imageUrl: string | null;
};

export type BulkStockLine = { productId: string; delta: number };

type Mode = "add" | "set";

const MIN_TOUCH = 48;

/**
 * Entrée de stock sur toute une sélection de produits.
 *
 * Deux façons de faire, parce que les deux situations existent et ne se remplacent pas :
 *   • « Ajouter » — la livraison qui arrive, dix cartons par référence en plus de ce
 *     qui est déjà en rayon ;
 *   • « Mettre à » — le démarrage, où le stock affiché est faux (souvent zéro) et où
 *     c'est la quantité réelle comptée qui doit remplacer la valeur, pas s'y ajouter.
 *
 * La quantité commune ne fait que PRÉ-REMPLIR la liste : chaque ligne reste modifiable.
 * Sans cela, le commerçant devrait sortir du dialogue pour les trois références qui font
 * exception, et le raccourci ne servirait plus à rien.
 */
export function BulkStockEntryDialog({
  open,
  onClose,
  targets,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  targets: BulkStockTarget[];
  onConfirm: (payload: { lines: BulkStockLine[]; reason: string }) => Promise<void>;
}) {
  const [mode, setMode] = useState<Mode>("add");
  const [common, setCommon] = useState("");
  const [reason, setReason] = useState("");
  const [byProduct, setByProduct] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setMode("add");
    setCommon("");
    setReason("");
    setByProduct({});
    setBusy(false);
    setProgress(null);
    setError(null);
  }, [open]);

  const lines = useMemo(() => {
    const out: { target: BulkStockTarget; value: number | null; delta: number }[] = [];
    for (const t of targets) {
      const raw = byProduct[t.productId] ?? common;
      const parsed = Number.parseInt(raw, 10);
      const value = Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
      const delta = value == null ? 0 : mode === "add" ? value : value - t.currentQty;
      out.push({ target: t, value, delta });
    }
    return out;
  }, [targets, byProduct, common, mode]);

  const applicable = lines.filter((l) => l.delta !== 0);
  const decreases = applicable.filter((l) => l.delta < 0);
  const totalUnits = applicable.reduce((s, l) => s + l.delta, 0);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 pb-[calc(72px+var(--fs-safe-bottom,0px))] sm:items-center sm:pb-3"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bulk-stock-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <FsCard
        padding="p-0"
        className="flex max-h-[min(86dvh,760px)] w-full max-w-lg flex-col overflow-hidden"
      >
        <div className="flex items-center justify-between border-b border-black/6 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <h2 id="bulk-stock-title" className="text-lg font-semibold leading-tight text-fs-text">
              Remplir le stock
            </h2>
            <p className="mt-0.5 text-xs text-neutral-600">
              {targets.length} produit{targets.length > 1 ? "s" : ""} sélectionné
              {targets.length > 1 ? "s" : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-black/8 bg-white text-neutral-700 dark:bg-fs-surface-container"
            aria-label="Fermer"
            disabled={busy}
          >
            <MdClose className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setMode("add")}
              style={{ minHeight: MIN_TOUCH }}
              className={cn(
                "inline-flex items-center justify-center gap-1.5 rounded-xl border px-2 text-xs font-semibold sm:text-sm",
                mode === "add"
                  ? "border-fs-accent/40 bg-fs-accent/15 text-fs-accent"
                  : "border-black/8 bg-fs-surface-container text-neutral-700",
              )}
            >
              <MdAddCircleOutline className="h-[18px] w-[18px] shrink-0" aria-hidden />
              Ajouter au stock
            </button>
            <button
              type="button"
              onClick={() => setMode("set")}
              style={{ minHeight: MIN_TOUCH }}
              className={cn(
                "inline-flex items-center justify-center gap-1.5 rounded-xl border px-2 text-xs font-semibold sm:text-sm",
                mode === "set"
                  ? "border-fs-accent/40 bg-fs-accent/15 text-fs-accent"
                  : "border-black/8 bg-fs-surface-container text-neutral-700",
              )}
            >
              <MdChecklist className="h-[18px] w-[18px] shrink-0" aria-hidden />
              Mettre le stock à
            </button>
          </div>
          <p className="mt-2 text-xs text-neutral-600">
            {mode === "add"
              ? "La quantité s'ajoute à ce qui est déjà en rayon (livraison reçue)."
              : "La quantité remplace le stock actuel (démarrage, quantité comptée)."}
          </p>

          <div className="mt-4">
            <label htmlFor="bulk-common" className="block text-sm font-medium text-neutral-800">
              Quantité pour tous
            </label>
            <input
              id="bulk-common"
              inputMode="numeric"
              className={cn(fsInputClass(), "mt-1.5 h-10")}
              value={common}
              onChange={(e) => {
                setCommon(e.target.value);
                // La saisie commune repart de zéro : sinon une ligne modifiée plus tôt
                // resterait figée à l'ancienne valeur, invisible en bas d'une liste
                // de deux cents produits.
                setByProduct({});
              }}
              placeholder="Ex: 10"
              autoComplete="off"
              disabled={busy}
            />
          </div>

          <div className="mt-3">
            <label htmlFor="bulk-reason" className="block text-sm font-medium text-neutral-800">
              Raison
            </label>
            <input
              id="bulk-reason"
              className={cn(fsInputClass(), "mt-1.5 h-10")}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={mode === "add" ? "Ex: Livraison du 12/08" : "Ex: Stock de départ"}
              disabled={busy}
            />
          </div>

          {decreases.length > 0 ? (
            <p className="mt-3 flex items-start gap-2 rounded-[10px] bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-900 dark:text-amber-200">
              <MdWarningAmber className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>
                {decreases.length} produit{decreases.length > 1 ? "s" : ""} vont{" "}
                <b>baisser</b> : la quantité saisie est inférieure à leur stock actuel. Vérifiez
                avant de valider.
              </span>
            </p>
          ) : null}

          <div className="mt-4 overflow-hidden rounded-[10px] border border-black/[0.08]">
            <div className="flex items-center justify-between border-b border-black/[0.06] bg-fs-surface-container/60 px-3 py-2">
              <p className="text-xs font-bold uppercase tracking-wide text-neutral-700">
                Détail par produit
              </p>
              <p className="text-xs text-neutral-600">
                {applicable.length} ligne{applicable.length > 1 ? "s" : ""} à enregistrer
              </p>
            </div>
            <ul className="max-h-[240px] divide-y divide-black/[0.05] overflow-y-auto">
              {lines.map(({ target, delta }) => (
                <li key={target.productId} className="flex items-center gap-2 px-3 py-2">
                  <ProductListThumbnail
                    imageUrl={target.imageUrl}
                    className="h-9 w-9 shrink-0 rounded-lg"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-fs-text">{target.name}</p>
                    <p className="text-xs text-neutral-600">
                      Actuel : {target.currentQty} {target.unit}
                      {delta !== 0 ? (
                        <span
                          className={cn(
                            "ml-1.5 font-semibold",
                            delta > 0 ? "text-emerald-700" : "text-red-600",
                          )}
                        >
                          ({delta > 0 ? "+" : ""}
                          {delta})
                        </span>
                      ) : null}
                    </p>
                  </div>
                  <input
                    inputMode="numeric"
                    className={cn(fsInputClass(), "h-9 w-[86px] shrink-0 text-right")}
                    value={byProduct[target.productId] ?? common}
                    onChange={(e) =>
                      setByProduct((prev) => ({ ...prev, [target.productId]: e.target.value }))
                    }
                    aria-label={`Quantité pour ${target.name}`}
                    disabled={busy}
                  />
                </li>
              ))}
            </ul>
          </div>

          {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
          {progress ? <p className="mt-3 text-sm text-neutral-600">{progress}</p> : null}
        </div>

        <div className="flex flex-col gap-2 border-t border-black/6 bg-fs-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <p className="text-xs text-neutral-600">
            {applicable.length === 0
              ? "Saisissez une quantité."
              : `${applicable.length} produit(s) · ${totalUnits > 0 ? "+" : ""}${totalUnits} unité(s) au total`}
          </p>
          <button
            type="button"
            onClick={async () => {
              setError(null);
              if (applicable.length === 0) {
                setError("Aucune quantité à enregistrer.");
                return;
              }
              try {
                setBusy(true);
                setProgress("Enregistrement…");
                await onConfirm({
                  lines: applicable.map((l) => ({
                    productId: l.target.productId,
                    delta: l.delta,
                  })),
                  reason:
                    reason.trim() ||
                    (mode === "add" ? "Entrée groupée de stock" : "Stock de départ"),
                });
                onClose();
              } catch (e) {
                setError(e instanceof Error ? e.message : "Mise à jour impossible.");
                setProgress(null);
              } finally {
                setBusy(false);
              }
            }}
            disabled={busy || applicable.length === 0}
            className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-fs-accent px-5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? "Enregistrement…" : "Valider le stock"}
          </button>
        </div>
      </FsCard>
    </div>
  );
}

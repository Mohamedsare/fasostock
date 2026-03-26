"use client";

import { FsCard, fsInputClass } from "@/components/ui/fs-screen-primitives";
import type { PurchaseDetail } from "@/lib/features/purchases/types";
import { formatCurrency } from "@/lib/utils/currency";
import { cn } from "@/lib/utils/cn";
import { useEffect, useState } from "react";
import { MdClose, MdErrorOutline } from "react-icons/md";

function statusLabel(s: PurchaseDetail["status"]) {
  switch (s) {
    case "draft":
      return "Brouillon";
    case "confirmed":
      return "Confirmé";
    case "partially_received":
      return "Part. reçu";
    case "received":
      return "Reçu";
    case "cancelled":
      return "Annulé";
    default:
      return s;
  }
}

/** Aligné sur `_PurchaseDetailDialog` (Flutter) — pas de confirmation stock dans ce dialogue. */
export function PurchaseDetailDialog({
  open,
  onClose,
  detail,
  canManage,
  onSaveReference,
  onCancelDraft,
  onDeleteDraft,
}: {
  open: boolean;
  onClose: () => void;
  detail: PurchaseDetail | null;
  canManage: boolean;
  onSaveReference: (reference: string | null) => Promise<void> | void;
  onCancelDraft: () => Promise<void> | void;
  onDeleteDraft: () => Promise<void> | void;
}) {
  const [refInput, setRefInput] = useState("");
  const [savingRef, setSavingRef] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (detail) setRefInput(detail.reference ?? "");
  }, [detail?.id, detail?.reference]);

  if (!open) return null;

  const p = detail;
  const titleId = "purchase-detail-title";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:p-3 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <FsCard className="max-h-[min(90dvh,640px)] w-full max-w-[480px] overflow-hidden rounded-t-2xl sm:rounded-2xl" padding="p-0">
        <div className="max-h-[min(88dvh,620px)] overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-5 sm:pb-5">
          <div className="flex items-start justify-between gap-3">
            <h2 id={titleId} className="pr-2 text-xl font-semibold leading-snug text-fs-text">
              {p ? `Achat ${p.reference ?? p.id}` : "Achat"}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-black/8 bg-fs-card text-neutral-700"
              aria-label="Fermer"
            >
              <MdClose className="h-5 w-5" aria-hidden />
            </button>
          </div>

          {!p ? (
            <div className="py-12 text-center text-sm text-neutral-600">Chargement…</div>
          ) : (
            <>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="inline-flex items-center rounded-full border border-black/8 bg-fs-surface-container px-2.5 py-1 text-xs font-medium text-fs-text">
                  {statusLabel(p.status)}
                </span>
                {p.storeName ? (
                  <span className="text-sm text-neutral-700">Boutique: {p.storeName}</span>
                ) : null}
                {p.supplierName ? (
                  <span className="text-sm text-neutral-700">Fournisseur: {p.supplierName}</span>
                ) : null}
              </div>

              <p className="mt-3 text-sm text-fs-text">
                Date:{" "}
                {(() => {
                  try {
                    return new Date(p.createdAt).toLocaleString("fr-FR", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: false,
                    });
                  } catch {
                    return p.createdAt;
                  }
                })()}
              </p>
              <p className="mt-1 text-sm font-semibold text-fs-text">
                Total: {formatCurrency(p.total)}
              </p>

              {p.items.length > 0 ? (
                <>
                  <p className="mt-4 text-sm font-semibold text-fs-text">Articles</p>
                  <ul className="mt-2 space-y-2">
                    {p.items.map((it) => (
                      <li
                        key={it.id}
                        className="flex items-center justify-between gap-2 text-sm"
                      >
                        <span className="min-w-0 truncate text-neutral-800">
                          {it.quantity} × {it.unitPrice}
                        </span>
                        <span className="shrink-0 font-medium text-fs-text">
                          {formatCurrency(it.total)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}

              {p.status === "draft" && canManage ? (
                <div className="mt-5 border-t border-black/6 pt-4">
                  <label className="mb-1 block text-xs font-medium text-neutral-600">Référence</label>
                  <input
                    className={fsInputClass("rounded-[10px] border border-black/8")}
                    value={refInput}
                    onChange={(e) => setRefInput(e.target.value)}
                  />
                  <button
                    type="button"
                    disabled={savingRef}
                    onClick={async () => {
                      setError(null);
                      try {
                        setSavingRef(true);
                        await onSaveReference(refInput.trim() || null);
                      } catch (e) {
                        setError(e instanceof Error ? e.message : "Échec enregistrement.");
                      } finally {
                        setSavingRef(false);
                      }
                    }}
                    className="mt-3 min-h-[44px] w-full rounded-[10px] bg-fs-accent py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {savingRef ? (
                      <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    ) : (
                      "Enregistrer la référence"
                    )}
                  </button>
                </div>
              ) : null}

              {error ? (
                <div className="mt-3 flex gap-2 rounded-lg border border-red-200/80 bg-red-50/90 p-3 text-xs text-red-800">
                  <MdErrorOutline className="h-4 shrink-0" aria-hidden />
                  {error}
                </div>
              ) : null}

              <div className="mt-6 flex flex-col gap-2 border-t border-black/6 pt-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="min-h-[44px] w-full rounded-[10px] border border-black/8 bg-fs-card py-2.5 text-sm font-semibold text-neutral-800"
                >
                  Fermer
                </button>
                {p.status === "draft" && canManage ? (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={async () => {
                        setError(null);
                        try {
                          setBusy(true);
                          await onCancelDraft();
                        } catch (e) {
                          setError(e instanceof Error ? e.message : "Annulation impossible.");
                        } finally {
                          setBusy(false);
                        }
                      }}
                      className={cn(
                        "min-h-[44px] rounded-[10px] border border-black/8 bg-fs-card py-2.5 text-sm font-semibold text-fs-accent",
                        busy && "opacity-60",
                      )}
                    >
                      Annuler l&apos;achat
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={async () => {
                        setError(null);
                        try {
                          setBusy(true);
                          await onDeleteDraft();
                        } catch (e) {
                          setError(e instanceof Error ? e.message : "Suppression impossible.");
                        } finally {
                          setBusy(false);
                        }
                      }}
                      className={cn(
                        "min-h-[44px] rounded-[10px] bg-red-600 py-2.5 text-sm font-semibold text-white",
                        busy && "opacity-60",
                      )}
                    >
                      Supprimer
                    </button>
                  </div>
                ) : null}
              </div>
            </>
          )}
        </div>
      </FsCard>
    </div>
  );
}

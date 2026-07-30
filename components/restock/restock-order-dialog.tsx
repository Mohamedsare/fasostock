"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { MdClose, MdContentCopy } from "react-icons/md";
import { fsInputClass } from "@/components/ui/fs-screen-primitives";
import { createDraftPurchase, listSuppliers } from "@/lib/features/purchases/api";
import type { RestockOrderLine } from "@/lib/features/restock/types";
import { formatCurrency } from "@/lib/utils/currency";
import { messageFromUnknownError, toast } from "@/lib/toast";
import { cn } from "@/lib/utils/cn";

/**
 * Passer la commande depuis le réassort.
 *
 * Deux sorties possibles, selon la façon de travailler du gérant :
 *  - un ACHAT BROUILLON dans le module Achats (le stock ne bouge qu'à la réception) ;
 *  - une LISTE À ENVOYER au fournisseur (WhatsApp, SMS) via le presse-papiers.
 */
export function RestockOrderDialog({
  open,
  onClose,
  companyId,
  stores,
  defaultStoreId,
  lines,
  onOrdered,
}: {
  open: boolean;
  onClose: () => void;
  companyId: string;
  stores: { id: string; name: string }[];
  /** Boutique courante — `null` en vue « toutes boutiques » : il faut alors choisir. */
  defaultStoreId: string | null;
  lines: RestockOrderLine[];
  onOrdered: () => void;
}) {
  const [storeId, setStoreId] = useState<string>("");
  const [supplierId, setSupplierId] = useState<string>("");
  const [reference, setReference] = useState("");
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [quantities, setQuantities] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setStoreId(defaultStoreId ?? (stores.length === 1 ? stores[0]!.id : ""));
    setSupplierId("");
    setReference("");
    setPrices(Object.fromEntries(lines.map((l) => [l.productId, String(l.unitPrice)])));
    setQuantities(Object.fromEntries(lines.map((l) => [l.productId, String(l.quantity)])));
  }, [open, defaultStoreId, stores, lines]);

  const suppliersQ = useQuery({
    queryKey: ["suppliers", companyId] as const,
    queryFn: () => listSuppliers(companyId),
    enabled: open && !!companyId,
    staleTime: 60_000,
  });

  const resolved = useMemo(
    () =>
      lines.map((l) => {
        const qty = Math.max(0, Math.trunc(Number(quantities[l.productId] ?? l.quantity) || 0));
        const price = Math.max(
          0,
          Number(String(prices[l.productId] ?? l.unitPrice).replace(",", ".")) || 0,
        );
        return { ...l, quantity: qty, unitPrice: price, total: qty * price };
      }),
    [lines, quantities, prices],
  );

  const kept = useMemo(() => resolved.filter((l) => l.quantity > 0), [resolved]);
  const total = useMemo(() => kept.reduce((acc, l) => acc + l.total, 0), [kept]);

  const orderMut = useMutation({
    mutationFn: () =>
      createDraftPurchase({
        companyId,
        storeId,
        supplierId,
        reference: reference.trim() || null,
        items: kept.map((l) => ({
          productId: l.productId,
          productName: l.productName,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
        })),
      }),
    onSuccess: () => {
      toast.success(
        "Achat brouillon créé. Le stock sera mis à jour à la réception, depuis la page Achats.",
      );
      onOrdered();
      onClose();
    },
    onError: (e) => toast.error(messageFromUnknownError(e, "Création de l'achat impossible.")),
  });

  async function copyList() {
    const supplierName =
      suppliersQ.data?.find((s) => s.id === supplierId)?.name ?? "";
    const text = [
      supplierName ? `Commande — ${supplierName}` : "Commande",
      ...kept.map((l) => `- ${l.productName} : ${l.quantity}`),
      "",
      `Total estimé : ${formatCurrency(total)}`,
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Liste copiée. Collez-la dans WhatsApp ou un SMS.");
    } catch {
      toast.error("Copie impossible sur cet appareil. Sélectionnez le texte à la main.");
    }
  }

  if (!open) return null;

  const canOrder =
    !!storeId && !!supplierId && kept.length > 0 && !orderMut.isPending;

  return (
    <div className="fixed inset-0 z-[75] flex justify-end bg-black/40">
      <button
        type="button"
        className="min-w-0 flex-1 md:min-w-[120px]"
        aria-label="Fermer"
        onClick={onClose}
      />
      <div className="flex h-dvh w-full max-w-xl flex-col border-l border-black/10 bg-fs-card shadow-2xl dark:border-white/10">
        <div className="flex items-center justify-between border-b border-black/10 px-4 py-3 dark:border-white/10">
          <div className="min-w-0">
            <h3 className="text-base font-bold text-fs-text">Passer la commande</h3>
            <p className="truncate text-xs text-neutral-500">
              {kept.length} produit(s) · {formatCurrency(total)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm p-2 hover:bg-black/5 dark:hover:bg-white/10"
            aria-label="Fermer"
          >
            <MdClose className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-neutral-600">
                Boutique livrée
              </label>
              <select
                className={fsInputClass("rounded-sm")}
                value={storeId}
                onChange={(e) => setStoreId(e.target.value)}
              >
                <option value="">Choisir…</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-neutral-600">
                Fournisseur
              </label>
              <select
                className={fsInputClass("rounded-sm")}
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                disabled={suppliersQ.isLoading}
              >
                <option value="">
                  {suppliersQ.isLoading ? "Chargement…" : "Choisir…"}
                </option>
                {(suppliersQ.data ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-neutral-600">
              Référence (optionnel)
            </label>
            <input
              className={fsInputClass("rounded-sm")}
              placeholder="Ex. Commande du 30/07"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </div>

          <div>
            <p className="mb-1.5 text-xs font-semibold text-neutral-600">
              Lignes de commande ({kept.length}/{lines.length})
            </p>
            <ul className="space-y-2">
              {resolved.map((l) => (
                <li
                  key={l.productId}
                  className={cn(
                    "rounded-sm border border-black/8 p-2.5 dark:border-white/10",
                    l.quantity === 0 && "opacity-50",
                  )}
                >
                  <p className="mb-2 truncate text-sm font-semibold text-fs-text">
                    {l.productName}
                  </p>
                  <div className="grid grid-cols-3 items-end gap-2">
                    <div>
                      <label className="mb-1 block text-[11px] font-semibold text-neutral-500">
                        Quantité
                      </label>
                      <input
                        className={fsInputClass("rounded-sm")}
                        inputMode="numeric"
                        value={quantities[l.productId] ?? ""}
                        onChange={(e) =>
                          setQuantities((prev) => ({
                            ...prev,
                            [l.productId]: e.target.value.replace(/[^\d]/g, ""),
                          }))
                        }
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-semibold text-neutral-500">
                        Prix d&apos;achat
                      </label>
                      <input
                        className={fsInputClass("rounded-sm")}
                        inputMode="decimal"
                        value={prices[l.productId] ?? ""}
                        onChange={(e) =>
                          setPrices((prev) => ({
                            ...prev,
                            [l.productId]: e.target.value.replace(/[^\d.,]/g, ""),
                          }))
                        }
                      />
                    </div>
                    <div className="pb-2.5 text-right">
                      <p className="text-[11px] text-neutral-500">Total</p>
                      <p className="text-sm font-bold text-fs-accent">
                        {formatCurrency(l.total)}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex items-center justify-between rounded-sm bg-fs-surface-container px-3 py-2.5">
            <span className="text-sm font-semibold text-neutral-700 dark:text-neutral-200">
              Total commande
            </span>
            <span className="text-base font-bold text-fs-accent">{formatCurrency(total)}</span>
          </div>

          <button
            type="button"
            onClick={() => void copyList()}
            disabled={kept.length === 0}
            className="inline-flex w-full items-center justify-center gap-2 rounded-sm border border-black/10 py-2.5 text-sm font-semibold text-neutral-700 disabled:opacity-40 dark:border-white/10 dark:text-neutral-200"
          >
            <MdContentCopy className="h-4 w-4" aria-hidden />
            Copier la liste pour le fournisseur
          </button>
        </div>

        <div className="flex gap-2 border-t border-black/10 px-4 py-3 dark:border-white/10">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-sm border border-black/10 py-2.5 text-sm font-semibold text-neutral-700 dark:border-white/10 dark:text-neutral-200"
          >
            Annuler
          </button>
          <button
            type="button"
            disabled={!canOrder}
            onClick={() => orderMut.mutate()}
            className={cn(
              "flex-[2] rounded-sm py-2.5 text-sm font-bold text-white",
              canOrder
                ? "bg-fs-accent"
                : "cursor-not-allowed bg-neutral-300 text-neutral-500 dark:bg-neutral-700",
            )}
          >
            {orderMut.isPending ? "Création…" : "Créer l'achat brouillon"}
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { ProductListThumbnail, firstProductImageUrl } from "@/components/products/product-list-thumbnail";
import { saveProductPackagings } from "@/lib/features/products/packagings-api";
import type { ProductItem, ProductPackagingDraft } from "@/lib/features/products/types";
import { messageFromUnknownError, toast } from "@/lib/toast";
import { formatCurrency } from "@/lib/utils/currency";
import { cn } from "@/lib/utils/cn";
import { useMutation } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { MdCheck, MdClose, MdInventory2, MdQrCode2 } from "react-icons/md";

/** Libellés de conditionnement proposés (choix rapide). */
const PACKAGING_LABELS = [
  "Carton",
  "Paquet",
  "Sachet",
  "Boîte",
  "Sac",
  "Fardeau",
  "Casier",
  "Lot",
  "Douzaine",
  "Plaquette",
  "Rouleau",
  "Palette",
] as const;

function toInt(v: string): number {
  const n = Number.parseInt(v.trim(), 10);
  return Number.isFinite(n) ? n : 0;
}
function toPrice(v: string): number | null {
  const t = v.trim().replace(/\s/g, "").replace(",", ".");
  if (t === "") return null;
  const n = Number.parseFloat(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Détecte un code-barres déjà utilisé (autre produit, leur conditionnement, la pièce
 * du produit courant ou l'un de ses conditionnements existants). Message ou null.
 */
function barcodeCollision(
  barcode: string,
  product: ProductItem,
  allProducts: ProductItem[],
): string | null {
  const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
  const b = norm(barcode);
  if (!b) return null;
  if (b === norm(product.barcode)) {
    return "Ce code-barres est déjà celui de la pièce (unité) de ce produit.";
  }
  for (const pk of product.product_packagings ?? []) {
    if (norm(pk.barcode) === b) {
      return `Ce code-barres est déjà utilisé par le conditionnement « ${pk.label} ».`;
    }
  }
  for (const p of allProducts) {
    if (p.id === product.id) continue;
    if (norm(p.barcode) === b) return `Code-barres déjà utilisé par « ${p.name} ».`;
    for (const pk of p.product_packagings ?? []) {
      if (norm(pk.barcode) === b) return `Code-barres déjà utilisé par « ${p.name} ».`;
    }
  }
  return null;
}

/**
 * Dialogue d'ajout rapide d'un conditionnement (paquet/carton) à un produit.
 * Ultra UX : choix du type en un tap, aperçu live du contenu + prix, contrôle
 * anti-collision de code-barres. N'écrase aucun conditionnement existant.
 */
export function QuickPackagingDialog({
  companyId,
  product,
  allProducts,
  onClose,
  onSaved,
}: {
  companyId: string;
  product: ProductItem;
  allProducts: ProductItem[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [label, setLabel] = useState("");
  const [factor, setFactor] = useState("");
  const [price, setPrice] = useState("");
  const [barcode, setBarcode] = useState("");

  const factorNum = toInt(factor);
  const priceNum = toPrice(price);
  const existing = useMemo(
    () => [...(product.product_packagings ?? [])].sort((a, b) => a.position - b.position),
    [product.product_packagings],
  );

  /** Prix effectif prévisualisé : prix dédié saisi, sinon facteur × prix pièce. */
  const previewPrice =
    priceNum != null ? priceNum : factorNum > 0 ? factorNum * product.sale_price : null;

  const canSave = label.trim().length > 0 && factorNum >= 1;

  const saveMut = useMutation({
    mutationFn: async () => {
      const collision = barcodeCollision(barcode, product, allProducts);
      if (collision) throw new Error(collision);

      // État final = conditionnements existants (conservés) + le nouveau.
      const drafts: ProductPackagingDraft[] = [
        ...existing.map((pk) => ({
          id: pk.id,
          label: pk.label,
          barcode: pk.barcode ?? "",
          factor: pk.factor,
          price: pk.price,
        })),
        {
          label: label.trim(),
          barcode: barcode.trim(),
          factor: Math.max(1, factorNum),
          price: priceNum,
        },
      ];
      await saveProductPackagings(companyId, product.id, drafts, []);
    },
    onSuccess: () => {
      toast.success("Conditionnement ajouté.");
      onSaved();
      onClose();
    },
    onError: (e) => toast.error(messageFromUnknownError(e)),
  });

  const thumbUrl = firstProductImageUrl(product);

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col justify-end bg-black/45 sm:items-center sm:justify-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Ajouter un conditionnement"
    >
      <button type="button" className="absolute inset-0 -z-0" aria-label="Fermer" onClick={onClose} />
      <div className="relative z-10 flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-lg bg-fs-surface shadow-2xl sm:max-h-[88vh] sm:max-w-md sm:rounded-lg">
        <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-neutral-300 sm:hidden" />

        {/* En-tête */}
        <div className="flex items-start gap-3 border-b border-black/6 px-4 py-3">
          <ProductListThumbnail imageUrl={thumbUrl} />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-fs-accent">
              Nouveau conditionnement
            </p>
            <h2 className="truncate text-sm font-bold text-fs-text">{product.name}</h2>
            <p className="mt-0.5 text-[11px] text-neutral-500">
              Pièce : {formatCurrency(product.sale_price)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-neutral-500 hover:bg-black/5"
            aria-label="Fermer"
          >
            <MdClose className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {/* Conditionnements existants (contexte) */}
          {existing.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-[11px] font-medium text-neutral-500">Déjà :</span>
              {existing.map((pk) => (
                <span
                  key={pk.id}
                  className="inline-flex items-center gap-1 rounded-sm bg-fs-surface-container px-1.5 py-0.5 text-[10px] font-medium text-neutral-600"
                >
                  <MdInventory2 className="h-3 w-3 text-fs-accent" aria-hidden />
                  <span className="font-semibold text-fs-text">{pk.label}</span>
                  <span className="text-neutral-400">×{pk.factor}</span>
                </span>
              ))}
            </div>
          ) : null}

          {/* Type — choix rapide */}
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
              Type de conditionnement
            </label>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {PACKAGING_LABELS.map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setLabel(l)}
                  className={cn(
                    "rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors",
                    label === l
                      ? "border-fs-accent bg-fs-accent/10 text-fs-accent"
                      : "border-black/10 bg-fs-card text-neutral-700 hover:border-fs-accent/40",
                  )}
                >
                  {l}
                </button>
              ))}
            </div>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="ou saisir un libellé personnalisé…"
              maxLength={40}
              className="mt-2 min-h-11 w-full rounded-md border border-black/10 bg-white px-3 text-sm text-fs-text outline-none focus:border-fs-accent focus:ring-2 focus:ring-fs-accent/20"
            />
          </div>

          {/* Facteur + prix */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                Nombre de pièces *
              </label>
              <input
                inputMode="numeric"
                value={factor}
                onChange={(e) => setFactor(e.target.value.replace(/[^\d]/g, ""))}
                placeholder="ex. 24"
                className="mt-1.5 min-h-11 w-full rounded-md border border-black/10 bg-white px-3 text-sm font-bold text-fs-text outline-none focus:border-fs-accent focus:ring-2 focus:ring-fs-accent/20"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                Prix (optionnel)
              </label>
              <input
                inputMode="numeric"
                value={price}
                onChange={(e) => setPrice(e.target.value.replace(/[^\d\s.,]/g, ""))}
                placeholder={factorNum > 0 ? formatCurrency(factorNum * product.sale_price) : "auto"}
                className="mt-1.5 min-h-11 w-full rounded-md border border-black/10 bg-white px-3 text-sm font-bold text-fs-text outline-none focus:border-fs-accent focus:ring-2 focus:ring-fs-accent/20"
              />
            </div>
          </div>
          <p className="-mt-2 text-[11px] text-neutral-400">
            Prix vide = {factorNum > 0 ? "facteur × prix pièce" : "calculé automatiquement"}.
          </p>

          {/* Code-barres */}
          <div>
            <label className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
              <MdQrCode2 className="h-3.5 w-3.5" aria-hidden />
              Code-barres du conditionnement (optionnel)
            </label>
            <input
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              placeholder="Scanner ou saisir le GTIN du carton/paquet"
              className="mt-1.5 min-h-11 w-full rounded-md border border-black/10 bg-white px-3 text-sm text-fs-text outline-none focus:border-fs-accent focus:ring-2 focus:ring-fs-accent/20"
            />
          </div>

          {/* Aperçu live */}
          <div
            className={cn(
              "rounded-md border p-3 transition-colors",
              canSave
                ? "border-fs-accent/30 bg-fs-accent/[0.06]"
                : "border-black/[0.06] bg-fs-surface-container/60",
            )}
          >
            <div className="flex items-center gap-2">
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-fs-accent/12 text-fs-accent">
                <MdInventory2 className="h-5 w-5" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-fs-text">
                  1 {label.trim() || "conditionnement"} ={" "}
                  {factorNum > 0 ? `${factorNum} pièce${factorNum > 1 ? "s" : ""}` : "…"}
                </p>
                <p className="text-xs text-neutral-500">
                  {previewPrice != null ? (
                    <>
                      Prix de vente :{" "}
                      <span className="font-semibold text-fs-text">{formatCurrency(previewPrice)}</span>
                      {priceNum == null && factorNum > 0 ? " (auto)" : ""}
                    </>
                  ) : (
                    "Renseignez le nombre de pièces."
                  )}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 border-t border-black/6 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-11 flex-1 items-center justify-center rounded-md border border-black/10 bg-white text-sm font-semibold text-neutral-700"
          >
            Annuler
          </button>
          <button
            type="button"
            disabled={!canSave || saveMut.isPending}
            onClick={() => saveMut.mutate()}
            className="inline-flex min-h-11 flex-[1.4] items-center justify-center gap-2 rounded-md bg-fs-accent text-sm font-bold text-white disabled:opacity-50"
          >
            {saveMut.isPending ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/60 border-t-transparent" />
            ) : (
              <MdCheck className="h-5 w-5" aria-hidden />
            )}
            {saveMut.isPending ? "Ajout…" : "Ajouter"}
          </button>
        </div>
      </div>
    </div>
  );
}

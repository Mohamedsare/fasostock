"use client";

import { useMemo, useState } from "react";
import { MdClose, MdInfoOutline } from "react-icons/md";
import { LcCard, lcInputClass } from "./ui";
import { FsSearchSelect } from "@/components/ui/fs-search-select";
import { MARGIN_OPTIONS, marginSuffix } from "@/lib/features/landed-cost/labels";
import { formatCost, parseAmount } from "@/lib/features/landed-cost/format";
import type {
  AllocationMethod,
  CostBatchItem,
  MarginMode,
} from "@/lib/features/landed-cost/types";
import { cn } from "@/lib/utils/cn";

export type PickerProduct = {
  id: string;
  name: string;
  unit: string;
  purchasePrice: number;
};

/**
 * Saisie d'une ligne d'arrivage.
 *
 * Les champs poids / volume / part manuelle n'apparaissent QUE si un frais s'en sert
 * réellement (`usedMethods`) : demander un poids que personne n'utilisera est le plus
 * sûr moyen de faire abandonner la saisie.
 *
 * Monté seulement à l'ouverture (l'appelant le rend sous condition, avec une `key`) :
 * l'état de départ vient donc directement des props, sans effet de synchronisation.
 */
export function ItemFormDialog({
  editing,
  products,
  usedMethods,
  currencyCode,
  batchMarginMode,
  batchMarginValue,
  stockMode,
  busy,
  onClose,
  onSubmit,
}: {
  editing: CostBatchItem | null;
  products: PickerProduct[];
  /** Clés de répartition réellement employées par les frais du lot. */
  usedMethods: Set<AllocationMethod>;
  currencyCode: string;
  batchMarginMode: MarginMode;
  batchMarginValue: number;
  stockMode: "receive" | "prices_only";
  busy: boolean;
  onClose: () => void;
  onSubmit: (v: {
    productId: string;
    quantity: number;
    unitPrice: number;
    weightKg: number | null;
    volumeM3: number | null;
    manualShare: number | null;
    marginMode: MarginMode | null;
    marginValue: number | null;
    applySalePrice: boolean;
  }) => void;
}) {
  const [productId, setProductId] = useState(editing?.productId ?? "");
  const [quantity, setQuantity] = useState(editing ? String(editing.quantity) : "");
  const [unitPrice, setUnitPrice] = useState(editing ? String(editing.unitPrice) : "");
  const [weight, setWeight] = useState(
    editing?.weightKg != null ? String(editing.weightKg) : "",
  );
  const [volume, setVolume] = useState(
    editing?.volumeM3 != null ? String(editing.volumeM3) : "",
  );
  const [manual, setManual] = useState(
    editing?.manualShare != null ? String(editing.manualShare) : "",
  );
  const [ownMargin, setOwnMargin] = useState(editing?.marginMode != null);
  const [marginMode, setMarginMode] = useState<MarginMode>(
    editing?.marginMode ?? batchMarginMode,
  );
  const [marginValue, setMarginValue] = useState(
    editing?.marginValue != null ? String(editing.marginValue) : "",
  );
  const [applySale, setApplySale] = useState(editing?.applySalePrice ?? true);
  const [error, setError] = useState<string | null>(null);

  const options = useMemo(
    () => products.map((p) => ({ id: p.id, name: p.name })),
    [products],
  );
  const selected = products.find((p) => p.id === productId) ?? null;

  /** Choisir un produit propose son prix d'achat actuel — le plus souvent c'est le bon. */
  function pickProduct(id: string) {
    setProductId(id);
    const p = products.find((x) => x.id === id);
    if (p && unitPrice.trim() === "" && p.purchasePrice > 0) {
      setUnitPrice(String(p.purchasePrice));
    }
  }

  function submit() {
    const qty = parseAmount(quantity);
    if (!productId) {
      setError("Choisissez le produit commandé.");
      return;
    }
    if (qty <= 0) {
      setError("Indiquez la quantité commandée.");
      return;
    }
    if (stockMode === "receive" && qty !== Math.trunc(qty)) {
      setError(
        "Cet arrivage entre le stock : la quantité doit être un nombre entier. " +
          "Passez l'arrivage en « prix seulement » pour saisir des décimales.",
      );
      return;
    }
    onSubmit({
      productId,
      quantity: qty,
      unitPrice: parseAmount(unitPrice),
      weightKg: weight.trim() === "" ? null : parseAmount(weight),
      volumeM3: volume.trim() === "" ? null : parseAmount(volume),
      manualShare: manual.trim() === "" ? null : parseAmount(manual),
      marginMode: ownMargin ? marginMode : null,
      marginValue: ownMargin ? parseAmount(marginValue) : null,
      applySalePrice: applySale,
    });
  }

  const goods = parseAmount(quantity) * parseAmount(unitPrice);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={editing ? "Modifier la ligne" : "Ajouter un produit"}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <LcCard
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-b-none shadow-xl sm:rounded-md"
        padding="p-4 sm:p-5"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-base font-bold text-fs-text">
            {editing ? "Modifier la ligne" : "Ajouter un produit"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Fermer"
            className="fs-touch-target -mr-1 -mt-1 rounded-md p-1 text-neutral-500 hover:bg-black/5"
          >
            <MdClose className="h-5 w-5" />
          </button>
        </div>

        <label className="mt-4 block text-xs font-semibold text-neutral-700">Produit</label>
        <FsSearchSelect
          value={productId}
          options={options}
          onChange={pickProduct}
          placeholder="Choisir un produit"
          searchPlaceholder="Nom du produit…"
          ariaLabel="Produit commandé"
          className="mt-1.5 rounded-md"
        />

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="item-qty" className="block text-xs font-semibold text-neutral-700">
              Quantité {selected ? `(${selected.unit})` : ""}
            </label>
            <input
              id="item-qty"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              inputMode="decimal"
              placeholder="50"
              className={lcInputClass("mt-1.5 font-semibold")}
            />
          </div>
          <div>
            <label htmlFor="item-price" className="block text-xs font-semibold text-neutral-700">
              Prix fournisseur ({currencyCode})
            </label>
            <input
              id="item-price"
              value={unitPrice}
              onChange={(e) => setUnitPrice(e.target.value)}
              inputMode="decimal"
              placeholder="1200"
              className={lcInputClass("mt-1.5 font-semibold")}
            />
          </div>
        </div>

        {goods > 0 ? (
          <p className="mt-2 text-xs text-neutral-600">
            Marchandise pour cette ligne :{" "}
            <span className="font-semibold text-fs-text">{formatCost(goods)}</span>{" "}
            <span className="text-neutral-500">— hors frais d&apos;approche</span>
          </p>
        ) : null}

        {/* Bases de répartition : affichées uniquement si un frais les utilise. */}
        {usedMethods.has("weight") || usedMethods.has("volume") ? (
          <div className="mt-4 grid grid-cols-2 gap-3">
            {usedMethods.has("weight") ? (
              <div>
                <label htmlFor="item-weight" className="block text-xs font-semibold text-neutral-700">
                  Poids unitaire (kg)
                </label>
                <input
                  id="item-weight"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  inputMode="decimal"
                  placeholder="2,5"
                  className={lcInputClass("mt-1.5")}
                />
              </div>
            ) : null}
            {usedMethods.has("volume") ? (
              <div>
                <label htmlFor="item-volume" className="block text-xs font-semibold text-neutral-700">
                  Volume unitaire (m³)
                </label>
                <input
                  id="item-volume"
                  value={volume}
                  onChange={(e) => setVolume(e.target.value)}
                  inputMode="decimal"
                  placeholder="0,04"
                  className={lcInputClass("mt-1.5")}
                />
              </div>
            ) : null}
          </div>
        ) : null}

        {usedMethods.has("manual") ? (
          <div className="mt-4">
            <label htmlFor="item-manual" className="block text-xs font-semibold text-neutral-700">
              Part manuelle
            </label>
            <input
              id="item-manual"
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              inputMode="decimal"
              placeholder="1"
              className={lcInputClass("mt-1.5")}
            />
            <p className="mt-1.5 text-[11px] leading-relaxed text-neutral-600">
              Poids relatif de cette ligne dans le partage des frais. « 2 » porte deux fois
              plus que « 1 ».
            </p>
          </div>
        ) : null}

        {/* Marge : par défaut celle de l'arrivage, surchargeable ligne par ligne. */}
        <div className="mt-4 rounded-md border border-black/[0.08] p-3">
          <label className="flex cursor-pointer items-start justify-between gap-3">
            <span className="min-w-0">
              <span className="block text-sm font-medium text-fs-text">
                Marge propre à ce produit
              </span>
              <span className="mt-0.5 block text-xs text-neutral-600">
                {ownMargin
                  ? "Cette ligne ignore la marge de l'arrivage."
                  : `Suit l'arrivage : ${
                      MARGIN_OPTIONS.find((m) => m.key === batchMarginMode)?.label ?? ""
                    } ${batchMarginValue}${marginSuffix(batchMarginMode)}.`}
              </span>
            </span>
            <input
              type="checkbox"
              role="switch"
              className="mt-1 h-5 w-9 shrink-0 cursor-pointer accent-fs-accent"
              checked={ownMargin}
              onChange={(e) => setOwnMargin(e.target.checked)}
            />
          </label>

          {ownMargin ? (
            <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
              <select
                value={marginMode}
                onChange={(e) => setMarginMode(e.target.value as MarginMode)}
                aria-label="Mode de marge"
                className={lcInputClass()}
              >
                {MARGIN_OPTIONS.map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.label}
                  </option>
                ))}
              </select>
              <div className="relative">
                <input
                  value={marginValue}
                  onChange={(e) => setMarginValue(e.target.value)}
                  inputMode="decimal"
                  aria-label="Valeur de la marge"
                  placeholder="25"
                  className={lcInputClass("w-28 pr-8 text-right font-semibold")}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-neutral-500">
                  {marginSuffix(marginMode)}
                </span>
              </div>
            </div>
          ) : null}
        </div>

        <label className="mt-3 flex cursor-pointer items-start justify-between gap-3 rounded-md border border-black/[0.08] p-3">
          <span className="min-w-0">
            <span className="block text-sm font-medium text-fs-text">
              Mettre à jour le prix de vente
            </span>
            <span className="mt-0.5 block text-xs text-neutral-600">
              {applySale
                ? "Le prix conseillé remplacera le prix de vente actuel."
                : "Le prix de vente actuel sera conservé — seul le prix d'achat changera."}
            </span>
          </span>
          <input
            type="checkbox"
            role="switch"
            className="mt-1 h-5 w-9 shrink-0 cursor-pointer accent-fs-accent"
            checked={applySale}
            onChange={(e) => setApplySale(e.target.checked)}
          />
        </label>

        {error ? (
          <p className="mt-3 flex gap-2 rounded-md bg-red-50 px-3 py-2 text-xs font-medium leading-relaxed text-red-700 dark:bg-red-500/10 dark:text-red-300">
            <MdInfoOutline className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>{error}</span>
          </p>
        ) : null}

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-md border border-black/[0.08] bg-fs-card px-4 py-2.5 text-sm font-semibold text-neutral-800 disabled:opacity-60"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className={cn(
              "rounded-md bg-fs-accent px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60",
            )}
          >
            {busy ? "Enregistrement…" : editing ? "Enregistrer" : "Ajouter au lot"}
          </button>
        </div>
      </LcCard>
    </div>
  );
}

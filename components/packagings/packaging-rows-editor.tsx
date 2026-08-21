"use client";

import { fsInputClass } from "@/components/ui/fs-screen-primitives";
import { findPackagingBarcodeCollision } from "@/lib/features/products/packaging-barcodes";
import {
  packagingPiecePrice,
  packagingPriceFromInput,
  packagingPriceInputValue,
  packagingPriceProblem,
  packagingTotalPrice,
} from "@/lib/features/products/packaging-price";
import { saveProductPackagings } from "@/lib/features/products/packagings-api";
import type { ProductItem, ProductPackagingDraft } from "@/lib/features/products/types";
import { messageFromUnknownError, toast } from "@/lib/toast";
import { cn } from "@/lib/utils/cn";
import { formatCurrency, toNumber } from "@/lib/utils/currency";
import { useMutation } from "@tanstack/react-query";
import { useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import {
  MdAdd,
  MdArrowForward,
  MdCheck,
  MdClose,
  MdContentCopy,
  MdQrCode2,
} from "react-icons/md";

/** Types proposés en un tap — mêmes libellés que la fiche produit. */
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

/** Contenus courants : le geste le plus fréquent tient alors en deux taps. */
const FACTOR_PRESETS = [6, 10, 12, 20, 24, 25, 50, 100] as const;

/** Ce qu'un produit vient d'enregistrer — sert de modèle au produit suivant. */
export type SavedLot = { label: string; factor: number; total: number };

type Row = {
  key: string;
  id?: string;
  label: string;
  factor: string;
  price: string;
  barcode: string;
};

function newKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `pkg-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function rowsFromProduct(product: ProductItem, perPiece: boolean): Row[] {
  return [...(product.product_packagings ?? [])]
    .sort((a, b) => a.position - b.position)
    .map((pk) => ({
      key: pk.id,
      id: pk.id,
      label: pk.label,
      factor: String(pk.factor),
      price: packagingPriceInputValue(pk.price, pk.factor, perPiece),
      barcode: pk.barcode ?? "",
    }));
}

/**
 * Éditeur des conditionnements d'UN produit, déplié sous sa ligne.
 *
 * Tout se règle ici sans quitter la liste : le type en un tap, le contenu en un tap,
 * le prix — et, sous chaque ligne, ce que ça donne réellement au comptoir (prix du lot
 * ET prix à la pièce). Le mode de saisie du prix suit le réglage du propriétaire
 * (« Prix du conditionnement à la pièce ») ; la base reçoit toujours le prix du lot.
 */
export function PackagingRowsEditor({
  companyId,
  product,
  allProducts,
  perPiece,
  canEdit,
  template,
  hasNext,
  onClose,
  onSaved,
}: {
  companyId: string;
  product: ProductItem;
  allProducts: ProductItem[];
  perPiece: boolean;
  canEdit: boolean;
  /** Lots du dernier produit enregistré : repris en un tap (« Carton ×12 » en série). */
  template?: SavedLot[] | null;
  /** Vrai s'il reste un produit à remplir après celui-ci (bouton « Suivant »). */
  hasNext: boolean;
  onClose: () => void;
  onSaved: (saved: SavedLot[], goNext: boolean) => void;
}) {
  const [rows, setRows] = useState<Row[]>(() => {
    const existing = rowsFromProduct(product, perPiece);
    // Produit encore vierge : une ligne vide attend déjà, rien à cliquer avant d'écrire.
    return existing.length > 0
      ? existing
      : [{ key: newKey(), label: "", factor: "", price: "", barcode: "" }];
  });
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const unit = product.unit || "pce";

  /*
   * Choisir le type doit enchaîner sur le chiffre à taper : sans ce renvoi de curseur,
   * l'utilisateur repose le doigt sur l'écran entre chaque champ — c'est ce geste de
   * trop, répété deux cents fois, qui fait abandonner le remplissage.
   */
  const factorInputs = useRef(new Map<string, HTMLInputElement | null>());

  /**
   * Remplir cent produits se fait au clavier : Échap referme, Ctrl (ou ⌘) + Entrée
   * enregistre sans aller chercher le bouton. Les touches seules restent libres —
   * on tape des chiffres dans ces champs.
   */
  function onKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && canEdit && !saveMut.isPending) {
      e.preventDefault();
      saveMut.mutate(false);
    }
  }

  /** Reprend les lots du produit précédent (même carton, même contenu, même prix). */
  function applyTemplate(lots: SavedLot[]) {
    setRows(
      lots.map((l) => ({
        key: newKey(),
        label: l.label,
        factor: String(l.factor),
        price: packagingPriceInputValue(l.total, l.factor, perPiece),
        barcode: "",
      })),
    );
    setError(null);
  }

  function update(key: string, field: keyof Omit<Row, "key" | "id">, value: string) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, [field]: value } : r)));
    setError(null);
  }

  function addRow() {
    setRows((rs) => [...rs, { key: newKey(), label: "", factor: "", price: "", barcode: "" }]);
  }

  function removeRow(key: string) {
    setRows((rs) => {
      const target = rs.find((r) => r.key === key);
      if (target?.id) setRemovedIds((ids) => [...ids, target.id as string]);
      return rs.filter((r) => r.key !== key);
    });
    setError(null);
  }

  const saveMut = useMutation({
    mutationFn: async (goNext: boolean) => {
      const drafts: ProductPackagingDraft[] = [];
      const dropped = [...removedIds];
      for (const r of rows) {
        const label = r.label.trim();
        const factor = Math.max(0, Math.round(toNumber(r.factor)));
        // Ligne restée entièrement vide : ignorée (et supprimée si elle existait).
        if (!label && !r.factor.trim() && !r.price.trim() && !r.barcode.trim()) {
          if (r.id) dropped.push(r.id);
          continue;
        }
        if (!label) throw new Error("Choisissez le type de chaque lot (Carton, Paquet…).");
        if (factor < 1) {
          throw new Error(`« ${label} » : indiquez combien de ${unit} contient le lot.`);
        }
        const price = packagingPriceFromInput(
          r.price.trim() ? toNumber(r.price) : null,
          factor,
          perPiece,
        );
        const problem = packagingPriceProblem({
          label,
          factor,
          price,
          unitSalePrice: product.sale_price,
          purchasePrice: product.purchase_price,
          perPiece,
        });
        if (problem) throw new Error(problem);
        drafts.push({ id: r.id, label, barcode: r.barcode.trim(), factor, price });
      }
      const collision = findPackagingBarcodeCollision({
        products: allProducts,
        selfProductId: product.id,
        selfMainBarcode: product.barcode ?? "",
        drafts,
      });
      if (collision) throw new Error(collision);
      await saveProductPackagings(companyId, product.id, drafts, dropped);
      const saved: SavedLot[] = drafts.map((d) => ({
        label: d.label,
        factor: d.factor,
        total: packagingTotalPrice(d.price, d.factor, product.sale_price),
      }));
      return { saved, goNext };
    },
    onSuccess: ({ saved, goNext }) => {
      const count = saved.length;
      toast.success(
        count === 0
          ? `${product.name} : plus aucun conditionnement.`
          : `${product.name} : ${count} conditionnement${count > 1 ? "s" : ""} enregistré${count > 1 ? "s" : ""}.`,
      );
      onSaved(saved, goNext);
    },
    onError: (e) => setError(messageFromUnknownError(e)),
  });

  return (
    <div
      className="rounded-[10px] border border-fs-accent/25 bg-fs-accent/[0.04] p-3 sm:p-4"
      onKeyDown={onKeyDown}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-fs-text">Lots de « {product.name} »</p>
        <p className="text-[11px] text-neutral-600">
          Pièce : <b className="text-fs-text">{formatCurrency(product.sale_price)}</b> ·{" "}
          {perPiece ? "prix demandé à la pièce du lot" : "prix demandé pour le lot entier"}
        </p>
      </div>

      {/*
        Le même carton revient sur des dizaines de références (« Carton ×12 » sur toute
        une gamme). Le reproposer en un tap évite de retaper type, contenu et prix.
      */}
      {canEdit && template && template.length > 0 ? (
        <button
          type="button"
          onClick={() => applyTemplate(template)}
          className="mt-3 inline-flex flex-wrap items-center gap-1.5 rounded-lg border border-fs-accent/40 bg-fs-card px-3 py-2 text-left text-xs font-semibold text-fs-accent"
        >
          <MdContentCopy className="h-4 w-4 shrink-0" aria-hidden />
          Reprendre le précédent :
          <span className="font-bold">
            {template
              .map((l) => `${l.label} ×${l.factor} · ${formatCurrency(l.total)}`)
              .join("  ·  ")}
          </span>
        </button>
      ) : null}

      <div className="mt-3 space-y-3">
        {rows.map((r) => {
          const factor = Math.max(0, Math.round(toNumber(r.factor)));
          const priceInput = r.price.trim() ? toNumber(r.price) : null;
          const total =
            factor >= 1
              ? packagingTotalPrice(
                  packagingPriceFromInput(priceInput, factor, perPiece),
                  factor,
                  product.sale_price,
                )
              : null;
          const problem = packagingPriceProblem({
            label: r.label,
            factor,
            price: packagingPriceFromInput(priceInput, Math.max(1, factor), perPiece),
            unitSalePrice: product.sale_price,
            purchasePrice: product.purchase_price,
            perPiece,
          });
          return (
            <div
              key={r.key}
              className="rounded-[10px] border border-black/[0.08] bg-fs-card p-2.5 sm:p-3"
            >
              {/* Type — un tap suffit ; la saisie libre reste dans la fiche produit. */}
              <div className="flex flex-wrap items-center gap-1.5">
                {PACKAGING_LABELS.map((l) => (
                  <button
                    key={l}
                    type="button"
                    disabled={!canEdit}
                    onClick={() => {
                      update(r.key, "label", l);
                      factorInputs.current.get(r.key)?.focus();
                    }}
                    className={cn(
                      "rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors disabled:opacity-50",
                      r.label === l
                        ? "border-fs-accent bg-fs-accent/10 text-fs-accent"
                        : "border-black/10 bg-fs-card text-neutral-700 hover:border-fs-accent/40",
                    )}
                  >
                    {l}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={!canEdit}
                  onClick={() => removeRow(r.key)}
                  className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-md border border-red-200 text-red-600 disabled:opacity-50"
                  aria-label="Retirer ce lot"
                  title="Retirer ce lot"
                >
                  <MdClose className="h-4 w-4" aria-hidden />
                </button>
              </div>

              <div className="mt-2 flex flex-col gap-2 min-[520px]:flex-row">
                <label className="min-w-0 flex-1">
                  <span className="mb-1 block text-[11px] font-medium text-neutral-600">
                    Nombre de {unit} *
                  </span>
                  <input
                    ref={(el) => {
                      factorInputs.current.set(r.key, el);
                    }}
                    value={r.factor}
                    onChange={(e) => update(r.key, "factor", e.target.value.replace(/[^\d]/g, ""))}
                    inputMode="numeric"
                    disabled={!canEdit}
                    placeholder="Ex. 12"
                    className={fsInputClass("font-bold")}
                  />
                  <span className="mt-1 flex flex-wrap gap-1">
                    {FACTOR_PRESETS.map((n) => (
                      <button
                        key={n}
                        type="button"
                        disabled={!canEdit}
                        onClick={() => update(r.key, "factor", String(n))}
                        className={cn(
                          "rounded border px-1.5 py-0.5 text-[11px] font-semibold disabled:opacity-50",
                          factor === n
                            ? "border-fs-accent bg-fs-accent/10 text-fs-accent"
                            : "border-black/10 text-neutral-600",
                        )}
                      >
                        {n}
                      </button>
                    ))}
                  </span>
                </label>
                <label className="min-w-0 flex-1">
                  <span className="mb-1 block text-[11px] font-medium text-neutral-600">
                    {perPiece ? `Prix d'une ${unit} du lot` : "Prix du lot entier"}
                  </span>
                  <input
                    value={r.price}
                    onChange={(e) =>
                      update(r.key, "price", e.target.value.replace(/[^\d\s.,]/g, ""))
                    }
                    inputMode="decimal"
                    disabled={!canEdit}
                    placeholder={
                      perPiece
                        ? formatCurrency(product.sale_price)
                        : factor >= 1
                          ? formatCurrency(factor * product.sale_price)
                          : "Sinon nb × prix pièce"
                    }
                    className={fsInputClass("font-bold")}
                  />
                </label>
                <label className="min-w-0 flex-1">
                  <span className="mb-1 flex items-center gap-1 text-[11px] font-medium text-neutral-600">
                    <MdQrCode2 className="h-3.5 w-3.5" aria-hidden />
                    Code-barres du lot
                  </span>
                  <input
                    value={r.barcode}
                    onChange={(e) => update(r.key, "barcode", e.target.value)}
                    disabled={!canEdit}
                    placeholder="Scanner le carton (facultatif)"
                    autoComplete="off"
                    className={fsInputClass()}
                  />
                </label>
              </div>

              {/* Ce que ça donnera au comptoir — la ligne qui évite le prix à l'envers. */}
              {total != null ? (
                <p
                  className={cn(
                    "mt-2 text-[11px] leading-relaxed",
                    problem ? "font-semibold text-red-600" : "text-neutral-600",
                  )}
                >
                  {problem
                    ? problem
                    : `1 ${r.label.trim() || "lot"} = ${factor} ${unit} → ${formatCurrency(total)} (soit ${formatCurrency(packagingPiecePrice(total, factor))} la pièce)`}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>

      <button
        type="button"
        disabled={!canEdit}
        onClick={addRow}
        className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-fs-accent/40 bg-fs-accent/[0.06] px-3 py-2 text-xs font-semibold text-fs-accent disabled:opacity-50"
      >
        <MdAdd className="h-4 w-4" aria-hidden />
        Ajouter un autre lot
      </button>

      {error ? (
        <p className="mt-3 rounded-[10px] bg-red-50 px-3 py-2 text-xs font-semibold leading-relaxed text-red-700">
          {error}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex min-h-11 flex-1 basis-[120px] items-center justify-center rounded-lg border border-black/10 bg-fs-card text-sm font-semibold text-neutral-700"
        >
          Fermer
        </button>
        <button
          type="button"
          disabled={!canEdit || saveMut.isPending}
          onClick={() => saveMut.mutate(false)}
          className="inline-flex min-h-11 flex-1 basis-[140px] items-center justify-center gap-2 rounded-lg border border-fs-accent/40 bg-fs-card text-sm font-bold text-fs-accent disabled:opacity-50"
        >
          <MdCheck className="h-5 w-5" aria-hidden />
          Enregistrer
        </button>
        {/*
          Le geste utile n'est pas « enregistrer », c'est « enregistrer et passer au
          suivant » : c'est lui qui permet de descendre une liste de deux cents
          articles sans jamais revenir à la souris.
        */}
        <button
          type="button"
          disabled={!canEdit || saveMut.isPending || !hasNext}
          onClick={() => saveMut.mutate(true)}
          className="inline-flex min-h-11 flex-[1.6] basis-[190px] items-center justify-center gap-2 rounded-lg bg-fs-accent text-sm font-bold text-white disabled:opacity-50"
        >
          {saveMut.isPending ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/60 border-t-transparent" />
          ) : (
            <MdArrowForward className="h-5 w-5" aria-hidden />
          )}
          {saveMut.isPending ? "Enregistrement…" : "Enregistrer et suivant"}
        </button>
      </div>
      <p className="mt-2 text-[11px] text-neutral-500">
        Raccourcis : <b>Ctrl + Entrée</b> enregistre, <b>Échap</b> referme.
      </p>
    </div>
  );
}

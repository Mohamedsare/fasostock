"use client";

import { useMemo, useState } from "react";
import {
  MdAddShoppingCart,
  MdDelete,
  MdDragHandle,
  MdInfo,
  MdInventory2,
  MdNoteAdd,
  MdWarningAmber,
} from "react-icons/md";
import { FsSearchSelect } from "@/components/ui/fs-search-select";
import { fsInputClass } from "@/components/ui/fs-screen-primitives";
import {
  SaleDocumentDialogShell,
  SaleDocumentField,
  SaleDocumentSection,
} from "./sale-document-dialog-shell";
import {
  computeSaleDocumentTotals,
  saleDocumentLineTotal,
  type SaleDocument,
  type SaleDocumentInput,
  type SaleDocumentKind,
  type SaleDocumentLineDraft,
} from "@/lib/features/sale-documents/types";
import { formatCurrency, toNumber } from "@/lib/utils/currency";
import { cn } from "@/lib/utils/cn";

export type ProductOption = {
  id: string;
  name: string;
  unit: string;
  salePrice: number;
  stock: number;
};

export type CustomerOption = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
};

/** Date du jour au format `YYYY-MM-DD` (celui des colonnes `date`). */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Date du jour + n jours, même format. */
function inDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Un devis part rarement sans limite de validité : sans elle, un client peut revenir
 * six mois plus tard exiger un prix que le fournisseur a doublé entre-temps. Trente
 * jours est l'usage, et reste modifiable.
 */
const DEFAULT_QUOTE_VALIDITY_DAYS = 30;

function emptyInput(kind: SaleDocumentKind): SaleDocumentInput {
  return {
    kind,
    customerId: null,
    customerName: "",
    customerPhone: "",
    customerEmail: "",
    customerAddress: "",
    customerTaxId: "",
    subject: "",
    clientReference: "",
    issueDate: today(),
    validUntil: kind === "quote" ? inDays(DEFAULT_QUOTE_VALIDITY_DAYS) : null,
    dueDate: null,
    discountKind: "amount",
    discountValue: 0,
    taxRate: 0,
    notes: "",
    terms: "",
  };
}

function inputFrom(doc: SaleDocument): SaleDocumentInput {
  return {
    kind: doc.kind,
    customerId: doc.customerId,
    customerName: doc.customerName,
    customerPhone: doc.customerPhone ?? "",
    customerEmail: doc.customerEmail ?? "",
    customerAddress: doc.customerAddress ?? "",
    customerTaxId: doc.customerTaxId ?? "",
    subject: doc.subject ?? "",
    clientReference: doc.clientReference ?? "",
    issueDate: doc.issueDate || today(),
    validUntil: doc.validUntil,
    dueDate: doc.dueDate,
    discountKind: doc.discountKind,
    discountValue: doc.discountValue,
    taxRate: doc.taxRate,
    notes: doc.notes ?? "",
    terms: doc.terms ?? "",
  };
}

export function SaleDocumentEditorDialog({
  initial,
  kind,
  products,
  customers,
  defaultTerms,
  busy,
  onClose,
  onSubmit,
}: {
  /** `null` = création. */
  initial: SaleDocument | null;
  /** Type du document à créer (ignoré en modification : il ne change plus). */
  kind: SaleDocumentKind;
  products: ProductOption[];
  customers: CustomerOption[];
  /** Conditions de règlement de la boutique, pré-remplies sur un nouveau document. */
  defaultTerms: string | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: (input: SaleDocumentInput, lines: SaleDocumentLineDraft[]) => void;
}) {
  const isEdit = initial != null;
  const docKind = initial?.kind ?? kind;
  const isQuote = docKind === "quote";

  const [input, setInput] = useState<SaleDocumentInput>(() => {
    if (initial) return inputFrom(initial);
    const base = emptyInput(docKind);
    return defaultTerms ? { ...base, terms: defaultTerms } : base;
  });

  const [lines, setLines] = useState<SaleDocumentLineDraft[]>(() =>
    (initial?.lines ?? []).map((l) => ({
      productId: l.productId,
      label: l.label,
      description: l.description ?? "",
      unit: l.unit,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      discountPercent: l.discountPercent,
    })),
  );

  const [error, setError] = useState<string | null>(null);

  const productOptions = useMemo(
    () =>
      products.map((p) => ({
        id: p.id,
        name: `${p.name} · ${p.stock} en stock`,
      })),
    [products],
  );

  const customerOptions = useMemo(
    () => [
      { id: "", name: "— Saisir librement —" },
      ...customers.map((c) => ({ id: c.id, name: c.name })),
    ],
    [customers],
  );

  const totals = useMemo(
    () =>
      computeSaleDocumentTotals({
        lines,
        discountKind: input.discountKind,
        discountValue: input.discountValue,
        taxRate: input.taxRate,
      }),
    [lines, input.discountKind, input.discountValue, input.taxRate],
  );

  /**
   * Une ligne du catalogue au-delà du stock disponible n'empêche PAS d'enregistrer :
   * on chiffre souvent ce qu'on n'a pas encore en rayon. Mais l'émission de la facture,
   * elle, refusera — mieux vaut le voir en établissant le document.
   */
  const shortStock = useMemo(() => {
    const byProduct = new Map<string, number>();
    for (const l of lines) {
      if (!l.productId) continue;
      byProduct.set(l.productId, (byProduct.get(l.productId) ?? 0) + l.quantity);
    }
    const out: string[] = [];
    for (const [productId, qty] of byProduct) {
      const p = products.find((x) => x.id === productId);
      if (p && qty > p.stock) out.push(`${p.name} (${qty} demandés, ${p.stock} en stock)`);
    }
    return out;
  }, [lines, products]);

  function set<K extends keyof SaleDocumentInput>(key: K, value: SaleDocumentInput[K]) {
    setInput((prev) => ({ ...prev, [key]: value }));
  }

  /** Choisir une fiche client recopie ses coordonnées — modifiables ensuite. */
  function pickCustomer(id: string) {
    if (!id) {
      setInput((prev) => ({ ...prev, customerId: null }));
      return;
    }
    const c = customers.find((x) => x.id === id);
    if (!c) return;
    setInput((prev) => ({
      ...prev,
      customerId: c.id,
      customerName: c.name,
      customerPhone: c.phone ?? prev.customerPhone,
      customerEmail: c.email ?? prev.customerEmail,
      customerAddress: c.address ?? prev.customerAddress,
    }));
  }

  function addProductLine() {
    setLines((prev) => [
      ...prev,
      { productId: null, label: "", description: "", unit: "u", quantity: 1, unitPrice: 0, discountPercent: 0 },
    ]);
  }

  function addFreeLine() {
    setLines((prev) => [
      ...prev,
      { productId: null, label: "", description: "", unit: "forfait", quantity: 1, unitPrice: 0, discountPercent: 0 },
    ]);
  }

  function updateLine(index: number, patch: Partial<SaleDocumentLineDraft>) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  /** Rattacher un produit reprend son libellé, son unité et son prix de vente. */
  function pickProduct(index: number, productId: string) {
    if (!productId) {
      updateLine(index, { productId: null });
      return;
    }
    const p = products.find((x) => x.id === productId);
    if (!p) return;
    updateLine(index, {
      productId: p.id,
      label: p.name,
      unit: p.unit || "u",
      unitPrice: p.salePrice,
    });
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  function moveLine(index: number, direction: -1 | 1) {
    setLines((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(index, 1);
      next.splice(target, 0, item!);
      return next;
    });
  }

  function submit() {
    const cleaned = lines
      .map((l) => ({ ...l, label: l.label.trim() }))
      .filter((l) => l.label.length > 0 && l.quantity > 0);

    if (!input.customerName.trim()) {
      setError("Indiquez à qui s'adresse ce document.");
      return;
    }
    if (cleaned.length === 0) {
      setError("Ajoutez au moins une ligne avec un libellé et une quantité.");
      return;
    }
    // Le stock de l'application se compte en unités entières : une ligne du catalogue
    // à 2,5 serait arrondie en silence à l'émission. On le dit maintenant, pas plus tard.
    const fractional = cleaned.find(
      (l) => l.productId != null && !Number.isInteger(l.quantity),
    );
    if (fractional) {
      setError(
        `« ${fractional.label} » vient de votre stock : sa quantité doit être un nombre entier. Pour une quantité décimale, retirez l'article et passez la ligne en prestation libre.`,
      );
      return;
    }
    if (isQuote && input.validUntil && input.validUntil < input.issueDate) {
      setError("La date de validité ne peut pas précéder la date du devis.");
      return;
    }
    if (!isQuote && input.dueDate && input.dueDate < input.issueDate) {
      setError("L'échéance de règlement ne peut pas précéder la date de la facture.");
      return;
    }
    setError(null);
    onSubmit(input, cleaned);
  }

  const title = isEdit
    ? `Modifier ${initial!.number}`
    : isQuote
      ? "Nouveau devis"
      : "Nouvelle facture";

  return (
    <SaleDocumentDialogShell
      title={title}
      subtitle={
        isQuote
          ? "Une proposition de prix : rien n'est vendu ni déstocké."
          : "Un document à émettre : la vente sera enregistrée à l'émission."
      }
      onClose={onClose}
      busy={busy}
      footer={
        <div className="flex flex-col gap-2 min-[560px]:flex-row min-[560px]:items-center">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-neutral-500">Total du document</p>
            <p className="text-lg font-bold text-fs-accent">{formatCurrency(totals.total)}</p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={submit}
            className="fs-touch-target w-full rounded-xl bg-fs-accent px-5 py-3 text-sm font-semibold text-white disabled:opacity-60 min-[560px]:w-auto"
          >
            {busy ? "Enregistrement…" : isEdit ? "Enregistrer" : `Créer le ${isQuote ? "devis" : "brouillon"}`}
          </button>
        </div>
      }
    >
      {error ? (
        <p className="flex items-start gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-xs font-medium leading-relaxed text-red-700 dark:text-red-300">
          <MdWarningAmber className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}

      {/* ── Destinataire ─────────────────────────────────────────────── */}
      <SaleDocumentSection
        title={isQuote ? "Devis établi pour" : "Facturé à"}
        hint="Les coordonnées sont recopiées sur le document : il gardera celles-ci même si la fiche client change plus tard."
      >
        <div className="grid gap-3 min-[560px]:grid-cols-2">
          <SaleDocumentField label="Fiche client" className="min-[560px]:col-span-2">
            <FsSearchSelect
              value={input.customerId ?? ""}
              options={customerOptions}
              onChange={pickCustomer}
              placeholder="— Saisir librement —"
              ariaLabel="Choisir une fiche client"
            />
          </SaleDocumentField>

          <SaleDocumentField label="Nom / raison sociale">
            <input
              value={input.customerName}
              onChange={(e) => set("customerName", e.target.value)}
              className={fsInputClass()}
              placeholder="Mairie de Ouagadougou"
            />
          </SaleDocumentField>

          <SaleDocumentField label="Téléphone">
            <input
              value={input.customerPhone}
              onChange={(e) => set("customerPhone", e.target.value)}
              className={fsInputClass()}
              inputMode="tel"
              placeholder="70 00 00 00"
            />
          </SaleDocumentField>

          <SaleDocumentField label="E-mail">
            <input
              value={input.customerEmail}
              onChange={(e) => set("customerEmail", e.target.value)}
              className={fsInputClass()}
              inputMode="email"
              placeholder="achats@exemple.bf"
            />
          </SaleDocumentField>

          <SaleDocumentField
            label="IFU / RCCM du client"
            hint="Réclamé par les acheteurs institutionnels."
          >
            <input
              value={input.customerTaxId}
              onChange={(e) => set("customerTaxId", e.target.value)}
              className={fsInputClass()}
            />
          </SaleDocumentField>

          <SaleDocumentField label="Adresse" className="min-[560px]:col-span-2">
            <input
              value={input.customerAddress}
              onChange={(e) => set("customerAddress", e.target.value)}
              className={fsInputClass()}
              placeholder="Secteur 15, Ouagadougou"
            />
          </SaleDocumentField>
        </div>
      </SaleDocumentSection>

      {/* ── En-tête du document ──────────────────────────────────────── */}
      <SaleDocumentSection title="Le document">
        <div className="grid gap-3 min-[560px]:grid-cols-2">
          <SaleDocumentField
            label="Objet"
            className="min-[560px]:col-span-2"
            hint="La première chose que lira l'acheteur. « Fourniture de mobilier de bureau »."
          >
            <input
              value={input.subject}
              onChange={(e) => set("subject", e.target.value)}
              className={fsInputClass()}
            />
          </SaleDocumentField>

          <SaleDocumentField
            label="Votre référence chez le client"
            hint="N° de bon de commande, d'appel d'offres… C'est par là qu'il vous retrouvera."
          >
            <input
              value={input.clientReference}
              onChange={(e) => set("clientReference", e.target.value)}
              className={fsInputClass()}
            />
          </SaleDocumentField>

          <SaleDocumentField label={isQuote ? "Date du devis" : "Date de la facture"}>
            <input
              type="date"
              value={input.issueDate}
              onChange={(e) => set("issueDate", e.target.value)}
              className={fsInputClass()}
            />
          </SaleDocumentField>

          {isQuote ? (
            <SaleDocumentField
              label="Valable jusqu'au"
              hint="Passée cette date, le devis se marque « expiré » : vos prix ne vous engagent plus."
            >
              <input
                type="date"
                value={input.validUntil ?? ""}
                onChange={(e) => set("validUntil", e.target.value || null)}
                className={fsInputClass()}
              />
            </SaleDocumentField>
          ) : (
            <SaleDocumentField
              label="À régler avant le"
              hint="Imprimée sur la facture. C'est la date qui fait foi en cas de relance."
            >
              <input
                type="date"
                value={input.dueDate ?? ""}
                onChange={(e) => set("dueDate", e.target.value || null)}
                className={fsInputClass()}
              />
            </SaleDocumentField>
          )}
        </div>
      </SaleDocumentSection>

      {/* ── Lignes ───────────────────────────────────────────────────── */}
      <SaleDocumentSection
        title="Lignes du document"
        hint="Un article du stock, ou une prestation libre qui n'a pas de fiche produit."
      >
        {lines.length === 0 ? (
          <div className="rounded-xl border border-dashed border-black/[0.12] p-5 text-center dark:border-white/15">
            <p className="text-sm font-semibold text-fs-text">Aucune ligne pour l&apos;instant</p>
            <p className="mt-1 text-xs text-neutral-500">
              Ajoutez ce que vous proposez : des articles de votre stock, des prestations, ou
              les deux sur le même document.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {lines.map((line, index) => (
              <LineEditor
                key={index}
                line={line}
                index={index}
                total={lines.length}
                productOptions={productOptions}
                onPickProduct={(id) => pickProduct(index, id)}
                onChange={(patch) => updateLine(index, patch)}
                onRemove={() => removeLine(index)}
                onMove={(dir) => moveLine(index, dir)}
              />
            ))}
          </div>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={addProductLine}
            className="inline-flex items-center gap-1.5 rounded-xl border border-black/[0.1] px-3 py-2 text-xs font-semibold text-fs-text hover:border-fs-accent/40 dark:border-white/10"
          >
            <MdAddShoppingCart className="h-4 w-4" aria-hidden />
            Article du stock
          </button>
          <button
            type="button"
            onClick={addFreeLine}
            className="inline-flex items-center gap-1.5 rounded-xl border border-black/[0.1] px-3 py-2 text-xs font-semibold text-fs-text hover:border-fs-accent/40 dark:border-white/10"
          >
            <MdNoteAdd className="h-4 w-4" aria-hidden />
            Prestation / ligne libre
          </button>
        </div>

        {shortStock.length > 0 ? (
          <p className="mt-3 flex items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-900 dark:text-amber-200">
            <MdInventory2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>
              Vous chiffrez plus que votre stock : {shortStock.join(", ")}. C&apos;est
              permis — on propose souvent ce qu&apos;on fera venir — mais l&apos;émission
              de la facture sera refusée tant que la marchandise ne sera pas entrée.
            </span>
          </p>
        ) : null}
      </SaleDocumentSection>

      {/* ── Remise et TVA ────────────────────────────────────────────── */}
      <SaleDocumentSection title="Remise et taxe">
        <div className="grid gap-3 min-[560px]:grid-cols-3">
          <SaleDocumentField label="Type de remise">
            <select
              value={input.discountKind}
              onChange={(e) =>
                set("discountKind", e.target.value === "percent" ? "percent" : "amount")
              }
              className={fsInputClass()}
            >
              <option value="amount">Montant fixe</option>
              <option value="percent">Pourcentage</option>
            </select>
          </SaleDocumentField>

          <SaleDocumentField
            label={input.discountKind === "percent" ? "Remise (%)" : "Remise (montant)"}
          >
            <input
              value={String(input.discountValue)}
              onChange={(e) => set("discountValue", Math.max(0, toNumber(e.target.value)))}
              className={fsInputClass()}
              inputMode="decimal"
            />
          </SaleDocumentField>

          <SaleDocumentField
            label="TVA (%)"
            hint="Laissez 0 si vous ne facturez pas la TVA."
          >
            <input
              value={String(input.taxRate)}
              onChange={(e) =>
                set("taxRate", Math.min(Math.max(0, toNumber(e.target.value)), 100))
              }
              className={fsInputClass()}
              inputMode="decimal"
            />
          </SaleDocumentField>
        </div>

        <div className="mt-3 rounded-xl border border-black/[0.07] bg-fs-surface-container/50 p-3 dark:border-white/10">
          <TotalRow label="Montant hors remise" value={formatCurrency(totals.subtotal)} />
          {totals.discount > 0 ? (
            <TotalRow label="Remise accordée" value={`− ${formatCurrency(totals.discount)}`} tone="warn" />
          ) : null}
          {input.taxRate > 0 ? (
            <TotalRow label={`TVA ${input.taxRate} %`} value={formatCurrency(totals.tax)} />
          ) : null}
          <div className="mt-2 flex items-center justify-between border-t border-black/[0.07] pt-2 dark:border-white/10">
            <span className="text-sm font-semibold text-fs-text">
              {isQuote ? "Total du devis" : "Net à payer"}
            </span>
            <span className="text-lg font-bold text-fs-accent">
              {formatCurrency(totals.total)}
            </span>
          </div>
          <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-neutral-500">
            <MdInfo className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            Aperçu : c&apos;est le serveur qui arrête les montants à l&apos;enregistrement,
            au franc près.
          </p>
        </div>
      </SaleDocumentSection>

      {/* ── Mentions ─────────────────────────────────────────────────── */}
      <SaleDocumentSection title="Mentions imprimées">
        <div className="grid gap-3">
          <SaleDocumentField
            label="Note au client"
            hint="Délai de livraison, garantie, modalités… Imprimée sous le tableau."
          >
            <textarea
              value={input.notes}
              onChange={(e) => set("notes", e.target.value)}
              className={fsInputClass("min-h-[72px] resize-y")}
              rows={3}
            />
          </SaleDocumentField>

          <SaleDocumentField
            label="Conditions générales"
            hint="Imprimées en petit, en pied de document."
          >
            <textarea
              value={input.terms}
              onChange={(e) => set("terms", e.target.value)}
              className={fsInputClass("min-h-[72px] resize-y")}
              rows={3}
            />
          </SaleDocumentField>
        </div>
      </SaleDocumentSection>
    </SaleDocumentDialogShell>
  );
}

function LineEditor({
  line,
  index,
  total,
  productOptions,
  onPickProduct,
  onChange,
  onRemove,
  onMove,
}: {
  line: SaleDocumentLineDraft;
  index: number;
  total: number;
  productOptions: { id: string; name: string }[];
  onPickProduct: (id: string) => void;
  onChange: (patch: Partial<SaleDocumentLineDraft>) => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
}) {
  const lineTotal = saleDocumentLineTotal(line);

  return (
    <div className="rounded-xl border border-black/[0.08] bg-fs-card p-3 dark:border-white/10">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-neutral-400">
          <MdDragHandle className="h-3.5 w-3.5" aria-hidden />
          Ligne {index + 1}
        </span>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={index === 0}
            className="rounded-lg px-2 py-1 text-xs font-semibold text-neutral-500 hover:text-fs-accent disabled:opacity-30"
            aria-label="Monter la ligne"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={index === total - 1}
            className="rounded-lg px-2 py-1 text-xs font-semibold text-neutral-500 hover:text-fs-accent disabled:opacity-30"
            aria-label="Descendre la ligne"
          >
            ↓
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="rounded-lg p-1.5 text-neutral-400 hover:text-red-600"
            aria-label={`Supprimer la ligne ${index + 1}`}
          >
            <MdDelete className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>

      <div className="mt-2 grid gap-2.5">
        <SaleDocumentField
          label="Article du catalogue"
          hint={
            line.productId
              ? "Rattachée au stock : cette ligne sortira du stock à l'émission de la facture."
              : "Aucun article : ligne libre, elle ne touchera jamais au stock."
          }
        >
          <FsSearchSelect
            value={line.productId ?? ""}
            options={[{ id: "", name: "— Ligne libre (prestation) —" }, ...productOptions]}
            onChange={onPickProduct}
            placeholder="— Ligne libre (prestation) —"
            ariaLabel={`Article de la ligne ${index + 1}`}
          />
        </SaleDocumentField>

        <SaleDocumentField label="Désignation">
          <input
            value={line.label}
            onChange={(e) => onChange({ label: e.target.value })}
            className={fsInputClass()}
            placeholder="Installation et mise en service"
          />
        </SaleDocumentField>

        <SaleDocumentField label="Précision (facultatif)">
          <input
            value={line.description}
            onChange={(e) => onChange({ description: e.target.value })}
            className={fsInputClass()}
            placeholder="Référence, dimensions, coloris…"
          />
        </SaleDocumentField>

        <div className="grid grid-cols-2 gap-2.5 min-[560px]:grid-cols-4">
          <SaleDocumentField
            label="Quantité"
            hint={line.productId ? "Nombre entier (article du stock)." : undefined}
          >
            <input
              value={String(line.quantity)}
              onChange={(e) => onChange({ quantity: Math.max(0, toNumber(e.target.value)) })}
              className={fsInputClass()}
              inputMode="decimal"
            />
          </SaleDocumentField>

          <SaleDocumentField label="Unité">
            <input
              value={line.unit}
              onChange={(e) => onChange({ unit: e.target.value })}
              className={fsInputClass()}
              placeholder="u"
            />
          </SaleDocumentField>

          <SaleDocumentField label="Prix unitaire">
            <input
              value={String(line.unitPrice)}
              onChange={(e) => onChange({ unitPrice: Math.max(0, toNumber(e.target.value)) })}
              className={fsInputClass()}
              inputMode="decimal"
            />
          </SaleDocumentField>

          <SaleDocumentField label="Remise (%)">
            <input
              value={String(line.discountPercent)}
              onChange={(e) =>
                onChange({
                  discountPercent: Math.min(Math.max(0, toNumber(e.target.value)), 100),
                })
              }
              className={fsInputClass()}
              inputMode="decimal"
            />
          </SaleDocumentField>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between border-t border-black/[0.05] pt-2 dark:border-white/[0.06]">
        <span className="text-[11px] text-neutral-500">Montant de la ligne</span>
        <span className="text-sm font-bold text-fs-text">{formatCurrency(lineTotal)}</span>
      </div>
    </div>
  );
}

function TotalRow({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "warn";
}) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-xs text-neutral-600 dark:text-neutral-400">{label}</span>
      <span
        className={cn(
          "text-sm font-semibold",
          tone === "warn" ? "text-amber-700 dark:text-amber-300" : "text-fs-text",
        )}
      >
        {value}
      </span>
    </div>
  );
}

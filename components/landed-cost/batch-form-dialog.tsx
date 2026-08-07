"use client";

import { useState } from "react";
import { MdClose } from "react-icons/md";
import { LcCard, lcInputClass } from "./ui";
import {
  ALLOCATION_OPTIONS,
  COSTING_OPTIONS,
  MARGIN_OPTIONS,
  ROUNDING_OPTIONS,
  STOCK_MODE_OPTIONS,
  marginSuffix,
} from "@/lib/features/landed-cost/labels";
import { parseAmount } from "@/lib/features/landed-cost/format";
import type {
  AllocationMethod,
  CostBatch,
  CostingMethod,
  MarginMode,
  StockMode,
} from "@/lib/features/landed-cost/types";
import { cn } from "@/lib/utils/cn";

/** Choix à deux options présenté en cartes : le libellé seul ne suffit pas à décider. */
function ChoiceCards<T extends string>({
  value,
  options,
  onChange,
  disabled,
}: {
  value: T;
  options: { key: T; label: string; hint: string }[];
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="mt-2 grid gap-2 sm:grid-cols-2">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          disabled={disabled}
          onClick={() => onChange(o.key)}
          className={cn(
            "rounded-md border p-3 text-left transition-colors disabled:opacity-60",
            value === o.key
              ? "border-fs-accent/40 bg-[color-mix(in_srgb,var(--fs-accent)_10%,transparent)]"
              : "border-black/[0.08] bg-fs-card hover:border-black/20",
          )}
        >
          <span
            className={cn(
              "block text-sm font-semibold",
              value === o.key ? "text-fs-accent" : "text-fs-text",
            )}
          >
            {o.label}
          </span>
          <span className="mt-1 block text-[11px] leading-relaxed text-neutral-600">
            {o.hint}
          </span>
        </button>
      ))}
    </div>
  );
}

/**
 * Création / réglages d'un arrivage.
 *
 * Deux décisions comptent vraiment et sont donc en haut, en clair : est-ce que cet
 * arrivage entre le stock (ou a-t-il déjà été saisi ailleurs) ? et le nouveau prix
 * d'achat doit-il se mélanger à l'ancien stock ? Le reste (devise, arrondi) est replié.
 *
 * Monté seulement à l'ouverture (l'appelant le rend sous condition, avec une `key`) :
 * l'état de départ vient donc directement des props, sans effet de synchronisation.
 */
export function BatchFormDialog({
  editing,
  stores,
  suppliers,
  defaultStoreId,
  busy,
  onClose,
  onSubmit,
}: {
  editing: CostBatch | null;
  stores: { id: string; name: string }[];
  suppliers: { id: string; name: string }[];
  defaultStoreId: string | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: (v: {
    storeId: string;
    supplierId: string | null;
    label: string;
    reference: string | null;
    stockMode: StockMode;
    costingMethod: CostingMethod;
    allocationMethod: AllocationMethod;
    currencyCode: string;
    exchangeRate: number;
    rounding: number;
    marginMode: MarginMode;
    marginValue: number;
    orderedAt: string | null;
    receivedAt: string | null;
    notes: string | null;
  }) => void;
}) {
  const [storeId, setStoreId] = useState(
    editing?.storeId ?? defaultStoreId ?? stores[0]?.id ?? "",
  );
  const [supplierId, setSupplierId] = useState(editing?.supplierId ?? "");
  const [label, setLabel] = useState(editing?.label ?? "");
  const [reference, setReference] = useState(editing?.reference ?? "");
  const [stockMode, setStockMode] = useState<StockMode>(editing?.stockMode ?? "receive");
  const [costingMethod, setCostingMethod] = useState<CostingMethod>(
    editing?.costingMethod ?? "weighted_average",
  );
  const [allocation, setAllocation] = useState<AllocationMethod>(
    editing?.allocationMethod ?? "value",
  );
  const [currency, setCurrency] = useState(editing?.currencyCode ?? "XOF");
  const [rate, setRate] = useState(editing ? String(editing.exchangeRate) : "1");
  // Un prix conseillé à 1 402 F ne se rend pas en monnaie : on arrondit à 25 F d'office.
  const [rounding, setRounding] = useState(editing?.rounding ?? 25);
  const [marginMode, setMarginMode] = useState<MarginMode>(
    editing?.marginMode ?? "markup_percent",
  );
  const [marginValue, setMarginValue] = useState(
    editing ? String(editing.marginValue) : "25",
  );
  const [orderedAt, setOrderedAt] = useState(editing?.orderedAt ?? "");
  const [receivedAt, setReceivedAt] = useState(
    editing ? (editing.receivedAt ?? "") : new Date().toISOString().slice(0, 10),
  );
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const [advanced, setAdvanced] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function submit() {
    if (!storeId) {
      setError("Choisissez la boutique qui reçoit cet arrivage.");
      return;
    }
    const r = parseAmount(rate);
    if (r <= 0) {
      setError("Le taux de conversion doit être supérieur à zéro.");
      return;
    }
    onSubmit({
      storeId,
      supplierId: supplierId || null,
      label: label.trim(),
      reference: reference.trim() || null,
      stockMode,
      costingMethod,
      allocationMethod: allocation,
      currencyCode: currency.trim().toUpperCase() || "XOF",
      exchangeRate: r,
      rounding,
      marginMode,
      marginValue: parseAmount(marginValue),
      orderedAt: orderedAt || null,
      receivedAt: receivedAt || null,
      notes: notes.trim() || null,
    });
  }

  const foreign = currency.trim().toUpperCase() !== "XOF";

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={editing ? "Réglages de l'arrivage" : "Nouvel arrivage"}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <LcCard
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-b-none shadow-xl sm:rounded-md"
        padding="p-4 sm:p-5"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-base font-bold text-fs-text">
            {editing ? "Réglages de l'arrivage" : "Nouvel arrivage"}
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

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="b-label" className="block text-xs font-semibold text-neutral-700">
              Nom de l&apos;arrivage
            </label>
            <input
              id="b-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Conteneur Lomé février"
              className={lcInputClass("mt-1.5")}
            />
          </div>
          <div>
            <label htmlFor="b-ref" className="block text-xs font-semibold text-neutral-700">
              Référence facture
            </label>
            <input
              id="b-ref"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="FA-2026-118"
              className={lcInputClass("mt-1.5")}
            />
          </div>
          <div>
            <label htmlFor="b-store" className="block text-xs font-semibold text-neutral-700">
              Boutique réceptrice
            </label>
            <select
              id="b-store"
              value={storeId}
              onChange={(e) => setStoreId(e.target.value)}
              disabled={Boolean(editing)}
              className={lcInputClass("mt-1.5 disabled:opacity-60")}
            >
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="b-supplier" className="block text-xs font-semibold text-neutral-700">
              Fournisseur
            </label>
            <select
              id="b-supplier"
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              className={lcInputClass("mt-1.5")}
            >
              <option value="">— Non précisé —</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Que doit faire l&apos;application en appliquant ?
        </p>
        <ChoiceCards
          value={stockMode}
          options={STOCK_MODE_OPTIONS}
          onChange={setStockMode}
          disabled={Boolean(editing && editing.status !== "draft")}
        />

        <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Nouveau prix d&apos;achat
        </p>
        <ChoiceCards value={costingMethod} options={COSTING_OPTIONS} onChange={setCostingMethod} />

        <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Marge appliquée par défaut
        </p>
        <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
          <select
            value={marginMode}
            onChange={(e) => setMarginMode(e.target.value as MarginMode)}
            aria-label="Mode de marge par défaut"
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
              aria-label="Valeur de la marge par défaut"
              className={lcInputClass("w-28 pr-8 text-right font-semibold")}
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-neutral-500">
              {marginSuffix(marginMode)}
            </span>
          </div>
        </div>
        <p className="mt-1.5 text-[11px] leading-relaxed text-neutral-600">
          {MARGIN_OPTIONS.find((m) => m.key === marginMode)?.hint}
        </p>

        <button
          type="button"
          onClick={() => setAdvanced((v) => !v)}
          className="fs-touch-target mt-5 text-xs font-semibold text-fs-accent hover:underline hover:underline-offset-2"
        >
          {advanced ? "Masquer les réglages avancés" : "Réglages avancés (devise, arrondi, dates)"}
        </button>

        {advanced ? (
          <div className="mt-3 space-y-4 rounded-md border border-black/[0.08] p-3">
            <div>
              <label htmlFor="b-alloc" className="block text-xs font-semibold text-neutral-700">
                Répartition des frais par défaut
              </label>
              <select
                id="b-alloc"
                value={allocation}
                onChange={(e) => setAllocation(e.target.value as AllocationMethod)}
                className={lcInputClass("mt-1.5")}
              >
                {ALLOCATION_OPTIONS.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </select>
              <p className="mt-1.5 text-[11px] leading-relaxed text-neutral-600">
                {ALLOCATION_OPTIONS.find((o) => o.key === allocation)?.hint} Chaque frais peut
                choisir une autre clé.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="b-cur" className="block text-xs font-semibold text-neutral-700">
                  Devise de la facture
                </label>
                <input
                  id="b-cur"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  placeholder="XOF"
                  className={lcInputClass("mt-1.5 uppercase")}
                />
              </div>
              <div>
                <label htmlFor="b-rate" className="block text-xs font-semibold text-neutral-700">
                  1 {currency.trim().toUpperCase() || "XOF"} = ? F CFA
                </label>
                <input
                  id="b-rate"
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                  inputMode="decimal"
                  disabled={!foreign}
                  className={lcInputClass("mt-1.5 disabled:opacity-60")}
                />
              </div>
            </div>
            {foreign ? (
              <p className="text-[11px] leading-relaxed text-neutral-600">
                Saisissez montants et frais en {currency.trim().toUpperCase()} : tout est converti
                en F CFA au taux ci-dessus.
              </p>
            ) : null}

            <div>
              <label htmlFor="b-round" className="block text-xs font-semibold text-neutral-700">
                Arrondir le prix de vente conseillé
              </label>
              <select
                id="b-round"
                value={rounding}
                onChange={(e) => setRounding(Number(e.target.value))}
                className={lcInputClass("mt-1.5")}
              >
                {ROUNDING_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <p className="mt-1.5 text-[11px] leading-relaxed text-neutral-600">
                Un prix à 1 402 F oblige à rendre la monnaie. Arrondi à 25 F, il devient 1 400 F.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="b-ordered" className="block text-xs font-semibold text-neutral-700">
                  Commandé le
                </label>
                <input
                  id="b-ordered"
                  type="date"
                  value={orderedAt}
                  onChange={(e) => setOrderedAt(e.target.value)}
                  className={lcInputClass("mt-1.5")}
                />
              </div>
              <div>
                <label htmlFor="b-received" className="block text-xs font-semibold text-neutral-700">
                  Reçu le
                </label>
                <input
                  id="b-received"
                  type="date"
                  value={receivedAt}
                  onChange={(e) => setReceivedAt(e.target.value)}
                  className={lcInputClass("mt-1.5")}
                />
              </div>
            </div>

            <div>
              <label htmlFor="b-notes" className="block text-xs font-semibold text-neutral-700">
                Notes
              </label>
              <textarea
                id="b-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Transporteur, incidents, remises obtenues…"
                className={lcInputClass("mt-1.5 resize-y")}
              />
            </div>
          </div>
        ) : null}

        {error ? (
          <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs font-medium text-red-700 dark:bg-red-500/10 dark:text-red-300">
            {error}
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
            className="rounded-md bg-fs-accent px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy ? "Enregistrement…" : editing ? "Enregistrer" : "Créer l'arrivage"}
          </button>
        </div>
      </LcCard>
    </div>
  );
}

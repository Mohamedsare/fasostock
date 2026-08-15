"use client";

import { useMemo, useState } from "react";
import { MdAdd, MdBuild, MdDelete, MdInventory2 } from "react-icons/md";
import { FsSearchSelect } from "@/components/ui/fs-search-select";
import { fsInputClass } from "@/components/ui/fs-screen-primitives";
import { RepairDialogShell, RepairField } from "./repair-dialog-shell";
import {
  REPAIR_STATUS_HINTS,
  REPAIR_STATUS_LABELS,
  REPAIR_STATUS_FLOW,
  repairOrderTotal,
  type RepairOrder,
  type RepairOrderInput,
  type RepairOrderLineDraft,
  type RepairStatus,
} from "@/lib/features/repairs/types";
import { formatCurrency, toNumber } from "@/lib/utils/currency";
import { cn } from "@/lib/utils/cn";

type ProductOption = { id: string; name: string; salePrice: number; stock: number };
type CustomerOption = { id: string; name: string; phone?: string | null };
type StaffOption = { id: string; name: string };

function emptyInput(): RepairOrderInput {
  return {
    customerId: null,
    customerName: "",
    customerPhone: "",
    vehiclePlate: "",
    vehicleMake: "",
    vehicleModel: "",
    vehicleYear: "",
    vehicleMileage: "",
    reportedIssue: "",
    diagnosis: "",
    status: "reception",
    assignedTo: null,
    promisedAt: null,
    notes: "",
  };
}

function inputFrom(order: RepairOrder): RepairOrderInput {
  return {
    customerId: order.customerId,
    customerName: order.customerName ?? "",
    customerPhone: order.customerPhone ?? "",
    vehiclePlate: order.vehiclePlate ?? "",
    vehicleMake: order.vehicleMake ?? "",
    vehicleModel: order.vehicleModel ?? "",
    vehicleYear: order.vehicleYear ?? "",
    vehicleMileage: order.vehicleMileage == null ? "" : String(order.vehicleMileage),
    reportedIssue: order.reportedIssue ?? "",
    diagnosis: order.diagnosis ?? "",
    status: order.status,
    assignedTo: order.assignedTo,
    promisedAt: order.promisedAt ? order.promisedAt.slice(0, 10) : null,
    notes: order.notes ?? "",
  };
}

export function RepairOrderDialog({
  initial,
  products,
  customers,
  staff,
  busy,
  onClose,
  onSubmit,
}: {
  initial: RepairOrder | null;
  products: ProductOption[];
  customers: CustomerOption[];
  staff: StaffOption[];
  busy: boolean;
  onClose: () => void;
  onSubmit: (input: RepairOrderInput, lines: RepairOrderLineDraft[]) => void;
}) {
  const isEdit = initial != null;
  const [input, setInput] = useState<RepairOrderInput>(() =>
    initial ? inputFrom(initial) : emptyInput(),
  );
  const [lines, setLines] = useState<RepairOrderLineDraft[]>(() =>
    (initial?.lines ?? []).map((l) => ({
      kind: l.kind,
      productId: l.productId,
      label: l.label,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
    })),
  );
  const [error, setError] = useState<string | null>(null);

  const productOptions = useMemo(
    () => products.map((p) => ({ id: p.id, name: `${p.name} · ${p.stock} en stock` })),
    [products],
  );
  const customerOptions = useMemo(
    () => [{ id: "", name: "— Client de passage —" }, ...customers.map((c) => ({ id: c.id, name: c.name }))],
    [customers],
  );
  const staffOptions = useMemo(
    () => [{ id: "", name: "— Non affecté —" }, ...staff.map((s) => ({ id: s.id, name: s.name }))],
    [staff],
  );

  const total = repairOrderTotal(lines);

  function set<K extends keyof RepairOrderInput>(key: K, value: RepairOrderInput[K]) {
    setInput((prev) => ({ ...prev, [key]: value }));
  }

  function addLine(kind: RepairOrderLineDraft["kind"]) {
    setLines((prev) => [
      ...prev,
      { kind, productId: null, label: "", quantity: 1, unitPrice: 0 },
    ]);
  }

  function updateLine(index: number, patch: Partial<RepairOrderLineDraft>) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  /** Choisir une pièce du catalogue remplit le libellé et le prix de vente. */
  function pickProduct(index: number, productId: string) {
    const product = products.find((p) => p.id === productId);
    if (!product) {
      updateLine(index, { productId: null });
      return;
    }
    updateLine(index, {
      productId: product.id,
      label: product.name,
      unitPrice: product.salePrice,
    });
  }

  function submit() {
    setError(null);
    const hasVehicle =
      input.vehiclePlate.trim() || input.vehicleMake.trim() || input.vehicleModel.trim();
    if (!hasVehicle) {
      setError("Indiquez au moins la plaque ou la marque du véhicule.");
      return;
    }
    const cleanLines = lines.filter((l) => l.label.trim().length > 0);
    const partWithoutProduct = cleanLines.some((l) => l.kind === "part" && !l.productId);
    if (partWithoutProduct) {
      setError(
        "Chaque pièce doit être choisie dans le catalogue — c'est ce qui permet de sortir le stock à la facturation.",
      );
      return;
    }
    onSubmit(input, cleanLines);
  }

  return (
    <RepairDialogShell
      title={isEdit ? `Ordre ${initial.orderNumber}` : "Nouvel ordre de réparation"}
      subtitle={
        isEdit
          ? REPAIR_STATUS_HINTS[input.status]
          : "Le véhicule entre à l'atelier : notez-le maintenant, complétez au fur et à mesure."
      }
      onClose={onClose}
      busy={busy}
      footer={
        <div className="flex flex-col gap-3">
          {error ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800 dark:bg-red-500/10 dark:text-red-300">
              {error}
            </p>
          ) : null}
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] text-neutral-500">Total de l&apos;ordre</p>
              <p className="truncate text-lg font-bold text-fs-text">{formatCurrency(total)}</p>
            </div>
            <button
              type="button"
              onClick={submit}
              disabled={busy}
              className="fs-touch-target shrink-0 rounded-xl bg-fs-accent px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
            >
              {busy ? "Enregistrement…" : isEdit ? "Enregistrer" : "Créer l'ordre"}
            </button>
          </div>
        </div>
      }
    >
      {/* Véhicule */}
      <section>
        <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-neutral-500">
          Véhicule
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <RepairField label="Immatriculation" className="col-span-2 min-[520px]:col-span-1">
            <input
              value={input.vehiclePlate}
              onChange={(e) => set("vehiclePlate", e.target.value.toUpperCase())}
              className={fsInputClass("uppercase")}
              placeholder="11 AA 1234"
              autoCapitalize="characters"
            />
          </RepairField>
          <RepairField label="Kilométrage" className="col-span-2 min-[520px]:col-span-1">
            <input
              value={input.vehicleMileage}
              onChange={(e) => set("vehicleMileage", e.target.value)}
              className={fsInputClass()}
              inputMode="numeric"
              placeholder="Ex. 145000"
            />
          </RepairField>
          <RepairField label="Marque">
            <input
              value={input.vehicleMake}
              onChange={(e) => set("vehicleMake", e.target.value)}
              className={fsInputClass()}
              placeholder="Toyota"
            />
          </RepairField>
          <RepairField label="Modèle">
            <input
              value={input.vehicleModel}
              onChange={(e) => set("vehicleModel", e.target.value)}
              className={fsInputClass()}
              placeholder="Hilux"
            />
          </RepairField>
        </div>
      </section>

      {/* Client */}
      <section>
        <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-neutral-500">
          Client
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <RepairField
            label="Fiche client"
            className="col-span-2"
            hint="Rattacher une fiche permet de facturer à crédit et de suivre l'historique."
          >
            <FsSearchSelect
              value={input.customerId ?? ""}
              options={customerOptions}
              onChange={(id) => set("customerId", id || null)}
              placeholder="— Client de passage —"
              ariaLabel="Client"
            />
          </RepairField>
          <RepairField label="Nom (si pas de fiche)">
            <input
              value={input.customerName}
              onChange={(e) => set("customerName", e.target.value)}
              className={fsInputClass()}
              placeholder="Ex. M. Ouédraogo"
            />
          </RepairField>
          <RepairField label="Téléphone">
            <input
              value={input.customerPhone}
              onChange={(e) => set("customerPhone", e.target.value)}
              className={fsInputClass()}
              inputMode="tel"
              placeholder="70 00 00 00"
            />
          </RepairField>
        </div>
      </section>

      {/* Atelier */}
      <section>
        <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-neutral-500">
          Atelier
        </h3>
        <div className="space-y-3">
          <RepairField
            label="Panne signalée par le client"
            hint="Ses mots à lui — c'est ce qu'il vous redemandera à la livraison."
          >
            <textarea
              value={input.reportedIssue}
              onChange={(e) => set("reportedIssue", e.target.value)}
              className={fsInputClass("min-h-[64px] resize-y")}
              placeholder="Ex. Bruit à l'avant droit au freinage"
            />
          </RepairField>
          <RepairField label="Diagnostic de l'atelier">
            <textarea
              value={input.diagnosis}
              onChange={(e) => set("diagnosis", e.target.value)}
              className={fsInputClass("min-h-[64px] resize-y")}
              placeholder="Ex. Plaquettes avant usées, disque à rectifier"
            />
          </RepairField>
          <div className="grid grid-cols-2 gap-3">
            <RepairField label="Mécanicien">
              <FsSearchSelect
                value={input.assignedTo ?? ""}
                options={staffOptions}
                onChange={(id) => set("assignedTo", id || null)}
                placeholder="— Non affecté —"
                ariaLabel="Mécanicien"
              />
            </RepairField>
            <RepairField label="Promis pour le">
              <input
                type="date"
                value={input.promisedAt ?? ""}
                onChange={(e) => set("promisedAt", e.target.value || null)}
                className={fsInputClass()}
              />
            </RepairField>
          </div>
          <RepairField label="Étape">
            <div className="flex flex-wrap gap-1.5">
              {REPAIR_STATUS_FLOW.filter((s) => s !== "delivered" || isEdit).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => set("status", s as RepairStatus)}
                  disabled={s === "delivered" && !initial?.saleId}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                    input.status === s
                      ? "border-transparent bg-fs-accent text-white"
                      : "border-black/[0.1] bg-fs-card text-neutral-600 hover:border-fs-accent/40 dark:border-white/10 dark:text-neutral-300",
                  )}
                >
                  {REPAIR_STATUS_LABELS[s]}
                </button>
              ))}
            </div>
            <span className="mt-1.5 block text-[11px] text-neutral-500">
              {REPAIR_STATUS_HINTS[input.status]}
              {input.status !== "delivered"
                ? " · « Livré » s'obtient en facturant l'ordre."
                : ""}
            </span>
          </RepairField>
        </div>
      </section>

      {/* Lignes */}
      <section>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">
            Pièces & main-d&apos;œuvre
          </h3>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => addLine("part")}
              className="inline-flex items-center gap-1 rounded-lg border border-black/[0.1] px-2.5 py-1.5 text-xs font-semibold text-fs-text hover:border-fs-accent/40 dark:border-white/10"
            >
              <MdInventory2 className="h-3.5 w-3.5" aria-hidden />
              Pièce
            </button>
            <button
              type="button"
              onClick={() => addLine("labor")}
              className="inline-flex items-center gap-1 rounded-lg border border-black/[0.1] px-2.5 py-1.5 text-xs font-semibold text-fs-text hover:border-fs-accent/40 dark:border-white/10"
            >
              <MdBuild className="h-3.5 w-3.5" aria-hidden />
              Main-d&apos;œuvre
            </button>
          </div>
        </div>

        {lines.length === 0 ? (
          <p className="rounded-xl border border-dashed border-black/10 px-3 py-4 text-center text-xs text-neutral-500 dark:border-white/15">
            Aucune ligne. Ajoutez les pièces montées et le temps facturé — le total
            deviendra la facture du client.
          </p>
        ) : (
          <div className="space-y-2">
            {lines.map((line, index) => (
              <div
                key={index}
                className="rounded-xl border border-black/[0.07] bg-fs-surface-container/50 p-2.5 dark:border-white/10"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                      line.kind === "part"
                        ? "bg-sky-500/15 text-sky-700 dark:text-sky-300"
                        : "bg-violet-500/15 text-violet-700 dark:text-violet-300",
                    )}
                  >
                    {line.kind === "part" ? "Pièce" : "Main-d'œuvre"}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeLine(index)}
                    className="rounded-lg p-1.5 text-neutral-500 hover:bg-black/5 hover:text-red-600 dark:hover:bg-white/10"
                    aria-label="Retirer la ligne"
                  >
                    <MdDelete className="h-4 w-4" aria-hidden />
                  </button>
                </div>

                {line.kind === "part" ? (
                  <div className="mb-2">
                    <FsSearchSelect
                      value={line.productId ?? ""}
                      options={productOptions}
                      onChange={(id) => pickProduct(index, id)}
                      placeholder="Choisir la pièce dans le stock…"
                      ariaLabel="Pièce"
                    />
                  </div>
                ) : (
                  <input
                    value={line.label}
                    onChange={(e) => updateLine(index, { label: e.target.value })}
                    className={fsInputClass("mb-2")}
                    placeholder="Ex. Remplacement plaquettes avant"
                  />
                )}

                <div className="flex items-end gap-2">
                  <label className="min-w-0 flex-1">
                    <span className="mb-1 block text-[11px] font-medium text-neutral-500">
                      Quantité
                    </span>
                    <input
                      value={String(line.quantity)}
                      onChange={(e) =>
                        updateLine(index, {
                          quantity: Math.max(1, Math.trunc(toNumber(e.target.value)) || 1),
                        })
                      }
                      className={fsInputClass()}
                      inputMode="numeric"
                    />
                  </label>
                  <label className="min-w-0 flex-1">
                    <span className="mb-1 block text-[11px] font-medium text-neutral-500">
                      Prix unitaire
                    </span>
                    <input
                      value={String(line.unitPrice)}
                      onChange={(e) =>
                        updateLine(index, { unitPrice: Math.max(0, toNumber(e.target.value)) })
                      }
                      className={fsInputClass()}
                      inputMode="decimal"
                    />
                  </label>
                  <div className="min-w-0 shrink-0 pb-2.5 text-right">
                    <span className="block text-[11px] text-neutral-500">Total</span>
                    <span className="block text-sm font-bold text-fs-text">
                      {formatCurrency(line.quantity * line.unitPrice)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={() => addLine("part")}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-black/10 py-2 text-xs font-semibold text-neutral-600 hover:border-fs-accent/40 hover:text-fs-accent dark:border-white/15 dark:text-neutral-300"
            >
              <MdAdd className="h-4 w-4" aria-hidden />
              Ajouter une ligne
            </button>
          </div>
        )}
      </section>

      <RepairField label="Notes internes">
        <textarea
          value={input.notes}
          onChange={(e) => set("notes", e.target.value)}
          className={fsInputClass("min-h-[52px] resize-y")}
          placeholder="Ex. Pièce commandée chez le fournisseur, arrive jeudi"
        />
      </RepairField>
    </RepairDialogShell>
  );
}

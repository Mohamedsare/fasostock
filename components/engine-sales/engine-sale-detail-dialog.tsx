"use client";

import { FsCard, fsInputClass } from "@/components/ui/fs-screen-primitives";
import { EngineCollectPaymentDialog } from "@/components/engine-sales/engine-collect-payment-dialog";
import {
  enginePaymentStatus,
  getEngineSaleDetail,
  updateEngineSaleDetails,
} from "@/lib/features/engine-sales/api";
import {
  downloadEngineInvoice,
  printEngineInvoice,
} from "@/lib/features/engine-sales/invoice-actions";
import type {
  EngineCondition,
  EngineSaleAccessories,
  EngineSaleClient,
  EngineSaleEngine,
  EngineSaleWarranty,
  EngineWheels,
} from "@/lib/features/engine-sales/types";
import { queryKeys } from "@/lib/query/query-keys";
import { formatCurrency } from "@/lib/utils/currency";
import { cn } from "@/lib/utils/cn";
import { messageFromUnknownError, toast } from "@/lib/toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  MdClose,
  MdDownload,
  MdEdit,
  MdPayments,
  MdPrint,
} from "react-icons/md";
import { getActiveTimeZone } from "@/lib/utils/operation-datetime";

function wheelsLabel(w: EngineWheels | null): string {
  return w === 2 ? "2 roues" : w === 3 ? "3 roues" : "—";
}
function conditionLabel(c: EngineCondition | null): string {
  return c === "neuf" ? "Neuf" : c === "occasion" ? "Occasion" : "—";
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "Espèces",
  mobile_money: "Mobile money",
  transfer: "Virement",
  card: "Carte",
  other: "Autre",
};
function paymentMethodLabel(m: string): string {
  return PAYMENT_METHOD_LABELS[m] ?? (m || "—");
}

function formatPaymentDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("fr-FR", {
      timeZone: getActiveTimeZone(),
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return iso.slice(0, 16);
  }
}

export function EngineSaleDetailDialog({
  saleId,
  companyId,
  currentStoreFilterId,
  canEdit,
  open,
  onClose,
}: {
  saleId: string | null;
  companyId: string;
  currentStoreFilterId: string | null;
  canEdit: boolean;
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [busyAction, setBusyAction] = useState<"print" | "download" | null>(null);
  const [collecting, setCollecting] = useState(false);

  const detailQ = useQuery({
    queryKey: ["engine-sale-detail", saleId],
    queryFn: () => getEngineSaleDetail(saleId as string),
    enabled: open && Boolean(saleId),
    staleTime: 0,
  });
  const detail = detailQ.data ?? null;

  // Formulaire d'édition
  const [client, setClient] = useState<EngineSaleClient | null>(null);
  const [engine, setEngine] = useState<EngineSaleEngine | null>(null);
  const [warranty, setWarranty] = useState<EngineSaleWarranty | null>(null);
  const [accessories, setAccessories] = useState<EngineSaleAccessories | null>(null);
  const [observations, setObservations] = useState("");
  const [internalReference, setInternalReference] = useState("");

  useEffect(() => {
    if (!detail) return;
    setClient(detail.client);
    setEngine(detail.engine);
    setWarranty(detail.warranty);
    setAccessories(detail.accessories);
    setObservations(detail.observations ?? "");
    setInternalReference(detail.internalReference ?? "");
  }, [detail]);

  useEffect(() => {
    if (!open) {
      setEditing(false);
      setCollecting(false);
    }
  }, [open]);

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!saleId || !client || !engine || !warranty || !accessories) return;
      await updateEngineSaleDetails(saleId, {
        client,
        engine,
        warranty,
        accessories,
        observations,
        internalReference,
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["engine-sale-detail", saleId] });
      await qc.invalidateQueries({
        queryKey: queryKeys.engineSales({ companyId, storeId: currentStoreFilterId }),
      });
      toast.success("Vente mise à jour");
      setEditing(false);
    },
    onError: (e) => toast.error(messageFromUnknownError(e, "Enregistrement impossible.")),
  });

  async function doPrint() {
    if (!saleId) return;
    try {
      setBusyAction("print");
      await printEngineInvoice(saleId);
    } catch (e) {
      toast.error(messageFromUnknownError(e, "Impression impossible."));
    } finally {
      setBusyAction(null);
    }
  }
  async function doDownload() {
    if (!saleId) return;
    try {
      setBusyAction("download");
      await downloadEngineInvoice(saleId, detail?.saleNumber ?? saleId);
      toast.success("Téléchargement lancé");
    } catch (e) {
      toast.error(messageFromUnknownError(e, "Téléchargement impossible."));
    } finally {
      setBusyAction(null);
    }
  }

  if (!open || !saleId) return null;

  const input = fsInputClass("rounded-md border border-black/8");
  const isCancelled = detail?.status === "cancelled";

  const payments = detail?.payments ?? [];
  const amountPaid = payments.reduce((s, p) => s + p.amount, 0);
  const remaining = Math.max(0, (detail?.total ?? 0) - amountPaid);
  const payStatus = enginePaymentStatus(detail?.total ?? 0, amountPaid);
  const payStatusCfg = {
    paid: { label: "Payé", cls: "bg-emerald-50 text-emerald-700" },
    partial: { label: "Partiel", cls: "bg-amber-50 text-amber-700" },
    unpaid: { label: "Impayé", cls: "bg-red-50 text-red-700" },
  }[payStatus];

  // Affiche une valeur (lecture) ou un champ (édition).
  const RowText = ({ label, value }: { label: string; value: string | null }) => (
    <div className="flex justify-between gap-3 border-b border-dashed border-black/6 py-1.5 text-sm last:border-0">
      <span className="font-medium text-neutral-600">{label}</span>
      <span className={cn("text-right", value ? "text-fs-text" : "text-neutral-400")}>
        {value || "—"}
      </span>
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-3"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <FsCard
        className="max-h-[min(94dvh,900px)] w-full max-w-3xl overflow-hidden rounded-t-2xl sm:rounded-2xl"
        padding="p-0"
      >
        <div className="flex max-h-[min(94dvh,900px)] flex-col">
          {/* En-tête */}
          <div className="flex items-center justify-between gap-3 border-b border-black/6 p-4">
            <div className="min-w-0">
              <h2 className="truncate text-base font-bold text-fs-text">
                Vente {detail?.saleNumber ?? ""}
              </h2>
              {detail ? (
                <p className="text-xs text-neutral-500">
                  {new Date(detail.createdAt).toLocaleString("fr-FR")} ·{" "}
                  {isCancelled ? "Annulée" : "Validée"}
                </p>
              ) : null}
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={doPrint}
                disabled={busyAction !== null}
                title="Imprimer"
                aria-label="Imprimer la facture"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-neutral-600 hover:bg-fs-accent/10 hover:text-fs-accent disabled:opacity-50"
              >
                {busyAction === "print" ? (
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" />
                ) : (
                  <MdPrint className="h-5 w-5" aria-hidden />
                )}
              </button>
              <button
                type="button"
                onClick={doDownload}
                disabled={busyAction !== null}
                title="Télécharger"
                aria-label="Télécharger la facture"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-neutral-600 hover:bg-fs-accent/10 hover:text-fs-accent disabled:opacity-50"
              >
                {busyAction === "download" ? (
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" />
                ) : (
                  <MdDownload className="h-5 w-5" aria-hidden />
                )}
              </button>
              {canEdit && !isCancelled && !editing ? (
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  title="Modifier"
                  aria-label="Modifier la vente"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-neutral-600 hover:bg-fs-accent/10 hover:text-fs-accent"
                >
                  <MdEdit className="h-5 w-5" aria-hidden />
                </button>
              ) : null}
              <button
                type="button"
                onClick={onClose}
                aria-label="Fermer"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-black/8 text-neutral-700"
              >
                <MdClose className="h-5 w-5" aria-hidden />
              </button>
            </div>
          </div>

          {/* Corps */}
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {detailQ.isLoading || !detail ? (
              <div className="flex justify-center py-16">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" />
              </div>
            ) : editing && client && engine && warranty && accessories ? (
              // ─── ÉDITION ───
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <p className="mb-2 text-xs font-bold uppercase text-fs-accent">Client</p>
                  <div className="grid grid-cols-1 gap-2">
                    <input className={input} placeholder="Nom / Structure" value={client.name} onChange={(e) => setClient({ ...client, name: e.target.value })} />
                    <select className={input} value={client.civility ?? ""} onChange={(e) => setClient({ ...client, civility: e.target.value })}>
                      <option value="">Civilité —</option>
                      <option value="M.">M. (Monsieur)</option>
                      <option value="Mme">Mme (Madame)</option>
                      <option value="Mlle">Mlle (Mademoiselle)</option>
                    </select>
                    <input className={input} placeholder="Profession" value={client.profession ?? ""} onChange={(e) => setClient({ ...client, profession: e.target.value })} />
                    <select className={input} value={client.idType ?? ""} onChange={(e) => setClient({ ...client, idType: e.target.value })}>
                      <option value="">Type de pièce —</option>
                      <option value="CNIB">CNIB</option>
                      <option value="Passeport">Passeport</option>
                      <option value="Autre">Autre</option>
                    </select>
                    <input className={input} placeholder="N° de pièce" value={client.idNumber ?? ""} onChange={(e) => setClient({ ...client, idNumber: e.target.value })} />
                    <input className={input} placeholder="Adresse" value={client.address ?? ""} onChange={(e) => setClient({ ...client, address: e.target.value })} />
                    <input className={input} placeholder="Téléphone" value={client.phone1 ?? ""} onChange={(e) => setClient({ ...client, phone1: e.target.value })} />
                    <input className={input} placeholder="E-mail" value={client.email ?? ""} onChange={(e) => setClient({ ...client, email: e.target.value })} />
                  </div>
                </div>
                <div>
                  <p className="mb-2 text-xs font-bold uppercase text-fs-accent">Engin</p>
                  <div className="grid grid-cols-1 gap-2">
                    <select className={input} value={engine.wheels ?? ""} onChange={(e) => setEngine({ ...engine, wheels: e.target.value === "" ? null : (Number(e.target.value) as EngineWheels) })}>
                      <option value="">Type d&apos;engin —</option>
                      <option value="2">2 roues</option>
                      <option value="3">3 roues</option>
                    </select>
                    <select className={input} value={engine.condition ?? ""} onChange={(e) => setEngine({ ...engine, condition: e.target.value === "" ? null : (e.target.value as EngineCondition) })}>
                      <option value="">État —</option>
                      <option value="neuf">Neuf</option>
                      <option value="occasion">Occasion</option>
                    </select>
                    <input className={input} placeholder="Marque" value={engine.brand ?? ""} onChange={(e) => setEngine({ ...engine, brand: e.target.value })} />
                    <input className={input} placeholder="Modèle" value={engine.model ?? ""} onChange={(e) => setEngine({ ...engine, model: e.target.value })} />
                    <input className={input} placeholder="Désignation" value={engine.designation ?? ""} onChange={(e) => setEngine({ ...engine, designation: e.target.value })} />
                    <input className={input} placeholder="N° châssis" value={engine.chassis ?? ""} onChange={(e) => setEngine({ ...engine, chassis: e.target.value })} />
                    <input className={input} placeholder="N° moteur" value={engine.motor ?? ""} onChange={(e) => setEngine({ ...engine, motor: e.target.value })} />
                    <input className={input} placeholder="Couleur" value={engine.color ?? ""} onChange={(e) => setEngine({ ...engine, color: e.target.value })} />
                  </div>
                </div>
                <div>
                  <p className="mb-2 text-xs font-bold uppercase text-fs-accent">Garantie</p>
                  <label className="mb-2 flex items-center gap-2 text-sm">
                    <input type="checkbox" className="h-4 w-4 accent-fs-accent" checked={warranty.enabled} onChange={(e) => setWarranty({ ...warranty, enabled: e.target.checked })} />
                    Garantie éventuelle
                  </label>
                  {warranty.enabled ? (
                    <div className="grid grid-cols-1 gap-2">
                      <input className={input} placeholder="Durée" value={warranty.duration ?? ""} onChange={(e) => setWarranty({ ...warranty, duration: e.target.value })} />
                      <input className={input} placeholder="Kilométrage limite" value={warranty.kmLimit ?? ""} onChange={(e) => setWarranty({ ...warranty, kmLimit: e.target.value })} />
                      <input className={input} placeholder="Éléments couverts" value={warranty.covered ?? ""} onChange={(e) => setWarranty({ ...warranty, covered: e.target.value })} />
                      <input className={input} placeholder="Conditions" value={warranty.conditions ?? ""} onChange={(e) => setWarranty({ ...warranty, conditions: e.target.value })} />
                    </div>
                  ) : null}
                </div>
                <div>
                  <p className="mb-2 text-xs font-bold uppercase text-fs-accent">Accessoires & divers</p>
                  <div className="grid grid-cols-1 gap-1">
                    {([
                      ["Casque", "helmet"],
                      ["Kit d'outils", "toolkit"],
                      ["Manuel", "manual"],
                      ["Clés", "keys"],
                      ["Gilet", "vest"],
                    ] as const).map(([label, key]) => (
                      <label key={key} className="flex items-center gap-2 text-sm">
                        <input type="checkbox" className="h-4 w-4 accent-fs-accent" checked={accessories[key]} onChange={(e) => setAccessories({ ...accessories, [key]: e.target.checked })} />
                        {label}
                      </label>
                    ))}
                    <input className={cn(input, "mt-1")} placeholder="Autre accessoire" value={accessories.other ?? ""} onChange={(e) => setAccessories({ ...accessories, other: e.target.value })} />
                    <input className={cn(input, "mt-1")} placeholder="Référence interne" value={internalReference} onChange={(e) => setInternalReference(e.target.value)} />
                    <textarea className={cn(input, "mt-1 min-h-[64px]")} placeholder="Observations" value={observations} onChange={(e) => setObservations(e.target.value)} />
                  </div>
                </div>
              </div>
            ) : (
              // ─── LECTURE ───
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <div>
                  <p className="mb-1 text-xs font-bold uppercase text-fs-accent">Client</p>
                  <RowText label="Nom / Structure" value={detail.client.name} />
                  <RowText label="Civilité" value={detail.client.civility} />
                  <RowText label="Profession" value={detail.client.profession} />
                  <RowText label="Type de pièce" value={detail.client.idType} />
                  <RowText label="N° de pièce" value={detail.client.idNumber} />
                  <RowText label="Adresse" value={detail.client.address} />
                  <RowText label="Téléphone" value={detail.client.phone1} />
                  <RowText label="E-mail" value={detail.client.email} />
                </div>
                <div>
                  <p className="mb-1 text-xs font-bold uppercase text-fs-accent">Engin</p>
                  <RowText label="Type" value={wheelsLabel(detail.engine.wheels)} />
                  <RowText label="Marque" value={detail.engine.brand} />
                  <RowText label="Modèle" value={detail.engine.model} />
                  <RowText label="Désignation" value={detail.engine.designation} />
                  <RowText label="N° châssis" value={detail.engine.chassis} />
                  <RowText label="N° moteur" value={detail.engine.motor} />
                  <RowText label="Couleur" value={detail.engine.color} />
                  <RowText label="État" value={conditionLabel(detail.engine.condition)} />

                  <p className="mb-1 mt-4 text-xs font-bold uppercase text-fs-accent">Montant</p>
                  <RowText label="Total" value={formatCurrency(detail.total)} />
                  <RowText label="En lettres" value={detail.amountInWords} />

                  <p className="mb-1 mt-4 text-xs font-bold uppercase text-fs-accent">Garantie & accessoires</p>
                  <RowText label="Garantie" value={detail.warranty.enabled ? "Oui" : "Non"} />
                  <RowText
                    label="Accessoires"
                    value={
                      [
                        detail.accessories.helmet && "Casque",
                        detail.accessories.toolkit && "Kit",
                        detail.accessories.manual && "Manuel",
                        detail.accessories.keys && "Clés",
                        detail.accessories.vest && "Gilet",
                        detail.accessories.other,
                      ]
                        .filter(Boolean)
                        .join(", ") || null
                    }
                  />
                  <RowText label="Référence interne" value={detail.internalReference} />
                  <RowText label="Observations" value={detail.observations} />
                </div>

                {/* Paiement — pleine largeur */}
                <div className="sm:col-span-2">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-xs font-bold uppercase text-fs-accent">Paiement</p>
                    <div className="flex items-center gap-2">
                      {!isCancelled && remaining > 0 && canEdit ? (
                        <button
                          type="button"
                          onClick={() => setCollecting(true)}
                          className="inline-flex h-8 items-center gap-1 rounded-lg bg-emerald-600 px-2.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-700"
                        >
                          <MdPayments className="h-4 w-4" aria-hidden />
                          Encaisser
                        </button>
                      ) : null}
                      {!isCancelled ? (
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold",
                            payStatusCfg.cls,
                          )}
                        >
                          {payStatusCfg.label}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-lg bg-fs-surface-container/60 px-3 py-2">
                      <p className="text-[11px] font-medium text-neutral-500">Total</p>
                      <p className="text-sm font-bold text-fs-text">{formatCurrency(detail.total)}</p>
                    </div>
                    <div className="rounded-lg bg-fs-surface-container/60 px-3 py-2">
                      <p className="text-[11px] font-medium text-neutral-500">Payé</p>
                      <p className="text-sm font-bold text-emerald-700">{formatCurrency(amountPaid)}</p>
                    </div>
                    <div className="rounded-lg bg-fs-surface-container/60 px-3 py-2">
                      <p className="text-[11px] font-medium text-neutral-500">Reste</p>
                      <p
                        className={cn(
                          "text-sm font-bold",
                          remaining > 0 ? "text-amber-700" : "text-neutral-500",
                        )}
                      >
                        {formatCurrency(remaining)}
                      </p>
                    </div>
                  </div>

                  {payments.length > 0 ? (
                    <div className="mt-3 overflow-hidden rounded-lg border border-black/6">
                      <table className="w-full border-collapse text-left text-sm">
                        <thead>
                          <tr className="border-b border-black/6 bg-fs-surface-container/60 text-xs text-neutral-600">
                            <th className="px-3 py-2 font-semibold">Date</th>
                            <th className="px-3 py-2 font-semibold">Mode</th>
                            <th className="px-3 py-2 font-semibold">Référence</th>
                            <th className="px-3 py-2 text-right font-semibold">Montant</th>
                          </tr>
                        </thead>
                        <tbody>
                          {payments.map((p) => (
                            <tr key={p.id} className="border-b border-black/4 last:border-0">
                              <td className="whitespace-nowrap px-3 py-2 text-neutral-700">
                                {p.createdAt ? formatPaymentDate(p.createdAt) : "—"}
                              </td>
                              <td className="px-3 py-2">{paymentMethodLabel(p.method)}</td>
                              <td className="max-w-[160px] truncate px-3 py-2 text-neutral-600">
                                {p.reference || "—"}
                              </td>
                              <td className="whitespace-nowrap px-3 py-2 text-right font-semibold text-fs-text">
                                {formatCurrency(p.amount)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="mt-3 rounded-lg bg-fs-surface-container/40 px-3 py-2.5 text-sm text-neutral-500">
                      Aucun règlement enregistré.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Pied (édition) */}
          {editing ? (
            <div className="flex justify-end gap-2 border-t border-black/6 p-3">
              <button
                type="button"
                onClick={() => setEditing(false)}
                disabled={saveMut.isPending}
                className="rounded-[10px] px-4 py-2.5 text-sm font-semibold text-fs-accent"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => saveMut.mutate()}
                disabled={saveMut.isPending || !(client?.name.trim())}
                className="inline-flex min-h-[44px] min-w-[140px] items-center justify-center rounded-[10px] bg-fs-accent px-4 text-sm font-semibold text-white disabled:opacity-50"
              >
                {saveMut.isPending ? (
                  <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  "Enregistrer"
                )}
              </button>
            </div>
          ) : null}
        </div>
      </FsCard>

      <EngineCollectPaymentDialog
        target={
          detail
            ? {
                saleId: detail.saleId,
                saleNumber: detail.saleNumber,
                total: detail.total,
                remaining,
              }
            : null
        }
        open={collecting && detail != null}
        onClose={() => setCollecting(false)}
        onPaid={async () => {
          await qc.invalidateQueries({ queryKey: ["engine-sale-detail", saleId] });
          await qc.invalidateQueries({
            queryKey: queryKeys.engineSales({ companyId, storeId: currentStoreFilterId }),
          });
        }}
      />
    </div>
  );
}

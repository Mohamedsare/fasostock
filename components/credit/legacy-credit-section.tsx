"use client";

import { CustomerFormDialog, type CustomerFormValue } from "@/components/customers/customer-form-dialog";
import { CreditRepaymentReceiptDialog } from "@/components/credit/credit-repayment-receipt-dialog";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { FsCard, fsInputClass } from "@/components/ui/fs-screen-primitives";
import { createCustomer, listCustomers } from "@/lib/features/customers/api";
import { appendLegacyCreditPayment, createLegacyCredit, listLegacyCredits } from "@/lib/features/credit/legacy-api";
import type { CreditRepaymentReceiptData } from "@/lib/features/credit/credit-repayment-receipt-types";
import type { LegacyCreditRow } from "@/lib/features/credit/types";
import { listStores } from "@/lib/features/stores/api";
import { paymentMethodLabel } from "@/lib/features/receipt/build-receipt-ticket-data";
import { queryKeys } from "@/lib/query/query-keys";
import { messageFromUnknownError, toast } from "@/lib/toast";
import { cn } from "@/lib/utils/cn";
import { formatCurrency } from "@/lib/utils/currency";

const EPS = 0.005;

/** Formulaires tactile : 48px mini, texte 16px (évite le zoom iOS au focus). */
function mobileFieldClass(...extra: (string | false | undefined)[]) {
  return cn(
    fsInputClass("w-full"),
    "min-h-12 touch-manipulation text-base sm:min-h-11 sm:text-sm",
    ...extra,
  );
}

function mobileLabelClass() {
  return "mb-1.5 block text-sm font-medium text-neutral-700 sm:mb-1 sm:text-xs";
}

function sumPaid(credit: LegacyCreditRow): number {
  return (credit.payments ?? []).reduce((s, p) => s + Number(p.amount ?? 0), 0);
}

function remaining(credit: LegacyCreditRow): number {
  return Math.max(0, Number(credit.principal_amount) - sumPaid(credit));
}

function overdueDays(credit: LegacyCreditRow): number {
  if (!credit.due_at || remaining(credit) <= EPS) return 0;
  const due = new Date(credit.due_at);
  if (Number.isNaN(due.getTime())) return 0;
  const now = new Date();
  const d = Math.floor((Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - Date.UTC(due.getFullYear(), due.getMonth(), due.getDate())) / 86400000);
  return d > 0 ? d : 0;
}

function statusLabel(credit: LegacyCreditRow): string {
  const rem = remaining(credit);
  if (rem <= EPS) return "Soldé";
  const paid = sumPaid(credit);
  if (overdueDays(credit) > 0) return "En retard";
  if (paid <= EPS) return "Non payé";
  return "Partiel";
}

function buildCreditRepaymentReceiptData(params: {
  credit: LegacyCreditRow;
  amountPaid: number;
  method: "cash" | "mobile_money" | "card" | "transfer";
  reference?: string | null;
  paymentId?: string | null;
  issuedAt?: Date;
  receiptNumber?: string;
  previousBalanceOverride?: number;
  store?: {
    id: string;
    company_id: string;
    name: string;
    currency?: string | null;
    logo_url?: string | null;
    address?: string | null;
    phone?: string | null;
  } | null;
}): CreditRepaymentReceiptData {
  const now = params.issuedAt ?? new Date();
  const fallbackReceiptNo = `RC-${format(now, "yyMMdd-HHmmss")}-${Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, "0")}`;
  const previousBalance =
    params.previousBalanceOverride ?? remaining(params.credit);
  const newBalance = Math.max(0, previousBalance - Math.max(0, params.amountPaid));
  return {
    companyId: params.store?.company_id ?? params.credit.company_id,
    storeId: params.store?.id ?? params.credit.store_id,
    customerId: params.credit.customer_id,
    creditId: params.credit.id,
    paymentId: params.paymentId ?? null,
    receiptNumber: params.receiptNumber ?? fallbackReceiptNo,
    issuedAt: now,
    storeName: params.store?.name ?? params.credit.store?.name ?? "Boutique",
    storeLogoUrl: params.store?.logo_url ?? null,
    storeAddress: params.store?.address ?? null,
    storePhone: params.store?.phone ?? null,
    customerName: params.credit.customer?.name ?? "Client",
    customerPhone: params.credit.customer?.phone ?? null,
    creditTitle: params.credit.title ?? "Crédit libre",
    paymentMethodLabel: paymentMethodLabel(params.method),
    paymentMethodCode: params.method,
    paymentReference: params.reference ?? null,
    amountPaid: Math.max(0, params.amountPaid),
    previousBalance,
    newBalance,
    currency: params.store?.currency?.trim() || "XOF",
    dueAt: params.credit.due_at ? new Date(params.credit.due_at) : null,
    note: params.credit.internal_note ?? null,
    settled: newBalance <= EPS,
  };
}

export function LegacyCreditSection({
  companyId,
  storeId,
  from,
  to,
  canRecordPayment,
  isOwner,
}: {
  companyId: string;
  storeId: string | null;
  from: string;
  to: string;
  canRecordPayment: boolean;
  isOwner: boolean;
}) {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [payFor, setPayFor] = useState<LegacyCreditRow | null>(null);
  const [historyFor, setHistoryFor] = useState<LegacyCreditRow | null>(null);
  const [receiptData, setReceiptData] = useState<CreditRepaymentReceiptData | null>(null);

  const params = useMemo(
    () => ({ companyId, storeId, from: from ? `${from}T00:00:00.000Z` : "", to }),
    [companyId, storeId, from, to],
  );

  const q = useQuery({
    queryKey: queryKeys.legacyCredits(params),
    queryFn: () => listLegacyCredits(params),
    enabled: !!companyId,
    staleTime: 15_000,
  });
  const storesQ = useQuery({
    queryKey: queryKeys.stores(companyId),
    queryFn: () => listStores(companyId),
    enabled: !!companyId,
    staleTime: 60_000,
  });

  const openRows = useMemo(() => (q.data ?? []).filter((r) => remaining(r) > EPS), [q.data]);
  const totalOpen = useMemo(() => openRows.reduce((s, r) => s + remaining(r), 0), [openRows]);

  const createMut = useMutation({
    mutationFn: createLegacyCredit,
    onSuccess: async () => {
      toast.success("Crédit libre enregistré.");
      setCreateOpen(false);
      await qc.invalidateQueries({ queryKey: ["legacy-credits"] });
    },
    onError: (e) => toast.error(messageFromUnknownError(e)),
  });

  const payMut = useMutation({
    mutationFn: appendLegacyCreditPayment,
    onSuccess: async (_data, vars) => {
      if (payFor) {
        const store = (storesQ.data ?? []).find((s) => s.id === payFor.store_id) ?? null;
        setReceiptData(
          buildCreditRepaymentReceiptData({
            credit: payFor,
            amountPaid: vars.amount,
            method: vars.method,
            reference: vars.reference ?? null,
            store,
          }),
        );
      }
      toast.success("Paiement enregistré.");
      setPayFor(null);
      await qc.invalidateQueries({ queryKey: ["legacy-credits"] });
    },
    onError: (e) => toast.error(messageFromUnknownError(e)),
  });

  return (
    <>
      <FsCard className="mt-6" padding="p-4">
        <div className="mb-3 flex flex-col gap-3 min-[420px]:flex-row min-[420px]:items-start min-[420px]:justify-between min-[420px]:gap-2">
          <div className="min-w-0">
            <p className="text-base font-bold text-fs-text sm:text-sm">Crédit libre (anciens soldes)</p>
            <p className="mt-0.5 text-sm text-neutral-500 sm:text-xs">
              Encours hors ventes FasoStock, rattaché à un client.
            </p>
          </div>
          {isOwner ? (
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="touch-manipulation shrink-0 rounded-xl bg-fs-accent px-4 py-3 text-sm font-bold text-white active:opacity-95 sm:rounded-lg sm:px-3 sm:py-2 sm:text-xs"
            >
              + Nouveau
            </button>
          ) : null}
        </div>
        <div className="mb-3 rounded-xl bg-fs-surface-container px-3 py-2 text-xs">
          Reste total crédit libre: <span className="font-bold text-fs-accent">{formatCurrency(totalOpen)}</span>
        </div>
        {q.isLoading ? (
          <div className="py-5 text-center text-sm text-neutral-500">Chargement…</div>
        ) : openRows.length === 0 ? (
          <div className="py-5 text-center text-sm text-neutral-500">Aucun crédit libre ouvert.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-left text-[13px]">
              <thead>
                <tr className="border-b border-black/10">
                  <th className="px-2 py-2">Client</th>
                  <th className="px-2 py-2">Libellé</th>
                  <th className="px-2 py-2">Boutique</th>
                  <th className="px-2 py-2 text-right">Montant</th>
                  <th className="px-2 py-2 text-right">Encaissé</th>
                  <th className="px-2 py-2 text-right">Reste</th>
                  <th className="px-2 py-2">Échéance</th>
                  <th className="px-2 py-2">Statut</th>
                  <th className="px-2 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {openRows.map((r) => (
                  <tr key={r.id} className="border-b border-black/6">
                    <td className="px-2 py-2">{r.customer?.name ?? "—"}</td>
                    <td className="max-w-[220px] truncate px-2 py-2" title={r.title}>
                      {r.title}
                    </td>
                    <td className="px-2 py-2">{r.store?.name ?? "—"}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{formatCurrency(r.principal_amount)}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-emerald-700">
                      {formatCurrency(sumPaid(r))}
                    </td>
                    <td className="px-2 py-2 text-right font-bold tabular-nums text-fs-accent">
                      {formatCurrency(remaining(r))}
                    </td>
                    <td className="px-2 py-2">
                      {r.due_at ? format(new Date(r.due_at), "dd/MM/yyyy", { locale: fr }) : "—"}
                    </td>
                    <td className="px-2 py-2">
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[11px] font-bold",
                          overdueDays(r) > 0
                            ? "bg-red-500/15 text-red-700"
                            : "bg-amber-500/15 text-amber-800",
                        )}
                      >
                        {statusLabel(r)}
                        {overdueDays(r) > 0 ? ` (+${overdueDays(r)}j)` : ""}
                      </span>
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setHistoryFor(r)}
                          className="touch-manipulation rounded-lg border border-black/10 bg-fs-surface-container px-3 py-2.5 text-xs font-bold text-neutral-800 active:opacity-95 dark:border-white/15 dark:text-neutral-100 sm:py-1"
                        >
                          Paiements
                        </button>
                        {canRecordPayment ? (
                          <button
                            type="button"
                            onClick={() => setPayFor(r)}
                            className="touch-manipulation rounded-lg bg-fs-accent px-3 py-2.5 text-xs font-bold text-white active:opacity-95 sm:py-1"
                          >
                            Encaisser
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </FsCard>

      <LegacyCreateDialog
        open={createOpen}
        companyId={companyId}
        storeId={storeId}
        busy={createMut.isPending}
        onClose={() => setCreateOpen(false)}
        onSubmit={(v) => createMut.mutate(v)}
      />

      <LegacyPayDialog
        open={!!payFor}
        credit={payFor}
        busy={payMut.isPending}
        onClose={() => setPayFor(null)}
        onSubmit={(v) => payMut.mutate(v)}
      />

      <LegacyPaymentsHistoryDialog
        open={!!historyFor}
        credit={historyFor}
        stores={storesQ.data ?? []}
        onClose={() => setHistoryFor(null)}
        onReprint={(d) => {
          setHistoryFor(null);
          setReceiptData(d);
        }}
      />

      {receiptData ? (
        <CreditRepaymentReceiptDialog
          data={receiptData}
          onClose={() => setReceiptData(null)}
        />
      ) : null}
    </>
  );
}

function LegacyCreateDialog({
  open,
  busy,
  companyId,
  storeId,
  onClose,
  onSubmit,
}: {
  open: boolean;
  busy: boolean;
  companyId: string;
  storeId: string | null;
  onClose: () => void;
  onSubmit: (p: {
    companyId: string;
    storeId: string;
    customerId: string;
    title: string;
    amount: number;
    dueAt: string | null;
    internalNote?: string | null;
  }) => void;
}) {
  const qc = useQueryClient();
  const comboRef = useRef<HTMLDivElement | null>(null);
  const invalidAmountToastAt = useRef(0);

  const customersQ = useQuery({
    queryKey: queryKeys.customers(companyId),
    queryFn: () => listCustomers(companyId),
    enabled: open && !!companyId,
    staleTime: 60_000,
  });

  const [customerId, setCustomerId] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [listboxOpen, setListboxOpen] = useState(false);
  const [quickCreateBusy, setQuickCreateBusy] = useState(false);
  const [fullClientOpen, setFullClientOpen] = useState(false);

  const [title, setTitle] = useState("Crédit libre");
  const [amount, setAmount] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!open) return;
    setCustomerId("");
    setCustomerSearch("");
    setListboxOpen(false);
    setQuickCreateBusy(false);
    setFullClientOpen(false);
    setTitle("Crédit libre");
    setAmount("");
    setDueAt("");
    setNote("");
  }, [open]);

  useEffect(() => {
    if (!listboxOpen) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const el = comboRef.current;
      if (el && !el.contains(e.target as Node)) setListboxOpen(false);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [listboxOpen]);

  const warnNonNumericAmount = () => {
    const now = Date.now();
    if (now - invalidAmountToastAt.current < 750) return;
    invalidAmountToastAt.current = now;
    toast.info(
      "Saisissez uniquement des chiffres (espaces autorisés ; une virgule ou un point pour les décimales).",
    );
  };

  const onAmountChange = (raw: string) => {
    const cleaned = raw.replace(/[^\d.,\s]/g, "");
    if (cleaned !== raw) warnNonNumericAmount();
    setAmount(cleaned);
  };

  const q = customerSearch.trim().toLowerCase();
  const digits = customerSearch.replace(/\s/g, "");
  const filtered = useMemo(() => {
    const list = customersQ.data ?? [];
    if (!q) return list.slice(0, 12);
    return list
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.phone ?? "").replace(/\s/g, "").includes(digits) ||
          (c.email ?? "").toLowerCase().includes(q),
      )
      .slice(0, 12);
  }, [customersQ.data, customerSearch, q, digits]);

  const customers = customersQ.data ?? [];
  const selectedCustomer = customerId ? customers.find((c) => c.id === customerId) : undefined;
  const searchTrim = customerSearch.trim();
  const exactNameExists = searchTrim.length >= 2 && customers.some((c) => c.name.trim().toLowerCase() === searchTrim.toLowerCase());
  const showQuickCreate =
    searchTrim.length >= 2 && !exactNameExists && !customerId;

  async function quickCreateFromSearch() {
    const name = searchTrim;
    if (name.length < 2) return;
    setQuickCreateBusy(true);
    try {
      const id = await createCustomer(companyId, { name, type: "individual" });
      if (!id) {
        toast.error("Connexion requise pour créer un client.");
        return;
      }
      await qc.invalidateQueries({ queryKey: queryKeys.customers(companyId) });
      setCustomerId(id);
      setCustomerSearch(name);
      setListboxOpen(false);
      toast.success("Client créé et sélectionné.");
    } catch (e) {
      toast.error(messageFromUnknownError(e, "Impossible de créer le client."));
    } finally {
      setQuickCreateBusy(false);
    }
  }

  async function onFullClientSubmit(v: CustomerFormValue) {
    const id = await createCustomer(companyId, {
      name: v.name.trim(),
      type: v.type,
      phone: v.phone.trim() || null,
      email: v.email.trim() || null,
      address: v.address.trim() || null,
      notes: v.notes.trim() || null,
    });
    if (!id) {
      toast.error("Connexion requise pour créer un client.");
      throw new Error("Connexion requise");
    }
    await qc.invalidateQueries({ queryKey: queryKeys.customers(companyId) });
    setCustomerId(id);
    setCustomerSearch(v.name.trim());
    setListboxOpen(false);
    setFullClientOpen(false);
    toast.success("Client créé et sélectionné.");
  }

  if (!open) return null;
  const parsedAmount = Math.max(0, parseFloat(amount.replace(/\s/g, "").replace(",", ".")) || 0);
  const canSubmit = !!storeId && !!customerId && parsedAmount > 0;

  return (
    <>
      <div className="fixed inset-0 z-82 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:bg-black/45 sm:p-4">
        <button
          type="button"
          className="absolute inset-0 touch-manipulation"
          onClick={onClose}
          aria-label="Fermer"
        />
        <div
          className="relative z-10 flex max-h-[min(92dvh,900px)] w-full max-w-lg flex-col overflow-hidden rounded-t-[1.35rem] border border-black/10 bg-fs-card shadow-2xl sm:max-h-[min(88vh,820px)] sm:rounded-2xl dark:border-white/10"
          role="dialog"
          aria-modal="true"
          aria-labelledby="legacy-credit-create-title"
        >
          <div className="shrink-0 px-4 pt-3 sm:px-5 sm:pt-4">
            <div className="mx-auto mb-3 h-1.5 w-12 shrink-0 rounded-full bg-neutral-400/60 sm:hidden" aria-hidden />
            <h3 id="legacy-credit-create-title" className="text-lg font-bold tracking-tight text-fs-text sm:text-base">
              Nouveau crédit libre
            </h3>
            <p className="mt-1 text-sm leading-snug text-neutral-600 sm:text-xs">
              Réservé owner: dette ancienne client avant FasoStock.
            </p>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 pb-1 sm:px-5">
            <div className="space-y-4 pb-2 sm:space-y-3">
              <div>
                <label className={mobileLabelClass()}>Client</label>
                {selectedCustomer ? (
                  <div className="flex flex-col gap-3 rounded-xl border border-black/10 bg-fs-surface-container p-3 dark:border-white/10 sm:flex-row sm:items-center sm:gap-2 sm:p-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-base font-semibold text-fs-text sm:text-sm">{selectedCustomer.name}</p>
                      {selectedCustomer.phone ? (
                        <p className="mt-0.5 text-sm text-neutral-600 sm:hidden">{selectedCustomer.phone}</p>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2 sm:shrink-0">
                      {selectedCustomer.phone ? (
                        <span className="hidden text-xs text-neutral-500 sm:inline">{selectedCustomer.phone}</span>
                      ) : null}
                      <button
                        type="button"
                        className="touch-manipulation w-full rounded-xl bg-fs-accent/15 px-4 py-3 text-sm font-bold text-fs-accent active:opacity-90 sm:w-auto sm:px-3 sm:py-2 sm:text-xs"
                        onClick={() => {
                          setCustomerId("");
                          setCustomerSearch("");
                          setListboxOpen(true);
                        }}
                      >
                        Changer
                      </button>
                    </div>
                  </div>
                ) : (
                  <div ref={comboRef} className="relative">
                    <input
                      className={mobileFieldClass()}
                      value={customerSearch}
                      onChange={(e) => {
                        setCustomerSearch(e.target.value);
                        setListboxOpen(true);
                      }}
                      onFocus={() => setListboxOpen(true)}
                      placeholder="Nom ou téléphone…"
                      autoComplete="off"
                      aria-autocomplete="list"
                      aria-expanded={listboxOpen}
                    />
                    {listboxOpen ? (
                      <div className="absolute left-0 right-0 z-20 mt-1 max-h-[min(42dvh,320px)] overflow-auto rounded-xl border border-black/10 bg-fs-card py-1 shadow-xl sm:max-h-60 dark:border-white/10">
                        {filtered.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            className="flex min-h-12 w-full flex-col items-start justify-center gap-0.5 px-4 py-3 text-left text-base active:bg-black/6 sm:min-h-0 sm:px-3 sm:py-2.5 sm:text-sm dark:active:bg-white/8"
                            onClick={() => {
                              setCustomerId(c.id);
                              setCustomerSearch(c.name);
                              setListboxOpen(false);
                            }}
                          >
                            <span className="font-semibold text-fs-text">{c.name}</span>
                            {c.phone ? <span className="text-sm text-neutral-500 sm:text-xs">{c.phone}</span> : null}
                          </button>
                        ))}
                        {showQuickCreate ? (
                          <div className="space-y-2 border-t border-black/8 p-3 dark:border-white/10">
                            <p className="text-sm text-neutral-600 sm:text-[11px]">Aucune correspondance exacte.</p>
                            <button
                              type="button"
                              disabled={quickCreateBusy}
                              onClick={() => void quickCreateFromSearch()}
                              className="touch-manipulation w-full rounded-xl bg-fs-accent py-3.5 text-base font-bold text-white disabled:opacity-50 sm:py-2.5 sm:text-sm"
                            >
                              {quickCreateBusy ? "…" : `Créer « ${searchTrim} » et sélectionner`}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setFullClientOpen(true);
                                setListboxOpen(false);
                              }}
                              className="touch-manipulation w-full rounded-xl border border-black/10 py-3.5 text-base font-semibold sm:py-2 sm:text-xs dark:border-white/15"
                            >
                              Fiche complète (email, adresse…)
                            </button>
                          </div>
                        ) : searchTrim.length > 0 && searchTrim.length < 2 ? (
                          <p className="border-t border-black/8 px-4 py-3 text-sm text-neutral-500 sm:px-3 sm:py-2 sm:text-[11px] dark:border-white/10">
                            Saisissez au moins 2 caractères pour créer un nouveau client.
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                )}
              </div>

              <div>
                <label className={mobileLabelClass()}>Libellé</label>
                <input
                  className={mobileFieldClass()}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Crédit libre"
                />
              </div>
              <div>
                <label className={mobileLabelClass()}>Montant</label>
                <input
                  className={mobileFieldClass()}
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => onAmountChange(e.target.value)}
                  placeholder="Ex. 150 000 ou 150000,50"
                />
              </div>
              <div>
                <label className={mobileLabelClass()}>Échéance (optionnel)</label>
                <input
                  className={mobileFieldClass()}
                  type="date"
                  value={dueAt}
                  onChange={(e) => setDueAt(e.target.value)}
                />
              </div>
              <div>
                <label className={mobileLabelClass()}>Note interne (optionnel)</label>
                <textarea
                  className={mobileFieldClass("min-h-22 resize-y sm:min-h-18")}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Relance, contexte…"
                />
              </div>
            </div>
          </div>

          {!storeId ? (
            <p className="shrink-0 px-4 pb-1 text-sm text-red-600 sm:px-5 sm:text-xs">
              Sélectionnez une boutique pour créer un crédit libre.
            </p>
          ) : null}

          <div className="shrink-0 border-t border-black/10 bg-fs-card px-4 py-3 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-4px_20px_rgba(0,0,0,0.06)] sm:px-5 dark:border-white/10">
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:gap-2">
              <button
                type="button"
                onClick={onClose}
                className="touch-manipulation min-h-12 w-full rounded-xl border border-black/10 py-3 text-base font-semibold active:bg-black/4 sm:flex-1 sm:py-2 sm:text-sm dark:border-white/15 dark:active:bg-white/6"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={busy || !canSubmit}
                onClick={() =>
                  onSubmit({
                    companyId,
                    storeId: storeId!,
                    customerId,
                    title: title.trim() || "Crédit libre",
                    amount: parsedAmount,
                    dueAt: dueAt ? new Date(`${dueAt}T12:00:00`).toISOString() : null,
                    internalNote: note.trim() || null,
                  })
                }
                className="touch-manipulation min-h-12 w-full rounded-xl bg-fs-accent py-3 text-base font-bold text-white active:opacity-95 disabled:opacity-50 sm:flex-1 sm:py-2 sm:text-sm"
              >
                {busy ? "…" : "Enregistrer"}
              </button>
            </div>
          </div>
        </div>
      </div>

      <CustomerFormDialog
        open={fullClientOpen}
        variant="create"
        overlayClassName="z-[96]"
        initialValue={{
          name: searchTrim.length >= 2 ? searchTrim : "",
          type: "individual",
          phone: "",
          email: "",
          address: "",
          notes: "",
        }}
        onClose={() => setFullClientOpen(false)}
        onSubmit={onFullClientSubmit}
      />
    </>
  );
}

function LegacyPaymentsHistoryDialog({
  open,
  credit,
  stores,
  onClose,
  onReprint,
}: {
  open: boolean;
  credit: LegacyCreditRow | null;
  stores: Array<{
    id: string;
    company_id: string;
    name: string;
    currency: string | null;
    logo_url: string | null;
    address: string | null;
    phone: string | null;
  }>;
  onClose: () => void;
  onReprint: (data: CreditRepaymentReceiptData) => void;
}) {
  if (!open || !credit) return null;
  const store = stores.find((s) => s.id === credit.store_id) ?? null;
  const ordered = (credit.payments ?? [])
    .slice()
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  return (
    <div className="fixed inset-0 z-84 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:bg-black/45 sm:p-4">
      <button type="button" className="absolute inset-0 touch-manipulation" onClick={onClose} aria-label="Fermer" />
      <div
        className="relative z-10 flex max-h-[min(88dvh,700px)] w-full max-w-2xl flex-col overflow-hidden rounded-t-[1.35rem] border border-black/10 bg-fs-card shadow-2xl sm:max-h-[85vh] sm:rounded-2xl dark:border-white/10"
        role="dialog"
        aria-modal="true"
        aria-labelledby="legacy-credit-history-title"
      >
        <div className="shrink-0 border-b border-black/10 px-4 py-3 sm:px-5 dark:border-white/10">
          <h3 id="legacy-credit-history-title" className="text-lg font-bold text-fs-text sm:text-base">
            Historique des paiements
          </h3>
          <p className="mt-1 text-sm text-neutral-600 sm:text-xs">
            {credit.customer?.name ?? "Client"} — {credit.title}
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-5">
          {ordered.length === 0 ? (
            <p className="py-8 text-center text-sm text-neutral-500">
              Aucun paiement enregistré pour ce crédit.
            </p>
          ) : (
            <div className="space-y-2.5">
              {ordered.map((p, idx) => {
                const methodCode =
                  p.method === "cash" || p.method === "mobile_money" || p.method === "card" || p.method === "transfer"
                    ? p.method
                    : "cash";
                const previousBalance = Math.max(
                  0,
                  Number(credit.principal_amount) -
                    ordered
                      .slice(0, idx)
                      .reduce((s, x) => s + Number(x.amount ?? 0), 0),
                );
                const issuedAt = new Date(p.created_at);
                const receiptNo = `RC-${format(issuedAt, "yyMMdd-HHmmss")}-${String(p.id).slice(0, 6).toUpperCase()}`;
                return (
                  <div
                    key={p.id}
                    className="rounded-xl border border-black/10 bg-fs-surface-container p-3 dark:border-white/10"
                  >
                    <div className="flex flex-col gap-2 min-[560px]:flex-row min-[560px]:items-center min-[560px]:justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-fs-text">
                          {format(new Date(p.created_at), "dd/MM/yyyy HH:mm", { locale: fr })}
                        </p>
                        <p className="mt-0.5 text-xs text-neutral-600">
                          {paymentMethodLabel(p.method)}
                          {p.reference ? ` — ${p.reference}` : ""}
                        </p>
                        <p className="mt-1 text-xs text-neutral-500">
                          Reçu: {receiptNo}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-extrabold text-emerald-700 dark:text-emerald-300">
                          {formatCurrency(p.amount)}
                        </span>
                        <button
                          type="button"
                          className="touch-manipulation rounded-lg bg-fs-accent px-3 py-2 text-xs font-bold text-white active:opacity-95"
                          onClick={() =>
                            onReprint(
                              buildCreditRepaymentReceiptData({
                                credit,
                                amountPaid: Number(p.amount),
                                method: methodCode,
                                reference: p.reference ?? null,
                                paymentId: p.id,
                                issuedAt,
                                receiptNumber: receiptNo,
                                previousBalanceOverride: previousBalance,
                                store,
                              }),
                            )
                          }
                        >
                          Réimprimer
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-black/10 bg-fs-card px-4 py-3 sm:px-5 dark:border-white/10">
          <button
            type="button"
            onClick={onClose}
            className="touch-manipulation min-h-11 w-full rounded-xl border border-black/10 py-2 text-sm font-semibold dark:border-white/15"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}

function LegacyPayDialog({
  open,
  credit,
  busy,
  onClose,
  onSubmit,
}: {
  open: boolean;
  credit: LegacyCreditRow | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: (p: {
    creditId: string;
    method: "cash" | "mobile_money" | "card" | "transfer";
    amount: number;
    reference?: string | null;
  }) => void;
}) {
  const invalidAmountToastAt = useRef(0);
  type PaymentModeUi =
    | "cash"
    | "orange_money"
    | "moov_money"
    | "wave"
    | "card"
    | "transfer";
  const [method, setMethod] = useState<PaymentModeUi>("cash");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");

  useEffect(() => {
    if (!open || !credit) return;
    setAmount("");
    setReference("");
    setMethod("cash");
  }, [open, credit?.id]);

  const warnNonNumericAmount = () => {
    const now = Date.now();
    if (now - invalidAmountToastAt.current < 750) return;
    invalidAmountToastAt.current = now;
    toast.info(
      "Saisissez uniquement des chiffres (espaces autorisés ; une virgule ou un point pour les décimales).",
    );
  };

  const onAmountChange = (raw: string) => {
    const cleaned = raw.replace(/[^\d.,\s]/g, "");
    if (cleaned !== raw) warnNonNumericAmount();
    setAmount(cleaned);
  };

  if (!open || !credit) return null;
  const rem = remaining(credit);
  const parsedAmount = Math.max(0, parseFloat(amount.replace(/\s/g, "").replace(",", ".")) || 0);
  const canSubmit = parsedAmount > 0 && parsedAmount <= rem + 0.0001;
  const mobileProviderLabel =
    method === "orange_money"
      ? "Orange money"
      : method === "moov_money"
        ? "Moov money"
        : method === "wave"
          ? "Wave"
          : null;
  const backendMethod: "cash" | "mobile_money" | "card" | "transfer" =
    method === "orange_money" || method === "moov_money" || method === "wave"
      ? "mobile_money"
      : method;

  return (
    <div className="fixed inset-0 z-83 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:bg-black/45 sm:p-4">
      <button type="button" className="absolute inset-0 touch-manipulation" onClick={onClose} aria-label="Fermer" />
      <div
        className="relative z-10 flex max-h-[min(88dvh,640px)] w-full max-w-md flex-col overflow-hidden rounded-t-[1.35rem] border border-black/10 bg-fs-card shadow-2xl sm:max-h-[min(85vh,600px)] sm:rounded-2xl dark:border-white/10"
        role="dialog"
        aria-modal="true"
        aria-labelledby="legacy-credit-pay-title"
      >
        <div className="shrink-0 px-4 pt-3 sm:px-5 sm:pt-4">
          <div className="mx-auto mb-3 h-1.5 w-12 shrink-0 rounded-full bg-neutral-400/60 sm:hidden" aria-hidden />
          <h3 id="legacy-credit-pay-title" className="text-lg font-bold text-fs-text sm:text-base">
            Encaisser crédit libre
          </h3>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <p className="text-base leading-snug text-neutral-700 sm:text-sm">
              <span className="font-semibold text-fs-text">{credit.customer?.name ?? "Client"}</span>
            </p>
            <span
              className={cn(
                "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-extrabold",
                "border-[#F97316]/35 bg-[#FFEDD5] text-[#C2410C]",
                "dark:border-orange-400/40 dark:bg-orange-950/40 dark:text-orange-200",
              )}
            >
              Reste: {formatCurrency(rem)}
            </span>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 pb-2 sm:px-5">
          <div className="space-y-4 sm:space-y-3">
            <div>
              <label className={mobileLabelClass()}>Montant</label>
              <input
                className={mobileFieldClass()}
                inputMode="decimal"
                value={amount}
                onChange={(e) => onAmountChange(e.target.value)}
                placeholder="Montant"
              />
            </div>
            <div>
              <label className={mobileLabelClass()}>Mode de paiement</label>
              <select
                className={mobileFieldClass()}
                value={method}
                onChange={(e) => setMethod(e.target.value as typeof method)}
              >
                <option value="cash">Espèces</option>
                <option value="orange_money">Orange money</option>
                <option value="moov_money">Moov money</option>
                <option value="wave">Wave</option>
                <option value="card">Carte</option>
                <option value="transfer">Virement</option>
              </select>
            </div>
            <div>
              <label className={mobileLabelClass()}>Référence (optionnel)</label>
              <input
                className={mobileFieldClass()}
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="N° transaction, reçu…"
              />
            </div>
          </div>
        </div>

        <div className="shrink-0 border-t border-black/10 bg-fs-card px-4 py-3 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-4px_20px_rgba(0,0,0,0.06)] sm:px-5 dark:border-white/10">
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:gap-2">
            <button
              type="button"
              onClick={onClose}
              className="touch-manipulation min-h-12 w-full rounded-xl border border-black/10 py-3 text-base font-semibold active:bg-black/4 sm:flex-1 sm:py-2 sm:text-sm dark:border-white/15 dark:active:bg-white/6"
            >
              Annuler
            </button>
            <button
              type="button"
              disabled={busy || !canSubmit}
              onClick={() =>
                onSubmit({
                  creditId: credit.id,
                  method: backendMethod,
                  amount: parsedAmount,
                  reference: mobileProviderLabel
                    ? [mobileProviderLabel, reference.trim()].filter(Boolean).join(" — ")
                    : reference.trim() || null,
                })
              }
              className="touch-manipulation min-h-12 w-full rounded-xl bg-fs-accent py-3 text-base font-bold text-white active:opacity-95 disabled:opacity-50 sm:flex-1 sm:py-2 sm:text-sm"
            >
              {busy ? "…" : "Valider"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

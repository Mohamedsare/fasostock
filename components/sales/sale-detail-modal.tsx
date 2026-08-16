"use client";

import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { CreditQuickPayDialog } from "@/components/credit/credit-quick-pay-dialog";
import { InvoicePdfPreviewDialog } from "@/components/invoices/invoice-pdf-preview-dialog";
import { ReceiptTicketDialog } from "@/components/pos/receipt-ticket-dialog";
import { getSaleDetail } from "@/lib/features/sales/api";
import type { CreditSaleRow } from "@/lib/features/credit/types";
import { CREDIT_AMOUNT_EPS, paidTotal, remainingTotal } from "@/lib/features/credit/credit-math";
import type { SaleItem } from "@/lib/features/sales/types";
import { deliveryTooltip, saleDelivery } from "@/lib/features/sales/sale-delivery";
import { fetchSalePickupTrackingEnabled } from "@/lib/features/settings/sale-pickup-tracking";
import {
  fetchPrintFormatChoiceEnabled,
  peekPrintFormatChoiceEnabled,
} from "@/lib/features/settings/print-format-choice";
import { thermalWidthForStore } from "@/lib/features/print/print-sale-format";
import { buildReceiptTicketDataFromSale } from "@/lib/features/receipt/build-receipt-ticket-data";
import {
  paymentDisplay,
  salePaymentDisplays,
} from "@/lib/features/payments/payment-display";
import type { ReceiptTicketData } from "@/lib/features/receipt/receipt-ticket-types";
import { formatCurrency } from "@/lib/utils/currency";
import { formatDateTime } from "@/lib/utils/date";
import { cn } from "@/lib/utils/cn";
import { listStores } from "@/lib/features/stores/api";
import { useAppContext } from "@/lib/features/common/app-context";
import { queryKeys } from "@/lib/query/query-keys";
import { buildInvoiceA4FromSaleDetail } from "@/lib/features/invoices/build-invoice-a4-from-sale-detail";
import {
  downloadInvoicePdf,
  fetchLogoBytes,
  generateInvoicePdfBlob,
  printInvoicePdf,
} from "@/lib/features/invoices/generate-invoice-pdf";
import { messageFromUnknownError, toast } from "@/lib/toast";
import { P } from "@/lib/constants/permissions";
import { usePermissions } from "@/lib/features/permissions/use-permissions";
import {
  MdDownload,
  MdInventory2,
  MdListAlt,
  MdPictureAsPdf,
  MdPrint,
  MdReceiptLong,
  MdSend,
} from "react-icons/md";
import {
  buildDocumentMessage,
  documentFilename,
  shareDocument,
} from "@/lib/features/share/share-document";
import { formatCurrencyFlutter } from "@/lib/utils/currency";

function isA4Invoice(s: SaleItem): boolean {
  if (s.document_type === "a4_invoice") return true;
  if (s.document_type === "thermal_receipt") return false;
  if (s.sale_mode === "invoice_pos") return true;
  if (s.sale_mode === "quick_pos") return false;
  return false;
}

const STATUS_LABELS: Record<string, string> = {
  draft: "Brouillon",
  completed: "Complétée",
  cancelled: "Annulée",
  refunded: "Remboursée",
};

export function SaleDetailModal({
  saleId,
  onClose,
}: {
  saleId: string;
  onClose: () => void;
}) {
  const ctx = useAppContext();
  const companyId = ctx.data?.companyId ?? "";
  const companyName = ctx.data?.companyName ?? "";

  const [invoicePreviewBlob, setInvoicePreviewBlob] = useState<Blob | null>(
    null,
  );
  const [receiptDialog, setReceiptDialog] = useState<ReceiptTicketData | null>(
    null,
  );
  const [creditPayOpen, setCreditPayOpen] = useState(false);
  const { hasPermission } = usePermissions();
  const canRecordCreditPayment = hasPermission(P.salesUpdate);
  const [pdfBusy, setPdfBusy] = useState<
    null | "view" | "print" | "download" | "send"
  >(null);

  const q = useQuery({
    queryKey: ["sale-detail", saleId],
    queryFn: () => getSaleDetail(saleId),
    enabled: !!saleId,
  });

  const storesQ = useQuery({
    queryKey: queryKeys.stores(companyId),
    queryFn: () => listStores(companyId),
    enabled: !!companyId && !!q.data,
  });

  /** Réglage propriétaire : coupé, aucun rappel de retrait n'apparaît ici non plus. */
  const pickupTrackingQ = useQuery({
    queryKey: queryKeys.salePickupTrackingEnabled(companyId),
    queryFn: () => fetchSalePickupTrackingEnabled(companyId),
    enabled: !!companyId,
    staleTime: 60_000,
  });
  const pickupTrackingEnabled = pickupTrackingQ.data ?? false;

  /** Réglage propriétaire : réimprimer une vente dans l'autre format que sa caisse. */
  const printFormatChoiceQ = useQuery({
    queryKey: queryKeys.printFormatChoiceEnabled(companyId),
    queryFn: () => fetchPrintFormatChoiceEnabled(companyId),
    enabled: !!companyId,
    staleTime: 60_000,
    ...(peekPrintFormatChoiceEnabled(companyId) !== undefined
      ? { initialData: peekPrintFormatChoiceEnabled(companyId) }
      : {}),
  });
  const printFormatChoiceOn = printFormatChoiceQ.data === true;

  const sale = q.data;
  const creditSale = sale as CreditSaleRow | null;
  const creditReste =
    sale && sale.status === "completed" && sale.customer_id
      ? remainingTotal(creditSale!)
      : 0;
  const showCreditEncaissement =
    Boolean(sale) &&
    sale!.status === "completed" &&
    Boolean(sale!.customer_id) &&
    creditReste > CREDIT_AMOUNT_EPS &&
    canRecordCreditPayment;
  const storesList = Array.isArray(storesQ.data) ? storesQ.data : [];
  const storeFull = sale
    ? storesList.find((s) => s.id === sale.store_id) ?? null
    : null;

  const hasItems = Boolean(sale?.sale_items && sale.sale_items.length > 0);
  const isInvoiceSale = Boolean(
    sale && (isA4Invoice(sale) || sale.sale_mode === "invoice_pos"),
  );
  /*
   * Réglage propriétaire « Choisir le format d'impression ». Coupé (le défaut), chaque
   * vente ne propose que le document de sa caisse d'origine, comme avant. Ouvert, les
   * deux blocs sont là : le client qui revient réclamer une facture pour sa comptabilité
   * l'obtient depuis la vente déjà enregistrée, sans la refaire.
   */
  const showInvoiceBlock = isInvoiceSale || printFormatChoiceOn;
  const showTicketBlock = !isInvoiceSale || printFormatChoiceOn;
  const actionsDisabled =
    !storeFull || storesQ.isLoading || !hasItems || pdfBusy !== null;

  async function buildInvoiceBlob() {
    if (!sale || !storeFull) throw new Error("Données manquantes.");
    const logoBytes = await fetchLogoBytes(storeFull.logo_url);
    const data = buildInvoiceA4FromSaleDetail(sale, storeFull, logoBytes);
    return generateInvoicePdfBlob(data, { saleId: sale.id });
  }

  async function handleViewPdf() {
    if (!sale || !storeFull) {
      toast.error("Données boutique ou vente manquantes.");
      return;
    }
    if (pdfBusy) return;
    setPdfBusy("view");
    try {
      const blob = await buildInvoiceBlob();
      setInvoicePreviewBlob(blob);
    } catch (e) {
      toast.error(messageFromUnknownError(e, "Impossible d'afficher le PDF."));
    } finally {
      setPdfBusy(null);
    }
  }

  async function handlePrintInvoice() {
    if (!sale || !storeFull) {
      toast.error("Données boutique ou vente manquantes.");
      return;
    }
    if (pdfBusy) return;
    setPdfBusy("print");
    try {
      toast.info("Impression en cours…");
      const blob = await buildInvoiceBlob();
      printInvoicePdf(blob);
      window.setTimeout(() => {
        toast.success("Impression envoyée à l'imprimante.");
      }, 400);
    } catch (e) {
      toast.error(
        messageFromUnknownError(e, "Impossible de lancer l'impression."),
      );
    } finally {
      setPdfBusy(null);
    }
  }

  async function handleDownloadInvoice() {
    if (!sale || !storeFull) {
      toast.error("Données boutique ou vente manquantes.");
      return;
    }
    if (pdfBusy) return;
    setPdfBusy("download");
    try {
      const blob = await buildInvoiceBlob();
      downloadInvoicePdf(blob, sale.sale_number);
      toast.success("Facture téléchargée.");
    } catch (e) {
      toast.error(
        messageFromUnknownError(e, "Impossible de télécharger la facture."),
      );
    } finally {
      setPdfBusy(null);
    }
  }

  /** Envoi de la facture au client (WhatsApp, e-mail, autre application). */
  async function handleSendInvoice() {
    if (!sale || !storeFull) {
      toast.error("Données boutique ou vente manquantes.");
      return;
    }
    if (pdfBusy) return;
    setPdfBusy("send");
    try {
      const blob = await buildInvoiceBlob();
      const filename = documentFilename("facture", sale.sale_number);
      const outcome = await shareDocument({
        blob,
        filename,
        title: "Facture",
        phone: sale.customer?.phone ?? null,
        message: buildDocumentMessage({
          documentLabel: "facture",
          documentNumber: sale.sale_number,
          storeName: storeFull.name,
          customerName: sale.customer?.name ?? null,
          amountLabel: formatCurrencyFlutter(sale.total),
        }),
      });
      if (outcome === "shared") {
        toast.success("Facture transmise à l'application choisie.");
      } else if (outcome === "whatsapp-manual") {
        toast.info(
          `PDF enregistré (${filename}) et WhatsApp ouvert : joignez le fichier à la conversation.`,
          7000,
        );
      } else if (outcome === "downloaded") {
        toast.info(
          `PDF enregistré (${filename}). Joignez-le à votre message pour l'envoyer au client.`,
          7000,
        );
      }
    } catch (e) {
      toast.error(
        messageFromUnknownError(e, "Impossible de préparer la facture à envoyer."),
      );
    } finally {
      setPdfBusy(null);
    }
  }

  function handleThermalReprint() {
    if (!sale || !storeFull) {
      toast.error("Données boutique manquantes.");
      return;
    }
    setReceiptDialog(buildReceiptTicketDataFromSale(storeFull, sale, saleId));
  }

  return (
    <>
      <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4">
        <div className="flex max-h-[min(560px,90vh)] w-full max-w-[460px] flex-col rounded-t-2xl bg-[#ECEFF1] shadow-2xl sm:rounded-2xl">
          <div className="flex min-h-0 flex-1 flex-col p-4">
            {/* En-tête — proche du DecoratedBox Flutter */}
            <div className="shrink-0 rounded-xl bg-white/90 p-3 shadow-sm ring-1 ring-black/5">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-orange-100 text-[#c2410c]">
                  <MdReceiptLong className="h-6 w-6" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-lg font-extrabold text-fs-text">
                    {sale?.sale_number
                      ? `Détail vente ${sale.sale_number}`
                      : "Détail vente"}
                  </h3>
                  <p className="mt-0.5 truncate text-xs text-neutral-500">
                    {sale ? "Résumé + articles" : "Chargement…"}
                  </p>
                  {sale ? (
                    <p className="mt-1 text-xs text-neutral-500">
                      {formatDateTime(sale.created_at)}
                    </p>
                  ) : null}
                </div>
                {hasItems && sale ? (
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2.5 py-1 text-xs font-bold",
                      sale.status === "completed" &&
                        "bg-orange-100 text-orange-900",
                      sale.status === "cancelled" && "bg-red-100 text-red-900",
                      sale.status === "refunded" &&
                        "bg-violet-100 text-violet-900",
                      sale.status === "draft" && "bg-neutral-200 text-neutral-800",
                    )}
                  >
                    {STATUS_LABELS[sale.status] ?? sale.status}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
              {q.isLoading ? (
                <div className="flex justify-center py-12">
                  <div className="h-9 w-9 animate-spin rounded-full border-2 border-[#F97316] border-t-transparent" />
                </div>
              ) : null}
              {!q.isLoading && !sale ? (
                <p className="py-12 text-center text-sm text-red-600">
                  Vente introuvable.
                </p>
              ) : null}

              {sale ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-fs-text">
                    {sale.store?.name ? (
                      <span className="font-medium">{sale.store.name}</span>
                    ) : null}
                    {sale.customer?.name ? (
                      <span className="truncate text-neutral-700">
                        {sale.customer.name}
                      </span>
                    ) : null}
                  </div>

                  {/* Payée mais pas emportée : c'est la première chose à savoir en
                      ouvrant la vente — avant les articles, avant le paiement. */}
                  {pickupTrackingEnabled && saleDelivery(sale).awaiting ? (
                    <div className="rounded-xl border border-amber-500/40 bg-amber-50 p-3 dark:bg-amber-950/30">
                      <p className="flex items-center gap-1.5 text-xs font-bold text-amber-800 dark:text-amber-300">
                        <MdInventory2 className="h-4 w-4 shrink-0" aria-hidden />
                        Marchandise pas encore emportée
                      </p>
                      <p className="mt-1 text-sm text-neutral-700 dark:text-neutral-200">
                        {deliveryTooltip(saleDelivery(sale))}
                      </p>
                    </div>
                  ) : null}

                  {(sale.sale_payments ?? []).length > 0 ? (
                    <div className="rounded-xl border border-black/10 bg-white p-3">
                      <p className="text-xs font-semibold text-neutral-500">
                        Mode de paiement
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        {salePaymentDisplays(sale.sale_payments, {
                          includeCredit: true,
                        }).map((d) => (
                          <span
                            key={d.kind}
                            className={cn(
                              "inline-block rounded-md px-2.5 py-1 text-xs font-bold",
                              d.pillClass,
                            )}
                          >
                            {d.label}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {sale.sale_items && sale.sale_items.length > 0 ? (
                    <section>
                      <h4 className="mb-2 flex items-center gap-2 text-sm font-extrabold text-fs-text">
                        <MdListAlt
                          className="h-5 w-5 text-neutral-500"
                          aria-hidden
                        />
                        Articles
                      </h4>
                      <div className="space-y-2">
                        {(sale.sale_items ?? []).map((it) => (
                          <article
                            key={it.id}
                            className="rounded-xl border border-black/10 bg-white px-3 py-2.5"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="line-clamp-2 text-sm font-extrabold text-fs-text">
                                  {it.product?.name ?? "—"}
                                </p>
                                <p className="mt-0.5 text-xs text-neutral-600">
                                  {it.quantity} × {formatCurrency(it.unit_price)}
                                </p>
                              </div>
                              <p className="shrink-0 text-sm font-black text-fs-text">
                                {formatCurrency(it.total)}
                              </p>
                            </div>
                          </article>
                        ))}
                      </div>
                    </section>
                  ) : null}

                  {(sale.sale_payments ?? []).length > 0 ? (
                    <section>
                      <h4 className="mb-2 flex items-center gap-2 text-sm font-extrabold text-fs-text">
                        <MdReceiptLong
                          className="h-4 w-4 text-neutral-500"
                          aria-hidden
                        />
                        Paiements
                      </h4>
                      <div className="space-y-1 rounded-xl border border-black/10 bg-white px-3 py-2">
                        {(sale.sale_payments ?? []).map((p) => (
                          <div
                            key={p.id}
                            className="flex items-center justify-between py-0.5 text-sm"
                          >
                            <span className="text-neutral-700">
                              {paymentDisplay(p).label}
                            </span>
                            <span className="font-bold text-fs-text">
                              {formatCurrency(p.amount)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </section>
                  ) : null}

                  {showCreditEncaissement ? (
                    <div className="rounded-xl border border-[#F97316]/35 bg-orange-50/90 p-3 dark:border-orange-500/40 dark:bg-orange-950/40">
                      <p className="text-xs font-bold text-neutral-700 dark:text-neutral-200">
                        Encours à recouvrer
                      </p>
                      <div className="mt-2 flex justify-between text-sm">
                        <span className="text-neutral-600">Encaissé</span>
                        <span className="font-bold text-emerald-800 dark:text-emerald-300">
                          {formatCurrency(paidTotal(creditSale!))}
                        </span>
                      </div>
                      <div className="mt-1 flex justify-between text-sm font-extrabold">
                        <span>Reste dû</span>
                        <span className="text-[#c2410c]">{formatCurrency(creditReste)}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setCreditPayOpen(true)}
                        className="mt-3 w-full rounded-lg bg-[#FF7000] py-2.5 text-sm font-bold text-white shadow-sm hover:bg-[#F97316] active:opacity-95"
                      >
                        Enregistrer un paiement
                      </button>
                    </div>
                  ) : null}

                  <div className="border-t border-black/10 pt-2">
                    {sale.discount > 0 ? (
                      <div className="flex justify-between py-1.5 text-sm">
                        <span>Remise</span>
                        <span className="font-bold text-red-600">
                          -{formatCurrency(sale.discount)}
                        </span>
                      </div>
                    ) : null}
                    <div
                      className={cn(
                        "flex justify-between text-base font-black",
                        sale.discount > 0 ? "pt-2" : "pt-1",
                      )}
                    >
                      <span>Total</span>
                      <span>{formatCurrency(sale.total)}</span>
                    </div>
                  </div>

                  {storesQ.isLoading ? (
                    <p className="text-xs text-neutral-500">
                      Chargement paramètres boutique…
                    </p>
                  ) : null}

                  {storeFull && hasItems ? (
                    <div className="border-t border-black/10 pt-3">
                      {showInvoiceBlock ? (
                        <div className="rounded-xl bg-[#F5F5F5] px-3 py-3 sm:px-4 sm:py-3.5">
                          <p className="mb-3 text-[11px] font-bold tracking-[0.06em] text-neutral-700 sm:text-xs">
                            FACTURE A4
                          </p>
                          {/*
                            La fiche suit la fenêtre jusqu'à 460 px, puis s'arrête : au-delà,
                            un point de rupture ne dit plus rien de la place disponible ici.
                            D'où 380 px (≈ 75 px par bouton) plutôt que `sm:` (640 px).
                          */}
                          <div className="grid grid-cols-2 gap-2 min-[380px]:grid-cols-4">
                            <ActionButton
                              icon={<MdPictureAsPdf className="h-5 w-5 shrink-0" aria-hidden />}
                              label="Voir le PDF"
                              loading={pdfBusy === "view"}
                              disabled={actionsDisabled}
                              onClick={() => void handleViewPdf()}
                              primary
                            />
                            <ActionButton
                              icon={<MdPrint className="h-5 w-5 shrink-0" aria-hidden />}
                              label="Réimprimer"
                              loading={pdfBusy === "print"}
                              disabled={actionsDisabled}
                              onClick={() => void handlePrintInvoice()}
                              primary
                            />
                            <ActionButton
                              icon={<MdDownload className="h-5 w-5 shrink-0" aria-hidden />}
                              label="Télécharger"
                              loading={pdfBusy === "download"}
                              disabled={actionsDisabled}
                              onClick={() => void handleDownloadInvoice()}
                              primary
                            />
                            <ActionButton
                              icon={<MdSend className="h-5 w-5 shrink-0" aria-hidden />}
                              label="Envoyer"
                              loading={pdfBusy === "send"}
                              disabled={actionsDisabled}
                              onClick={() => void handleSendInvoice()}
                              primary
                            />
                          </div>
                        </div>
                      ) : null}
                      {showTicketBlock ? (
                        <div
                          className={cn(
                            "rounded-xl bg-[#F5F5F5] px-3 py-3 sm:px-4",
                            showInvoiceBlock && "mt-2",
                          )}
                        >
                          <p className="mb-3 text-[11px] font-bold tracking-[0.06em] text-neutral-700 sm:text-xs">
                            TICKET CAISSE
                          </p>
                          <ActionButton
                            icon={<MdReceiptLong className="h-5 w-5 shrink-0" aria-hidden />}
                            label="Réimprimer le reçu"
                            loading={false}
                            disabled={!storeFull || storesQ.isLoading}
                            onClick={handleThermalReprint}
                            primary
                            className="w-full flex-row gap-2 px-4 py-3 text-sm"
                          />
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="mt-3 shrink-0 flex justify-center border-t border-black/5 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md px-4 py-2 text-sm font-semibold text-[#F97316] hover:bg-orange-50"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      </div>

      {invoicePreviewBlob ? (
        <InvoicePdfPreviewDialog
          blob={invoicePreviewBlob}
          onClose={() => setInvoicePreviewBlob(null)}
        />
      ) : null}

      {receiptDialog ? (
        <ReceiptTicketDialog
          data={receiptDialog}
          // Largeur du rouleau de la boutique : un 58 mm imprimé en 80 sort décalé.
          paperWidthMm={storeFull ? thermalWidthForStore(storeFull) : 80}
          onClose={() => setReceiptDialog(null)}
        />
      ) : null}

      <CreditQuickPayDialog
        key={creditSale?.id ?? "sale-detail-credit-pay"}
        sale={creditSale}
        open={creditPayOpen}
        onClose={() => setCreditPayOpen(false)}
        companyId={companyId}
        companyName={companyName}
      />
    </>
  );
}

function ActionButton({
  icon,
  label,
  loading,
  disabled,
  onClick,
  primary,
  className,
}: {
  icon: ReactNode;
  label: string;
  loading: boolean;
  disabled: boolean;
  onClick: () => void;
  primary?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      onClick={onClick}
      className={cn(
        /*
         * Icône AU-DESSUS du libellé, à toutes les tailles d'écran.
         *
         * L'ancien `sm:flex-row` regardait la largeur de la FENÊTRE, pas celle de la
         * fiche — plafonnée à 460 px. Sur un ordinateur, les quatre boutons passaient
         * donc côte à côte dans des cases de ~90 px : « Réimprimer » débordait sur
         * l'icône du voisin et « Télécharger » se coupait en deux lignes. En colonne,
         * chaque bouton tient dans sa case quelle que soit la fenêtre.
         */
        "inline-flex min-h-12 min-w-0 flex-col items-center justify-center gap-1 rounded-[10px] px-1 py-2 text-center text-[11px] font-bold leading-tight shadow-sm transition-opacity active:opacity-90",
        primary
          ? "bg-[#FF7000] text-white hover:bg-[#F97316] disabled:opacity-45"
          : "border border-black/10 bg-white text-neutral-800 hover:bg-neutral-50 disabled:opacity-50",
        className,
      )}
    >
      {loading ? (
        <span
          className={cn(
            "h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-t-transparent",
            primary ? "border-white" : "border-neutral-400",
          )}
        />
      ) : (
        icon
      )}
      {/* Une seule ligne, jamais coupée : un libellé trop long s'abrège en « … ». */}
      <span className="max-w-full truncate">{label}</span>
    </button>
  );
}

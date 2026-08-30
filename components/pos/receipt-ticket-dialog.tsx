"use client";

import { ReceiptTicketPreview } from "@/components/pos/receipt-ticket-preview";
import { generateReceiptThermalPdfBlob } from "@/lib/features/receipt/generate-receipt-thermal-pdf";
import type { ReceiptTicketData } from "@/lib/features/receipt/receipt-ticket-types";
import { printInvoicePdf } from "@/lib/features/invoices/generate-invoice-pdf";
import { SendDocumentButton } from "@/components/ui/send-document-button";
import {
  buildDocumentMessage,
  documentFilename,
} from "@/lib/features/share/share-document";
import { formatCurrencyFlutter } from "@/lib/utils/currency";
import { messageFromUnknownError, toast } from "@/lib/toast";
import {
  canPrintSaleInOtherFormat,
  printSaleInFormat,
} from "@/lib/features/print/print-sale-format";
import type { Store } from "@/lib/features/stores/types";
import { useState } from "react";
import { MdClose, MdPictureAsPdf, MdPrint } from "react-icons/md";

export function ReceiptTicketDialog({
  data,
  paperWidthMm = 80,
  remotePrint,
  a4Print,
  onClose,
}: {
  data: ReceiptTicketData;
  paperWidthMm?: 58 | 80;
  /**
   * Caisse à deux : l'imprimante thermique est branchée sur le poste du vendeur, pas sur
   * celui du caissier. Fourni, un second bouton envoie le ticket là-bas. Absent, le
   * dialogue est exactement celui d'avant — toutes ses autres utilisations sont intactes.
   */
  remotePrint?: {
    label: string;
    busy: boolean;
    onPrint: () => void;
  } | null;
  /**
   * Réglage propriétaire « Choisir le format d'impression ». Fourni, le client qui
   * réclame une facture A4 après un passage en caisse rapide l'obtient au comptoir,
   * sans ressaisir la vente. Absent (le défaut), le dialogue est celui d'avant : le
   * document suit la caisse utilisée.
   */
  a4Print?: { saleId: string; store: Store } | null;
  onClose: () => void;
}) {
  const [printing, setPrinting] = useState(false);
  const [printingA4, setPrintingA4] = useState(false);

  const canA4 = Boolean(a4Print) && canPrintSaleInOtherFormat(a4Print?.saleId);

  async function handlePrintA4() {
    if (!a4Print) return;
    setPrintingA4(true);
    try {
      toast.info("Facture A4 en préparation…");
      await printSaleInFormat({
        saleId: a4Print.saleId,
        store: a4Print.store,
        format: "a4",
      });
      window.setTimeout(() => {
        toast.success("Facture A4 envoyée à l'imprimante.");
      }, 400);
    } catch (e) {
      toast.error(messageFromUnknownError(e, "Impossible d'imprimer la facture A4."));
    } finally {
      setPrintingA4(false);
    }
  }

  async function handlePrint() {
    setPrinting(true);
    try {
      toast.info("Impression en cours…");
      const blob = await generateReceiptThermalPdfBlob(data, { paperWidthMm });
      const launched = await printInvoicePdf(blob);
      if (!launched) {
        toast.error(
          "Impression bloquée par le navigateur. Autorisez les fenêtres surgissantes pour ce site, puis réessayez.",
        );
        return;
      }
      toast.success("Ticket envoyé à l'imprimante.");
    } catch (e) {
      toast.error(messageFromUnknownError(e, "Impossible d'imprimer le ticket."));
    } finally {
      setPrinting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-black/40 p-0 min-[500px]:items-center min-[500px]:p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-md flex-col rounded-t-lg bg-white shadow-xl min-[500px]:rounded-lg"
        role="dialog"
        aria-modal="true"
        aria-labelledby="receipt-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[#E5E7EB] px-4 py-3">
          <h2 id="receipt-dialog-title" className="text-lg font-bold text-[#1F2937]">
            Vente enregistrée
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 hover:bg-black/5"
            aria-label="Fermer"
          >
            <MdClose className="h-6 w-6 text-[#1F2937]" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <ReceiptTicketPreview data={data} />
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-center gap-3 border-t border-[#E5E7EB] px-6 py-5">
          {remotePrint ? (
            <button
              type="button"
              disabled={remotePrint.busy}
              onClick={remotePrint.onPrint}
              className="inline-flex min-w-[190px] items-center justify-center gap-2 rounded-md bg-[#F97316] py-3 pl-4 pr-5 text-sm font-bold text-white disabled:opacity-60"
            >
              {remotePrint.busy ? (
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <MdPrint className="h-5 w-5" aria-hidden />
              )}
              {remotePrint.label}
            </button>
          ) : null}
          <button
            type="button"
            disabled={printing}
            onClick={() => void handlePrint()}
            className="inline-flex min-w-[140px] items-center justify-center gap-2 rounded-md border border-[#E5E7EB] bg-[#F3F4F6] py-3 pl-4 pr-5 text-sm font-semibold text-[#1F2937] disabled:opacity-60"
          >
            {printing ? (
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-[#F97316] border-t-transparent" />
            ) : (
              <MdPrint className="h-5 w-5 text-[#1F2937]" aria-hidden />
            )}
            {remotePrint ? "Imprimer ici" : "Imprimer"}
          </button>
          {canA4 ? (
            <button
              type="button"
              disabled={printingA4}
              onClick={() => void handlePrintA4()}
              className="inline-flex min-w-[170px] items-center justify-center gap-2 rounded-md border border-[#E5E7EB] bg-[#F3F4F6] py-3 pl-4 pr-5 text-sm font-semibold text-[#1F2937] disabled:opacity-60"
            >
              {printingA4 ? (
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-[#F97316] border-t-transparent" />
              ) : (
                <MdPictureAsPdf className="h-5 w-5 text-[#1F2937]" aria-hidden />
              )}
              Imprimer en A4
            </button>
          ) : null}
          <SendDocumentButton
            makeBlob={() => generateReceiptThermalPdfBlob(data, { paperWidthMm })}
            filename={documentFilename("recu", data.saleNumber)}
            title="Reçu de paiement"
            phone={data.customerPhone}
            message={buildDocumentMessage({
              documentLabel: "reçu de paiement",
              documentNumber: data.saleNumber,
              storeName: data.storeName,
              customerName: data.customerName,
              amountLabel: formatCurrencyFlutter(data.total),
            })}
            className="min-w-35 border-[#E5E7EB] bg-[#F3F4F6] text-[#1F2937]"
          />
          <button
            type="button"
            onClick={onClose}
            className="min-w-[120px] rounded-md border border-[#E5E7EB] bg-white py-3 px-5 text-sm font-semibold text-[#1F2937]"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}

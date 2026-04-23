"use client";

import { ReceiptTicketPreview } from "@/components/pos/receipt-ticket-preview";
import { generateReceiptThermalPdfBlob } from "@/lib/features/receipt/generate-receipt-thermal-pdf";
import type { ReceiptTicketData } from "@/lib/features/receipt/receipt-ticket-types";
import { printInvoicePdf } from "@/lib/features/invoices/generate-invoice-pdf";
import { messageFromUnknownError, toast } from "@/lib/toast";
import { useState } from "react";
import { MdClose, MdPrint } from "react-icons/md";

export function ReceiptTicketDialog({
  data,
  paperWidthMm = 80,
  onClose,
}: {
  data: ReceiptTicketData;
  paperWidthMm?: 58 | 80;
  onClose: () => void;
}) {
  const [printing, setPrinting] = useState(false);

  async function handlePrint() {
    setPrinting(true);
    try {
      toast.info("Impression en cours…");
      const blob = await generateReceiptThermalPdfBlob(data, { paperWidthMm });
      printInvoicePdf(blob);
      window.setTimeout(() => {
        toast.success("Ticket envoyé à l'imprimante.");
      }, 400);
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
        className="flex max-h-[90vh] w-full max-w-md flex-col rounded-t-2xl bg-white shadow-xl min-[500px]:rounded-2xl"
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
          <button
            type="button"
            disabled={printing}
            onClick={() => void handlePrint()}
            className="inline-flex min-w-[140px] items-center justify-center gap-2 rounded-xl border border-[#E5E7EB] bg-[#F3F4F6] py-3 pl-4 pr-5 text-sm font-semibold text-[#1F2937] disabled:opacity-60"
          >
            {printing ? (
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-[#F97316] border-t-transparent" />
            ) : (
              <MdPrint className="h-5 w-5 text-[#1F2937]" aria-hidden />
            )}
            Imprimer
          </button>
          <button
            type="button"
            onClick={onClose}
            className="min-w-[120px] rounded-xl border border-[#E5E7EB] bg-white py-3 px-5 text-sm font-semibold text-[#1F2937]"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}

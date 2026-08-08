"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { MdDownload, MdPictureAsPdf, MdPrint } from "react-icons/md";
import { InvoicePdfPreviewDialog } from "@/components/invoices/invoice-pdf-preview-dialog";
import type { CreditRepaymentReceiptData } from "@/lib/features/credit/credit-repayment-receipt-types";
import {
  downloadCreditRepaymentReceiptPdf,
  generateCreditRepaymentReceiptPdfBlob,
} from "@/lib/features/credit/generate-credit-repayment-receipt-pdf";
import { printInvoicePdf } from "@/lib/features/invoices/generate-invoice-pdf";
import { messageFromUnknownError, toast } from "@/lib/toast";
import { cn } from "@/lib/utils/cn";
import { SendDocumentButton } from "@/components/ui/send-document-button";
import {
  buildDocumentMessage,
  documentFilename,
} from "@/lib/features/share/share-document";
import { formatCurrencyFlutter } from "@/lib/utils/currency";

export function CreditRepaymentReceiptDialog({
  data,
  onClose,
}: {
  data: CreditRepaymentReceiptData;
  onClose: () => void;
}) {
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [busy, setBusy] = useState<null | "view" | "print" | "download">(null);

  async function makeBlob() {
    return generateCreditRepaymentReceiptPdfBlob(data);
  }

  async function handleView() {
    if (busy) return;
    setBusy("view");
    try {
      const blob = await makeBlob();
      setPreviewBlob(blob);
    } catch (e) {
      toast.error(messageFromUnknownError(e, "Impossible d'afficher le reçu PDF."));
    } finally {
      setBusy(null);
    }
  }

  async function handlePrint() {
    if (busy) return;
    setBusy("print");
    try {
      toast.info("Impression du reçu en cours…");
      const blob = await makeBlob();
      printInvoicePdf(blob);
      window.setTimeout(() => {
        toast.success("Reçu envoyé à l'imprimante.");
      }, 400);
    } catch (e) {
      toast.error(
        messageFromUnknownError(e, "Impossible de lancer l'impression du reçu."),
      );
    } finally {
      setBusy(null);
    }
  }

  async function handleDownload() {
    if (busy) return;
    setBusy("download");
    try {
      const blob = await makeBlob();
      downloadCreditRepaymentReceiptPdf(blob, data.receiptNumber);
      toast.success("Reçu téléchargé.");
      onClose();
    } catch (e) {
      toast.error(
        messageFromUnknownError(e, "Impossible de télécharger le reçu."),
      );
    } finally {
      setBusy(null);
    }
  }

  const disabled = busy !== null;

  return (
    <>
      {!previewBlob ? (
        <div className="fixed inset-0 z-92 flex items-end justify-center bg-black/45 p-0 min-[500px]:items-center min-[500px]:p-4">
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="Fermer"
            onClick={onClose}
          />
          <div
            role="dialog"
            aria-modal
            aria-labelledby="credit-receipt-title"
            className="relative z-10 w-full max-w-md rounded-t-lg border border-black/8 bg-fs-card p-5 shadow-xl min-[500px]:rounded-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="credit-receipt-title"
              className="text-lg font-bold text-neutral-900"
            >
              Reçu de remboursement
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-neutral-600">
              Paiement crédit enregistré. Générez un reçu professionnel pour le client.
            </p>
            {/* 2×2 : 4 actions sur une rangée écraseraient les libellés. */}
            <div className="mt-5 grid grid-cols-1 gap-2.5 min-[340px]:grid-cols-2">
              <PostReceiptAction
                icon={<MdPictureAsPdf className="h-5 w-5 shrink-0" aria-hidden />}
                label="Aperçu PDF"
                loading={busy === "view"}
                disabled={disabled}
                onClick={() => void handleView()}
              />
              <PostReceiptAction
                icon={<MdPrint className="h-5 w-5 shrink-0" aria-hidden />}
                label="Imprimer"
                loading={busy === "print"}
                disabled={disabled}
                onClick={() => void handlePrint()}
              />
              <PostReceiptAction
                icon={<MdDownload className="h-5 w-5 shrink-0" aria-hidden />}
                label="Enregistrer"
                loading={busy === "download"}
                disabled={disabled}
                onClick={() => void handleDownload()}
              />
              <SendDocumentButton
                makeBlob={makeBlob}
                filename={documentFilename("recu", data.receiptNumber)}
                title="Reçu de remboursement"
                phone={data.customerPhone}
                message={buildDocumentMessage({
                  documentLabel: "reçu de remboursement",
                  documentNumber: data.receiptNumber,
                  storeName: data.storeCommercialName?.trim() || data.storeName,
                  customerName: data.customerName,
                  amountLabel: formatCurrencyFlutter(data.amountPaid),
                })}
                className="w-full border-transparent bg-fs-accent text-white shadow-sm hover:opacity-90"
              />
            </div>
            <button
              type="button"
              onClick={onClose}
              className="mt-4 w-full rounded-md py-2.5 text-sm font-semibold text-fs-accent hover:bg-fs-accent/10"
            >
              Fermer
            </button>
          </div>
        </div>
      ) : null}

      {previewBlob ? (
        <InvoicePdfPreviewDialog
          blob={previewBlob}
          title="Reçu de remboursement"
          onClose={() => setPreviewBlob(null)}
        />
      ) : null}
    </>
  );
}

function PostReceiptAction({
  icon,
  label,
  loading,
  disabled,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  loading: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "touch-manipulation inline-flex min-h-11 w-full min-w-0 items-center justify-center gap-2 rounded-md bg-fs-accent px-3 text-sm font-semibold text-white shadow-sm hover:opacity-90 active:opacity-95 disabled:opacity-50",
      )}
    >
      {loading ? (
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
      ) : (
        icon
      )}
      <span className="truncate whitespace-nowrap">{label}</span>
    </button>
  );
}

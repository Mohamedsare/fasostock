"use client";

import { useState, type ReactNode } from "react";
import { InvoicePdfPreviewDialog } from "@/components/invoices/invoice-pdf-preview-dialog";
import {
  downloadInvoicePdf,
  generateInvoicePdfBlob,
  printInvoicePdf,
} from "@/lib/features/invoices/generate-invoice-pdf";
import type { InvoiceA4Data } from "@/lib/features/invoices/invoice-a4-types";
import { messageFromUnknownError, toast } from "@/lib/toast";
import { MdDownload, MdPictureAsPdf, MdPrint } from "react-icons/md";
import { cn } from "@/lib/utils/cn";

export function InvoicePostSaleDialog({
  data,
  onClose,
}: {
  data: InvoiceA4Data;
  onClose: () => void;
}) {
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [busy, setBusy] = useState<null | "view" | "print" | "download">(null);

  async function makeBlob() {
    return generateInvoicePdfBlob(data);
  }

  async function handleView() {
    if (busy) return;
    setBusy("view");
    try {
      const blob = await makeBlob();
      setPreviewBlob(blob);
    } catch (e) {
      toast.error(messageFromUnknownError(e, "Impossible d'afficher le PDF."));
    } finally {
      setBusy(null);
    }
  }

  async function handlePrint() {
    if (busy) return;
    setBusy("print");
    try {
      toast.info("Impression en cours…");
      const blob = await makeBlob();
      printInvoicePdf(blob);
      window.setTimeout(() => {
        toast.success("Impression envoyée à l'imprimante.");
      }, 400);
    } catch (e) {
      toast.error(
        messageFromUnknownError(e, "Impossible de lancer l'impression."),
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
      downloadInvoicePdf(blob, data.saleNumber);
      toast.success("Facture téléchargée.");
      onClose();
    } catch (e) {
      toast.error(
        messageFromUnknownError(e, "Impossible de télécharger la facture."),
      );
    } finally {
      setBusy(null);
    }
  }

  const disabled = busy !== null;

  return (
    <>
      <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/45 p-0 min-[500px]:items-center min-[500px]:p-4">
        <button
          type="button"
          className="absolute inset-0 cursor-default"
          aria-label="Fermer"
          onClick={onClose}
        />
        <div
          role="dialog"
          aria-modal
          aria-labelledby="invoice-post-title"
          className="relative z-10 w-full max-w-md rounded-t-2xl border border-black/[0.08] bg-fs-card p-5 shadow-xl min-[500px]:rounded-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <h2
            id="invoice-post-title"
            className="text-lg font-bold text-neutral-900"
          >
            Facture enregistrée
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-neutral-600">
            La vente a été enregistrée. Vous pouvez voir le PDF, l&apos;imprimer ou
            télécharger la facture.
          </p>
          <div className="mt-5 flex flex-col gap-2.5 min-[400px]:flex-row min-[400px]:flex-wrap">
            <PostSaleAction
              icon={<MdPictureAsPdf className="h-5 w-5 shrink-0" aria-hidden />}
              label="Voir le PDF"
              loading={busy === "view"}
              disabled={disabled}
              onClick={() => void handleView()}
            />
            <PostSaleAction
              icon={<MdPrint className="h-5 w-5 shrink-0" aria-hidden />}
              label="Imprimer"
              loading={busy === "print"}
              disabled={disabled}
              onClick={() => void handlePrint()}
            />
            <PostSaleAction
              icon={<MdDownload className="h-5 w-5 shrink-0" aria-hidden />}
              label="Télécharger"
              loading={busy === "download"}
              disabled={disabled}
              onClick={() => void handleDownload()}
            />
          </div>
          <button
            type="button"
            onClick={onClose}
            className="mt-4 w-full rounded-xl py-2.5 text-sm font-semibold text-[#F97316] hover:bg-orange-50"
          >
            Fermer
          </button>
        </div>
      </div>

      {previewBlob ? (
        <InvoicePdfPreviewDialog
          blob={previewBlob}
          onClose={() => setPreviewBlob(null)}
        />
      ) : null}
    </>
  );
}

function PostSaleAction({
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
        "touch-manipulation inline-flex min-h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl bg-[#F97316] px-4 text-sm font-semibold text-white shadow-sm hover:bg-[#ea580c] disabled:opacity-50",
      )}
    >
      {loading ? (
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
      ) : (
        icon
      )}
      {label}
    </button>
  );
}

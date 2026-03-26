"use client";

import { useEffect, useId, useState } from "react";
import { MdClose } from "react-icons/md";

/**
 * Aperçu type `PdfPreview` + AppBar Flutter (`sale_detail_dialog.dart` _showPdfViewer).
 */
export function InvoicePdfPreviewDialog({
  blob,
  title = "Facture A4",
  onClose,
}: {
  blob: Blob;
  title?: string;
  onClose: () => void;
}) {
  const titleId = useId();
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => {
      URL.revokeObjectURL(u);
      setUrl(null);
    };
  }, [blob]);

  if (!url) {
    return (
      <div
        className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50"
        role="dialog"
        aria-busy="true"
        aria-label="Chargement du PDF"
      >
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#F97316] border-t-transparent" />
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-3 sm:p-6"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-[800px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-neutral-200 bg-white px-3 py-3 sm:px-4">
          <h2 id={titleId} className="truncate text-base font-bold text-neutral-900 sm:text-lg">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-neutral-600 hover:bg-neutral-100"
            aria-label="Fermer"
          >
            <MdClose className="h-6 w-6" aria-hidden />
          </button>
        </header>
        <div className="min-h-0 flex-1 bg-neutral-100 p-2 sm:p-3">
          <iframe
            title={title}
            src={`${url}#toolbar=1`}
            className="h-[min(78vh,800px)] w-full rounded-lg border border-neutral-200 bg-white"
          />
        </div>
      </div>
    </div>
  );
}

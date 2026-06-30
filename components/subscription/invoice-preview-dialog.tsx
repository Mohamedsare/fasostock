"use client";

import { useEffect, useState } from "react";
import { MdClose, MdDownload, MdErrorOutline, MdRefresh } from "react-icons/md";
import { FsCard } from "@/components/ui/fs-screen-primitives";
import { fetchSubscriptionInvoicePdfBlob } from "@/lib/features/pdf/pdf-api-client";
import { messageFromUnknownError } from "@/lib/toast";
import { cn } from "@/lib/utils/cn";

/**
 * Aperçu de la facture PDF dans la page (sans changer d'onglet) : récupération
 * asynchrone du blob, affichage en iframe, et téléchargement direct.
 */
export function InvoicePreviewDialog({
  open,
  requestId,
  fileName,
  onClose,
}: {
  open: boolean;
  requestId: string | null;
  fileName?: string;
  onClose: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!open || !requestId) return;
    let active = true;
    let objectUrl: string | null = null;
    setLoading(true);
    setError(null);
    setUrl(null);
    fetchSubscriptionInvoicePdfBlob(requestId)
      .then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch((e) => {
        if (active) setError(messageFromUnknownError(e, "Facture indisponible."));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [open, requestId, attempt]);

  if (!open) return null;

  const dl = fileName ?? "facture-fasostock.pdf";

  return (
    <div
      className="fixed inset-0 z-[70] flex items-stretch justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Aperçu de la facture"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <FsCard
        className="flex h-full w-full max-w-3xl flex-col overflow-hidden shadow-xl sm:h-[88vh] sm:rounded-2xl"
        padding="p-0"
      >
        {/* En-tête */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-black/6 px-4 py-3">
          <h2 className="text-base font-bold text-fs-text">Facture</h2>
          <div className="flex items-center gap-2">
            <a
              href={url ?? undefined}
              download={dl}
              aria-disabled={!url}
              onClick={(e) => {
                if (!url) e.preventDefault();
              }}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-[10px] px-3 py-2 text-xs font-semibold sm:text-sm",
                url
                  ? "bg-fs-accent text-white active:scale-[0.99]"
                  : "cursor-not-allowed bg-fs-surface-container text-neutral-400",
              )}
            >
              <MdDownload className="h-4 w-4" aria-hidden />
              Télécharger
            </a>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-black/8 bg-fs-card text-neutral-700 active:bg-fs-surface-container"
              aria-label="Fermer"
            >
              <MdClose className="h-5 w-5" aria-hidden />
            </button>
          </div>
        </div>

        {/* Corps */}
        <div className="relative min-h-0 flex-1 bg-neutral-100">
          {loading ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <div className="h-9 w-9 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" />
              <p className="text-sm text-neutral-500">Génération de la facture…</p>
            </div>
          ) : error ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
              <MdErrorOutline className="h-12 w-12 text-red-500" aria-hidden />
              <p className="max-w-sm text-sm font-medium text-neutral-700">{error}</p>
              <button
                type="button"
                onClick={() => setAttempt((a) => a + 1)}
                className="inline-flex items-center gap-1.5 rounded-[10px] bg-fs-accent px-4 py-2.5 text-sm font-semibold text-white"
              >
                <MdRefresh className="h-4 w-4" aria-hidden />
                Réessayer
              </button>
            </div>
          ) : url ? (
            <iframe src={url} title="Facture" className="h-full w-full border-0" />
          ) : null}
        </div>
      </FsCard>
    </div>
  );
}

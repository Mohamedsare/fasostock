"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MdClose, MdDownload, MdPrint } from "react-icons/md";
import { ProgressiveTicketPreview } from "@/components/progressive/progressive-ticket-preview";
import {
  fetchProgressiveTicketData,
  generateProgressiveTicketPdfBlob,
} from "@/lib/features/progressive/ticket-api";
import { printInvoicePdf } from "@/lib/features/invoices/generate-invoice-pdf";
import { messageFromUnknownError, toast } from "@/lib/toast";
import { cn } from "@/lib/utils/cn";

/**
 * Ticket d'un mouvement (versement / remboursement) : aperçu fidèle + impression
 * thermique 58 ou 80 mm. La largeur par défaut suit le réglage de la boutique
 * (page Boutiques → Caisse rapide), modifiable ici à la volée.
 */
export function ProgressiveTicketDialog({
  ledgerId,
  onClose,
}: {
  ledgerId: string;
  onClose: () => void;
}) {
  const [width, setWidth] = useState<58 | 80 | null>(null);
  const [busy, setBusy] = useState<null | "print" | "download">(null);

  const q = useQuery({
    queryKey: ["progressive-ticket", ledgerId],
    queryFn: () => fetchProgressiveTicketData(ledgerId),
    staleTime: 60_000,
  });

  const effectiveWidth: 58 | 80 = width ?? q.data?.paperWidthMm ?? 80;

  async function withBlob(action: (blob: Blob) => void, mode: "print" | "download") {
    if (busy) return;
    setBusy(mode);
    try {
      const blob = await generateProgressiveTicketPdfBlob(ledgerId, {
        paperWidthMm: effectiveWidth,
      });
      action(blob);
    } catch (e) {
      toast.error(messageFromUnknownError(e, "Impossible de générer le ticket."));
    } finally {
      setBusy(null);
    }
  }

  function handlePrint() {
    toast.info("Préparation du ticket…");
    void withBlob((blob) => {
      printInvoicePdf(blob);
      window.setTimeout(() => toast.success("Ticket envoyé à l'imprimante."), 400);
    }, "print");
  }

  function handleDownload() {
    void withBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ticket-${q.data?.receiptNumber ?? "avance"}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 2000);
      toast.success("Ticket enregistré.");
    }, "download");
  }

  return (
    <div
      className="fixed inset-0 z-[95] flex items-end justify-center bg-black/45 p-0 min-[500px]:items-center min-[500px]:p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-md flex-col rounded-t-2xl bg-fs-card shadow-2xl min-[500px]:rounded-2xl"
        role="dialog"
        aria-modal="true"
        aria-label="Ticket d'avance"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-black/[0.07] px-4 py-3 dark:border-white/10">
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold text-fs-text">Ticket client</h2>
            <p className="truncate text-xs text-neutral-500">
              {q.data ? `${q.data.receiptNumber} · dossier ${q.data.planNumber}` : "Chargement…"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 hover:bg-black/5 dark:hover:bg-white/10"
            aria-label="Fermer"
          >
            <MdClose className="h-6 w-6 text-fs-text" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-neutral-100/60 px-4 py-4 dark:bg-black/20">
          {q.isLoading ? (
            <div className="flex min-h-[220px] items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" />
            </div>
          ) : q.isError || !q.data ? (
            <p className="py-10 text-center text-sm font-medium text-red-600">
              {messageFromUnknownError(q.error, "Ticket introuvable.")}
            </p>
          ) : (
            <ProgressiveTicketPreview data={q.data} />
          )}
        </div>

        <div className="shrink-0 space-y-3 border-t border-black/[0.07] px-4 py-4 dark:border-white/10">
          <div className="flex items-center justify-center gap-2">
            <span className="text-xs font-medium text-neutral-500">Papier :</span>
            {([58, 80] as const).map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => setWidth(w)}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors",
                  effectiveWidth === w
                    ? "border-fs-accent bg-[color-mix(in_srgb,var(--fs-accent)_16%,transparent)] text-fs-accent"
                    : "border-black/10 bg-fs-surface-container text-neutral-600 dark:border-white/10 dark:text-neutral-300",
                )}
              >
                {w} mm
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy !== null || !q.data}
              onClick={handlePrint}
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-fs-accent px-4 text-sm font-bold text-white shadow-sm disabled:opacity-50"
            >
              {busy === "print" ? (
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <MdPrint className="h-5 w-5" aria-hidden />
              )}
              Imprimer le ticket
            </button>
            <button
              type="button"
              disabled={busy !== null || !q.data}
              onClick={handleDownload}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-black/10 bg-fs-surface-container px-4 text-sm font-semibold text-fs-text disabled:opacity-50 dark:border-white/10"
            >
              {busy === "download" ? (
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" />
              ) : (
                <MdDownload className="h-5 w-5" aria-hidden />
              )}
              PDF
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MdClose, MdDownload, MdPrint } from "react-icons/md";
import { SendDocumentButton } from "@/components/ui/send-document-button";
import {
  fetchProgressiveQuoteData,
  generateProgressiveQuotePdfBlob,
} from "@/lib/features/progressive/quote-api";
import { printInvoicePdf } from "@/lib/features/invoices/generate-invoice-pdf";
import {
  buildDocumentMessage,
  documentFilename,
} from "@/lib/features/share/share-document";
import { formatCurrency, formatCurrencyFlutter } from "@/lib/utils/currency";
import { messageFromUnknownError, toast } from "@/lib/toast";

/**
 * Facture proforma A4 de la sélection d'un dossier : aperçu à l'écran, puis
 * impression, enregistrement PDF ou envoi au client (WhatsApp et autres applis).
 *
 * L'aperçu et le PDF lisent la même source serveur (`progressive_quote_data`) :
 * ce que le commerçant voit est exactement ce qui s'imprime.
 */
export function ProgressiveQuoteDialog({
  planId,
  onClose,
}: {
  planId: string;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState<null | "print" | "download">(null);

  const q = useQuery({
    queryKey: ["progressive-quote", planId],
    queryFn: () => fetchProgressiveQuoteData(planId),
    staleTime: 15_000,
  });

  const data = q.data ?? null;
  const total = data ? Math.round(data.selectionTotal) : 0;
  const remaining = data ? Math.max(0, total - Math.round(data.balance)) : 0;

  async function withBlob(action: (blob: Blob) => void, mode: "print" | "download") {
    if (busy) return;
    setBusy(mode);
    try {
      const blob = await generateProgressiveQuotePdfBlob(planId);
      action(blob);
    } catch (e) {
      toast.error(messageFromUnknownError(e, "Impossible de générer la facture."));
    } finally {
      setBusy(null);
    }
  }

  function handlePrint() {
    toast.info("Préparation de la facture…");
    void withBlob((blob) => {
      printInvoicePdf(blob);
      window.setTimeout(() => toast.success("Facture envoyée à l'imprimante."), 400);
    }, "print");
  }

  function handleDownload() {
    void withBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = documentFilename("proforma", data?.planNumber ?? "dossier");
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 2000);
      toast.success("Facture enregistrée.");
    }, "download");
  }

  return (
    <div
      className="fixed inset-0 z-[95] flex items-end justify-center bg-black/45 p-0 min-[560px]:items-center min-[560px]:p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-xl flex-col rounded-t-2xl bg-fs-card shadow-2xl min-[560px]:rounded-2xl"
        role="dialog"
        aria-modal="true"
        aria-label="Facture proforma"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-black/[0.07] px-4 py-3 dark:border-white/10">
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold text-fs-text">Facture proforma A4</h2>
            <p className="truncate text-xs text-neutral-500">
              {data ? `${data.planNumber} · ${data.clientName}` : "Chargement…"}
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
            <div className="flex min-h-[200px] items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-fs-accent border-t-transparent" />
            </div>
          ) : q.isError || !data ? (
            <p className="py-10 text-center text-sm font-medium text-red-600">
              {messageFromUnknownError(q.error, "Dossier introuvable.")}
            </p>
          ) : (
            <div className="rounded-xl bg-white p-4 text-neutral-800 shadow-sm dark:bg-neutral-100">
              <p className="text-sm font-extrabold uppercase tracking-wide">
                {data.storeName || data.companyName}
              </p>
              <p className="text-[11px] text-neutral-500">
                {[data.storeAddress, data.storePhone].filter(Boolean).join(" · ") || "—"}
              </p>

              <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2 border-y border-neutral-200 py-2">
                <span className="text-xs font-bold uppercase tracking-wide">
                  Facture proforma
                </span>
                <span className="text-xs text-neutral-500">
                  Dossier {data.planNumber} · {data.clientName}
                </span>
              </div>

              {data.lines.length === 0 ? (
                <p className="py-6 text-center text-xs italic text-neutral-500">
                  Aucun article dans la sélection : modifiez le dossier pour en ajouter.
                </p>
              ) : (
                <table className="mt-3 w-full text-left text-xs">
                  <thead>
                    <tr className="text-[11px] uppercase text-neutral-500">
                      <th className="pb-1">Désignation</th>
                      <th className="pb-1 text-center">Qté</th>
                      <th className="pb-1 text-right">P.U.</th>
                      <th className="pb-1 text-right">Montant</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.lines.map((l, i) => (
                      <tr key={`${l.label}-${i}`} className="border-t border-neutral-100">
                        <td className="py-1.5 pr-2">{l.label}</td>
                        <td className="py-1.5 text-center font-semibold">{l.quantity}</td>
                        <td className="py-1.5 text-right tabular-nums">
                          {formatCurrency(l.unitPrice)}
                        </td>
                        <td className="py-1.5 text-right font-bold tabular-nums">
                          {formatCurrency(l.lineTotal)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              <div className="mt-3 space-y-1 border-t border-neutral-200 pt-2 text-xs">
                <Row label="Total sélection" value={formatCurrency(total)} strong />
                <Row label="Déjà versé (épargne)" value={formatCurrency(data.balance)} />
                <Row label="Reste à verser" value={formatCurrency(remaining)} />
              </div>

              <p className="mt-3 text-[10.5px] leading-relaxed text-neutral-500">
                Document non contractuel de vente : les articles ne sont ni livrés ni
                réservés tant que le montant total n&apos;est pas atteint.
              </p>
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-black/[0.07] px-4 py-4 dark:border-white/10">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy !== null || !data}
              onClick={handlePrint}
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-fs-accent px-4 text-sm font-bold text-white shadow-sm disabled:opacity-50"
            >
              {busy === "print" ? (
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <MdPrint className="h-5 w-5" aria-hidden />
              )}
              Imprimer
            </button>
            <button
              type="button"
              disabled={busy !== null || !data}
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
            {data ? (
              <SendDocumentButton
                makeBlob={() => generateProgressiveQuotePdfBlob(planId)}
                filename={documentFilename("proforma", data.planNumber)}
                title="Facture proforma"
                phone={data.clientPhone}
                message={buildDocumentMessage({
                  documentLabel: "facture proforma",
                  documentNumber: data.planNumber,
                  storeName: data.storeName || data.companyName,
                  customerName: data.clientName,
                  amountLabel: formatCurrencyFlutter(total),
                })}
                disabled={busy !== null}
              />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-neutral-600">{label}</span>
      <span
        className={
          strong ? "text-sm font-extrabold tabular-nums" : "font-semibold tabular-nums"
        }
      >
        {value}
      </span>
    </div>
  );
}

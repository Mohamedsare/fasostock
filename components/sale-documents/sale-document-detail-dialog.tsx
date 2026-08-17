"use client";

import { useState } from "react";
import Link from "next/link";
import {
  MdCheckCircle,
  MdContentCopy,
  MdDownload,
  MdEdit,
  MdLock,
  MdOpenInNew,
  MdPictureAsPdf,
  MdPrint,
  MdReceiptLong,
  MdSend,
  MdSwapHoriz,
} from "react-icons/md";
import { InvoicePdfPreviewDialog } from "@/components/invoices/invoice-pdf-preview-dialog";
import { SendDocumentButton } from "@/components/ui/send-document-button";
import { SaleDocumentDialogShell } from "./sale-document-dialog-shell";
import { SaleDocumentStatusPill } from "./sale-document-status-pill";
import { ROUTES } from "@/lib/config/routes";
import { fetchSaleDocumentPdfBlob } from "@/lib/features/pdf/pdf-api-client";
import {
  downloadInvoicePdf,
  printInvoicePdf,
} from "@/lib/features/invoices/generate-invoice-pdf";
import {
  daysUntilExpiry,
  isSaleDocumentLocked,
  SALE_DOCUMENT_STATUS_HINTS,
  SALE_DOCUMENT_STATUS_LABELS,
  saleDocumentCustomerLabel,
  saleDocumentFilename,
  saleDocumentRemaining,
  saleDocumentTitle,
  selectableStatuses,
  type SaleDocument,
  type SaleDocumentStatus,
} from "@/lib/features/sale-documents/types";
import { formatCurrency } from "@/lib/utils/currency";
import { messageFromUnknownError, toast } from "@/lib/toast";
import { cn } from "@/lib/utils/cn";

function dateLabel(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
}

export function SaleDocumentDetailDialog({
  document: doc,
  canEdit,
  busyAction,
  onClose,
  onEdit,
  onDuplicate,
  onConvert,
  onIssue,
  onSetStatus,
  onDelete,
}: {
  document: SaleDocument;
  canEdit: boolean;
  busyAction: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onConvert: () => void;
  onIssue: () => void;
  onSetStatus: (status: SaleDocumentStatus) => void;
  onDelete: () => void;
}) {
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);

  const isQuote = doc.kind === "quote";
  const locked = isSaleDocumentLocked(doc.status);
  const remaining = saleDocumentRemaining(doc);
  const expiresIn = isQuote ? daysUntilExpiry(doc.validUntil) : null;

  async function withPdf(action: (blob: Blob) => void) {
    if (pdfBusy) return;
    setPdfBusy(true);
    try {
      const blob = await fetchSaleDocumentPdfBlob(doc.id);
      action(blob);
    } catch (e) {
      toast.error(messageFromUnknownError(e, "Le document n'a pas pu être préparé."));
    } finally {
      setPdfBusy(false);
    }
  }

  return (
    <>
      <SaleDocumentDialogShell
        title={`${saleDocumentTitle(doc)} ${doc.number}`}
        subtitle={saleDocumentCustomerLabel(doc)}
        onClose={onClose}
        busy={busyAction}
      >
        {/* ── En-tête : statut et ce qu'il veut dire ─────────────────── */}
        <div className="rounded-md border border-black/[0.07] bg-fs-surface-container/50 p-3 dark:border-white/10">
          <div className="flex flex-wrap items-center gap-2">
            <SaleDocumentStatusPill status={doc.status} />
            {locked ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-neutral-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-neutral-600 dark:text-neutral-300">
                <MdLock className="h-3 w-3" aria-hidden />
                Figé
              </span>
            ) : null}
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">
            {SALE_DOCUMENT_STATUS_HINTS[doc.status]}
          </p>

          {isQuote && expiresIn != null && (doc.status === "draft" || doc.status === "sent") ? (
            <p
              className={cn(
                "mt-2 rounded-md px-2.5 py-1.5 text-[11px] font-medium",
                expiresIn < 0
                  ? "bg-red-500/10 text-red-700 dark:text-red-300"
                  : expiresIn <= 7
                    ? "bg-amber-500/10 text-amber-900 dark:text-amber-200"
                    : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
              )}
            >
              {expiresIn < 0
                ? `Validité dépassée depuis ${Math.abs(expiresIn)} jour(s).`
                : expiresIn === 0
                  ? "Dernier jour de validité."
                  : `Encore ${expiresIn} jour(s) de validité.`}
            </p>
          ) : null}
        </div>

        {/* ── Filiation entre documents ──────────────────────────────── */}
        {doc.sourceDocumentNumber || doc.convertedDocumentNumber || doc.saleNumber ? (
          <div className="rounded-md border border-black/[0.07] p-3 text-xs dark:border-white/10">
            {doc.sourceDocumentNumber ? (
              <p className="text-neutral-600 dark:text-neutral-400">
                Établie à partir du devis <b className="text-fs-text">{doc.sourceDocumentNumber}</b>.
              </p>
            ) : null}
            {doc.convertedDocumentNumber ? (
              <p className="text-neutral-600 dark:text-neutral-400">
                Transformé en facture{" "}
                <b className="text-fs-text">{doc.convertedDocumentNumber}</b>.
              </p>
            ) : null}
            {doc.saleNumber ? (
              <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-neutral-600 dark:text-neutral-400">
                <MdReceiptLong className="h-3.5 w-3.5 text-neutral-400" aria-hidden />
                Vente <b className="text-fs-text">{doc.saleNumber}</b> enregistrée.
                <Link
                  href={ROUTES.sales}
                  className="inline-flex items-center gap-0.5 font-semibold text-fs-accent hover:underline"
                >
                  Voir dans Ventes
                  <MdOpenInNew className="h-3 w-3" aria-hidden />
                </Link>
              </p>
            ) : null}
          </div>
        ) : null}

        {/* ── Coordonnées et références ──────────────────────────────── */}
        <div className="grid gap-3 min-[560px]:grid-cols-2">
          <InfoCard title={isQuote ? "Devis établi pour" : "Facturé à"}>
            <Kv label="Nom" value={doc.customerName} />
            <Kv label="Téléphone" value={doc.customerPhone} />
            <Kv label="E-mail" value={doc.customerEmail} />
            <Kv label="Adresse" value={doc.customerAddress} />
            <Kv label="IFU / RCCM" value={doc.customerTaxId} />
          </InfoCard>
          <InfoCard title="Le document">
            <Kv label="Objet" value={doc.subject} />
            <Kv label="Votre référence" value={doc.clientReference} />
            <Kv label={isQuote ? "Date du devis" : "Date de facture"} value={dateLabel(doc.issueDate)} />
            {isQuote ? (
              <Kv label="Valable jusqu'au" value={dateLabel(doc.validUntil)} />
            ) : (
              <Kv label="À régler avant le" value={dateLabel(doc.dueDate)} />
            )}
            <Kv label="Établi par" value={doc.authorName} />
          </InfoCard>
        </div>

        {/* ── Lignes ─────────────────────────────────────────────────── */}
        <div className="overflow-hidden rounded-md border border-black/[0.07] dark:border-white/10">
          <div className="border-b border-black/[0.07] bg-fs-surface-container/50 px-3 py-2 dark:border-white/10">
            <h3 className="text-xs font-bold uppercase tracking-wide text-neutral-500">
              {doc.lines.length} ligne{doc.lines.length > 1 ? "s" : ""}
            </h3>
          </div>
          {doc.lines.length === 0 ? (
            <p className="px-3 py-4 text-center text-xs italic text-neutral-400">
              Aucune ligne sur ce document.
            </p>
          ) : (
            <ul className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
              {doc.lines.map((l) => (
                <li key={l.id} className="flex items-start justify-between gap-3 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-fs-text">{l.label}</p>
                    {l.description ? (
                      <p className="mt-0.5 text-[11px] leading-relaxed text-neutral-500">
                        {l.description}
                      </p>
                    ) : null}
                    <p className="mt-0.5 text-[11px] text-neutral-500">
                      {l.quantity} {l.unit} × {formatCurrency(l.unitPrice)}
                      {l.discountPercent > 0 ? ` · remise ${l.discountPercent} %` : ""}
                      {l.productId ? "" : " · prestation"}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-bold text-fs-text">
                    {formatCurrency(l.total)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* ── Totaux ─────────────────────────────────────────────────── */}
        <div className="rounded-md border border-black/[0.07] bg-fs-surface-container/50 p-3 dark:border-white/10">
          <Kv label="Montant hors remise" value={formatCurrency(doc.subtotal)} />
          {doc.discount > 0 ? (
            <Kv label="Remise accordée" value={`− ${formatCurrency(doc.discount)}`} />
          ) : null}
          {doc.taxRate > 0 ? (
            <Kv label={`TVA ${doc.taxRate} %`} value={formatCurrency(doc.tax)} />
          ) : null}
          <div className="mt-2 flex items-center justify-between border-t border-black/[0.07] pt-2 dark:border-white/10">
            <span className="text-sm font-semibold text-fs-text">
              {isQuote ? "Total du devis" : "Net à payer"}
            </span>
            <span className="text-lg font-bold text-fs-accent">{formatCurrency(doc.total)}</span>
          </div>
          {doc.saleId ? (
            <div className="mt-2 border-t border-black/[0.07] pt-2 dark:border-white/10">
              <Kv label="Déjà réglé" value={formatCurrency(doc.paidAmount)} />
              <div className="flex items-center justify-between py-0.5">
                <span className="text-xs text-neutral-600 dark:text-neutral-400">
                  {remaining > 0 ? "Reste à payer" : "Soldé"}
                </span>
                <span
                  className={cn(
                    "text-sm font-bold",
                    remaining > 0
                      ? "text-amber-700 dark:text-amber-300"
                      : "text-emerald-600 dark:text-emerald-400",
                  )}
                >
                  {formatCurrency(remaining)}
                </span>
              </div>
            </div>
          ) : null}
        </div>

        {(doc.notes ?? doc.terms) ? (
          <div className="rounded-md border border-black/[0.07] p-3 dark:border-white/10">
            {doc.notes ? (
              <p className="whitespace-pre-line text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">
                {doc.notes}
              </p>
            ) : null}
            {doc.terms ? (
              <p className="mt-2 whitespace-pre-line border-t border-black/[0.05] pt-2 text-[11px] leading-relaxed text-neutral-500 dark:border-white/[0.06]">
                {doc.terms}
              </p>
            ) : null}
          </div>
        ) : null}

        {/* ── Le papier ──────────────────────────────────────────────── */}
        <section>
          <h3 className="text-xs font-bold uppercase tracking-wide text-neutral-500">
            Le document papier
          </h3>
          <div className="mt-2 flex flex-wrap gap-2">
            <ActionButton
              icon={MdPictureAsPdf}
              label="Aperçu"
              busy={pdfBusy}
              onClick={() => void withPdf((b) => setPdfBlob(b))}
            />
            <ActionButton
              icon={MdPrint}
              label="Imprimer"
              busy={pdfBusy}
              onClick={() => void withPdf((b) => printInvoicePdf(b))}
            />
            <ActionButton
              icon={MdDownload}
              label="Télécharger"
              busy={pdfBusy}
              onClick={() => void withPdf((b) => downloadInvoicePdf(b, doc.number))}
            />
            <SendDocumentButton
              makeBlob={() => fetchSaleDocumentPdfBlob(doc.id)}
              filename={saleDocumentFilename(doc)}
              title={`${saleDocumentTitle(doc)} ${doc.number}`}
              message={
                isQuote
                  ? `Bonjour, voici notre devis ${doc.number} d'un montant de ${formatCurrency(doc.total)}.`
                  : `Bonjour, voici votre facture ${doc.number} d'un montant de ${formatCurrency(doc.total)}.`
              }
              phone={doc.customerPhone}
              className="inline-flex items-center gap-1.5 rounded-md border border-black/[0.1] px-3 py-2 text-xs font-semibold text-fs-text hover:border-fs-accent/40 dark:border-white/10"
              onSent={() => {
                // Envoyer un devis, c'est le remettre au client : le statut suit le geste
                // au lieu d'attendre qu'on pense à le changer à la main.
                if (doc.status === "draft") onSetStatus("sent");
              }}
            />
          </div>
        </section>

        {/* ── Où en est-on ? ─────────────────────────────────────────── */}
        {!locked && canEdit ? (
          <section>
            <h3 className="text-xs font-bold uppercase tracking-wide text-neutral-500">
              Où en est ce document ?
            </h3>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {selectableStatuses(doc.kind).map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={busyAction || s === doc.status}
                  onClick={() => onSetStatus(s)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-60",
                    s === doc.status
                      ? "border-transparent bg-fs-accent text-white"
                      : "border-black/[0.09] bg-fs-card text-neutral-600 hover:border-fs-accent/35 dark:border-white/10 dark:text-neutral-300",
                  )}
                >
                  {SALE_DOCUMENT_STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {/* ── Actions ────────────────────────────────────────────────── */}
        {canEdit ? (
          <section className="border-t border-black/[0.07] pt-3 dark:border-white/10">
            <div className="flex flex-wrap gap-2">
              {!locked ? (
                <ActionButton icon={MdEdit} label="Modifier" busy={busyAction} onClick={onEdit} />
              ) : null}

              <ActionButton
                icon={MdContentCopy}
                label="Dupliquer"
                busy={busyAction}
                onClick={onDuplicate}
              />

              {isQuote && doc.status !== "converted" && doc.status !== "cancelled" ? (
                <button
                  type="button"
                  disabled={busyAction || doc.lines.length === 0}
                  onClick={onConvert}
                  className="inline-flex items-center gap-1.5 rounded-md bg-fs-accent px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
                >
                  <MdSwapHoriz className="h-4 w-4" aria-hidden />
                  Transformer en facture
                </button>
              ) : null}

              {!isQuote && doc.saleId == null && doc.status !== "cancelled" ? (
                <button
                  type="button"
                  disabled={busyAction || doc.lines.length === 0}
                  onClick={onIssue}
                  className="inline-flex items-center gap-1.5 rounded-md bg-fs-accent px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
                >
                  <MdCheckCircle className="h-4 w-4" aria-hidden />
                  Émettre la facture
                </button>
              ) : null}

              {doc.saleId == null && doc.status !== "converted" ? (
                <button
                  type="button"
                  disabled={busyAction}
                  onClick={onDelete}
                  className="ml-auto rounded-md px-3 py-2 text-xs font-semibold text-neutral-500 hover:text-red-600 disabled:opacity-60"
                >
                  Supprimer
                </button>
              ) : null}
            </div>

            {isQuote && doc.status === "converted" ? (
              <p className="mt-2 text-[11px] leading-relaxed text-neutral-500">
                Ce devis est conservé tel qu&apos;il a été envoyé : c&apos;est votre preuve
                du prix promis si le client conteste plus tard.
              </p>
            ) : null}
          </section>
        ) : null}
      </SaleDocumentDialogShell>

      {pdfBlob ? (
        <InvoicePdfPreviewDialog
          blob={pdfBlob}
          title={`${saleDocumentTitle(doc)} ${doc.number}`}
          onClose={() => setPdfBlob(null)}
        />
      ) : null}
    </>
  );
}

function ActionButton({
  icon: Icon,
  label,
  busy,
  onClick,
}: {
  icon: typeof MdSend;
  label: string;
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-md border border-black/[0.1] px-3 py-2 text-xs font-semibold text-fs-text hover:border-fs-accent/40 disabled:opacity-60 dark:border-white/10"
    >
      <Icon className="h-4 w-4" aria-hidden />
      {label}
    </button>
  );
}

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-md border border-black/[0.07] dark:border-white/10">
      <div className="border-b border-black/[0.07] bg-fs-surface-container/50 px-3 py-2 dark:border-white/10">
        <h3 className="text-xs font-bold uppercase tracking-wide text-neutral-500">{title}</h3>
      </div>
      <div className="px-3 py-2">{children}</div>
    </div>
  );
}

function Kv({ label, value }: { label: string; value: string | null }) {
  const v = (value ?? "").trim();
  if (!v) return null;
  return (
    <div className="flex items-start justify-between gap-3 py-0.5">
      <span className="text-xs text-neutral-600 dark:text-neutral-400">{label}</span>
      <span className="text-right text-xs font-semibold text-fs-text">{v}</span>
    </div>
  );
}

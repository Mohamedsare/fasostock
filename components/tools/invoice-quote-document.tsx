import {
  computeTotals,
  docLabels,
  formatDateFr,
  formatMoney,
  hasConversion,
  lineTotal,
  type FdDocument,
} from "@/lib/tools/invoice-quote";

/**
 * Document A4 (Facture / Devis) — présentationnel et auto-suffisant.
 * Couleurs fixes (toujours clair, comme une facture papier) : il sert tel quel
 * à l'écran (aperçu) et à l'impression / export PDF via `window.print()`.
 */
export function InvoiceQuoteDocument({ doc }: { doc: FdDocument }) {
  const labels = docLabels(doc.docType);
  const totals = computeTotals(doc);
  const fmt = (n: number) => formatMoney(n, doc.currency);

  const senderName = doc.senderName.trim() || "Votre entreprise";
  const clientName = doc.clientName.trim() || "Client";
  const hasItems = doc.items.some((it) => it.designation.trim() || it.quantity || it.unitPrice);

  return (
    <div
      id="fd-print-area"
      className="mx-auto flex w-full max-w-[820px] flex-col bg-white font-sans text-[#1f2937] shadow-[0_20px_60px_-30px_rgba(15,23,42,0.5)] ring-1 ring-black/5 print:max-w-none print:shadow-none print:ring-0"
      style={{ minHeight: "1040px" }}
    >
      {/* Bandeau accent supérieur */}
      <div className="h-2 w-full bg-[#E85D2C]" />

      <div className="flex flex-1 flex-col px-8 py-8 sm:px-12 sm:py-10">
        {/* En-tête : émetteur + bloc document */}
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="flex items-start gap-4">
            {doc.logoDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={doc.logoDataUrl}
                alt=""
                className="h-16 w-16 shrink-0 rounded-xl object-contain ring-1 ring-black/5"
              />
            ) : (
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-[#E85D2C]/10 text-2xl font-black text-[#E85D2C]">
                {senderName.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-lg font-extrabold leading-tight text-[#111827]">{senderName}</p>
              {doc.senderDetails.trim() ? (
                <p className="mt-1 whitespace-pre-line text-[12.5px] leading-relaxed text-[#4b5563]">
                  {doc.senderDetails.trim()}
                </p>
              ) : null}
            </div>
          </div>

          <div className="text-right">
            <p className="text-3xl font-black uppercase tracking-tight text-[#E85D2C]">{labels.title}</p>
            <p className="mt-1 text-[13px] font-bold text-[#111827]">
              {labels.numberLabel} <span className="text-[#E85D2C]">{doc.number || "—"}</span>
            </p>
            <div className="mt-2 space-y-0.5 text-[12px] text-[#4b5563]">
              <p>
                <span className="font-semibold text-[#374151]">{labels.dateLabel} :</span> {formatDateFr(doc.date)}
              </p>
              {doc.dueDate ? (
                <p>
                  <span className="font-semibold text-[#374151]">{labels.dueLabel} :</span>{" "}
                  {formatDateFr(doc.dueDate)}
                </p>
              ) : null}
            </div>
          </div>
        </div>

        {/* Destinataire */}
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-black/[0.07] bg-[#fafafa] p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#9ca3af]">Émis par</p>
            <p className="mt-1 text-sm font-bold text-[#111827]">{senderName}</p>
            {doc.senderDetails.trim() ? (
              <p className="mt-0.5 whitespace-pre-line text-[12px] leading-relaxed text-[#4b5563]">
                {doc.senderDetails.trim()}
              </p>
            ) : null}
          </div>
          <div className="rounded-xl border border-[#E85D2C]/20 bg-[#fff7f1] p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#E85D2C]">
              {doc.docType === "facture" ? "Facturé à" : "Destinataire"}
            </p>
            <p className="mt-1 text-sm font-bold text-[#111827]">{clientName}</p>
            {doc.clientDetails.trim() ? (
              <p className="mt-0.5 whitespace-pre-line text-[12px] leading-relaxed text-[#4b5563]">
                {doc.clientDetails.trim()}
              </p>
            ) : null}
          </div>
        </div>

        {/* Tableau des lignes */}
        <div className="mt-8 overflow-hidden rounded-xl ring-1 ring-black/[0.08]">
          <table className="w-full border-collapse text-[12.5px]">
            <thead>
              <tr className="bg-[#111827] text-left text-white">
                <th className="px-4 py-2.5 font-semibold">Désignation</th>
                <th className="w-16 px-2 py-2.5 text-center font-semibold">Qté</th>
                <th className="w-32 px-3 py-2.5 text-right font-semibold">P.U.</th>
                <th className="w-32 px-4 py-2.5 text-right font-semibold">Total</th>
              </tr>
            </thead>
            <tbody>
              {hasItems ? (
                doc.items.map((it, i) => (
                  <tr key={it.id} className={i % 2 === 1 ? "bg-[#fafafa]" : "bg-white"}>
                    <td className="px-4 py-2.5 align-top text-[#1f2937]">
                      {it.designation.trim() || <span className="text-[#9ca3af]">—</span>}
                    </td>
                    <td className="px-2 py-2.5 text-center align-top tabular-nums text-[#374151]">
                      {it.quantity || 0}
                    </td>
                    <td className="px-3 py-2.5 text-right align-top tabular-nums text-[#374151]">
                      {fmt(it.unitPrice || 0)}
                    </td>
                    <td className="px-4 py-2.5 text-right align-top font-semibold tabular-nums text-[#111827]">
                      {fmt(lineTotal(it))}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-[#9ca3af]">
                    Ajoutez des articles ou prestations…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Totaux */}
        <div className="mt-6 flex justify-end">
          <div className="w-full max-w-[300px] space-y-1.5 text-[13px]">
            <div className="flex justify-between text-[#4b5563]">
              <span>Sous-total</span>
              <span className="tabular-nums">{fmt(totals.subtotal)}</span>
            </div>
            {totals.discountAmount > 0 ? (
              <div className="flex justify-between text-[#4b5563]">
                <span>Remise</span>
                <span className="tabular-nums">− {fmt(totals.discountAmount)}</span>
              </div>
            ) : null}
            {doc.taxEnabled ? (
              <div className="flex justify-between text-[#4b5563]">
                <span>TVA ({doc.taxRate || 0} %)</span>
                <span className="tabular-nums">{fmt(totals.taxAmount)}</span>
              </div>
            ) : null}
            <div className="mt-1.5 flex items-center justify-between rounded-lg bg-[#E85D2C] px-3 py-2.5 text-white">
              <span className="text-sm font-bold uppercase tracking-wide">Total</span>
              <span className="text-base font-black tabular-nums">{fmt(totals.total)}</span>
            </div>
            {hasConversion(doc) ? (
              <div className="flex items-center justify-between px-1 pt-1 text-[12px] text-[#4b5563]">
                <span>
                  Soit (1 {doc.currency} = {doc.exchangeRate} {doc.secondaryCurrency})
                </span>
                <span className="font-semibold tabular-nums text-[#111827]">
                  ≈ {formatMoney(totals.total * doc.exchangeRate, doc.secondaryCurrency)}
                </span>
              </div>
            ) : null}
          </div>
        </div>

        {/* Notes / conditions */}
        {doc.notes.trim() ? (
          <div className="mt-8 rounded-xl border border-black/[0.07] bg-[#fafafa] p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#9ca3af]">Notes & conditions</p>
            <p className="mt-1 whitespace-pre-line text-[12px] leading-relaxed text-[#4b5563]">{doc.notes.trim()}</p>
          </div>
        ) : null}

        {/* Signature / cachet */}
        {doc.signatureDataUrl || doc.signatureLabel.trim() ? (
          <div className="mt-8 flex justify-end">
            <div className="w-56 text-center">
              {doc.signatureDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={doc.signatureDataUrl}
                  alt=""
                  className="mx-auto h-20 w-auto max-w-full object-contain"
                />
              ) : (
                <div className="h-20" />
              )}
              <div className="mt-1 border-t border-[#1f2937]/30 pt-1.5 text-[12px] font-semibold text-[#374151]">
                {doc.signatureLabel.trim() || "Signature & cachet"}
              </div>
            </div>
          </div>
        ) : null}

        {/* Pied de page */}
        <div className="mt-auto pt-8">
          <p className="text-center text-[13px] font-semibold text-[#111827]">Merci de votre confiance.</p>
          <p className="mt-1 text-center text-[10.5px] text-[#9ca3af]">
            {doc.docType === "devis"
              ? "Ce devis est sans engagement et valable à la date indiquée."
              : "Document généré électroniquement."}{" "}
            · Créé gratuitement avec FasoStock
          </p>
        </div>
      </div>
    </div>
  );
}

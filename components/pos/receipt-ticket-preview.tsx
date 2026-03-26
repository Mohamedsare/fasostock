"use client";

import type { ReceiptTicketData } from "@/lib/features/receipt/receipt-ticket-types";
import {
  RECEIPT_SCREEN_DASH_LINE,
  RECEIPT_SCREEN_DOUBLE_LINE,
  RECEIPT_SCREEN_MAX_NAME_LEN,
  formatCurrencyReceipt,
  formatReceiptDateTime,
  stripTelPrefix,
  truncateName,
} from "@/lib/features/receipt/receipt-ticket-format";

/** Copie visuelle de `ReceiptTicketWidget` (Flutter `receipt_ticket_dialog.dart`). */
export function ReceiptTicketPreview({ data }: { data: ReceiptTicketData }) {
  const { dateStr, timeStr } = formatReceiptDateTime(data.date);
  const phone = stripTelPrefix(data.storePhone);
  const customerPhone = stripTelPrefix(data.customerPhone);

  return (
    <div
      className="mx-auto box-border w-[280px] max-w-full px-4 py-5"
      style={{
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        backgroundColor: "#FDFBF7",
        borderWidth: 1,
        borderStyle: "solid",
        borderColor: "#D1D5DB",
        boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
      }}
    >
      <div
        className="text-[#1A1A1A]"
        style={{ fontSize: 11, lineHeight: 1.2 }}
      >
        <DashedLine />
        <div style={{ height: 10 }} />
        <p
          className="text-center font-bold uppercase"
          style={{ fontSize: 13, letterSpacing: 0.8 }}
        >
          {data.storeName.toUpperCase()}
        </p>
        {data.storeAddress?.trim() ? (
          <>
            <div style={{ height: 4 }} />
            <p className="line-clamp-2 text-center text-[10px]">{data.storeAddress.trim()}</p>
          </>
        ) : null}
        {phone ? (
          <>
            <div style={{ height: 2 }} />
            <p className="text-center text-[10px]">{phone}</p>
          </>
        ) : null}
        <div style={{ height: 8 }} />
        <DashedLine />
        <p className="text-center text-[10px]">
          N° {data.saleNumber}    {dateStr}  {timeStr}
        </p>
        <div style={{ height: 6 }} />
        <DashedLine />
        {data.customerName?.trim() ? (
          <>
            <p className="text-[10px]">Client: {data.customerName.trim()}</p>
            {customerPhone ? <p className="text-[10px]">{customerPhone}</p> : null}
            <div style={{ height: 4 }} />
            <DashedLine />
          </>
        ) : null}
        {data.items.map((item, i) => {
          const name = truncateName(item.name, RECEIPT_SCREEN_MAX_NAME_LEN);
          return (
            <div key={i} className="pb-1">
              <p className="text-[11px]">{name}</p>
              <div className="flex justify-between">
                <span className="text-[10px]">
                  {"  "}
                  {item.quantity} x {formatCurrencyReceipt(item.unitPrice)}
                </span>
                <span className="text-[11px]">{formatCurrencyReceipt(item.total)}</span>
              </div>
            </div>
          );
        })}
        <DashedLine />
        <Row label="Sous-total" value={formatCurrencyReceipt(data.subtotal)} />
        {data.discount > 0 ? (
          <Row label="Remise" value={`-${formatCurrencyReceipt(data.discount)}`} />
        ) : null}
        <div style={{ height: 4 }} />
        <p
          className="pb-1 text-center text-[10px]"
          style={{ color: "#374151" }}
        >
          {RECEIPT_SCREEN_DOUBLE_LINE}
        </p>
        <Row label="TOTAL TTC" value={formatCurrencyReceipt(data.total)} bold />
        <div style={{ height: 6 }} />
        <Row label="Paiement" value={data.paymentMethod} />
        {(data.amountReceived ?? 0) > 0 ? (
          <>
            <Row label="Montant reçu" value={formatCurrencyReceipt(data.amountReceived ?? 0)} />
            {(data.change ?? -1) >= 0 ? (
              <Row label="Monnaie" value={formatCurrencyReceipt(data.change ?? 0)} bold />
            ) : null}
          </>
        ) : null}
        <div style={{ height: 10 }} />
        <DashedLine />
        <p className="text-center text-[11px] font-bold">Merci et à bientôt</p>
        <div style={{ height: 4 }} />
        <p className="text-center text-[9px]" style={{ color: "#757575" }}>
          --- FasoStock ---
        </p>
        <div style={{ height: 8 }} />
        <DashedLine />
      </div>
    </div>
  );
}

function DashedLine() {
  return (
    <p
      className="py-1 text-center text-[10px]"
      style={{ color: "#9CA3AF" }}
    >
      {RECEIPT_SCREEN_DASH_LINE}
    </p>
  );
}

function Row({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div
      className="mb-0.5 flex justify-between text-[11px]"
      style={{ fontWeight: bold ? 700 : 400 }}
    >
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

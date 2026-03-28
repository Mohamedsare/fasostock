"use client";

import { Archivo_Black } from "next/font/google";
import QRCode from "react-qr-code";
import { useEffect, useState } from "react";
import type { ReceiptTicketData } from "@/lib/features/receipt/receipt-ticket-types";
import {
  RECEIPT_SEP_LONG,
  RECEIPT_SEP_MID,
  RECEIPT_SEP_TOTAL,
  buildReceiptQrPayload,
  headerMonoLine,
  metaFactureDateHeureLine,
  paymentUppercase,
  productNumericLine,
  receiptIntAmount,
  telLine,
} from "@/lib/features/receipt/receipt-ticket-format";

const archivoBlack = Archivo_Black({
  weight: "400",
  subsets: ["latin"],
  display: "swap",
});

const mono =
  "'Courier New', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";

/** Copie visuelle de `ReceiptTicketWidget` (Flutter `receipt_ticket_dialog.dart`). */
export function ReceiptTicketPreview({ data }: { data: ReceiptTicketData }) {
  const payU = paymentUppercase(data.paymentMethod);
  const isCashLike = payU === "ESPECES";
  const tel = telLine(data.storePhone);
  const qrPayload = buildReceiptQrPayload(data);
  const [logoErr, setLogoErr] = useState(false);
  const logoUrl = data.storeLogoUrl?.trim() ?? "";

  useEffect(() => {
    setLogoErr(false);
  }, [logoUrl]);

  return (
    <div
      className="mx-auto box-border w-[296px] max-w-full px-3 py-4"
      style={{
        backgroundColor: "#FDFBF7",
        borderWidth: 1,
        borderStyle: "solid",
        borderColor: "#CCCCCC",
        boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
        color: "#000000",
      }}
    >
      <div style={{ fontSize: 9.5, lineHeight: 1.22 }}>
        {logoUrl && !logoErr ? (
          <div className="mb-2 flex justify-center">
            <img
              src={logoUrl}
              alt=""
              className="max-h-[80px] max-w-[248px] object-contain object-center"
              onError={() => setLogoErr(true)}
            />
          </div>
        ) : null}
        <p
          className={`${archivoBlack.className} text-center uppercase`}
          style={{
            fontSize: 25,
            letterSpacing: 0.65,
            lineHeight: 1.05,
            margin: 0,
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {data.storeName.toUpperCase()}
        </p>
        {data.storeAddress?.trim() ? (
          <p
            className="text-center"
            style={{ fontFamily: mono, fontSize: 9, margin: 0 }}
          >
            {data.storeAddress.trim()}
          </p>
        ) : null}
        {tel ? (
          <p
            className="text-center"
            style={{ fontFamily: mono, fontSize: 9, margin: 0 }}
          >
            {tel}
          </p>
        ) : null}
        <div style={{ height: 8 }} />
        <p
          className="text-center"
          style={{ fontFamily: mono, fontSize: 9.5, margin: 0 }}
        >
          {metaFactureDateHeureLine(data.saleNumber, data.date)}
        </p>
        <div style={{ height: 6 }} />
        <Separator text={RECEIPT_SEP_LONG} />
        <ReceiptTableLine text={headerMonoLine()} bold />
        <Separator text={RECEIPT_SEP_LONG} />
        {data.items.map((item, i) => (
          <ReceiptProductRow
            key={i}
            name={item.name.trim()}
            numeric={productNumericLine(
              item.quantity,
              Math.round(item.unitPrice),
              Math.round(item.total),
            )}
          />
        ))}
        <div style={{ height: 4 }} />
        <Separator text={RECEIPT_SEP_LONG} />
        <div style={{ height: 4 }} />
        <AmountRow
          label="Sous-total"
          value={receiptIntAmount(data.subtotal)}
          size={9}
        />
        {data.discount > 0 ? (
          <AmountRow
            label="Remise"
            value={receiptIntAmount(data.discount)}
            size={9}
          />
        ) : null}
        <div style={{ height: 4 }} />
        <Separator text={RECEIPT_SEP_TOTAL} />
        <div style={{ height: 4 }} />
        <AmountRow
          label="TOTAL"
          value={receiptIntAmount(data.total)}
          size={12}
          bold
        />
        <div style={{ height: 8 }} />
        <AmountRow label="Paiement" value={payU} size={9.5} />
        {isCashLike ? (
          <>
            <AmountRow
              label="Reçu"
              value={receiptIntAmount(
                Math.round(data.amountReceived ?? data.total),
              )}
              size={9.5}
            />
            <AmountRow
              label="Rendu"
              value={receiptIntAmount(Math.round(data.change ?? 0))}
              size={9.5}
            />
          </>
        ) : null}
        <div style={{ height: 12 }} />
        <div className="flex justify-center">
          <div className="bg-white" style={{ padding: 0 }}>
            <QRCode
              value={qrPayload}
              size={108}
              level="M"
              fgColor="#000000"
              bgColor="#FFFFFF"
            />
          </div>
        </div>
        <div style={{ height: 10 }} />
        <p
          className="text-center"
          style={{
            fontFamily: mono,
            fontSize: 10,
            fontWeight: 600,
            margin: 0,
          }}
        >
          Merci pour votre achat !
        </p>
        <div style={{ height: 8 }} />
        <Separator text={RECEIPT_SEP_MID} />
        <p
          className="text-center"
          style={{
            fontFamily: mono,
            fontSize: 8.5,
            color: "#333333",
            margin: 0,
          }}
        >
          Powered by FasoStock POS
        </p>
        <Separator text={RECEIPT_SEP_MID} />
      </div>
    </div>
  );
}

function Separator({ text }: { text: string }) {
  return (
    <div
      className="w-full overflow-hidden text-center"
      style={{
        fontFamily: mono,
        fontSize: 9,
        lineHeight: 1.2,
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </div>
  );
}

function ReceiptTableLine({ text, bold }: { text: string; bold?: boolean }) {
  return (
    <div
      className="w-full overflow-hidden"
      style={{
        fontFamily: mono,
        fontSize: 9,
        fontWeight: bold ? 700 : 400,
        lineHeight: 1.2,
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </div>
  );
}

function ReceiptProductRow({
  name,
  numeric,
}: {
  name: string;
  numeric: string;
}) {
  return (
    <div
      className="mb-[3px] flex flex-row items-start gap-1"
      style={{ fontFamily: mono, fontSize: 9 }}
    >
      <div
        className="min-w-0 flex-1"
        style={{
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
          wordBreak: "break-word",
        }}
      >
        {name}
      </div>
      <div
        className="max-w-[45%] shrink-0 overflow-hidden text-right"
        style={{ whiteSpace: "nowrap" }}
      >
        {numeric}
      </div>
    </div>
  );
}

function AmountRow({
  label,
  value,
  size,
  bold,
}: {
  label: string;
  value: string;
  size: number;
  bold?: boolean;
}) {
  return (
    <div
      className="mb-[3px] flex justify-between gap-2"
      style={{
        fontFamily: mono,
        fontSize: size,
        fontWeight: bold ? 800 : 400,
        lineHeight: bold ? 1 : 1.22,
      }}
    >
      <span className="min-w-0 truncate">{label}</span>
      <span className="shrink-0 whitespace-nowrap">{value}</span>
    </div>
  );
}

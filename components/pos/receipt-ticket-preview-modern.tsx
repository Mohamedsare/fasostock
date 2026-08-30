"use client";

import { Archivo_Black } from "next/font/google";
import QRCode from "react-qr-code";
import { useEffect, useState } from "react";
import type { ReceiptTicketData } from "@/lib/features/receipt/receipt-ticket-types";
import {
  buildReceiptQrPayload,
  formatDateStrFr,
  formatTimeStrFr,
  paymentUppercase,
  receiptGroupedNumber,
  telLine,
} from "@/lib/features/receipt/receipt-ticket-format";
import { formatCurrencyFlutter } from "@/lib/utils/currency";

const archivoBlack = Archivo_Black({
  weight: "400",
  subsets: ["latin"],
  display: "swap",
});

/**
 * Ticket thermique — modèle « Moderne » (`stores.receipt_template = 'moderne'`).
 *
 * Jumeau à l'écran de `renderReceiptThermalModernHtml` (impression) : toute retouche
 * ici doit être reportée là-bas, sinon l'aperçu de la page Boutiques ment sur ce qui
 * sortira de l'imprimante. Les tailles sont **celles du PDF**, sans agrandissement :
 * la zone de contenu de cet aperçu (296 px moins les marges) fait 272 px, exactement
 * le viewport de rendu du ticket 80 mm — à valeurs égales, les noms d'articles vont
 * donc à la ligne au même endroit à l'écran et sur le papier.
 *
 * Deux partis pris, contre le modèle classique :
 * - le nom d'article occupe sa propre ligne, qté × PU en dessous. Aucune troncature,
 *   y compris en 58 mm où les colonnes du modèle classique coupent à 16 caractères ;
 * - filets pleins au lieu de lignes de tirets, et total en bandeau noir : c'est ce que
 *   le client regarde en premier.
 */
export function ReceiptTicketPreviewModern({ data }: { data: ReceiptTicketData }) {
  const payU = paymentUppercase(data.paymentMethod);
  const isCashLike = payU === "ESPECES";
  const creditRemaining = Math.max(0, data.creditRemaining ?? 0);
  const tel = telLine(data.storePhone);
  const qrPayload = buildReceiptQrPayload(data);
  const [logoErr, setLogoErr] = useState(false);
  const logoUrl = data.storeLogoUrl?.trim() ?? "";
  const money = (n: number) =>
    formatCurrencyFlutter(Math.round(n), data.currencyCode);
  const unitPrice = (n: number) => receiptGroupedNumber(n, data.currencyCode);

  useEffect(() => {
    setLogoErr(false);
  }, [logoUrl]);

  const subLine = [data.storeAddress?.trim(), tel].filter(Boolean).join(" · ");

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
        fontFamily: "system-ui, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      {logoUrl && !logoErr ? (
        <div className="mb-2 flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logoUrl}
            alt=""
            className="max-h-[76px] max-w-[240px] object-contain object-center"
            onError={() => setLogoErr(true)}
          />
        </div>
      ) : null}

      <p
        className={`${archivoBlack.className} text-center uppercase`}
        style={{
          fontSize: 19,
          letterSpacing: 0.9,
          lineHeight: 1.1,
          margin: 0,
          display: "-webkit-box",
          WebkitLineClamp: 3,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {data.storeName.toUpperCase()}
      </p>
      {subLine ? (
        <p
          className="text-center"
          style={{ fontSize: 7.5, lineHeight: 1.3, color: "#333", margin: "3px 0 0" }}
        >
          {subLine}
        </p>
      ) : null}

      <Rule strong />
      <Kv label="Reçu n°" value={data.saleNumber} strong />
      <Kv
        label="Date"
        value={`${formatDateStrFr(data.date)} · ${formatTimeStrFr(data.date)}`}
      />
      {data.customerName?.trim() ? (
        <Kv label="Client" value={data.customerName.trim()} />
      ) : null}
      <Rule />

      <p style={tagStyle}>Articles</p>
      {data.items.map((item, i) => (
        <div key={i} style={{ marginBottom: 5 }}>
          <div style={{ fontSize: 8.5, fontWeight: 600, lineHeight: 1.25 }}>
            {item.name.trim()}
          </div>
          <div
            className="flex items-baseline justify-between gap-2"
            style={{ fontSize: 8, lineHeight: 1.3, marginTop: 1 }}
          >
            <span style={{ color: "#333" }}>
              {item.quantity} × {unitPrice(item.unitPrice)}
            </span>
            <span style={{ fontWeight: 700, whiteSpace: "nowrap" }}>
              {money(item.total)}
            </span>
          </div>
        </div>
      ))}
      <Rule />

      <Kv label="Sous-total" value={money(data.subtotal)} />
      {data.discount > 0 ? (
        <Kv label="Remise" value={`- ${money(data.discount)}`} />
      ) : null}

      <div
        className="flex items-center justify-between gap-2"
        style={{
          backgroundColor: "#000000",
          color: "#FFFFFF",
          padding: "4px 6px",
          margin: "6px 0",
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: 0.3,
          WebkitPrintColorAdjust: "exact",
          printColorAdjust: "exact",
        }}
      >
        <span>TOTAL</span>
        <span style={{ whiteSpace: "nowrap" }}>{money(data.total)}</span>
      </div>

      <Kv label="Paiement" value={payU} strong />
      {(data.paymentSplit ?? []).map((p, i) => (
        <Kv key={i} label={p.label} value={money(p.amount)} />
      ))}
      {isCashLike ? (
        <>
          <Kv label="Reçu" value={money(data.amountReceived ?? data.total)} />
          <Kv label="Rendu" value={money(data.change ?? 0)} />
        </>
      ) : null}

      {creditRemaining > 0 ? (
        <div style={{ border: "1px solid #000", padding: "4px 6px", marginTop: 5 }}>
          <Kv label="Acompte versé" value={money(data.creditPaid ?? 0)} />
          <div
            className="flex items-baseline justify-between gap-2"
            style={{ fontSize: 9.5, fontWeight: 800, marginTop: 2 }}
          >
            <span>RESTE À PAYER</span>
            <span style={{ whiteSpace: "nowrap" }}>{money(creditRemaining)}</span>
          </div>
          {data.creditDueLabel?.trim() ? (
            <Kv label="Échéance" value={data.creditDueLabel.trim()} />
          ) : null}
        </div>
      ) : null}

      <Rule />
      <div className="flex justify-center" style={{ marginTop: 2 }}>
        <div className="bg-white">
          <QRCode
            value={qrPayload}
            size={58}
            level="M"
            fgColor="#000000"
            bgColor="#FFFFFF"
          />
        </div>
      </div>
      <p
        className="text-center"
        style={{ fontSize: 6.5, color: "#333", margin: "3px 0 0" }}
      >
        Scannez pour vérifier ce ticket
      </p>
      <p
        className="text-center"
        style={{ fontSize: 9, fontWeight: 700, margin: "7px 0 0" }}
      >
        Merci pour votre achat !
      </p>
      <Rule />
      <p className="text-center" style={{ fontSize: 6.5, color: "#555", margin: 0 }}>
        Powered by FasoStock POS
      </p>
    </div>
  );
}

const tagStyle: React.CSSProperties = {
  fontSize: 6.5,
  letterSpacing: 1.4,
  textTransform: "uppercase",
  color: "#444",
  margin: "0 0 4px",
  fontWeight: 700,
};

function Rule({ strong }: { strong?: boolean }) {
  return (
    <div
      style={{
        borderTop: `${strong ? 1.2 : 1}px solid ${strong ? "#000" : "#BBB"}`,
        margin: "7px 0",
      }}
    />
  );
}

function Kv({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div
      className="flex items-baseline justify-between gap-2"
      style={{ fontSize: 8, lineHeight: 1.45 }}
    >
      <span className="min-w-0 truncate" style={{ color: "#333" }}>
        {label}
      </span>
      <span
        className="shrink-0"
        style={{ whiteSpace: "nowrap", fontWeight: strong ? 700 : 600 }}
      >
        {value}
      </span>
    </div>
  );
}

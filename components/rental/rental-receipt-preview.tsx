"use client";

import { Archivo_Black } from "next/font/google";
import QRCode from "react-qr-code";
import { useEffect, useState } from "react";
import {
  buildRentalQrPayload,
  rentalReceiptTitle,
  type RentalReceiptData,
} from "@/lib/features/rental/ticket-types";
import { RENTAL_METHOD_LABELS } from "@/lib/features/rental/types";
import {
  RECEIPT_SEP_LONG,
  RECEIPT_SEP_MID,
  formatDateStrFr,
  formatTimeStrFr,
  receiptIntAmount,
  telLine,
} from "@/lib/features/receipt/receipt-ticket-format";

const archivoBlack = Archivo_Black({ weight: "400", subsets: ["latin"], display: "swap" });

const mono = "'Courier New', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";

function shortDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return formatDateStrFr(d);
}

/** Aperçu écran de la quittance — reflet fidèle du PDF thermique imprimé. */
export function RentalReceiptPreview({ data }: { data: RentalReceiptData }) {
  const [logoErr, setLogoErr] = useState(false);
  const logoUrl = data.storeLogoUrl ?? "";
  useEffect(() => {
    setLogoErr(false);
  }, [logoUrl]);

  const isRefund = data.kind === "deposit_refund";
  const owes = data.balanceAfter > 0.5;
  const advance = data.balanceAfter < -0.5;
  const tel = telLine(data.storePhone);
  const paidThrough = shortDate(data.paidThrough);
  const next = shortDate(data.nextDueDate);

  return (
    <div
      className="mx-auto box-border w-[296px] max-w-full px-3 py-4"
      style={{
        backgroundColor: "#FDFBF7",
        border: "1px solid #CCCCCC",
        boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
        color: "#000000",
      }}
    >
      <div style={{ fontSize: 9.5, lineHeight: 1.22 }}>
        {logoUrl && !logoErr ? (
          <div className="mb-2 flex justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
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
          style={{ fontSize: 25, letterSpacing: 0.65, lineHeight: 1.05, margin: 0 }}
        >
          {data.storeName.toUpperCase()}
        </p>
        {data.storeAddress ? <Centered>{data.storeAddress}</Centered> : null}
        {tel ? <Centered>{tel}</Centered> : null}

        <div style={{ height: 8 }} />
        <p
          className="text-center"
          style={{
            fontFamily: mono,
            fontSize: 12,
            fontWeight: 800,
            letterSpacing: 0.6,
            borderTop: "1px solid #000",
            borderBottom: "1px solid #000",
            padding: "2px 0",
            margin: 0,
          }}
        >
          {rentalReceiptTitle(data.kind)}
        </p>
        <Centered>Gestion locative</Centered>
        <div style={{ height: 5 }} />
        <p className="text-center" style={{ fontFamily: mono, fontSize: 10, margin: 0 }}>
          {data.receiptNumber} · {formatDateStrFr(data.paidAt)} {formatTimeStrFr(data.paidAt)}
        </p>
        <div style={{ height: 5 }} />
        <Separator text={RECEIPT_SEP_LONG} />

        <Row k="Bail" v={data.leaseNumber} />
        <Row k="Locataire" v={data.tenantName} />
        {data.tenantPhone ? <Row k="Tel" v={data.tenantPhone} /> : null}
        <Row k="Bien" v={data.propertyName} />
        <Row k="Lot" v={data.unitLabel} />
        {data.propertyAddress ? <Row k="Adresse" v={data.propertyAddress} /> : null}

        <Separator text={RECEIPT_SEP_LONG} />
        <div style={{ height: 4 }} />
        <p
          className="text-center"
          style={{ fontFamily: mono, fontSize: 8.5, letterSpacing: 0.5, margin: 0 }}
        >
          {isRefund ? "CAUTION RESTITUEE" : "MONTANT RECU"}
        </p>
        <p
          className="text-center"
          style={{ fontFamily: mono, fontSize: 21, fontWeight: 800, margin: 0, lineHeight: 1.1 }}
        >
          {receiptIntAmount(data.amount)}
        </p>
        <div style={{ height: 4 }} />
        {data.periodsCovered ? <Row k="Période(s)" v={data.periodsCovered} /> : null}
        {data.method ? (
          <Row k="Paiement" v={RENTAL_METHOD_LABELS[data.method].toUpperCase()} />
        ) : null}
        {data.reference ? <Row k="Référence" v={data.reference} /> : null}
        <Separator text={RECEIPT_SEP_LONG} />
        <div style={{ height: 4 }} />

        <Row k="Loyer mensuel" v={receiptIntAmount(data.rentAmount)} />
        {paidThrough ? <Row k="À jour jusqu'au" v={paidThrough} /> : null}
        {owes ? (
          <>
            <Row k="Reste à payer" v={receiptIntAmount(data.balanceAfter)} />
            {next ? <Row k="Prochaine échéance" v={next} /> : null}
          </>
        ) : advance ? (
          <Row k="Avance en votre faveur" v={receiptIntAmount(Math.abs(data.balanceAfter))} />
        ) : (
          <Row k="Situation" v="COMPTE A JOUR" />
        )}

        {data.note ? (
          <p style={{ fontFamily: mono, fontSize: 8.5, marginTop: 6, marginBottom: 0 }}>
            Note : {data.note}
          </p>
        ) : null}
        {data.cashierName ? (
          <p style={{ fontFamily: mono, fontSize: 8.5, marginTop: 4, marginBottom: 0 }}>
            Reçu par : {data.cashierName}
          </p>
        ) : null}

        <div style={{ height: 6 }} />
        <Separator text={RECEIPT_SEP_LONG} />
        <div style={{ height: 6 }} />
        <p style={{ fontFamily: mono, fontSize: 8.5, margin: 0 }}>Signature du bailleur</p>
        <div style={{ borderBottom: "1px dotted #000", height: 18 }} />

        <div style={{ height: 8 }} />
        <div className="flex justify-center">
          <QRCode
            value={buildRentalQrPayload(data)}
            size={52}
            level="M"
            fgColor="#000000"
            bgColor="#FFFFFF"
          />
        </div>
        <div style={{ height: 8 }} />
        <p
          className="text-center"
          style={{ fontFamily: mono, fontSize: 10, fontWeight: 700, margin: 0 }}
        >
          {isRefund ? "Caution remise au locataire" : "Conservez bien cette quittance !"}
        </p>
        <Centered>Ce reçu atteste du paiement ci-dessus pour le logement indiqué.</Centered>
        <div style={{ height: 6 }} />
        <Separator text={RECEIPT_SEP_MID} />
        <p
          className="text-center"
          style={{ fontFamily: mono, fontSize: 8.5, color: "#333333", margin: 0 }}
        >
          Powered by FasoStock
        </p>
        <Separator text={RECEIPT_SEP_MID} />
      </div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-center" style={{ fontFamily: mono, fontSize: 9, margin: 0 }}>
      {children}
    </p>
  );
}

function Separator({ text }: { text: string }) {
  return (
    <div
      className="w-full overflow-hidden text-center"
      style={{ fontFamily: mono, fontSize: 9, lineHeight: 1.2, whiteSpace: "nowrap" }}
    >
      {text}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div
      className="mb-[3px] flex justify-between gap-2"
      style={{ fontFamily: mono, fontSize: 9.5 }}
    >
      <span className="shrink-0">{k}</span>
      <span className="min-w-0 break-words text-right font-bold">{v}</span>
    </div>
  );
}

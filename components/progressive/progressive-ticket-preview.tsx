"use client";

import { Archivo_Black } from "next/font/google";
import QRCode from "react-qr-code";
import { useEffect, useState } from "react";
import {
  buildProgressiveQrPayload,
  progressiveTicketTitle,
  type ProgressiveTicketData,
} from "@/lib/features/progressive/ticket-types";
import { progressiveTerms } from "@/lib/features/progressive/progressive-terms";
import { PROGRESSIVE_METHOD_LABELS } from "@/lib/features/progressive/types";
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

/** Aperçu écran du ticket d'avance — reflet fidèle du PDF thermique imprimé. */
export function ProgressiveTicketPreview({ data }: { data: ProgressiveTicketData }) {
  const [logoErr, setLogoErr] = useState(false);
  const logoUrl = data.storeLogoUrl ?? "";
  useEffect(() => {
    setLogoErr(false);
  }, [logoUrl]);

  const isRefund = data.kind === "refund";
  const goal = data.targetAmount != null && data.targetAmount > 0 ? data.targetAmount : null;
  const remaining = goal != null ? Math.max(0, goal - data.balanceAfter) : null;
  const ratio = goal != null && goal > 0 ? Math.min(1, data.balanceAfter / goal) : 0;
  const tel = telLine(data.storePhone);
  const terms = progressiveTerms(data.businessTypeSlug);

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
          {progressiveTicketTitle(data.kind)}
        </p>
        <Centered>Achat progressif</Centered>
        <div style={{ height: 5 }} />
        <p className="text-center" style={{ fontFamily: mono, fontSize: 10, margin: 0 }}>
          {data.receiptNumber} · {formatDateStrFr(data.createdAt)} {formatTimeStrFr(data.createdAt)}
        </p>
        <div style={{ height: 5 }} />
        <Separator text={RECEIPT_SEP_LONG} />

        <Row k="Dossier" v={data.planNumber} />
        <Row k="Client" v={data.clientName} />
        {data.clientPhone ? <Row k="Tel" v={data.clientPhone} /> : null}
        {data.targetProductName ? (
          <Row k={`${terms.singularCap} visé`} v={data.targetProductName} />
        ) : null}

        <Separator text={RECEIPT_SEP_LONG} />
        <div style={{ height: 4 }} />
        <p
          className="text-center"
          style={{ fontFamily: mono, fontSize: 8.5, letterSpacing: 0.5, margin: 0 }}
        >
          {isRefund ? "MONTANT REMBOURSE" : "MONTANT VERSE"}
        </p>
        <p
          className="text-center"
          style={{ fontFamily: mono, fontSize: 21, fontWeight: 800, margin: 0, lineHeight: 1.1 }}
        >
          {receiptIntAmount(data.amount)}
        </p>
        <div style={{ height: 4 }} />
        {data.method ? (
          <Row k="Paiement" v={PROGRESSIVE_METHOD_LABELS[data.method].toUpperCase()} />
        ) : null}
        {data.reference ? <Row k="Référence" v={data.reference} /> : null}
        <Separator text={RECEIPT_SEP_LONG} />
        <div style={{ height: 4 }} />

        <Row k="Total versé" v={receiptIntAmount(data.totalDeposited)} />
        <Row k="Épargne disponible" v={receiptIntAmount(data.balanceAfter)} />
        {goal != null ? (
          <>
            <Row k="Objectif" v={receiptIntAmount(goal)} />
            <Row k="Reste à verser" v={receiptIntAmount(remaining ?? 0)} />
            <div style={{ height: 3 }} />
            <p className="text-center" style={{ fontFamily: mono, fontSize: 9.5, margin: 0 }}>
              {`[${"#".repeat(Math.round(ratio * 18))}${"-".repeat(
                18 - Math.round(ratio * 18),
              )}] ${Math.round(ratio * 100)}%`}
            </p>
          </>
        ) : null}

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
        <p style={{ fontFamily: mono, fontSize: 8.5, margin: 0 }}>Signature client</p>
        <div style={{ borderBottom: "1px dotted #000", height: 18 }} />

        <div style={{ height: 8 }} />
        <div className="flex justify-center">
          <QRCode
            value={buildProgressiveQrPayload(data)}
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
          {isRefund ? "Remboursement remis au client" : "Conservez bien ce ticket !"}
        </p>
        <Centered>Ce reçu justifie votre épargne — il ne vaut pas facture de vente.</Centered>
        <div style={{ height: 6 }} />
        <Separator text={RECEIPT_SEP_MID} />
        <p
          className="text-center"
          style={{ fontFamily: mono, fontSize: 8.5, color: "#333333", margin: 0 }}
        >
          Powered by FasoStock POS
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

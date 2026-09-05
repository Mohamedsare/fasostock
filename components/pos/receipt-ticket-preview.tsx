"use client";

import { Archivo_Black } from "next/font/google";
import QRCode from "react-qr-code";
import {
  layoutOn,
  layoutText,
  parseInvoiceLayout,
} from "@/lib/features/invoices/invoice-layout";
import { useEffect, useState } from "react";
import type { ReceiptTicketData } from "@/lib/features/receipt/receipt-ticket-types";
import {
  normalizeReceiptTemplate,
  type ReceiptTicketTemplate,
} from "@/lib/features/receipt/receipt-ticket-template";
import { ReceiptTicketPreviewModern } from "@/components/pos/receipt-ticket-preview-modern";
import {
  buildReceiptQrPayload,
  metaFactureDateHeureLine,
  paymentUppercase,
  receiptGroupedNumber,
  telLine,
} from "@/lib/features/receipt/receipt-ticket-format";
import { currencySymbolOf } from "@/lib/config/currencies";
import { formatCurrencyFlutter } from "@/lib/utils/currency";

const archivoBlack = Archivo_Black({
  weight: "400",
  subsets: ["latin"],
  display: "swap",
});

const mono =
  "'Courier New', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";

/**
 * Aperçu du ticket thermique, dans la mise en forme de la boutique.
 *
 * `template` n'est utile qu'au dialogue de configuration, qui montre un modèle avant
 * qu'il soit enregistré ; partout ailleurs le modèle voyage dans `data`, comme la devise.
 */
export function ReceiptTicketPreview({
  data,
  template,
}: {
  data: ReceiptTicketData;
  template?: ReceiptTicketTemplate;
}) {
  const resolved = template ?? normalizeReceiptTemplate(data.receiptTemplate);
  if (resolved === "moderne") return <ReceiptTicketPreviewModern data={data} />;
  return <ReceiptTicketPreviewClassic data={data} />;
}

/**
 * Ticket thermique — modèle « Classique », jumeau à l'écran de
 * `renderReceiptThermalClassicHtml` (impression) : toute retouche ici doit être
 * reportée là-bas.
 *
 * Les tailles sont **celles du PDF**, sans agrandissement : la zone de contenu de cet
 * aperçu (296 px moins les marges) fait 272 px, exactement le viewport de rendu du
 * ticket 80 mm — à valeurs égales, un nom d'article passe à la ligne au même endroit
 * à l'écran et sur le papier.
 */
function ReceiptTicketPreviewClassic({ data }: { data: ReceiptTicketData }) {
  const payU = paymentUppercase(data.paymentMethod);
  const isCashLike = payU === "ESPECES";
  /** Vente à crédit : preuve de dette au client (acompte + reste dû). */
  const creditRemaining = Math.max(0, data.creditRemaining ?? 0);
  const L = parseInvoiceLayout(data.layout);
  const tel = telLine(data.storePhone);
  const qrPayload = buildReceiptQrPayload(data);
  const [logoErr, setLogoErr] = useState(false);
  const logoUrl = layoutOn(L, "t.logo") ? (data.storeLogoUrl?.trim() ?? "") : "";
  const money = (n: number) =>
    formatCurrencyFlutter(Math.round(n), data.currencyCode);
  const num = (n: number) => receiptGroupedNumber(n, data.currencyCode);
  const currency = currencySymbolOf(data.currencyCode ?? undefined);

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
      <div style={{ fontSize: 8, lineHeight: 1.3 }}>
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
        {data.storeAddress?.trim() && layoutOn(L, "t.address") ? (
          <p
            className="text-center"
            style={{ fontFamily: mono, fontSize: 7, margin: 0 }}
          >
            {data.storeAddress.trim()}
          </p>
        ) : null}
        {tel && layoutOn(L, "t.phone") ? (
          <p
            className="text-center"
            style={{ fontFamily: mono, fontSize: 7, margin: 0 }}
          >
            {tel}
          </p>
        ) : null}
        {layoutOn(L, "t.meta") ? (
          <p
            className="text-center"
            style={{ fontFamily: mono, fontSize: 8.5, margin: "6px 0 0" }}
          >
            {metaFactureDateHeureLine(data.saleNumber, data.date)}
          </p>
        ) : null}

        <Separator />
        <table
          className="w-full border-collapse"
          style={{ fontFamily: mono, fontSize: 8 }}
        >
          <thead>
            <tr style={{ fontWeight: 700 }}>
              <th className="whitespace-nowrap pb-[3px] text-left">
                {layoutText(L, "t.colDesc", "Produit")}
              </th>
              {layoutOn(L, "t.colQty") ? (
                <th className="whitespace-nowrap px-[6px] pb-[3px] text-center">
                  {layoutText(L, "t.colQty", "Qté")}
                </th>
              ) : null}
              {layoutOn(L, "t.colPrice") ? (
                <th className="whitespace-nowrap pb-[3px] pl-[8px] text-right">
                  {layoutText(L, "t.colPrice", `PU (${currency})`)}
                </th>
              ) : null}
              {layoutOn(L, "t.colTotal") ? (
                <th className="whitespace-nowrap pb-[3px] pl-[8px] text-right">
                  {layoutText(L, "t.colTotal", "Total")}
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {data.items.map((item, i) => (
              <tr key={i}>
                {/* Nom complet : il passe à la ligne, les chiffres restent alignés. */}
                <td
                  className="pb-[3px] pr-[6px] align-top"
                  style={{ wordBreak: "break-word" }}
                >
                  {item.name.trim()}
                </td>
                {layoutOn(L, "t.colQty") ? (
                  <td className="whitespace-nowrap px-[6px] pb-[3px] text-center align-top">
                    {item.quantity}
                  </td>
                ) : null}
                {layoutOn(L, "t.colPrice") ? (
                  <td className="whitespace-nowrap pb-[3px] pl-[8px] text-right align-top">
                    {num(item.unitPrice)}
                  </td>
                ) : null}
                {layoutOn(L, "t.colTotal") ? (
                  <td className="whitespace-nowrap pb-[3px] pl-[8px] text-right align-top">
                    {num(item.total)}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
        <Separator />

        {layoutOn(L, "t.subtotal") ? (
          <AmountRow
            label={layoutText(L, "t.subtotal", "Sous-total")}
            value={money(data.subtotal)}
            size={8}
          />
        ) : null}
        {data.discount > 0 && layoutOn(L, "t.discount") ? (
          <AmountRow
            label={layoutText(L, "t.discount", "Remise")}
            value={`- ${money(data.discount)}`}
            size={8}
          />
        ) : null}
        <Separator solid />
        <AmountRow
          label={layoutText(L, "t.total", "TOTAL")}
          value={money(data.total)}
          size={12}
          bold
        />
        <Separator solid />

        {layoutOn(L, "t.payment") ? (
          <>
            <AmountRow
              label={layoutText(L, "t.payment", "Paiement")}
              value={payU}
              size={8}
              boldValue
            />
            {(data.paymentSplit ?? []).map((p, i) => (
              <AmountRow key={i} label={p.label} value={money(p.amount)} size={8} />
            ))}
          </>
        ) : null}
        {isCashLike && layoutOn(L, "t.received") ? (
          <AmountRow
            label={layoutText(L, "t.received", "Reçu")}
            value={money(data.amountReceived ?? data.total)}
            size={8}
          />
        ) : null}
        {isCashLike && layoutOn(L, "t.change") ? (
          <AmountRow
            label={layoutText(L, "t.change", "Rendu")}
            value={money(data.change ?? 0)}
            size={8}
          />
        ) : null}
        {data.customerName?.trim() && layoutOn(L, "t.customer") ? (
          <AmountRow
            label={layoutText(L, "t.customer", "Client")}
            value={data.customerName.trim()}
            size={8}
          />
        ) : null}
        {creditRemaining > 0 && layoutOn(L, "t.credit") ? (
          <>
            <Separator />
            <AmountRow label="Acompte" value={money(data.creditPaid ?? 0)} size={8} />
            <AmountRow
              label="RESTE À PAYER"
              value={money(creditRemaining)}
              size={8}
              bold
            />
            {data.creditDueLabel?.trim() ? (
              <AmountRow
                label="Échéance"
                value={data.creditDueLabel.trim()}
                size={8}
              />
            ) : null}
          </>
        ) : null}

        {layoutOn(L, "t.qr") ? (
          <div className="flex justify-center" style={{ marginTop: 9 }}>
            <div className="bg-white" style={{ padding: 0 }}>
              <QRCode
                value={qrPayload}
                size={52}
                level="M"
                fgColor="#000000"
                bgColor="#FFFFFF"
              />
            </div>
          </div>
        ) : null}
        {layoutOn(L, "t.thanks") ? (
          <p
            className="text-center"
            style={{
              fontFamily: mono,
              fontSize: 8.5,
              fontWeight: 700,
              margin: "7px 0 0",
            }}
          >
            {layoutText(L, "t.thanks", "Merci pour votre achat !")}
          </p>
        ) : null}
        {layoutOn(L, "t.powered") ? (
          <>
            <Separator />
            <p
              className="text-center"
              style={{
                fontFamily: mono,
                fontSize: 7,
                color: "#333333",
                margin: 0,
              }}
            >
              Powered by FasoStock POS
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Filet à la largeur exacte du ticket. Avant, c'était une chaîne de tirets de longueur
 * fixe : trop longue pour le papier 58 mm, elle sortait rognée en plein milieu.
 */
function Separator({ solid }: { solid?: boolean }) {
  return (
    <div
      style={{
        borderTop: `1px ${solid ? "solid" : "dashed"} #000`,
        margin: "5px 0",
      }}
    />
  );
}

function AmountRow({
  label,
  value,
  size,
  bold,
  boldValue,
}: {
  label: string;
  value: string;
  size: number;
  bold?: boolean;
  boldValue?: boolean;
}) {
  return (
    <div
      className="flex items-baseline justify-between gap-2"
      style={{
        fontFamily: mono,
        fontSize: size,
        fontWeight: bold ? 700 : 400,
        letterSpacing: bold ? 0.3 : undefined,
        lineHeight: 1.4,
        margin: bold ? "3px 0" : undefined,
      }}
    >
      <span className="min-w-0 truncate">{label}</span>
      <span
        className="shrink-0 whitespace-nowrap"
        style={{ fontWeight: boldValue ? 700 : undefined }}
      >
        {value}
      </span>
    </div>
  );
}

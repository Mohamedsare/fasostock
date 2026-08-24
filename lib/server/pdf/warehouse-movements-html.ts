import { formatCurrency } from "@/lib/utils/currency";
import { escapeHtml } from "./escape-html";
import { TABLE_PAGINATION_CSS } from "./table-pagination-css";

function tx(s: string): string {
  return escapeHtml(s ?? "");
}

const BLUE = "#2563EB";
const BLUE_DARK = "#1D4ED8";
const BLUE_DEEP = "#1E3A8A";
const BLUE_TINT = "#EFF6FF";
const BLUE_LINE = "#DBEAFE";
/** Sorties : la seule couleur non bleue du document, pour qu'elles se repèrent d'un coup d'oeil. */
const AMBER = "#B45309";

export type WarehouseMovementPdfRow = {
  /** Heure locale déjà formatée par le client : le serveur n'a pas son fuseau. */
  time: string;
  productName: string;
  sku: string | null;
  isEntry: boolean;
  quantity: number;
  packagingLabel: string;
  packsQuantity: number;
  unitCost: number | null;
  reference: string;
  author: string | null;
};

/**
 * Journal des mouvements d'une journée du dépôt.
 *
 * Ce qu'on vient y chercher, dans cet ordre : combien est entré, combien est sorti,
 * et qui a écrit quoi. D'où le bandeau de totaux avant le détail — la question tient
 * en trois chiffres, on ne devrait pas avoir à additionner les lignes pour y répondre.
 *
 * L'heure, le jour et les libellés arrivent déjà formatés du client : le rendu est
 * partagé entre requêtes et n'a ni fuseau ni devise ambiante.
 */
export function renderWarehouseMovementsHtml(data: {
  companyName: string;
  companyLogoSrc?: string | null;
  warehouseName: string;
  /** Jour couvert, en toutes lettres (« lundi 21 août 2026 »). */
  dayLabel: string;
  generatedLabel: string;
  currencyCode: string;
  scopeLabel: string | null;
  rows: WarehouseMovementPdfRow[];
}): string {
  const money = (v: number) => formatCurrency(v, data.currencyCode);
  const int = (v: number) => new Intl.NumberFormat("fr-FR").format(Math.round(v));

  const entries = data.rows.filter((r) => r.isEntry);
  const exits = data.rows.filter((r) => !r.isEntry);
  const sumQty = (list: WarehouseMovementPdfRow[]) =>
    list.reduce((acc, r) => acc + (Number.isFinite(r.quantity) ? r.quantity : 0), 0);
  const entriesValue = entries.reduce(
    (acc, r) => acc + (r.unitCost != null ? r.unitCost * r.quantity : 0),
    0,
  );
  const entriesQty = sumQty(entries);
  const exitsQty = sumQty(exits);

  const tile = (label: string, value: string, accent: string, hint: string) => `
    <div class="tile">
      <div class="tile-label">${tx(label)}</div>
      <div class="tile-value" style="color:${accent}">${tx(value)}</div>
      <div class="tile-hint">${tx(hint)}</div>
    </div>`;

  const rows =
    data.rows.length === 0
      ? `<tr><td colspan="8" class="empty">Aucun mouvement enregistré ce jour-là.</td></tr>`
      : data.rows
          .map((r) => {
            const color = r.isEntry ? BLUE_DARK : AMBER;
            const packs =
              r.packsQuantity !== 1
                ? `${tx(r.packagingLabel)} x${int(r.packsQuantity)}`
                : tx(r.packagingLabel);
            return `<tr>
      <td class="t-time">${tx(r.time)}</td>
      <td class="t-name">
        <span class="pname">${tx(r.productName)}</span>
        ${r.sku ? `<span class="psku">${tx(r.sku)}</span>` : ""}
      </td>
      <td class="t-kind">
        <span class="badge" style="background:${color}14; color:${color}">${r.isEntry ? "Entrée" : "Sortie"}</span>
      </td>
      <td class="t-num" style="color:${color}">${r.isEntry ? "+" : "-"}${int(r.quantity)}</td>
      <td class="t-pack">${packs}</td>
      <td class="t-num soft">${r.unitCost != null ? tx(money(r.unitCost)) : "—"}</td>
      <td class="t-ref">${tx(r.reference)}</td>
      <td class="t-who">${r.author ? tx(r.author) : "—"}</td>
    </tr>`;
          })
          .join("");

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <style>
${TABLE_PAGINATION_CSS}
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 22px 26px 26px;
      font-family: "Segoe UI", Roboto, Arial, sans-serif;
      color: #0F172A;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      font-size: 11px;
      background: #fff;
    }
    .topbar {
      height: 6px;
      margin: -22px -26px 18px;
      background: linear-gradient(90deg, ${BLUE}, ${BLUE_DEEP});
    }
    .head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
    .eyebrow {
      font-size: 9.5px;
      font-weight: 800;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: ${BLUE};
    }
    h1 { margin: 3px 0 0; font-size: 21px; font-weight: 800; letter-spacing: -0.02em; color: ${BLUE_DEEP}; }
    .day { margin-top: 5px; font-size: 13px; font-weight: 700; color: #1F2937; }
    /* Majuscule au seul premier mot : capitalize donnerait « Vendredi 21 Août 2026 ». */
    .day::first-letter { text-transform: uppercase; }
    .head-right { text-align: right; }
    .head-right img { height: 40px; max-width: 120px; object-fit: contain; display: block; margin-left: auto; }
    .company { margin-top: 6px; font-size: 12px; font-weight: 700; color: #111827; }
    .meta { margin-top: 3px; font-size: 10px; color: #64748B; }

    .tiles { margin-top: 16px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
    .tile { border: 1px solid ${BLUE_LINE}; border-radius: 10px; padding: 9px 11px; background: ${BLUE_TINT}; }
    .tile-label { font-size: 9px; font-weight: 800; letter-spacing: 0.07em; text-transform: uppercase; color: #64748B; }
    .tile-value { margin-top: 3px; font-size: 17px; font-weight: 800; font-variant-numeric: tabular-nums; letter-spacing: -0.02em; }
    .tile-hint { margin-top: 1px; font-size: 9px; color: #94A3B8; }

    .scope { margin-top: 10px; font-size: 10px; color: #475569; }
    .scope b { color: ${BLUE_DARK}; }

    table { width: 100%; border-collapse: collapse; margin-top: 14px; }
    thead th {
      text-align: left;
      background: ${BLUE_DARK};
      color: #fff;
      padding: 7px 8px;
      font-size: 9px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      white-space: nowrap;
    }
    tbody td { border-bottom: 1px solid ${BLUE_LINE}; padding: 6px 8px; vertical-align: middle; }
    tbody tr:nth-child(even) td { background: #F8FAFF; }
    tbody tr { page-break-inside: avoid; }

    .t-time { width: 46px; font-variant-numeric: tabular-nums; font-weight: 700; color: #475569; white-space: nowrap; }
    .t-name { max-width: 210px; }
    .pname { display: block; font-weight: 700; color: #0F172A; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .psku { display: block; margin-top: 1px; font-size: 9px; color: #94A3B8; }
    .t-kind { width: 74px; }
    .badge { display: inline-block; padding: 2px 7px; border-radius: 999px; font-size: 9.5px; font-weight: 800; white-space: nowrap; }
    .t-num { width: 62px; text-align: right; font-weight: 800; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .t-num.soft { font-weight: 600; color: #475569; }
    .t-pack { width: 96px; color: #475569; white-space: nowrap; }
    .t-ref { max-width: 140px; color: #475569; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .t-who { max-width: 120px; color: #475569; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    tfoot td {
      padding: 8px;
      background: ${BLUE_TINT};
      border-top: 2px solid ${BLUE_DARK};
      font-weight: 800;
      color: ${BLUE_DEEP};
      font-variant-numeric: tabular-nums;
    }
    .empty { text-align: center; color: #64748B; padding: 22px; font-weight: 600; }
    .sign { margin-top: 22px; display: flex; justify-content: flex-end; page-break-inside: avoid; }
    .sign-box { width: 210px; border-top: 1px solid #CBD5E1; padding-top: 5px; font-size: 9.5px; color: #64748B; text-align: center; }
  </style>
</head>
<body>
  <div class="topbar"></div>
  <div class="head">
    <div>
      <div class="eyebrow">Journal du dépôt</div>
      <h1>Mouvements de stock</h1>
      <div class="day">${tx(data.dayLabel)}</div>
    </div>
    <div class="head-right">
      ${data.companyLogoSrc ? `<img src="${tx(data.companyLogoSrc)}" alt="" />` : ""}
      <div class="company">${tx(data.companyName || "—")}</div>
      <div class="meta">${tx(data.warehouseName || "Dépôt")}</div>
      <div class="meta">Édité le ${tx(data.generatedLabel)}</div>
    </div>
  </div>

  <div class="tiles">
    ${tile("Mouvements", int(data.rows.length), BLUE_DEEP, `ligne${data.rows.length > 1 ? "s" : ""} du jour`)}
    ${tile("Entrées", `+${int(entriesQty)}`, BLUE_DARK, `${int(entries.length)} écriture${entries.length > 1 ? "s" : ""}`)}
    ${tile("Sorties", `-${int(exitsQty)}`, AMBER, `${int(exits.length)} écriture${exits.length > 1 ? "s" : ""}`)}
    ${tile("Valeur des entrées", money(entriesValue), BLUE, "au coût saisi")}
  </div>

  ${data.scopeLabel ? `<div class="scope">Filtre appliqué : <b>${tx(data.scopeLabel)}</b></div>` : ""}

  <table>
    <thead>
      <tr>
        <th>Heure</th>
        <th>Produit</th>
        <th>Type</th>
        <th style="text-align:right">Qté</th>
        <th>Conditionnement</th>
        <th style="text-align:right">PU</th>
        <th>Référence</th>
        <th>Par qui</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
    ${
      data.rows.length === 0
        ? ""
        : `<tfoot>
      <tr>
        <td colspan="3">Total de la journée</td>
        <td style="text-align:right">+${int(entriesQty)} / -${int(exitsQty)}</td>
        <td colspan="2" style="text-align:right">${tx(money(entriesValue))}</td>
        <td colspan="2">${int(data.rows.length)} mouvement${data.rows.length > 1 ? "s" : ""}</td>
      </tr>
    </tfoot>`
    }
  </table>

  <div class="sign">
    <div class="sign-box">Visa du responsable du dépôt</div>
  </div>
</body>
</html>`;
}

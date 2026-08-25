import { formatCurrency } from "@/lib/utils/currency";
import { escapeHtml } from "./escape-html";
import { TABLE_PAGINATION_CSS } from "./table-pagination-css";

function tx(s: string): string {
  return escapeHtml(s ?? "");
}

/** Palette FasoStock : l'orange de marque porte le document, le reste est neutre. */
const ACCENT = "#E85D2C";
const ACCENT_DARK = "#C4441A";
const ACCENT_DEEP = "#7C2D12";
const ACCENT_TINT = "#FFF5F0";
const ACCENT_LINE = "#FBDDD0";
/** Manquant / surplus : les deux seules autres couleurs, parce qu'on vient les chercher. */
const RED = "#B91C1C";
const GREEN = "#047857";
const SLATE = "#475569";

export type InventorySessionPdfRow = {
  productName: string;
  expectedQty: number;
  /** null = produit jamais compté pendant la session. */
  countedQty: number | null;
  unitPurchasePrice: number;
};

export type InventorySessionPdfData = {
  companyName: string;
  companyLogoSrc?: string | null;
  /** « Boutique Centre » ou « Dépôt Central » — le lieu compté. */
  scopeName: string;
  /** « Boutique » ou « Dépôt ». */
  scopeKind: string;
  /** Titre de la session (note saisie), ou libellé de repli. */
  sessionTitle: string;
  statusLabel: string;
  status: "open" | "closed" | "cancelled";
  startedLabel: string;
  closedLabel: string | null;
  generatedLabel: string;
  currencyCode: string;
  /** Auteur du comptage, si connu. */
  countedByLabel: string | null;
  /** false = on n'imprime que les écarts (utile sur un très gros catalogue). */
  includeAllLines: boolean;
  rows: InventorySessionPdfRow[];
};

/**
 * Rapport d'inventaire A4 — la pièce qu'on classe, qu'on signe et qu'on ressort
 * six mois plus tard pour justifier une correction de stock.
 *
 * L'ordre suit la question qu'on se pose en le prenant en main : combien ça coûte
 * (le bandeau), qu'est-ce qui cloche (les écarts, du plus lourd au plus léger, en
 * premier), puis seulement la preuve du comptage complet. Les produits jamais
 * comptés sont dits explicitement plutôt que noyés à zéro : un inventaire partiel
 * qui se lit comme un inventaire complet est un rapport qui ment.
 *
 * Libellés, dates et fuseau arrivent formatés du client : ce rendu est partagé
 * entre requêtes et n'a ni fuseau ni devise ambiante.
 */
export function renderInventorySessionHtml(data: InventorySessionPdfData): string {
  const money = (v: number) => formatCurrency(v, data.currencyCode);
  const int = (v: number) => new Intl.NumberFormat("fr-FR").format(Math.round(v));
  const signed = (v: number) => `${v > 0 ? "+" : ""}${int(v)}`;
  const signedMoney = (v: number) => `${v > 0 ? "+" : ""}${money(v)}`;

  const counted = data.rows.filter((r) => r.countedQty != null);
  const notCounted = data.rows.filter((r) => r.countedQty == null);
  const withVariance = counted
    .map((r) => {
      const variance = (r.countedQty ?? 0) - r.expectedQty;
      return { ...r, variance, value: variance * r.unitPurchasePrice };
    })
    .filter((r) => r.variance !== 0)
    .sort(
      (a, b) =>
        Math.abs(b.value) - Math.abs(a.value) ||
        a.productName.localeCompare(b.productName, "fr"),
    );

  const missing = withVariance.filter((r) => r.variance < 0);
  const surplus = withVariance.filter((r) => r.variance > 0);
  const missingValue = missing.reduce((acc, r) => acc + r.value, 0);
  const surplusValue = surplus.reduce((acc, r) => acc + r.value, 0);
  const netValue = missingValue + surplusValue;
  const conform = counted.length - withVariance.length;
  const progress =
    data.rows.length > 0 ? Math.round((counted.length / data.rows.length) * 100) : 0;

  const tile = (label: string, value: string, hint: string, accent: string) => `
    <div class="tile">
      <div class="tile-label">${tx(label)}</div>
      <div class="tile-value" style="color:${accent}">${tx(value)}</div>
      <div class="tile-hint">${tx(hint)}</div>
    </div>`;

  // Le cas « aucun écart » ne passe pas par ce tableau : il a son propre encadré.
  const varianceRows = withVariance
    .map((r) => {
      const color = r.variance < 0 ? RED : GREEN;
      return `<tr>
      <td class="t-name"><span class="pname">${tx(r.productName)}</span></td>
      <td class="t-num soft">${int(r.expectedQty)}</td>
      <td class="t-num">${int(r.countedQty ?? 0)}</td>
      <td class="t-num" style="color:${color}">${signed(r.variance)}</td>
      <td class="t-num soft">${tx(money(r.unitPurchasePrice))}</td>
      <td class="t-num" style="color:${color}">${tx(signedMoney(r.value))}</td>
    </tr>`;
    })
    .join("");

  const detailRows = data.rows
    .map((r) => {
      const isCounted = r.countedQty != null;
      const variance = isCounted ? (r.countedQty ?? 0) - r.expectedQty : 0;
      const color = !isCounted ? "#94A3B8" : variance < 0 ? RED : variance > 0 ? GREEN : SLATE;
      const badge = !isCounted
        ? `<span class="badge" style="background:#F1F5F9; color:#64748B">Non compté</span>`
        : variance === 0
          ? `<span class="badge" style="background:${GREEN}12; color:${GREEN}">Conforme</span>`
          : `<span class="badge" style="background:${color}14; color:${color}">${variance < 0 ? "Manquant" : "Surplus"}</span>`;
      return `<tr${isCounted ? "" : ` class="row-todo"`}>
      <td class="t-name"><span class="pname">${tx(r.productName)}</span></td>
      <td class="t-num soft">${int(r.expectedQty)}</td>
      <td class="t-num">${isCounted ? int(r.countedQty ?? 0) : "—"}</td>
      <td class="t-num" style="color:${color}">${isCounted ? signed(variance) : "—"}</td>
      <td class="t-state">${badge}</td>
    </tr>`;
    })
    .join("");

  const partialNotice =
    notCounted.length > 0
      ? `<div class="notice">
      <b>Comptage partiel.</b> ${int(notCounted.length)} produit${notCounted.length > 1 ? "s n'ont" : " n'a"} pas été compté${notCounted.length > 1 ? "s" : ""} :
      leur stock théorique reste inchangé et n'est pas garanti par ce rapport.
    </div>`
      : "";

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
      background: linear-gradient(90deg, ${ACCENT}, ${ACCENT_DEEP});
    }
    .head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
    .eyebrow {
      font-size: 9.5px;
      font-weight: 800;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: ${ACCENT};
    }
    h1 { margin: 3px 0 0; font-size: 21px; font-weight: 800; letter-spacing: -0.02em; color: ${ACCENT_DEEP}; }
    .subtitle { margin-top: 5px; font-size: 13px; font-weight: 700; color: #1F2937; }
    .dates { margin-top: 4px; font-size: 10px; color: #64748B; }
    .dates b { color: #334155; font-weight: 700; }
    .status {
      display: inline-block;
      margin-top: 7px;
      padding: 3px 10px;
      border-radius: 999px;
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.03em;
    }
    .head-right { text-align: right; }
    .head-right img { height: 40px; max-width: 120px; object-fit: contain; display: block; margin-left: auto; }
    .company { margin-top: 6px; font-size: 12px; font-weight: 700; color: #111827; }
    .meta { margin-top: 3px; font-size: 10px; color: #64748B; }

    .tiles { margin-top: 16px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
    .tile { border: 1px solid ${ACCENT_LINE}; border-radius: 10px; padding: 9px 11px; background: ${ACCENT_TINT}; }
    .tile-label { font-size: 9px; font-weight: 800; letter-spacing: 0.07em; text-transform: uppercase; color: #64748B; }
    .tile-value { margin-top: 3px; font-size: 17px; font-weight: 800; font-variant-numeric: tabular-nums; letter-spacing: -0.02em; }
    .tile-hint { margin-top: 1px; font-size: 9px; color: #94A3B8; }

    .progress-wrap { margin-top: 10px; display: flex; align-items: center; gap: 10px; }
    .progress { flex: 1; height: 7px; border-radius: 999px; background: #EEF2F6; overflow: hidden; }
    .progress > span { display: block; height: 100%; border-radius: 999px; background: linear-gradient(90deg, ${ACCENT}, ${ACCENT_DARK}); }
    .progress-label { font-size: 10px; font-weight: 800; color: ${ACCENT_DARK}; font-variant-numeric: tabular-nums; white-space: nowrap; }

    .notice {
      margin-top: 12px;
      border-left: 3px solid #F59E0B;
      background: #FFFBEB;
      border-radius: 0 8px 8px 0;
      padding: 8px 11px;
      font-size: 10px;
      color: #78350F;
      line-height: 1.5;
    }
    .notice b { font-weight: 800; }

    h2 {
      margin: 20px 0 0;
      font-size: 12px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: ${ACCENT_DEEP};
      /* Un titre de section seul en bas de page n'annonce plus rien. */
      break-after: avoid;
      page-break-after: avoid;
    }
    /* Sur un gros catalogue, le détail est une annexe : elle commence page neuve. */
    h2.page-break { break-before: page; page-break-before: always; margin-top: 0; }
    h2 .count { margin-left: 8px; font-size: 10px; font-weight: 700; color: #94A3B8; letter-spacing: 0; text-transform: none; }
    .section-hint { margin-top: 3px; font-size: 9.5px; color: #94A3B8; }

    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    thead th {
      text-align: left;
      background: ${ACCENT_DARK};
      color: #fff;
      padding: 7px 8px;
      font-size: 9px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      white-space: nowrap;
    }
    tbody td { border-bottom: 1px solid ${ACCENT_LINE}; padding: 6px 8px; vertical-align: middle; }
    tbody tr:nth-child(even) td { background: #FFFAF7; }
    tbody tr.row-todo td { background: #FCFCFD; }

    .t-name { max-width: 260px; }
    .pname { display: block; font-weight: 700; color: #0F172A; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .t-num { width: 74px; text-align: right; font-weight: 800; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .t-num.soft { font-weight: 600; color: ${SLATE}; }
    .t-state { width: 88px; }
    .badge { display: inline-block; padding: 2px 7px; border-radius: 999px; font-size: 9px; font-weight: 800; white-space: nowrap; }

    tfoot td {
      padding: 8px;
      background: ${ACCENT_TINT};
      border-top: 2px solid ${ACCENT_DARK};
      font-weight: 800;
      color: ${ACCENT_DEEP};
      font-variant-numeric: tabular-nums;
    }
    .empty { text-align: center; color: #64748B; padding: 20px; font-weight: 600; }
    /* Aucun écart : on montre le verdict, pas un tableau vide. */
    .ok-panel {
      margin-top: 8px;
      border: 1px solid #A7F3D0;
      background: #ECFDF5;
      border-radius: 10px;
      padding: 12px 14px;
      font-size: 11.5px;
      font-weight: 700;
      color: #065F46;
    }
    .ok-panel span { display: block; margin-top: 2px; font-size: 10px; font-weight: 500; color: #047857; }

    .recap { margin-top: 14px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
    .recap-box { border: 1px solid #E5E7EB; border-radius: 10px; padding: 9px 11px; }
    .recap-label { font-size: 9px; font-weight: 800; letter-spacing: 0.07em; text-transform: uppercase; color: #64748B; }
    .recap-value { margin-top: 2px; font-size: 15px; font-weight: 800; font-variant-numeric: tabular-nums; }
    .recap-hint { margin-top: 1px; font-size: 9px; color: #94A3B8; }

    .signs { margin-top: 26px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 26px; }
    .sign-box { border-top: 1px solid #CBD5E1; padding-top: 5px; font-size: 9.5px; color: #64748B; text-align: center; }
    .foot { margin-top: 18px; font-size: 8.5px; color: #94A3B8; text-align: center; }
  </style>
</head>
<body>
  <div class="topbar"></div>
  <div class="head">
    <div>
      <div class="eyebrow">Rapport d'inventaire</div>
      <h1>${tx(data.sessionTitle)}</h1>
      <div class="subtitle">${tx(data.scopeKind)} · ${tx(data.scopeName)}</div>
      <div class="dates">
        Démarré le <b>${tx(data.startedLabel)}</b>${data.closedLabel ? ` · clôturé le <b>${tx(data.closedLabel)}</b>` : ""}
      </div>
      <span class="status" style="${
        data.status === "closed"
          ? `background:${GREEN}14; color:${GREEN}`
          : data.status === "cancelled"
            ? "background:#F1F5F9; color:#64748B"
            : `background:${ACCENT}18; color:${ACCENT_DARK}`
      }">${tx(data.statusLabel)}</span>
    </div>
    <div class="head-right">
      ${data.companyLogoSrc ? `<img src="${tx(data.companyLogoSrc)}" alt="" />` : ""}
      <div class="company">${tx(data.companyName || "—")}</div>
      ${data.countedByLabel ? `<div class="meta">Comptage : ${tx(data.countedByLabel)}</div>` : ""}
      <div class="meta">Édité le ${tx(data.generatedLabel)}</div>
    </div>
  </div>

  <div class="tiles">
    ${tile("Produits", int(data.rows.length), "lignes de comptage", ACCENT_DEEP)}
    ${tile("Comptés", int(counted.length), `${int(notCounted.length)} non compté${notCounted.length > 1 ? "s" : ""}`, ACCENT_DARK)}
    ${tile("Écarts", int(withVariance.length), `${int(conform)} conforme${conform > 1 ? "s" : ""}`, withVariance.length > 0 ? RED : GREEN)}
    ${tile("Impact net", signedMoney(netValue), "au prix d'achat", netValue < 0 ? RED : netValue > 0 ? GREEN : SLATE)}
  </div>

  <div class="progress-wrap">
    <div class="progress"><span style="width:${progress}%"></span></div>
    <div class="progress-label">${progress}% compté</div>
  </div>

  ${partialNotice}

  <h2>Écarts constatés<span class="count">${int(withVariance.length)} ligne${withVariance.length > 1 ? "s" : ""}</span></h2>
  ${
    withVariance.length === 0
      ? `<div class="ok-panel no-break">
    Aucun écart : chaque produit compté correspond au stock théorique.
    <span>Rien à corriger — le stock du logiciel reflète le stock réel.</span>
  </div>`
      : `<div class="section-hint">Classés du plus lourd au plus léger en valeur. Écart = quantité comptée − stock théorique.</div>
  <table>
    <thead>
      <tr>
        <th>Produit</th>
        <th style="text-align:right">Théorique</th>
        <th style="text-align:right">Compté</th>
        <th style="text-align:right">Écart</th>
        <th style="text-align:right">PU achat</th>
        <th style="text-align:right">Valeur</th>
      </tr>
    </thead>
    <tbody>${varianceRows}</tbody>
    <tfoot>
      <tr>
        <td colspan="3">Total des écarts</td>
        <td style="text-align:right">${signed(withVariance.reduce((a, r) => a + r.variance, 0))}</td>
        <td></td>
        <td style="text-align:right">${tx(signedMoney(netValue))}</td>
      </tr>
    </tfoot>
  </table>

  <div class="recap no-break">
    <div class="recap-box">
      <div class="recap-label">Manquants</div>
      <div class="recap-value" style="color:${RED}">${tx(money(missingValue))}</div>
      <div class="recap-hint">${int(missing.length)} produit${missing.length > 1 ? "s" : ""} en moins</div>
    </div>
    <div class="recap-box">
      <div class="recap-label">Surplus</div>
      <div class="recap-value" style="color:${GREEN}">${tx(signedMoney(surplusValue))}</div>
      <div class="recap-hint">${int(surplus.length)} produit${surplus.length > 1 ? "s" : ""} en plus</div>
    </div>
    <div class="recap-box">
      <div class="recap-label">Impact net</div>
      <div class="recap-value" style="color:${netValue < 0 ? RED : netValue > 0 ? GREEN : SLATE}">${tx(signedMoney(netValue))}</div>
      <div class="recap-hint">valorisé au prix d'achat</div>
    </div>
  </div>`
  }

  ${
    data.includeAllLines
      ? `<h2${data.rows.length > 25 ? ' class="page-break"' : ""}>Détail du comptage<span class="count">${int(data.rows.length)} produit${data.rows.length > 1 ? "s" : ""}</span></h2>
  <div class="section-hint">Liste complète, dans l'ordre de la feuille de comptage.</div>
  <table>
    <thead>
      <tr>
        <th>Produit</th>
        <th style="text-align:right">Théorique</th>
        <th style="text-align:right">Compté</th>
        <th style="text-align:right">Écart</th>
        <th>État</th>
      </tr>
    </thead>
    <tbody>${detailRows || `<tr><td colspan="5" class="empty">Aucun produit dans cette session.</td></tr>`}</tbody>
  </table>`
      : ""
  }

  <div class="signs no-break">
    <div class="sign-box">Compté par</div>
    <div class="sign-box">Vérifié par</div>
    <div class="sign-box">Visa du responsable</div>
  </div>

  <div class="foot">Document généré par FasoStock — les écarts sont valorisés au prix d'achat unitaire enregistré au démarrage de l'inventaire.</div>
</body>
</html>`;
}

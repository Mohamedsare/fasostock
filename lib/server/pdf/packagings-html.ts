import { formatCurrency } from "@/lib/utils/currency";
import { escapeHtml } from "./escape-html";

function tx(s: string): string {
  return escapeHtml(s ?? "");
}

const ACCENT = "#C2410C";
const ACCENT_DARK = "#7C2D12";

export type PackagingsPdfLot = {
  label: string;
  factor: number;
  /** Prix du lot entier (ce que le client paie pour le carton). */
  total: number;
  /** Le même prix ramené à une pièce du lot — la colonne qu'on vient vérifier. */
  piecePrice: number;
  /** Écart en % avec le prix de détail (négatif = moins cher au lot). */
  deltaPercent: number | null;
  /** Prix invraisemblable (lot ≤ prix d'une pièce, ou vente à perte). */
  suspicious: boolean;
  barcode: string | null;
};

export type PackagingsPdfItem = {
  name: string;
  sku: string | null;
  unit: string;
  unitPrice: number;
  lots: PackagingsPdfLot[];
};

/**
 * Feuille de vérification des conditionnements : pour chaque produit, son prix de
 * détail puis, lot par lot, ce que contient le carton et **ce que revient la pièce
 * quand on l'achète ainsi**. C'est cette dernière colonne qu'on relit au bureau : un
 * prix à la pièce plus élevé au carton qu'au détail saute alors aux yeux.
 *
 * Rendu volontairement dense (une ligne par produit, les lots empilés dans la cellule)
 * pour qu'un catalogue de deux cents références tienne en quelques pages relisables.
 */
export function renderPackagingsHtml(data: {
  companyName: string;
  companyLogoSrc?: string | null;
  storeName: string;
  scopeLabel: string;
  generatedAtIso: string;
  currencyCode: string;
  items: PackagingsPdfItem[];
}): string {
  const money = (v: number) => formatCurrency(v, data.currencyCode);
  const generatedAt = new Date(data.generatedAtIso);
  const generatedLabel = Number.isNaN(generatedAt.getTime())
    ? data.generatedAtIso
    : generatedAt.toLocaleString("fr-FR");

  const withLots = data.items.filter((i) => i.lots.length > 0).length;
  const suspicious = data.items.filter((i) => i.lots.some((l) => l.suspicious)).length;

  const lotsCell = (item: PackagingsPdfItem) => {
    if (item.lots.length === 0) {
      return `<span class="nolot">Aucun conditionnement — vendu à la ${tx(item.unit)}</span>`;
    }
    return `<div class="lots">${item.lots
      .map(
        (l) => `<div class="lot${l.suspicious ? " lot-bad" : ""}">
          <span class="lot-name">${tx(l.label)}</span>
          <span class="lot-qty">${l.factor} ${tx(item.unit)}</span>
          <span class="lot-total">${tx(money(l.total))}</span>
          <span class="lot-piece"><b>${tx(money(l.piecePrice))}</b><span> /${tx(item.unit)}</span></span>
          ${
            l.suspicious
              ? `<span class="lot-flag">à vérifier</span>`
              : l.deltaPercent != null && Math.round(l.deltaPercent) < 0
                ? `<span class="lot-delta">${l.deltaPercent.toFixed(0)}%</span>`
                : l.deltaPercent != null && Math.round(l.deltaPercent) > 0
                  ? `<span class="lot-delta up">+${l.deltaPercent.toFixed(0)}%</span>`
                  : `<span class="lot-delta" style="color:#9ca3af">=</span>`
          }
        </div>`,
      )
      .join("")}</div>`;
  };

  const rows =
    data.items.length === 0
      ? `<tr><td colspan="4" class="empty">Aucun produit à afficher.</td></tr>`
      : data.items
          .map(
            (it, idx) => `<tr>
      <td class="num-cell">${String(idx + 1).padStart(2, "0")}</td>
      <td class="name-cell">
        <div class="pname">${tx(it.name)}</div>
        ${it.sku ? `<div class="psku">${tx(it.sku)}</div>` : ""}
      </td>
      <td class="unit-cell">${tx(money(it.unitPrice))}<span class="unit-suffix"> / ${tx(it.unit)}</span></td>
      <td class="lots-cell">${lotsCell(it)}</td>
    </tr>`,
          )
          .join("");

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 24px 30px 30px;
      font-family: "Segoe UI", Roboto, Arial, sans-serif;
      color: #111827;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      font-size: 11px;
      background: #fff;
    }
    .topbar {
      height: 5px;
      margin: -24px -30px 16px;
      background: linear-gradient(90deg, ${ACCENT}, ${ACCENT_DARK});
    }
    h1 { margin: 0; font-size: 19px; font-weight: 800; letter-spacing: -0.02em; }
    .sub { margin-top: 4px; color: #6b7280; font-size: 11px; }
    .meta {
      margin-top: 10px;
      padding: 10px 12px;
      border: 1px solid #e5e7eb;
      border-radius: 10px;
      background: #fff7ed;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 3px 18px;
      font-size: 11px;
    }
    .meta strong { color: ${ACCENT_DARK}; }
    .stats { margin-top: 10px; display: flex; gap: 8px; }
    .stat {
      flex: 1;
      border: 1px solid #e5e7eb;
      border-radius: 10px;
      padding: 8px 10px;
      background: #fff;
    }
    .stat .k { color: #6b7280; font-size: 9px; text-transform: uppercase; letter-spacing: 0.04em; }
    .stat .v { font-size: 16px; font-weight: 800; font-variant-numeric: tabular-nums; }
    .stat.warn .v { color: #b91c1c; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 14px;
      border: 1px solid #e5e7eb;
      border-radius: 10px;
      overflow: hidden;
    }
    thead th {
      text-align: left;
      background: ${ACCENT};
      color: #fff;
      padding: 9px 10px;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }
    /* L'en-tête se répète en haut de chaque page, et aucune ligne n'est coupée en deux. */
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; }
    tbody td { border-bottom: 1px solid #e5e7eb; padding: 7px 10px; vertical-align: top; }
    tbody tr:nth-child(even) td { background: #fafafa; }
    tbody tr:last-child td { border-bottom: none; }
    .num-cell {
      width: 34px;
      text-align: center;
      font-variant-numeric: tabular-nums;
      font-weight: 700;
      color: #9ca3af;
    }
    .name-cell { width: 27%; }
    .pname { font-size: 12px; font-weight: 700; color: #111827; }
    .psku { margin-top: 1px; color: #6b7280; font-size: 9.5px; }
    .unit-cell {
      width: 78px;
      text-align: right;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    .unit-suffix { color: #9ca3af; font-weight: 500; }
    .lots { display: flex; flex-direction: column; gap: 3px; }
    /*
      Grille à colonnes fixes : les lots d'un même produit — et d'un produit à l'autre —
      s'alignent verticalement. C'est ce qui rend la feuille relisable en diagonale,
      et rien ne doit passer à la ligne au milieu d'un montant.
    */
    .lot {
      display: grid;
      grid-template-columns: 60px 56px 84px 96px 44px;
      align-items: center;
      gap: 6px;
      padding: 3px 7px;
      border-radius: 6px;
      background: #f3f4f6;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    .lot-bad { background: #fee2e2; }
    .lot-name { font-weight: 700; overflow: hidden; text-overflow: ellipsis; }
    .lot-qty { color: #4b5563; }
    .lot-total { text-align: right; color: #4b5563; }
    .lot-piece { text-align: right; }
    .lot-piece b { color: ${ACCENT_DARK}; font-size: 11.5px; }
    .lot-piece span { color: #9ca3af; }
    .lot-delta { text-align: right; color: #15803d; font-weight: 700; }
    .lot-delta.up { color: #b45309; }
    .lot-flag { text-align: right; color: #b91c1c; font-weight: 800; font-size: 9px; }
    .nolot { color: #9ca3af; font-style: italic; }
    .empty { text-align: center; color: #6b7280; padding: 16px; }
    .legend { margin-top: 10px; color: #6b7280; font-size: 9.5px; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="topbar"></div>
  <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
    <h1>Conditionnements — feuille de vérification</h1>
    ${
      data.companyLogoSrc
        ? `<img src="${tx(data.companyLogoSrc)}" alt="Logo entreprise" style="height:42px; max-width:120px; object-fit:contain;" />`
        : ""
    }
  </div>
  <div class="sub">Prix de détail et prix à la pièce de chaque lot</div>
  <div class="meta">
    <div><strong>Entreprise :</strong> ${tx(data.companyName || "—")}</div>
    <div><strong>Boutique :</strong> ${tx(data.storeName || "—")}</div>
    <div><strong>Sélection :</strong> ${tx(data.scopeLabel)}</div>
    <div><strong>Édité le :</strong> ${tx(generatedLabel)}</div>
  </div>
  <div class="stats">
    <div class="stat"><div class="k">Produits</div><div class="v">${data.items.length}</div></div>
    <div class="stat"><div class="k">Avec un lot</div><div class="v">${withLots}</div></div>
    <div class="stat"><div class="k">Sans lot</div><div class="v">${data.items.length - withLots}</div></div>
    <div class="stat${suspicious > 0 ? " warn" : ""}"><div class="k">À vérifier</div><div class="v">${suspicious}</div></div>
  </div>
  <table>
    <thead>
      <tr>
        <th style="width:34px">N°</th>
        <th>Produit</th>
        <th style="text-align:right">Prix détail</th>
        <th>Conditionnements — contenu, prix du lot, prix à la pièce</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="legend">
    Lecture d'une ligne de lot : <b>type</b> · contenu · <b>prix du lot entier</b> ·
    <b>prix ramené à une pièce</b> · écart avec le prix de détail. Un pourcentage vert
    signale un lot moins cher à la pièce que le détail — c'est le cas normal ; un
    pourcentage orange signale l'inverse. Les lignes en rouge marquées
    « à vérifier » sont impossibles en l'état : lot au prix d'une seule pièce, ou
    revenant sous le prix d'achat.
  </div>
</body>
</html>`;
}

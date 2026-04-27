import { escapeHtml } from "./escape-html";

function tx(s: string): string {
  return escapeHtml(s ?? "");
}

const ACCENT = "#2378CF";
const ACCENT_DARK = "#1B5EA2";

export function renderStoreProductsHtml(data: {
  companyName: string;
  companyLogoSrc?: string | null;
  storeName: string;
  generatedAtIso: string;
  items: Array<{ name: string; imageUrl: string | null; imageSrc?: string | null }>;
}): string {
  const generatedAt = new Date(data.generatedAtIso);
  const generatedLabel = Number.isNaN(generatedAt.getTime())
    ? data.generatedAtIso
    : generatedAt.toLocaleString("fr-FR");

  const rows =
    data.items.length === 0
      ? `<tr><td colspan="3" class="empty">Aucun produit pour ce magasin.</td></tr>`
      : data.items
          .map(
            (it, idx) => `<tr>
      <td class="num-cell">${String(idx + 1).padStart(2, "0")}</td>
      <td class="thumb-cell">
        ${
          (it.imageSrc ?? it.imageUrl)
            ? `<img src="${tx(it.imageSrc ?? it.imageUrl ?? "")}" alt="${tx(it.name)}" class="thumb" />`
            : `<div class="thumb placeholder">Aucune image</div>`
        }
      </td>
      <td class="name-cell">${tx(it.name)}</td>
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
    h1 {
      margin: 0;
      font-size: 19px;
      font-weight: 800;
      letter-spacing: -0.02em;
    }
    .sub {
      margin-top: 4px;
      color: #6b7280;
      font-size: 11px;
    }
    .meta {
      margin-top: 10px;
      padding: 10px 12px;
      border: 1px solid #e5e7eb;
      border-radius: 10px;
      background: #fff7ed;
      display: grid;
      grid-template-columns: 1fr;
      gap: 3px;
      font-size: 11px;
    }
    .meta strong { color: ${ACCENT_DARK}; }
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
    tbody td {
      border-bottom: 1px solid #e5e7eb;
      padding: 8px 10px;
      vertical-align: middle;
    }
    tbody tr:last-child td { border-bottom: none; }
    .num-cell {
      width: 52px;
      text-align: center;
      font-variant-numeric: tabular-nums;
      font-weight: 700;
      color: #374151;
    }
    .thumb-cell { width: 120px; }
    .thumb {
      width: 95px;
      height: 56px;
      object-fit: contain;
      display: block;
      border-radius: 0;
      border: none;
      background: transparent;
      padding: 0;
    }
    .placeholder {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: #9ca3af;
      font-size: 10px;
    }
    .name-cell {
      font-size: 13px;
      font-weight: 700;
      color: #111827;
    }
    .empty {
      text-align: center;
      color: #6b7280;
      padding: 16px;
    }
  </style>
</head>
<body>
  <div class="topbar"></div>
  <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
    <h1>Liste des produits magasin</h1>
    ${
      data.companyLogoSrc
        ? `<img src="${tx(data.companyLogoSrc)}" alt="Logo entreprise" style="height:42px; max-width:120px; object-fit:contain;" />`
        : ""
    }
  </div>
  <div class="sub">Document PDF généré automatiquement</div>
  <div class="meta">
    <div><strong>Entreprise:</strong> ${tx(data.companyName || "—")}</div>
    <div><strong>Magasin:</strong> Depot Centrale</div>
    <div><strong>Date:</strong> ${tx(generatedLabel)}</div>
  </div>
  <table>
    <thead>
      <tr>
        <th style="width:52px">N°</th>
        <th>Miniature</th>
        <th>Nom du produit</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`;
}

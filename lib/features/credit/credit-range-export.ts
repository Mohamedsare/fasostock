"use client";

import ExcelJS from "exceljs";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { writeProDataTable, safeSheetName, colName } from "@/lib/utils/spreadsheet-export-pro";
import { paymentMethodLabel } from "@/lib/features/receipt/build-receipt-ticket-data";
import type { CreditGrantedRow, CreditRepaymentRow } from "./api";

type Cell = string | number | null;

const TITLE_COLOR = "FF111827";
const SUBTITLE_COLOR = "FF6B7280";

function hhmm(iso: string): string {
  try {
    return format(parseISO(iso), "HH:mm");
  } catch {
    return "";
  }
}

/** Titre + sous-titre stylés en haut d'une feuille, puis tableau « pro » ; format monétaire sur les nombres. */
function addTitledSheet(
  wb: ExcelJS.Workbook,
  sheetName: string,
  title: string,
  subtitle: string,
  headers: string[],
  rows: Cell[][],
): void {
  const ws = wb.addWorksheet(safeSheetName(sheetName), {
    properties: { defaultRowHeight: 18 },
  });
  const lastCol = Math.max(headers.length, 1);

  ws.mergeCells(1, 1, 1, lastCol);
  const t = ws.getCell(1, 1);
  t.value = title;
  t.font = { size: 16, bold: true, color: { argb: TITLE_COLOR } };
  t.alignment = { vertical: "middle", horizontal: "left" };
  ws.getRow(1).height = 24;

  ws.mergeCells(2, 1, 2, lastCol);
  const s = ws.getCell(2, 1);
  s.value = subtitle;
  s.font = { size: 11, color: { argb: SUBTITLE_COLOR } };
  s.alignment = { vertical: "middle", horizontal: "left", wrapText: true };

  writeProDataTable(ws, 4, headers, rows);

  // Format monétaire (séparateur de milliers) sur toutes les cellules numériques.
  ws.eachRow((row) => {
    row.eachCell((cell) => {
      if (typeof cell.value === "number") cell.numFmt = "#,##0";
    });
  });

  // Frozen: garde titre + en-tête visibles au défilement.
  const first = colName(1);
  ws.views = [{ state: "frozen", ySplit: 4, topLeftCell: `${first}5`, activeCell: `${first}5` }];
}

export async function exportCreditDayXlsx(params: {
  day: string;
  companyName: string;
  storeLabel: string;
  granted: CreditGrantedRow[];
  repaid: CreditRepaymentRow[];
}): Promise<void> {
  const { day, companyName, storeLabel, granted, repaid } = params;

  const dayLabel = (() => {
    try {
      return format(parseISO(day), "EEEE d MMMM yyyy", { locale: fr });
    } catch {
      return day;
    }
  })();
  const generatedAt = format(new Date(), "dd/MM/yyyy HH:mm", { locale: fr });

  const grantedTotal = granted.reduce((n, r) => n + r.creditGranted, 0);
  const repaidTotal = repaid.reduce((n, r) => n + r.amount, 0);
  const repaidOld = repaid.filter((r) => r.isOldCredit).reduce((n, r) => n + r.amount, 0);
  const repaidSameDay = repaidTotal - repaidOld;
  const net = grantedTotal - repaidTotal;

  const wb = new ExcelJS.Workbook();
  wb.creator = "FasoStock";
  wb.created = new Date();
  wb.title = `Crédits du ${day}`;

  const subtitleBase = `${[companyName, storeLabel].filter(Boolean).join(" · ")} · ${dayLabel} · généré le ${generatedAt}`;

  // 1) Synthèse
  addTitledSheet(
    wb,
    "Synthèse",
    `FasoStock — Crédits du jour`,
    subtitleBase,
    ["Indicateur", "Montant (F CFA)", "Nombre"],
    [
      ["Crédits accordés ce jour", grantedTotal, granted.length],
      ["Crédits remboursés ce jour", repaidTotal, repaid.length],
      ["  dont anciens crédits", repaidOld, null],
      ["  dont crédits du jour", repaidSameDay, null],
      ["Variation de l'encours (accordés − remboursés)", net, null],
    ],
  );

  // 2) Crédits accordés
  const grantedRows: Cell[][] = granted.map((r) => [
    hhmm(r.createdAt),
    r.customerName ?? "—",
    r.customerPhone ?? "",
    r.saleNumber,
    r.saleTotal,
    r.paidAtSale,
    r.creditGranted,
  ]);
  grantedRows.push(["", "", "", "TOTAL", null, null, grantedTotal]);
  addTitledSheet(
    wb,
    "Crédits accordés",
    `Crédits accordés — ${dayLabel}`,
    `${granted.length} vente(s) à crédit · total accordé ${grantedTotal.toLocaleString("fr-FR")} F CFA`,
    ["Heure", "Client", "Téléphone", "Réf. vente", "Total vente", "Payé à la vente", "Crédit accordé"],
    grantedRows,
  );

  // 3) Crédits remboursés
  const repaidRows: Cell[][] = repaid.map((r) => [
    hhmm(r.paidAt),
    r.customerName ?? "—",
    r.customerPhone ?? "",
    r.saleNumber,
    r.isOldCredit ? "Ancien crédit" : "Crédit du jour",
    paymentMethodLabel(r.method),
    r.amount,
  ]);
  repaidRows.push(["", "", "", "", "", "TOTAL", repaidTotal]);
  addTitledSheet(
    wb,
    "Crédits remboursés",
    `Crédits remboursés — ${dayLabel}`,
    `${repaid.length} remboursement(s) · total ${repaidTotal.toLocaleString("fr-FR")} F CFA`,
    ["Heure", "Client", "Téléphone", "Réf. vente", "Origine", "Mode", "Montant"],
    repaidRows,
  );

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `credits_${day}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

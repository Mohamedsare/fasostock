import ExcelJS from "exceljs";

export type ProSheetCell = string | number | boolean | null | undefined;

const HEADER_FILL = "FFF97316";
const HEADER_FG = "FFFFFFFF";
const TITLE_COLOR = "FF111827";
const SUBTITLE_COLOR = "FF6B7280";
const ZEBRA_FILL = "FFF9FAFB";
const BORDER_LIGHT = "FFE5E7EB";
const BORDER_ROW = "FFF3F4F6";

export function colName(n: number): string {
  let s = "";
  let c = n;
  while (c > 0) {
    const r = (c - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    c = Math.floor((c - 1) / 26);
  }
  return s || "A";
}

export function safeSheetName(name: string): string {
  return name.replace(/[[\]*?:/\\]/g, "_").slice(0, 31) || "Données";
}

function thinBorder(color: string) {
  const e = { style: "thin" as const, color: { argb: color } };
  return { top: e, left: e, bottom: e, right: e };
}

/**
 * En-tête de colonnes coloré + données + auto-filtre + lignes zébrées + bordures + largeurs.
 * `startRow` = numéro de ligne Excel (1-based) de la ligne d’en-têtes.
 */
export function writeProDataTable(
  ws: ExcelJS.Worksheet,
  startRow: number,
  headers: string[],
  rows: ProSheetCell[][],
): void {
  if (headers.length === 0) {
    throw new Error("Aucune colonne à exporter.");
  }

  let r = startRow;
  const headerRowIndex = r;
  const hr = ws.getRow(headerRowIndex);
  headers.forEach((h, i) => {
    const cell = hr.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, color: { argb: HEADER_FG }, size: 11 };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: HEADER_FILL },
    };
    cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    cell.border = thinBorder(BORDER_LIGHT);
  });
  hr.height = 22;
  r++;

  for (let i = 0; i < rows.length; i++) {
    const row = ws.getRow(r);
    const zebra = i % 2 === 1;
    const src = rows[i] ?? [];
    for (let j = 0; j < headers.length; j++) {
      const cell = row.getCell(j + 1);
      const val = j < src.length ? src[j] : "";
      cell.value = val === undefined || val === null ? "" : val;
      if (typeof val === "number") {
        cell.alignment = { horizontal: "right", vertical: "middle" };
      } else {
        cell.alignment = { vertical: "middle", wrapText: true };
      }
      if (zebra) {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: ZEBRA_FILL },
        };
      }
      cell.border = {
        top: { style: "thin", color: { argb: BORDER_ROW } },
        left: { style: "thin", color: { argb: BORDER_LIGHT } },
        bottom: { style: "thin", color: { argb: BORDER_LIGHT } },
        right: { style: "thin", color: { argb: BORDER_LIGHT } },
      };
    }
    r++;
  }

  for (let col = 1; col <= headers.length; col++) {
    let maxLen = String(headers[col - 1] ?? "").length;
    const sample = rows.slice(0, 400);
    for (const row of sample) {
      const v = row[col - 1];
      const s = v === null || v === undefined ? "" : String(v);
      maxLen = Math.max(maxLen, Math.min(s.length, 72));
    }
    ws.getColumn(col).width = Math.min(Math.max(maxLen + 2, 11), 52);
  }

  const c1 = colName(1);
  const cL = colName(headers.length);
  ws.autoFilter = `${c1}${headerRowIndex}:${cL}${headerRowIndex}`;

  const firstDataRow = headerRowIndex + 1;
  ws.views = [
    {
      state: "frozen",
      ySplit: headerRowIndex,
      topLeftCell: `${c1}${firstDataRow}`,
      activeCell: `${c1}${firstDataRow}`,
    },
  ];
}

/**
 * Export Excel (.xlsx) type SaaS : titre optionnel, tableau stylé.
 * (Le CSV ne permet pas les couleurs ; l’export « pro » est en Excel.)
 */
export async function downloadProSpreadsheet(
  filename: string,
  sheetName: string,
  headers: string[],
  rows: ProSheetCell[][],
  meta?: { title?: string; subtitle?: string },
): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "FasoStock";
  wb.created = new Date();
  if (meta?.title) wb.title = meta.title;

  const ws = wb.addWorksheet(safeSheetName(sheetName), {
    properties: { defaultRowHeight: 18 },
  });

  let r = 1;
  const lastCol = Math.max(headers.length, 1);

  if (meta?.title) {
    ws.mergeCells(r, 1, r, lastCol);
    const c = ws.getCell(r, 1);
    c.value = meta.title;
    c.font = { size: 16, bold: true, color: { argb: TITLE_COLOR } };
    c.alignment = { vertical: "middle", horizontal: "left" };
    r++;
  }
  if (meta?.subtitle) {
    ws.mergeCells(r, 1, r, lastCol);
    const c = ws.getCell(r, 1);
    c.value = meta.subtitle;
    c.font = { size: 11, color: { argb: SUBTITLE_COLOR } };
    c.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    r++;
  }
  if (meta?.title || meta?.subtitle) {
    r++;
  }

  writeProDataTable(ws, r, headers, rows);

  const buf = await wb.xlsx.writeBuffer();
  const name = filename.toLowerCase().endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/** Classeur multi-feuilles, chaque feuille = un tableau stylé (rapports, etc.). */
export async function downloadProWorkbook(
  filename: string,
  sheets: { name: string; headers: string[]; rows: ProSheetCell[][] }[],
): Promise<void> {
  if (sheets.length === 0) {
    throw new Error("Aucune feuille à exporter.");
  }
  const wb = new ExcelJS.Workbook();
  wb.creator = "FasoStock";
  wb.created = new Date();
  for (const sh of sheets) {
    const ws = wb.addWorksheet(safeSheetName(sh.name), {
      properties: { defaultRowHeight: 18 },
    });
    writeProDataTable(ws, 1, sh.headers, sh.rows);
  }
  const buf = await wb.xlsx.writeBuffer();
  const name = filename.toLowerCase().endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

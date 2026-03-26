import type { ProductItem } from "./types";
import { escapeCsv } from "@/lib/utils/csv";

const SEP = ",";
const QUOTE = '"';

/** Parse CSV RFC 4180 basique — aligné sur `parseCsvRaw` (Flutter `products_csv.dart`). */
export function parseCsvRaw(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (inQuotes) {
      if (c === QUOTE) {
        if (i + 1 < text.length && text[i + 1] === QUOTE) {
          cell += QUOTE;
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += c;
      }
    } else {
      if (c === QUOTE) {
        inQuotes = true;
      } else if (c === SEP) {
        row.push(cell);
        cell = "";
      } else if (c === "\n" || c === "\r") {
        row.push(cell);
        cell = "";
        rows.push(row);
        row = [];
        if (c === "\r" && i + 1 < text.length && text[i + 1] === "\n") i++;
      } else {
        cell += c;
      }
    }
  }
  row.push(cell);
  if (row.length > 1 || row[0] !== "") rows.push(row);
  return rows;
}

const headerMap: Record<string, string> = {
  nom: "name",
  name: "name",
  sku: "sku",
  code_barres: "barcode",
  barcode: "barcode",
  unite: "unit",
  unit: "unit",
  prix_achat: "purchase_price",
  purchase_price: "purchase_price",
  prix_vente: "sale_price",
  sale_price: "sale_price",
  stock_min: "stock_min",
  stock_entrant: "stock_entrant",
  quantite_entrante: "stock_entrant",
  description: "description",
  actif: "is_active",
  is_active: "is_active",
  active: "is_active",
  categorie: "category",
  category: "category",
  marque: "brand",
  brand: "brand",
};

export type CsvProductRow = {
  name: string;
  sku?: string | null;
  barcode?: string | null;
  unit: string;
  purchasePrice: number;
  salePrice: number;
  stockMin: number;
  stockEntrant: number;
  description?: string | null;
  isActive: boolean;
  category?: string | null;
  brand?: string | null;
};

/** Aligné sur `parseProductsCsv` (Flutter). */
export function parseProductsCsv(text: string): CsvProductRow[] {
  const raw = parseCsvRaw(text);
  if (raw.length === 0) return [];
  const headerRow = raw[0]!.map((h) => h.trim().toLowerCase());
  const colIndex: Record<string, number> = {};
  for (let i = 0; i < headerRow.length; i++) {
    const key = headerMap[headerRow[i]!];
    if (key) colIndex[key] = i;
  }
  if (colIndex["name"] === undefined) return [];

  const numAt = (key: string | undefined, r: string[]): number => {
    const idx = key !== undefined ? colIndex[key] : undefined;
    if (idx === undefined || idx >= r.length) return 0;
    const v = r[idx]!.trim().replaceAll(",", ".");
    if (v === "") return 0;
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  const boolAt = (key: string | undefined, r: string[]): boolean => {
    const idx = key !== undefined ? colIndex[key] : undefined;
    if (idx === undefined || idx >= r.length) return true;
    const v = r[idx]!.trim().toLowerCase();
    return v === "1" || v === "true" || v === "oui" || v === "yes";
  };

  const strAt = (key: string | undefined, r: string[]): string => {
    const idx = key !== undefined ? colIndex[key] : undefined;
    if (idx === undefined || idx >= r.length) return "";
    return r[idx]!.trim();
  };

  const result: CsvProductRow[] = [];
  for (let r = 1; r < raw.length; r++) {
    const row = raw[r]!;
    const nameIdx = colIndex["name"];
    const name =
      nameIdx !== undefined && nameIdx < row.length
        ? row[nameIdx]!.trim()
        : "";
    if (name === "") continue;

    result.push({
      name,
      sku: strAt("sku", row) === "" ? null : strAt("sku", row),
      barcode: strAt("barcode", row) === "" ? null : strAt("barcode", row),
      unit: strAt("unit", row) === "" ? "pce" : strAt("unit", row),
      purchasePrice: numAt("purchase_price", row),
      salePrice: numAt("sale_price", row),
      stockMin: Math.trunc(numAt("stock_min", row)),
      stockEntrant: Math.trunc(numAt("stock_entrant", row)),
      description:
        strAt("description", row) === "" ? null : strAt("description", row),
      isActive: boolAt("is_active", row),
      category:
        strAt("category", row) === "" ? null : strAt("category", row),
      brand: strAt("brand", row) === "" ? null : strAt("brand", row),
    });
  }
  return result;
}

export function csvRowsToMaps(rows: CsvProductRow[]): Record<string, unknown>[] {
  return rows.map(
    (r) =>
      ({
        name: r.name,
        sku: r.sku,
        barcode: r.barcode,
        unit: r.unit,
        purchase_price: r.purchasePrice,
        sale_price: r.salePrice,
        stock_min: r.stockMin,
        stock_entrant: r.stockEntrant,
        description: r.description,
        is_active: r.isActive,
        category: r.category,
        brand: r.brand,
      }) as Record<string, unknown>,
  );
}

/** En-têtes attendus + 2 lignes d’exemple — aligné sur `getProductsCsvModelTemplate` (Flutter). */
export function getProductsCsvModelTemplate(): string {
  const headers = [
    "nom",
    "sku",
    "code_barres",
    "unite",
    "prix_achat",
    "prix_vente",
    "stock_min",
    "description",
    "actif",
    "categorie",
    "marque",
    "stock_entrant",
  ].join(SEP);
  const line1 =
    "Café moulu 250g,CAF-250,,pce,1200,1800,5,Paquet 250g,1,Boissons,Marque A,100";
  const line2 =
    "Riz local 1kg,RIZ-1K,5449000000016,kg,800,1200,10,,1,Alimentaire,Marque B,50";
  return `${headers}\n${line1}\n${line2}`;
}

export function productsToCsv(products: ProductItem[]): string {
  const headers = [
    "nom",
    "sku",
    "code_barres",
    "unite",
    "prix_achat",
    "prix_vente",
    "stock_min",
    "description",
    "actif",
    "categorie",
    "marque",
  ];
  const rows = products.map((p) =>
    [
      escapeCsv(p.name),
      escapeCsv(p.sku ?? ""),
      escapeCsv(p.barcode ?? ""),
      escapeCsv(p.unit),
      String(p.purchase_price ?? 0),
      String(p.sale_price ?? 0),
      String(p.stock_min ?? 0),
      escapeCsv(p.description ?? ""),
      p.is_active ? "1" : "0",
      escapeCsv(p.category?.name ?? ""),
      escapeCsv(p.brand?.name ?? ""),
    ].join(","),
  );
  return [headers.join(","), ...rows].join("\n");
}

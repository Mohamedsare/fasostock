/**
 * Utilitaires CSV pour import/export produits
 * Accepte séparateur ; ou , (détection auto sur la première ligne)
 */

const CSV_QUOTE = '"';
const DEFAULT_SEP = ';';

function detectSeparator(firstLine) {
  if (!firstLine) return DEFAULT_SEP;
  const semicolons = (firstLine.match(/;/g) || []).length;
  const commas = (firstLine.match(/,/g) || []).length;
  return commas > semicolons ? ',' : ';';
}

export const PRODUCT_CSV_HEADERS = [
  'name', 'category', 'subcategory', 'brand', 'compatible_model', 'compatible_year',
  'internal_ref', 'barcode', 'purchase_price', 'sale_price', 'quantity', 'min_stock_alert',
  'location', 'status'
];

/** Génère une ligne CSV en échappant les guillemets et entourant si nécessaire */
function escapeCsvCell(value, sep = DEFAULT_SEP) {
  if (value == null) return '';
  const s = String(value).replace(/"/g, '""');
  return s.includes(sep) || s.includes('"') || s.includes('\n') ? `${CSV_QUOTE}${s}${CSV_QUOTE}` : s;
}

/** Exporte une liste de produits en chaîne CSV */
export function exportProductsToCsv(products) {
  const sep = DEFAULT_SEP;
  const header = PRODUCT_CSV_HEADERS.join(sep);
  const rows = products.map(p =>
    PRODUCT_CSV_HEADERS.map(h => escapeCsvCell(p[h], sep)).join(sep)
  );
  return [header, ...rows].join('\n');
}

/** Déclenche le téléchargement d'un fichier CSV */
export function downloadCsv(content, filename = 'produits.csv') {
  const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Parse une ligne CSV (gère les guillemets, séparateur configurable) */
function parseCsvLine(line, separator) {
  const sep = separator || DEFAULT_SEP;
  const out = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === CSV_QUOTE) {
      if (inQuotes && line[i + 1] === CSV_QUOTE) {
        cell += CSV_QUOTE;
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if ((c === sep && !inQuotes) || c === '\r') {
      out.push(cell);
      cell = '';
    } else if (c !== '\n' || !inQuotes) {
      cell += c;
    }
  }
  out.push(cell);
  return out;
}

/** Normalise un nom de colonne pour la recherche */
function normalizeHeader(h) {
  return h.trim().toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_');
}

/** Parse un fichier CSV et retourne un tableau d'objets (première ligne = en-têtes). Détecte ; ou , */
export function parseCsvFile(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length < 1) return { headers: [], rows: [], separator: DEFAULT_SEP };
  const separator = detectSeparator(lines[0]);
  const headers = parseCsvLine(lines[0], separator).map(h => normalizeHeader(h));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i], separator);
    const row = {};
    headers.forEach((h, j) => { row[h] = values[j] != null ? String(values[j]).trim() : ''; });
    rows.push(row);
  }
  return { headers, rows, separator };
}

/** Mappe une ligne CSV (noms de colonnes français ou anglais) vers un objet produit pour l'API */
export function csvRowToProduct(row, shopId) {
  const num = (v) => (v === '' || v == null) ? 0 : parseFloat(String(v).replace(/,/g, '.')) || 0;
  const int = (v) => (v === '' || v == null) ? 0 : parseInt(String(v), 10) || 0;
  const str = (v) => (v == null ? '' : String(v).trim());

  const get = (... keys) => {
    for (const k of keys) {
      const v = row[k];
      if (v !== undefined && v !== '') return str(v);
    }
    return '';
  };

  return {
    shop_id: shopId,
    name: get('name', 'nom', 'nom_du_produit', 'product', 'produit') || 'Sans nom',
    category: get('category', 'categorie'),
    subcategory: get('subcategory', 'sous_categorie'),
    brand: get('brand', 'marque'),
    compatible_model: get('compatible_model', 'modele_compatible', 'modele'),
    compatible_year: get('compatible_year', 'annee'),
    internal_ref: get('internal_ref', 'reference', 'ref', 'référence'),
    barcode: get('barcode', 'code_barres', 'codebarres', 'code_barre'),
    purchase_price: num(get('purchase_price', 'prix_achat', 'pa', 'prix_achat_fcfa')),
    sale_price: num(get('sale_price', 'prix_vente', 'pv', 'prix_vente_fcfa')) || 0,
    quantity: int(get('quantity', 'quantite', 'qte', 'stock', 'qté')),
    min_stock_alert: int(get('min_stock_alert', 'alerte_stock', 'seuil', 'seuil_alerte')) || 5,
    location: get('location', 'emplacement'),
    status: get('status') || 'active',
  };
}

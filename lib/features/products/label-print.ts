/**
 * Étiquettes code-barres : formats d'impression et génération du document imprimé.
 *
 * Le format de référence reste le **thermique 40 × 30 mm** validé en production
 * (QR 13 mm, nom 7 pt, code 5,5 pt, 1 étiquette par page) : c'est le préréglage par
 * défaut et son rendu ne doit pas bouger. Tout le reste — autres rouleaux, planches
 * A4, taille du QR, contenu de l'étiquette, repères de découpe — vient en plus, pour
 * que le commerçant imprime comme son imprimante et son papier l'exigent.
 */

/** `label` = 1 étiquette par page (rouleau thermique). `sheet` = planche A4 en grille. */
export type LabelPageMode = "label" | "sheet";

export type LabelPrintOptions = {
  /** Préréglage choisi, ou `custom` dès qu'une dimension est modifiée à la main. */
  presetId: string;
  pageMode: LabelPageMode;
  /** Taille d'UNE étiquette (mm). */
  widthMm: number;
  heightMm: number;
  /** Planche A4 : colonnes × lignes, espace entre étiquettes et marge de la feuille. */
  cols: number;
  rows: number;
  gapMm: number;
  marginMm: number;
  /** Planche A4 : cases déjà utilisées à sauter sur la première feuille. */
  startOffset: number;
  /** Côté du QR code (mm). */
  qrMm: number;
  showName: boolean;
  showPrice: boolean;
  showCode: boolean;
  showSku: boolean;
  /** Traits de coupe pointillés — utile sur planche A4 en papier ordinaire. */
  showCutMarks: boolean;
  /** Nombre de lignes maximum pour le nom du produit. */
  nameLines: number;
  nameSizePt: number;
  codeSizePt: number;
};

export type LabelGeometry = Pick<
  LabelPrintOptions,
  | "pageMode"
  | "widthMm"
  | "heightMm"
  | "cols"
  | "rows"
  | "gapMm"
  | "marginMm"
  | "qrMm"
  | "nameSizePt"
  | "codeSizePt"
>;

export type LabelPreset = {
  id: string;
  label: string;
  hint: string;
  geometry: LabelGeometry;
};

/** Géométrie validée en production (Xprinter XP-237B, support 40 × 30 à découper). */
const THERMAL_40X30: LabelGeometry = {
  pageMode: "label",
  widthMm: 40,
  heightMm: 30,
  cols: 1,
  rows: 1,
  gapMm: 0,
  marginMm: 0,
  qrMm: 13,
  nameSizePt: 7,
  codeSizePt: 5.5,
};

export const LABEL_PRESETS: LabelPreset[] = [
  {
    id: "thermal-40x30",
    label: "Rouleau 40 × 30 mm",
    hint: "Format habituel — 1 étiquette par page",
    geometry: THERMAL_40X30,
  },
  {
    id: "thermal-50x30",
    label: "Rouleau 50 × 30 mm",
    hint: "Étiquette plus large",
    geometry: { ...THERMAL_40X30, widthMm: 50, qrMm: 14, nameSizePt: 7.5 },
  },
  {
    id: "thermal-58x40",
    label: "Rouleau 58 × 40 mm",
    hint: "Grande étiquette, QR bien lisible",
    geometry: {
      ...THERMAL_40X30,
      widthMm: 58,
      heightMm: 40,
      qrMm: 18,
      nameSizePt: 8.5,
      codeSizePt: 6.5,
    },
  },
  {
    id: "thermal-40x20",
    label: "Rouleau 40 × 20 mm",
    hint: "Petite étiquette (petits articles)",
    geometry: { ...THERMAL_40X30, heightMm: 20, qrMm: 9.5, nameSizePt: 5.5, codeSizePt: 4.5 },
  },
  {
    id: "thermal-30x20",
    label: "Rouleau 30 × 20 mm",
    hint: "Très petite étiquette",
    geometry: {
      ...THERMAL_40X30,
      widthMm: 30,
      heightMm: 20,
      qrMm: 9,
      nameSizePt: 5,
      codeSizePt: 4,
    },
  },
  {
    id: "sheet-a4-3x8",
    label: "Planche A4 — 3 × 8 (65 × 33,8 mm)",
    hint: "24 étiquettes par feuille",
    geometry: {
      pageMode: "sheet",
      widthMm: 65,
      heightMm: 33.8,
      cols: 3,
      rows: 8,
      gapMm: 0,
      marginMm: 7,
      qrMm: 16,
      nameSizePt: 8,
      codeSizePt: 6,
    },
  },
  {
    id: "sheet-a4-2x7",
    label: "Planche A4 — 2 × 7 (99 × 38 mm)",
    hint: "14 étiquettes par feuille",
    geometry: {
      pageMode: "sheet",
      widthMm: 99,
      heightMm: 38,
      cols: 2,
      rows: 7,
      gapMm: 0,
      marginMm: 6,
      qrMm: 18,
      nameSizePt: 9,
      codeSizePt: 6.5,
    },
  },
  {
    id: "sheet-a4-4x10",
    label: "Planche A4 — 4 × 10 (48 × 25 mm)",
    hint: "40 étiquettes par feuille",
    geometry: {
      pageMode: "sheet",
      widthMm: 48,
      heightMm: 25,
      cols: 4,
      rows: 10,
      gapMm: 1,
      marginMm: 7,
      qrMm: 12,
      nameSizePt: 6,
      codeSizePt: 4.5,
    },
  },
  {
    id: "sheet-a4-free",
    label: "Planche A4 — grille libre",
    hint: "Vous choisissez taille, colonnes et lignes",
    geometry: {
      pageMode: "sheet",
      widthMm: 60,
      heightMm: 40,
      cols: 3,
      rows: 6,
      gapMm: 2,
      marginMm: 10,
      qrMm: 18,
      nameSizePt: 8,
      codeSizePt: 6,
    },
  },
];

export const DEFAULT_LABEL_PRESET_ID = "thermal-40x30";

export function defaultLabelPrintOptions(): LabelPrintOptions {
  return {
    presetId: DEFAULT_LABEL_PRESET_ID,
    ...THERMAL_40X30,
    startOffset: 0,
    showName: true,
    showPrice: false,
    showCode: true,
    showSku: false,
    showCutMarks: false,
    nameLines: 2,
  };
}

function num(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/** Bornes appliquées partout : saisie utilisateur, préréglage, relecture localStorage. */
export function sanitizeLabelPrintOptions(raw: unknown): LabelPrintOptions {
  const d = defaultLabelPrintOptions();
  if (!raw || typeof raw !== "object") return d;
  const o = raw as Record<string, unknown>;
  const pageMode: LabelPageMode = o.pageMode === "sheet" ? "sheet" : "label";
  const cols = pageMode === "sheet" ? Math.round(num(o.cols, d.cols, 1, 10)) : 1;
  const rows = pageMode === "sheet" ? Math.round(num(o.rows, d.rows, 1, 20)) : 1;
  const widthMm = num(o.widthMm, d.widthMm, 15, 210);
  const heightMm = num(o.heightMm, d.heightMm, 10, 297);
  return {
    presetId: typeof o.presetId === "string" && o.presetId ? o.presetId : d.presetId,
    pageMode,
    widthMm,
    heightMm,
    cols,
    rows,
    gapMm: pageMode === "sheet" ? num(o.gapMm, d.gapMm, 0, 20) : 0,
    marginMm: pageMode === "sheet" ? num(o.marginMm, d.marginMm, 0, 30) : 0,
    startOffset:
      pageMode === "sheet"
        ? Math.round(num(o.startOffset, 0, 0, Math.max(0, cols * rows - 1)))
        : 0,
    qrMm: num(o.qrMm, d.qrMm, 5, Math.min(widthMm, heightMm)),
    showName: bool(o.showName, d.showName),
    showPrice: bool(o.showPrice, d.showPrice),
    showCode: bool(o.showCode, d.showCode),
    showSku: bool(o.showSku, d.showSku),
    showCutMarks: bool(o.showCutMarks, d.showCutMarks),
    nameLines: Math.round(num(o.nameLines, d.nameLines, 1, 3)),
    nameSizePt: num(o.nameSizePt, d.nameSizePt, 3, 20),
    codeSizePt: num(o.codeSizePt, d.codeSizePt, 3, 16),
  };
}

/** Change de format sans perdre le contenu choisi (nom, prix, code, SKU…). */
export function applyLabelPreset(options: LabelPrintOptions, presetId: string): LabelPrintOptions {
  const preset = LABEL_PRESETS.find((p) => p.id === presetId);
  if (!preset) return options;
  return sanitizeLabelPrintOptions({
    ...options,
    ...preset.geometry,
    presetId: preset.id,
    startOffset: 0,
  });
}

/** Une dimension modifiée à la main : le format devient « personnalisé ». */
export function patchLabelGeometry(
  options: LabelPrintOptions,
  patch: Partial<LabelPrintOptions>,
): LabelPrintOptions {
  return sanitizeLabelPrintOptions({ ...options, ...patch, presetId: "custom" });
}

export function labelsPerPage(options: LabelPrintOptions): number {
  return options.pageMode === "sheet" ? Math.max(1, options.cols * options.rows) : 1;
}

export function pageCountFor(total: number, options: LabelPrintOptions): number {
  if (total <= 0) return 0;
  if (options.pageMode !== "sheet") return total;
  const perPage = labelsPerPage(options);
  return Math.ceil((total + Math.min(options.startOffset, perPage - 1)) / perPage);
}

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;

/**
 * Planche A4 : la grille tient-elle sur la feuille ? Ce qui dépasse est coupé à
 * l'impression — l'écran doit le dire AVANT que le papier soit gâché.
 */
export function sheetFitMessage(options: LabelPrintOptions): string | null {
  if (options.pageMode !== "sheet") return null;
  const gridW = options.cols * options.widthMm + (options.cols - 1) * options.gapMm;
  const gridH = options.rows * options.heightMm + (options.rows - 1) * options.gapMm;
  const usableW = A4_WIDTH_MM - 2 * options.marginMm;
  const usableH = A4_HEIGHT_MM - 2 * options.marginMm;
  const tooWide = gridW > usableW;
  const tooTall = gridH > usableH;
  if (!tooWide && !tooTall) return null;
  const round = (n: number) => Math.round(n * 10) / 10;
  const parts: string[] = [];
  if (tooWide) parts.push(`largeur ${round(gridW)} mm pour ${round(usableW)} mm disponibles`);
  if (tooTall) parts.push(`hauteur ${round(gridH)} mm pour ${round(usableH)} mm disponibles`);
  return `La grille dépasse la feuille A4 (${parts.join(", ")}) : réduisez la marge, l'écart, la taille des étiquettes, ou le nombre de colonnes/lignes.`;
}

/** Padding interne : 2 mm sur le 40 × 30 validé, proportionnel ailleurs. */
export function labelPaddingMm(options: LabelPrintOptions): number {
  const raw = Math.min(2.5, Math.max(0.8, options.heightMm / 15));
  return Math.round(raw * 10) / 10;
}

export type LabelPrintData = {
  name: string;
  priceLabel: string;
  code: string;
  sku: string;
  /** SVG du QR code, déjà rendu. */
  svg: string;
};

export function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function labelHtml(item: LabelPrintData, o: LabelPrintOptions): string {
  const parts: string[] = [];
  if (o.showName && item.name) parts.push(`<div class="name">${escapeHtml(item.name)}</div>`);
  if (o.showPrice && item.priceLabel) {
    parts.push(`<div class="price">${escapeHtml(item.priceLabel)}</div>`);
  }
  parts.push(`<div class="qr">${item.svg}</div>`);
  if (o.showCode && item.code) parts.push(`<div class="meta">${escapeHtml(item.code)}</div>`);
  if (o.showSku && item.sku) parts.push(`<div class="sku">${escapeHtml(item.sku)}</div>`);
  return `<div class="label"><div class="inner">${parts.join("")}</div></div>`;
}

/**
 * Document d'impression complet.
 *
 * ATTENTION : aucun espace ni retour à la ligne entre les `div` d'étiquettes — sur
 * une imprimante thermique, le moindre nœud texte décale le contenu et fait sortir
 * des étiquettes blanches supplémentaires.
 */
export function buildLabelsPrintHtml(
  labels: LabelPrintData[],
  options: LabelPrintOptions,
): string {
  const o = sanitizeLabelPrintOptions(options);
  const pad = labelPaddingMm(o);
  const cut = o.showCutMarks ? "border:0.1mm dashed #999;" : "";

  let body = "";
  let pageCss = "";
  if (o.pageMode === "sheet") {
    const perPage = labelsPerPage(o);
    const offset = Math.min(o.startOffset, perPage - 1);
    const slots: Array<LabelPrintData | null> = [
      ...Array.from({ length: offset }, () => null),
      ...labels,
    ];
    const pages: string[] = [];
    for (let i = 0; i < slots.length; i += perPage) {
      const cells = slots
        .slice(i, i + perPage)
        .map((item) => (item ? labelHtml(item, o) : `<div class="slot"></div>`))
        .join("");
      pages.push(`<div class="sheet"><div class="grid">${cells}</div></div>`);
    }
    body = pages.join("");
    pageCss = `@page{size:A4;margin:0}
html,body{width:210mm}
.sheet{width:210mm;height:297mm;overflow:hidden;padding:${o.marginMm}mm;page-break-after:always;break-after:page}
.sheet:last-child{page-break-after:auto;break-after:auto}
.grid{display:grid;grid-template-columns:repeat(${o.cols},${o.widthMm}mm);grid-auto-rows:${o.heightMm}mm;gap:${o.gapMm}mm;justify-content:center;align-content:start}
.slot{width:${o.widthMm}mm;height:${o.heightMm}mm}`;
  } else {
    body = labels.map((item) => labelHtml(item, o)).join("");
    pageCss = `@page{size:${o.widthMm}mm ${o.heightMm}mm;margin:0}
html,body{width:${o.widthMm}mm}`;
  }

  return `<!doctype html><html><head><meta charset="utf-8"/><title>Etiquettes</title><style>
${pageCss}
*{box-sizing:border-box;margin:0;padding:0}
html,body{font-family:Arial,Helvetica,sans-serif;color:#000;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.label{position:relative;width:${o.widthMm}mm;height:${o.heightMm}mm;overflow:hidden;break-inside:avoid;${cut}}
.inner{position:absolute;top:0;left:0;right:0;bottom:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:${pad}mm;text-align:center}
.name{font-size:${o.nameSizePt}pt;font-weight:700;line-height:1.15;width:100%;word-break:break-word;display:-webkit-box;-webkit-line-clamp:${o.nameLines};-webkit-box-orient:vertical;overflow:hidden;margin-bottom:0.6mm}
.price{font-size:${(o.nameSizePt + 0.5).toFixed(1)}pt;font-weight:900;line-height:1.1;width:100%;margin-bottom:0.6mm;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.qr{width:100%;line-height:0;display:flex;justify-content:center;align-items:center}
.qr svg{width:${o.qrMm}mm;height:${o.qrMm}mm;display:block;shape-rendering:crispEdges}
.meta{font-size:${o.codeSizePt}pt;width:100%;margin-top:0.6mm;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sku{font-size:${Math.max(3, o.codeSizePt - 0.5).toFixed(1)}pt;width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
</style></head><body>${body}<script>(function(){function go(){try{window.focus()}catch(e){}window.print()}window.onafterprint=function(){window.close()};function ready(){requestAnimationFrame(function(){requestAnimationFrame(go)})}if(document.readyState==='complete'){ready()}else{window.addEventListener('load',ready)}})();<\/script></body></html>`;
}

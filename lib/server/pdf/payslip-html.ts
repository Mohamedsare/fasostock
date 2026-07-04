import { escapeHtml } from "./escape-html";

export type PayslipLineData = { label: string; amount: number; kind: "earning" | "deduction" };

export type PayslipPdfData = {
  companyName: string;
  employeeName: string;
  matricule: string | null;
  jobTitle: string | null;
  category: string | null;
  contractType: string;
  cnssNumber: string | null;
  hireDate: string | null;
  periodLabel: string; // ex. « Juin 2026 »
  baseSalary: number;
  gross: number;
  cnssEmployee: number;
  cnssEmployer: number;
  iuts: number;
  otherDeductions: number;
  netPay: number;
  lines: PayslipLineData[];
  generatedAtLabel: string;
};

const fmt = (n: number) => `${Math.round(n).toLocaleString("fr-FR")} FCFA`;

function row(label: string, amount: number, strong = false): string {
  return `<tr${strong ? ' class="strong"' : ""}><td>${escapeHtml(label)}</td><td class="num">${fmt(amount)}</td></tr>`;
}

export function renderPayslipHtml(d: PayslipPdfData): string {
  const earnings = d.lines.filter((l) => l.kind === "earning");
  const deductions = d.lines.filter((l) => l.kind === "deduction");
  const totalRetenues = d.cnssEmployee + d.iuts + d.otherDeductions;

  const gainRows =
    row("Salaire de base", d.baseSalary) +
    earnings.map((e) => row(e.label, e.amount)).join("") +
    row("Total brut", d.gross, true);

  const retenueRows =
    row("CNSS (part salariale)", d.cnssEmployee) +
    row("IUTS", d.iuts) +
    deductions.map((e) => row(e.label, e.amount)).join("") +
    row("Total des retenues", totalRetenues, true);

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"/>
<style>
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI", Arial, sans-serif; color: #111827; margin: 0; font-size: 12px; }
  .doc { padding: 4px; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111827; padding-bottom: 10px; margin-bottom: 14px; }
  .company { font-size: 18px; font-weight: 800; }
  .title { text-align: right; }
  .title h1 { font-size: 16px; margin: 0; color: #F97316; }
  .title .period { font-weight: 700; margin-top: 2px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; margin-bottom: 16px; }
  .grid .k { color: #6b7280; }
  .grid .kv { display: flex; justify-content: space-between; border-bottom: 1px solid #f3f4f6; padding: 3px 0; }
  .cols { display: flex; gap: 16px; }
  .cols > div { flex: 1; }
  h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: #374151; margin: 0 0 6px; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 5px 8px; border-bottom: 1px solid #f3f4f6; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  tr.strong td { font-weight: 800; background: #f9fafb; border-top: 1px solid #e5e7eb; }
  .net { margin-top: 16px; display: flex; justify-content: space-between; align-items: center; background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 10px; padding: 12px 16px; }
  .net .lbl { font-weight: 800; font-size: 14px; color: #065f46; }
  .net .val { font-weight: 800; font-size: 18px; color: #065f46; }
  .foot { margin-top: 18px; color: #6b7280; font-size: 10px; display: flex; justify-content: space-between; }
  .patronal { margin-top: 10px; color: #6b7280; font-size: 11px; }
</style></head>
<body><div class="doc">
  <div class="head">
    <div class="company">${escapeHtml(d.companyName)}</div>
    <div class="title"><h1>BULLETIN DE PAIE</h1><div class="period">${escapeHtml(d.periodLabel)}</div></div>
  </div>

  <div class="grid">
    <div class="kv"><span class="k">Employé</span><span><b>${escapeHtml(d.employeeName)}</b></span></div>
    <div class="kv"><span class="k">Matricule</span><span>${escapeHtml(d.matricule ?? "—")}</span></div>
    <div class="kv"><span class="k">Poste</span><span>${escapeHtml(d.jobTitle ?? "—")}</span></div>
    <div class="kv"><span class="k">Catégorie</span><span>${escapeHtml(d.category ?? "—")}</span></div>
    <div class="kv"><span class="k">Type de contrat</span><span>${escapeHtml(d.contractType.toUpperCase())}</span></div>
    <div class="kv"><span class="k">N° CNSS</span><span>${escapeHtml(d.cnssNumber ?? "—")}</span></div>
    <div class="kv"><span class="k">Date d'embauche</span><span>${escapeHtml(d.hireDate ?? "—")}</span></div>
    <div class="kv"><span class="k">Période</span><span>${escapeHtml(d.periodLabel)}</span></div>
  </div>

  <div class="cols">
    <div>
      <h2>Gains</h2>
      <table>${gainRows}</table>
    </div>
    <div>
      <h2>Retenues</h2>
      <table>${retenueRows}</table>
    </div>
  </div>

  <div class="net">
    <span class="lbl">NET À PAYER</span>
    <span class="val">${fmt(d.netPay)}</span>
  </div>

  <div class="patronal">Charges patronales (CNSS employeur) : ${fmt(d.cnssEmployer)}</div>

  <div class="foot">
    <span>Document généré par FasoStock</span>
    <span>${escapeHtml(d.generatedAtLabel)}</span>
  </div>
</div></body></html>`;
}

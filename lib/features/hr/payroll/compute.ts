/**
 * Moteur de paie (Burkina Faso) — pur et testable. Montants en FCFA (entiers).
 * Les taux CNSS et le barème IUTS sont fournis en entrée (data-driven, éditables).
 *
 * ⚠️ Les valeurs par défaut du barème sont à FAIRE VALIDER par un comptable /
 * selon le Code général des impôts en vigueur.
 */

export type IutsBracket = {
  lowerBound: number;
  upperBound: number | null; // null = tranche ouverte
  rate: number; // %
};

export type PayrollSettings = {
  cnssEmployeeRate: number; // %
  cnssEmployerRate: number; // %
  cnssCeiling: number;
  iutsChargeReductionRate: number; // % du montant d'IUTS, par charge
  iutsChargeReductionMax: number; // nb max de charges prises en compte
  transportNontaxableCap: number; // part non imposable (informative ici)
};

export type PayrollRubrique = {
  kind: "earning" | "deduction";
  label: string;
  amount: number;
  taxable: boolean; // entre dans la base IUTS
  cnssBase: boolean; // entre dans la base CNSS
};

export type PayrollResult = {
  gross: number;
  cnssBaseAmount: number;
  taxableBase: number;
  cnssEmployee: number;
  cnssEmployer: number;
  iuts: number;
  otherDeductions: number;
  netPay: number;
};

const r = (n: number) => Math.round(n);

/** Impôt progressif par tranches marginales. */
export function computeIuts(base: number, brackets: IutsBracket[]): number {
  if (base <= 0 || brackets.length === 0) return 0;
  const sorted = [...brackets].sort((a, b) => a.lowerBound - b.lowerBound);
  let tax = 0;
  for (const b of sorted) {
    const upper = b.upperBound == null ? Infinity : b.upperBound;
    if (base <= b.lowerBound) break;
    const portion = Math.min(base, upper) - b.lowerBound;
    if (portion > 0) tax += (portion * b.rate) / 100;
  }
  return tax;
}

export function computePayslip(params: {
  baseSalary: number;
  dependents: number;
  rubriques: PayrollRubrique[];
  settings: PayrollSettings;
  brackets: IutsBracket[];
}): PayrollResult {
  const { baseSalary, dependents, rubriques, settings, brackets } = params;
  const earnings = rubriques.filter((x) => x.kind === "earning");
  const deductions = rubriques.filter((x) => x.kind === "deduction");

  const gross = baseSalary + earnings.reduce((s, e) => s + e.amount, 0);

  // Base CNSS : salaire de base + primes soumises à cotisation, plafonnée.
  const cnssBaseRaw =
    baseSalary + earnings.filter((e) => e.cnssBase).reduce((s, e) => s + e.amount, 0);
  const cnssBaseAmount = Math.min(cnssBaseRaw, settings.cnssCeiling);
  const cnssEmployee = r((cnssBaseAmount * settings.cnssEmployeeRate) / 100);
  const cnssEmployer = r((cnssBaseAmount * settings.cnssEmployerRate) / 100);

  // Base imposable IUTS : salaire de base + primes imposables.
  const taxableBase =
    baseSalary + earnings.filter((e) => e.taxable).reduce((s, e) => s + e.amount, 0);
  const iutsGross = computeIuts(taxableBase, brackets);
  const charges = Math.min(dependents, settings.iutsChargeReductionMax);
  const reduction = (iutsGross * settings.iutsChargeReductionRate * charges) / 100;
  const iuts = Math.max(0, r(iutsGross - reduction));

  const otherDeductions = deductions.reduce((s, d) => s + d.amount, 0);
  const netPay = gross - cnssEmployee - iuts - otherDeductions;

  return {
    gross: r(gross),
    cnssBaseAmount: r(cnssBaseAmount),
    taxableBase: r(taxableBase),
    cnssEmployee,
    cnssEmployer,
    iuts,
    otherDeductions: r(otherDeductions),
    netPay: r(netPay),
  };
}

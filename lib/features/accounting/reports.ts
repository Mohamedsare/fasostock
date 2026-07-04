/**
 * États financiers SYSCOHADA calculés à partir des soldes de comptes.
 * Convention : `balance = débit − crédit` (positif = solde débiteur).
 *
 * Le résultat de l'exercice (produits − charges + HAO) est reporté au passif, ce
 * qui garantit l'égalité Actif = Passif tant que toutes les écritures sont équilibrées.
 */

export type AccountBalance = {
  code: string;
  label: string;
  debit: number;
  credit: number;
};

export type StatementLine = { code: string; label: string; amount: number };

export type IncomeStatement = {
  produits: StatementLine[];
  charges: StatementLine[];
  haoNet: number;
  totalProduits: number;
  totalCharges: number;
  resultatNet: number;
};

export type BalanceSheet = {
  actif: StatementLine[];
  passif: StatementLine[];
  resultatNet: number;
  totalActif: number;
  totalPassif: number;
};

const classOf = (code: string): number => {
  const n = Number.parseInt(code.slice(0, 1), 10);
  return Number.isFinite(n) ? n : 0;
};

export function computeIncomeStatement(rows: AccountBalance[]): IncomeStatement {
  const produits: StatementLine[] = [];
  const charges: StatementLine[] = [];
  let haoNet = 0;
  for (const r of rows) {
    const cls = classOf(r.code);
    const bal = r.debit - r.credit;
    if (cls === 7) {
      const amount = -bal; // solde créditeur = produit
      if (amount !== 0) produits.push({ code: r.code, label: r.label, amount });
    } else if (cls === 6) {
      const amount = bal; // solde débiteur = charge
      if (amount !== 0) charges.push({ code: r.code, label: r.label, amount });
    } else if (cls === 8) {
      haoNet += -bal; // net HAO (produits − charges hors activités ordinaires)
    }
  }
  produits.sort((a, b) => a.code.localeCompare(b.code));
  charges.sort((a, b) => a.code.localeCompare(b.code));
  const totalProduits = produits.reduce((s, l) => s + l.amount, 0);
  const totalCharges = charges.reduce((s, l) => s + l.amount, 0);
  return {
    produits,
    charges,
    haoNet,
    totalProduits,
    totalCharges,
    resultatNet: totalProduits - totalCharges + haoNet,
  };
}

export function computeBalanceSheet(rows: AccountBalance[]): BalanceSheet {
  const actif: StatementLine[] = [];
  const passif: StatementLine[] = [];
  let resultatNet = 0;
  for (const r of rows) {
    const cls = classOf(r.code);
    const bal = r.debit - r.credit;
    if (cls >= 6 && cls <= 8) {
      // Comptes de gestion → résultat (reporté au passif) :
      // produits/HAO créditeurs augmentent, charges débitrices diminuent.
      resultatNet += -bal;
      continue;
    }
    if (cls < 1 || cls > 5) continue;
    if (bal > 0) actif.push({ code: r.code, label: r.label, amount: bal });
    else if (bal < 0) passif.push({ code: r.code, label: r.label, amount: -bal });
  }
  actif.sort((a, b) => a.code.localeCompare(b.code));
  passif.sort((a, b) => a.code.localeCompare(b.code));
  const totalActif = actif.reduce((s, l) => s + l.amount, 0);
  const totalPassif = passif.reduce((s, l) => s + l.amount, 0) + resultatNet;
  return { actif, passif, resultatNet, totalActif, totalPassif };
}

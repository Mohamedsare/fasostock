import type { Expense } from "./types";
import { expenseCategoryDisplay, expensePaymentLabel } from "./types";

/** Matrice d'export Excel (en-têtes + lignes) pour les dépenses. */
export function expensesToSpreadsheetMatrix(
  rows: Expense[],
  storeName: (id: string | null) => string | null,
  /** Postes personnalisés, pour que l'export porte le nom vu à l'écran. */
  customNameById: Map<string, string> = new Map(),
): { headers: string[]; rows: (string | number)[][] } {
  const headers = [
    "Date",
    "Catégorie",
    "Libellé",
    "Bénéficiaire",
    "Mode de règlement",
    "Référence",
    "Boutique",
    "Par qui",
    "Montant",
  ];
  const matrix = rows.map((e) => [
    e.expense_date,
    expenseCategoryDisplay(e, customNameById),
    e.label ?? "",
    e.payee ?? "",
    expensePaymentLabel(e.payment_method),
    e.reference ?? "",
    storeName(e.store_id) ?? "",
    e.created_by_label ?? "",
    e.amount,
  ]);
  return { headers, rows: matrix };
}

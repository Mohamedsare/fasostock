import type { Expense } from "./types";
import { expenseCategoryLabel, expensePaymentLabel } from "./types";

/** Matrice d'export Excel (en-têtes + lignes) pour les dépenses. */
export function expensesToSpreadsheetMatrix(
  rows: Expense[],
  storeName: (id: string | null) => string | null,
): { headers: string[]; rows: (string | number)[][] } {
  const headers = [
    "Date",
    "Catégorie",
    "Libellé",
    "Bénéficiaire",
    "Mode de règlement",
    "Référence",
    "Boutique",
    "Montant",
  ];
  const matrix = rows.map((e) => [
    e.expense_date,
    expenseCategoryLabel(e.category),
    e.label ?? "",
    e.payee ?? "",
    expensePaymentLabel(e.payment_method),
    e.reference ?? "",
    storeName(e.store_id) ?? "",
    e.amount,
  ]);
  return { headers, rows: matrix };
}

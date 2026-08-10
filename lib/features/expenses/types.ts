/** Une dépense / charge (table `public.expenses`). */
export type Expense = {
  id: string;
  company_id: string;
  store_id: string | null;
  category: string;
  /**
   * Poste de dépense propre à l'entreprise (mode « Personnaliser mes dépenses »).
   * Renseigné ⇒ il prime sur `category` pour l'affichage.
   */
  category_id: string | null;
  label: string | null;
  amount: number;
  payment_method: string;
  payee: string | null;
  reference: string | null;
  expense_date: string;
  notes: string | null;
  /** Qui a enregistré la sortie d'argent (trace, écrite en base). */
  created_by: string | null;
  /** Nom lisible de l'auteur, résolu à la lecture (`profiles`). */
  created_by_label: string | null;
  created_at: string;
  updated_at: string;
};

/** Saisie formulaire (création / édition). */
export type ExpenseFormInput = {
  category: string;
  /** Poste personnalisé choisi ; `null` en mode standard. */
  categoryId: string | null;
  label: string;
  amount: number;
  paymentMethod: string;
  payee: string;
  reference: string;
  expenseDate: string;
  storeId: string | null;
  notes: string;
};

/** Un poste de dépense créé par l'entreprise (table `public.expense_categories`). */
export type CustomExpenseCategory = {
  id: string;
  companyId: string;
  name: string;
  position: number;
  isActive: boolean;
};

export type ExpenseCategory = {
  key: string;
  label: string;
};

/** Catégories de dépenses (clés stables stockées en base). */
export const EXPENSE_CATEGORIES: readonly ExpenseCategory[] = [
  { key: "loyer", label: "Loyer & local" },
  { key: "salaires", label: "Salaires & personnel" },
  { key: "electricite_eau", label: "Électricité & eau" },
  { key: "transport", label: "Transport & carburant" },
  { key: "fournitures", label: "Fournitures & consommables" },
  { key: "marketing", label: "Marketing & publicité" },
  { key: "maintenance", label: "Maintenance & réparations" },
  { key: "telecom", label: "Téléphone & internet" },
  { key: "taxes", label: "Taxes & impôts" },
  { key: "banque", label: "Frais bancaires" },
  { key: "autre", label: "Autre" },
] as const;

export function expenseCategoryLabel(key: string): string {
  return EXPENSE_CATEGORIES.find((c) => c.key === key)?.label ?? "Autre";
}

export type ExpensePaymentMethod = { key: string; label: string };

/** Modes de règlement (alignés sur les modes de paiement de l'app). */
export const EXPENSE_PAYMENT_METHODS: readonly ExpensePaymentMethod[] = [
  { key: "cash", label: "Espèces" },
  { key: "mobile_money", label: "Mobile Money" },
  { key: "card", label: "Carte" },
  { key: "bank", label: "Virement / Banque" },
  { key: "credit", label: "Crédit (à payer)" },
] as const;

export function expensePaymentLabel(key: string): string {
  return EXPENSE_PAYMENT_METHODS.find((m) => m.key === key)?.label ?? key;
}

/**
 * Libellé de la catégorie tel qu'il doit s'afficher : le poste personnalisé s'il existe
 * encore, sinon la catégorie standard. Un poste supprimé (`category_id` remis à NULL par
 * la base) retombe donc proprement sur « Autre » au lieu d'afficher un vide.
 */
export function expenseCategoryDisplay(
  expense: Pick<Expense, "category" | "category_id">,
  customNameById: Map<string, string>,
): string {
  if (expense.category_id) {
    const name = customNameById.get(expense.category_id);
    if (name) return name;
  }
  return expenseCategoryLabel(expense.category);
}

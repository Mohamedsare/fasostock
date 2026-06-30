/** Modules de l'app couverts par les tutoriels vidéo (clé stable + libellé FR). */
export type TutorialModule = { key: string; label: string };

export const TUTORIAL_MODULES: readonly TutorialModule[] = [
  { key: "products", label: "Produits" },
  { key: "barcodes", label: "Code Barre" },
  { key: "sales", label: "Ventes" },
  { key: "invoice_a4", label: "Configuration Facture A4" },
  { key: "stock", label: "Stock" },
  { key: "expiry", label: "Péremptions" },
  { key: "expenses", label: "Dépenses" },
  { key: "warehouse", label: "Magasin" },
  { key: "customers", label: "Clients" },
  { key: "credit", label: "Crédits" },
  { key: "reports", label: "Rapports" },
  { key: "employees", label: "Employés" },
  { key: "printers", label: "Imprimantes" },
  { key: "settings", label: "Paramètres" },
  { key: "ai", label: "Prédictions IA" },
  { key: "transfers", label: "Transferts" },
] as const;

export function tutorialModuleLabel(key: string): string {
  return TUTORIAL_MODULES.find((m) => m.key === key)?.label ?? key;
}

/**
 * Clés alignées sur `app/lib/core/constants/permissions.dart` et `role_permissions` Supabase.
 */
export const P = {
  companyManage: "company.manage",
  storesCreate: "stores.create",
  storesRequestExtra: "stores.request_extra",
  storesApproveExtra: "stores.approve_extra",
  storesView: "stores.view",
  productsCreate: "products.create",
  productsUpdate: "products.update",
  productsDelete: "products.delete",
  productsView: "products.view",
  productsImport: "products.import",
  salesCreate: "sales.create",
  salesUpdate: "sales.update",
  salesCancel: "sales.cancel",
  salesRefund: "sales.refund",
  salesView: "sales.view",
  salesInvoiceA4: "sales.invoice_a4",
  salesInvoiceA4Table: "sales.invoice_a4_table",
  /**
   * Caisse à deux : CONFIRMER et ENCAISSER un bon envoyé par un vendeur.
   * Distinct de `sales.create` à dessein — le propriétaire choisit qui touche
   * l'argent, sans avoir à empêcher quelqu'un de servir les clients.
   */
  posCheckout: "pos.checkout",
  purchasesCreate: "purchases.create",
  purchasesView: "purchases.view",
  purchasesCancel: "purchases.cancel",
  purchasesUpdate: "purchases.update",
  purchasesDelete: "purchases.delete",
  stockAdjust: "stock.adjust",
  stockTransfer: "stock.transfer",
  stockView: "stock.view",
  /** Sessions d'inventaire physique (comptage / écarts / validation) — distinct de stock.adjust. */
  inventoryManage: "inventory.manage",
  /** Dépôt central : RPC + inventaire — rôle Magasinier (stock_manager) par défaut. */
  warehouseManage: "warehouse.manage",
  reportsViewGlobal: "reports.view_global",
  reportsViewStore: "reports.view_store",
  usersManage: "users.manage",
  settingsManage: "settings.manage",
  aiInsightsView: "ai.insights.view",
  cashOpenClose: "cash.open_close",
  cashView: "cash.view",
  auditView: "audit.view",
  dashboardView: "dashboard.view",
  customersView: "customers.view",
  customersManage: "customers.manage",
  /** Page Crédit / créances — owner par défaut ; accord explicite aux autres. */
  creditView: "credit.view",
  /** Page Code Barre — owner par défaut ; accord explicite aux autres. */
  barcodesManage: "barcodes.manage",
  /** Page Promotions — owner par défaut ; accord explicite aux autres. */
  promotionsManage: "promotions.manage",
  /** Page Achats Progressifs (épargne vers un engin) — owner par défaut ; accord explicite aux autres. */
  progressiveManage: "progressive.manage",
  /** Page Location (gestion locative) — owner par défaut ; accord explicite aux autres. */
  rentalManage: "rental.manage",
  /** Page Réparations (ordres de réparation garage) — owner par défaut. */
  repairsManage: "repairs.manage",
  /**
   * Page Devis & Factures — établir une proposition de prix et facturer.
   * Distinct de `sales.create` : chiffrer pour une mairie n'est pas tenir la caisse.
   */
  saleDocumentsManage: "sale_documents.manage",
  /** Page Péremptions (DLC/DLUO) — owner par défaut ; accord explicite aux autres. */
  expiryView: "expiry.view",
  /** Page Pièces (compatibilités, équivalences, variantes) — owner par défaut. */
  partsManage: "parts.manage",
  /** Page Réassort (produits à recommander + quantité conseillée) — owner par défaut. */
  restockView: "restock.view",
  /** Page Emplacements (plan de rangement + rangement des produits) — owner par défaut. */
  productLocationsManage: "product_locations.manage",
  /** Page Prix de revient (arrivages, frais d'approche, prix de vente) — owner par défaut. */
  landedCostManage: "landed_cost.manage",
  /** Boutique en ligne : vitrine publique + commandes web — owner par défaut. */
  onlineStoreManage: "online_store.manage",
  /**
   * Approvisionnement express (page /approvisionnement) — accordé à AUCUN rôle par
   * défaut. Droit volontairement étroit : il autorise l'entrée de marchandise et la
   * création d'un produit manquant par cette page seulement, sans ouvrir la fiche
   * produit ni l'ajustement de stock libre.
   */
  quickSupplyCreate: "quick_supply.create",
  /**
   * Page « Photos produits » — illustrer le catalogue, et RIEN d'autre. Accordé par
   * défaut aux rôles qui travaillent le rayon : la page n'existe de toute façon que si
   * le propriétaire a ouvert le module.
   */
  productsPhoto: "products.photo",
  /**
   * Créer une fiche produit SANS prix (elle reste invendable jusqu'à ce que le
   * propriétaire la chiffre). Distinct de `products.create`, qui ouvre les prix.
   */
  productsDraftCreate: "products.draft_create",
  /**
   * Page « Enlèvements partenaires » — sortir de la marchandise pour un confrère et
   * suivre ce qu'il doit. Accordé à AUCUN rôle : c'est une décision de patron.
   */
  partnerOfftakesManage: "partner_offtakes.manage",
  /**
   * Page « Expéditions » — envoyer un colis et suivre les frais avancés. Accordé à
   * AUCUN rôle par défaut, pour la même raison.
   */
  shipmentsManage: "shipments.manage",
  /** Page Dépenses — consultation ; owner par défaut, accordable aux autres. */
  expensesView: "expenses.view",
  /** Page Dépenses — création / modification / suppression. */
  expensesManage: "expenses.manage",
  suppliersView: "suppliers.view",
  suppliersManage: "suppliers.manage",
  transfersCreate: "transfers.create",
  transfersApprove: "transfers.approve",
  /** Module Comptabilité (SYSCOHADA) — consultation ; owner par défaut, accordable aux autres. */
  accountingView: "accounting.view",
  /** Comptabilité — saisie / modification des écritures, plan comptable, journaux. */
  accountingManage: "accounting.manage",
  /** Comptabilité — paramètres (exercices, comptes par défaut, TVA). */
  accountingSettings: "accounting.settings",
  /** Module R. Humaine — consultation (employés, contrats, congés). */
  hrView: "hr.view",
  /** R. Humaine — gestion (employés, contrats, congés). */
  hrManage: "hr.manage",
  /** Paie — consultation des bulletins et du livre de paie. */
  payrollView: "payroll.view",
  /** Paie — génération / validation des bulletins, barèmes CNSS / IUTS. */
  payrollManage: "payroll.manage",
} as const;

/** Liste complète (équivalent `Permissions.all` Flutter) — super_admin. */
export const PERMISSIONS_ALL = Object.values(P);

/** Libellés FR pour la section gestion fine des droits (owner). */
export const PERMISSION_LABELS_FR: Record<string, string> = {
  [P.companyManage]: "Gerer l'entreprise",
  [P.storesCreate]: "Creer des boutiques",
  [P.storesRequestExtra]: "Demander des boutiques en plus",
  [P.storesApproveExtra]: "Approuver les demandes de boutiques",
  [P.storesView]: "Voir les boutiques",
  [P.productsCreate]: "Creer des produits",
  [P.productsUpdate]: "Modifier des produits",
  [P.productsDelete]: "Supprimer des produits",
  [P.productsView]: "Voir les produits",
  [P.productsImport]: "Importer des produits (CSV)",
  [P.salesCreate]: "Creer des ventes (caisse rapide)",
  [P.salesUpdate]: "Modifier des ventes completees",
  [P.salesCancel]: "Annuler des ventes",
  [P.salesRefund]: "Rembourser des ventes",
  [P.salesView]: "Voir l'historique des ventes",
  [P.salesInvoiceA4]: "Emettre des factures A4",
  [P.salesInvoiceA4Table]: "POS facture A4 (vue tableau)",
  [P.posCheckout]: "Encaisser les paniers envoyes (caisse a deux)",
  [P.purchasesCreate]: "Creer des achats",
  [P.purchasesView]: "Voir les achats",
  [P.purchasesCancel]: "Annuler des achats",
  [P.purchasesUpdate]: "Modifier des achats (brouillons)",
  [P.purchasesDelete]: "Supprimer des achats (brouillons)",
  [P.stockAdjust]: "Ajuster le stock",
  [P.stockTransfer]: "Transferer le stock",
  [P.stockView]: "Voir le stock / inventaire",
  [P.inventoryManage]: "Faire l'inventaire (comptage physique)",
  [P.warehouseManage]: "Gerer le depot magasin (complet)",
  [P.reportsViewGlobal]: "Voir les rapports (global)",
  [P.reportsViewStore]: "Voir les rapports (boutique)",
  [P.usersManage]: "Gerer les utilisateurs",
  [P.settingsManage]: "Gerer les parametres",
  [P.aiInsightsView]: "Voir les insights IA",
  [P.cashOpenClose]: "Ouvrir / fermer la caisse",
  [P.cashView]: "Voir la caisse / mouvements",
  [P.auditView]: "Voir l'audit",
  [P.dashboardView]: "Voir le tableau de bord",
  [P.customersView]: "Voir les clients",
  [P.customersManage]: "Gerer les clients",
  [P.creditView]: "Voir la page Credit (creances clients)",
  [P.barcodesManage]: "Gerer / imprimer les codes-barres produits",
  [P.promotionsManage]: "Gerer les promotions (remises %)",
  [P.progressiveManage]: "Gerer les achats progressifs (avances clients)",
  [P.rentalManage]: "Gerer la location (biens, baux, loyers)",
  [P.repairsManage]: "Gerer les reparations (ordres de reparation, facturation)",
  [P.saleDocumentsManage]: "Gerer les devis et factures (etablir, envoyer, facturer)",
  [P.expiryView]: "Voir la page Peremptions (DLC/DLUO)",
  [P.partsManage]: "Gerer les pieces (compatibilites, equivalences, variantes)",
  [P.restockView]: "Voir la page Reassort (produits a recommander)",
  [P.productLocationsManage]: "Gerer les emplacements (plan de rangement des produits)",
  [P.landedCostManage]: "Gerer le prix de revient (arrivages, frais, prix de vente)",
  [P.onlineStoreManage]: "Gerer la boutique en ligne (catalogue public, commandes web)",
  [P.quickSupplyCreate]: "Faire un approvisionnement (entrer de la marchandise)",
  [P.productsPhoto]: "Ajouter des photos aux produits (page Photos produits)",
  [P.productsDraftCreate]: "Ajouter un produit sans prix (a chiffrer par le patron)",
  [P.partnerOfftakesManage]: "Gerer les enlevements partenaires (sortie de marchandise, creances)",
  [P.shipmentsManage]: "Gerer les expeditions (colis, frais de transport avances)",
  [P.expensesView]: "Voir la page Depenses (charges)",
  [P.expensesManage]: "Gerer les depenses (ajout / modif / suppression)",
  [P.suppliersView]: "Voir les fournisseurs",
  [P.suppliersManage]: "Gerer les fournisseurs",
  [P.transfersCreate]: "Creer / gerer les transferts",
  [P.transfersApprove]: "Approuver les transferts",
  [P.accountingView]: "Voir la comptabilite (SYSCOHADA)",
  [P.accountingManage]: "Saisir / gerer les ecritures comptables",
  [P.accountingSettings]: "Gerer les parametres comptables (exercices, comptes, TVA)",
  [P.hrView]: "Voir les ressources humaines (employes, contrats, conges)",
  [P.hrManage]: "Gerer les ressources humaines (employes, contrats, conges)",
  [P.payrollView]: "Voir la paie (bulletins, livre de paie)",
  [P.payrollManage]: "Gerer la paie (bulletins, baremes CNSS / IUTS)",
};

/**
 * Droits qu'un AUTRE droit coché rend inopérants.
 *
 * L'écran des droits est une liste plate d'une soixantaine de cases. Rien n'y disait
 * que deux d'entre elles pouvaient s'annuler : le propriétaire cochait « Ajouter un
 * produit sans prix » à côté de « Modifier des produits », lisait une restriction, et
 * n'en avait aucune — l'employé gardait le formulaire complet, prix compris.
 */
export const PERMISSION_NEUTRALIZED_BY: Record<
  string,
  { by: readonly string[]; note: string }
> = {
  [P.productsDraftCreate]: {
    by: [P.productsCreate, P.productsUpdate, P.productsImport],
    note:
      "Sans effet : cette personne peut deja creer ou modifier une fiche produit, prix compris. "
      + "Pour qu'elle n'ajoute que des articles a chiffrer, decochez « Creer des produits », "
      + "« Modifier des produits » et « Importer des produits (CSV) ».",
  },
};

/**
 * Droits qui ne servent à rien sans un autre — la page qu'ils ouvrent reste
 * inaccessible. `products.draft_create` n'ouvre pas la page Produits : le bouton
 * « Ajouter un article » y vit, et sans « Voir les produits » l'entrée de menu
 * n'apparaît même pas.
 */
export const PERMISSION_REQUIRES: Record<
  string,
  { needs: readonly string[]; note: string }
> = {
  [P.productsDraftCreate]: {
    needs: [P.productsView],
    note:
      "Incomplet : le bouton « Ajouter un article » se trouve sur la page Produits. "
      + "Cochez aussi « Voir les produits », sinon cette personne n'aura pas l'entree de menu.",
  },
};

/**
 * Message à afficher sous une case cochée, ou `null`. Le droit neutralisé passe avant
 * le droit incomplet : inutile de réclamer « Voir les produits » à quelqu'un pour qui
 * la case ne changera rien de toute façon.
 */
export function permissionGrantWarning(
  key: string,
  grantedKeys: readonly string[],
): string | null {
  const neutralized = PERMISSION_NEUTRALIZED_BY[key];
  if (neutralized && neutralized.by.some((k) => grantedKeys.includes(k))) {
    return neutralized.note;
  }
  const required = PERMISSION_REQUIRES[key];
  if (required && !required.needs.every((k) => grantedKeys.includes(k))) {
    return required.note;
  }
  return null;
}

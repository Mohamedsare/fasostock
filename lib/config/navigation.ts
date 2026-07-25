import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  CirclePlus,
  Package,
  ShoppingCart,
  UtensilsCrossed,
  HandPlatter,
  Bike,
  IdCard,
  PiggyBank,
  History,
  Store,
  Warehouse,
  ClipboardCheck,
  AlertTriangle,
  CalendarClock,
  Truck,
  Boxes,
  ArrowLeftRight,
  Users,
  Building2,
  BarChart3,
  Sparkles,
  Calculator,
  BriefcaseBusiness,
  UserCog,
  ScrollText,
  CreditCard,
  Wallet,
  Barcode,
  BadgePercent,
  HelpCircle,
  Crown,
  KeyRound,
  Settings,
} from "lucide-react";
import { ROUTES } from "./routes";

export type NavItem = {
  kind?: "link" | "section";
  href: string;
  label: string;
  icon: LucideIcon;
  /** Couleur de fond de l'icône (hex). Icône blanche sur fond coloré. */
  iconBg?: string;
  /** Masqué du menu latéral si false (ex. Intégrations accessibles depuis Paramètres). */
  showInSidebar?: boolean;
  /** Petit retrait visuel pour les sous-éléments (menu hiérarchique). */
  child?: boolean;
};

/** Ordre et libellés alignés sur `app_shell.dart` (Flutter). */
export const NAV_ITEMS: NavItem[] = [
  { href: ROUTES.dashboard, label: "Tableau de bord", icon: LayoutDashboard, iconBg: "#F97316" },
  { href: ROUTES.products, label: "Produits", icon: Package, iconBg: "#7C2D12" },
  { href: ROUTES.barcodes, label: "Code Barre", icon: Barcode, iconBg: "#9A3412" },
  { href: ROUTES.sales, label: "Ventes", icon: ShoppingCart, iconBg: "#EA580C" },
  { href: ROUTES.promotions, label: "Promotions", icon: BadgePercent, iconBg: "#DB2777" },
  { href: ROUTES.engines, label: "Vente Engins", icon: Bike, iconBg: "#DC2626" },
  { href: ROUTES.engineRegistration, label: "Immatriculation Engins", icon: IdCard, iconBg: "#B91C1C" },
  { href: ROUTES.progressive, label: "Achats Progressifs", icon: PiggyBank, iconBg: "#0D9488" },
  { href: ROUTES.stores, label: "Boutiques", icon: Store, iconBg: "#C2410C" },
  { href: ROUTES.inventory, label: "Stock", icon: Warehouse, iconBg: "#78350F" },
  { href: ROUTES.inventorySessions, label: "Inventaire", icon: ClipboardCheck, iconBg: "#166534" },
  {
    href: ROUTES.stockCashier,
    label: "Stock (alertes)",
    icon: AlertTriangle,
    iconBg: "#B45309",
  },
  { href: ROUTES.expiry, label: "Péremptions", icon: CalendarClock, iconBg: "#B45309" },
  { href: ROUTES.purchases, label: "Achats", icon: Truck, iconBg: "#92400E" },
  { href: ROUTES.expenses, label: "Dépenses", icon: Wallet, iconBg: "#B45309" },
  { href: ROUTES.warehouse, label: "Magasin", icon: Boxes, iconBg: "#7C2D12" },
  { href: ROUTES.transfers, label: "Transferts", icon: ArrowLeftRight, iconBg: "#EA580C" },
  { href: ROUTES.customers, label: "Clients", icon: Users, iconBg: "#9A3412" },
  { href: ROUTES.credit, label: "Crédit", icon: CreditCard, iconBg: "#D97706" },
  { href: ROUTES.suppliers, label: "Fournisseurs", icon: Building2, iconBg: "#C2410C" },
  { href: ROUTES.reports, label: "Rapports", icon: BarChart3, iconBg: "#F97316" },
  { href: ROUTES.ai, label: "Prédictions IA", icon: Sparkles, iconBg: "#78350F" },
  { href: ROUTES.accounting, label: "Comptabilité", icon: Calculator, iconBg: "#166534" },
  { href: ROUTES.hr, label: "R. Humaine", icon: BriefcaseBusiness, iconBg: "#1E3A8A" },
  { href: ROUTES.users, label: "Employés", icon: UserCog, iconBg: "#92400E" },
  { href: ROUTES.audit, label: "Journal d'audit", icon: ScrollText, iconBg: "#7C2D12" },
  {
    href: ROUTES.integrations,
    label: "Intégrations API",
    icon: KeyRound,
    iconBg: "#9A3412",
    showInSidebar: false,
  },
  { href: ROUTES.settings, label: "Paramètres", icon: Settings, iconBg: "#92400E" },
  { href: ROUTES.help, label: "Aide", icon: HelpCircle, iconBg: "#D97706" },
  { href: ROUTES.subscription, label: "Abonnement", icon: Crown, iconBg: "#CA8A04" },
];

/** Navigation restaurant hiérarchique (phase 1: existants + placeholders). */
export const RESTAURANT_NAV_ITEMS: NavItem[] = [
  { href: ROUTES.dashboard, label: "Tableau de bord", icon: LayoutDashboard },

  { kind: "section", href: "/restaurant/_sec_ventes", label: "Commandes", icon: ShoppingCart },
  { href: "/restaurant/ventes/nouvelle-commande", label: "Nouvelle commande", icon: CirclePlus, child: true },
  { href: "/restaurant/ventes/salle", label: "Commandes en salle", icon: UtensilsCrossed, child: true },
  { href: "/restaurant/ventes/emporter", label: "A emporter", icon: HandPlatter, child: true },
  { href: "/restaurant/ventes/livraisons", label: "Livraisons", icon: Bike, child: true },
  { href: "/restaurant/ventes/historique", label: "Historique", icon: History, child: true },

  { kind: "section", href: "/restaurant/_sec_caisse", label: "Caisse", icon: CreditCard },
  { href: "/restaurant/caisse", label: "Poste de caisse", icon: CreditCard, child: true },
  { href: "/restaurant/caisse/paiements", label: "Paiements", icon: CreditCard, child: true },
  { href: "/restaurant/caisse/sessions", label: "Sessions de caisse", icon: CreditCard, child: true },
  { href: "/restaurant/caisse/cloture", label: "Cloture", icon: CreditCard, child: true },

  { kind: "section", href: "/restaurant/_sec_salle", label: "Salle & Tables", icon: Store },
  { href: "/restaurant/salle/plan", label: "Plan de salle", icon: Store, child: true },
  { href: "/restaurant/salle/tables", label: "Tables", icon: Store, child: true },
  { href: "/restaurant/salle/reservations", label: "Reservations", icon: Store, child: true },

  { kind: "section", href: "/restaurant/_sec_menu", label: "Menu", icon: Package },
  { href: "/restaurant/menu/categories", label: "Categories", icon: Package, child: true },
  { href: "/restaurant/menu/plats", label: "Plats", icon: Package, child: true },
  { href: "/restaurant/menu/boissons", label: "Boissons", icon: Package, child: true },
  { href: "/restaurant/menu/supplements", label: "Supplements", icon: Package, child: true },
  { href: "/restaurant/menu/variantes", label: "Variantes", icon: Package, child: true },
  { href: ROUTES.products, label: "Disponibilite", icon: Package, child: true },

  { kind: "section", href: "/restaurant/_sec_cuisine", label: "Cuisine", icon: Warehouse },
  { href: "/restaurant/cuisine/kds", label: "Cuisine / KDS", icon: Warehouse, child: true },
  { href: "/restaurant/cuisine/preparation", label: "En preparation", icon: Warehouse, child: true },
  { href: "/restaurant/cuisine/pretes", label: "Pretes", icon: Warehouse, child: true },
  { href: "/restaurant/cuisine/recettes", label: "Recettes", icon: Warehouse, child: true },
  { href: "/restaurant/cuisine/fiches-techniques", label: "Fiches techniques", icon: Warehouse, child: true },

  { kind: "section", href: "/restaurant/_sec_stock", label: "Stock", icon: Warehouse },
  { href: ROUTES.inventory, label: "Stock global", icon: Warehouse, child: true },
  { href: "/restaurant/stock/ingredients", label: "Ingredients", icon: Warehouse, child: true },
  { href: "/restaurant/stock/mouvements", label: "Mouvements", icon: Warehouse, child: true },
  { href: "/restaurant/stock/inventaires", label: "Inventaires", icon: Warehouse, child: true },
  { href: "/restaurant/stock/ajustements", label: "Ajustements", icon: Warehouse, child: true },
  { href: "/restaurant/stock/pertes", label: "Pertes / Gaspillage", icon: Warehouse, child: true },
  { href: "/restaurant/stock/alertes", label: "Alertes de stock", icon: AlertTriangle, child: true },

  { kind: "section", href: "/restaurant/_sec_achats", label: "Achats", icon: Truck },
  { href: ROUTES.purchases, label: "Liste des achats", icon: Truck, child: true },
  { href: ROUTES.suppliers, label: "Fournisseurs", icon: Building2, child: true },
  { href: "/restaurant/achats/commandes-fournisseurs", label: "Commandes fournisseurs", icon: Truck, child: true },
  { href: "/restaurant/achats/receptions", label: "Receptions", icon: Truck, child: true },

  { kind: "section", href: "/restaurant/_sec_clients", label: "Clients", icon: Users },
  { href: ROUTES.customers, label: "Base clients", icon: Users, child: true },
  { href: "/restaurant/clients/fidelite", label: "Fidelite", icon: Users, child: true },
  { href: "/restaurant/clients/historique", label: "Historique client", icon: Users, child: true },

  { kind: "section", href: "/restaurant/_sec_livraison", label: "Livraison", icon: Truck },
  { href: "/restaurant/livraison/livreurs", label: "Livreurs", icon: Truck, child: true },
  { href: "/restaurant/livraison/zones", label: "Zones de livraison", icon: Truck, child: true },
  { href: "/restaurant/livraison/suivi", label: "Suivi", icon: Truck, child: true },

  { kind: "section", href: "/restaurant/_sec_depenses", label: "Depenses", icon: CreditCard },
  { href: ROUTES.expenses, label: "Suivi des depenses", icon: Wallet, child: true },
  { href: "/restaurant/depenses/categories", label: "Categories de depenses", icon: CreditCard, child: true },

  { kind: "section", href: "/restaurant/_sec_employes", label: "Employes", icon: UserCog },
  { href: ROUTES.users, label: "Employes", icon: UserCog, child: true },
  { href: "/restaurant/employes/roles", label: "Roles & permissions", icon: UserCog, child: true },
  { href: "/restaurant/employes/presences", label: "Presences", icon: UserCog, child: true },
  { href: "/restaurant/employes/performances", label: "Performances", icon: UserCog, child: true },

  { kind: "section", href: "/restaurant/_sec_rapports", label: "Rapports", icon: BarChart3 },
  { href: "/restaurant/rapports/ventes", label: "Ventes", icon: BarChart3, child: true },
  { href: "/restaurant/rapports/stock", label: "Stock", icon: BarChart3, child: true },
  { href: "/restaurant/rapports/rentabilite", label: "Rentabilite", icon: BarChart3, child: true },
  { href: "/restaurant/rapports/serveurs", label: "Serveurs", icon: BarChart3, child: true },
  { href: "/restaurant/rapports/paiements", label: "Paiements", icon: BarChart3, child: true },
  { href: "/restaurant/rapports/pertes", label: "Pertes", icon: BarChart3, child: true },

  { kind: "section", href: "/restaurant/_sec_parametres", label: "Parametres", icon: Settings },
  { href: "/restaurant/parametres/general", label: "General", icon: Settings, child: true },
  { href: "/restaurant/parametres/restaurant", label: "Restaurant", icon: Settings, child: true },
  { href: "/restaurant/parametres/taxes", label: "Taxes", icon: Settings, child: true },
  { href: "/restaurant/parametres/paiements", label: "Paiements", icon: Settings, child: true },
];

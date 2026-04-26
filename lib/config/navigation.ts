import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  CirclePlus,
  Package,
  ShoppingCart,
  UtensilsCrossed,
  HandPlatter,
  Bike,
  History,
  Store,
  Warehouse,
  AlertTriangle,
  Truck,
  Boxes,
  ArrowLeftRight,
  Users,
  Building2,
  BarChart3,
  Sparkles,
  UserCog,
  ScrollText,
  CreditCard,
  Barcode,
  HelpCircle,
  Bell,
  KeyRound,
  Printer,
  Settings,
} from "lucide-react";
import { ROUTES } from "./routes";

export type NavItem = {
  kind?: "link" | "section";
  href: string;
  label: string;
  icon: LucideIcon;
  /** Masqué du menu latéral si false (ex. Intégrations accessibles depuis Paramètres). */
  showInSidebar?: boolean;
  /** Petit retrait visuel pour les sous-éléments (menu hiérarchique). */
  child?: boolean;
};

/** Ordre et libellés alignés sur `app_shell.dart` (Flutter). */
export const NAV_ITEMS: NavItem[] = [
  { href: ROUTES.dashboard, label: "Tableau de bord", icon: LayoutDashboard },
  { href: ROUTES.products, label: "Produits", icon: Package },
  { href: ROUTES.barcodes, label: "Code Barre", icon: Barcode },
  { href: ROUTES.sales, label: "Ventes", icon: ShoppingCart },
  { href: ROUTES.stores, label: "Boutiques", icon: Store },
  { href: ROUTES.inventory, label: "Stock", icon: Warehouse },
  {
    href: ROUTES.stockCashier,
    label: "Stock (alertes)",
    icon: AlertTriangle,
  },
  { href: ROUTES.purchases, label: "Achats", icon: Truck },
  { href: ROUTES.warehouse, label: "Magasin", icon: Boxes },
  { href: ROUTES.transfers, label: "Transferts", icon: ArrowLeftRight },
  { href: ROUTES.customers, label: "Clients", icon: Users },
  { href: ROUTES.credit, label: "Crédit", icon: CreditCard },
  { href: ROUTES.suppliers, label: "Fournisseurs", icon: Building2 },
  { href: ROUTES.reports, label: "Rapports", icon: BarChart3 },
  { href: ROUTES.ai, label: "Prédictions IA", icon: Sparkles },
  { href: ROUTES.users, label: "Utilisateurs", icon: UserCog },
  { href: ROUTES.audit, label: "Journal d'audit", icon: ScrollText },
  {
    href: ROUTES.integrations,
    label: "Intégrations API",
    icon: KeyRound,
    showInSidebar: false,
  },
  { href: ROUTES.printers, label: "Imprimantes", icon: Printer },
  { href: ROUTES.settings, label: "Paramètres", icon: Settings },
  { href: ROUTES.help, label: "Aide", icon: HelpCircle },
  { href: ROUTES.notifications, label: "Notifications", icon: Bell },
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
  { href: "/restaurant/depenses", label: "Suivi des depenses", icon: CreditCard, child: true },
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
  { href: ROUTES.printers, label: "Imprimantes", icon: Printer, child: true },
  { href: "/restaurant/parametres/taxes", label: "Taxes", icon: Settings, child: true },
  { href: "/restaurant/parametres/paiements", label: "Paiements", icon: Settings, child: true },
  { href: ROUTES.users, label: "Utilisateurs", icon: Settings, child: true },
];

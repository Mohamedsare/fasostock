import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
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
  href: string;
  label: string;
  icon: LucideIcon;
  /** Masqué du menu latéral si false (ex. Intégrations accessibles depuis Paramètres). */
  showInSidebar?: boolean;
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

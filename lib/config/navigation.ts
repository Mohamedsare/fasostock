import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  CirclePlus,
  FileSignature,
  Compass,
  Package,
  Camera,
  BadgePlus,
  PackageOpen,
  Send,
  BellDot,
  Puzzle,
  PackagePlus,
  Layers,
  ShoppingCart,
  UtensilsCrossed,
  HandPlatter,
  Bike,
  IdCard,
  PiggyBank,
  KeySquare,
  Wrench,
  HandCoins,
  History,
  Inbox,
  Store,
  Globe,
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
  Coins,
  BriefcaseBusiness,
  UserCog,
  ScrollText,
  CreditCard,
  Wallet,
  Barcode,
  BadgePercent,
  MapPin,
  HelpCircle,
  BellRing,
  Crown,
  KeyRound,
  Settings,
  ChefHat,
  CookingPot,
  BellPlus,
  BookOpenCheck,
  CalendarCheck,
  ClipboardList,
  CupSoda,
  LayoutGrid,
  ListChecks,
  Trash2,
  Beef,
  SlidersHorizontal,
  Route,
  Banknote,
  ReceiptText,
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
  // Espace métier : libellé et icône remplacés par ceux de l'activité, et masqué
  // pour les activités qui n'en ont pas (cf. `filterNavItemsForPermissions`).
  { href: ROUTES.tradeWorkspace, label: "Mon métier", icon: Compass, iconBg: "#B45309" },
  { href: ROUTES.products, label: "Produits", icon: Package, iconBg: "#7C2D12" },
  // Ajout produit : la page que le propriétaire ouvre à son équipe pour SAISIR
  // l'article qui manque, sans jamais lui montrer un prix.
  { href: ROUTES.draftProducts, label: "Ajout produit", icon: BadgePlus, iconBg: "#0E7490" },
  // Photos produits : la page que le propriétaire ouvre à son équipe pour illustrer
  // le catalogue sans lui confier la fiche.
  { href: ROUTES.productPhotos, label: "Photos produits", icon: Camera, iconBg: "#7C3AED" },
  { href: ROUTES.parts, label: "Pièces", icon: Puzzle, iconBg: "#0F766E" },
  { href: ROUTES.restock, label: "Réassort", icon: PackagePlus, iconBg: "#7E22CE" },
  { href: ROUTES.packagings, label: "Conditionnements", icon: Layers, iconBg: "#4D7C0F" },
  { href: ROUTES.productLocations, label: "Emplacements", icon: MapPin, iconBg: "#0369A1" },
  { href: ROUTES.landedCost, label: "Prix de revient", icon: Coins, iconBg: "#155E75" },
  { href: ROUTES.barcodes, label: "Code Barre", icon: Barcode, iconBg: "#9A3412" },
  { href: ROUTES.sales, label: "Ventes", icon: ShoppingCart, iconBg: "#EA580C" },
  // Caisse à deux : la file d'attente des paniers à encaisser (activée par le propriétaire).
  { href: ROUTES.checkoutQueue, label: "Encaissement", icon: HandCoins, iconBg: "#15803D" },
  { href: ROUTES.promotions, label: "Promotions", icon: BadgePercent, iconBg: "#DB2777" },
  // Devis & Factures : le papier qui part chez le client avant la vente (activé par le propriétaire).
  { href: ROUTES.saleDocuments, label: "Devis & Factures", icon: FileSignature, iconBg: "#1D4ED8" },
  { href: ROUTES.engines, label: "Vente Engins", icon: Bike, iconBg: "#DC2626" },
  { href: ROUTES.engineRegistration, label: "Immatriculation Engins", icon: IdCard, iconBg: "#B91C1C" },
  { href: ROUTES.progressive, label: "Achats Progressifs", icon: PiggyBank, iconBg: "#0D9488" },
  { href: ROUTES.rental, label: "Location", icon: KeySquare, iconBg: "#4338CA" },
  // Réservé à l'activité garage (cf. `filterNavItemsForPermissions`).
  { href: ROUTES.repairs, label: "Réparations", icon: Wrench, iconBg: "#9F1239" },
  { href: ROUTES.onlineStore, label: "Boutique en ligne", icon: Globe, iconBg: "#059669" },
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
  // Approvisionnement express : l'arrivage saisi debout, activé par le propriétaire.
  { href: ROUTES.quickSupply, label: "Approvisionnement", icon: Inbox, iconBg: "#0E7490" },
  // Enlèvements partenaires : le sens inverse de l'Approvisionnement — placé juste
  // après lui, parce que c'est ainsi que le commerçant les pense (« ce que je prends »
  // / « ce qu'on vient prendre chez moi »).
  { href: ROUTES.partnerOfftakes, label: "Enlèvements", icon: PackageOpen, iconBg: "#7C2D12" },
  // Expéditions : le colis qui part en province et les frais avancés à récupérer.
  { href: ROUTES.shipments, label: "Expéditions", icon: Send, iconBg: "#1D4ED8" },
  { href: ROUTES.expenses, label: "Dépenses", icon: Wallet, iconBg: "#B45309" },
  { href: ROUTES.warehouse, label: "Magasin", icon: Boxes, iconBg: "#7C2D12" },
  { href: ROUTES.transfers, label: "Transferts", icon: ArrowLeftRight, iconBg: "#EA580C" },
  { href: ROUTES.customers, label: "Clients", icon: Users, iconBg: "#9A3412" },
  { href: ROUTES.credit, label: "Crédit", icon: CreditCard, iconBg: "#D97706" },
  // Rappels de crédit : juste sous la page Crédit — c'est la même créance, vue par
  // « qui faut-il relancer aujourd'hui ? » plutôt que par « qui doit quoi ».
  { href: ROUTES.creditReminders, label: "Rappels crédit", icon: BellDot, iconBg: "#C2410C" },
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
  { href: ROUTES.notifications, label: "Notifications", icon: BellRing, iconBg: "#B45309" },
  { href: ROUTES.settings, label: "Paramètres", icon: Settings, iconBg: "#92400E" },
  { href: ROUTES.help, label: "Aide", icon: HelpCircle, iconBg: "#D97706" },
  { href: ROUTES.subscription, label: "Abonnement", icon: Crown, iconBg: "#CA8A04" },
];

/**
 * Navigation restaurant.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * C'EST UNE RÉORGANISATION DE `NAV_ITEMS`, PAS UN SOUS-ENSEMBLE
 * ─────────────────────────────────────────────────────────────────────────────
 * Un restaurant reste un commerce : il compte son stock, tient un magasin, suit
 * ses péremptions, fait des promotions, encaisse à deux, vend en ligne. **Toutes**
 * les entrées du menu standard sont donc présentes ici, simplement rangées en
 * sections plutôt qu'en liste.
 *
 * Retirer une entrée de cette liste ne « simplifie » rien : cela CASSE le module
 * pour les restaurants. Chaque entrée est déjà filtrée par
 * `filterNavItemsForPermissions` selon le drapeau d'entreprise ET le droit de
 * l'utilisateur — une page non activée ne s'affiche jamais, sans qu'on ait à
 * l'omettre ici. Une omission, elle, est définitive et silencieuse.
 *
 * Les entrées propres à un autre métier (Vente Engins, Location, Réparations,
 * Pièces) restent listées pour la même raison : si le super admin les ouvre à un
 * établissement — un maquis qui loue aussi des chambres — l'entrée doit apparaître.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEUX SORTES DE CIBLES
 * ─────────────────────────────────────────────────────────────────────────────
 * • Les écrans PROPRES au restaurant (`/restaurant/...`) : salle, cuisine, carte,
 *   livraison, caisse. Ils n'existent nulle part ailleurs.
 * • Les écrans COMMUNS, pointés DIRECTEMENT par leur route d'origine. Pas de
 *   page-relais : la barre d'adresse dit la vérité sur où l'on est.
 */
export const RESTAURANT_NAV_ITEMS: NavItem[] = [
  { href: ROUTES.dashboard, label: "Tableau de bord", icon: LayoutDashboard, iconBg: "#C2410C" },
  { href: ROUTES.tradeWorkspace, label: "Mon métier", icon: Compass, iconBg: "#B45309" },

  { kind: "section", href: "/restaurant/_sec_ventes", label: "Commandes", icon: ShoppingCart },
  { href: "/restaurant/ventes/nouvelle-commande", label: "Nouvelle commande", icon: CirclePlus, iconBg: "#EA580C", child: true },
  { href: "/restaurant/ventes/salle", label: "Commandes en salle", icon: UtensilsCrossed, iconBg: "#C2410C", child: true },
  { href: "/restaurant/ventes/emporter", label: "À emporter", icon: HandPlatter, iconBg: "#B45309", child: true },
  { href: "/restaurant/ventes/livraisons", label: "Livraisons", icon: Bike, iconBg: "#9A3412", child: true },
  { href: "/restaurant/ventes/historique", label: "Historique des commandes", icon: History, iconBg: "#7C2D12", child: true },
  { href: ROUTES.sales, label: "Ventes encaissées", icon: Coins, iconBg: "#92400E", child: true },
  { href: ROUTES.checkoutQueue, label: "Encaissement à deux", icon: HandCoins, iconBg: "#EA580C", child: true },
  { href: ROUTES.saleDocuments, label: "Devis & Factures", icon: FileSignature, iconBg: "#C2410C", child: true },
  { href: ROUTES.progressive, label: "Achats Progressifs", icon: PiggyBank, iconBg: "#B45309", child: true },

  { kind: "section", href: "/restaurant/_sec_salle", label: "Salle & Tables", icon: LayoutGrid },
  { href: "/restaurant/salle/plan", label: "Plan de salle", icon: LayoutGrid, iconBg: "#EA580C", child: true },
  { href: "/restaurant/salle/tables", label: "Tables", icon: Store, iconBg: "#C2410C", child: true },
  { href: "/restaurant/salle/reservations", label: "Réservations", icon: CalendarCheck, iconBg: "#B45309", child: true },

  { kind: "section", href: "/restaurant/_sec_cuisine", label: "Cuisine", icon: ChefHat },
  { href: "/restaurant/cuisine/kds", label: "Écran cuisine", icon: ChefHat, iconBg: "#EA580C", child: true },
  { href: "/restaurant/cuisine/stations", label: "Postes de production", icon: CookingPot, iconBg: "#7C2D12", child: true },
  { href: "/restaurant/cuisine/preparation", label: "En préparation", icon: CookingPot, iconBg: "#C2410C", child: true },
  { href: "/restaurant/cuisine/pretes", label: "Prêtes au passe", icon: BellPlus, iconBg: "#B45309", child: true },
  { href: "/restaurant/cuisine/recettes", label: "Fiches techniques", icon: BookOpenCheck, iconBg: "#9A3412", child: true },

  { kind: "section", href: "/restaurant/_sec_menu", label: "Menu & Catalogue", icon: ClipboardList },
  { href: "/restaurant/menu/disponibilite", label: "Disponibilité", icon: ListChecks, iconBg: "#EA580C", child: true },
  { href: "/restaurant/menu/plats", label: "Plats", icon: Beef, iconBg: "#C2410C", child: true },
  { href: "/restaurant/menu/boissons", label: "Boissons", icon: CupSoda, iconBg: "#B45309", child: true },
  { href: "/restaurant/menu/variantes", label: "Variantes", icon: SlidersHorizontal, iconBg: "#9A3412", child: true },
  { href: "/restaurant/menu/supplements", label: "Suppléments", icon: PackagePlus, iconBg: "#7C2D12", child: true },
  // Un plat EST un produit : le catalogue et ses pages satellites restent communs.
  { href: ROUTES.products, label: "Catalogue", icon: Package, iconBg: "#92400E", child: true },
  { href: ROUTES.draftProducts, label: "Ajout produit", icon: BadgePlus, iconBg: "#EA580C", child: true },
  { href: ROUTES.productPhotos, label: "Photos produits", icon: Camera, iconBg: "#C2410C", child: true },
  { href: ROUTES.packagings, label: "Conditionnements", icon: Layers, iconBg: "#B45309", child: true },
  { href: ROUTES.promotions, label: "Promotions", icon: BadgePercent, iconBg: "#9A3412", child: true },
  { href: ROUTES.barcodes, label: "Code Barre", icon: Barcode, iconBg: "#7C2D12", child: true },
  { href: ROUTES.parts, label: "Pièces", icon: Puzzle, iconBg: "#92400E", child: true },

  { kind: "section", href: "/restaurant/_sec_caisse", label: "Caisse", icon: CreditCard },
  { href: "/restaurant/caisse", label: "Poste de caisse", icon: Banknote, iconBg: "#EA580C", child: true },
  { href: "/restaurant/caisse/sessions", label: "Sessions de caisse", icon: ReceiptText, iconBg: "#C2410C", child: true },
  { href: "/restaurant/caisse/cloture", label: "Clôture", icon: ClipboardCheck, iconBg: "#B45309", child: true },

  { kind: "section", href: "/restaurant/_sec_livraison", label: "Livraison & Expédition", icon: Truck },
  { href: "/restaurant/livraison/suivi", label: "Suivi des courses", icon: Route, iconBg: "#EA580C", child: true },
  { href: "/restaurant/livraison/livreurs", label: "Livreurs", icon: Bike, iconBg: "#C2410C", child: true },
  { href: "/restaurant/livraison/zones", label: "Zones de livraison", icon: MapPin, iconBg: "#B45309", child: true },
  { href: ROUTES.shipments, label: "Expéditions", icon: Send, iconBg: "#1D4ED8", child: true },
  { href: ROUTES.onlineStore, label: "Boutique en ligne", icon: Globe, iconBg: "#9A3412", child: true },

  { kind: "section", href: "/restaurant/_sec_stock", label: "Stock", icon: Warehouse },
  { href: ROUTES.inventory, label: "Stock & mouvements", icon: Warehouse, iconBg: "#EA580C", child: true },
  { href: ROUTES.warehouse, label: "Magasin", icon: Boxes, iconBg: "#7C2D12", child: true },
  { href: ROUTES.inventorySessions, label: "Inventaires", icon: ClipboardCheck, iconBg: "#C2410C", child: true },
  { href: ROUTES.stockCashier, label: "Stock", icon: PackageOpen, iconBg: "#B45309", child: true },
  { href: ROUTES.expiry, label: "Péremptions", icon: CalendarClock, iconBg: "#B91C1C", child: true },
  { href: "/restaurant/stock/pertes", label: "Pertes / Gaspillage", icon: Trash2, iconBg: "#B91C1C", child: true },
  { href: ROUTES.restock, label: "Réassort", icon: PackagePlus, iconBg: "#9A3412", child: true },
  { href: ROUTES.transfers, label: "Transferts", icon: ArrowLeftRight, iconBg: "#EA580C", child: true },
  { href: ROUTES.productLocations, label: "Emplacements", icon: MapPin, iconBg: "#92400E", child: true },
  { href: ROUTES.partnerOfftakes, label: "Enlèvements", icon: PackageOpen, iconBg: "#C2410C", child: true },

  { kind: "section", href: "/restaurant/_sec_achats", label: "Achats", icon: Truck },
  { href: ROUTES.quickSupply, label: "Arrivage express", icon: PackageOpen, iconBg: "#EA580C", child: true },
  { href: ROUTES.purchases, label: "Liste des achats", icon: Truck, iconBg: "#C2410C", child: true },
  { href: ROUTES.suppliers, label: "Fournisseurs", icon: Building2, iconBg: "#B45309", child: true },
  { href: ROUTES.landedCost, label: "Prix de revient", icon: Calculator, iconBg: "#9A3412", child: true },

  { kind: "section", href: "/restaurant/_sec_clients", label: "Clients", icon: Users },
  { href: ROUTES.customers, label: "Base clients", icon: Users, iconBg: "#EA580C", child: true },
  { href: ROUTES.credit, label: "Ardoises", icon: CreditCard, iconBg: "#C2410C", child: true },
  { href: ROUTES.creditReminders, label: "Rappels crédit", icon: BellDot, iconBg: "#B45309", child: true },

  { kind: "section", href: "/restaurant/_sec_autres", label: "Autres activités", icon: KeySquare },
  { href: ROUTES.engines, label: "Vente Engins", icon: Bike, iconBg: "#EA580C", child: true },
  { href: ROUTES.engineRegistration, label: "Immatriculation Engins", icon: IdCard, iconBg: "#C2410C", child: true },
  { href: ROUTES.rental, label: "Location", icon: KeySquare, iconBg: "#B45309", child: true },
  { href: ROUTES.repairs, label: "Réparations", icon: Wrench, iconBg: "#9A3412", child: true },

  { kind: "section", href: "/restaurant/_sec_gestion", label: "Gestion", icon: BarChart3 },
  { href: ROUTES.expenses, label: "Dépenses", icon: Wallet, iconBg: "#EA580C", child: true },
  { href: ROUTES.reports, label: "Rapports", icon: BarChart3, iconBg: "#C2410C", child: true },
  { href: ROUTES.ai, label: "Prédictions IA", icon: Sparkles, iconBg: "#78350F", child: true },
  { href: ROUTES.accounting, label: "Comptabilité", icon: Calculator, iconBg: "#166534", child: true },
  { href: ROUTES.hr, label: "R. Humaine", icon: BriefcaseBusiness, iconBg: "#1E3A8A", child: true },
  { href: ROUTES.users, label: "Employés", icon: UserCog, iconBg: "#92400E", child: true },
  { href: ROUTES.audit, label: "Journal d'audit", icon: ScrollText, iconBg: "#7C2D12", child: true },

  { kind: "section", href: "/restaurant/_sec_parametres", label: "Paramètres", icon: Settings },
  { href: ROUTES.settings, label: "Paramètres", icon: Settings, iconBg: "#92400E", child: true },
  { href: ROUTES.stores, label: "Boutiques", icon: Store, iconBg: "#C2410C", child: true },
  {
    href: ROUTES.integrations,
    label: "Intégrations API",
    icon: KeyRound,
    iconBg: "#9A3412",
    showInSidebar: false,
    child: true,
  },
  { href: ROUTES.notifications, label: "Notifications", icon: BellRing, iconBg: "#B45309", child: true },
  { href: ROUTES.help, label: "Aide", icon: HelpCircle, iconBg: "#D97706", child: true },
  { href: ROUTES.subscription, label: "Abonnement", icon: Crown, iconBg: "#CA8A04", child: true },
];

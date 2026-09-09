/**
 * Module Restaurant — le vocabulaire partagé par tous les écrans.
 *
 * Le principe qui gouverne tout le module est posé dans l'en-tête de
 * `supabase/migrations/00219_restaurant_service.sql` :
 *
 *   LA COMMANDE EST LE SERVICE. LA VENTE RESTE L'ARGENT.
 *
 * Une `RestaurantOrder` ne touche ni au stock, ni au chiffre d'affaires. Elle
 * devient une vente ordinaire (caisse rapide) au moment de l'addition, et garde
 * alors le `saleId` de cette vente.
 */

/* ─────────────────────────── Salle ─────────────────────────── */

export type RestaurantArea = {
  id: string;
  storeId: string;
  name: string;
  position: number;
  color: string | null;
  isActive: boolean;
};

export type TableShape = "round" | "square" | "rect";

export const TABLE_SHAPE_LABELS: Record<TableShape, string> = {
  round: "Ronde",
  square: "Carrée",
  rect: "Rectangulaire",
};

export type RestaurantTable = {
  id: string;
  storeId: string;
  areaId: string | null;
  areaName: string | null;
  label: string;
  seats: number;
  /** Position sur le plan, en % de la surface. `null` = pas encore posée. */
  x: number | null;
  y: number | null;
  shape: TableShape;
  isActive: boolean;
};

/**
 * L'état d'une table ne se stocke pas, il se déduit (voir la migration). Ce type
 * est le résultat de ce calcul, fait une fois côté données pour que le plan, la
 * liste et la caisse ne puissent pas raconter trois histoires différentes.
 */
export type TableOccupancy = {
  table: RestaurantTable;
  /** La commande en cours sur cette table, s'il y en a une. */
  order: RestaurantOrderSummary | null;
  /** Réservation qui retient la table dans les deux prochaines heures. */
  reservation: RestaurantReservation | null;
};

/* ─────────────────────────── Commandes ─────────────────────────── */

export type ServiceType = "dine_in" | "takeaway" | "delivery";

export const SERVICE_TYPE_LABELS: Record<ServiceType, string> = {
  dine_in: "Sur place",
  takeaway: "À emporter",
  delivery: "Livraison",
};

export type OrderStatus = "open" | "paid" | "cancelled";

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  open: "En cours",
  paid: "Encaissée",
  cancelled: "Annulée",
};

/**
 * L'état d'une ligne dans son parcours réel. `void` est une annulation APRÈS envoi
 * en cuisine : la ligne reste visible avec son motif — une ligne qui disparaît est
 * la façon la plus simple de voler une maison.
 */
export type ItemStatus = "pending" | "sent" | "preparing" | "ready" | "served" | "void";

export const ITEM_STATUS_LABELS: Record<ItemStatus, string> = {
  pending: "À envoyer",
  sent: "Envoyé",
  preparing: "En préparation",
  ready: "Prêt",
  served: "Servi",
  void: "Annulé",
};

export type RestaurantOrderItem = {
  id: string;
  orderId: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  /** Résumé figé des options choisies (« Grande · + fromage »). */
  optionsLabel: string | null;
  optionsAmount: number;
  note: string | null;
  status: ItemStatus;
  sentAt: string | null;
  readyAt: string | null;
  servedAt: string | null;
  voidReason: string | null;
  createdAt: string;
  createdBy: string;
  createdByName: string | null;
};

/** Ce que coûte une ligne : le prix unitaire ET ses options, fois la quantité. */
export function orderItemTotal(item: {
  quantity: number;
  unitPrice: number;
  optionsAmount: number;
}): number {
  return (item.unitPrice + item.optionsAmount) * item.quantity;
}

export type DeliveryState = "pending" | "assigned" | "on_route" | "delivered" | "failed";

export const DELIVERY_STATE_LABELS: Record<DeliveryState, string> = {
  pending: "À préparer",
  assigned: "Livreur désigné",
  on_route: "En route",
  delivered: "Livrée",
  failed: "Échouée",
};

/** L'entête d'une commande, sans ses lignes — ce qu'affichent les listes et le plan. */
export type RestaurantOrderSummary = {
  id: string;
  orderNumber: string;
  storeId: string;
  serviceType: ServiceType;
  status: OrderStatus;

  tableId: string | null;
  tableLabel: string | null;
  covers: number;

  customerId: string | null;
  customerName: string | null;
  contactName: string | null;
  contactPhone: string | null;
  deliveryAddress: string | null;

  note: string | null;
  serverId: string | null;
  serverName: string | null;
  saleId: string | null;

  openedAt: string;
  closedAt: string | null;
  cancelReason: string | null;

  /* Livraison — `null` hors service `delivery`. */
  zoneId: string | null;
  zoneName: string | null;
  courierId: string | null;
  courierName: string | null;
  deliveryFee: number;
  deliveryState: DeliveryState | null;
  dispatchedAt: string | null;
  deliveredAt: string | null;
  deliveryFailureReason: string | null;

  /* Agrégats calculés depuis les lignes — jamais stockés. */
  itemCount: number;
  total: number;
  /** Combien de lignes attendent encore en cuisine (ni servies, ni annulées). */
  pendingKitchenCount: number;
  /** Au moins une ligne prête au passe : c'est ce qui fait clignoter la table. */
  hasReadyItems: boolean;
};

export type RestaurantOrder = RestaurantOrderSummary & {
  items: RestaurantOrderItem[];
};

/* ─────────────────────────── Réservations ─────────────────────────── */

export type ReservationStatus =
  | "booked"
  | "seated"
  | "honoured"
  | "no_show"
  | "cancelled";

export const RESERVATION_STATUS_LABELS: Record<ReservationStatus, string> = {
  booked: "Réservée",
  seated: "Installée",
  honoured: "Honorée",
  no_show: "Non venue",
  cancelled: "Annulée",
};

export type RestaurantReservation = {
  id: string;
  storeId: string;
  tableId: string | null;
  tableLabel: string | null;
  guestName: string;
  guestPhone: string | null;
  customerId: string | null;
  partySize: number;
  reservedAt: string;
  durationMinutes: number;
  status: ReservationStatus;
  note: string | null;
  orderId: string | null;
};

/* ─────────────────────────── Carte ─────────────────────────── */

export type MenuCourse = "starter" | "main" | "side" | "dessert" | "drink" | "other";

export const MENU_COURSE_LABELS: Record<MenuCourse, string> = {
  starter: "Entrée",
  main: "Plat",
  side: "Accompagnement",
  dessert: "Dessert",
  drink: "Boisson",
  other: "Autre",
};

/** Ordre de service — c'est dans cet ordre que le bon cuisine et l'addition se lisent. */
export const MENU_COURSE_ORDER: MenuCourse[] = [
  "starter",
  "main",
  "side",
  "dessert",
  "drink",
  "other",
];

export type RestaurantStation = {
  id: string;
  storeId: string | null;
  name: string;
  color: string | null;
  position: number;
  /** `false` = pas d'écran cuisine : le serveur sert directement (bar, frigo). */
  kdsEnabled: boolean;
  isActive: boolean;
};

/**
 * Un article de la carte : le produit du catalogue, plus ce que `products` ne sait
 * pas dire d'un plat. Les articles sans fiche carte restent vendables — ils
 * prennent simplement les valeurs par défaut.
 */
export type MenuItem = {
  productId: string;
  name: string;
  categoryId: string | null;
  categoryName: string | null;
  salePrice: number;
  purchasePrice: number;
  /** Stock de la boutique courante, `null` si l'article n'est pas compté. */
  stock: number | null;

  stationId: string | null;
  stationName: string | null;
  stationKdsEnabled: boolean;
  course: MenuCourse;
  prepMinutes: number | null;
  isAvailable: boolean;
  unavailableReason: string | null;
  unavailableSince: string | null;
  position: number;
  isFeatured: boolean;
  /** `true` si une fiche carte existe déjà en base (sinon tout est par défaut). */
  hasMenuRow: boolean;
  /** Nombre de groupes d'options rattachés — badge « 2 choix » en caisse. */
  optionGroupCount: number;
};

export type ModifierGroup = {
  id: string;
  name: string;
  prompt: string | null;
  minSelect: number;
  maxSelect: number;
  position: number;
  isActive: boolean;
  modifiers: Modifier[];
};

export type Modifier = {
  id: string;
  groupId: string;
  name: string;
  priceDelta: number;
  linkedProductId: string | null;
  position: number;
  isAvailable: boolean;
};

/**
 * `min = max = 1` se lit « variante » (il faut choisir, une seule), tout le reste se
 * lit « supplément ». Les deux écrans du menu partent de cette seule fonction pour
 * que la même donnée ne soit jamais classée différemment d'une page à l'autre.
 */
export function isVariantGroup(g: { minSelect: number; maxSelect: number }): boolean {
  return g.minSelect === 1 && g.maxSelect === 1;
}

export type ChosenOption = {
  modifierId: string | null;
  label: string;
  priceDelta: number;
};

/* ─────────────────────────── Fiche technique ─────────────────────────── */

export type RecipeItem = {
  id: string;
  ingredientId: string;
  ingredientName: string;
  quantity: number;
  unit: string;
  /** Combien d'unités de recette dans une unité d'achat (sac de 25 kg → 25000 g). */
  unitsPerPurchase: number;
  /** Prix d'achat de l'ingrédient, lu en direct — la fiche suit les prix réels. */
  purchasePrice: number;
  note: string | null;
  position: number;
};

export type Recipe = {
  productId: string;
  productName: string;
  salePrice: number;
  yieldPortions: number;
  wastePercent: number;
  instructions: string | null;
  items: RecipeItem[];
};

/** Coût d'un ingrédient pour la recette entière. */
export function recipeItemCost(item: RecipeItem): number {
  if (item.unitsPerPurchase <= 0) return 0;
  return (item.quantity / item.unitsPerPurchase) * item.purchasePrice;
}

/**
 * Ce que coûte UNE portion, pertes de préparation comprises.
 *
 * C'est le chiffre que presque aucun restaurant ne connaît, et celui qui décide si
 * la maison gagne de l'argent. Il se recalcule tout seul quand le prix d'achat d'un
 * ingrédient bouge — sans ressaisie, donc sans devenir faux.
 */
export function recipeCostPerPortion(recipe: Recipe): number {
  const raw = recipe.items.reduce((sum, it) => sum + recipeItemCost(it), 0);
  const withWaste = raw * (1 + recipe.wastePercent / 100);
  const portions = recipe.yieldPortions > 0 ? recipe.yieldPortions : 1;
  return withWaste / portions;
}

/** Marge en % du prix de vente. `null` si le plat n'a pas de prix. */
export function recipeMarginPercent(recipe: Recipe): number | null {
  if (recipe.salePrice <= 0) return null;
  const cost = recipeCostPerPortion(recipe);
  return ((recipe.salePrice - cost) / recipe.salePrice) * 100;
}

/* ─────────────────────────── Pertes ─────────────────────────── */

export type WasteReason =
  | "spoiled"
  | "broken"
  | "returned"
  | "overcooked"
  | "theft"
  | "other";

export const WASTE_REASON_LABELS: Record<WasteReason, string> = {
  spoiled: "Périmé / avarié",
  broken: "Cassé / renversé",
  returned: "Renvoyé par le client",
  overcooked: "Raté en cuisine",
  theft: "Disparu",
  other: "Autre",
};

export type WasteEntry = {
  id: string;
  storeId: string;
  storeName: string | null;
  productId: string;
  productName: string;
  quantity: number;
  unitCost: number;
  reason: WasteReason;
  note: string | null;
  orderId: string | null;
  stockDeducted: boolean;
  createdAt: string;
  createdByName: string | null;
};

/* ─────────────────────────── Livraison ─────────────────────────── */

export type DeliveryZone = {
  id: string;
  storeId: string | null;
  name: string;
  fee: number;
  etaMinutes: number;
  minOrder: number;
  note: string | null;
  position: number;
  isActive: boolean;
};

export type CourierVehicle = "moto" | "velo" | "voiture" | "pied";

export const COURIER_VEHICLE_LABELS: Record<CourierVehicle, string> = {
  moto: "Moto",
  velo: "Vélo",
  voiture: "Voiture",
  pied: "À pied",
};

export type Courier = {
  id: string;
  storeId: string | null;
  name: string;
  phone: string | null;
  vehicle: CourierVehicle;
  plate: string | null;
  userId: string | null;
  isActive: boolean;
  note: string | null;
  /** Courses en cours (assignées ou en route) — sert à ne pas surcharger un livreur. */
  activeCount?: number;
};

/* ─────────────────────────── Caisse ─────────────────────────── */

export type CashSession = {
  id: string;
  storeId: string;
  storeName: string | null;
  openedBy: string;
  openedByName: string | null;
  openedAt: string;
  closedAt: string | null;
  openingAmount: number;
  closingAmount: number | null;
  status: "open" | "closed";
};

export type CashSessionState = {
  opening: number;
  cashSales: number;
  movements: number;
  expected: number;
};

export type CashCloseResult = CashSessionState & {
  counted: number;
  /** Compté − attendu. Négatif = il manque de l'argent dans le tiroir. */
  variance: number;
};

export type CashMovementType = "deposit" | "withdrawal" | "expense" | "adjustment";

export const CASH_MOVEMENT_LABELS: Record<CashMovementType, string> = {
  deposit: "Apport",
  withdrawal: "Retrait",
  expense: "Dépense",
  adjustment: "Correction",
};

export type CashMovement = {
  id: string;
  type: string;
  amount: number;
  notes: string | null;
  createdAt: string;
  createdByName: string | null;
};

/* ─────────────────────────── Pagination ─────────────────────────── */

/** Aligné sur le reste de l'app : 20 lignes, pagination serveur. */
export const RESTAURANT_PAGE_SIZE = 20;

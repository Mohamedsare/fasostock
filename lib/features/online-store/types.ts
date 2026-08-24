/** Module « Boutique en ligne » — vitrine publique + commandes web. */

export type OnlineOrderStatus =
  | "pending"
  | "confirmed"
  | "ready"
  | "completed"
  | "canceled";

export type OnlineDeliveryMode = "delivery" | "pickup";

export type OnlinePaymentMethod = "cash_on_delivery" | "mobile_money" | "on_site";

/** Réglages de la vitrine d'une boutique (table `store_online_settings`). */
export type OnlineStoreSettings = {
  storeId: string;
  companyId: string;
  /** Identifiant du lien public : /boutique/<slug>. */
  slug: string;
  isPublished: boolean;
  displayName: string | null;
  tagline: string | null;
  description: string | null;
  coverUrl: string | null;
  logoUrl: string | null;
  accentColor: string | null;
  whatsappPhone: string | null;
  callPhone: string | null;
  address: string | null;
  city: string | null;
  hoursNote: string | null;
  deliveryEnabled: boolean;
  deliveryFee: number;
  deliveryNote: string | null;
  pickupEnabled: boolean;
  payOnDeliveryEnabled: boolean;
  payMobileMoneyEnabled: boolean;
  mobileMoneyNumber: string | null;
  minOrderAmount: number;
  /** Afficher les produits en rupture (grisés) plutôt que les masquer. */
  showOutOfStock: boolean;
};

/** Brouillon du formulaire vitrine — mêmes champs, tous éditables. */
export type OnlineStoreSettingsDraft = Omit<
  OnlineStoreSettings,
  "storeId" | "companyId"
>;

export type OnlineOrderItem = {
  id: string;
  productId: string | null;
  productName: string;
  quantity: number;
  unitPrice: number;
  total: number;
};

export type OnlineOrder = {
  id: string;
  companyId: string;
  storeId: string;
  storeName: string | null;
  orderNumber: string;
  publicToken: string;
  status: OnlineOrderStatus;
  customerName: string;
  customerPhone: string;
  customerAddress: string | null;
  deliveryMode: OnlineDeliveryMode;
  paymentMethod: OnlinePaymentMethod;
  note: string | null;
  source: string;
  itemsCount: number;
  subtotal: number;
  deliveryFee: number;
  total: number;
  /** Renseigné dès que la commande a été encaissée (vente FasoStock créée). */
  saleId: string | null;
  createdAt: string;
  handledAt: string | null;
  cancelReason: string | null;
  items: OnlineOrderItem[];
};

/** Produit tel que le client le voit sur le catalogue public. */
export type PublicCatalogProduct = {
  productId: string;
  name: string;
  description: string | null;
  unit: string;
  categoryId: string | null;
  categoryName: string | null;
  brandName: string | null;
  /** Prix affiché (promotion déjà appliquée). */
  price: number;
  /** Prix avant promotion — égal à `price` si aucune remise. */
  basePrice: number;
  discountPercent: number;
  stock: number;
  imageUrl: string | null;
};

/** Vitrine publique (RPC `public_online_store`). */
export type PublicOnlineStore = {
  storeId: string;
  companyId: string;
  slug: string;
  displayName: string;
  tagline: string | null;
  description: string | null;
  coverUrl: string | null;
  logoUrl: string | null;
  accentColor: string;
  whatsappPhone: string | null;
  callPhone: string | null;
  address: string | null;
  city: string | null;
  hoursNote: string | null;
  deliveryEnabled: boolean;
  deliveryFee: number;
  deliveryNote: string | null;
  pickupEnabled: boolean;
  payOnDeliveryEnabled: boolean;
  payMobileMoneyEnabled: boolean;
  mobileMoneyNumber: string | null;
  minOrderAmount: number;
  showOutOfStock: boolean;
  productsCount: number;
};

/** Suivi client d'une commande (RPC `public_online_order_track`). */
export type PublicOrderTracking = {
  orderNumber: string;
  status: OnlineOrderStatus;
  createdAt: string;
  customerName: string;
  deliveryMode: OnlineDeliveryMode;
  paymentMethod: OnlinePaymentMethod;
  customerAddress: string | null;
  subtotal: number;
  deliveryFee: number;
  total: number;
  shopName: string;
  shopSlug: string | null;
  shopPhone: string | null;
  items: Array<{ name: string; quantity: number; unitPrice: number; total: number }>;
  /** Fuseau du commerce : le client final n'a aucun moyen de le deviner. */
  timeZone: string;
};

export const ONLINE_ORDER_STATUS_LABELS: Record<OnlineOrderStatus, string> = {
  pending: "À traiter",
  confirmed: "Confirmée",
  ready: "Prête",
  completed: "Encaissée",
  canceled: "Annulée",
};

export const ONLINE_DELIVERY_MODE_LABELS: Record<OnlineDeliveryMode, string> = {
  delivery: "Livraison",
  pickup: "Retrait en boutique",
};

export const ONLINE_PAYMENT_LABELS: Record<OnlinePaymentMethod, string> = {
  cash_on_delivery: "Paiement à la livraison",
  mobile_money: "Mobile Money",
  on_site: "Paiement sur place",
};

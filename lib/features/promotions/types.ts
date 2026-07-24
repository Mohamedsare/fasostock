/** Statut métier dérivé d'une promotion (calculé côté client à partir des dates + is_active). */
export type PromotionStatus = "active" | "scheduled" | "expired" | "inactive";

/** Promotion telle que renvoyée par `promotions_list`. */
export type Promotion = {
  id: string;
  name: string;
  discountPercent: number;
  /** ISO ou null (pas de début = démarre immédiatement). */
  startsAt: string | null;
  /** ISO ou null (pas de fin = sans échéance). */
  endsAt: string | null;
  isActive: boolean;
  note: string | null;
  createdAt: string;
  productIds: string[];
  storeIds: string[];
  productCount: number;
  storeCount: number;
};

/** Saisie création / modification (RPC `promotion_save`). `id` absent/null = création. */
export type PromotionInput = {
  id?: string | null;
  name: string;
  discountPercent: number;
  startsAt: string | null;
  endsAt: string | null;
  isActive: boolean;
  note: string | null;
  productIds: string[];
  storeIds: string[];
};

/** Promotion active applicable à un produit dans une boutique (POS). */
export type ActiveStorePromo = {
  productId: string;
  discountPercent: number;
  promotionId: string;
  name: string;
};

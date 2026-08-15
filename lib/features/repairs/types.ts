/**
 * Module « Ordres de réparation » (activité garage).
 * Tables `repair_orders` / `repair_order_lines` — migration 00190.
 */

/** Étapes du passage d'un véhicule à l'atelier. */
export type RepairStatus =
  | "reception"
  | "diagnostic"
  | "in_progress"
  | "ready"
  | "delivered"
  | "cancelled";

/** Ordre d'avancement (sert au tri et à la barre de progression). */
export const REPAIR_STATUS_FLOW: RepairStatus[] = [
  "reception",
  "diagnostic",
  "in_progress",
  "ready",
  "delivered",
];

export const REPAIR_STATUS_LABELS: Record<RepairStatus, string> = {
  reception: "Reçu",
  diagnostic: "Diagnostic",
  in_progress: "En réparation",
  ready: "Prêt à livrer",
  delivered: "Livré",
  cancelled: "Annulé",
};

/** Ce que l'étape veut dire concrètement pour le garage. */
export const REPAIR_STATUS_HINTS: Record<RepairStatus, string> = {
  reception: "Véhicule à l'atelier, panne notée. Reste à diagnostiquer.",
  diagnostic: "Diagnostic en cours : on cherche ce qu'il faut réparer.",
  in_progress: "Réparation lancée : pièces montées, main-d'œuvre en cours.",
  ready: "Travaux terminés — le client peut venir récupérer et régler.",
  delivered: "Véhicule rendu et facturé.",
  cancelled: "Abandonné (devis refusé, véhicule repris en l'état).",
};

export type RepairLineKind = "part" | "labor";

export type RepairOrderLine = {
  id: string;
  repairOrderId: string;
  kind: RepairLineKind;
  /** Obligatoire pour une pièce (stock) ; facultatif pour la main-d'œuvre. */
  productId: string | null;
  label: string;
  quantity: number;
  unitPrice: number;
  position: number;
};

/** Ligne en cours de saisie (pas encore enregistrée). */
export type RepairOrderLineDraft = {
  id?: string;
  kind: RepairLineKind;
  productId: string | null;
  label: string;
  quantity: number;
  unitPrice: number;
};

export type RepairOrder = {
  id: string;
  companyId: string;
  storeId: string;
  orderNumber: string;

  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;

  vehiclePlate: string | null;
  vehicleMake: string | null;
  vehicleModel: string | null;
  vehicleYear: string | null;
  vehicleMileage: number | null;

  reportedIssue: string | null;
  diagnosis: string | null;
  status: RepairStatus;
  assignedTo: string | null;

  receivedAt: string;
  promisedAt: string | null;
  deliveredAt: string | null;

  /** Vente générée à la facturation (`null` tant que non facturé). */
  saleId: string | null;
  notes: string | null;

  createdBy: string | null;
  createdAt: string;

  lines: RepairOrderLine[];
};

/** Montant total des lignes d'un ordre de réparation. */
export function repairOrderTotal(lines: readonly RepairOrderLine[] | readonly RepairOrderLineDraft[]): number {
  return lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);
}

/** Sous-total pièces / main-d'œuvre — ce que le client regarde en premier. */
export function repairOrderSplit(lines: readonly RepairOrderLine[]): {
  parts: number;
  labor: number;
} {
  let parts = 0;
  let labor = 0;
  for (const l of lines) {
    const amount = l.quantity * l.unitPrice;
    if (l.kind === "part") parts += amount;
    else labor += amount;
  }
  return { parts, labor };
}

/** Véhicule en une ligne : « Toyota Hilux · 11 AA 1234 ». */
export function vehicleLabel(order: {
  vehicleMake: string | null;
  vehicleModel: string | null;
  vehiclePlate: string | null;
}): string {
  const model = [order.vehicleMake, order.vehicleModel].filter(Boolean).join(" ").trim();
  const parts = [model, order.vehiclePlate?.trim()].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "Véhicule non précisé";
}

/** Nom du client tel qu'on l'affiche (fiche client ou client de passage). */
export function repairCustomerLabel(order: {
  customerName: string | null;
  customerPhone: string | null;
}): string {
  const name = order.customerName?.trim();
  if (name) return name;
  const phone = order.customerPhone?.trim();
  return phone || "Client de passage";
}

export type RepairOrderInput = {
  customerId: string | null;
  customerName: string;
  customerPhone: string;
  vehiclePlate: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: string;
  vehicleMileage: string;
  reportedIssue: string;
  diagnosis: string;
  status: RepairStatus;
  assignedTo: string | null;
  promisedAt: string | null;
  notes: string;
};

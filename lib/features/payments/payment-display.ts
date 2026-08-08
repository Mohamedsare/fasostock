/**
 * Affichage des moyens de paiement — « espèces ou mobile money, et quel opérateur ».
 *
 * L'opérateur mobile money n'a pas de colonne dédiée en base : il est écrit dans
 * `sale_payments.reference` sous forme de libellé (« Orange money », suivi le cas
 * échéant d'une note « — n° transaction »). C'est la convention déjà posée par les
 * dialogues d'encaissement crédit (`credit-record-payment-dialog`, dépôt, engins) ;
 * la relire ici rend lisibles aussi les paiements déjà enregistrés, sans migration.
 */

export type MobileMoneyProvider = "orange_money" | "moov_money" | "wave";

export const MOBILE_MONEY_PROVIDERS: ReadonlyArray<{
  id: MobileMoneyProvider;
  label: string;
  /** Libellé court pour les boutons de caisse (place contrainte). */
  short: string;
}> = [
  { id: "orange_money", label: "Orange Money", short: "Orange" },
  { id: "moov_money", label: "Moov Money", short: "Moov" },
  { id: "wave", label: "Wave", short: "Wave" },
];

export function mobileMoneyProviderLabel(provider: MobileMoneyProvider): string {
  return MOBILE_MONEY_PROVIDERS.find((p) => p.id === provider)?.label ?? "Mobile Money";
}

/**
 * Opérateur déduit de la référence du paiement. Tolérant à la casse, aux accents et
 * aux libellés historiques (« Orange money », « orange_money », « OM — 12345 »).
 */
export function mobileMoneyProviderFromReference(
  reference?: string | null,
): MobileMoneyProvider | null {
  const raw = (reference ?? "").toLowerCase();
  if (!raw) return null;
  if (raw.includes("orange")) return "orange_money";
  if (raw.includes("moov") || raw.includes("flooz")) return "moov_money";
  if (raw.includes("wave")) return "wave";
  return null;
}

/**
 * Référence à stocker pour un paiement mobile money : libellé de l'opérateur, puis
 * la note du caissier si elle existe. Format lu par [mobileMoneyProviderFromReference].
 */
export function buildMobileMoneyReference(
  provider: MobileMoneyProvider | null | undefined,
  note?: string | null,
): string | null {
  const trimmed = (note ?? "").trim();
  if (!provider) return trimmed || null;
  return [mobileMoneyProviderLabel(provider), trimmed].filter(Boolean).join(" — ");
}

export type PaymentDisplayKind =
  | MobileMoneyProvider
  | "cash"
  | "mobile_money"
  | "card"
  | "transfer"
  /** Ligne `method = 'other'` : solde laissé à crédit, aucun argent encaissé. */
  | "credit";

export type PaymentDisplay = {
  kind: PaymentDisplayKind;
  label: string;
  /** Classes de la puce (clair + sombre), même grammaire que `settlementPillClass`. */
  pillClass: string;
};

const PILL_CLASS: Record<PaymentDisplayKind, string> = {
  cash: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300",
  orange_money: "bg-orange-500/15 text-orange-800 dark:text-orange-300",
  moov_money: "bg-blue-500/15 text-blue-800 dark:text-blue-300",
  wave: "bg-cyan-500/15 text-cyan-800 dark:text-cyan-300",
  mobile_money: "bg-violet-500/15 text-violet-800 dark:text-violet-300",
  card: "bg-indigo-500/15 text-indigo-800 dark:text-indigo-300",
  transfer: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
  credit: "bg-red-500/15 text-red-700 dark:text-red-300",
};

const BASE_LABEL: Record<PaymentDisplayKind, string> = {
  cash: "Espèces",
  orange_money: "Orange Money",
  moov_money: "Moov Money",
  wave: "Wave",
  mobile_money: "Mobile Money",
  card: "Carte",
  transfer: "Virement",
  credit: "À crédit",
};

function kindOf(payment: { method: string; reference?: string | null }): PaymentDisplayKind {
  switch (payment.method) {
    case "cash":
      return "cash";
    case "mobile_money":
      // Sans opérateur identifiable (paiement ancien), on reste sur « Mobile Money ».
      return mobileMoneyProviderFromReference(payment.reference) ?? "mobile_money";
    case "card":
      return "card";
    case "transfer":
      return "transfer";
    default:
      return "credit";
  }
}

/** Puce d'un règlement : « Espèces », « Orange Money », « Wave »… */
export function paymentDisplay(payment: {
  method: string;
  reference?: string | null;
}): PaymentDisplay {
  const kind = kindOf(payment);
  return { kind, label: BASE_LABEL[kind], pillClass: PILL_CLASS[kind] };
}

/**
 * Moyens de paiement distincts d'une vente, dans l'ordre des règlements.
 * Les lignes « à crédit » sont exclues par défaut : la colonne Règlement porte déjà
 * cette information, la colonne Paiement ne montre que l'argent réellement encaissé.
 */
export function salePaymentDisplays(
  payments: Array<{ method: string; reference?: string | null }> | null | undefined,
  options?: { includeCredit?: boolean },
): PaymentDisplay[] {
  const out: PaymentDisplay[] = [];
  for (const p of payments ?? []) {
    const d = paymentDisplay(p);
    if (d.kind === "credit" && !options?.includeCredit) continue;
    if (out.some((x) => x.kind === d.kind)) continue;
    out.push(d);
  }
  return out;
}

/** Libellé texte (export tableur, documents) : « Espèces », « Espèces, Wave »… */
export function salePaymentsLabel(
  payments: Array<{ method: string; reference?: string | null }> | null | undefined,
  options?: { includeCredit?: boolean },
): string {
  const displays = salePaymentDisplays(payments, options);
  return displays.length > 0 ? displays.map((d) => d.label).join(", ") : "—";
}

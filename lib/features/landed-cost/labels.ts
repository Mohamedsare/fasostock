/**
 * Libellés et explications du module « Prix de revient ».
 *
 * Regroupés ici parce qu'ils sont le vrai mode d'emploi : un commerçant ne connaît pas
 * « répartition au prorata de la valeur », il connaît « la douane, on la met sur ce qui
 * coûte cher ». Chaque option porte donc sa phrase d'explication, affichée à côté du
 * choix — pas dans une aide que personne n'ouvre.
 */
import type {
  AllocationMethod,
  ChargeKind,
  CostingMethod,
  MarginMode,
  StockMode,
} from "./types";

export const ALLOCATION_OPTIONS: {
  key: AllocationMethod;
  label: string;
  hint: string;
}[] = [
  {
    key: "value",
    label: "À la valeur",
    hint: "Les articles chers portent plus de frais. Le bon choix pour la douane et les taxes.",
  },
  {
    key: "quantity",
    label: "À la quantité",
    hint: "Chaque article porte la même part. Idéal quand tout se ressemble (cartons, sacs).",
  },
  {
    key: "weight",
    label: "Au poids",
    hint: "Le lourd paie plus. Le bon choix pour le camion et le fret. Renseignez le poids des lignes.",
  },
  {
    key: "volume",
    label: "Au volume",
    hint: "L'encombrant paie plus. Pour un conteneur payé au mètre cube.",
  },
  {
    key: "manual",
    label: "À la main",
    hint: "Vous fixez vous-même la part de chaque ligne. À réserver aux cas particuliers.",
  },
];

export const CHARGE_KINDS: { key: ChargeKind; label: string; suggested: AllocationMethod }[] = [
  { key: "transport", label: "Transport", suggested: "weight" },
  { key: "douane", label: "Douane", suggested: "value" },
  { key: "manutention", label: "Manutention", suggested: "quantity" },
  { key: "assurance", label: "Assurance", suggested: "value" },
  { key: "taxe", label: "Taxe", suggested: "value" },
  { key: "magasinage", label: "Magasinage", suggested: "volume" },
  { key: "commission", label: "Commission", suggested: "value" },
  { key: "emballage", label: "Emballage", suggested: "quantity" },
  { key: "autre", label: "Autre frais", suggested: "value" },
];

export const MARGIN_OPTIONS: { key: MarginMode; label: string; hint: string; suffix: string }[] = [
  {
    key: "markup_percent",
    label: "Ajouter un %",
    hint: "Prix de vente = coût de revient + X %. La façon de compter la plus répandue.",
    suffix: "%",
  },
  {
    key: "margin_percent",
    label: "Garder un % sur la vente",
    hint: "X % du prix de vente reste dans votre poche. 25 % ici rapporte plus que 25 % ajoutés.",
    suffix: "%",
  },
  {
    key: "amount",
    label: "Ajouter un montant",
    hint: "Prix de vente = coût de revient + X F. Pratique quand la marge est fixe par article.",
    suffix: "F",
  },
  {
    key: "fixed_price",
    label: "Prix imposé",
    hint: "Vous fixez le prix de vente ; l'application vous dit ce qu'il vous reste.",
    suffix: "F",
  },
];

export const COSTING_OPTIONS: { key: CostingMethod; label: string; hint: string }[] = [
  {
    key: "weighted_average",
    label: "Moyenne avec l'ancien stock",
    hint:
      "Le nouveau prix d'achat mélange ce qui reste en stock et ce qui arrive, au prorata des " +
      "quantités. Votre marge reste juste tant que l'ancien stock n'est pas écoulé.",
  },
  {
    key: "last_cost",
    label: "Coût de cet arrivage",
    hint:
      "Le nouveau prix d'achat est celui de cet arrivage seulement. Plus simple, mais la marge " +
      "affichée sur l'ancien stock sera fausse jusqu'à écoulement.",
  },
];

export const STOCK_MODE_OPTIONS: { key: StockMode; label: string; hint: string }[] = [
  {
    key: "receive",
    label: "Entrer le stock",
    hint: "Cet arrivage n'a pas été saisi ailleurs : appliquer ajoutera les quantités au stock.",
  },
  {
    key: "prices_only",
    label: "Prix seulement",
    hint:
      "Le stock est déjà entré (module Achats, inventaire). Appliquer ne touchera QUE les prix — " +
      "aucun risque de compter la marchandise deux fois.",
  },
];

/** Arrondis proposés — les pièces qui circulent réellement au Burkina. */
export const ROUNDING_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: "Aucun" },
  { value: 5, label: "5 F" },
  { value: 25, label: "25 F" },
  { value: 50, label: "50 F" },
  { value: 100, label: "100 F" },
  { value: 500, label: "500 F" },
];

export function allocationLabel(m: AllocationMethod | null, fallback: AllocationMethod): string {
  const key = m ?? fallback;
  return ALLOCATION_OPTIONS.find((o) => o.key === key)?.label ?? key;
}

export function chargeKindLabel(k: ChargeKind): string {
  return CHARGE_KINDS.find((o) => o.key === k)?.label ?? "Autre frais";
}

export function marginLabel(m: MarginMode): string {
  return MARGIN_OPTIONS.find((o) => o.key === m)?.label ?? m;
}

export function marginSuffix(m: MarginMode): string {
  return MARGIN_OPTIONS.find((o) => o.key === m)?.suffix ?? "";
}

export function statusLabel(status: string): string {
  if (status === "applied") return "Appliqué";
  if (status === "cancelled") return "Annulé";
  return "Brouillon";
}

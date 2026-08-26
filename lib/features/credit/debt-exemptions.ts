"use client";

import { createClient } from "@/lib/supabase/client";
import { customerPhoneDigits } from "@/lib/features/customers/phone";
import { operationTodayYmd } from "@/lib/utils/operation-datetime";

const KEY = "customer_debt_exemptions";

/** Au-delà, la liste ne se lit plus : on garde les plus récentes. */
const MAX_ENTRIES = 400;

/**
 * Dérogation « ce client peut acheter même s'il doit encore de l'argent ».
 *
 * Le blocage pour dette (`sale_customer_policy.blockOnDebt`) est une règle de maison,
 * pas une loi : il y a toujours le gros client qui tourne en compte, le parent, la
 * mairie qui paie en fin de mois. Sans dérogation nominative, le propriétaire n'a que
 * deux mauvaises solutions — couper la règle pour tout le monde, ou faire attendre son
 * meilleur client. La dérogation est donc **écrite, datée et révocable**.
 */
export type DebtExemption = {
  /**
   * Identité de la personne, pas de la fiche : les chiffres du téléphone
   * (`70000000`), sinon `id:<uuid>` pour une fiche sans numéro. Même logique que le
   * calcul de dette, qui additionne toutes les fiches au même numéro — sinon
   * l'autorisation sauterait dès qu'on recrée une fiche.
   */
  key: string;
  /** Nom au moment de l'octroi : la fiche peut être renommée ou supprimée. */
  label: string;
  /** Numéro affiché tel que saisi (« 70 00 00 00 »). */
  phone: string;
  /** Dernier jour couvert (`YYYY-MM-DD`, inclus) ou `null` = sans limite. */
  until: string | null;
  /** Motif écrit par le propriétaire (« client en compte, règle le 30 »). */
  note: string;
  /** Date d'octroi (ISO). */
  at: string;
};

export type DebtExemptionCustomer = {
  id: string;
  name?: string | null;
  phone?: string | null;
};

/**
 * Toutes les identités sous lesquelles ce client peut être autorisé : son numéro
 * **et** sa fiche. On accorde par numéro quand il y en a un, mais une autorisation
 * accordée à une fiche sans numéro doit continuer de valoir.
 */
export function debtExemptionKeys(customer: DebtExemptionCustomer): string[] {
  const digits = customerPhoneDigits(customer.phone);
  const keys = [`id:${customer.id}`];
  if (digits.length > 0) keys.unshift(digits);
  return keys;
}

/** Clé retenue à l'octroi : le numéro s'il existe, la fiche sinon. */
export function debtExemptionKeyFor(customer: DebtExemptionCustomer): string {
  return debtExemptionKeys(customer)[0];
}

/** Une autorisation à durée limitée couvre son dernier jour en entier. */
export function isDebtExemptionActive(
  e: DebtExemption,
  todayYmd: string = operationTodayYmd(),
): boolean {
  return e.until == null || e.until >= todayYmd;
}

/** L'autorisation en cours de ce client, ou `null`. */
export function findActiveDebtExemption(
  list: readonly DebtExemption[],
  customer: DebtExemptionCustomer,
  todayYmd: string = operationTodayYmd(),
): DebtExemption | null {
  const keys = debtExemptionKeys(customer);
  return (
    list.find((e) => keys.includes(e.key) && isDebtExemptionActive(e, todayYmd)) ?? null
  );
}

/** Autorisation en cours pour un identifiant de client, à partir des fiches connues. */
export function findActiveDebtExemptionById(
  list: readonly DebtExemption[],
  customers: readonly DebtExemptionCustomer[],
  customerId: string,
  todayYmd: string = operationTodayYmd(),
): DebtExemption | null {
  const self = customers.find((c) => c.id === customerId);
  return findActiveDebtExemption(list, self ?? { id: customerId }, todayYmd);
}

function str(raw: unknown): string {
  return typeof raw === "string" ? raw : "";
}

function parseOne(raw: unknown): DebtExemption | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const key = str(o.key).trim();
  if (!key) return null;
  const until = str(o.until).trim();
  return {
    key,
    label: str(o.label).trim(),
    phone: str(o.phone).trim(),
    until: /^\d{4}-\d{2}-\d{2}$/.test(until) ? until : null,
    note: str(o.note).trim(),
    at: str(o.at) || new Date().toISOString(),
  };
}

function parseList(raw: unknown): DebtExemption[] {
  const items = Array.isArray(raw)
    ? raw
    : raw != null && typeof raw === "object"
      ? (raw as Record<string, unknown>).items
      : null;
  if (!Array.isArray(items)) return [];
  const out: DebtExemption[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const parsed = parseOne(item);
    if (!parsed || seen.has(parsed.key)) continue;
    seen.add(parsed.key);
    out.push(parsed);
  }
  return out;
}

/** Cache session (le badge « autorisé » ne doit pas clignoter à l'ouverture). */
const cache = new Map<string, DebtExemption[]>();

export function peekDebtExemptions(companyId: string): DebtExemption[] | undefined {
  return cache.get(companyId);
}

export async function fetchDebtExemptions(companyId: string): Promise<DebtExemption[]> {
  if (!companyId) return [];
  const supabase = createClient();
  const { data, error } = await supabase
    .from("company_settings")
    .select("value")
    .eq("company_id", companyId)
    .eq("key", KEY)
    .maybeSingle();
  if (error) throw error;
  const row = data as { value?: unknown } | null;
  const list = row == null ? [] : parseList(row.value);
  cache.set(companyId, list);
  return list;
}

async function saveDebtExemptions(
  companyId: string,
  list: DebtExemption[],
): Promise<DebtExemption[]> {
  const items = list.slice(0, MAX_ENTRIES);
  const supabase = createClient();
  const { data: existing, error: selErr } = await supabase
    .from("company_settings")
    .select("id")
    .eq("company_id", companyId)
    .eq("key", KEY)
    .maybeSingle();
  if (selErr) throw selErr;
  if (existing != null) {
    const { error } = await supabase
      .from("company_settings")
      .update({ value: { items } })
      .eq("company_id", companyId)
      .eq("key", KEY);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from("company_settings")
      .insert({ company_id: companyId, key: KEY, value: { items } });
    if (error) throw error;
  }
  cache.set(companyId, items);
  return items;
}

/**
 * Accorde (ou remplace) l'autorisation d'un client.
 *
 * On relit la liste avant d'écrire : deux propriétaires sur deux postes n'ont pas à
 * s'effacer mutuellement une autorisation dans le même JSON.
 */
export async function grantDebtExemption(params: {
  companyId: string;
  customer: DebtExemptionCustomer;
  /** `null` = sans limite de date. */
  until: string | null;
  note: string;
}): Promise<DebtExemption[]> {
  const { companyId, customer, until, note } = params;
  const current = await fetchDebtExemptions(companyId);
  const key = debtExemptionKeyFor(customer);
  const entry: DebtExemption = {
    key,
    label: (customer.name ?? "").trim(),
    phone: (customer.phone ?? "").trim(),
    until,
    note: note.trim(),
    at: new Date().toISOString(),
  };
  // La plus récente en tête : c'est celle qu'on vient d'accorder qu'on relit.
  const next = [entry, ...current.filter((e) => e.key !== key)];
  return saveDebtExemptions(companyId, next);
}

/** Retire l'autorisation — sur toutes les identités du client (numéro et fiche). */
export async function revokeDebtExemption(params: {
  companyId: string;
  customer: DebtExemptionCustomer;
}): Promise<DebtExemption[]> {
  const { companyId, customer } = params;
  const current = await fetchDebtExemptions(companyId);
  const keys = debtExemptionKeys(customer);
  return saveDebtExemptions(
    companyId,
    current.filter((e) => !keys.includes(e.key)),
  );
}

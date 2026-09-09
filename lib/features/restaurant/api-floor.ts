"use client";

/**
 * Module Restaurant — la salle : zones, tables, réservations.
 *
 * Ces trois-là sont **bornés par nature** : une maison a dix zones, cinquante tables,
 * et regarde ses réservations sur une journée. Aucune de ces lectures ne dépend du
 * volume d'activité du client, donc aucune n'a besoin de `fetchAllPages` — voir la
 * règle dans `lib/supabase/fetch-all-pages.ts`.
 */

import { createClient } from "@/lib/supabase/client";
import { mapSupabaseError } from "@/lib/supabase/map-error";
import type {
  RestaurantArea,
  RestaurantReservation,
  RestaurantTable,
  ReservationStatus,
  TableShape,
} from "./types";

function num(v: unknown, fallback = 0): number {
  const n = Number(v ?? fallback);
  return Number.isFinite(n) ? n : fallback;
}

function nullableNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/* ─────────────────────────── Zones ─────────────────────────── */

export async function listAreas(params: {
  companyId: string;
  storeId: string | null;
}): Promise<RestaurantArea[]> {
  const supabase = createClient();
  let q = supabase
    .from("restaurant_areas")
    .select("id, store_id, name, position, color, is_active")
    .eq("company_id", params.companyId)
    .order("position", { ascending: true })
    .order("name", { ascending: true });
  if (params.storeId) q = q.eq("store_id", params.storeId);

  const { data, error } = await q;
  if (error) throw mapSupabaseError(error);
  return (data ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    return {
      id: String(row.id),
      storeId: String(row.store_id),
      name: String(row.name ?? ""),
      position: num(row.position),
      color: (row.color as string | null) ?? null,
      isActive: row.is_active !== false,
    };
  });
}

export async function createArea(params: {
  companyId: string;
  storeId: string;
  name: string;
  color?: string | null;
  position?: number;
}): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("restaurant_areas").insert({
    company_id: params.companyId,
    store_id: params.storeId,
    name: params.name.trim(),
    color: params.color ?? null,
    position: params.position ?? 0,
  });
  if (error) throw mapSupabaseError(error);
}

export async function updateArea(params: {
  id: string;
  name?: string;
  color?: string | null;
  position?: number;
  isActive?: boolean;
}): Promise<void> {
  const supabase = createClient();
  const patch: Record<string, unknown> = {};
  if (params.name !== undefined) patch.name = params.name.trim();
  if (params.color !== undefined) patch.color = params.color;
  if (params.position !== undefined) patch.position = params.position;
  if (params.isActive !== undefined) patch.is_active = params.isActive;
  if (Object.keys(patch).length === 0) return;

  const { error } = await supabase
    .from("restaurant_areas")
    .update(patch)
    .eq("id", params.id);
  if (error) throw mapSupabaseError(error);
}

export async function deleteArea(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("restaurant_areas").delete().eq("id", id);
  if (error) throw mapSupabaseError(error);
}

/* ─────────────────────────── Tables ─────────────────────────── */

export async function listTables(params: {
  companyId: string;
  storeId: string | null;
  includeInactive?: boolean;
}): Promise<RestaurantTable[]> {
  const supabase = createClient();
  let q = supabase
    .from("restaurant_tables")
    .select(
      "id, store_id, area_id, label, seats, x, y, shape, is_active, restaurant_areas(name)",
    )
    .eq("company_id", params.companyId)
    .order("label", { ascending: true });
  if (params.storeId) q = q.eq("store_id", params.storeId);
  if (!params.includeInactive) q = q.eq("is_active", true);

  const { data, error } = await q;
  if (error) throw mapSupabaseError(error);

  return (data ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    const area = row.restaurant_areas as { name?: string } | null;
    return {
      id: String(row.id),
      storeId: String(row.store_id),
      areaId: row.area_id ? String(row.area_id) : null,
      areaName: area?.name ?? null,
      label: String(row.label ?? ""),
      seats: num(row.seats, 4),
      x: nullableNum(row.x),
      y: nullableNum(row.y),
      shape: (String(row.shape ?? "round") as TableShape) ?? "round",
      isActive: row.is_active !== false,
    };
  });
}

export async function createTable(params: {
  companyId: string;
  storeId: string;
  label: string;
  seats: number;
  areaId?: string | null;
  shape?: TableShape;
  x?: number | null;
  y?: number | null;
}): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("restaurant_tables").insert({
    company_id: params.companyId,
    store_id: params.storeId,
    area_id: params.areaId ?? null,
    label: params.label.trim(),
    seats: Math.max(1, Math.trunc(params.seats)),
    shape: params.shape ?? "round",
    x: params.x ?? null,
    y: params.y ?? null,
  });
  if (error) throw mapSupabaseError(error);
}

export async function updateTable(params: {
  id: string;
  label?: string;
  seats?: number;
  areaId?: string | null;
  shape?: TableShape;
  isActive?: boolean;
  x?: number | null;
  y?: number | null;
}): Promise<void> {
  const supabase = createClient();
  const patch: Record<string, unknown> = {};
  if (params.label !== undefined) patch.label = params.label.trim();
  if (params.seats !== undefined) patch.seats = Math.max(1, Math.trunc(params.seats));
  if (params.areaId !== undefined) patch.area_id = params.areaId;
  if (params.shape !== undefined) patch.shape = params.shape;
  if (params.isActive !== undefined) patch.is_active = params.isActive;
  if (params.x !== undefined) patch.x = params.x;
  if (params.y !== undefined) patch.y = params.y;
  if (Object.keys(patch).length === 0) return;

  const { error } = await supabase
    .from("restaurant_tables")
    .update(patch)
    .eq("id", params.id);
  if (error) throw mapSupabaseError(error);
}

/**
 * Enregistre les positions du plan de salle en UN aller-retour.
 *
 * Le patron déplace huit tables puis touche « Enregistrer ». Huit requêtes, c'est
 * huit occasions d'en perdre une sur une connexion de marché — et un plan qui ne
 * ressemble plus à ce qu'il vient de dessiner.
 */
export async function saveTablePositions(
  positions: Array<{ id: string; x: number; y: number }>,
): Promise<void> {
  if (positions.length === 0) return;
  const supabase = createClient();
  const results = await Promise.all(
    positions.map((p) =>
      supabase
        .from("restaurant_tables")
        .update({
          x: Math.min(100, Math.max(0, Number(p.x.toFixed(2)))),
          y: Math.min(100, Math.max(0, Number(p.y.toFixed(2)))),
        })
        .eq("id", p.id),
    ),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) throw mapSupabaseError(failed.error);
}

export async function deleteTable(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("restaurant_tables").delete().eq("id", id);
  if (error) throw mapSupabaseError(error);
}

/* ─────────────────────────── Réservations ─────────────────────────── */

export async function listReservations(params: {
  companyId: string;
  storeId: string | null;
  /** Bornes ISO — la page réservations regarde toujours une fenêtre, jamais tout. */
  fromIso: string;
  toIso: string;
}): Promise<RestaurantReservation[]> {
  const supabase = createClient();
  let q = supabase
    .from("restaurant_reservations")
    .select(
      "id, store_id, table_id, guest_name, guest_phone, customer_id, party_size, reserved_at, duration_minutes, status, note, order_id, restaurant_tables(label)",
    )
    .eq("company_id", params.companyId)
    .gte("reserved_at", params.fromIso)
    .lte("reserved_at", params.toIso)
    .order("reserved_at", { ascending: true })
    .order("id", { ascending: true });
  if (params.storeId) q = q.eq("store_id", params.storeId);

  const { data, error } = await q;
  if (error) throw mapSupabaseError(error);

  return (data ?? []).map(mapReservation);
}

/**
 * Les réservations qui retiennent une table MAINTENANT (fenêtre de deux heures).
 * C'est ce que le plan de salle affiche en pastille, pour qu'un serveur n'installe
 * pas quelqu'un sur une table promise à 20 h.
 */
export async function listUpcomingReservations(params: {
  companyId: string;
  storeId: string | null;
}): Promise<RestaurantReservation[]> {
  const now = Date.now();
  return listReservations({
    ...params,
    fromIso: new Date(now - 60 * 60 * 1000).toISOString(),
    toIso: new Date(now + 3 * 60 * 60 * 1000).toISOString(),
  });
}

function mapReservation(r: unknown): RestaurantReservation {
  const row = r as Record<string, unknown>;
  const table = row.restaurant_tables as { label?: string } | null;
  return {
    id: String(row.id),
    storeId: String(row.store_id),
    tableId: row.table_id ? String(row.table_id) : null,
    tableLabel: table?.label ?? null,
    guestName: String(row.guest_name ?? ""),
    guestPhone: (row.guest_phone as string | null) ?? null,
    customerId: row.customer_id ? String(row.customer_id) : null,
    partySize: num(row.party_size, 2),
    reservedAt: String(row.reserved_at),
    durationMinutes: num(row.duration_minutes, 90),
    status: String(row.status ?? "booked") as ReservationStatus,
    note: (row.note as string | null) ?? null,
    orderId: row.order_id ? String(row.order_id) : null,
  };
}

export async function createReservation(params: {
  companyId: string;
  storeId: string;
  guestName: string;
  guestPhone?: string | null;
  customerId?: string | null;
  tableId?: string | null;
  partySize: number;
  reservedAtIso: string;
  durationMinutes?: number;
  note?: string | null;
}): Promise<void> {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) throw new Error("Session introuvable.");

  const { error } = await supabase.from("restaurant_reservations").insert({
    company_id: params.companyId,
    store_id: params.storeId,
    table_id: params.tableId ?? null,
    guest_name: params.guestName.trim(),
    guest_phone: params.guestPhone?.trim() || null,
    customer_id: params.customerId ?? null,
    party_size: Math.max(1, Math.trunc(params.partySize)),
    reserved_at: params.reservedAtIso,
    duration_minutes: params.durationMinutes ?? 90,
    note: params.note?.trim() || null,
    created_by: userId,
  });
  if (error) throw mapSupabaseError(error);
}

export async function updateReservation(params: {
  id: string;
  status?: ReservationStatus;
  tableId?: string | null;
  reservedAtIso?: string;
  partySize?: number;
  guestName?: string;
  guestPhone?: string | null;
  durationMinutes?: number;
  note?: string | null;
  orderId?: string | null;
}): Promise<void> {
  const supabase = createClient();
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (params.status !== undefined) patch.status = params.status;
  if (params.tableId !== undefined) patch.table_id = params.tableId;
  if (params.reservedAtIso !== undefined) patch.reserved_at = params.reservedAtIso;
  if (params.partySize !== undefined) {
    patch.party_size = Math.max(1, Math.trunc(params.partySize));
  }
  if (params.guestName !== undefined) patch.guest_name = params.guestName.trim();
  if (params.guestPhone !== undefined) patch.guest_phone = params.guestPhone?.trim() || null;
  if (params.durationMinutes !== undefined) patch.duration_minutes = params.durationMinutes;
  if (params.note !== undefined) patch.note = params.note?.trim() || null;
  if (params.orderId !== undefined) patch.order_id = params.orderId;

  const { error } = await supabase
    .from("restaurant_reservations")
    .update(patch)
    .eq("id", params.id);
  if (error) throw mapSupabaseError(error);
}

export async function deleteReservation(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("restaurant_reservations").delete().eq("id", id);
  if (error) throw mapSupabaseError(error);
}

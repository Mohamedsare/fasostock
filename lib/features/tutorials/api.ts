"use client";

import { createClient } from "@/lib/supabase/client";
import type { Tutorial, TutorialInput } from "./types";

const FIELDS =
  "id, module_key, title, description, youtube_url, sort_order, is_active";

function normalize(row: Record<string, unknown>): Tutorial {
  return {
    id: String(row.id),
    moduleKey: String(row.module_key ?? ""),
    title: String(row.title ?? ""),
    description: row.description != null ? String(row.description) : null,
    youtubeUrl: String(row.youtube_url ?? ""),
    sortOrder: Number(row.sort_order ?? 0),
    isActive: row.is_active !== false,
  };
}

/** Tutoriels actifs (côté utilisateur — page Aide). */
export async function listActiveTutorials(): Promise<Tutorial[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("tutorials")
    .select(FIELDS)
    .eq("is_active", true)
    .order("module_key", { ascending: true })
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as Array<Record<string, unknown>>).map(normalize);
}

/** Tous les tutoriels (espace admin — inclut les inactifs). */
export async function listAllTutorials(): Promise<Tutorial[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("tutorials")
    .select(FIELDS)
    .order("module_key", { ascending: true })
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as Array<Record<string, unknown>>).map(normalize);
}

function toPayload(input: TutorialInput) {
  return {
    module_key: input.moduleKey,
    title: input.title.trim(),
    description: input.description.trim() || null,
    youtube_url: input.youtubeUrl.trim(),
    sort_order: Math.round(input.sortOrder) || 0,
    is_active: input.isActive,
  };
}

export async function createTutorial(input: TutorialInput): Promise<void> {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("tutorials")
    .insert({ ...toPayload(input), created_by: auth.user?.id ?? null });
  if (error) throw error;
}

export async function updateTutorial(id: string, input: TutorialInput): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("tutorials").update(toPayload(input)).eq("id", id);
  if (error) throw error;
}

export async function deleteTutorial(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("tutorials").delete().eq("id", id);
  if (error) throw error;
}

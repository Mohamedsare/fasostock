"use client";

import { businessRpcError } from "@/lib/errors/business-rpc-error";
import { createClient } from "@/lib/supabase/client";
import { mapSupabaseError } from "@/lib/supabase/map-error";

/**
 * Impression à distance (module « Caisse à deux »).
 *
 * Le caissier encaisse ; l'imprimante thermique est souvent branchée sur le poste du
 * vendeur, à l'autre bout du magasin, là où se trouve le client. Un navigateur ne peut ni
 * parler à un autre navigateur ni piloter une imprimante distante : le seul chemin est
 * une ligne dans la base que le poste destinataire vient chercher — exactement le relais
 * déjà utilisé pour les paniers.
 */

export type PosPrintJobStatus = "pending" | "printing" | "printed" | "failed";

export type PosPrintJob = {
  id: string;
  saleId: string;
  handoffId: string | null;
  paperWidthMm: 58 | 80;
  status: PosPrintJobStatus;
  error: string | null;
  createdAt: string;
};

/**
 * Fenêtre de validité d'un travail d'impression.
 *
 * Au-delà, on ne l'imprime plus : un poste rallumé le lendemain matin ne doit pas cracher
 * les tickets de la veille au nez du premier client. Le caissier, lui, aura vu l'échec et
 * imprimé chez lui.
 */
export const PRINT_JOB_MAX_AGE_MS = 10 * 60_000;

type Row = Record<string, unknown>;

function mapJob(row: Row): PosPrintJob {
  const width = Number(row.paper_width_mm ?? 80);
  return {
    id: String(row.id),
    saleId: String(row.sale_id ?? ""),
    handoffId: row.handoff_id == null ? null : String(row.handoff_id),
    paperWidthMm: width === 58 ? 58 : 80,
    status: (String(row.status ?? "pending") as PosPrintJobStatus) ?? "pending",
    error: row.error == null ? null : String(row.error),
    createdAt: String(row.created_at ?? ""),
  };
}

/** Le caissier envoie le ticket au poste du vendeur. Renvoie l'identifiant du travail. */
export async function createPosPrintJob(params: {
  saleId: string;
  targetUserId: string;
  handoffId: string | null;
  paperWidthMm: 58 | 80;
}): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("create_pos_print_job", {
    p_sale_id: params.saleId,
    p_target_user_id: params.targetUserId,
    p_handoff_id: params.handoffId,
    p_paper_width_mm: params.paperWidthMm,
  });
  if (error) throw businessRpcError(error, "Envoi à l'imprimante du vendeur impossible.");
  return String(data ?? "");
}

/** Les travaux qui m'attendent, assez récents pour être encore utiles. */
export async function listMyPendingPrintJobs(userId: string): Promise<PosPrintJob[]> {
  const supabase = createClient();
  const since = new Date(Date.now() - PRINT_JOB_MAX_AGE_MS).toISOString();
  const { data, error } = await supabase
    .from("pos_print_jobs")
    .select("id, sale_id, handoff_id, paper_width_mm, status, error, created_at")
    .eq("target_user_id", userId)
    .eq("status", "pending")
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(5);
  if (error) throw mapSupabaseError(error);
  return ((data ?? []) as unknown as Row[]).map(mapJob);
}

/**
 * Prend le travail. `false` = un autre onglet (ou l'appareil de poche du même vendeur)
 * l'a déjà pris : il ne faut surtout pas imprimer, le ticket sortirait deux fois.
 */
export async function claimPosPrintJob(jobId: string): Promise<boolean> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("claim_pos_print_job", { p_job_id: jobId });
  if (error) throw businessRpcError(error, "Prise du travail d'impression impossible.");
  return data === true;
}

/** Rend compte au caissier : imprimé, ou échoué avec la raison. */
export async function completePosPrintJob(
  jobId: string,
  ok: boolean,
  errorMessage?: string | null,
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("complete_pos_print_job", {
    p_job_id: jobId,
    p_ok: ok,
    p_error: errorMessage ?? null,
  });
  if (error) throw businessRpcError(error, "Compte rendu d'impression impossible.");
}

/**
 * Attend le compte rendu du poste destinataire, côté caissier.
 *
 * Le client est devant le comptoir : le caissier ne doit pas rester devant un bouton
 * muet. On sonde brièvement, puis on rend la main avec un verdict clair — imprimé, en
 * échec, ou sans réponse (poste éteint, hors ligne). Dans les deux derniers cas, il lui
 * reste « Imprimer ici », toujours disponible dans le même dialogue.
 */
export async function awaitPrintJob(
  jobId: string,
  timeoutMs = 20_000,
): Promise<"printed" | "failed" | "timeout"> {
  const deadline = Date.now() + timeoutMs;
  let lastError: string | null = null;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1500));
    let job: PosPrintJob | null = null;
    try {
      job = await fetchPrintJobStatus(jobId);
    } catch {
      continue; // coupure passagère : on retente jusqu'à l'échéance
    }
    if (!job) continue;
    if (job.status === "printed") return "printed";
    if (job.status === "failed") {
      lastError = job.error;
      break;
    }
  }
  return lastError !== null ? "failed" : "timeout";
}

/** Suivi d'un envoi, côté caissier : le ticket est-il sorti là-bas ? */
export async function fetchPrintJobStatus(jobId: string): Promise<PosPrintJob | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("pos_print_jobs")
    .select("id, sale_id, handoff_id, paper_width_mm, status, error, created_at")
    .eq("id", jobId)
    .maybeSingle();
  if (error) throw mapSupabaseError(error);
  return data ? mapJob(data as unknown as Row) : null;
}

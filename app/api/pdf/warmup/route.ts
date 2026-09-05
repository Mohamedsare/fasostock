import { NextResponse } from "next/server";

import { requireAuthUser } from "@/lib/server/api-auth";
import { warmUpPdfBrowser } from "@/lib/server/pdf/html-to-pdf";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Réveille le moteur PDF pendant que la caisse est ouverte.
 *
 * Aucun document n'est fabriqué ici : on ouvre puis on referme un onglet vide, pour que
 * Chromium soit déjà lancé quand le premier ticket arrivera. Le démarrage à froid coûte
 * plusieurs secondes et il tombe toujours sur le même client — celui qui paie après une
 * accalmie. Autant le payer à vide.
 *
 * Réservé aux utilisateurs authentifiés : personne d'autre ne doit pouvoir faire lancer
 * un navigateur sur nos serveurs. Ne renvoie jamais d'erreur à la caisse : un
 * préchauffage raté n'est pas une panne, le ticket suivant relancera de lui-même.
 */
export async function POST() {
  try {
    const supabase = await createClient();
    const auth = await requireAuthUser(supabase);
    if (!auth.ok) return auth.response;

    const ready = await warmUpPdfBrowser();
    return NextResponse.json({ ready });
  } catch {
    return NextResponse.json({ ready: false });
  }
}

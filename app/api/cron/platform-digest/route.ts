import { runPlatformDigestEmailCron } from "@/lib/email/platform-emails";
import { verifyCronRequest } from "@/lib/server/cron-auth";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** Bilan d’activité plateforme — planifié 22h (Africa/Ouagadougou = UTC+0). */
export async function GET(req: Request) {
  if (!verifyCronRequest(req)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  try {
    const result = await runPlatformDigestEmailCron();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur cron bilan plateforme.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  return GET(req);
}

import {
  requireAuthUser,
  userCanSignQzRequests,
} from "@/lib/server/api-auth";
import { createClient } from "@/lib/supabase/server";
import { createSign } from "crypto";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const MAX_REQUEST_CHARS = 120_000;

/**
 * Signature des requêtes QZ Tray (hash côté client).
 * Définir `QZ_PRIVATE_KEY_PEM` (clé privée RSA au format PEM, alignée sur le certificat déclaré dans QZ Tray).
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const auth = await requireAuthUser(supabase);
  if (!auth.ok) return auth.response;

  const canSign = await userCanSignQzRequests(supabase, auth.user.id);
  if (!canSign) {
    return NextResponse.json(
      {
        error:
          "Signature QZ réservée au propriétaire, au manager ou aux utilisateurs autorisés à gérer les paramètres / imprimantes.",
      },
      { status: 403 },
    );
  }

  const pem = process.env.QZ_PRIVATE_KEY_PEM?.trim();
  if (!pem) {
    return NextResponse.json(
      {
        error:
          "Signature QZ indisponible : définissez QZ_PRIVATE_KEY_PEM sur le serveur (clé privée RSA PEM).",
      },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
  }

  const requestToSign =
    typeof body === "object" &&
    body !== null &&
    "request" in body &&
    typeof (body as { request?: unknown }).request === "string"
      ? (body as { request: string }).request
      : null;

  if (!requestToSign) {
    return NextResponse.json({ error: "Champ « request » (string) requis" }, { status: 400 });
  }
  if (requestToSign.length > MAX_REQUEST_CHARS) {
    return NextResponse.json({ error: "Requête QZ trop volumineuse." }, { status: 400 });
  }

  try {
    const sign = createSign("RSA-SHA512");
    sign.update(requestToSign);
    sign.end();
    const signature = sign.sign(pem, "base64");
    return NextResponse.json({ signature });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `Échec de la signature : ${msg}` }, { status: 500 });
  }
}

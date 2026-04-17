import { createClient } from "@/lib/supabase/server";
import { createSign } from "crypto";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Signature des requêtes QZ Tray (hash côté client).
 * Définir `QZ_PRIVATE_KEY_PEM` (clé privée RSA au format PEM, alignée sur le certificat déclaré dans QZ Tray).
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
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
    return NextResponse.json(
      { error: "Champ « request » (string) requis" },
      { status: 400 },
    );
  }

  try {
    const sign = createSign("RSA-SHA512");
    sign.update(requestToSign);
    sign.end();
    const signature = sign.sign(pem, "base64");
    return NextResponse.json({ signature });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: `Échec de la signature : ${msg}` },
      { status: 500 },
    );
  }
}

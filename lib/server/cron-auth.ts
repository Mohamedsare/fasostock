import { safeEqualStrings } from "@/lib/server/safe-compare";

/** Vérifie l’en-tête Authorization Bearer (Vercel Cron + CRON_SECRET). */
export function verifyCronRequest(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;

  const auth = req.headers.get("authorization")?.trim();
  if (!auth?.startsWith("Bearer ")) return false;

  const token = auth.slice("Bearer ".length).trim();
  if (!token) return false;

  return safeEqualStrings(token, secret);
}

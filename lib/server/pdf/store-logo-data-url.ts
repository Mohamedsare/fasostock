import { remoteImageToDataUrl } from "./remote-image-data-url";

/**
 * Logo de boutique embarqué en data URL, avec une mémoire très courte.
 *
 * Pourquoi une mémoire ici, alors que les autres documents s'en passent : le ticket de
 * caisse est le seul qui se fabrique en rafale — un par client, parfois plusieurs par
 * minute pour la même boutique. Sans elle, chaque ticket redemande le même fichier à
 * Supabase Storage, et cette attente-là se voit au comptoir.
 *
 * Pourquoi si courte : un propriétaire qui change son logo doit le retrouver sur ses
 * tickets tout de suite. Une minute couvre une file de clients ; c'est trop peu pour
 * qu'un changement passe inaperçu.
 *
 * Les échecs sont retenus aussi, mais moins longtemps. Pendant une panne de Storage,
 * réessayer à chaque ticket coûterait le délai d'attente complet (8 s) à chaque client ;
 * quinze secondes de mémoire suffisent à n'en payer qu'un sur plusieurs, sans retarder
 * le retour du logo quand le service revient.
 */
const OK_TTL_MS = 60_000;
const FAIL_TTL_MS = 15_000;
/** Nombre de boutiques qui impriment en même temps sur une instance : quelques-unes suffisent. */
const MAX_ENTRIES = 16;

type CacheEntry = { value: string | null; expiresAt: number };

const cache = new Map<string, CacheEntry>();

export async function storeLogoDataUrl(
  url: string | null | undefined,
): Promise<string | null> {
  const key = url?.trim();
  if (!key) return null;

  const supabasePublicUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();

  // Déjà embarqué (aperçu client) : rien à télécharger, donc rien à retenir. Le contrôle
  // d'origine reste fait par `remoteImageToDataUrl`.
  if (key.startsWith("data:")) {
    return remoteImageToDataUrl(key, supabasePublicUrl);
  }

  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expiresAt > now) return hit.value;

  const value = await remoteImageToDataUrl(key, supabasePublicUrl);
  // Réinsérer en fin de `Map` : l'ordre d'insertion sert d'ordre d'oubli ci-dessous.
  cache.delete(key);
  cache.set(key, { value, expiresAt: now + (value ? OK_TTL_MS : FAIL_TTL_MS) });
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
  return value;
}

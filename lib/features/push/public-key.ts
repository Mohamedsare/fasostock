/**
 * Clé VAPID publique, seule partie de la paire qui a le droit d'atteindre le navigateur.
 *
 * Nom standard : `NEXT_PUBLIC_VAPID_PUBLIC_KEY`. Le repli sur
 * `NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY` existe parce que des environnements
 * (Vercel, .env locaux) sont déjà déployés avec l'ancien nom : renommer sans repli
 * désabonnerait tout le monde d'un coup.
 *
 * Les deux accès à `process.env` sont écrits en toutes lettres : Next.js remplace ces
 * expressions à la compilation, une lecture dynamique renverrait `undefined`.
 */
export function getVapidPublicKey(): string | null {
  const preferred = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  if (preferred) return preferred;
  const legacy = process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY?.trim();
  return legacy || null;
}

/** Le Web Push n'est proposé à l'utilisateur que si le serveur peut réellement émettre. */
export function isWebPushConfigured(): boolean {
  return Boolean(getVapidPublicKey());
}

import { timingSafeEqual } from "node:crypto";

/**
 * Compare deux secrets en temps constant.
 *
 * Un `===` classique sort à la première différence : le temps de réponse fuit
 * la longueur du préfixe correct, ce qui permet de reconstituer un secret
 * caractère par caractère. À utiliser pour TOUT secret partagé (cron, webhook).
 */
export function safeEqualStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

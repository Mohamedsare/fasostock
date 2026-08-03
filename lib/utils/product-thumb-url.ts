/**
 * Vignettes produits — sans transformation d'images facturée.
 *
 * Une miniature de 48 px n'a aucune raison de télécharger l'image principale
 * (1024 px, ~100 Ko). On génère donc une vraie vignette au moment de l'envoi et
 * on la range à côté de l'original. Reste à savoir, à l'affichage, si une
 * vignette existe : les images envoyées avant cette évolution n'en ont pas, et
 * demander un fichier absent produirait une requête 404 par produit.
 *
 * Le nom du fichier porte donc l'information lui-même :
 *
 *   1754230000-f.webp   image principale, le suffixe `-f` atteste qu'une vignette existe
 *   1754230000-t.webp   la vignette correspondante
 *   1754230000.webp     image ancienne, sans vignette — servie telle quelle
 *
 * Le suffixe `-f` n'est écrit qu'*après* l'envoi réussi de la vignette (voir
 * `addProductImage`). Il ne peut donc pas mentir : sa présence garantit le
 * fichier. Aucune colonne à ajouter en base, aucune migration.
 */

/** Image principale marquée comme ayant une vignette : `…-f.<ext>` en fin d'URL. */
const FULL_MARKER = /-f(\.[A-Za-z0-9]+)(\?.*)?$/;

/** Suffixe du fichier principal, écrit une fois la vignette en place. */
export const FULL_SUFFIX = "-f";
/** Suffixe du fichier vignette. */
export const THUMB_SUFFIX = "-t";

/**
 * URL de la vignette si elle existe, sinon l'URL d'origine inchangée.
 *
 * Ne produit jamais de requête vers un fichier absent : sans le marqueur, on
 * renvoie l'image principale telle quelle.
 */
export function productThumbUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (!FULL_MARKER.test(url)) return url;
  return url.replace(FULL_MARKER, `${THUMB_SUFFIX}$1$2`);
}

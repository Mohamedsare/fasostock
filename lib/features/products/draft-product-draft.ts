/**
 * Fiche article en cours de saisie (écran « Ajout produit »).
 *
 * L'employé saisit debout dans un dépôt, carton en main, et va régulièrement vérifier
 * si l'article existe déjà ailleurs dans l'app. Le routeur démonte la page à chaque
 * fois : le nom tapé, le code-barres scanné et la note disparaissaient.
 */
export type DraftProductDraft = {
  name: string;
  unit: string;
  barcode: string;
  categoryId: string;
  description: string;
  /** Le volet « note » était-il ouvert — pour ne pas rendre une note restaurée invisible. */
  noteOpen: boolean;
};

/**
 * La PHOTO n'en fait pas partie, volontairement.
 *
 * Un `File` ne se compare pas en JSON (il s'aplatit en `{}`, donc un changement de photo
 * passerait inaperçu du mécanisme d'écriture) et son aperçu est une URL d'objet qui ne
 * vaut plus rien après un rechargement. La reprendre coûte un geste ; se fier à un
 * aperçu mort ou croire une photo enregistrée alors qu'elle ne l'est pas coûte plus.
 */
export const DRAFT_PRODUCT_DRAFT_VERSION = 1;

/** La fiche appartient au catalogue de l'entreprise, pas à une boutique. */
export function draftProductDraftKey(companyId: string): string {
  return `draft-product:${companyId}`;
}

/**
 * L'unité et la catégorie ne comptent pas : l'écran les GARDE exprès d'un article au
 * suivant (on déballe vingt références de la même famille). Seules-elles, il n'y a
 * aucune saisie en cours, seulement des valeurs reconduites.
 */
export function isDraftProductDraftEmpty(draft: DraftProductDraft): boolean {
  return (
    draft.name.trim() === "" &&
    draft.barcode.trim() === "" &&
    draft.description.trim() === ""
  );
}

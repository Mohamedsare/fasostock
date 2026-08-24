/**
 * Règles de pagination communes à tous les documents A4 (facture, devis, états…).
 *
 * Sans elles, Chrome coupe une ligne de tableau en plein milieu quand la page
 * est pleine : la moitié haute du texte reste en bas d'une page, la moitié
 * basse passe sur la suivante. Une facture doit toujours se couper ENTRE deux
 * lignes, jamais à l'intérieur d'une ligne.
 */
export const TABLE_PAGINATION_CSS = `
  /* Coupure propre des tableaux entre deux pages */
  table { break-inside: auto; page-break-inside: auto; }
  thead { display: table-header-group; break-inside: avoid; break-after: avoid; }
  tfoot { display: table-footer-group; break-inside: avoid; }
  tr { break-inside: avoid; page-break-inside: avoid; }
  td, th { break-inside: avoid; page-break-inside: avoid; }
  /* Une image ne doit pas non plus être tranchée */
  img { break-inside: avoid; page-break-inside: avoid; }
  /* Blocs à garder d'un seul tenant (totaux, règlement, signature…) */
  .no-break { break-inside: avoid; page-break-inside: avoid; }
`;

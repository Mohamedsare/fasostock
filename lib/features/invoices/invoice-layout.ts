/**
 * Mise en page des documents de vente, décidée par le propriétaire.
 *
 * Deux libertés, et deux seulement : **retirer** un élément, et **renommer** son
 * libellé. Rien d'autre — ni ordre, ni couleurs, ni polices : le reste est déjà
 * réglable ailleurs (modèle, couleurs, textes de la boutique), et une facture dont
 * on peut tout déplacer devient une facture qu'on ne peut plus corriger.
 *
 * Règle absolue : **une configuration vide rend exactement le document actuel**.
 * `hidden` vide et `labels` vide, c'est le comportement d'origine, au pixel près.
 * Toutes les boutiques existantes sont donc dans cet état sans rien avoir à faire,
 * et une colonne `invoice_layout` absente en base ne change rien non plus.
 */

export type InvoiceLayoutConfig = {
  /** Clés d'éléments masqués. */
  hidden: string[];
  /** Libellés remplacés, par clé. Une valeur vide = libellé d'origine. */
  labels: Record<string, string>;
};

export const INVOICE_LAYOUT_DEFAULT: InvoiceLayoutConfig = { hidden: [], labels: {} };

/** Un élément configurable d'un document. */
export type InvoiceElement = {
  key: string;
  /** Groupe d'affichage dans l'écran de configuration. */
  group: string;
  /** Nom montré au propriétaire. */
  name: string;
  /** Précision affichée sous le nom, quand l'élément mérite un mot d'explication. */
  hint?: string;
  /**
   * Libellé imprimé par défaut. Présent = l'élément est renommable ; absent = il
   * n'affiche aucun texte fixe (un logo, une valeur, une image) et n'a donc rien
   * à renommer.
   */
  defaultText?: string;
  /**
   * Élément impossible à retirer : sans lui le document ne serait plus le document
   * (la désignation des articles, le nom de la boutique). Il reste renommable.
   */
  locked?: boolean;
};

/* ─────────────────────────── Facture A4 ─────────────────────────── */

export const A4_ELEMENTS: InvoiceElement[] = [
  // En-tête
  { key: "a4.headerBar", group: "En-tête", name: "Bandeau du haut", hint: "Nom de la boutique à gauche, numéro et date à droite" },
  { key: "a4.logo", group: "En-tête", name: "Logo" },
  { key: "a4.shortTitle", group: "En-tête", name: "Titre court", hint: "Sigle affiché au-dessus du nom" },
  { key: "a4.storeName", group: "En-tête", name: "Nom commercial", locked: true },
  { key: "a4.slogan", group: "En-tête", name: "Slogan" },
  { key: "a4.activity", group: "En-tête", name: "Activité" },
  { key: "a4.phone", group: "En-tête", name: "Téléphone" },
  { key: "a4.mobileMoney", group: "En-tête", name: "Mobile money" },
  { key: "a4.address", group: "En-tête", name: "Adresse" },

  // Identification du document
  { key: "a4.customer", group: "Document", name: "Bloc client", defaultText: "Client" },
  { key: "a4.invoiceNumber", group: "Document", name: "Numéro de facture", defaultText: "Facture n°" },
  { key: "a4.date", group: "Document", name: "Date", defaultText: "Date" },

  // Tableau
  { key: "a4.colNum", group: "Tableau des articles", name: "Colonne N°", defaultText: "N°" },
  { key: "a4.colDesc", group: "Tableau des articles", name: "Colonne Désignation", defaultText: "Désignation", locked: true },
  { key: "a4.colQty", group: "Tableau des articles", name: "Colonne Quantité", defaultText: "Quantité" },
  { key: "a4.colUnit", group: "Tableau des articles", name: "Colonne Unité", defaultText: "Unité" },
  { key: "a4.colPrice", group: "Tableau des articles", name: "Colonne Prix unitaire", defaultText: "Prix unit.", hint: "Retirez-la, avec la colonne Total, pour un bon de livraison sans prix" },
  { key: "a4.colTotal", group: "Tableau des articles", name: "Colonne Total", defaultText: "Total" },

  // Totaux
  { key: "a4.subtotal", group: "Totaux et règlement", name: "Sous-total", defaultText: "Sous-total" },
  { key: "a4.discount", group: "Totaux et règlement", name: "Remise", defaultText: "Remise" },
  { key: "a4.tax", group: "Totaux et règlement", name: "TVA", defaultText: "TVA" },
  { key: "a4.total", group: "Totaux et règlement", name: "Total", defaultText: "TOTAL", locked: true },
  { key: "a4.payments", group: "Totaux et règlement", name: "Détail du règlement", defaultText: "Règlement" },
  { key: "a4.paymentStatus", group: "Totaux et règlement", name: "Statut du paiement", hint: "« facture intégralement réglée », « solde à régler »…" },
  { key: "a4.creditDue", group: "Totaux et règlement", name: "Échéance du solde" },
  { key: "a4.amountWords", group: "Totaux et règlement", name: "Montant en toutes lettres" },

  // Bas de page
  { key: "a4.signature", group: "Bas de page", name: "Signataire", hint: "Fonction et nom saisis plus haut" },
  { key: "a4.footer", group: "Bas de page", name: "Pied de page", defaultText: "Merci pour votre confiance." },
];

/* ─────────────────────────── Ticket thermique ─────────────────────────── */

export const TICKET_ELEMENTS: InvoiceElement[] = [
  { key: "t.logo", group: "En-tête", name: "Logo" },
  { key: "t.storeName", group: "En-tête", name: "Nom de la boutique", locked: true },
  { key: "t.address", group: "En-tête", name: "Adresse" },
  { key: "t.phone", group: "En-tête", name: "Téléphone" },
  { key: "t.meta", group: "En-tête", name: "Numéro et date" },

  { key: "t.colDesc", group: "Tableau des articles", name: "Colonne Produit", defaultText: "Produit", locked: true },
  { key: "t.colQty", group: "Tableau des articles", name: "Colonne Qté", defaultText: "Qté" },
  { key: "t.colPrice", group: "Tableau des articles", name: "Colonne Prix unitaire", defaultText: "PU" },
  { key: "t.colTotal", group: "Tableau des articles", name: "Colonne Total", defaultText: "Total" },

  { key: "t.subtotal", group: "Totaux et règlement", name: "Sous-total", defaultText: "Sous-total" },
  { key: "t.discount", group: "Totaux et règlement", name: "Remise", defaultText: "Remise" },
  { key: "t.total", group: "Totaux et règlement", name: "Total", defaultText: "TOTAL", locked: true },
  { key: "t.payment", group: "Totaux et règlement", name: "Moyen de paiement", defaultText: "Paiement" },
  { key: "t.received", group: "Totaux et règlement", name: "Montant reçu", defaultText: "Reçu" },
  { key: "t.change", group: "Totaux et règlement", name: "Monnaie rendue", defaultText: "Rendu" },
  { key: "t.customer", group: "Totaux et règlement", name: "Client", defaultText: "Client" },
  { key: "t.credit", group: "Totaux et règlement", name: "Bloc crédit", hint: "Acompte, reste à payer, échéance — la preuve de dette du client" },

  { key: "t.qr", group: "Bas de page", name: "QR code" },
  { key: "t.thanks", group: "Bas de page", name: "Remerciement", defaultText: "Merci pour votre achat !" },
  { key: "t.powered", group: "Bas de page", name: "Mention « Powered by FasoStock POS »" },
];

const ALL_ELEMENTS = [...A4_ELEMENTS, ...TICKET_ELEMENTS];
const KNOWN_KEYS = new Set(ALL_ELEMENTS.map((e) => e.key));
const LOCKED_KEYS = new Set(ALL_ELEMENTS.filter((e) => e.locked).map((e) => e.key));

/**
 * Lit une configuration venue de la base (JSON libre) sans jamais faire confiance à
 * sa forme : une valeur abîmée redonne la configuration par défaut, donc le document
 * d'origine. Les clés inconnues sont écartées — une version plus récente de
 * l'application a pu en enregistrer que celle-ci ne connaît pas encore.
 */
export function parseInvoiceLayout(raw: unknown): InvoiceLayoutConfig {
  if (raw == null) return INVOICE_LAYOUT_DEFAULT;
  let value = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return INVOICE_LAYOUT_DEFAULT;
    }
  }
  if (typeof value !== "object" || value == null) return INVOICE_LAYOUT_DEFAULT;
  const o = value as { hidden?: unknown; labels?: unknown };

  const hidden: string[] = [];
  if (Array.isArray(o.hidden)) {
    for (const k of o.hidden) {
      const key = String(k ?? "");
      // Un élément verrouillé ne se masque pas, même si la base dit le contraire.
      if (KNOWN_KEYS.has(key) && !LOCKED_KEYS.has(key) && !hidden.includes(key)) {
        hidden.push(key);
      }
    }
  }

  const labels: Record<string, string> = {};
  if (typeof o.labels === "object" && o.labels != null) {
    for (const [k, v] of Object.entries(o.labels as Record<string, unknown>)) {
      if (!KNOWN_KEYS.has(k)) continue;
      const text = String(v ?? "").trim().slice(0, 60);
      if (text) labels[k] = text;
    }
  }

  return { hidden, labels };
}

/** Configuration portée par une boutique (`stores.invoice_layout`). */
export function invoiceLayoutOfStore(store: { invoice_layout?: unknown } | null | undefined) {
  return parseInvoiceLayout(store?.invoice_layout);
}

/** L'élément est-il imprimé ? */
export function layoutOn(cfg: InvoiceLayoutConfig | null | undefined, key: string): boolean {
  return !(cfg?.hidden ?? []).includes(key);
}

/** Libellé à imprimer : celui du propriétaire s'il en a posé un, sinon l'original. */
export function layoutText(
  cfg: InvoiceLayoutConfig | null | undefined,
  key: string,
  fallback: string,
): string {
  const custom = cfg?.labels?.[key];
  return custom != null && custom.trim() ? custom.trim() : fallback;
}

/** Rien n'a été touché : utile pour dire « configuration par défaut » à l'écran. */
export function isDefaultLayout(cfg: InvoiceLayoutConfig): boolean {
  return cfg.hidden.length === 0 && Object.keys(cfg.labels).length === 0;
}

/**
 * Ce qui part en base. `null` quand rien n'est personnalisé : la colonne reste vide,
 * et une boutique jamais configurée ne se distingue pas d'une boutique remise à zéro.
 */
export function serializeInvoiceLayout(cfg: InvoiceLayoutConfig): InvoiceLayoutConfig | null {
  return isDefaultLayout(cfg) ? null : { hidden: [...cfg.hidden], labels: { ...cfg.labels } };
}

/** Groupes dans l'ordre d'affichage, pour l'écran de configuration. */
export function groupElements(elements: InvoiceElement[]): Array<{
  group: string;
  items: InvoiceElement[];
}> {
  const out: Array<{ group: string; items: InvoiceElement[] }> = [];
  for (const el of elements) {
    const found = out.find((g) => g.group === el.group);
    if (found) found.items.push(el);
    else out.push({ group: el.group, items: [el] });
  }
  return out;
}

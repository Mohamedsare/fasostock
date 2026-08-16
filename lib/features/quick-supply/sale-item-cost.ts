"use client";

import { isUndefinedColumnError } from "@/lib/features/common/optimistic-column";
import { createClient } from "@/lib/supabase/client";

/**
 * Le coût réel d'une ligne de vente.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE COLONNE EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Jusqu'ici, la marge se calculait partout de la même façon : `total de la ligne −
 * products.purchase_price × quantité`. C'est juste tant qu'un produit n'a qu'un seul
 * prix d'achat. Les arrivages cassent cette hypothèse : douze sacs payés 650 chez le
 * voisin cohabitent, dans le même rayon, avec ceux payés 600 chez le grossiste.
 *
 * Le trigger d'approvisionnement fige donc le coût VRAIMENT supporté sur la ligne de
 * vente (`sale_items.unit_cost`) au moment où la marchandise sort du lot. Les rapports
 * le lisent en priorité, et retombent sur le prix catalogue quand il est absent —
 * c'est-à-dire pour toutes les ventes ordinaires, dont le calcul ne change pas d'un
 * centime.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI ELLE EST DEMANDÉE DE FAÇON OPTIMISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le code part en production avant que la migration ne soit jouée. Réclamer une colonne
 * qui n'existe pas encore ferait échouer la requête ENTIÈRE — et ces requêtes-là sont
 * celles du tableau de bord et des rapports. Le propriétaire ouvrirait son application
 * sur un écran en erreur, pour une fonctionnalité qu'il n'utilise peut-être même pas.
 *
 * On sonde donc une fois par session, très légèrement, et on s'en souvient. Tant que la
 * colonne n'est pas là, les rapports gardent exactement le comportement qu'ils ont
 * toujours eu.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'UNE SONDE RATÉE NE DOIT PAS VOULOIR DIRE
 * ─────────────────────────────────────────────────────────────────────────────
 * Une sonde qui échoue ne prouve pas que la colonne manque : un jeton en cours de
 * renouvellement, une 3G qui lâche, et la requête tombe tout pareil. Retenir « absente »
 * dans ce cas-là faisait basculer marges, bénéfices et rapports sur le prix catalogue
 * pour TOUT le reste de la session — des chiffres faux, sans rien à l'écran pour le
 * signaler. C'est plus grave que la panne elle-même.
 *
 * On ne mémorise donc un verdict que lorsque la base a explicitement dit « cette colonne
 * n'existe pas ». Toute autre erreur laisse la question ouverte : la lecture en cours se
 * passe de `unit_cost` (repli sans conséquence, le calcul d'avant), et la sonde suivante
 * retentera sa chance.
 */

/** `undefined` = pas encore tranché — ni sondé, ni sondé sans réponse claire. */
let columnAvailable: boolean | undefined;
let probe: Promise<boolean> | null = null;

/**
 * Sonde à jouer AVANT de construire une requête qui voudrait `unit_cost`.
 * Les appels concurrents partagent la même promesse ; une fois le verdict rendu, il ne
 * coûte plus rien.
 */
export async function saleItemCostColumnAvailable(): Promise<boolean> {
  if (columnAvailable !== undefined) return columnAvailable;
  if (probe) return probe;

  probe = (async () => {
    try {
      const supabase = createClient();
      // `limit(0)` : PostgREST valide les colonnes demandées sans rapporter la moindre
      // ligne. La sonde coûte donc un aller-retour, et rien de plus.
      const { error } = await supabase.from("sale_items").select("unit_cost").limit(0);
      if (!error) {
        columnAvailable = true;
      } else if (isUndefinedColumnError(error, "unit_cost")) {
        // Verdict franc de la base : la migration n'est pas passée. On s'en souvient.
        columnAvailable = false;
      }
      // Sinon : panne passagère. `columnAvailable` reste `undefined`, donc non tranché.
    } catch {
      /* Réseau, délai dépassé : la question reste ouverte, elle sera reposée. */
    } finally {
      // Libérée dans tous les cas : sans ça, une sonde non concluante resterait la
      // réponse définitive de la session, ce qu'on cherche précisément à éviter.
      probe = null;
    }
    return columnAvailable === true;
  })();

  return probe;
}

/**
 * Ajoute `unit_cost` à une liste de colonnes, si la base la connaît.
 * À appeler après `saleItemCostColumnAvailable()`.
 */
export function withSaleItemCost(columns: string): string {
  return columnAvailable ? `${columns}, unit_cost` : columns;
}

/**
 * Coût unitaire à retenir pour une ligne de vente : celui du lot si la marchandise en
 * venait, sinon le prix d'achat du catalogue.
 *
 * `??` et non `||` : un coût de zéro est une valeur, pas une absence — une marchandise
 * reçue gratuitement (échantillon, geste du fournisseur) a bien coûté zéro, et sa marge
 * est alors le prix de vente entier.
 */
export function effectiveUnitCost(
  unitCost: unknown,
  cataloguePurchasePrice: unknown,
): number {
  const lot = unitCost == null ? null : Number(unitCost);
  if (lot != null && Number.isFinite(lot)) return lot;
  const catalogue = Number(cataloguePurchasePrice ?? 0);
  return Number.isFinite(catalogue) ? catalogue : 0;
}

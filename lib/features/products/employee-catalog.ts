"use client";

/**
 * Ce que l'équipe peut apporter au catalogue sans y toucher.
 *
 * Deux fonctions, deux écrans, une même idée : le patron garde les prix, l'équipe
 * apporte ce qu'elle est la seule à avoir sous les yeux — la photo de l'article, et le
 * nom de ce qui sort du carton.
 *
 * Voir l'en-tête de `supabase/migrations/00210_employee_catalog_contributions.sql`
 * pour le raisonnement complet.
 */

import { createClient } from "@/lib/supabase/client";
import { fetchAllPages } from "@/lib/supabase/fetch-all-pages";

/** Un produit vu par la page Photos : juste de quoi le reconnaître et l'illustrer. */
export type PhotoCatalogProduct = {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  unit: string;
  categoryName: string | null;
  /** Photos déjà en place, triées (`position` asc) — la première est la miniature. */
  images: { id: string; url: string; position: number }[];
  /** Fiche créée par un employé et pas encore chiffrée par le patron. */
  awaitingPricing: boolean;
};

const photoCatalogSelect =
  "id, name, sku, barcode, unit, awaiting_pricing, category:categories(id, name), product_images(id, url, position)";

/**
 * Le catalogue, réduit à ce que la page Photos affiche.
 *
 * Projection dédiée plutôt que `listProducts` : celui-ci ramène les prix, les
 * conditionnements, les champs métier et les alias de recherche — soit, sur deux mille
 * références et une connexion de marché, plusieurs secondes d'attente pour afficher une
 * grille de vignettes. Et surtout des PRIX, envoyés au navigateur d'un employé qui n'a
 * précisément pas le droit de les voir. Ne pas les demander est plus sûr que les
 * demander puis ne pas les afficher.
 *
 * Paginé : c'est le catalogue entier, il dépasse les 1000 lignes de PostgREST chez
 * n'importe quelle quincaillerie.
 */
export async function listPhotoCatalog(
  companyId: string,
): Promise<PhotoCatalogProduct[]> {
  const supabase = createClient();
  const { data, error } = await fetchAllPages((from, to) =>
    supabase
      .from("products")
      .select(photoCatalogSelect)
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .order("name", { ascending: true })
      // Deux produits peuvent porter le même nom : sans cette clé l'ordre n'est pas
      // total, et une page répéterait une ligne en en perdant une autre.
      .order("id", { ascending: true })
      .range(from, to),
  );
  if (error) throw error;

  return ((data ?? []) as unknown as Array<Record<string, unknown>>).map((row) => {
    const catRaw = row.category;
    const cat = Array.isArray(catRaw)
      ? (catRaw[0] as { name?: string } | undefined)
      : (catRaw as { name?: string } | null);

    const imgsRaw = row.product_images;
    const images = Array.isArray(imgsRaw)
      ? [...(imgsRaw as Array<Record<string, unknown>>)]
          .map((i) => ({
            id: String(i.id),
            url: String(i.url ?? ""),
            position: Number(i.position ?? 0),
          }))
          .filter((i) => i.url !== "")
          .sort((a, b) => a.position - b.position)
      : [];

    return {
      id: String(row.id),
      name: String(row.name ?? ""),
      sku: row.sku != null ? String(row.sku) : null,
      barcode: row.barcode != null ? String(row.barcode) : null,
      unit: String(row.unit ?? "pce"),
      categoryName: cat?.name != null ? String(cat.name) : null,
      images,
      awaitingPricing: row.awaiting_pricing === true,
    };
  });
}

export type DraftProductInput = {
  companyId: string;
  name: string;
  unit: string;
  barcode: string;
  description: string;
  categoryId: string | null;
  /**
   * Boutique où l'employé travaille. Sert uniquement aux entreprises dont les boutiques
   * ont un catalogue séparé : sans ce rattachement, la fiche chiffrée par le patron
   * resterait introuvable en caisse dans la boutique même qui l'a saisie.
   */
  storeId: string | null;
};

/**
 * Crée la fiche SANS prix. Les prix, l'activation et l'état d'attente ne sont pas des
 * paramètres : le RPC les écrit en dur (migration 00210). Ce qui part d'ici ne peut
 * donc pas arriver chiffré, quoi qu'on ajoute à la requête.
 */
export async function createDraftProduct(input: DraftProductInput): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("create_draft_product", {
    p_company_id: input.companyId,
    p_name: input.name.trim(),
    p_unit: input.unit.trim() || null,
    p_barcode: input.barcode.trim() || null,
    p_category_id: input.categoryId,
    p_description: input.description.trim() || null,
    p_store_id: input.storeId,
  });
  if (error) throw error;
  return String(data);
}

/** Réglage entreprise « Photos produits » — écrit par le propriétaire (RPC dédiée). */
export async function setEmployeePhotosEnabled(
  companyId: string,
  enabled: boolean,
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("company_set_employee_photos_enabled", {
    p_company_id: companyId,
    p_enabled: enabled,
  });
  if (error) throw error;
}

/** Réglage entreprise « Produits ajoutés par l'équipe » — écrit par le propriétaire. */
export async function setEmployeeDraftProductsEnabled(
  companyId: string,
  enabled: boolean,
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("company_set_employee_draft_products_enabled", {
    p_company_id: companyId,
    p_enabled: enabled,
  });
  if (error) throw error;
}

/**
 * Combien de fiches attendent leur prix.
 *
 * `head: true` : PostgREST renvoie le compte sans transporter une seule ligne. C'est un
 * badge affiché en permanence sur la page Produits — il doit coûter le prix d'un
 * en-tête HTTP, pas celui d'une lecture de catalogue.
 *
 * Ne lève jamais : tant que la migration 00210 n'est pas passée, la colonne n'existe
 * pas et la requête échoue. Un badge absent est le bon comportement ; une page Produits
 * en erreur ne le serait pas.
 */
export async function countAwaitingPricing(companyId: string): Promise<number> {
  try {
    const supabase = createClient();
    const { count, error } = await supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .eq("awaiting_pricing", true);
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}

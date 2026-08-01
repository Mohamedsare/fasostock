import { createClient } from "@/lib/supabase/server";
import {
  fetchPublicCatalog,
  fetchPublicOnlineStore,
} from "@/lib/features/online-store/public-api";
import { Storefront } from "@/components/online-store/public/storefront";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

/**
 * Catalogue public d'une boutique. Rendu serveur : le client reçoit la page déjà
 * remplie (recherche et panier fonctionnent ensuite sans réseau), ce qui compte
 * quand la connexion est faible. Le stock lu ici est celui de la boutique à la
 * seconde près — d'où `force-dynamic`.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  try {
    const supabase = await createClient();
    const shop = await fetchPublicOnlineStore(supabase, slug);
    if (!shop) {
      return { title: "Boutique introuvable", robots: { index: false, follow: false } };
    }
    const description =
      shop.tagline ??
      shop.description ??
      `Commandez en ligne chez ${shop.displayName}${shop.city ? ` à ${shop.city}` : ""} : ${shop.productsCount} articles disponibles, livraison ou retrait en boutique.`;
    return {
      title: `${shop.displayName} — Boutique en ligne`,
      description,
      alternates: { canonical: `/boutique/${shop.slug}` },
      openGraph: {
        type: "website",
        title: `${shop.displayName} — commandez en ligne`,
        description,
        url: `/boutique/${shop.slug}`,
        images: shop.coverUrl ? [{ url: shop.coverUrl }] : undefined,
      },
    };
  } catch {
    return { title: "Boutique en ligne" };
  }
}

export default async function PublicStorePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const rawSource = Array.isArray(sp.src) ? sp.src[0] : sp.src;
  const source = (rawSource ?? "catalog").slice(0, 24);

  const supabase = await createClient();
  const shop = await fetchPublicOnlineStore(supabase, slug);
  if (!shop) notFound();

  const products = await fetchPublicCatalog(supabase, slug, 600, 0);

  return <Storefront shop={shop} products={products} source={source} />;
}

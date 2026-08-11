import { PosScreen } from "@/components/pos/pos-screen";

type Params = {
  params: Promise<{ storeId: string }>;
  searchParams: Promise<{ editSale?: string }>;
};

export default async function StorePosQuickPage({ params, searchParams }: Params) {
  const { storeId } = await params;
  const sp = await searchParams;
  /*
   * `key` : passer d'une boutique à l'autre doit repartir d'une caisse vierge.
   * Sans lui, React réutilise le composant (même type, même position) et le
   * panier de la boutique précédente resterait à l'écran, avec des produits et
   * des prix qui ne sont plus ceux de la boutique affichée.
   */
  return (
    <PosScreen key={storeId} storeId={storeId} mode="quick" editSaleId={sp.editSale} />
  );
}

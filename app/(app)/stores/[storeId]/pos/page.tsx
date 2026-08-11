import { PosScreen } from "@/components/pos/pos-screen";

type Params = {
  params: Promise<{ storeId: string }>;
  searchParams: Promise<{ editSale?: string }>;
};

export default async function StorePosPage({ params, searchParams }: Params) {
  const { storeId } = await params;
  const sp = await searchParams;
  /* `key` : une caisse vierge par boutique — cf. la caisse rapide. */
  return <PosScreen key={storeId} storeId={storeId} mode="a4" editSaleId={sp.editSale} />;
}

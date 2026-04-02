import { PosScreen } from "@/components/pos/pos-screen";

type Params = {
  params: Promise<{ storeId: string }>;
  searchParams: Promise<{ editSale?: string }>;
};

export default async function FactureTabPage({ params, searchParams }: Params) {
  const { storeId } = await params;
  const sp = await searchParams;
  return <PosScreen storeId={storeId} mode="a4-table" editSaleId={sp.editSale} />;
}

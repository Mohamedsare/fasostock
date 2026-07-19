import { EngineSaleScreen } from "@/components/engine-sales/engine-sale-screen";

type Params = {
  params: Promise<{ storeId: string }>;
};

export default async function StoreEngineSalePage({ params }: Params) {
  const { storeId } = await params;
  return <EngineSaleScreen storeId={storeId} />;
}

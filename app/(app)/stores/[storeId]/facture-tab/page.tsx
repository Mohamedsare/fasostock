import { PosScreen } from "@/components/pos/pos-screen";

type Params = { params: Promise<{ storeId: string }> };

export default async function FactureTabPage({ params }: Params) {
  const { storeId } = await params;
  return <PosScreen storeId={storeId} mode="a4-table" />;
}

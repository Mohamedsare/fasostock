import { EngineSaleScreen } from "@/components/engine-sales/engine-sale-screen";

type Params = {
  params: Promise<{ storeId: string }>;
};

export default async function StoreEngineSalePage({ params }: Params) {
  const { storeId } = await params;
  /* `key` : changer de boutique repart d'un formulaire vierge — cf. la caisse. */
  return <EngineSaleScreen key={storeId} storeId={storeId} />;
}

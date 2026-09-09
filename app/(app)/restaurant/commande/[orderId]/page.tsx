import { RestaurantOrderScreen } from "@/components/restaurant/order-screen";

type Params = { params: Promise<{ orderId: string }> };

/**
 * Le carnet d'une commande. `orderId` vient de l'URL plutôt que d'un état d'écran :
 * un serveur qui rafraîchit sa page en plein service doit retrouver sa table, et le
 * lien se partage entre deux téléphones du même comptoir.
 */
export default async function RestaurantOrderPage({ params }: Params) {
  const { orderId } = await params;
  return <RestaurantOrderScreen orderId={orderId} />;
}

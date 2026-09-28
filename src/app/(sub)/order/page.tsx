import { getProfile } from "@/lib/data";
import OrderHelperScreen from "@/components/food/OrderHelperScreen";

export const dynamic = "force-dynamic";

/** v2.18 A4: the restaurant and delivery helper (paste an order or add a screenshot; menus stay in Scan). */
export default async function OrderPage() {
  const profile = await getProfile();
  return <OrderHelperScreen hideNumbers={profile.hide_numbers === true} />;
}

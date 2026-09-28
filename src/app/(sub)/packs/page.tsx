import SubPage from "@/components/SubPage";
import PacksScreen from "@/components/social/PacksScreen";
import { getPacks } from "@/lib/social/data";
import { getLang } from "@/lib/social/lang";
import { t } from "@/lib/social/i18n";

export const dynamic = "force-dynamic";

/** v2.18 D11 /packs: gold covers and badge skins. Free during the beta; the price still shows. */
export default async function PacksPage() {
  const [lang, packs] = await Promise.all([getLang(), getPacks()]);
  return (
    <SubPage title={t("packs.title", lang)} back="/social">
      <PacksScreen available={packs.available} unlocked={packs.unlocked} skin={packs.skin} betaFree={packs.betaFree} cover={packs.cover} />
    </SubPage>
  );
}

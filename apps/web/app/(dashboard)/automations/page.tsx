import { useTranslations } from "next-intl";
import { PlaceholderScreen } from "../../../components/layout/PlaceholderScreen";

export default function AutomationsPage() {
  const t = useTranslations("nav");
  return <PlaceholderScreen glyph="clock" label={t("automations")} />;
}

import { useTranslations } from "next-intl";
import { PlaceholderScreen } from "../../../components/layout/PlaceholderScreen/PlaceholderScreen";

export default function SettingsPage() {
  const t = useTranslations("nav");
  return <PlaceholderScreen glyph="gear" label={t("settings")} />;
}

import { useTranslations } from "next-intl";
import { PlaceholderScreen } from "../../../components/layout/PlaceholderScreen";

export default function RunsPage() {
  const t = useTranslations("nav");
  return <PlaceholderScreen glyph="pulse" label={t("runs")} />;
}

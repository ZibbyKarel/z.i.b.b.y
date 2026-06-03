import { useTranslations } from "next-intl";
import { PlaceholderScreen } from "../../../components/layout/PlaceholderScreen/PlaceholderScreen";

export default function MemoryPage() {
  const t = useTranslations("nav");
  return <PlaceholderScreen glyph="brain" label={t("memory")} />;
}

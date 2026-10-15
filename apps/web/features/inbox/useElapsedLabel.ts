import { useTranslations } from "next-intl";
import { elapsed } from "./inbox";

/** `"just now"` / `"4 min ago"` / `"2 h ago"` / `"3 d ago"` for an ISO timestamp. */
export function useElapsedLabel(): (iso: string, now: number) => string {
  const t = useTranslations("inboxPage.age");
  return (iso, now) => {
    const { unit, n } = elapsed(iso, now);
    return unit === "now" ? t("now") : t("ago", { age: t(unit, { n }) });
  };
}

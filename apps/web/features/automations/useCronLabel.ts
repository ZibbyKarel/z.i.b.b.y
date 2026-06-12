import { useLocale, useTranslations } from "next-intl";
import { type CronDescriptor, dayName, describeCron } from "./schedule";

/**
 * Returns a formatter that turns a cron expression into a localized,
 * human-readable schedule ("Daily at 07:00", "Po–Pá v 08:00"). Keeping the
 * descriptor→string switch behind a hook lets the card and the form dialog share
 * one source of truth while each binds to the live translator + locale.
 */
export function useCronLabel(): (expr: string) => string {
  const t = useTranslations("automations");
  const locale = useLocale();

  return (expr: string): string => format(describeCron(expr), t, locale);
}

function format(
  desc: CronDescriptor,
  t: ReturnType<typeof useTranslations<"automations">>,
  locale: string,
): string {
  switch (desc.kind) {
    case "everyMinute":
      return t("cron.everyMinute");
    case "everyMinutes":
      return t("cron.everyMinutes", { n: desc.n });
    case "hourly":
      return t("cron.hourly");
    case "hourlyAt":
      return t("cron.hourlyAt", { minute: String(desc.minute).padStart(2, "0") });
    case "everyHours":
      return t("cron.everyHours", { n: desc.n });
    case "daily":
      return t("cron.daily", { time: desc.time });
    case "weekdays":
      return t("cron.weekdays", { time: desc.time });
    case "weekends":
      return t("cron.weekends", { time: desc.time });
    case "weekday":
      return t("cron.weekday", { day: dayName(desc.day, locale), time: desc.time });
    case "days":
      return t("cron.days", {
        days: desc.days.map((day) => dayName(day, locale)).join(", "),
        time: desc.time,
      });
    case "monthly":
      return t("cron.monthly", { day: desc.day, time: desc.time });
    case "raw":
      return desc.expr;
  }
}

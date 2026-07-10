"use client";

import { useLocale, useTranslations } from "next-intl";
import {
  ScheduleField,
  type SchedulePickerLabels,
  SegmentPickerField,
  SelectField,
} from "@zibby/design-system";
import { AUTOMATION_EVENTS, type AutomationEvent, type Trigger } from "@zibby/contracts";
import { dayName, dayNameShort } from "../schedule";
import { useCronLabel } from "../useCronLabel";
import type { AutomationFormState } from "./AutomationFormFields";

type TriggerType = Trigger["type"];

export interface TriggerFieldsProps {
  form: AutomationFormState;
  /**
   * A system automation locks the trigger KIND (cron vs event) — only the
   * schedule/events within it may change. Mirrors `AutomationFormFields`'s own
   * gate (the target/name/prompt half stays server-owned in that same case).
   */
  isSystem?: boolean;
}

/**
 * The trigger/schedule half of the automation form (N4f): the cron-or-event
 * toggle (locked for a system automation) plus the matching `ScheduleField` /
 * multi `SelectField`. Extracted from `AutomationFormFields` (Phase 116d) so
 * the CommandLine-driven create dialog can render just this half, without the
 * target/name/prompt UI it no longer needs — that leftover UI is trimmed from
 * `AutomationFormFields` itself in a follow-up phase once the detail page's
 * edit surface is redesigned to match.
 */
export function TriggerFields({ form, isSystem = false }: TriggerFieldsProps) {
  const t = useTranslations("automations");
  const locale = useLocale();
  const cronLabel = useCronLabel();

  // The closed event catalog → multi-select options (the value IS the label: these are
  // self-descriptive signal ids the operator picks from, not free text).
  const eventOptions = AUTOMATION_EVENTS.map((e) => ({ value: e, label: e }));

  // Friendly-picker strings, localized. Weekday names come from the cron helper
  // (0 = Sunday) so the UI and the scheduler agree on the index.
  const scheduleLabels: Partial<SchedulePickerLabels> = {
    repeat: {
      weekly: t("schedule.weekly"),
      monthly: t("schedule.monthly"),
    },
    weekdays: Array.from({ length: 7 }, (_, d) =>
      dayName(d, locale),
    ) as SchedulePickerLabels["weekdays"],
    weekdaysShort: Array.from({ length: 7 }, (_, d) =>
      dayNameShort(d, locale),
    ) as SchedulePickerLabels["weekdaysShort"],
    weekdaysLabel: t("schedule.weekdaysLabel"),
    monthDayLabel: t("schedule.monthDayLabel"),
    timeLabel: t("schedule.timeLabel"),
    formatMonthDay: (day) => t("schedule.dayOfMonth", { day }),
  };

  return (
    <>
      {!isSystem && (
        <SegmentPickerField
          label={t("triggerLabel")}
          onValueChange={(v) => form.setTriggerType(v as TriggerType)}
          options={[
            { value: "cron", label: t("triggerCron") },
            { value: "event", label: t("triggerEvent") },
          ]}
          value={form.triggerType}
        />
      )}
      {form.triggerType === "cron" ? (
        <ScheduleField
          hint={cronLabel(form.expr)}
          label={t("cronLabel")}
          labels={scheduleLabels}
          onValueChange={form.setSchedule}
          value={form.schedule}
        />
      ) : (
        <SelectField<AutomationEvent>
          multi
          hint={t("eventHint")}
          label={t("eventLabel")}
          onValueChange={form.setEvents}
          options={eventOptions}
          placeholder={t("eventPlaceholder")}
          removeLabel={t("eventRemove")}
          value={form.events}
        />
      )}
    </>
  );
}

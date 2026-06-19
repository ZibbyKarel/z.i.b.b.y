import { SegmentPickerField } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { type SchedulePreset, clockLabel, resolveScheduledAt, whenLabel } from "../task";

export interface ScheduleFieldProps {
  value: SchedulePreset;
  onChange: (preset: SchedulePreset) => void;
  /** The limits' reset time (epoch ms) — gates the "when limits reset" option. */
  resetsAt: number | null;
  /** "Now" reference used to resolve presets and format the hint. */
  now: number;
}

/**
 * The delayed-start chooser: a segmented picker over the three presets (Now /
 * In 1 h / When limits reset). The limit-reset option only appears when a future
 * reset time is known; a hint below echoes the resolved run time for a deferred
 * choice so the user sees exactly when the task will fire.
 */
export function ScheduleField({ value, onChange, resetsAt, now }: ScheduleFieldProps) {
  const t = useTranslations("tasks.schedule");

  const options = [
    { value: "now", label: t("now") },
    { value: "in-1h", label: t("in1h") },
    ...(resetsAt !== null && resetsAt > now
      ? [
          {
            value: "limit-reset",
            label: t("limitReset", { time: clockLabel(resetsAt) }),
          },
        ]
      : []),
  ];

  const scheduledAt = resolveScheduledAt(value, now, resetsAt);
  const hint =
    scheduledAt !== null ? t("willRun", { when: whenLabel(scheduledAt, now) }) : undefined;

  return (
    <SegmentPickerField
      hint={hint}
      label={t("label")}
      onValueChange={(v) => onChange(v as SchedulePreset)}
      options={options}
      value={value}
    />
  );
}

import { cn } from "../../../utils/cn";
import { focusRing } from "../../../utils/focus";
import { ButtonGroup } from "../../ButtonGroup/ButtonGroup";
import { Container } from "../../Container/Container";
import { Dropdown, type DropdownOption } from "../../Dropdown/Dropdown";
import { Stack } from "../../Stack/Stack";
import { fieldControlClass } from "../Field";

export enum SchedulePickerTestId {
  Root = "schedule-picker-root",
  Repeat = "schedule-picker-repeat",
  /** The weekday toggle group (weekly only). */
  Weekdays = "schedule-picker-weekdays",
  /** Each weekday toggle, suffixed with its index, e.g. `schedule-picker-weekday-1`. */
  Weekday = "schedule-picker-weekday",
  MonthDay = "schedule-picker-monthday",
  Time = "schedule-picker-time",
}

/** How a schedule recurs — the two cadences the picker exposes. */
export type ScheduleRepeat = "weekly" | "monthly";

/** Repeat segments, in display order. */
const REPEATS: ReadonlyArray<ScheduleRepeat> = ["weekly", "monthly"];

/**
 * Weekday indices in Monday-first display order. Values are cron day-of-week
 * indices (`0` = Sunday) so the UI and a cron consumer agree on the number.
 */
const WEEKDAY_ORDER: ReadonlyArray<number> = [1, 2, 3, 4, 5, 6, 0];

/**
 * A recurring schedule expressed in human terms rather than cron syntax. The
 * picker is format-neutral — the consumer maps this to/from cron (or anything
 * else). `weekdays` only matters for `weekly` (a multi-select set of days),
 * `monthDay` only for `monthly`; both are carried regardless so switching the
 * repeat cadence never loses the user's pick.
 */
export interface Schedule {
  repeat: ScheduleRepeat;
  /** Time of day as `"HH:MM"` (24-hour). */
  time: string;
  /** Selected days of week, each `0`–`6` with `0` = Sunday. Used when `repeat` is `"weekly"`. */
  weekdays: number[];
  /** Day of month, `1`–`31`. Used when `repeat` is `"monthly"`. */
  monthDay: number;
}

/** All user-facing strings — English defaults; pass overrides for i18n. */
export interface SchedulePickerLabels {
  /** Segment labels per repeat cadence. */
  repeat: Record<ScheduleRepeat, string>;
  /** Full weekday names, index `0` = Sunday — the accessible name of each toggle. */
  weekdays: [string, string, string, string, string, string, string];
  /** Short weekday names, index `0` = Sunday — the visible toggle label. */
  weekdaysShort: [string, string, string, string, string, string, string];
  /** Accessible label for the weekday toggle group. */
  weekdaysLabel: string;
  /** Accessible label for the day-of-month selector. */
  monthDayLabel: string;
  /** Accessible label for the time input. */
  timeLabel: string;
  /** Formats a day-of-month (1–31) into its option label. */
  formatMonthDay: (day: number) => string;
}

const DEFAULT_LABELS: SchedulePickerLabels = {
  repeat: {
    weekly: "Weekly",
    monthly: "Monthly",
  },
  weekdays: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
  weekdaysShort: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  weekdaysLabel: "Days of week",
  monthDayLabel: "Day of month",
  timeLabel: "Time of day",
  formatMonthDay: (day) => String(day),
};

export interface SchedulePickerProps {
  value: Schedule;
  onValueChange: (value: Schedule) => void;
  /** Override any subset of the default English strings. */
  labels?: Partial<SchedulePickerLabels>;
  /** Id of an external label element (wired by `Field`). */
  ariaLabelledby?: string;
  /** Id of an external description/error element (wired by `Field`). */
  ariaDescribedby?: string;
  /** Paints the time control with the danger ring (wired by `Field`). */
  invalid?: boolean;
}

const timeInputClass = cn(
  fieldControlClass,
  "w-auto cursor-pointer dark:[color-scheme:dark]",
);

const dayToggleClass =
  "inline-flex h-9 min-w-9 items-center justify-center rounded border px-2 " +
  "font-mono text-sm font-semibold transition-colors";
const dayToggleActive = "border-accent bg-accent text-accent-contrast";
const dayToggleIdle =
  "border-border bg-background text-foreground-dim hover:text-foreground";

/**
 * Human-friendly recurring-schedule chooser: a weekly/monthly repeat control,
 * plus the dimension that cadence needs — a multi-select of weekdays for
 * `weekly` (toggle any combination, or all seven), a day-of-month for `monthly`
 * — and a time-of-day input. Emits a structured {@link Schedule}; the consumer
 * translates it to cron or any other format.
 *
 * Reach for `ScheduleField` in forms — it adds the label/hint/error chrome.
 */
export function SchedulePicker({
  value,
  onValueChange,
  labels,
  ariaLabelledby,
  ariaDescribedby,
  invalid = false,
}: SchedulePickerProps) {
  const l = { ...DEFAULT_LABELS, ...labels };

  const set = (patch: Partial<Schedule>) => onValueChange({ ...value, ...patch });

  const toggleWeekday = (day: number) => {
    const has = value.weekdays.includes(day);
    const next = has
      ? value.weekdays.filter((d) => d !== day)
      : [...value.weekdays, day];
    next.sort((a, b) => a - b);
    set({ weekdays: next });
  };

  const monthDayOptions: DropdownOption[] = Array.from({ length: 31 }, (_, i) => ({
    value: String(i + 1),
    label: l.formatMonthDay(i + 1),
  }));

  return (
    <Stack
      aria-describedby={ariaDescribedby}
      aria-labelledby={ariaLabelledby}
      data-testid={SchedulePickerTestId.Root}
      gap="100"
      role="group"
    >
      <Container data-testid={SchedulePickerTestId.Repeat}>
        <ButtonGroup
          ariaLabel="Repeat"
          onChange={(id) => set({ repeat: id as ScheduleRepeat })}
          options={REPEATS.map((r) => ({ id: r, label: l.repeat[r] }))}
          value={value.repeat}
        />
      </Container>

      {value.repeat === "weekly" && (
        <Stack
          wrap
          aria-label={l.weekdaysLabel}
          data-testid={SchedulePickerTestId.Weekdays}
          direction="row"
          gap="50"
          role="group"
        >
          {WEEKDAY_ORDER.map((day) => {
            const selected = value.weekdays.includes(day);
            return (
              <button
                aria-label={l.weekdays[day]}
                aria-pressed={selected}
                className={cn(
                  dayToggleClass,
                  focusRing,
                  selected ? dayToggleActive : dayToggleIdle,
                )}
                data-testid={`${SchedulePickerTestId.Weekday}-${day}`}
                key={day}
                onClick={() => toggleWeekday(day)}
                type="button"
              >
                {l.weekdaysShort[day]}
              </button>
            );
          })}
        </Stack>
      )}

      <Stack align="center" direction="row" gap="100">
        {value.repeat === "monthly" && (
          <Container grow minW0 data-testid={SchedulePickerTestId.MonthDay}>
            <Dropdown
              aria-label={l.monthDayLabel}
              invalid={invalid}
              onChange={(v) => set({ monthDay: Number(v) })}
              options={monthDayOptions}
              value={String(value.monthDay)}
              variant="field"
            />
          </Container>
        )}
        <input
          aria-describedby={ariaDescribedby}
          aria-invalid={invalid}
          aria-label={l.timeLabel}
          className={cn(timeInputClass, focusRing)}
          data-testid={SchedulePickerTestId.Time}
          onChange={(e) => set({ time: e.target.value })}
          type="time"
          value={value.time}
        />
      </Stack>
    </Stack>
  );
}

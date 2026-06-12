import { Field } from "../Field";
import {
  type Schedule,
  SchedulePicker,
  type SchedulePickerLabels,
} from "../SchedulePicker/SchedulePicker";

export interface ScheduleFieldProps {
  label: string;
  hint?: string;
  error?: string;
  value: Schedule;
  onValueChange: (value: Schedule) => void;
  /** Override any subset of the picker's default English strings. */
  labels?: Partial<SchedulePickerLabels>;
}

/**
 * Labelled schedule chooser — `Field` chrome (label, hint, error, id/aria
 * plumbing) wrapped around a {@link SchedulePicker}. Use this in forms instead
 * of a raw cron text input; the consumer maps the emitted {@link Schedule} to
 * cron when persisting.
 */
export function ScheduleField({
  label,
  hint,
  error,
  value,
  onValueChange,
  labels,
}: ScheduleFieldProps) {
  return (
    <Field error={error} hint={hint} label={label}>
      {({ labelId, describedBy, invalid }) => (
        <SchedulePicker
          ariaDescribedby={describedBy}
          ariaLabelledby={labelId}
          invalid={invalid}
          labels={labels}
          onValueChange={onValueChange}
          value={value}
        />
      )}
    </Field>
  );
}

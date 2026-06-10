import { cn } from "../../../utils/cn";
import { focusRing } from "../../../utils/focus";
import { Stack } from "../../Stack/Stack";
import { Field, type SelectOption } from "../Field";

export enum SegmentPickerFieldTestId {
  Group = "segment-picker-group",
  /** Each option button is suffixed with its `value`, e.g. `segment-picker-option-home`. */
  Option = "segment-picker-option",
}

export interface SegmentPickerFieldProps {
  label: string;
  hint?: string;
  error?: string;
  value: string;
  options: SelectOption[];
  onValueChange: (value: string) => void;
}

/** Labelled segmented chooser — a row of mutually exclusive chip buttons. */
export function SegmentPickerField({
  label,
  hint,
  error,
  value,
  options,
  onValueChange,
}: SegmentPickerFieldProps) {
  return (
    <Field error={error} hint={hint} label={label}>
      {({ labelId, describedBy }) => (
        <Stack
          wrap
          aria-describedby={describedBy}
          aria-labelledby={labelId}
          data-testid={SegmentPickerFieldTestId.Group}
          direction="row"
          gap="75"
          role="radiogroup"
        >
          {options.map((o) => {
            const on = o.value === value;
            return (
              <button
                aria-checked={on}
                className={cn(
                  "rounded-sm border px-3 py-1.5 font-mono text-sm transition-colors",
                  focusRing,
                  on
                    ? "border-accent bg-accent text-accent-contrast"
                    : "border-border bg-transparent text-foreground-dim hover:text-foreground",
                )}
                data-testid={`${SegmentPickerFieldTestId.Option}-${o.value}`}
                key={o.value}
                onClick={() => onValueChange(o.value)}
                role="radio"
                type="button"
              >
                {o.label}
              </button>
            );
          })}
        </Stack>
      )}
    </Field>
  );
}

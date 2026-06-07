import { cn } from "../../../utils/cn";
import { Stack } from "../../Stack/Stack";
import { Field, type SelectOption } from "../Field";

export enum SegmentPickerTestId {
  Group = "segment-picker-group",
  /** Each option button is suffixed with its `value`, e.g. `segment-picker-option-home`. */
  Option = "segment-picker-option",
}

export interface SegmentPickerProps {
  label: string;
  hint?: string;
  error?: string;
  value: string;
  options: SelectOption[];
  onValueChange: (value: string) => void;
}

/** Labelled segmented chooser — a row of mutually exclusive chip buttons. */
export function SegmentPicker({
  label,
  hint,
  error,
  value,
  options,
  onValueChange,
}: SegmentPickerProps) {
  return (
    <Field error={error} hint={hint} label={label}>
      {({ labelId, describedBy }) => (
        <Stack
          wrap
          aria-describedby={describedBy}
          aria-labelledby={labelId}
          data-testid={SegmentPickerTestId.Group}
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
                  "rounded-sm border px-3 py-1.5 font-mono text-sm outline-none transition-colors",
                  "focus-visible:ring-2 focus-visible:ring-accent",
                  on
                    ? "border-accent bg-accent text-accent-contrast"
                    : "border-border bg-transparent text-foreground-dim hover:text-foreground",
                )}
                data-testid={`${SegmentPickerTestId.Option}-${o.value}`}
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

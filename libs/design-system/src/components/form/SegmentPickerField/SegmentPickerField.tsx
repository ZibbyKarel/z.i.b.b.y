import { ButtonGroup } from "../../ButtonGroup/ButtonGroup";
import { Field, type SelectOption } from "../Field";

export interface SegmentPickerFieldProps {
  label: string;
  hint?: string;
  error?: string;
  value: string;
  options: SelectOption[];
  onValueChange: (value: string) => void;
}

/** Labelled segmented chooser — a `Field` wrapping a single-select `ButtonGroup`. */
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
        <ButtonGroup
          ariaDescribedby={describedBy}
          ariaLabelledby={labelId}
          onChange={onValueChange}
          options={options.map((o) => ({ id: o.value, label: o.label }))}
          value={value}
        />
      )}
    </Field>
  );
}

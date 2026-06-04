import { Dropdown, type DropdownOption } from "../Dropdown/Dropdown";
import { Field } from "./Field";

export interface SelectProps<T extends string = string> {
  label: string;
  hint?: string;
  error?: string;
  value: T;
  options: DropdownOption<T>[];
  onValueChange: (value: T) => void;
}

/**
 * Labelled select — `Field` chrome (label, hint, error, id/aria plumbing) wrapped
 * around a `field`-variant `Dropdown`. Use this for forms; reach for the bare
 * `Dropdown` only for compact, unlabelled toolbar selectors.
 */
export function Select<T extends string = string>({
  label,
  hint,
  error,
  value,
  options,
  onValueChange,
}: SelectProps<T>) {
  return (
    <Field error={error} hint={hint} label={label}>
      {({ id, describedBy, invalid }) => (
        <Dropdown
          aria-describedby={describedBy}
          id={id}
          invalid={invalid}
          onChange={onValueChange}
          options={options}
          value={value}
          variant="field"
        />
      )}
    </Field>
  );
}

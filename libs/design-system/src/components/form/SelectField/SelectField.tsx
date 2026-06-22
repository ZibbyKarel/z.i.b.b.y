import { Dropdown, type DropdownOption } from "../../Dropdown/Dropdown";
import { Field } from "../Field";

interface SelectFieldBaseProps<T extends string = string> {
  label: string;
  hint?: string;
  error?: string;
  options: DropdownOption<T>[];
}

export interface SelectFieldSingleProps<T extends string = string>
  extends SelectFieldBaseProps<T> {
  multi?: false;
  value: T;
  onValueChange: (value: T) => void;
}

export interface SelectFieldMultiProps<T extends string = string> extends SelectFieldBaseProps<T> {
  /** Pick-many mode — options carry checkboxes and selections render as removable chips. */
  multi: true;
  value: T[];
  onValueChange: (value: T[]) => void;
  /** Shown in the control when nothing is selected. */
  placeholder?: string;
  /** Accessible name for each selected chip's remove button. */
  removeLabel?: string;
  /** Render a leading "select all" row that toggles every option at once. */
  showSelectAll?: boolean;
  /** Label for the select-all row when not everything is selected. */
  selectAllLabel?: string;
  /** Label for the select-all row when everything is already selected. */
  deselectAllLabel?: string;
}

export type SelectFieldProps<T extends string = string> =
  | SelectFieldSingleProps<T>
  | SelectFieldMultiProps<T>;

/**
 * Labelled select — `Field` chrome (label, hint, error, id/aria plumbing) wrapped
 * around a `field`-variant `Dropdown`. Use this for forms; reach for the bare
 * `Dropdown` only for compact, unlabelled toolbar selectors. Pass `multi` for a
 * checkbox/chip pick-many control.
 */
export function SelectField<T extends string = string>(props: SelectFieldProps<T>) {
  const { label, hint, error, options } = props;
  return (
    <Field error={error} hint={hint} label={label}>
      {({ id, describedBy, invalid }) =>
        props.multi ? (
          <Dropdown<T>
            multi
            // A `<label htmlFor>` only names labelable form elements; the multi
            // trigger is a combobox `<div>`, so name it directly from the label.
            aria-describedby={describedBy}
            aria-label={label}
            deselectAllLabel={props.deselectAllLabel}
            id={id}
            invalid={invalid}
            onChange={props.onValueChange}
            options={options}
            placeholder={props.placeholder}
            removeLabel={props.removeLabel}
            selectAllLabel={props.selectAllLabel}
            showSelectAll={props.showSelectAll}
            value={props.value}
            variant="field"
          />
        ) : (
          <Dropdown<T>
            aria-describedby={describedBy}
            id={id}
            invalid={invalid}
            onChange={props.onValueChange}
            options={options}
            value={props.value}
            variant="field"
          />
        )
      }
    </Field>
  );
}

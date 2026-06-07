import type { Ref } from "react";
import { Toggle, type ToggleSize } from "../../Toggle/Toggle";
import { Field } from "../Field";

export enum ToggleFieldTestId {
  Control = "toggle-control",
}

export interface ToggleFieldProps {
  label: string;
  hint?: string;
  error?: string;
  /** Controlled on/off state. */
  checked: boolean;
  /** Fired with the next state when the user toggles. */
  onChange: (next: boolean) => void;
  size?: ToggleSize;
  disabled?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

/**
 * Labelled on/off control. Lays the `Toggle` on the left with its label (and
 * optional hint/error) to the right — the row layout every checkbox-like field
 * shares.
 */
export function ToggleField({
  label,
  hint,
  error,
  checked,
  onChange,
  size,
  disabled,
  ref,
}: ToggleFieldProps) {
  return (
    <Field error={error} hint={hint} label={label} layout="row">
      {({ id, describedBy, invalid }) => (
        <Toggle
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          checked={checked}
          data-testid={ToggleFieldTestId.Control}
          disabled={disabled}
          id={id}
          label={label}
          onChange={onChange}
          ref={ref}
          size={size}
        />
      )}
    </Field>
  );
}

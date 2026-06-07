import type { Ref } from "react";
import { Switch, type SwitchSize } from "../../Switch/Switch";
import { Field } from "../Field";

export enum ToggleTestId {
  Control = "toggle-control",
}

export interface ToggleProps {
  label: string;
  hint?: string;
  error?: string;
  /** Controlled on/off state. */
  checked: boolean;
  /** Fired with the next state when the user toggles. */
  onChange: (next: boolean) => void;
  size?: SwitchSize;
  disabled?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

/**
 * Labelled on/off control. Lays the `Switch` on the left with its label (and
 * optional hint/error) to the right — the row layout every checkbox-like field
 * shares.
 */
export function Toggle({
  label,
  hint,
  error,
  checked,
  onChange,
  size,
  disabled,
  ref,
}: ToggleProps) {
  return (
    <Field error={error} hint={hint} label={label} layout="row">
      {({ id, describedBy, invalid }) => (
        <Switch
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          checked={checked}
          data-testid={ToggleTestId.Control}
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

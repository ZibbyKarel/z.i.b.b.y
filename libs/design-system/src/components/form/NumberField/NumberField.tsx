import type { InputHTMLAttributes, Ref } from "react";
import { Field, fieldControlClass } from "../Field";

export enum NumberFieldTestId {
  Control = "number-field-control",
  /** The component renders a single node (the control itself) — `Root` aliases
   *  `Control` so every field component's enum has a `Root` to select on. */
  Root = Control,
}

export interface NumberFieldProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "id" | "className" | "type" | "value" | "onChange"
> {
  label: string;
  hint?: string;
  error?: string;
  /** Current value, or `null` when the field is empty. */
  value: number | null;
  /** Fires with the parsed number, or `null` when the field is cleared. */
  onValueChange?: (value: number | null) => void;
  ref?: Ref<HTMLInputElement>;
}

/**
 * Labelled numeric input. A thin wrapper over {@link Field} + a native
 * `type="number"` control that parses the value to a `number` (or `null` when empty)
 * so call-sites never re-implement the `Number.parseInt`/empty-string dance. Pass
 * `min`/`max`/`step` straight through.
 */
export function NumberField({
  label,
  hint,
  error,
  value,
  onValueChange,
  ref,
  ...props
}: NumberFieldProps) {
  return (
    <Field error={error} hint={hint} label={label}>
      {({ id, describedBy, invalid }) => (
        <input
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          className={fieldControlClass}
          data-testid={NumberFieldTestId.Control}
          id={id}
          inputMode="numeric"
          onChange={(e) => {
            const next = e.target.value;
            onValueChange?.(next === "" ? null : Number(next));
          }}
          ref={ref}
          type="number"
          value={value ?? ""}
          {...props}
        />
      )}
    </Field>
  );
}

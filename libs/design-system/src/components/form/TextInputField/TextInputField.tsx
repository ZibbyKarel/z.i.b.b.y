import type { InputHTMLAttributes, Ref } from "react";
import { Field, fieldControlClass } from "../Field";

export enum TextInputFieldTestId {
  Control = "text-input-control",
}

export interface TextInputFieldProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "id" | "className"
> {
  label: string;
  hint?: string;
  error?: string;
  ref?: Ref<HTMLInputElement>;
}

/** Labelled single-line text input. */
export function TextInputField({
  label,
  hint,
  error,
  ref,
  ...props
}: TextInputFieldProps) {
  return (
    <Field error={error} hint={hint} label={label}>
      {({ id, describedBy, invalid }) => (
        <input
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          className={fieldControlClass}
          data-testid={TextInputFieldTestId.Control}
          id={id}
          ref={ref}
          {...props}
        />
      )}
    </Field>
  );
}

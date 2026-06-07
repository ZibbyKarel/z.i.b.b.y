import type { InputHTMLAttributes, Ref } from "react";
import { Field, fieldControlClass } from "../Field";

export enum TextInputTestId {
  Control = "text-input-control",
}

export interface TextInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "id" | "className"
> {
  label: string;
  hint?: string;
  error?: string;
  ref?: Ref<HTMLInputElement>;
}

/** Labelled single-line text input. */
export function TextInput({
  label,
  hint,
  error,
  ref,
  ...props
}: TextInputProps) {
  return (
    <Field error={error} hint={hint} label={label}>
      {({ id, describedBy, invalid }) => (
        <input
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          className={fieldControlClass}
          data-testid={TextInputTestId.Control}
          id={id}
          ref={ref}
          {...props}
        />
      )}
    </Field>
  );
}

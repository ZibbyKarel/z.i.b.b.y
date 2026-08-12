import type { Ref, TextareaHTMLAttributes } from "react";
import { cn } from "../../../utils/cn";
import { Field, fieldControlClass } from "../Field";

export enum TextAreaFieldTestId {
  Control = "text-area-control",
  /** The component renders a single node (the control itself) — `Root` aliases
   *  `Control` so every field component's enum has a `Root` to select on. */
  Root = Control,
}

export interface TextAreaFieldProps extends Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  "id" | "className"
> {
  label: string;
  hint?: string;
  error?: string;
  ref?: Ref<HTMLTextAreaElement>;
}

/** Labelled multi-line text input. */
export function TextAreaField({ label, hint, error, ref, ...props }: TextAreaFieldProps) {
  return (
    <Field error={error} hint={hint} label={label}>
      {({ id, describedBy, invalid }) => (
        <textarea
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          className={cn(fieldControlClass, "min-h-20 resize-y leading-relaxed")}
          data-testid={TextAreaFieldTestId.Control}
          id={id}
          ref={ref}
          {...props}
        />
      )}
    </Field>
  );
}

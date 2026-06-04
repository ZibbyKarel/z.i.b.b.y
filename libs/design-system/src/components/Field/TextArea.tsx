import type { Ref, TextareaHTMLAttributes } from "react";
import { cn } from "../../utils/cn";
import { Field, fieldControlClass } from "./Field";

export enum TextAreaTestId {
  Control = "text-area-control",
}

export interface TextAreaProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id" | "className"> {
  label: string;
  hint?: string;
  error?: string;
  ref?: Ref<HTMLTextAreaElement>;
}

/** Labelled multi-line text input. */
export function TextArea({ label, hint, error, ref, ...props }: TextAreaProps) {
  return (
    <Field error={error} hint={hint} label={label}>
      {({ id, describedBy, invalid }) => (
        <textarea
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          className={cn(fieldControlClass, "min-h-20 resize-y leading-relaxed")}
          data-testid={TextAreaTestId.Control}
          id={id}
          ref={ref}
          {...props}
        />
      )}
    </Field>
  );
}

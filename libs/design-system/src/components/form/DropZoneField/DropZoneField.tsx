import { DropZone, type DropZoneProps } from "../../DropZone/DropZone";
import { Field } from "../Field";

export interface DropZoneFieldProps extends Omit<
  DropZoneProps,
  "invalid" | "aria-labelledby" | "aria-describedby"
> {
  label: string;
  hint?: string;
  error?: string;
}

/**
 * Labelled drop zone. `Field` provides the label, hint, and error chrome;
 * `DropZone` handles the drag-and-drop interaction. The label is wired via
 * `aria-labelledby` (not `htmlFor`) because the drop target is a `<div>`, not
 * a labelable form control.
 */
export function DropZoneField({ label, hint, error, ...dropZoneProps }: DropZoneFieldProps) {
  return (
    <Field error={error} hint={hint} label={label}>
      {({ labelId, describedBy, invalid }) => (
        <DropZone
          {...dropZoneProps}
          aria-describedby={describedBy}
          aria-labelledby={labelId}
          invalid={invalid}
        />
      )}
    </Field>
  );
}

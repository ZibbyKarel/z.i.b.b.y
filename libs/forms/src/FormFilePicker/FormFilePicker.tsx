import type { Ref } from "react";
import { type FieldValues, type Path, useController } from "react-hook-form";
import { FilePickerField, type FilePickerFieldProps } from "@zibby/design-system";

export interface FormFilePickerProps<TFieldValues extends FieldValues = FieldValues> extends Omit<
  FilePickerFieldProps,
  "onChange" | "ref"
> {
  name: Path<TFieldValues>;
}

export function FormFilePicker<TFieldValues extends FieldValues = FieldValues>({
  name,
  error,
  hint,
  ...props
}: FormFilePickerProps<TFieldValues>) {
  const { field, fieldState } = useController<TFieldValues>({
    name,
    defaultValue: [] as File[] as never,
  });
  return (
    <FilePickerField
      {...props}
      error={fieldState.error?.message ?? error}
      hint={hint}
      onChange={(e) => field.onChange(Array.from(e.target.files ?? []))}
      ref={field.ref as unknown as Ref<HTMLInputElement>}
    />
  );
}

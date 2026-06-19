import { type FieldValues, type Path, useController } from "react-hook-form";
import { DropZoneField, type DropZoneFieldProps } from "@zibby/design-system";

export interface FormDropZoneProps<TFieldValues extends FieldValues = FieldValues> extends Omit<
  DropZoneFieldProps,
  "onDrop"
> {
  name: Path<TFieldValues>;
}

export function FormDropZone<TFieldValues extends FieldValues = FieldValues>({
  name,
  error,
  hint,
  ...props
}: FormDropZoneProps<TFieldValues>) {
  const { field, fieldState } = useController<TFieldValues>({
    name,
    defaultValue: [] as File[] as never,
  });
  return (
    <DropZoneField
      {...props}
      error={fieldState.error?.message ?? error}
      hint={hint}
      onDrop={(files) => field.onChange(files)}
    />
  );
}

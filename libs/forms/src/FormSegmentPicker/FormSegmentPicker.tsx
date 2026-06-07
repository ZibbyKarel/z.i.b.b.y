import { type FieldValues, type Path, useController } from "react-hook-form"
import { SegmentPickerField, type SegmentPickerFieldProps } from "@zibby/design-system"

export interface FormSegmentPickerProps<TFieldValues extends FieldValues = FieldValues>
  extends Omit<SegmentPickerFieldProps, "value" | "onValueChange"> {
  name: Path<TFieldValues>
  defaultValue?: string
}

export function FormSegmentPicker<TFieldValues extends FieldValues = FieldValues>({
  name,
  error,
  hint,
  defaultValue,
  ...props
}: FormSegmentPickerProps<TFieldValues>) {
  const { field, fieldState } = useController<TFieldValues>({
    name,
    defaultValue: (defaultValue ?? "") as never,
  })
  return (
    <SegmentPickerField
      {...props}
      error={fieldState.error?.message ?? error}
      hint={hint}
      onValueChange={(val) => field.onChange(val)}
      value={(field.value ?? "") as string}
    />
  )
}

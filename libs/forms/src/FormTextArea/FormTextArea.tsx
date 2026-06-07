import type { Ref } from "react"
import { type FieldValues, type Path, useController } from "react-hook-form"
import { TextAreaField, type TextAreaFieldProps } from "@zibby/design-system"

export interface FormTextAreaProps<TFieldValues extends FieldValues = FieldValues>
  extends Omit<TextAreaFieldProps, "value" | "onChange" | "onBlur" | "defaultValue" | "name" | "ref"> {
  name: Path<TFieldValues>
  defaultValue?: string
}

export function FormTextArea<TFieldValues extends FieldValues = FieldValues>({
  name,
  error,
  hint,
  defaultValue,
  ...props
}: FormTextAreaProps<TFieldValues>) {
  const { field, fieldState } = useController<TFieldValues>({
    name,
    defaultValue: (defaultValue ?? "") as never,
  })
  return (
    <TextAreaField
      {...props}
      error={fieldState.error?.message ?? error}
      hint={hint}
      name={field.name}
      onBlur={field.onBlur}
      onChange={field.onChange}
      ref={field.ref as unknown as Ref<HTMLTextAreaElement>}
      value={(field.value ?? "") as string}
    />
  )
}

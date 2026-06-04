import type { Ref } from "react"
import { type FieldValues, type Path, useController } from "react-hook-form"
import { TextInput, type TextInputProps } from "@zibby/design-system"

export interface FormTextInputProps<TFieldValues extends FieldValues = FieldValues>
  extends Omit<TextInputProps, "value" | "onChange" | "onBlur" | "defaultValue" | "name" | "ref"> {
  name: Path<TFieldValues>
  defaultValue?: string
}

export function FormTextInput<TFieldValues extends FieldValues = FieldValues>({
  name,
  error,
  hint,
  defaultValue,
  ...props
}: FormTextInputProps<TFieldValues>) {
  const { field, fieldState } = useController<TFieldValues>({
    name,
    defaultValue: (defaultValue ?? "") as never,
  })
  return (
    <TextInput
      {...props}
      error={fieldState.error?.message ?? error}
      hint={hint}
      name={field.name}
      onBlur={field.onBlur}
      onChange={field.onChange}
      ref={field.ref as unknown as Ref<HTMLInputElement>}
      value={(field.value ?? "") as string}
    />
  )
}

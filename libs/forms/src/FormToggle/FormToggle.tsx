import type { Ref } from "react"
import { type FieldValues, type Path, useController } from "react-hook-form"
import { Toggle, type ToggleProps } from "@zibby/design-system"

export interface FormToggleProps<TFieldValues extends FieldValues = FieldValues>
  extends Omit<ToggleProps, "checked" | "onChange" | "ref"> {
  name: Path<TFieldValues>
  defaultValue?: boolean
}

export function FormToggle<TFieldValues extends FieldValues = FieldValues>({
  name,
  error,
  hint,
  defaultValue,
  ...props
}: FormToggleProps<TFieldValues>) {
  const { field, fieldState } = useController<TFieldValues>({
    name,
    defaultValue: (defaultValue ?? false) as never,
  })
  return (
    <Toggle
      {...props}
      checked={Boolean(field.value)}
      error={fieldState.error?.message ?? error}
      hint={hint}
      onChange={(next) => field.onChange(next)}
      ref={field.ref as unknown as Ref<HTMLButtonElement>}
    />
  )
}

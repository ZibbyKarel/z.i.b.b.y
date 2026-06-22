import { type FieldValues, type Path, useController } from "react-hook-form";
import { SelectField, type SelectFieldSingleProps } from "@zibby/design-system";

export interface FormSelectProps<
  T extends string = string,
  TFieldValues extends FieldValues = FieldValues,
> extends Omit<SelectFieldSingleProps<T>, "value" | "onValueChange" | "multi"> {
  name: Path<TFieldValues>;
  defaultValue?: T;
}

export function FormSelect<
  T extends string = string,
  TFieldValues extends FieldValues = FieldValues,
>({ name, error, hint, defaultValue, ...props }: FormSelectProps<T, TFieldValues>) {
  const { field, fieldState } = useController<TFieldValues>({
    name,
    defaultValue: (defaultValue ?? "") as never,
  });
  return (
    <SelectField<T>
      {...props}
      error={fieldState.error?.message ?? error}
      hint={hint}
      onValueChange={(val) => field.onChange(val)}
      value={(field.value ?? "") as T}
    />
  );
}

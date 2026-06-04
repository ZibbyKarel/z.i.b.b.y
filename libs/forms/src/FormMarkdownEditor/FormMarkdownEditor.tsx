import { type FieldValues, type Path, useController } from "react-hook-form"
import { MarkdownEditor, type MarkdownEditorProps } from "@zibby/design-system"

export interface FormMarkdownEditorProps<TFieldValues extends FieldValues = FieldValues>
  extends Omit<MarkdownEditorProps, "value" | "onChange"> {
  name: Path<TFieldValues>
  defaultValue?: string
}

export function FormMarkdownEditor<TFieldValues extends FieldValues = FieldValues>({
  name,
  defaultValue,
  ...props
}: FormMarkdownEditorProps<TFieldValues>) {
  const { field } = useController<TFieldValues>({
    name,
    defaultValue: (defaultValue ?? "") as never,
  })
  return (
    <MarkdownEditor
      {...props}
      onChange={(val) => field.onChange(val)}
      value={(field.value ?? "") as string}
    />
  )
}

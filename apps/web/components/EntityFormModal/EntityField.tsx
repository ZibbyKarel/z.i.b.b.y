import {
  SegmentPickerField,
  SelectField,
  TextAreaField,
  TextInputField,
} from "@zibby/design-system";
import type { FieldSchema } from "./types";

interface EntityFieldProps {
  field: FieldSchema;
  value: string;
  onChange: (name: string, value: string) => void;
}

export function EntityField({ field, value, onChange }: EntityFieldProps) {
  if (field.kind === "textarea") {
    return (
      <TextAreaField
        hint={field.hint}
        label={field.label}
        onChange={(e) => onChange(field.name, e.target.value)}
        placeholder={field.placeholder}
        value={value}
      />
    );
  }
  if (field.kind === "select") {
    return (
      <SelectField
        hint={field.hint}
        label={field.label}
        onValueChange={(v) => onChange(field.name, v)}
        options={field.options ?? []}
        value={value}
      />
    );
  }
  if (field.kind === "segmented") {
    return (
      <SegmentPickerField
        hint={field.hint}
        label={field.label}
        onValueChange={(v) => onChange(field.name, v)}
        options={field.options ?? []}
        value={value}
      />
    );
  }
  return (
    <TextInputField
      hint={field.hint}
      label={field.label}
      onChange={(e) => onChange(field.name, e.target.value)}
      placeholder={field.placeholder}
      value={value}
    />
  );
}

import type { SelectOption } from "@zibby/design-system";

export type FieldKind = "text" | "textarea" | "select" | "segmented";

export interface FieldSchema {
  name: string;
  label: string;
  kind: FieldKind;
  placeholder?: string;
  hint?: string;
  required?: boolean;
  options?: SelectOption[];
  defaultValue?: string;
}

export type EntityFormValues = Record<string, string>;

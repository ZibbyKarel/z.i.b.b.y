"use client";
import { useMemo, useState } from "react";
import type { EntityFormValues, FieldSchema } from "./types";

function initialValues(fields: FieldSchema[]): EntityFormValues {
  const out: EntityFormValues = {};
  for (const f of fields) {
    out[f.name] = f.defaultValue ?? f.options?.[0]?.value ?? "";
  }
  return out;
}

export function useEntityForm(
  fields: FieldSchema[],
  filePreview?: (values: EntityFormValues) => string,
) {
  const [values, setValues] = useState<EntityFormValues>(() => initialValues(fields));

  const set = (name: string, value: string) => setValues((v) => ({ ...v, [name]: value }));

  const canSubmit = useMemo(
    () => fields.every((f) => !f.required || (values[f.name] ?? "").trim().length > 0),
    [fields, values],
  );

  const preview = filePreview?.(values);

  return { values, set, canSubmit, preview };
}

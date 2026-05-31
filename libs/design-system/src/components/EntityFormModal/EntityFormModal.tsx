import { useMemo, useState } from "react"
import type { IconName } from "../Icon/Icon"
import { Button } from "../Button/Button"
import {
  SegmentedField,
  SelectField,
  type SelectOption,
  TextAreaField,
  TextField,
} from "../Field/Field"
import { Icon } from "../Icon/Icon"
import { ModalShell } from "../ModalShell/ModalShell"

export type FieldKind = "text" | "textarea" | "select" | "segmented"

export interface FieldSchema {
  /** Key in the resulting values record. */
  name: string
  label: string
  kind: FieldKind
  placeholder?: string
  hint?: string
  required?: boolean
  /** For select / segmented. */
  options?: SelectOption[]
  /** Initial value. */
  defaultValue?: string
}

export type EntityFormValues = Record<string, string>

export interface EntityFormModalProps {
  /** Title, e.g. "Nový skill". */
  title: string
  subtitle?: string
  glyph: IconName
  fields: FieldSchema[]
  /** Live preview of the file path that will be created, given current values. */
  filePreview?: (values: EntityFormValues) => string
  /** Label of the submit button, e.g. "Vytvořit skill". */
  submitLabel: string
  onClose: () => void
  onSubmit: (values: EntityFormValues) => void
  widthClassName?: string
}

function initialValues(fields: FieldSchema[]): EntityFormValues {
  const out: EntityFormValues = {}
  for (const f of fields) {
    out[f.name] = f.defaultValue ?? f.options?.[0]?.value ?? ""
  }
  return out
}

/**
 * A schema-driven "create new" form modal. One component backs adding skills,
 * integrations (plugins), agents and pipelines — each just supplies its field
 * schema and a file-path preview, keeping the "files = source of truth" model
 * visible (the new file is named right in the form).
 */
export function EntityFormModal({
  title,
  subtitle,
  glyph,
  fields,
  filePreview,
  submitLabel,
  onClose,
  onSubmit,
  widthClassName = "w-[560px]",
}: EntityFormModalProps) {
  const [values, setValues] = useState<EntityFormValues>(() => initialValues(fields))

  const set = (name: string, value: string) =>
    setValues((v) => ({ ...v, [name]: value }))

  const canSubmit = useMemo(
    () => fields.every((f) => !f.required || (values[f.name] ?? "").trim().length > 0),
    [fields, values],
  )

  const preview = filePreview?.(values)

  return (
    <ModalShell
      label={title}
      glyph={glyph}
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      widthClassName={widthClassName}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (canSubmit) onSubmit(values)
        }}
        className="p-5"
      >
        <div className="flex flex-col gap-4">
          {fields.map((f) => {
            const value = values[f.name] ?? ""
            if (f.kind === "textarea") {
              return (
                <TextAreaField
                  key={f.name}
                  label={f.label}
                  hint={f.hint}
                  placeholder={f.placeholder}
                  value={value}
                  onChange={(e) => set(f.name, e.target.value)}
                />
              )
            }
            if (f.kind === "select") {
              return (
                <SelectField
                  key={f.name}
                  label={f.label}
                  hint={f.hint}
                  value={value}
                  options={f.options ?? []}
                  onValueChange={(v) => set(f.name, v)}
                />
              )
            }
            if (f.kind === "segmented") {
              return (
                <SegmentedField
                  key={f.name}
                  label={f.label}
                  hint={f.hint}
                  value={value}
                  options={f.options ?? []}
                  onValueChange={(v) => set(f.name, v)}
                />
              )
            }
            return (
              <TextField
                key={f.name}
                label={f.label}
                hint={f.hint}
                placeholder={f.placeholder}
                value={value}
                onChange={(e) => set(f.name, e.target.value)}
              />
            )
          })}
        </div>

        {preview && (
          <div className="mt-4 flex items-center gap-2 rounded border border-border bg-surface-0 px-3 py-2.5">
            <Icon name="file" size={13} className="text-foreground-faint" />
            <span className="truncate font-mono text-sm text-foreground-faint">{preview}</span>
          </div>
        )}

        <div className="mt-5 flex items-center justify-between">
          <Button intent="ghost" onClick={onClose}>
            Zrušit
          </Button>
          <Button intent="run" icon="plus" type="submit" disabled={!canSubmit}>
            {submitLabel}
          </Button>
        </div>
      </form>
    </ModalShell>
  )
}

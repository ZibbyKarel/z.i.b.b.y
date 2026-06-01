"use client";
import { useMemo, useState } from "react"
import {
  Button,
  Dialog,
  Icon,
  SegmentedField,
  SelectField,
  TextAreaField,
  TextField,
} from "@zibby/design-system"
import type { IconName, SelectOption, DialogWidth } from "@zibby/design-system"

export type FieldKind = "text" | "textarea" | "select" | "segmented"

export interface FieldSchema {
  name: string
  label: string
  kind: FieldKind
  placeholder?: string
  hint?: string
  required?: boolean
  options?: SelectOption[]
  defaultValue?: string
}

export type EntityFormValues = Record<string, string>

export interface EntityFormModalProps {
  title: string
  subtitle?: string
  glyph: IconName
  fields: FieldSchema[]
  filePreview?: (values: EntityFormValues) => string
  submitLabel: string
  onClose: () => void
  onSubmit: (values: EntityFormValues) => void
  width?: DialogWidth
}

function initialValues(fields: FieldSchema[]): EntityFormValues {
  const out: EntityFormValues = {}
  for (const f of fields) {
    out[f.name] = f.defaultValue ?? f.options?.[0]?.value ?? ""
  }
  return out
}

export function EntityFormModal({
  title,
  subtitle,
  glyph,
  fields,
  filePreview,
  submitLabel,
  onClose,
  onSubmit,
  width = "lg",
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
    <Dialog
      open={true}
      onClose={onClose}
      width={width}
      title={
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-sm border border-accent/30 bg-accent-dim text-accent">
            <Icon name={glyph} size="lg" />
          </div>
          <div>
            <div className="font-mono text-xl font-bold text-foreground">{title}</div>
            {subtitle && <div className="text-base text-foreground-dim">{subtitle}</div>}
          </div>
        </div>
      }
      actions={
        <>
          <Button intent="ghost" onClick={onClose}>Zrušit</Button>
          <Button intent="run" icon="plus" type="submit" form="entity-form" disabled={!canSubmit}>
            {submitLabel}
          </Button>
        </>
      }
    >
      <form
        id="entity-form"
        onSubmit={(e) => {
          e.preventDefault()
          if (canSubmit) onSubmit(values)
        }}
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
          <div className="mt-4 flex items-center gap-2 rounded border border-border bg-background px-3 py-2.5">
            <Icon name="file" size="sm" className="text-foreground-faint" />
            <span className="truncate font-mono text-sm text-foreground-faint">{preview}</span>
          </div>
        )}
      </form>
    </Dialog>
  )
}

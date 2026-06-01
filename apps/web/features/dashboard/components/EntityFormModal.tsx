"use client";
import { useMemo, useState } from "react"
import {
  Button,
  Card,
  Container,
  Dialog,
  Icon,
  IconTile,
  SegmentedField,
  SelectField,
  Stack,
  TextAreaField,
  TextField,
  Typography,
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
        <Stack direction="row" align="center" gap="150">
          <IconTile glyph={glyph} size="md" />
          <Container minW0>
            <Typography type="note" mono weight="bold" size="xl">{title}</Typography>
            {subtitle && (
              <Typography type="note" variant="secondary" size="base">{subtitle}</Typography>
            )}
          </Container>
        </Stack>
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
        <Stack gap="200">
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

          {preview && (
            <Card background="background" radius="sm">
              <Container padding={["150", "150"]}>
                <Stack direction="row" align="center" gap="100">
                  <Icon name="file" size="sm" tone="faint" />
                  <Container minW0>
                    <Typography type="note" mono size="sm" variant="tertiary" truncate>
                      {preview}
                    </Typography>
                  </Container>
                </Stack>
              </Container>
            </Card>
          )}
        </Stack>
      </form>
    </Dialog>
  )
}

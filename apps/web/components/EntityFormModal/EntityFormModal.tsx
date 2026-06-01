"use client";
import { useMemo, useState } from "react"
import { useTranslations } from "next-intl"
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
import type { DialogWidth, IconName, SelectOption } from "@zibby/design-system"

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
  const t = useTranslations("common")
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
      actions={
        <>
          <Button intent="ghost" onClick={onClose}>{t("cancel")}</Button>
          <Button disabled={!canSubmit} form="entity-form" icon="plus" intent="run" type="submit">
            {submitLabel}
          </Button>
        </>
      }
      onClose={onClose}
      open={true}
      title={
        <Stack align="center" direction="row" gap="150">
          <IconTile glyph={glyph} size="md" />
          <Container minW0>
            <Typography mono size="xl" type="note" weight="bold">{title}</Typography>
            {subtitle && (
              <Typography size="base" type="note" variant="secondary">{subtitle}</Typography>
            )}
          </Container>
        </Stack>
      }
      width={width}
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
                  hint={f.hint}
                  key={f.name}
                  label={f.label}
                  onChange={(e) => set(f.name, e.target.value)}
                  placeholder={f.placeholder}
                  value={value}
                />
              )
            }
            if (f.kind === "select") {
              return (
                <SelectField
                  hint={f.hint}
                  key={f.name}
                  label={f.label}
                  onValueChange={(v) => set(f.name, v)}
                  options={f.options ?? []}
                  value={value}
                />
              )
            }
            if (f.kind === "segmented") {
              return (
                <SegmentedField
                  hint={f.hint}
                  key={f.name}
                  label={f.label}
                  onValueChange={(v) => set(f.name, v)}
                  options={f.options ?? []}
                  value={value}
                />
              )
            }
            return (
              <TextField
                hint={f.hint}
                key={f.name}
                label={f.label}
                onChange={(e) => set(f.name, e.target.value)}
                placeholder={f.placeholder}
                value={value}
              />
            )
          })}

          {preview && (
            <Card background="background" radius="sm">
              <Container padding={["150", "150"]}>
                <Stack align="center" direction="row" gap="100">
                  <Icon name="file" size="sm" tone="faint" />
                  <Container minW0>
                    <Typography mono truncate size="sm" type="note" variant="tertiary">
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

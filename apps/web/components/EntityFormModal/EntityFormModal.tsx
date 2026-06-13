"use client";
import { useTranslations } from "next-intl";
import {
  Button,
  Container,
  Dialog,
  IconTile,
  Stack,
  Typography,
} from "@zibby/design-system";
import type { DialogWidth, IconName } from "@zibby/design-system";
import type { EntityFormValues, FieldSchema } from "./types";
import { useEntityForm } from "./useEntityForm";
import { EntityField } from "./EntityField";
import { FilePreview } from "./FilePreview";

export type { FieldKind, FieldSchema, EntityFormValues } from "./types";

export interface EntityFormModalProps {
  title: string;
  subtitle?: string;
  glyph: IconName;
  fields: FieldSchema[];
  filePreview?: (values: EntityFormValues) => string;
  submitLabel: string;
  onClose: () => void;
  onSubmit: (values: EntityFormValues) => void;
  width?: DialogWidth;
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
  const t = useTranslations("common");
  const { values, set, canSubmit, preview } = useEntityForm(fields, filePreview);

  return (
    <Dialog
      actions={
        <>
          <Button intent="ghost" onClick={onClose}>{t("cancel")}</Button>
          <Button disabled={!canSubmit} form="entity-form" icon="plus" intent="primary" type="submit">
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
          e.preventDefault();
          if (canSubmit) onSubmit(values);
        }}
      >
        <Stack gap="200">
          {fields.map((f) => (
            <EntityField
              field={f}
              key={f.name}
              onChange={set}
              value={values[f.name] ?? ""}
            />
          ))}
          {preview && <FilePreview preview={preview} />}
        </Stack>
      </form>
    </Dialog>
  );
}

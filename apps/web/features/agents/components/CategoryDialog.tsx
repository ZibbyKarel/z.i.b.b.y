"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  Container,
  Dialog,
  type IconName,
  IconTile,
  Stack,
  Typography,
} from "@zibby/design-system";
import { AGENT_GLYPHS } from "../../../state/config";
import { FormTextInput, useFormControls, zodResolver } from "@zibby/forms";
import { z } from "zod";

export interface CategoryDialogProps {
  existing: string[];
  pending?: boolean;
  onClose: () => void;
  onSubmit: (category: { name: string; glyph: IconName }) => void;
}

const categorySchema = z.object({ name: z.string().min(1) });
type CategoryFormValues = z.infer<typeof categorySchema>;

export function CategoryDialog({ existing, pending, onClose, onSubmit }: CategoryDialogProps) {
  const t = useTranslations("agents");
  const tk = useTranslations();
  const [glyph, setGlyph] = useState<IconName>("spark");

  const { renderForm, submit, form } = useFormControls<CategoryFormValues>({
    defaultValues: { name: "" },
    resolver: zodResolver(categorySchema),
    mode: "onChange",
    onSubmit: (values) => {
      if (pending) return;
      onSubmit({ name: values.name.trim(), glyph });
    },
  });

  const rawName = form.watch("name").trim();
  const duplicate = rawName.length > 0 && existing.includes(rawName);
  const canSubmit = form.formState.isValid && !duplicate && !pending;

  const title = (
    <Stack align="center" direction="row" gap="150">
      <IconTile glyph={glyph} size="md" />
      <Container grow minW0>
        <Typography mono size="xl" type="note" weight="bold">
          {t("categoryDialog.title")}
        </Typography>
        <Typography mono size="xs" type="note" variant="tertiary">
          {t("categoryDialog.subtitle")}
        </Typography>
      </Container>
    </Stack>
  );

  return renderForm(
    <Dialog
      open
      actions={
        <>
          <Button intent="ghost" onClick={onClose}>
            {tk("common.cancel")}
          </Button>
          <Button disabled={!canSubmit} icon="check" intent="primary" onClick={() => void submit()}>
            {t("addCategory")}
          </Button>
        </>
      }
      ariaLabel={t("categoryDialog.title")}
      closeLabel={tk("common.close")}
      onClose={onClose}
      title={title}
      width="sm"
    >
      <Stack gap="200">
        <FormTextInput<CategoryFormValues>
          autoFocus
          error={duplicate ? t("categoryDialog.duplicate", { name: rawName }) : undefined}
          label={t("categoryDialog.nameLabel")}
          name="name"
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
          }}
          placeholder={t("categoryDialog.namePlaceholder")}
        />

        <Stack gap="75">
          <Typography mono size="sm" type="note" variant="secondary">
            {t("categoryDialog.glyphLabel")}
          </Typography>
          <Stack wrap direction="row" gap="75">
            {AGENT_GLYPHS.map((g) => (
              <IconTile
                interactive
                aria-label={g}
                aria-pressed={glyph === g}
                as="button"
                glyph={g}
                key={g}
                onClick={() => setGlyph(g)}
                radius="default"
                size="sm"
                tone={glyph === g ? "accent" : "neutral"}
              />
            ))}
          </Stack>
        </Stack>
      </Stack>
    </Dialog>,
  );
}

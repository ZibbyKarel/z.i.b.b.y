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
import { AGENT_GLYPHS } from "../../state/config";
import { FormTextInput, useFormControls, zodResolver } from "@zibby/forms";
import { z } from "zod";

/**
 * Resource-agnostic "Add category" dialog shared by every catalog that carries a
 * taxonomy (agents, skills, projects). It takes its visible strings as `labels`
 * rather than reading a fixed message namespace, so each caller passes its own
 * translated copy while the name+glyph form and duplicate guard stay identical.
 */
export interface CategoryDialogLabels {
  title: string;
  subtitle: string;
  nameLabel: string;
  namePlaceholder: string;
  glyphLabel: string;
  submit: string;
  /** Builds the duplicate-name error, given the offending name. */
  duplicate: (name: string) => string;
}

export interface CategoryDialogProps {
  existing: string[];
  labels: CategoryDialogLabels;
  pending?: boolean;
  onClose: () => void;
  onSubmit: (category: { name: string; glyph: IconName }) => void;
}

const categorySchema = z.object({ name: z.string().min(1) });
type CategoryFormValues = z.infer<typeof categorySchema>;

export function CategoryDialog({
  existing,
  labels,
  pending,
  onClose,
  onSubmit,
}: CategoryDialogProps) {
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
          {labels.title}
        </Typography>
        <Typography mono size="xs" type="note" variant="tertiary">
          {labels.subtitle}
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
            {labels.submit}
          </Button>
        </>
      }
      ariaLabel={labels.title}
      closeLabel={tk("common.close")}
      onClose={onClose}
      title={title}
      width="sm"
    >
      <Stack gap="200">
        <FormTextInput<CategoryFormValues>
          autoFocus
          error={duplicate ? labels.duplicate(rawName) : undefined}
          label={labels.nameLabel}
          name="name"
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
          }}
          placeholder={labels.namePlaceholder}
        />

        <Stack gap="75">
          <Typography mono size="sm" type="note" variant="secondary">
            {labels.glyphLabel}
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

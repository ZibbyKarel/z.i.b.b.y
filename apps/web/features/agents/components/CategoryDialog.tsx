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
  TextField,
  Typography,
} from "@zibby/design-system";
import { AGENT_GLYPHS } from "../../../state/config";

export interface CategoryDialogProps {
  /** Existing category names — used to flag a duplicate before submitting. */
  existing: string[];
  /** Disable the confirm action while the create request is in flight. */
  pending?: boolean;
  onClose: () => void;
  onSubmit: (category: { name: string; glyph: IconName }) => void;
}

/**
 * "Add category" dialog: a name field plus a glyph picker. Composes the design
 * system `Dialog` (Escape/overlay close, focus trap) with the same `IconTile`
 * glyph grid the agent editor uses, so the two pickers stay visually identical.
 * Duplicate names are caught client-side; the API is the final arbiter (409).
 */
export function CategoryDialog({ existing, pending, onClose, onSubmit }: CategoryDialogProps) {
  const t = useTranslations("agents");
  const tk = useTranslations();
  const [value, setValue] = useState("");
  const [glyph, setGlyph] = useState<IconName>("spark");

  const name = value.trim();
  const duplicate = name.length > 0 && existing.includes(name);
  const valid = name.length > 0 && !duplicate;

  const submit = () => {
    if (!valid || pending) return;
    onSubmit({ name, glyph });
  };

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

  return (
    <Dialog
      open
      actions={
        <>
          <Button intent="ghost" onClick={onClose}>
            {tk("common.cancel")}
          </Button>
          <Button disabled={!valid || pending} icon="check" intent="run" onClick={submit}>
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
        <TextField
          autoFocus
          aria-invalid={duplicate}
          hint={duplicate ? t("categoryDialog.duplicate", { name }) : undefined}
          label={t("categoryDialog.nameLabel")}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          placeholder={t("categoryDialog.namePlaceholder")}
          value={value}
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
    </Dialog>
  );
}

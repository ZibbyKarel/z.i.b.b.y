"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Dialog, type IconName } from "@zibby/design-system";
import { DialogTitle } from "../../../../components/DialogTitle/DialogTitle";
import { useFormControls, zodResolver } from "@zibby/forms";
import { z } from "zod";
import { SkillFormFields, type SkillFormValues } from "../SkillFormFields";

const schema = z.object({
  name: z.string().min(1),
  desc: z.string(),
  category: z.string(),
  instructions: z.string(),
});

export interface AddSkillSubmit {
  name: string;
  desc: string;
  category?: string;
  glyph: IconName;
  instructions: string;
}

export interface AddSkillModalProps {
  /** Category names offered in the picker; the picker is hidden when empty. */
  categories: string[];
  pending?: boolean;
  onClose: () => void;
  onSubmit: (values: AddSkillSubmit) => void;
}

/**
 * The CREATE-ONLY skill dialog (N4d) — grammar: dialogs create and confirm,
 * nothing else. Editing an existing skill lives on the `/skills/:id` detail
 * page ({@link ../DetailScreen}), which renders the same
 * {@link SkillFormFields} body.
 */
export function AddSkillModal({ categories, pending, onClose, onSubmit }: AddSkillModalProps) {
  const t = useTranslations("forms.skill");
  const tk = useTranslations();
  const [glyph, setGlyph] = useState<IconName>("spark");

  const { renderForm, submit, form } = useFormControls<SkillFormValues>({
    defaultValues: { name: "", desc: "", category: "", instructions: "" },
    resolver: zodResolver(schema),
    mode: "onChange",
    onSubmit: (values) => {
      if (pending) return;
      onSubmit({
        name: values.name.trim(),
        desc: values.desc.trim(),
        category: values.category.trim() || undefined,
        glyph,
        instructions: values.instructions.trim(),
      });
    },
  });

  const canSubmit = form.formState.isValid && !pending;

  return renderForm(
    <Dialog
      open
      actions={
        <>
          <Button intent="ghost" onClick={onClose}>
            {tk("common.cancel")}
          </Button>
          <Button disabled={!canSubmit} icon="plus" intent="primary" onClick={() => void submit()}>
            {t("submitLabel")}
          </Button>
        </>
      }
      ariaLabel={t("title")}
      closeLabel={tk("common.close")}
      onClose={onClose}
      title={<DialogTitle glyph={glyph} subtitle={t("subtitle")} title={t("title")} />}
      width="2xl"
    >
      <SkillFormFields
        categories={categories}
        glyph={glyph}
        onGlyphChange={setGlyph}
        setInstructions={(v) =>
          form.setValue("instructions", v, { shouldDirty: true, shouldValidate: true })
        }
      />
    </Dialog>,
  );
}

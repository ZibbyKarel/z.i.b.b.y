"use client";

import { useTranslations } from "next-intl";
import { Button, Dialog } from "@zibby/design-system";
import { DialogTitle } from "../../../../components/DialogTitle/DialogTitle";
import { useFormControls, zodResolver } from "@zibby/forms";
import { z } from "zod";
import { CommandFormFields, type CommandFormValues } from "../CommandFormFields";

const schema = z.object({
  id: z.string(),
  description: z.string(),
  argumentHint: z.string(),
  allowedTools: z.string(),
  model: z.string(),
  disableModelInvocation: z.boolean(),
  enabled: z.boolean(),
  instructions: z.string().min(1),
});

/** What the modal emits on save — the contract frontmatter fields + the body. */
export interface AddCommandSubmit {
  id: string;
  description?: string;
  argumentHint?: string;
  /** Parsed from a comma-separated input into a tool-name list. */
  allowedTools?: string[];
  model?: string;
  disableModelInvocation: boolean;
  enabled: boolean;
  instructions: string;
}

export interface AddCommandModalProps {
  pending?: boolean;
  onClose: () => void;
  onSubmit: (values: AddCommandSubmit) => void;
}

/** Split a comma-separated tools input into a trimmed list (or undefined). */
export function parseTools(raw: string): string[] | undefined {
  const items = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return items.length > 0 ? items : undefined;
}

/**
 * The CREATE-ONLY command dialog (N4d) — grammar: dialogs create and confirm,
 * nothing else. Editing an existing command lives on the `/commands/:id`
 * detail page ({@link ../DetailScreen}), which renders the same
 * {@link CommandFormFields} body.
 */
export function AddCommandModal({ pending, onClose, onSubmit }: AddCommandModalProps) {
  const t = useTranslations("forms.command");
  const tk = useTranslations();

  const { renderForm, submit, form } = useFormControls<CommandFormValues>({
    defaultValues: {
      id: "",
      description: "",
      argumentHint: "",
      allowedTools: "",
      model: "",
      disableModelInvocation: false,
      enabled: true,
      instructions: "",
    },
    resolver: zodResolver(schema),
    mode: "onChange",
    onSubmit: (values) => {
      if (pending) return;
      onSubmit({
        id: values.id.trim(),
        description: values.description.trim() || undefined,
        argumentHint: values.argumentHint.trim() || undefined,
        allowedTools: parseTools(values.allowedTools),
        model: values.model.trim() || undefined,
        disableModelInvocation: values.disableModelInvocation,
        enabled: values.enabled,
        instructions: values.instructions.trim(),
      });
    },
  });

  const idValue = form.watch("id");
  const canSubmit = form.formState.isValid && idValue.trim().length > 0 && !pending;

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
      title={<DialogTitle glyph="bolt" subtitle={t("subtitle")} title={t("title")} />}
      width="2xl"
    >
      <CommandFormFields />
    </Dialog>,
  );
}
